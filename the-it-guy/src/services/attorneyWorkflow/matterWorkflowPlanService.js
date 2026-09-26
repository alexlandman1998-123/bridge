import { getAttorneyStageDefinitionsForLane } from '../../constants/attorneyWorkflowStages.js'
import { isBondFinanceType, normalizeFinanceType } from '../../core/transactions/financeType.js'
import { resolveMatterScenarioProfile, scenarioFingerprint } from '../matterScenarioProfile.js'
import { PHASE4_TAX_TASKS, PHASE4_PROPERTY_TASKS, phase4TaxTaskKeys, phase4PropertyTaskKeys } from './transferPhase4Policy.js'
import { requiredSpecialistRouteKeys, specialistRouteConfirmed, SPECIALIST_ROUTE_TASKS } from './specialistRoutePolicy.js'

export const MATTER_WORKFLOW_PLAN_VERSION = 'attorney_matter_workflow_plan_v14'

const LANE_KEYS = Object.freeze(['transfer', 'bond', 'cancellation'])
const NON_LEVY_TRANSFER_STEPS = new Set([
  'levy_clearance_requested',
  'levy_clearance_received',
])

function specialistTaskKeys(profile = {}) {
  const scenario = parseJsonObject(profile.scenarioProfile)
  const routeKeys = requiredSpecialistRouteKeys(scenario, profile.propertyTenure)
  if (!routeKeys.length) return []
  return ['specialist_classification_review', ...routeKeys
    .filter(key => specialistRouteConfirmed(scenario.specialistRoutes?.[key], scenario, {
      propertyTenure: profile.propertyTenure,
      propertyConditions: profile.propertyConditions || profile.mvpProfile?.propertyConditions || {},
    }))
    .map(key => SPECIALIST_ROUTE_TASKS[key])]
}

// A confirmed plan is authoritative, including an intentionally absent lane.
// Only provisional matters use the shared legacy finance filter.
export function getApplicableAttorneyTaskDefinitions({ laneKey = 'transfer', workflowPlan = null, facts = {} } = {}) {
  const definitions = getAttorneyStageDefinitionsForLane(laneKey)
  if (workflowPlan?.status === 'active') {
    const keys = getMatterWorkflowPlanStepKeys(workflowPlan, laneKey)
    return definitions.filter((definition) => keys.includes(definition.key))
  }
  const financeType = normalizeFinanceType(facts.financeType || facts.finance_type, { allowUnknown: true })
  return definitions.filter((definition) => definition.key !== 'cash_funding_source_review' || ['cash', 'combination'].includes(financeType))
    .filter((definition) => definition.key !== 'party_capacity_specialist_review')
    .filter((definition) => !['specialist_classification_review', ...Object.values(SPECIALIST_ROUTE_TASKS)].includes(definition.key) || specialistTaskKeys(facts).includes(definition.key))
}

