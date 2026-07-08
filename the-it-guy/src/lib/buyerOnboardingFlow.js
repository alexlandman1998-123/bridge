import {
  getConditionalPackDocumentTriggers,
  getConditionalPackRequiredMergeFields,
  getConditionalPackRequiredOnboardingFields,
  resolveConditionalPackDataRequirements,
} from '../core/documents/conditionalPackDataRules.js'
import {
  BUYER_ONBOARDING_FIELD_ALIASES,
  BUYER_ONBOARDING_FLOW_VERSION,
  migrateBuyerOnboardingFieldListToV2,
  resolveBuyerBranch,
  resolveBuyerFinanceBranch,
  resolveBuyerOnboardingFlowContract,
  resolveBuyerPurchaseMode,
} from './buyerOnboardingFlowContract.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function mergeUnique(...groups) {
  const seen = new Set()
  const merged = []
  for (const item of groups.flat()) {
    const value = normalizeText(item)
    if (!value || seen.has(value)) continue
    seen.add(value)
    merged.push(value)
  }
  return merged
}

function isFlowRecord(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      (Array.isArray(value.visible_fields) ||
        Array.isArray(value.required_fields) ||
        Array.isArray(value.optional_fields) ||
        Array.isArray(value.document_triggers) ||
        typeof value.purchaser_branch === 'string' ||
        typeof value.finance_branch === 'string' ||
        typeof value.purchase_mode === 'string'),
  )
}

function buildBranchSummary(flow = {}) {
  const purchaserBranch = normalizeText(flow.buyer_branch || flow.purchaser_branch || flow.purchaser_type)
  const purchaseMode = normalizeText(flow.buyer_purchase_mode || flow.purchase_mode)
  const financeBranch = normalizeText(flow.buyer_finance_branch || flow.finance_branch)
  const financeSupportMode = normalizeText(flow.buyer_finance_support_mode || flow.finance_support_mode)

  return {
    purchaser: {
      key: purchaserBranch,
      label: normalizeText(flow.buyer_branch_label || flow.purchaser_branch_label || flow.purchaser?.label || purchaserBranch),
      legal_type: normalizeText(flow.buyer_legal_type || flow.purchaser?.legal_type || purchaserBranch),
    },
    purchase_mode: {
      key: purchaseMode,
      label: normalizeText(flow.buyer_purchase_mode_label || flow.purchase_mode_label || flow.purchase_mode_definition?.label || purchaseMode),
    },
    finance: {
      key: financeBranch,
      label: normalizeText(flow.buyer_finance_branch_label || flow.finance_branch_label || flow.finance?.label || financeBranch),
      support_mode: {
        key: financeSupportMode,
        label: normalizeText(
          flow.buyer_finance_support_mode_label ||
            flow.finance_support_mode_label ||
            (financeSupportMode === 'originator_led' ? 'Bond Help Requested' : 'Self Managed'),
        ),
      },
    },
  }
}

function buildBuyerConditionalPackOptions(flow = {}, form = {}, transaction = {}, facts = {}) {
  return {
    packetType: 'otp',
    flow,
    form,
    transaction,
    facts,
  }
}

function extractPersistedFlowSnapshot(form = {}, facts = {}) {
  const candidates = [
    facts?.buyer_onboarding_flow,
    facts?.onboarding_flow,
    form?.buyer_onboarding_flow,
    form?.onboarding_flow,
  ]

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      continue
    }
    if (
      Array.isArray(candidate.visible_fields) ||
      Array.isArray(candidate.required_fields) ||
      Array.isArray(candidate.optional_fields) ||
      Array.isArray(candidate.document_triggers) ||
      typeof candidate.purchaser_branch === 'string' ||
      typeof candidate.finance_branch === 'string' ||
      typeof candidate.purchase_mode === 'string'
    ) {
      return candidate
    }
  }

  return null
}

