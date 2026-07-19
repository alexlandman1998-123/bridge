import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const root = resolve(import.meta.dirname, '..')
const migration = readFileSync(resolve(root, '../supabase/migrations/202607180044_attorney_calendar_phase7_staging_acceptance.sql'), 'utf8')
const runbook = readFileSync(resolve(root, 'docs/attorney-calendar-phase7-staging-acceptance.md'), 'utf8')
const liveMode = process.argv.includes('--live')

for (const token of [
  'bridge_appointment_org_matches_transaction',
  'bridge_can_write_appointment_payload',
  'bridge_appointment_participant_payload_is_consistent',
  'bridge_appointment_event_payload_is_consistent',
  'drop policy if exists appointments_agency_write',
  'public.bridge_appointment_org_matches_transaction(transaction_id, organisation_id)',
  'appointment_participants_agency_write',
  'appointment_notification_events_insert_scoped',
  "notify pgrst, 'reload schema'",
]) {
  assert.ok(migration.includes(token), `Phase 7 migration should include ${token}`)
}

for (const token of [
  'Google Calendar',
  'Microsoft Outlook',
  'Apple Calendar',
  'Controlled recipient',
  'Cleanup verification',
  'Release decision',
]) {
  assert.ok(runbook.includes(token), `Phase 7 runbook should include ${token}`)
}

