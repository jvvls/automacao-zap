import { assert, assertEquals } from "jsr:@std/assert@1";
import type { Catalog } from "../../_shared/catalog-model.ts";
import { OPTION, PAGE_SIZE, type Screen } from "../../_shared/screens.ts";
import {
  type Action,
  type ConversationContext,
  type ConversationState,
  HANDOFF_OPTION_ID,
  INACTIVITY_LIMIT_MS,
  type IncomingMessage,
  isInactive,
  transition,
} from "../../_shared/state-machine.ts";

const catalog: Catalog = {
  categories: [{ id: "c1", name: "Álbuns" }, { id: "c2", name: "Cadernos" }],
  products: [
    { id: "p1", categoryId: "c1", name: "Álbum de bebê", description: "24 páginas", price: 159.9, imagePath: "p1.jpg" },
    { id: "p2", categoryId: "c1", name: "Álbum de casamento", description: null, price: 189.9, imagePath: null },
    { id: "p3", categoryId: "c2", name: "Caderno de receitas", description: null, price: 79.9, imagePath: null },
  ],
};

const reply = (id: string): IncomingMessage => ({ kind: "reply", id, title: "" });
const text = (value: string): IncomingMessage => ({ kind: "text", text: value });

function screenOf(actions: Action[]): Screen {
  const action = actions.find((a) => a.type === "send_screen");
  assert(action && action.type === "send_screen", "esperava uma tela");
  return action.screen;
}

function optionIds(actions: Action[]): string[] {
  const screen = screenOf(actions);
  return screen.kind === "text" ? [] : screen.options.map((o) => o.id);
}

function texts(actions: Action[]): string[] {
  return actions.flatMap((a) => (a.type === "send_text" ? [a.text] : []));
}

function step(state: ConversationState, context: ConversationContext, message: IncomingMessage, data = catalog) {
  return transition(state, context, message, data);
}

Deno.test("qualquer mensagem no menu principal reapresenta o menu com 3 opções", () => {
  const result = step("MAIN_MENU", {}, text("oi"));
  assertEquals(result.state, "MAIN_MENU");
  assertEquals(result.context, {});
  assertEquals(optionIds(result.actions), [OPTION.catalog, OPTION.orders, OPTION.handoff]);
});

Deno.test("botão ou '3' no menu inicia a transferência", () => {
  assertEquals(step("MAIN_MENU", {}, reply(HANDOFF_OPTION_ID)).actions, [{ type: "start_handoff" }]);
  assertEquals(step("MAIN_MENU", {}, text(" 3 ")).actions, [{ type: "start_handoff" }]);
});

Deno.test("'2' ou 'Meus pedidos' pede a lista de pedidos sem mudar de estado", () => {
  assertEquals(step("MAIN_MENU", {}, text("2")), { state: "MAIN_MENU", context: {}, actions: [{ type: "show_orders" }] });
  assertEquals(step("MAIN_MENU", {}, reply(OPTION.orders)).actions, [{ type: "show_orders" }]);
});

Deno.test("linha da lista de pedidos pede o detalhe daquele pedido", () => {
  const result = step("MAIN_MENU", {}, reply("order:abc"));
  assertEquals(result.actions, [{ type: "show_order", orderId: "abc" }]);
});

Deno.test("resposta desconhecida ou não suportada reapresenta o menu", () => {
  assertEquals(optionIds(step("MAIN_MENU", {}, reply("outro")).actions)[0], OPTION.catalog);
  assertEquals(optionIds(step("MAIN_MENU", {}, { kind: "unsupported" }).actions)[0], OPTION.catalog);
  assertEquals(optionIds(step("MAIN_MENU", {}, text("9")).actions)[0], OPTION.catalog);
});

Deno.test("'Ver catálogo' lista só as categorias do catálogo", () => {
  const result = step("MAIN_MENU", {}, text("1"));
  assertEquals(result.state, "CATEGORY_SELECTION");
  assertEquals(optionIds(result.actions), ["cat:c1", "cat:c2"]);
});

Deno.test("catálogo vazio avisa e continua no menu", () => {
  const result = step("MAIN_MENU", {}, reply(OPTION.catalog), { categories: [], products: [] });
  assertEquals(result.state, "MAIN_MENU");
  assertEquals(texts(result.actions).length, 1);
  assertEquals(optionIds(result.actions)[0], OPTION.catalog);
});

