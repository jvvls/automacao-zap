import { AppShell, Burger, Button, Group, NavLink, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useQueryClient } from '@tanstack/react-query'
import { NavLink as RouterNavLink, Outlet } from 'react-router'
import { supabase } from '../lib/supabase'

const links = [
  { to: '/produtos', label: 'Produtos' },
  { to: '/pedidos', label: 'Pedidos' },
]

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure()
  const queryClient = useQueryClient()

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
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Menu" />
            <Title order={4}>Scrapbook Store</Title>
          </Group>
          <Button variant="subtle" size="compact-sm" onClick={signOut}>
            Sair
          </Button>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {links.map((link) => (
          <NavLink
            key={link.to}
            component={RouterNavLink}
            to={link.to}
            label={link.label}
            onClick={close}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
