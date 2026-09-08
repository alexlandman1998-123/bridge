import { getApplicableAttorneyTaskDefinitions, resolveMatterWorkflowPlan } from './attorneyWorkflow/matterWorkflowPlanService.js'
import { normalizeAttorneyStageKey, getAttorneyJourneyPhaseForStage } from '../constants/attorneyWorkflowStages.js'
import { isAttorneyTaskResolved, summarizeAttorneyTaskOutcomes } from '../core/transactions/attorneyTaskOutcomes.js'

export function buildMatterListProgress(transaction, laneKey, lane, records = []) {
  const workflowPlan = resolveMatterWorkflowPlan(transaction.routing_profile_json || {})
  if (!lane || (workflowPlan?.status === 'active' && !workflowPlan.laneKeys.includes(laneKey))) {
    return { canonical: true, label: 'Workflow not available', steps: [], totalCount: 0, completedCount: 0, percent: 0, nextAction: 'Review matter setup', status: 'not_started' }
  }
  const byKey = new Map(records.map(row => [normalizeAttorneyStageKey(row.step_key, laneKey), row]))
  const tasks = getApplicableAttorneyTaskDefinitions({ laneKey, workflowPlan, facts: { financeType: transaction.finance_type } })
    .map(task => ({ ...task, status: byKey.get(task.key)?.status || 'not_started' }))
  const counts = summarizeAttorneyTaskOutcomes(tasks)
  const next = tasks.find(task => !isAttorneyTaskResolved(task.status))
  const phase = next ? getAttorneyJourneyPhaseForStage(next.key, laneKey) : null
  return { canonical: true, label: next ? phase?.label || next.label : 'Workflow complete', steps: [],
    completedCount: counts.completed, totalCount: counts.total, percent: counts.percent,
    nextAction: next?.label || 'Workflow complete', taskKey: next?.key || '', status: next?.status || 'completed' }
}

// Read only, batched, and subject to the caller's existing RLS permissions.
export async function fetchMatterListProgress(client, transactions) {
  if (!transactions.length) return new Map()
  const lanes = await client.from('transaction_subprocesses')
    .select('id, transaction_id, process_type, attorney_assignment_id, created_at')
    .in('transaction_id', transactions.map(t => t.id)).in('process_type', ['transfer', 'attorney', 'bond', 'cancellation'])
    .order('created_at', { ascending: true })
  if (lanes.error) throw lanes.error
  const rows = lanes.data || []
  const steps = []
  // Keep each request below the API row cap rather than silently dropping later matters.
  for (let offset = 0; offset < rows.length; offset += 10) {
    const result = await client.from('transaction_subprocess_steps')
      .select('subprocess_id, step_key, status').in('subprocess_id', rows.slice(offset, offset + 10).map(l => l.id)).order('sort_order', { ascending: true })
    if (result.error) throw result.error
    steps.push(...(result.data || []))
  }
  const grouped = new Map()
  for (const step of steps) grouped.set(step.subprocess_id, [...(grouped.get(step.subprocess_id) || []), step])
  return new Map(transactions.map(t => [t.id, { transaction: t, lanes: rows.filter(l => l.transaction_id === t.id), steps: grouped }]))
}
