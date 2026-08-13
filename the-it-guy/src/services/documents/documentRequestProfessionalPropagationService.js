import {
  buildDocumentRequestContainerModel,
} from '../../core/documents/documentRequestContainerModel.js'

export const DOCUMENT_REQUEST_PROFESSIONAL_PROPAGATION_VERSION = 'document_request_professional_propagation_v1'

export const DOCUMENT_REQUEST_PROFESSIONAL_PROPAGATION_AUDIENCES = Object.freeze([
  'buyer',
  'seller',
  'agent',
  'attorney',
  'transfer_attorney',
  'cancellation_attorney',
  'bond_originator',
  'internal',
])

export const DOCUMENT_REQUEST_PROFESSIONAL_PROPAGATION_SCENARIOS = Object.freeze([
  {
    id: 'transfer_attorney_requests_buyer_fica',
    label: 'Transfer attorney requests buyer FICA support',
    transactionId: 'phase6-transfer-buyer',
    request: {
      id: 'phase6-transfer-buyer-request',
      title: 'Updated Buyer FICA',
      document_type: 'updated_buyer_fica',
      category: 'Additional Requests',
      requested_from: 'buyer',
      assigned_to_role: 'buyer',
      visibility_scope: 'client_visible',
      created_by_role: 'transfer_attorney',
      status: 'requested',
      priority: 'required',
    },
    expectedVisibleTo: ['buyer', 'agent', 'attorney', 'transfer_attorney', 'internal'],
    expectedHiddenFrom: ['seller', 'bond_originator'],
  },
  {
    id: 'cancellation_attorney_requests_seller_bond_statement',
    label: 'Cancellation attorney requests seller bond statement',
    transactionId: 'phase6-cancellation-seller',
    request: {
      id: 'phase6-cancellation-seller-request',
      title: 'Latest Bond Statement',
      document_type: 'bond_statement',
      category: 'Additional Requests',
      requested_from: 'seller',
      assigned_to_role: 'seller',
      visibility_scope: 'client_visible',
      created_by_role: 'cancellation_attorney',
      status: 'requested',
      priority: 'required',
    },
    expectedVisibleTo: ['seller', 'agent', 'attorney', 'cancellation_attorney', 'internal'],
    expectedHiddenFrom: ['buyer', 'bond_originator'],
  },
  {
    id: 'bond_originator_requests_buyer_affordability',
    label: 'Bond originator requests buyer affordability documents',
    transactionId: 'phase6-originator-buyer',
    request: {
      id: 'phase6-originator-buyer-request',
      title: 'Income and Affordability Documents',
      document_type: 'income_affordability_documents',
      canonical_document_request_key: 'income_affordability_documents',
      category: 'Additional Requests',
      requested_from: 'buyer',
      assigned_to_role: 'buyer',
      visibility_scope: 'client_visible',
      created_by_role: 'bond_originator',
      status: 'requested',
      priority: 'required',
    },
    expectedVisibleTo: ['buyer', 'agent', 'attorney', 'bond_originator', 'internal'],
    expectedHiddenFrom: ['seller'],
  },
  {
    id: 'transfer_attorney_requests_both_clients',
    label: 'Transfer attorney requests buyer and seller document',
    transactionId: 'phase6-transfer-both',
    request: {
      id: 'phase6-transfer-both-request',
      title: 'Signed Clarification',
      document_type: 'signed_clarification',
      category: 'Additional Requests',
      requested_from: 'buyer_and_seller',
      assigned_to_role: 'client',
      visibility_scope: 'client_visible',
      created_by_role: 'transfer_attorney',
      status: 'requested',
      priority: 'required',
    },
    expectedVisibleTo: ['buyer', 'seller', 'agent', 'attorney', 'transfer_attorney', 'internal'],
    expectedHiddenFrom: ['bond_originator'],
  },
  {
    id: 'bond_originator_internal_follow_up',
    label: 'Bond originator internal follow-up stays professional-only',
    transactionId: 'phase6-originator-professional',
    request: {
      id: 'phase6-originator-professional-request',
      title: 'Bank Valuation Follow-Up',
      document_type: 'bank_valuation_follow_up',
      category: 'Additional Requests',
      requested_from: 'bond_originator',
      assigned_to_role: 'bond_originator',
      visibility_scope: 'shared_role_players',
      created_by_role: 'bond_originator',
      status: 'requested',
      priority: 'normal',
    },
    expectedVisibleTo: ['agent', 'attorney', 'bond_originator', 'internal'],
    expectedHiddenFrom: ['buyer', 'seller'],
  },
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function buildAudienceSnapshots({ transactionId = '', request = {} } = {}) {
  return DOCUMENT_REQUEST_PROFESSIONAL_PROPAGATION_AUDIENCES.reduce((accumulator, audience) => {
    const model = buildDocumentRequestContainerModel({
      transactionId,
      additionalRequests: [request],
      audience,
    })
    accumulator[audience] = Object.freeze({
      summary: model.summary,
      containerIds: Object.freeze(model.containers.map((container) => container.id)),
      containers: model.containers,
    })
    return accumulator
  }, {})
}

function findAllContainer(request = {}, transactionId = '') {
  const model = buildDocumentRequestContainerModel({
    transactionId,
    additionalRequests: [request],
    audience: 'internal',
  })
  return model.allContainers[0] || null
}

function evaluateScenario(scenario = {}) {
  const request = {
    ...scenario.request,
    transaction_id: scenario.transactionId,
  }
  const allContainer = findAllContainer(request, scenario.transactionId)
  const audienceSnapshots = buildAudienceSnapshots({
    transactionId: scenario.transactionId,
    request,
  })
  const visibleAudiences = Object.entries(audienceSnapshots)
    .filter(([, snapshot]) => snapshot.summary.total > 0)
    .map(([audience]) => audience)
  const expectedVisibleTo = unique(scenario.expectedVisibleTo || [])
  const expectedHiddenFrom = unique(scenario.expectedHiddenFrom || [])
  const missingAudience = expectedVisibleTo.filter((audience) => !visibleAudiences.includes(audience))
  const leakedAudience = expectedHiddenFrom.filter((audience) => visibleAudiences.includes(audience))

  return Object.freeze({
    id: scenario.id,
    label: scenario.label,
    transactionId: scenario.transactionId,
    requestId: request.id,
    requestedFrom: request.requested_from,
    requestedByRole: request.created_by_role,
    visibility: request.visibility_scope,
    status: allContainer?.status || '',
    containerId: allContainer?.id || '',
    documentKey: allContainer?.documentKey || '',
    visibleTo: Object.freeze(allContainer?.visibleTo || []),
    expectedVisibleTo: Object.freeze(expectedVisibleTo),
    expectedHiddenFrom: Object.freeze(expectedHiddenFrom),
    visibleAudiences: Object.freeze(visibleAudiences),
    missingAudience: Object.freeze(missingAudience),
    leakedAudience: Object.freeze(leakedAudience),
    blocksReadiness: allContainer?.blocksReadiness === true,
    hasUploadedDocument: allContainer?.hasUploadedDocument === true,
    uploadSpecType: allContainer?.uploadSpec?.type || null,
    audienceSnapshots: Object.freeze(audienceSnapshots),
  })
}

export function buildProfessionalDocumentRequestUploadTransition(input = {}) {
  const request = {
    id: input.id || 'phase6-upload-transition-request',
    title: input.title || 'Uploaded request transition',
    document_type: input.documentType || 'uploaded_request_transition',
    category: 'Additional Requests',
    requested_from: input.requestedFrom || 'buyer',
    assigned_to_role: input.assignedToRole || input.requestedFrom || 'buyer',
    visibility_scope: input.visibility || 'client_visible',
    created_by_role: input.createdByRole || 'transfer_attorney',
    status: input.status || 'requested',
    priority: input.priority || 'required',
    transaction_id: input.transactionId || 'phase6-upload-transition',
  }
  const before = findAllContainer(request, request.transaction_id)
  const uploadedRequest = {
    ...request,
    status: 'uploaded',
    requested_document_id: input.documentId || 'phase6-uploaded-document',
  }
  const after = findAllContainer(uploadedRequest, uploadedRequest.transaction_id)

  return Object.freeze({
    before: Object.freeze({
      status: before?.status || '',
      blocksReadiness: before?.blocksReadiness === true,
      hasUploadedDocument: before?.hasUploadedDocument === true,
      uploadSpecType: before?.uploadSpec?.type || null,
    }),
    after: Object.freeze({
      status: after?.status || '',
      blocksReadiness: after?.blocksReadiness === true,
      hasUploadedDocument: after?.hasUploadedDocument === true,
      linkedDocumentId: normalizeText(after?.linkedDocumentId),
      uploadSpecType: after?.uploadSpec?.type || null,
    }),
  })
}

export function buildDocumentRequestProfessionalPropagationAudit(
  scenarios = DOCUMENT_REQUEST_PROFESSIONAL_PROPAGATION_SCENARIOS,
) {
  const results = scenarios.map(evaluateScenario)
  const missingAudience = results.flatMap((result) =>
    result.missingAudience.map((audience) => ({ scenarioId: result.id, audience })),
  )
  const leakedAudience = results.flatMap((result) =>
    result.leakedAudience.map((audience) => ({ scenarioId: result.id, audience })),
  )
  const uploadTransition = buildProfessionalDocumentRequestUploadTransition()
  const failedUploadTransition = !(
    uploadTransition.before.blocksReadiness === true &&
    uploadTransition.before.hasUploadedDocument === false &&
    uploadTransition.after.status === 'uploaded' &&
    uploadTransition.after.hasUploadedDocument === true &&
    uploadTransition.after.linkedDocumentId
  )

  return Object.freeze({
    version: DOCUMENT_REQUEST_PROFESSIONAL_PROPAGATION_VERSION,
    scenarioCount: results.length,
    results: Object.freeze(results),
    summary: Object.freeze({
      missingAudienceCount: missingAudience.length,
      leakedAudienceCount: leakedAudience.length,
      uploadTransitionOk: !failedUploadTransition,
      buyerVisibleRequestCount: results.filter((result) => result.visibleAudiences.includes('buyer')).length,
      sellerVisibleRequestCount: results.filter((result) => result.visibleAudiences.includes('seller')).length,
      bondOriginatorVisibleRequestCount: results.filter((result) => result.visibleAudiences.includes('bond_originator')).length,
    }),
    missingAudience: Object.freeze(missingAudience),
    leakedAudience: Object.freeze(leakedAudience),
    uploadTransition,
  })
}
