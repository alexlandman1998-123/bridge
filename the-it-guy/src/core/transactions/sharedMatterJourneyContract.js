import { summarizeAttorneyTaskOutcomes } from './attorneyTaskOutcomes.js'

// Additive contract: existing readers are migrated in later phases.
export const SHARED_MATTER_JOURNEY_VERSION = 1
export const LEGAL_JOURNEY_LANES = Object.freeze(['transfer', 'bond', 'cancellation'])
export const JOURNEY_TASK_STATUSES = Object.freeze([
  'not_started', 'in_progress', 'waiting', 'blocked',
  'completed', 'completed_externally', 'not_applicable',
])
export const JOURNEY_AUDIENCES = Object.freeze(['attorney', 'agent', 'developer', 'buyer', 'seller'])

function requiredText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value.trim()
}
function revision(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`)
  return value
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
export function journeyTaskId(transactionId, laneKey, taskKey) {
  if (!LEGAL_JOURNEY_LANES.includes(laneKey)) throw new Error('Unknown legal lane')
  return [requiredText(transactionId, 'transactionId'), laneKey, requiredText(taskKey, 'taskKey')]
    .map(encodeURIComponent).join(':')
}
function progress(tasks) {
  const result = summarizeAttorneyTaskOutcomes(tasks)
  return { applicableCount: result.total, completedCount: result.completed,
    notApplicableCount: result.notApplicable, percent: result.total ? result.percent : null }
}

/** Consume an already-resolved plan and authoritative task states. Never infer applicability here. */
export function buildSharedMatterJourney({ transactionId, revision: sourceRevision, planRevision, lanes, overallJourney = null } = {}) {
  const id = requiredText(transactionId, 'transactionId')
  revision(sourceRevision, 'revision')
  revision(planRevision, 'planRevision')
  if (!Array.isArray(lanes)) throw new Error('lanes must be an array')
  const seenLanes = new Set()
  const builtLanes = lanes.map(lane => {
    if (!LEGAL_JOURNEY_LANES.includes(lane.key) || seenLanes.has(lane.key)) throw new Error('Unknown or duplicate lane')
    seenLanes.add(lane.key)
    if (!Array.isArray(lane.phases)) throw new Error('phases must be an array')
    const seenPhases = new Set()
    const seenTasks = new Set()
    const phases = lane.phases.map(phase => {
      const phaseKey = requiredText(phase.key, 'phaseKey')
      if (seenPhases.has(phaseKey)) throw new Error('Duplicate phase')
      seenPhases.add(phaseKey)
      if (!Array.isArray(phase.tasks)) throw new Error('tasks must be an array')
      const tasks = phase.tasks.map(task => {
        const key = requiredText(task.key, 'taskKey')
        if (seenTasks.has(key)) throw new Error('Duplicate task in lane')
        seenTasks.add(key)
        if (!JOURNEY_TASK_STATUSES.includes(task.status)) throw new Error('Unknown task status')
        if (!Number.isSafeInteger(task.outstandingEvidenceCount) || task.outstandingEvidenceCount < 0) throw new Error('Invalid outstanding evidence count')
        return {
          id: journeyTaskId(id, lane.key, key), key, phaseKey, laneKey: lane.key,
          label: requiredText(task.label, 'task label'),
          clientLabel: requiredText(task.clientLabel, 'client-safe task label'),
          status: task.status, revision: revision(task.revision, 'task revision'),
          outstandingEvidenceCount: task.outstandingEvidenceCount,
        }
      })
      return { key: phaseKey, label: requiredText(phase.label, 'phase label'),
        clientLabel: requiredText(phase.clientLabel, 'client-safe phase label'), tasks, progress: progress(tasks) }
    })
    return { key: lane.key, phases, progress: progress(phases.flatMap(phase => phase.tasks)) }
  })
  let overall = null
  if (overallJourney !== null) {
    const percent = overallJourney.percent
    if (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) throw new Error('Invalid overall journey percentage')
    overall = { percent, source: requiredText(overallJourney.source, 'overall journey source'),
      revision: revision(overallJourney.revision, 'overall journey revision') }
  }
  return freeze({ schemaVersion: SHARED_MATTER_JOURNEY_VERSION, transactionId: id,
    revision: sourceRevision, planRevision, lanes: builtLanes,
    legalProgress: progress(builtLanes.flatMap(lane => lane.phases.flatMap(phase => phase.tasks))),
    overallJourney: overall })
}

/** Presentation only, NOT authorization. Call only after checking matter/recipient access. */
export function presentSharedMatterJourney(journey, audience) {
  if (!JOURNEY_AUDIENCES.includes(audience)) throw new Error('Unknown journey audience')
  if (journey?.schemaVersion !== SHARED_MATTER_JOURNEY_VERSION) throw new Error('Unsupported journey contract')
  const client = audience === 'buyer' || audience === 'seller'
  return freeze({ schemaVersion: journey.schemaVersion, transactionId: journey.transactionId,
    revision: journey.revision, planRevision: journey.planRevision, audience,
    legalProgress: { ...journey.legalProgress }, overallJourney: journey.overallJourney ? { ...journey.overallJourney } : null,
    lanes: journey.lanes.map(lane => ({ key: lane.key, progress: { ...lane.progress },
      phases: lane.phases.map(phase => ({ key: phase.key, label: client ? phase.clientLabel : phase.label,
        progress: { ...phase.progress }, tasks: phase.tasks.map(task => ({
          id: task.id, key: task.key, phaseKey: task.phaseKey, laneKey: task.laneKey,
          label: client ? task.clientLabel : task.label, status: task.status, revision: task.revision,
        })) })) })) })
}
