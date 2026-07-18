export const ATTORNEY_GOLDEN_PATH_STAGES = [
  { key: 'instruction', label: 'Receive instruction', target: 'overview' },
  { key: 'decision', label: 'Accept or decline', target: 'overview' },
  { key: 'assignment', label: 'Assign conveyancer and assistant', target: 'stakeholders' },
  { key: 'review', label: 'Review parties, property, finance and existing bond', target: 'parties' },
  { key: 'documents', label: 'Request missing FICA and documents', target: 'documents' },
  { key: 'clearances', label: 'Obtain duty, rates, levy and guarantees', target: 'finance' },
  { key: 'signing', label: 'Prepare and sign transfer documents', target: 'transfer' },
  { key: 'lodgement_ready', label: 'Confirm lodgement readiness', target: 'transfer' },
  { key: 'lodgement', label: 'Record lodgement', target: 'transfer' },
  { key: 'registration', label: 'Record registration and close', target: 'transfer' },
]

const COMPLETE_DOCUMENT_STATUSES = new Set(['verified', 'approved', 'accepted', 'complete', 'completed', 'not_applicable'])
const COMMUNICATION_CATEGORIES = new Set(['notes', 'internal', 'invitations', 'documents', 'alert'])
const GUIDE_CHECK_LABELS = {
  assignment: 'Responsible person assigned',
  data: 'Matter information captured',
  documents: 'Supporting documents received',
  signatures: 'Required signatures obtained',
  evidence: 'Stage completion proof recorded',
}

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s/-]+/g, '_')
}

function asDate(value) {
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date : null
}

function firstText(...values) {
  return values.find((value) => String(value || '').trim()) || ''
}

function getMatterSignal(transaction = {}, lifecycleStage = '', transferStage = '', workflows = []) {
  return normalize([
    lifecycleStage,
    transferStage,
    transaction?.status,
    transaction?.stage,
    transaction?.attorney_stage,
    transaction?.attorneyStage,
    transaction?.operational_state,
    transaction?.operationalState,
    transaction?.current_sub_stage_summary,
    transaction?.currentSubStageSummary,
    ...workflows.flatMap((workflow) => [
      workflow?.statusKey,
      workflow?.statusLabel,
      workflow?.nextStep,
      workflow?.lane?.currentStage,
      workflow?.lane?.summary?.currentStage,
    ]),
  ].filter(Boolean).join(' '))
}

function resolveCurrentStageIndex({ transaction, lifecycleStage, transferStage, workflows, missingDocuments }) {
  const signal = getMatterSignal(transaction, lifecycleStage, transferStage, workflows)
  const registrationDate = firstText(
    transaction?.registration_date,
    transaction?.registrationDate,
    transaction?.registered_at,
    transaction?.registeredAt,
  )

  if (registrationDate || /(^|_)(registered|registration_complete|completed|closed)($|_)/.test(signal)) return 9
  if (/lodged|lodgement_recorded|in_deeds_office/.test(signal)) return 8
  if (/ready_for_lodgement|lodgement_ready|ready_for_registration/.test(signal)) return 7
  if (/(^|_)registration($|_)/.test(signal)) return 7
  if (/signing|signature|signed|drafting|prepare_transfer/.test(signal)) return 6
  if (/clearance|rates|levy|transfer_duty|guarantee/.test(signal)) return 5
  if (/fica|document|compliance/.test(signal)) return 4
  if (/transfer|finance|bond|review|party|property/.test(signal)) return missingDocuments.length ? 4 : 3
  if (/assigned|allocated|accepted|instruction_accepted/.test(signal)) return 2
  if (/declined|awaiting_acceptance|accept_or_decline|instruction_received|incoming/.test(signal)) return 1
  return 0
}

function getBlockers({ explicitBlockers = [], workflows = [], missingDocuments = [] }) {
  const workflowBlockers = workflows.flatMap((workflow) => [
    ...(Array.isArray(workflow?.blockers) ? workflow.blockers : []),
    ...(Array.isArray(workflow?.lane?.blockers) ? workflow.lane.blockers : []),
  ])
  const documentBlockers = missingDocuments
    .filter((document) => document.blocksStage)
    .map((document) => `${document.displayName} is required before the matter can proceed.`)

  return [...new Set([...explicitBlockers, ...workflowBlockers, ...documentBlockers].filter(Boolean).map(String))]
}

function resolveWaitingOn(missingDocuments, blockers, primaryAction) {
  const blockingDocument = missingDocuments.find((document) => document.blocksStage) || missingDocuments[0]
  if (blockingDocument) {
    return {
      label: blockingDocument.requiredParty || 'Client',
      detail: `${blockingDocument.displayName} is ${normalize(blockingDocument.status).replaceAll('_', ' ') || 'outstanding'}.`,
    }
  }
  if (blockers.length) return { label: 'Matter team', detail: blockers[0] }
  if (primaryAction?.waitingOn) return { label: primaryAction.waitingOn, detail: primaryAction.description || '' }
  return { label: 'Internal team', detail: 'The next action is with your firm.' }
}

