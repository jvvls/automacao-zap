// Frete (seções 4.5 e 10): tipos, validação do CEP, regra de embalagem e
// leitura da resposta do Melhor Envio, sem banco nem rede, para a máquina de
// estados e as telas serem testadas com `deno test` puro.
import type { Json } from "./database.types.ts";

// Opção apresentada ao cliente, já gravada em shipping_quotes (quoteId).
// type (e não interface) para ser atribuível ao Json do contexto.
export type ShippingOption = {
  quoteId: string;
  service: string;
  price: number;
  days: number | null;
};

// Frete escolhido para o pedido: CEP com opção cotada, ou só o CEP quando a
// cotação falhou ou não trouxe serviços (frete não cotado, seção 10.3).
export type ShippingChoice = {
  postalCode: string;
  option: ShippingOption | null;
};

// Lista do WhatsApp tem até 10 linhas: 8 opções + "Outro CEP" + "Seguir sem frete".
export const MAX_SHIPPING_OPTIONS = 8;

// Aceita "30140071", "30140-071" e "30.140-071".
export function parsePostalCode(text: string): string | null {
  const digits = text.trim().replace(/[\s.-]/g, "");
  return /^\d{8}$/.test(digits) ? digits : null;
}

export function formatPostalCode(postalCode: string): string {
  return `${postalCode.slice(0, 5)}-${postalCode.slice(5)}`;
}

export function deliveryLabel(days: number | null): string {
  if (days === null) return "prazo a confirmar";
  return days === 1 ? "1 dia útil" : `${days} dias úteis`;
}

function isShippingOption(value: unknown): value is ShippingOption {
  if (typeof value !== "object" || value === null) return false;
  const option = value as Record<string, unknown>;
  return typeof option.quoteId === "string" && typeof option.service === "string" &&
    typeof option.price === "number" && (option.days === null || Number.isInteger(option.days));
}

export function readShippingOptions(value: Json | undefined): ShippingOption[] {
  return Array.isArray(value) ? value.filter(isShippingOption) : [];
}

export function readShippingOption(value: Json | undefined): ShippingOption | null {
  return isShippingOption(value) ? value : null;
}

// Dados de envio de um produto do carrinho, lidos do banco (nunca do cliente).
export interface PackageProduct {
  id: string;
  price: number;
  weightKg: number;
  widthCm: number;
  heightCm: number;
  lengthCm: number;
  quantity: number;
}

// Regra de embalagem do MVP: cotação por produtos. Cada produto vai com peso e
// dimensões unitários e o Melhor Envio monta os volumes; o valor segurado é o
// preço do produto.
export function quoteRequestBody(from: string, to: string, products: PackageProduct[]) {
  return {
    from: { postal_code: from },
    to: { postal_code: to },
    products: products.map((product) => ({
      id: product.id,
      width: product.widthCm,
      height: product.heightCm,
      length: product.lengthCm,
      weight: product.weightKg,
      insurance_value: product.price,
      quantity: product.quantity,
    })),
    options: { receipt: false, own_hand: false },
  };
}

export interface QuotedService {
  service: string;
  price: number;
  days: number | null;
}

// Serviços que atendem o trecho, do mais barato ao mais caro. Os que não
// atendem vêm com `error` e ficam de fora.
export function parseQuoteResponse(body: unknown): QuotedService[] {
  if (!Array.isArray(body)) throw new Error("resposta inesperada do Melhor Envio");
  return body
    .flatMap((entry): QuotedService[] => {
      if (typeof entry !== "object" || entry === null || entry.error) return [];
      const price = Number(entry.custom_price ?? entry.price);
      if (!Number.isFinite(price) || price < 0) return [];
      const days = Number(entry.custom_delivery_time ?? entry.delivery_time);
      const service = [entry.company?.name, entry.name].filter((part) => typeof part === "string" && part).join(" ");
      if (!service) return [];
      return [{
        service: service.slice(0, 100),
        price: Math.round(price * 100) / 100,
        days: Number.isInteger(days) && days >= 0 ? days : null,
      }];
    })
    .sort((a, b) => a.price - b.price);
}