function normalizeResolvedFlow(flow = {}) {
  const sourceVersion = normalizeText(flow.version || flow.buyer_onboarding_flow_version || flow.onboarding_flow_version)
  const buyerFacingQuestions = migrateBuyerOnboardingFieldListToV2(flow.buyer_facing_questions)
  const requiredFields = migrateBuyerOnboardingFieldListToV2(flow.required_fields)
  const optionalFields = migrateBuyerOnboardingFieldListToV2(flow.optional_fields)
  const visibleFields = mergeUnique(
    migrateBuyerOnboardingFieldListToV2(flow.visible_fields),
    buyerFacingQuestions,
    requiredFields,
    optionalFields,
  )
  const conditionalPackOptions = buildBuyerConditionalPackOptions(flow)
  const conditionalPackDataRequirements = resolveConditionalPackDataRequirements(conditionalPackOptions)
  const conditionalPackRequiredFields = getConditionalPackRequiredOnboardingFields(conditionalPackOptions)
  const conditionalPackRequiredMergeFields = getConditionalPackRequiredMergeFields(conditionalPackOptions)
  const conditionalPackDocumentTriggers = getConditionalPackDocumentTriggers(conditionalPackOptions)

  return {
    ...flow,
    version: BUYER_ONBOARDING_FLOW_VERSION,
    source_version: sourceVersion || BUYER_ONBOARDING_FLOW_VERSION,
    buyer_branch: normalizeText(flow.buyer_branch || flow.purchaser_branch),
    buyer_branch_label: normalizeText(flow.buyer_branch_label || flow.purchaser_branch_label || flow.purchaser?.label),
    buyer_purchase_mode: normalizeText(flow.buyer_purchase_mode || flow.purchase_mode),
    buyer_purchase_mode_label: normalizeText(flow.buyer_purchase_mode_label || flow.purchase_mode_label || flow.purchase_mode_definition?.label),
    buyer_finance_branch: normalizeText(flow.buyer_finance_branch || flow.finance_branch),
    buyer_finance_branch_label: normalizeText(flow.buyer_finance_branch_label || flow.finance_branch_label || flow.finance?.label),
    buyer_finance_support_mode: normalizeText(flow.buyer_finance_support_mode || flow.finance_support_mode),
    buyer_finance_support_mode_label: normalizeText(
      flow.buyer_finance_support_mode_label ||
        flow.finance_support_mode_label ||
        (flow.buyer_finance_support_mode === 'originator_led' || flow.finance_support_mode === 'originator_led'
          ? 'Bond Help Requested'
          : 'Self Managed'),
    ),
    buyer_legal_type: normalizeText(flow.buyer_legal_type || flow.branch_summary?.purchaser?.legal_type || flow.purchaser?.legal_type),
    visible_fields: visibleFields,
    buyer_facing_questions: buyerFacingQuestions,
    required_fields: requiredFields,
    optional_fields: optionalFields,
    internal_derived_facts: mergeUnique(flow.internal_derived_facts),
    document_triggers: mergeUnique(flow.document_triggers),
    field_aliases: flow.field_aliases || BUYER_ONBOARDING_FIELD_ALIASES,
    conditional_pack_data_requirements: conditionalPackDataRequirements,
    conditional_pack_required_fields: conditionalPackRequiredFields,
    conditional_pack_required_merge_fields: conditionalPackRequiredMergeFields,
    conditional_pack_document_triggers: conditionalPackDocumentTriggers,
    branch_summary: buildBranchSummary(flow),
  }
}

export function resolveBuyerOnboardingFlow(form = {}, transaction = {}, facts = {}) {
  const persistedFlow = extractPersistedFlowSnapshot(form, facts)
  if (persistedFlow) {
    return normalizeResolvedFlow(persistedFlow)
  }

  return normalizeResolvedFlow(resolveBuyerOnboardingFlowContract(form, transaction, facts))
}

export function getBuyerOnboardingVisibleFields(flowOrForm = {}, transaction = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? flowOrForm : resolveBuyerOnboardingFlow(flowOrForm, transaction, facts)
  return mergeUnique(
    migrateBuyerOnboardingFieldListToV2(flow.visible_fields),
    migrateBuyerOnboardingFieldListToV2(flow.buyer_facing_questions),
    migrateBuyerOnboardingFieldListToV2(flow.required_fields),
    migrateBuyerOnboardingFieldListToV2(flow.optional_fields),
  )
}

export function getBuyerOnboardingRequiredFields(flowOrForm = {}, transaction = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? flowOrForm : resolveBuyerOnboardingFlow(flowOrForm, transaction, facts)
  return migrateBuyerOnboardingFieldListToV2(flow.required_fields)
}

export function getBuyerOnboardingOptionalFields(flowOrForm = {}, transaction = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? flowOrForm : resolveBuyerOnboardingFlow(flowOrForm, transaction, facts)
  return migrateBuyerOnboardingFieldListToV2(flow.optional_fields)
}

export function getBuyerOnboardingDocumentTriggers(flowOrForm = {}, transaction = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? flowOrForm : resolveBuyerOnboardingFlow(flowOrForm, transaction, facts)
  return mergeUnique(flow.document_triggers)
}

export function getBuyerOnboardingBranchSummary(flowOrForm = {}, transaction = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? flowOrForm : resolveBuyerOnboardingFlow(flowOrForm, transaction, facts)
  return flow.branch_summary || buildBranchSummary(flow)
}

export function getBuyerConditionalPackDataRequirements(flowOrForm = {}, transaction = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? normalizeResolvedFlow(flowOrForm) : resolveBuyerOnboardingFlow(flowOrForm, transaction, facts)
  const form = isFlowRecord(flowOrForm) ? {} : flowOrForm
  return resolveConditionalPackDataRequirements(buildBuyerConditionalPackOptions(flow, form, transaction, facts))
}

export function getBuyerConditionalPackRequiredFields(flowOrForm = {}, transaction = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? normalizeResolvedFlow(flowOrForm) : resolveBuyerOnboardingFlow(flowOrForm, transaction, facts)
  const form = isFlowRecord(flowOrForm) ? {} : flowOrForm
  return getConditionalPackRequiredOnboardingFields(buildBuyerConditionalPackOptions(flow, form, transaction, facts))
}

export function getBuyerConditionalPackRequiredMergeFields(flowOrForm = {}, transaction = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? normalizeResolvedFlow(flowOrForm) : resolveBuyerOnboardingFlow(flowOrForm, transaction, facts)
  const form = isFlowRecord(flowOrForm) ? {} : flowOrForm
  return getConditionalPackRequiredMergeFields(buildBuyerConditionalPackOptions(flow, form, transaction, facts))
}

export { resolveBuyerBranch, resolveBuyerFinanceBranch, resolveBuyerPurchaseMode }
