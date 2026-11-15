import { AppShell, Badge, Burger, Button, Group, Indicator, NavLink, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useQueryClient } from '@tanstack/react-query'
import { NavLink as RouterNavLink, Outlet } from 'react-router'
import { useAdminNotices } from '../hooks/useAdminNotices'
import { supabase } from '../lib/supabase'

const links = [
  { to: '/produtos', label: 'Produtos' },
  { to: '/categorias', label: 'Categorias' },
  { to: '/pedidos', label: 'Pedidos', notice: 'newOrders' },
  { to: '/atendimento', label: 'Atendimento', notice: 'handoffs' },
] as const

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure()
  const queryClient = useQueryClient()
  const notices = useAdminNotices()
  const pending = notices.newOrders + notices.handoffs

  const signOut = async () => {
    await supabase.auth.signOut()
    queryClient.clear()
  }

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            {/* No celular o menu fica fechado; o ponto avisa que há pendências. */}
            <Indicator disabled={pending === 0} size={10} offset={4} hiddenFrom="sm">
              <Burger opened={opened} onClick={toggle} size="sm" aria-label="Menu" />
            </Indicator>
            <Title order={4}>Scrapbook Store</Title>
          </Group>
          <Button variant="subtle" size="compact-sm" onClick={signOut}>
            Sair
          </Button>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {links.map((link) => {
          const count = 'notice' in link ? notices[link.notice] : 0
          return (
            <NavLink
              key={link.to}
              component={RouterNavLink}
              to={link.to}
              label={link.label}
              rightSection={
                count > 0 ? (
                  <Badge size="sm" circle aria-label={`${count} pendente(s)`}>
                    {count}
                  </Badge>
                ) : null
              }
              onClick={close}
            />
          )
        })}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
