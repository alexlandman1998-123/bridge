import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const runbook = readFileSync(resolve(appRoot, 'docs/buyer-process-global-diagnostic.md'), 'utf8')
const agencyPipelinePage = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const buyerOfferPage = readFileSync(resolve(appRoot, 'src/pages/BuyerOfferSubmission.jsx'), 'utf8')
const postViewingPortal = readFileSync(resolve(appRoot, 'src/pages/PostViewingOfferPortal.jsx'), 'utf8')

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const requiredScripts = Object.freeze({
  'test:buyer-process-global-diagnostic': 'node scripts/buyer-process-global-diagnostic.test.mjs',
  'verify:buyer-process-global-diagnostic': 'npm run test:buyer-process-global-diagnostic',
  'test:transaction-roleplayer-notifications-phase4': 'node scripts/transaction-roleplayer-notifications-phase4.test.mjs',
})

const diagnosticChecks = Object.freeze([
  ['test:buyer-process-definition-phase1', 'global and Kingstons buyer profiles stay split'],
  ['test:buyer-process-workflow-engine-phase2', 'buyer workflow maps legacy OTP stages into OTP Transaction'],
  ['test:buyer-process-viewing-actions-phase3', 'viewing actions feed buyer onboarding'],
  ['test:buyer-process-onboarding-offer-upload-phase4', 'buyer onboarding and OTP upload are wired'],
  ['test:buyer-process-pipeline-reporting-phase5', 'pipeline reporting keeps buyer stage evidence visible'],
  ['test:buyer-process-migration-otp-deprecation-phase6', 'global buyer OTP generation remains deprecated'],
  ['test:buyer-onboarding-flow-contract', 'buyer onboarding flow contract is intact'],
  ['test:buyer-onboarding-sa-scenarios', 'South African buyer onboarding scenarios still resolve'],
  ['test:buyer-onboarding-notification-contract', 'buyer onboarding submission notifications are contracted'],
  ['test:buyer-onboarding-originator-handoff-phase3', 'buyer onboarding can trigger originator handoff'],
  ['test:residential-offer-lifecycle-phase1a', 'offer plus onboarding link lifecycle is intact'],
  ['test:residential-offer-terms-phase1b', 'residential offer terms are captured'],
  ['test:residential-offer-condition-review-phase1c', 'agent condition review remains gated'],
  ['test:residential-offer-otp-readiness-phase1d', 'signed OTP readiness checks stay compatible'],
  ['test:residential-offer-link-phase3', 'offer link delivery remains wired'],
  ['test:offer-to-transaction-scenario-matrix', 'accepted offer conversion scenarios pass'],
  ['test:mvp-accepted-offer-conversion-receipt', 'accepted-offer conversion receipt is preserved'],
  ['test:signed-otp-transfer-instruction-phase4', 'signed OTP triggers transfer instruction readiness'],
  ['test:transaction-roleplayer-notifications-phase4', 'transaction roleplayer notifications are registered'],
  ['test:transaction-propagation-assurance-phase6', 'transaction propagation assurance passes'],
  ['test:listing-to-transaction-routing-propagation', 'listing-to-transaction routing facts propagate'],
])

for (const [scriptName, expectedCommand] of Object.entries(requiredScripts)) {
  assert.equal(packageJson.scripts?.[scriptName], expectedCommand, `package.json should expose ${scriptName}`)
}

for (const [scriptName] of diagnosticChecks) {
  assert.ok(packageJson.scripts?.[scriptName], `Buyer diagnostic depends on missing package script: ${scriptName}`)
}

for (const requiredText of [
  'global buyer process only',
  'manual uploads for OTP',
  'no buyer OTP generation action',
  'send buyer onboarding',
  'roleplayer handoff triggers',
  'transfer attorney',
  'bond originator',
  'listing-to-transaction routing propagation',
]) {
  assert.match(runbook.toLowerCase(), new RegExp(requiredText.toLowerCase()), `Buyer diagnostic runbook must mention ${requiredText}`)
}

assert.match(agencyPipelinePage, /Upload OTP/)
assert.match(agencyPipelinePage, /OTP workspace ready/)
assert.doesNotMatch(agencyPipelinePage, /label: 'Generate OTP'/)
assert.match(buyerOfferPage, /Manual OTP Upload/)
assert.doesNotMatch(buyerOfferPage, /OTP Generated/)
assert.doesNotMatch(buyerOfferPage, /before OTP generation/)
assert.match(postViewingPortal, /manual signed OTP upload/)
assert.doesNotMatch(postViewingPortal, /before OTP generation/)

for (const [scriptName, description] of diagnosticChecks) {
  console.log(`\n[Buyer diagnostic] ${description}`)
  const result = spawnSync(npmCommand, ['run', scriptName, '--silent'], {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
  })
  assert.equal(result.status, 0, `${scriptName} failed`)
}

console.log('\nbuyer process global diagnostic suite passed')
