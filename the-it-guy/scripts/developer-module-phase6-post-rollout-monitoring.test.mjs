import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildDeveloperModulePhase6PostRolloutMonitoringReport } from './developer-module-phase6-post-rollout-monitoring.mjs'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const report = await buildDeveloperModulePhase6PostRolloutMonitoringReport()
const scriptSource = await readFile(new URL('./developer-module-phase6-post-rollout-monitoring.mjs', import.meta.url), 'utf8')
const docSource = await readFile(new URL('../docs/developer-module-phase6-post-rollout-monitoring.md', import.meta.url), 'utf8')

test('Phase 6 post-rollout monitoring report is ready', () => {
  assert.equal(report.ready, true, JSON.stringify(report.blockers, null, 2))
  assert.equal(report.blockers.length, 0)
})

test('Phase 6 covers the developer-module production incident surfaces', () => {
  const checkIds = new Set(report.checks.map((item) => item.id))
  for (const id of [
    'rls.required_documents.insert',
    'rls.subprocesses.insert',
    'rls.status_links.insert',
    'transaction.creation.recoverable_setup_warnings',
    'wizard.developer_partner_defaults_visible',
    'buyer_onboarding.send_and_handoff_visible',
    'workspace.clicks.no_full_page_refresh_regression',
    'workflow.development_sale_gates',
    'lifecycle.reservation_deposit_before_otp',
  ]) {
    assert.ok(checkIds.has(id), `${id} should be included in the post-rollout monitor`)
  }
})

test('Phase 6 stays non-mutating and avoids deprecated Supabase log dependencies', () => {
  assert.doesNotMatch(scriptSource, /\bfetch\s*\(/)
  assert.doesNotMatch(scriptSource, /\bserve\s*\(/)
  assert.doesNotMatch(scriptSource, /insert\s*\(|update\s*\(|upsert\s*\(|delete\s*\(/i)
  assert.doesNotMatch(scriptSource, /logs\.all/)
  assert.match(scriptSource, /Phase 6 post-rollout monitoring report is static only/)
})

test('Phase 6 docs capture operator guidance without credential material', () => {
  assert.match(docSource, /post-rollout monitoring/i)
  assert.match(docSource, /24-hour/i)
  assert.match(docSource, /buyer onboarding link/i)
  assert.match(docSource, /reservation deposit/i)
  assert.match(docSource, /seller onboarding/i)
  assert.match(docSource, /RLS/i)
  assert.match(docSource, /rollback/i)
  assert.match(docSource, /no live email/i)
  assert.doesNotMatch(docSource, /client_portal_token|seller_portal_token|signing_token|access_token|service_role|onboardingToken/i)
})

console.log('developer module Phase 6 post-rollout monitoring tests passed')
