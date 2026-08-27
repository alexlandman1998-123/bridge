import {
  buildCanonicalDocumentRequestAudiencePlan,
} from '../../core/documents/documentRequestCanonicalPlanner.js'
import {
  buildDocumentRequestContainerModel,
} from '../../core/documents/documentRequestContainerModel.js'
import {
  DOCUMENT_REQUEST_PROFESSIONAL_PROPAGATION_SCENARIOS,
} from './documentRequestProfessionalPropagationService.js'
import {
  isDeferredSellerUploadRequirement,
} from '../../core/documents/sellerDocumentRequestRuntimePolicy.js'

export const DOCUMENT_REQUEST_WORKSPACE_SMOKE_VERSION = 'document_request_workspace_smoke_v2'

export const DOCUMENT_REQUEST_WORKSPACE_SMOKE_AUDIENCES = Object.freeze([
  'buyer',
  'seller',
  'agent',
  'attorney',
  'transfer_attorney',
  'cancellation_attorney',
  'bond_originator',
  'internal',
])

const SMOKE_TRANSACTION_ID = 'phase7-workspace-smoke-transaction'

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function canonicalPlanRows(plan = {}) {
  return (plan.requests || [])
    .filter((request) => request.requestable && request.clientVisible)
    .map((request) => ({
      id: `canonical_${request.key}`,
      transaction_id: SMOKE_TRANSACTION_ID,
      document_key: request.key,
      document_label: request.label,
      requested_from: request.requestedFrom,
      visibility_scope: request.visibility,
      status: 'required',
      is_required: true,
      canonicalDocumentRequestKey: request.key,
    }))
}

function buildSmokeScenario() {
  return Object.freeze({
    buyerEntityType: 'trust',
    sellerEntityType: 'company',
    financeType: 'hybrid',
    sellerHasExistingBond: true,
    propertyType: 'sectional_title',
    propertyTriggers: [
      'sectional_title',
      'gas_installation',
      'electric_fence',
      'solar_installation',
      'tenant_occupied',
    ],
  })
}

export function buildDocumentRequestWorkspaceSmokeFixture() {
  const scenario = buildSmokeScenario()
  const buyerPlan = buildCanonicalDocumentRequestAudiencePlan(scenario, 'buyer')
  const sellerPlan = buildCanonicalDocumentRequestAudiencePlan(scenario, 'seller')
  const attorneyPlan = buildCanonicalDocumentRequestAudiencePlan(scenario, 'attorney')
  const bondOriginatorPlan = buildCanonicalDocumentRequestAudiencePlan(scenario, 'bond_originator')
  const requiredDocuments = [
    ...canonicalPlanRows(buyerPlan),
    ...canonicalPlanRows(sellerPlan),
  ].filter((row) => !isDeferredSellerUploadRequirement(row))
  const additionalRequests = DOCUMENT_REQUEST_PROFESSIONAL_PROPAGATION_SCENARIOS.map((scenario) => ({
    ...scenario.request,
    id: scenario.request.id,
    transaction_id: SMOKE_TRANSACTION_ID,
  }))

  return Object.freeze({
    transactionId: SMOKE_TRANSACTION_ID,
    scenario,
    requiredDocuments: Object.freeze(requiredDocuments),
    additionalRequests: Object.freeze(additionalRequests),
    canonicalPlans: Object.freeze({
      buyer: buyerPlan,
      seller: sellerPlan,
      attorney: attorneyPlan,
      bond_originator: bondOriginatorPlan,
    }),
  })
}

function buildAudienceModels(fixture = buildDocumentRequestWorkspaceSmokeFixture()) {
  return DOCUMENT_REQUEST_WORKSPACE_SMOKE_AUDIENCES.reduce((accumulator, audience) => {
    accumulator[audience] = buildDocumentRequestContainerModel({
      transactionId: fixture.transactionId,
      requiredDocuments: fixture.requiredDocuments,
      additionalRequests: fixture.additionalRequests,
      audience,
    })
    return accumulator
  }, {})
}

function keysFor(model = {}) {
  return unique((model.containers || []).map((container) => container.documentKey || container.canonicalKey || container.sourceId))
}

function requestIdsFor(model = {}) {
  return unique((model.containers || []).filter((container) => container.source === 'document_requests').map((container) => container.sourceId))
}

function modelHasDeferredSellerUpload(model = {}) {
  return (model.containers || []).some((container) => isDeferredSellerUploadRequirement(container))
}

