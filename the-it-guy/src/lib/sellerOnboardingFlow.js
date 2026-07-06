import {
  getConditionalPackDocumentTriggers,
  getConditionalPackRequiredMergeFields,
  getConditionalPackRequiredOnboardingFields,
  resolveConditionalPackDataRequirements,
} from '../core/documents/conditionalPackDataRules.js'
import {
  resolvePropertyBranch,
  resolveSellerBranch,
  resolveSellerOnboardingFlowContract,
} from './sellerOnboardingFlowContract.js'

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
        typeof value.seller_branch === 'string' ||
        typeof value.property_branch === 'string'),
  )
}

function buildVisibleFields(flow = {}) {
  return mergeUnique(
    flow.visible_fields,
    flow.seller_facing_questions,
    flow.required_fields,
    flow.optional_fields,
  )
}

function buildBranchSummary(flow = {}) {
  return {
    seller: {
      key: normalizeText(flow.seller_branch),
      label: normalizeText(flow.seller_branch_label),
      legacy_type: normalizeText(flow.seller_legacy_type),
    },
    property: {
      key: normalizeText(flow.property_branch),
      label: normalizeText(flow.property_branch_label),
      legacy_type: normalizeText(flow.property_legacy_type),
    },
  }
}

function buildSellerConditionalPackOptions(flow = {}, form = {}, listing = {}, facts = {}, options = {}) {
  return {
    packetType: options.packetType || options.packet_type || 'mandate',
    flow,
    form,
    transaction: listing,
    facts,
  }
}

function normalizeResolvedFlow(flow = {}) {
  const conditionalPackOptions = buildSellerConditionalPackOptions(flow)
  const conditionalPackDataRequirements = resolveConditionalPackDataRequirements(conditionalPackOptions)
  const conditionalPackRequiredFields = getConditionalPackRequiredOnboardingFields(conditionalPackOptions)
  const conditionalPackRequiredMergeFields = getConditionalPackRequiredMergeFields(conditionalPackOptions)
  const conditionalPackDocumentTriggers = getConditionalPackDocumentTriggers(conditionalPackOptions)

  return {
    ...flow,
    visible_fields: buildVisibleFields(flow),
    seller_facing_questions: mergeUnique(flow.seller_facing_questions),
    required_fields: mergeUnique(flow.required_fields),
    optional_fields: mergeUnique(flow.optional_fields),
    document_triggers: mergeUnique(flow.document_triggers),
    conditional_pack_data_requirements: conditionalPackDataRequirements,
    conditional_pack_required_fields: conditionalPackRequiredFields,
    conditional_pack_required_merge_fields: conditionalPackRequiredMergeFields,
    conditional_pack_document_triggers: conditionalPackDocumentTriggers,
    branch_summary: buildBranchSummary(flow),
  }
}

export function resolveSellerOnboardingFlow(form = {}, listing = {}, facts = {}) {
  return normalizeResolvedFlow(resolveSellerOnboardingFlowContract(form, listing, facts))
}

export function getSellerOnboardingVisibleFields(flowOrForm = {}, listing = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? flowOrForm : resolveSellerOnboardingFlow(flowOrForm, listing, facts)
  return buildVisibleFields(flow)
}

export function getSellerOnboardingRequiredFields(flowOrForm = {}, listing = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? flowOrForm : resolveSellerOnboardingFlow(flowOrForm, listing, facts)
  return mergeUnique(flow.required_fields)
}

export function getSellerOnboardingDocumentTriggers(flowOrForm = {}, listing = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? flowOrForm : resolveSellerOnboardingFlow(flowOrForm, listing, facts)
  return mergeUnique(flow.document_triggers)
}

export function getSellerOnboardingBranchSummary(flowOrForm = {}, listing = {}, facts = {}) {
  const flow = isFlowRecord(flowOrForm) ? flowOrForm : resolveSellerOnboardingFlow(flowOrForm, listing, facts)
  return flow.branch_summary || buildBranchSummary(flow)
}

export function getSellerConditionalPackDataRequirements(flowOrForm = {}, listing = {}, facts = {}, options = {}) {
  const flow = isFlowRecord(flowOrForm) ? normalizeResolvedFlow(flowOrForm) : resolveSellerOnboardingFlow(flowOrForm, listing, facts)
  const form = isFlowRecord(flowOrForm) ? {} : flowOrForm
  return resolveConditionalPackDataRequirements(buildSellerConditionalPackOptions(flow, form, listing, facts, options))
}

export function getSellerConditionalPackRequiredFields(flowOrForm = {}, listing = {}, facts = {}, options = {}) {
  const flow = isFlowRecord(flowOrForm) ? normalizeResolvedFlow(flowOrForm) : resolveSellerOnboardingFlow(flowOrForm, listing, facts)
  const form = isFlowRecord(flowOrForm) ? {} : flowOrForm
  return getConditionalPackRequiredOnboardingFields(buildSellerConditionalPackOptions(flow, form, listing, facts, options))
}

export function getSellerConditionalPackRequiredMergeFields(flowOrForm = {}, listing = {}, facts = {}, options = {}) {
  const flow = isFlowRecord(flowOrForm) ? normalizeResolvedFlow(flowOrForm) : resolveSellerOnboardingFlow(flowOrForm, listing, facts)
  const form = isFlowRecord(flowOrForm) ? {} : flowOrForm
  return getConditionalPackRequiredMergeFields(buildSellerConditionalPackOptions(flow, form, listing, facts, options))
}

export { resolvePropertyBranch, resolveSellerBranch }
