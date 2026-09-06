import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'

const hoursBetween = (later, earlier) => (later.getTime() - earlier.getTime()) / 3_600_000

function checkEvidenceTime(label, timestamp, now, maximumAgeHours, blockers) {
  const capturedAt = new Date(timestamp)
  if (!timestamp || Number.isNaN(capturedAt.getTime())) {
    blockers.push(`${label} has no valid capture time.`)
    return
  }
  const ageHours = hoursBetween(now, capturedAt)
  if (ageHours < 0 || ageHours > maximumAgeHours) blockers.push(`${label} is outside the ${maximumAgeHours}-hour evidence window.`)
}

export function evaluateAgentPhase6Readiness({ config, rls, performance, browsers, now = new Date() }) {
  const blockers = []
  if (config?.contract !== 'arch9-agent-phase6-release-readiness-config-v2') blockers.push('Phase 6 readiness config is not the scale-safe v2 contract.')
  if (rls?.contract !== 'arch9-agent-phase2-rls-acceptance-v1' || rls?.status !== 'PASS') blockers.push('RLS acceptance is missing or not passing.')
  if (rls?.actorContract !== 'arch9-agent-phase2-rls-actors-v2') blockers.push('RLS acceptance does not use the scale Phase 1 actor contract.')
  if (rls?.migration !== '20260906065759_agent_phase2_rls_acceptance.sql') blockers.push('RLS acceptance is not bound to the required commission-policy migration.')
  checkEvidenceTime('RLS acceptance', rls?.capturedAt, now, config.maximumEvidenceAgeHours, blockers)
  const rlsActors = new Set((rls?.results || []).map((result) => result.name))
  for (const actor of config.requiredRlsActors) if (!rlsActors.has(actor)) blockers.push(`RLS actor evidence is missing: ${actor}.`)
  for (const result of rls?.results || []) {
    if (!(result.deniedOrganisationProbes || []).length || result.deniedOrganisationProbes.some((probe) => probe.status !== 'PASS')) {
      blockers.push(`Denied-organisation evidence is incomplete: ${result.name || 'unknown actor'}.`)
    }
    if (result.name === 'branch_manager' && result.deniedBranchProbeStatus !== 'PASS') blockers.push('Denied-branch evidence is incomplete: branch_manager.')
  }

  if (performance?.contract !== 'arch9-agent-performance-baseline-report-v2' || performance?.status !== 'PASS') blockers.push('Performance evidence is missing, incomplete, or failing.')
  if (Number(performance?.minimumSamples || 0) < Number(config.minimumPerformanceSamples || 20)) blockers.push('Performance evidence does not require at least 20 samples per temperature and checkpoint.')
  checkEvidenceTime('Performance report', performance?.generatedAt, now, config.maximumEvidenceAgeHours, blockers)
  for (const surface of config.requiredPerformanceSurfaces) {
    const rows = (performance?.rows || []).filter((row) => row.surface === surface)
    if (rows.length !== 4 || rows.some((row) => row.coverage !== 'COMPLETE' || row.status !== 'PASS' || Number(row.sampleCount || 0) < Number(config.minimumPerformanceSamples || 20))) blockers.push(`Performance coverage is not complete and passing: ${surface}.`)
  }
  const calendarSettledRows = (performance?.rows || []).filter((row) => row.surface === 'calendar' && row.checkpoint === 'settled')
  for (const [measurement, budget] of Object.entries(config.calendarSettledBudgets || {})) {
    if (calendarSettledRows.length !== 2 || calendarSettledRows.some((row) => !Number.isFinite(Number(row[measurement])) || Number(row[measurement]) > Number(budget))) {
      blockers.push(`Calendar settled performance budget is missing or breached: ${measurement}.`)
    }
  }

  for (const role of config.requiredBrowserRoles) {
    const report = browsers?.[role]
    if (report?.contract !== 'arch9-agent-phase0-browser-baseline-v1' || report?.role !== role) {
      blockers.push(`Browser acceptance is missing: ${role}.`)
      continue
    }
    checkEvidenceTime(`${role} browser acceptance`, report.capturedAt, now, config.maximumEvidenceAgeHours, blockers)
    const failingScreens = (report.results || []).filter((result) => (
      result.state === 'loading' ||
      result.technicalErrorVisible ||
      (result.consoleErrors || []).length ||
      (result.failedRequests || []).length ||
      Number(result.horizontalOverflowPx || 0) > 2 ||
      (result.unnamedControls || []).length ||
      result.focusReachedControl !== true
    ))
    if (!(report.results || []).length || failingScreens.length) blockers.push(`${role} browser acceptance has ${failingScreens.length || 'no'} valid screen results.`)
    for (const route of config.requiredBrowserRoutes || []) {
      if (!(report.results || []).some((result) => result.route === route && result.state === 'ready')) blockers.push(`${role} browser acceptance is missing a ready result for ${route}.`)
    }
  }

  return {
    contract: 'arch9-agent-phase6-release-readiness-v1',
    evaluatedAt: now.toISOString(),
    status: blockers.length ? 'HOLD' : 'GO',
    blockers: [...new Set(blockers)],
    evidence: {
      rlsCapturedAt: rls?.capturedAt || null,
      performanceGeneratedAt: performance?.generatedAt || null,
      browserCapturedAtByRole: Object.fromEntries(config.requiredBrowserRoles.map((role) => [role, browsers?.[role]?.capturedAt || null])),
    },
  }
}

async function digestFile(filePath) {
  try {
    return createHash('sha256').update(await readFile(filePath)).digest('hex')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function readEvidenceJson(filePath) {
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function main() {
  const config = await readJson(process.env.AGENT_PHASE6_CONFIG || 'config/agent-phase6-release-readiness.json')
  const evidenceRoot = process.env.AGENT_PHASE6_EVIDENCE_ROOT || 'test-results'
  const rlsPath = path.join(evidenceRoot, 'agent-phase2', 'rls-acceptance.json')
  const performancePath = process.env.AGENT_PHASE6_PERFORMANCE_REPORT || 'output/agent-performance-baseline.json'
  const browserPaths = Object.fromEntries(config.requiredBrowserRoles.map((role) => [role, path.join(evidenceRoot, 'agent-phase5', `${role}-acceptance.json`)]))
  const browsers = Object.fromEntries(await Promise.all(config.requiredBrowserRoles.map(async (role) => [
    role,
    await readEvidenceJson(browserPaths[role]),
  ])))
  const report = evaluateAgentPhase6Readiness({
    config,
    rls: await readEvidenceJson(rlsPath),
    performance: await readEvidenceJson(performancePath),
    browsers,
  })
  report.evidenceDigests = {
    algorithm: 'sha256',
    config: await digestFile(process.env.AGENT_PHASE6_CONFIG || 'config/agent-phase6-release-readiness.json'),
    rls: await digestFile(rlsPath),
    performance: await digestFile(performancePath),
    browsers: Object.fromEntries(await Promise.all(Object.entries(browserPaths).map(async ([role, filePath]) => [role, await digestFile(filePath)]))),
  }
  const outputDirectory = path.resolve(process.env.AGENT_PHASE6_OUTPUT_DIR || 'test-results/agent-phase6')
  await mkdir(outputDirectory, { recursive: true })
  const outputPath = path.join(outputDirectory, 'release-readiness.json')
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'GO') process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
