import { spawnSync } from 'node:child_process'

const result = spawnSync(process.execPath, ['scripts/mvp-pilot-acceptance.mjs'], { encoding: 'utf8' })
let acceptance = null
try { acceptance = JSON.parse(result.stdout) } catch { acceptance = null }

const normalizedPause = String(process.env.MVP_PILOT_CREATION_PAUSED ?? 'true').trim().toLowerCase()
const pilotCreationPaused = !['0', 'false', 'no', 'off'].includes(normalizedPause)
const blockers = [
  ...(acceptance?.blockers || (acceptance ? [] : ['pilot_acceptance_unavailable'])),
  ...(pilotCreationPaused ? ['mvp_pilot_creation_paused'] : []),
]

const output = {
  version: 'arch9_mvp_pilot_session_check_v2',
  checkedAt: new Date().toISOString(),
  decision: pilotCreationPaused ? 'no_go' : (acceptance?.decision || 'no_go'),
  batchLimit: 2,
  stopConditions: [
    'Any release certification check fails',
    'A duplicate idempotency key is detected',
    'A transaction is created without its participant, document, or workflow bootstrap',
    'An accepted-offer conversion, health audit, or notification review is not recorded in the batch evidence',
    'A gate decision disagrees between module surfaces',
    'The listing workspace displays an application-shell or null-id error',
  ],
  recoveryAction: 'Stop new pilot transactions, preserve the transaction id and error evidence, repair and certify the release, then set MVP_PILOT_CREATION_PAUSED=false only with an explicit go decision.',
  blockers,
}

console.log(JSON.stringify(output, null, 2))
if (output.decision !== 'go_for_controlled_pilot') process.exit(1)
