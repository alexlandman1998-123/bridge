import { spawnSync } from 'node:child_process'

function run(script) {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  return { passed: result.status === 0, output: `${result.stdout || ''}${result.stderr || ''}`.trim() }
}

const certification = run('scripts/mvp-release-certification.mjs')
const capacity = run('scripts/mvp-transaction-load-check.mjs')
let capacityReport = null
try { capacityReport = JSON.parse(capacity.output) } catch { capacityReport = null }

const blockers = []
if (!certification.passed) blockers.push('release_certification_failed')
if (!capacity.passed) blockers.push('capacity_check_failed')
if (capacityReport?.transactionCount !== 100 || capacityReport?.uniqueIdempotencyKeys !== 100) blockers.push('monthly_volume_target_not_certified')

console.log(JSON.stringify({
  version: 'arch9_mvp_pilot_acceptance_v1',
  decision: blockers.length ? 'no_go' : 'go_for_controlled_pilot',
  monthlyTransactionTarget: 100,
  capacity: capacityReport,
  requiredControls: [
    'scope enforcement',
    'atomic/idempotent creation',
    'participant/document/workflow bootstrap',
    'onboarding/OTP/finance/transfer gates',
    'release certification',
  ],
  blockers,
}, null, 2))

if (blockers.length) process.exit(1)
