import assert from 'node:assert/strict'
import test from 'node:test'
import { getSellerPostOnboardingPdfAvailability } from '../sellerPostOnboardingPdf.js'

test('disclosure PDF is available after onboarding without advancing any other document', () => {
  const availability = getSellerPostOnboardingPdfAvailability({
    key: 'signed_disclosure_form',
    generatedHtml: '<html><body>Disclosure</body></html>',
    signable: true,
  })
  assert.equal(availability.available, true)
  assert.equal(availability.fileName, 'seller-disclosure-annexure-a.pdf')
  assert.equal(availability.signable, true)
  assert.equal(availability.localOnly, true)
})

test('FICA remains blocked until agent review, while mandate also needs commission confirmation', () => {
  const ficaBlocked = getSellerPostOnboardingPdfAvailability({ key: 'signed_fica_declaration', generatedHtml: '<html></html>' })
  assert.equal(ficaBlocked.available, false)
  assert.match(ficaBlocked.reason, /Awaiting agent review/)
  assert.equal(getSellerPostOnboardingPdfAvailability({ key: 'signed_fica_declaration', generatedHtml: '<html></html>' }, { agentReviewApproved: true }).available, true)

  const mandateAfterReview = getSellerPostOnboardingPdfAvailability({ key: 'signed_mandate', generatedHtml: '<html></html>' }, { agentReviewApproved: true })
  assert.equal(mandateAfterReview.available, false)
  assert.match(mandateAfterReview.reason, /commission confirmation/)
  const mandateApproved = getSellerPostOnboardingPdfAvailability(
    { key: 'signed_mandate', generatedHtml: '<html></html>' },
    { agentReviewApproved: true, commissionConfirmed: true },
  )
  assert.equal(mandateApproved.available, true)
  assert.equal(mandateApproved.signable, false)

  const preparationSummary = getSellerPostOnboardingPdfAvailability(
    { key: 'signed_mandate', generatedHtml: '<html></html>', metadata: { notForSignature: true } },
    { agentReviewApproved: true, commissionConfirmed: true },
  )
  assert.equal(preparationSummary.available, false)
  assert.match(preparationSummary.reason, /review only/)
})

test('PDF conversion does not invent a file when the frozen HTML is absent', () => {
  const availability = getSellerPostOnboardingPdfAvailability({ key: 'signed_disclosure_form' })
  assert.equal(availability.available, false)
  assert.match(availability.reason, /not available/)
})
