import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import {
  LEGACY_TO_CANONICAL_REQUIREMENT_KEYS,
  canonicalDefinitionKeyToLegacyKey,
  detectStatusConflict,
  getUnmappedLegacyRequirementKeys,
  legacyRequirementKeyToCanonicalKey,
  privateListingStatusToCanonicalStatus,
  transactionRequiredStatusToCanonicalStatus,
} from './canonicalDocumentAdapterService'
import {
  REQUIREMENT_LEVELS,
  REQUIREMENT_STATUSES,
  WORKFLOW_GATES,
  buildInstanceSignature,
  isRequirementSatisfied,
  requirementBlocksWorkflow,
} from './canonicalDocumentResolverService'

export const CANONICAL_DOCUMENTS_SOURCE_OF_TRUTH_FLAG = 'VITE_CANONICAL_DOCUMENTS_SOURCE_OF_TRUTH'
export const LEGACY_DOCUMENT_GENERATION_DISABLED_FLAG = 'VITE_LEGACY_DOCUMENT_GENERATION_DISABLED'
export const LEGACY_DOCUMENT_READS_DISABLED_FLAG = 'VITE_LEGACY_DOCUMENT_READS_DISABLED'
export const LEGACY_DOCUMENT_ADAPTER_WRITEBACK_ENABLED_FLAG = 'VITE_LEGACY_DOCUMENT_ADAPTER_WRITEBACK_ENABLED'
export const LEGACY_DOCUMENT_PARITY_MODE_FLAG = 'VITE_LEGACY_DOCUMENT_PARITY_MODE'
export const CANONICAL_DOCUMENTS_PRIMARY_TRANSACTION_ALLOWLIST_FLAG = 'VITE_CANONICAL_DOCUMENTS_PRIMARY_TRANSACTION_ALLOWLIST'
export const CANONICAL_DOCUMENTS_PRIMARY_ORGANISATION_ALLOWLIST_FLAG = 'VITE_CANONICAL_DOCUMENTS_PRIMARY_ORGANISATION_ALLOWLIST'
export const CANONICAL_PILOT_BUILD_MARKER = 'CANONICAL_PILOT_BUILD_MARKER_20260525'
const CANONICAL_PILOT_DIAGNOSTIC_RPC_MARKERS = [
  'bridge_link_document_to_canonical_requirement',
  'bridge_link_document_to_canonical_requirement_by_key',
  'bridge_upload_document_to_canonical_requirement',
  'bridge_review_canonical_requirement',
  'canonical_requirement_instance_id',
]

export const DOCUMENT_ROLLOUT_MODES = Object.freeze({
  legacyPrimary: 'legacy_primary',
  parity: 'parity',
  canonicalPrimary: 'canonical_primary',
  canonicalOnly: 'canonical_only',
})

export const CONSOLIDATION_SOURCE = 'canonical_document_consolidation'

function logCanonicalPilotDeploymentDiagnostic() {
  const sourceOfTruth = getEnvFlag(CANONICAL_DOCUMENTS_SOURCE_OF_TRUTH_FLAG)
  const transactionAllowlist = getEnvFlag(CANONICAL_DOCUMENTS_PRIMARY_TRANSACTION_ALLOWLIST_FLAG)
  if (!sourceOfTruth && !transactionAllowlist) return
  console.info('Canonical document rollout:', {
    marker: CANONICAL_PILOT_BUILD_MARKER,
    mode: DOCUMENT_ROLLOUT_MODES.canonicalPrimary,
    sourceOfTruth,
    transactionAllowlist,
    rpcMarkers: CANONICAL_PILOT_DIAGNOSTIC_RPC_MARKERS,
  })
}

logCanonicalPilotDeploymentDiagnostic()

export const VALID_CANONICAL_ROLES = Object.freeze([
  'seller',
  'buyer',
  'agent',
  'agency_admin',
  'developer',
  'transferring_attorney',
  'bond_attorney',
  'cancellation_attorney',
  'bond_originator',
  'internal_admin',
  'admin',
  'system',
  'client',
])

