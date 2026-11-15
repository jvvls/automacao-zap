import { expect, test } from '@playwright/test'
import { ADMIN, login } from './helpers'

test('rota protegida redireciona para o login', async ({ page }) => {
  await page.goto('/pedidos')
  await expect(page).toHaveURL(/\/login$/)
})

test('senha errada mostra erro', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(ADMIN.email)
  await page.getByLabel('Senha').fill('senha-errada')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByText('E-mail ou senha inválidos.')).toBeVisible()
})

test('login e logout', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/produtos')
  await expect(page).toHaveURL(/\/login$/)
})
