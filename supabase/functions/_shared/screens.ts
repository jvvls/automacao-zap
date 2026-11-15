// Telas que o bot mostra em cada estado (seções 4.1 a 4.3). Funções puras: a
// máquina de estados valida a resposta do cliente contra as opções da tela
// atual, e whatsapp.ts converte a tela em mensagem da Cloud API.
import { type CartLine, MAX_QUANTITY } from "./cart.ts";
import { type Catalog, type CatalogProduct, formatPrice } from "./catalog-model.ts";

export interface Option {
  id: string;
  title: string;
  description?: string;
}

export type Screen =
  | { kind: "buttons"; body: string; options: Option[]; imagePath?: string | null }
  | { kind: "list"; body: string; button: string; options: Option[] }
  | { kind: "text"; body: string };

export const OPTION = {
  catalog: "menu_catalog",
  orders: "menu_orders",
  handoff: "menu_handoff",
  nextPage: "page_next",
  categories: "back_categories",
  viewCart: "cart_view",
  addProduct: "prod_add",
  otherProducts: "prod_back",
  submitCart: "cart_submit",
  continueShopping: "cart_continue",
  editCart: "cart_edit",
  removeItem: "item_remove",
  changeQuantity: "item_quantity",
  confirmOrder: "order_confirm",
  backToCart: "order_back",
} as const;

// Prefixos de opções que carregam um identificador do banco.
export const PREFIX = { category: "cat:", product: "prod:", item: "item:", order: "order:" } as const;

// Lista do WhatsApp tem até 10 linhas: 8 itens + "Ver mais" + uma ação.
export const PAGE_SIZE = 8;

export interface CartView {
  product: CatalogProduct;
  quantity: number;
  total: number;
}

export function cartView(cart: CartLine[], catalog: Catalog): CartView[] {
  return cart.flatMap((line) => {
    const product = catalog.products.find((p) => p.id === line.product_id);
    return product ? [{ product, quantity: line.quantity, total: product.price * line.quantity }] : [];
  });
}

export function cartSummary(items: CartView[]): string {
  const lines = items.map((item) => `• ${item.quantity}x ${item.product.name} — ${formatPrice(item.total)}`);
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  return `${lines.join("\n")}\n\n*Subtotal: ${formatPrice(subtotal)}*`;
}

function page<T>(items: T[], index: number): { items: T[]; hasMore: boolean } {
  const start = index * PAGE_SIZE;
  return { items: items.slice(start, start + PAGE_SIZE), hasMore: items.length > start + PAGE_SIZE };
}

export function mainMenuScreen(): Screen {
  return {
    kind: "buttons",
    body: "Olá! Aqui é a Scrapbook Store. Como podemos ajudar?",
    options: [
      { id: OPTION.catalog, title: "Ver catálogo" },
      { id: OPTION.orders, title: "Meus pedidos" },
      { id: OPTION.handoff, title: "Falar c/ responsável" },
    ],
  };
}

export function categoryListScreen(catalog: Catalog, cart: CartLine[], pageIndex: number): Screen {
  const { items, hasMore } = page(catalog.categories, pageIndex);
  const options: Option[] = items.map((category) => ({ id: PREFIX.category + category.id, title: category.name }));
  if (hasMore) options.push({ id: OPTION.nextPage, title: "Ver mais categorias" });
  if (cart.length) options.push({ id: OPTION.viewCart, title: "Ver carrinho", description: `${cart.length} item(ns)` });
  return { kind: "list", body: "Escolha uma categoria:", button: "Categorias", options };
}

export function productListScreen(catalog: Catalog, categoryId: string, pageIndex: number): Screen {
  const category = catalog.categories.find((c) => c.id === categoryId);
  const { items, hasMore } = page(catalog.products.filter((p) => p.categoryId === categoryId), pageIndex);
  const options: Option[] = items.map((product) => ({
    id: PREFIX.product + product.id,
    title: product.name,
    description: formatPrice(product.price),
  }));
  if (hasMore) options.push({ id: OPTION.nextPage, title: "Ver mais produtos" });
  options.push({ id: OPTION.categories, title: "Outras categorias" });
  return { kind: "list", body: `Produtos em *${category?.name ?? ""}*:`, button: "Produtos", options };
}

export function productDetailsScreen(product: CatalogProduct, cart: CartLine[]): Screen {
  const description = product.description ? `\n\n${product.description}` : "";
  const options: Option[] = [
    { id: OPTION.addProduct, title: "Adicionar" },
    { id: OPTION.otherProducts, title: "Ver outros produtos" },
  ];
  if (cart.length) options.push({ id: OPTION.viewCart, title: "Ver carrinho" });
  return {
    kind: "buttons",
    body: `*${product.name}*${description}\n\n${formatPrice(product.price)}`,
    options,
    imagePath: product.imagePath,
  };
}

export function quantityPromptScreen(product: CatalogProduct): Screen {
  return {
    kind: "text",
    body: `Quantas unidades de *${product.name}*? Responda com um número de 1 a ${MAX_QUANTITY}.`,
  };
}

export function cartReviewScreen(items: CartView[]): Screen {
  return {
    kind: "buttons",
    body: `*Seu carrinho*\n\n${cartSummary(items)}`,
    options: [
      { id: OPTION.submitCart, title: "Enviar solicitação" },
      { id: OPTION.continueShopping, title: "Continuar comprando" },
      { id: OPTION.editCart, title: "Alterar itens" },
    ],
  };
}

export function cartItemsScreen(items: CartView[]): Screen {
  const options: Option[] = items.map((item) => ({
    id: PREFIX.item + item.product.id,
    title: item.product.name,
    description: `${item.quantity}x — ${formatPrice(item.total)}`,
  }));
  options.push({ id: OPTION.viewCart, title: "Voltar ao carrinho" });
  return { kind: "list", body: "Qual item você quer alterar?", button: "Itens", options };
}

export function cartItemScreen(item: CartView): Screen {
  return {
    kind: "buttons",
    body: `*${item.product.name}*: ${item.quantity}x — ${formatPrice(item.total)}`,
    options: [
      { id: OPTION.removeItem, title: "Remover" },
      { id: OPTION.changeQuantity, title: "Mudar quantidade" },
      { id: OPTION.viewCart, title: "Voltar ao carrinho" },
    ],
  };
}

export function orderConfirmationScreen(items: CartView[]): Screen {
  return {
    kind: "buttons",
    body: `*Resumo da solicitação*\n\n${cartSummary(items)}\n\n` +
      "O envio não confirma a venda: a responsável vai verificar disponibilidade, frete, prazo e valor final e falar com você por aqui.",
    options: [
      { id: OPTION.confirmOrder, title: "Confirmar envio" },
      { id: OPTION.backToCart, title: "Voltar ao carrinho" },
    ],
  };
}
