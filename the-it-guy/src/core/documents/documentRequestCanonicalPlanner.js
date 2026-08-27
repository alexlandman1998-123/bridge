import {
  DOCUMENT_REQUEST_CANONICAL_MATRIX_VERSION,
  buildCanonicalDocumentRequestScenarioTokens,
  resolveCanonicalDocumentRequestsForScenario,
} from './documentRequestCanonicalMatrix.js'
import { resolveDocumentRequestUploadOwnership } from './documentRequestUploadOwnershipModel.js'

export const DOCUMENT_REQUEST_CANONICAL_PLANNER_VERSION = 'document_request_canonical_planner_v2'

const ATTORNEY_AUDIENCES = new Set(['attorney', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney'])
const CLIENT_VISIBLE = 'client_visible'
const PROFESSIONAL_SHARED = 'professional_shared'
const INTERNAL_ONLY = 'internal_only'
const BOND_ORIGINATOR_VISIBLE_KEYS = new Set(['bond_approval', 'grant_signed', 'income_affordability_documents'])

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function normalizeAudience(value) {
  const normalized = normalizeKey(value || 'attorney')
  if (normalized === 'client') return 'client'
  if (normalized === 'bond_originator' || normalized === 'originator' || normalized === 'bond') return 'bond_originator'
  if (normalized === 'conveyancer') return 'transfer_attorney'
  return normalized || 'attorney'
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function isPendingPolicyLevel(level = '') {
  return normalizeKey(level).startsWith('pending_policy_')
}

function isAttorneyAudience(audience = '') {
  return ATTORNEY_AUDIENCES.has(normalizeAudience(audience))
}

function isAttorneyVisible(requirement = {}) {
  const visibility = normalizeKey(requirement.visibility)
  return visibility === CLIENT_VISIBLE || visibility === PROFESSIONAL_SHARED
}

function isClientVisible(requirement = {}) {
  return normalizeKey(requirement.visibility) === CLIENT_VISIBLE
}

function hasAppliesTo(requirement = {}, token = '') {
  const normalizedToken = normalizeKey(token)
  return Array.isArray(requirement.appliesTo) && requirement.appliesTo.includes(normalizedToken)
}

function isBondOriginatorVisible(requirement = {}) {
  if (!isAttorneyVisible(requirement)) return false
  if (BOND_ORIGINATOR_VISIBLE_KEYS.has(requirement.key)) return true
  return hasAppliesTo(requirement, 'bond') || hasAppliesTo(requirement, 'hybrid')
}

function portalAudienceForRequirement(requirement = {}) {
  const audiences = []
  const requestedFrom = normalizeKey(requirement.requestedFrom || requirement.ownerRole)
  if (isClientVisible(requirement)) {
    if (requestedFrom === 'buyer') audiences.push('buyer')
    if (requestedFrom === 'seller') audiences.push('seller')
  }
  if (isAttorneyVisible(requirement)) {
    audiences.push('attorney')
  }
  if (normalizeKey(requirement.visibility) === INTERNAL_ONLY) audiences.push('internal')
  if (isBondOriginatorVisible(requirement)) {
    audiences.push('bond_originator')
  }
  return Object.freeze(unique(audiences))
}

function toRequestPlanItem(requirement = {}, options = {}) {
  const pendingPolicy = isPendingPolicyLevel(requirement.level)
  const requestPendingPolicy = options.requestPendingPolicy === true || options.includePendingPolicyRequests === true
  const requestable = !pendingPolicy || requestPendingPolicy
  const portalAudience = portalAudienceForRequirement(requirement)
  const uploadOwnership = resolveDocumentRequestUploadOwnership({
    documentKey: requirement.key,
    ownerRole: requirement.ownerRole,
    requestedFrom: requirement.requestedFrom,
    visibility: requirement.visibility,
  })

  return Object.freeze({
    key: requirement.key,
    canonicalDocumentRequestKey: requirement.key,
    documentKey: requirement.key,
    title: requirement.label,
    label: requirement.label,
    ownerRole: requirement.ownerRole,
    requestedFrom: requirement.requestedFrom,
    responsiblePartyRole: uploadOwnership.responsiblePartyRole,
    suppliedByRole: uploadOwnership.suppliedByRole,
    clientSupplied: uploadOwnership.clientSupplied,
    uploadableByRoles: uploadOwnership.uploadableByRoles,
    uploadOnBehalfAllowed: uploadOwnership.uploadOnBehalfAllowed,
    uploadOnBehalfRoles: uploadOwnership.uploadOnBehalfRoles,
    agentMayUploadOnBehalf: uploadOwnership.agentMayUploadOnBehalf,
    appliesTo: Object.freeze([...(requirement.appliesTo || [])]),
    level: requirement.level,
    requiredLevel: requirement.level,
    visibility: requirement.visibility,
    blocker: requirement.blocker,
    blocksStage: requestable ? requirement.blocker : null,
    sortOrder: requirement.sortOrder,
    clientVisible: isClientVisible(requirement),
    attorneyVisible: isAttorneyVisible(requirement),
    portalAudience,
    pendingPolicy,
    requiresAttorneySignoff: pendingPolicy,
    requestable,
    source: 'canonical_document_request_matrix',
    matrixVersion: DOCUMENT_REQUEST_CANONICAL_MATRIX_VERSION,
    sourceVersion: requirement.sourceVersion,
  })
}

export function isCanonicalDocumentRequestVisibleToAudience(request = {}, audience = 'attorney') {
  const normalizedAudience = normalizeAudience(audience)
  const requestedFrom = normalizeKey(request.requestedFrom || request.ownerRole)
  const visibility = normalizeKey(request.visibility)

  if (normalizedAudience === 'internal' || normalizedAudience === 'admin') return true
  if (normalizedAudience === 'client') return visibility === CLIENT_VISIBLE && ['buyer', 'seller'].includes(requestedFrom)
  if (normalizedAudience === 'buyer') return visibility === CLIENT_VISIBLE && requestedFrom === 'buyer'
  if (normalizedAudience === 'seller') return visibility === CLIENT_VISIBLE && requestedFrom === 'seller'
  if (normalizedAudience === 'bond_originator') return isBondOriginatorVisible(request)
  if (normalizedAudience === 'agent') {
    return visibility === PROFESSIONAL_SHARED || normalizeKey(request.ownerRole) === 'agent'
  }
  if (normalizedAudience === 'cancellation_attorney') {
    return isAttorneyVisible(request) && (normalizeKey(request.ownerRole) === 'cancellation_attorney' || hasAppliesTo(request, 'seller_existing_bond'))
  }
  if (isAttorneyAudience(normalizedAudience)) return isAttorneyVisible(request)
  return request.portalAudience?.includes(normalizedAudience) === true
}

export function filterCanonicalDocumentRequestsForAudience(requestsOrPlan = {}, audience = 'attorney') {
  const requests = Array.isArray(requestsOrPlan) ? requestsOrPlan : requestsOrPlan.requests || []
  return requests.filter((request) => isCanonicalDocumentRequestVisibleToAudience(request, audience))
}

export function summarizeCanonicalDocumentRequestPlan(plan = {}) {
  const requests = plan.requests || []
  const byAudience = {}
  const byRequestedFrom = {}
  const byLevel = {}
  const blockers = {}

  for (const request of requests) {
    byRequestedFrom[request.requestedFrom] = (byRequestedFrom[request.requestedFrom] || 0) + 1
    byLevel[request.level] = (byLevel[request.level] || 0) + 1
    blockers[request.blocker] = (blockers[request.blocker] || 0) + 1
    for (const audience of request.portalAudience || []) {
      byAudience[audience] = (byAudience[audience] || 0) + 1
    }
  }

  return Object.freeze({
    total: requests.length,
    requestable: requests.filter((request) => request.requestable).length,
    pendingPolicy: requests.filter((request) => request.pendingPolicy).length,
    byAudience: Object.freeze(byAudience),
    byRequestedFrom: Object.freeze(byRequestedFrom),
    byLevel: Object.freeze(byLevel),
    blockers: Object.freeze(blockers),
  })
}

export function buildCanonicalDocumentRequestPlan(scenario = {}, options = {}) {
  const requests = resolveCanonicalDocumentRequestsForScenario(scenario, {
    includeConditional: options.includeConditional,
    includePendingPolicy: options.includePendingPolicy,
  })
    .map((requirement) => toRequestPlanItem(requirement, options))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key))

  const plan = {
    version: DOCUMENT_REQUEST_CANONICAL_PLANNER_VERSION,
    matrixVersion: DOCUMENT_REQUEST_CANONICAL_MATRIX_VERSION,
    scenarioTokens: buildCanonicalDocumentRequestScenarioTokens(scenario),
    requests: Object.freeze(requests),
  }

  return Object.freeze({
    ...plan,
    summary: summarizeCanonicalDocumentRequestPlan(plan),
  })
}

export function buildCanonicalDocumentRequestAudiencePlan(scenario = {}, audience = 'attorney', options = {}) {
  const plan = buildCanonicalDocumentRequestPlan(scenario, options)
  const requests = filterCanonicalDocumentRequestsForAudience(plan, audience)
  const audiencePlan = {
    ...plan,
    audience: normalizeAudience(audience),
    requests: Object.freeze(requests),
  }
  return Object.freeze({
    ...audiencePlan,
    summary: summarizeCanonicalDocumentRequestPlan(audiencePlan),
  })
}
