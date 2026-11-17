import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { createNoteViaApi, resetBackend, signInAs } from './helpers'

/** Automated WCAG 2.x A/AA rules (axe-core). Automated rules catch only part of
 *  accessibility; keyboard paths and focus management are covered in notes.spec.ts. */
async function expectNoViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const summary = results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(' ')).slice(0, 5),
  }))
  expect(summary, `axe violations on ${label}`).toEqual([])
}

for (const theme of ['light', 'dark'] as const) {
  test(`no automated accessibility violations (${theme} theme)`, async ({ page, request }) => {
    await resetBackend(request)
    const noteId = await createNoteViaApi(request, 'alice', 'Accessibility check', 'Some content')
    // Reduced motion makes enter animations instant, so colours are measured in their final state.
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })

    await page.goto('/auth')
    await expect(page.getByRole('button', { name: 'Continue as Alice' })).toBeEnabled()
    await expectNoViolations(page, 'sign-in')

    await signInAs(page, 'Alice')
    await expectNoViolations(page, 'dashboard')

    await page.goto('/notes')
    await expect(page.getByTestId('notes-scope')).toBeVisible()
    await expectNoViolations(page, 'notes list')
    await page.getByRole('button', { name: 'Card view' }).click()
    await expectNoViolations(page, 'notes cards')
    await page.getByRole('button', { name: /Delete note/ }).first().click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expectNoViolations(page, 'delete dialog')
    await page.getByRole('button', { name: 'Cancel' }).click()

    await page.goto(`/notes/${noteId}`)
    await expect(page.getByLabel('Title')).toHaveValue('Accessibility check')
    await expectNoViolations(page, 'editor')
    await page.goto('/notes/new')
    await page.getByRole('button', { name: 'Create note' }).click()
    await expect(page.getByText('Enter a title.')).toBeVisible()
    await expectNoViolations(page, 'editor with validation error')

    await page.goto('/architecture')
    await page.getByRole('button', { name: 'Start' }).click()
    await expectNoViolations(page, 'architecture explorer')

    await page.goto('/api-explorer')
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByTestId('exchange-status')).toHaveText('200')
    await expectNoViolations(page, 'API explorer')

    await page.goto('/lab')
    await expect(page.getByRole('heading', { name: 'No experiments yet' })).toBeVisible()
    await expectNoViolations(page, 'lab home')
    await page.goto('/lab/new')
    await page.getByRole('button', { name: 'Save experiment' }).click()
    await expect(page.getByText('Enter an experiment title.')).toBeVisible()
    await expectNoViolations(page, 'lab editor with validation errors')
    await page.getByRole('button', { name: 'Fill example readings' }).click()
    await page.getByLabel('Experiment title').fill('Accessibility experiment')
    await page.getByLabel('Course').fill('Physics')
    await expect(page.getByTestId('lab-verdict')).toContainText('PASS')
    await expectNoViolations(page, 'lab editor with result')
    await page.getByRole('button', { name: 'Save experiment' }).click()
    await page.getByRole('link', { name: 'Lab report' }).click()
    await expect(page.getByRole('article', { name: 'Laboratory report' })).toBeVisible()
    await expectNoViolations(page, 'lab report')

    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expectNoViolations(page, 'settings')

    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/notes')
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expectNoViolations(page, 'mobile navigation')
  })
}
