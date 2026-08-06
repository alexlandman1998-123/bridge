import { DEFAULT_SELLER_PROCESS_PROFILE } from './sellerProcessProfileService.js'
import { evaluateSellerProcess } from './sellerProcessEvaluationService.js'

const PARTNER_LABELS = Object.freeze({
  attorney_firm: 'Transfer Attorney',
  bond_originator: 'Bond Originator',
})

const BLOCKER_SOURCE_LABELS = Object.freeze({
  activity: 'Activity pending',
  appointment: 'Appointment pending',
  document: 'Document pending',
  listing: 'Listing pending',
})

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function countBy(items = [], getKey = () => '') {
  return items.reduce((counts, item) => {
    const key = normalizeKey(getKey(item)) || 'unknown'
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
}

function toSafeBlockerSummary(blocker = {}) {
  const source = normalizeKey(blocker.source)
  return {
    source: source || 'unknown',
    label: BLOCKER_SOURCE_LABELS[source] || 'Requirement pending',
    severity: blocker.severity || 'blocked',
  }
}

function buildMode(evaluation = {}) {
  if (evaluation.profile === DEFAULT_SELLER_PROCESS_PROFILE) return 'default'
  return evaluation.canApplyToRuntime ? 'runtime_candidate' : 'shadow'
}

function buildInternalSurfaceProjection(evaluation = {}) {
  const mode = buildMode(evaluation)
  const currentStage = evaluation.currentStage || null
  const isDefault = evaluation.profile === DEFAULT_SELLER_PROCESS_PROFILE
  const blockers = asArray(evaluation.blockers)

  return {
    profile: evaluation.profile,
    mode,
    readOnly: true,
    runtimeEnabled: evaluation.runtimeEnabled === true,
    canApplyToRuntime: evaluation.canApplyToRuntime === true,
    canReplaceJourney: false,
    journeyPatch: null,
    readinessPatch: null,
    currentDefaultStageKey: currentStage?.defaultStageKey || currentStage?.key || '',
    currentProcessStageKey: isDefault ? '' : currentStage?.key || '',
    currentProcessStageLabel: isDefault ? '' : currentStage?.label || '',
    completedProcessStageKeys: isDefault ? [] : asArray(evaluation.completedStageKeys),
    missingEvidenceKeys: isDefault ? [] : blockers.map((blocker) => blocker.evidenceKey).filter(Boolean),
    blockerCount: blockers.length,
    percent: evaluation.summary?.percent || 0,
  }
}

function buildPartnerProjection(evaluation = {}, partnerType = '') {
  const normalizedPartnerType = normalizeKey(partnerType)
  const partnerReadiness = asArray(evaluation.partnerReadiness)
    .find((handoff) => normalizeKey(handoff.partnerType) === normalizedPartnerType) || null
  const blockers = asArray(evaluation.blockers)
  const safeBlockers = blockers.map(toSafeBlockerSummary)

  return {
    profile: evaluation.profile,
    partnerType: normalizedPartnerType,
    partnerLabel: PARTNER_LABELS[normalizedPartnerType] || 'Partner',
    readOnly: true,
    ready: partnerReadiness?.ready === true,
    status: partnerReadiness?.ready === true ? 'ready' : 'not_ready',
    blockerCount: blockers.length,
    blockerSources: countBy(blockers, (blocker) => blocker.source),
    blockers: safeBlockers,
    exposesInternalProcessStages: false,
  }
}

function buildReportingProjection(evaluation = {}) {
  return {
    profile: evaluation.profile,
    mode: buildMode(evaluation),
    readOnly: true,
    internalOnly: true,
    runtimeEnabled: evaluation.runtimeEnabled === true,
    canApplyToRuntime: evaluation.canApplyToRuntime === true,
    currentDefaultStageKey: evaluation.currentStage?.defaultStageKey || evaluation.currentStage?.key || '',
    processStageCount: evaluation.summary?.totalStageCount || 0,
    completedProcessStageCount: evaluation.summary?.completedStageCount || 0,
    blockerCount: evaluation.summary?.blockerCount || 0,
    percent: evaluation.summary?.percent || 0,
  }
}

export function buildSellerProcessSurfaceProjection(source = {}) {
  const evaluation = evaluateSellerProcess(source)
  return Object.freeze({
    evaluation,
    surface: buildInternalSurfaceProjection(evaluation),
    reporting: buildReportingProjection(evaluation),
  })
}

export function buildSellerProcessPartnerProjection(source = {}, { partnerType = '' } = {}) {
  const evaluation = evaluateSellerProcess(source)
  return Object.freeze(buildPartnerProjection(evaluation, partnerType))
}

export function buildSellerProcessProjectionBundle(source = {}) {
  const evaluation = evaluateSellerProcess(source)
  return Object.freeze({
    evaluation,
    surface: buildInternalSurfaceProjection(evaluation),
    reporting: buildReportingProjection(evaluation),
    partners: Object.freeze({
      attorney_firm: buildPartnerProjection(evaluation, 'attorney_firm'),
      bond_originator: buildPartnerProjection(evaluation, 'bond_originator'),
    }),
  })
}
