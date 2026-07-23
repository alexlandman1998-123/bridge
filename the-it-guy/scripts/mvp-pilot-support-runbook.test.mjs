import assert from 'node:assert/strict'
import fs from 'node:fs'

const runbook = fs.readFileSync('docs/mvp-pilot-runbook.md', 'utf8')
const postDeployCheck = fs.readFileSync('scripts/mvp-postdeploy-transaction-check.mjs', 'utf8')

for (const required of [
  'mvp-launch-readiness.mjs',
  'mvp-pilot-session-check.mjs',
  'mvp-pilot-go-no-go.mjs',
  'mvp-postdeploy-transaction-check.mjs',
  'mvp-pilot-batch-audit.mjs',
  'mvp-pilot-metrics.mjs',
  'mvp-release-certification.mjs',
  'Prepare notification retry',
  'TEST — DO NOT ACTION',
  'at most 2 new transactions',
  'Manual database edits are not a pilot recovery action',
]) assert.match(runbook, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

assert.match(postDeployCheck, /batchRecord/)
assert.match(postDeployCheck, /idempotencyKey/)
assert.match(postDeployCheck, /participantBootstrapComplete/)
assert.match(postDeployCheck, /documentBootstrapComplete/)
assert.match(postDeployCheck, /workflowBootstrapComplete/)
assert.match(postDeployCheck, /conversionConfirmed/)
assert.match(postDeployCheck, /healthAudited/)
assert.match(postDeployCheck, /notificationDeliveryReviewed/)

console.log('mvp-pilot-support-runbook: passed')
