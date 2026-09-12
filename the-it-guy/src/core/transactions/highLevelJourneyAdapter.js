import { evaluateHighLevelJourney } from './highLevelJourneyRules.js'

// Recipient-safe projection. Commercial outcomes are supplied by the authorised
// rollup; legal outcomes are recomputed from the same reader used by detail.
export function buildSharedHighLevelJourney(snapshot = {}) {
  const legal = snapshot.legalJourney
  const source = legal?.status === 'ready' ? legal.snapshot : null
  const valid = source?.transactionId === snapshot.transactionId &&
    Number.isSafeInteger(source?.revision) && source.revision >= 0 &&
    source.planRevision === source.revision && Array.isArray(source.lanes) &&
    Array.isArray(source.requiredLaneKeys) &&
    JSON.stringify([...source.requiredLaneKeys].sort()) === JSON.stringify(source.lanes.map(l => l.key).sort()) &&
    source.lanes.every(l => Array.isArray(l.phases) && l.phases.every(p =>
      Array.isArray(p.tasks) && p.tasks.every(t => t.revision === source.revision)))
  const facts = source?.commercialFacts
  const factsValid = source?.transactionId === snapshot.transactionId && facts?.version === 1 &&
    Number.isSafeInteger(source?.revision) && source.revision >= 0 && facts.revision === source.revision
  const workflows = {}
  for (const step of factsValid && Array.isArray(facts.steps) ? facts.steps : []) {
    if (!Object.hasOwn(workflows, step.workflowKey)) Object.defineProperty(workflows, step.workflowKey, { value: { requiredSteps: [] }, enumerable: true })
    workflows[step.workflowKey].requiredSteps.push(step)
  }
  const evaluated = evaluateHighLevelJourney({ factsAvailable: factsValid, workflows, financeType: facts?.financeType,
    legalJourney: valid ? legal : null,
    requiredLaneKeys: valid ? source.requiredLaneKeys : null })
  const commercial = snapshot.highLevelJourney?.ruleVersion === 1 ? snapshot.highLevelJourney.milestones : []
  return { ...evaluated, milestones: evaluated.milestones.map((m, index) => {
    const matches = commercial.filter(item => item.id === m.id)
    if (facts || index > 1 || matches.length !== 1) return m
    const status = matches[0].status
    return ['unknown', 'pending', 'in_progress', 'waiting', 'blocked', 'complete'].includes(status)
      ? { ...m, status, isComplete: status === 'complete' } : m
  }) }
}

// One read-only adapter for both developer surfaces. Never fall back to the
// positional legacy milestones if facts or the active plan are unavailable.
export function buildDeveloperJourneySnapshot({ transaction, rollup, plan, financeType } = {}) {
  const id = transaction?.id
  const sameMatter = Boolean(id && rollup?.transactionId === id)
  const source = sameMatter ? rollup.transactionJourneySnapshot?.legalJourney : null
  const snapshot = source?.status === 'ready' ? source.snapshot : null
  // The authorised reader exposes requiredLaneKeys only for an active saved
  // manifest. Route-core intentionally omits the large routing JSON, so use
  // that reader's manifest rather than waiting for the attorney workbench.
  // An explicitly supplied plan is still compared strictly below.
  if (!plan && Array.isArray(snapshot?.requiredLaneKeys) && snapshot.requiredLaneKeys.length &&
      JSON.stringify([...snapshot.requiredLaneKeys].sort()) === JSON.stringify(snapshot.lanes.map(l=>l.key).sort())) {
    plan = { status: 'active', lanes: snapshot.lanes.map(l=>({laneKey:l.key,
      stepKeys:l.phases.flatMap(p=>p.tasks.map(t=>t.key))})) }
  }
  let legalJourney = { status: 'unavailable', snapshot: null }
  const validPlan = plan?.status === 'active' && Array.isArray(plan.lanes) && plan.lanes.length > 0 &&
    plan.lanes.every(l => Array.isArray(l.stepKeys) && l.stepKeys.length > 0)
  if (validPlan && snapshot?.transactionId === id && Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0 &&
    snapshot.planRevision === snapshot.revision && Array.isArray(snapshot.lanes)) {
    const expected = plan.lanes.flatMap(l => l.stepKeys.map(k => `${l.laneKey}:${k}`)).sort()
    const actual = snapshot.lanes.flatMap(l => (l.phases || []).flatMap(p => (p.tasks || []).map(t => `${l.key}:${t.key}`))).sort()
    const revisionsMatch = snapshot.lanes.every(l => (l.phases || []).every(p => (p.tasks || []).every(t => t.revision === snapshot.revision)))
    if (revisionsMatch && new Set(expected).size === expected.length && new Set(actual).size === actual.length && JSON.stringify(expected) === JSON.stringify(actual)) legalJourney = source
  }
  const highLevelJourney = snapshot?.commercialFacts ? buildSharedHighLevelJourney({
    transactionId: id, legalJourney: legalJourney.status === 'ready' ? legalJourney : { ...source,
      snapshot: { ...snapshot, requiredLaneKeys: null } },
  }) : evaluateHighLevelJourney({
    workflows: sameMatter ? rollup.workflows : {}, financeType,
    factsAvailable: sameMatter && rollup.usedLegacyFallback === false,
    legalJourney, requiredLaneKeys: validPlan ? plan.lanes.map(l => l.laneKey) : null,
    lifecycleState: transaction?.lifecycle_state,
  })
  return { highLevelJourney, legalJourney }
}
