import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient'
import { resolveCommercialAccessContext } from './commercialApi'

const IMPORT_BATCHES_TABLE = 'commercial_import_batches'
const IMPORT_ROWS_TABLE = 'commercial_import_rows'
const IMPORT_TARGET_TABLES = Object.freeze({
  vacancies: 'commercial_vacancies',
  leads: 'commercial_requirements',
  requirements: 'commercial_requirements',
  canvassing_landlord_prospects: 'commercial_canvassing_prospects',
  canvassing_tenant_prospects: 'commercial_canvassing_prospects',
  properties: 'commercial_properties',
  landlords: 'commercial_landlords',
  companies: 'commercial_companies',
  contacts: 'commercial_contacts',
  listings: 'commercial_listings',
})

const IMPORT_BATCH_SELECT = [
  'id',
  'organisation_id',
  'branch_id',
  'team_id',
  'broker_id',
  'record_type',
  'source_type',
  'file_name',
  'file_mime_type',
  'file_size',
  'storage_bucket',
  'storage_path',
  'status',
  'duplicate_strategy',
  'default_owner_mode',
  'requires_manager_approval',
  'approved_by',
  'approved_at',
  'rejected_by',
  'rejected_at',
  'rejection_notes',
  'committed_by',
  'committed_at',
  'total_rows',
  'valid_rows',
  'invalid_rows',
  'warning_rows',
  'created_count',
  'updated_count',
  'skipped_count',
  'failed_count',
  'settings_snapshot',
  'column_mapping',
  'validation_summary',
  'import_summary',
  'metadata_json',
  'created_by',
  'created_at',
  'updated_by',
  'updated_at',
].join(', ')

const IMPORT_ROW_SELECT = [
  'id',
  'batch_id',
  'organisation_id',
  'branch_id',
  'team_id',
  'broker_id',
  'row_number',
  'source_row',
  'mapped_payload',
  'normalized_payload',
  'status',
  'action',
  'validation_errors',
  'validation_warnings',
  'duplicate_key',
  'duplicate_record_type',
  'duplicate_record_id',
  'target_table',
  'target_record_id',
  'error_message',
  'processed_at',
  'metadata_json',
  'created_by',
  'created_at',
  'updated_by',
  'updated_at',
].join(', ')

export const COMMERCIAL_IMPORT_RECORD_TYPES = Object.freeze([
  'vacancies',
  'leads',
  'requirements',
  'canvassing_landlord_prospects',
  'canvassing_tenant_prospects',
  'properties',
  'landlords',
  'companies',
  'contacts',
  'listings',
])

const COMMERCIAL_IMPORT_STATUSES = new Set([
  'uploaded',
  'mapped',
  'validated',
  'ready',
  'approval_pending',
  'approved',
  'committing',
  'committed',
  'failed',
  'cancelled',
  'rejected',
])

const COMMERCIAL_IMPORT_ROW_STATUSES = new Set([
  'pending',
  'mapped',
  'valid',
  'invalid',
  'warning',
  'ready',
  'committing',
  'created',
  'updated',
  'skipped',
  'failed',
])

