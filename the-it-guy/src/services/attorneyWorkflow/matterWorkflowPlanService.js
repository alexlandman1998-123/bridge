import { getAttorneyStageDefinitionsForLane } from '../../constants/attorneyWorkflowStages.js'
import { isBondFinanceType, normalizeFinanceType } from '../../core/transactions/financeType.js'

export const MATTER_WORKFLOW_PLAN_VERSION = 'attorney_matter_workflow_plan_v7'

const LANE_KEYS = Object.freeze(['transfer', 'bond', 'cancellation'])
const CASH_EXCLUDED_TRANSFER_STEPS = new Set([
  'payment_security_review',
])
const NON_LEVY_TRANSFER_STEPS = new Set([
  'levy_clearance_requested',
  'levy_clearance_received',
])

// A confirmed plan is authoritative, including an intentionally absent lane.
// Only provisional matters use the shared legacy finance filter.
export function getApplicableAttorneyTaskDefinitions({ laneKey = 'transfer', workflowPlan = null, facts = {} } = {}) {
  const definitions = getAttorneyStageDefinitionsForLane(laneKey)
  if (workflowPlan?.status === 'active') {
    const keys = getMatterWorkflowPlanStepKeys(workflowPlan, laneKey)
    return definitions.filter((definition) => keys.includes(definition.key))
  }
  const clearedCash = (facts.financeType === 'cash' || facts.isCashDeal === true) &&
    normalizeText(facts.paymentSecurity || facts.payment_security).toLowerCase() === 'cleared_trust_funds'
  return definitions.filter((definition) => !(laneKey === 'transfer' && clearedCash && CASH_EXCLUDED_TRANSFER_STEPS.has(definition.key)))
}

export function getAttorneyTaskSuggestion(stepKey, profile = {}) {
  if (CASH_EXCLUDED_TRANSFER_STEPS.has(stepKey)) {
    if (profile.paymentSecurity === 'cleared_trust_funds') return 'Cleared trust funds selected. Review whether this guarantee task is not applicable under the payment arrangement.'
    return 'Review the agreed purchase-price security. Cash funding alone does not establish whether a guarantee is needed.'
  }
  if (NON_LEVY_TRANSFER_STEPS.has(stepKey)) {
    if (profile.propertyTenure === 'freehold' && profile.hoaApplicable === 'no') return 'Freehold with no HOA selected. Review whether this levy task is not applicable.'
    return 'Confirm sectional-title or HOA clearance requirements for this property.'
  }
  if (stepKey === 'bank_conditions_outstanding') return 'If there are no outstanding bank conditions, record this task as not applicable with a reason.'
  return ''
}

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
  const propertyTenure = normalizeText(profile.propertyTenure || profile.property_tenure).toLowerCase()
  const financeType = normalizeFinanceType(profile.financeType || profile.finance_type, { allowUnknown: true })
  const paymentSecurity = normalizeText(profile.paymentSecurity || profile.mvpProfile?.paymentSecurity).toLowerCase()
  const clearedCash = financeType === 'cash' && paymentSecurity === 'cleared_trust_funds'
  return getAttorneyStageDefinitionsForLane('transfer')
    .filter((definition) => definition.key !== 'levy_hoa_clearance_review' || !['freehold'].includes(propertyTenure))
    .filter((definition) => definition.key !== 'payment_security_review' || !clearedCash)
    .map((definition) => definition.key)
}

function resolveLaneStepKeys(laneKey, profile = {}) {
  if (laneKey === 'transfer') return resolveTransferStepKeys(profile)
  return getAttorneyStageDefinitionsForLane(laneKey).map((definition) => definition.key)
}

function resolveRequiredLaneKeys(profile = {}) {
  const financeType = normalizeFinanceType(profile.financeType || profile.finance_type, { allowUnknown: true })
  const bondRegistrationRequired = isBondFinanceType(financeType)
  return [
    'transfer',
    // Plans may outlive legacy flags, so enforce the same canonical finance
    // condition here as well as in routing.
    bondRegistrationRequired ? 'bond' : '',
    profile.requiresCancellationAttorney ? 'cancellation' : '',
  ].filter(Boolean)
}

