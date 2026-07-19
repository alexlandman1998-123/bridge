import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const root = resolve(import.meta.dirname, '..')
const migration = readFileSync(resolve(root, '../supabase/migrations/202607180032_attorney_calendar_phase5_reschedule_coordination.sql'), 'utf8')
const service = readFileSync(resolve(root, 'src/services/appointmentRescheduleService.js'), 'utf8')
const workspace = readFileSync(resolve(root, 'src/components/attorney/scheduling/AttorneySchedulingWorkspace.jsx'), 'utf8')
const liveMode = process.argv.includes('--live')

for (const token of [
  'propose_attorney_appointment_reschedule',
  'resolve_attorney_appointment_reschedule',
  "p_decision text",
  "v_decision not in ('accepted', 'rejected', 'cancelled')",
  'for update',
  "auth.role() <> 'service_role'",
  'bridge_can_access_appointment',
  "status = 'alternative_proposed'",
  "status = 'confirmed'",
  "external_calendar_status = 'not_synced'",
  "set status = 'cancelled'",
  "'attorney_calendar_phase5'",
  "revoke all on function public.resolve_attorney_appointment_reschedule",
]) {
  assert.ok(migration.includes(token), `Phase 5 migration should include ${token}`)
}

for (const token of [
  'buildAppointmentRescheduleResolutionContract(payload)',
  "supabase.rpc('propose_attorney_appointment_reschedule'",
  "supabase.rpc('resolve_attorney_appointment_reschedule'",
  'p_decision: decision',
]) {
  assert.ok(service.includes(token), `Phase 5 service should include ${token}`)
}

for (const token of [
  'RescheduleProposalDrawer',
  'Counter time',
  'Send counter proposal',
  'johannesburgDateTimeInputToIso',
  'decision,',
]) {
  assert.ok(workspace.includes(token), `Phase 5 workspace should include ${token}`)
}

