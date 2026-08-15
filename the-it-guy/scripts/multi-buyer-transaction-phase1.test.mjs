import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  TRANSACTION_BUYER_ONBOARDING_STATUSES,
  TRANSACTION_BUYER_PORTAL_STATUSES,
  TRANSACTION_BUYER_ROLES,
  TRANSACTION_BUYERS_MODEL_VERSION,
  buildTransactionBuyerParticipantRows,
  resolveTransactionBuyers,
} from '../src/core/transactions/transactionBuyersModel.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const migrationSource = await readFile(
  new URL('../../supabase/migrations/202608150002_multi_buyer_transaction_parties_phase1.sql', import.meta.url),
  'utf8',
)
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('legacy transaction buyer resolves as a primary buyer party', () => {
  const model = resolveTransactionBuyers({
    id: 'txn-legacy',
    buyer_id: 'buyer-1',
    buyer_name: 'Legacy Buyer',
    buyer_email: 'legacy@example.com',
    buyer_phone: '+27 82 000 0001',
  })

  assert.equal(model.modelVersion, TRANSACTION_BUYERS_MODEL_VERSION)
  assert.equal(model.buyers.length, 1)
  assert.equal(model.primaryBuyer.buyerId, 'buyer-1')
  assert.equal(model.primaryBuyer.name, 'Legacy Buyer')
  assert.equal(model.primaryBuyer.email, 'legacy@example.com')
  assert.equal(model.primaryBuyer.role, TRANSACTION_BUYER_ROLES.primary)
  assert.equal(model.hasMultipleBuyers, false)
  assert.equal(model.legacyCompatible, true)
})

test('multiple buyer participants resolve with one primary buyer and stable ordering', () => {
  const model = resolveTransactionBuyers({
    id: 'txn-multi',
    primary_buyer_participant_id: 'participant-2',
    buyer_participants: [
      {
        id: 'participant-1',
        buyer_party_id: 'buyer-1',
        participant_name: 'Second Buyer',
        participant_email: 'second@example.com',
        transaction_role: 'buyer',
        buyer_party_position: 1,
      },
      {
        id: 'participant-2',
        buyer_party_id: 'buyer-2',
        participant_name: 'Primary Buyer',
        participant_email: 'primary@example.com',
        transaction_role: 'buyer',
        buyer_party_position: 0,
      },
    ],
  })

  assert.equal(model.buyers.length, 2)
  assert.equal(model.hasMultipleBuyers, true)
  assert.equal(model.primaryBuyer.participantId, 'participant-2')
  assert.equal(model.buyers[0].role, TRANSACTION_BUYER_ROLES.primary)
  assert.equal(model.buyers[1].role, TRANSACTION_BUYER_ROLES.additional)
  assert.deepEqual(model.buyers.map((buyer) => buyer.email), ['primary@example.com', 'second@example.com'])
})

test('per-buyer onboarding, manual capture, and portal statuses are preserved', () => {
  const model = resolveTransactionBuyers({
    id: 'txn-status',
    buyers: [
      {
        id: 'participant-1',
        name: 'Portal Buyer',
        email: 'portal@example.com',
        isPrimaryBuyer: true,
        buyer_onboarding_status: TRANSACTION_BUYER_ONBOARDING_STATUSES.completed,
        buyer_manual_capture_status: TRANSACTION_BUYER_ONBOARDING_STATUSES.notStarted,
        buyer_portal_invite_status: TRANSACTION_BUYER_PORTAL_STATUSES.sent,
        buyer_onboarding_completed_at: '2026-08-15T08:00:00.000Z',
      },
      {
        id: 'participant-2',
        name: 'Manual Buyer',
        buyer_manual_capture_status: TRANSACTION_BUYER_ONBOARDING_STATUSES.manuallyCaptured,
        buyer_portal_invite_status: TRANSACTION_BUYER_PORTAL_STATUSES.notSent,
      },
    ],
  })

  assert.equal(model.primaryBuyer.onboardingStatus, TRANSACTION_BUYER_ONBOARDING_STATUSES.completed)
  assert.equal(model.primaryBuyer.portalInviteStatus, TRANSACTION_BUYER_PORTAL_STATUSES.sent)
  assert.equal(model.buyers[1].manualCaptureStatus, TRANSACTION_BUYER_ONBOARDING_STATUSES.manuallyCaptured)
  assert.equal(model.buyers[1].email, '')
})

test('participant row mapping targets transaction_participants without removing legacy buyer_id', () => {
  const rows = buildTransactionBuyerParticipantRows({
    id: 'txn-map',
    buyer_id: 'legacy-buyer',
    buyers: [
      {
        buyer_id: 'buyer-1',
        name: 'Primary Buyer',
        email: 'primary@example.com',
        is_primary_buyer: true,
      },
      {
        buyer_id: 'buyer-2',
        name: 'Additional Buyer',
        email: 'additional@example.com',
      },
    ],
  })

  assert.equal(rows.length, 2)
  assert.equal(rows[0].transaction_id, 'txn-map')
  assert.equal(rows[0].role_type, 'buyer')
  assert.equal(rows[0].transaction_role, 'buyer')
  assert.equal(rows[0].is_primary_buyer, true)
  assert.equal(rows[0].buyer_party_role, TRANSACTION_BUYER_ROLES.primary)
  assert.equal(rows[1].buyer_party_role, TRANSACTION_BUYER_ROLES.additional)
  assert.equal(rows[0].buyer_metadata.modelVersion, TRANSACTION_BUYERS_MODEL_VERSION)
})

test('Phase 1 migration is additive and backfills the legacy buyer as primary', () => {
  assert.match(migrationSource, /alter table if exists public\.transaction_participants[\s\S]*add column if not exists buyer_party_id/)
  assert.match(migrationSource, /add column if not exists is_primary_buyer boolean not null default false/)
  assert.match(migrationSource, /add column if not exists primary_buyer_participant_id uuid references public\.transaction_participants\(id\) on delete set null/)
  assert.match(migrationSource, /transaction_participants_one_primary_buyer_idx/)
  assert.match(migrationSource, /insert into public\.transaction_participants[\s\S]*legacy_transaction_buyer/)
  assert.match(migrationSource, /transactions\.buyer_id/)
  assert.doesNotMatch(migrationSource, /drop column\s+buyer_id/i)
  assert.doesNotMatch(migrationSource, /drop table\s+public\.buyers/i)
})

test('package exposes the multi-buyer transaction Phase 1 regression', () => {
  assert.equal(
    packageJson.scripts?.['test:multi-buyer-transaction-phase1'],
    'node scripts/multi-buyer-transaction-phase1.test.mjs',
  )
})

console.log('multi-buyer transaction phase 1 tests passed')
