import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const repositoryRoot = path.resolve(root, '..')
const read = (relativePath, base = root) => readFileSync(path.join(base, relativePath), 'utf8')

const assignments = read('src/services/transactionAttorneyAssignments.js')
const form = read('src/components/attorney/assignments/AttorneyAssignmentForm.jsx')
const migration = read('supabase/migrations/202607180039_attorney_assignment_qualification_phase6.sql', repositoryRoot)

assert.match(assignments, /deriveAttorneyProfessionalProfile/)
assert.match(assignments, /getAttorneyAssignmentEligibility/)
assert.match(assignments, /practiceQualifications: member\.practiceQualifications/)
assert.match(assignments, /supportingAttorneys/)
assert.doesNotMatch(assignments, /TRANSFER_PRIMARY_ROLES|BOND_PRIMARY_ROLES|CANCELLATION_PRIMARY_ROLES/)
assert.match(form, /roleMembers\.supportingAttorneys/)
assert.match(form, /form\.isPrimary \? assignableMembers\.primaryAttorneys : assignableMembers\.supportingAttorneys/)

assert.match(migration, /bridge_attorney_member_assignment_eligible/)
assert.match(migration, /professional_role = 'attorney_conveyancer'/)
assert.match(migration, /'cancellation_attorney' then 'cancellation'/)
assert.match(migration, /professional_role = 'candidate_attorney'/)
assert.match(migration, /trg_attorney_assignment_professional_profile_phase6/)
assert.match(migration, /raise exception using[\s\S]*errcode = '23514'/)

const server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true } })

try {
  const service = await server.ssrLoadModule('/src/services/transactionAttorneyAssignments.js')
  const eligibility = service.getAttorneyAssignmentEligibility

  const transferAttorney = {
    role: 'transfer_attorney',
    professionalRole: 'attorney_conveyancer',
    practiceQualifications: ['transfer'],
  }
  assert.equal(eligibility(transferAttorney, 'transfer', 'primary').eligible, true)
  assert.equal(eligibility(transferAttorney, 'bond', 'primary').eligible, false)
  assert.equal(eligibility(transferAttorney, 'cancellation', 'primary').eligible, false)

  const multiQualifiedAttorney = {
    role: 'transfer_attorney',
    professionalRole: 'attorney_conveyancer',
    practiceQualifications: ['transfer', 'bond', 'cancellation'],
  }
  assert.equal(eligibility(multiQualifiedAttorney, 'bond', 'primary').eligible, true)
  assert.equal(eligibility(multiQualifiedAttorney, 'cancellation', 'primary').eligible, true)

  const director = { professionalRole: 'director_partner', practiceQualifications: [] }
  assert.equal(eligibility(director, 'transfer', 'primary').eligible, true)
  assert.equal(eligibility(director, 'bond', 'primary').eligible, true)
  assert.equal(eligibility(director, 'cancellation', 'primary').eligible, true)

  const candidate = { professionalRole: 'candidate_attorney', practiceQualifications: [] }
  assert.equal(eligibility(candidate, 'transfer', 'primary').eligible, false)
  assert.equal(eligibility(candidate, 'transfer', 'supporting').eligible, true)
  assert.equal(eligibility(candidate, 'transfer', 'secretary').eligible, true)

  const secretary = { professionalRole: 'conveyancing_secretary' }
  assert.equal(eligibility(secretary, 'transfer', 'primary').eligible, false)
  assert.equal(eligibility(secretary, 'transfer', 'secretary').eligible, true)
  assert.equal(eligibility({ professionalRole: 'viewer' }, 'transfer', 'supporting').eligible, false)

  console.log('Attorney assignment eligibility Phase 6 verification passed.')
} finally {
  await server.close()
}
