import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  TRANSACTION_BUYER_DELIVERY_ACTIONS,
  TRANSACTION_BUYER_DELIVERY_VERSION,
  buildTransactionBuyerDeliveryPayload,
  normalizeTransactionBuyerDeliveryTarget,
} from '../src/core/transactions/transactionBuyerDelivery.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const attorneyTransactionDetailSource = await readFile(
  new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url),
  'utf8',
)
const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const buyerOnboardingNotificationSource = await readFile(
  new URL('../src/services/buyerOnboardingNotificationService.js', import.meta.url),
  'utf8',
)
const edgeClientOnboardingSource = await readFile(
  new URL('../../supabase/functions/send-email/handlers/clientOnboarding.ts', import.meta.url),
  'utf8',
)
const edgeOnboardingLoggingSource = await readFile(
  new URL('../../supabase/functions/send-email/services/onboardingLogging.ts', import.meta.url),
  'utf8',
)
const edgeTypesSource = await readFile(
  new URL('../../supabase/functions/send-email/types.ts', import.meta.url),
  'utf8',
)
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('delivery payload preserves the requested buyer target', () => {
  const target = normalizeTransactionBuyerDeliveryTarget({
    decision: {
      targetId: 'participant-1',
      participantId: 'participant-1',
      buyerId: 'buyer-party-1',
      email: 'BUYER@example.com',
      buyer: { name: 'Buyer One' },
      isPrimary: true,
    },
  })

  assert.equal(target.participantId, 'participant-1')
  assert.equal(target.buyerPartyId, 'buyer-party-1')
  assert.equal(target.email, 'buyer@example.com')

  const payload = buildTransactionBuyerDeliveryPayload({
    transactionId: 'txn-1',
    target,
    resend: true,
    source: 'phase4-test',
    action: TRANSACTION_BUYER_DELIVERY_ACTIONS.sendPortalLink,
  })

  assert.equal(payload.type, 'client_onboarding')
  assert.equal(payload.buyerDeliveryVersion, TRANSACTION_BUYER_DELIVERY_VERSION)
  assert.equal(payload.buyerDeliveryAction, TRANSACTION_BUYER_DELIVERY_ACTIONS.sendPortalLink)
  assert.equal(payload.buyerParticipantId, 'participant-1')
  assert.equal(payload.buyerPartyId, 'buyer-party-1')
  assert.equal(payload.buyerEmail, 'buyer@example.com')
})

test('agent buyer roster sends any eligible buyer through the targeted handler', () => {
  const rosterStart = attorneyTransactionDetailSource.indexOf('function BuyerPartyRosterPanel')
  const rosterEnd = attorneyTransactionDetailSource.indexOf('const MATTER_STAGE_MILESTONES', rosterStart)
  assert.ok(rosterStart > -1 && rosterEnd > rosterStart, 'BuyerPartyRosterPanel should be sliceable')
  const rosterSource = attorneyTransactionDetailSource.slice(rosterStart, rosterEnd)

  assert.match(rosterSource, /onSendBuyer/)
  assert.match(rosterSource, /onSendBuyer\?\.\(decision, TRANSACTION_BUYER_DELIVERY_ACTIONS\.sendOnboarding\)/)
  assert.match(rosterSource, /onSendBuyer\?\.\(decision, TRANSACTION_BUYER_DELIVERY_ACTIONS\.sendPortalLink\)/)
  const actionSource = rosterSource.slice(rosterSource.indexOf('<div className="flex shrink-0 flex-wrap gap-2">'))
  assert.doesNotMatch(actionSource, /isPrimary \? \(/)
})

test('transaction page carries a buyer target through roleplayer confirmation and Edge payloads', () => {
  assert.match(attorneyTransactionDetailSource, /const \[buyerDeliveryTarget, setBuyerDeliveryTarget\]/)
  assert.match(attorneyTransactionDetailSource, /buildTransactionBuyerDeliveryPayload/)
  assert.match(attorneyTransactionDetailSource, /openRoleplayerConfirmation\(normalizedTarget\)/)
  assert.match(attorneyTransactionDetailSource, /target: buyerDeliveryTarget \|\| recipient/)
  assert.match(attorneyTransactionDetailSource, /buyerTarget: buyerDeliveryTarget/)
  assert.match(attorneyTransactionDetailSource, /Buyer recipient/)
  assert.match(attorneyTransactionDetailSource, /onSendBuyer=\{\(decision, action\) => void handleAgentHeaderOnboardingAction\(decision, action\)\}/)
})

test('API audit stamps the matched buyer participant as onboarding sent', () => {
  assert.match(apiSource, /buyerTarget = null/)
  assert.match(apiSource, /buyer_onboarding_status: 'sent'/)
  assert.match(apiSource, /buyer_profile_status: 'invited'/)
  assert.match(apiSource, /\.eq\('buyer_party_id', targetBuyerPartyId\)/)
  assert.match(apiSource, /\.ilike\('participant_email', targetEmail\)/)
  assert.match(apiSource, /buyerTarget: targetParticipantId \|\| targetBuyerPartyId \|\| targetEmail/)
})

test('durable buyer onboarding outbox dedupes by buyer target', () => {
  assert.match(buyerOnboardingNotificationSource, /buyerTarget = null/)
  assert.match(buyerOnboardingNotificationSource, /normalizeTransactionBuyerDeliveryTarget/)
  assert.match(buyerOnboardingNotificationSource, /const dedupeTarget = target\.participantId \|\| target\.buyerPartyId \|\| target\.email \|\| 'primary'/)
  assert.match(buyerOnboardingNotificationSource, /dedupeKey: `buyer-onboarding:\$\{text\(transactionId\)\}:\$\{dedupeTarget\}`/)
  assert.match(buyerOnboardingNotificationSource, /buildTransactionBuyerDeliveryPayload/)
})

test('Edge Function resolves and marks targeted buyer participant delivery', () => {
  assert.match(edgeTypesSource, /buyerDeliveryAction\?/)
  assert.match(edgeTypesSource, /buyerParticipantId\?/)
  assert.match(edgeTypesSource, /buyerPartyId\?/)
  assert.match(edgeClientOnboardingSource, /payloadBuyerTarget/)
  assert.match(edgeClientOnboardingSource, /loadBuyerParticipantTarget/)
  assert.match(edgeClientOnboardingSource, /Buyer recipient was not found on this transaction/)
  assert.match(edgeClientOnboardingSource, /markBuyerParticipantDelivery/)
  assert.match(edgeClientOnboardingSource, /buyer_portal_invite_status: "sent"/)
  assert.match(edgeClientOnboardingSource, /buyer_onboarding_status: "sent"/)
  assert.match(edgeClientOnboardingSource, /buyerParticipantId: normalizeText\(buyerParticipant\?\.id\)/)
  assert.match(edgeOnboardingLoggingSource, /buyerParticipantId/)
  assert.match(edgeOnboardingLoggingSource, /buyerPartyId/)
})

test('package exposes the multi-buyer transaction Phase 4 delivery regression', () => {
  assert.equal(
    packageJson.scripts?.['test:multi-buyer-transaction-phase4'],
    'node scripts/multi-buyer-transaction-phase4.test.mjs',
  )
})

console.log('multi-buyer transaction phase 4 tests passed')
