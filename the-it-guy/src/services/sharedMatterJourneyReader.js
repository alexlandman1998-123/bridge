import { buildSharedMatterJourney, presentSharedMatterJourney } from '../core/transactions/sharedMatterJourneyContract.js'

export function projectSharedMatterJourneyRead(source) {
  if (source?.schemaVersion !== 1) throw new Error('Unsupported shared journey')
  // Evidence readiness is deliberately not part of this recipient-safe endpoint.
  // Supply a neutral internal value, then strip it via the phase 1 allowlist.
  const journey = buildSharedMatterJourney({
    ...source,
    lanes: source.lanes.map(lane => ({ ...lane, phases: lane.phases.map(phase => ({
      ...phase, tasks: phase.tasks.map(task => ({ ...task, outstandingEvidenceCount: 0 })),
    })) })),
  })
  // Only the explicit persisted active-plan manifest establishes applicability.
  // Old readers and legacy task lists remain visible but cannot prove milestones.
  return { ...presentSharedMatterJourney(journey, 'buyer'),
    commercialFacts: source.commercialFacts?.version === 1 ? {
      version: 1, revision: source.commercialFacts.revision,
      financeType: ['cash','bond','hybrid'].includes(source.commercialFacts.financeType) ? source.commercialFacts.financeType : null,
      steps: (Array.isArray(source.commercialFacts.steps) ? source.commercialFacts.steps : []).filter(step =>
        ['sales_otp:signed_otp_received', 'finance_cash:proof_of_funds_reviewed', 'finance_cash:cash_confirmation_approved',
          'finance_bond:quote_approved', 'finance_bond:instruction_sent', 'finance_hybrid:cash_portion_confirmed',
          'finance_hybrid:quote_approved', 'finance_hybrid:instruction_sent'].includes(`${step.workflowKey}:${step.key}`)
      ).map(step => ({ workflowKey: step.workflowKey, key: step.key, status: step.status })),
    } : null,
    requiredLaneKeys: source.planStatus === 'active' && Array.isArray(source.requiredLaneKeys)
      ? [...source.requiredLaneKeys] : null }
}

export async function fetchSharedMatterJourney(client, transactionId) {
  if (!client?.rpc || !transactionId) return { status: 'unavailable', snapshot: null }
  try {
    const result = await client.rpc('bridge_read_shared_matter_journey', { p_transaction_id: transactionId })
    if (result.error) return { status: 'unavailable', snapshot: null }
    if (result.data?.transactionId !== transactionId) throw new Error('Wrong matter snapshot')
    return { status: 'ready', snapshot: projectSharedMatterJourneyRead(result.data) }
  } catch {
    return { status: 'unavailable', snapshot: null }
  }
}

export async function fetchSellerSharedMatterJourney(client, token, accessToken) {
  const result = await client.rpc('bridge_read_seller_shared_matter_journey', {
    p_token: token, p_access_token: accessToken || null,
  })
  if (result.error) throw result.error
  return result.data ? { status: 'ready', snapshot: projectSharedMatterJourneyRead(result.data) } : null
}

export function sharedJourneyHeaderPhases(result, laneKey) {
  const phases = result?.status === 'ready' ? result.snapshot.lanes.find(lane => lane.key === laneKey)?.phases || [] : []
  let foundCurrent = false
  return phases.map(phase => {
    const outstanding = phase.tasks.filter(task => !['completed', 'completed_externally', 'not_applicable'].includes(task.status))
    const currentTask = outstanding[0] || null
    const hasCurrentTask = Boolean(currentTask && !foundCurrent)
    if (currentTask) foundCurrent = true
    const status = !phase.progress.applicableCount ? 'not_applicable' : !outstanding.length ? 'completed'
      : outstanding.some(task => task.status === 'blocked') ? 'blocked'
        : outstanding.some(task => task.status === 'waiting') ? 'waiting'
          : phase.tasks.some(task => ['in_progress', 'completed', 'completed_externally'].includes(task.status)) ? 'in_progress' : 'not_started'
    return { ...phase, status, currentTask, hasCurrentTask, completed: phase.progress.completedCount,
      total: phase.progress.applicableCount, notApplicable: phase.progress.notApplicableCount }
  })
}

export function alignWorkStepsWithSharedJourney(steps, laneRows, result, plan) {
  if (result?.status !== 'ready') throw new Error('Shared legal journey is unavailable. Refresh before updating work.')
  const tasksByLane = new Map(result.snapshot.lanes.map(lane => [lane.key,
    new Map(lane.phases.flatMap(phase => phase.tasks).map(task => [task.key, task]))]))
  if (plan?.status === 'active') {
    const expected = plan.lanes.flatMap(lane => lane.stepKeys.map(key => `${lane.laneKey}:${key}`)).sort()
    const actual = [...tasksByLane].flatMap(([lane, tasks]) => [...tasks.keys()].map(key => `${lane}:${key}`)).sort()
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('The matter plan changed. Refresh the workspace.')
  }
  const lanesById = new Map(laneRows.map(lane => [lane.id, lane.process_type === 'attorney' ? 'transfer' : lane.process_type]))
  return steps.flatMap(step => {
    const task = tasksByLane.get(lanesById.get(step.subprocess_id))?.get(step.step_key)
    return task ? [{ ...step, status: task.status }] : []
  })
}
