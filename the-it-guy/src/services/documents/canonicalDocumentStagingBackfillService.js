import {
  legacyRequirementKeyToCanonicalKey,
} from './canonicalDocumentAdapterService'
import {
  CANONICAL_RESOLVER_VERSION,
  REQUIREMENT_EVENT_TYPES,
  REQUIREMENT_LEVELS,
  REQUIREMENT_STATUSES,
  buildInstanceSignature,
} from './canonicalDocumentResolverService'

export const STAGING_BACKFILL_SOURCE = 'staging_backfill'
export const STAGING_BACKFILL_RESOLVER_VERSION = `${CANONICAL_RESOLVER_VERSION}_staging_backfill_v1`

const DEFAULT_VISIBLE_ROLES = Object.freeze(['buyer', 'seller', 'agent', 'agency_admin', 'transferring_attorney'])
const DEFAULT_UPLOAD_ROLES = Object.freeze(['buyer', 'seller', 'agent'])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value.filter(Boolean) : [value]
}

function unique(values = []) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

function getLegacyKey(row = {}) {
  return normalizeKey(row.document_definition_key || row.requirement_key || row.document_key || row.document_type || row.packet_type || row.category)
}

function getContextId(row = {}) {
  return normalizeText(row.transaction_id || row.context_id || row.private_listing_id || row.listing_id)
}

function normalizeLegacyRole(role = '', definition = {}) {
  const normalized = normalizeKey(role)
  if (!normalized || normalized === 'client') {
    const uploadRoles = normalizeArray(definition.default_upload_roles)
    if (uploadRoles.includes('buyer')) return 'buyer'
    if (uploadRoles.includes('seller')) return 'seller'
    return uploadRoles[0] || 'agent'
  }
  if (normalized === 'attorney') return 'transferring_attorney'
  if (normalized === 'bank') return 'bond_originator'
  if (normalized === 'seller_bank') return 'cancellation_attorney'
  return normalized
}

function mapTransactionStatus(status = '') {
  switch (normalizeKey(status)) {
    case 'accepted':
      return REQUIREMENT_STATUSES.approved
    case 'uploaded':
      return REQUIREMENT_STATUSES.uploaded
    case 'under_review':
      return REQUIREMENT_STATUSES.underReview
    case 'reupload_required':
      return REQUIREMENT_STATUSES.rejected
    case 'not_required':
      return REQUIREMENT_STATUSES.notApplicable
    default:
      return REQUIREMENT_STATUSES.pending
  }
}

function mapDocumentRequestStatus(status = '') {
  switch (normalizeKey(status)) {
    case 'completed':
      return REQUIREMENT_STATUSES.completed
    case 'reviewed':
      return REQUIREMENT_STATUSES.approved
    case 'uploaded':
      return REQUIREMENT_STATUSES.uploaded
    case 'rejected':
      return REQUIREMENT_STATUSES.rejected
    case 'requested':
      return REQUIREMENT_STATUSES.requested
    default:
      return REQUIREMENT_STATUSES.requested
  }
}

function mapDocumentStatus(status = '') {
  switch (normalizeKey(status)) {
    case 'approved':
    case 'accepted':
      return REQUIREMENT_STATUSES.approved
    case 'rejected':
    case 'reupload_required':
      return REQUIREMENT_STATUSES.rejected
    case 'under_review':
      return REQUIREMENT_STATUSES.underReview
    default:
      return REQUIREMENT_STATUSES.uploaded
  }
}

function inferStatus(row = {}, sourceTable = '') {
  if (sourceTable === 'document_requests') return mapDocumentRequestStatus(row.status)
  if (sourceTable === 'documents' || sourceTable === 'private_listing_documents') return mapDocumentStatus(row.status)
  return mapTransactionStatus(row.status)
}

function inferRequirementLevel(row = {}, definition = {}) {
  const priority = normalizeKey(row.priority)
  if (priority === 'optional') return REQUIREMENT_LEVELS.optional
  if (priority === 'important') return REQUIREMENT_LEVELS.recommended
  if (row.is_required === false) return REQUIREMENT_LEVELS.optional
  return normalizeKey(definition.default_requirement_level) || REQUIREMENT_LEVELS.required
}

