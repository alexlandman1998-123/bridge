export const ATTORNEY_PRACTICAL_PHASE9_VERSION = 'attorney-practical-expansion-plan-phase9-v1'
export const ATTORNEY_PRACTICAL_PHASE9_CONFIRMATION = 'APPROVE_ATTORNEY_GRADUATED_EXPANSION'

const text = (value) => String(value || '').trim()
const number = (value) => Number(value)
const issue = (code, remedy, details = {}) => ({ code, remedy, ...details })

function predecessorBlockers({ phase8Report, phase8Evidence, phase8EvidenceFingerprint, phase7Receipt }) {
  const blockers = []
  if (phase8Report?.status !== 'READY_FOR_EXPANSION' || phase8Report?.expansionReady !== true) blockers.push(issue('PHASE8_NOT_READY', 'Complete the healthy controlled-pilot observation.'))
  if (!text(phase8EvidenceFingerprint) || phase8Report?.evidenceFingerprint !== phase8EvidenceFingerprint) blockers.push(issue('PHASE8_EVIDENCE_MISMATCH', 'Use the exact Phase 8 expansion-readiness evidence.'))
  if (!text(phase7Receipt?.featureFlag) || !Array.isArray(phase7Receipt?.organisationIds) || !phase7Receipt.organisationIds.length) blockers.push(issue('ACTIVE_PILOT_TARGETING_MISSING', 'Use the active Phase 7 feature flag and cohort as the expansion baseline.'))
  if (phase8Evidence?.phase7ReceiptFingerprint !== phase8Report?.sourceReceiptFingerprint && text(phase8Report?.sourceReceiptFingerprint)) blockers.push(issue('PILOT_CHAIN_MISMATCH', 'Keep the Phase 7 and Phase 8 pilot evidence chain intact.'))
  return blockers
}

