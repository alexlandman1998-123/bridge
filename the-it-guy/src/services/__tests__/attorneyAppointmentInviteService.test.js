import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: null,
  notify: vi.fn(),
  schedule: vi.fn(),
  checkScheduling: vi.fn(),
}))

vi.mock('../attorneyFirmServiceShared', () => ({
  getAuthenticatedUser: vi.fn(async () => ({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'attorney@example.com',
    user_metadata: { full_name: 'Test Attorney' },
  })),
  isMissingColumnError: vi.fn((error, column = '') => ['42703', 'PGRST204'].includes(error?.code) && (!column || error.message?.includes(column))),
  isMissingTableError: vi.fn(() => false),
  normalizeText: (value = '') => String(value || '').trim(),
  requireClient: () => mocks.client,
}))

vi.mock('../appointmentNotificationService', () => ({
  notifyAppointmentParticipants: mocks.notify,
  scheduleAppointmentReminders: mocks.schedule,
  cancelAppointmentReminders: vi.fn(),
}))

vi.mock('../../lib/agencyPipelineService', () => ({
  checkAppointmentSchedulingIntegrityAsync: mocks.checkScheduling,
}))

import { createAttorneyAppointmentInvite, fetchAttorneyWorkspaceAppointments } from '../attorneyOperations'

function validInvite(overrides = {}) {
  return {
    organisationId: '11111111-1111-4111-8111-111111111111',
    transactionId: '22222222-2222-4222-8222-222222222222',
    appointmentType: 'attorney_consultation',
    recipientName: 'Test Client',
    recipientEmail: 'client@example.com',
    date: '2099-07-20',
    startTime: '10:00',
    locationMode: 'video_call',
    location: 'https://meet.example.com/invite',
    ...overrides,
  }
}

function createDatabase({ appointmentData = undefined, appointmentError = null } = {}) {
  const state = { appointmentPayload: null, participantRows: null, sendNotifications: null, attachCalendar: null }
  const client = { rpc: vi.fn(async (name, args) => {
    if (name === 'get_attorney_calendar_rollout_status') return {data:{enabled:true},error:null}
    if (name !== 'create_attorney_appointment_invite') return { data: null, error: null }
    state.appointmentPayload = args.p_appointment
    state.participantRows = args.p_participants
    state.sendNotifications = args.p_send_notifications
    state.attachCalendar = args.p_attach_calendar
    return { data: appointmentData === undefined ? { appointment: args.p_appointment, participants: args.p_participants } : appointmentData, error: appointmentError }
  }) }
  return { client, state }
}

beforeEach(() => {
  const database = createDatabase()
  mocks.client = database.client
  mocks.notify.mockReset().mockResolvedValue([{ email: { sent: true, status: 'sent' } }])
  mocks.schedule.mockReset().mockResolvedValue([{ id: 'reminder-1' }])
  mocks.checkScheduling.mockReset().mockResolvedValue({
    hasHardConflicts: false,
    hardConflicts: [],
    hasSoftConflicts: false,
    softConflicts: [],
    suggestedSlots: [],
  })
})

