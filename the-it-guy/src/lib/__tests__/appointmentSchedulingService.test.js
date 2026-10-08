import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ rows: [], participants: [], writes: [], readError: null, unsafeFallback: false, rpc: vi.fn(), select: vi.fn(), cancel: vi.fn(), notify: vi.fn(), schedule: vi.fn() }))

vi.mock('../supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: fixture.rpc,
    from(table) {
      const filters = []
      let operation = 'read', payload
      const matches = row => filters.every(([key, values]) => Array.isArray(values) ? values.includes(row[key]) : row[key] === values)
      const run = () => {
        if (operation === 'read' && fixture.readError?.table === table) return { data: null, error: fixture.readError.error }
        const rows = table === 'appointments' ? fixture.rows : table === 'appointment_participants' ? fixture.participants : []
        if (operation === 'insert') {
          const added = (Array.isArray(payload) ? payload : [payload]).map(row => ({ ...row, participant_id: row.participant_id || `person-${rows.length}` }))
          rows.push(...added)
          fixture.writes.push({ table, operation, payload })
          return { data: added, error: null }
        }
        if (operation === 'update') {
          const changed = rows.filter(matches)
          changed.forEach(row => Object.assign(row, payload))
          fixture.writes.push({ table, operation, payload })
          return { data: changed, error: null }
        }
        if (operation === 'delete') {
          const kept = rows.filter(row => !matches(row))
          if (table === 'appointment_participants') fixture.participants = kept
          fixture.writes.push({ table, operation })
          return { data: [], error: null }
        }
        return { data: rows.filter(matches), error: null }
      }
      const query = {
        select: columns => { fixture.select(table, columns); return query }, order: () => query, gte: () => query, lt: () => query, limit: () => query,
        eq: (key, value) => { filters.push([key, value]); return query },
        in: (key, values) => { filters.push([key, values]); return query },
        insert: value => { operation = 'insert'; payload = value; return query },
        update: value => { operation = 'update'; payload = value; return query },
        delete: () => { operation = 'delete'; return query },
        async maybeSingle() { const result = run(); return { ...result, data: result.data[0] || null } },
        then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
      }
      return query
    },
  },
}))
vi.mock('../envValidation', () => ({ isUnsafeFallbackAllowed: () => fixture.unsafeFallback }))
vi.mock('../../services/appointmentNotificationService', () => ({
  cancelAppointmentReminders: fixture.cancel,
  notifyAppointmentParticipants: fixture.notify,
  scheduleAppointmentReminders: fixture.schedule,
}))
import { createAppointmentAsync, listAppointmentsAsync, updateAppointmentAsync, setAppointmentArchiveAsync } from '../agencyPipelineService'
import { generateAppointmentICS } from '../../services/appointmentCalendarInviteService'

const ORG = '11111111-1111-4111-8111-111111111111'
const AGENT = { id: '22222222-2222-4222-8222-222222222222', name: 'Agent A', email: 'agent@example.test' }
const ID = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2027-10-01T06:00:00Z')
const INPUT = { appointmentType: 'viewing', date: '2027-10-01', startTime: '11:30', endTime: '12:00', assignedAgent: AGENT, sendInviteEmails: false }
const ROW = {
  appointment_id: ID, organisation_id: ORG, agent_id: AGENT.id, appointment_type: 'viewing',
  appointment_date: INPUT.date, start_time: INPUT.startTime, end_time: INPUT.endTime,
  date_time: '2027-10-01T09:30:00Z', timezone: 'Africa/Johannesburg', status: 'requested',
}

