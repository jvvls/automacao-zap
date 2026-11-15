// Carrinho temporário da conversa (seção 4.3), guardado em context.cart.
// Só identificadores e quantidades: nome e preço vêm sempre do catálogo atual.
import type { ConversationContext } from "./state-machine.ts";

// type (e não interface) para ser atribuível ao Json do contexto.
export type CartLine = {
  product_id: string;
  quantity: number;
};

export const MAX_QUANTITY = 99;

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  return typeof line.product_id === "string" && Number.isInteger(line.quantity) &&
    (line.quantity as number) >= 1 && (line.quantity as number) <= MAX_QUANTITY;
}

export function readCart(context: ConversationContext): CartLine[] {
  return Array.isArray(context.cart) ? context.cart.filter(isCartLine) : [];
}

// Aceita só um inteiro de 1 a MAX_QUANTITY, sem sinais nem casas decimais.
export function parseQuantity(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const quantity = Number(trimmed);
  return quantity >= 1 && quantity <= MAX_QUANTITY ? quantity : null;
}

// Somar ao item já existente nunca passa de MAX_QUANTITY.
export function addToCart(cart: CartLine[], productId: string, quantity: number): CartLine[] {
  const existing = cart.find((line) => line.product_id === productId);
  if (!existing) return [...cart, { product_id: productId, quantity }];
  return cart.map((line) =>
    line === existing ? { ...line, quantity: Math.min(line.quantity + quantity, MAX_QUANTITY) } : line
  );
}

export function setQuantity(cart: CartLine[], productId: string, quantity: number): CartLine[] {
  return cart.map((line) => (line.product_id === productId ? { ...line, quantity } : line));
}

export function removeFromCart(cart: CartLine[], productId: string): CartLine[] {
  return cart.filter((line) => line.product_id !== productId);
}
