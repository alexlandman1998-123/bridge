import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const component = readFileSync(resolve(root, 'src/components/attorney/scheduling/AttorneySchedulingWorkspace.jsx'), 'utf8')
const service = readFileSync(resolve(root, 'src/services/attorneyOperations.js'), 'utf8')
const migration = readFileSync(resolve(root, '../supabase/migrations/202605130001_appointment_module_v1.sql'), 'utf8')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function assertIncludes(source, token, label = token) {
  assert(source.includes(token), `Expected ${label}`)
}

for (const [source, token, label] of [
  [component, 'ATTORNEY_INVITE_LOCATION_OPTIONS.map', 'shared location options in the invite modal'],
  [component, "updateDraft('locationMode', event.target.value)} required", 'required location mode control'],
  [component, "updateDraft('resourceId', event.target.value)} required", 'required boardroom control'],
  [component, 'buildAttorneyInviteContract({', 'contract validation before submission'],
  [component, 'recipientName: inviteDraft.recipientName || selectedMatter.clientName', 'matter client-name fallback'],
  [component, 'createAttorneyAppointmentInvite(inviteContract.value)', 'normalized invite service payload'],
  [service, 'const invite = requireValidAttorneyInvite(input)', 'service-boundary invite validation'],
  [service, 'timezone: invite.timezone', 'explicit appointment timezone persistence'],
  [service, 'location_type: invite.locationType', 'canonical location type persistence'],
  [service, 'resource_id: invite.resourceId', 'boardroom resource persistence'],
  [migration, "'physical_address', 'video_call', 'phone_call', 'to_be_confirmed'", 'database-supported location values'],
]) {
  assertIncludes(source, token, label)
}

assert(!component.includes('<option value="office">'), 'The invite modal must not submit the unsupported office location type')
assert(!component.includes('inviteDraft.locationType'), 'The invite modal must use locationMode and normalize it at the contract boundary')

console.log('attorney calendar Phase 2 integration contract passed')
