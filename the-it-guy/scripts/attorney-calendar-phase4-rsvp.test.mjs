import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const root = resolve(import.meta.dirname, '..')
const migration = readFileSync(resolve(root, '../supabase/migrations/202607180047_attorney_calendar_phase4_rsvp_lifecycle.sql'), 'utf8')
const page = readFileSync(resolve(root, 'src/pages/AppointmentRsvpPage.jsx'), 'utf8')
const operations = readFileSync(resolve(root, 'src/services/attorneyOperations.js'), 'utf8')
const liveMode = process.argv.includes('--live')

for (const token of [
  'rsvp_expires_at timestamptz',
  'rsvp_revoked_at timestamptz',
  'create table if not exists public.appointment_reschedule_requests',
  'appointment_reschedule_requests_select_scoped',
  'public.bridge_can_access_appointment(appointment_id)',
  "lower(coalesce(a.status, '')) not in ('completed', 'cancelled', 'canceled')",
  'for update of ap',
  'This RSVP has already been recorded',
  'A future preferred start time is required',
  "at time zone 'Africa/Johannesburg'",
  'pg_advisory_xact_lock',
  "where rr.appointment_id = v_context.appointment_id and rr.status = 'pending'",
  "set status = 'cancelled'",
  "'appointment_rsvp_phase4'",
  "v_context.appointment_id::text || '::rsvp::' || v_context.participant_id::text",
  'revoke all on function public.get_appointment_rsvp_by_token(text) from public',
]) {
  assert.ok(migration.includes(token), `Phase 4 migration should include ${token}`)
}

for (const token of [
  'buildAppointmentRsvpContract({',
  'isCompletedAppointmentRsvp(row.rsvp_status)',
  "if (!response?.participant_id)",
  'disabled={!rsvpContract.isValid || submitting}',
  'maxLength={1000}',
  'APPOINTMENT_RSVP_TIMEZONE',
]) {
  assert.ok(page.includes(token), `RSVP page should include ${token}`)
}

assert.ok(operations.includes('rsvp_expires_at: dateTime || null'), 'New attorney invites should expire RSVP capability at appointment start.')
assert.ok(operations.includes('delete next.rsvp_expires_at'), 'Pre-migration fallback should remove the expiry column safely.')

