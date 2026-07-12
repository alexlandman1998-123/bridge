#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  buildNonDigitalWorkflowActionPayloadBlockers,
  isNonDigitalWorkflowAction,
} from '../server/services/workflowActionPayloadPolicyService.js'

const PROJECT_ROOT = new URL('../', import.meta.url)

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

const actionServiceSource = readProjectFile('server/services/workflowActionService.js')
const unitDetailSource = readProjectFile('src/pages/UnitDetail.jsx')
const attorneyDetailSource = readProjectFile('src/pages/AttorneyTransactionDetail.jsx')
const subprocessPanelSource = readProjectFile('src/components/SubprocessWorkflowPanel.jsx')
const workflowActionTestSource = readProjectFile('server/tests/workflowActionService.test.js')
const packageJson = readProjectFile('package.json')

const agentDescriptor = {
  actionKey: 'RECORD_AGENT_ASSISTED_SUPPORTING_DOCS',
  actionContext: 'agent_assisted_supporting_docs',
  workflowKey: 'sales_otp',
  stepKey: 'supporting_docs_complete',
  ownerRole: 'agent',
}
const manualDescriptor = {
  actionKey: 'RECORD_PAPER_SIGNED_OTP',
  actionContext: 'paper_otp_upload',
  workflowKey: 'sales_otp',
  stepKey: 'signed_otp_received',
  ownerRole: 'agent',
}

assert.equal(isNonDigitalWorkflowAction(agentDescriptor), true)
assert.equal(isNonDigitalWorkflowAction(manualDescriptor), true)

assert.deepEqual(
  buildNonDigitalWorkflowActionPayloadBlockers(agentDescriptor, {
    source: 'agent_assisted_supporting_docs',
    completionMode: 'agent_assisted_completed',
    captureMethod: 'offline_verified',
  }).map((blocker) => blocker.code),
  ['WORKFLOW_ACTION_AUDIT_REASON_REQUIRED', 'WORKFLOW_ACTION_CLIENT_CONSENT_METHOD_REQUIRED'],
)

assert.equal(
  buildNonDigitalWorkflowActionPayloadBlockers(agentDescriptor, {
    source: 'agent_assisted_supporting_docs',
    completionMode: 'agent_assisted_completed',
    captureMethod: 'offline_verified',
    clientConsentMethod: 'agent_attested_document_review',
    reason: 'Agent verified supporting documents outside the client portal.',
  }).length,
  0,
)

assert.deepEqual(
  buildNonDigitalWorkflowActionPayloadBlockers(manualDescriptor, {
    source: 'paper_signed_otp_upload',
    completionMode: 'agent_assisted_completed',
    captureMethod: 'paper_signature_upload',
    clientConsentMethod: 'signed_document_uploaded',
    reason: 'Signed paper OTP was uploaded.',
  }).map((blocker) => blocker.code),
  ['WORKFLOW_ACTION_COMPLETION_MODE_INVALID'],
)

assert.match(
  actionServiceSource,
  /buildNonDigitalWorkflowActionPayloadBlockers[\s\S]*payloadPolicyBlockers[\s\S]*return payloadPolicyBlockers/,
  'Workflow action service should run the shared non-digital payload policy.',
)

for (const [label, source] of [
  ['UnitDetail', unitDetailSource],
  ['AttorneyTransactionDetail', attorneyDetailSource],
]) {
  assert.match(source, /clientConsentMethod:\s*'agent_attested_client_instruction'/, `${label} should capture assisted onboarding consent method.`)
  assert.match(source, /reason:\s*'Agent recorded client onboarding completion/, `${label} should capture assisted onboarding reason.`)
  assert.match(source, /clientConsentMethod:\s*'agent_attested_document_review'/, `${label} should capture supporting docs consent method.`)
}

for (const [label, source] of [
  ['UnitDetail', unitDetailSource],
  ['SubprocessWorkflowPanel', subprocessPanelSource],
]) {
  assert.match(source, /captureMethod:\s*'paper_signature_upload'/, `${label} should capture paper OTP upload method.`)
  assert.match(source, /clientConsentMethod:\s*'signed_document_uploaded'/, `${label} should capture paper OTP consent evidence.`)
  assert.match(source, /reason:\s*'Client signed the OTP outside the digital signing flow/, `${label} should capture paper OTP reason.`)
}

assert.match(attorneyDetailSource, /reason:\s*'Parties signed the contract document pack outside the digital signing flow/, 'Attorney manual contract uploads should capture a reason.')
assert.match(workflowActionTestSource, /WORKFLOW_ACTION_AUDIT_REASON_REQUIRED/, 'Workflow action tests should cover missing audit metadata blockers.')
assert.match(
  packageJson,
  /"test:workflow-action-payload-policy-phase10":\s*"node scripts\/workflow-action-payload-policy-phase10\.test\.mjs"/,
  'package.json should expose the Phase 10 payload policy regression test.',
)

console.log('workflow action payload policy Phase 10 tests passed')
