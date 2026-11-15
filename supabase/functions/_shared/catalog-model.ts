// Tipos do catálogo e formatação de preço, sem dependência do banco, para a
// máquina de estados e as telas serem testadas com `deno test` puro.
export interface CatalogCategory {
  id: string;
  name: string;
}

export interface CatalogProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  imagePath: string | null;
}

export interface Catalog {
  categories: CatalogCategory[];
  products: CatalogProduct[];
}

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatPrice(value: number): string {
  // Intl usa espaço não separável entre "R$" e o valor.
  return currency.format(value).replace(/ /g, " ");
}
