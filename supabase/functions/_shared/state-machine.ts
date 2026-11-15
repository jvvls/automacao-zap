// Máquina de estados da conversa (seção 8). Função pura: recebe estado,
// contexto e mensagem e devolve o novo estado, o novo contexto e as ações que
// o webhook deve executar. Não acessa banco nem a Meta.
import type { Json } from "./database.types.ts";

export type ConversationState =
  | "MAIN_MENU"
  | "CATEGORY_SELECTION"
  | "PRODUCT_SELECTION"
  | "PRODUCT_DETAILS"
  | "QUANTITY_INPUT"
  | "CART_REVIEW"
  | "POSTAL_CODE_INPUT"
  | "SHIPPING_SELECTION"
  | "ORDER_CONFIRMATION";

export type ConversationContext = { [key: string]: Json | undefined };

export type IncomingMessage =
  | { kind: "text"; text: string }
  | { kind: "reply"; id: string; title: string }
  | { kind: "unsupported" };

export type Action =
  | { type: "send_main_menu" }
  | { type: "start_handoff" };

export interface Transition {
  state: ConversationState;
  context: ConversationContext;
  actions: Action[];
}

export const HANDOFF_OPTION_ID = "menu_handoff";
// Alternativa em texto ao botão, para quando a interação não for suportada.
export const HANDOFF_TEXT_OPTION = "1";

// Conversa parada há mais que isso recomeça do menu (seção 5.4).
export const INACTIVITY_LIMIT_MS = 24 * 60 * 60 * 1000;

export function isInactive(lastInteractionAt: string, now: Date): boolean {
  return now.getTime() - new Date(lastInteractionAt).getTime() > INACTIVITY_LIMIT_MS;
}

function choseHandoff(message: IncomingMessage): boolean {
  if (message.kind === "reply") return message.id === HANDOFF_OPTION_ID;
  if (message.kind === "text") return message.text.trim() === HANDOFF_TEXT_OPTION;
  return false;
}

const mainMenu: Transition = { state: "MAIN_MENU", context: {}, actions: [{ type: "send_main_menu" }] };

export function transition(
  state: ConversationState,
  context: ConversationContext,
  message: IncomingMessage,
): Transition {
  // Até a Fase 4 só o menu principal tem fluxo; qualquer outro estado volta a ele.
  if (state !== "MAIN_MENU") return mainMenu;

  if (choseHandoff(message)) {
    return { state: "MAIN_MENU", context, actions: [{ type: "start_handoff" }] };
  }
  return { ...mainMenu, context };
}
