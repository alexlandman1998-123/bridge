// @vitest-environment jsdom
// Real mobile form, application services, migration RPCs and worker gates.
// Only the Supabase transport and outbound HTTP are replaced; no hosted data.
import React from 'react'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { PGlite } from '@electric-sql/pglite'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { setupCalendarReservationDatabase, actor, second, outsider, org, otherOrg, id } from './calendarReservationFixture.js'
import { dispatchCalendarAppointmentJob } from '../../supabase/functions/_shared/calendarAppointmentDelivery.ts'
import { appointmentMatchesAgent, appointmentReadState } from '../src/core/appointments/appointmentReadModel.js'
import { getPrincipalAgentDetailCommandCentre } from '../src/modules/agency/agents/principalAgentCommandCentreService.js'
import { getAppointmentDashboardData } from '../src/services/appointmentDashboardService.js'

const transport = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), lostSave: false }))
vi.mock('../src/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: transport,
  invokeEdgeFunction: () => { throw new Error('Browser must not deliver messages') },
  getEdgeFunctionInvokeError: vi.fn(),
}))
vi.mock('../src/lib/settingsApi', () => ({ listOrganisationUsersForWorkspace: async () => [
  { userId: second, fullName: 'Co-agent', email: 'other@example.test', status: 'active' },
] }))
vi.mock('../src/lib/agencyCrmRepository', () => ({ listAgencyCrmLeadContacts: async () => ({ leads: [] }) }))
// These nested panels have separate rendering tests; keep real form/save/actions.
vi.mock('../src/components/appointments/AppointmentDeliveryStatus', () => ({ default: () => null }))
vi.mock('../src/components/appointments/AppointmentCalendarActions', () => ({ default: () => null }))
import MobileAppointmentWorkspace from '../src/components/appointments/MobileAppointmentWorkspace'
import { createAppointmentAsync, updateAppointmentAsync, listAppointmentsAsync } from '../src/lib/agencyPipelineService'
import AppointmentSupportPanel from '../src/components/appointments/AppointmentSupportPanel'
import { readCalendarHealth, readAppointmentSupport } from '../src/services/calendarSupportService'

let db
const agent = { id: actor, userId: actor, name: 'Agent', email: 'agent@example.test', canManageCalendar: true }
const configuration = { supabaseUrl: 'https://local.example.test', appUrl: 'https://app.example.test', serviceRoleKey: 'fixture-only' }
const identifier = value => {
  if (!/^[a-z_][a-z_0-9]*$/i.test(value)) throw new Error('Invalid fixture identifier')
  return value
}
async function role(user = actor, name = 'authenticated') {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user })])
  await db.exec(`set role ${identifier(name)}`)
}
async function rpc(name, args = {}) {
  try {
    const entries = Object.entries(args)
    const result = await db.query(`select ${identifier(name)}(${entries.map(([key], i) => `${identifier(key)}=>$${i + 1}`).join(',')}) as value`,
      entries.map(([, value]) => value !== null && typeof value === 'object' ? JSON.stringify(value) : value))
    if (name === 'save_calendar_appointment_with_delivery' && transport.lostSave) {
      transport.lostSave = false
      throw new Error('Save response lost after commit')
    }
    return { data: result.rows[0].value, error: null }
  } catch (error) { return { data: null, error } }
}
function from(table) {
  const conditions = [], values = []
  let order = '', limit = ''
  const predicate = (column, operator, value) => {
    values.push(value)
    conditions.push(`${identifier(column)} ${operator} $${values.length}`)
    return query
  }
  const run = async single => {
    try {
      const { rows } = await db.query(`select * from ${identifier(table)}${conditions.length ? ` where ${conditions.join(' and ')}` : ''}${order}${limit}`, values)
      return { data: single ? rows[0] || null : rows, error: null }
    } catch (error) { return { data: null, error } }
  }
  const query = {
    select: () => query, eq: (key, value) => predicate(key, '=', value),
    gte: (key, value) => predicate(key, '>=', value), lt: (key, value) => predicate(key, '<', value),
    in: (key, value) => { values.push(value); conditions.push(`${identifier(key)} = any($${values.length})`); return query },
    order: (key, options = {}) => { order = ` order by ${identifier(key)} ${options.ascending === false ? 'desc' : 'asc'}`; return query },
    limit: count => { if (!Number.isInteger(count)) throw new Error('Invalid limit'); limit = ` limit ${count}`; return query },
    maybeSingle: () => run(true), then: (resolve, reject) => run(false).then(resolve, reject),
  }
  return query
}
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const read = () => listAppointmentsAsync(org, { includeAll: true })
async function jobs() { await db.exec('reset role'); return (await db.query('select * from calendar_delivery_jobs order by created_at,id')).rows }
async function claim() { await role(actor, 'service_role'); return (await db.query('select * from claim_calendar_delivery(25)')).rows }
beforeAll(async () => {
  db = new PGlite()
  await setupCalendarReservationDatabase(db, name => readFile(resolve(process.cwd(), '../supabase/migrations', name), 'utf8'))
  await db.exec(`alter table profiles add column full_name text;
    alter table appointment_resources add column resource_name text;
    alter table appointments add column offer_invite_id uuid;
    grant select on appointments,appointment_participants,profiles to service_role;
    grant select on appointment_resources to authenticated;`)
}, 30000)
beforeEach(async () => {
  cleanup()
  await db.exec('reset role;truncate appointments,appointment_participants,private.calendar_mutation_receipts,private.calendar_provider_receipts cascade')
  await db.query("update organisation_users set status='active' where organisation_id=$1 and user_id=$2", [org, actor])
  transport.rpc.mockImplementation(rpc)
  transport.from.mockImplementation(from)
  transport.lostSave = false
  await role()
})
afterEach(cleanup)
afterAll(async () => db?.close())

