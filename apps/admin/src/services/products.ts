import { supabase } from '../lib/supabase'
import type { Tables, TablesInsert } from '../types/database'

export type Category = Tables<'categories'>
export type Product = Tables<'products'>
export type ProductWithCategory = Product & { categories: Pick<Category, 'name' | 'active'> | null }
export type ProductFields = Omit<TablesInsert<'products'>, 'id' | 'image_path' | 'created_at' | 'updated_at'>

const BUCKET = 'product-images'

export function productImageUrl(path: string | null) {
  return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null
}

export async function listProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, active)')
    .order('name')
  if (error) throw error
  return data
}

export async function getProduct(id: string) {
  const { data, error } = await supabase.from('products').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function setProductActive(id: string, active: boolean) {
  const { error } = await supabase.from('products').update({ active }).eq('id', id)
  if (error) throw error
}

// Salva o produto e, se houver, a foto nova. A foto vai antes para o Storage
// (o caminho usa o id do produto); se a gravação do produto falhar, o arquivo
// novo é removido. A foto anterior só é removida depois que o produto aponta
// para a nova.
export async function saveProduct({
  id,
  fields,
  image,
  previousImagePath,
}: {
  id: string | null
  fields: ProductFields
  image: File | null
  previousImagePath: string | null
}) {
  const productId = id ?? crypto.randomUUID()
  let imagePath = previousImagePath

  if (image) {
    const extension = image.type === 'image/png' ? 'png' : 'jpg'
    imagePath = `${productId}/${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(imagePath, image, { contentType: image.type })
    if (error) throw error
  }

  const row = { ...fields, image_path: imagePath }
  const { error } = id
    ? await supabase.from('products').update(row).eq('id', id)
    : await supabase.from('products').insert({ ...row, id: productId })

  if (error) {
    if (image && imagePath) await supabase.storage.from(BUCKET).remove([imagePath])
    throw error
  }

  if (image && previousImagePath) {
    await supabase.storage.from(BUCKET).remove([previousImagePath])
  }

  return productId
}

export async function listCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('name')
  if (error) throw error
  return data
}

export async function setCategoryActive(id: string, active: boolean) {
  const { error } = await supabase.from('categories').update({ active }).eq('id', id)
  if (error) throw error
}

export async function createCategory(name: string) {
  const { data, error } = await supabase.from('categories').insert({ name }).select().single()
  if (error) throw error
  return data
}