const DUPLICATE_STRATEGIES = new Set(['review', 'skip', 'update'])
const OWNER_MODES = new Set(['uploading_broker', 'selected_broker', 'unassigned'])
const ROW_ACTIONS = new Set(['none', 'create', 'update', 'skip', 'review'])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeDuplicateText(value) {
  return normalizeLower(value).replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeDuplicatePhone(value) {
  return normalizeText(value).replace(/\D/g, '')
}

function normalizeInteger(value, fallback = 0) {
  const next = Number.parseInt(value, 10)
  return Number.isFinite(next) && next >= 0 ? next : fallback
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function normalizeJsonObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
}

function normalizeJsonArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeDateText(value) {
  const normalized = normalizeText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

function normalizeBooleanValue(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeLower(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (['yes', 'y', 'true', '1'].includes(normalized)) return true
  if (['no', 'n', 'false', '0'].includes(normalized)) return false
  return false
}

function getRowNumber(row = {}) {
  return normalizeInteger(row.rowNumber || row.row_number, 0)
}

function getRowNormalizedPayload(row = {}) {
  return normalizeJsonObject(row.normalizedPayload || row.normalized_payload)
}

function createExistingDuplicateMatch(recordType, recordId, reason, label = '') {
  return {
    recordType,
    recordId,
    reason,
    label: label || reason,
  }
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function toNullableUuid(value) {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function isMissingCommercialImportSchemaError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message || error?.details).toLowerCase()
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes(IMPORT_BATCHES_TABLE) ||
    message.includes(IMPORT_ROWS_TABLE) ||
    message.includes('schema cache')
  )
}

function createMissingImportSchemaError(error) {
  const suffix = error?.message ? ` ${error.message}` : ''
  return new Error(`Commercial import audit tables are unavailable. Apply migration 202606280001_commercial_bulk_import_audit_phase2.sql before using bulk uploads.${suffix}`)
}

async function getCurrentUserId() {
  if (!isSupabaseConfigured || !supabase?.auth?.getUser) return ''
  const { data } = await supabase.auth.getUser()
  return normalizeText(data?.user?.id)
}

async function resolveImportScope(organisationId = '') {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured.')
  const scope = await resolveCommercialAccessContext()
  if (!scope?.hasCommercialAccess) throw new Error('Commercial workspace access is required.')
  const resolvedOrganisationId = normalizeText(organisationId || scope.organisationId)
  if (!resolvedOrganisationId) throw new Error('A resolved commercial workspace is required.')
  return { ...scope, organisationId: resolvedOrganisationId }
}

function normalizeRecordType(value) {
  const normalized = normalizeLower(value)
  if (normalized === 'lead') return 'leads'
  if (normalized === 'requirement') return 'requirements'
  if (COMMERCIAL_IMPORT_RECORD_TYPES.includes(normalized)) return normalized
  throw new Error('Choose a supported commercial import type.')
}

function normalizeBatchStatus(value, fallback = 'uploaded') {
  const normalized = normalizeLower(value)
  return COMMERCIAL_IMPORT_STATUSES.has(normalized) ? normalized : fallback
}

function normalizeRowStatus(value, fallback = 'pending') {
  const normalized = normalizeLower(value)
  return COMMERCIAL_IMPORT_ROW_STATUSES.has(normalized) ? normalized : fallback
}

function normalizeDuplicateStrategy(value) {
  const normalized = normalizeLower(value)
  return DUPLICATE_STRATEGIES.has(normalized) ? normalized : 'review'
}

function normalizeOwnerMode(value) {
  const normalized = normalizeLower(value)
  return OWNER_MODES.has(normalized) ? normalized : 'uploading_broker'
}

function normalizeAction(value) {
  const normalized = normalizeLower(value)
  return ROW_ACTIONS.has(normalized) ? normalized : 'none'
}

function mapImportBatchRow(row = {}) {
  return {
    id: normalizeText(row.id),
    organisationId: normalizeText(row.organisation_id),
    branchId: normalizeText(row.branch_id),
    teamId: normalizeText(row.team_id),
    brokerId: normalizeText(row.broker_id),
    recordType: normalizeText(row.record_type),
    sourceType: normalizeText(row.source_type),
    fileName: normalizeText(row.file_name),
    fileMimeType: normalizeText(row.file_mime_type),
    fileSize: normalizeInteger(row.file_size),
    storageBucket: normalizeText(row.storage_bucket),
    storagePath: normalizeText(row.storage_path),
    status: normalizeText(row.status),
    duplicateStrategy: normalizeText(row.duplicate_strategy),
    defaultOwnerMode: normalizeText(row.default_owner_mode),
    requiresManagerApproval: row.requires_manager_approval !== false,
    approvedBy: normalizeText(row.approved_by),
    approvedAt: normalizeText(row.approved_at),
    rejectedBy: normalizeText(row.rejected_by),
    rejectedAt: normalizeText(row.rejected_at),
    rejectionNotes: normalizeText(row.rejection_notes),
    committedBy: normalizeText(row.committed_by),
    committedAt: normalizeText(row.committed_at),
    totalRows: normalizeInteger(row.total_rows),
    validRows: normalizeInteger(row.valid_rows),
    invalidRows: normalizeInteger(row.invalid_rows),
    warningRows: normalizeInteger(row.warning_rows),
    createdCount: normalizeInteger(row.created_count),
    updatedCount: normalizeInteger(row.updated_count),
    skippedCount: normalizeInteger(row.skipped_count),
    failedCount: normalizeInteger(row.failed_count),
    settingsSnapshot: normalizeJsonObject(row.settings_snapshot),
    columnMapping: normalizeJsonObject(row.column_mapping),
    validationSummary: normalizeJsonObject(row.validation_summary),
    importSummary: normalizeJsonObject(row.import_summary),
    metadata: normalizeJsonObject(row.metadata_json),
    createdBy: normalizeText(row.created_by),
    createdAt: normalizeText(row.created_at),
    updatedBy: normalizeText(row.updated_by),
    updatedAt: normalizeText(row.updated_at),
  }
}

function mapImportRow(row = {}) {
  return {
    id: normalizeText(row.id),
    batchId: normalizeText(row.batch_id),
    organisationId: normalizeText(row.organisation_id),
    branchId: normalizeText(row.branch_id),
    teamId: normalizeText(row.team_id),
    brokerId: normalizeText(row.broker_id),
    rowNumber: normalizeInteger(row.row_number),
    sourceRow: normalizeJsonObject(row.source_row),
    mappedPayload: normalizeJsonObject(row.mapped_payload),
    normalizedPayload: normalizeJsonObject(row.normalized_payload),
    status: normalizeText(row.status),
    action: normalizeText(row.action),
    validationErrors: normalizeJsonArray(row.validation_errors),
    validationWarnings: normalizeJsonArray(row.validation_warnings),
    duplicateKey: normalizeText(row.duplicate_key),
    duplicateRecordType: normalizeText(row.duplicate_record_type),
    duplicateRecordId: normalizeText(row.duplicate_record_id),
    targetTable: normalizeText(row.target_table),
    targetRecordId: normalizeText(row.target_record_id),
    errorMessage: normalizeText(row.error_message),
    processedAt: normalizeText(row.processed_at),
    metadata: normalizeJsonObject(row.metadata_json),
    createdBy: normalizeText(row.created_by),
    createdAt: normalizeText(row.created_at),
    updatedBy: normalizeText(row.updated_by),
    updatedAt: normalizeText(row.updated_at),
  }
}

function batchPayloadToRow(payload = {}, scope = {}, userId = '') {
  const branchId = toNullableUuid(payload.branchId || payload.branch_id || scope.branchId)
  const teamId = toNullableUuid(payload.teamId || payload.team_id || scope.teamId)
  const brokerId = toNullableUuid(payload.brokerId || payload.broker_id || (scope.scopeLevel === 'broker' ? scope.userId : ''))
  const recordType = normalizeRecordType(payload.recordType || payload.record_type)
  const status = payload.requiresManagerApproval === false ? 'uploaded' : normalizeBatchStatus(payload.status || payload.statusOverride, 'uploaded')

  return {
    organisation_id: scope.organisationId,
    branch_id: branchId,
    team_id: teamId,
    broker_id: brokerId,
    record_type: recordType,
    source_type: normalizeLower(payload.sourceType || payload.source_type || 'spreadsheet') || 'spreadsheet',
    file_name: normalizeText(payload.fileName || payload.file_name) || null,
    file_mime_type: normalizeText(payload.fileMimeType || payload.file_mime_type) || null,
    file_size: normalizeInteger(payload.fileSize || payload.file_size, 0),
    storage_bucket: normalizeText(payload.storageBucket || payload.storage_bucket) || null,
    storage_path: normalizeText(payload.storagePath || payload.storage_path) || null,
    status,
    duplicate_strategy: normalizeDuplicateStrategy(payload.duplicateStrategy || payload.duplicate_strategy),
    default_owner_mode: normalizeOwnerMode(payload.defaultOwnerMode || payload.default_owner_mode),
    requires_manager_approval: payload.requiresManagerApproval !== false && payload.requires_manager_approval !== false,
    total_rows: normalizeInteger(payload.totalRows || payload.total_rows, 0),
    settings_snapshot: normalizeJsonObject(payload.settingsSnapshot || payload.settings_snapshot),
    column_mapping: normalizeJsonObject(payload.columnMapping || payload.column_mapping),
    validation_summary: normalizeJsonObject(payload.validationSummary || payload.validation_summary),
    import_summary: normalizeJsonObject(payload.importSummary || payload.import_summary),
    metadata_json: normalizeJsonObject(payload.metadata || payload.metadata_json),
    created_by: toNullableUuid(payload.createdBy || payload.created_by || userId),
    updated_by: toNullableUuid(payload.updatedBy || payload.updated_by || userId),
  }
}

function batchPatchToRow(patch = {}, userId = '') {
  const row = {}
  if ('branchId' in patch || 'branch_id' in patch) row.branch_id = toNullableUuid(patch.branchId || patch.branch_id)
  if ('teamId' in patch || 'team_id' in patch) row.team_id = toNullableUuid(patch.teamId || patch.team_id)
  if ('brokerId' in patch || 'broker_id' in patch) row.broker_id = toNullableUuid(patch.brokerId || patch.broker_id)
  if ('status' in patch) row.status = normalizeBatchStatus(patch.status)
  if ('duplicateStrategy' in patch || 'duplicate_strategy' in patch) row.duplicate_strategy = normalizeDuplicateStrategy(patch.duplicateStrategy || patch.duplicate_strategy)
  if ('defaultOwnerMode' in patch || 'default_owner_mode' in patch) row.default_owner_mode = normalizeOwnerMode(patch.defaultOwnerMode || patch.default_owner_mode)
  if ('requiresManagerApproval' in patch || 'requires_manager_approval' in patch) row.requires_manager_approval = patch.requiresManagerApproval !== false && patch.requires_manager_approval !== false
  if ('columnMapping' in patch || 'column_mapping' in patch) row.column_mapping = normalizeJsonObject(patch.columnMapping || patch.column_mapping)
  if ('validationSummary' in patch || 'validation_summary' in patch) row.validation_summary = normalizeJsonObject(patch.validationSummary || patch.validation_summary)
  if ('importSummary' in patch || 'import_summary' in patch) row.import_summary = normalizeJsonObject(patch.importSummary || patch.import_summary)
  if ('metadata' in patch || 'metadata_json' in patch) row.metadata_json = normalizeJsonObject(patch.metadata || patch.metadata_json)
  ;[
    ['approved_by', patch.approvedBy || patch.approved_by],
    ['rejected_by', patch.rejectedBy || patch.rejected_by],
    ['committed_by', patch.committedBy || patch.committed_by],
  ].forEach(([key, value]) => {
    if (value) row[key] = toNullableUuid(value)
  })
  ;[
    ['approved_at', patch.approvedAt || patch.approved_at],
    ['rejected_at', patch.rejectedAt || patch.rejected_at],
    ['committed_at', patch.committedAt || patch.committed_at],
  ].forEach(([key, value]) => {
    if (value) row[key] = normalizeText(value)
  })
  if ('rejectionNotes' in patch || 'rejection_notes' in patch) row.rejection_notes = normalizeText(patch.rejectionNotes || patch.rejection_notes) || null
  ;[
    ['total_rows', patch.totalRows || patch.total_rows],
    ['valid_rows', patch.validRows || patch.valid_rows],
    ['invalid_rows', patch.invalidRows || patch.invalid_rows],
    ['warning_rows', patch.warningRows || patch.warning_rows],
    ['created_count', patch.createdCount || patch.created_count],
    ['updated_count', patch.updatedCount || patch.updated_count],
    ['skipped_count', patch.skippedCount || patch.skipped_count],
    ['failed_count', patch.failedCount || patch.failed_count],
  ].forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') row[key] = normalizeInteger(value)
  })
  row.updated_by = toNullableUuid(patch.updatedBy || patch.updated_by || userId)
  return row
}

