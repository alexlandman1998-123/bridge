const normalizeKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, '_')

const freeze = (value) => Object.freeze(value)

export const WORKFLOW_OVERRIDE_CONTRACT_VERSION = 'workflow_override_contract_v1'

export const WORKFLOW_COMPLETION_OUTCOMES = freeze({
  complete: 'complete',
  attentionRequired: 'attention_required',
  notApplicable: 'not_applicable',
  reopened: 'reopened',
  blocked: 'blocked',
})

export const WORKFLOW_COMPLETION_MODES = freeze({
  digitalCompleted: 'digital_completed',
  manualUploaded: 'manual_uploaded',
  manualPendingUpload: 'manual_pending_upload',
  agentAssistedCompleted: 'agent_assisted_completed',
  waived: 'waived',
  skipped: 'skipped',
  reopened: 'reopened',
  blocked: 'blocked',
})

export const WORKFLOW_OVERRIDE_ACTIONS = freeze({
  forceComplete: 'force_complete',
  forceSkip: 'force_skip',
  forceWaive: 'force_waive',
  forceReopen: 'force_reopen',
  forceBlock: 'force_block',
  forceNotApplicable: 'force_not_applicable',
})

export const SIGNED_ARTIFACT_STATUSES = freeze({
  notStarted: 'not_started',
  draft: 'draft',
  generated: 'generated',
  generatedForPhysicalSignature: 'generated_for_physical_signature',
  sentForSignature: 'sent_for_signature',
  sentToAgent: 'sent_to_agent',
  agentSigned: 'agent_signed',
  sentToSeller: 'sent_to_seller',
  sellerSigned: 'seller_signed',
  viewed: 'viewed',
  partiallySigned: 'partially_signed',
  signed: 'signed',
  uploadedSigned: 'uploaded_signed',
  signedUploaded: 'signed_uploaded',
  signedExternalPendingUpload: 'signed_external_pending_upload',
  declined: 'declined',
  expired: 'expired',
  cancelled: 'cancelled',
  failed: 'failed',
})

export const WORKFLOW_COMPLETION_MODE_ALIASES = freeze({
  complete: WORKFLOW_COMPLETION_MODES.digitalCompleted,
  completed: WORKFLOW_COMPLETION_MODES.digitalCompleted,
  digital: WORKFLOW_COMPLETION_MODES.digitalCompleted,
  digital_completed: WORKFLOW_COMPLETION_MODES.digitalCompleted,
  digital_portal_completed: WORKFLOW_COMPLETION_MODES.digitalCompleted,
  digitally_signed: WORKFLOW_COMPLETION_MODES.digitalCompleted,
  online_completed: WORKFLOW_COMPLETION_MODES.digitalCompleted,
  portal_completed: WORKFLOW_COMPLETION_MODES.digitalCompleted,

  agent_assisted_completed: WORKFLOW_COMPLETION_MODES.agentAssistedCompleted,
  assisted_capture_completed: WORKFLOW_COMPLETION_MODES.agentAssistedCompleted,
  manual_capture_completed: WORKFLOW_COMPLETION_MODES.agentAssistedCompleted,

  hard_copy_uploaded: WORKFLOW_COMPLETION_MODES.manualUploaded,
  hardcopy_uploaded: WORKFLOW_COMPLETION_MODES.manualUploaded,
  manual_signed_uploaded: WORKFLOW_COMPLETION_MODES.manualUploaded,
  manual_upload: WORKFLOW_COMPLETION_MODES.manualUploaded,
  manual_uploaded: WORKFLOW_COMPLETION_MODES.manualUploaded,
  paper_signed_uploaded: WORKFLOW_COMPLETION_MODES.manualUploaded,
  paper_uploaded: WORKFLOW_COMPLETION_MODES.manualUploaded,
  physical_signed_uploaded: WORKFLOW_COMPLETION_MODES.manualUploaded,
  uploaded_signed: WORKFLOW_COMPLETION_MODES.manualUploaded,
  signed_uploaded: WORKFLOW_COMPLETION_MODES.manualUploaded,

  hard_copy_pending_upload: WORKFLOW_COMPLETION_MODES.manualPendingUpload,
  hardcopy_pending_upload: WORKFLOW_COMPLETION_MODES.manualPendingUpload,
  manual_pending_upload: WORKFLOW_COMPLETION_MODES.manualPendingUpload,
  paper_pending_upload: WORKFLOW_COMPLETION_MODES.manualPendingUpload,
  physical_pending_upload: WORKFLOW_COMPLETION_MODES.manualPendingUpload,
  signed_external_pending_upload: WORKFLOW_COMPLETION_MODES.manualPendingUpload,

  force_skip: WORKFLOW_COMPLETION_MODES.skipped,
  skip: WORKFLOW_COMPLETION_MODES.skipped,
  skipped: WORKFLOW_COMPLETION_MODES.skipped,

  force_waive: WORKFLOW_COMPLETION_MODES.waived,
  force_not_applicable: WORKFLOW_COMPLETION_MODES.waived,
  not_applicable: WORKFLOW_COMPLETION_MODES.waived,
  waive: WORKFLOW_COMPLETION_MODES.waived,
  waived: WORKFLOW_COMPLETION_MODES.waived,

  force_reopen: WORKFLOW_COMPLETION_MODES.reopened,
  reopen: WORKFLOW_COMPLETION_MODES.reopened,
  reopened: WORKFLOW_COMPLETION_MODES.reopened,

  force_block: WORKFLOW_COMPLETION_MODES.blocked,
  block: WORKFLOW_COMPLETION_MODES.blocked,
  blocked: WORKFLOW_COMPLETION_MODES.blocked,
})

