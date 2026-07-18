const REQUIRED_PACKET_TYPES = ['mandate', 'otp']
const REQUIRED_SURFACES = ['workspace', 'signer_portal']
const REQUIRED_VIEWPORTS = ['desktop', 'mobile']
const REQUIRED_AUDIENCES = ['principal', 'agent', 'attorney', 'seller', 'buyer']
const EVENT_NAMES = new Set(['document_experience_journey_viewed', 'document_experience_primary_action_selected', 'document_experience_recovery_selected', 'document_experience_commit_opened', 'document_experience_commit_confirmed', 'document_experience_outcome_shown'])
const SAFE_EVENT_KEYS = new Set(['contract', 'eventName', 'event_name', 'surface', 'audience', 'packetType', 'state', 'actionId', 'category', 'viewport', 'severity', 'createdAt', 'created_at', 'metadata'])
const SAFE_METADATA_KEYS = new Set(['contract', 'surface', 'audience', 'packetType', 'state', 'actionId', 'category', 'viewport'])

export const DOCUMENT_EXPERIENCE_N4_THRESHOLDS = Object.freeze({
  minimumActionSample: 10,
  maximumRecoveryRate: 0.35,
  minimumCommitSample: 5,
  minimumConfirmationRate: 0.6,
  minimumOutcomeRate: 0.8,
})