function rowPayloadToRow(batch = {}, payload = {}, userId = '') {
  return {
    batch_id: batch.id,
    organisation_id: batch.organisation_id,
    branch_id: toNullableUuid(payload.branchId || payload.branch_id || batch.branch_id),
    team_id: toNullableUuid(payload.teamId || payload.team_id || batch.team_id),
    broker_id: toNullableUuid(payload.brokerId || payload.broker_id || batch.broker_id),
    row_number: normalizeInteger(payload.rowNumber || payload.row_number, 0),
    source_row: normalizeJsonObject(payload.sourceRow || payload.source_row),
    mapped_payload: normalizeJsonObject(payload.mappedPayload || payload.mapped_payload),
    normalized_payload: normalizeJsonObject(payload.normalizedPayload || payload.normalized_payload),
    status: normalizeRowStatus(payload.status),
    action: normalizeAction(payload.action),
    validation_errors: normalizeJsonArray(payload.validationErrors || payload.validation_errors),
    validation_warnings: normalizeJsonArray(payload.validationWarnings || payload.validation_warnings),
    duplicate_key: normalizeText(payload.duplicateKey || payload.duplicate_key) || null,
    duplicate_record_type: normalizeText(payload.duplicateRecordType || payload.duplicate_record_type) || null,
    duplicate_record_id: toNullableUuid(payload.duplicateRecordId || payload.duplicate_record_id),
    target_table: normalizeText(payload.targetTable || payload.target_table) || null,
    target_record_id: toNullableUuid(payload.targetRecordId || payload.target_record_id),
    error_message: normalizeText(payload.errorMessage || payload.error_message) || null,
    processed_at: normalizeText(payload.processedAt || payload.processed_at) || null,
    metadata_json: normalizeJsonObject(payload.metadata || payload.metadata_json),
    created_by: toNullableUuid(payload.createdBy || payload.created_by || userId),
    updated_by: toNullableUuid(payload.updatedBy || payload.updated_by || userId),
  }
}

function rowPatchToRow(patch = {}, userId = '') {
  const row = {}
  if ('status' in patch) row.status = normalizeRowStatus(patch.status)
  if ('action' in patch) row.action = normalizeAction(patch.action)
  if ('mappedPayload' in patch || 'mapped_payload' in patch) row.mapped_payload = normalizeJsonObject(patch.mappedPayload || patch.mapped_payload)
  if ('normalizedPayload' in patch || 'normalized_payload' in patch) row.normalized_payload = normalizeJsonObject(patch.normalizedPayload || patch.normalized_payload)
  if ('validationErrors' in patch || 'validation_errors' in patch) row.validation_errors = normalizeJsonArray(patch.validationErrors || patch.validation_errors)
  if ('validationWarnings' in patch || 'validation_warnings' in patch) row.validation_warnings = normalizeJsonArray(patch.validationWarnings || patch.validation_warnings)
  if ('duplicateKey' in patch || 'duplicate_key' in patch) row.duplicate_key = normalizeText(patch.duplicateKey || patch.duplicate_key) || null
  if ('duplicateRecordType' in patch || 'duplicate_record_type' in patch) row.duplicate_record_type = normalizeText(patch.duplicateRecordType || patch.duplicate_record_type) || null
  if ('duplicateRecordId' in patch || 'duplicate_record_id' in patch) row.duplicate_record_id = toNullableUuid(patch.duplicateRecordId || patch.duplicate_record_id)
  if ('targetTable' in patch || 'target_table' in patch) row.target_table = normalizeText(patch.targetTable || patch.target_table) || null
  if ('targetRecordId' in patch || 'target_record_id' in patch) row.target_record_id = toNullableUuid(patch.targetRecordId || patch.target_record_id)
  if ('errorMessage' in patch || 'error_message' in patch) row.error_message = normalizeText(patch.errorMessage || patch.error_message) || null
  if ('processedAt' in patch || 'processed_at' in patch) row.processed_at = normalizeText(patch.processedAt || patch.processed_at) || null
  if ('metadata' in patch || 'metadata_json' in patch) row.metadata_json = normalizeJsonObject(patch.metadata || patch.metadata_json)
  row.updated_by = toNullableUuid(patch.updatedBy || patch.updated_by || userId)
  return row
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  return normalizeText(value)
    .split(/[;,]/)
    .map((item) => normalizeText(item))
    .filter(Boolean)
}

function normalizePriority(value) {
  const normalized = normalizeLower(value)
  if (normalized === 'low') return 'Low'
  if (normalized === 'high') return 'High'
  if (normalized === 'urgent') return 'Urgent'
  return 'Medium'
}

function normalizePropertyCategory(value) {
  const normalized = normalizeLower(value).replace(/\s+/g, '_').replace(/-/g, '_')
  if (['office', 'retail', 'industrial', 'mixed_use', 'commercial', 'agricultural', 'other'].includes(normalized)) return normalized
  return normalized ? 'commercial' : null
}

function normalizeListingType(value) {
  const normalized = normalizeLower(value).replace(/\s+/g, '_').replace(/-/g, '_')
  if (['lease', 'sale', 'investment', 'development'].includes(normalized)) return normalized
  return 'lease'
}

function normalizeListingCategory(value) {
  const normalized = normalizeLower(value).replace(/\s+/g, '_').replace(/-/g, '_')
  if (['office', 'industrial', 'retail', 'agricultural', 'mixed_use', 'development_land'].includes(normalized)) return normalized
  if (['warehouse', 'logistics'].includes(normalized)) return 'industrial'
  if (['farm'].includes(normalized)) return 'agricultural'
  if (['land', 'development'].includes(normalized)) return 'development_land'
  return 'office'
}

function normalizePricingValue(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = normalizeText(value).replace(/[^\d.-]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function hasDuplicateWarning(row = {}) {
  return normalizeJsonArray(row.validationWarnings || row.validation_warnings).some((warning) => normalizeLower(warning).includes('duplicate'))
}

function buildTargetBasePayload(batch = {}, row = {}, userId = '') {
  return {
    organisation_id: batch.organisation_id,
    branch_id: toNullableUuid(row.branch_id || batch.branch_id),
    team_id: toNullableUuid(row.team_id || batch.team_id),
    broker_id: toNullableUuid(row.broker_id || batch.broker_id || userId),
    created_by: toNullableUuid(userId),
    updated_by: toNullableUuid(userId),
  }
}

function createResolutionContext() {
  return {
    landlords: new Map(),
    properties: new Map(),
    companies: new Map(),
    contacts: new Map(),
  }
}

function makeLookupKey(...parts) {
  return parts.map((part) => normalizeLower(part)).filter(Boolean).join('|')
}

function splitContactName(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) }
}

async function findFirstByIlike(table, organisationId, column, value) {
  const normalized = normalizeText(value)
  if (!normalized) return null
  const result = await supabase
    .from(table)
    .select('*')
    .eq('organisation_id', organisationId)
    .ilike(column, normalized)
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data || null
}

async function findFirstByEmail(table, organisationId, email) {
  const normalized = normalizeLower(email)
  if (!normalized) return null
  const result = await supabase
    .from(table)
    .select('*')
    .eq('organisation_id', organisationId)
    .ilike('email', normalized)
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data || null
}

async function findOrCreateLandlord(batch = {}, row = {}, payload = {}, userId = '', resolution = createResolutionContext()) {
  const name = normalizeText(payload.landlord_name)
  if (!name) return null
  const key = makeLookupKey(batch.organisation_id, name)
  if (resolution.landlords.has(key)) return resolution.landlords.get(key)

  let landlord = await findFirstByIlike('commercial_landlords', batch.organisation_id, 'name', name)
  if (!landlord?.id) {
    const base = buildTargetBasePayload(batch, row, userId)
    const insert = await supabase
      .from('commercial_landlords')
      .insert({
        organisation_id: base.organisation_id,
        branch_id: base.branch_id,
        team_id: base.team_id,
        broker_id: base.broker_id,
        name,
        contact_person: normalizeText(payload.contact_name) || null,
        email: normalizeLower(payload.email) || null,
        phone: normalizeText(payload.phone) || null,
        notes: normalizeText(payload.notes) || null,
        status: 'active',
        created_by: base.created_by,
        updated_by: base.updated_by,
      })
      .select('*')
      .single()
    if (insert.error) throw insert.error
    landlord = insert.data
  }

  resolution.landlords.set(key, landlord)
  return landlord
}

async function findOrCreateProperty(batch = {}, row = {}, payload = {}, userId = '', resolution = createResolutionContext(), landlord = null) {
  const name = normalizeText(payload.property_name)
  if (!name) return null
  const key = makeLookupKey(batch.organisation_id, name)
  if (resolution.properties.has(key)) return resolution.properties.get(key)

  let property = await findFirstByIlike('commercial_properties', batch.organisation_id, 'property_name', name)
  if (!property?.id) {
    const base = buildTargetBasePayload(batch, row, userId)
    const insert = await supabase
      .from('commercial_properties')
      .insert({
        organisation_id: base.organisation_id,
        branch_id: base.branch_id,
        team_id: base.team_id,
        broker_id: base.broker_id,
        landlord_id: toNullableUuid(landlord?.id),
        property_name: name,
        property_type: normalizeText(payload.property_type) || 'commercial',
        address: normalizeText(payload.address) || null,
        suburb: normalizeText(payload.suburb) || null,
        city: normalizeText(payload.city) || null,
        province: normalizeText(payload.province) || null,
        available_space_m2: normalizeNumber(payload.available_area_m2 || payload.available_space_m2),
        asking_rental_per_m2: normalizeNumber(payload.asking_rental || payload.asking_rental_per_m2),
        notes: normalizeText(payload.notes) || null,
        status: 'active',
        created_by: base.created_by,
        updated_by: base.updated_by,
      })
      .select('*')
      .single()
    if (insert.error) throw insert.error
    property = insert.data
  }

  resolution.properties.set(key, property)
  return property
}

