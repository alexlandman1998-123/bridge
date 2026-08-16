import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const attorneyOperations = readFileSync(resolve(root, 'src/services/attorneyOperations.js'), 'utf8')
const api = readFileSync(resolve(root, 'src/lib/api.js'), 'utf8')

for (const token of [
  "import { checkAppointmentSchedulingIntegrityAsync } from '../lib/agencyPipelineService'",
  'const schedulingIntegrity = await checkAppointmentSchedulingIntegrityAsync(',
  "conflictError.code = 'APPOINTMENT_HARD_CONFLICT'",
  "stage: 'scheduling_integrity'",
]) {
  assert.ok(attorneyOperations.includes(token), `Attorney invite creation should include ${token}`)
}

const conflictCheckIndex = attorneyOperations.indexOf('const schedulingIntegrity = await checkAppointmentSchedulingIntegrityAsync(')
const appointmentInsertIndex = attorneyOperations.indexOf("let appointmentResult = await client\n    .from('appointments')\n    .insert(insertPayload)")
assert.ok(conflictCheckIndex > -1, 'Attorney invite creation must run scheduling integrity checks.')
assert.ok(appointmentInsertIndex > -1, 'Attorney invite creation must persist appointments.')
assert.ok(
  conflictCheckIndex < appointmentInsertIndex,
  'Attorney invite conflicts must be blocked before the appointment row is inserted.',
)

for (const token of [
  "if (normalizedAction === 'reschedule')",
  'Please choose a preferred date and time for the reschedule request.',
  'Please choose a preferred date and time in the future.',
]) {
  assert.ok(api.includes(token), `Client portal reschedule validation should include ${token}`)
}

const clientValidationIndex = api.indexOf("if (normalizedAction === 'reschedule')")
const appointmentQueryIndex = api.indexOf('const appointmentQuery = await client')
assert.ok(clientValidationIndex > -1, 'Client portal reschedules must be validated.')
assert.ok(appointmentQueryIndex > -1, 'Client portal appointment lookup must still run after validation.')
assert.ok(
  clientValidationIndex < appointmentQueryIndex,
  'Client portal reschedule validation should happen before DB mutation work begins.',
)

console.log('appointment Phase 1 stop-bad-appointments contract passed')
