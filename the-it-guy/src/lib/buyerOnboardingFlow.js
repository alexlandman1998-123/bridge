import {
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
    },
  }
}

function normalizeResolvedFlow(flow = {}) {
  const visibleFields = mergeUnique(flow.visible_fields, flow.buyer_facing_questions, flow.required_fields, flow.optional_fields)

  return {
    ...flow,
    buyer_branch: normalizeText(flow.buyer_branch || flow.purchaser_branch),
    buyer_branch_label: normalizeText(flow.buyer_branch_label || flow.purchaser_branch_label || flow.purchaser?.label),
    buyer_purchase_mode: normalizeText(flow.buyer_purchase_mode || flow.purchase_mode),
    buyer_purchase_mode_label: normalizeText(flow.buyer_purchase_mode_label || flow.purchase_mode_label || flow.purchase_mode_definition?.label),
    buyer_finance_branch: normalizeText(flow.buyer_finance_branch || flow.finance_branch),
    buyer_finance_branch_label: normalizeText(flow.buyer_finance_branch_label || flow.finance_branch_label || flow.finance?.label),
    buyer_legal_type: normalizeText(flow.buyer_legal_type || flow.branch_summary?.purchaser?.legal_type || flow.purchaser?.legal_type),
    visible_fields: visibleFields,
    buyer_facing_questions: mergeUnique(flow.buyer_facing_questions),
    required_fields: mergeUnique(flow.required_fields),
    optional_fields: mergeUnique(flow.optional_fields),
    internal_derived_facts: mergeUnique(flow.internal_derived_facts),
    document_triggers: mergeUnique(flow.document_triggers),
    branch_summary: buildBranchSummary(flow),
  }
}

export function resolveBuyerOnboardingFlow(form = {}, transaction = {}, facts = {}) {
  return normalizeResolvedFlow(resolveBuyerOnboardingFlowContract(form, transaction, facts))
}

export function getBuyerOnboardingVisibleFields(flowOrForm = {}, transaction = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? flowOrForm : resolveBuyerOnboardingFlow(flowOrForm, transaction, facts)
  return mergeUnique(flow.visible_fields, flow.buyer_facing_questions, flow.required_fields, flow.optional_fields)
}

export function getBuyerOnboardingRequiredFields(flowOrForm = {}, transaction = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? flowOrForm : resolveBuyerOnboardingFlow(flowOrForm, transaction, facts)
  return mergeUnique(flow.required_fields)
}

export function getBuyerOnboardingOptionalFields(flowOrForm = {}, transaction = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? flowOrForm : resolveBuyerOnboardingFlow(flowOrForm, transaction, facts)
  return mergeUnique(flow.optional_fields)
}

export function getBuyerOnboardingDocumentTriggers(flowOrForm = {}, transaction = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? flowOrForm : resolveBuyerOnboardingFlow(flowOrForm, transaction, facts)
  return mergeUnique(flow.document_triggers)
}

export function getBuyerOnboardingBranchSummary(flowOrForm = {}, transaction = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? flowOrForm : resolveBuyerOnboardingFlow(flowOrForm, transaction, facts)
  return flow.branch_summary || buildBranchSummary(flow)
}

export { resolveBuyerBranch, resolveBuyerFinanceBranch, resolveBuyerPurchaseMode }
