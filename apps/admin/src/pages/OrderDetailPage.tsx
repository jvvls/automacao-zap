import {
  Alert,
  Anchor,
  Badge,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Timeline,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { formatCurrency, formatDateTime } from '../lib/format'
import { ORDER_STATUSES, orderStatusInfo } from '../lib/orderStatus'
import { getOrder, shortOrderId, updateOrderStatus } from '../services/orders'

export function OrderDetailPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const order = useQuery({ queryKey: ['orders', id], queryFn: () => getOrder(id!) })

  const changeStatus = useMutation({
    mutationFn: (status: string) => updateOrderStatus(id!, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      notifications.show({ color: 'green', message: 'Status atualizado.' })
    },
    onError: () => notifications.show({ color: 'red', message: 'Não foi possível alterar o status.' }),
  })

  if (order.isPending) return <Loader />
  if (order.isError) return <Alert color="red">Pedido não encontrado.</Alert>

  const data = order.data

  return (
    <Stack maw={720}>
      <Group justify="space-between">
        <Title order={2}>Pedido #{shortOrderId(data.id)}</Title>
        <Anchor component={Link} to="/pedidos">
          Voltar
        </Anchor>
      </Group>

      <Select
        label="Status"
        data={ORDER_STATUSES.map(({ value, label }) => ({ value, label }))}
        value={data.status}
        allowDeselect={false}
        disabled={changeStatus.isPending}
        onChange={(value) => value && value !== data.status && changeStatus.mutate(value)}
        maw={280}
      />

      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <Field label="Cliente">{data.customers?.name ?? '—'}</Field>
          <Field label="Telefone">{data.customers?.phone}</Field>
          <Field label="Criado em">{formatDateTime(data.created_at)}</Field>
          <Field label="CEP de destino">{data.destination_postal_code ?? '—'}</Field>
          <Field label="Frete">
            {data.shipping_service
              ? `${data.shipping_service} · ${formatCurrency(data.shipping_cost)}`
              : '—'}
          </Field>
          <Field label="Total estimado">{formatCurrency(data.total_estimated ?? data.subtotal)}</Field>
        </SimpleGrid>
        {data.notes && (
          <Field label="Observações" mt="md">
            {data.notes}
          </Field>
        )}
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Title order={4} mb="sm">
          Produtos
        </Title>
        <Table.ScrollContainer minWidth={300}>
          <Table fz="sm" horizontalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Produto</Table.Th>
                <Table.Th ta="right">Qtd.</Table.Th>
                <Table.Th ta="right">Preço</Table.Th>
                <Table.Th ta="right">Total</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.order_items.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>{item.product_name_snapshot}</Table.Td>
                  <Table.Td ta="right">{item.quantity}</Table.Td>
                  <Table.Td ta="right">{formatCurrency(item.unit_price_snapshot)}</Table.Td>
                  <Table.Td ta="right">{formatCurrency(item.unit_price_snapshot * item.quantity)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Th colSpan={3}>Subtotal</Table.Th>
                <Table.Th ta="right">{formatCurrency(data.subtotal)}</Table.Th>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Title order={4} mb="sm">
          Histórico de status
        </Title>
        <Timeline active={data.order_status_history.length - 1} bulletSize={14} data-testid="status-history">
          {data.order_status_history.map((entry) => (
            <Timeline.Item
              key={entry.id}
              title={<Badge color={orderStatusInfo(entry.new_status).color}>{orderStatusInfo(entry.new_status).label}</Badge>}
            >
              <Text size="xs" c="dimmed">
                {formatDateTime(entry.created_at)}
              </Text>
            </Timeline.Item>
          ))}
        </Timeline>
      </Paper>
    </Stack>
  )
}

function Field({ label, children, mt }: { label: string; children: ReactNode; mt?: string }) {
  return (
    <Stack gap={0} mt={mt}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text>{children}</Text>
    </Stack>
  )
}