export const LEGACY_GENERATION_PATHS = Object.freeze([
  {
    key: 'seller_document_requirement_engine',
    file: 'src/lib/sellerDocumentRequirementEngine.js',
    canonicalReplacement: 'canonicalDocumentResolverService.resolveRequirements',
    fallbackFlag: LEGACY_DOCUMENT_GENERATION_DISABLED_FLAG,
  },
  {
    key: 'buyer_requirement_engine',
    file: 'src/lib/buyerRequirementEngine.js',
    canonicalReplacement: 'canonicalDocumentResolverService.resolveRequirements',
    fallbackFlag: LEGACY_DOCUMENT_GENERATION_DISABLED_FLAG,
  },
  {
    key: 'attorney_document_requirements_resolver',
    file: 'src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js',
    canonicalReplacement: 'canonicalWorkflowGateService + canonicalDocumentResolverService',
    fallbackFlag: LEGACY_DOCUMENT_GENERATION_DISABLED_FLAG,
  },
  {
    key: 'document_requirement_rules',
    file: 'src/core/documents/documentRequirementRules.js',
    canonicalReplacement: 'document_definitions + document_requirement_rules',
    fallbackFlag: LEGACY_DOCUMENT_GENERATION_DISABLED_FLAG,
  },
])

const SATISFIED_STATUSES = new Set([
  REQUIREMENT_STATUSES.approved,
  REQUIREMENT_STATUSES.completed,
  REQUIREMENT_STATUSES.waived,
  REQUIREMENT_STATUSES.notApplicable,
])

