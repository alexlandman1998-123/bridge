import { buildSharedMatterJourney, presentSharedMatterJourney } from '../core/transactions/sharedMatterJourneyContract.js'

export function projectSharedMatterJourneyRead(source, { audience = 'buyer' } = {}) {
  if (source?.schemaVersion !== 1) throw new Error('Unsupported shared journey')
  // Evidence readiness is deliberately not part of this recipient-safe endpoint.
  // Supply a neutral internal value, then strip it via the phase 1 allowlist.
  const journey = buildSharedMatterJourney({
    ...source,
    lanes: source.lanes.map(lane => ({ ...lane, phases: lane.phases.map(phase => ({
      ...phase, tasks: phase.tasks.map(task => ({ ...task,
        // Portal keys are phase-local; the internal model requires lane-wide
        // uniqueness. Namespace only redacted keys, never canonical work keys.
        key: /^task_\d+$/.test(task.key) ? `${phase.key}:${task.key}` : task.key,
        // The portal RPC already projects neutral labels and task identifiers.
        // Never use a professional label as a client-label fallback.
        clientLabel: task.clientLabel || (/^task_\d+$/.test(task.key) ? task.label : 'Matter update'),
        outstandingEvidenceCount: 0 })),
    })) })),
  })
  // Only the explicit persisted active-plan manifest establishes applicability.
  // Old readers and legacy task lists remain visible but cannot prove milestones.
  return { ...presentSharedMatterJourney(journey, audience),
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

export function sharedJourneyAudienceForRole(role = '') {
  const key = String(role).trim().toLowerCase()
  if (['attorney', 'transfer_attorney', 'bond_attorney', 'cancellation_attorney'].includes(key)) return 'attorney'
  if (['agent', 'agency'].includes(key)) return 'agent'
  if (key === 'developer') return 'developer'
  return key === 'seller' ? 'seller' : 'buyer'
}

export async function fetchSharedMatterJourney(client, transactionId, { audience = 'buyer' } = {}) {
  if (!client?.rpc || !transactionId) return { status: 'unavailable', snapshot: null }
  for (let attempt = 0; attempt < 2; attempt += 1) {
  try {
    const professionalAudience = ['attorney', 'developer', 'agent'].includes(audience)
    const result = await client.rpc(
      professionalAudience ? 'bridge_read_professional_matter_journey' : 'bridge_read_shared_matter_journey',
      { p_transaction_id: transactionId },
    )
    if (result.error) throw result.error
    if (result.data?.transactionId !== transactionId) throw new Error('Wrong matter snapshot')
    return { status: 'ready', snapshot: projectSharedMatterJourneyRead(result.data, { audience }) }
  } catch (error) {
    const retryable = ['57014', '08006', '08001', '53300'].includes(error?.code) ||
      (!error?.code && /failed to fetch|network|timeout/i.test(error?.message || ''))
    if (retryable && attempt === 0) {
      await new Promise(resolve => setTimeout(resolve, 400))
      continue
    }
    return { status: 'unavailable', snapshot: null,
      retryable }
  }
  }
}

export async function fetchSellerSharedMatterJourney(client, token, accessToken) {
  // Retry only read-only, transient failures. Never retry denied/expired access
  // or substitute an old snapshot for a fresh authorisation decision.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await client.rpc('bridge_read_seller_shared_matter_journey', {
        p_token: token, p_access_token: accessToken || null,
      })
      if (result.error) throw result.error
      return result.data ? { status: 'ready', snapshot: projectSharedMatterJourneyRead(result.data, { audience: 'seller' }) } : null
    } catch (error) {
      const retryable = ['57014', '08006', '08001', '53300'].includes(error?.code)
        || (!error?.code && /failed to fetch|network|timeout/i.test(error?.message || ''))
      if (!retryable || attempt === 1) throw error
      await new Promise(resolve => setTimeout(resolve, 400))
    }
  }
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
