#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  SIGNED_ARTIFACT_STATUSES,
  WORKFLOW_COMPLETION_MODES,
  WORKFLOW_COMPLETION_OUTCOMES,
  WORKFLOW_OVERRIDE_ACTIONS,
  WORKFLOW_OVERRIDE_CONTRACT_VERSION,
  getSignedArtifactStatusOutcome,
  getWorkflowCompletionModeOutcome,
  isSignedArtifactPrepared,
  isSignedArtifactSignatureCaptured,
  isSignedArtifactStatusAttentionRequired,
  isSignedArtifactStatusComplete,
  isSignedArtifactUploadOutstanding,
  isWorkflowCompletionModeAttentionRequired,
  isWorkflowCompletionModeException,
  isWorkflowCompletionModeFinal,
  isWorkflowCompletionModeReasonRequired,
  normalizeSignedArtifactStatus,
  normalizeWorkflowCompletionMode,
  normalizeWorkflowOverrideAction,
} from '../src/core/workflows/overrideContract.js'

const PROJECT_ROOT = new URL('../', import.meta.url)

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

assert.equal(WORKFLOW_OVERRIDE_CONTRACT_VERSION, 'workflow_override_contract_v1')
assert.equal(Object.isFrozen(WORKFLOW_COMPLETION_MODES), true)
assert.equal(Object.isFrozen(WORKFLOW_OVERRIDE_ACTIONS), true)
assert.equal(Object.isFrozen(SIGNED_ARTIFACT_STATUSES), true)

assert.deepEqual(Object.values(WORKFLOW_COMPLETION_MODES), [
  'digital_completed',
  'manual_uploaded',
  'manual_pending_upload',
  'agent_assisted_completed',
  'waived',
  'skipped',
  'reopened',
  'blocked',
])

assert.deepEqual(Object.values(WORKFLOW_COMPLETION_OUTCOMES), [
  'complete',
  'attention_required',
  'not_applicable',
  'reopened',
  'blocked',
])

assert.deepEqual(Object.values(WORKFLOW_OVERRIDE_ACTIONS), [
  'force_complete',
  'force_skip',
  'force_waive',
  'force_reopen',
  'force_block',
  'force_not_applicable',
])

assert.equal(normalizeWorkflowCompletionMode('digital_portal_completed'), WORKFLOW_COMPLETION_MODES.digitalCompleted)
assert.equal(normalizeWorkflowCompletionMode('manual_signed_uploaded'), WORKFLOW_COMPLETION_MODES.manualUploaded)
assert.equal(normalizeWorkflowCompletionMode('uploaded_signed'), WORKFLOW_COMPLETION_MODES.manualUploaded)
assert.equal(normalizeWorkflowCompletionMode('signed_external_pending_upload'), WORKFLOW_COMPLETION_MODES.manualPendingUpload)
assert.equal(normalizeWorkflowCompletionMode('hard_copy_pending_upload'), WORKFLOW_COMPLETION_MODES.manualPendingUpload)
assert.equal(normalizeWorkflowCompletionMode('agent_assisted_completed'), WORKFLOW_COMPLETION_MODES.agentAssistedCompleted)
assert.equal(normalizeWorkflowCompletionMode('hard_copy'), '')
assert.equal(normalizeWorkflowCompletionMode('agent_assisted'), '')

assert.equal(isWorkflowCompletionModeFinal('digital_completed'), true)
assert.equal(isWorkflowCompletionModeFinal('manual_uploaded'), true)
assert.equal(isWorkflowCompletionModeFinal('manual_pending_upload'), false)
assert.equal(isWorkflowCompletionModeAttentionRequired('manual_pending_upload'), true)
assert.equal(isWorkflowCompletionModeAttentionRequired('blocked'), true)
assert.equal(isWorkflowCompletionModeException('manual_uploaded'), false)
assert.equal(isWorkflowCompletionModeException('force_waive'), true)
assert.equal(isWorkflowCompletionModeReasonRequired('force_complete'), false)
assert.equal(isWorkflowCompletionModeReasonRequired('force_waive'), true)
assert.equal(isWorkflowCompletionModeReasonRequired('force_reopen'), true)

assert.equal(normalizeWorkflowOverrideAction('complete'), WORKFLOW_OVERRIDE_ACTIONS.forceComplete)
assert.equal(normalizeWorkflowOverrideAction('force_skip'), WORKFLOW_OVERRIDE_ACTIONS.forceSkip)
assert.equal(normalizeWorkflowOverrideAction('waived'), WORKFLOW_OVERRIDE_ACTIONS.forceWaive)
assert.equal(normalizeWorkflowOverrideAction('not_applicable'), WORKFLOW_OVERRIDE_ACTIONS.forceNotApplicable)
assert.equal(normalizeWorkflowOverrideAction('blocked'), WORKFLOW_OVERRIDE_ACTIONS.forceBlock)

