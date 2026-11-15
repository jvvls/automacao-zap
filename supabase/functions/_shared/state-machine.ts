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
  postalCodeScreen,
  PREFIX,
  productDetailsScreen,
  productListScreen,
  quantityPromptScreen,
  type Screen,
  shippingOptionsScreen,
} from "./screens.ts";
import {
  parsePostalCode,
  readShippingOption,
  readShippingOptions,
  type ShippingChoice,
  type ShippingOption,
} from "./shipping-model.ts";

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
  // O webhook cota e troca a transição pela de applyShippingQuote.
  | { type: "quote_shipping"; postalCode: string; items: CartLine[] }
  | { type: "create_order"; items: CartLine[]; shipping: ShippingChoice | null };

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

// Frete da confirmação: CEP com a opção escolhida, só o CEP (não cotado) ou nada.
function readShipping(context: ConversationContext): ShippingChoice | null {
  const postalCode = str(context.postalCode);
  return postalCode ? { postalCode, option: readShippingOption(context.shipping) } : null;
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
    case "POSTAL_CODE_INPUT":
      return items.length ? postalCodeScreen() : null;
    case "SHIPPING_SELECTION": {
      const options = readShippingOptions(context.shippingOptions);
      const postalCode = str(context.postalCode);
      return items.length && options.length && postalCode ? shippingOptionsScreen(options, postalCode) : null;
    }
    case "ORDER_CONFIRMATION":
      return items.length ? orderConfirmationScreen(items, readShipping(context)) : null;
    default:
      return mainMenuScreen();
  }
}

// Volta um nível quando a tela do estado não pode ser montada.
function fallback(state: ConversationState): ConversationState {
  if (state === "POSTAL_CODE_INPUT" || state === "SHIPPING_SELECTION") return "CART_REVIEW";
  return state === "CATEGORY_SELECTION" ? "MAIN_MENU" : "CATEGORY_SELECTION";
}

// Estados depois do carrinho: um item retirado muda o pedido (e o frete
// cotado para ele), então o cliente revê o carrinho antes de seguir.
const CHECKOUT_STATES = new Set<ConversationState>(["POSTAL_CODE_INPUT", "SHIPPING_SELECTION", "ORDER_CONFIRMATION"]);

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
  if (CHECKOUT_STATES.has(state) && notices.length) {
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

  // CEP digitado: o webhook cota o frete e completa a transição.
  if (state === "POSTAL_CODE_INPUT" && message.kind === "text" && !pick(message, screen)) {
    const postalCode = parsePostalCode(message.text);
    if (!postalCode) {
      return {
        state,
        context: current,
        actions: [...notices, { type: "send_text", text: "Não entendi o CEP. Digite os 8 números, por exemplo 30140-071." }],
      };
    }
    return {
      state: "SHIPPING_SELECTION",
      context: withCart(cart, { postalCode }),
      actions: [...notices, { type: "quote_shipping", postalCode, items: cart }],
    };
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
      if (id === OPTION.submitCart) return go("POSTAL_CODE_INPUT");
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

    case "POSTAL_CODE_INPUT":
      if (!option) return repeat();
      if (id === OPTION.backToCart) return go("CART_REVIEW");
      return go("ORDER_CONFIRMATION");

    case "SHIPPING_SELECTION": {
      if (!option) return repeat();
      if (id === OPTION.otherPostalCode) return go("POSTAL_CODE_INPUT");
      if (id === OPTION.skipShipping) return go("ORDER_CONFIRMATION");
      const chosen = readShippingOptions(current.shippingOptions)
        .find((o) => o.quoteId === id.slice(PREFIX.shipping.length))!;
      return go("ORDER_CONFIRMATION", { postalCode: current.postalCode, shipping: chosen });
    }

    case "ORDER_CONFIRMATION":
      if (!option) return repeat();
      if (id === OPTION.backToCart) return go("CART_REVIEW");
      return {
        state: "MAIN_MENU",
        context: {},
        actions: [
          ...notices,
          { type: "create_order", items: cart, shipping: readShipping(current) },
          { type: "send_screen", screen: mainMenuScreen() },
        ],
      };

    default:
      return go("MAIN_MENU");
  }
}

const QUOTE_UNAVAILABLE =
  "Não conseguimos calcular o frete agora. Você pode enviar a solicitação assim mesmo: a responsável confirma o valor com você.";

// Completa a transição de quote_shipping com o resultado da cotação: lista as
// opções, ou segue para a confirmação com o CEP e sem frete cotado (seção 10.3).
export function applyShippingQuote(
  result: Transition,
  options: ShippingOption[] | null,
  catalog: Catalog,
): Transition {
  const before = result.actions.filter((action) => action.type !== "quote_shipping");
  if (options?.length) {
    return show("SHIPPING_SELECTION", { ...result.context, shippingOptions: options }, catalog, before);
  }
  return show("ORDER_CONFIRMATION", result.context, catalog, [...before, { type: "send_text", text: QUOTE_UNAVAILABLE }]);
}
