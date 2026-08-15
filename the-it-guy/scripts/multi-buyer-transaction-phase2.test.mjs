import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  CLIENT_ACCESS_REASONS,
} from '../src/core/clientAccess/clientAccessPolicy.js'
import {
  TRANSACTION_BUYER_ONBOARDING_STATUSES,
  TRANSACTION_BUYER_PORTAL_STATUSES,
} from '../src/core/transactions/transactionBuyersModel.js'
import {
  TRANSACTION_BUYERS_POLICY_VERSION,
  resolveTransactionBuyerAccessPolicy,
  resolveTransactionBuyerActorAccess,
} from '../src/core/transactions/transactionBuyersPolicy.js'

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

test('non-Kingstons transaction resolves per-buyer onboarding delivery decisions', () => {
  const policy = resolveTransactionBuyerAccessPolicy({
    id: 'txn-phase2-onboarding',
    buyers: [
      {
        id: 'participant-1',
        buyer_id: 'buyer-1',
        name: 'Primary Buyer',
        email: 'primary@example.com',
        is_primary_buyer: true,
      },
      {
        id: 'participant-2',
        buyer_id: 'buyer-2',
        name: 'Offline Buyer',
      },
    ],
  })

  assert.equal(policy.version, TRANSACTION_BUYERS_POLICY_VERSION)
  assert.equal(policy.buyerDecisions.length, 2)
  assert.equal(policy.primaryDecision.buyerId, 'buyer-1')
  assert.equal(policy.summary.activeBuyerCount, 2)
  assert.equal(policy.summary.contactableBuyerCount, 1)
  assert.equal(policy.summary.anyBuyerCanReceiveOnboarding, true)
  assert.equal(policy.buyerDecisions[0].actions.sendOnboarding.enabled, true)
  assert.equal(policy.buyerDecisions[1].actions.sendOnboarding.enabled, false)
  assert.equal(policy.buyerDecisions[1].actions.sendOnboarding.reason, CLIENT_ACCESS_REASONS.buyerEmailRequired)
  assert.equal(policy.buyerDecisions[1].actions.manualCapture.enabled, true)
})

test('transaction portal readiness is evaluated per buyer, not only by the primary buyer', () => {
  const policy = resolveTransactionBuyerAccessPolicy({
    id: 'txn-phase2-readiness',
    buyers: [
      {
        id: 'participant-1',
        buyer_id: 'buyer-1',
        name: 'Ready Buyer',
        email: 'ready@example.com',
        is_primary_buyer: true,
        buyer_onboarding_status: TRANSACTION_BUYER_ONBOARDING_STATUSES.completed,
      },
      {
        id: 'participant-2',
        buyer_id: 'buyer-2',
        name: 'Waiting Buyer',
        email: 'waiting@example.com',
        buyer_onboarding_status: TRANSACTION_BUYER_ONBOARDING_STATUSES.inProgress,
      },
    ],
  })

  assert.equal(policy.primaryDecision.actions.sendPortalLink.enabled, true)
  assert.equal(policy.summary.portalReadyBuyerCount, 1)
  assert.equal(policy.summary.allActiveBuyersOnboardingSatisfied, false)
  assert.equal(policy.summary.allActiveBuyersPortalReady, false)
  assert.equal(policy.defaultPortalDecision.buyerId, 'buyer-1')
})

test('manual capture satisfies a buyer without making email delivery available', () => {
  const policy = resolveTransactionBuyerAccessPolicy({
    id: 'txn-phase2-manual',
    buyers: [
      {
        id: 'participant-1',
        buyer_id: 'buyer-1',
        name: 'Manual Buyer',
        is_primary_buyer: true,
        buyer_manual_capture_status: TRANSACTION_BUYER_ONBOARDING_STATUSES.manuallyCaptured,
        buyer_manual_capture_completed_at: '2026-08-15T08:00:00.000Z',
      },
    ],
  })

  assert.equal(policy.primaryDecision.onboardingSatisfied, true)
  assert.equal(policy.summary.allActiveBuyersOnboardingSatisfied, true)
  assert.equal(policy.primaryDecision.actions.manualCapture.enabled, true)
  assert.equal(policy.primaryDecision.actions.sendPortalLink.enabled, false)
  assert.equal(policy.primaryDecision.actions.sendPortalLink.reason, CLIENT_ACCESS_REASONS.buyerEmailRequired)
})