export function getAttorneyTaskSuggestion(stepKey, profile = {}) {
  if (stepKey === 'payment_security_review') {
    if (profile.paymentSecurity === 'cleared_trust_funds') return 'Check that the purchase funds have actually cleared in trust and record the payment-security decision.'
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

function persistedScenarioFingerprint(scenarioProfile) {
  return scenarioProfile ? scenarioFingerprint(resolveMatterScenarioProfile(scenarioProfile)) : null
}

function normalizeLaneKey(value) {
  const key = normalizeText(value).toLowerCase().replace(/_attorney$/, '')
  return LANE_KEYS.includes(key) ? key : ''
}

function resolveTransferStepKeys(profile = {}) {
  const specialistSteps = specialistTaskKeys(profile)
  const financeType = normalizeFinanceType(profile.financeType || profile.finance_type, { allowUnknown: true })
  const taxDecision = parseJsonObject(profile.transferTaxDecision || profile.transfer_tax_decision)
  const taxSteps = phase4TaxTaskKeys(taxDecision, profile.scenarioProfile)
  const propertySteps = phase4PropertyTaskKeys(profile)
  return getAttorneyStageDefinitionsForLane('transfer')
    .filter((definition) => definition.key !== 'transfer_duty_vat_review')
    .filter((definition) => definition.key !== 'cash_funding_source_review' || ['cash', 'combination'].includes(financeType))
    .filter((definition) => definition.key !== 'party_capacity_specialist_review')
    .filter((definition) => !['specialist_classification_review', ...Object.values(SPECIALIST_ROUTE_TASKS)].includes(definition.key) || specialistSteps.includes(definition.key))
    .filter((definition) => !PHASE4_TAX_TASKS.includes(definition.key) || taxSteps.includes(definition.key))
    .filter((definition) => !PHASE4_PROPERTY_TASKS.includes(definition.key) || propertySteps.includes(definition.key))
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
    (profile.sellerHasExistingBond || profile.cancellationRequired || profile.requiresCancellationAttorney) ? 'cancellation' : '',
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
    scenarioFingerprint: persistedScenarioFingerprint(profile.scenarioProfile),
    laneKeys: requiredLaneKeys,
    lanes,
    configuration: {
      ...parseJsonObject(profile.mvpProfile),
      scenarioProfile: profile.scenarioProfile || null,
      financeType: normalizeText(profile.financeType) || 'unknown',
      transactionType: normalizeText(profile.transactionType) || 'unknown',
      propertyTenure: normalizeText(profile.propertyTenure) || 'unknown',
      buyerEntityType: normalizeText(profile.buyerEntityType) || 'unknown',
      sellerEntityType: normalizeText(profile.sellerEntityType) || 'unknown',
      vatTreatment: normalizeText(profile.vatTreatment) || 'unknown',
      propertyConditions: parseJsonObject(profile.propertyConditions || profile.mvpProfile?.propertyConditions),
      transferTaxDecision: parseJsonObject(profile.transferTaxDecision || profile.transfer_tax_decision),
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
    (plan.scenarioFingerprint || null) === persistedScenarioFingerprint(profile.scenarioProfile) &&
    matterProfile?.status === 'confirmed' &&
    normalizeText(plan.matterProfileFingerprint) === normalizeText(matterProfile.factFingerprint) &&
    Number(plan.matterProfileRevision) === Number(matterProfile.revision)
  )
}

export function resolveMatterWorkflowPlan(routingProfile = {}) {
  const profile = parseJsonObject(routingProfile)
  const storedPlan = readMatterWorkflowPlan(profile)
  // Persisted applicability is the read contract even while a profile is
  // provisional or a newer catalogue exists. Rebuild only on an explicit write.
  return storedPlan.status === 'active'
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
    changed: Boolean(addedSteps.length || removedSteps.length || addedLanes.length || removedLanes.length || previousPlan.scenarioFingerprint !== nextPlan.scenarioFingerprint),
    partyRequirementsChanged: previousPlan.scenarioFingerprint !== nextPlan.scenarioFingerprint,
    addedLanes,
    removedLanes,
    addedSteps,
    removedSteps,
    previousTaskCount: previousSteps.size,
    nextTaskCount: nextSteps.size,
  }
}

const LODGEMENT_MILESTONES = Object.freeze({
  transfer: ['lodgement_ready', 'lodged_at_deeds_office'],
  bond: ['bond_lodgement_ready', 'bond_lodged'],
  cancellation: ['cancellation_lodgement_ready', 'cancellation_lodged'],
})
const COMPLETION_ONLY_BEFORE_READINESS = Object.freeze({
  transfer: new Set([
    'title_deed_checked', 'buyer_party_capacity_review', 'seller_party_capacity_review',
    'transfer_document_pack_review', 'buyer_signing_review', 'seller_signing_review',
    'payment_security_review', 'cash_funding_source_review',
    ...PHASE4_TAX_TASKS, ...PHASE4_PROPERTY_TASKS,
    'specialist_classification_review', ...Object.values(SPECIALIST_ROUTE_TASKS),
  ]),
  bond: new Set([
    'bond_instruction_received', 'bank_requirements_confirmed', 'bank_conditions_resolved',
    'buyer_signed_bond_documents', 'guarantees_issued', 'guarantee_wording_accepted',
    'bond_lodgement_instructions_confirmed', 'bond_approval_letter_received',
    'bank_approval_to_lodge_received',
  ]),
  cancellation: new Set([
    'cancellation_existing_bond_confirmed', 'cancellation_bank_captured',
    'cancellation_bond_account_captured', 'cancellation_instruction_received',
    'notice_period_captured', 'cancellation_figures_received', 'figures_expiry_captured',
    'cancellation_guarantees_accepted', 'cancellation_guarantee_allocation_review',
    'cancellation_consent_confirmed', 'cancellation_simultaneous_lodgement_confirmed',
    'seller_cancellation_documents_signed',
  ]),
})

// Read-only release inspection. Rows outside the candidate plan stay visible as
// history; they are never promoted to a newly required task or removed here.
export function inspectMatterWorkflowPlanSnapshot({ routingProfile = {}, lanes = [] } = {}) {
  const storedPlan = readMatterWorkflowPlan(routingProfile)
  const candidatePlan = buildMatterWorkflowPlan({ routingProfile })
  const impact = diffMatterWorkflowPlans(storedPlan, candidatePlan)
  const versionChanged = storedPlan.version !== candidatePlan.version
  const planCurrent = isMatterWorkflowPlanCurrent(storedPlan, routingProfile)
  const rowsByLane = new Map((Array.isArray(lanes) ? lanes : []).map(lane => [
    normalizeLaneKey(lane.laneKey || lane.process_type || lane.processType),
    new Map((lane.steps || []).map(step => [normalizeText(step.step_key || step.stepKey), step])),
  ]))
  const candidateKeys = new Set(candidatePlan.lanes.flatMap(lane => lane.stepKeys.map(key => `${lane.laneKey}:${key}`)))
  const missingRows = candidatePlan.lanes.flatMap(lane => lane.stepKeys
    .filter(key => !rowsByLane.get(lane.laneKey)?.has(key))
    .map(stepKey => ({ laneKey: lane.laneKey, stepKey })))
  const preservedHistoricalRows = (Array.isArray(lanes) ? lanes : []).flatMap(lane => {
    const laneKey = normalizeLaneKey(lane.laneKey || lane.process_type || lane.processType)
    return (lane.steps || []).filter(step =>
      !candidateKeys.has(`${laneKey}:${normalizeText(step.step_key || step.stepKey)}`) &&
      ['completed', 'completed_externally', 'not_applicable'].includes(step.status))
      .map(step => ({ laneKey, stepKey: normalizeText(step.step_key || step.stepKey), status: step.status }))
  })
  const readinessRisks = []
  const lodgedLanes = []
  for (const lane of candidatePlan.lanes) {
    const [readyKey, lodgedKey] = LODGEMENT_MILESTONES[lane.laneKey] || []
    const rows = rowsByLane.get(lane.laneKey) || new Map()
    if (rows.get(lodgedKey)?.status === 'completed') {
      lodgedLanes.push(lane.laneKey)
      continue
    }
    if (['completed_externally', 'not_applicable'].includes(rows.get(readyKey)?.status)) {
      readinessRisks.push({ laneKey: lane.laneKey, stepKey: readyKey, reason: 'invalid_readiness_outcome' })
    }
    if (rows.get(readyKey)?.status !== 'completed') continue
    if (!planCurrent || versionChanged || impact.changed) {
      readinessRisks.push({ laneKey: lane.laneKey, reason: 'readiness_on_stale_plan' })
    }
    const readyIndex = lane.stepKeys.indexOf(readyKey)
    for (const stepKey of lane.stepKeys.slice(0, readyIndex < 0 ? 0 : readyIndex)) {
      const status = rows.get(stepKey)?.status
      if (!['completed', 'completed_externally', 'not_applicable'].includes(status)) {
        readinessRisks.push({ laneKey: lane.laneKey, stepKey, reason: 'unresolved_before_readiness' })
      } else if (COMPLETION_ONLY_BEFORE_READINESS[lane.laneKey]?.has(stepKey) && status !== 'completed') {
        readinessRisks.push({ laneKey: lane.laneKey, stepKey, reason: 'reviewed_completion_required' })
      }
    }
  }
  return {
    storedVersion: storedPlan.version || null,
    candidateVersion: candidatePlan.version,
    planCurrent,
    versionChanged,
    impact,
    missingRows,
    preservedHistoricalRows,
    lodgedLanes,
    readinessRisks,
    requiresReconciliation: !planCurrent || versionChanged || impact.changed || missingRows.length > 0 || readinessRisks.length > 0,
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
