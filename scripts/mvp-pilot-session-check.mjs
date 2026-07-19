import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
const sessionEvidence = option('session-evidence')
const readinessArgs = args.filter((arg) => !arg.startsWith('--session-evidence='))

const readiness = spawnSync(process.execPath, ['scripts/mvp-production-readiness-check.mjs', ...readinessArgs], {
  encoding: 'utf8',
})
let readinessReport = null
try { readinessReport = JSON.parse(readiness.stdout) } catch { readinessReport = null }
let sessionReport = null
let sessionPassed = false
if (readinessReport?.decision === 'ready_for_controlled_production_pilot' && sessionEvidence) {
  const result = spawnSync(process.execPath, [
    'scripts/mvp-pilot-session-evidence-check.mjs',
    `--evidence=${sessionEvidence}`,
    `--decision-evidence=${option('decision-evidence')}`,
    `--support-evidence=${option('support-evidence')}`,
  ], { encoding: 'utf8' })
  try { sessionReport = JSON.parse(result.stdout) } catch { sessionReport = null }
  sessionPassed = result.status === 0
}
const blockers = [...(readinessReport?.blockers || ['production_readiness_unavailable'])]
if (readinessReport?.decision === 'ready_for_controlled_production_pilot' && !sessionEvidence) blockers.push('pilot_session_evidence_required')
if (sessionEvidence && readinessReport?.decision === 'ready_for_controlled_production_pilot' && !sessionPassed) blockers.push('pilot_session_evidence_invalid')

const report = {
  version: 'arch9_mvp_pilot_session_check_v3',
  checkedAt: new Date().toISOString(),
  decision: readinessReport?.decision === 'ready_for_controlled_production_pilot' && sessionPassed ? 'go_for_batch_of_10' : 'no_go',
  batchLimit: 10,
  readinessDecision: readinessReport?.decision || 'unavailable',
  blockers,
  pilotSession: sessionReport ? { sessionId: sessionReport.sessionId, batchNumber: sessionReport.batchNumber, plannedTransactionCount: sessionReport.plannedTransactionCount } : null,
  stopConditions: [
    'Any batch exceeds ten transactions',
    'A duplicate idempotency key is detected',
    'A transaction lacks participant, document, or workflow bootstrap',
    'A post-deploy transaction smoke check fails',
    'A gate decision is inconsistent across transaction surfaces',
  ],
}

console.log(JSON.stringify(report, null, 2))
if (report.decision !== 'go_for_batch_of_10') process.exit(1)
