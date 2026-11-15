// Criação da solicitação de pedido (seção 4.3) pela RPC transacional, que
// revalida produtos e preços. A chave de idempotência vem da mensagem de
// confirmação: reprocessar a mesma mensagem devolve o mesmo pedido.
import type { CartLine } from "./cart.ts";
import { formatPrice } from "./catalog-model.ts";
import type { Customer } from "./conversations.ts";
import type { CartView } from "./screens.ts";
import type { Db } from "./supabase.ts";

export class ProductUnavailableError extends Error {
  constructor() {
    super("product_unavailable");
  }
}

export function orderIdempotencyKey(waMessageId: string): string {
  return `wa:${waMessageId}`.slice(0, 100);
}

export async function createOrder(db: Db, customerId: string, items: CartLine[], key: string): Promise<string> {
  const { data, error } = await db.rpc("create_order_with_items", {
    p_customer_id: customerId,
    p_items: items.map(({ product_id, quantity }) => ({ product_id, quantity })),
    p_idempotency_key: key,
  });
  if (error?.message.includes("product_unavailable")) throw new ProductUnavailableError();
  if (error) throw error;
  return data;
}

export function shortOrderId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export function orderConfirmation(orderId: string): string {
  return `Recebemos sua solicitação *#${shortOrderId(orderId)}*! A responsável vai conferir disponibilidade, frete, prazo e valor final e falar com você por aqui. Você acompanha o status em "Meus pedidos".`;
}

export function ownerOrderNotice(customer: Customer, orderId: string, items: CartView[]): string {
  const who = customer.name ? `${customer.name} (+${customer.phone})` : `+${customer.phone}`;
  const lines = items.map((item) => `• ${item.quantity}x ${item.product.name}`).join("\n");
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  return `Nova solicitação #${shortOrderId(orderId)} de ${who}:\n${lines}\nSubtotal: ${formatPrice(subtotal)}. Veja no painel.`;
}
