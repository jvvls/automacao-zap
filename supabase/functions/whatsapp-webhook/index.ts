// EF-01 — entrada de eventos da WhatsApp Cloud API (seção 7).
// Publicada sem verificação de JWT: a autenticidade vem da assinatura da Meta.
import { type Deps, processInboundMessage, recordInbound } from "../_shared/inbound.ts";
import { createServiceClient, requireEnv } from "../_shared/supabase.ts";
import { extractInboundMessages, verifySignature } from "../_shared/whatsapp.ts";

// Global do Supabase Edge Runtime; os tipos de @supabase/functions-js não
// chegam ao `deno check`, então declaro só o que é usado.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

function verifyWebhook(url: URL): Response {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === requireEnv("WHATSAPP_VERIFY_TOKEN") && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

async function processAll(deps: Deps, ids: string[]) {
  // Em sequência, para as respostas a um mesmo cliente saírem na ordem recebida.
  for (const id of ids) {
    try {
      await processInboundMessage(deps, id);
    } catch (error) {
      // Falha ao ler/gravar o próprio registro: a mensagem fica em `received`
      // e entra no reprocessamento (seção 11.3).
      console.error("inbound: erro sem registro", { inboundId: id, error: String(error) });
    }
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method === "GET") return verifyWebhook(new URL(req.url));
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");
    if (!(await verifySignature(rawBody, signature, requireEnv("WHATSAPP_APP_SECRET")))) {
      return new Response("invalid signature", { status: 401 });
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response("invalid json", { status: 400 });
    }

    const messages = extractInboundMessages(body);
    if (messages.length === 0) return new Response("ok", { status: 200 });

    const deps: Deps = {
      db: createServiceClient(),
      whatsapp: {
        accessToken: requireEnv("WHATSAPP_ACCESS_TOKEN"),
        phoneNumberId: requireEnv("WHATSAPP_PHONE_NUMBER_ID"),
        graphUrl: Deno.env.get("WHATSAPP_GRAPH_URL") ?? "https://graph.facebook.com",
      },
      ownerPhone: requireEnv("OWNER_WHATSAPP_NUMBER"),
    };

    // Se o registro falhar, responde 500 e a Meta reenvia o evento.
    const ids = await recordInbound(deps.db, messages);

    // Responde 200 já e processa em segundo plano (EF-01, etapa 6).
    EdgeRuntime.waitUntil(processAll(deps, ids));
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("whatsapp-webhook: erro", String(error));
    return new Response("internal error", { status: 500 });
  }
});