async function findVacancy(batch = {}, payload = {}) {
  const vacancyName = normalizeText(payload.vacancy_name)
  if (!vacancyName) return null
  const result = await supabase
    .from('commercial_vacancies')
    .select('*')
    .eq('organisation_id', batch.organisation_id)
    .ilike('vacancy_name', vacancyName)
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data || null
}

function normalizeCompanyType(value) {
  const normalized = normalizeLower(value)
  if (['tenant', 'landlord', 'investor', 'developer', 'property_fund', 'brokerage', 'corporate', 'other'].includes(normalized)) return normalized
  if (normalized === 'buyer' || normalized === 'seller') return 'corporate'
  return 'other'
}

function buildCompanyPayloadFromImportPayload(base = {}, payload = {}, typeHint = '') {
  return {
    ...base,
    company_name: normalizeText(payload.company_name) || 'Imported company',
    company_type: normalizeCompanyType(payload.company_type || typeHint),
    industry: normalizeText(payload.industry) || null,
    website: normalizeText(payload.website) || null,
    registration_number: normalizeText(payload.registration_number) || null,
    vat_number: normalizeText(payload.vat_number) || null,
    phone: normalizeText(payload.phone) || null,
    email: normalizeLower(payload.email) || null,
    address: normalizeText(payload.address) || null,
    city: normalizeText(payload.city) || null,
    province: normalizeText(payload.province) || null,
    country: normalizeText(payload.country) || 'South Africa',
    notes: normalizeText(payload.notes) || null,
    status: 'active',
  }
}

async function findOrCreateCompany(batch = {}, row = {}, payload = {}, userId = '', resolution = createResolutionContext(), typeHint = '') {
  const name = normalizeText(payload.company_name)
  if (!name) return null
  const key = makeLookupKey(batch.organisation_id, name)
  if (resolution.companies.has(key)) return resolution.companies.get(key)

  let company = await findFirstByIlike('commercial_companies', batch.organisation_id, 'company_name', name)
  if (!company?.id) {
    const base = buildTargetBasePayload(batch, row, userId)
    const insert = await supabase
      .from('commercial_companies')
      .insert({
        organisation_id: base.organisation_id,
        branch_id: base.branch_id,
        team_id: base.team_id,
        broker_id: base.broker_id,
        company_name: name,
        company_type: normalizeCompanyType(payload.company_type || typeHint),
        industry: normalizeText(payload.industry) || null,
        website: normalizeText(payload.website) || null,
        phone: normalizeText(payload.phone) || null,
        email: normalizeLower(payload.email) || null,
        address: normalizeText(payload.address) || null,
        city: normalizeText(payload.city) || null,
        province: normalizeText(payload.province) || null,
        notes: normalizeText(payload.notes) || null,
        status: 'prospect',
        created_by: base.created_by,
        updated_by: base.updated_by,
      })
      .select('*')
      .single()
    if (insert.error) throw insert.error
    company = insert.data
  }

  resolution.companies.set(key, company)
  return company
}

async function findOrCreateContact(batch = {}, row = {}, payload = {}, userId = '', resolution = createResolutionContext(), company = null) {
  const email = normalizeLower(payload.email)
  const name = normalizeText(payload.contact_name)
  if (!company?.id || (!email && !name && !normalizeText(payload.phone))) return null
  const key = makeLookupKey(batch.organisation_id, company.id, email || name || payload.phone)
  if (resolution.contacts.has(key)) return resolution.contacts.get(key)

  let contact = email ? await findFirstByEmail('commercial_contacts', batch.organisation_id, email) : null
  if (!contact?.id && name) {
    const names = splitContactName(name)
    const result = await supabase
      .from('commercial_contacts')
      .select('*')
      .eq('organisation_id', batch.organisation_id)
      .eq('company_id', company.id)
      .ilike('first_name', names.firstName)
      .ilike('last_name', names.lastName)
      .limit(1)
      .maybeSingle()
    if (result.error) throw result.error
    contact = result.data || null
  }

  if (!contact?.id) {
    const base = buildTargetBasePayload(batch, row, userId)
    const names = splitContactName(name)
    const insert = await supabase
      .from('commercial_contacts')
      .insert({
        organisation_id: base.organisation_id,
        branch_id: base.branch_id,
        team_id: base.team_id,
        broker_id: base.broker_id,
        company_id: company.id,
        first_name: normalizeText(payload.first_name) || names.firstName || null,
        last_name: normalizeText(payload.last_name) || names.lastName || null,
        email: email || null,
        phone: normalizeText(payload.phone) || null,
        mobile: normalizeText(payload.mobile) || null,
        notes: normalizeText(payload.notes) || null,
        status: 'active',
        created_by: base.created_by,
        updated_by: base.updated_by,
      })
      .select('*')
      .single()
    if (insert.error) throw insert.error
    contact = insert.data
  }

  resolution.contacts.set(key, contact)
  return contact
}

async function resolveImportRelationships(batch = {}, row = {}, userId = '', resolution = createResolutionContext()) {
  const payload = getRowNormalizedPayload(row)
  const recordType = normalizeRecordType(batch.record_type)
  const resolved = {}

  if (recordType === 'vacancies') {
    const landlord = await findOrCreateLandlord(batch, row, payload, userId, resolution)
    const property = await findOrCreateProperty(batch, row, payload, userId, resolution, landlord)
    if (landlord?.id) resolved.landlord_id = landlord.id
    if (property?.id) resolved.property_id = property.id
  }

  if (recordType === 'leads' || recordType === 'requirements') {
    const company = await findOrCreateCompany(batch, row, payload, userId, resolution, payload.lead_type || 'tenant')
    const contact = await findOrCreateContact(batch, row, payload, userId, resolution, company)
    if (company?.id) resolved.company_id = company.id
    if (contact?.id) resolved.contact_id = contact.id
  }

  if (recordType === 'canvassing_landlord_prospects' || recordType === 'canvassing_tenant_prospects') {
    const companyType = recordType === 'canvassing_landlord_prospects' ? 'landlord' : 'tenant'
    const company = await findOrCreateCompany(batch, row, payload, userId, resolution, companyType)
    const contact = await findOrCreateContact(batch, row, payload, userId, resolution, company)
    if (company?.id) resolved.company_id = company.id
    if (contact?.id) resolved.contact_id = contact.id
  }

  return resolved
}

async function buildVacancyTargetPayload(batch = {}, row = {}, userId = '', resolution = createResolutionContext()) {
  const payload = getRowNormalizedPayload(row)
  const resolved = await resolveImportRelationships(batch, row, userId, resolution)
  const base = buildTargetBasePayload(batch, row, userId)
  return {
    ...base,
    ...resolved,
    vacancy_name: normalizeText(payload.vacancy_name) || normalizeText(payload.property_name) || `Imported vacancy row ${getRowNumber(row)}`,
    unit_or_floor: normalizeText(payload.unit_or_floor) || null,
    available_area_m2: normalizeNumber(payload.available_area_m2),
    asking_rental: normalizeNumber(payload.asking_rental),
    availability_date: normalizeDateText(payload.availability_date),
    broker_assignment: base.broker_id,
    status: 'draft',
    notes: normalizeText(payload.notes) || null,
  }
}

async function buildRequirementTargetPayload(batch = {}, row = {}, userId = '', resolution = createResolutionContext()) {
  const payload = getRowNormalizedPayload(row)
  const resolved = await resolveImportRelationships(batch, row, userId, resolution)
  const base = buildTargetBasePayload(batch, row, userId)
  const leadType = normalizeLower(payload.lead_type) || 'tenant'
  return {
    ...base,
    ...resolved,
    requirement_type: leadType === 'buyer' ? 'purchase' : 'lease',
    client_type: leadType || null,
    requirement_name: normalizeText(payload.requirement_name) || normalizeText(payload.company_name) || `Imported requirement row ${getRowNumber(row)}`,
    property_type: normalizeText(payload.property_type) || null,
    preferred_locations: splitList(payload.preferred_locations),
    min_size_m2: normalizeNumber(payload.min_size_m2),
    max_size_m2: normalizeNumber(payload.max_size_m2),
    budget_min: normalizeNumber(payload.budget_min),
    budget_max: normalizeNumber(payload.budget_max),
    target_occupation_date: normalizeDateText(payload.target_occupation_date),
    assigned_broker: base.broker_id,
    stage: 'new_requirement',
    status: 'active',
    notes: normalizeText(payload.notes) || null,
    special_requirements: normalizeText(payload.notes) || null,
  }
}

