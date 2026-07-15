import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const migration = readFileSync(
  new URL('../../supabase/migrations/202607150012_legal_role_operations_phase6.sql', import.meta.url),
  'utf8',
)
const page = readFileSync(
  new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url),
  'utf8',
)
const reminderDispatcher = readFileSync(
  new URL('../../supabase/functions/send-email/handlers/notificationReminderDispatch.ts', import.meta.url),
  'utf8',
)

for (const automationKey of [
  'legal_role_firm_accepted',
  'legal_role_staff_assigned',
  'legal_role_instruction_confirmed',
  'legal_role_activated',
  'legal_role_replacement_required',
  'legal_role_coordination_reminder',
]) {
  assert.match(migration, new RegExp(`'${automationKey}'`))
}

assert.match(migration, /after update of coordination_state, staff_assignment_status/)
assert.match(migration, /bridge_record_legal_role_operational_notification_phase6/)
assert.match(migration, /bridge_queue_legal_role_coordination_reminders_phase6/)
assert.match(migration, /'firm_acceptance'/)
assert.match(migration, /'staff_assignment'/)
assert.match(migration, /'bank_instruction'/)
assert.match(migration, /'instruction_decision'/)
assert.match(migration, /'replacement_appointment'/)
assert.match(migration, /'day_' \|\| v_reminder_day::text/)
assert.match(migration, /grant execute on function public\.bridge_queue_legal_role_coordination_reminders_phase6[\s\S]*to service_role/)
assert.match(migration, /create or replace function public\.bridge_claim_notification_reminder_events_phase4/)
assert.match(page, /Reminder escalation is active/)
assert.match(reminderDispatcher, /"legal_role_coordination_reminder"/)
assert.match(reminderDispatcher, /bridge_queue_legal_role_coordination_reminders_phase6/)
assert.match(reminderDispatcher, /Legal role action needs attention/)

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const server = await createServer({ root: projectRoot, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const { deriveBankLegalRoleOperationalHealth } = await server.ssrLoadModule('/src/services/legalRoleAppointmentService.js')
  const now = new Date('2026-07-15T12:00:00.000Z')

  const awaitingStaff = deriveBankLegalRoleOperationalHealth({
    coordination_state: 'invite_accepted',
    staff_assignment_status: 'awaiting_staff_assignment',
    accepted_at: '2026-07-13T08:00:00.000Z',
  }, now)
  assert.equal(awaitingStaff.actionKey, 'staff_assignment')
  assert.equal(awaitingStaff.isOverdue, true)
  assert.equal(awaitingStaff.severity, 'overdue')

  const instructionDecision = deriveBankLegalRoleOperationalHealth({
    coordination_state: 'instruction_confirmed',
    staff_assignment_status: 'staff_assigned',
    instruction_confirmed_at: '2026-07-10T08:00:00.000Z',
  }, now)
  assert.equal(instructionDecision.actionKey, 'instruction_decision')
  assert.equal(instructionDecision.severity, 'escalated')

  const active = deriveBankLegalRoleOperationalHealth({ coordination_state: 'active' }, now)
  assert.equal(active.actionKey, 'active')
  assert.equal(active.severity, 'complete')
  assert.equal(active.dueAt, null)
} finally {
  await server.close()
}

console.log('legal role operations Phase 6 contracts passed')
