// Cotação de frete no Melhor Envio (seções 4.5 e 10), chamada pelo webhook no
// fluxo da conversa. Peso e dimensões vêm do banco; as opções apresentadas
// ficam em shipping_quotes. Falha, lentidão ou ausência de serviços nunca
// impedem a solicitação: a conversa segue sem frete cotado (seção 10.3).
import type { CartLine } from "./cart.ts";
import {
  MAX_SHIPPING_OPTIONS,
  type PackageProduct,
  parseQuoteResponse,
  type QuotedService,
  quoteRequestBody,
  type ShippingOption,
} from "./shipping-model.ts";
import type { Db } from "./supabase.ts";

export interface ShippingConfig {
  apiUrl: string;
  accessToken: string;
  originPostalCode: string;
  userAgent: string;
  timeoutMs: number;
}

const PROVIDER = "melhor_envio";
const DEFAULT_TIMEOUT_MS = 10_000;

// Sem token, CEP de origem ou User-Agent, o bot segue sem cotar frete.
export function shippingConfigFromEnv(): ShippingConfig | null {
  const accessToken = Deno.env.get("MELHORENVIO_ACCESS_TOKEN");
  const originPostalCode = Deno.env.get("STORE_POSTAL_CODE");
  const userAgent = Deno.env.get("MELHORENVIO_USER_AGENT");
  if (!accessToken || !originPostalCode || !userAgent) return null;
  return {
    apiUrl: Deno.env.get("MELHORENVIO_API_URL") ?? "https://melhorenvio.com.br",
    accessToken,
    originPostalCode,
    userAgent,
    timeoutMs: Number(Deno.env.get("MELHORENVIO_TIMEOUT_MS")) || DEFAULT_TIMEOUT_MS,
  };
}

async function packageProducts(db: Db, cart: CartLine[]): Promise<PackageProduct[]> {
  const { data, error } = await db
    .from("products")
    .select("id, base_price, shipping_weight_kg, shipping_width_cm, shipping_height_cm, shipping_length_cm")
    .in("id", cart.map((line) => line.product_id));
  if (error) throw error;
  return cart.flatMap((line) => {
    const product = data.find((row) => row.id === line.product_id);
    return product
      ? [{
        id: product.id,
        price: Number(product.base_price),
        weightKg: Number(product.shipping_weight_kg),
        widthCm: Number(product.shipping_width_cm),
        heightCm: Number(product.shipping_height_cm),
        lengthCm: Number(product.shipping_length_cm),
        quantity: line.quantity,
      }]
      : [];
  });
}

async function fetchQuotes(config: ShippingConfig, to: string, products: PackageProduct[]): Promise<QuotedService[]> {
  const response = await fetch(`${config.apiUrl}/api/v2/me/shipment/calculate`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.accessToken}`,
      "User-Agent": config.userAgent,
    },
    body: JSON.stringify(quoteRequestBody(config.originPostalCode, to, products)),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) throw new Error(`Melhor Envio ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return parseQuoteResponse(await response.json());
}

// Opções gravadas para a conversa, ou null quando não há frete cotado.
export async function quoteShipping(
  db: Db,
  config: ShippingConfig | null,
  conversationId: string,
  postalCode: string,
  cart: CartLine[],
): Promise<ShippingOption[] | null> {
  if (!config) {
    console.warn("shipping: Melhor Envio não configurado", { conversationId });
    return null;
  }
  const products = await packageProducts(db, cart);

  let services: QuotedService[];
  try {
    services = await fetchQuotes(config, postalCode, products);
  } catch (error) {
    console.error("shipping: cotação falhou", { conversationId, error: String(error) });
    return null;
  }
  if (!services.length) {
    console.warn("shipping: nenhum serviço para o CEP", { conversationId, postalCode });
    return null;
  }

  const { data, error } = await db
    .from("shipping_quotes")
    .insert(services.slice(0, MAX_SHIPPING_OPTIONS).map((service) => ({
      conversation_id: conversationId,
      provider: PROVIDER,
      service_name: service.service,
      price: service.price,
      delivery_days: service.days,
      destination_postal_code: postalCode,
    })))
    .select("id, service_name, price, delivery_days");
  if (error) throw error;
  return data
    .map((row) => ({ quoteId: row.id, service: row.service_name, price: Number(row.price), days: row.delivery_days }))
    .sort((a, b) => a.price - b.price);
}
