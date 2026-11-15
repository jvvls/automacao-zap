// Teste integrado do webhook (seção 14, "Testes de automação") contra o
// Supabase local, com a função servida com supabase/functions/.env.test.
// Um servidor falso da Graph API, na porta de WHATSAPP_GRAPH_URL, registra o
// que o bot enviaria ao WhatsApp.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient } from "npm:@supabase/supabase-js@^2";
import { loadConversation, saveConversation } from "../../_shared/conversations.ts";
import type { Database } from "../../_shared/database.types.ts";

function readEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of Deno.readTextFileSync(path).split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

const env = readEnvFile(new URL("../../.env.test", import.meta.url).pathname);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SERVICE_KEY) throw new Error("defina SUPABASE_SERVICE_ROLE_KEY (npx supabase status -o env)");

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
const db = createClient<Database>(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

interface SentMessage {
  to: string;
  type: string;
  text?: { body: string };
  interactive?: { action: { buttons: { reply: { id: string } }[] } };
}

const sent: SentMessage[] = [];
const failingRecipients = new Set<string>();
const graph = Deno.serve(
  { port: Number(new URL(env.WHATSAPP_GRAPH_URL).port), hostname: "0.0.0.0", onListen: () => {} },
  async (req) => {
    const message = (await req.json()) as SentMessage;
    if (req.headers.get("authorization") !== `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`) {
      return new Response("bad token", { status: 401 });
    }
    if (failingRecipients.has(message.to)) {
      return Response.json({ error: { message: "Re-engagement message" } }, { status: 400 });
    }
    sent.push(message);
    return Response.json({ messages: [{ id: `wamid.out.${crypto.randomUUID()}` }] });
  },
);

const phones: string[] = [];
function newPhone() {
  const phone = `55119${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  phones.push(phone);
  return phone;
}

async function sign(body: string, secret = env.WHATSAPP_APP_SECRET) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return "sha256=" + Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

function event(phone: string, message: Record<string, unknown>, name = "Cliente Integração") {
  const id = `wamid.test.${crypto.randomUUID()}`;
  return {
    id,
    body: {
      object: "whatsapp_business_account",
      entry: [{
        id: "WABA",
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID },
            contacts: [{ profile: { name }, wa_id: phone }],
            messages: [{ from: phone, id, timestamp: "1763208000", ...message }],
          },
        }],
      }],
    },
  };
}

async function post(body: unknown, signature?: string) {
  const raw = JSON.stringify(body);
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signature ?? await sign(raw) },
    body: raw,
  });
  await response.body?.cancel();
  return response.status;
}

// O processamento roda depois do 200 (waitUntil); espera o status final.
async function waitForInbound(waMessageId: string) {
  for (let i = 0; i < 50; i++) {
    const { data } = await db
      .from("whatsapp_inbound_messages")
      .select("id, status, error, conversation_id, attempts")
      .eq("wa_message_id", waMessageId)
      .maybeSingle();
    if (data && data.status !== "received") return data;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`mensagem ${waMessageId} não foi processada`);
}

async function conversationOf(phone: string) {
  const { data, error } = await db
    .from("conversations")
    .select("id, current_state, context, human_handoff, handoff_at, customers!inner(name, phone)")
    .eq("customers.phone", phone)
    .single();
  if (error) throw error;
  return data;
}

async function reprocess(body?: unknown, token = SERVICE_KEY) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/reprocess-inbound`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    return { status: response.status, results: [] };
  }
  const { results } = (await response.json()) as { results: { id: string; status: string }[] };
  return { status: response.status, results };
}

function sentTo(phone: string) {
  return sent.filter((m) => m.to === phone);
}

