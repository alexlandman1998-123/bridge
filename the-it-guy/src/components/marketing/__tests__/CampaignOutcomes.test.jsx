// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const load = vi.hoisted(() => vi.fn())
vi.mock('../../../services/campaignEnquiryService', () => ({ loadCampaignEnquiries: load }))
import CampaignOutcomes from '../CampaignOutcomes'
const campaign = { id: 'campaign', organisation_id: 'org' }
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)
it('shows the recorded CRM stage and opens enquiry work without inferring campaign revenue', async () => {
  load.mockResolvedValue({ entries: [{ lead_id: 'one', ownerId: 'agent', responded_at: '2026-10-25T10:00:00Z', lead: { stage: 'Valuation booked' } }], warnings: [], tasksAvailable: true, activitiesAvailable: true })
  const onEnquiries = vi.fn()
  render(<CampaignOutcomes campaign={campaign} userId="agent" canManage onEnquiries={onEnquiries} />)
  await screen.findByText('Valuation booked')
  expect(load).toHaveBeenCalledWith({ organisationId: 'org', campaignId: 'campaign', userId: 'agent', canManage: true })
  fireEvent.click(screen.getByRole('button', { name: /Work enquiries/ }))
  expect(onEnquiries).toHaveBeenCalled()
  expect(screen.getByText(/does not establish campaign revenue/)).toBeTruthy()
})
it('clears stale results when access or loading fails', async () => {
  load.mockResolvedValueOnce({ entries: [{ lead_id: 'one', lead: { stage: 'Valuation booked' } }], warnings: [] }).mockRejectedValue(new Error('CRM access unavailable.'))
  render(<CampaignOutcomes campaign={campaign} userId="agent" />)
  await screen.findByText('Valuation booked')
  fireEvent.click(screen.getByRole('button', { name: 'Refresh enquiries' }))
  expect((await screen.findByRole('alert')).textContent).toBe('CRM access unavailable.')
  expect(screen.queryByText('Valuation booked')).toBeNull()
})
it('discards a late response from the previous agency', async () => {
  let old
  load.mockImplementationOnce(() => new Promise((resolve) => { old = resolve })).mockResolvedValue({ entries: [{ lead_id: 'two', lead: { stage: 'Current agency stage' } }], warnings: [] })
  const { rerender } = render(<CampaignOutcomes campaign={campaign} userId="agent" />)
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
  rerender(<CampaignOutcomes campaign={{ id: 'new-campaign', organisation_id: 'new-org' }} userId="agent" />)
  await screen.findByText('Current agency stage')
  old({ entries: [{ lead_id: 'one', lead: { stage: 'Previous agency stage' } }], warnings: [] })
  await waitFor(() => expect(screen.queryByText('Previous agency stage')).toBeNull())
})
