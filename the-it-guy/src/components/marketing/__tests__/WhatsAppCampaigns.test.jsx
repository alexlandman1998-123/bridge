// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CreateWhatsAppCampaign, WhatsAppCampaignOverview } from '../WhatsAppCampaigns'
const mocks = vi.hoisted(() => ({ request: vi.fn(), org: 'org-one' }))
vi.mock('../../../context/AuthSessionContext', () => ({ useAuthSession: () => ({ authState: { currentWorkspace: { id: mocks.org } } }) }))
vi.mock('../../../services/whatsappCampaignService', () => ({ whatsappCampaignRequest: mocks.request }))
const template = { id: 'template-one', name: 'new_listing', language: 'en_US', category: 'MARKETING', status: 'APPROVED', components: [{ type: 'BODY', text: 'Hello {{1}}' }] }
const contacts = [{ id: 'contact-one', full_name: 'Alex Buyer', phone: '27821234567', consent_status: 'opted_in' }, { id: 'contact-two', full_name: 'Pat Buyer', phone: '27821234568', consent_status: 'unknown' }]
const senders = [{ id: 'sender-one', display_phone_number: '+27 82 999 8888', connection_status: 'connected', business_display_name: 'Kingdom' }]
const emptyWorkspace = { campaigns: [], contacts, senders }
afterEach(() => { cleanup(); vi.clearAllMocks() })
beforeEach(() => { mocks.org = 'org-one'; mocks.request.mockImplementation(async (_org, action, data) => {
  if (action === 'workspace') return emptyWorkspace
  if (action === 'templates') return { templates: [template] }
  if (action === 'save') return { campaign: { ...data.campaign, id: 'draft-one', status: 'draft', revision: (data.campaign.revision || 0) + 1 } }
  if (action === 'preflight') return { recipients: 1, revision: 1 }
  if (action === 'prepare') return { campaignId: 'draft-one' }
  if (action === 'dispatch') return { campaign: { recipients: 1, queued: 0, accepted: 1 } }
  throw new Error(`Unexpected ${action}`)
}) })
it('shows a real empty state and filters campaigns without sample rows', async () => {
  const row = (id, name, status) => ({ id, name, display_status: status, status: status === 'draft' ? 'draft' : 'sending', template, contact_ids: ['contact-one'], recipients: 1, delivered: 0, read: 0, failed: 0, skipped: 0 })
  mocks.request.mockResolvedValue({ ...emptyWorkspace, campaigns: [row('1', 'September homes', 'sent'), row('2', 'Buyer draft', 'draft')] })
  render(<WhatsAppCampaignOverview onCreateCampaign={vi.fn()} onOpenCampaign={vi.fn()} />)
  await screen.findByText('September homes')
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search campaigns' }), { target: { value: 'Buyer' } })
  expect(screen.queryByText('September homes')).toBeNull()
  expect(screen.getByText('Buyer draft')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'sent', exact: true }))
  expect(screen.getByText('No matching campaigns')).toBeTruthy()
  expect(screen.queryByText('3,482')).toBeNull()
})
it('completes the four steps, checks each field and requires confirmation before sending', async () => {
  const back = vi.fn()
  render(<CreateWhatsAppCampaign onBack={back} />)
  fireEvent.change(await screen.findByLabelText('Campaign name'), { target: { value: 'September homes' } })
  fireEvent.change(screen.getByLabelText('WhatsApp sender'), { target: { value: 'sender-one' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  const optedIn = screen.getByRole('checkbox', { name: /Alex Buyer/ })
  expect(screen.getByRole('checkbox', { name: /Pat Buyer/ }).disabled).toBe(true)
  fireEvent.click(optedIn)
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByRole('option', { name: /new_listing/ })
  fireEvent.change(screen.getByLabelText('Approved template & language'), { target: { value: 'template-one' } })
  fireEvent.change(screen.getByLabelText('Body · 1 value source'), { target: { value: 'first_name' } })
  expect(screen.getByText('Hello Alex')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.queryByRole('button', { name: 'Send to 1 recipients' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Check readiness' }))
  const send = await screen.findByRole('button', { name: 'Send to 1 recipients' })
  expect(send.disabled).toBe(true)
  expect(mocks.request.mock.calls.some((c) => c[1] === 'prepare')).toBe(false)
  fireEvent.click(screen.getByRole('checkbox', { name: /reviewed the message/ }))
  fireEvent.click(send)
  await waitFor(() => expect(back).toHaveBeenCalledTimes(1))
  expect(mocks.request.mock.calls.filter((c) => c[1] === 'prepare')).toHaveLength(1)
  const saved = mocks.request.mock.calls.find((c) => c[1] === 'save')[2].campaign
  expect(saved.contact_ids).toEqual(['contact-one'])
  expect(saved.parameter_values['body.1']).toEqual({ source: 'first_name', text: '' })
})
it('resumes saved draft fields and keeps incomplete draft saving available', async () => {
  const campaign = { id: 'draft-one', revision: 2, status: 'draft', name: 'Saved homes', sender_id: 'sender-one', template, parameter_values: { 'body.1': { text: 'Alex' } }, contact_ids: [] }
  mocks.request.mockImplementation(async (_org, action, data) => action === 'workspace' ? { ...emptyWorkspace, campaigns: [campaign] } : action === 'templates' ? { templates: [template] } : { campaign: { ...data.campaign, revision: 3 } })
  const remember = vi.fn()
  render(<CreateWhatsAppCampaign campaignId="draft-one" onBack={vi.fn()} onDraftCreated={remember} />)
  expect(await screen.findByLabelText('Campaign name')).toHaveProperty('value', 'Saved homes')
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await waitFor(() => expect(remember).toHaveBeenCalledWith('draft-one'))
  expect(mocks.request.mock.calls.find((c) => c[1] === 'save')[2].campaign.revision).toBe(2)
})
it('clears the previous organisation data when switching workspaces even if the next load fails', async () => {
  mocks.request.mockImplementation(async (org) => { if (org === 'org-two') throw new Error('Workspace unavailable'); return { ...emptyWorkspace, campaigns: [{ id: 'private', name: 'Private old campaign', display_status: 'draft', status: 'draft', template, contact_ids: [], recipients: 0, delivered: 0, read: 0, failed: 0, skipped: 0 }] } })
  const view = render(<WhatsAppCampaignOverview onCreateCampaign={vi.fn()} onOpenCampaign={vi.fn()} />)
  await screen.findByText('Private old campaign')
  mocks.org = 'org-two'
  view.rerender(<WhatsAppCampaignOverview onCreateCampaign={vi.fn()} onOpenCampaign={vi.fn()} />)
  await screen.findByText('Workspace unavailable')
  expect(screen.queryByText('Private old campaign')).toBeNull()
})

it('keeps all-time stats independent of list filters and connects the workspace menu', async () => {
  const campaign = { id: 'sent-one', name: 'October update', display_status: 'sent', status: 'sent', template, contact_ids: [], recipients: 10, delivered: 8, read: 4, failed: 2, skipped: 0, sent_at: new Date().toISOString() }
  mocks.request.mockResolvedValue({ ...emptyWorkspace, campaigns: [campaign, { ...campaign, id: 'draft-two', name: 'Next update', status: 'draft', display_status: 'draft', sent_at: null, recipients: 0, delivered: 0, read: 0, failed: 0 }] })
  const create = vi.fn()
  render(<WhatsAppCampaignOverview onCreateCampaign={create} onOpenCampaign={vi.fn()} />)
  await screen.findByText('October update')
  expect(screen.getByText('Delivery rate').closest('article').textContent).toContain('80.0%')
  expect(screen.getByText('Read rate').closest('article').textContent).toContain('50.0%')
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search campaigns' }), { target: { value: 'Next' } })
  expect(screen.getByText('Delivery rate').closest('article').textContent).toContain('80.0%')
  const menu = within(screen.getByRole('navigation', { name: 'WhatsApp workspace' }))
  fireEvent.click(menu.getByRole('button', { name: 'Past campaigns' }))
  expect(screen.getByText('October update')).toBeTruthy()
  expect(screen.queryByText('Next update')).toBeNull()
  fireEvent.click(menu.getByRole('button', { name: 'Audiences' }))
  expect(screen.getByRole('heading', { name: 'WhatsApp contacts & permission' })).toBeTruthy()
  fireEvent.click(menu.getByRole('button', { name: 'Settings' }))
  expect(screen.getByRole('heading', { name: 'WhatsApp Business connected' })).toBeTruthy()
  fireEvent.click(menu.getByRole('button', { name: 'Overview' }))
  fireEvent.click(screen.getByRole('button', { name: 'Read', exact: true }))
  expect(screen.getByRole('img', { name: /Read messages grouped by campaign send date/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Create campaign/ }))
  expect(create).toHaveBeenCalledTimes(1)
  expect(mocks.request.mock.calls.every((call) => call[1] === 'workspace')).toBe(true)
})

it('allows saving a draft without a sender and keeps delivery readiness pending', async () => {
  mocks.request.mockImplementation(async (_org, action, data) => {
    if (action === 'workspace') return { campaigns: [], contacts: [], senders: [] }
    if (action === 'save') return { campaign: { ...data.campaign, id: 'offline-draft', revision: 1 } }
    throw new Error(`Unexpected ${action}`)
  })
  render(<CreateWhatsAppCampaign onBack={vi.fn()} />)
  fireEvent.change(await screen.findByLabelText('Campaign name'), { target: { value: 'New homes' } })
  expect(screen.getByRole('heading', { name: 'New homes' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Set up connection' }).getAttribute('href')).toBe('/settings/integrations/meta')
  expect(screen.getAllByText('Pending')).toHaveLength(5)
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true)
  expect(mocks.request.mock.calls.some((call) => ['prepare', 'dispatch'].includes(call[1]))).toBe(false)
})

it('uses Meta template metadata and blocks incomplete variables before review', async () => {
  render(<CreateWhatsAppCampaign onBack={vi.fn()} />)
  fireEvent.change(await screen.findByLabelText('Campaign name'), { target: { value: 'New homes' } })
  fireEvent.change(screen.getByLabelText('WhatsApp sender'), { target: { value: 'sender-one' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Alex Buyer/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByRole('option', { name: /new_listing/ })
  fireEvent.change(screen.getByLabelText('Approved template & language'), { target: { value: 'template-one' } })
  expect(screen.getByText('Category').nextElementSibling.textContent).toBe('MARKETING')
  expect(screen.getByText('Language').nextElementSibling.textContent).toBe('en_US')
  expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Body · 1 value source'), { target: { value: 'first_name' } })
  expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(false)
})