it('recovers an exhausted delivery through the support screen, scoped RPC and actual worker receipt', async () => {
  const row = await createAppointmentAsync(org, { commandId: id(450), appointmentType: 'client_meeting', date: '2099-07-25', startTime: '10:00', endTime: '11:00', assignedAgent: agent }, { actor: agent })
  await db.exec('reset role')
  await db.query("update calendar_delivery_jobs set status='failed',attempt_count=max_attempts where event_kind='invite' and channel='email'")
  await role()
  const report = await readCalendarHealth(org)
  expect(report.issues.some(issue => issue.kind === 'delivery_exhausted' && issue.inspectAllowed && issue.appointment_id === row.appointmentId)).toBe(true)
  const original = (await readAppointmentSupport(org, row.appointmentId)).jobs.find(job => job.channel === 'email' && job.event_kind === 'invite')
  const view = render(<AppointmentSupportPanel organisationId={org} appointmentId={row.appointmentId} appointmentRevision={0} viewerKey={actor} />)
  await screen.findByLabelText('Recovery reason')
  change('Recovery reason', 'Controlled provider recovered')
  fireEvent.click(screen.getByRole('button', { name: 'Retry eligible delivery' }))
  await screen.findByText(/1 job\(s\) queued/)
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry eligible delivery' })).toBeNull())
  view.unmount()
  const job = (await claim()).find(job => job.id === original.id)
  expect(job.attempt_count).toBe(6)
  const receipt = await dispatchCalendarAppointmentJob(transport, job, configuration, async () => new Response(JSON.stringify({ ok: true, emailId: 'controlled-recovery' })))
  expect(receipt.status).toBe('provider_accepted')
  await role()
  const persisted = await readAppointmentSupport(org, row.appointmentId)
  expect(persisted.jobs.find(item => item.id === job.id)).toMatchObject({ status: 'provider_accepted', provider_message_id: 'controlled-recovery', retry_allowed: false })
  expect(persisted.history.some(item => item.source === 'support')).toBe(true)
  expect(JSON.stringify(persisted)).not.toMatch(/rsvp_token|acceptLink|provider_payload/)
})