function key(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function solution(summary, phases) {
  return { summary, phases: phases.map((action, index) => ({ id: `N4.${index + 1}`, action })) }
}

function blocker(code, detail, summary, phases) {
  return { code, detail, solution: solution(summary, phases) }
}

function normalizeEvent(row = {}) {
  const metadata = row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : row
  return {
    eventName: key(row?.eventName || row?.event_name),
    surface: key(metadata?.surface),
    audience: key(metadata?.audience),
    packetType: key(metadata?.packetType),
    state: key(metadata?.state),
    actionId: key(metadata?.actionId),
    category: key(metadata?.category),
    viewport: key(metadata?.viewport),
  }
}

function findPrivacyViolations(row = {}, index = 0) {
  const violations = []
  const metadata = row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : null
  for (const field of Object.keys(row || {})) {
    if (!SAFE_EVENT_KEYS.has(field)) violations.push(`event ${index + 1} field ${field}`)
  }
  for (const field of Object.keys(metadata || {})) {
    if (!SAFE_METADATA_KEYS.has(field)) violations.push(`event ${index + 1} metadata ${field}`)
  }
  return violations
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0
}

export function assessDocumentExperienceLaunchHealth({ n1 = null, n2 = null, telemetryAvailable = false, events = [] } = {}) {
  const blockers = []
  const rows = Array.isArray(events) ? events : []
  const normalized = rows.map(normalizeEvent).filter((event) => EVENT_NAMES.has(event.eventName))

  if (n1?.ready !== true || n1?.status !== 'READY_FOR_N2') {
    blockers.push(blocker('N4_N1_NOT_READY', 'The cross-role model acceptance gate is not ready.', 'Restore role and document journey coverage before rollout.', ['Run N1 and resolve every reported scenario blocker.', 'Rerun N1 until it returns READY_FOR_N2.']))
  }
  if (n2?.ready !== true || n2?.status !== 'READY_FOR_N3') {
    blockers.push(blocker('N4_N2_NOT_READY', 'The rendered browser smoke gate is not ready.', 'Repair the real browser journey before rollout.', ['Run N2 at desktop and mobile widths.', 'Fix rendering, accessibility or interaction failures and rerun N2.']))
  }
  if (telemetryAvailable !== true) {
    blockers.push(blocker('N4_TELEMETRY_UNAVAILABLE', 'The document-experience telemetry store could not be read.', 'Restore visibility before exposing the workflow to a cohort.', ['Confirm the telemetry table and read policy are available.', 'Capture a fresh N3 event and rerun N4.']))
  }

  const privacyViolations = rows.flatMap(findPrivacyViolations)
  if (privacyViolations.length) {
    blockers.push(blocker('N4_PRIVACY_BOUNDARY_FAILED', privacyViolations.slice(0, 3).join('; '), 'Remove sensitive or non-catalog telemetry fields before rollout.', ['Stop document-experience telemetry ingestion.', 'Remove the unsafe field at its producer and purge affected telemetry under the organisation retention policy.', 'Rerun the N3 privacy contract and N4.']))
  }

  const packetTypes = [...new Set(normalized.map((event) => event.packetType).filter(Boolean))]
  const surfaces = [...new Set(normalized.map((event) => event.surface).filter(Boolean))]
  const viewports = [...new Set(normalized.map((event) => event.viewport).filter(Boolean))]
  const audiences = [...new Set(normalized.map((event) => event.audience).filter(Boolean))]
  const requireCoverage = (required, actual, code, label) => {
    const missing = required.filter((value) => !actual.includes(value))
    if (!missing.length) return
    blockers.push(blocker(code, `Missing ${label}: ${missing.join(', ')}.`, `Collect representative ${label} evidence before expanding rollout.`, [`Exercise ${missing.join(' and ')} through the controlled journey.`, 'Confirm the resulting N3 catalog events, then rerun N4.']))
  }
  requireCoverage(REQUIRED_PACKET_TYPES, packetTypes, 'N4_DOCUMENT_COVERAGE_MISSING', 'document coverage')
  requireCoverage(REQUIRED_SURFACES, surfaces, 'N4_SURFACE_COVERAGE_MISSING', 'surface coverage')
  requireCoverage(REQUIRED_VIEWPORTS, viewports, 'N4_VIEWPORT_COVERAGE_MISSING', 'viewport coverage')
  requireCoverage(REQUIRED_AUDIENCES, audiences, 'N4_AUDIENCE_COVERAGE_MISSING', 'audience coverage')

  const count = (eventName) => normalized.filter((event) => event.eventName === eventName).length
  const journeys = count('document_experience_journey_viewed')
  const primaryActions = count('document_experience_primary_action_selected')
  const recoveries = count('document_experience_recovery_selected')
  const commitOpened = count('document_experience_commit_opened')
  const commitConfirmed = count('document_experience_commit_confirmed')
  const outcomes = count('document_experience_outcome_shown')
  if (journeys === 0) blockers.push(blocker('N4_JOURNEY_SIGNAL_MISSING', 'No document journey view was recorded.', 'Verify N3 is active on both document surfaces.', ['Open a Mandate and OTP workspace and signer journey.', 'Confirm journey_viewed is received, then rerun N4.']))
  if (primaryActions === 0) blockers.push(blocker('N4_ACTION_SIGNAL_MISSING', 'No primary document action was recorded.', 'Verify the usable next-action path is observable.', ['Complete one recommended workspace action and one signer action.', 'Confirm primary_action_selected is received, then rerun N4.']))

  const actionSample = primaryActions + recoveries
  const recoveryRate = ratio(recoveries, actionSample)
  if (actionSample >= DOCUMENT_EXPERIENCE_N4_THRESHOLDS.minimumActionSample && recoveryRate > DOCUMENT_EXPERIENCE_N4_THRESHOLDS.maximumRecoveryRate) {
    blockers.push(blocker('N4_RECOVERY_RATE_HIGH', `${Math.round(recoveryRate * 100)}% of ${actionSample} observed actions used recovery.`, 'Reduce the dominant usability failure before expanding rollout.', ['Group recovery events by surface, audience, document and category.', 'Fix the highest-volume blocked step and smoke-test it.', 'Collect a fresh sample below the recovery threshold.']))
  }
  const confirmationRate = ratio(commitConfirmed, commitOpened)
  if (commitOpened >= DOCUMENT_EXPERIENCE_N4_THRESHOLDS.minimumCommitSample && confirmationRate < DOCUMENT_EXPERIENCE_N4_THRESHOLDS.minimumConfirmationRate) {
    blockers.push(blocker('N4_CONFIRMATION_ABANDONMENT_HIGH', `${Math.round((1 - confirmationRate) * 100)}% of ${commitOpened} confirmation dialogs were not confirmed.`, 'Clarify the irreversible send or signing decision before rollout.', ['Review confirmation wording and missing signer/field prerequisites.', 'Repair the dominant hesitation or validation issue.', 'Collect a fresh sample above the confirmation threshold.']))
  }
  const outcomeRate = ratio(outcomes, commitConfirmed)
  if (commitConfirmed >= DOCUMENT_EXPERIENCE_N4_THRESHOLDS.minimumCommitSample && outcomeRate < DOCUMENT_EXPERIENCE_N4_THRESHOLDS.minimumOutcomeRate) {
    blockers.push(blocker('N4_OUTCOME_RATE_LOW', `${Math.round(outcomeRate * 100)}% of ${commitConfirmed} confirmed commits produced an observed outcome.`, 'Restore a clear completion or recovery receipt after every commit.', ['Trace confirmed sends and signer completions without an outcome event.', 'Restore the success or recovery notice for each missing branch.', 'Collect a fresh sample above the outcome threshold.']))
  }

  return {
    contract: 'arch9-document-experience-launch-gate-v1',
    status: blockers.length ? 'DOCUMENT_EXPERIENCE_HOLD' : 'READY_FOR_CONTROLLED_ROLLOUT',
    decision: blockers.length ? 'HOLD_AND_FIX' : 'CONTINUE_CONTROLLED_ROLLOUT',
    ready: blockers.length === 0,
    mutatedData: false,
    coverage: { packetTypes, surfaces, viewports, audiences },
    metrics: { eventCount: normalized.length, journeys, primaryActions, recoveries, commitOpened, commitConfirmed, outcomes, recoveryRate, confirmationRate, outcomeRate },
    thresholds: DOCUMENT_EXPERIENCE_N4_THRESHOLDS,
    blockers,
  }
}
