import { Alert, Button, Group, Loader, Paper, Stack, Switch, Text, TextInput, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { isUniqueViolation } from '../lib/supabaseErrors'
import { createCategory, listCategories, setCategoryActive } from '../services/products'

export function CategoriesPage() {
  const queryClient = useQueryClient()
  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories })
  const [name, setName] = useState('')

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
    ])

  const add = useMutation({
    mutationFn: (value: string) => createCategory(value),
    onSuccess: async () => {
      await invalidate()
      setName('')
    },
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setCategoryActive(id, active),
    onSuccess: invalidate,
    onError: () =>
      notifications.show({ color: 'red', message: 'Não foi possível alterar a categoria.' }),
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
            error={
              add.isError &&
              (isUniqueViolation(add.error)
                ? 'Já existe uma categoria com esse nome'
                : 'Não foi possível cadastrar a categoria')
            }
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
        <Paper key={category.id} withBorder p="sm" radius="md" data-testid="category-row">
          <Group justify="space-between" wrap="nowrap">
            <Text fw={600} truncate>
              {category.name}
            </Text>
            <Switch
              label={category.active ? 'Ativa' : 'Inativa'}
              checked={category.active}
              disabled={toggleActive.isPending}
              onChange={(event) =>
                toggleActive.mutate({ id: category.id, active: event.currentTarget.checked })
              }
            />
          </Group>
        </Paper>
      ))}
    </Stack>
  )
}
