import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BOND_ATTORNEY_PHASE1_ACTION_SEQUENCE,
  buildAttorneyLanePhase1Usability,
  buildBondAttorneyPhase1BaselineReport,
  decorateAttorneyDocumentRequirement,
  groupAttorneyDocumentRequirements,
} from '../bondAttorneyModulePhase1.js'

const bondRequirements = [
  { id: 'bond_instruction', label: 'Bond Instruction', category: 'bond_documents', requiredFrom: 'buyer', status: 'missing', reason: 'Bond/hybrid transaction requires bond instruction handling.' },
  { id: 'bond_grant_letter', label: 'Grant Letter', category: 'bond_documents', requiredFrom: 'buyer', status: 'requested', requestId: 'request-grant-letter' },
  { id: 'bank_requirements', label: 'Bank Requirements', category: 'bond_documents', requiredFrom: 'buyer', status: 'uploaded', requestId: 'request-bank-requirements' },
  { id: 'buyer_bank_fica', label: 'Buyer FICA for Bank', category: 'fica', requiredFrom: 'buyer', status: 'missing' },
  { id: 'bond_documents', label: 'Bond Documents', category: 'bond_documents', requiredFrom: 'attorney', clientUploadAllowed: false, status: 'missing' },
  { id: 'bank_signing_documents', label: 'Bank Signing Documents', category: 'signing_documents', requiredFrom: 'attorney', clientUploadAllowed: false, status: 'missing', requiresSignature: true },
  { id: 'guarantees_issued', label: 'Guarantees Issued', category: 'bond_documents', requiredFrom: 'attorney', clientUploadAllowed: false, status: 'complete' },
  { id: 'bank_approval_conditions', label: 'Bank Approval Conditions', category: 'bond_documents', requiredFrom: 'buyer', status: 'rejected' },
  { id: 'proof_of_insurance', label: 'Proof of Insurance', category: 'bond_documents', requiredFrom: 'buyer', status: 'missing' },
  { id: 'banking_mandate', label: 'Debit Order / Banking Mandate', category: 'bond_documents', requiredFrom: 'buyer', status: 'missing' },
]

assert.deepEqual(
  BOND_ATTORNEY_PHASE1_ACTION_SEQUENCE.map((item) => item.id),
  ['request', 'upload', 'review', 'generate', 'sign'],
)

const missing = decorateAttorneyDocumentRequirement(bondRequirements[0])
assert.equal(missing.status, 'missing')
assert.equal(missing.ownerLabel, 'Buyer')
assert.equal(missing.nextAction, 'Create document request')
assert.equal(missing.actionMap.find((item) => item.id === 'request').status, 'next')

const uploaded = decorateAttorneyDocumentRequirement(bondRequirements[2])
assert.equal(uploaded.status, 'review')
assert.equal(uploaded.nextAction, 'Review uploaded document')
assert.equal(uploaded.actionMap.find((item) => item.id === 'review').status, 'next')

const attorneyControlled = decorateAttorneyDocumentRequirement(bondRequirements[4])
assert.equal(attorneyControlled.ownerLabel, 'Attorney')
assert.equal(attorneyControlled.nextAction, 'Prepare or attach attorney-controlled evidence')
assert.equal(attorneyControlled.actionMap.find((item) => item.id === 'upload').status, 'not_applicable')
assert.equal(attorneyControlled.actionMap.find((item) => item.id === 'generate').status, 'manual_or_later')

const signing = decorateAttorneyDocumentRequirement(bondRequirements[5])
assert.equal(signing.actionMap.find((item) => item.id === 'sign').status, 'waiting')

const groups = groupAttorneyDocumentRequirements(bondRequirements)
assert.equal(groups[0].key, 'bond_documents')
assert.equal(groups.reduce((sum, group) => sum + group.count, 0), 10)

const usability = buildAttorneyLanePhase1Usability({
  laneKey: 'bond',
  label: 'Bond Attorney',
  documentRequirements: bondRequirements,
  signingRequirements: [{ id: 'buyer_bond_documents_signature', label: 'Buyer Bond Documents Signature' }],
  documentSummary: { missing: 7 },
  permissions: { canRequestDocuments: true },
  summary: { nextAction: 'Review bank conditions' },
})

assert.equal(usability.documentRequestActionLabel, 'Create Document Requests')
assert.match(usability.documentRequestActionDescription, /does not generate legal documents/)
assert.equal(usability.requirementCount, 10)
assert.equal(usability.visibleRequirementCount, 10)
assert.equal(usability.hiddenRequirementCount, 0)
assert.equal(usability.roleFocused, true)
assert.equal(usability.counts.review, 1)
assert.equal(usability.counts.attorneyControlled, 3)
assert.equal(usability.counts.signing, 1)

const report = buildBondAttorneyPhase1BaselineReport({
  laneKey: 'bond',
  label: 'Bond Attorney',
  documentRequirements: bondRequirements,
  permissions: { canRequestDocuments: true },
  summary: { nextAction: 'Review bank conditions' },
})

assert.equal(report.readyForPhase2, true, JSON.stringify(report, null, 2))
assert.equal(report.hiddenRequirementCount, 0)
assert.equal(report.documentRequestActionLabel, 'Create Document Requests')

const panelSource = readFileSync(new URL('../../../components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx', import.meta.url), 'utf8')
assert.match(panelSource, /buildAttorneyLanePhase1Usability/)
assert.match(panelSource, /handleCreateMissingDocumentRequests/)
assert.match(panelSource, /documentRequestActionDescription/)
assert.match(panelSource, /attorney-lane-/)
assert.doesNotMatch(panelSource, /Generate Missing Requests/)
assert.doesNotMatch(panelSource, /documentRequirements\.slice\(0,\s*8\)/)

console.log(`Bond attorney module Phase 1 usability baseline passed (${report.requirementCount} visible requirements).`)
