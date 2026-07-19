import { spawnSync } from 'node:child_process'

const result = spawnSync(process.execPath, ['scripts/mvp-pilot-acceptance.mjs'], { encoding: 'utf8' })
let acceptance = null
try { acceptance = JSON.parse(result.stdout) } catch { acceptance = null }

const output = {
  version: 'arch9_mvp_pilot_session_check_v1',
  checkedAt: new Date().toISOString(),
  decision: acceptance?.decision || 'no_go',
  batchLimit: 10,
  stopConditions: [
    'Any release certification check fails',
    'A duplicate idempotency key is detected',
    'A transaction is created without its participant, document, or workflow bootstrap',
    'A gate decision disagrees between module surfaces',
  ],
  recoveryAction: 'Stop new pilot transactions, preserve the transaction id and error evidence, run release certification, then reconcile before resuming.',
  blockers: acceptance?.blockers || ['pilot_acceptance_unavailable'],
}

console.log(JSON.stringify(output, null, 2))
if (output.decision !== 'go_for_controlled_pilot') process.exit(1)