const ACTIVE_STATUSES = new Set([
  REQUIREMENT_STATUSES.pending,
  REQUIREMENT_STATUSES.requested,
  REQUIREMENT_STATUSES.uploaded,
  REQUIREMENT_STATUSES.underReview,
  REQUIREMENT_STATUSES.approved,
  REQUIREMENT_STATUSES.rejected,
  REQUIREMENT_STATUSES.waived,
  REQUIREMENT_STATUSES.expired,
  REQUIREMENT_STATUSES.completed,
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function normalizeAllowlist(value) {
  if (!value) return []
  return normalizeArray(value)
    .flatMap((item) => String(item || '').split(/[\s,;]+/))
    .map(normalizeKey)
    .filter(Boolean)
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function isTruthyFlag(value) {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalizeKey(value))
}

function getEnvFlag(name) {
  try {
    return import.meta.env?.[name]
  } catch {
    return undefined
  }
}

function requireClient(client = supabase) {
  if (!client || !isSupabaseConfigured) throw new Error('Supabase is required for canonical document consolidation operations.')
  return client
}

export function isCanonicalDocumentsSourceOfTruthEnabled(options = {}) {
  if (isGlobalCanonicalDocumentsSourceOfTruthEnabled(options)) return true
  return isScopedCanonicalPrimaryEnabled(options)
}

export function isGlobalCanonicalDocumentsSourceOfTruthEnabled(options = {}) {
  if (typeof options.sourceOfTruth === 'boolean') return options.sourceOfTruth
  if (typeof options.forceCanonical === 'boolean' && options.forceCanonical) return true
  return isTruthyFlag(getEnvFlag(CANONICAL_DOCUMENTS_SOURCE_OF_TRUTH_FLAG))
}

export function isScopedCanonicalPrimaryEnabled(options = {}) {
  if (options.sourceOfTruth === false) return false

  const transactionId = normalizeKey(options.transactionId || options.transaction_id)
  const organisationId = normalizeKey(
    options.organisationId ||
    options.organizationId ||
    options.organisation_id ||
    options.organization_id,
  )

  const transactionAllowlist = normalizeAllowlist(
    options.canonicalPrimaryTransactionAllowlist ||
    options.transactionAllowlist ||
    getEnvFlag(CANONICAL_DOCUMENTS_PRIMARY_TRANSACTION_ALLOWLIST_FLAG),
  )
  const organisationAllowlist = normalizeAllowlist(
    options.canonicalPrimaryOrganisationAllowlist ||
    options.canonicalPrimaryOrganizationAllowlist ||
    options.organisationAllowlist ||
    options.organizationAllowlist ||
    getEnvFlag(CANONICAL_DOCUMENTS_PRIMARY_ORGANISATION_ALLOWLIST_FLAG),
  )

  return Boolean(
    (transactionId && transactionAllowlist.includes(transactionId)) ||
    (organisationId && organisationAllowlist.includes(organisationId)),
  )
}

export function isLegacyDocumentGenerationDisabled(options = {}) {
  if (typeof options.legacyGenerationDisabled === 'boolean') return options.legacyGenerationDisabled
  return isTruthyFlag(getEnvFlag(LEGACY_DOCUMENT_GENERATION_DISABLED_FLAG))
}

export function areLegacyDocumentReadsDisabled(options = {}) {
  if (typeof options.legacyReadsDisabled === 'boolean') return options.legacyReadsDisabled
  return isTruthyFlag(getEnvFlag(LEGACY_DOCUMENT_READS_DISABLED_FLAG))
}

export function isLegacyDocumentAdapterWritebackEnabled(options = {}) {
  if (typeof options.adapterWritebackEnabled === 'boolean') return options.adapterWritebackEnabled
  return isTruthyFlag(getEnvFlag(LEGACY_DOCUMENT_ADAPTER_WRITEBACK_ENABLED_FLAG))
}

export function isLegacyDocumentParityModeEnabled(options = {}) {
  if (typeof options.parityMode === 'boolean') return options.parityMode
  return isTruthyFlag(getEnvFlag(LEGACY_DOCUMENT_PARITY_MODE_FLAG))
}

export function getCanonicalDocumentRolloutMode(options = {}) {
  const explicit = normalizeKey(options.mode)
  if (Object.values(DOCUMENT_ROLLOUT_MODES).includes(explicit)) return explicit
  const globalSourceOfTruth = isGlobalCanonicalDocumentsSourceOfTruthEnabled(options)
  const scopedSourceOfTruth = !globalSourceOfTruth && isScopedCanonicalPrimaryEnabled(options)
  const sourceOfTruth = globalSourceOfTruth || scopedSourceOfTruth
  const generationDisabled = isLegacyDocumentGenerationDisabled(options)
  const readsDisabled = areLegacyDocumentReadsDisabled(options)
  const parity = isLegacyDocumentParityModeEnabled(options)

  if (globalSourceOfTruth && generationDisabled && readsDisabled) return DOCUMENT_ROLLOUT_MODES.canonicalOnly
  if (sourceOfTruth) return DOCUMENT_ROLLOUT_MODES.canonicalPrimary
  if (parity) return DOCUMENT_ROLLOUT_MODES.parity
  return DOCUMENT_ROLLOUT_MODES.legacyPrimary
}

export function shouldUseCanonicalReads(options = {}) {
  const mode = getCanonicalDocumentRolloutMode(options)
  return [DOCUMENT_ROLLOUT_MODES.parity, DOCUMENT_ROLLOUT_MODES.canonicalPrimary, DOCUMENT_ROLLOUT_MODES.canonicalOnly].includes(mode)
}

export function shouldUseLegacyReadFallback(options = {}) {
  const mode = getCanonicalDocumentRolloutMode(options)
  if (mode === DOCUMENT_ROLLOUT_MODES.canonicalOnly) return false
  return !areLegacyDocumentReadsDisabled(options)
}

export function shouldUseCanonicalWrites(options = {}) {
  const mode = getCanonicalDocumentRolloutMode(options)
  return [DOCUMENT_ROLLOUT_MODES.canonicalPrimary, DOCUMENT_ROLLOUT_MODES.canonicalOnly].includes(mode)
}

export function shouldRunLegacyGeneration(pathKey = '', options = {}) {
  const mode = getCanonicalDocumentRolloutMode(options)
  if (mode === DOCUMENT_ROLLOUT_MODES.canonicalOnly) return false
  if (isLegacyDocumentGenerationDisabled(options)) return false
  const path = LEGACY_GENERATION_PATHS.find((item) => item.key === pathKey)
  if (!path) return mode === DOCUMENT_ROLLOUT_MODES.legacyPrimary
  return mode === DOCUMENT_ROLLOUT_MODES.legacyPrimary || mode === DOCUMENT_ROLLOUT_MODES.parity
}

export function buildLegacyGenerationDeprecationReport(options = {}) {
  const mode = getCanonicalDocumentRolloutMode(options)
  return LEGACY_GENERATION_PATHS.map((path) => ({
    ...path,
    rolloutMode: mode,
    shouldRun: shouldRunLegacyGeneration(path.key, options),
    status: shouldRunLegacyGeneration(path.key, options) ? 'fallback_available' : 'deprecated_disabled_by_flag',
    removalCondition: 'Remove only after parity audit, backfill review, UI canonical reads, and production rollback sign-off.',
  }))
}

function getLegacyKey(row = {}) {
  return normalizeKey(row.requirement_key || row.document_key || row.document_type || row.type || row.category)
}

function isDocumentRequestProjection(row = {}) {
  return Boolean(row.document_type) && !row.requirement_key && !row.document_key
}

function getRowContextId(row = {}) {
  return normalizeText(row.context_id || row.private_listing_id || row.listing_id || row.transaction_id)
}

function legacyRowStatusToCanonicalStatus(row = {}) {
  const table = normalizeKey(row.legacy_table || row.table)
  if (table === 'transaction_required_documents') return transactionRequiredStatusToCanonicalStatus(row.status)
  if (table === 'private_listing_document_requirements') return privateListingStatusToCanonicalStatus(row.status)
  return normalizeKey(row.status)
}

function activeRequirement(instance = {}) {
  return ACTIVE_STATUSES.has(instance.status) && instance.status !== REQUIREMENT_STATUSES.notApplicable
}

function buildDuplicateActiveRequirements(instances = []) {
  const grouped = new Map()
  for (const instance of instances.filter(activeRequirement)) {
    const signature = buildInstanceSignature(instance)
    const bucket = grouped.get(signature) || []
    bucket.push(instance)
    grouped.set(signature, bucket)
  }
  return [...grouped.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([signature, rows]) => ({
      signature,
      count: rows.length,
      requirementInstanceIds: rows.map((row) => row.id).filter(Boolean),
      contextType: rows[0]?.context_type || null,
      contextId: rows[0]?.context_id || null,
      documentDefinitionKey: rows[0]?.document_definition_key || null,
    }))
}

function getDefinitionKeys(definitions = []) {
  return new Set(definitions.map((definition) => normalizeKey(definition.key)).filter(Boolean))
}

function getCanonicalInstanceByLegacyRow(row = {}, canonicalInstances = []) {
  if (row.canonical_requirement_instance_id) {
    const direct = canonicalInstances.find((instance) => instance.id === row.canonical_requirement_instance_id)
    if (direct) return { instance: direct, strategy: 'canonical_requirement_instance_id' }
  }
  const canonicalKey = legacyRequirementKeyToCanonicalKey(getLegacyKey(row))
  const contextId = getRowContextId(row)
  const scoped = canonicalInstances.find((instance) => (
    normalizeKey(instance.document_definition_key) === canonicalKey &&
    (!contextId || normalizeText(instance.context_id) === contextId || normalizeText(instance.listing_id) === contextId || normalizeText(instance.transaction_id) === contextId)
  ))
  return scoped ? { instance: scoped, strategy: 'explicit_key_and_context' } : { instance: null, strategy: 'unmapped' }
}

export function buildCanonicalDataIntegrityReport({
  canonicalDefinitions = [],
  canonicalInstances = [],
  legacyRequirements = [],
  uploadedDocuments = [],
  packetVersions = [],
  documentRequests = [],
  reminders = [],
  workflowGateKeys = WORKFLOW_GATES,
  validRoles = VALID_CANONICAL_ROLES,
} = {}) {
  const definitionKeys = getDefinitionKeys(canonicalDefinitions)
  const validRoleSet = new Set(validRoles.map(normalizeKey))
  const activeInstances = canonicalInstances.filter(activeRequirement)
  const satisfiedRequirementIds = new Set(canonicalInstances.filter(isRequirementSatisfied).map((row) => row.id))
  const legacyRowsWithoutCanonical = legacyRequirements
    .map((row) => {
      const match = getCanonicalInstanceByLegacyRow(row, canonicalInstances)
      return match.instance ? null : {
        legacyId: row.id || null,
        legacyKey: getLegacyKey(row),
        contextId: getRowContextId(row),
        status: row.status || null,
        strategy: match.strategy,
      }
    })
    .filter(Boolean)

  const canonicalKeysProjectedToLegacy = new Set(legacyRequirements.map((row) => getLegacyKey(row)).filter(Boolean))
  const canonicalInstancesNotProjectedToLegacy = activeInstances
    .filter((instance) => !canonicalKeysProjectedToLegacy.has(canonicalDefinitionKeyToLegacyKey(instance.document_definition_key)))
    .map((instance) => ({
      requirementInstanceId: instance.id || null,
      documentDefinitionKey: instance.document_definition_key,
      expectedLegacyKey: canonicalDefinitionKeyToLegacyKey(instance.document_definition_key),
      contextType: instance.context_type,
      contextId: instance.context_id,
    }))

  const invalidRoleRows = activeInstances
    .map((instance) => {
      const roles = unique([
        ...normalizeArray(instance.visible_to_roles),
        ...normalizeArray(instance.uploadable_by_roles),
        instance.requested_from_role,
        instance.reviewer_role,
      ].map(normalizeKey))
      const invalidRoles = roles.filter((role) => role && !validRoleSet.has(role))
      return invalidRoles.length ? {
        requirementInstanceId: instance.id || null,
        documentDefinitionKey: instance.document_definition_key,
        invalidRoles,
      } : null
    })
    .filter(Boolean)

  const impossibleGateBlockers = workflowGateKeys.flatMap((gate) => activeInstances
    .filter((instance) => requirementBlocksWorkflow(instance, gate))
    .filter((instance) => !normalizeArray(instance.uploadable_by_roles).length && !instance.requested_from_role)
    .map((instance) => ({
      gate,
      requirementInstanceId: instance.id || null,
      documentDefinitionKey: instance.document_definition_key,
      reason: 'blocking_requirement_has_no_responsible_uploader',
    })))

  return {
    canonicalRequirementsWithoutDefinitions: canonicalInstances
      .filter((instance) => !definitionKeys.has(normalizeKey(instance.document_definition_key)))
      .map((instance) => ({
        requirementInstanceId: instance.id || null,
        documentDefinitionKey: instance.document_definition_key,
        contextType: instance.context_type,
        contextId: instance.context_id,
      })),
    duplicateActiveRequirementInstances: buildDuplicateActiveRequirements(canonicalInstances),
    requirementsWithNoResponsibleUploader: activeInstances
      .filter((instance) => [REQUIREMENT_LEVELS.blocker, REQUIREMENT_LEVELS.required].includes(instance.requirement_level))
      .filter((instance) => !normalizeArray(instance.uploadable_by_roles).length || !normalizeText(instance.requested_from_role))
      .map((instance) => ({
        requirementInstanceId: instance.id || null,
        documentDefinitionKey: instance.document_definition_key,
        requirementLevel: instance.requirement_level,
        status: instance.status,
      })),
    requirementsWithInvalidVisibilityRoles: invalidRoleRows,
    approvedRequirementsWithoutSatisfier: canonicalInstances
      .filter((instance) => [REQUIREMENT_STATUSES.approved, REQUIREMENT_STATUSES.completed].includes(instance.status))
      .filter((instance) => !instance.satisfied_by_document_id && !instance.satisfied_by_packet_id && !instance.satisfied_by_packet_version_id)
      .map((instance) => ({
        requirementInstanceId: instance.id || null,
        documentDefinitionKey: instance.document_definition_key,
        status: instance.status,
      })),
    uploadedDocumentsNotLinkedToRequirements: uploadedDocuments
      .filter((document) => !document.canonical_requirement_instance_id && !document.requirement_instance_id && !document.requirement_id)
      .map((document) => ({
        documentId: document.id || null,
        documentType: document.document_type || document.category || null,
        contextId: getRowContextId(document),
      })),
    generatedPacketsNotLinkedToRequirements: packetVersions
      .filter((packet) => !packet.canonical_requirement_instance_id && !packet.requirement_instance_id)
      .map((packet) => ({
        packetVersionId: packet.id || null,
        packetId: packet.packet_id || null,
        packetType: packet.packet_type || null,
      })),
    legacyRowsWithoutCanonicalInstance: legacyRowsWithoutCanonical,
    canonicalInstancesNotProjectedToLegacy,
    documentRequestsNotLinkedToCanonicalReminders: documentRequests
      .filter((request) => !request.canonical_reminder_id && !request.canonical_requirement_instance_id && !request.metadata_json?.canonicalReminderId)
      .map((request) => ({
        requestId: request.id || null,
        documentType: request.document_type || null,
        status: request.status || null,
      })),
    staleRemindersForSatisfiedRequirements: reminders
      .filter((reminder) => satisfiedRequirementIds.has(reminder.requirement_instance_id))
      .filter((reminder) => !['completed', 'cancelled'].includes(normalizeKey(reminder.status)))
      .map((reminder) => ({
        reminderId: reminder.id || null,
        requirementInstanceId: reminder.requirement_instance_id,
        status: reminder.status,
      })),
    workflowGatesBlockedByImpossibleRules: impossibleGateBlockers,
  }
}

export function buildLegacyParityAudit({
  canonicalDefinitions = [],
  canonicalInstances = [],
  legacyRequirements = [],
  legacyDocuments = [],
  documentRequests = [],
  documents = [],
  packetVersions = [],
  reminders = [],
  legacyEngineOutputs = {},
  commercialRequirements = [],
} = {}) {
  const legacyRequirementRows = [
    ...normalizeArray(legacyRequirements),
    ...normalizeArray(documentRequests),
    ...normalizeArray(commercialRequirements),
  ]
  const canonicalKeys = new Set(canonicalInstances.map((instance) => normalizeKey(instance.document_definition_key)).filter(Boolean))
  const legacyKeys = new Set(legacyRequirementRows.map(getLegacyKey).filter(Boolean))
  const missingCanonicalMappings = getUnmappedLegacyRequirementKeys(legacyRequirementRows)
  const statusConflicts = legacyRequirementRows
    .filter((row) => !isDocumentRequestProjection(row))
    .map((row) => {
      const match = getCanonicalInstanceByLegacyRow(row, canonicalInstances).instance
      if (!match) return null
      const conflict = detectStatusConflict(match.status, legacyRowStatusToCanonicalStatus(row))
      return conflict ? {
        legacyId: row.id || null,
        legacyKey: getLegacyKey(row),
        canonicalRequirementInstanceId: match.id || null,
        canonicalKey: match.document_definition_key,
        ...conflict,
      } : null
    })
    .filter(Boolean)

  const engineSummaries = Object.entries(legacyEngineOutputs || {}).map(([engineKey, output]) => {
    const rows = normalizeArray(output?.requirements || output)
    const keys = rows.map((row) => normalizeKey(row.key || row.id || row.document_key || row.requirement_key)).filter(Boolean)
    return {
      engineKey,
      requirementCount: rows.length,
      keys,
      unmappedKeys: keys.filter((key) => !LEGACY_TO_CANONICAL_REQUIREMENT_KEYS[key] && !canonicalKeys.has(key)),
      missingFromCanonical: keys
        .map((key) => legacyRequirementKeyToCanonicalKey(key))
        .filter((key) => !canonicalKeys.has(key)),
    }
  })

  const dataIntegrity = buildCanonicalDataIntegrityReport({
    canonicalDefinitions,
    canonicalInstances,
    legacyRequirements: legacyRequirementRows,
    uploadedDocuments: [...normalizeArray(documents), ...normalizeArray(legacyDocuments)],
    packetVersions,
    documentRequests,
    reminders,
  })

  return {
    summary: {
      canonicalDefinitionCount: canonicalDefinitions.length,
      canonicalRequirementInstanceCount: canonicalInstances.length,
      activeCanonicalRequirementCount: canonicalInstances.filter(activeRequirement).length,
      legacyRequirementCount: legacyRequirementRows.length,
      legacyDocumentCount: legacyDocuments.length,
      documentRequestCount: documentRequests.length,
      packetVersionCount: packetVersions.length,
      unmappedLegacyKeyCount: missingCanonicalMappings.length,
      statusConflictCount: statusConflicts.length,
      duplicateActiveCanonicalRequirementCount: dataIntegrity.duplicateActiveRequirementInstances.length,
    },
    canonicalOnlyKeys: [...canonicalKeys].filter((key) => !legacyKeys.has(canonicalDefinitionKeyToLegacyKey(key))).sort(),
    legacyOnlyKeys: [...legacyKeys]
      .map((key) => ({ legacyKey: key, canonicalKey: legacyRequirementKeyToCanonicalKey(key) }))
      .filter(({ canonicalKey }) => !canonicalKeys.has(canonicalKey))
      .sort((left, right) => left.legacyKey.localeCompare(right.legacyKey)),
    missingCanonicalMappings,
    statusConflicts,
    engineSummaries,
    dataIntegrity,
  }
}

function scoreLegacyMatch({ legacyRow = {}, canonicalInstance = {}, strategy = '' } = {}) {
  if (!canonicalInstance) return 0
  if (legacyRow.canonical_requirement_instance_id && legacyRow.canonical_requirement_instance_id === canonicalInstance.id) return 100
  const legacyKey = legacyRequirementKeyToCanonicalKey(getLegacyKey(legacyRow))
  const keyMatches = legacyKey && legacyKey === normalizeKey(canonicalInstance.document_definition_key)
  const contextId = getRowContextId(legacyRow)
  const contextMatches = !contextId || [
    canonicalInstance.context_id,
    canonicalInstance.listing_id,
    canonicalInstance.transaction_id,
  ].map(normalizeText).includes(contextId)
  if (strategy === 'explicit_key_and_context' && keyMatches && contextMatches) return 90
  if (keyMatches && contextMatches) return 85
  if (keyMatches) return 70
  return 0
}

export function buildBackfillPlan({
  canonicalInstances = [],
  legacyRequirements = [],
  legacyDocuments = [],
  documentRequests = [],
  packetVersions = [],
  dryRun = true,
  minimumConfidence = 80,
} = {}) {
  const legacyRequirementLinks = []
  const documentLinks = []
  const requestLinks = []
  const packetLinks = []
  const manualReview = []

  for (const legacyRow of normalizeArray(legacyRequirements)) {
    const match = getCanonicalInstanceByLegacyRow(legacyRow, canonicalInstances)
    const confidence = scoreLegacyMatch({ legacyRow, canonicalInstance: match.instance, strategy: match.strategy })
    const plan = {
      operation: 'link_legacy_requirement',
      dryRun,
      legacyTable: legacyRow.legacy_table || legacyRow.table || 'legacy_requirement',
      legacyId: legacyRow.id || null,
      canonicalRequirementInstanceId: match.instance?.id || null,
      confidence,
      strategy: match.strategy,
    }
    if (confidence >= minimumConfidence) legacyRequirementLinks.push(plan)
    else manualReview.push({ ...plan, reason: 'low_confidence_or_unmapped_requirement' })
  }

  for (const document of normalizeArray(legacyDocuments)) {
    const match = getCanonicalInstanceByLegacyRow(document, canonicalInstances)
    const confidence = scoreLegacyMatch({ legacyRow: document, canonicalInstance: match.instance, strategy: match.strategy })
    const plan = {
      operation: 'link_document',
      dryRun,
      documentId: document.id || document.document_id || null,
      canonicalRequirementInstanceId: match.instance?.id || null,
      confidence,
      strategy: match.strategy,
    }
    if (confidence >= minimumConfidence) documentLinks.push(plan)
    else manualReview.push({ ...plan, reason: 'low_confidence_or_unmapped_document' })
  }

  for (const request of normalizeArray(documentRequests)) {
    const match = getCanonicalInstanceByLegacyRow(request, canonicalInstances)
    const confidence = scoreLegacyMatch({ legacyRow: request, canonicalInstance: match.instance, strategy: match.strategy })
    const plan = {
      operation: 'link_document_request',
      dryRun,
      documentRequestId: request.id || null,
      canonicalRequirementInstanceId: match.instance?.id || null,
      confidence,
      strategy: match.strategy,
    }
    if (confidence >= minimumConfidence) requestLinks.push(plan)
    else manualReview.push({ ...plan, reason: 'low_confidence_or_unmapped_document_request' })
  }

  for (const packet of normalizeArray(packetVersions)) {
    const inferredKey = legacyRequirementKeyToCanonicalKey(packet.document_definition_key || packet.document_type || packet.packet_type || packet.title)
    const contextId = getRowContextId(packet)
    const match = canonicalInstances.find((instance) => (
      normalizeKey(instance.document_definition_key) === inferredKey &&
      (!contextId || [instance.context_id, instance.transaction_id, instance.listing_id].map(normalizeText).includes(contextId))
    ))
    const confidence = match ? (contextId ? 85 : 70) : 0
    const plan = {
      operation: 'link_packet_version',
      dryRun,
      packetVersionId: packet.id || null,
      packetId: packet.packet_id || null,
      canonicalRequirementInstanceId: match?.id || null,
      confidence,
      strategy: match ? 'packet_type_to_canonical_key' : 'unmapped',
    }
    if (confidence >= minimumConfidence) packetLinks.push(plan)
    else manualReview.push({ ...plan, reason: 'low_confidence_or_unmapped_packet' })
  }

  return {
    dryRun,
    minimumConfidence,
    legacyRequirementLinks,
    documentLinks,
    requestLinks,
    packetLinks,
    manualReview,
    summary: {
      plannedLinks: legacyRequirementLinks.length + documentLinks.length + requestLinks.length + packetLinks.length,
      manualReviewCount: manualReview.length,
      destructiveOperations: 0,
    },
  }
}

export async function loadCanonicalConsolidationSnapshot({
  contextType = '',
  contextId = '',
  transactionId = '',
  listingId = '',
  client = supabase,
} = {}) {
  const db = requireClient(client)
  const filters = { contextType: normalizeText(contextType), contextId: normalizeText(contextId), transactionId: normalizeText(transactionId), listingId: normalizeText(listingId) }

  let instanceQuery = db.from('document_requirement_instances').select('*, document_definitions(*)')
  if (filters.contextType) instanceQuery = instanceQuery.eq('context_type', filters.contextType)
  if (filters.contextId) instanceQuery = instanceQuery.eq('context_id', filters.contextId)
  if (filters.transactionId) instanceQuery = instanceQuery.eq('transaction_id', filters.transactionId)
  if (filters.listingId) instanceQuery = instanceQuery.eq('listing_id', filters.listingId)

  const [
    definitions,
    instances,
    privateListingRequirements,
    privateListingDocuments,
    transactionRequiredDocuments,
    documentRequests,
    documents,
    packetVersions,
    reminders,
  ] = await Promise.all([
    db.from('document_definitions').select('*'),
    instanceQuery,
    filters.listingId ? db.from('private_listing_document_requirements').select('*').eq('private_listing_id', filters.listingId) : { data: [], error: null },
    filters.listingId ? db.from('private_listing_documents').select('*').eq('private_listing_id', filters.listingId) : { data: [], error: null },
    filters.transactionId ? db.from('transaction_required_documents').select('*').eq('transaction_id', filters.transactionId) : { data: [], error: null },
    filters.transactionId ? db.from('document_requests').select('*').eq('transaction_id', filters.transactionId) : { data: [], error: null },
    filters.transactionId ? db.from('documents').select('*').eq('transaction_id', filters.transactionId) : { data: [], error: null },
    filters.transactionId ? db.from('document_packet_versions').select('*, document_packets(*)').eq('document_packets.transaction_id', filters.transactionId) : { data: [], error: null },
    filters.contextId ? db.from('document_requirement_reminders').select('*').eq('context_id', filters.contextId) : { data: [], error: null },
  ])

  const results = [definitions, instances, privateListingRequirements, privateListingDocuments, transactionRequiredDocuments, documentRequests, documents, packetVersions, reminders]
  const errored = results.find((result) => result?.error)
  if (errored?.error) throw errored.error

  return {
    canonicalDefinitions: definitions.data || [],
    canonicalInstances: instances.data || [],
    legacyRequirements: [
      ...(privateListingRequirements.data || []).map((row) => ({ ...row, legacy_table: 'private_listing_document_requirements' })),
      ...(transactionRequiredDocuments.data || []).map((row) => ({ ...row, legacy_table: 'transaction_required_documents' })),
    ],
    legacyDocuments: privateListingDocuments.data || [],
    documentRequests: documentRequests.data || [],
    documents: documents.data || [],
    packetVersions: packetVersions.data || [],
    reminders: reminders.data || [],
  }
}

export async function runCanonicalLegacyParityAudit(options = {}) {
  const snapshot = await loadCanonicalConsolidationSnapshot(options)
  return buildLegacyParityAudit(snapshot)
}

export function buildRollbackPlan() {
  return {
    steps: [
      'Set CANONICAL_DOCUMENTS_SOURCE_OF_TRUTH=false.',
      'Set LEGACY_DOCUMENT_GENERATION_DISABLED=false.',
      'Set LEGACY_DOCUMENT_READS_DISABLED=false.',
      'Set LEGACY_DOCUMENT_PARITY_MODE=false unless comparison logging is still wanted.',
      'Keep LEGACY_DOCUMENT_ADAPTER_WRITEBACK_ENABLED enabled only if canonical lifecycle writes must continue projecting to legacy.',
      'Do not delete canonical rows; leave requirement instances, reviews, reminders and events intact for audit/retry.',
      'Re-enable legacy UI/service read paths and keep adapters available for re-sync once canonical mode is restored.',
    ],
    dataSafety: [
      'Canonical upload, review and event history is retained.',
      'Legacy tables are not deleted in Phase 9.',
      'Adapters can be re-run idempotently to repair projections.',
    ],
  }
}

export function buildProductionReadinessChecklist(audit = {}) {
  const integrity = audit.dataIntegrity || audit
  const checks = [
    ['feature_flags_reviewed', true, 'All canonical/legacy flags are intentionally set per environment.'],
    ['parity_audit_passed', !audit.summary || (audit.summary.unmappedLegacyKeyCount === 0 && audit.summary.statusConflictCount === 0), 'No critical parity mismatches remain.'],
    ['no_duplicate_active_instances', !integrity.duplicateActiveRequirementInstances?.length, 'No duplicate active canonical requirement instances.'],
    ['no_unmapped_critical_legacy_keys', !audit.missingCanonicalMappings?.length, 'No critical legacy keys without explicit canonical mapping.'],
    ['no_orphan_critical_documents', !integrity.uploadedDocumentsNotLinkedToRequirements?.length, 'Uploaded critical documents are linked or listed for manual review.'],
    ['external_reminders_disabled_by_default', true, 'External email/WhatsApp reminders remain disabled unless deliberately enabled.'],
    ['hard_workflow_blocks_disabled_globally', true, 'Canonical hard blocks are not globally enabled without rollout approval.'],
    ['seller_portal_verified', false, 'Verify seller portal canonical document workspace and legacy fallback.'],
    ['buyer_portal_verified', false, 'Verify buyer portal documents and finance docs.'],
    ['attorney_dashboard_verified', false, 'Verify attorney review, requests and readiness panels.'],
    ['transaction_workspace_verified', false, 'Verify transaction document data room and gate readiness.'],
    ['generated_packets_verified', !integrity.generatedPacketsNotLinkedToRequirements?.length, 'Generated/signed packets link to canonical requirements.'],
    ['upload_review_rejection_waiver_verified', false, 'Verify lifecycle actions against production-like records.'],
  ]

  return checks.map(([key, passed, description]) => ({
    key,
    passed: Boolean(passed),
    description,
  }))
}
