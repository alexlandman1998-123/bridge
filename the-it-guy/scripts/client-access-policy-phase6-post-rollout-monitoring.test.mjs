import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildPhase6PostRolloutMonitoringReport } from './client-access-policy-phase6-post-rollout-monitoring.mjs'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const report = await buildPhase6PostRolloutMonitoringReport()
const scriptSource = await readFile(new URL('./client-access-policy-phase6-post-rollout-monitoring.mjs', import.meta.url), 'utf8')
const docSource = await readFile(new URL('../docs/client-access-policy-phase6-post-rollout-monitoring.md', import.meta.url), 'utf8')

test('Phase 6 post-rollout monitoring report is ready', () => {
  assert.equal(report.ready, true, JSON.stringify(report.blockers, null, 2))
  assert.equal(report.blockers.length, 0)
})

test('Phase 6 covers all blocked delivery monitoring signals', () => {
  const checkIds = new Set(report.checks.map((item) => item.id))
  for (const id of [
    'monitor.buyer.portal.blocked',
    'monitor.seller.portal.blocked',
    'monitor.sender.retired.blocked',
    'monitor.router.retired.blocked',
    'monitor.job.runner.retired.blocked',
    'monitor.public.signer.retired.blocked',
  ]) {
    assert.ok(checkIds.has(id), `${id} should be included in the post-rollout monitor`)
  }
})

test('Phase 6 preserves queryable outcomes for support and rollback triage', () => {
  const checkIds = new Set(report.checks.map((item) => item.id))
  for (const id of [
    'outcome.buyer.normal.code',
    'outcome.buyer.kingstons.code',
    'outcome.seller.portal.code',
    'outcome.seller.signing.410',
    'outcome.job.runner.failed.status',
    'outcome.public.signer.audit.event',
  ]) {
    assert.ok(checkIds.has(id), `${id} should be included in the post-rollout monitor`)
  }
})

test('Phase 6 monitoring stays static and avoids deprecated log dependencies', () => {
  assert.doesNotMatch(scriptSource, /\bfetch\s*\(/)
  assert.doesNotMatch(scriptSource, /\bserve\s*\(/)
  assert.doesNotMatch(scriptSource, /logs\.all/)
  assert.match(scriptSource, /Phase 6 post-rollout monitoring report is static only/)
})

test('Phase 6 docs capture monitoring and rollback guidance without credential material', () => {
  assert.match(docSource, /post-rollout monitoring/)
  assert.match(docSource, /24-hour/)
  assert.match(docSource, /rollback/i)
  assert.match(docSource, /no live email/)
  assert.match(docSource, /manual signed mandate/)
  assert.match(docSource, /Kingstons signed OTP/)
  assert.doesNotMatch(docSource, /client_portal_token|seller_portal_token|signing_token|access_token|service_role/i)
})

console.log('client access policy phase 6 post-rollout monitoring tests passed')