test('Kingstons blocks all buyer onboarding and portal delivery until signed OTP evidence exists', () => {
  const beforeOtp = resolveTransactionBuyerAccessPolicy({
    id: 'txn-phase2-kingstons',
    agencySlug: 'kingstons',
    buyers: [
      {
        id: 'participant-1',
        buyer_id: 'buyer-1',
        name: 'Primary Kingstons Buyer',
        email: 'primary@example.com',
        is_primary_buyer: true,
      },
      {
        id: 'participant-2',
        buyer_id: 'buyer-2',
        name: 'Second Kingstons Buyer',
        email: 'second@example.com',
      },
    ],
  })

  assert.equal(beforeOtp.isKingstons, true)
  assert.equal(beforeOtp.summary.anyBuyerCanReceiveOnboarding, false)
  assert.equal(beforeOtp.summary.anyBuyerCanReceivePortal, false)
  assert.equal(beforeOtp.buyerDecisions[0].actions.sendPortalLink.reason, CLIENT_ACCESS_REASONS.kingstonsManualOtpRequired)
  assert.equal(beforeOtp.actions.uploadSignedOtp.enabled, true)

  const afterOtp = resolveTransactionBuyerAccessPolicy({
    id: 'txn-phase2-kingstons',
    agencySlug: 'kingstons',
    documents: [
      {
        key: 'signed_otp',
        status: 'uploaded',
        fileUrl: 'https://example.test/signed-otp.pdf',
      },
    ],
    buyers: [
      {
        id: 'participant-1',
        buyer_id: 'buyer-1',
        name: 'Primary Kingstons Buyer',
        email: 'primary@example.com',
        is_primary_buyer: true,
      },
      {
        id: 'participant-2',
        buyer_id: 'buyer-2',
        name: 'Second Kingstons Buyer',
        email: 'second@example.com',
      },
    ],
  })

  assert.equal(afterOtp.summary.portalReadyBuyerCount, 2)
  assert.equal(afterOtp.summary.allActiveBuyersPortalReady, true)
  assert.equal(afterOtp.buyerDecisions[0].actions.sendPortalLink.enabled, true)
  assert.equal(afterOtp.buyerDecisions[1].actions.sendPortalLink.enabled, true)
  assert.equal(afterOtp.actions.uploadSignedOtp.enabled, false)
})

test('already sent buyer portal links are counted but not resent by default', () => {
  const policy = resolveTransactionBuyerAccessPolicy({
    id: 'txn-phase2-sent',
    buyers: [
      {
        id: 'participant-1',
        buyer_id: 'buyer-1',
        name: 'Already Invited Buyer',
        email: 'sent@example.com',
        is_primary_buyer: true,
        buyer_onboarding_status: TRANSACTION_BUYER_ONBOARDING_STATUSES.completed,
        buyer_portal_invite_status: TRANSACTION_BUYER_PORTAL_STATUSES.sent,
        buyer_portal_invited_at: '2026-08-15T09:00:00.000Z',
      },
    ],
  })

  assert.equal(policy.primaryDecision.portalAlreadySent, true)
  assert.equal(policy.primaryDecision.actions.sendPortalLink.enabled, false)
  assert.equal(policy.primaryDecision.actions.sendPortalLink.reason, 'buyer_portal_already_sent')
  assert.equal(policy.summary.portalAlreadySentBuyerCount, 1)
  assert.equal(policy.summary.allActiveBuyersPortalReady, true)
})

test('actor access resolves against the requested buyer rather than the transaction primary only', () => {
  const actorAccess = resolveTransactionBuyerActorAccess(
    {
      id: 'txn-phase2-actor',
      buyers: [
        {
          id: 'participant-1',
          buyer_id: 'buyer-1',
          name: 'Primary Buyer',
          email: 'primary@example.com',
          is_primary_buyer: true,
        },
        {
          id: 'participant-2',
          buyer_id: 'buyer-2',
          name: 'Second Buyer',
          email: 'second@example.com',
          buyer_onboarding_status: TRANSACTION_BUYER_ONBOARDING_STATUSES.completed,
        },
      ],
    },
    {
      email: 'second@example.com',
      authenticated: true,
    },
  )

  assert.equal(actorAccess.buyerFound, true)
  assert.equal(actorAccess.buyerDecision.buyerId, 'buyer-2')
  assert.equal(actorAccess.canViewBuyerPortal, true)
  assert.equal(actorAccess.canSubmitBuyerOnboarding, true)
})

test('package exposes the multi-buyer transaction Phase 2 policy regression', () => {
  assert.equal(
    packageJson.scripts?.['test:multi-buyer-transaction-phase2'],
    'node scripts/multi-buyer-transaction-phase2.test.mjs',
  )
})

console.log('multi-buyer transaction phase 2 tests passed')
