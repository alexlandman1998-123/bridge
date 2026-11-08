// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CreateWhatsAppCampaign, WhatsAppCampaignDetail, WhatsAppCampaignOverview } from '../WhatsAppCampaigns'
vi.mock('../MarketingAudiences', () => ({ default: () => <div>Shared CRM audience library</div>, MarketingAudiencePicker: ({ onApply }) => <button onClick={() => onApply(['contact-one'], { name: 'Ready buyers' })}>Apply reviewed CRM recipients</button> }))
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
it('saves a development-linked WhatsApp draft without putting context into template variables', async () => {
  const context = { development_id: 'harbour', development_name: 'Harbour Heights' }
  render(<CreateWhatsAppCampaign developmentContext={context} onBack={vi.fn()} />)
  expect((await screen.findByLabelText('Campaign name')).value).toBe('Harbour Heights campaign')
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  const save = mocks.request.mock.calls.find(call => call[1] === 'save')
  expect(save[2].campaign.parameter_values).toEqual({ __arch9_context: context })
})
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
  expect([...screen.getByRole('navigation', { name: 'WhatsApp workspace' }).querySelectorAll('button')].map(button => button.textContent)).toEqual(['Overview', 'Past campaigns', 'Templates', 'Audiences', 'Settings'])
  const menu = within(screen.getByRole('navigation', { name: 'WhatsApp workspace' }))
  fireEvent.click(menu.getByRole('button', { name: 'Past campaigns' }))
  expect(screen.getByText('October update')).toBeTruthy()
  expect(screen.queryByText('Next update')).toBeNull()
  fireEvent.click(menu.getByRole('button', { name: 'Audiences' }))
  expect(await screen.findByText('Shared CRM audience library')).toBeTruthy()
  fireEvent.click(screen.getByText('Manage WhatsApp contacts & permission'))
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
  expect(screen.getByRole('link', { name: 'Set up connection' }).getAttribute('href')).toBe('/settings/integrations/whatsapp')
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

const detailCampaign = { id: 'sent-one', name: 'October homes', status: 'sending', template, sent_at: '2026-10-19T06:31:00Z' }
const recipient = (id, fields = {}) => ({ id, full_name: `Recipient ${id}`, phone: '27821234567', status: 'sent', ...fields })

it('summarises confirmed receipts without double-counting read messages or hiding failures', async () => {
  mocks.request.mockResolvedValue({ campaign: detailCampaign, recipients: [
    recipient('read', { status: 'read', read_at: '2026-10-19T06:40:00Z' }),
    recipient('delivered', { status: 'delivered', delivered_at: '2026-10-19T06:35:00Z' }),
    recipient('failed', { status: 'failed', error_message: 'Number is unavailable.' }),
  ] })
  const back = vi.fn()
  render(<WhatsAppCampaignDetail campaignId="sent-one" onBack={back} />)
  await screen.findByRole('heading', { name: 'October homes' })
  expect(screen.getByText('Partially sent')).toBeTruthy()
  const summary = within(screen.getByRole('region', { name: 'Campaign results summary' }))
  for (const [label, count] of [['Recipients', '3'], ['Delivered', '2'], ['Read', '1'], ['Failed', '1']]) {
    expect(summary.getByText(label).closest('article').querySelector('strong').textContent).toBe(count)
  }
  const table = within(screen.getByRole('table', { name: 'Recipient results' }))
  expect(table.getByText('Confirmed by read receipt')).toBeTruthy()
  expect(table.getByText('Number is unavailable.')).toBeTruthy()
  expect(screen.getByText('new_listing')).toBeTruthy()
  expect(screen.queryByRole('navigation', { name: 'WhatsApp' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'WhatsApp campaigns' }))
  expect(back).toHaveBeenCalledTimes(1)
  expect(mocks.request.mock.calls.every((call) => call[1] === 'detail')).toBe(true)
})