function inferStageGates(canonicalKey = '', packKey = '') {
  const key = normalizeKey(canonicalKey)
  if (['information_sheet', 'signed_otp', 'generated_otp', 'reservation_deposit_proof'].includes(key)) {
    return ['otp_ready', 'attorney_instruction_ready']
  }
  if (['proof_of_funds', 'bank_statements', 'payslips', 'proof_of_income', 'bond_approval', 'grant_letter'].includes(key)) {
    return ['finance_ready', 'attorney_instruction_ready']
  }
  if (['transfer_documents', 'signed_transfer_documents', 'guarantees'].includes(key)) {
    return ['lodgement_ready', 'registration_ready']
  }
  if (['settlement_figure', 'bond_instruction_to_attorneys', 'bond_cancellation_notice'].includes(key)) {
    return ['attorney_instruction_ready', 'lodgement_ready']
  }
  if (packKey === 'buyer_identity_fica') return ['otp_ready', 'attorney_instruction_ready']
  return []
}

function buildManualReview(row = {}, sourceTable = '', reason = '', extra = {}) {
  return {
    sourceTable,
    sourceId: row.id || null,
    legacyKey: getLegacyKey(row),
    contextId: getContextId(row),
    reason,
    ...extra,
  }
}

export function buildCandidateRequirementInstance(row = {}, {
  sourceTable = 'transaction_required_documents',
  definitionsByKey = new Map(),
  sourceSystem = STAGING_BACKFILL_SOURCE,
  resolverVersion = STAGING_BACKFILL_RESOLVER_VERSION,
} = {}) {
  const legacyKey = getLegacyKey(row)
  const canonicalKey = legacyRequirementKeyToCanonicalKey(legacyKey)
  const definition = definitionsByKey.get(canonicalKey)
  const contextId = getContextId(row)

  if (!legacyKey) return { candidate: null, manualReview: buildManualReview(row, sourceTable, 'missing_legacy_key') }
  if (!definition) return { candidate: null, manualReview: buildManualReview(row, sourceTable, 'missing_canonical_definition', { canonicalKey }) }
  if (!contextId) return { candidate: null, manualReview: buildManualReview(row, sourceTable, 'missing_transaction_context', { canonicalKey }) }

  const requestedFromRole = normalizeLegacyRole(row.required_from_role || row.assigned_to_role || row.requested_from_role, definition)
  const visibleToRoles = unique(definition.default_visibility?.length ? definition.default_visibility : DEFAULT_VISIBLE_ROLES)
  const uploadableByRoles = unique(definition.default_upload_roles?.length ? definition.default_upload_roles : DEFAULT_UPLOAD_ROLES)
  const status = inferStatus(row, sourceTable)

  const candidate = {
    document_definition_key: canonicalKey,
    context_type: 'transaction',
    context_id: contextId,
    transaction_id: contextId,
    listing_id: null,
    pack_key: definition.pack_key,
    requirement_level: inferRequirementLevel(row, definition),
    status,
    stage_gates: inferStageGates(canonicalKey, definition.pack_key),
    requested_from_role: requestedFromRole,
    requested_from_contact_id: null,
    visible_to_roles: visibleToRoles,
    uploadable_by_roles: uploadableByRoles,
    reviewer_role: row.reviewer_role || (definition.review_required ? 'agent' : null),
    satisfied_by_document_id: row.uploaded_document_id || (sourceTable === 'documents' ? row.id : null) || null,
    satisfied_by_packet_id: null,
    satisfied_by_packet_version_id: null,
    rejection_reason: row.rejection_reason || null,
    waiver_reason: null,
    expiry_date: null,
    rule_id: null,
    resolver_version: resolverVersion,
    source_system: sourceSystem,
    metadata: {
      legacyKey,
      sourceTable,
      sourceId: row.id || null,
    },
  }

  return { candidate, manualReview: null }
}

function existingSignatures(instances = []) {
  return new Set(instances.map((instance) => buildBackfillSignature(instance)))
}

function candidateSignature(candidate = {}) {
  return buildBackfillSignature(candidate)
}

function buildBackfillSignature(instance = {}) {
  return [
    instance.context_type || '',
    instance.context_id || '',
    instance.document_definition_key || '',
    instance.requested_from_contact_id || '',
  ].join('::')
}

function summarizeBy(rows = [], keyFn) {
  const map = new Map()
  for (const row of rows) {
    const key = keyFn(row)
    if (!key) continue
    map.set(key, (map.get(key) || 0) + 1)
  }
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => ({ key, count }))
}

