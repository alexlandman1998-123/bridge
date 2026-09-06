export const ATTORNEY_COORDINATION_PHASE9_VERSION = 'attorney-coordination-graduated-expansion-v1'
export const ATTORNEY_COORDINATION_PHASE9_CONFIRMATION = 'APPROVE_ATTORNEY_COORDINATION_EXPANSION'

const text = (value) => String(value || '').trim()
const number = (value) => Number(value)
const issue = (code, message, details = {}) => ({ code, message, ...details })

export function buildAttorneyCoordinationPhase9Decision({
  phase8Report = null,
  phase8Evidence = null,
  phase8EvidenceFingerprint = '',
  phase7Receipt = null,
  plan = null,
  planFingerprint = '',
  approval = null,
} = {}) {
  const blockers = []
  if (phase8Report?.status !== 'READY_FOR_EXPANSION' || phase8Report?.expansionReady !== true) blockers.push(issue('PHASE8_NOT_READY', 'A clean Phase 8 observation is required.'))
  if (!text(phase8EvidenceFingerprint) || phase8Report?.evidenceFingerprint !== phase8EvidenceFingerprint) blockers.push(issue('PHASE8_EVIDENCE_MISMATCH', 'Use the exact Phase 8 evidence bound to its report.'))
  if (phase8Evidence?.phase7ReceiptFingerprint !== phase8Report?.sourceReceiptFingerprint && text(phase8Report?.sourceReceiptFingerprint)) blockers.push(issue('PILOT_CHAIN_MISMATCH', 'Keep the Phase 7–8 receipt chain intact.'))
  if (!text(phase7Receipt?.featureFlag) || phase7Receipt?.featureFlagEnabled !== true || phase7Receipt?.killSwitchAvailable !== true || !Array.isArray(phase7Receipt?.organisationIds) || phase7Receipt.organisationIds.length !== 1) blockers.push(issue('ACTIVE_PILOT_INVALID', 'Start from the exact active one-organisation pilot.'))
  if (blockers.length) return { status: 'BLOCKED', expansionAuthorized: false, blockers, waveCount: 0, planFingerprint: planFingerprint || null }
  if (!plan) return { status: 'READY_TO_PLAN', expansionAuthorized: false, blockers: [], waveCount: 0, planFingerprint: null }

  const failures = []
  if (plan.version !== ATTORNEY_COORDINATION_PHASE9_VERSION || plan.phase8EvidenceFingerprint !== phase8EvidenceFingerprint) failures.push(issue('PLAN_SOURCE_STALE', 'Bind the plan to the exact Phase 8 evidence.'))
  if (!text(plan.preparedBy) || !text(plan.preparedAt) || !text(plan.changeReference)) failures.push(issue('PLAN_OWNERSHIP_INCOMPLETE', 'Record preparer, timestamp and change reference.'))
  if (plan.featureFlag !== phase7Receipt.featureFlag || plan.targetingMode !== 'organisation_id_allowlist' || plan.defaultOff !== true || plan.evaluationLogged !== true) failures.push(issue('TARGETING_CONTROL_INVALID', 'Retain the active default-off, logged organisation allowlist.'))
  if (plan.killSwitchVerified !== true || !text(plan.rollbackOwner) || !text(plan.rollbackRunbook) || number(plan.maximumRollbackMinutes) <= 0 || number(plan.maximumRollbackMinutes) > 15) failures.push(issue('ROLLBACK_CONTROL_INVALID', 'Verify owned rollback within 15 minutes.'))
  if (JSON.stringify(plan.currentOrganisationIds) !== JSON.stringify(phase7Receipt.organisationIds)) failures.push(issue('CURRENT_COHORT_MISMATCH', 'Start from the exact Phase 7 pilot cohort.'))

  const targeted = new Set(phase7Receipt.organisationIds)
  const waves = Array.isArray(plan.waves) ? plan.waves : []
  if (!waves.length) failures.push(issue('WAVES_MISSING', 'Define at least one bounded expansion wave.'))
  if (new Set(waves.map((wave) => wave.id)).size !== waves.length) failures.push(issue('WAVE_IDS_DUPLICATED', 'Use unique stable wave IDs.'))
  waves.forEach((wave, index) => {
    const additions = Array.isArray(wave.organisations) ? wave.organisations : []
    if (wave.sequence !== index + 1 || !text(wave.id) || !additions.length) failures.push(issue('WAVE_INVALID', 'Each wave needs a stable ID, sequence and organisations.', { waveId: wave.id || null }))
    const priorSize = targeted.size
    const ids = additions.map((item) => text(item.organisationId))
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length || ids.some((id) => targeted.has(id))) failures.push(issue('WAVE_COHORT_INVALID', 'Use unique organisations not already targeted.', { waveId: wave.id }))
    for (const organisation of additions) {
      if (organisation.transferAttorneyReady !== true || organisation.bondAttorneyReady !== true || organisation.cancellationAttorneyReady !== true || organisation.supportReady !== true || !text(organisation.readinessEvidence)) failures.push(issue('ORGANISATION_NOT_READY', 'Each organisation needs all attorney roles, support and evidence.', { organisationId: organisation.organisationId }))
      if (text(organisation.organisationId)) targeted.add(organisation.organisationId)
    }
    if (targeted.size > priorSize * 2) failures.push(issue('WAVE_GROWTH_TOO_LARGE', 'A wave may at most double the active cohort.', { waveId: wave.id, priorSize, nextSize: targeted.size }))
    if (number(wave.minimumObservationHours) < 24 || number(wave.minimumActionsPerRole) < 4 || number(wave.maximumPropagationP95Seconds) > 120) failures.push(issue('WAVE_ACCEPTANCE_BAR_TOO_LOW', 'Retain 24 hours, four actions per role and p95 ≤120 seconds.', { waveId: wave.id }))
    if (wave.requireZeroSafetyIncidents !== true || wave.requireTeleventParity !== true || wave.requireAttributionIntegrity !== true || wave.requireSeparateAuthorization !== true) failures.push(issue('WAVE_CONTROLS_MISSING', 'Every wave needs clean safety, Televent, attribution and separate authorization gates.', { waveId: wave.id }))
  })
  if (!text(plan.monitoringOwner) || !text(plan.supportOwner) || !text(plan.monitoringEvidencePath) || !text(plan.escalationPath)) failures.push(issue('OPERATIONS_OWNERSHIP_MISSING', 'Assign monitoring and support owners with evidence paths.'))
  if (failures.length) return { status: 'INVALID', expansionAuthorized: false, blockers: failures, waveCount: waves.length, planFingerprint: planFingerprint || null }

  const approvalFailures = []
  if (!text(planFingerprint) || approval?.planFingerprint !== planFingerprint) approvalFailures.push(issue('APPROVAL_FINGERPRINT_MISMATCH', 'Approve the exact immutable plan.'))
  if (!text(approval?.approvedBy) || !text(approval?.approvedAt) || !text(approval?.approvalReference)) approvalFailures.push(issue('APPROVAL_INCOMPLETE', 'Record a named approver, timestamp and reference.'))
  if (Date.parse(approval?.approvedAt || '') < Date.parse(plan.preparedAt || '')) approvalFailures.push(issue('APPROVAL_TIME_INVALID', 'Approval must follow plan preparation.'))
  if (approval?.confirmation !== ATTORNEY_COORDINATION_PHASE9_CONFIRMATION) approvalFailures.push(issue('CONFIRMATION_REQUIRED', `Use ${ATTORNEY_COORDINATION_PHASE9_CONFIRMATION}.`))
  return { status: approvalFailures.length ? 'READY_FOR_APPROVAL' : 'APPROVED', expansionAuthorized: approvalFailures.length === 0, blockers: approvalFailures, waveCount: waves.length, planFingerprint }
}
