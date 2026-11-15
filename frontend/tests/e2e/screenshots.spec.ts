import { expect, test } from '@playwright/test'
import { createNoteViaApi, resetBackend, signInAs } from './helpers'

const OUT = '../evidence/screenshots'

test('capture screenshots of the Local Demo', async ({ page, request }) => {
  await resetBackend(request)
  await createNoteViaApi(request, 'alice', 'Defence preparation', 'Questions to rehearse:\n- Why 403 and not 404?\n- Why a GSI?')
  const noteId = await createNoteViaApi(request, 'alice', 'DynamoDB design', 'Partition key noteId; GSI byUser (userId, createdAt#noteId).')

  await page.setViewportSize({ width: 1280, height: 860 })
  await page.goto('/auth')
  await expect(page.getByRole('button', { name: 'Continue as Alice' })).toBeEnabled()
  await page.screenshot({ path: `${OUT}/01-auth-demo-1280.png` })

  await signInAs(page, 'Alice')
  await page.screenshot({ path: `${OUT}/02-dashboard-1280.png` })
  await page.goto('/notes')
  await expect(page.getByTestId('notes-scope')).toBeVisible()
  await page.screenshot({ path: `${OUT}/03-notes-1280.png` })
  await page.goto(`/notes/${noteId}`)
  await expect(page.getByLabel('Title')).toHaveValue('DynamoDB design')
  await page.screenshot({ path: `${OUT}/04-editor-1280.png` })
  await page.setViewportSize({ width: 1280, height: 1250 })
  await page.goto('/architecture')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Next step' }).click()
  await page.getByRole('button', { name: 'Next step' }).click()
  await page.screenshot({ path: `${OUT}/05-architecture-1280.png` })
  await page.goto('/api-explorer')
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByTestId('exchange-status')).toHaveText('200')
  await page.screenshot({ path: `${OUT}/06-api-explorer-1280.png` })
  await page.goto('/settings')
  await page.screenshot({ path: `${OUT}/07-settings-1280.png` })
  await page.getByLabel('Dark').check()
  await page.goto('/notes')
  await expect(page.getByTestId('notes-scope')).toBeVisible()
  await page.screenshot({ path: `${OUT}/08-notes-dark-1280.png` })

  await page.setViewportSize({ width: 375, height: 760 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome, Alice' })).toBeVisible()
  await page.screenshot({ path: `${OUT}/09-dashboard-375.png` })
  await page.goto('/notes')
  await expect(page.getByTestId('notes-scope')).toBeVisible()
  await page.screenshot({ path: `${OUT}/10-notes-375.png` })
})
