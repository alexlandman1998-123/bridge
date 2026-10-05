import { isMatterWorkflowPlanCurrent } from './matterWorkflowPlanService.js'
import { agreementConditionIssues, securityAccountIssues, cancellationSignatureIssues, electricalNotApplicable } from './conveyancingReviewPolicy.js'

const MILESTONES = Object.freeze({
  transfer: { ready: 'lodgement_ready', lodged: 'lodged_at_deeds_office', prep: 'in_prep', registered: 'registered', label: 'Transfer' },
  bond: { ready: 'bond_lodgement_ready', lodged: 'bond_lodged', registered: 'bond_registered', label: 'Bond' },
  cancellation: { ready: 'cancellation_lodgement_ready', lodged: 'cancellation_lodged', registered: 'cancellation_registered', label: 'Cancellation' },
})
const RESOLVED = new Set(['completed', 'completed_externally', 'not_applicable'])
const COMPLETE = 'completed'
const text = (value) => String(value || '').trim()
const normalized = (value) => text(value).toLowerCase()

function stepRows(lane) {
  return Array.isArray(lane?.steps) ? lane.steps : []
}

function stepState(lane, stepKey) {
  return normalized(stepRows(lane).find((step) => (step.stepKey || step.step_key || step.key) === stepKey)?.status) || 'not_started'
}

function issue(id, label, laneKey = 'transfer', kind = 'task') {
  return { id, label, laneKey, kind }
}

function documentIssues(rows, now, routingProfile) {
  const at = new Date(now).getTime()
  return (rows || []).flatMap((row, index) => {
    const requirement = row.requirement || row
    if ((requirement.document_definition_key || requirement.documentDefinitionKey) === 'electrical_compliance_certificate' && electricalNotApplicable(routingProfile.mvpProfile?.propertyConditions || routingProfile.propertyConditions)) return []
    const gates = requirement.stage_gates || requirement.stageGates || []
    const level = normalized(requirement.requirement_level || requirement.requirementLevel)
    if (!gates.includes('lodgement_ready') || !['blocker', 'required'].includes(level)) return []
    const status = normalized(requirement.status || row.status)
    const expiry = requirement.expiry_date || requirement.expiryDate
    const expired = expiry && Number.isFinite(new Date(expiry).getTime()) && new Date(expiry).getTime() <= at
    const missing = level === 'blocker'
      ? !['approved', 'completed'].includes(status)
      : !['approved', 'completed', 'waived'].includes(status)
    const invalidWaiver = status === 'waived' && !text(requirement.waiver_reason || requirement.waiverReason)
    if (!expired && !missing && !invalidWaiver) return []
    const label = text(requirement.document_definition_key || requirement.documentDefinitionKey || row.displayName || row.label) || 'Required lodgement document'
    return [issue(`document:${requirement.id || index}`, `${label}: ${expired ? 'expired' : invalidWaiver ? 'waiver reason missing' : 'not approved'}`, 'transfer', 'document')]
  })
}