async function buildProspectTargetPayload(batch = {}, row = {}, userId = '', resolution = createResolutionContext()) {
  const payload = getRowNormalizedPayload(row)
  const resolved = await resolveImportRelationships(batch, row, userId, resolution)
  const base = buildTargetBasePayload(batch, row, userId)
  const recordType = normalizeRecordType(batch.record_type)
  const isLandlord = recordType === 'canvassing_landlord_prospects'
  return {
    organisation_id: base.organisation_id,
    branch_id: base.branch_id,
    team_id: base.team_id,
    assigned_broker_id: base.broker_id,
    company_id: toNullableUuid(resolved.company_id),
    contact_id: toNullableUuid(resolved.contact_id),
    company_name: normalizeText(payload.company_name) || null,
    contact_name: normalizeText(payload.contact_name) || null,
    phone: normalizeText(payload.phone) || null,
    email: normalizeLower(payload.email) || null,
    prospect_type: isLandlord ? 'Landlord Prospect' : 'Tenant Prospect',
    prospect_role: isLandlord ? 'landlord' : 'tenant',
    deal_type: normalizeLower(payload.deal_type) || 'lease',
    property_category: normalizePropertyCategory(payload.property_type),
    canvassing_method: normalizeText(payload.canvassing_method) || 'Bulk Upload',
    property_type: normalizeText(payload.property_type) || null,
    area: normalizeText(payload.area) || null,
    status: normalizeText(payload.status) || 'New',
    next_follow_up_date: normalizeDateText(payload.next_follow_up_date),
    follow_up_priority: normalizePriority(payload.follow_up_priority),
    notes: normalizeText(payload.notes) || null,
    metadata_json: {
      source: 'commercial_bulk_upload_phase_7',
      importBatchId: batch.id,
      importRowId: row.id,
      duplicateKey: row.duplicate_key || null,
      resolvedRelationships: resolved,
      roleSpecific: {},
    },
    created_by: toNullableUuid(userId),
    updated_by: toNullableUuid(userId),
  }
}

async function buildLandlordTargetPayload(batch = {}, row = {}, userId = '') {
  const payload = getRowNormalizedPayload(row)
  const base = buildTargetBasePayload(batch, row, userId)
  const name = normalizeText(payload.name || payload.landlord_name || payload.legal_name)
  return {
    organisation_id: base.organisation_id,
    branch_id: base.branch_id,
    team_id: base.team_id,
    broker_id: base.broker_id,
    name: name || `Imported landlord row ${getRowNumber(row)}`,
    contact_person: normalizeText(payload.contact_name || payload.contact_person) || null,
    email: normalizeLower(payload.email || payload.main_email) || null,
    phone: normalizeText(payload.phone || payload.main_phone) || null,
    website: normalizeText(payload.website) || null,
    landlord_type: normalizeText(payload.entity_type || payload.portfolio_type) || null,
    portfolio_notes: normalizeText(payload.portfolio_type || payload.notes) || null,
    notes: normalizeText(payload.notes) || null,
    status: 'active',
    created_by: base.created_by,
    updated_by: base.updated_by,
  }
}

async function buildCompanyTargetPayload(batch = {}, row = {}, userId = '') {
  const payload = getRowNormalizedPayload(row)
  const base = buildTargetBasePayload(batch, row, userId)
  return buildCompanyPayloadFromImportPayload(base, payload)
}

async function buildContactTargetPayload(batch = {}, row = {}, userId = '', resolution = createResolutionContext()) {
  const payload = getRowNormalizedPayload(row)
  const base = buildTargetBasePayload(batch, row, userId)
  const company = await findOrCreateCompany(batch, row, payload, userId, resolution, payload.company_type || 'tenant')
  if (!company?.id) {
    throw new Error(`Row ${getRowNumber(row)} could not resolve a company for this contact.`)
  }
  const contactName = normalizeText(payload.contact_name || `${payload.first_name || ''} ${payload.last_name || ''}`)
  const names = splitContactName(contactName)
  return {
    ...base,
    company_id: company.id,
    first_name: normalizeText(payload.first_name) || names.firstName || null,
    last_name: normalizeText(payload.last_name) || names.lastName || null,
    job_title: normalizeText(payload.job_title) || null,
    email: normalizeLower(payload.email) || null,
    phone: normalizeText(payload.phone) || null,
    mobile: normalizeText(payload.mobile) || null,
    decision_maker: normalizeBooleanValue(payload.decision_maker),
    is_primary: normalizeBooleanValue(payload.is_primary),
    notes: normalizeText(payload.notes) || null,
    status: 'active',
  }
}

async function buildPropertyTargetPayload(batch = {}, row = {}, userId = '', resolution = createResolutionContext()) {
  const payload = getRowNormalizedPayload(row)
  const landlord = await findOrCreateLandlord(batch, row, payload, userId, resolution)
  const base = buildTargetBasePayload(batch, row, userId)
  return {
    ...base,
    landlord_id: toNullableUuid(landlord?.id),
    property_name: normalizeText(payload.property_name) || `Imported property row ${getRowNumber(row)}`,
    property_type: normalizeText(payload.property_type) || 'commercial',
    address: normalizeText(payload.address) || null,
    suburb: normalizeText(payload.suburb) || null,
    city: normalizeText(payload.city) || null,
    province: normalizeText(payload.province) || null,
    country: normalizeText(payload.country) || 'South Africa',
    gla_m2: normalizeNumber(payload.gla_m2),
    available_space_m2: normalizeNumber(payload.available_space_m2),
    asking_rental_per_m2: normalizeNumber(payload.asking_rental_per_m2),
    asking_sale_price: normalizeNumber(payload.asking_sale_price),
    notes: normalizeText(payload.notes) || null,
    status: 'active',
  }
}

async function buildListingTargetPayload(batch = {}, row = {}, userId = '', resolution = createResolutionContext()) {
  const payload = getRowNormalizedPayload(row)
  const landlord = await findOrCreateLandlord(batch, row, payload, userId, resolution)
  const property = await findOrCreateProperty(batch, row, payload, userId, resolution, landlord)
  const vacancy = await findVacancy(batch, payload)
  const base = buildTargetBasePayload(batch, row, userId)
  const listingType = normalizeListingType(payload.listing_type)
  const listingCategory = normalizeListingCategory(payload.listing_category || payload.property_type || property?.property_type)
  const pricing = normalizePricingValue(payload.pricing)
  return {
    ...base,
    landlord_id: toNullableUuid(landlord?.id || property?.landlord_id || vacancy?.landlord_id),
    property_id: toNullableUuid(property?.id || vacancy?.property_id),
    vacancy_id: toNullableUuid(vacancy?.id),
    listing_type: listingType,
    listing_category: listingCategory,
    listing_status: 'draft',
    status: 'active',
    title: normalizeText(payload.title) || normalizeText(payload.listing_title) || `Imported listing row ${getRowNumber(row)}`,
    description: normalizeText(payload.description) || null,
    pricing,
    pricing_notes: pricing === null ? normalizeText(payload.pricing) || null : null,
    available_from: normalizeDateText(payload.available_from || vacancy?.availability_date),
    metadata_json: {
      source: 'commercial_bulk_upload_phase_3',
      importBatchId: batch.id,
      importRowId: row.id,
      propertyName: normalizeText(payload.property_name) || null,
      vacancyName: normalizeText(payload.vacancy_name) || null,
      landlordName: normalizeText(payload.landlord_name) || null,
    },
    marketing_json: {},
    media_json: {},
    performance_json: {},
    notes: normalizeText(payload.notes) || null,
  }
}