it('keeps stale processing results unconfirmed instead of showing a successful send', async () => {
  mocks.request.mockResolvedValue({ campaign: detailCampaign, recipients: [recipient('uncertain', { status: 'processing', attempted_at: new Date(Date.now() - 180000).toISOString() })] })
  render(<WhatsAppCampaignDetail campaignId="sent-one" onBack={vi.fn()} />)
  await screen.findByText('Needs attention')
  expect(screen.getByText('Unconfirmed')).toBeTruthy()
  expect(screen.getByText('Delivery unconfirmed. Check Meta before sending again.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Send remaining/ })).toBeNull()
})

it('shows an empty recipient state for a draft without inventing results', async () => {
  mocks.request.mockResolvedValue({ campaign: { ...detailCampaign, status: 'draft', sent_at: null }, recipients: [] })
  render(<WhatsAppCampaignDetail campaignId="sent-one" onBack={vi.fn()} />)
  expect(screen.queryByRole('region', { name: 'Campaign results summary' })).toBeNull()
  await screen.findByText('Recipient results will appear after this campaign starts sending.')
  expect(screen.getByText('Not started')).toBeTruthy()
  expect(screen.getByText('draft')).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
})

it('retains verified results on refresh failure and clears the error after a successful retry', async () => {
  const data = { campaign: detailCampaign, recipients: [recipient('one', { delivered_at: '2026-10-19T06:35:00Z', status: 'delivered' })] }
  mocks.request.mockResolvedValueOnce(data).mockRejectedValueOnce(new Error('Results unavailable.')).mockResolvedValue(data)
  render(<WhatsAppCampaignDetail campaignId="sent-one" onBack={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Refresh results' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('table', { name: 'Recipient results' })).toBeTruthy()
  expect(screen.getByText('Recipient one')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh results' }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  expect(mocks.request.mock.calls).toHaveLength(3)
})

it('resumes queued recipients through the background worker without browser dispatch', async () => {
  let dispatched = false
  mocks.request.mockImplementation(async (_org, action) => {
    if (action === 'detail') return { campaign: detailCampaign, recipients: [recipient('one', { status: dispatched ? 'sent' : 'queued' })] }
    if (action === 'resume') { dispatched = true; return { campaign: { queued: 0 } } }
    throw new Error(`Unexpected ${action}`)
  })
  render(<WhatsAppCampaignDetail campaignId="sent-one" onBack={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Resume sending' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Resume sending' })).toBeNull())
  expect(mocks.request.mock.calls.filter((call) => call[1] === 'resume')).toHaveLength(1)
  expect(mocks.request.mock.calls.some((call) => call[1] === 'dispatch')).toBe(false)
  expect(mocks.request.mock.calls.some((call) => call[1] === 'prepare')).toBe(false)
})
it('retains handed-off wording when choosing a sender and approved template, and fills only the chosen body field', async () => {
  const suggestion = { id: 'plan', revision: 1, wording: 'Saved campaign wording' }
  mocks.request.mockImplementation(async (_org, action, data) => {
    if (action === 'workspace') return { ...emptyWorkspace, campaigns: [{ id: 'handed-off', revision: 1, name: 'Just Listed', status: 'draft', sender_id: '', template: {}, contact_ids: [], parameter_values: { __arch9_campaign: suggestion } }] }
    if (action === 'templates') return { templates: [template] }
    if (action === 'save') return { campaign: { ...data.campaign, revision: 2 } }
    throw new Error(`Unexpected ${action}`)
  })
  render(<CreateWhatsAppCampaign campaignId="handed-off" onBack={vi.fn()} />)
  await screen.findByLabelText('Suggested WhatsApp wording')
  fireEvent.change(screen.getByLabelText('WhatsApp sender'), { target: { value: 'sender-one' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(await screen.findByLabelText(/Alex Buyer/))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.change(await screen.findByLabelText('Approved template & language'), { target: { value: 'template-one' } })
  fireEvent.click(screen.getByRole('button', { name: 'Use wording in Body · 1' }))
  expect(screen.getByLabelText('Body · 1', { exact: true }).value).toBe('Saved campaign wording')
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  const call = mocks.request.mock.calls.find((item) => item[1] === 'save')
  expect(call[2].campaign.parameter_values.__arch9_campaign).toEqual(suggestion)
  expect(call[2].campaign.parameter_values['body.1']).toEqual({ source: 'text', text: 'Saved campaign wording' })
})

it('saves linked campaign wording and edits before returning to campaign results', async () => {
 const reference={id:'marketing-plan',revision:3,wording:'A personal valuation invitation'}
 const campaign={id:'linked-draft',status:'draft',revision:1,name:'Valuations',sender_id:'',template:{},contact_ids:[],parameter_values:{__arch9_campaign:reference}}
 mocks.request.mockImplementation(async(_org,action,input)=> action==='workspace'?{...emptyWorkspace,campaigns:[campaign]}:action==='templates'?{templates:[template]}:{campaign:{...input.campaign,revision:2}})
 const open=vi.fn()
 render(<CreateWhatsAppCampaign campaignId="linked-draft" onBack={vi.fn()} onOpenMarketingCampaign={open}/> )
 fireEvent.change(await screen.findByLabelText('Campaign name'),{target:{value:'Personal valuations'}})
 fireEvent.change(screen.getByLabelText('WhatsApp sender'),{target:{value:'sender-one'}})
 expect(screen.getByLabelText('Suggested WhatsApp wording').value).toBe(reference.wording)
 fireEvent.click(screen.getByRole('button',{name:'View campaign results'}))
 await waitFor(()=>expect(open).toHaveBeenCalledWith('marketing-plan'))
 expect(mocks.request.mock.calls.find((call)=>call[1]==='save')[2].campaign).toMatchObject({name:'Personal valuations',parameter_values:{__arch9_campaign:reference},contact_ids:[]})
 expect(mocks.request.mock.calls.every((call)=>['workspace','templates','save'].includes(call[1]))).toBe(true)
})
it('stays in the linked WhatsApp editor with edits intact if returning cannot save',async()=>{
 const campaign={id:'linked-draft',status:'draft',name:'Valuations',sender_id:'',template:{},contact_ids:[],parameter_values:{__arch9_campaign:{id:'marketing-plan',revision:1,wording:'Invitation'}}}
 mocks.request.mockImplementation(async(_org,action)=>{if(action==='workspace')return {...emptyWorkspace,campaigns:[campaign]};throw new Error('Connection lost')})
 const open=vi.fn();render(<CreateWhatsAppCampaign campaignId="linked-draft" onBack={vi.fn()} onOpenMarketingCampaign={open}/> )
 fireEvent.change(await screen.findByLabelText('Campaign name'),{target:{value:'Keep this wording'}})
 fireEvent.click(screen.getByRole('button',{name:'View campaign results'}))
 await screen.findByRole('alert');expect(open).not.toHaveBeenCalled();expect(screen.getByLabelText('Campaign name').value).toBe('Keep this wording')
})

it('connects WhatsApp result pages to campaign results and reopens unsent drafts',async()=>{
 const campaign={id:'draft-one',name:'Linked draft',status:'draft',template:{},parameter_values:{__arch9_campaign:{id:'marketing-plan',revision:1}},contact_ids:[]}
 mocks.request.mockResolvedValue({campaign,recipients:[]})
 const open=vi.fn(), edit=vi.fn()
 render(<WhatsAppCampaignDetail campaignId="draft-one" onBack={vi.fn()} onOpenMarketingCampaign={open} onEdit={edit}/> )
 fireEvent.click(await screen.findByRole('button',{name:'View campaign results'}))
 expect(open).toHaveBeenCalledWith('marketing-plan')
 fireEvent.click(screen.getByRole('button',{name:'Open draft'}))
 expect(edit).toHaveBeenCalledWith('draft-one')
})

it('applies a reviewed shared audience to the WhatsApp draft without preparing or dispatching it', async () => {
  render(<CreateWhatsAppCampaign onBack={vi.fn()} />)
  fireEvent.change(await screen.findByLabelText('Campaign name'), { target: { value: 'CRM buyers' } })
  fireEvent.change(screen.getByLabelText('WhatsApp sender'), { target: { value: 'sender-one' } })
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Apply reviewed CRM recipients' }))
  await screen.findByText('Applied 1 reviewed recipients from “Ready buyers”.')
  expect(screen.getByRole('checkbox', { name: /Alex Buyer/ }).checked).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  await screen.findByText('Draft saved.')
  const saved=mocks.request.mock.calls.find((call)=>call[1]==='save')[2].campaign
  expect(saved.contact_ids).toEqual(['contact-one'])
  expect(mocks.request.mock.calls.some((call)=>['prepare','dispatch'].includes(call[1]))).toBe(false)
})

it('pauses automatic campaign result checks while hidden and reconciles on visibility', async () => {
  vi.useFakeTimers()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  mocks.request.mockResolvedValue({ campaign: detailCampaign, recipients: [] })
  try {
    render(<WhatsAppCampaignDetail campaignId="sent-one" onBack={vi.fn()} />)
    await act(async () => vi.advanceTimersByTimeAsync(600000))
    expect(mocks.request).not.toHaveBeenCalled()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(mocks.request).toHaveBeenCalledTimes(1)
  } finally {
    cleanup(); vi.useRealTimers()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  }
})