assert.equal(normalizeSignedArtifactStatus('signed'), SIGNED_ARTIFACT_STATUSES.signed)
assert.equal(normalizeSignedArtifactStatus('completed'), SIGNED_ARTIFACT_STATUSES.signed)
assert.equal(normalizeSignedArtifactStatus('fully_signed'), SIGNED_ARTIFACT_STATUSES.signed)
assert.equal(normalizeSignedArtifactStatus('uploaded_signed'), SIGNED_ARTIFACT_STATUSES.uploadedSigned)
assert.equal(normalizeSignedArtifactStatus('signed_uploaded'), SIGNED_ARTIFACT_STATUSES.signedUploaded)
assert.equal(normalizeSignedArtifactStatus('uploaded'), SIGNED_ARTIFACT_STATUSES.uploadedSigned)
assert.equal(normalizeSignedArtifactStatus('manual_pending_upload'), SIGNED_ARTIFACT_STATUSES.signedExternalPendingUpload)
assert.equal(normalizeSignedArtifactStatus('signed_external_pending_upload'), SIGNED_ARTIFACT_STATUSES.signedExternalPendingUpload)
assert.equal(normalizeSignedArtifactStatus('generated_for_physical_signature'), SIGNED_ARTIFACT_STATUSES.generatedForPhysicalSignature)
assert.equal(normalizeSignedArtifactStatus('sent'), SIGNED_ARTIFACT_STATUSES.sentForSignature)

for (const status of ['signed', 'completed', 'fully_signed', 'uploaded_signed', 'signed_uploaded']) {
  assert.equal(isSignedArtifactStatusComplete(status), true, `${status} should complete a signed artifact`)
}

for (const status of ['not_started', 'generated_for_physical_signature', 'sent_for_signature', 'signed_external_pending_upload']) {
  assert.equal(isSignedArtifactStatusComplete(status), false, `${status} should not complete a signed artifact`)
}

assert.equal(isSignedArtifactUploadOutstanding('signed_external_pending_upload'), true)
assert.equal(isSignedArtifactUploadOutstanding('uploaded_signed'), false)
assert.equal(isSignedArtifactStatusAttentionRequired('signed_external_pending_upload'), true)
assert.equal(isSignedArtifactStatusAttentionRequired('declined'), true)
assert.equal(isSignedArtifactStatusAttentionRequired('failed'), true)
assert.equal(isSignedArtifactSignatureCaptured('signed_external_pending_upload'), true)
assert.equal(isSignedArtifactSignatureCaptured('generated_for_physical_signature'), false)
assert.equal(isSignedArtifactPrepared('generated_for_physical_signature'), true)
assert.equal(isSignedArtifactPrepared('sent_to_seller'), true)
assert.equal(isSignedArtifactPrepared('not_started'), false)

assert.deepEqual(getWorkflowCompletionModeOutcome('manual_uploaded'), {
  mode: 'manual_uploaded',
  outcome: 'complete',
  complete: true,
  final: true,
  attentionRequired: false,
  uploadRequired: false,
  exception: false,
  reasonRequired: false,
})

assert.deepEqual(getWorkflowCompletionModeOutcome('manual_pending_upload'), {
  mode: 'manual_pending_upload',
  outcome: 'attention_required',
  complete: false,
  final: false,
  attentionRequired: true,
  uploadRequired: true,
  exception: false,
  reasonRequired: false,
})

assert.deepEqual(getWorkflowCompletionModeOutcome('force_waive'), {
  mode: 'waived',
  outcome: 'not_applicable',
  complete: true,
  final: true,
  attentionRequired: false,
  uploadRequired: false,
  exception: true,
  reasonRequired: true,
})

assert.deepEqual(getWorkflowCompletionModeOutcome('force_reopen'), {
  mode: 'reopened',
  outcome: 'reopened',
  complete: false,
  final: false,
  attentionRequired: true,
  uploadRequired: false,
  exception: true,
  reasonRequired: true,
})

assert.deepEqual(getSignedArtifactStatusOutcome('signed_external_pending_upload'), {
  status: 'signed_external_pending_upload',
  complete: false,
  final: true,
  attentionRequired: true,
  uploadRequired: true,
})

assert.deepEqual(getSignedArtifactStatusOutcome('uploaded_signed'), {
  status: 'uploaded_signed',
  complete: true,
  final: true,
  attentionRequired: false,
  uploadRequired: false,
})

const currentStatusVocabulary = [
  'approved',
  'generated_for_physical_signature',
  'manual_signed_document_uploaded',
  'mandate_signed',
  'sent_for_signature',
  'sent_to_agent',
  'agent_signed',
  'sent_to_seller',
  'seller_signed',
  'signed',
  'signed_external_pending_upload',
  'signed_physical_mandate_uploaded',
  'signed_uploaded',
  'uploaded_signed',
  'verified',
]

for (const status of currentStatusVocabulary) {
  assert.notEqual(normalizeSignedArtifactStatus(status, ''), '', `${status} must stay in the contract alias map`)
}

const packageJson = readProjectFile('package.json')
assert.match(packageJson, /"test:workflow-override-contract-phase0":\s*"node scripts\/workflow-override-contract-phase0\.test\.mjs"/)

console.log('workflow override contract Phase 0 tests passed')