it('saves a mobile shared request, closes the screen, then delivers the committed revision through SQL and worker receipts', async () => {
  const saved = vi.fn()
  const view = render(<MobileAppointmentWorkspace organisationId={org} actor={agent} selectedDate="2099-07-25" onSaved={saved} />)
  await screen.findAllByRole('option', { name: 'Co-agent' })
  change('Appointment type', 'client_meeting')
  change('Start time', '10:00'); change('End time', '11:00')
  change('Start time', '19:30'); change('End time', '20:30')
  change('Reminder schedule', '30m')
  change('Team attendee', second); fireEvent.click(screen.getByRole('button', { name: 'Add co-agent' }))
  change('Attendee name', 'Buyer'); change('Attendee email', 'buyer@example.test')
  fireEvent.click(screen.getByRole('button', { name: 'Add attendee' }))
  fireEvent.click(screen.getByRole('button', { name: 'Request appointment' }))
  await waitFor(() => expect(saved).toHaveBeenCalled(), { timeout: 10000 })
  view.unmount() // No browser context remains to trigger notifications.
  const row = (await read())[0]
  expect(row).toMatchObject({ date: '2099-07-25', startTime: '19:30', endTime: '20:30', calendarRevision: 0 })
  expect(Date.parse(row.dateTime)).toBe(Date.parse('2099-07-25T17:30Z'))
  expect(appointmentMatchesAgent(row, { id: second })).toBe(true)
  expect(appointmentReadState(row).category).toBe('upcoming')
  const profile = getPrincipalAgentDetailCommandCentre({ agent: { id: second }, appointments: [row], now: new Date() })
  const dashboard = await getAppointmentDashboardData({ module: 'agent', appointments: [row], userId: second, includeAll: false })
  expect(profile.calendarSummary.upcomingItems).toHaveLength(1)
  expect(dashboard.appointments).toHaveLength(1)
  expect(dashboard.nextAppointment.id).toBe(row.appointmentId)
  await role(second)
  expect((await read()).map(record => record.appointmentId)).toContain(row.appointmentId)
  const claimed = await claim(), sent = []
  expect(claimed.filter(job => job.channel === 'email')).toHaveLength(3)
  for (const job of claimed) {
    const receipt = await dispatchCalendarAppointmentJob(transport, job, configuration, async (_url, request) => {
      sent.push(JSON.parse(request.body))
      return new Response(JSON.stringify({ ok: true, emailId: `controlled-${job.id}` }))
    })
    expect(receipt.status).toBe(job.channel === 'email' ? 'provider_accepted' : 'delivered')
  }
  expect(sent.map(message => message.to).sort()).toEqual(['agent@example.test', 'buyer@example.test', 'other@example.test'])
  expect(sent.every(message => message.appointmentTime === '19:30' && message.calendarSequence === 0)).toBe(true)
  for (const job of claimed.filter(job => job.channel === 'email')) {
    await db.query("select record_calendar_provider_receipt($1,$2,'email.delivered')", [`controlled-event-${job.id}`, `controlled-${job.id}`])
  }
  const persisted = await jobs()
  expect(persisted.filter(job => job.event_kind === 'invite').every(job => job.status === 'delivered')).toBe(true)
  expect(persisted.filter(job => job.event_kind === 'reminder:custom_30m')).toHaveLength(5)
})

