import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../../supabase/migrations/20260827083108_normalize_transaction_participant_statuses.sql', import.meta.url),
  'utf8',
)
const api = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const participantPayloadStart = api.indexOf('async function ensureRoleplayerTransactionParticipant')
const participantPayloadEnd = api.indexOf('function attorneyAssignmentTypeForRoleplayer', participantPayloadStart)
const participantPayload = api.slice(participantPayloadStart, participantPayloadEnd)

assert.match(migration, /bridge_normalize_transaction_participant_status/)
assert.match(migration, /before insert or update of status/)
assert.match(migration, /'pending'[\s\S]+then 'invited'/)
assert.match(migration, /transaction_participants_status_check/)
assert.match(migration, /status in \(\s*'draft',\s*'invited',\s*'active',\s*'removed'\s*\)/)
assert.match(migration, /revoke all on function public\.bridge_normalize_transaction_participant_status\(\)/)

assert.match(api, /pending:\s*'invited'/)
assert.match(api, /row\.status = normalizeStakeholderStatus\(row\.status, 'draft'\)/)
assert.match(participantPayload, /status:\s*isFirmFirstAttorneyAllocationForRoleplayer \? 'invited' : 'active'/)
assert.doesNotMatch(participantPayload, /status:\s*isFirmFirstAttorneyAllocationForRoleplayer \? 'pending' : 'active'/)

console.log('transaction participant status normalization contract passed')
