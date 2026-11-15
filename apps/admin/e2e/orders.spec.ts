import { expect, test } from '@playwright/test'
import { login, openMenuLink, selectOption } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
  await openMenuLink(page, 'Pedidos')
  await expect(page.getByRole('heading', { name: 'Pedidos' })).toBeVisible()
})

test('lista pedidos e mostra o detalhe', async ({ page }) => {
  const row = page.getByTestId('order-row').filter({ hasText: 'Cliente Teste' }).first()
  await expect(row).toContainText('R$ 349,70')
  await row.click()

  await expect(page.getByText('5511999990001')).toBeVisible()
  await expect(page.getByRole('row', { name: /Álbum de casamento\s+1\s+R\$ 189,90/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /Caderno de receitas\s+2\s+R\$ 79,90\s+R\$ 159,80/ })).toBeVisible()
  await expect(page.getByTestId('status-history')).toContainText('Recebido')
})

test('altera o status e registra no histórico', async ({ page }) => {
  await page.getByTestId('order-row').filter({ hasText: 'Cliente Teste' }).first().click()

  const statusInput = page.getByRole('combobox', { name: 'Status' })
  const current = await statusInput.inputValue()
  const target = current === 'Em análise' ? 'Aprovado' : 'Em análise'
  const history = page.getByTestId('status-history').locator('.mantine-Timeline-item')
  const entriesBefore = await history.count()

  await selectOption(page, 'Status', target)
  await expect(page.getByText('Status atualizado.')).toBeVisible()
  await expect(history).toHaveCount(entriesBefore + 1)
  await expect(history.last()).toContainText(target)

  await page.reload()
  await expect(statusInput).toHaveValue(target)
})
