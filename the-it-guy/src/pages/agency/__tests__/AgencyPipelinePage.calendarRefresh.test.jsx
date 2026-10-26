// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => {
  const org = '10000000-0000-4000-8000-000000000001'
  const user = '20000000-0000-4000-8000-000000000001'
  const profile = { id: user, fullName: 'Calendar Agent', email: 'calendar@example.test' }
  const workspace = { id: org, organisationId: org, name: 'Calendar Agency', type: 'agency' }
  const channel = { on: vi.fn(), subscribe: vi.fn() }
  channel.on.mockReturnValue(channel)
  channel.subscribe.mockReturnValue(channel)
  const query = { then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve), maybeSingle: async () => ({ data: null, error: null }) }
  for (const method of ['select', 'insert', 'eq', 'in', 'is', 'order', 'limit', 'gte', 'lt', 'range']) query[method] = () => query
  return {
    org, profile, workspace, channel,
    context: { role: 'agent', profile, currentWorkspace: workspace, currentMembership: { organisationId: org, role: 'owner' }, workspace },
    crm: vi.fn(async () => ({ leads: [], contacts: [], leadActivities: [], tasks: [] })),
    marketing: vi.fn(), timeRead: vi.fn(), timeChange: vi.fn(), createLead: vi.fn(), directory: vi.fn(async () => ({ clients: [] })),
    appointments: vi.fn(async () => []), listings: vi.fn(async () => []), inbound: vi.fn(async () => []),
    supabase: { from: () => query, rpc: async () => ({ data: [], error: null }), channel: () => channel, removeChannel: async () => {}, auth: { getUser: async () => ({ data: { user: { id: user } }, error: null }) } },
  }
})
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => fixture.context }))
vi.mock('../../../core/clients/agentClientDirectory', () => ({ loadAgentClientDirectory: fixture.directory }))
vi.mock('../../../context/OrganisationContext', () => ({ useOrganisation: () => ({ branding: {}, organisation: fixture.workspace }) }))
vi.mock('../../../lib/supabaseClient', async (actual) => ({ ...await actual(), isSupabaseConfigured: true, supabase: fixture.supabase }))
vi.mock('../../../lib/agencyCrmRepository', async (actual) => ({ ...await actual(), listAgencyCrmLeadContacts: fixture.crm, createAgencyCrmLeadRecord: fixture.createLead }))
vi.mock('../../../lib/agencyPipelineService', async (actual) => ({ ...await actual(), listAppointmentsAsync: fixture.appointments }))
vi.mock('../../../services/workspaceCalendarService', () => ({ loadWorkspaceMarketingCalendar: fixture.marketing }))
vi.mock('../../../services/calendarTimeChangeService', () => ({ readCalendarTimeChange: fixture.timeRead, changeCalendarTime: fixture.timeChange }))
vi.mock('../../../services/privateListingService', async (actual) => ({ ...await actual(), getOrganisationPrivateListings: fixture.listings }))
vi.mock('../../../services/leadEmailCaptureService', async (actual) => ({ ...await actual(), listInboundLeadEmails: fixture.inbound }))
vi.mock('../../../lib/settingsApi', async (actual) => ({
  ...await actual(),
  listOrganisationUsers: async () => [{ ...fixture.profile, userId: fixture.profile.id, status: 'active' }],
  fetchOrganisationSettings: async () => ({ organisation: fixture.workspace, membershipRole: 'owner' }),
}))
vi.mock('../../../lib/canvassingRepository', async (actual) => ({ ...await actual(), listCanvassingWorkspace: async () => ({ prospects: [], activities: [] }) }))
import AgencyPipelinePage from '../AgencyPipelinePage'

