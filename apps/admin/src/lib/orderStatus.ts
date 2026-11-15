// Status de orders.status (seção 5.5), na ordem do fluxo.
export const ORDER_STATUSES = [
  { value: 'received', label: 'Recebido', color: 'blue' },
  { value: 'in_review', label: 'Em análise', color: 'yellow' },
  { value: 'approved', label: 'Aprovado', color: 'teal' },
  { value: 'in_production', label: 'Em produção', color: 'violet' },
  { value: 'ready', label: 'Pronto', color: 'green' },
  { value: 'completed', label: 'Concluído', color: 'gray' },
  { value: 'cancelled', label: 'Cancelado', color: 'red' },
] as const

export function orderStatusInfo(status: string) {
  return ORDER_STATUSES.find((item) => item.value === status) ?? { value: status, label: status, color: 'gray' }
}