beforeEach(() => {
  fixture.readError = null
  fixture.unsafeFallback = false
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  fixture.rows = []
  fixture.participants = []
  fixture.writes = []
  fixture.select.mockReset()
  fixture.cancel.mockReset().mockResolvedValue(0)
  fixture.notify.mockReset().mockResolvedValue([])
  fixture.schedule.mockReset().mockResolvedValue([])
  fixture.rpc.mockReset().mockImplementation(async (name, args) => {
    if (name === 'bridge_list_calendar_appointments_with_times') return { data: fixture.rows, error: null }
    if (name !== 'save_calendar_appointment_with_delivery') throw new Error(`Unexpected RPC ${name}`)
    const previous = fixture.rows.find(row => row.appointment_id === args.p_appointment_id)
    const row = { ...previous, ...args.p_payload, appointment_id: args.p_appointment_id,
      organisation_id: args.p_organisation_id, calendar_revision: previous ? (previous.calendar_revision || 0) + 1 : 0,
      reservation_managed: true, created_at: previous?.created_at || NOW.toISOString(),
      hold_expires_at: previous?.hold_expires_at || new Date(Math.min(NOW.getTime() + 86400000, Date.parse(args.p_payload.date_time))).toISOString() }
    if (previous) Object.assign(previous, row)
    else fixture.rows.push(row)
    if (args.p_participants) fixture.participants = args.p_participants.map((p, index) => ({ ...p,
      participant_id: p.participant_id || `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      organisation_id: row.organisation_id, appointment_id: row.appointment_id, rsvp_status: 'Pending' }))
    fixture.writes.push({ table: 'appointments', operation: 'command', payload: args })
    row.calendar_delivery_managed = true
    return { data: { verified: true, appointment: row, participants: fixture.participants.filter(p => p.appointment_id === row.appointment_id), delivery: { verified: true, revision: row.calendar_revision, jobs: [] } }, error: null }
  })
})
afterEach(() => { vi.useRealTimers() })

describe('Ordinary appointment saves and reloads', () => {
  it('saves a SAST instant and duration and moves them together on edit', async () => {
    const saved = await createAppointmentAsync(ORG, INPUT, { actor: AGENT })
    expect(fixture.rows[0]).toMatchObject({ date_time: '2027-10-01T09:30:00.000Z', end_time: '12:00' })
    const moved = await updateAppointmentAsync(ORG, saved.appointmentId, { date: '2027-10-02', startTime: '15:00', endTime: '15:30' }, { suppressNotifications: true })
    expect(moved).toMatchObject({ date: '2027-10-02', startTime: '15:00', endTime: '15:30', dateTime: '2027-10-02T13:00:00.000Z', endDateTime: '2027-10-02T13:30:00.000Z' })
    expect((await listAppointmentsAsync(ORG, { includeAll: true }))[0].dateTime).toBe(moved.dateTime)
    expect(fixture.rows[0].date_time).toBe(moved.dateTime)
  })
  it('supports duration, timezone and timestamp-only edits', async () => {
    fixture.rows = [{ ...ROW }]
    const longer = await updateAppointmentAsync(ORG, ID, { durationMinutes: 90 }, { suppressNotifications: true })
    expect(longer.endDateTime).toBe('2027-10-01T11:00:00.000Z')
    const utc = await updateAppointmentAsync(ORG, ID, { timezone: 'UTC' }, { suppressNotifications: true })
    expect(utc.dateTime).toBe('2027-10-01T11:30:00.000Z')
    const moved = await updateAppointmentAsync(ORG, ID, { dateTime: '2027-10-02T15:00:00Z' }, { suppressNotifications: true })
    expect(moved).toMatchObject({ date: '2027-10-02', startTime: '15:00', endTime: '16:30', endDateTime: '2027-10-02T16:30:00.000Z' })
  })
  it('saves and reloads all-day boundaries without the form clock times', async () => {
    const saved = await createAppointmentAsync(ORG, { ...INPUT, allDay: true }, { actor: AGENT })
    expect(saved).toMatchObject({ allDay: true, startTime: '00:00', dateTime: '2027-09-30T22:00:00.000Z', endDateTime: '2027-10-01T22:00:00.000Z' })
    expect(fixture.rows[0]).toMatchObject({ all_day: true, appointment_date: '2027-10-01', date_time: saved.dateTime })
    expect((await listAppointmentsAsync(ORG, { includeAll: true }))[0].endDateTime).toBe(saved.endDateTime)
  })
  it('retains the chosen end instant in a repeated daylight-saving hour after reload', async () => {
    const saved = await createAppointmentAsync(ORG, {
      ...INPUT, date: '2027-11-07', startTime: '00:30', endTime: '01:30',
      timezone: 'America/New_York', endDateTime: '2027-11-07T01:30:00-05:00',
      allowOutsideBusinessHours: true,
    }, { actor: AGENT })
    expect(fixture.rows[0].end_date_time).toBe('2027-11-07T06:30:00.000Z')
    const reloaded = (await listAppointmentsAsync(ORG, { includeAll: true }))[0]
    expect(reloaded.endDateTime).toBe(saved.endDateTime)
    expect(Date.parse(reloaded.endDateTime) - Date.parse(reloaded.dateTime)).toBe(120 * 60000)
    expect(reloaded.schedulingTimeIssue).toBeNull()
    const exported = await generateAppointmentICS(saved.appointmentId)
    expect(exported.content).toContain('DTEND:20271107T063000Z')
    expect(fixture.select).toHaveBeenCalledWith('appointments', expect.stringContaining('end_date_time, timezone, all_day'))
  })
  for (const changes of [{ date: '2027-02-30' }, { endTime: '10:00' }, { timezone: 'Unknown/Zone' }, { durationMinutes: -5 }, { dateTime: '2027-10-01T11:30:00Z' }, { status: 'made_up_status' }]) {
    it(`rejects invalid creation before writes: ${JSON.stringify(changes)}`, async () => {
      await expect(createAppointmentAsync(ORG, { ...INPUT, ...changes }, { actor: AGENT })).rejects.toThrow()
      expect(fixture.writes).toHaveLength(0)
    })
  }
  it('rejects an invalid edit without changing the saved record', async () => {
    fixture.rows = [{ ...ROW }]
    await expect(updateAppointmentAsync(ORG, ID, { endTime: '10:00' }, { suppressNotifications: true })).rejects.toThrow(/end time/)
    expect(fixture.rows[0]).toEqual(ROW)
    expect(fixture.writes).toHaveLength(0)
  })
})

describe('Terminal appointment actions', () => {
  for (const status of ['cancelled', 'declined', 'completed', 'no_show']) {
    it(`saves ${status} despite an existing overlap and never starts another availability read`, async () => {
      vi.setSystemTime(new Date('2027-10-01T13:00:00Z'))
      fixture.rows = [{ ...ROW }, { ...ROW, appointment_id: 'overlap', status: 'confirmed' }]
      const saved = await updateAppointmentAsync(ORG, ID, { status }, { actor: AGENT, suppressNotifications: true })
      expect(saved.status).toBe(status)
      expect(fixture.rows[0].status).toBe(status)
      // The existing reader loads before/after receipts through this RPC, but
      // a scheduling check would issue a bounded availability range instead.
      expect(fixture.rpc.mock.calls.filter(([name]) => name === 'bridge_list_calendar_appointments_with_times').every(([, args]) => args.p_from === null && args.p_to === null)).toBe(true)
    })
  }
  it('cancels an inconsistent historical time without guessing its correction', async () => {
    fixture.rows = [{ ...ROW, date_time: '2027-10-01T11:30:00Z' }]
    const saved = await updateAppointmentAsync(ORG, ID, { status: 'cancelled', cancellationReason: 'Client withdrew' }, { actor: AGENT, suppressNotifications: true })
    expect(saved).toMatchObject({ status: 'cancelled', cancelledBy: AGENT.id, cancellationReason: 'Client withdrew' })
    expect(fixture.rows[0]).toMatchObject({ date_time: '2027-10-01T11:30:00.000Z', start_time: '11:30' })
  })
  it('preserves saved instants when cancelling a historical booking with an invalid timezone', async () => {
    fixture.rows = [{ ...ROW, timezone: 'Unknown/Zone', end_date_time: '2027-10-01T10:00:00Z' }]
    const saved = await updateAppointmentAsync(ORG, ID, { status: 'cancelled' }, { actor: AGENT, suppressNotifications: true })
    expect(saved).toMatchObject({ status: 'cancelled', dateTime: '2027-10-01T09:30:00.000Z', endDateTime: '2027-10-01T10:00:00.000Z' })
    expect(fixture.rows[0]).toMatchObject({ timezone: 'Unknown/Zone', date_time: saved.dateTime, end_date_time: saved.endDateTime })
  })
  it('stops reminders for a no-show even when a resend was requested', async () => {
    vi.setSystemTime(new Date('2027-10-01T13:00:00Z'))
    fixture.rows = [{ ...ROW }]
    await updateAppointmentAsync(ORG, ID, { status: 'no_show', forceResendInvite: true })
    expect(fixture.rpc).toHaveBeenCalledWith('save_calendar_appointment_with_delivery', expect.objectContaining({ p_payload: expect.objectContaining({ status: 'no_show' }) }))
    expect(fixture.cancel).not.toHaveBeenCalled()
    expect(fixture.notify).not.toHaveBeenCalled()
    expect(fixture.schedule).not.toHaveBeenCalled()
  })
  for (const status of ['completed', 'no_show']) {
    it(`does not record a future ${status} outcome`, async () => {
      fixture.rows = [{ ...ROW }]
      await expect(updateAppointmentAsync(ORG, ID, { status }, { suppressNotifications: true })).rejects.toThrow(/after the appointment/)
      expect(fixture.writes).toHaveLength(0)
    })
  }
  it('does not reopen or move a closed booking', async () => {
    fixture.rows = [{ ...ROW, status: 'cancelled' }]
    for (const changes of [{ status: 'requested' }, { date: '2027-10-02' }]) {
      await expect(updateAppointmentAsync(ORG, ID, changes, { suppressNotifications: true })).rejects.toThrow(/closed/)
    }
    expect(fixture.writes).toHaveLength(0)
  })
})


describe('Verified mutation receipts', () => {
  it('rejects a missing appointment instead of returning a successful empty result', async () => {
    fixture.rows = []
    await expect(updateAppointmentAsync(ORG, ID, { status: 'cancelled' })).rejects.toThrow(/could not be loaded/)
    expect(fixture.rpc).not.toHaveBeenCalledWith('save_calendar_appointment_with_delivery', expect.anything())
    expect(fixture.notify).not.toHaveBeenCalled()
  })
  it.each([null, { verified: false }, { verified: true, appointment: { ...ROW, calendar_revision: 0 }, participants: [{ participant_id: ID, appointment_id: 'another-booking', organisation_id: ORG }] }])('rejects an incomplete or unrelated receipt before notifications: %j', async receipt => {
    fixture.rpc.mockImplementation(async name => name === 'save_calendar_appointment_with_delivery' ? { data: receipt, error: null } : { data: [], error: null })
    await expect(createAppointmentAsync(ORG, { ...INPUT, sendInviteEmails: true }, { actor: AGENT })).rejects.toThrow(/verified/)
    expect(fixture.notify).not.toHaveBeenCalled()
    expect(fixture.schedule).not.toHaveBeenCalled()
  })
  it('passes the displayed revision and command identity to the database', async () => {
    fixture.rows = [{ ...ROW, calendar_revision: 7 }]
    await updateAppointmentAsync(ORG, ID, { notes: 'Edit', expectedRevision: 3, commandId: ID }, { suppressNotifications: true })
    expect(fixture.rpc).toHaveBeenCalledWith('save_calendar_appointment_with_delivery', expect.objectContaining({ p_expected_revision: 3, p_command_id: ID }))
  })
})


describe('verified appointment reader failures', () => {
  it('surfaces network and permission errors instead of returning a successful fallback read', async () => {
    fixture.unsafeFallback = true
    for (const code of ['NETWORK_ERROR', '42501']) {
      fixture.rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'Read unavailable' } })
      await expect(listAppointmentsAsync(ORG, { includeAll: true })).rejects.toMatchObject({ code })
    }
    expect(fixture.select).not.toHaveBeenCalled()
  })
  it('does not lose co-agent attendance silently when the participant query fails', async () => {
    fixture.rows = [{ ...ROW }]
    fixture.readError = { table: 'appointment_participants', error: { code: 'NETWORK_ERROR', message: 'Attendance unavailable' } }
    await expect(listAppointmentsAsync(ORG, { includeAll: true })).rejects.toMatchObject({ message: 'Attendance unavailable' })
  })
  it('excludes a revoked participant but retains independent scheduling-owner access', async () => {
    fixture.rows = [{ ...ROW, agent_id: 'other', created_by: 'other' }]
    fixture.participants = [{ participant_id: 'participant', appointment_id: ID, organisation_id: ORG, user_id: AGENT.id, email: AGENT.email, rsvp_revoked_at: new Date().toISOString() }]
    expect(await listAppointmentsAsync(ORG, { agentId: AGENT.id })).toEqual([])
    fixture.rows[0].scheduling_owner_user_id = AGENT.id
    expect(await listAppointmentsAsync(ORG, { agentId: AGENT.id })).toHaveLength(1)
  })
  it('retains hold deadlines and revision metadata through the schema-compatible direct reader', async () => {
    fixture.rows = [{ ...ROW, calendar_revision: 9, request_issued_at: '2027-10-01T06:00Z', hold_expires_at: '2027-10-01T09:30Z', has_confirmed_reservation: true }]
    fixture.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Missing function' } })
    const rows = await listAppointmentsAsync(ORG, { includeAll: true })
    expect(rows[0]).toMatchObject({ calendarRevision: 9, requestIssuedAt: '2027-10-01T06:00Z', holdExpiresAt: '2027-10-01T09:30Z', hasConfirmedReservation: true })
    expect(fixture.select).toHaveBeenCalledWith('appointments', expect.stringContaining('calendar_revision, request_issued_at, hold_expires_at'))
  })
})


describe('Persisted calendar delivery saves', () => {
  it('saves invitations off with the custom reminder intact across reload, without browser delivery', async () => {
    const rules = [{ reminderType: 'custom_30m', offsetMinutes: 30 }]
    const saved = await createAppointmentAsync(ORG, { ...INPUT, reminderRules: rules, remindersEnabled: true, emailTheme: 'kingstons_valuation' }, { actor: AGENT })
    expect(saved).toMatchObject({ sendInviteEmails: false, remindersEnabled: true, reminderRules: rules, emailTheme: 'kingstons_valuation', delivery: { verified: true } })
    expect((await listAppointmentsAsync(ORG, { includeAll: true }))[0]).toMatchObject({ sendInviteEmails: false, remindersEnabled: true, reminderRules: rules })
    expect(fixture.notify).not.toHaveBeenCalled(); expect(fixture.schedule).not.toHaveBeenCalled()
  })
  it('rejects an unverified queue receipt rather than reporting background delivery', async () => {
    const original = fixture.rpc.getMockImplementation()
    fixture.rpc.mockImplementation(async (name, args) => {
      const result = await original(name, args)
      if (name === 'save_calendar_appointment_with_delivery') result.data.delivery = { verified: true, revision: 99, jobs: [] }
      return result
    })
    await expect(createAppointmentAsync(ORG, INPUT, { actor: AGENT })).rejects.toThrow(/delivery queue could not be verified/)
    expect(fixture.notify).not.toHaveBeenCalled()
  })
})


describe('Archive receipts and stable save retries',()=>{
 it('accepts only the exact appointment and participant scope',async()=>{
  const receipt={verified:true,appointment:{...ROW,status:'cancelled',calendar_revision:3,archived_at:NOW.toISOString()},participants:[]}
  fixture.rpc.mockResolvedValueOnce({data:receipt,error:null})
  expect(await setAppointmentArchiveAsync(ORG,ID,{archive:true,reason:'Duplicate',expectedRevision:3,commandId:ID})).toMatchObject({appointmentId:ID,archivedAt:NOW.toISOString(),status:'cancelled'})
  for(const invalid of [{...receipt,appointment:{...receipt.appointment,organisation_id:AGENT.id}},{...receipt,participants:[{participant_id:AGENT.id,appointment_id:AGENT.id,organisation_id:ORG}]}]){
   fixture.rpc.mockResolvedValueOnce({data:invalid,error:null})
   await expect(setAppointmentArchiveAsync(ORG,ID,{archive:true,reason:'Duplicate',expectedRevision:3})).rejects.toThrow(/verified/)
  }
 })
 it('preserves participant command arguments on a lost create response',async()=>{
  const original=fixture.rpc.getMockImplementation();let failed=false
  fixture.rpc.mockImplementation(async(name,args)=>{const result=await original(name,args);if(name==='save_calendar_appointment_with_delivery' && !failed){failed=true;return {data:null,error:new Error('Response lost')}}return result})
  const payload={...INPUT,appointmentId:ID,commandId:AGENT.id,participants:[{participantId:'local-buyer',name:'Buyer',email:'buyer@example.test',participantRole:'Buyer'}]}
  await expect(createAppointmentAsync(ORG,payload,{actor:AGENT})).rejects.toThrow('Response lost')
  await createAppointmentAsync(ORG,payload,{actor:AGENT})
  const calls=fixture.rpc.mock.calls.filter(([name])=>name==='save_calendar_appointment_with_delivery')
  expect(calls[0][1]).toEqual(calls[1][1]);expect(calls[0][1].p_participants.every(p=>p.participant_id===null)).toBe(true)
 })
 it('lets overlapping drafts save while issuing the same slot is rejected',async()=>{
  fixture.rows=[{...ROW,appointment_id:AGENT.id,status:'confirmed',has_confirmed_reservation:true}]
  fixture.participants=[{participant_id:AGENT.id,appointment_id:AGENT.id,organisation_id:ORG,user_id:AGENT.id,email:AGENT.email,participant_role:'Agent',is_required:true}]
  const draft=await createAppointmentAsync(ORG,{...INPUT,status:'draft'},{actor:AGENT})
  expect(draft.status).toBe('draft')
  await expect(updateAppointmentAsync(ORG,draft.appointmentId,{status:'requested'},{actor:AGENT})).rejects.toThrow(/already booked|conflict|overlap/i)
 })
})