if (!liveMode) {
  console.log('attorney calendar Phase 4 RSVP contract passed')
  process.exit(0)
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY
assert.ok(url, 'SUPABASE_URL or VITE_SUPABASE_URL is required')
assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required')
assert.ok(anonKey, 'VITE_SUPABASE_ANON_KEY is required')

const service = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
const anon = createClient(url, anonKey, { auth: { persistSession: false } })

const participantColumns = await service
  .from('appointment_participants')
  .select('participant_id, rsvp_expires_at, rsvp_revoked_at')
  .limit(1)
assert.equal(participantColumns.error, null, `RSVP capability columns unavailable: ${participantColumns.error?.message || ''}`)

const rescheduleTable = await service.from('appointment_reschedule_requests').select('id', { head: true, count: 'exact' })
assert.equal(rescheduleTable.error, null, `Reschedule table unavailable: ${rescheduleTable.error?.message || ''}`)

const invalidLookup = await anon.rpc('get_appointment_rsvp_by_token', { p_token: 'phase4-invalid-token' })
assert.equal(invalidLookup.error, null, `Public RSVP lookup RPC failed: ${invalidLookup.error?.message || ''}`)
assert.deepEqual(invalidLookup.data, [])

const invalidSubmit = await anon.rpc('submit_appointment_rsvp', {
  p_token: 'phase4-invalid-token',
  p_rsvp_status: 'Accepted',
  p_proposed_new_time: null,
  p_preferred_end: null,
  p_rsvp_comment: null,
})
assert.equal(invalidSubmit.error, null, `Public RSVP submit RPC failed: ${invalidSubmit.error?.message || ''}`)
assert.deepEqual(invalidSubmit.data, [])

const demoEmail = process.env.ATTORNEY_DEMO_EMAIL || 'attorney.demo@arch9.co.za'
const actorProfile = await service.from('profiles').select('id').eq('email', demoEmail).maybeSingle()
assert.equal(actorProfile.error, null, `Unable to resolve Phase 4 actor: ${actorProfile.error?.message || ''}`)
const actorId = actorProfile.data?.id
assert.ok(actorId, 'Attorney demo actor is unavailable for Phase 4 behavior verification')
const actorMembership = await service
  .from('organisation_users')
  .select('organisation_id')
  .eq('user_id', actorId)
  .eq('status', 'active')
  .limit(1)
  .maybeSingle()
assert.equal(actorMembership.error, null, `Unable to resolve Phase 4 organisation: ${actorMembership.error?.message || ''}`)
const organisationId = actorMembership.data?.organisation_id
assert.ok(organisationId, 'Attorney demo organisation is unavailable for Phase 4 behavior verification')

const appointmentId = crypto.randomUUID()
const participantId = crypto.randomUUID()
const token = crypto.randomUUID()
const future = new Date(Date.now() + (3 * 24 * 60 * 60 * 1000))
const preferred = new Date(future.getTime() + (2 * 60 * 60 * 1000))
const preferredEnd = new Date(preferred.getTime() + (45 * 60 * 1000))
const appointmentDate = future.toISOString().slice(0, 10)

try {
  const appointmentInsert = await service.from('appointments').insert({
    appointment_id: appointmentId,
    organisation_id: organisationId,
    created_by: actorId,
    title: 'Phase 4 RSVP verification',
    appointment_type: 'attorney_consultation',
    appointment_date: appointmentDate,
    start_time: '10:00',
    end_time: '10:45',
    date_time: future.toISOString(),
    timezone: 'Africa/Johannesburg',
    location_type: 'video_call',
    location: 'https://meet.example.com/phase4-verification',
    meeting_url: 'https://meet.example.com/phase4-verification',
    status: 'requested',
    visibility_scope: 'client_visible',
  })
  assert.equal(appointmentInsert.error, null, `Unable to create Phase 4 appointment fixture: ${appointmentInsert.error?.message || ''}`)

  const participantInsert = await service.from('appointment_participants').insert({
    participant_id: participantId,
    appointment_id: appointmentId,
    organisation_id: organisationId,
    name: 'Phase 4 Test Client',
    email: 'phase4-rsvp@example.invalid',
    participant_role: 'Client',
    rsvp_status: 'Pending',
    rsvp_token: token,
    rsvp_expires_at: future.toISOString(),
  })
  assert.equal(participantInsert.error, null, `Unable to create Phase 4 participant fixture: ${participantInsert.error?.message || ''}`)

  const reminderInsert = await service.from('appointment_reminders').insert({
    appointment_id: appointmentId,
    recipient_role: 'buyer',
    recipient_email: 'phase4-rsvp@example.invalid',
    reminder_type: 'appointment_reminder_due',
    scheduled_for: future.toISOString(),
    status: 'pending',
  })
  assert.equal(reminderInsert.error, null, `Unable to create Phase 4 reminder fixture: ${reminderInsert.error?.message || ''}`)

  const publicLookup = await anon.rpc('get_appointment_rsvp_by_token', { p_token: token })
  assert.equal(publicLookup.error, null, `Fixture RSVP lookup failed: ${publicLookup.error?.message || ''}`)
  assert.equal(publicLookup.data?.[0]?.participant_id, participantId)

  const responsePayload = {
    p_token: token,
    p_rsvp_status: 'Proposed New Time',
    p_proposed_new_time: preferred.toISOString(),
    p_preferred_end: preferredEnd.toISOString(),
    p_rsvp_comment: 'Phase 4 verification reschedule request',
  }
  const response = await anon.rpc('submit_appointment_rsvp', responsePayload)
  assert.equal(response.error, null, `Fixture RSVP submission failed: ${response.error?.message || ''}`)
  assert.equal(response.data?.[0]?.rsvp_status, 'Proposed New Time')

  const replay = await anon.rpc('submit_appointment_rsvp', responsePayload)
  assert.equal(replay.error, null, `Idempotent RSVP replay failed: ${replay.error?.message || ''}`)
  assert.equal(replay.data?.[0]?.participant_id, participantId)

  const changedResponse = await anon.rpc('submit_appointment_rsvp', { ...responsePayload, p_rsvp_status: 'Accepted' })
  assert.ok(changedResponse.error, 'A completed RSVP must reject a different second response')

  const [appointmentState, participantState, requestState, reminderState, eventState] = await Promise.all([
    service.from('appointments').select('status').eq('appointment_id', appointmentId).single(),
    service.from('appointment_participants').select('rsvp_status, responded_at').eq('participant_id', participantId).single(),
    service.from('appointment_reschedule_requests').select('id, status, preferred_start, preferred_end').eq('appointment_id', appointmentId),
    service.from('appointment_reminders').select('status').eq('appointment_id', appointmentId),
    service.from('appointment_notification_events').select('recipient_id, event_type, dedupe_key').eq('appointment_id', appointmentId),
  ])
  assert.equal(appointmentState.data?.status, 'alternative_requested')
  assert.equal(participantState.data?.rsvp_status, 'Proposed New Time')
  assert.ok(participantState.data?.responded_at)
  assert.equal(requestState.data?.length, 1, 'RSVP replay must not duplicate reschedule requests')
  assert.equal(requestState.data?.[0]?.status, 'pending')
  assert.deepEqual(reminderState.data?.map((row) => row.status), ['cancelled'])
  assert.equal(eventState.data?.length, 1, 'RSVP replay must not duplicate attorney events')
  assert.equal(eventState.data?.[0]?.recipient_id, actorId)
  assert.equal(eventState.data?.[0]?.event_type, 'appointment_reschedule_requested')
} finally {
  const cleanup = await service.from('appointments').delete().eq('appointment_id', appointmentId)
  assert.equal(cleanup.error, null, `Unable to clean Phase 4 fixture: ${cleanup.error?.message || ''}`)
}

console.log('attorney calendar Phase 4 live RSVP readiness passed')
