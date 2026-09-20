export const SELLER_ONBOARDING_SIGNING_LIFECYCLE_CONTRACT = 'arch9-seller-onboarding-signing-lifecycle-v1'

export const SELLER_ONBOARDING_SIGNING_STAGES = Object.freeze({
  onboardingSubmitted: 'onboarding_submitted',
  agentReviewApproved: 'agent_review_approved',
  correctionRequested: 'correction_requested',
  packPrepared: 'pack_prepared',
  packSent: 'pack_sent',
  partiallySigned: 'partially_signed',
  manualAwaitingUpload: 'manual_awaiting_upload',
  mandateSigned: 'mandate_signed',
  superseded: 'superseded',
})

const text = (value) => String(value ?? '').trim()

export function createSellerOnboardingSigningLifecycle({ existing = {}, stage = '', at = new Date().toISOString(), actor = '', metadata = {} } = {}) {
  const source = existing && typeof existing === 'object' ? existing : {}
  const nextStage = Object.values(SELLER_ONBOARDING_SIGNING_STAGES).includes(stage) ? stage : text(source.stage) || SELLER_ONBOARDING_SIGNING_STAGES.onboardingSubmitted
  const history = Array.isArray(source.history) ? source.history : []
  const entry = { stage: nextStage, at: text(at), actor: text(actor), metadata: metadata && typeof metadata === 'object' ? metadata : {} }
  const unchanged = history.at(-1)?.stage === nextStage && history.at(-1)?.metadata?.signingGroupId === entry.metadata.signingGroupId
  return { contract: SELLER_ONBOARDING_SIGNING_LIFECYCLE_CONTRACT, stage: nextStage, updatedAt: entry.at, history: unchanged ? history : [...history, entry] }
}

function auditAcknowledgements(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const acceptedDocuments = source.acceptedDocuments && typeof source.acceptedDocuments === 'object'
    ? Object.fromEntries(Object.entries(source.acceptedDocuments).map(([key, accepted]) => [text(key), accepted === true]).filter(([key]) => key))
    : {}
  return {
    contract: text(source.contract),
    recordedAt: source.recordedAt || null,
    electronicSignature: source.electronicSignature === true,
    acceptedDocuments,
  }
}

function auditProgress(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  return Object.fromEntries(Object.entries(source).map(([key, entry]) => {
    const document = entry && typeof entry === 'object' ? entry : {}
    return [text(key), { signedAt: document.signedAt || null, signedName: text(document.signedName) }]
  }).filter(([key]) => key))
}

function auditCorrectionActivities(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((activity) => {
    const metadata = activity?.metadata && typeof activity.metadata === 'object' ? activity.metadata : {}
    return {
      id: text(activity?.id) || null,
      type: text(activity?.activity_type || activity?.type),
      title: text(activity?.activity_title || activity?.title),
      description: text(activity?.activity_description || activity?.description),
      createdAt: activity?.created_at || activity?.createdAt || null,
      sourceRequestActivityId: text(metadata.sourceRequestActivityId) || null,
      sourceSigningGroupId: text(metadata.sourceSigningGroupId || metadata.signingGroupId) || null,
      replacementSigningGroupId: text(metadata.replacementSigningGroupId) || null,
    }
  })
}

export function buildSellerOnboardingSigningAuditExport({ lifecycle = {}, signingSessions = [], replacements = [], correctionActivities = [] } = {}) {
  return {
    contract: SELLER_ONBOARDING_SIGNING_LIFECYCLE_CONTRACT,
    lifecycle: createSellerOnboardingSigningLifecycle({ existing: lifecycle }),
    signatures: (Array.isArray(signingSessions) ? signingSessions : []).map((session) => ({ signerEmail: text(session.signer_email || session.signerEmail).toLowerCase(), signerName: text(session.signer_name || session.signerName), status: text(session.status), signedAt: session.signed_at || session.signedAt || null, signingGroupId: session.signing_group_id || session.signingGroupId || null, selectedDocuments: Array.isArray(session.selected_documents || session.selectedDocuments) ? (session.selected_documents || session.selectedDocuments) : [], signingPackVersion: text(session.signing_pack_version || session.signingPackVersion), signingPackDigest: text(session.signing_pack_digest || session.signingPackDigest), signingPackFrozenAt: session.signing_pack_frozen_at || session.signingPackFrozenAt || null, acknowledgements: auditAcknowledgements(session.signing_acknowledgements || session.signingAcknowledgements), documentProgress: auditProgress(session.document_progress || session.documentProgress) })),
    replacements: Array.isArray(replacements) ? replacements : [],
    correctionActivities: auditCorrectionActivities(correctionActivities),
  }
}
