import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { loadEnv } from 'vite'
import { ADMIN, login, openMenuLink } from './helpers'

// Conversa do cliente do seed (supabase/seed.sql).
const SEED_PHONE = '5511999990001'

// O webhook é quem liga o atendimento humano; aqui o teste liga direto, como
// administrador, para não depender da Edge Function.
async function startHandoff() {
  const env = loadEnv('development', process.cwd(), 'VITE_')
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  const { error: authError } = await client.auth.signInWithPassword(ADMIN)
  if (authError) throw authError
  const { data: customer, error } = await client
    .from('customers')
    .select('id')
    .eq('phone', SEED_PHONE)
    .single()
  if (error) throw error
  const { error: updateError } = await client
    .from('conversations')
    .update({ human_handoff: true })
    .eq('customer_id', customer.id)
  if (updateError) throw updateError
}

test('reativa o bot de uma conversa em atendimento humano', async ({ page }) => {
  await startHandoff()
  await login(page)
  await openMenuLink(page, 'Atendimento')
  await expect(page.getByRole('heading', { name: 'Atendimento' })).toBeVisible()

  const row = page.getByTestId('handoff-row').filter({ hasText: SEED_PHONE })
  await expect(row).toContainText('Cliente Teste')
  await row.getByRole('button', { name: 'Reativar bot' }).click()

  await expect(page.getByText('Bot reativado.')).toBeVisible()
  await expect(row).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('handoff-row').filter({ hasText: SEED_PHONE })).toHaveCount(0)
})
