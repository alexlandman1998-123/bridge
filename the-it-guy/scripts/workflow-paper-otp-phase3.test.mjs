#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'

const PROJECT_ROOT = new URL('../', import.meta.url)

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

const actionAvailabilitySource = readProjectFile('server/services/workflowActionAvailabilityService.js')
const actionServiceSource = readProjectFile('server/services/workflowActionService.js')
const unitDetailSource = readProjectFile('src/pages/UnitDetail.jsx')
const subprocessPanelSource = readProjectFile('src/components/SubprocessWorkflowPanel.jsx')
const packageJson = readProjectFile('package.json')

assert.match(
  actionAvailabilitySource,
  /RECORD_PAPER_SIGNED_OTP:\s*\{[\s\S]*label:\s*'Record Paper Signed OTP'[\s\S]*stepKey:\s*'signed_otp_received'/,
  'Workflow actions should expose a first-class paper signed OTP action.',
)

assert.match(
  actionServiceSource,
  /SIGNED_OTP_DOCUMENT_REQUIRED/,
  'Paper signed OTP action should require an uploaded signed OTP document.',
)

assert.match(
  actionServiceSource,
  /RECORD_PAPER_SIGNED_OTP:\s*\{[\s\S]*resolveEvidenceId:\s*resolveSignedOtpDocumentEvidenceId[\s\S]*requiredCode:\s*'SIGNED_OTP_DOCUMENT_REQUIRED'/,
  'Paper signed OTP action should resolve uploaded signed OTP documents through the shared document evidence contract.',
)

assert.match(
  actionServiceSource,
  /const actionDocumentEvidenceId = resolveWorkflowActionDocumentEvidenceId\(actionKey, payload\)[\s\S]*evidenceType:\s*'document'[\s\S]*evidenceId:\s*actionDocumentEvidenceId/,
  'Paper signed OTP action should attach the uploaded document as workflow evidence.',
)

for (const [label, source] of [
  ['UnitDetail', unitDetailSource],
  ['SubprocessWorkflowPanel', subprocessPanelSource],
]) {
  assert.match(source, /actionKey:\s*'RECORD_PAPER_SIGNED_OTP'/, `${label} should run the paper signed OTP action after upload.`)
  assert.match(source, /source:\s*'paper_signed_otp_upload'/, `${label} should mark the signed OTP upload source.`)
  assert.match(source, /signedOtpDocumentId:\s*uploadedSignedOtp\?\.id/, `${label} should pass the uploaded document id into the workflow action.`)
}

assert.match(
  packageJson,
  /"test:workflow-paper-otp-phase3":\s*"node scripts\/workflow-paper-otp-phase3\.test\.mjs"/,
  'package.json should expose the Phase 3 paper OTP regression test.',
)

console.log('workflow paper OTP Phase 3 tests passed')
