import {
  Alert,
  Anchor,
  Button,
  FileInput,
  Group,
  Image,
  Loader,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { IMAGE_TYPES, productValidation, type ProductFormValues } from '../lib/productValidation'
import {
  createCategory,
  getProduct,
  listCategories,
  productImageUrl,
  saveProduct,
  type Product,
} from '../services/products'

const emptyValues: ProductFormValues = {
  name: '',
  category_id: null,
  description: '',
  base_price: '',
  shipping_weight_kg: '',
  shipping_width_cm: '',
  shipping_height_cm: '',
  shipping_length_cm: '',
  active: true,
  image: null,
}

function toFormValues(product: Product): ProductFormValues {
  return {
    name: product.name,
    category_id: product.category_id,
    description: product.description ?? '',
    base_price: product.base_price,
    shipping_weight_kg: product.shipping_weight_kg,
    shipping_width_cm: product.shipping_width_cm,
    shipping_height_cm: product.shipping_height_cm,
    shipping_length_cm: product.shipping_length_cm,
    active: product.active,
    image: null,
  }
}

export function ProductFormPage() {
  const { id } = useParams()
  const product = useQuery({
    queryKey: ['products', id],
    enabled: Boolean(id),
    queryFn: () => getProduct(id!),
  })

  if (id && product.isPending) return <Loader />
  if (id && product.isError) return <Alert color="red">Produto não encontrado.</Alert>

  return <ProductForm key={id ?? 'novo'} product={product.data ?? null} />
}

function ProductForm({ product }: { product: Product | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories })
  const [newCategory, setNewCategory] = useState<string | null>(null)

  const form = useForm<ProductFormValues>({
    mode: 'controlled',
    initialValues: product ? toFormValues(product) : emptyValues,
    validate: productValidation,
  })

  const save = useMutation({
    mutationFn: (values: ProductFormValues) =>
      saveProduct({
        id: product?.id ?? null,
        previousImagePath: product?.image_path ?? null,
        image: values.image,
        fields: {
          name: values.name.trim(),
          category_id: values.category_id!,
          description: values.description.trim() || null,
          base_price: Number(values.base_price),
          shipping_weight_kg: Number(values.shipping_weight_kg),
          shipping_width_cm: Number(values.shipping_width_cm),
          shipping_height_cm: Number(values.shipping_height_cm),
          shipping_length_cm: Number(values.shipping_length_cm),
          active: values.active,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      notifications.show({ color: 'green', message: 'Produto salvo.' })
      navigate('/produtos')
    },
  })

  const addCategory = useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: async (category) => {
      await queryClient.invalidateQueries({ queryKey: ['categories'] })
      form.setFieldValue('category_id', category.id)
      setNewCategory(null)
    },
  })

  const categoryOptions = (categories.data ?? []).map((category) => ({
    value: category.id,
    label: category.active ? category.name : `${category.name} (inativa)`,
  }))
  const currentImageUrl = productImageUrl(product?.image_path ?? null)
  const newCategoryName = newCategory?.trim() ?? ''

  return (
    <form onSubmit={form.onSubmit((values) => save.mutate(values))} noValidate>
      <Stack maw={640}>
        <Group justify="space-between">
          <Title order={2}>{product ? 'Editar produto' : 'Novo produto'}</Title>
          <Anchor component={Link} to="/produtos">
            Voltar
          </Anchor>
        </Group>

        {save.isError && (
          <Alert color="red">Não foi possível salvar o produto. Confira os dados e tente novamente.</Alert>
        )}

        <Paper withBorder p="md" radius="md">
          <Stack>
            <Title order={4}>Informações do produto</Title>
            <TextInput label="Nome" required maxLength={150} {...form.getInputProps('name')} />

            <Select
              label="Categoria"
              required
              placeholder={categories.isPending ? 'Carregando…' : 'Selecione'}
              data={categoryOptions}
              searchable
              nothingFoundMessage="Nenhuma categoria"
              {...form.getInputProps('category_id')}
            />
            {newCategory === null ? (
              <Anchor component="button" type="button" size="sm" onClick={() => setNewCategory('')}>
                Cadastrar nova categoria
              </Anchor>
            ) : (
              <Group align="flex-end" wrap="nowrap">
                <TextInput
                  label="Nova categoria"
                  maxLength={100}
                  style={{ flex: 1 }}
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.currentTarget.value)}
                  error={
                    addCategory.isError &&
                    (isUniqueViolation(addCategory.error)
                      ? 'Já existe uma categoria com esse nome'
                      : 'Não foi possível cadastrar a categoria')
                  }
                />
                <Button
                  type="button"
                  variant="light"
                  disabled={!newCategoryName}
                  loading={addCategory.isPending}
                  onClick={() => addCategory.mutate(newCategoryName)}
                >
                  Adicionar
                </Button>
                <Button type="button" variant="subtle" color="gray" onClick={() => setNewCategory(null)}>
                  Cancelar
                </Button>
              </Group>
            )}

            <Textarea label="Descrição" autosize minRows={2} {...form.getInputProps('description')} />

            <NumberInput
              label="Preço"
              required
              prefix="R$ "
              decimalScale={2}
              fixedDecimalScale
              decimalSeparator=","
              thousandSeparator="."
              allowNegative={false}
              {...form.getInputProps('base_price')}
            />

            <Stack gap="xs">
              {currentImageUrl && (
                <Image src={currentImageUrl} alt="Foto atual" w={160} h={160} radius="sm" fit="cover" />
              )}
              <FileInput
                label={currentImageUrl ? 'Substituir foto' : 'Foto'}
                description="JPG ou PNG, até 5 MB"
                accept={IMAGE_TYPES.join(',')}
                clearable
                {...form.getInputProps('image')}
              />
            </Stack>
          </Stack>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Stack>
            <Title order={4}>Informações para envio</Title>
            <Text size="sm" c="dimmed">
              Medidas do produto já embalado.
            </Text>
            <SimpleGrid cols={{ base: 1, xs: 2 }}>
              <NumberInput
                label="Peso (kg)"
                required
                decimalScale={3}
                decimalSeparator=","
                allowNegative={false}
                {...form.getInputProps('shipping_weight_kg')}
              />
              <NumberInput
                label="Largura (cm)"
                required
                decimalScale={2}
                decimalSeparator=","
                allowNegative={false}
                {...form.getInputProps('shipping_width_cm')}
              />
              <NumberInput
                label="Altura (cm)"
                required
                decimalScale={2}
                decimalSeparator=","
                allowNegative={false}
                {...form.getInputProps('shipping_height_cm')}
              />
              <NumberInput
                label="Comprimento (cm)"
                required
                decimalScale={2}
                decimalSeparator=","
                allowNegative={false}
                {...form.getInputProps('shipping_length_cm')}
              />
            </SimpleGrid>
          </Stack>
        </Paper>

        <Switch
          label="Ativo no catálogo"
          {...form.getInputProps('active', { type: 'checkbox' })}
        />

        <Button type="submit" loading={save.isPending}>
          Salvar
        </Button>
      </Stack>
    </form>
  )
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}