describe('Attorney atomic invite save', () => {
  it('saves canonical location, workflow and identities through one RPC without browser delivery', async () => {
    const database = createDatabase()
    mocks.client = database.client
    const saved = await createAttorneyAppointmentInvite(validInvite({linkedWorkflow:'transfer',linkedWorkflowStage:'buyer_signing'}))
    expect(database.state.appointmentPayload).toMatchObject({appointment_type:'attorney_consultation',timezone:'Africa/Johannesburg',location_type:'video_call',meeting_url:'https://meet.example.com/invite',linked_workflow:'transfer',linked_workflow_stage:'buyer_signing'})
    expect(database.state.participantRows).toEqual(expect.arrayContaining([
      expect.objectContaining({email:'client@example.com',participant_role:'Client',rsvp_status:'Pending'}),
      expect.objectContaining({email:'attorney@example.com',participant_role:'Attorney',user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),
    ]))
    expect(saved.delivery.status).toBe('queued')
    expect(saved.deliveryCompletion).toBeUndefined()
    expect(mocks.notify).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })
  it('blocks real scheduling conflicts before the atomic save', async () => {
    const database = createDatabase(); mocks.client = database.client
    mocks.checkScheduling.mockResolvedValueOnce({hasHardConflicts:true,hardConflicts:[{type:'resource_overlap'}]})
    await expect(createAttorneyAppointmentInvite(validInvite())).rejects.toMatchObject({code:'APPOINTMENT_HARD_CONFLICT'})
    expect(database.state.appointmentPayload).toBeNull()
  })
  it('persists notifications off independently of calendar attachments', async () => {
    const database = createDatabase(); mocks.client = database.client
    const saved = await createAttorneyAppointmentInvite(validInvite({sendNotifications:false}))
    expect(database.state.sendNotifications).toBe(false)
    expect(saved.delivery.status).toBe('disabled')
    expect(mocks.notify).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })
  it('keeps queued email enabled with attachments switched off', async () => {
    const database = createDatabase(); mocks.client = database.client
    const saved = await createAttorneyAppointmentInvite(validInvite({attachCalendarInvite:false}))
    expect(database.state.attachCalendar).toBe(false)
    expect(database.state.sendNotifications).toBe(true)
    expect(saved.delivery).toMatchObject({status:'queued',calendarInviteRequested:false})
  })
  it('reports an atomic persistence failure without attempting a browser rollback or email', async () => {
    mocks.client = createDatabase({appointmentError:{message:'Recipients could not be saved',code:'23514'}}).client
    await expect(createAttorneyAppointmentInvite(validInvite())).rejects.toMatchObject({code:'23514'})
    expect(mocks.notify).not.toHaveBeenCalled()
  })
  it('fails clearly when durable save migration is missing', async () => {
    mocks.client = createDatabase({appointmentError:{code:'PGRST202'}}).client
    await expect(createAttorneyAppointmentInvite(validInvite())).rejects.toThrow(/latest database migration/)
  })
  it('never confirms a missing appointment or recipients', async () => {
    for (const appointmentData of [null,{appointment:{appointment_id:'wrong'},participants:[]}]) {
      mocks.client = createDatabase({appointmentData}).client
      await expect(createAttorneyAppointmentInvite(validInvite())).rejects.toThrow(/save could not be confirmed/)
    }
  })
})

describe('Attorney calendar organisation scopes', () => {
  function scopedClient(rows, missingColumn = '') {
    return { from: () => ({ select: (columns) => {
      const filters = []
      const query = {
        eq: (key, value) => { filters.push(row => row[key] === value); return query },
        is: (key, value) => { filters.push(row => row[key] === value); return query },
        in: (key, values) => { filters.push(row => values.includes(row[key])); return query },
        then: (resolve) => Promise.resolve(missingColumn && columns.includes(missingColumn)
          ? { data: null, error: { code: '42703', message: `column ${missingColumn} is missing` } }
          : { data: rows.filter(row => filters.every(test => test(row))), error: null }).then(resolve),
      }
      return query
    } }) }
  }
  const rows = [
    { appointment_id: 'agency-matter', organisation_id: 'agency', transaction_id: 'matter-1' },
    { appointment_id: 'developer-matter', organisation_id: 'developer', transaction_id: 'matter-2' },
    { appointment_id: 'other-matter', organisation_id: 'firm', transaction_id: 'matter-3' },
    { appointment_id: 'firm-internal', organisation_id: 'firm', transaction_id: null },
    { appointment_id: 'other-internal', organisation_id: 'agency', transaction_id: null },
  ]
  it('includes assigned matters across organisations and only this firm’s internal events', async () => {
    const result = await fetchAttorneyWorkspaceAppointments(scopedClient(rows), ['matter-1', 'matter-2'], 'firm')
    expect(result.map(row => row.appointment_id)).toEqual(['agency-matter', 'developer-matter', 'firm-internal'])
  })
  it('does not read unassigned matters when the firm has no assigned matters', async () => {
    expect((await fetchAttorneyWorkspaceAppointments(scopedClient(rows), [], 'firm')).map(row => row.appointment_id)).toEqual(['firm-internal'])
    expect(await fetchAttorneyWorkspaceAppointments(scopedClient(rows), [], '')).toEqual([])
  })
  it('preserves the assigned-matter scope when a legacy read schema needs a fallback', async () => {
    const result = await fetchAttorneyWorkspaceAppointments(scopedClient(rows, 'linked_workflow'), ['matter-1', 'matter-2'], 'firm')
    expect(result.map(row => row.appointment_id)).toEqual(['agency-matter', 'developer-matter', 'firm-internal'])
  })
  it('omits internal events when a legacy schema cannot safely identify their firm', async () => {
    const result = await fetchAttorneyWorkspaceAppointments(scopedClient(rows, 'organisation_id'), ['matter-1'], 'firm')
    expect(result.map(row => row.appointment_id)).toEqual(['agency-matter'])
  })
})
