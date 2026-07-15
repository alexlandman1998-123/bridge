import { ATTORNEY_WORKFLOW_STAGE_DEFINITIONS, normalizeAttorneyStageKey } from '../../constants/attorneyWorkflowStages.js'

export const ATTORNEY_THREE_ROLE_PHASE3_VERSION = 'attorney_transfer_cockpit_phase3_v1'

const TRANSFER_STAGES = ATTORNEY_WORKFLOW_STAGE_DEFINITIONS.transfer.map((stage) => stage.key)

const DOMAIN_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'instruction', label: 'Instruction & file opening', start: 'instruction_received', end: 'matter_opened' }),
  Object.freeze({ key: 'fica', label: 'FICA & entity authority', start: 'otp_source_docs_checked', end: 'entity_authority_checked' }),
  Object.freeze({ key: 'clearances', label: 'Duty, rates & clearances', start: 'title_deed_checked', end: 'compliance_certificates_received' }),
  Object.freeze({ key: 'drafting_signing', label: 'Drafting & signing', start: 'transfer_documents_prepared', end: 'seller_signed_transfer_documents' }),
  Object.freeze({ key: 'financial_dependencies', label: 'Guarantees & linked attorneys', start: 'guarantees_requested', end: 'transfer_guarantees_accepted', dependency: true }),
  Object.freeze({ key: 'lodgement_registration', label: 'Lodgement, registration & close', start: 'lodgement_pack_prepared', end: 'matter_closed' }),
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
  const startIndex = TRANSFER_STAGES.indexOf(definition.start)
  const endIndex = TRANSFER_STAGES.indexOf(definition.end)
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

export function buildTransferAttorneyCockpit(workflow = {}) {
  const lane = workflow?.lane || workflow || {}
  const usability = lane.workflowUsability || lane.actionSummary || workflow.actionSummary || {}
  const coordination = lane.coordinationSummary || {}
  const stageKey = normalizeAttorneyStageKey(
    lane.currentStage || lane.summary?.currentStage || usability.currentStage || '',
    'transfer',
  )
  const currentIndex = TRANSFER_STAGES.indexOf(stageKey)
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
    current: currentIndex >= TRANSFER_STAGES.indexOf(definition.start) && currentIndex <= TRANSFER_STAGES.indexOf(definition.end),
  }))
  const primaryAction = usability.primaryNextAction || null
  const canAct = lane.permissions?.canUpdateStage === true
  const blockers = [
    ...(Array.isArray(workflow.blockers) ? workflow.blockers : []),
    ...(readiness.assignment && !readiness.assignment.complete ? ['Transfer attorney assignment is outstanding.'] : []),
    ...(blockedDependencies ? [`${blockedDependencies} linked attorney ${blockedDependencies === 1 ? 'dependency is' : 'dependencies are'} blocking progress.`] : []),
  ]

  return Object.freeze({
    version: ATTORNEY_THREE_ROLE_PHASE3_VERSION,
    laneKey: 'transfer',
    title: 'Transfer Attorney Command Centre',
    valueProposition: 'One coordinated transfer file from instruction through registration and post-registration handover.',
    controlLabel: 'Transfer lane control',
    dependencyTitle: 'Linked attorney handoffs',
    dependencyDescription: 'Bond and cancellation progress is visible here, without cross-lane editing.',
    emptyDependencyMessage: 'No linked legal handoffs are required yet.',
    currentStage: stageKey,
    currentStageLabel: usability.currentStageLabel || workflow.nextStep || 'Not started',
    progressPercent: toCount(workflow.progressPercent ?? lane.summary?.completionPercent),
    status: laneStatus || 'not_started',
    canAct,
    readOnlyReason: canAct ? '' : (lane.permissions?.readOnlyReason || 'This lane is visible for coordination, but only the assigned transfer team may change it.'),
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
