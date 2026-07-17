import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SELLER_TRANSFER_ATTORNEY_DECISIONS,
  buildSellerTransferAttorneyMandatePatch,
} from '../src/lib/sellerTransferAttorneyDecision.js'
import { buildPrivateListingAttorneyAllocationInput } from '../src/services/privateListingAttorneyAllocationService.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const listingId = '11111111-1111-4111-8111-111111111111'

const accepted = buildSellerTransferAttorneyMandatePatch({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation,
  recommendationStatus: 'recommended',
  recommendedAttorney: {
    preferredPartnerId: '22222222-2222-4222-8222-222222222222',
    companyName: 'Preferred Transfers Inc.',
    email: 'transfers@preferred.test',
  },
  decidedAt: '2026-07-17T10:00:00.000Z',
  consentCaptured: true,
})
assert.equal(accepted.sellerTransferAttorneyDecisionPresent, true)
assert.equal(accepted.sellerTransferAttorneyDecisionResolved, true)
assert.equal(accepted.transferAttorneyCompanyName, 'Preferred Transfers Inc.')
assert.equal(accepted.transferAttorneySelectionSource, 'seller_accepted_recommendation')
assert.equal(accepted.transferAttorneySelectionDeferred, false)

const nominated = buildSellerTransferAttorneyMandatePatch({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn,
  recommendationStatus: 'none',
  selectedAttorney: {
    companyName: 'Seller Choice Attorneys',
    contactPerson: 'Nomination Team',
    phone: '+27 11 555 0100',
  },
  decidedAt: '2026-07-17T10:05:00.000Z',
  consentCaptured: true,
})
assert.equal(nominated.sellerTransferAttorneyDecisionResolved, true)
assert.equal(nominated.transferAttorneyPreferredPartnerId, '')
assert.equal(nominated.transferAttorneyCompanyName, 'Seller Choice Attorneys')
assert.equal(nominated.transferAttorneySelectionSource, 'seller_nominated')

const nominatedAllocation = buildPrivateListingAttorneyAllocationInput({
  privateListingId: listingId,
  attorney: {
    companyName: nominated.transferAttorneyCompanyName,
    contactPerson: nominated.transferAttorneyContactPerson,
    phone: nominated.transferAttorneyPhone,
  },
  source: nominated.transferAttorneySelectionSource,
})
assert.equal(nominatedAllocation.p_company_name, 'Seller Choice Attorneys')
assert.equal(nominatedAllocation.p_preferred_partner_id, null)
assert.equal(nominatedAllocation.p_selection_source, 'seller_nominated')

const deferred = buildSellerTransferAttorneyMandatePatch({
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.defer,
  recommendationStatus: 'recommended',
  recommendedAttorney: { companyName: 'Preferred Transfers Inc.' },
  decidedAt: '2026-07-17T10:10:00.000Z',
})
assert.equal(deferred.sellerTransferAttorneyDecisionResolved, false)
assert.equal(deferred.transferAttorneySelectionDeferred, true)
assert.equal(deferred.transferAttorneyCompanyName, '')

const pending = buildSellerTransferAttorneyMandatePatch({
  recommendationStatus: 'recommended',
  recommendedAttorney: { companyName: 'Preferred Transfers Inc.' },
})
assert.equal(pending.sellerTransferAttorneyDecisionPresent, true)
assert.equal(pending.sellerTransferAttorneyDecisionResolved, false)
assert.match(pending.sellerTransferAttorneyDecisionErrors.join(' '), /must accept the recommendation/)

const [workspaceSource, panelSource, buyerWorkspaceSource] = await Promise.all([
  readFile(resolve(root, 'src/pages/LegalDocumentWorkspacePage.jsx'), 'utf8'),
  readFile(resolve(root, 'src/components/documents/MandateDraftIntakePanel.jsx'), 'utf8'),
  readFile(resolve(root, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8'),
])

assert.match(workspaceSource, /buildSellerTransferAttorneyMandatePatch/)
assert.match(workspaceSource, /Resolve the seller\\'s transferring attorney decision/)
assert.match(workspaceSource, /sellerTransferAttorneyDecisionResolved/)
assert.match(workspaceSource, /sellerDecisionRecordedAt/)
assert.match(workspaceSource, /allocatePrivateListingTransferAttorney/)
assert.match(panelSource, /Seller’s recorded decision/)
assert.match(panelSource, /This selection is locked to the seller onboarding record/)
assert.match(panelSource, /Mandate blocked/)
assert.match(buyerWorkspaceSource, /The buyer does not reselect the seller's transferring attorney/)

console.log('Seller transfer attorney mandate propagation Phase 5 checks passed.')
