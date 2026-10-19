// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import JourneyStageOverrideActions from '../JourneyStageOverrideActions.jsx'

const { saveOverride } = vi.hoisted(() => ({ saveOverride: vi.fn() }))
vi.mock('../../../services/journeyStageOverrideService.js', () => ({ createJourneyStageOverride: saveOverride }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const base = { entityType: 'buyer_lead', entityId: 'qa-buyer', organisationId: 'qa-org', buttonLabel: 'Mark as completed', source: 'buyer_next_best_action' }

it('saves manual viewing completion and waits for the refreshed journey', async () => {
  saveOverride.mockResolvedValue({ id: 'saved-viewing' })
  let finishRefresh
  const onCreated = vi.fn(() => new Promise(resolve => { finishRefresh = resolve }))
  render(<JourneyStageOverrideActions {...base} stage={{ key: 'viewing', label: 'Viewing', state: 'current', done: false }} onCreated={onCreated} />)
  fireEvent.click(screen.getByRole('button', { name: 'Mark as completed' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Viewing completed in person' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save override' }))
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 'saved-viewing' }))
  expect(saveOverride).toHaveBeenCalledWith(expect.objectContaining({ entityId: 'qa-buyer', stageKey: 'viewing', actionType: 'mark_complete', metadata: { source: 'buyer_next_best_action', stageLabel: 'Viewing' } }))
  expect(screen.getAllByRole('button', { name: 'Saving...' }).every(button => button.disabled)).toBe(true)
  finishRefresh()
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Reason' })).toBeNull())
})

it('keeps a failed completion open and reports the error without advancing', async () => {
  saveOverride.mockRejectedValue(new Error('Save failed'))
  const onCreated = vi.fn()
  render(<JourneyStageOverrideActions {...base} stage={{ key: 'viewing', label: 'Viewing', state: 'current', done: false }} onCreated={onCreated} />)
  fireEvent.click(screen.getByRole('button', { name: 'Mark as completed' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Viewing completed in person' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save override' }))
  await waitFor(() => expect(screen.getByText('Save failed')).toBeTruthy())
  expect(onCreated).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox', { name: 'Reason' })).toBeTruthy()
})

it.each(['buyer_onboarding_sent', 'buyer_onboarding_submitted', 'offer', 'transaction', 'buyer_documents_uploaded'])(
  'cannot manufacture the evidence for %s with a journey override', stageKey => {
    render(<JourneyStageOverrideActions {...base} stage={{ key: stageKey, label: stageKey, state: 'current', done: false }} />)
    expect(screen.queryByRole('button', { name: 'Mark as completed' })).toBeNull()
    expect(saveOverride).not.toHaveBeenCalled()
  },
)

it('retries a failed refresh without saving a duplicate completion', async () => {
  saveOverride.mockResolvedValue({ id: 'saved-viewing' })
  const onCreated = vi.fn().mockRejectedValueOnce(new Error('Refresh unavailable')).mockResolvedValueOnce(undefined)
  render(<JourneyStageOverrideActions {...base} stage={{ key: 'viewing', label: 'Viewing', state: 'current', done: false }} onCreated={onCreated} />)
  fireEvent.click(screen.getByRole('button', { name: 'Mark as completed' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Viewing completed in person' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save override' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh journey' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Refresh journey' }))
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Reason' })).toBeNull())
  expect(saveOverride).toHaveBeenCalledOnce()
  expect(onCreated).toHaveBeenCalledTimes(2)
})