export const WORKFLOW_OVERRIDE_ACTION_ALIASES = freeze({
  complete: WORKFLOW_OVERRIDE_ACTIONS.forceComplete,
  force_complete: WORKFLOW_OVERRIDE_ACTIONS.forceComplete,
  skip: WORKFLOW_OVERRIDE_ACTIONS.forceSkip,
  skipped: WORKFLOW_OVERRIDE_ACTIONS.forceSkip,
  force_skip: WORKFLOW_OVERRIDE_ACTIONS.forceSkip,
  waive: WORKFLOW_OVERRIDE_ACTIONS.forceWaive,
  waived: WORKFLOW_OVERRIDE_ACTIONS.forceWaive,
  force_waive: WORKFLOW_OVERRIDE_ACTIONS.forceWaive,
  not_applicable: WORKFLOW_OVERRIDE_ACTIONS.forceNotApplicable,
  force_not_applicable: WORKFLOW_OVERRIDE_ACTIONS.forceNotApplicable,
  reopen: WORKFLOW_OVERRIDE_ACTIONS.forceReopen,
  reopened: WORKFLOW_OVERRIDE_ACTIONS.forceReopen,
  force_reopen: WORKFLOW_OVERRIDE_ACTIONS.forceReopen,
  block: WORKFLOW_OVERRIDE_ACTIONS.forceBlock,
  blocked: WORKFLOW_OVERRIDE_ACTIONS.forceBlock,
  force_block: WORKFLOW_OVERRIDE_ACTIONS.forceBlock,
})

export const SIGNED_ARTIFACT_STATUS_ALIASES = freeze({
  absent: SIGNED_ARTIFACT_STATUSES.notStarted,
  missing: SIGNED_ARTIFACT_STATUSES.notStarted,
  no_document: SIGNED_ARTIFACT_STATUSES.notStarted,
  none: SIGNED_ARTIFACT_STATUSES.notStarted,
  not_started: SIGNED_ARTIFACT_STATUSES.notStarted,

  draft: SIGNED_ARTIFACT_STATUSES.draft,
  in_progress: SIGNED_ARTIFACT_STATUSES.draft,
  pending: SIGNED_ARTIFACT_STATUSES.draft,

  generated: SIGNED_ARTIFACT_STATUSES.generated,
  prepared: SIGNED_ARTIFACT_STATUSES.generated,
  ready: SIGNED_ARTIFACT_STATUSES.generated,

  generated_for_physical_signature: SIGNED_ARTIFACT_STATUSES.generatedForPhysicalSignature,
  physical_signature_pending: SIGNED_ARTIFACT_STATUSES.generatedForPhysicalSignature,
  printed_for_signature: SIGNED_ARTIFACT_STATUSES.generatedForPhysicalSignature,

  sent: SIGNED_ARTIFACT_STATUSES.sentForSignature,
  sent_for_digital_signing: SIGNED_ARTIFACT_STATUSES.sentForSignature,
  sent_for_signature: SIGNED_ARTIFACT_STATUSES.sentForSignature,
  sent_to_signers: SIGNED_ARTIFACT_STATUSES.sentForSignature,

  sent_to_agent: SIGNED_ARTIFACT_STATUSES.sentToAgent,
  agent_signed: SIGNED_ARTIFACT_STATUSES.agentSigned,
  sent_to_seller: SIGNED_ARTIFACT_STATUSES.sentToSeller,
  seller_signed: SIGNED_ARTIFACT_STATUSES.sellerSigned,
  viewed: SIGNED_ARTIFACT_STATUSES.viewed,
  partially_signed: SIGNED_ARTIFACT_STATUSES.partiallySigned,

  approved: SIGNED_ARTIFACT_STATUSES.signed,
  complete: SIGNED_ARTIFACT_STATUSES.signed,
  completed: SIGNED_ARTIFACT_STATUSES.signed,
  executed: SIGNED_ARTIFACT_STATUSES.signed,
  fully_executed: SIGNED_ARTIFACT_STATUSES.signed,
  fully_signed: SIGNED_ARTIFACT_STATUSES.signed,
  mandate_signed: SIGNED_ARTIFACT_STATUSES.signed,
  signed: SIGNED_ARTIFACT_STATUSES.signed,
  verified: SIGNED_ARTIFACT_STATUSES.signed,

  manual_signed_document_uploaded: SIGNED_ARTIFACT_STATUSES.uploadedSigned,
  manual_uploaded: SIGNED_ARTIFACT_STATUSES.uploadedSigned,
  signed_physical_mandate_uploaded: SIGNED_ARTIFACT_STATUSES.uploadedSigned,
  uploaded: SIGNED_ARTIFACT_STATUSES.uploadedSigned,
  uploaded_signed: SIGNED_ARTIFACT_STATUSES.uploadedSigned,

  signed_reuploaded: SIGNED_ARTIFACT_STATUSES.signedUploaded,
  signed_uploaded: SIGNED_ARTIFACT_STATUSES.signedUploaded,

  external_signed_pending_upload: SIGNED_ARTIFACT_STATUSES.signedExternalPendingUpload,
  manual_pending_upload: SIGNED_ARTIFACT_STATUSES.signedExternalPendingUpload,
  physical_signed_pending_upload: SIGNED_ARTIFACT_STATUSES.signedExternalPendingUpload,
  signed_external_pending_upload: SIGNED_ARTIFACT_STATUSES.signedExternalPendingUpload,
  signed_pending_upload: SIGNED_ARTIFACT_STATUSES.signedExternalPendingUpload,

  declined: SIGNED_ARTIFACT_STATUSES.declined,
  rejected: SIGNED_ARTIFACT_STATUSES.declined,
  expired: SIGNED_ARTIFACT_STATUSES.expired,
  cancelled: SIGNED_ARTIFACT_STATUSES.cancelled,
  canceled: SIGNED_ARTIFACT_STATUSES.cancelled,
  voided: SIGNED_ARTIFACT_STATUSES.cancelled,
  failed: SIGNED_ARTIFACT_STATUSES.failed,
})

