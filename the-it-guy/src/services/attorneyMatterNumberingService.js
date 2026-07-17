import {
  getAuthenticatedUser,
  isMissingTableError,
  normalizeText,
  requireClient,
} from './attorneyFirmServiceShared.js'

export const ATTORNEY_MATTER_NUMBER_LANES = Object.freeze(['transfer', 'bond', 'cancellation'])

export const DEFAULT_ATTORNEY_MATTER_NUMBER_SETTING = Object.freeze({
  lane: 'all',
  prefix: 'MAT',
  suffix: '',
  separator: '-',
  includeYear: true,
  yearFormat: 'YYYY',
  sequencePadding: 6,
  resetFrequency: 'annual',
  enabled: true,
})

function mapSettingRow(row = {}) {
  return {
    id: row.id || null,
    firmId: row.attorney_firm_id || null,
    lane: normalizeText(row.lane).toLowerCase() || 'all',
    prefix: row.prefix ?? 'MAT',
    suffix: row.suffix ?? '',
    separator: row.separator ?? '-',
    includeYear: row.include_year !== false,
    yearFormat: row.year_format || 'YYYY',
    sequencePadding: Number(row.sequence_padding || 6),
    resetFrequency: row.reset_frequency || 'annual',
    enabled: row.enabled !== false,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function mapSequenceRow(row = {}) {
  return {
    firmId: row.attorney_firm_id || null,
    lane: row.lane || 'all',
    sequenceYear: Number(row.sequence_year || 0),
    lastValue: Number(row.last_value || 0),
  }
}

function mapHistoryRow(row = {}) {
  return {
    id: row.id,
    settingId: row.setting_id || null,
    firmId: row.attorney_firm_id,
    lane: row.lane,
    changeType: row.change_type,
    previousSettings: row.previous_settings || null,
    newSettings: row.new_settings || null,
    changedBy: row.changed_by || null,
    changedAt: row.changed_at || null,
  }
}

function firstRpcRow(data) {
  if (Array.isArray(data)) return data[0] || null
  return data || null
}

function mapMatterFileRow(row = {}) {
  return {
    id: row.id || row.attorney_matter_file_id || null,
    transactionId: row.transaction_id || null,
    firmId: row.attorney_firm_id || null,
    lane: row.lane || null,
    platformReference: row.platform_reference || null,
    provisionalReference: row.provisional_reference || null,
    filingReference: row.filing_reference || null,
    effectiveReference:
      row.effective_reference ||
      row.filing_reference ||
      row.provisional_reference ||
      row.platform_reference ||
      null,
    referenceStatus: row.reference_status || 'provisional',
    confirmedAt: row.confirmed_at || null,
    confirmedBy: row.confirmed_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function mapMatterReferenceHistoryRow(row = {}) {
  return {
    id: row.id,
    matterFileId: row.attorney_matter_file_id,
    previousReference: row.previous_reference || null,
    newReference: row.new_reference || null,
    changeType: row.change_type || 'changed',
    changeReason: row.change_reason || null,
    changedBy: row.changed_by || null,
    changedAt: row.changed_at || null,
  }
}

function mapMatterReferenceIndexRow(row = {}) {
  return {
    matterFileId: row.attorney_matter_file_id || null,
    transactionId: row.transaction_id || null,
    lane: row.lane || 'transfer',
    platformReference: row.platform_reference || null,
    provisionalReference: row.provisional_reference || null,
    filingReference: row.filing_reference || null,
    effectiveReference: row.effective_reference || row.filing_reference || row.provisional_reference || row.platform_reference || null,
    referenceStatus: row.reference_status || 'provisional',
    referenceAliases: [...new Set((row.reference_aliases || []).map(normalizeText).filter(Boolean))],
    updatedAt: row.updated_at || null,
  }
}

function countValue(value) {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? count : 0
}

export function mapAttorneyMatterNumberingReadiness(row = {}) {
  const status = normalizeText(row.status).toUpperCase() || 'UNKNOWN'
  return {
    firmId: row.firmId || row.firm_id || null,
    assessedAt: row.assessedAt || row.assessed_at || null,
    status,
    releaseReady: row.releaseReady === true || row.release_ready === true,
    strictReleaseReady: row.strictReleaseReady === true || row.strict_release_ready === true,
    coveragePercent: countValue(row.coveragePercent ?? row.coverage_percent),
    expectedFileCount: countValue(row.expectedFileCount ?? row.expected_file_count),
    coveredFileCount: countValue(row.coveredFileCount ?? row.covered_file_count),
    missingFileCount: countValue(row.missingFileCount ?? row.missing_file_count),
    confirmedFileCount: countValue(row.confirmedFileCount ?? row.confirmed_file_count),
    provisionalFileCount: countValue(row.provisionalFileCount ?? row.provisional_file_count),
    unresolvedPlatformReferenceCount: countValue(row.unresolvedPlatformReferenceCount ?? row.unresolved_platform_reference_count),
    duplicateReferenceGroupCount: countValue(row.duplicateReferenceGroupCount ?? row.duplicate_reference_group_count),
    invalidReferenceStateCount: countValue(row.invalidReferenceStateCount ?? row.invalid_reference_state_count),
    historyGapCount: countValue(row.historyGapCount ?? row.history_gap_count),
    orphanFileCount: countValue(row.orphanFileCount ?? row.orphan_file_count),
    issueCodes: Array.isArray(row.issueCodes || row.issue_codes) ? (row.issueCodes || row.issue_codes) : [],
  }
}

export function mapAttorneyMatterNumberingLaunchMetrics(row = {}) {
  const activity = row.activity || {}
  return {
    status: normalizeText(row.status).toUpperCase() || 'UNKNOWN',
    checkedAt: row.checkedAt || row.checked_at || null,
    windowHours: countValue(row.windowHours ?? row.window_hours),
    windowStartedAt: row.windowStartedAt || row.window_started_at || null,
    mutatedData: row.mutatedData === true || row.mutated_data === true,
    readiness: mapAttorneyMatterNumberingReadiness(row.readiness || {}),
    activity: {
      filesOpened: countValue(activity.filesOpened ?? activity.files_opened),
      referencesGenerated: countValue(activity.referencesGenerated ?? activity.references_generated),
      referencesConfirmed: countValue(activity.referencesConfirmed ?? activity.references_confirmed),
      referencesChanged: countValue(activity.referencesChanged ?? activity.references_changed),
      referencesCleared: countValue(activity.referencesCleared ?? activity.references_cleared),
      referencesBackfilled: countValue(activity.referencesBackfilled ?? activity.references_backfilled),
      distinctActors: countValue(activity.distinctActors ?? activity.distinct_actors),
      settingChanges: countValue(activity.settingChanges ?? activity.setting_changes),
    },
  }
}

function assertMatterLane(lane) {
  const normalizedLane = normalizeText(lane).toLowerCase()
  if (!ATTORNEY_MATTER_NUMBER_LANES.includes(normalizedLane)) {
    throw new Error('Matter lane must be transfer, bond, or cancellation.')
  }
  return normalizedLane
}

export function validateAttorneyMatterFilingReference(value) {
  const reference = normalizeText(value)
  if (!reference) return 'A filing reference is required.'
  if (reference.length > 160) return 'The filing reference cannot exceed 160 characters.'
  return ''
}

export async function resolveAttorneyMatterReference({ transactionId, firmId, lane = 'transfer' } = {}) {
  if (!transactionId) throw new Error('Transaction is required.')
  if (!firmId) throw new Error('Attorney firm is required.')
  const client = requireClient()
  const result = await client.rpc('resolve_attorney_matter_reference', {
    p_transaction_id: transactionId,
    p_attorney_firm_id: firmId,
    p_lane: assertMatterLane(lane),
  })
  if (result.error) throw result.error
  return mapMatterFileRow(firstRpcRow(result.data) || {})
}

export async function ensureAttorneyMatterFile({ transactionId, firmId, lane = 'transfer' } = {}) {
  if (!transactionId) throw new Error('Transaction is required.')
  if (!firmId) throw new Error('Attorney firm is required.')
  const client = requireClient()
  await getAuthenticatedUser(client)
  const result = await client.rpc('ensure_attorney_matter_file', {
    p_transaction_id: transactionId,
    p_attorney_firm_id: firmId,
    p_lane: assertMatterLane(lane),
  })
  if (result.error) throw result.error
  const matterFile = mapMatterFileRow(firstRpcRow(result.data) || {})
  const resolved = await resolveAttorneyMatterReference({ transactionId, firmId, lane })
  return { ...matterFile, ...resolved, id: matterFile.id || resolved.id }
}

export async function listAttorneyMatterReferenceHistory(matterFileId, limit = 20) {
  if (!matterFileId) return []
  const client = requireClient()
  const result = await client
    .from('attorney_matter_reference_history')
    .select('id, attorney_matter_file_id, previous_reference, new_reference, change_type, change_reason, changed_by, changed_at')
    .eq('attorney_matter_file_id', matterFileId)
    .order('changed_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, Number(limit) || 20)))
  if (result.error) throw result.error
  return (result.data || []).map(mapMatterReferenceHistoryRow)
}

export async function checkAttorneyMatterReferenceAvailability({ firmId, reference, excludeMatterFileId = null } = {}) {
  if (!firmId) throw new Error('Attorney firm is required.')
  const validationError = validateAttorneyMatterFilingReference(reference)
  if (validationError) return { available: false, error: validationError }
  const client = requireClient()
  const result = await client.rpc('attorney_matter_reference_is_available', {
    p_attorney_firm_id: firmId,
    p_reference: normalizeText(reference),
    p_exclude_matter_file_id: excludeMatterFileId || null,
  })
  if (result.error) throw result.error
  return { available: Boolean(result.data), error: '' }
}

export async function setAttorneyMatterFilingReference({ matterFileId, reference, changeReason = '' } = {}) {
  if (!matterFileId) throw new Error('Attorney matter file is required.')
  const validationError = validateAttorneyMatterFilingReference(reference)
  if (validationError) throw new Error(validationError)
  const client = requireClient()
  await getAuthenticatedUser(client)
  const result = await client.rpc('set_attorney_matter_filing_reference', {
    p_attorney_matter_file_id: matterFileId,
    p_filing_reference: normalizeText(reference),
    p_change_reason: normalizeText(changeReason) || null,
  })
  if (result.error) throw result.error
  return mapMatterFileRow(firstRpcRow(result.data) || {})
}

export async function getAttorneyMatterReferenceIndex(firmId, transactionIds = null) {
  if (!firmId) throw new Error('Attorney firm is required.')
  const scopedTransactionIds = [...new Set((transactionIds || []).map(normalizeText).filter(Boolean))]
  if (Array.isArray(transactionIds) && !scopedTransactionIds.length) return []
  const client = requireClient()
  const result = await client.rpc('get_attorney_matter_reference_index', {
    p_attorney_firm_id: firmId,
    p_transaction_ids: scopedTransactionIds.length ? scopedTransactionIds : null,
  })
  if (result.error) throw result.error
  return (result.data || []).map(mapMatterReferenceIndexRow)
}

export async function getAttorneyMatterNumberingReadiness(firmId) {
  if (!firmId) throw new Error('Attorney firm is required.')
  const client = requireClient()
  const result = await client.rpc('get_attorney_matter_numbering_readiness', {
    p_attorney_firm_id: firmId,
  })
  if (result.error) throw result.error
  return mapAttorneyMatterNumberingReadiness(firstRpcRow(result.data) || {})
}

export async function getAttorneyMatterNumberingLaunchMetrics(firmId, windowHours = 24) {
  if (!firmId) throw new Error('Attorney firm is required.')
  const requestedWindow = Number(windowHours)
  if (!Number.isInteger(requestedWindow) || requestedWindow < 1 || requestedWindow > 168) {
    throw new Error('Launch telemetry window must be between 1 and 168 hours.')
  }
  const client = requireClient()
  const result = await client.rpc('get_attorney_matter_numbering_launch_metrics', {
    p_attorney_firm_id: firmId,
    p_window_hours: requestedWindow,
  })
  if (result.error) throw result.error
  return mapAttorneyMatterNumberingLaunchMetrics(firstRpcRow(result.data) || {})
}

export function buildAttorneyMatterDocumentReferenceContext(reference = {}) {
  const effectiveReference = normalizeText(reference.effectiveReference || reference.filingReference || reference.provisionalReference)
  const platformReference = normalizeText(reference.platformReference)
  return {
    matterReference: effectiveReference || platformReference,
    matter_reference: effectiveReference || platformReference,
    transactionReference: platformReference || effectiveReference,
    transaction_reference: platformReference || effectiveReference,
    platformReference,
    platform_reference: platformReference,
    matterReferenceStatus: reference.referenceStatus || 'provisional',
    matter_reference_status: reference.referenceStatus || 'provisional',
    matterLane: reference.lane || 'transfer',
    matter_lane: reference.lane || 'transfer',
  }
}

export function buildAttorneyMatterReferenceSearchText(reference = {}) {
  return [
    reference.effectiveReference,
    reference.filingReference,
    reference.provisionalReference,
    reference.platformReference,
    ...(reference.referenceAliases || []),
  ].map((value) => normalizeText(value).toLowerCase()).filter(Boolean).join(' ')
}

export function attorneyMatterReferenceMatchesQuery(reference = {}, query = '') {
  const searchTerm = normalizeText(query).toLowerCase()
  return !searchTerm || buildAttorneyMatterReferenceSearchText(reference).includes(searchTerm)
}

export function buildAttorneyMatterNumberingDraft(rows = []) {
  const byLane = new Map((rows || []).map((row) => {
    const setting = mapSettingRow(row)
    return [setting.lane, setting]
  }))
  const firmDefault = {
    ...DEFAULT_ATTORNEY_MATTER_NUMBER_SETTING,
    ...(byLane.get('all') || {}),
    lane: 'all',
    useFirmDefault: false,
  }

  return ATTORNEY_MATTER_NUMBER_LANES.reduce((draft, lane) => {
    const override = byLane.get(lane)
    draft[lane] = {
      ...firmDefault,
      ...(override || {}),
      lane,
      useFirmDefault: !override,
    }
    return draft
  }, { all: firmDefault })
}

export function validateAttorneyMatterNumberSetting(setting = {}) {
  const errors = []
  const prefix = normalizeText(setting.prefix)
  const suffix = normalizeText(setting.suffix)
  const separator = String(setting.separator ?? '')
  const padding = Number(setting.sequencePadding)

  if (!prefix) errors.push('Prefix is required.')
  if (prefix.length > 32) errors.push('Prefix cannot exceed 32 characters.')
  if (suffix.length > 32) errors.push('Suffix cannot exceed 32 characters.')
  if (separator.length > 5) errors.push('Separator cannot exceed 5 characters.')
  if (!Number.isInteger(padding) || padding < 1 || padding > 12) errors.push('Sequence padding must be between 1 and 12.')
  if (!['YYYY', 'YY'].includes(setting.yearFormat)) errors.push('Year format must be YYYY or YY.')
  if (!['annual', 'continuous'].includes(setting.resetFrequency)) errors.push('Reset frequency must be annual or continuous.')
  return errors
}

export function formatAttorneyMatterNumberPreview(setting = {}, sequenceValue = 1, referenceDate = new Date()) {
  if (setting.enabled === false) return ''
  const padding = Math.max(1, Math.min(12, Number(setting.sequencePadding) || 6))
  const rawSequence = String(Math.max(1, Number(sequenceValue) || 1))
  const sequence = rawSequence.length < padding ? rawSequence.padStart(padding, '0') : rawSequence
  const year = setting.includeYear === false
    ? ''
    : setting.yearFormat === 'YY'
      ? String(referenceDate.getFullYear()).slice(-2)
      : String(referenceDate.getFullYear())
  return [normalizeText(setting.prefix), year, sequence, normalizeText(setting.suffix)]
    .filter(Boolean)
    .join(String(setting.separator ?? '-'))
}

export function getNextAttorneyMatterSequence(sequences = [], setting = {}, referenceDate = new Date()) {
  const sequenceYear = setting.resetFrequency === 'continuous' ? 0 : referenceDate.getFullYear()
  const row = (sequences || []).find((sequence) =>
    sequence.lane === setting.lane && Number(sequence.sequenceYear) === sequenceYear,
  )
  return Number(row?.lastValue || 0) + 1
}

export function buildAttorneyMatterNumberSettingsPayload(draft = {}) {
  const settings = [draft.all, ...ATTORNEY_MATTER_NUMBER_LANES
    .filter((lane) => draft[lane] && !draft[lane].useFirmDefault)
    .map((lane) => draft[lane])]

  return settings.map((setting) => ({
    lane: setting.lane,
    prefix: normalizeText(setting.prefix),
    suffix: normalizeText(setting.suffix) || null,
    separator: String(setting.separator ?? '-'),
    include_year: setting.includeYear !== false,
    year_format: setting.yearFormat,
    sequence_padding: Number(setting.sequencePadding),
    reset_frequency: setting.resetFrequency,
    enabled: setting.enabled !== false,
  }))
}

export async function getAttorneyMatterNumberingSettings(firmId) {
  if (!firmId) throw new Error('Attorney firm is required.')
  const client = requireClient()
  const [settingsResult, sequencesResult, historyResult] = await Promise.all([
    client
      .from('attorney_matter_number_settings')
      .select('*')
      .eq('attorney_firm_id', firmId)
      .order('lane'),
    client
      .from('attorney_matter_reference_sequences')
      .select('attorney_firm_id, lane, sequence_year, last_value')
      .eq('attorney_firm_id', firmId),
    client
      .from('attorney_matter_number_setting_history')
      .select('id, setting_id, attorney_firm_id, lane, change_type, previous_settings, new_settings, changed_by, changed_at')
      .eq('attorney_firm_id', firmId)
      .order('changed_at', { ascending: false })
      .limit(8),
  ])

  if (settingsResult.error) throw settingsResult.error
  if (sequencesResult.error) throw sequencesResult.error
  if (historyResult.error && !isMissingTableError(historyResult.error, 'attorney_matter_number_setting_history')) {
    throw historyResult.error
  }

  return {
    settings: (settingsResult.data || []).map(mapSettingRow),
    sequences: (sequencesResult.data || []).map(mapSequenceRow),
    history: (historyResult.data || []).map(mapHistoryRow),
  }
}

export async function saveAttorneyMatterNumberingSettings(firmId, draft) {
  if (!firmId) throw new Error('Attorney firm is required.')
  const settings = [draft.all, ...ATTORNEY_MATTER_NUMBER_LANES
    .filter((lane) => draft[lane] && !draft[lane].useFirmDefault)
    .map((lane) => draft[lane])]
  const errors = settings.flatMap((setting) =>
    validateAttorneyMatterNumberSetting(setting).map((message) => `${setting.lane === 'all' ? 'Firm default' : setting.lane}: ${message}`),
  )
  if (errors.length) throw new Error(errors[0])

  const client = requireClient()
  await getAuthenticatedUser(client)
  const result = await client.rpc('save_attorney_matter_number_settings', {
    p_attorney_firm_id: firmId,
    p_settings: buildAttorneyMatterNumberSettingsPayload(draft),
  })
  if (result.error) throw result.error
  return (result.data || []).map(mapSettingRow)
}
