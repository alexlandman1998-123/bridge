import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SELLER_TRANSFER_ATTORNEY_DECISIONS,
  SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES,
  SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES,
  buildSellerTransferAttorneyOnboardingPatch,
  getSellerTransferAttorneySelectionSource,
  isSellerTransferAttorneyDecisionResolved,
  normalizeSellerTransferAttorneyDecision,
  validateSellerTransferAttorneyDecision,
} from '../src/lib/sellerTransferAttorneyDecision.js'
import { buildPrivateListingAttorneyAllocationInput } from '../src/services/privateListingAttorneyAllocationService.js'

const here = dirname(fileURLToPath(import.meta.url))

const recommendedAttorney = {
  id: '22222222-2222-4222-8222-222222222222',
  partnerOrganisationId: '33333333-3333-4333-8333-333333333333',
  companyName: 'Preferred Transfers Inc.',
  contactPerson: 'Transfer Team',
  email: 'TRANSFERS@PREFERRED.TEST',
}

const accepted = normalizeSellerTransferAttorneyDecision({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation,
  recommendedAttorney,
  recommendedBy: { id: 'agent-1', fullName: 'Alex Agent', email: 'ALEX@AGENCY.TEST' },
  recommendedAt: '2026-07-17T08:00:00+02:00',
  decidedBy: { name: 'Sam Seller', email: 'SAM@SELLER.TEST' },
  decidedAt: '2026-07-17T09:00:00+02:00',
  consentCaptured: true,
})

assert.equal(accepted.selectionSource, SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES.sellerAcceptedRecommendation)
assert.equal(accepted.recommendationStatus, SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES.recommended)
assert.equal(accepted.selectedAttorney.companyName, recommendedAttorney.companyName)
assert.equal(accepted.selectedAttorney.email, 'transfers@preferred.test')
assert.equal(accepted.recommendedBy.email, 'alex@agency.test')
assert.equal(validateSellerTransferAttorneyDecision(accepted, { requireDecision: true }).valid, true)
assert.equal(isSellerTransferAttorneyDecisionResolved(accepted), true)

const nominated = normalizeSellerTransferAttorneyDecision({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn,
  recommendedAttorney,
  selectedAttorney: { companyName: 'Seller Choice Attorneys', email: 'seller-choice@test.co.za' },
  decidedAt: '2026-07-17T10:00:00.000Z',
  consentCaptured: true,
})
assert.equal(nominated.selectionSource, SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES.sellerNominated)
assert.equal(nominated.selectedAttorney.companyName, 'Seller Choice Attorneys')
assert.equal(isSellerTransferAttorneyDecisionResolved(nominated), true)

const deferred = normalizeSellerTransferAttorneyDecision({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.defer,
  recommendedAttorney,
  decidedAt: '2026-07-17T10:30:00.000Z',
})
assert.equal(deferred.selectionSource, SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES.sellerDeferred)
assert.equal(deferred.selectedAttorney.companyName, '')
assert.equal(isSellerTransferAttorneyDecisionResolved(deferred), false)
assert.equal(validateSellerTransferAttorneyDecision(deferred, { requireDecision: true }).valid, true)

const untimestampedDeferral = validateSellerTransferAttorneyDecision({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.defer,
})
assert.equal(untimestampedDeferral.valid, false)
assert.match(untimestampedDeferral.errors.join(' '), /decision timestamp/)

const missingNomination = validateSellerTransferAttorneyDecision({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn,
  decidedAt: '2026-07-17T10:00:00.000Z',
  consentCaptured: true,
})
assert.equal(missingNomination.valid, false)
assert.match(missingNomination.errors.join(' '), /nominated transfer attorney/)

const missingConsent = validateSellerTransferAttorneyDecision({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation,
  recommendedAttorney,
  decidedAt: '2026-07-17T09:00:00.000Z',
})
assert.equal(missingConsent.valid, false)
assert.match(missingConsent.errors.join(' '), /consent must be recorded/)

const pending = validateSellerTransferAttorneyDecision({}, { requireDecision: true })
assert.equal(pending.valid, false)
assert.match(pending.errors.join(' '), /must accept the recommendation/)

const intentionallyUnrecommended = normalizeSellerTransferAttorneyDecision({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.pending,
  recommendationStatus: SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES.none,
  recommendedAt: '2026-07-17T08:00:00.000Z',
})
assert.equal(intentionallyUnrecommended.recommendationStatus, SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES.none)
assert.equal(validateSellerTransferAttorneyDecision(intentionallyUnrecommended).valid, true)

const missingRecommendedFirm = validateSellerTransferAttorneyDecision({
  recommendationStatus: SELLER_TRANSFER_ATTORNEY_RECOMMENDATION_STATUSES.recommended,
})
assert.equal(missingRecommendedFirm.valid, false)
assert.match(missingRecommendedFirm.errors.join(' '), /required when an agency recommendation/)

const mismatchedSource = validateSellerTransferAttorneyDecision({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation,
  recommendedAttorney,
  decidedAt: '2026-07-17T09:00:00.000Z',
  consentCaptured: true,
  selectionSource: SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES.sellerNominated,
})
assert.equal(mismatchedSource.valid, false)
assert.match(mismatchedSource.errors.join(' '), /selection source/)

assert.equal(
  getSellerTransferAttorneySelectionSource(SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation, { agentAssisted: true }),
  SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES.agentAssistedSellerSelection,
)

const patch = buildSellerTransferAttorneyOnboardingPatch(accepted)
assert.equal(patch.transferAttorneyDecision.version, 1)
assert.equal(patch.transferAttorneyDecision.decision, SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation)

const allocation = buildPrivateListingAttorneyAllocationInput({
  privateListingId: '11111111-1111-4111-8111-111111111111',
  attorney: accepted.selectedAttorney,
  source: accepted.selectionSource,
})
assert.equal(allocation.p_selection_source, SELLER_TRANSFER_ATTORNEY_SELECTION_SOURCES.sellerAcceptedRecommendation)

const migration = await readFile(
  resolve(here, '../../supabase/migrations/202607170001_seller_transfer_attorney_decision_phase1.sql'),
  'utf8',
)
assert.match(migration, /seller_accepted_recommendation/)
assert.match(migration, /seller_nominated/)
assert.match(migration, /seller_deferred/)
assert.match(migration, /agent_assisted_seller_selection/)

console.log('Seller transfer attorney decision Phase 1 checks passed.')
