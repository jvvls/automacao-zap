import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { countHandoffConversations } from '../services/conversations'
import { countNewOrders } from '../services/orders'

// Aviso de pedidos novos e de clientes esperando atendimento (Fase 4). As
// contagens são relidas a cada mudança em orders ou conversations recebida
// pelo Realtime, junto com as listas abertas no painel.
export function useAdminNotices() {
  const queryClient = useQueryClient()
  const newOrders = useQuery({ queryKey: ['notices', 'orders'], queryFn: countNewOrders })
  const handoffs = useQuery({ queryKey: ['notices', 'handoffs'], queryFn: countHandoffConversations })

  useEffect(() => {
    const channel = supabase
      .channel('admin-notices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['notices', 'orders'] })
        void queryClient.invalidateQueries({ queryKey: ['orders'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['notices', 'handoffs'] })
        void queryClient.invalidateQueries({ queryKey: ['handoff-conversations'] })
      })
      // Ao entrar (ou reconectar), relê as contagens: mudanças feitas antes da
      // inscrição não chegam como evento.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void queryClient.invalidateQueries({ queryKey: ['notices'] })
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])

  return { newOrders: newOrders.data ?? 0, handoffs: handoffs.data ?? 0 }
}
