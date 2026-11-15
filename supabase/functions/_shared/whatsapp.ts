// Integração com a WhatsApp Cloud API (seção 9): verificação da assinatura,
// leitura dos eventos do webhook e envio de mensagens.
import type { IncomingMessage } from "./state-machine.ts";

const GRAPH_API_VERSION = "v23.0";
const SEND_TIMEOUT_MS = 10_000;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

// Confere X-Hub-Signature-256 (HMAC-SHA256 do corpo bruto com o App Secret).
// crypto.subtle.verify compara em tempo constante.
export async function verifySignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const signature = hexToBytes(header.slice("sha256=".length));
  if (!signature || signature.length !== 32) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(rawBody));
}

export interface InboundMessage {
  waMessageId: string;
  phone: string;
  // Só o necessário para reprocessar: a mensagem e o contato que a enviou.
  payload: { contact: Json | null; message: Json };
}

// Extrai as mensagens recebidas de um evento do webhook. Eventos de status de
// entrega (value.statuses) não são mensagens e são descartados.
export function extractInboundMessages(body: unknown): InboundMessage[] {
  if (!isObject(body) || body.object !== "whatsapp_business_account") return [];

  const result: InboundMessage[] = [];
  for (const entry of asArray(body.entry)) {
    if (!isObject(entry)) continue;
    for (const change of asArray(entry.changes)) {
      if (!isObject(change) || change.field !== "messages" || !isObject(change.value)) continue;
      const contacts = asArray(change.value.contacts).filter(isObject);
      for (const message of asArray(change.value.messages)) {
        if (!isObject(message) || typeof message.id !== "string" || typeof message.from !== "string") continue;
        const contact = contacts.find((c) => c.wa_id === message.from) ?? null;
        result.push({ waMessageId: message.id, phone: message.from, payload: { contact, message } });
      }
    }
  }
  return result;
}

export function contactName(contact: Json | null): string | null {
  const profile = contact?.profile;
  return isObject(profile) && typeof profile.name === "string" ? profile.name : null;
}

export function toIncomingMessage(message: Json): IncomingMessage {
  if (message.type === "text" && isObject(message.text) && typeof message.text.body === "string") {
    return { kind: "text", text: message.text.body };
  }
  if (message.type === "interactive" && isObject(message.interactive)) {
    const reply = message.interactive.button_reply ?? message.interactive.list_reply;
    if (isObject(reply) && typeof reply.id === "string") {
      return { kind: "reply", id: reply.id, title: String(reply.title ?? "") };
    }
  }
  // Resposta a botão de template.
  if (message.type === "button" && isObject(message.button) && typeof message.button.payload === "string") {
    return { kind: "reply", id: message.button.payload, title: String(message.button.text ?? "") };
  }
  return { kind: "unsupported" };
}

export function textMessage(to: string, body: string) {
  return { messaging_product: "whatsapp", to, type: "text", text: { body } };
}

// Botões de resposta: até 3, título com até 20 caracteres.
export function buttonsMessage(to: string, body: string, buttons: { id: string; title: string }[]) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: { buttons: buttons.map((reply) => ({ type: "reply", reply })) },
    },
  };
}

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  // Sobrescrito só no teste integrado, para apontar a um servidor falso.
  graphUrl: string;
}

export async function sendMessage(config: WhatsAppConfig, message: Json): Promise<void> {
  const response = await fetch(
    `${config.graphUrl}/${GRAPH_API_VERSION}/${config.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    // O corpo de erro da Meta não traz o conteúdo da mensagem.
    throw new Error(`WhatsApp API ${response.status}: ${await response.text()}`);
  }
}
