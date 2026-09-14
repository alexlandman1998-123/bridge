export const SELLER_WORKFLOW_STATE_CONTRACT = 'arch9-seller-workflow-state-v1'

export const SELLER_WORKFLOW_STAGES = Object.freeze({
  onboardingSent: 'onboarding_sent',
  basicIntakeSubmitted: 'basic_intake_submitted',
  ficaDocumentsRequested: 'fica_documents_requested',
  documentsPrepared: 'documents_prepared',
  signaturesInProgress: 'signatures_in_progress',
  agencyReview: 'agency_review',
  complete: 'complete',
})

const STAGE_ORDER = Object.freeze(Object.values(SELLER_WORKFLOW_STAGES))

function text(value) {
  return String(value ?? '').trim()
}

function stage(value) {
  const normalized = text(value).toLowerCase()
  return STAGE_ORDER.includes(normalized) ? normalized : ''
}

function now(value) {
  const timestamp = text(value)
  return timestamp || new Date().toISOString()
}

export function createSellerWorkflowState({ stage: initialStage = SELLER_WORKFLOW_STAGES.onboardingSent, at = '', actor = '', existing = null } = {}) {
  const current = existing && typeof existing === 'object' ? existing : {}
  const nextStage = stage(initialStage) || SELLER_WORKFLOW_STAGES.onboardingSent
  const history = Array.isArray(current.history) ? current.history : []
  const unchanged = current.stage === nextStage
  return {
    contract: SELLER_WORKFLOW_STATE_CONTRACT,
    stage: nextStage,
    updatedAt: now(at),
    updatedBy: text(actor),
    history: unchanged ? history : [...history, { stage: nextStage, at: now(at), actor: text(actor) }],
  }
}

export function advanceSellerWorkflowState(existing = {}, { stage: nextStage, at = '', actor = '', preserveLaterStage = false } = {}) {
  const currentStage = stage(existing.stage) || SELLER_WORKFLOW_STAGES.onboardingSent
  const targetStage = stage(nextStage)
  if (!targetStage) throw new Error('A valid seller workflow stage is required.')
  if (STAGE_ORDER.indexOf(targetStage) < STAGE_ORDER.indexOf(currentStage)) {
    if (preserveLaterStage) return createSellerWorkflowState({ stage: currentStage, at, actor, existing: { ...existing, stage: currentStage } })
    throw new Error('Seller workflow stages cannot move backwards.')
  }
  return createSellerWorkflowState({ stage: targetStage, at, actor, existing: { ...existing, stage: currentStage } })
}

export function deriveSellerWorkflowState({ onboarding = {}, requirements = [], documents = [], signing = {} } = {}) {
  const formData = onboarding.formData || onboarding.form_data || {}
  const persisted = formData.sellerWorkflow || formData.seller_workflow || {}
  let current = createSellerWorkflowState({ existing: persisted, stage: persisted.stage || onboarding.status || SELLER_WORKFLOW_STAGES.onboardingSent })
  const onboardingStatus = text(onboarding.status).toLowerCase()
  if (['completed', 'complete', 'submitted', 'under_review'].includes(onboardingStatus)) {
    current = advanceSellerWorkflowState(current, { stage: SELLER_WORKFLOW_STAGES.basicIntakeSubmitted })
  }
  const ficaRequested = (Array.isArray(requirements) ? requirements : []).some((item) => text(item.group || item.requirement_group).toLowerCase() === 'fica' && text(item.status).toLowerCase() !== 'not_applicable')
  if (ficaRequested) current = advanceSellerWorkflowState(current, { stage: SELLER_WORKFLOW_STAGES.ficaDocumentsRequested })
  const preparedDocuments = (Array.isArray(documents) ? documents : []).filter((document) => ['mandate', 'fica_declaration', 'disclosure'].includes(text(document.documentType || document.document_type || document.requirementKey || document.requirement_key).toLowerCase()))
  if (preparedDocuments.length) current = advanceSellerWorkflowState(current, { stage: SELLER_WORKFLOW_STAGES.documentsPrepared })
  if (signing && typeof signing === 'object' && Number(signing.requiredCount || signing.required_count || 0) > 0) {
    current = advanceSellerWorkflowState(current, { stage: signing.complete ? SELLER_WORKFLOW_STAGES.agencyReview : SELLER_WORKFLOW_STAGES.signaturesInProgress })
  }
  return current
}
