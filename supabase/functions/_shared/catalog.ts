// Catálogo atual (seção 4.2): categorias ativas com pelo menos um produto
// ativo. É lido a cada mensagem e passado à máquina de estados, que valida as
// escolhas do cliente contra ele.
import type { Catalog, CatalogCategory } from "./catalog-model.ts";
import type { Db } from "./supabase.ts";

export const PRODUCT_IMAGES_BUCKET = "product-images";

export async function loadCatalog(db: Db): Promise<Catalog> {
  const { data, error } = await db
    .from("products")
    .select("id, category_id, name, description, base_price, image_path, categories!inner(id, name, active)")
    .eq("active", true)
    .eq("categories.active", true)
    .order("name");
  if (error) throw error;

  const categories = new Map<string, CatalogCategory>();
  const products = data.map((row) => {
    categories.set(row.categories.id, { id: row.categories.id, name: row.categories.name });
    return {
      id: row.id,
      categoryId: row.category_id,
      name: row.name,
      description: row.description,
      price: Number(row.base_price),
      imagePath: row.image_path,
    };
  });
  return {
    categories: [...categories.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    products,
  };
}