function evaluateExpectation({ id, audience, includes = [], excludes = [], requestIds = [], excludedRequestIds = [] }, models = {}) {
  const model = models[audience]
  const keys = keysFor(model)
  const requests = requestIdsFor(model)
  const missingKeys = includes.filter((key) => !keys.includes(key))
  const leakedKeys = excludes.filter((key) => keys.includes(key))
  const missingRequests = requestIds.filter((requestId) => !requests.includes(requestId))
  const leakedRequests = excludedRequestIds.filter((requestId) => requests.includes(requestId))

  return Object.freeze({
    id,
    audience,
    total: model?.summary?.total || 0,
    additionalRequests: model?.summary?.additionalRequests || 0,
    blocking: model?.summary?.blocking || 0,
    keys: Object.freeze(keys),
    requestIds: Object.freeze(requests),
    missingKeys: Object.freeze(missingKeys),
    leakedKeys: Object.freeze(leakedKeys),
    missingRequests: Object.freeze(missingRequests),
    leakedRequests: Object.freeze(leakedRequests),
    deferredSellerUploadLeak: modelHasDeferredSellerUpload(model),
    ok: missingKeys.length === 0 &&
      leakedKeys.length === 0 &&
      missingRequests.length === 0 &&
      leakedRequests.length === 0 &&
      !modelHasDeferredSellerUpload(model),
  })
}

