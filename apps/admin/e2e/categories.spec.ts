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

test('renomeia categoria', async ({ page }) => {
  const name = uniqueName('Categoria antiga')
  const newName = uniqueName('Categoria nova')
  await page.getByLabel('Nova categoria').fill(name)
  await page.getByRole('button', { name: 'Adicionar' }).click()

  const row = page.getByTestId('category-row').filter({ hasText: name })
  await row.getByRole('button', { name: 'Renomear' }).click()
  await page.getByLabel('Nome da categoria').fill(newName)
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByTestId('category-row').filter({ hasText: newName })).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('category-row').filter({ hasText: newName })).toBeVisible()
  await expect(page.getByTestId('category-row').filter({ hasText: name })).toHaveCount(0)
})

test('recusa renomear para nome repetido', async ({ page }) => {
  const name = uniqueName('Categoria repetida')
  await page.getByLabel('Nova categoria').fill(name)
  await page.getByRole('button', { name: 'Adicionar' }).click()

  await page.getByTestId('category-row').filter({ hasText: name }).getByRole('button', { name: 'Renomear' }).click()
  await page.getByLabel('Nome da categoria').fill('Álbuns')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Já existe uma categoria com esse nome')).toBeVisible()
})

test('recusa categoria com nome repetido', async ({ page }) => {
  await page.getByLabel('Nova categoria').fill('Álbuns')
  await page.getByRole('button', { name: 'Adicionar' }).click()
  await expect(page.getByText('Já existe uma categoria com esse nome')).toBeVisible()
})
