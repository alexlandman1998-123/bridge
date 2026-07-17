import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SELLER_TRANSFER_ATTORNEY_DECISIONS,
  normalizeSellerTransferAttorneyDecision,
  validateSellerTransferAttorneyDecision,
} from '../src/lib/sellerTransferAttorneyDecision.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const onboardingSource = await readFile(resolve(root, 'src/pages/SellerOnboarding.jsx'), 'utf8')

for (const expectedCopy of [
  'The choice belongs to you',
  'Use the recommended attorney',
  'Nominate another attorney',
  'Discuss this first',
  'Your nominated attorney',
]) {
  assert.match(onboardingSource, new RegExp(expectedCopy))
}

assert.match(onboardingSource, /mobilePaneIndex=\{sellerPaneIndexes\.transferringAttorney\}/)
assert.match(onboardingSource, /handleTransferAttorneyDecision/)
assert.match(onboardingSource, /handleNominatedTransferAttorneyUpdate/)
assert.match(onboardingSource, /validateSellerTransferAttorneyDecision\(form\.transferAttorneyDecision/)
assert.match(onboardingSource, /transferAttorneyDecision: normalizeSellerTransferAttorneyDecision/)
assert.match(onboardingSource, /title="Transferring Attorney"/)

const recommendation = {
  recommendationStatus: 'recommended',
  recommendedAttorney: {
    companyName: 'Preferred Transfer Inc.',
    contactPerson: 'Sam Attorney',
    email: 'sam@example.co.za',
  },
}
const accepted = normalizeSellerTransferAttorneyDecision({
  ...recommendation,
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.acceptRecommendation,
  decidedAt: '2026-07-17T08:00:00.000Z',
  consentCaptured: true,
})
assert.equal(validateSellerTransferAttorneyDecision(accepted, { requireDecision: true }).valid, true)
assert.equal(accepted.selectedAttorney.companyName, 'Preferred Transfer Inc.')

const nominated = normalizeSellerTransferAttorneyDecision({
  ...recommendation,
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.nominateOwn,
  selectedAttorney: { companyName: 'Seller Choice Attorneys', phone: '+27 11 555 0100' },
  decidedAt: '2026-07-17T08:05:00.000Z',
  consentCaptured: true,
})
assert.equal(validateSellerTransferAttorneyDecision(nominated, { requireDecision: true }).valid, true)
assert.equal(nominated.selectedAttorney.companyName, 'Seller Choice Attorneys')

const deferred = normalizeSellerTransferAttorneyDecision({
  ...recommendation,
  decision: SELLER_TRANSFER_ATTORNEY_DECISIONS.defer,
  decidedAt: '2026-07-17T08:10:00.000Z',
})
assert.equal(validateSellerTransferAttorneyDecision(deferred, { requireDecision: true }).valid, true)
assert.equal(deferred.selectedAttorney.companyName, '')

console.log('Seller transfer attorney consent Phase 3 checks passed.')
