import { Alert, Button, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDateTime } from '../lib/format'
import {
  listHandoffConversations,
  reactivateBot,
  type HandoffConversation,
} from '../services/conversations'

export function HandoffPage() {
  const conversations = useQuery({
    queryKey: ['handoff-conversations'],
    queryFn: listHandoffConversations,
  })

  return (
    <Stack maw={640}>
      <Title order={2}>Atendimento</Title>
      <Text size="sm" c="dimmed">
        Clientes que pediram para falar com a responsável. O bot não responde essas conversas até
        ser reativado.
      </Text>

      {conversations.isPending && <Loader />}
      {conversations.isError && (
        <Alert color="red">Não foi possível carregar as conversas.</Alert>
      )}
      {conversations.data?.length === 0 && (
        <Text c="dimmed">Nenhuma conversa em atendimento humano.</Text>
      )}

      {conversations.data?.map((conversation) => (
        <HandoffRow key={conversation.id} conversation={conversation} />
      ))}
    </Stack>
  )
}

function HandoffRow({ conversation }: { conversation: HandoffConversation }) {
  const queryClient = useQueryClient()

  const reactivate = useMutation({
    mutationFn: () => reactivateBot(conversation.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['handoff-conversations'] })
      notifications.show({ message: 'Bot reativado.' })
    },
    onError: () =>
      notifications.show({ color: 'red', message: 'Não foi possível reativar o bot.' }),
  })

  return (
    <Paper withBorder p="sm" radius="md" data-testid="handoff-row">
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text fw={600} truncate>
            {conversation.customers.name ?? 'Cliente sem nome'}
          </Text>
          <Text size="sm">{conversation.customers.phone}</Text>
          {conversation.handoff_at && (
            <Text size="xs" c="dimmed">
              Desde {formatDateTime(conversation.handoff_at)}
            </Text>
          )}
        </Stack>
        <Button
          variant="light"
          size="compact-sm"
          loading={reactivate.isPending}
          onClick={() => reactivate.mutate()}
        >
          Reativar bot
        </Button>
      </Group>
    </Paper>
  )
}
