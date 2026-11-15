// Máquina de estados da conversa (seção 8). Função pura: recebe estado,
// contexto, mensagem e o catálogo atual e devolve o novo estado, o novo
// contexto e as ações que o webhook deve executar. Não acessa banco nem a Meta.
import { addToCart, type CartLine, parseQuantity, readCart, removeFromCart, setQuantity } from "./cart.ts";
import type { Catalog } from "./catalog-model.ts";
import type { Json } from "./database.types.ts";
import {
  cartItemScreen,
  cartItemsScreen,
  cartReviewScreen,
  cartView,
  categoryListScreen,
  mainMenuScreen,
  OPTION,
  type Option,
  orderConfirmationScreen,
  PREFIX,
  productDetailsScreen,
  productListScreen,
  quantityPromptScreen,
  type Screen,
} from "./screens.ts";

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
  | { type: "send_screen"; screen: Screen }
  | { type: "send_text"; text: string }
  | { type: "start_handoff" }
  | { type: "show_orders" }
  | { type: "show_order"; orderId: string }
  | { type: "create_order"; items: CartLine[] };

export interface Transition {
  state: ConversationState;
  context: ConversationContext;
  actions: Action[];
}

export const HANDOFF_OPTION_ID = OPTION.handoff;

// Em qualquer estado, estas respostas voltam ao menu principal (o carrinho fica).
const MENU_COMMANDS = new Set(["0", "menu", "inicio", "início"]);

// Conversa parada há mais que isso recomeça do menu (seção 5.4).
export const INACTIVITY_LIMIT_MS = 24 * 60 * 60 * 1000;

export function isInactive(lastInteractionAt: string, now: Date): boolean {
  return now.getTime() - new Date(lastInteractionAt).getTime() > INACTIVITY_LIMIT_MS;
}

// Botão ou linha de lista da tela atual; em texto, o número da opção
// (alternativa quando a interação não é suportada, seção 9).
function pick(message: IncomingMessage, screen: Screen): Option | null {
  if (screen.kind === "text") return null;
  if (message.kind === "reply") return screen.options.find((option) => option.id === message.id) ?? null;
  if (message.kind === "text" && /^\d{1,2}$/.test(message.text.trim())) {
    return screen.options[Number(message.text.trim()) - 1] ?? null;
  }
  return null;
}