beforeEach(() => { fixture.marketing.mockReset().mockResolvedValue({ items: [], warnings: [] }); fixture.directory.mockResolvedValue({ clients: [] }); fixture.timeRead.mockImplementation(async appointmentId => ({verified:true,appointmentId,revision:1,supported:true,canManage:true,canRequest:true,selfParticipantId:'agent',active:null,history:[],events:[]})); fixture.timeChange.mockReset(); fixture.crm.mockResolvedValue({ leads: [], contacts: [], leadActivities: [], tasks: [] }); fixture.appointments.mockResolvedValue([]) })
afterEach(async () => {
  cleanup()
  await act(async () => { await vi.dynamicImportSettled() })
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('calendar refresh request volume', () => {
  it('keeps tab focus and routine polling out of the full CRM loader', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    render(<MemoryRouter initialEntries={['/pipeline/calendar']}><AgencyPipelinePage initialViewMode="calendar" /></MemoryRouter>)
    await act(async () => { await vi.dynamicImportSettled() })
    await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeTruthy()
    expect(screen.queryByText('Your connected calendar')).toBeNull()
    expect(screen.queryByLabelText('Calendar health')).toBeNull()
    expect(fixture.crm).toHaveBeenCalled()
    expect(fixture.appointments).toHaveBeenCalled()
    fixture.marketing.mockClear()
    fixture.crm.mockClear()
    fixture.listings.mockClear()
    fixture.inbound.mockClear()
    fixture.appointments.mockClear()

    for (let event = 0; event < 20; event += 1) {
      act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
      await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(65000) })
    expect(fixture.marketing).not.toHaveBeenCalled()
    expect(fixture.crm).not.toHaveBeenCalled()
    expect(fixture.listings).not.toHaveBeenCalled()
    expect(fixture.inbound).not.toHaveBeenCalled()
    expect(fixture.appointments.mock.calls.length).toBeGreaterThan(0)
    expect(fixture.appointments.mock.calls.length).toBeLessThanOrEqual(4)
  }, 30000)

  it('waits for timed-out CRM reads before starting the single queued refresh', async () => {
    vi.useFakeTimers()
    let resolveFirst
    const first = new Promise((resolve) => { resolveFirst = resolve })
    let primaryReads = 0
    fixture.crm.mockImplementation((_org, options) => {
      const empty = { leads: [], contacts: [], leadActivities: [], tasks: [] }
      if (options?.includePrimaryRecords === false) return Promise.resolve(empty)
      primaryReads += 1
      return primaryReads === 1 ? first : Promise.resolve(empty)
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<MemoryRouter initialEntries={['/pipeline/calendar']}><AgencyPipelinePage initialViewMode="calendar" /></MemoryRouter>)
    await act(async () => { await vi.dynamicImportSettled() })
    await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
    const changed = fixture.channel.on.mock.calls.find(([, filter]) => filter.table === 'leads')[2]
    for (let event = 0; event < 10; event += 1) {
      act(() => changed())
      await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    }
    expect(primaryReads).toBe(1)
    await act(async () => resolveFirst({ leads: [], contacts: [], leadActivities: [], tasks: [] }))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(primaryReads).toBe(2)
  }, 30000)

  it('does not start listing or email enrichment after leaving a slow calendar', async () => {
    vi.useFakeTimers()
    let resolveFirst
    fixture.crm.mockReturnValue(new Promise((resolve) => { resolveFirst = resolve }))
    const { unmount } = render(<MemoryRouter initialEntries={['/pipeline/calendar']}><AgencyPipelinePage initialViewMode="calendar" /></MemoryRouter>)
    await act(async () => { await vi.dynamicImportSettled() })
    expect(fixture.crm).toHaveBeenCalledTimes(1)
    unmount()
    await act(async () => resolveFirst({ leads: [], contacts: [], leadActivities: [], tasks: [] }))
    await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
    expect(fixture.crm).toHaveBeenCalledTimes(1)
    expect(fixture.listings).not.toHaveBeenCalled()
    expect(fixture.inbound).not.toHaveBeenCalled()
  }, 30000)
})


it('opens appointment details first and keeps booked time separate from detail edits', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-19T08:00:00Z'))
  fixture.appointments.mockResolvedValue([{
    appointmentId: '30000000-0000-4000-8000-000000000001', organisationId: fixture.org,
    assignedAgentId: fixture.profile.id, createdBy: fixture.profile.id,
    title: 'Calendar layout review', appointmentType: 'seller_valuation', status: 'confirmed',
    date: '2026-10-21', startTime: '10:00', endTime: '11:00',
    dateTime: '2026-10-21T08:00:00Z', endDateTime: '2026-10-21T09:00:00Z',
    timezone: 'Africa/Johannesburg', calendarRevision: 1, hasConfirmedReservation: true,
    participants: [], location: '24 Oak Avenue', locationType: 'physical_address',
    notes: 'Review this booking', sendInviteEmails: false, remindersEnabled: false,
  }])
  render(<MemoryRouter initialEntries={['/pipeline/calendar']}><AgencyPipelinePage initialViewMode="calendar" /></MemoryRouter>)
  await act(async () => { await vi.dynamicImportSettled() })
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  fireEvent.click(screen.getByRole('button', { name: /Calendar layout review, 10:00 to 11:00/ }))
  let dialog = screen.getByRole('dialog', { name: 'Calendar layout review' })
  let editor = within(dialog)
  expect(dialog.classList.contains('appointment-detail')).toBe(true)
  expect(editor.getByLabelText('Appointment overview')).toBeTruthy()
  expect(editor.getByText('Wednesday, 21 October 2026')).toBeTruthy()
  expect(editor.getByText('10:00 – 11:00')).toBeTruthy()
  await act(async () => {})
  expect(editor.getByRole('button', { name: 'Request a new time' })).toBeTruthy()
  expect(editor.queryByLabelText('Appointment type')).toBeNull()
  expect(editor.queryByRole('button', { name: 'Save appointment' })).toBeNull()
  expect(editor.queryByText('Your connected calendar')).toBeNull()
  expect(editor.queryByText('Connect Google')).toBeNull()
  expect(editor.queryByText('Connect Outlook')).toBeNull()
  expect(editor.queryByText(/Changing the time sends a reschedule proposal/)).toBeNull()
  const options = editor.getByText('More options').closest('details')
  expect(options.open).toBe(false)
  fireEvent.click(editor.getByText('More options'))
  expect(editor.getByRole('button', { name: 'Copy Link' })).toBeTruthy()
  expect(editor.queryByLabelText('Send reminders')).toBeNull()
  fireEvent.click(editor.getByRole('button', { name: 'Edit appointment' }))
  dialog = screen.getByRole('dialog', { name: 'Edit appointment' })
  editor = within(dialog)
  expect(editor.getByLabelText('Appointment type').value).toBe('seller_valuation')
  expect(editor.getByRole('button', { name: 'Organiser', exact: true }).textContent).toContain('Calendar Agent')
  expect(editor.queryByText(/Changing the time sends a reschedule proposal/)).toBeNull()
  expect(editor.getByRole('button', { name: '60 min' }).getAttribute('aria-pressed')).toBe('true')
  expect(editor.getByRole('button', { name: '90 min' }).matches(':disabled')).toBe(true)
  expect(editor.getByLabelText('Date').matches(':disabled')).toBe(true)
  expect(editor.getByText(/To move this booking, return to its details/)).toBeTruthy()
  const notes = editor.getByPlaceholderText('Add an optional note...')
  fireEvent.change(notes, { target: { value: 'Unsaved note' } })
  expect(editor.getByLabelText('Send appointment invitations and updates').checked).toBe(false)
  expect(editor.getByLabelText('Send reminders').checked).toBe(false)
  expect(editor.getByRole('button', { name: 'Save appointment' }).getAttribute('form')).toBe('appointment-modal-form')
  fireEvent.click(editor.getByRole('button', { name: 'Cancel edits' }))
  dialog = screen.getByRole('dialog', { name: 'Calendar layout review' })
  editor = within(dialog)
  expect(editor.getByText('Review this booking')).toBeTruthy()
  expect(editor.queryByText('Unsaved note')).toBeNull()
  expect(editor.getByText('10:00 – 11:00')).toBeTruthy()
  fireEvent.click(editor.getByRole('button', { name: 'Close', exact: true }))
  expect(screen.queryByRole('dialog', { name: 'Calendar layout review' })).toBeNull()
}, 30000)

