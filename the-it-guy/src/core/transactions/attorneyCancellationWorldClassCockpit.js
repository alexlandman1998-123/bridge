import { ATTORNEY_WORKFLOW_STAGE_DEFINITIONS, normalizeAttorneyStageKey } from '../../constants/attorneyWorkflowStages.js'

export const ATTORNEY_THREE_ROLE_PHASE5_VERSION = 'attorney_cancellation_cockpit_phase5_v1'

const CANCELLATION_STAGES = ATTORNEY_WORKFLOW_STAGE_DEFINITIONS.cancellation.map((stage) => stage.key)

const DOMAIN_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'bank_instruction', label: 'Existing bond & bank instruction', start: 'cancellation_existing_bond_confirmed', end: 'notice_period_captured' }),
  Object.freeze({ key: 'figures_validity', label: 'Cancellation figures & expiry risk', start: 'cancellation_figures_requested', end: 'notice_penalty_risk_captured' }),
  Object.freeze({ key: 'guarantees_coordination', label: 'Guarantees & transfer handoff', start: 'cancellation_guarantees_requested', end: 'cancellation_guarantees_accepted', dependency: true }),
  Object.freeze({ key: 'drafting_signing', label: 'Cancellation drafting & signing', start: 'cancellation_documents_prepared', end: 'seller_cancellation_documents_signed' }),
  Object.freeze({ key: 'lodgement_registration', label: 'Linked lodgement & cancellation', start: 'cancellation_lodgement_ready', end: 'cancellation_registered', dependency: true }),
  Object.freeze({ key: 'settlement_closeout', label: 'Settlement proof & close-out', start: 'settlement_proof_captured', end: 'cancellation_close_out_complete' }),
])

function normalizeStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'complete') return 'completed'
  if (normalized === 'waiting_on_party') return 'waiting'
  return normalized
}

function toCount(value = 0) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function checklistItem(usability, id) {
  return (usability?.readinessChecklist || []).find((item) => item.id === id) || null
}

function domainStatus({ definition, currentIndex, laneStatus, workflowState, coordination }) {
  const startIndex = CANCELLATION_STAGES.indexOf(definition.start)
  const endIndex = CANCELLATION_STAGES.indexOf(definition.end)
  if (['complete', 'completed'].includes(workflowState) || currentIndex > endIndex) return 'completed'
  if (currentIndex < startIndex || currentIndex === -1) return 'pending'
  if (definition.dependency && toCount(coordination?.counts?.blocked)) return 'blocked'
  if (definition.dependency && toCount(coordination?.counts?.waiting)) return 'waiting'
  if (laneStatus === 'blocked') return 'blocked'
  if (laneStatus === 'waiting') return 'waiting'
  return 'active'
}

function dependencySignal(item = {}) {
  return Object.freeze({
    id: item.id || '',
    laneKey: item.laneKey || item.dependencyLaneKey || '',
    laneLabel: item.laneLabel || 'Linked attorney',
    title: item.title || item.targetStageLabel || 'Linked workflow handoff',
    description: item.description || '',
    status: normalizeStatus(item.status) || 'waiting',
    expectedDate: item.actionedDueDate || item.expectedDate || '',
    escalationNeeded: item.escalationNeeded === true,
    editable: false,
    source: item,
  })
}

export function buildCancellationAttorneyCockpit(workflow = {}) {
  const lane = workflow?.lane || workflow || {}
  const usability = lane.workflowUsability || lane.actionSummary || workflow.actionSummary || {}
  const coordination = lane.coordinationSummary || {}
  const stageKey = normalizeAttorneyStageKey(
    lane.currentStage || lane.summary?.currentStage || usability.currentStage || '',
    'cancellation',
  )
  const currentIndex = CANCELLATION_STAGES.indexOf(stageKey)
  const laneStatus = normalizeStatus(lane.laneStatus || lane.summary?.status || usability.workflowState)
  const workflowState = normalizeStatus(usability.workflowState || lane.summary?.status)
  const dependencies = (coordination.items || []).map(dependencySignal)
  const readiness = {
    assignment: checklistItem(usability, 'assignment'),
    data: checklistItem(usability, 'data'),
    documents: checklistItem(usability, 'documents'),
    signatures: checklistItem(usability, 'signatures'),
  }
  const openDependencies = dependencies.filter((item) => item.status !== 'ready').length
  const blockedDependencies = dependencies.filter((item) => item.status === 'blocked' || item.escalationNeeded).length
  const domains = DOMAIN_DEFINITIONS.map((definition) => Object.freeze({
    key: definition.key,
    label: definition.label,
    status: domainStatus({ definition, currentIndex, laneStatus, workflowState, coordination }),
    current: currentIndex >= CANCELLATION_STAGES.indexOf(definition.start) && currentIndex <= CANCELLATION_STAGES.indexOf(definition.end),
  }))
  const primaryAction = usability.primaryNextAction || null
  const canAct = lane.permissions?.canUpdateStage === true
  const blockers = [
    ...(Array.isArray(workflow.blockers) ? workflow.blockers : []),
    ...(readiness.assignment && !readiness.assignment.complete ? ['Cancellation attorney assignment is outstanding.'] : []),
    ...(blockedDependencies ? [`${blockedDependencies} linked legal ${blockedDependencies === 1 ? 'dependency is' : 'dependencies are'} blocking cancellation progress.`] : []),
  ]

  return Object.freeze({
    version: ATTORNEY_THREE_ROLE_PHASE5_VERSION,
    laneKey: 'cancellation',
    title: 'Cancellation Attorney Command Centre',
    valueProposition: 'Visible, time-bound cancellation from lender appointment to discharge, without silent transfer blockers.',
    controlLabel: 'Cancellation lane control',
    dependencyTitle: 'Transfer and guarantee handoffs',
    dependencyDescription: 'Linked transfer readiness is visible without allowing the cancellation team to change another attorney lane.',
    emptyDependencyMessage: 'No linked transfer or guarantee handoffs are required yet.',
    currentStage: stageKey,
    currentStageLabel: usability.currentStageLabel || workflow.nextStep || 'Not started',
    progressPercent: toCount(workflow.progressPercent ?? lane.summary?.completionPercent),
    status: laneStatus || 'not_started',
    canAct,
    readOnlyReason: canAct ? '' : (lane.permissions?.readOnlyReason || 'This lane is visible for coordination, but only the assigned cancellation team may change it.'),
    primaryAction,
    domains: Object.freeze(domains),
    readiness: Object.freeze(readiness),
    metrics: Object.freeze({
      missingData: toCount(readiness.data?.missingCount),
      missingDocuments: toCount(readiness.documents?.missingCount),
      openSignatures: toCount(readiness.signatures?.missingCount),
      openDependencies,
      blockedDependencies,
    }),
    dependencies: Object.freeze(dependencies),
    blockers: Object.freeze([...new Set(blockers.filter(Boolean))]),
    healthy: blockers.length === 0 && blockedDependencies === 0,
  })
}

