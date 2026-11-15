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
import { loadCatalog, PRODUCT_IMAGES_BUCKET } from "./catalog.ts";
import type { Catalog } from "./catalog-model.ts";
import { HANDOFF_CONFIRMATION, handoffChanges, ownerHandoffNotice } from "./handoff.ts";
import { notifyOwner } from "./notify.ts";
import {
  getCustomerOrder,
  listRecentOrders,
  NO_ORDERS,
  ORDER_NOT_FOUND,
  orderDetailsText,
  orderListScreen,
} from "./order-status.ts";
import {
  createOrder,
  orderConfirmation,
  orderIdempotencyKey,
  ownerOrderNotice,
  ProductUnavailableError,
} from "./orders.ts";
import { cartView, mainMenuScreen, type Screen } from "./screens.ts";
import { type Action, isInactive, transition, type Transition } from "./state-machine.ts";
import { createServiceClient, type Db, requireEnv } from "./supabase.ts";
import {
  contactName,
  type InboundMessage,
  screenMessage,
  sendMessage,
  textMessage,
  toIncomingMessage,
  type WhatsAppConfig,
} from "./whatsapp.ts";

// Cada conflito significa que outra mensagem do cliente foi gravada; 5 cobre
// uma rajada curta de mensagens simultâneas.
const MAX_SAVE_ATTEMPTS = 5;

const PRODUCT_UNAVAILABLE =
  "Um dos itens ficou indisponível enquanto você confirmava. Revise o carrinho antes de enviar.";

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

interface Advanced {
  conversation: Conversation;
  result: Transition;
  catalog: Catalog;
  orderId: string | null;
}

// Aplica a transição com controle otimista: em conflito, relê a conversa e
// recalcula a partir do estado gravado pela outra execução. O pedido é criado
// antes de gravar a conversa: se a gravação ou o envio falharem, reprocessar
// a mesma mensagem encontra o carrinho e a RPC devolve o mesmo pedido.
async function advance(
  db: Db,
  customer: Customer,
  initial: Conversation,
  message: ReturnType<typeof toIncomingMessage>,
  waMessageId: string,
): Promise<Advanced | null> {
  let conversation = initial;
  let catalog = await loadCatalog(db);
  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
    if (conversation.humanHandoff) return null;

    const now = new Date();
    const inactive = isInactive(conversation.lastInteractionAt, now);
    let result = transition(
      inactive ? "MAIN_MENU" : conversation.currentState,
      inactive ? {} : conversation.context,
      message,
      catalog,
    );

    let orderId: string | null = null;
    const create = result.actions.find((action) => action.type === "create_order");
    if (create) {
      try {
        orderId = await createOrder(db, customer.id, create.items, orderIdempotencyKey(waMessageId));
      } catch (error) {
        if (!(error instanceof ProductUnavailableError)) throw error;
        // Produto desativado entre a leitura do catálogo e a RPC: relê o
        // catálogo e reapresenta o carrinho, que sai sem o item.
        catalog = await loadCatalog(db);
        const review = transition("CART_REVIEW", conversation.context, { kind: "unsupported" }, catalog);
        result = { ...review, actions: [{ type: "send_text", text: PRODUCT_UNAVAILABLE }, ...review.actions] };
      }
    }
    const startsHandoff = result.actions.some((action) => action.type === "start_handoff");

    const saved = await saveConversation(db, conversation, {
      current_state: result.state,
      context: result.context,
      last_interaction_at: now.toISOString(),
      ...(startsHandoff ? handoffChanges(now) : {}),
    });
    if (saved) return { conversation: saved, result, catalog, orderId };
    conversation = await loadConversation(db, customer.id);
  }
  throw new Error(`conflito de concorrência na conversa ${initial.id} após ${MAX_SAVE_ATTEMPTS} tentativas`);
}

function imageUrl(db: Db, screen: Screen): string | null {
  if (screen.kind !== "buttons" || !screen.imagePath) return null;
  return db.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(screen.imagePath).data.publicUrl;
}

async function execute(deps: Deps, customer: Customer, action: Action, advanced: Advanced) {
  const { db, whatsapp } = deps;
  const send = (message: Parameters<typeof sendMessage>[1]) => sendMessage(whatsapp, message);
  switch (action.type) {
    case "send_screen":
      await send(screenMessage(customer.phone, action.screen, imageUrl(db, action.screen)));
      break;
    case "send_text":
      await send(textMessage(customer.phone, action.text));
      break;
    case "start_handoff":
      await send(textMessage(customer.phone, HANDOFF_CONFIRMATION));
      await notifyOwner(whatsapp, deps.ownerPhone, ownerHandoffNotice(customer));
      break;
    case "show_orders": {
      const orders = await listRecentOrders(db, customer.id);
      if (orders.length) {
        await send(screenMessage(customer.phone, orderListScreen(orders)));
      } else {
        await send(textMessage(customer.phone, NO_ORDERS));
        await send(screenMessage(customer.phone, mainMenuScreen()));
      }
      break;
    }
    case "show_order": {
      const order = await getCustomerOrder(db, customer.id, action.orderId);
      await send(textMessage(customer.phone, order ? orderDetailsText(order) : ORDER_NOT_FOUND));
      await send(screenMessage(customer.phone, mainMenuScreen()));
      break;
    }
    case "create_order": {
      const orderId = advanced.orderId!;
      console.log("inbound: pedido criado", { conversationId: advanced.conversation.id, orderId });
      await send(textMessage(customer.phone, orderConfirmation(orderId)));
      await notifyOwner(
        whatsapp,
        deps.ownerPhone,
        ownerOrderNotice(customer, orderId, cartView(action.items, advanced.catalog)),
      );
      break;
    }
  }
}

export async function processInboundMessage(deps: Deps, id: string): Promise<FinalStatus> {
  const { db } = deps;
  const { data: row, error } = await db
    .from("whatsapp_inbound_messages")
    .select("id, wa_message_id, phone, payload, status, attempts")
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
    const advanced = await advance(db, customer, conversation, toIncomingMessage(payload.message), row.wa_message_id);
    if (!advanced) {
      await finish(db, id, "ignored", conversationId);
      return "ignored";
    }

    for (const action of advanced.result.actions) await execute(deps, customer, action, advanced);
    await finish(db, id, "processed", conversationId);
    return "processed";
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error("inbound: falha no processamento", { inboundId: id, conversationId, error: message });
    await finish(db, id, "failed", conversationId, message);
    return "failed";
  }
}
