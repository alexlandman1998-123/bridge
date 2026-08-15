import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildPhase5OperationalSmokeReport } from './client-access-policy-phase5-operational-smoke.mjs'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const report = await buildPhase5OperationalSmokeReport()
const smokeSource = await readFile(new URL('./client-access-policy-phase5-operational-smoke.mjs', import.meta.url), 'utf8')
const docSource = await readFile(new URL('../docs/client-access-policy-phase5-operational-smoke.md', import.meta.url), 'utf8')

test('Phase 5 operational smoke report is ready', () => {
  assert.equal(report.ready, true, JSON.stringify(report.blockers, null, 2))
  assert.equal(report.blockers.length, 0)
})

test('Phase 5 covers the intended buyer and seller portal policy markers', () => {
  const checkIds = new Set(report.checks.map((item) => item.id))
  for (const id of [
    'buyer.normal.gate',
    'buyer.kingstons.gate',
    'seller.portal.gate',
    'seller.signing.sender.retired',
    'seller.signing.router.retired',
    'seller.signing.job.runner.retired',
    'seller.signer.action.retired.event',
    'seller.signer.action.retired.before.legacy.send',
  ]) {
    assert.ok(checkIds.has(id), `${id} should be included in the operational smoke`)
  }
})

test('Phase 5 checks the Supabase function exposure model', () => {
  const configChecks = report.checks.filter((item) => item.id.startsWith('config.'))
  assert.deepEqual(
    configChecks.map((item) => item.id).sort(),
    [
      'config.legal-document-job-runner',
      'config.send-email',
      'config.send-mandate-signing-email',
      'config.signer-signing-action',
    ],
  )
  for (const item of configChecks) {
    assert.equal(item.status, 'pass', `${item.id} should pass`)
  }
})

test('Phase 5 smoke cannot accidentally perform live delivery', () => {
  assert.doesNotMatch(smokeSource, /\bfetch\s*\(/)
  assert.doesNotMatch(smokeSource, /\bserve\s*\(/)
  assert.match(smokeSource, /Phase 5 operational smoke is static only/)
})

test('Phase 5 docs capture rollout guidance without credential material', () => {
  assert.match(docSource, /manual signed mandate upload/)
  assert.match(docSource, /Kingstons signed OTP/)
  assert.match(docSource, /Agent manual capture remains available/)
  assert.match(docSource, /does not generate portal links/)
  assert.doesNotMatch(docSource, /client_portal_token|seller_portal_token|signing_token|access_token|service_role/i)
})

console.log('client access policy phase 5 operational smoke tests passed')
