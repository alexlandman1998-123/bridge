import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  packageJson: JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')),
  phase4Preflight: await readFile(new URL('./developer-module-phase4-live-preflight.test.mjs', import.meta.url), 'utf8'),
  newTransactionWizard: await readFile(new URL('../src/components/NewTransactionWizard.jsx', import.meta.url), 'utf8'),
  unitDetail: await readFile(new URL('../src/pages/UnitDetail.jsx', import.meta.url), 'utf8'),
  api: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  workflowActions: await readFile(
    new URL('../server/services/workflowActionAvailabilityService.js', import.meta.url),
    'utf8',
  ),
  transactionLifecycle: await readFile(new URL('../src/core/transactions/transactionLifecycle.js', import.meta.url), 'utf8'),
}

const scripts = files.packageJson.scripts || {}

assert.equal(
  scripts['test:developer-module-phase4'],
  'node scripts/developer-module-phase4-live-preflight.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase5'],
  'node scripts/developer-module-phase5-release-readiness.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase6'],
  'node scripts/developer-module-phase6-post-rollout-monitoring.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase7'],
  'node scripts/developer-financial-reconciliation-export-phase7.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase8'],
  'node scripts/developer-financial-handoff-readiness-phase8.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase9'],
  'node scripts/developer-module-phase9-live-acceptance-smoke.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase10'],
  'node scripts/developer-leads-phase10-foundation.test.mjs && node src/core/developerLeads/__tests__/developerLeadContract.test.js',
)
assert.equal(
  scripts['test:developer-module-phase11'],
  'node scripts/developer-leads-phase11-developer-fed.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase12'],
  'node scripts/developer-leads-phase12-agency-fed.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase16'],
  'node scripts/developer-leads-phase16-launch-readiness.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase17'],
  'node scripts/developer-leads-phase17-transaction-handoff.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase18'],
  'node scripts/developer-leads-phase18-convert-and-send.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase19'],
  'node scripts/developer-leads-phase19-agent-developer-alignment.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase20'],
  'node scripts/developer-leads-phase20-agent-capture.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase21'],
  'node scripts/developer-leads-phase21-protected-intake-queue.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase22'],
  'node scripts/developer-leads-phase22-agency-handover-release.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase23'],
  'node scripts/developer-leads-phase23-released-conversion-queue.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase24'],
  'node scripts/developer-leads-phase24-agency-conversion-receipts.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase25'],
  'node scripts/developer-leads-phase25-attribution-ledger.test.mjs',
)
assert.equal(
  scripts['test:developer-module-phase26'],
  'node scripts/developer-leads-phase26-operations-health.test.mjs',
)

const releaseCommand = scripts['verify:developer-module'] || ''
const requiredReleaseSteps = [
  'test:developer-module-phase4',
  'test:buyer-onboarding-originator-handoff-phase3',
  'test:workflow-actions',
  'src/core/transactions/__tests__/transactionLifecycle.test.js',
  'src/core/transactions/__tests__/salesWorkflowPhase0.test.js',
  'test:developer-module-phase5',
  'test:developer-module-phase6',
  'test:developer-module-phase7',
  'test:developer-module-phase8',
  'test:developer-module-phase9',
  'test:developer-module-phase10',
  'test:developer-module-phase11',
  'test:developer-module-phase12',
  'test:developer-module-phase16',
  'test:developer-module-phase17',
  'test:developer-module-phase18',
  'test:developer-module-phase19',
  'test:developer-module-phase20',
  'test:developer-module-phase21',
  'test:developer-module-phase22',
  'test:developer-module-phase23',
  'test:developer-module-phase24',
  'test:developer-module-phase25',
  'test:developer-module-phase26',
  'npm run build',
]

for (const step of requiredReleaseSteps) {
  assert.match(releaseCommand, new RegExp(step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

assert.match(files.phase4Preflight, /transaction_required_documents_insert_transaction_spine_scope/)
assert.match(files.phase4Preflight, /transaction_subprocesses_insert_transaction_spine_scope/)
assert.match(files.phase4Preflight, /transaction_status_links_insert_transaction_spine_scope/)

assert.match(files.newTransactionWizard, /fetchDeveloperPartnersWorkspace/)
assert.match(files.newTransactionWizard, /getDeveloperWorkspacePartnerOptions/)
assert.match(files.newTransactionWizard, /Setup Needs Attention/)
assert.match(files.newTransactionWizard, /setupWarnings/)

assert.match(files.unitDetail, /async function handleSendOnboardingEmail/)
assert.match(files.unitDetail, /recordBuyerOnboardingSent/)
assert.match(files.unitDetail, /roleplayers:\s*resolveDeveloperBuyerOnboardingHandoffRoleplayers\(/)
assert.match(files.unitDetail, /kingstonsBuyerOnboardingLinksDisabled/)

assert.match(files.api, /function isRecoverableTransactionSetupError/)
assert.match(files.api, /recordSetupWarning/)
assert.match(files.api, /setupWarnings/)
assert.match(files.api, /export async function recordBuyerOnboardingSent/)
assert.match(files.api, /bond_assignment_status:\s*'awaiting_buyer_onboarding'/)
assert.match(files.api, /bond assignment handoff update skipped/)
assert.match(files.api, /buyer participant onboarding status update skipped/)

assert.match(files.workflowActions, /isDevelopmentSale\(state\)\s*\?\s*\['buyer_onboarding_complete'\]/)
assert.match(files.workflowActions, /Seller onboarding is not required for new development transactions\./)
assert.match(files.workflowActions, /const requiredSteps = \['buyer_onboarding_complete', 'signed_otp_received'\]/)

assert.match(files.transactionLifecycle, /reservation_deposit_paid/)
assert.match(files.transactionLifecycle, /Reservation Deposit Paid/)

console.log(JSON.stringify({
  version: 'developer_module_phase5_release_readiness_v1',
  ready: true,
  releaseCommand: 'npm run verify:developer-module',
  coveredSurfaces: [
    'developer partner defaults',
    'resilient transaction creation warnings',
    'buyer onboarding send and originator handoff',
    'new-development workflow gates',
    'reservation deposit lifecycle',
    'RLS repair preflight',
    'post-rollout monitoring',
    'developer financial reconciliation export',
    'developer financial handoff readiness',
    'developer live acceptance smoke',
    'developer leads foundation',
    'developer-fed leads lane',
    'agency-fed leads privacy lane',
    'developer leads launch readiness',
    'developer leads transaction handoff',
    'developer leads convert and send',
    'developer leads agent/developer alignment',
    'developer leads agent capture bridge',
    'developer leads protected intake queue',
    'developer leads agency handover release',
    'developer leads released conversion queue',
    'developer leads agency conversion receipts',
    'developer leads attribution ledger',
    'developer leads operations health',
    'production build',
  ],
}, null, 2))