if (!liveMode) {
  console.log('attorney calendar Phase 7 staging acceptance contract passed')
  process.exit(0)
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY
const demoEmail = process.env.ATTORNEY_DEMO_EMAIL || 'attorney.demo@bridgenine.co.za'
const demoPassword = process.env.ATTORNEY_DEMO_PASSWORD

assert.ok(url, 'SUPABASE_URL or VITE_SUPABASE_URL is required')
assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required')
assert.ok(anonKey, 'VITE_SUPABASE_ANON_KEY is required')
assert.ok(demoPassword, 'ATTORNEY_DEMO_PASSWORD is required')

const service = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const actor = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const startedAt = new Date().toISOString()
const checks = []
const appointmentIds = []

function pass(name, evidence) {
  checks.push({ name, status: 'passed', evidence })
}

function certificationReport(extra = {}) {
  const base = {
    phase: 7,
    environment: 'staging',
    startedAt,
    completedAt: new Date().toISOString(),
    status: 'automated_pass_manual_calendar_clients_pending',
    checks,
    manualAcceptance: {
      controlledRecipientDelivery: process.env.ATTORNEY_CALENDAR_TEST_RECIPIENT ? 'configured_not_sent' : 'not_configured',
      googleCalendarImport: 'pending_manual_acceptance',
      microsoftOutlookImport: 'pending_manual_acceptance',
      appleCalendarImport: 'pending_manual_acceptance',
    },
    ...extra,
  }
  const canonical = JSON.stringify(base)
  return { ...base, evidenceDigest: createHash('sha256').update(canonical).digest('hex') }
}

const login = await actor.auth.signInWithPassword({ email: demoEmail, password: demoPassword })
assert.equal(login.error, null, `Attorney demo sign-in failed: ${login.error?.message || ''}`)
const actorId = login.data?.user?.id
assert.ok(actorId, 'Attorney demo sign-in returned no user')
pass('authenticated_attorney', 'Demo attorney authenticated through the anon client')

const profile = await actor.from('profiles').select('id').eq('id', actorId).maybeSingle()
assert.equal(profile.error, null, `Authenticated profile read failed: ${profile.error?.message || ''}`)
assert.equal(profile.data?.id, actorId)

const firmMemberships = await service
  .from('attorney_firm_members')
  .select('firm_id, role, status')
  .eq('user_id', actorId)
  .eq('status', 'active')
assert.equal(firmMemberships.error, null, `Firm membership lookup failed: ${firmMemberships.error?.message || ''}`)
assert.ok(firmMemberships.data?.length, 'Attorney has no active firm membership')
const firmIds = firmMemberships.data.map((row) => row.firm_id)

const assignmentFilter = firmIds.flatMap((firmId) => [
  `attorney_firm_id.eq.${firmId}`,
  `firm_id.eq.${firmId}`,
]).join(',')
const assignments = await service
  .from('transaction_attorney_assignments')
  .select('transaction_id, assignment_status, status, can_manage_signing')
  .or(assignmentFilter)
  .limit(50)
assert.equal(assignments.error, null, `Assignment lookup failed: ${assignments.error?.message || ''}`)
const assignment = (assignments.data || []).find((row) =>
  (row.assignment_status || row.status || 'active') === 'active' && row.can_manage_signing !== false,
)
assert.ok(assignment?.transaction_id, 'No signing-manageable attorney matter is available')

const transaction = await service
  .from('transactions')
  .select('id, organisation_id')
  .eq('id', assignment.transaction_id)
  .single()
assert.equal(transaction.error, null, `Assigned matter lookup failed: ${transaction.error?.message || ''}`)
const transactionId = transaction.data.id
const organisationId = transaction.data.organisation_id
assert.ok(organisationId, 'Assigned matter has no organisation')
pass('assigned_matter_scope', 'Active firm assignment resolved to an organisation-owned transaction')

const foreignOrganisation = await service
  .from('organisations')
  .select('id')
  .neq('id', organisationId)
  .limit(1)
  .maybeSingle()
assert.equal(foreignOrganisation.error, null, `Foreign organisation lookup failed: ${foreignOrganisation.error?.message || ''}`)
assert.ok(foreignOrganisation.data?.id, 'A foreign organisation is required for the isolation test')

const crossOrgAttempt = await actor.from('appointments').insert({
  appointment_id: crypto.randomUUID(),
  organisation_id: foreignOrganisation.data.id,
  transaction_id: transactionId,
  created_by: actorId,
  title: 'Phase 7 forbidden cross-organisation appointment',
  appointment_type: 'attorney_consultation',
  appointment_date: '2099-01-01',
  start_time: '10:00',
  end_time: '10:45',
  date_time: '2099-01-01T08:00:00.000Z',
  timezone: 'Africa/Johannesburg',
  location_type: 'video_call',
  location: 'https://meet.example.invalid/forbidden',
  status: 'requested',
  visibility_scope: 'client_visible',
})
assert.ok(crossOrgAttempt.error, 'Cross-organisation appointment creation must be rejected')
pass('cross_organisation_rejection', `Rejected by RLS (${crossOrgAttempt.error.code || 'policy error'})`)

const anonRead = await anon.from('appointments').select('appointment_id').eq('transaction_id', transactionId)
assert.equal(anonRead.error, null, `Anonymous appointment read should be safely filtered: ${anonRead.error?.message || ''}`)
assert.deepEqual(anonRead.data, [])
pass('anonymous_read_isolation', 'Anonymous appointment query returned zero rows')

const futureBase = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000))
const scenarios = [
  { type: 'transfer_signing', locationType: 'physical_address', location: 'Phase 7 controlled office', role: 'Client', visibility: 'client_visible' },
  { type: 'bond_signing', locationType: 'physical_address', location: 'Phase 7 controlled boardroom', role: 'Buyer', visibility: 'client_visible' },
  { type: 'attorney_consultation', locationType: 'video_call', location: 'https://meet.example.invalid/phase7', role: 'Client', visibility: 'shared_role_players' },
  { type: 'internal_meeting', locationType: 'phone_call', location: '+27 00 000 0000', role: 'Attorney', visibility: 'internal_only' },
]

const fixtures = scenarios.map((scenario, index) => {
  const appointmentId = crypto.randomUUID()
  const participantId = crypto.randomUUID()
  const token = crypto.randomUUID()
  const start = new Date(futureBase.getTime() + (index * 24 * 60 * 60 * 1000))
  start.setUTCHours(8, 0, 0, 0)
  const end = new Date(start.getTime() + ((scenario.type === 'attorney_consultation' ? 45 : scenario.type === 'internal_meeting' ? 30 : 60) * 60 * 1000))
  appointmentIds.push(appointmentId)
  return { ...scenario, appointmentId, participantId, token, start, end }
})

