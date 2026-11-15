import { Alert, Button, Center, Paper, PasswordInput, Stack, TextInput, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const { session } = useAuth()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm({
    mode: 'controlled',
    initialValues: { email: '', password: '' },
    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Informe um e-mail válido'),
      password: (value) => (value ? null : 'Informe a senha'),
    },
  })

  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  const handleSubmit = form.onSubmit(async (values) => {
    setSubmitting(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword(values)
    setSubmitting(false)
    if (signInError) {
      setError(
        signInError.code === 'invalid_credentials'
          ? 'E-mail ou senha inválidos.'
          : 'Não foi possível entrar. Tente novamente.',
      )
    }
  })

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="lg" radius="md" w="100%" maw={380}>
        <form onSubmit={handleSubmit}>
          <Stack>
            <Title order={2}>Scrapbook Store</Title>
            {error && <Alert color="red">{error}</Alert>}
            <TextInput
              label="E-mail"
              type="email"
              autoComplete="email"
              {...form.getInputProps('email')}
            />
            <PasswordInput
              label="Senha"
              autoComplete="current-password"
              {...form.getInputProps('password')}
            />
            <Button type="submit" loading={submitting}>
              Entrar
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  )
}
