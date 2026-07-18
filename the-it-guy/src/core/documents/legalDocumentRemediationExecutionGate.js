function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

export function buildLegalDocumentRemediationExecutionGate(l2 = {}) {
  const actions = Array.isArray(l2.actions) ? l2.actions : []
  const actionIds = new Set(actions.map((action) => action.id).filter(Boolean))

  if (l2.launchReady === true && l2.status === 'READY_FOR_L3' && actions.length === 0) {
    return {
      status: 'READY_FOR_L4',
      gateComplete: true,
      currentWave: null,
      readyActionIds: [],
      heldActionIds: [],
      actionStates: [],
      blockers: [],
      nextActions: [],
    }
  }

  if (l2.planComplete !== true) {
    return {
      status: 'EXECUTION_BLOCKED',
      gateComplete: false,
      currentWave: null,
      readyActionIds: [],
      heldActionIds: actions.map((action) => action.id).filter(Boolean),
      actionStates: actions.map((action) => ({ id: action.id, wave: action.wave, state: 'held', unresolvedDependencies: unique(action.dependsOn), holdReason: 'L3_PLAN_INCOMPLETE' })),
      blockers: [{ code: 'L3_PLAN_INCOMPLETE', solution: 'Restore a complete L2 blocker-to-action plan before authorising remediation work.' }],
      nextActions: [],
    }
  }

  const graphStates = actions.map((action) => {
    const unresolvedDependencies = unique(action.dependsOn).filter((id) => actionIds.has(id))
    return { action, unresolvedDependencies }
  })
  const dependencyEligible = graphStates.filter((row) => row.unresolvedDependencies.length === 0)
  const currentWave = dependencyEligible.length ? Math.min(...dependencyEligible.map((row) => Number(row.action.wave) || 999)) : null
  const readyRows = dependencyEligible.filter((row) => (Number(row.action.wave) || 999) === currentWave)
  const readyIds = new Set(readyRows.map((row) => row.action.id))

  if (!readyRows.length && actions.length) {
    return {
      status: 'EXECUTION_BLOCKED',
      gateComplete: false,
      currentWave: null,
      readyActionIds: [],
      heldActionIds: [...actionIds],
      actionStates: graphStates.map(({ action, unresolvedDependencies }) => ({ id: action.id, wave: action.wave, state: 'held', unresolvedDependencies, holdReason: 'L3_DEPENDENCY_CYCLE' })),
      blockers: [{ code: 'L3_DEPENDENCY_CYCLE', solution: 'Repair the L2 action dependencies so at least one earliest wave can be completed independently.' }],
      nextActions: [],
    }
  }

  const actionStates = graphStates.map(({ action, unresolvedDependencies }) => {
    if (readyIds.has(action.id)) return { id: action.id, wave: action.wave, state: 'ready', unresolvedDependencies: [], holdReason: null }
    if (unresolvedDependencies.length) return { id: action.id, wave: action.wave, state: 'held', unresolvedDependencies, holdReason: 'L3_DEPENDENCY_UNRESOLVED' }
    return { id: action.id, wave: action.wave, state: 'held', unresolvedDependencies: [], holdReason: 'L3_EARLIER_WAVE_ACTIVE' }
  })

  const nextActions = readyRows.map(({ action }) => ({
    id: action.id,
    wave: action.wave,
    title: action.title,
    ownerRole: action.ownerRole,
    documentTypes: action.documentTypes || [],
    executionMode: action.executionMode,
    authorizationRequired: action.executionMode !== 'read_only_verification',
    originatingBlockers: action.blockerCodes || [],
    steps: action.steps || [],
    commands: action.commands || [],
    advanceCondition: action.acceptance,
  }))

  return {
    status: readyRows.length ? 'EXECUTION_WAVE_READY' : 'EXECUTION_BLOCKED',
    gateComplete: false,
    currentWave,
    readyActionIds: nextActions.map((action) => action.id),
    heldActionIds: actionStates.filter((row) => row.state === 'held').map((row) => row.id),
    actionStates,
    blockers: [],
    nextActions,
  }
}