async function buildImportTargetPayload(batch = {}, row = {}, userId = '', resolution = createResolutionContext()) {
  const recordType = normalizeRecordType(batch.record_type)
  if (recordType === 'vacancies') return buildVacancyTargetPayload(batch, row, userId, resolution)
  if (recordType === 'leads' || recordType === 'requirements') return buildRequirementTargetPayload(batch, row, userId, resolution)
  if (recordType === 'canvassing_landlord_prospects' || recordType === 'canvassing_tenant_prospects') return buildProspectTargetPayload(batch, row, userId, resolution)
  if (recordType === 'landlords') return buildLandlordTargetPayload(batch, row, userId, resolution)
  if (recordType === 'companies') return buildCompanyTargetPayload(batch, row, userId, resolution)
  if (recordType === 'contacts') return buildContactTargetPayload(batch, row, userId, resolution)
  if (recordType === 'properties') return buildPropertyTargetPayload(batch, row, userId, resolution)
  if (recordType === 'listings') return buildListingTargetPayload(batch, row, userId, resolution)
  throw new Error(`Committing ${recordType} imports is not enabled yet.`)
}

function shouldCommitImportRow(row = {}, duplicateStrategy = 'review', seenDuplicateKeys = new Set()) {
  const errors = normalizeJsonArray(row.validationErrors || row.validation_errors)
  if (errors.length) return { commit: false, status: 'invalid', action: 'review', message: 'Row has validation errors.' }

  const requestedAction = normalizeAction(row.action)
  if (requestedAction === 'skip') return { commit: false, status: 'skipped', action: 'skip', message: 'Row skipped by import review.' }
  if (requestedAction === 'review') return { commit: false, status: 'warning', action: 'review', message: 'Row held for review.' }
  if (requestedAction === 'update') {
    const duplicateRecordId = toNullableUuid(row.duplicateRecordId || row.duplicate_record_id)
    if (!duplicateRecordId) return { commit: false, status: 'warning', action: 'review', message: 'Update action requires a matched duplicate record.' }
    return { commit: true, status: 'committing', action: 'update', operation: 'update', targetRecordId: duplicateRecordId, message: '' }
  }

  const duplicateKey = normalizeText(row.duplicateKey || row.duplicate_key)
  const duplicateWarning = hasDuplicateWarning(row)
  if (duplicateKey && seenDuplicateKeys.has(duplicateKey)) {
    if (duplicateStrategy === 'skip') return { commit: false, status: 'skipped', action: 'skip', message: 'Duplicate row skipped by batch strategy.' }
    if (requestedAction !== 'create') return { commit: false, status: 'warning', action: 'review', message: 'Duplicate row left for review.' }
  }
  if (duplicateKey) seenDuplicateKeys.add(duplicateKey)
  if (duplicateWarning && duplicateStrategy === 'review' && requestedAction !== 'create') return { commit: false, status: 'warning', action: 'review', message: 'Duplicate warning left for review.' }

  return { commit: true, status: 'committing', action: 'create', message: '' }
}

function getImportUpdatePayload(payload = {}) {
  const blockedKeys = new Set(['id', 'created_at', 'created_by', 'organisation_id'])
  return Object.entries(payload).reduce((nextPayload, [key, value]) => {
    if (blockedKeys.has(key)) return nextPayload
    if (value === undefined || value === null || value === '') return nextPayload
    if (Array.isArray(value) && !value.length) return nextPayload
    if (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length) return nextPayload
    nextPayload[key] = value
    return nextPayload
  }, {})
}

async function fetchCommercialDuplicateRows(table, columns, organisationId, limit = 5000) {
  const query = await supabase
    .from(table)
    .select(columns)
    .eq('organisation_id', organisationId)
    .limit(limit)

  if (query.error) throw query.error
  return query.data || []
}

function mapCommercialPropertiesByName(properties = []) {
  return properties.reduce((map, property) => {
    const name = normalizeDuplicateText(property.property_name)
    if (name && !map.has(name)) map.set(name, property.id)
    return map
  }, new Map())
}

function mapCommercialCompaniesByName(companies = []) {
  return companies.reduce((map, company) => {
    const name = normalizeDuplicateText(company.company_name)
    if (name && !map.has(name)) map.set(name, company.id)
    return map
  }, new Map())
}

export async function findCommercialImportExistingDuplicates({ organisationId = '', recordType = '', rows = [] } = {}) {
  const type = normalizeRecordType(recordType)
  if (!Array.isArray(rows) || !rows.length) return { matchesByRowNumber: {} }

  const scope = await resolveImportScope(organisationId)
  const importRows = rows.map((row) => ({ row, rowNumber: getRowNumber(row), payload: getRowNormalizedPayload(row) }))
  const matchesByRowNumber = {}
  const setMatch = (entry, match) => {
    if (!entry?.rowNumber || !match?.recordId || matchesByRowNumber[entry.rowNumber]) return
    matchesByRowNumber[entry.rowNumber] = match
  }

  if (type === 'companies') {
    const companies = await fetchCommercialDuplicateRows('commercial_companies', 'id, company_name, registration_number, email', scope.organisationId)
    importRows.forEach((entry) => {
      const payload = entry.payload
      const registration = normalizeDuplicateText(payload.registration_number)
      const email = normalizeLower(payload.email)
      const name = normalizeDuplicateText(payload.company_name)
      const match = companies.find((company) => (
        (registration && registration === normalizeDuplicateText(company.registration_number)) ||
        (email && email === normalizeLower(company.email)) ||
        (name && name === normalizeDuplicateText(company.company_name))
      ))
      if (match) setMatch(entry, createExistingDuplicateMatch('commercial_companies', match.id, 'company name, registration number, or email already exists', match.company_name))
    })
    return { matchesByRowNumber }
  }

  if (type === 'contacts') {
    const [companies, contacts] = await Promise.all([
      fetchCommercialDuplicateRows('commercial_companies', 'id, company_name', scope.organisationId),
      fetchCommercialDuplicateRows('commercial_contacts', 'id, company_id, first_name, last_name, email, phone, mobile', scope.organisationId),
    ])
    const companyIdByName = mapCommercialCompaniesByName(companies)
    importRows.forEach((entry) => {
      const payload = entry.payload
      const email = normalizeLower(payload.email)
      const phone = normalizeDuplicatePhone(payload.mobile || payload.phone)
      const companyId = companyIdByName.get(normalizeDuplicateText(payload.company_name))
      const fullName = normalizeDuplicateText(`${payload.first_name || ''} ${payload.last_name || ''}`)
      const match = contacts.find((contact) => {
        const contactPhone = normalizeDuplicatePhone(contact.mobile || contact.phone)
        const contactName = normalizeDuplicateText(`${contact.first_name || ''} ${contact.last_name || ''}`)
        return (
          (email && email === normalizeLower(contact.email)) ||
          (phone && phone === contactPhone) ||
          (companyId && contact.company_id === companyId && fullName && fullName === contactName)
        )
      })
      if (match) setMatch(entry, createExistingDuplicateMatch('commercial_contacts', match.id, 'contact email, phone, or company/name combination already exists', `${match.first_name || ''} ${match.last_name || ''}`.trim()))
    })
    return { matchesByRowNumber }
  }

  if (type === 'landlords') {
    const landlords = await fetchCommercialDuplicateRows('commercial_landlords', 'id, name, email, phone', scope.organisationId)
    importRows.forEach((entry) => {
      const payload = entry.payload
      const name = normalizeDuplicateText(payload.name || payload.landlord_name || payload.legal_name)
      const email = normalizeLower(payload.email)
      const phone = normalizeDuplicatePhone(payload.phone)
      const match = landlords.find((landlord) => (
        (email && email === normalizeLower(landlord.email)) ||
        (phone && phone === normalizeDuplicatePhone(landlord.phone)) ||
        (name && name === normalizeDuplicateText(landlord.name))
      ))
      if (match) setMatch(entry, createExistingDuplicateMatch('commercial_landlords', match.id, 'landlord name, email, or phone already exists', match.name))
    })
    return { matchesByRowNumber }
  }

  if (type === 'properties') {
    const properties = await fetchCommercialDuplicateRows('commercial_properties', 'id, property_name, address', scope.organisationId)
    importRows.forEach((entry) => {
      const payload = entry.payload
      const name = normalizeDuplicateText(payload.property_name)
      const address = normalizeDuplicateText(payload.address)
      const match = properties.find((property) => {
        const sameName = name && name === normalizeDuplicateText(property.property_name)
        if (!sameName) return false
        return !address || address === normalizeDuplicateText(property.address)
      })
      if (match) setMatch(entry, createExistingDuplicateMatch('commercial_properties', match.id, 'property name and address already exist', match.property_name))
    })
    return { matchesByRowNumber }
  }

  if (type === 'listings') {
    const [properties, listings] = await Promise.all([
      fetchCommercialDuplicateRows('commercial_properties', 'id, property_name', scope.organisationId),
      fetchCommercialDuplicateRows('commercial_listings', 'id, title, property_id', scope.organisationId),
    ])
    const propertyIdByName = mapCommercialPropertiesByName(properties)
    importRows.forEach((entry) => {
      const payload = entry.payload
      const title = normalizeDuplicateText(payload.title)
      const propertyId = propertyIdByName.get(normalizeDuplicateText(payload.property_name))
      const match = listings.find((listing) => {
        const sameTitle = title && title === normalizeDuplicateText(listing.title)
        if (!sameTitle) return false
        return !propertyId || listing.property_id === propertyId
      })
      if (match) setMatch(entry, createExistingDuplicateMatch('commercial_listings', match.id, 'listing title and property already exist', match.title))
    })
    return { matchesByRowNumber }
  }

  if (type === 'vacancies') {
    const [properties, vacancies] = await Promise.all([
      fetchCommercialDuplicateRows('commercial_properties', 'id, property_name', scope.organisationId),
      fetchCommercialDuplicateRows('commercial_vacancies', 'id, vacancy_name, property_id, unit_or_floor', scope.organisationId),
    ])
    const propertyIdByName = mapCommercialPropertiesByName(properties)
    importRows.forEach((entry) => {
      const payload = entry.payload
      const vacancyName = normalizeDuplicateText(payload.vacancy_name)
      const unitOrFloor = normalizeDuplicateText(payload.unit_or_floor)
      const propertyId = propertyIdByName.get(normalizeDuplicateText(payload.property_name))
      const match = vacancies.find((vacancy) => {
        const sameVacancy = vacancyName && vacancyName === normalizeDuplicateText(vacancy.vacancy_name)
        const sameUnit = unitOrFloor && unitOrFloor === normalizeDuplicateText(vacancy.unit_or_floor)
        if (propertyId) return vacancy.property_id === propertyId && (sameVacancy || sameUnit)
        return sameVacancy && (!unitOrFloor || sameUnit)
      })
      if (match) setMatch(entry, createExistingDuplicateMatch('commercial_vacancies', match.id, 'vacancy name/unit and property already exist', match.vacancy_name))
    })
    return { matchesByRowNumber }
  }

  if (type === 'leads' || type === 'requirements') {
    const requirements = await fetchCommercialDuplicateRows('commercial_requirements', 'id, requirement_name, client_type', scope.organisationId)
    importRows.forEach((entry) => {
      const payload = entry.payload
      const name = normalizeDuplicateText(payload.requirement_name)
      const clientType = normalizeDuplicateText(payload.client_type || payload.lead_type)
      const match = requirements.find((requirement) => {
        const sameName = name && name === normalizeDuplicateText(requirement.requirement_name)
        if (!sameName) return false
        return !clientType || clientType === normalizeDuplicateText(requirement.client_type)
      })
      if (match) setMatch(entry, createExistingDuplicateMatch('commercial_requirements', match.id, 'requirement name and client type already exist', match.requirement_name))
    })
    return { matchesByRowNumber }
  }

  if (type === 'canvassing_landlord_prospects' || type === 'canvassing_tenant_prospects') {
    const prospects = await fetchCommercialDuplicateRows('commercial_canvassing_prospects', 'id, company_name, email, phone, prospect_role', scope.organisationId)
    const expectedRole = type === 'canvassing_landlord_prospects' ? 'landlord' : 'tenant'
    importRows.forEach((entry) => {
      const payload = entry.payload
      const companyName = normalizeDuplicateText(payload.company_name)
      const email = normalizeLower(payload.email)
      const phone = normalizeDuplicatePhone(payload.phone)
      const match = prospects.find((prospect) => {
        const sameRole = normalizeDuplicateText(prospect.prospect_role) === expectedRole
        return (
          ((email && email === normalizeLower(prospect.email)) ||
          (phone && phone === normalizeDuplicatePhone(prospect.phone)) ||
          (companyName && companyName === normalizeDuplicateText(prospect.company_name))) &&
          sameRole
        )
      })
      if (match) setMatch(entry, createExistingDuplicateMatch('commercial_canvassing_prospects', match.id, 'prospect company, email, or phone already exists', match.company_name))
    })
  }

  return { matchesByRowNumber }
}

