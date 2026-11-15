import { assertEquals } from "jsr:@std/assert@1";
import {
  buttonsMessage,
  extractInboundMessages,
  textMessage,
  toIncomingMessage,
  verifySignature,
} from "../../_shared/whatsapp.ts";

const SECRET = "app-secret-de-teste";

async function sign(body: string, secret = SECRET) {
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

Deno.test("assinatura válida é aceita", async () => {
  const body = '{"object":"whatsapp_business_account"}';
  assertEquals(await verifySignature(body, await sign(body), SECRET), true);
});

Deno.test("assinatura de outro segredo é rejeitada", async () => {
  const body = '{"object":"whatsapp_business_account"}';
  assertEquals(await verifySignature(body, await sign(body, "outro"), SECRET), false);
});

Deno.test("corpo alterado depois de assinado é rejeitado", async () => {
  const signature = await sign('{"a":1}');
  assertEquals(await verifySignature('{"a":2}', signature, SECRET), false);
});

Deno.test("cabeçalho ausente ou malformado é rejeitado", async () => {
  assertEquals(await verifySignature("{}", null, SECRET), false);
  assertEquals(await verifySignature("{}", "md5=abc", SECRET), false);
  assertEquals(await verifySignature("{}", "sha256=zz", SECRET), false);
});

function payload(value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", ...value } }] }],
  };
}

Deno.test("extrai mensagem de texto com o nome do contato", () => {
  const message = { from: "5511988887777", id: "wamid.1", timestamp: "1", type: "text", text: { body: "oi" } };
  const result = extractInboundMessages(payload({
    contacts: [{ profile: { name: "Ana" }, wa_id: "5511988887777" }],
    messages: [message],
  }));
  assertEquals(result, [{
    waMessageId: "wamid.1",
    phone: "5511988887777",
    payload: { contact: { profile: { name: "Ana" }, wa_id: "5511988887777" }, message },
  }]);
});

Deno.test("evento só de status de entrega não gera mensagem", () => {
  const result = extractInboundMessages(payload({
    statuses: [{ id: "wamid.1", status: "delivered", recipient_id: "5511988887777" }],
  }));
  assertEquals(result, []);
});

Deno.test("payload que não é do WhatsApp não gera mensagem", () => {
  assertEquals(extractInboundMessages({ object: "page", entry: [] }), []);
  assertEquals(extractInboundMessages(null), []);
});

Deno.test("interpreta texto, botão, lista e tipos não suportados", () => {
  assertEquals(toIncomingMessage({ type: "text", text: { body: "oi" } }), { kind: "text", text: "oi" });
  assertEquals(
    toIncomingMessage({ type: "interactive", interactive: { type: "button_reply", button_reply: { id: "a", title: "A" } } }),
    { kind: "reply", id: "a", title: "A" },
  );
  assertEquals(
    toIncomingMessage({ type: "interactive", interactive: { type: "list_reply", list_reply: { id: "b", title: "B" } } }),
    { kind: "reply", id: "b", title: "B" },
  );
  assertEquals(
    toIncomingMessage({ type: "button", button: { payload: "c", text: "C" } }),
    { kind: "reply", id: "c", title: "C" },
  );
  assertEquals(toIncomingMessage({ type: "audio", audio: { id: "x" } }), { kind: "unsupported" });
});

Deno.test("monta mensagens de texto e de botões", () => {
  assertEquals(textMessage("5511", "olá"), {
    messaging_product: "whatsapp",
    to: "5511",
    type: "text",
    text: { body: "olá" },
  });
  assertEquals(buttonsMessage("5511", "Escolha", [{ id: "x", title: "X" }]), {
    messaging_product: "whatsapp",
    to: "5511",
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Escolha" },
      action: { buttons: [{ type: "reply", reply: { id: "x", title: "X" } }] },
    },
  });
});
