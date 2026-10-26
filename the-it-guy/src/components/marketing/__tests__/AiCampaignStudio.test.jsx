// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AiCampaignAssistant from '../AiCampaignAssistant'

const runtime = vi.hoisted(() => ({ action: vi.fn(), generate: vi.fn(), events: vi.fn(), enabled: true }))
vi.mock('../../../services/aiCampaignService', () => ({ aiCampaignAction: runtime.action, aiCampaignDocument: () => ({ version: 1, blocks: [] }) }))
vi.mock('../../../services/justListedCampaignService', () => ({ loadPropertyShowDays: runtime.events }))
vi.mock('../../../lib/featureFlags', () => ({ get SHOW_CAMPAIGN_WORKSPACE() { return runtime.enabled } }))
const copy = { subject: 'Welcome home', previewText: 'Take a closer look', heading: 'Your next chapter', intro: 'Arrange a personal viewing.', cta: 'Explore this home' }
const draft = { id: 'campaign', name: 'A property story', subject: '', previewText: '', subscriptionTypeId: 'permission', contentJson: { version: 1, blocks: [] } }

it('previews later manual wording from the saved document without paid regeneration', async () => {
  mount({ agencyName: 'Oak agency', draft: { ...structuredClone(draft), subject: 'Saved subject', previewText: 'Saved preview', contentJson: { version: 1, ai_campaign: { listing_id: 'listing', objective: 'new_listing', language: 'en', copy }, blocks: [{ id: 'heading', type: 'header', text: 'Oak agency' }, { id: 'manual', type: 'text', style: 'body', text: 'Manual wording added later.' }, { id: 'footer', type: 'footer' }] } } })
  const preview = await screen.findByTitle('Saved property email preview')
  expect(preview.getAttribute('srcdoc')).toContain('Manual wording added later.')
  expect(preview.getAttribute('sandbox')).toBe('')
  expect(screen.getByText('Saved subject')).toBeTruthy()
  expect(runtime.generate).not.toHaveBeenCalled()
})
const value = (nextCopy = copy, extras = {}) => ({ copy: { ...nextCopy }, language: 'en', objective: 'new_listing', listing: { id: 'listing', title: 'Sea Point home' }, brand: { name: 'Oak agency' }, usageId: 'usage', ...extras })
const deferred = () => { let resolve; const promise = new Promise((accept) => { resolve = accept }); return { promise, resolve } }
let persist, apply
const props = () => ({ organisationId: 'agency', draft: structuredClone(draft), persist, onApply: apply, listings: [], initialListingId: 'listing', initiallyOpen: true })
const mount = (patch = {}) => { const options = { ...props(), ...patch }; return { ...render(<AiCampaignAssistant {...options} />), options } }
async function generateFirst() {
  await screen.findByRole('option', { name: 'Sea Point home' })
  fireEvent.click(screen.getByRole('button', { name: 'Preview matching buyers' }))
  await screen.findByText('2 eligible recipients')
  fireEvent.click(screen.getByRole('button', { name: 'Generate email' }))
  await screen.findByLabelText('Subject')
}
beforeEach(() => {
  vi.clearAllMocks()
  runtime.enabled = true
  persist = vi.fn(async () => 'campaign')
  apply = vi.fn()
  runtime.events.mockResolvedValue([])
  runtime.generate.mockImplementation(async () => value())
  runtime.action.mockImplementation(async (_org, action, input, options) => {
    if (action === 'listings') return { listings: [{ id: 'listing', title: 'Sea Point home' }, { id: 'another', title: 'Garden home' }] }
    if (action === 'audience') return { count: 2, audienceFilter: { contact_ids: ['buyer'] }, explanation: 'Saved buyer preferences' }
    if (action === 'usage') return { usage: [] }
    return runtime.generate(input, options)
  })
})
afterEach(cleanup)

