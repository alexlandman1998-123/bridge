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

export function buildSellerOnboardingSigningAuditExport({ lifecycle = {}, signingSessions = [], replacements = [] } = {}) {
  return {
    contract: SELLER_ONBOARDING_SIGNING_LIFECYCLE_CONTRACT,
    lifecycle: createSellerOnboardingSigningLifecycle({ existing: lifecycle }),
    signatures: (Array.isArray(signingSessions) ? signingSessions : []).map((session) => ({ signerEmail: text(session.signer_email || session.signerEmail).toLowerCase(), status: text(session.status), signedAt: session.signed_at || session.signedAt || null, signingGroupId: session.signing_group_id || session.signingGroupId || null })),
    replacements: Array.isArray(replacements) ? replacements : [],
  }
}
