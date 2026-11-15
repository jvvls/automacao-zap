// Registro e processamento das mensagens recebidas (EF-01, etapas 5 e 7–11).
// whatsapp_inbound_messages é a barreira de idempotência e o histórico de
// cada evento; o processamento lê dali, o que permite reprocessar depois.
import {
  type Conversation,
  type Customer,
  findOrCreateConversation,
  findOrCreateCustomer,
  loadConversation,
  saveConversation,
} from "./conversations.ts";
import { HANDOFF_CONFIRMATION, handoffChanges, ownerHandoffNotice } from "./handoff.ts";
import { notifyOwner } from "./notify.ts";
import {
  type Action,
  HANDOFF_OPTION_ID,
  HANDOFF_TEXT_OPTION,
  isInactive,
  transition,
  type Transition,
} from "./state-machine.ts";
import { createServiceClient, type Db, requireEnv } from "./supabase.ts";
import {
  buttonsMessage,
  contactName,
  type InboundMessage,
  sendMessage,
  textMessage,
  toIncomingMessage,
  type WhatsAppConfig,
} from "./whatsapp.ts";

// Cada conflito significa que outra mensagem do cliente foi gravada; 5 cobre
// uma rajada curta de mensagens simultâneas.
const MAX_SAVE_ATTEMPTS = 5;

const MAIN_MENU_TEXT =
  `Olá! Aqui é a Scrapbook Store. Como podemos ajudar?\n\nToque no botão abaixo ou responda *${HANDOFF_TEXT_OPTION}* para falar com a responsável pela loja.`;

export interface Deps {
  db: Db;
  whatsapp: WhatsAppConfig;
  ownerPhone: string;
}

export function depsFromEnv(): Deps {
  return {
    db: createServiceClient(),
    whatsapp: {
      accessToken: requireEnv("WHATSAPP_ACCESS_TOKEN"),
      phoneNumberId: requireEnv("WHATSAPP_PHONE_NUMBER_ID"),
      graphUrl: Deno.env.get("WHATSAPP_GRAPH_URL") ?? "https://graph.facebook.com",
    },
    ownerPhone: requireEnv("OWNER_WHATSAPP_NUMBER"),
  };
}

type FinalStatus = "processed" | "ignored" | "failed";

// Mensagem em `received` há mais que isso teve a execução interrompida (seção 5.9).
export const STUCK_AFTER_MS = 5 * 60 * 1000;
// Na seleção automática, desiste de mensagens que já falharam tantas vezes;
// por id, ainda podem ser reprocessadas.
export const MAX_AUTO_ATTEMPTS = 5;
const REPROCESS_BATCH = 20;

// Mensagens `failed` ou presas em `received`, das mais antigas para as mais novas.
export async function findReprocessable(db: Db, now: Date): Promise<string[]> {
  const stuckBefore = new Date(now.getTime() - STUCK_AFTER_MS).toISOString();
  const { data, error } = await db
    .from("whatsapp_inbound_messages")
    .select("id")
    .or(`status.eq.failed,and(status.eq.received,received_at.lt.${stuckBefore})`)
    .lt("attempts", MAX_AUTO_ATTEMPTS)
    .order("received_at")
    .limit(REPROCESS_BATCH);
  if (error) throw error;
  return data.map((row) => row.id);
}

// Insere as mensagens ignorando as já recebidas e devolve só os ids novos.
export async function recordInbound(db: Db, messages: InboundMessage[]): Promise<string[]> {
  const { data, error } = await db
    .from("whatsapp_inbound_messages")
    .upsert(
      messages.map((m) => ({ wa_message_id: m.waMessageId, phone: m.phone, payload: m.payload })),
      { onConflict: "wa_message_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  return data.map((row) => row.id);
}

async function finish(db: Db, id: string, status: FinalStatus, conversationId: string | null, error?: string) {
  const { error: updateError } = await db
    .from("whatsapp_inbound_messages")
    .update({ status, error: error ?? null, conversation_id: conversationId, processed_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) throw updateError;
}

// Aplica a transição com controle otimista: em conflito, relê a conversa e
// recalcula a partir do estado gravado pela outra execução.
async function advance(
  db: Db,
  customer: Customer,
  initial: Conversation,
  message: ReturnType<typeof toIncomingMessage>,
): Promise<{ conversation: Conversation; result: Transition } | null> {
  let conversation = initial;
  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
    if (conversation.humanHandoff) return null;

    const now = new Date();
    const inactive = isInactive(conversation.lastInteractionAt, now);
    const result = transition(
      inactive ? "MAIN_MENU" : conversation.currentState,
      inactive ? {} : conversation.context,
      message,
    );
    const startsHandoff = result.actions.some((action) => action.type === "start_handoff");

    const saved = await saveConversation(db, conversation, {
      current_state: result.state,
      context: result.context,
      last_interaction_at: now.toISOString(),
      ...(startsHandoff ? handoffChanges(now) : {}),
    });
    if (saved) return { conversation: saved, result };
    conversation = await loadConversation(db, customer.id);
  }
  throw new Error(`conflito de concorrência na conversa ${initial.id} após ${MAX_SAVE_ATTEMPTS} tentativas`);
}

async function execute(deps: Deps, customer: Customer, action: Action) {
  switch (action.type) {
    case "send_main_menu":
      await sendMessage(
        deps.whatsapp,
        buttonsMessage(customer.phone, MAIN_MENU_TEXT, [{ id: HANDOFF_OPTION_ID, title: "Falar c/ responsável" }]),
      );
      break;
    case "start_handoff":
      await sendMessage(deps.whatsapp, textMessage(customer.phone, HANDOFF_CONFIRMATION));
      await notifyOwner(deps.whatsapp, deps.ownerPhone, ownerHandoffNotice(customer));
      break;
  }
}

export async function processInboundMessage(deps: Deps, id: string): Promise<FinalStatus> {
  const { db } = deps;
  const { data: row, error } = await db
    .from("whatsapp_inbound_messages")
    .select("id, phone, payload, status, attempts")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (row.status === "processed" || row.status === "ignored") return row.status;

  const { error: attemptError } = await db
    .from("whatsapp_inbound_messages")
    .update({ attempts: row.attempts + 1 })
    .eq("id", id);
  if (attemptError) throw attemptError;

  let conversationId: string | null = null;
  try {
    // Gravado por recordInbound no formato de InboundMessage["payload"].
    const payload = row.payload as InboundMessage["payload"];
    const customer = await findOrCreateCustomer(db, row.phone, contactName(payload.contact));
    const conversation = await findOrCreateConversation(db, customer.id);
    conversationId = conversation.id;

    // Atendimento humano ativo: o bot não responde (EF-01, etapa 9).
    const advanced = await advance(db, customer, conversation, toIncomingMessage(payload.message));
    if (!advanced) {
      await finish(db, id, "ignored", conversationId);
      return "ignored";
    }

    for (const action of advanced.result.actions) await execute(deps, customer, action);
    await finish(db, id, "processed", conversationId);
    return "processed";
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error("inbound: falha no processamento", { inboundId: id, conversationId, error: message });
    await finish(db, id, "failed", conversationId, message);
    return "failed";
  }
}
