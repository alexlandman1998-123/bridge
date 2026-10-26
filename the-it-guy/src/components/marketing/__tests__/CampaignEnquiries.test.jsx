// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
const runtime = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), search: vi.fn() }))
vi.mock('../../../services/campaignEnquiryService', () => ({ ENQUIRY_CHANNELS: { email: 'Email', whatsapp: 'WhatsApp' }, loadCampaignEnquiries: runtime.load, saveCampaignEnquiryAction: runtime.save, searchCampaignLeads: runtime.search }))
import CampaignEnquiries from '../CampaignEnquiries'
const campaign = { id: 'campaign', organisation_id: 'agency' }
const entry = { id: 'enquiry', lead_id: 'lead', name: 'Jane Doe', email: 'jane@example.test', channel: 'email', responded_at: '2026-10-24T08:00:00Z', lead: { stage: 'New Lead' }, ownerId: 'agent', ownerName: 'Sarah Jacobs', lastContact: null, nextTask: { task_id: 'task', title: 'Call about valuation', due_date: '2026-10-24' }, overdue: true, awaitingContact: true, needsAttention: true, canWork: true }
const data = { entries: [entry], tasksAvailable: true, activitiesAvailable: true, warnings: [] }
const mount = (props = {}) => render(<MemoryRouter><CampaignEnquiries campaign={campaign} userId="agent" {...props} /></MemoryRouter>)
beforeEach(() => { runtime.load.mockResolvedValue(data); runtime.save.mockResolvedValue('saved'); runtime.search.mockResolvedValue([{ id: 'new-lead', name: 'Alex Buyer', email: 'alex@example.test', stage: 'New Lead' }]) })
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('shows the CRM owner, due task and attention filters inside the campaign', async () => {
  mount()
  expect(await screen.findByRole('link', { name: 'Jane Doe' })).toBeTruthy()
  expect(screen.getByText('Sarah Jacobs')).toBeTruthy()
  expect(screen.getByText('Call about valuation')).toBeTruthy()
  expect(screen.getByText(/Overdue ·/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Enquiry filter'), { target: { value: 'unassigned' } })
  expect(screen.getByRole('heading', { name: 'No matching enquiries' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Enquiry filter'), { target: { value: 'overdue' } })
  expect(screen.getByRole('link', { name: 'Jane Doe' }).getAttribute('href')).toBe('/pipeline/leads/lead')
})
it('creates CRM follow-up tasks with a stable ID and completes the existing task', async () => {
  mount(); await screen.findByText('Sarah Jacobs')
  fireEvent.click(screen.getByRole('button', { name: 'Add follow-up for Jane Doe' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Next action'), { target: { value: 'Book valuation' } })
  fireEvent.change(within(dialog).getByLabelText('Due date'), { target: { value: '2026-10-28' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(runtime.save).toHaveBeenCalledWith(expect.objectContaining({ organisationId: 'agency', campaignId: 'campaign', leadId: 'lead', action: 'follow_up', payload: expect.objectContaining({ title: 'Book valuation', dueDate: '2026-10-28', id: expect.any(String) }) })))
  await screen.findByText('Follow-up added to CRM tasks.')
  fireEvent.click(screen.getByRole('button', { name: 'Complete follow-up for Jane Doe' }))
  await waitFor(() => expect(runtime.save).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'complete', payload: { id: 'task' } })))
})
it('records an explicitly selected responder rather than inferring one from engagement', async () => {
  mount(); await screen.findByText('Sarah Jacobs')
  fireEvent.click(screen.getByRole('button', { name: 'Record enquiry' }))
  fireEvent.change(screen.getByLabelText('Find a CRM lead'), { target: { value: 'Alex' } })
  fireEvent.click(await screen.findByRole('button', { name: /Alex Buyer/ }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(runtime.save).toHaveBeenCalledWith(expect.objectContaining({ action: 'record', leadId: 'new-lead', payload: expect.objectContaining({ channel: 'email', respondedAt: expect.any(String) }) })))
})
it('logs a completed contact with an explicit SAST timestamp without sending', async () => {
  mount(); await screen.findByText('Sarah Jacobs')
  fireEvent.click(screen.getByRole('button', { name: 'Log contact' }))
  fireEvent.change(screen.getByLabelText('Contacted at (SAST)'), { target: { value: '2026-10-24T12:30' } })
  fireEvent.change(screen.getByLabelText('Contact note'), { target: { value: 'Valuation agreed' } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(runtime.save).toHaveBeenCalledWith(expect.objectContaining({ action: 'contact', payload: expect.objectContaining({ channel: 'Call', contactedAt: '2026-10-24T10:30:00.000Z', note: 'Valuation agreed' }) })))
})
it('keeps a failed save open and reuses its request ID on retry', async () => {
  runtime.save.mockRejectedValueOnce(new Error('Temporary failure')).mockResolvedValueOnce('saved')
  mount(); await screen.findByText('Sarah Jacobs')
  fireEvent.click(screen.getByRole('button', { name: 'Add follow-up for Jane Doe' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
  await screen.findByRole('alert')
  const first = runtime.save.mock.calls[0][0].payload.id
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(runtime.save).toHaveBeenCalledTimes(2))
  expect(runtime.save.mock.calls[1][0].payload.id).toBe(first)
})
it('supports read-only rows and reports unavailable CRM sources', async () => {
  runtime.load.mockResolvedValue({ ...data, tasksAvailable: false, activitiesAvailable: false, warnings: ['CRM tasks unavailable.'], entries: [{ ...entry, canWork: false, nextTask: null }] })
  mount(); await screen.findByText('Sarah Jacobs')
  expect(screen.queryByRole('button', { name: 'Log contact' })).toBeNull()
  expect(screen.queryByRole('button', { name: /Add follow-up for/ })).toBeNull()
  expect(screen.getByText('Tasks unavailable')).toBeTruthy()
  expect(screen.getByText('Unavailable')).toBeTruthy()
  expect(screen.queryByText('No open CRM task')).toBeNull()
})
it('shows an honest unavailable state when persistence is not enabled', async () => {
  runtime.load.mockRejectedValue(new Error('Campaign enquiries are not enabled for this workspace yet.'))
  mount(); await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Record enquiry' }).disabled).toBe(true)
  expect(screen.queryByText('Give every response a next step')).toBeNull()
})

it('opens the selected queue responder with their actions and can return to all enquiries', async () => {
  runtime.load.mockResolvedValue({ ...data, entries: [entry, { ...entry, id: 'e2', lead_id: 'other', name: 'Alex Buyer' }] })
  mount({ focusLeadId: 'lead' })
  expect(await screen.findByRole('button', { name: 'Add follow-up for Jane Doe' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Alex Buyer' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Show all enquiries' }))
  expect(screen.getByRole('link', { name: 'Alex Buyer' })).toBeTruthy()
})

it('reviews a saved playbook follow-up against a responder before creating the shared CRM task',async()=>{
  mount({campaign:{...campaign,playbook:{followUp:[{id:'recipe',title:'Arrange a valuation with {contact}',days:2}]}}})
  await screen.findByText('Sarah Jacobs')
  fireEvent.click(screen.getByRole('button',{name:'Add follow-up for Jane Doe'}))
  fireEvent.change(screen.getByLabelText('Playbook action'),{target:{value:'recipe'}})
  expect(screen.getByLabelText('Next action').value).toBe('Arrange a valuation with Jane Doe')
  expect(screen.getByLabelText('Due date').value).toBe('2026-10-26')
  expect(runtime.save).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Due date'),{target:{value:'2026-10-28'}})
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Save'}))
  await waitFor(()=>expect(runtime.save).toHaveBeenCalledWith(expect.objectContaining({leadId:'lead',action:'follow_up',payload:expect.objectContaining({title:'Arrange a valuation with Jane Doe',dueDate:'2026-10-28'})})))
})
