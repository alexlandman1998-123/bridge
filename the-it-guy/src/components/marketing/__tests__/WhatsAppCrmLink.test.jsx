// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WhatsAppCrmLink, { WhatsAppCrmConversations } from '../WhatsAppCrmLink'
import CrmWhatsAppLink from '../CrmWhatsAppLink'
import WhatsAppInbox from '../WhatsAppInbox'

const mocks = vi.hoisted(() => ({ request: vi.fn(), org: 'org-one', viewer: 'agent-one' }))
vi.mock('../../../services/metaIntegrationService', () => ({ metaIntegrationRequest: mocks.request }))
vi.mock('../../../hooks/useMetaWorkspace', () => ({ useMetaWorkspace: () => ({ organisationId: mocks.org, accessScope: `${mocks.org}:${mocks.viewer}`, currentUserId: mocks.viewer, senders: [], loading: false, canManage: false }) }))
const buyer = { kind: 'buyer', recordId: 'buyer-one', name: 'Sample Customer', phone: '0821234567', path: '/pipeline/leads/buyer-one' }
const seller = { ...buyer, kind: 'seller', recordId: 'seller-one', path: '/pipeline/leads/seller-one' }
const empty = { version: 0, assignmentVersion: 3, linked: null, candidates: [buyer, seller], campaigns: [] }
const props = { organisationId: 'org-one', accessScope: 'org-one:agent-one', conversationId: 'thread-one', assignmentVersion: 3 }
const wrap = (node, path = '/') => <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
beforeEach(() => {
  mocks.org = 'org-one'; mocks.viewer = 'agent-one'
  mocks.request.mockImplementation(async (_org, action) => {
    if (action === 'crm_context') return empty
    if (action === 'crm_conversations') return { record: buyer, conversations: [] }
    if (action === 'inbox') return { conversations: [] }
    if (action === 'messages') return { conversation: { id: 'thread-one', assigned_user_id: 'agent-one', assignment_version: 3, contact_phone: '27821234567', canReply: true }, messages: [{ id: 'message-one', direction: 'inbound', body_text: 'Older conversation text' }] }
    if (action === 'link_crm' || action === 'unlink_crm') return { saved: true }
    throw Error(`Unexpected ${action}`)
  })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('requires an explicit choice between multiple records and sends the visible link and assignment versions', async () => {
  render(wrap(<WhatsAppCrmLink {...props} />))
  const select = await screen.findByRole('combobox')
  expect(select.value).toBe('')
  expect(screen.getByRole('button', { name: 'Link record' }).disabled).toBe(true)
  expect(mocks.request.mock.calls.some(call => call[1] === 'link_crm')).toBe(false)
  fireEvent.change(select, { target: { value: 'seller:seller-one' } })
  fireEvent.click(screen.getByRole('button', { name: 'Link record' }))
  await screen.findByText('CRM record linked.')
  expect(mocks.request).toHaveBeenCalledWith('org-one', 'link_crm', { conversationId: 'thread-one', kind: 'seller', recordId: 'seller-one', linkVersion: 0, assignmentVersion: 3 })
  expect(mocks.request.mock.calls.filter(call => call[1] === 'link_crm')).toHaveLength(1)
})

it('shows a linked CRM destination and campaign source without sending a message', async () => {
  mocks.request.mockResolvedValue({ ...empty, version: 1, linked: { ...seller, phoneMatches: true }, campaigns: [{ id: 'campaign-one', name: 'Seller campaign' }] })
  render(wrap(<WhatsAppCrmLink {...props} />))
  const link = await screen.findByRole('link', { name: 'Seller · Sample Customer' })
  expect(link.getAttribute('href')).toBe('/pipeline/leads/seller-one')
  expect(screen.getByText('Replied to campaign: Seller campaign')).toBeTruthy()
  expect(mocks.request.mock.calls.every(call => call[1] === 'crm_context')).toBe(true)
})

it('warns when a linked phone changes and does not silently relink or remove it', async () => {
  mocks.request.mockResolvedValue({ ...empty, version: 1, candidates: [], linked: { ...buyer, phoneMatches: false } })
  render(wrap(<WhatsAppCrmLink {...props} />))
  await screen.findByText('This record’s phone has changed. Review the link before continuing.')
  expect(screen.getByRole('link', { name: 'Buyer · Sample Customer' })).toBeTruthy()
  expect(mocks.request.mock.calls.every(call => call[1] === 'crm_context')).toBe(true)
})

it('allows removing an unavailable link without displaying private record details', async () => {
  mocks.request.mockResolvedValue({ ...empty, version: 4, linkedUnavailable: true, candidates: [] })
  render(wrap(<WhatsAppCrmLink {...props} />))
  fireEvent.click(await screen.findByRole('button', { name: 'Remove CRM link' }))
  await screen.findByText('CRM link removed.')
  expect(screen.queryByRole('link')).toBeNull()
  expect(mocks.request).toHaveBeenCalledWith('org-one', 'unlink_crm', { conversationId: 'thread-one', linkVersion: 4, assignmentVersion: 3 })
})

it('refreshes a stale save without retrying the mutation', async () => {
  const original = mocks.request.getMockImplementation()
  mocks.request.mockImplementation(async (org, action, fields) => { if (action === 'link_crm') throw Error('CRM link changed. Refresh before saving'); return original(org, action, fields) })
  render(wrap(<WhatsAppCrmLink {...props} />))
  fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'buyer:buyer-one' } })
  fireEvent.click(screen.getByRole('button', { name: 'Link record' }))
  await screen.findByText('CRM link changed. Refresh before saving')
  expect(mocks.request.mock.calls.filter(call => call[1] === 'link_crm')).toHaveLength(1)
  expect(mocks.request.mock.calls.filter(call => call[1] === 'crm_context')).toHaveLength(2)
})

