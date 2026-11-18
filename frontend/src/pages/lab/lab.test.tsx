import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { toNoteInput, type LabExperiment } from '../../lab/experimentFormat'
import { ApiError } from '../../services/apiClient'
import { fakeNotesApi, makeNote, renderApp } from '../../test/helpers'

const LAB_ID = '33333333-3333-4333-8333-333333333333'

const SAVED: LabExperiment = {
  title: 'Week 3 — Ohm’s law',
  course: 'Electrical Measurements',
  date: '2026-11-10',
  nominalOhms: '100',
  tolerancePercent: 5,
  readings: [
    { voltage: '1', currentMa: '10' },
    { voltage: '2', currentMa: '20' },
    { voltage: '3', currentMa: '30' },
  ],
  observations: 'Room 21 °C.',
  conclusion: 'Ohm’s law confirmed.',
}

function labNote(experiment: LabExperiment = SAVED, version = 1) {
  const input = toNoteInput(experiment)
  if (!input) throw new Error('test experiment must be valid')
  return makeNote({ noteId: LAB_ID, ...input, version })
}

async function fillNewExperiment() {
  await userEvent.type(screen.getByLabelText('Experiment title'), 'My first lab')
  await userEvent.type(screen.getByLabelText('Course'), 'Physics 1')
  await userEvent.type(screen.getByLabelText('Nominal resistance (Ω)'), '220')
  const readings: [string, string][] = [['1', '4.6'], ['2', '9,1'], ['3', '13.5']]
  for (const [index, [voltage, current]] of readings.entries()) {
    await userEvent.type(screen.getByLabelText(`Voltage, reading ${index + 1}`), voltage)
    await userEvent.type(screen.getByLabelText(`Current, reading ${index + 1}`), current)
  }
}

describe('LabProof: entry points', () => {
  it('is reachable from the navigation and the dashboard banner', async () => {
    renderApp({ path: '/' })
    await screen.findByRole('heading', { name: 'Welcome, Alice' })
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'LabProof' })).toHaveAttribute('href', '/lab')
    await userEvent.click(screen.getByRole('link', { name: 'New experiment' }))
    expect(await screen.findByRole('heading', { name: 'New experiment', level: 1 })).toBeInTheDocument()
  })

  it('lists only experiments, with their verdict, and shows an empty state otherwise', async () => {
    renderApp({ path: '/lab', notesApi: fakeNotesApi([labNote(), makeNote({ title: 'Shopping list' })]) })
    const card = (await screen.findByRole('link', { name: SAVED.title })).closest('li')
    expect(card).toHaveTextContent('PASS')
    expect(card).toHaveTextContent('Electrical Measurements')
    expect(screen.queryByText('Shopping list')).not.toBeInTheDocument()
  })

  it('shows an empty state when there are no experiments yet', async () => {
    renderApp({ path: '/lab', notesApi: fakeNotesApi([makeNote()]) })
    expect(await screen.findByRole('heading', { name: 'No experiments yet' })).toBeInTheDocument()
  })

  it('opens experiments from the notes list in the lab, with a readable preview', async () => {
    renderApp({ path: '/notes', notesApi: fakeNotesApi([labNote()]) })
    const link = await screen.findByRole('link', { name: SAVED.title })
    expect(link).toHaveAttribute('href', `/lab/${LAB_ID}`)
    expect(screen.getByText(/LabProof experiment · Electrical Measurements/)).toBeInTheDocument()
  })
})