if (!liveMode) {
  console.log('attorney calendar Phase 5 reschedule contract passed')
  process.exit(0)
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY
assert.ok(url, 'SUPABASE_URL or VITE_SUPABASE_URL is required')
assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required')
assert.ok(anonKey, 'VITE_SUPABASE_ANON_KEY is required')

const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const anon = createClient(url, anonKey, { auth: { persistSession: false } })

const unauthorized = await anon.rpc('resolve_attorney_appointment_reschedule', {
  p_request_id: crypto.randomUUID(),
  p_decision: 'rejected',
  p_confirmed_start: null,
  p_confirmed_end: null,
  p_reason: null,
})
assert.ok(unauthorized.error, 'Anonymous callers must not be able to resolve attorney reschedules')

const demoEmail = process.env.ATTORNEY_DEMO_EMAIL || 'attorney.demo@arch9.co.za'
const actorProfile = await db.from('profiles').select('id').eq('email', demoEmail).maybeSingle()
assert.equal(actorProfile.error, null, `Unable to resolve Phase 5 actor: ${actorProfile.error?.message || ''}`)
const actorId = actorProfile.data?.id
assert.ok(actorId, 'Attorney demo actor is unavailable for Phase 5 verification')
const membership = await db.from('organisation_users').select('organisation_id').eq('user_id', actorId).eq('status', 'active').limit(1).maybeSingle()
assert.equal(membership.error, null, `Unable to resolve Phase 5 organisation: ${membership.error?.message || ''}`)
const organisationId = membership.data?.organisation_id
assert.ok(organisationId, 'Attorney demo organisation is unavailable for Phase 5 verification')

const acceptedAppointmentId = crypto.randomUUID()
const rejectedAppointmentId = crypto.randomUUID()
const acceptedRequestId = crypto.randomUUID()
const rejectedRequestId = crypto.randomUUID()
const originalStart = new Date(Date.now() + (4 * 24 * 60 * 60 * 1000))
const proposedStart = new Date(originalStart.getTime() + (24 * 60 * 60 * 1000))
const counterStart = new Date(proposedStart.getTime() + (2 * 60 * 60 * 1000))
const counterEnd = new Date(counterStart.getTime() + (45 * 60 * 1000))

async function insertFixture(appointmentId, requestId, suffix) {
  const appointment = await db.from('appointments').insert({
    appointment_id: appointmentId,
    organisation_id: organisationId,
    created_by: actorId,
    title: `Phase 5 reschedule ${suffix}`,
    appointment_type: 'attorney_consultation',
    appointment_date: originalStart.toISOString().slice(0, 10),
    start_time: '10:00',
    end_time: '10:45',
    date_time: originalStart.toISOString(),
    timezone: 'Africa/Johannesburg',
    status: 'alternative_requested',
    visibility_scope: 'client_visible',
  })
  assert.equal(appointment.error, null, `Unable to insert ${suffix} appointment: ${appointment.error?.message || ''}`)
  const request = await db.from('appointment_reschedule_requests').insert({
    id: requestId,
    appointment_id: appointmentId,
    requested_by_role: 'Client',
    reason: 'Client requested a new time',
    preferred_start: proposedStart.toISOString(),
    preferred_end: new Date(proposedStart.getTime() + (45 * 60 * 1000)).toISOString(),
    status: 'pending',
  })
  assert.equal(request.error, null, `Unable to insert ${suffix} request: ${request.error?.message || ''}`)
  const reminder = await db.from('appointment_reminders').insert({
    appointment_id: appointmentId,
    recipient_role: 'client',
    recipient_email: `phase5-${suffix}@example.invalid`,
    reminder_type: 'appointment_reminder_due',
    scheduled_for: originalStart.toISOString(),
    status: 'pending',
  })
  assert.equal(reminder.error, null, `Unable to insert ${suffix} reminder: ${reminder.error?.message || ''}`)
}

try {
  await insertFixture(acceptedAppointmentId, acceptedRequestId, 'accepted')
  await insertFixture(rejectedAppointmentId, rejectedRequestId, 'rejected')

  const proposalPayload = {
    p_request_id: acceptedRequestId,
    p_preferred_start: counterStart.toISOString(),
    p_preferred_end: counterEnd.toISOString(),
    p_reason: 'Attorney counter proposal',
    p_suggested_slots: [],
  }
  const proposal = await db.rpc('propose_attorney_appointment_reschedule', proposalPayload)
  assert.equal(proposal.error, null, `Counter proposal failed: ${proposal.error?.message || ''}`)
  assert.equal(proposal.data?.[0]?.request_status, 'proposed')
  const proposalReplay = await db.rpc('propose_attorney_appointment_reschedule', proposalPayload)
  assert.equal(proposalReplay.error, null, `Counter proposal replay failed: ${proposalReplay.error?.message || ''}`)

  const acceptedPayload = {
    p_request_id: acceptedRequestId,
    p_decision: 'accepted',
    p_confirmed_start: counterStart.toISOString(),
    p_confirmed_end: counterEnd.toISOString(),
    p_reason: 'Counter proposal accepted',
  }
  const accepted = await db.rpc('resolve_attorney_appointment_reschedule', acceptedPayload)
  assert.equal(accepted.error, null, `Accepted resolution failed: ${accepted.error?.message || ''}`)
  assert.equal(accepted.data?.[0]?.request_status, 'accepted')
  const acceptedReplay = await db.rpc('resolve_attorney_appointment_reschedule', acceptedPayload)
  assert.equal(acceptedReplay.error, null, `Accepted replay failed: ${acceptedReplay.error?.message || ''}`)
  const changedResolution = await db.rpc('resolve_attorney_appointment_reschedule', { ...acceptedPayload, p_decision: 'rejected' })
  assert.ok(changedResolution.error, 'A final reschedule decision must reject a different replay')

  const rejected = await db.rpc('resolve_attorney_appointment_reschedule', {
    p_request_id: rejectedRequestId,
    p_decision: 'rejected',
    p_confirmed_start: null,
    p_confirmed_end: null,
    p_reason: 'Original appointment retained',
  })
  assert.equal(rejected.error, null, `Rejected resolution failed: ${rejected.error?.message || ''}`)
  assert.equal(rejected.data?.[0]?.request_status, 'rejected')

  const [acceptedAppointment, acceptedRequest, acceptedReminders, acceptedEvents, rejectedAppointment, rejectedRequest] = await Promise.all([
    db.from('appointments').select('status, date_time, external_calendar_status, ics_generated_at').eq('appointment_id', acceptedAppointmentId).single(),
    db.from('appointment_reschedule_requests').select('status').eq('id', acceptedRequestId).single(),
    db.from('appointment_reminders').select('status').eq('appointment_id', acceptedAppointmentId),
    db.from('appointment_notification_events').select('event_type, dedupe_key').eq('appointment_id', acceptedAppointmentId),
    db.from('appointments').select('status, date_time').eq('appointment_id', rejectedAppointmentId).single(),
    db.from('appointment_reschedule_requests').select('status').eq('id', rejectedRequestId).single(),
  ])
  assert.equal(acceptedAppointment.data?.status, 'confirmed')
  assert.equal(new Date(acceptedAppointment.data?.date_time).getTime(), counterStart.getTime())
  assert.equal(acceptedAppointment.data?.external_calendar_status, 'not_synced')
  assert.equal(acceptedAppointment.data?.ics_generated_at, null)
  assert.equal(acceptedRequest.data?.status, 'accepted')
  assert.deepEqual(acceptedReminders.data?.map((row) => row.status), ['cancelled'])
  assert.equal(acceptedEvents.data?.filter((row) => row.event_type === 'appointment_reschedule_proposed').length, 1)
  assert.equal(acceptedEvents.data?.filter((row) => row.event_type === 'appointment_rescheduled').length, 1)
  assert.equal(rejectedAppointment.data?.status, 'confirmed')
  assert.equal(new Date(rejectedAppointment.data?.date_time).getTime(), originalStart.getTime())
  assert.equal(rejectedRequest.data?.status, 'rejected')
} finally {
  const cleanup = await db.from('appointments').delete().in('appointment_id', [acceptedAppointmentId, rejectedAppointmentId])
  assert.equal(cleanup.error, null, `Unable to clean Phase 5 fixtures: ${cleanup.error?.message || ''}`)
}

console.log('attorney calendar Phase 5 live reschedule readiness passed')