Deno.test({
  name: "webhook do WhatsApp",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    try {
      await t.step("GET de verificação devolve o challenge só com o token certo", async () => {
        const ok = await fetch(
          `${FUNCTION_URL}?hub.mode=subscribe&hub.verify_token=${env.WHATSAPP_VERIFY_TOKEN}&hub.challenge=123`,
        );
        assertEquals([ok.status, await ok.text()], [200, "123"]);
        const wrong = await fetch(`${FUNCTION_URL}?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=123`);
        await wrong.body?.cancel();
        assertEquals(wrong.status, 403);
      });

      await t.step("POST sem assinatura ou com assinatura inválida é rejeitado sem gravar nada", async () => {
        const phone = newPhone();
        const { id, body } = event(phone, { type: "text", text: { body: "oi" } });
        const unsigned = await fetch(FUNCTION_URL, { method: "POST", body: JSON.stringify(body) });
        await unsigned.body?.cancel();
        assertEquals(unsigned.status, 401);
        assertEquals(await post(body, await sign(JSON.stringify(body), "outro-segredo")), 401);

        const { count } = await db
          .from("whatsapp_inbound_messages")
          .select("id", { count: "exact", head: true })
          .eq("wa_message_id", id);
        assertEquals(count, 0);
      });

      await t.step("evento de status de entrega é aceito e ignorado", async () => {
        const status = await post({
          object: "whatsapp_business_account",
          entry: [{ id: "WABA", changes: [{ field: "messages", value: { statuses: [{ id: "wamid.x", status: "read" }] } }] }],
        });
        assertEquals(status, 200);
      });

      const phone = newPhone();

      await t.step("primeiro contato cria cliente e conversa e recebe o menu", async () => {
        const { id, body } = event(phone, { type: "text", text: { body: "oi" } }, "Ana Teste");
        assertEquals(await post(body), 200);
        const inbound = await waitForInbound(id);
        assertEquals(inbound.status, "processed", inbound.error ?? undefined);

        const conversation = await conversationOf(phone);
        assertEquals(conversation.customers.name, "Ana Teste");
        assertEquals(conversation.current_state, "MAIN_MENU");
        assertEquals(inbound.conversation_id, conversation.id);

        const replies = sentTo(phone);
        assertEquals(replies.length, 1);
        assertEquals(replies[0].type, "interactive");
        assertEquals(replies[0].interactive?.action.buttons[0].reply.id, "menu_handoff");
      });

      await t.step("mensagem reenviada pela Meta não é processada duas vezes", async () => {
        const before = sentTo(phone).length;
        const { id, body } = event(phone, { type: "text", text: { body: "de novo" } });
        assertEquals(await post(body), 200);
        await waitForInbound(id);
        assertEquals(await post(body), 200);
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const { data } = await db.from("whatsapp_inbound_messages").select("attempts").eq("wa_message_id", id);
        assertEquals(data, [{ attempts: 1 }]);
        assertEquals(sentTo(phone).length, before + 1);
      });

      await t.step("cliente conhecido mantém o nome do primeiro contato", async () => {
        const { id, body } = event(phone, { type: "text", text: { body: "oi" } }, "Outro Nome");
        await post(body);
        await waitForInbound(id);
        assertEquals((await conversationOf(phone)).customers.name, "Ana Teste");
      });

      await t.step("botão de atendimento suspende o bot e avisa a responsável", async () => {
        const ownerBefore = sentTo(env.OWNER_WHATSAPP_NUMBER).length;
        const { id, body } = event(phone, {
          type: "interactive",
          interactive: { type: "button_reply", button_reply: { id: "menu_handoff", title: "Falar c/ responsável" } },
        });
        await post(body);
        assertEquals((await waitForInbound(id)).status, "processed");

        const conversation = await conversationOf(phone);
        assertEquals(conversation.human_handoff, true);
        assert(conversation.handoff_at);
        assertEquals(sentTo(phone).at(-1)?.type, "text");

        const ownerMessages = sentTo(env.OWNER_WHATSAPP_NUMBER);
        assertEquals(ownerMessages.length, ownerBefore + 1);
        assert(ownerMessages.at(-1)?.text?.body.includes(`+${phone}`));
      });

      await t.step("com atendimento humano ativo o bot não responde", async () => {
        const before = sentTo(phone).length;
        const { id, body } = event(phone, { type: "text", text: { body: "alguém aí?" } });
        await post(body);
        assertEquals((await waitForInbound(id)).status, "ignored");
        assertEquals(sentTo(phone).length, before);
      });

      await t.step("reativar o bot volta a conversa ao menu", async () => {
        const conversation = await conversationOf(phone);
        await db.from("conversations").update({ human_handoff: false }).eq("id", conversation.id);
        const { id, body } = event(phone, { type: "text", text: { body: "voltei" } });
        await post(body);
        assertEquals((await waitForInbound(id)).status, "processed");
        assertEquals(sentTo(phone).at(-1)?.type, "interactive");
      });

      await t.step("falha ao avisar a responsável não impede o atendimento", async () => {
        const other = newPhone();
        failingRecipients.add(env.OWNER_WHATSAPP_NUMBER);
        try {
          const { id, body } = event(other, { type: "text", text: { body: "1" } });
          await post(body);
          assertEquals((await waitForInbound(id)).status, "processed");
          assertEquals((await conversationOf(other)).human_handoff, true);
          assertEquals(sentTo(other).at(-1)?.type, "text");
        } finally {
          failingRecipients.delete(env.OWNER_WHATSAPP_NUMBER);
        }
      });

      await t.step("falha ao responder o cliente fica registrada como failed", async () => {
        const other = newPhone();
        failingRecipients.add(other);
        try {
          const { id, body } = event(other, { type: "text", text: { body: "oi" } });
          await post(body);
          const inbound = await waitForInbound(id);
          assertEquals(inbound.status, "failed");
          assert(inbound.error?.includes("WhatsApp API 400"));
        } finally {
          failingRecipients.delete(other);
        }
      });

      await t.step("conversa parada há mais de 24 horas recomeça do menu", async () => {
        const conversation = await conversationOf(phone);
        const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        await db
          .from("conversations")
          .update({ current_state: "CART_REVIEW", context: { cart: [1] }, last_interaction_at: old })
          .eq("id", conversation.id);
        const { id, body } = event(phone, { type: "text", text: { body: "oi" } });
        await post(body);
        await waitForInbound(id);
        const after = await conversationOf(phone);
        assertEquals([after.current_state, after.context], ["MAIN_MENU", {}]);
      });

      await t.step("mensagens simultâneas do mesmo cliente são todas processadas", async () => {
        const events = [1, 2, 3, 4].map((n) => event(phone, { type: "text", text: { body: `msg ${n}` } }));
        const statuses = await Promise.all(events.map((e) => post(e.body)));
        assertEquals(statuses, [200, 200, 200, 200]);
        const results = await Promise.all(events.map((e) => waitForInbound(e.id)));
        assertEquals(results.map((r) => r.status), ["processed", "processed", "processed", "processed"]);
      });

      await t.step("gravação com versão defasada da conversa é recusada", async () => {
        const { data: customer } = await db.from("customers").select("id").eq("phone", phone).single();
        const stale = await loadConversation(db, customer!.id);
        const saved = await saveConversation(db, stale, { context: { versao: 1 } });
        assert(saved, "primeira gravação deveria passar");
        assertEquals(await saveConversation(db, stale, { context: { versao: 2 } }), null);
        assertEquals((await conversationOf(phone)).context, { versao: 1 });
      });

      await t.step("reprocessamento exige a credencial de serviço", async () => {
        assertEquals((await reprocess(undefined, "chave-errada")).status, 401);
        const noAuth = await fetch(`${SUPABASE_URL}/functions/v1/reprocess-inbound`, { method: "POST" });
        await noAuth.body?.cancel();
        assertEquals(noAuth.status, 401);
      });

      await t.step("mensagem failed é reprocessada por id depois da falha corrigida", async () => {
        const other = newPhone();
        failingRecipients.add(other);
        const { id, body } = event(other, { type: "text", text: { body: "oi" } });
        try {
          await post(body);
          assertEquals((await waitForInbound(id)).status, "failed");
        } finally {
          failingRecipients.delete(other);
        }
        const inbound = await waitForInbound(id);

        const { status, results } = await reprocess({ ids: [inbound.id] });
        assertEquals([status, results], [200, [{ id: inbound.id, status: "processed" }]]);
        const after = await waitForInbound(id);
        assertEquals([after.status, after.attempts, after.error], ["processed", 2, null]);
        assertEquals(sentTo(other).at(-1)?.type, "interactive");
      });

      await t.step("seleção automática pega a presa em received e deixa a recente", async () => {
        const other = newPhone();
        const message = (waId: string) => ({
          contact: { profile: { name: "Presa" }, wa_id: other },
          message: { from: other, id: waId, timestamp: "1763208000", type: "text", text: { body: "oi" } },
        });
        const stuckId = `wamid.test.${crypto.randomUUID()}`;
        const freshId = `wamid.test.${crypto.randomUUID()}`;
        const { data: rows, error } = await db
          .from("whatsapp_inbound_messages")
          .insert([
            {
              wa_message_id: stuckId,
              phone: other,
              payload: message(stuckId),
              received_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            },
            // Insert em lote manda null para coluna ausente; received_at explícito.
            { wa_message_id: freshId, phone: other, payload: message(freshId), received_at: new Date().toISOString() },
          ])
          .select("id, wa_message_id");
        if (error) throw error;
        const stuck = rows.find((r) => r.wa_message_id === stuckId)!;
        const fresh = rows.find((r) => r.wa_message_id === freshId)!;

        const { results } = await reprocess();
        assert(results.some((r) => r.id === stuck.id && r.status === "processed"), JSON.stringify(results));
        assert(!results.some((r) => r.id === fresh.id));
        assertEquals((await waitForInbound(stuckId)).status, "processed");
        const { data: freshRow } = await db
          .from("whatsapp_inbound_messages")
          .select("status")
          .eq("id", fresh.id)
          .single();
        assertEquals(freshRow?.status, "received");
      });
    } finally {
      for (const phone of phones) {
        const { data: customer } = await db.from("customers").select("id").eq("phone", phone).maybeSingle();
        await db.from("whatsapp_inbound_messages").delete().eq("phone", phone);
        if (customer) await db.from("conversations").delete().eq("customer_id", customer.id);
        await db.from("customers").delete().eq("phone", phone);
      }
      await graph.shutdown();
    }
  },
});