const FINAL_COMPLETION_MODES = freeze(new Set([
  WORKFLOW_COMPLETION_MODES.digitalCompleted,
  WORKFLOW_COMPLETION_MODES.manualUploaded,
  WORKFLOW_COMPLETION_MODES.agentAssistedCompleted,
  WORKFLOW_COMPLETION_MODES.waived,
  WORKFLOW_COMPLETION_MODES.skipped,
]))

const ATTENTION_COMPLETION_MODES = freeze(new Set([
  WORKFLOW_COMPLETION_MODES.manualPendingUpload,
  WORKFLOW_COMPLETION_MODES.reopened,
  WORKFLOW_COMPLETION_MODES.blocked,
]))

const EXCEPTION_COMPLETION_MODES = freeze(new Set([
  WORKFLOW_COMPLETION_MODES.waived,
  WORKFLOW_COMPLETION_MODES.skipped,
  WORKFLOW_COMPLETION_MODES.reopened,
  WORKFLOW_COMPLETION_MODES.blocked,
]))

const REASON_REQUIRED_COMPLETION_MODES = freeze(new Set([
  WORKFLOW_COMPLETION_MODES.waived,
  WORKFLOW_COMPLETION_MODES.skipped,
  WORKFLOW_COMPLETION_MODES.reopened,
  WORKFLOW_COMPLETION_MODES.blocked,
]))

const COMPLETE_SIGNED_ARTIFACT_STATUSES = freeze(new Set([
  SIGNED_ARTIFACT_STATUSES.signed,
  SIGNED_ARTIFACT_STATUSES.uploadedSigned,
  SIGNED_ARTIFACT_STATUSES.signedUploaded,
]))

const SIGNATURE_CAPTURED_SIGNED_ARTIFACT_STATUSES = freeze(new Set([
  ...COMPLETE_SIGNED_ARTIFACT_STATUSES,
  SIGNED_ARTIFACT_STATUSES.signedExternalPendingUpload,
]))

const PREPARED_SIGNED_ARTIFACT_STATUSES = freeze(new Set([
  SIGNED_ARTIFACT_STATUSES.generated,
  SIGNED_ARTIFACT_STATUSES.generatedForPhysicalSignature,
  SIGNED_ARTIFACT_STATUSES.sentForSignature,
  SIGNED_ARTIFACT_STATUSES.sentToAgent,
  SIGNED_ARTIFACT_STATUSES.agentSigned,
  SIGNED_ARTIFACT_STATUSES.sentToSeller,
  SIGNED_ARTIFACT_STATUSES.sellerSigned,
  SIGNED_ARTIFACT_STATUSES.viewed,
  SIGNED_ARTIFACT_STATUSES.partiallySigned,
  ...SIGNATURE_CAPTURED_SIGNED_ARTIFACT_STATUSES,
]))

