export const ATTORNEY_COORDINATION_PHASE6_VERSION = 'attorney-coordination-acceptance-v1'

export const ATTORNEY_COORDINATION_PHASE6_SCENARIOS = Object.freeze([
  'bond_nomination_allocation',
  'cancellation_nomination_allocation',
  'bond_direct_progress',
  'cancellation_direct_progress',
  'delegation_granted',
  'delegated_workflow_action',
  'delegated_action_propagated',
  'delegation_revoked',
  'revoked_action_denied',
  'expired_action_denied',
  'internal_update_hidden_from_clients',
])

export const ATTORNEY_COORDINATION_PHASE6_DESTINATIONS = Object.freeze([
  'attorney_workspace',
  'transaction_sync',
  'televent_updates',
])

function text(value) {
  return String(value || '').trim()
}

function validTimestamp(value) {
  return Boolean(value && !Number.isNaN(new Date(value).getTime()))
}

export function buildAttorneyCoordinationPhase6Decision({ schema = {}, evidence = null } = {}) {
  const blockers = []
  const failures = []
  if (!schema.stagingSafe) blockers.push('A positively identified staging target is required.')
  for (const item of ['delegationTable', 'delegationAttribution', 'sharedProgressAttribution']) {
    if (!schema[item]) blockers.push(`Required database capability is unavailable: ${item}.`)
  }
  if (blockers.length) return { status: 'BLOCKED', blockers, failures, passedScenarios: 0 }
  if (!evidence) return { status: 'READY_TO_RUN', blockers, failures, passedScenarios: 0 }

  if (evidence.version !== ATTORNEY_COORDINATION_PHASE6_VERSION) failures.push('Evidence version is not current.')
  if (evidence.environment !== 'staging') failures.push('Evidence must come from staging.')
  if (!text(evidence.transactionId) || !text(evidence.codeRevision)) failures.push('Transaction and code revision are required.')
  if (!validTimestamp(evidence.startedAt) || !validTimestamp(evidence.completedAt) || new Date(evidence.completedAt) <= new Date(evidence.startedAt)) {
    failures.push('A valid execution window is required.')
  }

  const actors = evidence.actors || {}
  const actorIds = ['transfer', 'bond', 'cancellation'].map((role) => text(actors[role]?.userId))
  if (actorIds.some((id) => !id) || new Set(actorIds).size !== 3) failures.push('Three distinct assigned attorney actors are required.')
  if (!text(actors.bond?.firmId) || !text(actors.cancellation?.firmId)) failures.push('Responsible bond and cancellation firms are required.')

  const scenarioMap = new Map((evidence.scenarios || []).map((item) => [item.id, item]))
  for (const id of ATTORNEY_COORDINATION_PHASE6_SCENARIOS) {
    const scenario = scenarioMap.get(id)
    if (!scenario || scenario.status !== 'passed' || !text(scenario.evidence)) failures.push(`Scenario did not pass with evidence: ${id}.`)
  }
  for (const destination of ATTORNEY_COORDINATION_PHASE6_DESTINATIONS) {
    if (evidence.destinations?.[destination] !== true) failures.push(`Propagation destination was not verified: ${destination}.`)
  }
  if (evidence.attribution?.actualActorPreserved !== true) failures.push('Delegated action did not preserve the actual actor.')
  if (evidence.attribution?.responsibleFirmPreserved !== true) failures.push('Delegated action did not preserve the responsible firm.')
  if (evidence.attribution?.delegationIdPreserved !== true) failures.push('Delegated action did not preserve the delegation grant.')
  if (evidence.ui?.desktopPassed !== true || evidence.ui?.mobilePassed !== true || evidence.ui?.keyboardPassed !== true) {
    failures.push('Desktop, mobile and keyboard workspace acceptance must pass.')
  }
  if ((evidence.defects || []).some((defect) => ['P0', 'P1'].includes(defect.severity) && defect.status !== 'closed')) {
    failures.push('An unresolved P0/P1 defect remains.')
  }

  return {
    status: failures.length ? 'FAILED' : 'PASSED',
    blockers,
    failures,
    passedScenarios: ATTORNEY_COORDINATION_PHASE6_SCENARIOS.filter((id) => scenarioMap.get(id)?.status === 'passed').length,
  }
}