export async function createCommercialImportBatch(payload = {}) {
  const scope = await resolveImportScope(payload.organisationId || payload.organisation_id)
  const userId = await getCurrentUserId()
  const row = batchPayloadToRow(payload, scope, userId)

  const query = await supabase
    .from(IMPORT_BATCHES_TABLE)
    .insert(row)
    .select(IMPORT_BATCH_SELECT)
    .single()

  if (query.error) {
    if (isMissingCommercialImportSchemaError(query.error)) throw createMissingImportSchemaError(query.error)
    throw query.error
  }
  return mapImportBatchRow(query.data)
}

export async function listCommercialImportBatches(organisationId = '', options = {}) {
  const scope = await resolveImportScope(organisationId)
  let query = supabase
    .from(IMPORT_BATCHES_TABLE)
    .select(IMPORT_BATCH_SELECT)
    .eq('organisation_id', scope.organisationId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(200, normalizeInteger(options.limit, 50))))

  const status = normalizeBatchStatus(options.status, '')
  const recordType = options.recordType || options.record_type ? normalizeRecordType(options.recordType || options.record_type) : ''
  if (status) query = query.eq('status', status)
  if (recordType) query = query.eq('record_type', recordType)

  const result = await query
  if (result.error) {
    if (isMissingCommercialImportSchemaError(result.error)) return []
    throw result.error
  }
  return (result.data || []).map(mapImportBatchRow)
}

export async function getCommercialImportBatch(batchId = '') {
  const id = normalizeText(batchId)
  if (!id) throw new Error('A commercial import batch id is required.')
  await resolveImportScope()

  const [batchResult, rowsResult] = await Promise.all([
    supabase
      .from(IMPORT_BATCHES_TABLE)
      .select(IMPORT_BATCH_SELECT)
      .eq('id', id)
      .single(),
    supabase
      .from(IMPORT_ROWS_TABLE)
      .select(IMPORT_ROW_SELECT)
      .eq('batch_id', id)
      .order('row_number', { ascending: true }),
  ])

  if (batchResult.error) {
    if (isMissingCommercialImportSchemaError(batchResult.error)) throw createMissingImportSchemaError(batchResult.error)
    throw batchResult.error
  }
  if (rowsResult.error) {
    if (isMissingCommercialImportSchemaError(rowsResult.error)) throw createMissingImportSchemaError(rowsResult.error)
    throw rowsResult.error
  }

  return {
    batch: mapImportBatchRow(batchResult.data),
    rows: (rowsResult.data || []).map(mapImportRow),
  }
}

export async function updateCommercialImportBatch(batchId = '', patch = {}) {
  const id = normalizeText(batchId)
  if (!id) throw new Error('A commercial import batch id is required.')
  await resolveImportScope()
  const userId = await getCurrentUserId()
  const row = batchPatchToRow(patch, userId)

  const query = await supabase
    .from(IMPORT_BATCHES_TABLE)
    .update(row)
    .eq('id', id)
    .select(IMPORT_BATCH_SELECT)
    .single()

  if (query.error) {
    if (isMissingCommercialImportSchemaError(query.error)) throw createMissingImportSchemaError(query.error)
    throw query.error
  }
  return mapImportBatchRow(query.data)
}

export async function createCommercialImportRows(batchId = '', rows = []) {
  const id = normalizeText(batchId)
  if (!id) throw new Error('A commercial import batch id is required.')
  if (!Array.isArray(rows) || !rows.length) return []
  await resolveImportScope()
  const userId = await getCurrentUserId()

  const batchResult = await supabase
    .from(IMPORT_BATCHES_TABLE)
    .select('id, organisation_id, branch_id, team_id, broker_id')
    .eq('id', id)
    .single()

  if (batchResult.error) {
    if (isMissingCommercialImportSchemaError(batchResult.error)) throw createMissingImportSchemaError(batchResult.error)
    throw batchResult.error
  }

  const insertRows = rows.map((row, index) => rowPayloadToRow(batchResult.data, {
    ...row,
    rowNumber: row.rowNumber || row.row_number || index + 1,
  }, userId))

  const query = await supabase
    .from(IMPORT_ROWS_TABLE)
    .insert(insertRows)
    .select(IMPORT_ROW_SELECT)

  if (query.error) {
    if (isMissingCommercialImportSchemaError(query.error)) throw createMissingImportSchemaError(query.error)
    throw query.error
  }
  return (query.data || []).map(mapImportRow)
}

