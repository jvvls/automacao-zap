import { expect, test, type Page } from '@playwright/test'
import { login, PNG_1PX, selectOption, uniqueName } from './helpers'

async function fillProduct(page: Page, name: string) {
  await page.getByLabel('Nome').fill(name)
  await selectOption(page, 'Categoria', 'Álbuns')
  await page.getByLabel('Descrição').fill('Criado pelo teste e2e.')
  await page.getByLabel('Preço').fill('49,90')
  await page.getByLabel('Peso (kg)').fill('0,5')
  await page.getByLabel('Largura (cm)').fill('20')
  await page.getByLabel('Altura (cm)').fill('3')
  await page.getByLabel('Comprimento (cm)').fill('25')
}

function productRow(page: Page, name: string) {
  return page.getByTestId('product-row').filter({ hasText: name })
}

async function createProduct(page: Page, name: string) {
  await page.getByRole('link', { name: 'Novo produto' }).click()
  await fillProduct(page, name)
  await page.locator('input[type="file"]').setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: PNG_1PX,
  })
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page).toHaveURL(/\/produtos$/)
  await expect(productRow(page, name)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('cadastra produto válido com foto', async ({ page }) => {
  const name = uniqueName('Produto e2e')
  await createProduct(page, name)

  const row = productRow(page, name)
  await expect(row).toContainText('R$ 49,90')
  const image = row.locator('img')
  await expect(image).toHaveAttribute('src', /\/storage\/v1\/object\/public\/product-images\//)
  // A URL pública precisa servir a imagem sem autenticação (o WhatsApp usa).
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
})

test('bloqueia dados logísticos inválidos', async ({ page }) => {
  await page.getByRole('link', { name: 'Novo produto' }).click()
  await fillProduct(page, uniqueName('Produto inválido'))
  await page.getByLabel('Peso (kg)').fill('')
  await page.getByLabel('Largura (cm)').fill('0')
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page.getByText('Campo obrigatório')).toBeVisible()
  await expect(page.getByText('Deve ser maior que zero')).toBeVisible()
  await expect(page).toHaveURL(/\/produtos\/novo$/)
})

test('edita produto', async ({ page }) => {
  const name = uniqueName('Produto editável')
  await createProduct(page, name)

  await productRow(page, name).getByRole('link', { name }).click()
  await expect(page.getByRole('heading', { name: 'Editar produto' })).toBeVisible()
  const oldImageUrl = await page.getByAltText('Foto atual').getAttribute('src')
  await page.getByLabel('Preço').fill('59,90')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'nova.png',
    mimeType: 'image/png',
    buffer: PNG_1PX,
  })
  await page.getByRole('button', { name: 'Salvar' }).click()

  await expect(page).toHaveURL(/\/produtos$/)
  const row = productRow(page, name)
  await expect(row).toContainText('R$ 59,90')
  await expect(row.locator('img')).not.toHaveAttribute('src', oldImageUrl!)
  // A foto substituída é removida do Storage.
  expect((await page.request.get(oldImageUrl!)).ok()).toBe(false)
})

test('desativa produto', async ({ page }) => {
  const name = uniqueName('Produto desativável')
  await createProduct(page, name)

  const toggle = productRow(page, name).getByRole('switch')
  await expect(toggle).toBeChecked()
  await toggle.click({ force: true })
  await expect(productRow(page, name)).toContainText('Inativo')

  await page.reload()
  await expect(productRow(page, name).getByRole('switch')).not.toBeChecked()
})
