export const SELLER_ONBOARDING_COMPLETION_CONTRACT = 'arch9-seller-onboarding-completion-v1'

export const SELLER_ONBOARDING_COMPLETION_MODES = Object.freeze({
  selfService: 'self_service',
  agentAssisted: 'agent_assisted',
})

function text(value) {
  return String(value ?? '').trim()
}

export function normalizeSellerOnboardingCompletionMode(value = '') {
  const normalized = text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_')
  return normalized === SELLER_ONBOARDING_COMPLETION_MODES.agentAssisted
    ? SELLER_ONBOARDING_COMPLETION_MODES.agentAssisted
    : SELLER_ONBOARDING_COMPLETION_MODES.selfService
}

export function createSellerOnboardingCompletionRecord({
  existing = null,
  mode = '',
  completedBy = '',
  completedAt = '',
  notes = '',
} = {}) {
  const source = existing && typeof existing === 'object' ? existing : {}
  const completionMode = normalizeSellerOnboardingCompletionMode(mode || source.mode || source.completionMode || source.completion_mode)
  const actor = text(completedBy || source.completedBy || source.completed_by)
  const at = text(completedAt || source.completedAt || source.completed_at) || new Date().toISOString()
  return {
    contract: SELLER_ONBOARDING_COMPLETION_CONTRACT,
    mode: completionMode,
    completedBy: actor,
    completed_by: actor,
    completedAt: at,
    completed_at: at,
    notes: text(notes || source.notes),
    agentAssisted: completionMode === SELLER_ONBOARDING_COMPLETION_MODES.agentAssisted,
    agent_assisted: completionMode === SELLER_ONBOARDING_COMPLETION_MODES.agentAssisted,
    reviewStatus: 'awaiting_agent_review',
    review_status: 'awaiting_agent_review',
  }
}

export function readSellerOnboardingCompletionRecord(formData = {}) {
  const source = formData.sellerOnboardingCompletion || formData.seller_onboarding_completion || {}
  return createSellerOnboardingCompletionRecord({
    existing: source,
    mode: formData.completionMode || formData.completion_mode || source.mode,
    completedBy: formData.completedBy || formData.completed_by || source.completedBy || source.completed_by,
    completedAt: formData.completedAt || formData.completed_at || source.completedAt || source.completed_at,
  })
}
