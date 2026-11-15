import { expect, type Page } from '@playwright/test'

// Usuário administrativo de supabase/seed.sql.
export const ADMIN = { email: 'admin@scrapbook.local', password: 'admin123456' }

// PNG 1x1 válido, para o upload sem versionar arquivo binário.
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

export async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(ADMIN.email)
  await page.getByLabel('Senha').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Produtos' })).toBeVisible()
}

// No celular a navegação fica atrás do botão de menu.
export async function openMenuLink(page: Page, name: string) {
  const burger = page.getByRole('button', { name: 'Menu' })
  if (await burger.isVisible()) await burger.click()
  await page.getByRole('link', { name }).click()
}

export async function selectOption(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option }).click()
}

export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1000)}`
}