Deno.test("escolher categoria lista seus produtos com preço", () => {
  const result = step("CATEGORY_SELECTION", {}, reply("cat:c1"));
  assertEquals(result.state, "PRODUCT_SELECTION");
  assertEquals(result.context, { categoryId: "c1", page: 0 });
  const screen = screenOf(result.actions);
  assert(screen.kind === "list");
  assertEquals(screen.options.map((o) => o.id), ["prod:p1", "prod:p2", OPTION.categories]);
  assertEquals(screen.options[0].description, "R$ 159,90");
});

Deno.test("categoria que não está na tela atual é recusada", () => {
  const result = step("CATEGORY_SELECTION", {}, reply("cat:inexistente"));
  assertEquals(result.state, "CATEGORY_SELECTION");
  assertEquals(optionIds(result.actions), ["cat:c1", "cat:c2"]);
});

Deno.test("lista com mais de uma página mostra 'Ver mais' e avança", () => {
  const many: Catalog = {
    categories: [{ id: "c1", name: "Álbuns" }],
    products: Array.from({ length: PAGE_SIZE + 2 }, (_, i) => ({
      id: `p${i}`,
      categoryId: "c1",
      name: `Produto ${String(i).padStart(2, "0")}`,
      description: null,
      price: 10,
      imagePath: null,
    })),
  };
  const first = step("CATEGORY_SELECTION", {}, reply("cat:c1"), many);
  assertEquals(optionIds(first.actions).length, PAGE_SIZE + 2);
  assert(optionIds(first.actions).includes(OPTION.nextPage));

  const second = step("PRODUCT_SELECTION", first.context, reply(OPTION.nextPage), many);
  assertEquals(second.context.page, 1);
  assertEquals(optionIds(second.actions), ["prod:p8", "prod:p9", OPTION.categories]);
});

Deno.test("escolher produto mostra foto, descrição e preço", () => {
  const result = step("PRODUCT_SELECTION", { categoryId: "c1", page: 0 }, text("1"));
  assertEquals(result.state, "PRODUCT_DETAILS");
  assertEquals(result.context, { categoryId: "c1", productId: "p1" });
  const screen = screenOf(result.actions);
  assert(screen.kind === "buttons");
  assertEquals(screen.imagePath, "p1.jpg");
  assert(screen.body.includes("24 páginas") && screen.body.includes("R$ 159,90"));
  assertEquals(screen.options.map((o) => o.id), [OPTION.addProduct, OPTION.otherProducts]);
});

Deno.test("adicionar pede a quantidade", () => {
  const result = step("PRODUCT_DETAILS", { categoryId: "c1", productId: "p1" }, reply(OPTION.addProduct));
  assertEquals(result.state, "QUANTITY_INPUT");
  assertEquals(result.context.quantityMode, "add");
  assertEquals(screenOf(result.actions).kind, "text");
});

Deno.test("quantidade inválida mantém o estado e explica o formato", () => {
  const context = { categoryId: "c1", productId: "p1", quantityMode: "add" };
  for (const value of ["abc", "0,5", "-1", "100", "1.5"]) {
    const result = step("QUANTITY_INPUT", context, text(value));
    assertEquals(result.state, "QUANTITY_INPUT", value);
    assertEquals(result.context, context);
    assertEquals(texts(result.actions).length, 1);
  }
});

Deno.test("quantidade válida adiciona ao carrinho e mostra a revisão", () => {
  const result = step("QUANTITY_INPUT", { categoryId: "c1", productId: "p1", quantityMode: "add" }, text("2"));
  assertEquals(result.state, "CART_REVIEW");
  assertEquals(result.context, { cart: [{ product_id: "p1", quantity: 2 }] });
  const screen = screenOf(result.actions);
  assert(screen.kind === "buttons" && screen.body.includes("R$ 319,80"));
  assertEquals(screen.options.map((o) => o.id), [OPTION.submitCart, OPTION.continueShopping, OPTION.editCart]);
});

Deno.test("carrinho com vários itens soma e mantém o carrinho ao navegar", () => {
  const cart = [{ product_id: "p1", quantity: 2 }];
  const browsing = step("CART_REVIEW", { cart }, reply(OPTION.continueShopping));
  assertEquals(browsing.state, "CATEGORY_SELECTION");
  assertEquals(browsing.context.cart, cart);
  assert(optionIds(browsing.actions).includes(OPTION.viewCart));

  const added = step("QUANTITY_INPUT", { cart, productId: "p3", quantityMode: "add" }, text("1"));
  assertEquals(added.context.cart, [{ product_id: "p1", quantity: 2 }, { product_id: "p3", quantity: 1 }]);
  const screen = screenOf(added.actions);
  assert(screen.kind === "buttons" && screen.body.includes("R$ 399,70"));
});