describe('LabProof: create', () => {
  it('validates everything before sending anything', async () => {
    const api = fakeNotesApi()
    renderApp({ path: '/lab/new', notesApi: api })
    await screen.findByRole('heading', { name: 'New experiment', level: 1 })
    await userEvent.type(screen.getByLabelText('Voltage, reading 1'), 'abc')
    await userEvent.click(screen.getByRole('button', { name: 'Save experiment' }))

    expect(screen.getByText('Some fields need attention before the experiment can be saved.')).toBeInTheDocument()
    expect(screen.getByText('Enter an experiment title.')).toBeInTheDocument()
    expect(screen.getByText('Enter the course name.')).toBeInTheDocument()
    expect(screen.getByText('Enter the resistor’s printed value.')).toBeInTheDocument()
    expect(screen.getByText('Voltage must be a number above 0.')).toBeInTheDocument()
    expect(api.create).not.toHaveBeenCalled()
  })

  it('shows R = V / I live and saves the full experiment through POST /notes', async () => {
    const api = fakeNotesApi()
    const { router } = renderApp({ path: '/lab/new', notesApi: api })
    await screen.findByRole('heading', { name: 'New experiment', level: 1 })
    await fillNewExperiment()
    expect(screen.getByRole('cell', { name: '217 Ω' })).toBeInTheDocument() // 1 V / 4.6 mA
    expect(screen.getByTestId('lab-verdict')).toHaveTextContent('PASS')
    expect(screen.getByRole('img', { name: /3 measured points/ })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Conclusion (optional)'), 'Linear, as expected.')
    await userEvent.click(screen.getByRole('button', { name: 'Save experiment' }))

    const sent = api.create.mock.lastCall?.[0]
    expect(sent?.title).toBe('My first lab')
    // Only title and content are sent: the client never sets userId, noteId, timestamps or version.
    expect(Object.keys(sent ?? {}).sort()).toEqual(['content', 'title'])
    expect(JSON.parse(sent?.content ?? '{}')).toMatchObject({
      format: 'labproof/ohms-law',
      course: 'Physics 1',
      nominalOhms: 220,
      readings: [{ voltageV: 1, currentMa: 4.6 }, { voltageV: 2, currentMa: 9.1 }, { voltageV: 3, currentMa: 13.5 }],
      conclusion: 'Linear, as expected.',
    })
    expect(await screen.findByText('Experiment created')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/lab/22222222-2222-4222-8222-222222222222'))
    // The reopened page shows the stored data again.
    expect(await screen.findByLabelText('Course')).toHaveValue('Physics 1')
  })
})

describe('LabProof: reopen, edit, delete', () => {
  it('restores every field and reading from the stored note', async () => {
    renderApp({ path: `/lab/${LAB_ID}`, notesApi: fakeNotesApi([labNote()]) })
    expect(await screen.findByLabelText('Experiment title')).toHaveValue(SAVED.title)
    expect(screen.getByLabelText('Course')).toHaveValue(SAVED.course)
    expect(screen.getByLabelText('Date')).toHaveValue(SAVED.date)
    expect(screen.getByLabelText('Nominal resistance (Ω)')).toHaveValue('100')
    expect(screen.getByLabelText('Voltage, reading 3')).toHaveValue('3')
    expect(screen.getByLabelText('Current, reading 3')).toHaveValue('30')
    expect(screen.getByLabelText('Observations (optional)')).toHaveValue(SAVED.observations)
    expect(screen.getByLabelText('Conclusion (optional)')).toHaveValue(SAVED.conclusion)
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
  })

  it('saves edits with PUT /notes/{id} and the optimistic-lock version', async () => {
    const api = fakeNotesApi([labNote(SAVED, 4)])
    renderApp({ path: `/lab/${LAB_ID}`, notesApi: api })
    const current = await screen.findByLabelText('Current, reading 2')
    await userEvent.clear(current)
    await userEvent.type(current, '19')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Lab report' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(api.update).toHaveBeenCalledWith(LAB_ID, expect.objectContaining({ version: 4 }))
    expect(JSON.parse(api.update.mock.lastCall?.[1].content ?? '{}').readings[1]).toEqual({ voltageV: 2, currentMa: 19 })
    expect(await screen.findByText('Experiment saved')).toBeInTheDocument()
    expect(screen.getByText('All changes saved')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lab report' })).toHaveAttribute('href', `/lab/${LAB_ID}/report`)
  })

  it('does not overwrite a newer version (409) and offers to reload', async () => {
    const api = fakeNotesApi([labNote()])
    api.update.mockRejectedValueOnce(
      new ApiError({ kind: 'http', status: 409, code: 'VERSION_CONFLICT', message: 'stale', requestId: 'r' }),
    )
    renderApp({ path: `/lab/${LAB_ID}`, notesApi: api })
    await userEvent.type(await screen.findByLabelText('Conclusion (optional)'), ' Extra.')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText(/changed somewhere else/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /load the latest version/ }))
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
  })

  it('deletes with DELETE /notes/{id} after confirmation', async () => {
    const api = fakeNotesApi([labNote()])
    const { router } = renderApp({ path: `/lab/${LAB_ID}`, notesApi: api })
    await screen.findByLabelText('Experiment title')
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete experiment' }))
    expect(api.remove).toHaveBeenCalledWith(LAB_ID)
    await waitFor(() => expect(router.state.location.pathname).toBe('/lab'))
  })

  it('sends ordinary notes to the note editor instead of misreading them', async () => {
    renderApp({ path: `/lab/${LAB_ID}`, notesApi: fakeNotesApi([makeNote({ noteId: LAB_ID, content: 'plain text' })]) })
    expect(await screen.findByText('This note is not a LabProof experiment')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in the note editor' })).toHaveAttribute('href', `/notes/${LAB_ID}`)
  })

  it('shows the 403 message for another user’s experiment', async () => {
    const api = fakeNotesApi()
    api.get.mockRejectedValueOnce(
      new ApiError({ kind: 'http', status: 403, code: 'FORBIDDEN', message: 'no', requestId: 'r' }),
    )
    renderApp({ path: `/lab/${LAB_ID}`, notesApi: api })
    expect(await screen.findByRole('heading', { name: 'This experiment belongs to another account' })).toBeInTheDocument()
  })
})

describe('LabProof: printable report', () => {
  it('contains the details, table, calculations, graph and conclusion, and prints', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    renderApp({ path: `/lab/${LAB_ID}/report`, notesApi: fakeNotesApi([labNote()]) })
    const report = await screen.findByRole('article', { name: 'Laboratory report' })
    expect(within(report).getByRole('heading', { name: SAVED.title, level: 1 })).toBeInTheDocument()
    expect(report).toHaveTextContent('Electrical Measurements')
    expect(report).toHaveTextContent('Alice')
    expect(within(report).getAllByRole('row')).toHaveLength(4) // header + 3 readings
    expect(screen.getByTestId('report-calculations')).toHaveTextContent('R₁ = V₁ / (I₁ / 1000) = 1 V / (10 mA / 1000) = 100 Ω')
    expect(screen.getByTestId('report-calculations')).toHaveTextContent('= 0.0 %')
    expect(within(report).getByRole('img', { name: /Graph of voltage against current/ })).toBeInTheDocument()
    expect(report).toHaveTextContent('Ohm’s law confirmed.')
    // The method is described as the standard procedure, not as what the student did.
    expect(report).toHaveTextContent('The standard procedure for this experiment')
    expect(report).not.toHaveTextContent('were connected in series')
    expect(report).toHaveTextContent('entered by the student, who is responsible for them')
    expect(screen.queryByTestId('report-example-notice')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }))
    expect(print).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('warns before printing an incomplete report, but still lets the student print', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const unfinished = { ...SAVED, observations: '', conclusion: '' }
    renderApp({ path: `/lab/${LAB_ID}/report`, notesApi: fakeNotesApi([labNote(unfinished)]) })
    await screen.findByRole('article', { name: 'Laboratory report' })
    await userEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }))
    expect(print).not.toHaveBeenCalled()
    const warning = screen.getByRole('alert')
    expect(warning).toHaveTextContent('This report has no observations or conclusion yet.')
    expect(within(warning).getByRole('link', { name: 'Back to the experiment' })).toHaveAttribute('href', `/lab/${LAB_ID}`)
    await userEvent.click(within(warning).getByRole('button', { name: 'Print anyway' }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('names only the missing part', async () => {
    vi.spyOn(window, 'print').mockImplementation(() => undefined)
    renderApp({ path: `/lab/${LAB_ID}/report`, notesApi: fakeNotesApi([labNote({ ...SAVED, conclusion: '' })]) })
    await screen.findByRole('article', { name: 'Laboratory report' })
    await userEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }))
    expect(screen.getByRole('alert')).toHaveTextContent('This report has no conclusion yet.')
  })

  it('marks the built-in example data as illustrative on the printed report', async () => {
    const example: LabExperiment = {
      ...SAVED,
      nominalOhms: '220',
      readings: [
        { voltage: '1.0', currentMa: '4.6' },
        { voltage: '2.0', currentMa: '9.1' },
        { voltage: '3.0', currentMa: '13.5' },
        { voltage: '4.0', currentMa: '18.3' },
        { voltage: '5.0', currentMa: '22.6' },
      ],
    }
    renderApp({ path: `/lab/${LAB_ID}/report`, notesApi: fakeNotesApi([labNote(example)]) })
    expect(await screen.findByTestId('report-example-notice')).toHaveTextContent('not laboratory measurements')
  })
})

