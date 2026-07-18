import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const operations = readFileSync(resolve(root, 'src/services/attorneyOperations.js'), 'utf8')
const notifications = readFileSync(resolve(root, 'src/services/appointmentNotificationService.js'), 'utf8')
const component = readFileSync(resolve(root, 'src/components/attorney/scheduling/AttorneySchedulingWorkspace.jsx'), 'utf8')
const delivery = readFileSync(resolve(root, 'src/core/appointments/attorneyInviteDelivery.js'), 'utf8')
const appointmentEmail = readFileSync(resolve(root, '../supabase/functions/send-email/handlers/appointment.ts'), 'utf8')
const emailTypes = readFileSync(resolve(root, '../supabase/functions/send-email/types.ts'), 'utf8')

function includes(source, token, message) {
  assert.ok(source.includes(token), message)
}

for (const [source, token, message] of [
  [operations, "recipientParticipantIds: [recipientParticipantId]", 'Initial delivery must target only the intended invitee.'],
  [operations, ".from('appointments').delete().eq('appointment_id', appointmentId)", 'Participant persistence failure must roll back the incomplete appointment.'],
  [operations, 'ATTORNEY_INVITE_PARTICIPANT_PERSISTENCE_FAILED', 'Rollback failures must expose a diagnostic error code.'],
  [operations, 'summarizeAttorneyInviteDelivery({', 'Creation must return a canonical delivery result.'],
  [operations, 'forceDelivery: true', 'Explicit resend must bypass delivery deduplication.'],
  [operations, 'excludeRecipientEmails: [user?.email]', 'Attorney resend must exclude the organizing user.'],
  [notifications, "reason: 'duplicate_notification'", 'Already-sent events must not send duplicate email.'],
  [notifications, "insert.error?.code === '23505'", 'Concurrent notification inserts must recover from dedupe races.'],
  [notifications, 'organizerName: normalizeText(metadata?.organizerName', 'Calendar email must receive organizer identity.'],
  [component, 'buildAttorneyInviteOutcome(created.delivery)', 'Modal feedback must use the real delivery result.'],
  [delivery, 'Appointment saved, but the invite email could not be delivered.', 'Delivery failure must not be reported as sent.'],
  [appointmentEmail, "const method = isCancellation ? 'CANCEL' : 'REQUEST'", 'Calendar attachment must distinguish request and cancellation.'],
  [appointmentEmail, "? 'TENTATIVE'", 'Pending invites must be emitted as tentative calendar events.'],
  [appointmentEmail, 'X-WR-TIMEZONE:', 'Calendar attachment must identify its timezone.'],
  [emailTypes, 'timezone?: string;', 'Appointment email payload must carry timezone.'],
]) {
  includes(source, token, message)
}

assert.doesNotMatch(component, /Attorney invite created and sent\./, 'The modal must not use an unconditional sent message.')
assert.doesNotMatch(operations, /participantResult\.error && !isMissingTableError/, 'Missing participant storage must not leave an orphan appointment.')

console.log('attorney calendar Phase 3 delivery contract passed')