/** Read-only explanation; the database milestone trigger is the final authority. */
export function buildStageFiveLodgementReview({
  laneKey = 'transfer', taskKey = '', workflowPlan = null, routingProfile = {}, lanes = [],
  requiredDocuments = [], documentsLoaded = true, taxLodgementReadiness = null, now = new Date(),
} = {}) {
  const milestone = MILESTONES[laneKey]
  if (!milestone || !Object.values(milestone).includes(taskKey)) return null
  const stage = Object.entries(milestone).find(([name, value]) => name !== 'label' && value === taskKey)?.[0]
  if (!stage) return null
  const plannedLanes = workflowPlan?.status === 'active' ? workflowPlan.lanes || [] : []
  const laneByKey = new Map((lanes || []).map((lane) => [lane.laneKey || lane.process_type, lane]))
  const plannedByKey = new Map(plannedLanes.map((lane) => [lane.laneKey, lane]))
  const ownPlan = plannedByKey.get(laneKey)
  const ownLane = laneByKey.get(laneKey)
  const issues = []
  if (!workflowPlan || !isMatterWorkflowPlanCurrent(workflowPlan, routingProfile)) {
    issues.push(issue('plan:stale', 'Confirm and reconcile the current matter profile and workflow plan.', laneKey, 'plan'))
  }
  if (!ownPlan?.stepKeys?.includes(taskKey)) issues.push(issue('plan:task', 'This milestone is not in the active matter plan.', laneKey, 'plan'))
  if (!ownLane) issues.push(issue('lane:missing', `${milestone.label} workflow status is unavailable. Refresh the matter.`, laneKey, 'lane'))

  if (stage === 'ready' && ownPlan?.stepKeys) {
    const readyIndex = ownPlan.stepKeys.indexOf(milestone.ready)
    for (const prerequisite of ownPlan.stepKeys.slice(0, Math.max(readyIndex, 0))) {
      if (!RESOLVED.has(stepState(ownLane, prerequisite))) {
        issues.push(issue(`task:${laneKey}:${prerequisite}`, `${milestone.label}: ${prerequisite.replaceAll('_', ' ')} is unresolved.`, laneKey))
      }
    }
  } else if (stage === 'lodged' && stepState(ownLane, milestone.ready) !== COMPLETE) {
    issues.push(issue(`task:${laneKey}:${milestone.ready}`, `${milestone.label} lodgement readiness has not been confirmed.`, laneKey))
  } else if ((stage === 'registered' || stage === 'prep') && stepState(ownLane, milestone.lodged) !== COMPLETE) {
    issues.push(issue(`task:${laneKey}:${milestone.lodged}`, `${milestone.label} Deeds Office lodgement has not been confirmed.`, laneKey))
  }

  if (laneKey === 'transfer' && ['ready', 'lodged', 'registered'].includes(stage)) {
    const crossMilestone = stage === 'registered' ? 'lodged' : 'ready'
    for (const crossLaneKey of ['bond', 'cancellation']) {
      if (!plannedByKey.has(crossLaneKey)) continue
      const cross = MILESTONES[crossLaneKey]
      if (stepState(laneByKey.get(crossLaneKey), cross[crossMilestone]) !== COMPLETE) {
        issues.push(issue(`lane:${crossLaneKey}:${crossMilestone}`, `${cross.label} ${crossMilestone === 'ready' ? 'lodgement readiness' : 'Deeds Office lodgement'} is not confirmed.`, crossLaneKey, 'coordination'))
      }
    }
    if (!documentsLoaded) issues.push(issue('documents:unavailable', 'Lodgement document status has not loaded. Refresh the document checklist.', 'transfer', 'document'))
    else issues.push(...documentIssues(requiredDocuments, now, routingProfile))
    const tax = routingProfile?.transferTaxDecision || routingProfile?.transfer_tax_decision || {}
    if (tax.status !== 'confirmed' || !['transfer_duty', 'vat', 'zero_rated_going_concern', 'exempt'].includes(tax.route) ||
      tax.sarsStatus !== 'receipted' || !text(tax.sarsProofReference)) {
      issues.push(issue('tax:current', 'Confirm the current transfer-tax route and SARS receipt or exemption proof.', 'transfer', 'tax'))
    }
    if (taxLodgementReadiness?.ready === false) {
      issues.push(...(taxLodgementReadiness.warnings || []).map((warning, index) => issue(`tax:${index}`, warning, 'transfer', 'tax')))
    }
  }

  const confirmationsFor = (lane, key) => {
    const row = stepRows(lane).find(step => (step.stepKey || step.step_key || step.key) === key)
    return row?.taskConfirmations || row?.task_confirmations || {}
  }
  if (['ready', 'lodged', 'registered'].includes(stage)) {
    if (laneKey === 'transfer') {
      if (stepState(ownLane, 'otp_source_docs_checked') !== COMPLETE) issues.push(issue('agreement:review', 'Complete the current agreement review before the milestone.'))
      issues.push(...agreementConditionIssues(confirmationsFor(ownLane, 'otp_source_docs_checked').agreement_conditions_review, now)
        .map((label, i) => issue(`agreement:${i}`, label)))
      for (const party of routingProfile.scenarioProfile?.parties || []) {
        if (!['buyer', 'seller'].includes(party.role)) continue
        if (stepState(ownLane, `${party.role}_fica_review`) !== COMPLETE) issues.push(issue(`fica:${party.id}`, 'Complete the current party FICA review before the milestone.'))
        const response = confirmationsFor(ownLane, `${party.role}_fica_review`)[`rmcp_review:${party.id}`]
        if (response?.answer !== 'yes' || !text(response.note)) issues.push(issue(`rmcp:${party.id}`, `${party.name || party.id}: record the firm RMCP review and internal evidence reference.`))
      }
    }
    if (laneKey === 'cancellation' || (laneKey === 'transfer' && plannedByKey.has('cancellation'))) {
      const cancellation = laneByKey.get('cancellation')
      issues.push(...securityAccountIssues(confirmationsFor(cancellation, 'cancellation_guarantee_allocation_review').registered_securities_review, now)
        .map((label, i) => issue(`security:${i}`, label, 'cancellation')))
      const signature = stepRows(cancellation).find(step => (step.stepKey || step.step_key || step.key) === 'seller_cancellation_documents_signed')
      issues.push(...cancellationSignatureIssues(signature).map((label, i) => issue(`signature:${i}`, label, 'cancellation')))
    }
  }

  const laneSummary = plannedLanes.map((plannedLane) => {
    const info = MILESTONES[plannedLane.laneKey]
    const lane = laneByKey.get(plannedLane.laneKey)
    return {
      laneKey: plannedLane.laneKey,
      label: info?.label || plannedLane.laneKey,
      ready: info ? stepState(lane, info.ready) === COMPLETE : false,
      lodged: info ? stepState(lane, info.lodged) === COMPLETE : false,
      registered: info ? stepState(lane, info.registered) === COMPLETE : false,
      available: Boolean(lane),
    }
  })
  return {
    stage,
    ready: issues.length === 0,
    issueCount: issues.length,
    issues,
    lanes: laneSummary,
    label: stage === 'ready' ? 'Lodgement readiness' : stage === 'lodged' ? 'Deeds Office lodgement' : stage === 'prep' ? 'Deeds Office prep' : 'Registration',
  }
}
