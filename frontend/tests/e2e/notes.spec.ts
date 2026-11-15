import { expect, test } from '@playwright/test'
import { createNoteViaApi, expectNoHorizontalOverflow, resetBackend, signInAs } from './helpers'

test.beforeEach(async ({ request }) => {
  await resetBackend(request)
})

test('Local Demo is clearly labelled and protected routes require sign-in', async ({ page }) => {
  await page.goto('/notes')
  await expect(page).toHaveURL(/\/auth$/)
  await expect(page.getByTestId('demo-banner')).toContainText('authentication is simulated')
  await expect(page.getByRole('heading', { name: 'Choose a demo identity' })).toBeVisible()
  // After signing in, the user is returned to the page they originally asked for.
  await page.getByRole('button', { name: 'Continue as Alice' }).click()
  await expect(page).toHaveURL(/\/notes$/)
  await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible()
  await expect(page.getByTestId('demo-banner')).toBeVisible()
  await expect(page.getByText('Local Demo', { exact: true }).first()).toBeVisible()
})

test('create, open, edit and delete a note', async ({ page }) => {
  await signInAs(page, 'Alice')
  await page.getByRole('link', { name: 'New note' }).click()
  await page.getByLabel('Title').fill('E2E note')
  await page.getByLabel('Content').fill('written by Playwright')
  await page.getByRole('button', { name: 'Create note' }).click()
  await expect(page.getByText('Note created')).toBeVisible()
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/)

  await page.getByRole('link', { name: 'All notes' }).click()
  await page.getByRole('link', { name: 'E2E note' }).click()
  await expect(page.getByLabel('Content')).toHaveValue('written by Playwright')

  await page.getByLabel('Title').fill('E2E note (edited)')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Note saved')).toBeVisible()
  await expect(page.getByText('All changes saved')).toBeVisible()

  // The change is persisted by the backend, not just held in the page.
  await page.reload()
  await expect(page.getByLabel('Title')).toHaveValue('E2E note (edited)')

  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('E2E note (edited)')
  await dialog.getByRole('button', { name: 'Delete note' }).click()
  await expect(page).toHaveURL(/\/notes$/)
  await expect(page.getByRole('link', { name: 'E2E note (edited)' })).toHaveCount(0)
})

test('validation errors are shown and nothing is saved', async ({ page }) => {
  await signInAs(page, 'Alice')
  await page.goto('/notes/new')
  await page.getByRole('button', { name: 'Create note' }).click()
  await expect(page.getByText('Enter a title.')).toBeVisible()
  await expect(page.getByLabel('Title')).toHaveAttribute('aria-invalid', 'true')
  await expect(page).toHaveURL(/\/notes\/new$/)
})

test('users are isolated from each other', async ({ page, request }) => {
  const alicesNote = await createNoteViaApi(request, 'alice', 'Alice only')
  await signInAs(page, 'Bob')
  await page.goto('/notes')
  await expect(page.getByRole('link', { name: "Bob's private note" })).toBeVisible()
  await expect(page.getByText('Alice only')).toHaveCount(0)

  await page.goto(`/notes/${alicesNote}`)
  await expect(page.getByRole('heading', { name: 'This note belongs to another account' })).toBeVisible()
  await expect(page.getByText('created by the test setup')).toHaveCount(0)

  // Switching identity must not carry any note over.
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Alice' }).click()
  await page.goto('/notes')
  await expect(page.getByRole('link', { name: 'Alice only' })).toBeVisible()
  await expect(page.getByText("Bob's private note")).toHaveCount(0)
})

test('pagination loads further pages on demand', async ({ page, request }) => {
  for (let index = 1; index <= 23; index += 1) {
    await createNoteViaApi(request, 'carol', `Paged note ${String(index).padStart(2, '0')}`)
  }
  await signInAs(page, 'Carol')
  await page.goto('/notes')
  await expect(page.getByTestId('notes-scope')).toContainText('20 notes loaded')
  await expect(page.getByTestId('notes-scope')).toContainText('more exist on the server')
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect(page.getByTestId('notes-scope')).toContainText('23 notes loaded')
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0)

  await page.getByRole('searchbox').fill('Paged note 07')
  await expect(page.getByTestId('notes-scope')).toContainText('1 of 23 loaded notes match')
})

test('unsaved changes are guarded', async ({ page }) => {
  await signInAs(page, 'Alice')
  await page.goto('/notes/new')
  await page.getByLabel('Title').fill('Draft')
  await page.getByRole('link', { name: 'Dashboard' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('Discard unsaved changes?')
  await dialog.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByLabel('Title')).toHaveValue('Draft')
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard changes' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome, Alice' })).toBeVisible()
})

test('API explorer shows real status codes and durations', async ({ page }) => {
  await signInAs(page, 'Alice')
  await page.goto('/api-explorer')
  await expect(page.getByLabel('Request preview')).toContainText('Authorization: Demo alice')
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByTestId('exchange-status')).toHaveText('200')
  await expect(page.getByTestId('exchange-duration')).toContainText(/\d+ ms/)
  await expect(page.getByLabel('Response body')).toContainText('"nextToken"')

  await page.getByLabel('Send without the Authorization header').check()
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByTestId('exchange-status')).toHaveText('401')
  await expect(page.getByLabel('Response body')).toContainText('UNAUTHORIZED')
  // A demonstrated 401 must not sign the user out.
  await expect(page.getByRole('button', { name: 'Alice account menu' })).toBeVisible()
})

test('architecture explorer works with the keyboard', async ({ page }) => {
  await signInAs(page, 'Alice')
  await page.goto('/architecture')
  const dynamo = page.getByRole('button', { name: /Amazon DynamoDB/ })
  await dynamo.focus()
  await page.keyboard.press('Enter')
  await expect(dynamo).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('component-detail')).toContainText('byUser')

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByTestId('walkthrough-step')).toContainText('Step 1 of 9')
  await page.getByRole('button', { name: 'Next step' }).click()
  await page.getByRole('button', { name: 'Next step' }).click()
  await expect(page.getByTestId('walkthrough-step')).toContainText('Authenticate')
  await expect(page.getByRole('button', { name: /API Gateway/ })).toHaveAttribute('aria-pressed', 'true')
})

for (const width of [375, 768, 1280, 1920]) {
  test(`no horizontal overflow at ${width}px`, async ({ page, request }) => {
    await createNoteViaApi(request, 'alice', 'A note with a very long title '.repeat(6).trim(), 'word '.repeat(300))
    await page.setViewportSize({ width, height: 900 })
    await signInAs(page, 'Alice')
    for (const path of ['/', '/notes', '/notes/new', '/architecture', '/api-explorer', '/settings']) {
      await page.goto(path)
      await expect(page.locator('main h1')).toBeVisible()
      await expectNoHorizontalOverflow(page)
    }
    if (width < 1024) {
      await page.getByRole('button', { name: 'Open navigation' }).click()
      await page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Notes' }).click()
      await expect(page).toHaveURL(/\/notes$/)
    }
  })
}