it('adds mobile attendees while editing, retains identities and asks for fresh approval without extending the hold', async () => {
  const row = await createAppointmentAsync(org, { commandId: id(420), appointmentType: 'client_meeting', date: '2099-07-25', startTime: '10:00', endTime: '11:00', assignedAgent: agent }, { actor: agent })
  const saved = vi.fn()
  render(<MobileAppointmentWorkspace organisationId={org} actor={agent} appointment={row} onSaved={saved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit appointment' }))
  await screen.findAllByRole('option', { name: 'Co-agent' })
  change('Team attendee', second); fireEvent.click(screen.getByRole('button', { name: 'Add co-agent' }))
  change('Attendee name', 'Buyer'); change('Attendee email', 'buyer@example.test')
  fireEvent.click(screen.getByRole('button', { name: 'Add attendee' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save appointment' }))
  await waitFor(() => expect(saved).toHaveBeenCalled(), { timeout: 10000 })
  const updated = (await read())[0]
  expect(updated.participants).toHaveLength(3)
  const organizer = updated.participants.find(person => person.userId === actor)
  expect(organizer.participantId).toBe(row.participants[0].participantId)
  expect(organizer.rsvpToken).not.toBe(row.participants[0].rsvpToken)
  expect(organizer.rsvpStatus).toBe(row.participants[0].rsvpStatus)
  expect(updated.holdExpiresAt).toBe(row.holdExpiresAt)
  expect(updated.calendarRevision).toBe(1)
})

it('removes an external attendee through the application save and rejects their old anonymous response without sending claimed mail', async () => {
  const row = await createAppointmentAsync(org, { commandId: id(430), appointmentType: 'client_meeting', date: '2099-07-25', startTime: '10:00', endTime: '11:00', assignedAgent: agent,
    participants: [{ participantId: id(431), name: 'Buyer', email: 'buyer@example.test', participantRole: 'Buyer', isRequired: true }] }, { actor: agent })
  const buyer = row.participants.find(person => person.email === 'buyer@example.test')
  const claimed = (await claim()).find(job => job.recipient_email === buyer.email)
  await role()
  await updateAppointmentAsync(org, row.appointmentId, { commandId: id(432), expectedRevision: 0, participants: row.participants.filter(person => person.participantId !== buyer.participantId) }, { actor: agent })
  await role(null, 'anon')
  expect((await db.query("select * from submit_appointment_rsvp($1,'Accepted',null,null,null)", [buyer.rsvpToken])).rows).toEqual([])
  await role(actor, 'service_role')
  const fetcher = vi.fn()
  expect((await dispatchCalendarAppointmentJob(transport, claimed, configuration, fetcher)).status).toBe('superseded')
  expect(fetcher).not.toHaveBeenCalled()
})

it('retries a mobile save after a lost response without duplicating the booking or its jobs', async () => {
  transport.lostSave = true
  const saved = vi.fn()
  render(<MobileAppointmentWorkspace organisationId={org} actor={agent} selectedDate="2099-07-25" onSaved={saved} />)
  change('Appointment type', 'client_meeting')
  change('Start time', '10:00'); change('End time', '11:00')
  fireEvent.click(screen.getByRole('button', { name: 'Request appointment' }))
  await screen.findByText('Save response lost after commit', {}, { timeout: 10000 })
  const before = await jobs()
  await role()
  fireEvent.click(screen.getByRole('button', { name: 'Request appointment' }))
  await waitFor(() => expect(saved).toHaveBeenCalled(), { timeout: 10000 })
  expect(await read()).toHaveLength(1)
  expect((await jobs()).map(job => job.id).sort()).toEqual(before.map(job => job.id).sort())
  expect(saved.mock.calls[0][0].mutationReplayed).toBe(true)
})

it('reschedules then cancels through application services and suppresses both claimed obsolete revisions', async () => {
  const row = await createAppointmentAsync(org, { commandId: id(400), appointmentType: 'client_meeting', date: '2099-07-25', startTime: '10:00', endTime: '11:00', assignedAgent: agent }, { actor: agent })
  const original = await claim()
  await role()
  const moved = await updateAppointmentAsync(org, row.appointmentId, { startTime: '13:00', endTime: '14:30', expectedRevision: 0, commandId: id(401) }, { actor: agent })
  expect(moved.calendarRevision).toBe(1)
  expect(Date.parse(moved.dateTime)).toBe(Date.parse('2099-07-25T11:00Z'))
  const replacement = await claim()
  await role()
  await updateAppointmentAsync(org, row.appointmentId, { status: 'cancelled', cancellationReason: 'Client cancelled', expectedRevision: 1, commandId: id(402) }, { actor: agent })
  expect(appointmentReadState((await read())[0]).category).toBe('history')
  await role(actor, 'service_role')
  const fetcher = vi.fn()
  for (const job of [...original, ...replacement]) expect((await dispatchCalendarAppointmentJob(transport, job, configuration, fetcher)).status).toBe('superseded')
  expect(fetcher).not.toHaveBeenCalled()
  expect((await jobs()).filter(job => job.revision < 2).every(job => job.status === 'superseded')).toBe(true)
})

it('denies another organisation and removed member across the application read, save and worker boundaries', async () => {
  const row = await createAppointmentAsync(org, { commandId: id(410), appointmentType: 'client_meeting', date: '2099-07-25', startTime: '10:00', endTime: '11:00', assignedAgent: agent }, { actor: agent })
  await role(outsider)
  expect(await read()).toEqual([])
  await expect(updateAppointmentAsync(org, row.appointmentId, { status: 'cancelled' }, { actor: { id: outsider } })).rejects.toThrow()
  const denied = await transport.rpc('claim_calendar_delivery', { p_limit: 1 })
  expect(denied.error).toBeTruthy()
  await role()
  await expect(createAppointmentAsync(otherOrg, { commandId: id(411), appointmentType: 'client_meeting', date: '2099-07-25', startTime: '10:00', endTime: '11:00', assignedAgent: agent }, { actor: agent })).rejects.toThrow()
  await db.exec('reset role')
  await db.query("update organisation_users set status='removed' where organisation_id=$1 and user_id=$2", [org, actor])
  await role()
  expect(await read()).toEqual([])
  await expect(updateAppointmentAsync(org, row.appointmentId, { status: 'cancelled' }, { actor: agent })).rejects.toThrow()
  await db.exec('reset role')
  await db.query("update organisation_users set status='active' where organisation_id=$1 and user_id=$2", [org, actor])
})
