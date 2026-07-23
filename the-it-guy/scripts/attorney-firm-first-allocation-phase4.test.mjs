import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const api = fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8')
const wizard = fs.readFileSync(path.join(root, 'src/components/AgentNewDealWizard.jsx'), 'utf8')
const migration = fs.readFileSync(
  path.join(root, '../supabase/migrations/202607170001_attorney_firm_first_agent_nomination_phase4.sql'),
  'utf8',
)

function assertApi(pattern, message) {
  assert.match(api, pattern, message)
}

function assertWizard(pattern, message) {
  assert.match(wizard, pattern, message)
}

assertApi(
  /export function prepareFirmFirstAttorneyRoleplayer[\s\S]*FIRM_FIRST_ATTORNEY_ROLE_TYPES\.has\(selection\?\.roleType\)[\s\S]*firmFirstAllocation: true,[\s\S]*preferredAttorneyUserId,[\s\S]*userId: null,[\s\S]*activationTrigger: 'appointed_firm_staff_assignment'/,
  'firm-first attorney roleplayer preparation should retain a preference but clear person ownership for every attorney lane',
)
assertApi(
  /const FIRM_FIRST_ATTORNEY_ROLE_TYPES = new Set\(\[[\s\S]*'transfer_attorney',[\s\S]*'bond_attorney',[\s\S]*'cancellation_attorney',[\s\S]*export function isFirmFirstAttorneyAllocation[\s\S]*const resolvedUserId = isFirmFirstAttorneyAllocationForRoleplayer\s*\?\s*null/,
  'roleplayer persistence must not resolve a firm-first attorney contact into an assigned user',
)
assertApi(
  /status: isFirmFirstAttorneyAllocationForRoleplayer \? 'selected'[\s\S]*activated_at: isFirmFirstAttorneyAllocationForRoleplayer \? null/,
  'a firm-first attorney roleplayer should remain selected rather than active while awaiting the firm',
)
assertApi(
  /export function buildCreationAttorneyAssignmentPayload[\s\S]*preferred_attorney_user_id:\s*isFirmFirstAttorneyAllocationForRoleplayer[\s\S]*firm_acceptance_status:\s*isFirmFirstAttorneyAllocationForRoleplayer\s*\?\s*'awaiting_firm_acceptance'[\s\S]*allocation_state:\s*isFirmFirstAttorneyAllocationForRoleplayer[\s\S]*assignment_status:\s*isFirmFirstAttorneyAllocationForRoleplayer\s*\?\s*'pending'/,
  'deal creation should produce a pending firm-level canonical assignment',
)
assertApi(
  /const attorneyUserId = isFirmFirstAttorneyAllocationForRoleplayer\s*\?\s*null\s*:\s*await resolveAttorneyFirmPrimaryUserId/,
  'deal creation must not auto-select the first member of a nominated attorney firm',
)
assertApi(
  /\.in\('allocation_state', \['awaiting_firm_acceptance', 'awaiting_staff_assignment', 'staff_assigned', 'active'\]\)/,
  'retries should find every open firm-first attorney allocation',
)
assertApi(
  /\['transfer_attorney', 'bond_attorney', 'cancellation_attorney'\]\.includes\(selection\.roleType\)[\s\S]*isFirmFirstAttorneyAllocation\(selection\)[\s\S]*\? 'attorney_firm_nominated'/,
  'agent handoff events should distinguish firm nomination from person assignment in every attorney lane',
)

assertWizard(/Transfer Attorney Firm/, 'the agent flow should describe the selected entity as a firm')
assertWizard(/Use Seller-Appointed Firm/, 'the transfer appointment authority should be represented as seller-side')
assertWizard(/Preferred Contact \(Optional\)/, 'the external firm contact should be explicitly optional')
assertWizard(
  /This preference does not assign the matter to a person\. The firm controls its internal allocation\./,
  'the UI should explain that a preferred contact is not the assignee',
)
assertWizard(
  /Awaiting firm acceptance • Primary attorney will be assigned by the firm/,
  'the review step should show the pending firm-first lifecycle',
)
assertWizard(
  /partnerOrganisationId: selectedTransferPartner\?\.partnerOrganisationId \|\| null/,
  'the selected connected firm organisation should propagate into transaction creation',
)
assertWizard(
  /source: transferSelection\.mode === PARTNER_MODE_AGENCY \? 'agency_preferred' : 'seller_nomination'/,
  'seller nominations should no longer be recorded as buyer appointments',
)
assertWizard(
  /attorneyEmail: '',/,
  'a preferred firm contact must not populate the legacy assigned-attorney person field',
)
assertWizard(
  /Transfer attorney firm nominated\. Awaiting firm acceptance and internal primary attorney assignment\./,
  'the transaction next action should expose the pending firm-first lifecycle',
)

assert.match(migration, /'seller_nomination'/, 'the roleplayer source constraint should accept seller nominations')
assert.match(migration, /'agent_firm_nomination'/, 'the participant source constraint should accept firm nominations')
assert.doesNotMatch(migration, /drop column|delete from/i, 'the Phase 4 migration should remain additive and non-destructive')

console.log('Attorney firm-first allocation Phase 4 agent experience tests passed')
