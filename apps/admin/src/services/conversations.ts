import { supabase } from '../lib/supabase'

export async function listHandoffConversations() {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, handoff_at, customers(name, phone)')
    .eq('human_handoff', true)
    .order('handoff_at', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data
}

export async function countHandoffConversations() {
  const { count, error } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('human_handoff', true)
  if (error) throw error
  return count ?? 0
}

export type HandoffConversation = Awaited<ReturnType<typeof listHandoffConversations>>[number]

// O painel só pode alterar human_handoff (grant da Fase 1); o trigger
// conversations_reset_on_bot_reactivation volta a conversa ao menu.
export async function reactivateBot(id: string) {
  const { error } = await supabase.from('conversations').update({ human_handoff: false }).eq('id', id)
  if (error) throw error
}
