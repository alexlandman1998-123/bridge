import { getAttorneyStageDefinitionsForLane } from '../../constants/attorneyWorkflowStages.js'
import { buildSharedMatterJourney, journeyTaskId, JOURNEY_TASK_STATUSES, LEGAL_JOURNEY_LANES } from '../../core/transactions/sharedMatterJourneyContract.js'
import { buildTransferWorkspaceViewModel, getLegalWorkspacePhases } from './transferWorkspaceViewModel.js'
import { resolveMatterWorkflowPlan, isMatterWorkflowPlanCurrent, diffMatterWorkflowPlans } from './matterWorkflowPlanService.js'

function clientSafeTaskLabel(definition = {}, laneKey = '') {
  if (definition.clientVisibleAllowed !== false) {
    return definition.sharedProgress?.client?.title || definition.label
  }
  if (laneKey === 'bond') return 'Bond registration progress'
  if (laneKey === 'cancellation') return 'Bond cancellation progress'
  return 'Transfer progress'
}

/** Internal adapter. Inputs must be an authorised, fully loaded matter snapshot. */
export function buildPlannedSharedMatterJourney({ transactionId, revision, planRevision, routingProfile = {},
  laneSnapshots = {}, documentsByLane = {}, previousPlan = null, overallJourney = null,
  coordinationLinks = [], now = new Date() } = {}) {
  const plan = resolveMatterWorkflowPlan(routingProfile)
  const laneKeys = plan.laneKeys
  if (!Array.isArray(laneKeys) || new Set(laneKeys).size !== laneKeys.length || laneKeys.some(key => !LEGAL_JOURNEY_LANES.includes(key))) throw new Error('Invalid plan lane keys')
  if (!Array.isArray(plan.lanes) || plan.lanes.length !== laneKeys.length || plan.lanes.some(lane => !laneKeys.includes(lane.laneKey)) || new Set(plan.lanes.map(lane => lane.laneKey)).size !== laneKeys.length) throw new Error('Plan lanes disagree')
  const retainedHistory = []
  const requirementsByTaskId = {}
  const activeIds = new Set()
  const storedByLane = new Map()
  for (const [laneKey, snapshot] of Object.entries(laneSnapshots)) {
    if (!LEGAL_JOURNEY_LANES.includes(laneKey) || !Array.isArray(snapshot?.steps)) throw new Error('Invalid lane snapshot')
    const stored = new Map()
    for (const row of snapshot.steps) {
      const key = row.stepKey || row.step_key
      if (typeof key !== 'string' || !key || stored.has(key)) throw new Error('Missing or duplicate persisted task key')
      if (!JOURNEY_TASK_STATUSES.includes(row.status)) throw new Error('Unknown persisted task status')
      stored.set(key, row)
    }
    storedByLane.set(laneKey, stored)
  }
  const lanes = plan.lanes.map(plannedLane => {
    const laneKey = plannedLane.laneKey
    if (!storedByLane.has(laneKey)) throw new Error(`Lane snapshot not loaded: ${laneKey}`)
    const definitions = getAttorneyStageDefinitionsForLane(laneKey)
    const catalog = new Map(definitions.map(task => [task.key, task]))
    if (!Array.isArray(plannedLane.stepKeys) || new Set(plannedLane.stepKeys).size !== plannedLane.stepKeys.length || plannedLane.stepKeys.some(key => !catalog.has(key))) throw new Error('Unknown or duplicate planned task')
    const phaseDefinitions = getLegalWorkspacePhases(laneKey)
    for (const key of plannedLane.stepKeys) {
      if (phaseDefinitions.filter(phase => phase.stageKeys.includes(key)).length !== 1) throw new Error(`Task must belong to exactly one phase: ${key}`)
    }
    const view = buildTransferWorkspaceViewModel({ workflowKey: laneKey, now,
      workflow: { workflowPlan: plan, facts: routingProfile, lane: laneSnapshots[laneKey] },
      documents: documentsByLane[laneKey] || [] })
    const stored = storedByLane.get(laneKey)
    return { key: laneKey, phases: view.phases.filter(phase => phase.tasks.length).map(phase => ({
      key: phase.key, label: phase.label, clientLabel: phase.label,
      tasks: phase.tasks.map(task => {
        const id = journeyTaskId(transactionId, laneKey, task.key)
        activeIds.add(id)
        // Only static catalog wording enters shared labels, never comments or profile values.
        requirementsByTaskId[id] = {
          data: (task.dataRequirements || []).map(item => ({ key: item.id, complete: Boolean(item.complete), required: item.required !== false })),
          documents: (task.relatedDocuments || []).map(item => ({ key: item.key || item.sourceRequirementKey || item.id, ready: item.ready === true })),
          applicabilitySuggestion: task.applicabilitySuggestion || '',
        }
        return { key: task.key, label: catalog.get(task.key).label, clientLabel: clientSafeTaskLabel(catalog.get(task.key), laneKey),
          status: task.status, revision: stored.get(task.key)?.revision ?? revision,
          outstandingEvidenceCount: task.missingDocumentCount || 0 }
      }),
    })) }
  })
  for (const [laneKey, stored] of storedByLane) {
    for (const [key, row] of stored) {
      const id = journeyTaskId(transactionId, laneKey, key)
      if (!activeIds.has(id)) retainedHistory.push({ id, laneKey, taskKey: key, status: row.status,
        persistedRowId: row.id || null, revision: row.revision ?? revision })
    }
  }
  const links = coordinationLinks.map(link => {
    const from = journeyTaskId(transactionId, link.from.laneKey, link.from.taskKey)
    const to = journeyTaskId(transactionId, link.to.laneKey, link.to.taskKey)
    if (!activeIds.has(from) || !activeIds.has(to) || from === to) throw new Error('Invalid coordination link')
    return { fromTaskId: from, toTaskId: to, advisory: true }
  })
  return {
    journey: buildSharedMatterJourney({ transactionId, revision, planRevision, lanes, overallJourney }),
    plan, requirementsByTaskId, coordinationLinks: links, retainedHistory,
    review: {
      provisional: Boolean(plan.provisional),
      profileChanged: routingProfile.matterProfile?.status === 'confirmed' && !isMatterWorkflowPlanCurrent(plan, routingProfile),
      changes: previousPlan ? diffMatterWorkflowPlans(previousPlan, plan) : null,
      excludedWorkedTasks: retainedHistory.filter(task => task.status !== 'not_started'),
    },
  }
}