it('keeps new appointments immediately editable with optional notes and attendees', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-19T08:00:00Z'))
  render(<MemoryRouter initialEntries={['/pipeline/calendar']}><AgencyPipelinePage initialViewMode="calendar" /></MemoryRouter>)
  await act(async () => { await vi.dynamicImportSettled() })
  await act(async () => { await vi.advanceTimersByTimeAsync(10000) })
  fireEvent.click(screen.getByRole('button', { name: 'Appointment', exact: true }))
  const editor = within(screen.getByRole('dialog', { name: 'Create Appointment' }))
  const type = editor.getByLabelText('Appointment type')
  expect(within(type).queryByRole('option', { name: 'Bond Signing' })).toBeNull()
  expect(within(type).queryByRole('option', { name: 'Attorney Consultation' })).toBeNull()
  expect(within(type).getByRole('option', { name: 'Viewing' })).toBeTruthy()
  expect(editor.queryByLabelText('Related record')).toBeNull()
  expect(editor.getByRole('button', { name: 'Clients', exact: true })).toBeTruthy()
  expect(editor.getByRole('button', { name: '45 min' }).getAttribute('aria-pressed')).toBe('true')
  expect(editor.queryByPlaceholderText('Add an optional note...')).toBeNull()
  expect(editor.queryByPlaceholderText('Name')).toBeNull()
  fireEvent.click(editor.getByRole('button', { name: 'Add note' }))
  expect(editor.getByPlaceholderText('Add an optional note...')).toBeTruthy()
  fireEvent.click(editor.getByText('Other guests'))
  fireEvent.click(editor.getByRole('button', { name: 'Add attendee', exact: true }))
  expect(editor.getByPlaceholderText('Name')).toBeTruthy()
  expect(editor.getByRole('button', { name: 'Save draft' })).toBeTruthy()
  fireEvent.click(editor.getByRole('button', { name: 'Cancel', exact: true }))
  expect(screen.queryByRole('dialog')).toBeNull()
}, 30000)

