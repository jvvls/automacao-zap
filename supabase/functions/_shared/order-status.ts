// Consulta de pedidos pelo cliente (seção 4.1 e módulo order-status). Toda
// consulta filtra pelo cliente do telefone de origem: um identificador vindo
// da mensagem nunca dá acesso a pedido de outra pessoa.
import { formatPrice } from "./catalog-model.ts";
import { shortOrderId } from "./orders.ts";
import { PREFIX, type Screen } from "./screens.ts";
import type { Db } from "./supabase.ts";

const RECENT_ORDERS = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_LABELS: Record<string, string> = {
  received: "Recebido",
  in_review: "Em análise",
  approved: "Aprovado",
  in_production: "Em produção",
  ready: "Pronto",
  completed: "Concluído",
  cancelled: "Cancelado",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export async function listRecentOrders(db: Db, customerId: string) {
  const { data, error } = await db
    .from("orders")
    .select("id, status, subtotal, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(RECENT_ORDERS);
  if (error) throw error;
  return data;
}

export async function getCustomerOrder(db: Db, customerId: string, orderId: string) {
  if (!UUID.test(orderId)) return null;
  const { data, error } = await db
    .from("orders")
    .select("id, status, subtotal, created_at, order_items(product_name_snapshot, unit_price_snapshot, quantity)")
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .order("created_at", { referencedTable: "order_items" })
    .maybeSingle();
  if (error) throw error;
  return data;
}

type OrderSummary = Awaited<ReturnType<typeof listRecentOrders>>[number];
type OrderDetails = NonNullable<Awaited<ReturnType<typeof getCustomerOrder>>>;

export function orderListScreen(orders: OrderSummary[]): Screen {
  return {
    kind: "list",
    body: "Seus pedidos mais recentes. Escolha um para ver os detalhes:",
    button: "Pedidos",
    options: orders.map((order) => ({
      id: PREFIX.order + order.id,
      title: `#${shortOrderId(order.id)} · ${date.format(new Date(order.created_at))}`,
      description: `${statusLabel(order.status)} · ${formatPrice(Number(order.subtotal))}`,
    })),
  };
}

export const NO_ORDERS = "Você ainda não tem pedidos com este número.";
export const ORDER_NOT_FOUND = "Não encontramos esse pedido.";

export function orderDetailsText(order: OrderDetails): string {
  const items = order.order_items
    .map((item) => `• ${item.quantity}x ${item.product_name_snapshot} — ${formatPrice(Number(item.unit_price_snapshot) * item.quantity)}`)
    .join("\n");
  return `*Pedido #${shortOrderId(order.id)}* (${date.format(new Date(order.created_at))})\n` +
    `Status: *${statusLabel(order.status)}*\n\n${items}\n\nSubtotal: ${formatPrice(Number(order.subtotal))}`;
}