it('reviews a selected-field proposal while preserving other manually edited fields, then undoes it', async () => {
  mount()
  await generateFirst()
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'My personal subject' } })
  runtime.generate.mockImplementationOnce(async (input) => value({ ...input.previous, intro: 'A shorter invitation.' }, { changedFields: ['intro'] }))
  fireEvent.change(screen.getByLabelText('Refine one part'), { target: { value: 'intro' } })
  fireEvent.click(screen.getByRole('button', { name: 'Shorter', exact: true }))
  await screen.findByRole('region', { name: 'Proposed AI change' })
  expect(screen.getByLabelText('Introduction').value).toBe(copy.intro)
  expect(runtime.generate.mock.lastCall[0]).toMatchObject({ targetField: 'intro', previous: { subject: 'My personal subject' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply proposed change' }))
  expect(screen.getByLabelText('Subject').value).toBe('My personal subject')
  expect(screen.getByLabelText('Introduction').value).toBe('A shorter invitation.')
  fireEvent.click(screen.getByRole('button', { name: 'Undo last AI change' }))
  expect(screen.getByLabelText('Subject').value).toBe('My personal subject')
  expect(screen.getByLabelText('Introduction').value).toBe(copy.intro)
})

it('keeps newer manual edits safe after an AI proposal was applied', async () => {
  mount(); await generateFirst()
  runtime.generate.mockImplementationOnce(async (input) => value({ ...input.previous, intro: 'A shorter invitation.' }, { changedFields: ['intro'] }))
  fireEvent.click(screen.getByRole('button', { name: 'Shorter', exact: true }))
  fireEvent.click(await screen.findByRole('button', { name: 'Apply proposed change' }))
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Edited after AI' } })
  const undo = screen.queryByRole('button', { name: 'Undo last AI change' })
  if (undo) fireEvent.click(undo)
  expect(screen.getByLabelText('Subject').value).toBe('Edited after AI')
})

it('does not replace the parent draft when it changed during generation', async () => {
  const pending = deferred()
  runtime.generate.mockReturnValueOnce(pending.promise)
  const view = mount()
  await screen.findByRole('option', { name: 'Sea Point home' })
  fireEvent.click(screen.getByRole('button', { name: 'Preview matching buyers' })); await screen.findByText('2 eligible recipients')
  fireEvent.click(screen.getByRole('button', { name: 'Generate email' }))
  await waitFor(() => expect(runtime.generate).toHaveBeenCalledTimes(1))
  view.rerender(<AiCampaignAssistant {...view.options} draft={{ ...view.options.draft, subject: 'Newer manual draft' }} />)
  await act(async () => pending.resolve(value()))
  expect(screen.queryByLabelText('Subject')).toBeNull()
  expect(screen.getByText(/late result was kept out/)).toBeTruthy()
  expect(apply).not.toHaveBeenCalled()
})

it('rejects applying a generated result after newer parent content appears', async () => {
  const view = mount(); await generateFirst()
  view.rerender(<AiCampaignAssistant {...view.options} draft={{ ...view.options.draft, subject: 'A newer subject' }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Use this email in my draft' }))
  expect(screen.getByRole('alert').textContent).toContain('email changed after generation')
  expect(apply).not.toHaveBeenCalled()
})

it('cancels a generation and ignores a provider result that completes later', async () => {
  const pending = deferred()
  runtime.generate.mockReturnValueOnce(pending.promise)
  mount()
  await screen.findByRole('option', { name: 'Sea Point home' })
  fireEvent.click(screen.getByRole('button', { name: 'Preview matching buyers' })); await screen.findByText('2 eligible recipients')
  fireEvent.click(screen.getByRole('button', { name: 'Generate email' }))
  await waitFor(() => expect(runtime.generate).toHaveBeenCalledTimes(1))
  const signal = runtime.generate.mock.lastCall[1].signal
  fireEvent.click(screen.getByRole('button', { name: 'Stop waiting' }))
  expect(signal.aborted).toBe(true)
  await act(async () => pending.resolve(value()))
  expect(screen.queryByLabelText('Subject')).toBeNull()
  expect(screen.getByText(/Stopped waiting/)).toBeTruthy()
  expect(apply).not.toHaveBeenCalled()
})

it('cancels before save finishes without starting a provider request or changing its stop notice', async () => {
  const saving = deferred(); persist.mockReturnValueOnce(saving.promise)
  mount()
  await screen.findByRole('option', { name: 'Sea Point home' })
  fireEvent.click(screen.getByRole('button', { name: 'Preview matching buyers' })); await screen.findByText('2 eligible recipients')
  fireEvent.click(screen.getByRole('button', { name: 'Generate email' }))
  fireEvent.click(screen.getByRole('button', { name: 'Stop waiting' }))
  await act(async () => saving.resolve('campaign'))
  expect(runtime.generate).not.toHaveBeenCalled()
  expect(screen.getByText(/Stopped waiting/)).toBeTruthy()
  expect(screen.queryByText(/draft changed while saving/)).toBeNull()
})

it('starts only one provider generation when create is pressed twice', async () => {
  const saving = deferred(); persist.mockReturnValue(saving.promise)
  mount()
  await screen.findByRole('option', { name: 'Sea Point home' })
  fireEvent.click(screen.getByRole('button', { name: 'Preview matching buyers' })); await screen.findByText('2 eligible recipients')
  const button = screen.getByRole('button', { name: 'Generate email' })
  act(() => { button.click(); button.click() })
  await act(async () => saving.resolve('campaign'))
  await screen.findByLabelText('Subject')
  expect(runtime.generate).toHaveBeenCalledTimes(1)
})

it('prefills a saved show day and sends its id together with confirmed SAST instants', async () => {
  runtime.events.mockResolvedValue([{ id: 'event', listingId: 'listing', date: '2030-06-03', startTime: '10:00', endTime: '12:00' }])
  mount({ initialObjective: 'show_day', initialEventId: 'event' })
  await waitFor(() => expect(screen.getByLabelText('Show day starts (SAST)').value).toBe('2030-06-03T10:00'))
  await generateFirst()
  expect(runtime.generate.mock.lastCall[0]).toMatchObject({ objective: 'show_day', eventId: 'event', showStart: '2030-06-03T10:00:00+02:00', showEnd: '2030-06-03T12:00:00+02:00' })
})

it('preserves current edits while switching mobile working surfaces and exposes a sandboxed preview', async () => {
  mount(); await generateFirst()
  fireEvent.change(screen.getByLabelText('Heading'), { target: { value: 'My edited heading' } })
  fireEvent.click(screen.getByRole('button', { name: 'Email preview', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Brief & copy' }))
  expect(screen.getByLabelText('Heading').value).toBe('My edited heading')
  expect(screen.getByTitle('Property email preview').getAttribute('sandbox')).toBe('')
  fireEvent.click(screen.getByRole('button', { name: 'Mobile', exact: true }))
  expect(screen.getByRole('button', { name: 'Mobile', exact: true }).getAttribute('aria-pressed')).toBe('true')
})

it('keeps the original guided email assistant available when the flagship flag is off', async () => {
  runtime.enabled = false
  mount()
  expect(screen.getByRole('heading', { name: 'Create a listing email' })).toBeTruthy()
  expect(screen.queryByLabelText('Assistant working surface')).toBeNull()
  await generateFirst()
  fireEvent.click(screen.getByRole('button', { name: 'Use this email in my draft' }))
  expect(apply).toHaveBeenCalledWith(expect.objectContaining({ subject: copy.subject, audienceFilter: { contact_ids: ['buyer'] } }))
})

it('clears the previous saved event times when a different property is selected', async () => {
  runtime.events.mockResolvedValue([{ id: 'event', listingId: 'listing', date: '2030-06-03', startTime: '10:00', endTime: '12:00' }])
  mount({ initialObjective: 'show_day', initialEventId: 'event' })
  await waitFor(() => expect(screen.getByLabelText('Show day starts (SAST)').value).toBe('2030-06-03T10:00'))
  await screen.findByRole('option', { name: 'Garden home' })
  fireEvent.change(screen.getByLabelText('Listing'), { target: { value: 'another' } })
  expect(screen.getByLabelText('Show day starts (SAST)').value).toBe('')
  expect(screen.getByLabelText('Show day ends (SAST)').value).toBe('')
})

it('starts a fresh objective without retaining undo history from its previous creative', async () => {
  mount(); await generateFirst()
  runtime.generate.mockImplementationOnce(async (input) => value({ ...input.previous, intro: 'A shorter invitation.' }, { changedFields: ['intro'] }))
  fireEvent.click(screen.getByRole('button', { name: 'Shorter', exact: true }))
  fireEvent.click(await screen.findByRole('button', { name: 'Apply proposed change' }))
  fireEvent.change(screen.getByLabelText('Objective'), { target: { value: 'price_reduction' } })
  fireEvent.change(screen.getByLabelText(/Confirmed previous price/), { target: { value: '2700000' } })
  runtime.generate.mockResolvedValueOnce(value({ ...copy, subject: 'Fresh price story' }, { objective: 'price_reduction' }))
  fireEvent.click(screen.getByRole('button', { name: 'Generate email' }))
  await waitFor(() => expect(screen.getByLabelText('Subject').value).toBe('Fresh price story'))
  expect(screen.queryByRole('button', { name: 'Undo last AI change' })).toBeNull()
})