it('reviews a request from the desktop card without restarting the full CRM loader',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-19T08:00:00Z'))
 const appointmentId='30000000-0000-4000-8000-000000000002'
 const request={id:'request',appointment_id:appointmentId,participant_id:'buyer',requested_by:'buyer-user',status:'pending',preferred_start:'2026-10-22T09:00:00Z',preferred_end:'2026-10-22T10:00:00Z',request_expires_at:'2026-10-20T08:00:00Z'}
 const state={verified:true,appointmentId,revision:1,supported:true,canManage:true,canRequest:false,selfParticipantId:'agent',active:request,history:[request],events:[]}
 fixture.timeRead.mockResolvedValue(state)
 fixture.timeChange.mockResolvedValue({...state,revision:2,selfProposalResponse:'Accepted',active:{...request,status:'proposed',hold_expires_at:'2026-10-20T08:00Z'}})
 fixture.appointments.mockResolvedValue([{appointmentId,organisationId:fixture.org,assignedAgentId:fixture.profile.id,createdBy:fixture.profile.id,title:'Time change review',appointmentType:'viewing',status:'alternative_requested',hasConfirmedReservation:true,calendarRevision:1,date:'2026-10-21',startTime:'10:00',endTime:'11:00',dateTime:'2026-10-21T08:00Z',endDateTime:'2026-10-21T09:00Z',timezone:'Africa/Johannesburg',participants:[]}])
 render(<MemoryRouter initialEntries={['/pipeline/calendar']}><AgencyPipelinePage initialViewMode="calendar" /></MemoryRouter>)
 await act(async()=>{await vi.dynamicImportSettled();await vi.advanceTimersByTimeAsync(10000)})
 fireEvent.click(screen.getByRole('button',{name:/Time change review, 10:00 to 11:00/}))
 await act(async()=>{})
 fixture.crm.mockClear()
 fireEvent.click(screen.getByRole('button',{name:'Propose this time'}))
 await act(async()=>{})
 expect(fixture.timeChange).toHaveBeenCalledWith(expect.objectContaining({action:'propose',appointmentId,expectedRevision:1,requestId:'request'}))
 expect(screen.getByText('New time proposed')).toBeTruthy()
 expect(within(screen.getByRole('dialog',{name:'Time change review'})).getByText('10:00 – 11:00')).toBeTruthy()
 expect(fixture.crm).not.toHaveBeenCalled()
},30000)

