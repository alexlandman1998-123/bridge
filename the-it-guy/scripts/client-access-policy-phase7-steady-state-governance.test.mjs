import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildPhase7SteadyStateGovernanceReport } from './client-access-policy-phase7-steady-state-governance.mjs'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const report = await buildPhase7SteadyStateGovernanceReport()
const scriptSource = await readFile(new URL('./client-access-policy-phase7-steady-state-governance.mjs', import.meta.url), 'utf8')
const docSource = await readFile(new URL('../docs/client-access-policy-phase7-steady-state-governance.md', import.meta.url), 'utf8')

test('Phase 7 steady-state governance report is ready', () => {
  assert.equal(report.ready, true, JSON.stringify(report.blockers, null, 2))
  assert.equal(report.blockers.length, 0)
})

test('Phase 7 starts from the Phase 6 monitoring contract', () => {
  const phase6Check = report.checks.find((item) => item.id === 'phase6.monitoring.ready')
  assert.equal(phase6Check?.status, 'pass')
})

test('Phase 7 freezes support codes and change-control surfaces', () => {
  const checkIds = new Set(report.checks.map((item) => item.id))
  assert.ok(checkIds.has('governance.support.codes.documented'))
  assert.ok(checkIds.has('governance.change.control.surfaces.documented'))
  assert.match(docSource, /buyer_portal_waiting_for_onboarding_or_otp/)
  assert.match(docSource, /buyer_portal_waiting_for_signed_otp/)
  assert.match(docSource, /seller_portal_invite_requires_signed_mandate/)
  assert.match(docSource, /seller_mandate_signing_links_retired/)
})

test('Phase 7 keeps the product answer explicit', () => {
  assert.match(docSource, /buyer onboarding before OTP globally remains supported/)
  assert.match(docSource, /Agent manual capture remains available/)
  assert.match(docSource, /Kingstons signed OTP/)
  assert.match(docSource, /manual signed mandate/)
  assert.match(docSource, /Seller mandate signing links remain retired/)
})

test('Phase 7 governance stays static and credential-safe', () => {
  assert.doesNotMatch(scriptSource, /\bfetch\s*\(/)
  assert.doesNotMatch(scriptSource, /\bserve\s*\(/)
  assert.doesNotMatch(scriptSource, /logs\.all/)
  assert.match(scriptSource, /Phase 7 steady-state governance report is static only/)
  assert.doesNotMatch(docSource, /client_portal_token|seller_portal_token|signing_token|access_token|service_role/i)
})

console.log('client access policy phase 7 steady-state governance tests passed')
