import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SELLER_TRANSFER_ATTORNEY_DECISIONS,
  SELLER_TRANSFER_ATTORNEY_OPERATIONAL_ACTIONS,
  buildSellerTransferAttorneyOperationalOutcome,
} from '../src/lib/sellerTransferAttorneyDecision.js'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '..')
const workspaceRoot = resolve(appRoot, '..')

const preferredAttorney = {
  preferredPartnerId: '22222222-2222-4222-8222-222222222222',
  companyName: 'Preferred Transfers Inc.',
  email: 'transfers@preferred.test',
}

const accepted = buildSellerTransferAttorneyOperationalOutcome({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation,
  recommendationStatus: 'recommended',
  recommendedAttorney: preferredAttorney,
  decidedAt: '2026-07-17T10:00:00.000Z',
  consentCaptured: true,
})
assert.equal(accepted.validation.valid, true)
assert.equal(accepted.action, SELLER_TRANSFER_ATTORNEY_OPERATIONAL_ACTIONS.readyForMandate)
assert.equal(accepted.task, null)
assert.equal(accepted.activity.type, 'transfer_attorney_recommendation_accepted')

const nominated = buildSellerTransferAttorneyOperationalOutcome({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn,
  recommendationStatus: 'recommended',
  recommendedAttorney: preferredAttorney,
  selectedAttorney: { companyName: 'Seller Choice Attorneys' },
  decidedAt: '2026-07-17T10:05:00.000Z',
  consentCaptured: true,
})
assert.equal(nominated.validation.valid, true)
assert.equal(nominated.action, SELLER_TRANSFER_ATTORNEY_OPERATIONAL_ACTIONS.verifyNomination)
assert.equal(nominated.task.title, 'Verify seller-nominated transferring attorney')
assert.equal(nominated.task.priority, 'High')
assert.match(nominated.task.description, /Seller Choice Attorneys/)

const deferred = buildSellerTransferAttorneyOperationalOutcome({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.defer,
  recommendationStatus: 'recommended',
  recommendedAttorney: preferredAttorney,
  decidedAt: '2026-07-17T10:10:00.000Z',
})
assert.equal(deferred.action, SELLER_TRANSFER_ATTORNEY_OPERATIONAL_ACTIONS.contactSeller)
assert.equal(deferred.task.title, 'Contact seller about transferring attorney')
assert.equal(deferred.activity.type, 'transfer_attorney_decision_deferred')

const missing = buildSellerTransferAttorneyOperationalOutcome({
  recommendationStatus: 'recommended',
  recommendedAttorney: preferredAttorney,
})
assert.equal(missing.action, SELLER_TRANSFER_ATTORNEY_OPERATIONAL_ACTIONS.resolveSelection)
assert.equal(missing.task.title, 'Resolve seller transferring attorney selection')
assert.equal(missing.validation.valid, true)

const changed = buildSellerTransferAttorneyOperationalOutcome({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn,
  selectedAttorney: { companyName: 'New Seller Choice Attorneys' },
  decidedAt: '2026-07-17T11:00:00.000Z',
  consentCaptured: true,
}, {
  previousDecision: {
    decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation,
    recommendationStatus: 'recommended',
    recommendedAttorney: preferredAttorney,
    decidedAt: '2026-07-17T10:00:00.000Z',
    consentCaptured: true,
  },
})
assert.equal(changed.decisionChanged, true)
assert.equal(changed.activity.metadata.decisionChanged, true)

const unchanged = buildSellerTransferAttorneyOperationalOutcome({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn,
  selectedAttorney: { companyName: 'New Seller Choice Attorneys' },
  decidedAt: '2026-07-17T12:00:00.000Z',
  consentCaptured: true,
}, {
  previousDecision: {
    decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn,
    selectedAttorney: { companyName: 'New Seller Choice Attorneys' },
    decidedAt: '2026-07-17T11:00:00.000Z',
    consentCaptured: true,
  },
})
assert.equal(unchanged.decisionChanged, false)

const migration = await readFile(
  resolve(workspaceRoot, 'supabase/migrations/202607170003_seller_transfer_attorney_operational_hardening_phase6.sql'),
  'utf8',
)
assert.match(migration, /token_expires_at is null or token_expires_at > now\(\)/)
assert.match(migration, /bridge_update_private_listing_seller_onboarding_progress/)
assert.match(migration, /Verify seller-nominated transferring attorney/)
assert.match(migration, /Contact seller about transferring attorney/)
assert.match(migration, /Resolve seller transferring attorney selection/)
assert.match(migration, /transfer_attorney_decision_changed/)
assert.match(migration, /seller_portal_draft/)
assert.match(migration, /decisionDedupeKey/)
assert.match(migration, /seller_decision_superseded/)
assert.match(migration, /where not exists/)
assert.match(migration, /security definer/)
assert.match(migration, /to anon, authenticated/)

console.log('Seller transfer attorney operational hardening Phase 6 checks passed.')