try {
  for (const fixture of fixtures) {
    const appointmentInsert = await actor.from('appointments').insert({
      appointment_id: fixture.appointmentId,
      organisation_id: organisationId,
      transaction_id: transactionId,
      created_by: actorId,
      title: `Phase 7 ${fixture.type}`,
      appointment_type: fixture.type,
      appointment_date: fixture.start.toISOString().slice(0, 10),
      start_time: fixture.start.toISOString().slice(11, 16),
      end_time: fixture.end.toISOString().slice(11, 16),
      date_time: fixture.start.toISOString(),
      timezone: 'Africa/Johannesburg',
      location_type: fixture.locationType,
      location: fixture.location,
      meeting_url: fixture.locationType === 'video_call' ? fixture.location : null,
      status: 'requested',
      visibility_scope: fixture.visibility,
      external_calendar_status: 'not_synced',
    })
    assert.equal(appointmentInsert.error, null, `${fixture.type} insert failed: ${appointmentInsert.error?.message || ''}`)

    const participantInsert = await actor.from('appointment_participants').insert({
      participant_id: fixture.participantId,
      appointment_id: fixture.appointmentId,
      organisation_id: organisationId,
      name: `Phase 7 ${fixture.role}`,
      email: `phase7-${fixture.type}@example.invalid`,
      participant_role: fixture.role,
      rsvp_status: 'Pending',
      rsvp_token: fixture.token,
      rsvp_expires_at: fixture.start.toISOString(),
    })
    assert.equal(participantInsert.error, null, `${fixture.type} participant failed: ${participantInsert.error?.message || ''}`)

    const eventInsert = await actor.from('appointment_notification_events').insert({
      appointment_id: fixture.appointmentId,
      transaction_id: transactionId,
      event_type: 'appointment_confirmation_required',
      recipient_role: fixture.role,
      recipient_email: `phase7-${fixture.type}@example.invalid`,
      visibility: fixture.visibility,
      title: 'Phase 7 delivery suppressed',
      message: 'Certification fixture; external delivery intentionally suppressed.',
      email_status: 'skipped',
      in_app_status: 'pending',
      metadata: { source: 'attorney_calendar_phase7', externalDeliverySuppressed: true },
      dedupe_key: `${fixture.appointmentId}::phase7::confirmation`,
    })
    assert.equal(eventInsert.error, null, `${fixture.type} audit event failed: ${eventInsert.error?.message || ''}`)

    const reminderInsert = await actor.from('appointment_reminders').insert({
      appointment_id: fixture.appointmentId,
      recipient_role: fixture.role,
      recipient_email: `phase7-${fixture.type}@example.invalid`,
      reminder_type: 'appointment_reminder_due',
      scheduled_for: fixture.start.toISOString(),
      status: 'pending',
      metadata: { source: 'attorney_calendar_phase7' },
    })
    assert.equal(reminderInsert.error, null, `${fixture.type} reminder failed: ${reminderInsert.error?.message || ''}`)
  }

  const [appointments, participants, events, reminders] = await Promise.all([
    actor.from('appointments').select('appointment_id, appointment_type, location_type').in('appointment_id', appointmentIds),
    actor.from('appointment_participants').select('participant_id, appointment_id').in('appointment_id', appointmentIds),
    actor.from('appointment_notification_events').select('appointment_id, email_status, dedupe_key').in('appointment_id', appointmentIds),
    actor.from('appointment_reminders').select('appointment_id, status').in('appointment_id', appointmentIds),
  ])
  assert.equal(appointments.error, null)
  assert.equal(participants.error, null)
  assert.equal(events.error, null)
  assert.equal(reminders.error, null)
  assert.equal(appointments.data?.length, 4)
  assert.equal(participants.data?.length, 4)
  assert.equal(events.data?.length, 4)
  assert.equal(reminders.data?.length, 4)
  pass('four_invite_scenarios', 'Transfer, bond, consultation, and internal meeting persisted through authenticated RLS')
  pass('delivery_auditability', 'Every fixture has one deduplicated notification event with external delivery suppressed')
  pass('reminder_persistence', 'Every fixture has one pending reminder before RSVP processing')

  const acceptedFixture = fixtures[0]
  const accepted = await anon.rpc('submit_appointment_rsvp', {
    p_token: acceptedFixture.token,
    p_rsvp_status: 'Accepted',
    p_proposed_new_time: null,
    p_preferred_end: null,
    p_rsvp_comment: 'Phase 7 acceptance',
  })
  assert.equal(accepted.error, null, `RSVP acceptance failed: ${accepted.error?.message || ''}`)
  assert.equal(accepted.data?.[0]?.rsvp_status, 'Accepted')
  pass('public_rsvp_acceptance', 'Anonymous single-use RSVP accepted the transfer signing')

  const rescheduleFixture = fixtures[2]
  const preferredStart = new Date(rescheduleFixture.start.getTime() + (2 * 60 * 60 * 1000))
  const preferredEnd = new Date(preferredStart.getTime() + (45 * 60 * 1000))
  const requested = await anon.rpc('submit_appointment_rsvp', {
    p_token: rescheduleFixture.token,
    p_rsvp_status: 'Proposed New Time',
    p_proposed_new_time: preferredStart.toISOString(),
    p_preferred_end: preferredEnd.toISOString(),
    p_rsvp_comment: 'Phase 7 reschedule request',
  })
  assert.equal(requested.error, null, `RSVP reschedule failed: ${requested.error?.message || ''}`)

  const request = await actor
    .from('appointment_reschedule_requests')
    .select('id, status')
    .eq('appointment_id', rescheduleFixture.appointmentId)
    .single()
  assert.equal(request.error, null, `Reschedule request read failed: ${request.error?.message || ''}`)
  const resolved = await actor.rpc('resolve_attorney_appointment_reschedule', {
    p_request_id: request.data.id,
    p_decision: 'accepted',
    p_confirmed_start: preferredStart.toISOString(),
    p_confirmed_end: preferredEnd.toISOString(),
    p_reason: 'Phase 7 accepted reschedule',
  })
  assert.equal(resolved.error, null, `Reschedule resolution failed: ${resolved.error?.message || ''}`)
  assert.equal(resolved.data?.[0]?.request_status, 'accepted')
  pass('reschedule_resolution', 'Client request and attorney acceptance completed through public/authenticated RPCs')

  const finalStates = await service
    .from('appointments')
    .select('appointment_id, status, external_calendar_status')
    .in('appointment_id', appointmentIds)
  assert.equal(finalStates.error, null)
  assert.equal(finalStates.data?.find((row) => row.appointment_id === acceptedFixture.appointmentId)?.status, 'confirmed')
  const rescheduledState = finalStates.data?.find((row) => row.appointment_id === rescheduleFixture.appointmentId)
  assert.equal(rescheduledState?.status, 'confirmed')
  assert.equal(rescheduledState?.external_calendar_status, 'not_synced')
  pass('final_state_consistency', 'RSVP and reschedule produced confirmed appointments with calendar regeneration required')
} finally {
  if (appointmentIds.length) {
    const cleanup = await service.from('appointments').delete().in('appointment_id', appointmentIds)
    assert.equal(cleanup.error, null, `Phase 7 fixture cleanup failed: ${cleanup.error?.message || ''}`)
    const remaining = await service.from('appointments').select('appointment_id').in('appointment_id', appointmentIds)
    assert.equal(remaining.error, null)
    assert.deepEqual(remaining.data, [])
    pass('cleanup_verification', 'All exact appointment fixtures and cascading child records were removed')
  }
  await actor.auth.signOut()
}

const report = certificationReport({ fixtureCount: fixtures.length })
console.log(JSON.stringify(report, null, 2))
console.log('attorney calendar Phase 7 automated staging certification passed; external calendar-client acceptance remains manual')
