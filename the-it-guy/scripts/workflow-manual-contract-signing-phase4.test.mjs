#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'

const PROJECT_ROOT = new URL('../', import.meta.url)

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

const actionAvailabilitySource = readProjectFile('server/services/workflowActionAvailabilityService.js')
const actionServiceSource = readProjectFile('server/services/workflowActionService.js')
const attorneyDetailSource = readProjectFile('src/pages/AttorneyTransactionDetail.jsx')
const packageJson = readProjectFile('package.json')

for (const [actionKey, stepKey] of [
  ['RECORD_MANUAL_SIGNED_TRANSFER_DOCUMENTS', 'transfer_documents_signed'],
  ['RECORD_MANUAL_SIGNED_BOND_DOCUMENTS', 'bond_documents_signed'],
  ['RECORD_MANUAL_SIGNED_CANCELLATION_DOCUMENTS', 'cancellation_documents_signed'],
]) {
  assert.match(
    actionAvailabilitySource,
    new RegExp(`${actionKey}:\\s*\\{[\\s\\S]*stepKey:\\s*'${stepKey}'[\\s\\S]*actionContext:\\s*'manual_signed_contract_upload'`),
    `${actionKey} should be a first-class manual signing workflow action.`,
  )
}

for (const code of [
  'SIGNED_TRANSFER_DOCUMENTS_REQUIRED',
  'SIGNED_BOND_DOCUMENTS_REQUIRED',
  'SIGNED_CANCELLATION_DOCUMENTS_REQUIRED',
]) {
  assert.match(actionServiceSource, new RegExp(code), `Workflow action service should validate ${code}.`)
}

assert.match(
  actionServiceSource,
  /evidenceType:\s*'document'[\s\S]*evidenceId:\s*actionDocumentEvidenceId/,
  'Manual signed contract actions should attach uploaded document evidence.',
)

assert.match(
  attorneyDetailSource,
  /function resolveManualSignedContractActionKey/,
  'Attorney transaction detail should resolve manual signed contract actions from document keys.',
)
assert.match(
  attorneyDetailSource,
  /actionKey:\s*manualSignedContractActionKey/,
  'Attorney document upload should run the resolved manual signed contract workflow action.',
)
assert.match(
  attorneyDetailSource,
  /signedContractDocumentId:\s*uploadedDocument\?\.id/,
  'Attorney document upload should pass the uploaded signed contract document id.',
)

assert.match(
  packageJson,
  /"test:workflow-manual-contract-signing-phase4":\s*"node scripts\/workflow-manual-contract-signing-phase4\.test\.mjs"/,
  'package.json should expose the Phase 4 manual contract signing regression test.',
)

console.log('workflow manual contract signing Phase 4 tests passed')
