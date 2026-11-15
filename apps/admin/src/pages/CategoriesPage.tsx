import { Alert, Button, Group, Loader, Paper, Stack, Switch, Text, TextInput, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { isUniqueViolation } from '../lib/supabaseErrors'
import {
  createCategory,
  listCategories,
  renameCategory,
  setCategoryActive,
  type Category,
} from '../services/products'

function categoryErrorMessage(error: unknown, action: string) {
  return isUniqueViolation(error)
    ? 'Já existe uma categoria com esse nome'
    : `Não foi possível ${action} a categoria`
}

function useInvalidateCategories() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
    ])
}

export function CategoriesPage() {
  const invalidate = useInvalidateCategories()
  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories })
  const [name, setName] = useState('')

  const add = useMutation({
    mutationFn: (value: string) => createCategory(value),
    onSuccess: async () => {
      await invalidate()
      setName('')
    },
  })

  const trimmed = name.trim()

  return (
    <Stack maw={640}>
      <Title order={2}>Categorias</Title>
      <Text size="sm" c="dimmed">
        Produtos de categoria inativa não aparecem no catálogo do WhatsApp.
      </Text>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (trimmed) add.mutate(trimmed)
        }}
      >
        <Group align="flex-start" wrap="nowrap">
          <TextInput
            aria-label="Nova categoria"
            placeholder="Nova categoria"
            maxLength={100}
            style={{ flex: 1 }}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            error={add.isError && categoryErrorMessage(add.error, 'cadastrar')}
          />
          <Button type="submit" disabled={!trimmed} loading={add.isPending}>
            Adicionar
          </Button>
        </Group>
      </form>

      {categories.isPending && <Loader />}
      {categories.isError && <Alert color="red">Não foi possível carregar as categorias.</Alert>}
      {categories.data?.length === 0 && <Text c="dimmed">Nenhuma categoria cadastrada.</Text>}

      {categories.data?.map((category) => (
        <CategoryRow key={category.id} category={category} />
      ))}
    </Stack>
  )
}

function CategoryRow({ category }: { category: Category }) {
  const invalidate = useInvalidateCategories()
  const [editingName, setEditingName] = useState<string | null>(null)

  const toggleActive = useMutation({
    mutationFn: (active: boolean) => setCategoryActive(category.id, active),
    onSuccess: invalidate,
    onError: () =>
      notifications.show({ color: 'red', message: 'Não foi possível alterar a categoria.' }),
  })

  const rename = useMutation({
    mutationFn: (value: string) => renameCategory(category.id, value),
    onSuccess: async () => {
      await invalidate()
      setEditingName(null)
    },
  })

  const trimmed = editingName?.trim() ?? ''

  return (
    <Paper withBorder p="sm" radius="md" data-testid="category-row">
      {editingName === null ? (
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600} truncate>
            {category.name}
          </Text>
          <Group gap="sm" wrap="nowrap">
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => {
                rename.reset()
                setEditingName(category.name)
              }}
            >
              Renomear
            </Button>
            <Switch
              label={category.active ? 'Ativa' : 'Inativa'}
              checked={category.active}
              disabled={toggleActive.isPending}
              onChange={(event) => toggleActive.mutate(event.currentTarget.checked)}
            />
          </Group>
        </Group>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (trimmed === category.name) setEditingName(null)
            else if (trimmed) rename.mutate(trimmed)
          }}
        >
          <Stack gap="xs">
            <TextInput
              aria-label="Nome da categoria"
              maxLength={100}
              autoFocus
              value={editingName}
              onChange={(event) => setEditingName(event.currentTarget.value)}
              error={rename.isError && categoryErrorMessage(rename.error, 'renomear')}
            />
            <Group gap="xs" justify="flex-end">
              <Button variant="subtle" color="gray" size="compact-sm" onClick={() => setEditingName(null)}>
                Cancelar
              </Button>
              <Button type="submit" size="compact-sm" disabled={!trimmed} loading={rename.isPending}>
                Salvar
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Paper>
  )
}
