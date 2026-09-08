import { getAttorneyStageDefinitionsForLane } from '../../constants/attorneyWorkflowStages.js'

export const MATTER_WORKFLOW_PLAN_VERSION = 'attorney_matter_workflow_plan_v1'

const LANE_KEYS = Object.freeze(['transfer', 'bond', 'cancellation'])
const CASH_EXCLUDED_TRANSFER_STEPS = new Set([
  'guarantees_requested',
  'guarantees_received',
  'transfer_guarantees_accepted',
])
const NON_LEVY_TRANSFER_STEPS = new Set([
  'levy_clearance_requested',
  'levy_clearance_received',
])

function normalizeText(value) {
  return String(value || '').trim()
}

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeLaneKey(value) {
  const key = normalizeText(value).toLowerCase().replace(/_attorney$/, '')
  return LANE_KEYS.includes(key) ? key : ''
}

function resolveTransferStepKeys(profile = {}) {
  return getAttorneyStageDefinitionsForLane('transfer')
    .map((definition) => definition.key)
    .filter((stepKey) => {
      if (profile.financeType === 'cash' && CASH_EXCLUDED_TRANSFER_STEPS.has(stepKey)) return false
      if (!['sectional_title', 'estate_hoa'].includes(profile.propertyTenure) && NON_LEVY_TRANSFER_STEPS.has(stepKey)) return false
      return true
    })
}

function resolveLaneStepKeys(laneKey, profile = {}) {
  if (laneKey === 'transfer') return resolveTransferStepKeys(profile)
  return getAttorneyStageDefinitionsForLane(laneKey).map((definition) => definition.key)
}

function resolveRequiredLaneKeys(profile = {}) {
  return [
    'transfer',
    profile.requiresBondAttorney ? 'bond' : '',
    profile.requiresCancellationAttorney ? 'cancellation' : '',
  ].filter(Boolean)
}

export function buildMatterWorkflowPlan({ routingProfile = {}, generatedAt = null } = {}) {
  const profile = parseJsonObject(routingProfile)
  const matterProfile = parseJsonObject(profile.matterProfile)
  const confirmed = matterProfile.status === 'confirmed'
  const requiredLaneKeys = confirmed ? resolveRequiredLaneKeys(profile) : []
  const lanes = requiredLaneKeys.map((laneKey) => {
    const stepKeys = resolveLaneStepKeys(laneKey, profile)
    return {
      laneKey,
      stepKeys,
      taskCount: stepKeys.length,
    }
  })

  return {
    version: MATTER_WORKFLOW_PLAN_VERSION,
    status: confirmed ? 'active' : 'awaiting_matter_profile_confirmation',
    templateKey: normalizeText(profile.workflowTemplateKey) || 'unrouted_matter',
    routingProfileVersion: normalizeText(profile.version) || null,
    matterProfileVersion: normalizeText(matterProfile.version) || null,
    matterProfileRevision: Number(matterProfile.revision) || 0,
    matterProfileFingerprint: normalizeText(matterProfile.factFingerprint) || null,
    generatedAt: generatedAt || matterProfile.confirmedAt || null,
    laneKeys: requiredLaneKeys,
    lanes,
    configuration: {
      financeType: normalizeText(profile.financeType) || 'unknown',
      transactionType: normalizeText(profile.transactionType) || 'unknown',
      propertyTenure: normalizeText(profile.propertyTenure) || 'unknown',
      buyerEntityType: normalizeText(profile.buyerEntityType) || 'unknown',
      sellerEntityType: normalizeText(profile.sellerEntityType) || 'unknown',
      vatTreatment: normalizeText(profile.vatTreatment) || 'unknown',
      sellerHasExistingBond: Boolean(profile.sellerHasExistingBond),
      cancellationRequired: Boolean(profile.cancellationRequired),
    },
  }
}

export function readMatterWorkflowPlan(routingProfile = {}) {
  return parseJsonObject(parseJsonObject(routingProfile).workflowPlan)
}

export function isMatterWorkflowPlanCurrent(plan = {}, routingProfile = {}) {
  const profile = parseJsonObject(routingProfile)
  const matterProfile = parseJsonObject(profile.matterProfile)
  return (
    plan?.version === MATTER_WORKFLOW_PLAN_VERSION &&
    plan?.status === 'active' &&
    matterProfile?.status === 'confirmed' &&
    normalizeText(plan.matterProfileFingerprint) === normalizeText(matterProfile.factFingerprint) &&
    Number(plan.matterProfileRevision) === Number(matterProfile.revision)
  )
}

export function resolveMatterWorkflowPlan(routingProfile = {}) {
  const profile = parseJsonObject(routingProfile)
  const storedPlan = readMatterWorkflowPlan(profile)
  return isMatterWorkflowPlanCurrent(storedPlan, profile)
    ? storedPlan
    : buildMatterWorkflowPlan({ routingProfile: profile })
}

export function getMatterWorkflowPlanStepKeys(plan = {}, laneKey = '') {
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  const lane = (Array.isArray(plan?.lanes) ? plan.lanes : []).find((item) => item?.laneKey === normalizedLaneKey)
  return Array.isArray(lane?.stepKeys) ? lane.stepKeys : []
}

export function filterStepsForMatterWorkflowPlan(steps = [], plan = {}, laneKey = '') {
  if (plan?.status !== 'active') return steps
  const allowedStepKeys = new Set(getMatterWorkflowPlanStepKeys(plan, laneKey))
  if (!allowedStepKeys.size) return []
  return (Array.isArray(steps) ? steps : []).filter((step) => {
    const stepKey = normalizeText(step?.stepKey || step?.step_key)
    // Historic completed work remains available even where a later profile revision
    // means that its template step is no longer applicable.
    return allowedStepKeys.has(stepKey) || normalizeText(step?.status).toLowerCase() === 'completed'
  })
}
