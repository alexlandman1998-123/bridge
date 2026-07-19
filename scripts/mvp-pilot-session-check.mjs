import { spawnSync } from 'node:child_process'

const readiness = spawnSync(process.execPath, ['scripts/mvp-production-readiness-check.mjs', ...process.argv.slice(2)], {
  encoding: 'utf8',
})
let readinessReport = null
try { readinessReport = JSON.parse(readiness.stdout) } catch { readinessReport = null }

const report = {
  version: 'arch9_mvp_pilot_session_check_v2',
  checkedAt: new Date().toISOString(),
  decision: readinessReport?.decision === 'ready_for_controlled_production_pilot' ? 'go_for_batch_of_10' : 'no_go',
  batchLimit: 10,
  readinessDecision: readinessReport?.decision || 'unavailable',
  blockers: readinessReport?.blockers || ['production_readiness_unavailable'],
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
