export const ATTORNEY_THREE_ROLE_PHASE9_VERSION = 'attorney_three_role_intervention_engine_phase9_v1'

const ROLE_LABELS = Object.freeze({
  transfer_attorney: 'Transfer Attorney',
  bond_attorney: 'Bond Attorney',
  cancellation_attorney: 'Cancellation Attorney',
})

function isoDatePlusDays(now, days) {
  const date = new Date(now || Date.now())
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function workItem(definition) {
  return Object.freeze({ status: 'open', ...definition, checklist: Object.freeze(definition.checklist || []) })
}

function assignmentItem(intervention, roleKey, now) {
  const roleLabel = ROLE_LABELS[roleKey] || 'Attorney'
  return workItem({
    id: `${intervention.matterId}:assign:${roleKey}`,
    matterId: intervention.matterId,
    matterReference: intervention.matterReference,
    type: 'assign_required_role',
    roleKey,
    title: `Assign ${roleLabel}`,
    detail: `${roleLabel} coverage is required before the linked legal workflow can be controlled.`,
    owner: 'director_partner',
    ownerLabel: 'Director / Firm Admin',
    priority: 'critical',
    dueDate: isoDatePlusDays(now, 1),
    actionHref: intervention.actionHref,
    checklist: ['Confirm the appointment authority.', 'Capture the appointed firm and primary attorney.', 'Confirm instruction acceptance before activating the lane.'],
  })
}

function overdueItem(intervention, now) {
  return workItem({
    id: `${intervention.matterId}:overdue-action`,
    matterId: intervention.matterId,
    matterReference: intervention.matterReference,
    type: 'recover_overdue_action',
    title: 'Recover overdue next action',
    detail: 'The recorded next action is overdue and needs a named owner and revised evidence-backed date.',
    owner: 'assigned_matter_team',
    ownerLabel: 'Assigned Matter Team',
    priority: 'high',
    dueDate: isoDatePlusDays(now, 1),
    actionHref: intervention.actionHref,
    checklist: ['Confirm the current blocker or dependency.', 'Set the accountable owner and recovery date.', 'Record the recovery update on the authorised lane.'],
  })
}

function staleItem(intervention, now) {
  return workItem({
    id: `${intervention.matterId}:stale-matter`,
    matterId: intervention.matterId,
    matterReference: intervention.matterReference,
    type: 'reactivate_stale_matter',
    title: `Reactivate matter after ${intervention.staleDays} inactive days`,
    detail: 'No meaningful activity has been recorded within the operating threshold.',
    owner: 'primary_attorney',
    ownerLabel: 'Primary Attorney',
    priority: intervention.staleDays >= 14 ? 'critical' : 'high',
    dueDate: isoDatePlusDays(now, 1),
    actionHref: intervention.actionHref,
    checklist: ['Review the current legal stage and latest evidence.', 'Contact the party holding the next dependency.', 'Publish an internal recovery update and next review date.'],
  })
}

function riskItem(intervention, now) {
  return workItem({
    id: `${intervention.matterId}:risk-review`,
    matterId: intervention.matterId,
    matterReference: intervention.matterReference,
    type: 'matter_risk_review',
    title: 'Complete attorney risk review',
    detail: 'The matter is marked at risk and requires a cross-lane owner, cause and recovery decision.',
    owner: 'director_partner',
    ownerLabel: 'Director / Firm Admin',
    priority: intervention.overdue || intervention.missingRoles.length ? 'critical' : 'high',
    dueDate: isoDatePlusDays(now, 1),
    actionHref: intervention.actionHref,
    checklist: ['Confirm the root cause and affected attorney lanes.', 'Agree a recovery owner and target date.', 'Escalate any unresolved external dependency.'],
  })
}

export function buildAttorneyThreeRoleInterventionQueue({ rollout = null, now = null } = {}) {
  const generated = []
  for (const intervention of rollout?.interventions || []) {
    for (const roleKey of intervention.missingRoles || []) generated.push(assignmentItem(intervention, roleKey, now))
    if (intervention.overdue) generated.push(overdueItem(intervention, now))
    if (intervention.staleDays >= 7) generated.push(staleItem(intervention, now))
    if (intervention.atRisk) generated.push(riskItem(intervention, now))
  }
  const uniqueItems = [...new Map(generated.map((item) => [item.id, item])).values()]
  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 }
  uniqueItems.sort((left, right) => (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9))
  const counts = uniqueItems.reduce((summary, item) => {
    summary[item.priority] = (summary[item.priority] || 0) + 1
    summary[item.type] = (summary[item.type] || 0) + 1
    return summary
  }, { critical: 0, high: 0, medium: 0, low: 0 })

  return Object.freeze({
    version: ATTORNEY_THREE_ROLE_PHASE9_VERSION,
    rolloutDecision: rollout?.decision || 'insufficient_data',
    canExpandPilot: rollout?.decision === 'go' && counts.critical === 0 && uniqueItems.length === 0,
    expansionGuardReason: rollout?.decision === 'go' && counts.critical === 0 && uniqueItems.length === 0
      ? 'No open portfolio intervention blocks expansion.'
      : counts.critical
        ? `${counts.critical} critical intervention${counts.critical === 1 ? '' : 's'} must close before expansion.`
        : 'Portfolio thresholds must return to go before expansion.',
    items: Object.freeze(uniqueItems),
    counts: Object.freeze(counts),
    openCount: uniqueItems.length,
    generatedAt: new Date(now || Date.now()).toISOString(),
  })
}

export function serializeAttorneyThreeRoleInterventionQueue(queue) {
  return JSON.stringify({
    version: queue?.version,
    generatedAt: queue?.generatedAt,
    rolloutDecision: queue?.rolloutDecision,
    canExpandPilot: queue?.canExpandPilot,
    counts: queue?.counts,
    items: queue?.items,
  }, null, 2)
}

