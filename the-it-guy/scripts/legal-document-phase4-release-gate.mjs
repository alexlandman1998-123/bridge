import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

function runJson(script) {
  const result = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8' })
  try {
    return { exitCode: result.status, report: JSON.parse(result.stdout), stderr: result.stderr }
  } catch {
    return { exitCode: result.status, report: null, stderr: result.stderr || result.stdout }
  }
}

const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
const phase3 = runJson('scripts/legal-document-phase3-launch-readiness.mjs')
const monitor = runJson('scripts/legal-document-phase4-monitor.mjs')
const blockers = [...(phase3.report?.blockers || []), ...(monitor.report?.blockers || [])]
const warnings = [...(phase3.report?.warnings || [])]

if (!phase3.report) blockers.push({ code: 'PHASE3_GATE_UNAVAILABLE', detail: phase3.stderr || 'Phase 3 gate did not return JSON.' })
if (!monitor.report) blockers.push({ code: 'PHASE4_MONITOR_UNAVAILABLE', detail: monitor.stderr || 'Phase 4 monitor did not return JSON.' })
if (!pilot.enabled) blockers.push({ code: 'PILOT_NOT_ENABLED', detail: 'The production pilot remains deliberately disabled.' })
if (!Array.isArray(pilot.organisationIds) || !pilot.organisationIds.length) blockers.push({ code: 'PILOT_COHORT_EMPTY', detail: 'No production organisations are approved for the pilot.' })
if ((pilot.organisationIds || []).length > Number(pilot.limits?.maxOrganisations || 5)) blockers.push({ code: 'PILOT_COHORT_TOO_LARGE', detail: 'Pilot cohort exceeds its configured safety limit.' })

const uniqueBlockers = [...new Map(blockers.map((item) => [`${item.code}:${item.detail || item.count || ''}`, item])).values()]
const report = {
  phase: 4,
  environment: pilot.environment,
  status: uniqueBlockers.length ? 'NO_GO' : 'GO',
  blockerCount: uniqueBlockers.length,
  warningCount: warnings.length,
  blockers: uniqueBlockers,
  warnings,
  pilot: { enabled: pilot.enabled, cohortSize: pilot.organisationIds?.length || 0, maxOrganisations: pilot.limits?.maxOrganisations || 5 },
  evidence: { phase3: phase3.report?.evidence || null, monitoring: monitor.report?.metrics || null },
  checkedAt: new Date().toISOString(),
  mutatedData: false,
}
console.log(JSON.stringify(report, null, 2))
if (uniqueBlockers.length) process.exitCode = 1
