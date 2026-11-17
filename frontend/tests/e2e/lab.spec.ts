import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, resetBackend, signInAs } from './helpers'

test.beforeEach(async ({ request }) => {
  await resetBackend(request)
})

test('LabProof: create, reopen, edit, report and delete an experiment', async ({ page }) => {
  await signInAs(page, 'Alice')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'LabProof' }).click()
  await expect(page).toHaveURL(/\/lab$/)
  await expect(page.getByRole('heading', { name: 'No experiments yet' })).toBeVisible()
  await page.getByRole('link', { name: 'New experiment' }).click()

  // Create
  await page.getByLabel('Experiment title').fill('E2E Ohm experiment')
  await page.getByLabel('Course').fill('Electrical Measurements')
  await page.getByLabel('Date').fill('2026-11-17')
  await page.getByLabel('Nominal resistance (Ω)').fill('100')
  const readings: [string, string][] = [['1', '10.1'], ['2', '19.8'], ['3', '30,2']]
  for (const [index, [voltage, current]] of readings.entries()) {
    await page.getByLabel(`Voltage, reading ${index + 1}`).fill(voltage)
    await page.getByLabel(`Current, reading ${index + 1}`).fill(current)
  }
  await expect(page.getByTestId('lab-verdict')).toContainText('PASS')
  await page.getByLabel('Conclusion (optional)').fill('Ohm’s law holds.')
  await page.getByRole('button', { name: 'Save experiment' }).click()
  await expect(page.getByText('Experiment created')).toBeVisible()
  await expect(page).toHaveURL(/\/lab\/[0-9a-f-]{36}$/)

  // Reopen: a full reload fetches the note from the backend and restores every field.
  await page.reload()
  await expect(page.getByLabel('Experiment title')).toHaveValue('E2E Ohm experiment')
  await expect(page.getByLabel('Course')).toHaveValue('Electrical Measurements')
  await expect(page.getByLabel('Date')).toHaveValue('2026-11-17')
  await expect(page.getByLabel('Current, reading 3')).toHaveValue('30.2')
  await expect(page.getByLabel('Conclusion (optional)')).toHaveValue('Ohm’s law holds.')

  // Edit (PUT with the version) and persist
  await page.getByRole('button', { name: 'Add reading' }).click()
  await page.getByLabel('Voltage, reading 4').fill('4')
  await page.getByLabel('Current, reading 4').fill('40.3')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Experiment saved')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Current, reading 4')).toHaveValue('40.3')

  // Report
  await page.getByRole('link', { name: 'Lab report' }).click()
  const report = page.getByRole('article', { name: 'Laboratory report' })
  await expect(report.getByRole('heading', { name: 'E2E Ohm experiment' })).toBeVisible()
  await expect(report.getByRole('row')).toHaveCount(5)
  await expect(report).toContainText('Ohm’s law holds.')
  await expect(report.getByRole('img', { name: /4 measured points/ })).toBeVisible()
  // Print CSS hides the app navigation and the toolbar.
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeHidden()
  await expect(report).toBeVisible()
  await page.emulateMedia({ media: 'screen' })

  // Delete
  await page.getByRole('link', { name: 'Back to the experiment' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete experiment' }).click()
  await expect(page).toHaveURL(/\/lab$/)
  await expect(page.getByRole('heading', { name: 'No experiments yet' })).toBeVisible()
})

test('LabProof experiments stay private to their owner', async ({ page }) => {
  await signInAs(page, 'Alice')
  await page.goto('/lab/new')
  await page.getByRole('button', { name: 'Fill example readings' }).click()
  await page.getByLabel('Experiment title').fill('Alice private experiment')
  await page.getByLabel('Course').fill('Physics')
  await page.getByRole('button', { name: 'Save experiment' }).click()
  await expect(page).toHaveURL(/\/lab\/[0-9a-f-]{36}$/)
  const url = page.url()

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Bob' }).click()
  await page.goto('/lab')
  await expect(page.getByRole('heading', { name: 'No experiments yet' })).toBeVisible()
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'This experiment belongs to another account' })).toBeVisible()
})

test('the LabProof editor and report fit a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await signInAs(page, 'Alice')
  await page.goto('/lab/new')
  await page.getByRole('button', { name: 'Fill example readings' }).click()
  await expect(page.getByTestId('lab-verdict')).toContainText('PASS')
  await expectNoHorizontalOverflow(page)
  await page.getByLabel('Experiment title').fill('Phone check')
  await page.getByLabel('Course').fill('Physics')
  await page.getByRole('button', { name: 'Save experiment' }).click()
  await page.getByRole('link', { name: 'Lab report' }).click()
  await expect(page.getByRole('article', { name: 'Laboratory report' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})