function resolveEscalation({ blockers, dueDate, now }) {
  const due = asDate(dueDate)
  const today = asDate(now) || new Date()
  if (due && due.getTime() < today.getTime()) {
    return { state: 'overdue', label: 'Overdue', detail: `Due ${due.toLocaleDateString('en-ZA')}` }
  }
  if (blockers.length) return { state: 'attention', label: 'Attention required', detail: blockers[0] }
  if (due) {
    const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000)
    if (days <= 2) return { state: 'watch', label: 'Due soon', detail: `Due ${due.toLocaleDateString('en-ZA')}` }
  }
  return { state: 'clear', label: 'No escalation', detail: 'No overdue action or active blocker.' }
}

function workflowGuideScore(workflow = {}) {
  const summary = workflow?.actionSummary || {}
  const incomplete = (summary.readinessChecklist || []).filter((item) => !item.complete).length
  const urgentAction = summary.primaryNextAction?.priority === 'critical' || summary.primaryNextAction?.priority === 'high'
  return (workflow?.statusKey === 'blocked' ? 100 : 0) + (urgentAction ? 50 : 0) + incomplete * 5 + (workflow?.key === 'transfer' ? 1 : 0)
}

export function buildAttorneyMatterGuidance(workflows = []) {
  const workstreams = workflows
    .filter((workflow) => workflow?.required !== false)
    .map((workflow) => {
      const summary = workflow?.actionSummary || {}
      const readiness = (summary.readinessChecklist || []).map((item) => ({
        ...item,
        label: GUIDE_CHECK_LABELS[item.id] || item.label,
        statusLabel: item.complete ? 'Complete' : `${item.missingCount || 1} outstanding`,
      }))
      const completedCount = readiness.filter((item) => item.complete).length
      return {
        key: workflow.key,
        title: workflow.title,
        detailKey: workflow.detailKey,
        statusKey: workflow.statusKey,
        statusLabel: workflow.statusLabel,
        progressPercent: workflow.progressPercent || 0,
        currentStageLabel: summary.currentStageLabel || workflow.nextStep || 'Workflow review',
        attentionSummary: summary.attentionSummary || workflow.summary || 'No immediate issue needs attention.',
        readiness,
        completedCount,
        totalCount: readiness.length,
        evidence: summary.evidenceChecklist || [],
        nextActions: (summary.nextActions || (summary.primaryNextAction ? [summary.primaryNextAction] : [])).slice(0, 4),
        workflow,
        score: workflowGuideScore(workflow),
      }
    })
    .sort((left, right) => right.score - left.score)

  return {
    workstreams,
    recommendedWorkflowKey: workstreams[0]?.key || '',
    outstandingCount: workstreams.reduce(
      (total, workstream) => total + workstream.readiness.filter((item) => !item.complete).length,
      0,
    ),
  }
}

export function buildAttorneyMatterToday({
  transaction = {},
  lifecycleStage = '',
  transferStage = '',
  requiredDocumentRows = [],
  activityFeed = [],
  workflows = [],
  primaryAction = null,
  blockers: explicitBlockers = [],
  now = new Date(),
} = {}) {
  const missingDocuments = requiredDocumentRows.filter((document) => {
    if (document?.satisfiesRequirement && !['rejected', 'expired'].includes(normalize(document?.status))) return false
    return !COMPLETE_DOCUMENT_STATUSES.has(normalize(document?.status))
  })
  const blockers = getBlockers({ explicitBlockers, workflows, missingDocuments })
  const currentStageIndex = resolveCurrentStageIndex({
    transaction,
    lifecycleStage,
    transferStage,
    workflows,
    missingDocuments,
  })
  const stages = ATTORNEY_GOLDEN_PATH_STAGES.map((stage, index) => ({
    ...stage,
    number: index + 1,
    state: index < currentStageIndex ? 'completed' : index === currentStageIndex ? 'current' : 'upcoming',
  }))
  const currentStage = stages[currentStageIndex]
  const nextAction = {
    title: primaryAction?.title || currentStage.label,
    description: primaryAction?.description || `Complete stage ${currentStage.number} of the transfer journey.`,
    label: primaryAction?.primaryActionLabel || 'Open workspace',
    target: primaryAction?.primaryActionTarget || currentStage.target,
    priority: primaryAction?.priority || (blockers.length ? 'high' : 'normal'),
  }
  const dueDate = firstText(
    primaryAction?.dueDate,
    transaction?.next_action_due_at,
    transaction?.nextActionDueAt,
    transaction?.due_date,
    transaction?.dueDate,
  )
  const latestCommunication = activityFeed.find((entry) =>
    COMMUNICATION_CATEGORIES.has(normalize(entry?.category)) || entry?.kind === 'comment',
  ) || activityFeed[0] || null

  return {
    stages,
    currentStage,
    nextAction,
    waitingOn: resolveWaitingOn(missingDocuments, blockers, primaryAction),
    dueDate,
    blockers,
    missingDocuments,
    latestCommunication,
    escalation: resolveEscalation({ blockers, dueDate, now }),
    guidance: buildAttorneyMatterGuidance(workflows),
  }
}
