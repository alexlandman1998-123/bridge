const CONTRACT = 'arch9-document-experience-rollout-control-v1'
const SHA256 = /^sha256:[a-f0-9]{64}$/i
const STAGES = Object.freeze({
  pilot: { maxParticipants: 10, minimumEvents: 20, observationHours: 24, next: 'expanded' },
  expanded: { maxParticipants: 100, minimumEvents: 100, observationHours: 48, next: 'full' },
  full: { maxParticipants: 1000, minimumEvents: 250, observationHours: 72, next: null },
})
const PROMOTION_DECISIONS = Object.freeze({ expanded: 'PROMOTE_TO_EXPANDED', full: 'PROMOTE_TO_FULL' })

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function timestamp(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : null
}

function solution(summary, phases) {
  return { summary, phases: phases.map((action, index) => ({ id: `N5.${index + 1}`, action })) }
}

function blocker(code, detail, summary, phases) {
  return { code, detail, solution: solution(summary, phases) }
}

export function buildDocumentExperienceRolloutControl({ n4 = {}, stage = 'pilot', cohortDigest = '', evidenceDigest = '', maxParticipants = 0, operatorRef = '', changeReference = '', startedAt = new Date().toISOString(), revision = 1 } = {}) {
  const normalizedStage = key(stage)
  const stagePolicy = STAGES[normalizedStage] || STAGES.pilot
  const start = new Date(startedAt)
  const validStart = Number.isFinite(start.getTime()) ? start : new Date()
  const observationEndsAt = new Date(validStart.getTime() + stagePolicy.observationHours * 60 * 60 * 1000)
  const expiresAt = new Date(observationEndsAt.getTime() + 24 * 60 * 60 * 1000)
  return {
    contract: CONTRACT,
    status: 'active',
    stage: normalizedStage,
    revision: Math.max(1, Number(revision) || 1),
    cohortDigest: text(cohortDigest).toLowerCase(),
    evidenceDigest: text(evidenceDigest).toLowerCase(),
    maxParticipants: Math.max(0, Number(maxParticipants) || 0),
    operatorRef: text(operatorRef),
    changeReference: text(changeReference),
    startedAt: validStart.toISOString(),
    observationEndsAt: observationEndsAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    sourceDecision: n4?.decision || null,
    sourceStatus: n4?.status || null,
    sourceMetrics: {
      eventCount: Number(n4?.metrics?.eventCount || 0),
      recoveryRate: Number(n4?.metrics?.recoveryRate || 0),
      confirmationRate: Number(n4?.metrics?.confirmationRate || 0),
      outcomeRate: Number(n4?.metrics?.outcomeRate || 0),
    },
  }
}

