import { evaluateConditionalMasterCoverage } from './conditionalMasterCoverageReadiness.js'

export const CONDITIONAL_MASTER_MIGRATION_VERSION = 'conditional-master-migration-v1'
export const CONDITIONAL_MASTER_ROLLBACK_WINDOW_DAYS = 14

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

function migrationMetadata(template = {}) {
  const source = metadata(template).conditional_master_migration
  return source && typeof source === 'object' ? source : {}
}

function sections(template = {}) {
  return Array.isArray(template.sections) ? template.sections : []
}

function status(template = {}) {
  const value = key(template.status || template.template_status || metadata(template).template_status)
  if (value) return value
  return template.is_active === false ? 'archived' : template.is_default ? 'published' : 'draft'
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

function packetTypeOf(template = {}) {
  return key(template.packet_type || template.packetType)
}

function updatedTime(template = {}) {
  const time = Date.parse(template.updated_at || template.created_at || '')
  return Number.isFinite(time) ? time : 0
}

function compareCandidate(left = {}, right = {}) {
  if (Boolean(left.is_default) !== Boolean(right.is_default)) return left.is_default ? -1 : 1
  if (isLive(left) !== isLive(right)) return isLive(left) ? -1 : 1
  return updatedTime(right) - updatedTime(left)
}

function sectionKey(section = {}) {
  return key(section.section_key || section.sectionKey || section.key)
}

function sectionText(section = {}) {
  return text(section.legal_text || section.legalText || section.content)
}

function isConditionalPack(section = {}) {
  return metadata(section).conditional_pack === true
}

function detectWordingConflicts(legacyTemplates = []) {
  const wordingBySection = new Map()
  for (const template of legacyTemplates) {
    for (const section of sections(template)) {
      if (isConditionalPack(section)) continue
      const currentKey = sectionKey(section)
      const wording = sectionText(section)
      if (!currentKey || !wording) continue
      if (!wordingBySection.has(currentKey)) wordingBySection.set(currentKey, new Map())
      const sources = wordingBySection.get(currentKey)
      if (!sources.has(wording)) sources.set(wording, [])
      sources.get(wording).push(template.id)
    }
  }
  return [...wordingBySection.entries()]
    .filter(([, variants]) => variants.size > 1)
    .map(([currentKey, variants]) => ({
      sectionKey: currentKey,
      variantCount: variants.size,
      sourceTemplateIds: [...new Set([...variants.values()].flat())],
      message: `${currentKey.replace(/_/g, ' ')} has different wording across legacy templates and needs an explicit review.`,
    }))
}

function parseDate(value) {
  const timestamp = Date.parse(value || '')
  return Number.isFinite(timestamp) ? timestamp : null
}

export function evaluateConditionalMasterMigration({
  packetType = '',
  templates = [],
  migrationRecord = null,
  now = Date.now(),
} = {}) {
  const normalizedPacketType = key(packetType) === 'otp' ? 'otp' : 'mandate'
  const matching = (Array.isArray(templates) ? templates : [])
    .filter((template) => packetTypeOf(template) === normalizedPacketType)
  const globalMaster = matching.find((template) => !template.organisation_id && isConditionalMaster(template)) || null
  const candidates = matching
    .filter((template) => Boolean(template.organisation_id) && isConditionalMaster(template) && status(template) !== 'archived')
    .sort(compareCandidate)
  const candidate = candidates[0] || null
  const legacyTemplates = matching.filter((template) => (
    Boolean(template.organisation_id) &&
    template.id !== candidate?.id &&
    !isConditionalMaster(template) &&
    status(template) !== 'archived'
  ))
  const legacyLiveTemplates = legacyTemplates.filter(isLive)
  const migration = migrationRecord && typeof migrationRecord === 'object'
    ? migrationRecord
    : candidate ? migrationMetadata(candidate) : {}
  const coverage = candidate
    ? evaluateConditionalMasterCoverage({ packetType: normalizedPacketType, template: candidate })
    : null
  const wordingConflicts = detectWordingConflicts(legacyTemplates)
  const wordingReviewed = Boolean(migration.wording_reviewed_at || migration.wordingReviewedAt)
  const wordingReviewRequired = legacyTemplates.length > 0
  const activatedAt = parseDate(migration.activated_at || migration.activatedAt)
  const rollbackUntil = parseDate(migration.rollback_until || migration.rollbackUntil)
  const normalizedNow = Number.isFinite(Number(now)) ? Number(now) : Date.now()
  const candidateIsLiveDefault = Boolean(candidate?.is_default && isLive(candidate))
  const migrationState = key(migration.state)
  const blockers = []

  if (!globalMaster) blockers.push({ code: 'MIGRATION_GLOBAL_MASTER_MISSING', message: `The global ${normalizedPacketType.toUpperCase()} conditional master is missing.` })
  if (candidate && !coverage?.ready) blockers.push({ code: 'MIGRATION_COVERAGE_BLOCKED', message: 'The organisation conditional master does not cover every supported legal scenario.' })
  if (candidate && wordingReviewRequired && !wordingReviewed) blockers.push({
    code: 'MIGRATION_WORDING_REVIEW_REQUIRED',
    message: wordingConflicts.length
      ? 'Legacy templates contain conflicting standard wording that must be reviewed before activation.'
      : 'The reconciled legacy wording must be reviewed before activation.',
  })

  let state = 'not_started'
  if (!globalMaster) state = 'blocked'
  else if (migrationState === 'rolled_back') state = 'rolled_back'
  else if (migrationState === 'completed') state = 'complete'
  else if (!candidate) state = 'needs_draft'
  else if (!coverage?.ready || (wordingReviewRequired && !wordingReviewed)) state = 'draft_blocked'
  else if (!candidateIsLiveDefault) state = 'ready_to_activate'
  else if (legacyLiveTemplates.length && rollbackUntil && normalizedNow < rollbackUntil) state = 'rollback_window'
  else if (legacyLiveTemplates.length) state = 'ready_to_archive'
  else state = 'complete'

  return {
    migrationVersion: CONDITIONAL_MASTER_MIGRATION_VERSION,
    packetType: normalizedPacketType,
    state,
    globalMaster,
    candidate,
    coverage,
    legacyTemplates,
    legacyLiveTemplates,
    wordingConflicts,
    wordingReviewRequired,
    wordingReviewed,
    activatedAt: activatedAt ? new Date(activatedAt).toISOString() : null,
    rollbackUntil: rollbackUntil ? new Date(rollbackUntil).toISOString() : null,
    rollbackWindowOpen: state === 'rollback_window',
    blockers,
    canPrepare: Boolean(globalMaster && !candidate),
    canActivate: state === 'ready_to_activate',
    canFinalize: state === 'ready_to_archive',
    canRollback: Boolean(candidateIsLiveDefault && activatedAt && state !== 'complete'),
    ready: state === 'complete',
    safeguards: {
      sourceHistoryPreserved: true,
      generatedDocumentsImmutable: true,
      archiveRequiresSeparateAction: true,
      rollbackWindowDays: CONDITIONAL_MASTER_ROLLBACK_WINDOW_DAYS,
    },
  }
}