export function buildDocumentRequestWorkspaceSmokeAudit() {
  const fixture = buildDocumentRequestWorkspaceSmokeFixture()
  const models = buildAudienceModels(fixture)
  const expectations = [
    {
      id: 'buyer_portal_smoke',
      audience: 'buyer',
      includes: ['buyer_trust_deed', 'buyer_letters_of_authority', 'bond_approval', 'grant_signed', 'income_affordability_documents'],
      excludes: ['seller_company_registration', 'seller_trust_deed', 'bond_statement'],
      requestIds: ['phase6-transfer-buyer-request', 'phase6-originator-buyer-request', 'phase6-transfer-both-request'],
      excludedRequestIds: [
        'phase6-cancellation-seller-request',
        'phase6-originator-professional-request',
        'phase6-professional-buyer-boundary-request',
      ],
    },
    {
      id: 'seller_portal_smoke',
      audience: 'seller',
      includes: ['seller_company_registration', 'seller_company_resolution', 'seller_director_fica', 'bond_statement', 'levy_statement'],
      excludes: ['buyer_trust_deed', 'bond_approval', 'bond_cancellation_figures'],
      requestIds: ['phase6-cancellation-seller-request', 'phase6-transfer-both-request'],
      excludedRequestIds: [
        'phase6-transfer-buyer-request',
        'phase6-originator-buyer-request',
        'phase6-originator-professional-request',
        'phase6-professional-buyer-boundary-request',
      ],
    },
    {
      id: 'agent_workspace_smoke',
      audience: 'agent',
      includes: ['buyer_trust_deed', 'seller_company_registration', 'bond_approval', 'bond_statement'],
      requestIds: [
        'phase6-transfer-buyer-request',
        'phase6-cancellation-seller-request',
        'phase6-originator-buyer-request',
        'phase6-transfer-both-request',
        'phase6-originator-professional-request',
        'phase6-professional-buyer-boundary-request',
      ],
    },
    {
      id: 'attorney_workspace_smoke',
      audience: 'attorney',
      includes: ['buyer_trust_deed', 'seller_company_registration', 'bond_statement', 'bond_approval'],
      requestIds: [
        'phase6-transfer-buyer-request',
        'phase6-cancellation-seller-request',
        'phase6-originator-buyer-request',
        'phase6-transfer-both-request',
        'phase6-originator-professional-request',
        'phase6-professional-buyer-boundary-request',
      ],
    },
    {
      id: 'transfer_attorney_lane_smoke',
      audience: 'transfer_attorney',
      requestIds: [
        'phase6-transfer-buyer-request',
        'phase6-transfer-both-request',
        'phase6-professional-buyer-boundary-request',
      ],
      excludedRequestIds: [
        'phase6-cancellation-seller-request',
        'phase6-originator-buyer-request',
        'phase6-originator-professional-request',
      ],
    },
    {
      id: 'cancellation_attorney_lane_smoke',
      audience: 'cancellation_attorney',
      requestIds: ['phase6-cancellation-seller-request'],
      excludedRequestIds: [
        'phase6-transfer-buyer-request',
        'phase6-originator-buyer-request',
        'phase6-transfer-both-request',
        'phase6-originator-professional-request',
        'phase6-professional-buyer-boundary-request',
      ],
    },
    {
      id: 'bond_originator_workspace_smoke',
      audience: 'bond_originator',
      includes: ['bond_approval', 'grant_signed', 'income_affordability_documents'],
      excludes: ['seller_company_registration', 'seller_trust_deed', 'bond_statement'],
      requestIds: [
        'phase6-originator-buyer-request',
        'phase6-originator-professional-request',
        'phase6-professional-buyer-boundary-request',
      ],
      excludedRequestIds: ['phase6-cancellation-seller-request', 'phase6-transfer-both-request'],
    },
    {
      id: 'internal_workspace_smoke',
      audience: 'internal',
      includes: ['buyer_trust_deed', 'seller_company_registration', 'bond_approval', 'bond_statement'],
      requestIds: [
        'phase6-transfer-buyer-request',
        'phase6-cancellation-seller-request',
        'phase6-originator-buyer-request',
        'phase6-transfer-both-request',
        'phase6-originator-professional-request',
        'phase6-professional-buyer-boundary-request',
      ],
    },
  ]
  const results = expectations.map((expectation) => evaluateExpectation(expectation, models))
  const coveredAudiences = unique(results.map((result) => result.audience))
  const missingAudienceSmokes = DOCUMENT_REQUEST_WORKSPACE_SMOKE_AUDIENCES.filter(
    (audience) => !coveredAudiences.includes(audience),
  )
  const failed = results.filter((result) => !result.ok)
  const sameContainerRequestIds = unique(fixture.additionalRequests.map((request) => request.id))
  const crossAudienceContainerIds = sameContainerRequestIds.map((requestId) => {
    const ids = DOCUMENT_REQUEST_WORKSPACE_SMOKE_AUDIENCES.flatMap((audience) =>
      (models[audience].containers || [])
        .filter((container) => container.sourceId === requestId)
        .map((container) => container.id),
    )
    return Object.freeze({
      requestId,
      containerIds: Object.freeze(unique(ids)),
      stable: unique(ids).length === 1,
    })
  })
  const unstableContainerIds = crossAudienceContainerIds.filter((item) => !item.stable)

  return Object.freeze({
    version: DOCUMENT_REQUEST_WORKSPACE_SMOKE_VERSION,
    transactionId: fixture.transactionId,
    scenario: fixture.scenario,
    fixtureSummary: Object.freeze({
      requiredDocumentCount: fixture.requiredDocuments.length,
      additionalRequestCount: fixture.additionalRequests.length,
      buyerPlanCount: fixture.canonicalPlans.buyer.requests.length,
      sellerPlanCount: fixture.canonicalPlans.seller.requests.length,
      attorneyPlanCount: fixture.canonicalPlans.attorney.requests.length,
      bondOriginatorPlanCount: fixture.canonicalPlans.bond_originator.requests.length,
    }),
    audienceSummaries: Object.freeze(
      Object.fromEntries(Object.entries(models).map(([audience, model]) => [audience, model.summary])),
    ),
    results: Object.freeze(results),
    crossAudienceContainerIds: Object.freeze(crossAudienceContainerIds),
    summary: Object.freeze({
      failedSmokeCount: failed.length,
      coveredAudienceCount: coveredAudiences.length,
      missingAudienceSmokeCount: missingAudienceSmokes.length,
      unstableContainerIdCount: unstableContainerIds.length,
      deferredSellerUploadLeakCount: results.filter((result) => result.deferredSellerUploadLeak).length,
      buyerContainerCount: models.buyer.summary.total,
      sellerContainerCount: models.seller.summary.total,
      agentContainerCount: models.agent.summary.total,
      attorneyContainerCount: models.attorney.summary.total,
      bondOriginatorContainerCount: models.bond_originator.summary.total,
      transferAttorneyContainerCount: models.transfer_attorney.summary.total,
      cancellationAttorneyContainerCount: models.cancellation_attorney.summary.total,
      internalContainerCount: models.internal.summary.total,
    }),
    failed: Object.freeze(failed),
    missingAudienceSmokes: Object.freeze(missingAudienceSmokes),
    unstableContainerIds: Object.freeze(unstableContainerIds),
  })
}
