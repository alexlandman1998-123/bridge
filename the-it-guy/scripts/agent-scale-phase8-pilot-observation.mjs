import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const validDigest = (value) => /^[0-9a-f]{64}$/i.test(String(value || ''))
const validCommit = (value) => /^[0-9a-f]{40}$/i.test(String(value || ''))
const validUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
const hoursBetween = (later, earlier) => (later.getTime() - earlier.getTime()) / 3_600_000

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function requireMaximum(blockers, label, value, maximum) {
  const number = finiteNumber(value)
  if (number === null || number < 0 || number > Number(maximum)) blockers.push(`${label} is missing or exceeds ${maximum}.`)
}

export function evaluateAgentScalePhase8({ config, phase7, observation, now = new Date() }) {
  const blockers = []
  if (config?.contract !== 'arch9-agent-scale-phase8-pilot-observation-config-v1') blockers.push('Phase 8 configuration contract is invalid.')
  if (phase7?.contract !== 'arch9-agent-phase7-pilot-boundary-v1' || phase7?.status !== 'READY_FOR_PILOT') blockers.push('Phase 7 pilot boundary is not READY_FOR_PILOT.')
  if (!validDigest(phase7?.evidenceDigest)) blockers.push('Phase 7 evidence digest is missing or invalid.')
  if (observation?.contract !== 'arch9-agent-scale-phase8-pilot-observation-evidence-v1') blockers.push('Pilot observation evidence contract is invalid.')
  if (observation?.phase7EvidenceDigest !== phase7?.evidenceDigest) blockers.push('Pilot observation is not bound to the exact Phase 7 receipt.')

  const startedAt = new Date(observation?.startedAt)
  const endedAt = new Date(observation?.endedAt)
  if (!observation?.startedAt || Number.isNaN(startedAt.getTime()) || !observation?.endedAt || Number.isNaN(endedAt.getTime())) {
    blockers.push('Pilot observation window is missing or invalid.')
  } else {
    const observationHours = hoursBetween(endedAt, startedAt)
    if (observationHours < Number(config.minimumObservationHours)) blockers.push(`Pilot observation is shorter than ${config.minimumObservationHours} hours.`)
    const ageHours = hoursBetween(now, endedAt)
    if (ageHours < 0 || ageHours > Number(config.maximumEvidenceAgeHours)) blockers.push(`Pilot observation is outside the ${config.maximumEvidenceAgeHours}-hour evidence window.`)
    const phase7At = new Date(phase7?.evaluatedAt)
    if (Number.isNaN(phase7At.getTime()) || startedAt < phase7At) blockers.push('Pilot observation starts before the Phase 7 receipt.')
  }

  const identity = observation?.identity || {}
  if (!validCommit(identity.sourceRevision) || identity.sourceRevision !== phase7?.evidence?.sourceRevision) blockers.push('Observed source revision does not match Phase 7.')
  if (!validUuid(identity.pilotOrganisationId) || identity.pilotOrganisationId !== phase7?.evidence?.pilotOrganisationId) blockers.push('Observed pilot organisation does not match Phase 7.')
  if (identity.deploymentOrigin !== phase7?.evidence?.deploymentOrigin) blockers.push('Observed deployment origin does not match Phase 7.')
  if (!String(identity.featureFlag || '').trim() || identity.featureFlag !== phase7?.evidence?.featureFlag) blockers.push('Observed feature flag does not match Phase 7.')

  const metrics = observation?.metrics || {}
  if ((finiteNumber(metrics.sessions) ?? -1) < Number(config.minimumSessions)) blockers.push(`Pilot requires at least ${config.minimumSessions} sessions.`)
  if ((finiteNumber(metrics.calendarRouteSamples) ?? -1) < Number(config.minimumCalendarRouteSamples)) blockers.push(`Pilot requires at least ${config.minimumCalendarRouteSamples} Calendar route samples.`)
  requireMaximum(blockers, 'Technical error rate percent', metrics.technicalErrorRatePercent, config.maximumTechnicalErrorRatePercent)
  requireMaximum(blockers, 'Failed request rate percent', metrics.failedRequestRatePercent, config.maximumFailedRequestRatePercent)
  requireMaximum(blockers, 'Calendar core-ready p95 milliseconds', metrics.calendarCoreReadyP95Ms, config.maximumCalendarCoreReadyP95Ms)
  requireMaximum(blockers, 'Cross-organisation leakage count', metrics.crossOrganisationLeakageCount, config.maximumCrossOrganisationLeakageCount)
  requireMaximum(blockers, 'Unexpected RLS denial count', metrics.unexpectedRlsDenialCount, config.maximumUnexpectedRlsDenialCount)
  requireMaximum(blockers, 'Critical incident count', metrics.criticalIncidentCount, config.maximumCriticalIncidentCount)
  requireMaximum(blockers, 'Unresolved high incident count', metrics.unresolvedHighIncidentCount, config.maximumUnresolvedHighIncidentCount)
  requireMaximum(blockers, 'Rollback drill minutes', observation?.rollbackDrill?.completedInMinutes, config.maximumRollbackDrillMinutes)
  if (observation?.rollbackDrill?.killSwitchWorked !== true) blockers.push('Pilot kill-switch rollback drill did not pass.')
  if (!String(observation?.review?.monitoringOwner || '').trim() || !String(observation?.review?.supportOwner || '').trim()) blockers.push('Pilot observation review owners are missing.')

  const evidence = {
    phase7EvidenceDigest: phase7?.evidenceDigest || null,
    observationDigest: observation ? digest(observation) : null,
    identity,
    window: { startedAt: observation?.startedAt || null, endedAt: observation?.endedAt || null },
    metrics,
    rollbackDrill: observation?.rollbackDrill || null,
    review: observation?.review || null,
  }
  return {
    contract: 'arch9-agent-scale-phase8-decision-v1',
    evaluatedAt: now.toISOString(),
    status: blockers.length ? 'HOLD' : 'READY_TO_SCALE',
    blockers: [...new Set(blockers)],
    evidence,
    evidenceDigest: digest(evidence),
    authorization: 'This receipt does not deploy, expand a cohort, change a feature flag, apply migrations, or authorize production writes.',
  }
}

async function readJsonOrNull(filePath) {
  try { return JSON.parse(await readFile(filePath, 'utf8')) } catch (error) { if (error?.code === 'ENOENT') return null; throw error }
}

async function main() {
  const config = await readJsonOrNull(process.env.AGENT_PHASE8_CONFIG || 'config/agent-scale-phase8-pilot-observation.json')
  const phase7 = await readJsonOrNull(process.env.AGENT_PHASE8_PHASE7_RECEIPT || 'test-results/agent-phase7/pilot-boundary.json')
  const observation = await readJsonOrNull(process.env.AGENT_PHASE8_OBSERVATION || 'test-results/agent-phase8/pilot-observation-input.json')
  const report = evaluateAgentScalePhase8({ config, phase7, observation })
  const outputPath = path.resolve(process.env.AGENT_PHASE8_OUTPUT || 'test-results/agent-phase8/scale-decision.json')
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'READY_TO_SCALE') process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
