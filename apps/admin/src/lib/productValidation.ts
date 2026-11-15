// Regras do formulário de produto (seções 5.2 e 6.2). Espelham os CHECKs do
// banco: preço >= 0, peso e dimensões > 0, e os limites de NUMERIC(p,s).

export const IMAGE_TYPES = ['image/jpeg', 'image/png']
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024 // igual ao bucket product-images

export type ProductFormValues = {
  name: string
  category_id: string | null
  description: string
  base_price: number | string
  shipping_weight_kg: number | string
  shipping_width_cm: number | string
  shipping_height_cm: number | string
  shipping_length_cm: number | string
  active: boolean
  image: File | null
}

function numberRule({ allowZero, max }: { allowZero: boolean; max: number }) {
  return (value: number | string) => {
    if (value === '' || value == null) return 'Campo obrigatório'
    const n = Number(value)
    if (!Number.isFinite(n)) return 'Valor inválido'
    if (n < 0) return 'Não pode ser negativo'
    if (!allowZero && n === 0) return 'Deve ser maior que zero'
    if (n > max) return 'Valor acima do limite'
    return null
  }
}

export const productValidation = {
  name: (value: string) => {
    const name = value.trim()
    if (!name) return 'Informe o nome'
    if (name.length > 150) return 'Nome com no máximo 150 caracteres'
    return null
  },
  category_id: (value: string | null) => (value ? null : 'Selecione a categoria'),
  base_price: numberRule({ allowZero: true, max: 99_999_999.99 }),
  shipping_weight_kg: numberRule({ allowZero: false, max: 99_999.999 }),
  shipping_width_cm: numberRule({ allowZero: false, max: 999_999.99 }),
  shipping_height_cm: numberRule({ allowZero: false, max: 999_999.99 }),
  shipping_length_cm: numberRule({ allowZero: false, max: 999_999.99 }),
  image: (file: File | null) => {
    if (!file) return null
    if (!IMAGE_TYPES.includes(file.type)) return 'Use uma foto JPG ou PNG'
    if (file.size > IMAGE_MAX_BYTES) return 'A foto deve ter no máximo 5 MB'
    return null
  },
}
