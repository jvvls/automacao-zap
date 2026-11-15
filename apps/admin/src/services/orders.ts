import { supabase } from '../lib/supabase'

export async function listOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('id, created_at, status, subtotal, total_estimated, customers(name, phone)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getOrder(id: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, customers(name, phone), order_items(*), order_status_history(*)')
    .eq('id', id)
    .order('created_at', { referencedTable: 'order_items' })
    .order('created_at', { referencedTable: 'order_status_history' })
    .single()
  if (error) throw error
  return data
}

// O painel só pode alterar a coluna status (grant da Fase 1); o histórico é
// gravado pelo trigger orders_log_status_change.
export async function updateOrderStatus(id: string, status: string) {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id)
  if (error) throw error
}

export function shortOrderId(id: string) {
  return id.slice(0, 8).toUpperCase()
}