Deno.test("alterar itens: escolher item, mudar quantidade e remover", () => {
  const cart = [{ product_id: "p1", quantity: 2 }, { product_id: "p3", quantity: 1 }];
  const list = step("CART_REVIEW", { cart }, reply(OPTION.editCart));
  assertEquals(optionIds(list.actions), ["item:p1", "item:p3", OPTION.viewCart]);

  const item = step("CART_REVIEW", list.context, reply("item:p1"));
  assertEquals(item.context.editing, "p1");
  assertEquals(optionIds(item.actions), [OPTION.removeItem, OPTION.changeQuantity, OPTION.viewCart]);

  const asking = step("CART_REVIEW", item.context, reply(OPTION.changeQuantity));
  assertEquals(asking.state, "QUANTITY_INPUT");
  const changed = step("QUANTITY_INPUT", asking.context, text("5"));
  assertEquals(changed.state, "CART_REVIEW");
  assertEquals(changed.context, { cart: [{ product_id: "p1", quantity: 5 }, { product_id: "p3", quantity: 1 }] });

  const removed = step("CART_REVIEW", { cart, editing: "p3" }, reply(OPTION.removeItem));
  assertEquals(removed.context, { cart: [{ product_id: "p1", quantity: 2 }] });
});

Deno.test("remover o último item volta às categorias", () => {
  const result = step("CART_REVIEW", { cart: [{ product_id: "p1", quantity: 1 }], editing: "p1" }, text("1"));
  assertEquals(result.state, "CATEGORY_SELECTION");
  assertEquals(result.context, {});
});

Deno.test("enviar mostra o resumo e só confirmar cria o pedido", () => {
  const cart = [{ product_id: "p1", quantity: 2 }];
  const summary = step("CART_REVIEW", { cart }, reply(OPTION.submitCart));
  assertEquals(summary.state, "ORDER_CONFIRMATION");
  assertEquals(optionIds(summary.actions), [OPTION.confirmOrder, OPTION.backToCart]);

  const unexpected = step("ORDER_CONFIRMATION", { cart }, text("sim por favor"));
  assertEquals(unexpected.state, "ORDER_CONFIRMATION");
  assert(!unexpected.actions.some((a) => a.type === "create_order"));

  const confirmed = step("ORDER_CONFIRMATION", { cart }, reply(OPTION.confirmOrder));
  assertEquals(confirmed.state, "MAIN_MENU");
  assertEquals(confirmed.context, {});
  assertEquals(confirmed.actions[0], { type: "create_order", items: cart });
});

Deno.test("item que saiu do catálogo sai do carrinho e impede a confirmação", () => {
  const cart = [{ product_id: "p1", quantity: 1 }, { product_id: "fora", quantity: 1 }];
  const result = step("ORDER_CONFIRMATION", { cart }, reply(OPTION.confirmOrder));
  assertEquals(result.state, "CART_REVIEW");
  assertEquals(result.context, { cart: [{ product_id: "p1", quantity: 1 }] });
  assertEquals(texts(result.actions).length, 1);
  assert(!result.actions.some((a) => a.type === "create_order"));
});

Deno.test("produto selecionado que saiu do catálogo volta às categorias", () => {
  const result = step("PRODUCT_DETAILS", { categoryId: "c1", productId: "fora" }, reply(OPTION.addProduct));
  assertEquals(result.state, "CATEGORY_SELECTION");
});

Deno.test("'menu' ou '0' volta ao menu em qualquer estado e mantém o carrinho", () => {
  const cart = [{ product_id: "p1", quantity: 1 }];
  for (const command of ["menu", "0", " Menu "]) {
    const result = step("QUANTITY_INPUT", { cart, productId: "p1", quantityMode: "add" }, text(command));
    assertEquals(result.state, "MAIN_MENU");
    assertEquals(result.context, { cart });
  }
});

Deno.test("estados da Fase 5 ainda voltam ao menu", () => {
  assertEquals(step("POSTAL_CODE_INPUT", {}, text("30140071")).state, "MAIN_MENU");
});

Deno.test("isInactive respeita o limite de 24 horas", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  const justInside = new Date(now.getTime() - INACTIVITY_LIMIT_MS + 1000);
  const justOutside = new Date(now.getTime() - INACTIVITY_LIMIT_MS - 1000);
  assertEquals(isInactive(justInside.toISOString(), now), false);
  assertEquals(isInactive(justOutside.toISOString(), now), true);
});