it('loads the Clients directory only when booking and searches saved people without a lead', async () => {
  vi.useFakeTimers()
  fixture.crm.mockResolvedValue({ leads: [{ leadId: 'lead-one', contactId: 'contact-one', leadCategory: 'seller' }], contacts: [{ contactId: 'contact-one', firstName: 'Laetitia', lastName: 'Leach', email: 'laetitia@example.test' }], leadActivities: [], tasks: [] })
  fixture.directory.mockResolvedValue({ clients: [{ id: 'saved-profile', name: 'Lien Saved', email: 'lien@example.test', typeLabel: 'Buyer', linkedLeadIds: [], sources: [] }] })
  render(<MemoryRouter initialEntries={['/pipeline/calendar']}><AgencyPipelinePage initialViewMode="calendar" /></MemoryRouter>)
  await act(async () => { await vi.dynamicImportSettled(); await vi.advanceTimersByTimeAsync(10000) })
  expect(fixture.directory).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Appointment', exact: true }))
  await act(async () => { await vi.dynamicImportSettled() })
  expect(fixture.directory).toHaveBeenCalledWith(expect.objectContaining({ workspace: { id: fixture.org }, deferActivity: true }))
  const editor = within(screen.getByRole('dialog', { name: 'Create Appointment' }))
  fireEvent.click(editor.getByRole('button', { name: 'Clients', exact: true }))
  expect(editor.getByRole('button', { name: /Laetitia Leach laetitia@example.test/ })).toBeTruthy()
  fireEvent.change(editor.getByRole('searchbox'), { target: { value: 'lien' } })
  fireEvent.click(editor.getByRole('button', { name: /Lien Saved lien@example.test/ }))
  expect(editor.getByRole('button', { name: 'Clients', exact: true }).textContent).toContain('Lien Saved')
  expect(fixture.createLead).not.toHaveBeenCalled()
}, 30000)

it('keeps the booking open and retries a failed client directory read', async () => {
  vi.useFakeTimers()
  fixture.directory.mockRejectedValueOnce(new Error('Temporary network failure')).mockResolvedValue({ clients: [{ id: 'saved', name: 'Saved Seller', email: 'saved@example.test', linkedLeadIds: [], sources: [] }] })
  render(<MemoryRouter initialEntries={['/pipeline/calendar']}><AgencyPipelinePage initialViewMode="calendar" /></MemoryRouter>)
  await act(async () => { await vi.dynamicImportSettled(); await vi.advanceTimersByTimeAsync(10000) })
  fireEvent.click(screen.getByRole('button', { name: 'Appointment', exact: true }))
  await act(async () => { await vi.dynamicImportSettled() })
  const editor = within(screen.getByRole('dialog', { name: 'Create Appointment' }))
  fireEvent.click(editor.getByRole('button', { name: 'Clients', exact: true }))
  expect(editor.getByRole('alert').textContent).toContain('Some saved clients could not load')
  fireEvent.click(editor.getByRole('button', { name: 'Retry clients' }))
  await act(async () => { await vi.dynamicImportSettled() })
  expect(editor.getByRole('button', { name: /Saved Seller saved@example.test/ })).toBeTruthy()
  expect(fixture.directory).toHaveBeenCalledTimes(2)
}, 30000)