export async function updateCommercialImportRow(rowId = '', patch = {}) {
  const id = normalizeText(rowId)
  if (!id) throw new Error('A commercial import row id is required.')
  await resolveImportScope()
  const userId = await getCurrentUserId()

  const query = await supabase
    .from(IMPORT_ROWS_TABLE)
    .update(rowPatchToRow(patch, userId))
    .eq('id', id)
    .select(IMPORT_ROW_SELECT)
    .single()

  if (query.error) {
    if (isMissingCommercialImportSchemaError(query.error)) throw createMissingImportSchemaError(query.error)
    throw query.error
  }
  return mapImportRow(query.data)
}

export async function approveCommercialImportBatch(batchId = '') {
  const id = normalizeText(batchId)
  if (!id) throw new Error('A commercial import batch id is required.')
  const userId = await getCurrentUserId()
  return updateCommercialImportBatch(id, {
    status: 'approved',
    approvedBy: userId,
    approvedAt: new Date().toISOString(),
  })
}

export async function prepareCommercialImportRetry(batchId = '', options = {}) {
  const id = normalizeText(batchId)
  if (!id) throw new Error('A commercial import batch id is required.')
  await resolveImportScope()
  const userId = await getCurrentUserId()

  const [batchResult, rowsResult] = await Promise.all([
    supabase
      .from(IMPORT_BATCHES_TABLE)
      .select(IMPORT_BATCH_SELECT)
      .eq('id', id)
      .single(),
    supabase
      .from(IMPORT_ROWS_TABLE)
      .select(IMPORT_ROW_SELECT)
      .eq('batch_id', id)
      .in('status', options.includeSkipped ? ['failed', 'skipped'] : ['failed'])
      .order('row_number', { ascending: true }),
  ])

  if (batchResult.error) {
    if (isMissingCommercialImportSchemaError(batchResult.error)) throw createMissingImportSchemaError(batchResult.error)
    throw batchResult.error
  }
  if (rowsResult.error) {
    if (isMissingCommercialImportSchemaError(rowsResult.error)) throw createMissingImportSchemaError(rowsResult.error)
    throw rowsResult.error
  }

  const rows = rowsResult.data || []
  if (!rows.length) return { batch: mapImportBatchRow(batchResult.data), resetCount: 0 }

  const resetRows = rows.map((row) => updateCommercialImportRow(row.id, {
    status: row.validation_warnings?.length ? 'warning' : 'ready',
    action: 'create',
    targetTable: '',
    targetRecordId: null,
    errorMessage: '',
    processedAt: null,
    metadata: {
      ...(row.metadata_json || {}),
      retryPreparedAt: new Date().toISOString(),
      retryPreparedBy: userId || null,
      retrySourceStatus: row.status,
    },
  }))
  await Promise.all(resetRows)

  const batch = batchResult.data || {}
  const nextStatus = batch.requires_manager_approval ? 'approved' : 'ready'
  const updatedBatch = await updateCommercialImportBatch(id, {
    status: nextStatus,
    failedCount: 0,
    importSummary: {
      ...(batch.import_summary || {}),
      phase: 'phase_8_recovery',
      retryPreparedAt: new Date().toISOString(),
      retryPreparedBy: userId || null,
      retryResetCount: rows.length,
    },
  })

  return { batch: updatedBatch, resetCount: rows.length }
}

export async function commitCommercialImportBatch(batchId = '') {
  const id = normalizeText(batchId)
  if (!id) throw new Error('A commercial import batch id is required.')
  await resolveImportScope()
  const userId = await getCurrentUserId()

  const [batchResult, rowsResult] = await Promise.all([
    supabase
      .from(IMPORT_BATCHES_TABLE)
      .select(IMPORT_BATCH_SELECT)
      .eq('id', id)
      .single(),
    supabase
      .from(IMPORT_ROWS_TABLE)
      .select(IMPORT_ROW_SELECT)
      .eq('batch_id', id)
      .order('row_number', { ascending: true }),
  ])

  if (batchResult.error) {
    if (isMissingCommercialImportSchemaError(batchResult.error)) throw createMissingImportSchemaError(batchResult.error)
    throw batchResult.error
  }
  if (rowsResult.error) {
    if (isMissingCommercialImportSchemaError(rowsResult.error)) throw createMissingImportSchemaError(rowsResult.error)
    throw rowsResult.error
  }

  const batch = batchResult.data || {}
  const recordType = normalizeRecordType(batch.record_type)
  const targetTable = IMPORT_TARGET_TABLES[recordType]
  if (!targetTable) throw new Error(`Committing ${recordType} imports is not enabled yet.`)
  if (batch.requires_manager_approval && !['approved', 'ready'].includes(normalizeLower(batch.status))) {
    throw new Error('Approve this import batch before committing records.')
  }

  await updateCommercialImportBatch(id, { status: 'committing', committedBy: userId })

  const rows = rowsResult.data || []
  const seenDuplicateKeys = new Set()
  const summary = {
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    reviewCount: 0,
    relationshipsResolvedCount: 0,
  }
  const resolution = createResolutionContext()

  for (const row of rows) {
    const currentStatus = normalizeLower(row.status)
    if (['created', 'updated', 'skipped'].includes(currentStatus)) {
      if (currentStatus === 'created') summary.createdCount += 1
      if (currentStatus === 'updated') summary.updatedCount += 1
      if (currentStatus === 'skipped') summary.skippedCount += 1
      continue
    }

    const decision = shouldCommitImportRow(row, normalizeDuplicateStrategy(batch.duplicate_strategy), seenDuplicateKeys)
    if (!decision.commit) {
      if (decision.status === 'skipped') summary.skippedCount += 1
      else summary.reviewCount += 1
      await updateCommercialImportRow(row.id, {
        status: decision.status,
        action: decision.action,
        errorMessage: decision.message,
        processedAt: decision.status === 'skipped' ? new Date().toISOString() : null,
      })
      continue
    }

    try {
      const targetPayload = await buildImportTargetPayload(batch, row, userId, resolution)
      const isUpdate = decision.operation === 'update'
      const mutation = isUpdate
        ? await supabase
            .from(targetTable)
            .update(getImportUpdatePayload(targetPayload))
            .eq('organisation_id', batch.organisation_id)
            .eq('id', decision.targetRecordId)
            .select('id')
            .single()
        : await supabase
            .from(targetTable)
            .insert(targetPayload)
            .select('id')
            .single()

      if (mutation.error) throw mutation.error

      if (isUpdate) summary.updatedCount += 1
      else summary.createdCount += 1
      if (targetPayload.property_id || targetPayload.landlord_id || targetPayload.company_id || targetPayload.contact_id) {
        summary.relationshipsResolvedCount += 1
      }
      await updateCommercialImportRow(row.id, {
        status: isUpdate ? 'updated' : 'created',
        action: isUpdate ? 'update' : 'create',
        targetTable,
        targetRecordId: mutation.data?.id,
        normalizedPayload: {
          ...getRowNormalizedPayload(row),
          property_id: targetPayload.property_id || undefined,
          landlord_id: targetPayload.landlord_id || undefined,
          company_id: targetPayload.company_id || undefined,
          contact_id: targetPayload.contact_id || undefined,
        },
        errorMessage: '',
        processedAt: new Date().toISOString(),
      })
    } catch (commitError) {
      summary.failedCount += 1
      await updateCommercialImportRow(row.id, {
        status: 'failed',
        action: decision.action || 'create',
        targetTable,
        errorMessage: commitError?.message || 'Row could not be committed.',
        processedAt: new Date().toISOString(),
      })
    }
  }

  const status = summary.failedCount && !summary.createdCount && !summary.updatedCount ? 'failed' : 'committed'
  const updatedBatch = await updateCommercialImportBatch(id, {
    status,
    committedBy: userId,
    committedAt: new Date().toISOString(),
    createdCount: summary.createdCount,
    updatedCount: summary.updatedCount,
    skippedCount: summary.skippedCount,
    failedCount: summary.failedCount,
    importSummary: {
      ...(batch.import_summary || {}),
      phase: 'phase_7_relationship_resolution',
      committedAt: new Date().toISOString(),
      targetTable,
      createdCount: summary.createdCount,
      updatedCount: summary.updatedCount,
      skippedCount: summary.skippedCount,
      failedCount: summary.failedCount,
      reviewCount: summary.reviewCount,
      relationshipsResolvedCount: summary.relationshipsResolvedCount,
    },
  })

  return { batch: updatedBatch, summary }
}
