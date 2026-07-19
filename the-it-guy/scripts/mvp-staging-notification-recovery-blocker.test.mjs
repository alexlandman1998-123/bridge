import assert from 'node:assert/strict'
import fs from 'node:fs'

const evidence = JSON.parse(
  fs.readFileSync('docs/audits/mvp-staging-notification-recovery-blocker-2026-07-19.json', 'utf8'),
)

assert.equal(evidence.result, 'automatic_retry_present')
assert.equal(evidence.safeTestDecision, 'do_not_force_failure')
assert.equal(evidence.decision, 'notification_recovery_rehearsal_blocked_until_auto_retry_is_gated')
assert.match(evidence.evidence.claimEligibility, /status in \(queued, failed\)/)
assert.ok(evidence.requiredForwardChange.some((change) => change.includes('next_dispatch_attempt_at')))

console.log('mvp-staging-notification-recovery-blocker: passed')
