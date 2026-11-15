import { Alert, Button, Center, Loader, Stack } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

// Protege as rotas do painel: exige sessão e que o usuário esteja em
// `admins` (seção 6.4). Sem is_admin() o RLS devolveria listas vazias.
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()
  const userId = session?.user.id

  const adminQuery = useQuery({
    queryKey: ['is-admin', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_admin')
      if (error) throw error
      return data
    },
  })

  if (loading || (userId && adminQuery.isPending)) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  if (adminQuery.isError || !adminQuery.data) {
    return (
      <Center h="100vh" p="md">
        <Stack maw={400}>
          <Alert color="red" title="Acesso negado">
            {adminQuery.isError
              ? 'Não foi possível verificar a permissão da conta.'
              : 'Esta conta não tem permissão para usar o painel.'}
          </Alert>
          <Button variant="default" onClick={() => supabase.auth.signOut()}>
            Sair
          </Button>
        </Stack>
      </Center>
    )
  }

  return children
}
