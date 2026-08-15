import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  TRANSACTION_BUYER_ONBOARDING_STATUSES,
  resolveTransactionBuyers,
} from '../src/core/transactions/transactionBuyersModel.js'
import {
  resolveTransactionBuyerAccessPolicy,
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

const attorneyTransactionDetailSource = await readFile(
  new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url),
  'utf8',
)
const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('agent transaction detail imports and renders the multi-buyer policy roster', () => {
  assert.match(attorneyTransactionDetailSource, /resolveTransactionBuyerAccessPolicy/)
  assert.match(attorneyTransactionDetailSource, /function BuyerPartyRosterPanel/)
  assert.match(attorneyTransactionDetailSource, /transactionBuyerAccessPolicy/)
  assert.match(attorneyTransactionDetailSource, /Manage Buyers/)
})

test('buyer roster is mounted in the Buyer workspace only', () => {
  const overviewStart = attorneyTransactionDetailSource.indexOf('function AgentTransactionOverview')
  const buyerWorkspaceStart = attorneyTransactionDetailSource.indexOf("{activeWorkspaceMenu === 'buyer' ? (")
  const sellerWorkspaceStart = attorneyTransactionDetailSource.indexOf("{activeWorkspaceMenu === 'seller' ? (", buyerWorkspaceStart)

  assert.ok(overviewStart > -1, 'AgentTransactionOverview should be sliceable')
  assert.ok(buyerWorkspaceStart > overviewStart, 'Buyer workspace should be after the overview component definition')
  assert.ok(sellerWorkspaceStart > buyerWorkspaceStart, 'Seller workspace should follow the Buyer workspace')

  const overviewSource = attorneyTransactionDetailSource.slice(overviewStart, buyerWorkspaceStart)
  const buyerWorkspaceSource = attorneyTransactionDetailSource.slice(buyerWorkspaceStart, sellerWorkspaceStart)

  assert.doesNotMatch(overviewSource, /<BuyerPartyRosterPanel/)
  assert.match(buyerWorkspaceSource, /<BuyerPartyRosterPanel/)
  assert.match(buyerWorkspaceSource, /policy=\{transactionBuyerAccessPolicy\}/)
})

test('buyer roster keeps delivery on the existing safe send handler', () => {
  const rosterStart = attorneyTransactionDetailSource.indexOf('function BuyerPartyRosterPanel')
  const rosterEnd = attorneyTransactionDetailSource.indexOf('const MATTER_STAGE_MILESTONES', rosterStart)
  assert.ok(rosterStart > -1 && rosterEnd > rosterStart, 'BuyerPartyRosterPanel should be sliceable')
  const rosterSource = attorneyTransactionDetailSource.slice(rosterStart, rosterEnd)

  assert.match(rosterSource, /onSendBuyer/)
  assert.match(attorneyTransactionDetailSource, /onSendBuyer=\{\(decision, action\) => void handleAgentHeaderOnboardingAction\(decision, action\)\}/)
})

test('transaction participant read model selects and normalizes buyer-party columns', () => {
  assert.match(apiSource, /TRANSACTION_PARTICIPANT_FULL_SELECT/)
  assert.match(apiSource, /buyer_party_id/)
  assert.match(apiSource, /buyer_onboarding_status/)
  assert.match(apiSource, /buyer_portal_invite_status/)
  assert.match(apiSource, /isMissingTransactionParticipantExtendedColumn/)
  assert.match(apiSource, /buyerPartyId: row\?\.buyer_party_id/)
  assert.match(apiSource, /buyerOnboardingStatus: row\?\.buyer_onboarding_status/)
  assert.match(apiSource, /buyerPortalInviteStatus: row\?\.buyer_portal_invite_status/)
})

test('camelCase API participant rows resolve as buyer parties for the UI', () => {
  const model = resolveTransactionBuyers({
    id: 'txn-phase3-ui',
    transaction_participants: [
      {
        id: 'participant-1',
        roleType: 'client',
        participantName: 'Primary API Buyer',
        participantEmail: 'primary@example.com',
        buyerPartyId: 'buyer-1',
        isPrimaryBuyer: true,
        buyerOnboardingStatus: TRANSACTION_BUYER_ONBOARDING_STATUSES.completed,
      },
      {
        id: 'participant-2',
        roleType: 'buyer',
        participantName: 'Second API Buyer',
        participantEmail: 'second@example.com',
        buyerPartyId: 'buyer-2',
      },
    ],
  })

  assert.equal(model.buyers.length, 2)
  assert.equal(model.primaryBuyer.name, 'Primary API Buyer')
  assert.equal(model.primaryBuyer.email, 'primary@example.com')
  assert.equal(model.hasMultipleBuyers, true)
})

test('phase 3 policy summary supports the roster counters', () => {
  const policy = resolveTransactionBuyerAccessPolicy({
    id: 'txn-phase3-policy',
    transaction_participants: [
      {
        id: 'participant-1',
        roleType: 'buyer',
        participantName: 'Ready Buyer',
        participantEmail: 'ready@example.com',
        buyerPartyId: 'buyer-1',
        isPrimaryBuyer: true,
        buyerOnboardingStatus: TRANSACTION_BUYER_ONBOARDING_STATUSES.completed,
      },
      {
        id: 'participant-2',
        roleType: 'buyer',
        participantName: 'Manual Buyer',
        buyerPartyId: 'buyer-2',
        buyerManualCaptureStatus: TRANSACTION_BUYER_ONBOARDING_STATUSES.manuallyCaptured,
      },
    ],
  })

  assert.equal(policy.summary.activeBuyerCount, 2)
  assert.equal(policy.summary.contactableBuyerCount, 1)
  assert.equal(policy.summary.onboardingSatisfiedBuyerCount, 2)
  assert.equal(policy.summary.portalReadyBuyerCount, 1)
})

test('package exposes the multi-buyer transaction Phase 3 UI regression', () => {
  assert.equal(
    packageJson.scripts?.['test:multi-buyer-transaction-phase3'],
    'node scripts/multi-buyer-transaction-phase3.test.mjs',
  )
})

console.log('multi-buyer transaction phase 3 tests passed')
