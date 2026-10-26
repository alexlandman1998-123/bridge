// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import MobileBuyerJourney from '../MobileBuyerJourney.jsx'
import { loadMobileBuyerJourney } from '../../../services/mobileBuyerJourneyService.js'
import { buildBuyerJourneyAlignmentModel, summarizeBuyerJourneyReadiness } from '../../../services/buyerJourneyAlignmentService.js'
vi.mock('../../../services/mobileBuyerJourneyService.js', () => ({ loadMobileBuyerJourney: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const props = { organisationId: 'agency', lead: { leadId: 'one' }, contact: {}, activities: [], actor: { id: 'agent' } }
function model(evidence = {}) {
  const journey = buildBuyerJourneyAlignmentModel({ evidence: { leadCaptured: true, ...evidence } })
  return { ...journey, readiness: summarizeBuyerJourneyReadiness(journey.stages) }
}

it('shows nine desktop stages, the true completion count and the next incomplete milestone', async () => {
  loadMobileBuyerJourney.mockResolvedValue(model())
  render(<MobileBuyerJourney {...props} />)
  const progress = await screen.findByRole('progressbar', { name: 'Buyer journey progress' })
  expect(progress.getAttribute('aria-valuenow')).toBe('11')
  expect(screen.getByText('1/9')).toBeTruthy()
  expect(screen.getByText('Contacted is the next step.')).toBeTruthy()
  expect(screen.getAllByRole('listitem').length).toBe(9)
  expect(screen.getByRole('heading', { name: 'Buyer onboarding submitted' })).toBeTruthy()
})

it('does not show a percentage after an evidence read fails and retries with fresh saved records', async () => {
  loadMobileBuyerJourney.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(model({ contacted: true }))
  render(<MobileBuyerJourney {...props} />)
  await screen.findByRole('alert')
  expect(screen.queryByRole('progressbar')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry progress' }))
  const progress = await screen.findByRole('progressbar')
  expect(progress.getAttribute('aria-valuenow')).toBe('22')
  expect(loadMobileBuyerJourney).toHaveBeenLastCalledWith(expect.objectContaining({ refreshLead: true }))
  expect(screen.getByText('Qualified is the next step.')).toBeTruthy()
})

it('ignores late progress for the previous lead and refreshes the current lead on request', async () => {
  let resolveOld
  loadMobileBuyerJourney.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve })).mockResolvedValue(model({ contacted: true }))
  const view = render(<MobileBuyerJourney {...props} />)
  view.rerender(<MobileBuyerJourney {...props} lead={{ leadId: 'two' }} />)
  await screen.findByText('2/9')
  resolveOld(model({ contacted: true, qualified: true, viewingCompleted: true }))
  await waitFor(() => expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('22'))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh buyer progress' }))
  await screen.findByText('2/9')
  expect(loadMobileBuyerJourney).toHaveBeenLastCalledWith(expect.objectContaining({ lead: { leadId: 'two' }, refreshLead: true }))
})
