import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const hoursBetween = (later, earlier) => (later.getTime() - earlier.getTime()) / 3_600_000
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}

function validDigest(value) {
  return /^[0-9a-f]{64}$/i.test(String(value || ''))
}

function requireFresh(label, value, now, maximumAgeHours, blockers) {
  const timestamp = new Date(value)
  if (!value || Number.isNaN(timestamp.getTime())) return blockers.push(`${label} has no valid timestamp.`)
  const age = hoursBetween(now, timestamp)
  if (age < 0 || age > maximumAgeHours) blockers.push(`${label} is outside the ${maximumAgeHours}-hour pilot window.`)
}

export function evaluateAgentPhase7Pilot({ config, phase6, deployment, source, pilot, now = new Date() }) {
  const blockers = []
  if (config?.contract !== 'arch9-agent-phase7-pilot-boundary-config-v2') blockers.push('Phase 7 pilot config is not the scale-safe v2 contract.')
  if (phase6?.contract !== 'arch9-agent-phase6-release-readiness-v1' || phase6?.status !== 'GO') blockers.push('Phase 6 readiness is not GO.')
  if (phase6?.evidenceDigests?.algorithm !== 'sha256') blockers.push('Phase 6 receipt is not bound to SHA-256 evidence fingerprints.')
  for (const [label, value] of [
    ['config', phase6?.evidenceDigests?.config],
    ['RLS', phase6?.evidenceDigests?.rls],
    ['performance', phase6?.evidenceDigests?.performance],
    ...Object.entries(phase6?.evidenceDigests?.browsers || {}).map(([role, value]) => [`${role} browser`, value]),
  ]) if (!validDigest(value)) blockers.push(`Phase 6 ${label} evidence fingerprint is missing or invalid.`)
  requireFresh('Phase 6 readiness', phase6?.evaluatedAt, now, config.maximumEvidenceAgeHours, blockers)

  if (deployment?.contract !== 'arch9-agent-production-validation-phase5-v1' || deployment?.status !== 'PASS') blockers.push('Deployment validation is missing or failing.')
  requireFresh('Deployment validation', deployment?.checkedAt, now, config.maximumEvidenceAgeHours, blockers)
  let deploymentOrigin = null
  try {
    deploymentOrigin = new URL(deployment?.origin)
  } catch {
    blockers.push('Deployment validation has no valid origin.')
  }
  if (deploymentOrigin && config.requireHttpsOrigin && deploymentOrigin.protocol !== 'https:') blockers.push('Pilot origin must use HTTPS.')
  if (deploymentOrigin && config.forbiddenOriginHosts.includes(deploymentOrigin.hostname)) blockers.push('Pilot origin cannot be a local host.')

  if (!/^[0-9a-f]{40}$/i.test(String(source?.revision || ''))) blockers.push('Source revision must be a full Git commit SHA.')
  if (config.requireCleanSource && source?.clean !== true) blockers.push('Source worktree is not clean.')
  if (String(deployment?.releaseId || '').toLowerCase() !== String(source?.revision || '').toLowerCase()) blockers.push('Deployed release ID does not match the pilot source revision.')
  if (!validUuid(pilot?.organisationId)) blockers.push('Pilot organisation must be one explicit UUID.')
  if (Array.isArray(pilot?.organisationIds) && pilot.organisationIds.length > Number(config.maximumPilotOrganisations || 1)) blockers.push(`Pilot exceeds the ${config.maximumPilotOrganisations}-organisation cohort limit.`)
  for (const [field, label] of [['owner', 'pilot owner'], ['changeReference', 'change reference'], ['rollbackOwner', 'rollback owner'], ['monitoringOwner', 'monitoring owner'], ['supportOwner', 'support owner'], ['featureFlag', 'feature flag']]) {
    if (!String(pilot?.[field] || '').trim()) blockers.push(`Missing ${label}.`)
  }
  if (pilot?.killSwitchVerified !== true) blockers.push('Pilot kill switch has not been verified.')
  const rollbackTargetMinutes = Number(pilot?.rollbackTargetMinutes)
  if (!Number.isFinite(rollbackTargetMinutes) || rollbackTargetMinutes <= 0 || rollbackTargetMinutes > Number(config.maximumRollbackMinutes || 15)) blockers.push(`Rollback target must be between 1 and ${config.maximumRollbackMinutes} minutes.`)
  if (phase6?.evaluatedAt && deployment?.checkedAt && new Date(deployment.checkedAt) < new Date(phase6.evaluatedAt)) blockers.push('Deployment validation predates the Phase 6 GO receipt.')

  const evidence = {
    phase6Digest: phase6 ? digest(phase6) : null,
    deploymentDigest: deployment ? digest(deployment) : null,
    sourceRevision: source?.revision || null,
    deploymentOrigin: deployment?.origin || null,
    pilotOrganisationId: pilot?.organisationId || null,
    owner: pilot?.owner || null,
    changeReference: pilot?.changeReference || null,
    rollbackOwner: pilot?.rollbackOwner || null,
    monitoringOwner: pilot?.monitoringOwner || null,
    supportOwner: pilot?.supportOwner || null,
    featureFlag: pilot?.featureFlag || null,
    killSwitchVerified: pilot?.killSwitchVerified === true,
    rollbackTargetMinutes: Number.isFinite(rollbackTargetMinutes) ? rollbackTargetMinutes : null,
  }
  return {
    contract: 'arch9-agent-phase7-pilot-boundary-v1',
    evaluatedAt: now.toISOString(),
    status: blockers.length ? 'HOLD' : 'READY_FOR_PILOT',
    blockers: [...new Set(blockers)],
    evidence,
    evidenceDigest: digest(evidence),
    authorization: 'This receipt does not deploy, activate, message customers, apply migrations, or authorize production writes.',
  }
}

async function readEvidence(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function main() {
  const config = JSON.parse(await readFile(process.env.AGENT_PHASE7_CONFIG || 'config/agent-phase7-pilot-boundary.json', 'utf8'))
  const phase6 = await readEvidence(process.env.AGENT_PHASE7_PHASE6_RECEIPT || 'test-results/agent-phase6/release-readiness.json')
  const deployment = await readEvidence(process.env.AGENT_PHASE7_DEPLOYMENT_REPORT || 'test-results/agent-phase7/deployment-validation.json')
  const source = {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    clean: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() === '',
  }
  const report = evaluateAgentPhase7Pilot({
    config,
    phase6,
    deployment,
    source,
    pilot: {
      organisationId: process.env.AGENT_PHASE7_PILOT_ORGANISATION_ID,
      owner: process.env.AGENT_PHASE7_OWNER,
      changeReference: process.env.AGENT_PHASE7_CHANGE_REFERENCE,
      rollbackOwner: process.env.AGENT_PHASE7_ROLLBACK_OWNER,
      monitoringOwner: process.env.AGENT_PHASE7_MONITORING_OWNER,
      supportOwner: process.env.AGENT_PHASE7_SUPPORT_OWNER,
      featureFlag: process.env.AGENT_PHASE7_FEATURE_FLAG,
      killSwitchVerified: process.env.AGENT_PHASE7_KILL_SWITCH_VERIFIED === 'true',
      rollbackTargetMinutes: Number(process.env.AGENT_PHASE7_ROLLBACK_TARGET_MINUTES),
    },
  })
  const outputDirectory = path.resolve(process.env.AGENT_PHASE7_OUTPUT_DIR || 'test-results/agent-phase7')
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(path.join(outputDirectory, 'pilot-boundary.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'READY_FOR_PILOT') process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
