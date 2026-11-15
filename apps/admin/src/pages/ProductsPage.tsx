import { Alert, Badge, Button, Center, Group, Image, Loader, Paper, Stack, Switch, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { formatCurrency } from '../lib/format'
import { listProducts, productImageUrl, setProductActive } from '../services/products'

export function ProductsPage() {
  const queryClient = useQueryClient()
  const products = useQuery({ queryKey: ['products'], queryFn: listProducts })

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setProductActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
    onError: () =>
      notifications.show({ color: 'red', message: 'Não foi possível alterar o produto.' }),
  })

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Produtos</Title>
        <Button component={Link} to="/produtos/novo">
          Novo produto
        </Button>
      </Group>

      {products.isPending && <Loader />}
      {products.isError && <Alert color="red">Não foi possível carregar os produtos.</Alert>}
      {products.data?.length === 0 && <Text c="dimmed">Nenhum produto cadastrado.</Text>}

      {products.data?.map((product) => {
        const imageUrl = productImageUrl(product.image_path)
        return (
          <Paper key={product.id} withBorder p="sm" radius="md" data-testid="product-row">
            <Group wrap="nowrap" align="flex-start">
              {imageUrl ? (
                <Image src={imageUrl} w={64} h={64} radius="sm" fit="cover" alt="" />
              ) : (
                <Center w={64} h={64} bg="gray.1" style={{ borderRadius: 4, flexShrink: 0 }}>
                  <Text size="xs" c="dimmed">
                    sem foto
                  </Text>
                </Center>
              )}
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Text fw={600} component={Link} to={`/produtos/${product.id}`} truncate>
                  {product.name}
                </Text>
                <Group gap="xs">
                  <Text size="sm" c="dimmed">
                    {product.categories?.name}
                  </Text>
                  {product.categories && !product.categories.active && (
                    <Badge size="xs" color="gray">
                      categoria inativa
                    </Badge>
                  )}
                </Group>
                <Text size="sm">{formatCurrency(product.base_price)}</Text>
              </Stack>
              <Switch
                label={product.active ? 'Ativo' : 'Inativo'}
                checked={product.active}
                disabled={toggleActive.isPending}
                onChange={(event) =>
                  toggleActive.mutate({ id: product.id, active: event.currentTarget.checked })
                }
              />
            </Group>
          </Paper>
        )
      })}
    </Stack>
  )
}