it('discards a delayed CRM result after changing viewer or workspace', async () => {
  let resolveOld
  mocks.request.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
  const view = render(wrap(<WhatsAppCrmLink {...props} />))
  await waitFor(() => expect(resolveOld).toBeTypeOf('function'))
  mocks.request.mockRejectedValue(Error('CRM unavailable'))
  view.rerender(wrap(<WhatsAppCrmLink {...props} organisationId="org-two" accessScope="org-two:agent-two" />))
  resolveOld({ ...empty, linked: { ...buyer, phoneMatches: true } })
  await screen.findByText('CRM unavailable')
  expect(screen.queryByText('Buyer · Sample Customer')).toBeNull()
  expect(screen.queryByRole('combobox')).toBeNull()
})

it('opens CRM conversations through an agency-scoped link and requires choosing a conversation', async () => {
  const onSelect = vi.fn()
  const linkView = render(wrap(<CrmWhatsAppLink organisationId="org-one" kind="recruitment" recordId="recruit-one" />))
  const href = screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')
  expect(href).toContain('organisationId=org-one'); expect(href).toContain('crmKind=recruitment'); expect(href).toContain('crmRecord=recruit-one')
  linkView.unmount()
  mocks.request.mockResolvedValue({ record: buyer, conversations: [{ id: 'thread-one', contact_name: 'Sample Customer', display_phone_number: '+27 82 111 2222', status: 'open', linked: true }] })
  render(wrap(<WhatsAppCrmConversations organisationId="org-one" accessScope="org-one:agent-one" kind="buyer" recordId="buyer-one" onSelect={onSelect} />))
  const button = await screen.findByRole('button', { name: /Sample Customer · \+27 82 111 2222/ })
  expect(onSelect).not.toHaveBeenCalled()
  fireEvent.click(button); expect(onSelect).toHaveBeenCalledWith('thread-one')
})

it('opens a permitted deep-linked conversation even when it is older than the latest 100', async () => {
  render(wrap(<WhatsAppInbox />, '/marketing?section=whatsapp&view=inbox&organisationId=org-one&conversation=thread-one'))
  await screen.findByText('Older conversation text')
  expect(mocks.request).toHaveBeenCalledWith('org-one', 'messages', { conversationId: 'thread-one' })
})

it('does not load a CRM record or conversation from a different workspace link', async () => {
  render(wrap(<WhatsAppInbox />, '/marketing?section=whatsapp&view=inbox&organisationId=org-two&conversation=thread-two&crmKind=buyer&crmRecord=buyer-two'))
  await screen.findByText('This WhatsApp link belongs to another workspace. Switch to that workspace before opening it.')
  await waitFor(() => expect(mocks.request).toHaveBeenCalled())
  expect(mocks.request.mock.calls.some(call => ['messages', 'crm_conversations'].includes(call[1]))).toBe(false)
})
