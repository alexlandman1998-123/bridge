// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CampaignAttention from '../CampaignAttention'
import { AGENCY_CRM_UPDATED_EVENT } from '../../../lib/agencyCrmUpdateBus'

const runtime = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../../../services/campaignEnquiryService', () => ({ loadCampaignOverviewEnquiries: runtime.load }))
const campaign = { id: 'plan', name: 'Summer sellers', status: 'active', revision: 1 }
const workspace = { campaigns: [campaign], activities: [{ campaign_id: 'plan', channel: 'email', email_campaign_id: 'draft' }], channels: { email: { data: [{ id: 'draft', status: 'draft', name: 'Valuation invite' }] }, whatsapp: { data: [] } }, userId: 'agent', canManage: false }
const entry = { campaign_id: 'plan', lead_id: 'lead', name: 'Jane Doe', lead: { stage: 'New Lead' }, ownerId: 'agent', ownerName: 'Sarah Jacobs', awaitingContact: true, nextTask: { title: 'Call Jane', due_date: '2020-01-01' } }
const complete = { entries: [entry], warnings: [], tasksAvailable: true, activitiesAvailable: true }
const mount = (props = {}) => render(<MemoryRouter><CampaignAttention organisationId="agency" workspace={workspace} {...props} /></MemoryRouter>)
beforeEach(() => { runtime.load.mockResolvedValue(complete) })
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('shows actionable work with direct destinations and category filters', async () => {
  mount()
  const link = await screen.findByRole('link', { name: 'Review enquiry: Jane Doe' })
  expect(link.getAttribute('href')).toContain('enquiry=lead')
  expect(screen.getByRole('heading', { name: 'Needs attention 2' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Continue draft: Valuation invite' }).getAttribute('href')).toBe('/marketing?section=email&view=create&id=draft')
  fireEvent.click(screen.getByRole('button', { name: 'Drafts & plans 1' }))
  expect(screen.queryByText('Jane Doe')).toBeNull()
  expect(screen.getByText('Valuation invite')).toBeTruthy()
  expect(runtime.load).toHaveBeenCalledTimes(1)
})
it('preserves useful channel work when enquiries fail and never declares an all-clear', async () => {
  runtime.load.mockRejectedValue(new Error('Campaign enquiries are not enabled for this workspace yet.'))
  mount()
  await screen.findByText(/Campaign enquiries are not enabled/)
  expect(screen.getByRole('button', { name: 'Enquiries —' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Needs attention 1+' })).toBeTruthy()
  expect(screen.getByText('Valuation invite')).toBeTruthy()
  expect(screen.queryByText('You’re up to date')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Enquiries —' }))
  expect(screen.getByText('No items in the available activity')).toBeTruthy()
  runtime.load.mockResolvedValueOnce(complete)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh campaign work' }))
  expect(await screen.findByText('Jane Doe')).toBeTruthy()
})
it('limits the initial list and expands available work without more queries', async () => {
  runtime.load.mockResolvedValue({ ...complete, entries: Array.from({ length: 9 }, (_, i) => ({ ...entry, lead_id: `lead-${i}`, name: `Person ${i}` })) })
  mount()
  await screen.findByText('Person 0')
  expect(screen.getAllByRole('listitem')).toHaveLength(6)
  fireEvent.click(screen.getByRole('button', { name: 'Show all work' }))
  expect(screen.getAllByRole('listitem')).toHaveLength(10)
  expect(runtime.load).toHaveBeenCalledTimes(1)
})
it('refreshes after scoped CRM changes, removes resolved work and ignores other agencies', async () => {
  mount()
  await screen.findByText('Jane Doe')
  act(() => window.dispatchEvent(new CustomEvent(AGENCY_CRM_UPDATED_EVENT, { detail: { organisationId: 'other' } })))
  expect(runtime.load).toHaveBeenCalledTimes(1)
  runtime.load.mockResolvedValueOnce({ ...complete, entries: [] })
  act(() => window.dispatchEvent(new CustomEvent(AGENCY_CRM_UPDATED_EVENT, { detail: { organisationId: 'agency' } })))
  await waitFor(() => expect(screen.queryByText('Jane Doe')).toBeNull())
  expect(runtime.load).toHaveBeenCalledTimes(2)
})
it('discards a late response from the previous agency', async () => {
  let finish
  runtime.load.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve })).mockResolvedValueOnce({ ...complete, entries: [] })
  const view = mount()
  view.rerender(<MemoryRouter><CampaignAttention organisationId="other" workspace={workspace} /></MemoryRouter>)
  await waitFor(() => expect(runtime.load).toHaveBeenCalledTimes(2))
  await act(async () => finish(complete))
  expect(screen.queryByText('Jane Doe')).toBeNull()
})
it('uses the parent refresh for channel records and scopes the detail view to one campaign', async () => {
  const refresh = vi.fn().mockResolvedValue(undefined)
  mount({ campaignId: 'plan', onRefresh: refresh })
  await screen.findByText('Jane Doe')
  expect(runtime.load).toHaveBeenCalledWith(expect.objectContaining({ organisationId: 'agency', campaignIds: ['plan'], userId: 'agent', canManage: false }))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh campaign work' }))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  expect(screen.getByText('Your next actions for this campaign')).toBeTruthy()
})
it('shows a complete empty state only after all available sources finish loading', async () => {
  runtime.load.mockResolvedValueOnce({ ...complete, entries: [] })
  mount({ workspace: { ...workspace, activities: [] } })
  expect(await screen.findByText('You’re up to date')).toBeTruthy()
  expect(within(screen.getByRole('group', { name: 'Filter campaign work' })).getByRole('button', { name: 'Enquiries 0' })).toBeTruthy()
})

it('marks channel counts as partial when a source fails, keeping other work visible', async () => {
  mount({ workspace: { ...workspace, channels: { ...workspace.channels, email: { data: [], error: 'Access unavailable' } } } })
  await screen.findByText('Jane Doe')
  expect(screen.getByText('Email activity is unavailable.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Upcoming 0+' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Needs attention 1+' })).toBeTruthy()
})
