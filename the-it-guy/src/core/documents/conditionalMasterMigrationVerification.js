import { evaluateConditionalMasterCoverage } from './conditionalMasterCoverageReadiness.js'

export const CONDITIONAL_MASTER_VERIFICATION_VERSION = 'conditional-master-verification-v1'

function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[\s./-]+/g, '_')
}

function metadata(value = {}) {
  if (value.metadata_json && typeof value.metadata_json === 'object') return value.metadata_json
  if (value.metadataJson && typeof value.metadataJson === 'object') return value.metadataJson
  return {}
}

function status(template = {}) {
  return key(template.status || template.template_status || metadata(template).template_status)
}

function isLive(template = {}) {
  return template.is_active !== false && ['published', 'active', 'approved', 'live'].includes(status(template))
}

function isConditionalMaster(template = {}) {
  const source = metadata(template)
  const hasVersion = text(source.conditional_master_version) !== ''
  const masterFlag = text(source.conditional_master).toLowerCase()
  return hasVersion && source.conditional_master !== false && masterFlag !== 'false'
}

function issue(code, message, details = {}) {
  return { code, message, details }
}

export function evaluateConditionalMasterMigrationVerification({
  packetType = '',
  templates = [],
  migrationRecord = null,
  verificationReceipt = null,
  now = Date.now(),
} = {}) {
  const normalizedPacketType = key(packetType) === 'otp' ? 'otp' : 'mandate'
  const rows = (Array.isArray(templates) ? templates : []).filter((template) => (
    key(template.packet_type || template.packetType) === normalizedPacketType
  ))
  const migration = migrationRecord && typeof migrationRecord === 'object' ? migrationRecord : null
  const migrationState = key(migration?.state)
  const candidate = rows.find((template) => template.id === migration?.candidate_template_id) || null
  const sourceMaster = rows.find((template) => template.id === migration?.source_master_template_id) || null
  const legacyIds = Array.isArray(migration?.legacy_template_ids) ? migration.legacy_template_ids : []
  const legacyTemplates = legacyIds.map((id) => rows.find((template) => template.id === id)).filter(Boolean)
  const coverage = candidate
    ? evaluateConditionalMasterCoverage({ packetType: normalizedPacketType, template: candidate })
    : null
  const issues = []

  if (!migration) issues.push(issue('VERIFICATION_MIGRATION_MISSING', 'No audited conditional-master migration exists for this document.'))
  if (migration && !['activated', 'completed'].includes(migrationState)) {
    issues.push(issue('VERIFICATION_MIGRATION_NOT_ACTIVE', 'Verification is available only after controlled activation.'))
  }
  if (migration && (!sourceMaster || sourceMaster.organisation_id || !isConditionalMaster(sourceMaster))) {
    issues.push(issue('VERIFICATION_SOURCE_MASTER_INVALID', 'The recorded global conditional master cannot be verified.'))
  }
  if (migration && !candidate) issues.push(issue('VERIFICATION_CANDIDATE_MISSING', 'The recorded organisation conditional master is missing.'))
  if (candidate && (!candidate.organisation_id || !isConditionalMaster(candidate))) {
    issues.push(issue('VERIFICATION_CANDIDATE_INVALID', 'The migration candidate is not an organisation-owned conditional master.'))
  }
  if (candidate && (!candidate.is_default || !isLive(candidate))) {
    issues.push(issue('VERIFICATION_CANDIDATE_NOT_LIVE_DEFAULT', 'The conditional master is not the live organisation default.'))
  }
  if (coverage && !coverage.ready) {
    issues.push(issue('VERIFICATION_COVERAGE_BLOCKED', 'The live conditional master no longer covers every supported legal scenario.', {
      issueCodes: coverage.issues.map((item) => item.code),
    }))
  }
  if (coverage && text(migration?.coverage_version) !== coverage.coverageVersion) {
    issues.push(issue('VERIFICATION_COVERAGE_VERSION_MISMATCH', 'The activated coverage version does not match the current verifier.'))
  }
  if (coverage && text(migration?.coverage_decision_hash) !== coverage.decisionHash) {
    issues.push(issue('VERIFICATION_COVERAGE_HASH_MISMATCH', 'The live conditional master differs from the coverage-certified activation candidate.'))
  }

  const rollbackUntil = Date.parse(migration?.rollback_until || '')
  if (migrationState === 'activated' && !Number.isFinite(rollbackUntil)) {
    issues.push(issue('VERIFICATION_ROLLBACK_DEADLINE_MISSING', 'The activated migration has no recorded rollback deadline.'))
  }
  if (migrationState === 'activated') {
    const archivedIds = legacyTemplates.filter((template) => status(template) === 'archived' || template.is_active === false).map((template) => template.id)
    if (archivedIds.length) issues.push(issue('VERIFICATION_LEGACY_ARCHIVED_EARLY', 'A recorded legacy template was archived before migration finalisation.', { archivedIds }))
  }
  if (migrationState === 'completed') {
    const activeIds = legacyTemplates.filter((template) => status(template) !== 'archived' || template.is_active !== false).map((template) => template.id)
    if (activeIds.length) issues.push(issue('VERIFICATION_LEGACY_STILL_ACTIVE', 'A recorded legacy template remains active after migration finalisation.', { activeIds }))
  }
  if (legacyTemplates.length !== legacyIds.length) {
    issues.push(issue('VERIFICATION_LEGACY_HISTORY_MISSING', 'One or more recorded legacy template revisions cannot be read.'))
  }

  const normalizedNow = Number.isFinite(Number(now)) ? Number(now) : Date.now()
  const receiptMatchesBoundary = Boolean(
    verificationReceipt?.verification_version === CONDITIONAL_MASTER_VERIFICATION_VERSION &&
    verificationReceipt?.coverage_version === coverage?.coverageVersion &&
    verificationReceipt?.candidate_template_id === candidate?.id &&
    verificationReceipt?.coverage_decision_hash === coverage?.decisionHash &&
    key(verificationReceipt?.migration_state) === migrationState &&
    (!migration?.id || verificationReceipt?.migration_id === migration.id)
  )
  if (receiptMatchesBoundary && verificationReceipt?.passed !== true) {
    issues.push(issue(
      'VERIFICATION_DATABASE_EVIDENCE_BLOCKED',
      'The latest database verification receipt found integrity blockers.',
      { issueCodes: verificationReceipt?.issue_codes || [] },
    ))
  }
  const receiptCurrent = Boolean(receiptMatchesBoundary && verificationReceipt?.passed === true)
  let state = 'pending'
  if (['activated', 'completed'].includes(migrationState)) state = issues.length ? 'blocked' : receiptCurrent ? 'verified' : 'ready_to_verify'

  return {
    verificationVersion: CONDITIONAL_MASTER_VERIFICATION_VERSION,
    packetType: normalizedPacketType,
    state,
    ready: state === 'verified',
    canVerify: state === 'ready_to_verify',
    receiptCurrent,
    migrationState,
    candidate,
    sourceMaster,
    coverage,
    legacyTemplateIds: legacyIds,
    issues,
    checkedAt: new Date(normalizedNow).toISOString(),
  }
}
