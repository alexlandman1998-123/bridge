import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  TRANSACTION_BUYER_RELEASE_PHASES,
  TRANSACTION_BUYER_RELEASE_READINESS_VERSION,
  buildTransactionBuyerReleaseReadinessReport,
  buildTransactionBuyerReleaseReadinessScenarios,
} from '../src/core/transactions/transactionBuyerReleaseReadiness.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const releaseSource = await readFile(
  new URL('../src/core/transactions/transactionBuyerReleaseReadiness.js', import.meta.url),
  'utf8',
)
const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const attorneyTransactionDetailSource = await readFile(
  new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url),
  'utf8',
)
const clientOnboardingSource = await readFile(new URL('../src/pages/ClientOnboarding.jsx', import.meta.url), 'utf8')
const edgeClientOnboardingSource = await readFile(
  new URL('../../supabase/functions/send-email/handlers/clientOnboarding.ts', import.meta.url),
  'utf8',
)

test('Phase 8 release report passes seeded global and Kingstons multi-buyer scenarios', () => {
  const report = buildTransactionBuyerReleaseReadinessReport()

  assert.equal(report.version, TRANSACTION_BUYER_RELEASE_READINESS_VERSION)
  assert.equal(report.phase, 8)
  assert.equal(report.ready, true, JSON.stringify(report.blockers, null, 2))
  assert.equal(report.counts.scenarios, 5)
  assert.equal(report.counts.blocked, 0)
  assert.equal(report.counts.global, 3)
  assert.equal(report.counts.kingstons, 2)
  assert.equal(report.counts.targetedDeliveryProofs > 0, true)
  assert.equal(report.counts.completionProofs, 3)
  assert.equal(report.globalContract.buyerOnboardingBeforeOtpGlobally, true)
  assert.equal(report.globalContract.agentManualCaptureAvailable, true)
  assert.equal(report.globalContract.completedBuyersPortalReady, true)
  assert.equal(report.globalContract.kingstonsSignedOtpException, true)
  assert.equal(report.globalContract.allKingstonsBuyersPortalReadyAfterOtp, true)
  assert.equal(report.globalContract.noCriticalOperationalAudits, true)
  assert.equal(report.globalContract.participantCompletionProjection, true)
})

test('Phase 8 release report blocks a global transaction missing buyer participants', () => {
  const report = buildTransactionBuyerReleaseReadinessReport({
    scenarios: [
      {
        scenario: 'regression_no_buyers',
        expectedMode: 'global_before_otp',
        transaction: {
          id: 'txn-regression-no-buyers',
          agencySlug: 'global',
          participants: [],
        },
      },
    ],
  })

  assert.equal(report.ready, false)
  assert.ok(report.blockers.some((row) => row.blocker === 'No active buyers available for release scenario.'))
  assert.ok(report.blockers.some((row) => row.blocker === 'Phase 7 buyer operational audit is critical.'))
})

test('Phase 8 release report blocks a Kingstons regression that opens onboarding before signed OTP', () => {
  const [kingstonsBeforeOtp] = buildTransactionBuyerReleaseReadinessScenarios()
    .filter((scenario) => scenario.expectedMode === 'kingstons_before_otp')
  const report = buildTransactionBuyerReleaseReadinessReport({
    scenarios: [
      {
        ...kingstonsBeforeOtp,
        transaction: {
          ...kingstonsBeforeOtp.transaction,
          agencySlug: 'global',
        },
      },
    ],
  })

  assert.equal(report.ready, false)
  assert.ok(report.blockers.some((row) => row.blocker === 'Kingstons pre-OTP scenario did not resolve as Kingstons.'))
  assert.ok(report.blockers.some((row) => row.blocker === 'Kingstons buyer onboarding became available before signed OTP.'))
})

test('Phase 8 phase registry covers every implemented multi-buyer phase', () => {
  assert.deepEqual(TRANSACTION_BUYER_RELEASE_PHASES.map((phase) => phase.phase), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.ok(TRANSACTION_BUYER_RELEASE_PHASES.some((phase) => phase.key === 'release_readiness'))
})

test('Phase 8 static wiring keeps earlier phase surfaces connected', () => {
  assert.match(releaseSource, /buildTransactionBuyerDeliveryPayload/)
  assert.match(releaseSource, /buildBuyerOnboardingCompletionParticipantPatch/)
  assert.match(releaseSource, /buildTransactionBuyerOperationalAudit/)
  assert.match(apiSource, /buyerOperationalAudit/)
  assert.match(apiSource, /getTransactionBuyerOperationalAudit/)
  assert.match(attorneyTransactionDetailSource, /BuyerPartyRosterPanel/)
  assert.match(attorneyTransactionDetailSource, /onSendBuyer=\{\(decision, action\)/)
  assert.match(clientOnboardingSource, /buyerTargetNonce/)
  assert.match(edgeClientOnboardingSource, /BUYER_TARGETED_ONBOARDING_LINK_VERSION/)
  assert.match(edgeClientOnboardingSource, /lastBuyerOnboardingLinkNonce/)
})

test('package exposes the Phase 8 single-phase and full-chain multi-buyer verification scripts', () => {
  assert.equal(
    packageJson.scripts?.['test:multi-buyer-transaction-phase8'],
    'node scripts/multi-buyer-transaction-phase8.test.mjs',
  )
  assert.match(packageJson.scripts?.['verify:multi-buyer-transaction'] || '', /test:multi-buyer-transaction-phase1/)
  assert.match(packageJson.scripts?.['verify:multi-buyer-transaction'] || '', /test:multi-buyer-transaction-phase8/)
})

console.log('multi-buyer transaction phase 8 release readiness tests passed')