describe('LabProof: illustrative example and failures', () => {
  it('labels the example readings as illustrative in the editor', async () => {
    renderApp({ path: '/lab/new' })
    await screen.findByRole('heading', { name: 'New experiment', level: 1 })
    expect(screen.queryByTestId('example-notice')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fill illustrative example' }))
    expect(screen.getByTestId('example-notice')).toHaveTextContent('they are not laboratory measurements')
    // Changing one value makes it the student's own data, and the notice disappears.
    const current = screen.getByLabelText('Current, reading 1')
    await userEvent.clear(current)
    await userEvent.type(current, '4.5')
    expect(screen.queryByTestId('example-notice')).not.toBeInTheDocument()
  })

  it('keeps the entries and explains when the API cannot be reached', async () => {
    const api = fakeNotesApi()
    api.create.mockRejectedValueOnce(
      new ApiError({
        kind: 'network',
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'The API could not be reached. Check your connection and that the backend is running.',
        requestId: null,
      }),
    )
    renderApp({ path: '/lab/new', notesApi: api })
    await screen.findByRole('heading', { name: 'New experiment', level: 1 })
    await fillNewExperiment()
    await userEvent.click(screen.getByRole('button', { name: 'Save experiment' }))
    expect(await screen.findByText(/Could not save: The API could not be reached/)).toHaveTextContent(
      'Your entries are still here',
    )
    expect(screen.getByLabelText('Experiment title')).toHaveValue('My first lab')
  })
})
