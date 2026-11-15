import { Alert, Badge, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { formatCurrency, formatDateTime } from '../lib/format'
import { orderStatusInfo } from '../lib/orderStatus'
import { listOrders, shortOrderId } from '../services/orders'

export function OrdersPage() {
  const orders = useQuery({ queryKey: ['orders'], queryFn: listOrders })

  return (
    <Stack>
      <Title order={2}>Pedidos</Title>

      {orders.isPending && <Loader />}
      {orders.isError && <Alert color="red">Não foi possível carregar os pedidos.</Alert>}
      {orders.data?.length === 0 && <Text c="dimmed">Nenhum pedido recebido.</Text>}

      {orders.data?.map((order) => {
        const status = orderStatusInfo(order.status)
        return (
          <Paper
            key={order.id}
            component={Link}
            to={`/pedidos/${order.id}`}
            withBorder
            p="sm"
            radius="md"
            data-testid="order-row"
          >
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Text fw={600} truncate>
                  #{shortOrderId(order.id)} · {order.customers?.name ?? order.customers?.phone}
                </Text>
                <Text size="sm" c="dimmed">
                  {formatDateTime(order.created_at)}
                </Text>
                <Text size="sm">{formatCurrency(order.total_estimated ?? order.subtotal)}</Text>
              </Stack>
              <Badge color={status.color}>{status.label}</Badge>
            </Group>
          </Paper>
        )
      })}
    </Stack>
  )
}