const ATTENTION_SIGNED_ARTIFACT_STATUSES = freeze(new Set([
  SIGNED_ARTIFACT_STATUSES.signedExternalPendingUpload,
  SIGNED_ARTIFACT_STATUSES.declined,
  SIGNED_ARTIFACT_STATUSES.expired,
  SIGNED_ARTIFACT_STATUSES.failed,
]))

export function normalizeWorkflowCompletionMode(value, fallback = '') {
  const normalized = normalizeKey(value)
  return WORKFLOW_COMPLETION_MODE_ALIASES[normalized] || fallback
}

export function normalizeWorkflowOverrideAction(value, fallback = '') {
  const normalized = normalizeKey(value)
  return WORKFLOW_OVERRIDE_ACTION_ALIASES[normalized] || fallback
}

export function normalizeSignedArtifactStatus(value, fallback = SIGNED_ARTIFACT_STATUSES.notStarted) {
  const normalized = normalizeKey(value)
  return SIGNED_ARTIFACT_STATUS_ALIASES[normalized] || fallback
}

export function isWorkflowCompletionModeFinal(value) {
  return FINAL_COMPLETION_MODES.has(normalizeWorkflowCompletionMode(value))
}

export function isWorkflowCompletionModeAttentionRequired(value) {
  return ATTENTION_COMPLETION_MODES.has(normalizeWorkflowCompletionMode(value))
}

export function isWorkflowCompletionModeException(value) {
  return EXCEPTION_COMPLETION_MODES.has(normalizeWorkflowCompletionMode(value))
}

export function isWorkflowCompletionModeReasonRequired(value) {
  return REASON_REQUIRED_COMPLETION_MODES.has(normalizeWorkflowCompletionMode(value))
}

export function isSignedArtifactStatusComplete(value) {
  return COMPLETE_SIGNED_ARTIFACT_STATUSES.has(normalizeSignedArtifactStatus(value))
}

export function isSignedArtifactSignatureCaptured(value) {
  return SIGNATURE_CAPTURED_SIGNED_ARTIFACT_STATUSES.has(normalizeSignedArtifactStatus(value))
}

export function isSignedArtifactPrepared(value) {
  return PREPARED_SIGNED_ARTIFACT_STATUSES.has(normalizeSignedArtifactStatus(value))
}

export function isSignedArtifactStatusAttentionRequired(value) {
  return ATTENTION_SIGNED_ARTIFACT_STATUSES.has(normalizeSignedArtifactStatus(value))
}

export function isSignedArtifactUploadOutstanding(value) {
  return normalizeSignedArtifactStatus(value) === SIGNED_ARTIFACT_STATUSES.signedExternalPendingUpload
}

export function getWorkflowCompletionModeOutcome(value) {
  const mode = normalizeWorkflowCompletionMode(value)
  const final = FINAL_COMPLETION_MODES.has(mode)
  const attentionRequired = ATTENTION_COMPLETION_MODES.has(mode)
  const uploadRequired = mode === WORKFLOW_COMPLETION_MODES.manualPendingUpload
  const exception = EXCEPTION_COMPLETION_MODES.has(mode)
  const reasonRequired = REASON_REQUIRED_COMPLETION_MODES.has(mode)
  let outcome = WORKFLOW_COMPLETION_OUTCOMES.attentionRequired

  if (mode === WORKFLOW_COMPLETION_MODES.reopened) {
    outcome = WORKFLOW_COMPLETION_OUTCOMES.reopened
  } else if (mode === WORKFLOW_COMPLETION_MODES.blocked) {
    outcome = WORKFLOW_COMPLETION_OUTCOMES.blocked
  } else if (mode === WORKFLOW_COMPLETION_MODES.waived || mode === WORKFLOW_COMPLETION_MODES.skipped) {
    outcome = WORKFLOW_COMPLETION_OUTCOMES.notApplicable
  } else if (final) {
    outcome = WORKFLOW_COMPLETION_OUTCOMES.complete
  }

  return freeze({
    mode,
    outcome,
    complete: final,
    final,
    attentionRequired,
    uploadRequired,
    exception,
    reasonRequired,
  })
}

export function getSignedArtifactStatusOutcome(value) {
  const status = normalizeSignedArtifactStatus(value)
  const complete = COMPLETE_SIGNED_ARTIFACT_STATUSES.has(status)
  const attentionRequired = ATTENTION_SIGNED_ARTIFACT_STATUSES.has(status)
  const uploadRequired = status === SIGNED_ARTIFACT_STATUSES.signedExternalPendingUpload

  return freeze({
    status,
    complete,
    final: complete || attentionRequired || status === SIGNED_ARTIFACT_STATUSES.cancelled,
    attentionRequired,
    uploadRequired,
  })
}
