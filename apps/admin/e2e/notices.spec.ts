import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { loadEnv } from 'vite'
import { ADMIN, login } from './helpers'

// Conversa do cliente do seed (supabase/seed.sql).
const SEED_PHONE = '5511999990001'

async function adminClient() {
  const env = loadEnv('development', process.cwd(), 'VITE_')
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  const { error } = await client.auth.signInWithPassword(ADMIN)
  if (error) throw error
  return client
}

// Como no teste de atendimento, o teste liga a transferência direto, no lugar
// do webhook.
async function setSeedHandoff(value: boolean) {
  const client = await adminClient()
  const { data: customer, error } = await client.from('customers').select('id').eq('phone', SEED_PHONE).single()
  if (error) throw error
  const { error: updateError } = await client
    .from('conversations')
    .update({ human_handoff: value })
    .eq('customer_id', customer.id)
  if (updateError) throw updateError
}

async function countHandoffs() {
  const client = await adminClient()
  const { count, error } = await client
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('human_handoff', true)
  if (error) throw error
  return count ?? 0
}

test('contador de atendimento aparece no menu sem recarregar a página', async ({ page }) => {
  await setSeedHandoff(false)
  const before = await countHandoffs()

  await login(page)
  const burger = page.getByRole('button', { name: 'Menu' })
  if (await burger.isVisible()) await burger.click()
  const link = page.getByRole('link', { name: /Atendimento/ })
  await expect(link).toHaveText(before ? `Atendimento${before}` : 'Atendimento')

  try {
    await setSeedHandoff(true)
    await expect(link).toHaveText(`Atendimento${before + 1}`, { timeout: 10_000 })
  } finally {
    await setSeedHandoff(false)
  }
  await expect(link).toHaveText(before ? `Atendimento${before}` : 'Atendimento', { timeout: 10_000 })
})
