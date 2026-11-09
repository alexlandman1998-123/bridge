import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const attorneyOperations = readFileSync(resolve(root, 'src/services/attorneyOperations.js'), 'utf8')

for (const token of [
  "import { checkAppointmentSchedulingIntegrityAsync } from '../lib/agencyPipelineService'",
  'const schedulingIntegrity = await checkAppointmentSchedulingIntegrityAsync(',
  "conflictError.code = 'APPOINTMENT_HARD_CONFLICT'",
  "stage: 'scheduling_integrity'",
]) {
  assert.ok(attorneyOperations.includes(token), `Attorney invite creation should include ${token}`)
}

const conflictCheckIndex = attorneyOperations.indexOf('const schedulingIntegrity = await checkAppointmentSchedulingIntegrityAsync(')
const appointmentInsertIndex = attorneyOperations.indexOf("client.rpc('create_attorney_appointment_invite'")
assert.match(attorneyOperations, /p_appointment: insertPayload, p_participants: participantRows/)
assert.match(attorneyOperations, /confirmed\?\.appointment\?\.appointment_id !== appointmentId/)
assert.ok(conflictCheckIndex > -1, 'Attorney invite creation must run scheduling integrity checks.')
assert.ok(appointmentInsertIndex > -1, 'Attorney invite creation must persist appointments.')
assert.ok(
  conflictCheckIndex < appointmentInsertIndex,
  'Attorney invite conflicts must be blocked before the appointment row is inserted.',
)

// Exercise current token-bound responses: bad dates cannot reach persistence.
const { respondToPortalAppointment } = await import('../src/services/clientAppointmentResponseService.js')
const calls = []
const client = { async rpc(name, args) { calls.push({ name, args }); return { data: { appointmentId: 'fixture', transactionId: 'transaction', participantId: 'buyer', rsvpStatus: args.p_status, status: 'confirmed' }, error: null } } }
const input = { token: 'fixture-token', appointmentId: 'fixture', action: 'reschedule', expectedStart: '2099-01-01T10:00:00Z' }
for (const preferredDateTime of [null, 'invalid', '2000-01-01T10:00:00Z']) {
  await assert.rejects(respondToPortalAppointment(client, { ...input, preferredDateTime }), /future/)
}
assert.equal(calls.length, 0)
await respondToPortalAppointment(client, { ...input, preferredDateTime: '2099-01-02T10:00:00Z' })
assert.equal(calls.length, 1)
assert.equal(calls[0].name, 'bridge_respond_client_portal_appointment')
assert.equal(calls[0].args.p_status, 'Proposed New Time')

console.log('appointment Phase 1 stop-bad-appointments contract passed')
