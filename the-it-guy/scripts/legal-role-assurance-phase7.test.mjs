import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const migration = readFileSync(
  new URL('../../supabase/migrations/202607150013_legal_role_assurance_phase7.sql', import.meta.url),
  'utf8',
)
const service = readFileSync(new URL('../src/services/legalRoleAppointmentService.js', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

assert.match(migration, /create or replace view public\.legal_role_coordination_assurance_v1/)
assert.match(migration, /with \(security_invoker = true\)/)
assert.match(migration, /appointment_evidence_missing/)
assert.match(migration, /assignment_outside_appointed_firm/)
assert.match(migration, /bank_instruction_evidence_missing/)
assert.match(migration, /active_assignment_instruction_mismatch/)
assert.match(migration, /replacement_role_still_live/)
assert.match(migration, /superseded_by_appointment_id/)
assert.match(migration, /grant select on public\.legal_role_coordination_assurance_v1 to authenticated/)
assert.doesNotMatch(migration, /\b(update|delete from|insert into) public\.transaction_legal_role_appointments\b/i)
assert.match(service, /export function deriveBankLegalRoleAssurance/)
assert.match(service, /export async function listBankLegalRoleAssurance/)
assert.match(page, /Coordination records reconciled/)
assert.match(page, /Coordination reconciliation blocked/)

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const server = await createServer({ root: projectRoot, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const { deriveBankLegalRoleAssurance } = await server.ssrLoadModule('/src/services/legalRoleAppointmentService.js')

  const missingEvidence = deriveBankLegalRoleAssurance({
    coordination_state: 'appointment_captured',
    evidence_confirmed: false,
  })
  assert.equal(missingEvidence.health, 'blocked')
  assert.equal(missingEvidence.issue, 'appointment_evidence_missing')

  const databaseDrift = deriveBankLegalRoleAssurance({
    coordination_state: 'active',
    evidence_confirmed: true,
  }, {
    assurance_health: 'blocked',
    assurance_issue: 'active_assignment_instruction_mismatch',
  })
  assert.equal(databaseDrift.health, 'blocked')
  assert.match(databaseDrift.issueLabel, /active primary assignment/i)

  const overdueButConsistent = deriveBankLegalRoleAssurance({
    coordination_state: 'invite_sent',
    evidence_confirmed: true,
    invitation_id: 'invite-1',
  }, {
    assurance_health: 'attention',
    assurance_issue: null,
  })
  assert.equal(overdueButConsistent.health, 'attention')
  assert.equal(overdueButConsistent.issue, null)

  const reconciled = deriveBankLegalRoleAssurance({
    coordination_state: 'active',
    evidence_confirmed: true,
    invitation_id: 'invite-1',
    accepted_firm_id: 'firm-1',
    accepted_organisation_id: 'org-1',
    instruction_issuer: 'bank',
    instruction_reference: 'BANK-123',
  }, {
    assurance_health: 'on_track',
    assurance_issue: null,
  })
  assert.equal(reconciled.reconciled, true)

  const migrationPending = deriveBankLegalRoleAssurance({
    coordination_state: 'appointment_captured',
    evidence_confirmed: true,
  })
  assert.equal(migrationPending.health, 'unverified')
  assert.equal(migrationPending.reconciled, false)
} finally {
  await server.close()
}

console.log('legal role assurance Phase 7 contracts passed')
