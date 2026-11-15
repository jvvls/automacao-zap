import { expect, test } from '@playwright/test'
import { login, openMenuLink, uniqueName } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
  await openMenuLink(page, 'Categorias')
  await expect(page.getByRole('heading', { name: 'Categorias' })).toBeVisible()
})

test('cadastra e desativa categoria', async ({ page }) => {
  const name = uniqueName('Categoria e2e')
  await page.getByLabel('Nova categoria').fill(name)
  await page.getByRole('button', { name: 'Adicionar' }).click()

  const row = page.getByTestId('category-row').filter({ hasText: name })
  await expect(row.getByRole('switch')).toBeChecked()
  await row.getByRole('switch').click({ force: true })
  await expect(row).toContainText('Inativa')

  await page.reload()
  await expect(page.getByTestId('category-row').filter({ hasText: name }).getByRole('switch')).not.toBeChecked()
})

test('recusa categoria com nome repetido', async ({ page }) => {
  await page.getByLabel('Nova categoria').fill('Álbuns')
  await page.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByText('Já existe uma categoria com esse nome')).toBeVisible()
})