it('creates a client through the existing lead service and selects them without sending a lead notification', async () => {
  vi.useFakeTimers()
  fixture.createLead.mockResolvedValue({ leadId: 'new-lead', contactId: 'new-contact', leadCategory: 'buyer', firstName: 'Taylor', lastName: 'Jones', email: 'taylor@example.test' })
  render(<MemoryRouter initialEntries={['/pipeline/calendar']}><AgencyPipelinePage initialViewMode="calendar" /></MemoryRouter>)
  await act(async () => { await vi.dynamicImportSettled(); await vi.advanceTimersByTimeAsync(10000) })
  fireEvent.click(screen.getByRole('button', { name: 'Appointment', exact: true }))
  const editor = within(screen.getByRole('dialog', { name: 'Create Appointment' }))
  fireEvent.click(editor.getByRole('button', { name: 'Clients', exact: true }))
  fireEvent.click(editor.getByRole('button', { name: 'Create new client' }))
  for (const [label, value] of [['First name', 'Taylor'], ['Surname', 'Jones'], ['Email', 'taylor@example.test'], ['Phone', '0821234567']]) {
    fireEvent.change(editor.getByLabelText(label, { exact: true }), { target: { value } })
  }
  fireEvent.click(editor.getByRole('button', { name: 'Create client & add' }))
  await act(async () => {})
  expect(fixture.createLead).toHaveBeenCalledTimes(1)
  expect(fixture.createLead).toHaveBeenCalledWith(fixture.org, expect.objectContaining({
    leadSource: 'Manual Entry', leadCategory: 'buyer',
    contact: expect.objectContaining({ firstName: 'Taylor', email: 'taylor@example.test' }),
  }), expect.objectContaining({ notifyAgent: false }))
  expect(editor.getByRole('button', { name: 'Clients', exact: true }).textContent).toContain('Taylor Jones')
}, 30000)

it('shows the shared calendar tabs and workspace marketing on the actual calendar route', async () => {
 vi.useFakeTimers()
 const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
 fixture.marketing.mockResolvedValue({ items: [{ id: 'plan', type: 'campaign', campaignId: 'plan', title: 'Workspace campaign', status: 'active', startDate: date, endDate: date }], warnings: [] })
 render(<MemoryRouter initialEntries={['/pipeline/calendar']}><AgencyPipelinePage initialViewMode="calendar" /></MemoryRouter>)
 await act(async () => { await vi.dynamicImportSettled(); await vi.advanceTimersByTimeAsync(10000) })
 expect(screen.getByRole('heading', { name: 'Calendar' })).toBeTruthy()
 expect(screen.getByRole('button', { name: /Campaign plan · Workspace campaign/ })).toBeTruthy()
 expect(fixture.marketing).toHaveBeenCalledWith(fixture.org, expect.objectContaining({ signal: expect.any(AbortSignal) }))
 fireEvent.click(screen.getByRole('tab', { name: 'Appointments', exact: true }))
 expect(screen.queryByRole('button', { name: /Campaign plan · Workspace campaign/ })).toBeNull()
 await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'Marketing', exact: true })); await vi.advanceTimersByTimeAsync(1000) })
 expect(screen.getByRole('button', { name: /Campaign plan · Workspace campaign/ })).toBeTruthy()
 expect(screen.queryByRole('button', { name: 'Appointment', exact: true })).toBeNull()
})