export function assessDocumentExperienceRolloutControl({ control = null, n4 = null, actualCohortDigest = '', incidentCount = 0, previousControl = null, now = Date.now() } = {}) {
  const blockers = []
  const push = (code, detail, summary, phases) => blockers.push(blocker(code, detail, summary, phases))
  const stage = key(control?.stage)
  const policy = STAGES[stage]
  const startedAt = timestamp(control?.startedAt)
  const observationEndsAt = timestamp(control?.observationEndsAt)
  const expiresAt = timestamp(control?.expiresAt)

  if (!control || control.contract !== CONTRACT || control.status !== 'active') push('N5_CONTROL_INVALID', 'No active N5 rollout control is present.', 'Create a fresh bounded control from a passing N4 decision.', ['Rerun N4 against current evidence.', 'Create a pilot control with an accountable operator and cohort digest.'])
  if (n4?.ready !== true || n4?.status !== 'READY_FOR_CONTROLLED_ROLLOUT' || n4?.decision !== 'CONTINUE_CONTROLLED_ROLLOUT') push('N5_N4_REGRESSION_STOP', 'The current N4 health decision is not ready.', 'Pause the rollout and resolve the current usability blockers.', ['Stop promotion and pause new participants.', 'Apply every N4 blocker solution.', 'Rerun N4 and create a fresh N5 control.'])
  if (!policy) push('N5_STAGE_INVALID', `Unsupported rollout stage: ${stage || 'missing'}.`, 'Return to the supported pilot, expanded or full progression.', ['Pause this control.', 'Create a corrected control at the last proven stage.'])
  if (!SHA256.test(text(control?.cohortDigest)) || !SHA256.test(text(control?.evidenceDigest))) push('N5_DIGEST_BINDING_INVALID', 'The cohort or N4 evidence digest is missing or invalid.', 'Bind rollout authority to exact privacy-safe evidence digests.', ['Recompute the cohort and N4 evidence digests.', 'Create a new control; never hand-edit the existing receipt.'])
  if (text(actualCohortDigest).toLowerCase() !== text(control?.cohortDigest).toLowerCase()) push('N5_COHORT_DRIFT_STOP', 'The active cohort no longer matches the authorised digest.', 'Pause before any new organisation or user enters the workflow.', ['Freeze cohort expansion.', 'Restore the authorised cohort or obtain a fresh N4 decision for the changed cohort.'])
  if (!text(control?.operatorRef) || !text(control?.changeReference)) push('N5_ACCOUNTABILITY_MISSING', 'The rollout operator or change reference is missing.', 'Record who owns the rollout decision and its operational reference.', ['Assign an accountable operator reference.', 'Create a replacement control with the approved change reference.'])
  if (Number(incidentCount || 0) > 0) push('N5_INCIDENT_STOP', `${Number(incidentCount)} active rollout incident${Number(incidentCount) === 1 ? '' : 's'} reported.`, 'Pause rollout until every active incident is resolved.', ['Stop adding participants and preserve document evidence.', 'Resolve and document each incident.', 'Rerun N4 before creating a fresh N5 control.'])
  if (policy && (Number(control?.maxParticipants) < 1 || Number(control?.maxParticipants) > policy.maxParticipants)) push('N5_COHORT_LIMIT_INVALID', `${stage} permits 1-${policy.maxParticipants} participants, not ${Number(control?.maxParticipants) || 0}.`, 'Restore the stage-specific participant ceiling.', ['Pause enrolment at the current count.', `Create a ${stage} control capped at ${policy.maxParticipants} participants or fewer.`])
  if (startedAt === null || observationEndsAt === null || expiresAt === null || observationEndsAt <= startedAt || expiresAt <= observationEndsAt) push('N5_WINDOW_INVALID', 'The observation or expiry window is invalid.', 'Use a fresh server-generated rollout window.', ['Discard the malformed control.', 'Create a replacement control using the N5 stage policy.'])
  if (expiresAt !== null && now >= expiresAt) push('N5_CONTROL_EXPIRED', 'The rollout authority has expired.', 'Pause and reassess current evidence before continuing.', ['Stop new participants immediately.', 'Rerun N4 and issue a fresh N5 control if healthy.'])
  if (stage !== 'pilot') {
    const expectedPrevious = stage === 'expanded' ? 'pilot' : 'expanded'
    const previousDecision = previousControl?.promotionDecision || previousControl?.decision
    if (key(previousControl?.stage) !== expectedPrevious || previousDecision !== PROMOTION_DECISIONS[stage] || Number(control?.revision) !== Number(previousControl?.revision || 0) + 1) push('N5_PROMOTION_CHAIN_INVALID', `${stage} is not bound to a completed ${expectedPrevious} control.`, 'Restore sequential, revision-locked rollout progression.', ['Pause the current stage.', `Complete ${expectedPrevious} observation and record its promotion decision.`, `Create ${stage} at the next revision.`])
  }

  if (blockers.length) return { contract: CONTRACT, ready: false, status: 'ROLLOUT_PAUSED', decision: 'PAUSE_ROLLOUT', stage: stage || null, blockers }
  if (now < observationEndsAt) return { contract: CONTRACT, ready: true, status: 'ROLLOUT_STAGE_ACTIVE', decision: 'CONTINUE_STAGE', stage, nextReviewAt: control.observationEndsAt, blockers: [] }

  const observedEvents = Number(n4?.metrics?.eventCount || 0)
  if (observedEvents < policy.minimumEvents) {
    return {
      contract: CONTRACT,
      ready: false,
      status: 'ROLLOUT_OBSERVATION_HOLD',
      decision: 'EXTEND_OBSERVATION',
      stage,
      blockers: [blocker('N5_SAMPLE_INSUFFICIENT', `${observedEvents} events observed; ${policy.minimumEvents} required for ${stage}.`, 'Keep the same cohort bounded until the sample is representative.', ['Do not promote or enlarge the cohort.', `Collect at least ${policy.minimumEvents - observedEvents} additional privacy-safe events.`, 'Rerun N4 and N5 before expiry.'])],
    }
  }
  if (!policy.next) return { contract: CONTRACT, ready: true, status: 'ROLLOUT_COMPLETE', decision: 'MAINTAIN_FULL_ROLLOUT', stage, promotionDecision: null, blockers: [] }
  const promotionDecision = PROMOTION_DECISIONS[policy.next]
  return { contract: CONTRACT, ready: true, status: 'ROLLOUT_STAGE_PASSED', decision: promotionDecision, promotionDecision, stage, nextStage: policy.next, blockers: [] }
}

export { CONTRACT as DOCUMENT_EXPERIENCE_N5_CONTRACT, STAGES as DOCUMENT_EXPERIENCE_N5_STAGES }