export function buildCanonicalInstanceGenerationPlan({
  canonicalDefinitions = [],
  canonicalInstances = [],
  transactionRequiredDocuments = [],
  documentRequests = [],
  documents = [],
  privateListingDocuments = [],
  sourceSystem = STAGING_BACKFILL_SOURCE,
  resolverVersion = STAGING_BACKFILL_RESOLVER_VERSION,
} = {}) {
  const definitionsByKey = new Map(canonicalDefinitions.map((definition) => [definition.key, definition]))
  const existing = existingSignatures(canonicalInstances)
  const generated = new Map()
  const manualReview = []

  const sources = [
    ...transactionRequiredDocuments.map((row) => ({ row, sourceTable: 'transaction_required_documents' })),
    ...documentRequests.map((row) => ({ row, sourceTable: 'document_requests' })),
    ...documents.map((row) => ({ row, sourceTable: 'documents' })),
    ...privateListingDocuments.map((row) => ({ row, sourceTable: 'private_listing_documents' })),
  ]

  for (const source of sources) {
    const result = buildCandidateRequirementInstance(source.row, {
      sourceTable: source.sourceTable,
      definitionsByKey,
      sourceSystem,
      resolverVersion,
    })
    if (result.manualReview) {
      manualReview.push(result.manualReview)
      continue
    }
    const signature = candidateSignature(result.candidate)
    if (existing.has(signature)) continue
    if (!generated.has(signature)) {
      generated.set(signature, {
        ...result.candidate,
        source_rows: [result.candidate.metadata],
      })
      continue
    }
    generated.get(signature).source_rows.push(result.candidate.metadata)
  }

  const candidates = [...generated.values()].map(({ metadata, source_rows, ...candidate }) => ({
    ...candidate,
    metadata_json: {
      source_rows,
    },
  }))

  return {
    dryRun: true,
    sourceSystem,
    resolverVersion,
    candidateContextCount: new Set(candidates.map((candidate) => candidate.context_id)).size,
    candidateInstanceCount: candidates.length,
    candidates,
    definitionsUsed: summarizeBy(candidates, (candidate) => candidate.document_definition_key),
    packsUsed: summarizeBy(candidates, (candidate) => candidate.pack_key),
    impossibleOrMissingFacts: manualReview,
    manualReviewRequired: manualReview.length,
    skippedExistingCount: sources.length - candidates.length - manualReview.length,
    sourceRowCounts: {
      transactionRequiredDocuments: transactionRequiredDocuments.length,
      documentRequests: documentRequests.length,
      documents: documents.length,
      privateListingDocuments: privateListingDocuments.length,
    },
  }
}

export async function writeCanonicalInstanceGenerationPlan({ client, plan, write = false } = {}) {
  if (!write) {
    return {
      dryRun: true,
      insertedInstances: 0,
      insertedEvents: 0,
      candidates: plan?.candidates || [],
    }
  }
  if (!client) throw new Error('client is required for write mode.')
  const candidates = normalizeArray(plan?.candidates)
  if (!candidates.length) {
    return { dryRun: false, insertedInstances: 0, insertedEvents: 0, rows: [] }
  }

  const insertRows = candidates.map(({ metadata_json, ...candidate }) => candidate)
  const inserted = await client
    .from('document_requirement_instances')
    .insert(insertRows)
    .select('*')
  if (inserted.error) throw inserted.error

  const rows = inserted.data || []
  const events = rows.map((row, index) => ({
    requirement_instance_id: row.id,
    event_type: REQUIREMENT_EVENT_TYPES.created,
    actor_role: 'system',
    actor_user_id: null,
    message: 'Canonical staging backfill generated requirement instance.',
    metadata_json: {
      source_system: plan.sourceSystem || STAGING_BACKFILL_SOURCE,
      resolver_version: plan.resolverVersion || STAGING_BACKFILL_RESOLVER_VERSION,
      source_rows: candidates[index]?.metadata_json?.source_rows || [],
      signature: buildInstanceSignature(row),
    },
  }))

  if (events.length) {
    const eventWrite = await client.from('document_requirement_events').insert(events)
    if (eventWrite.error) throw eventWrite.error
  }

  return {
    dryRun: false,
    insertedInstances: rows.length,
    insertedEvents: events.length,
    rows,
  }
}
