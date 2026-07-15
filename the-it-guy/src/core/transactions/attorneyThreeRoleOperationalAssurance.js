export const ATTORNEY_THREE_ROLE_PHASE7_VERSION = 'attorney_three_role_operational_assurance_phase7_v1'

function check({ id, label, category = 'platform', severity = 'warning', passed, detail }) {
  return Object.freeze({ id, label, category, severity, passed: passed === true, detail })
}

function laneContractReady(role) {
  const lane = role?.workflow?.lane
  const permissions = lane?.permissions
  const usability = lane?.workflowUsability || lane?.actionSummary
  return Boolean(
    lane?.laneKey &&
    permissions &&
    typeof permissions.canView === 'boolean' &&
    typeof permissions.canUpdateStage === 'boolean' &&
    usability &&
    Array.isArray(usability.readinessChecklist),
  )
}

function laneAuditReady(role) {
  const lane = role?.workflow?.lane
  return Boolean(lane && (Array.isArray(lane.timeline) || Array.isArray(lane.updates)))
}

function roleAssigned(role) {
  const assignment = role?.cockpit?.readiness?.assignment
  return assignment ? assignment.complete === true : Boolean(role?.workflow?.lane?.assignment)
}

function roleActionable(role) {
  if (['complete', 'completed'].includes(String(role?.cockpit?.status || '').toLowerCase())) return true
  return Boolean(role?.primaryAction)
}

export function buildAttorneyThreeRoleOperationalAssurance({ workflows = [], registrationRoom = null, now = null } = {}) {
  const requiredWorkflows = (Array.isArray(workflows) ? workflows : []).filter((workflow) => workflow?.required === true)
  const roles = registrationRoom?.roles || []
  const expectedLaneCount = requiredWorkflows.length
  const assignedCount = roles.filter(roleAssigned).length
  const actionableCount = roles.filter(roleActionable).length
  const laneContractCount = roles.filter(laneContractReady).length
  const auditReadyCount = roles.filter(laneAuditReady).length
  const escalations = roles.flatMap((role) => role.cockpit?.dependencies || []).filter((item) => item.escalationNeeded)
  const blockedRoles = roles.filter((role) => role.blockerCount > 0)

  const checks = [
    check({
      id: 'required_lane_coverage',
      label: 'Every required legal role has a workflow lane',
      severity: 'critical',
      passed: expectedLaneCount > 0 && roles.length === expectedLaneCount,
      detail: `${roles.length}/${expectedLaneCount} required lanes available`,
    }),
    check({
      id: 'lane_runtime_contracts',
      label: 'Permission and workflow contracts are hydrated',
      severity: 'critical',
      passed: roles.length > 0 && laneContractCount === roles.length,
      detail: `${laneContractCount}/${roles.length} lane contracts verified`,
    }),
    check({
      id: 'cross_lane_isolation',
      label: 'Cross-lane mutation remains disabled',
      severity: 'critical',
      passed: registrationRoom?.crossLaneWriteAllowed === false,
      detail: 'Each attorney may execute commands only on an authorised lane.',
    }),
    check({
      id: 'audit_evidence_available',
      label: 'Lane timeline or update evidence is available',
      severity: 'critical',
      passed: roles.length > 0 && auditReadyCount === roles.length,
      detail: `${auditReadyCount}/${roles.length} lanes expose audit evidence`,
    }),
    check({
      id: 'assignment_coverage',
      label: 'Every required lane has an assigned attorney',
      category: 'matter',
      passed: roles.length > 0 && assignedCount === roles.length,
      detail: `${assignedCount}/${roles.length} required roles assigned`,
    }),
    check({
      id: 'workflow_actionability',
      label: 'Every active lane exposes a next action',
      category: 'matter',
      passed: roles.length > 0 && actionableCount === roles.length,
      detail: `${actionableCount}/${roles.length} lanes actionable or complete`,
    }),
    check({
      id: 'dependency_escalation_health',
      label: 'No legal handoff is beyond its escalation threshold',
      category: 'matter',
      passed: escalations.length === 0,
      detail: escalations.length ? `${escalations.length} handoff escalation${escalations.length === 1 ? '' : 's'} required` : 'No overdue handoff escalations',
    }),
    check({
      id: 'matter_blocker_health',
      label: 'No attorney lane has an unresolved blocker',
      category: 'matter',
      passed: blockedRoles.length === 0,
      detail: blockedRoles.length ? `${blockedRoles.length} attorney lane${blockedRoles.length === 1 ? '' : 's'} blocked` : 'No unresolved lane blockers',
    }),
  ]
  const failedCritical = checks.filter((item) => !item.passed && item.severity === 'critical')
  const failedWarnings = checks.filter((item) => !item.passed && item.severity !== 'critical')
  const decision = failedCritical.length ? 'blocked' : failedWarnings.length ? 'observe' : 'ready'
  const evidence = Object.freeze({
    version: ATTORNEY_THREE_ROLE_PHASE7_VERSION,
    generatedAt: new Date(now || Date.now()).toISOString(),
    requiredLaneCount: expectedLaneCount,
    hydratedLaneCount: roles.length,
    assignedLaneCount: assignedCount,
    blockerCount: registrationRoom?.totalBlockers || 0,
    openDependencyCount: registrationRoom?.totalOpenDependencies || 0,
    jointLodgementReady: registrationRoom?.jointLodgementReady === true,
    linkedRegistrationComplete: registrationRoom?.linkedRegistrationComplete === true,
    checkResults: Object.freeze(checks.map((item) => Object.freeze({ id: item.id, passed: item.passed, detail: item.detail }))),
  })

  return Object.freeze({
    version: ATTORNEY_THREE_ROLE_PHASE7_VERSION,
    decision,
    decisionLabel: decision === 'ready' ? 'Operationally ready' : decision === 'observe' ? 'Ready with matter attention' : 'Release blocked',
    platformReady: failedCritical.length === 0,
    matterHealthy: failedWarnings.length === 0,
    checks: Object.freeze(checks),
    failedChecks: Object.freeze(checks.filter((item) => !item.passed)),
    failedCriticalCount: failedCritical.length,
    failedWarningCount: failedWarnings.length,
    evidence,
  })
}

export function serializeAttorneyThreeRoleAssuranceEvidence(assurance) {
  return JSON.stringify(assurance?.evidence || {}, null, 2)
}