function str(value: Json | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: Json | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function withCart(cart: CartLine[], fields: ConversationContext = {}): ConversationContext {
  return cart.length ? { cart, ...fields } : { ...fields };
}

// Tela do estado com o contexto dado, ou null se o contexto aponta para algo
// que saiu do catálogo (categoria, produto ou carrinho vazio).
function screenFor(state: ConversationState, context: ConversationContext, catalog: Catalog): Screen | null {
  const cart = readCart(context);
  const product = catalog.products.find((p) => p.id === str(context.productId));
  const categoryId = str(context.categoryId);
  const items = cartView(cart, catalog);
  switch (state) {
    case "CATEGORY_SELECTION":
      return catalog.categories.length ? categoryListScreen(catalog, cart, num(context.page)) : null;
    case "PRODUCT_SELECTION":
      return catalog.categories.some((c) => c.id === categoryId)
        ? productListScreen(catalog, categoryId!, num(context.page))
        : null;
    case "PRODUCT_DETAILS":
      return product ? productDetailsScreen(product, cart) : null;
    case "QUANTITY_INPUT":
      return product ? quantityPromptScreen(product) : null;
    case "CART_REVIEW": {
      if (!items.length) return null;
      if (context.editing === "items") return cartItemsScreen(items);
      const editing = items.find((item) => item.product.id === str(context.editing));
      return editing ? cartItemScreen(editing) : cartReviewScreen(items);
    }
    case "ORDER_CONFIRMATION":
      return items.length ? orderConfirmationScreen(items) : null;
    default:
      return mainMenuScreen();
  }
}

// Volta um nível quando a tela do estado não pode ser montada.
function fallback(state: ConversationState): ConversationState {
  return state === "CATEGORY_SELECTION" ? "MAIN_MENU" : "CATEGORY_SELECTION";
}

function show(
  state: ConversationState,
  context: ConversationContext,
  catalog: Catalog,
  before: Action[] = [],
): Transition {
  const screen = screenFor(state, context, catalog);
  if (!screen) {
    const next = fallback(state);
    const notice: Action[] = next === "MAIN_MENU" && state === "CATEGORY_SELECTION"
      ? [{ type: "send_text", text: "Nosso catálogo está vazio no momento. Fale com a responsável para mais informações." }]
      : [];
    return show(next, withCart(readCart(context)), catalog, [...before, ...notice]);
  }
  return { state, context, actions: [...before, { type: "send_screen", screen }] };
}

// Remove do carrinho o que saiu do catálogo desde a última mensagem.
function normalizeCart(cart: CartLine[], catalog: Catalog): { cart: CartLine[]; notices: Action[] } {
  const available = cart.filter((line) => catalog.products.some((p) => p.id === line.product_id));
  if (available.length === cart.length) return { cart, notices: [] };
  return {
    cart: available,
    notices: [{ type: "send_text", text: "Um ou mais itens não estão mais disponíveis e saíram do seu carrinho." }],
  };
}

export function transition(
  state: ConversationState,
  context: ConversationContext,
  message: IncomingMessage,
  catalog: Catalog,
): Transition {
  const { cart, notices } = normalizeCart(readCart(context), catalog);
  const current: ConversationContext = { ...context, ...withCart(cart) };
  if (!cart.length) delete current.cart;

  if (message.kind === "text" && MENU_COMMANDS.has(message.text.trim().toLowerCase())) {
    return show("MAIN_MENU", withCart(cart), catalog, notices);
  }
  // Com item retirado do catálogo, o cliente revê o carrinho antes de enviar.
  if (state === "ORDER_CONFIRMATION" && notices.length) {
    return show("CART_REVIEW", withCart(cart), catalog, notices);
  }

  const screen = screenFor(state, current, catalog);
  if (!screen) return show(fallback(state), withCart(cart), catalog, notices);
  const repeat = () => ({ state, context: current, actions: [...notices, { type: "send_screen", screen } as Action] });
  const go = (next: ConversationState, fields: ConversationContext = {}, extra: Action[] = []) =>
    show(next, withCart(cart, fields), catalog, [...notices, ...extra]);

  if (state === "QUANTITY_INPUT") {
    const quantity = message.kind === "text" ? parseQuantity(message.text) : null;
    const productId = str(current.productId)!;
    if (quantity === null) {
      return {
        state,
        context: current,
        actions: [...notices, { type: "send_text", text: "Não entendi a quantidade. Responda só com um número de 1 a 99." }],
      };
    }
    if (current.quantityMode === "set") {
      return show("CART_REVIEW", withCart(setQuantity(cart, productId, quantity)), catalog, notices);
    }
    const name = catalog.products.find((p) => p.id === productId)!.name;
    return show("CART_REVIEW", withCart(addToCart(cart, productId, quantity)), catalog, [
      ...notices,
      { type: "send_text", text: `Adicionado ao carrinho: ${quantity}x ${name}.` },
    ]);
  }

  const option = pick(message, screen);
  const id = option?.id ?? (message.kind === "reply" ? message.id : "");

  switch (state) {
    case "MAIN_MENU":
      // Linha da lista de "Meus pedidos"; o webhook só mostra pedidos do próprio cliente.
      if (message.kind === "reply" && message.id.startsWith(PREFIX.order)) {
        return {
          state,
          context: current,
          actions: [...notices, { type: "show_order", orderId: message.id.slice(PREFIX.order.length) }],
        };
      }
      if (!option) return repeat();
      if (id === OPTION.catalog) return go("CATEGORY_SELECTION");
      if (id === OPTION.orders) return { state, context: current, actions: [...notices, { type: "show_orders" }] };
      return { state, context: current, actions: [...notices, { type: "start_handoff" }] };

    case "CATEGORY_SELECTION":
      if (!option) return repeat();
      if (id === OPTION.nextPage) return go("CATEGORY_SELECTION", { page: num(current.page) + 1 });
      if (id === OPTION.viewCart) return go("CART_REVIEW");
      return go("PRODUCT_SELECTION", { categoryId: id.slice(PREFIX.category.length), page: 0 });

    case "PRODUCT_SELECTION":
      if (!option) return repeat();
      if (id === OPTION.nextPage) {
        return go("PRODUCT_SELECTION", { categoryId: current.categoryId, page: num(current.page) + 1 });
      }
      if (id === OPTION.categories) return go("CATEGORY_SELECTION");
      return go("PRODUCT_DETAILS", { categoryId: current.categoryId, productId: id.slice(PREFIX.product.length) });

    case "PRODUCT_DETAILS":
      if (!option) return repeat();
      if (id === OPTION.addProduct) {
        return go("QUANTITY_INPUT", { categoryId: current.categoryId, productId: current.productId, quantityMode: "add" });
      }
      if (id === OPTION.otherProducts) return go("PRODUCT_SELECTION", { categoryId: current.categoryId, page: 0 });
      return go("CART_REVIEW");

    case "CART_REVIEW": {
      if (!option) return repeat();
      const editing = str(current.editing);
      if (id === OPTION.submitCart) return go("ORDER_CONFIRMATION");
      if (id === OPTION.continueShopping) return go("CATEGORY_SELECTION");
      if (id === OPTION.editCart) return go("CART_REVIEW", { editing: "items" });
      if (id === OPTION.viewCart) return go("CART_REVIEW");
      if (id.startsWith(PREFIX.item)) return go("CART_REVIEW", { editing: id.slice(PREFIX.item.length) });
      if (id === OPTION.removeItem) {
        return show("CART_REVIEW", withCart(removeFromCart(cart, editing!)), catalog, [
          ...notices,
          { type: "send_text", text: "Item removido do carrinho." },
        ]);
      }
      return go("QUANTITY_INPUT", { productId: editing, quantityMode: "set" });
    }

    case "ORDER_CONFIRMATION":
      if (!option) return repeat();
      if (id === OPTION.backToCart) return go("CART_REVIEW");
      return {
        state: "MAIN_MENU",
        context: {},
        actions: [...notices, { type: "create_order", items: cart }, { type: "send_screen", screen: mainMenuScreen() }],
      };

    default:
      // POSTAL_CODE_INPUT e SHIPPING_SELECTION entram na Fase 5.
      return go("MAIN_MENU");
  }
}