export function buildAttorneyPracticalPhase9Decision({ contract = {}, phase8Report = null, phase8Evidence = null, phase8EvidenceFingerprint = '', phase7Receipt = null, plan = null, planFingerprint = '', approval = null } = {}) {
  const blockers = predecessorBlockers({ phase8Report, phase8Evidence, phase8EvidenceFingerprint, phase7Receipt })
  if (blockers.length) return { version: ATTORNEY_PRACTICAL_PHASE9_VERSION, status: 'BLOCKED', expansionAuthorized: false, waveCount: 0, blockerCount: blockers.length, blockers, planFingerprint: planFingerprint || null }
  if (!plan) return { version: ATTORNEY_PRACTICAL_PHASE9_VERSION, status: 'READY_TO_PLAN', expansionAuthorized: false, waveCount: 0, blockerCount: 0, blockers: [], planFingerprint: null }

  const failures = []
  if (plan.version !== ATTORNEY_PRACTICAL_PHASE9_VERSION || plan.phase8EvidenceFingerprint !== phase8EvidenceFingerprint) failures.push(issue('PLAN_SOURCE_STALE', 'Bind the plan to the exact healthy Phase 8 observation.'))
  if (!text(plan.preparedBy) || !text(plan.preparedAt) || !text(plan.changeReference)) failures.push(issue('PLAN_METADATA_INCOMPLETE', 'Record preparer, timestamp, and change reference.'))
  if (plan.featureFlag !== phase7Receipt.featureFlag || plan.targetingMode !== 'organisation_id_allowlist' || plan.defaultOff !== true || plan.assignmentStable !== true || plan.evaluationLogged !== true) failures.push(issue('FLAG_CONTROL_INVALID', 'Use the active flag with stable, logged organisation allowlist targeting and default-off behavior.'))
  if (plan.killSwitchVerified !== true || !text(plan.rollbackOwner) || !text(plan.rollbackRunbookPath) || number(plan.maximumRollbackMinutes) > 15 || number(plan.maximumRollbackMinutes) <= 0) failures.push(issue('ROLLBACK_CONTROL_INVALID', 'Verify an owned kill switch and rollback within 15 minutes.'))
  const current = Array.isArray(plan.currentOrganisationIds) ? plan.currentOrganisationIds : []
  if (JSON.stringify(current) !== JSON.stringify(phase7Receipt.organisationIds)) failures.push(issue('CURRENT_COHORT_MISMATCH', 'Start from the exact active pilot cohort in canonical order.'))
  if (current.some((id) => !text(id)) || new Set(current).size !== current.length) failures.push(issue('CURRENT_COHORT_INVALID', 'Use unique non-empty organisation IDs in the active cohort.'))

  const waves = Array.isArray(plan.waves) ? plan.waves : []
  if (!waves.length) failures.push(issue('EXPANSION_WAVES_MISSING', 'Define at least one bounded expansion wave.'))
  const waveIds = waves.map(({ id }) => id)
  if (new Set(waveIds).size !== waveIds.length) failures.push(issue('DUPLICATE_WAVE_ID', 'Give every expansion wave a unique stable ID.'))
  const alreadyTargeted = new Set(current)
  waves.forEach((wave, index) => {
    if (wave.sequence !== index + 1 || !text(wave.id)) failures.push(issue('WAVE_ORDER_INVALID', 'Number waves consecutively and give each a stable ID.', { waveIndex: index }))
    const additions = Array.isArray(wave.addOrganisationIds) ? wave.addOrganisationIds.filter(text) : []
    if (!additions.length || additions.length !== (wave.addOrganisationIds || []).length || new Set(additions).size !== additions.length) failures.push(issue('WAVE_COHORT_INVALID', 'Each wave needs unique non-empty organisation additions.', { waveId: wave.id }))
    const repeated = additions.filter((id) => alreadyTargeted.has(id))
    if (repeated.length) failures.push(issue('ORGANISATION_TARGETED_TWICE', 'Do not repeat pilot or prior-wave organisations.', { waveId: wave.id, organisationIds: repeated }))
    const priorSize = alreadyTargeted.size
    additions.forEach((id) => alreadyTargeted.add(id))
    if (alreadyTargeted.size > Math.max(priorSize * 2, priorSize + 1)) failures.push(issue('WAVE_GROWTH_TOO_LARGE', 'Limit each wave to no more than doubling the active cohort.', { waveId: wave.id, priorSize, nextSize: alreadyTargeted.size }))
    if (number(wave.minimumObservationHours) < 24 || number(wave.minimumActions) < number(contract.soak?.minimumTotalActions) || number(wave.minimumActionsPerRole) < number(contract.soak?.minimumActionsPerRole)) failures.push(issue('WAVE_OBSERVATION_BAR_TOO_LOW', 'Use at least 24 hours, 30 actions, and five per role between waves.', { waveId: wave.id }))
    if (number(wave.minimumSuccessRate) < number(contract.soak?.minimumSuccessfulActionRate) || number(wave.maximumPropagationP95Seconds) > number(contract.soak?.maximumPropagationP95Seconds)) failures.push(issue('WAVE_QUALITY_BAR_TOO_LOW', 'Retain the contracted success and propagation thresholds.', { waveId: wave.id }))
    if (wave.requireZeroSafetyIncidents !== true || wave.requireAllDestinationsHealthy !== true || wave.requireSeparateAuthorization !== true) failures.push(issue('WAVE_SAFETY_CONTROLS_MISSING', 'Require clean safety, destination health, and separate authorization for every wave.', { waveId: wave.id }))
  })
  if (!text(plan.monitoringOwner) || !text(plan.monitoringDashboardPath) || !text(plan.supportOwner) || !text(plan.escalationPath)) failures.push(issue('OPERATIONS_OWNERSHIP_INCOMPLETE', 'Assign monitoring and support escalation ownership.'))

  if (failures.length) return { version: ATTORNEY_PRACTICAL_PHASE9_VERSION, status: 'INVALID', expansionAuthorized: false, waveCount: waves.length, blockerCount: failures.length, blockers: failures, planFingerprint: planFingerprint || null }
  const approvalBlockers = []
  if (!text(planFingerprint) || approval?.planFingerprint !== planFingerprint) approvalBlockers.push(issue('APPROVAL_FINGERPRINT_MISMATCH', 'Approve the exact immutable expansion plan.'))
  if (!text(approval?.approvedBy) || !text(approval?.approvedAt) || !text(approval?.approvalReference)) approvalBlockers.push(issue('ACCOUNTABLE_APPROVAL_REQUIRED', 'Record expansion owner, timestamp, and approval reference.'))
  if (!Number.isFinite(Date.parse(approval?.approvedAt || '')) || Date.parse(approval.approvedAt) < Date.parse(plan.preparedAt || '')) approvalBlockers.push(issue('APPROVAL_TIME_INVALID', 'Approve the plan only after it has been prepared.'))
  if (approval?.confirmation !== ATTORNEY_PRACTICAL_PHASE9_CONFIRMATION) approvalBlockers.push(issue('EXACT_CONFIRMATION_REQUIRED', `Use the exact confirmation ${ATTORNEY_PRACTICAL_PHASE9_CONFIRMATION}.`))
  return { version: ATTORNEY_PRACTICAL_PHASE9_VERSION, status: approvalBlockers.length ? 'READY_FOR_APPROVAL' : 'APPROVED', expansionAuthorized: approvalBlockers.length === 0, waveCount: waves.length, blockerCount: approvalBlockers.length, blockers: approvalBlockers, planFingerprint }
}