export function buildMatterWorkflowPlan({ routingProfile = {}, generatedAt = null } = {}) {
  const profile = parseJsonObject(routingProfile)
  const matterProfile = parseJsonObject(profile.matterProfile)
  const confirmed = matterProfile.status === 'confirmed'
  const requiredLaneKeys = resolveRequiredLaneKeys(profile)
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
    status: 'active',
    provisional: !confirmed,
    templateKey: normalizeText(profile.workflowTemplateKey) || 'unrouted_matter',
    routingProfileVersion: normalizeText(profile.version) || null,
    matterProfileVersion: normalizeText(matterProfile.version) || null,
    matterProfileRevision: Number(matterProfile.revision) || 0,
    matterProfileFingerprint: normalizeText(matterProfile.factFingerprint) || null,
    generatedAt: generatedAt || matterProfile.confirmedAt || null,
    laneKeys: requiredLaneKeys,
    lanes,
    configuration: {
      ...parseJsonObject(profile.mvpProfile),
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
    [MATTER_WORKFLOW_PLAN_VERSION].includes(plan?.version) &&
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

function getPlanStepMap(plan = {}) {
  const steps = new Map()
  for (const lane of Array.isArray(plan?.lanes) ? plan.lanes : []) {
    const laneKey = normalizeLaneKey(lane?.laneKey)
    if (!laneKey) continue
    for (const stepKey of Array.isArray(lane?.stepKeys) ? lane.stepKeys : []) {
      const key = normalizeText(stepKey)
      if (key) steps.set(`${laneKey}:${key}`, { laneKey, stepKey: key })
    }
  }
  return steps
}

/**
 * Describes the operational effect of replacing one confirmed matter plan with
 * another. It is deliberately derived from the plans, not the UI, so the
 * confirmation screen, transaction event and workflow refresh agree exactly.
 */
export function diffMatterWorkflowPlans(previousPlan = {}, nextPlan = {}) {
  const previousSteps = getPlanStepMap(previousPlan)
  const nextSteps = getPlanStepMap(nextPlan)
  const previousLanes = new Set(Array.isArray(previousPlan?.laneKeys) ? previousPlan.laneKeys : [])
  const nextLanes = new Set(Array.isArray(nextPlan?.laneKeys) ? nextPlan.laneKeys : [])
  const addedSteps = [...nextSteps.entries()]
    .filter(([key]) => !previousSteps.has(key))
    .map(([, step]) => step)
  const removedSteps = [...previousSteps.entries()]
    .filter(([key]) => !nextSteps.has(key))
    .map(([, step]) => step)
  const addedLanes = [...nextLanes].filter((laneKey) => !previousLanes.has(laneKey))
  const removedLanes = [...previousLanes].filter((laneKey) => !nextLanes.has(laneKey))

  return {
    changed: Boolean(addedSteps.length || removedSteps.length || addedLanes.length || removedLanes.length),
    addedLanes,
    removedLanes,
    addedSteps,
    removedSteps,
    previousTaskCount: previousSteps.size,
    nextTaskCount: nextSteps.size,
  }
}

export function filterStepsForMatterWorkflowPlan(steps = [], plan = {}, laneKey = '') {
  if (plan?.status !== 'active') return steps
  const allowedStepKeys = new Set(getMatterWorkflowPlanStepKeys(plan, laneKey))
  if (!allowedStepKeys.size) return []
  return (Array.isArray(steps) ? steps : []).filter((step) => {
    const stepKey = normalizeText(step?.stepKey || step?.step_key)
    // Excluded rows are never deleted; they remain in the lane history and audit
    // trail, but must not inflate the active plan's progress denominator.
    return allowedStepKeys.has(stepKey)
  })
}
