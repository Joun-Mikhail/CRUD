import { expect, type APIRequestContext, type Page } from '@playwright/test'

export const API = 'http://127.0.0.1:8787'

export async function resetBackend(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${API}/__demo/reset`)
  expect(response.ok()).toBeTruthy()
}

export async function createNoteViaApi(
  request: APIRequestContext,
  user: string,
  title: string,
  content = 'created by the test setup',
): Promise<string> {
  const response = await request.post(`${API}/notes`, {
    headers: { Authorization: `Demo ${user}` },
    data: { title, content },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).data.noteId as string
}

export async function signInAs(page: Page, name: 'Alice' | 'Bob' | 'Carol'): Promise<void> {
  await page.goto('/auth')
  await page.getByRole('button', { name: `Continue as ${name}` }).click()
  await expect(page.getByRole('heading', { name: `Welcome, ${name}` })).toBeVisible()
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(0)
}
