import assert from 'node:assert/strict'

import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'
import { buildDirectListingOperationalSummary } from '../src/lib/directListingOperationalSummary.js'
import { buildSellerPortalFormDataFromDirectListing } from '../src/lib/directListingSellerPortalBridge.js'

const intake = buildDirectListingIntakePayload({
  sellerName: 'Manual Seller',
  sellerEmail: 'manual@example.test',
  propertyAddress: '12 Paper Trail Road',
  hasSignedMandate: true,
  hasSignedFicaForm: true,
  mandateCaptureSource: 'in_person',
  ficaCaptureSource: 'email',
})
const listing = {
  ...intake.listing,
  sellerOnboarding: { formData: intake.sellerOnboardingFormData },
  sellerCanonicalFacts: intake.sellerCanonicalFacts,
  directListingIntake: {
    version: intake.version,
    source: intake.source,
    declarationsOnly: true,
    uploadsRequired: false,
    evidenceRequired: false,
  },
}

const portalForm = buildSellerPortalFormDataFromDirectListing(listing)
const mandateSummary = portalForm.directListingComplianceSummary.find((row) => row.key === 'mandate')
assert.equal(mandateSummary.status, 'reported_held_pending_upload')
assert.equal(mandateSummary.statusLabel, 'Reported received — upload pending')
assert.equal(mandateSummary.captureSource, 'in_person')
assert.equal(mandateSummary.requiresUpload, true)

const operational = buildDirectListingOperationalSummary(listing)
const mandateAction = operational.followUpActions.find((action) => action.key === 'mandate')
assert.equal(mandateAction.complete, false, 'reported receipt cannot satisfy an evidence requirement')
assert.equal(mandateAction.status, 'reported_held_pending_upload')
assert.match(mandateAction.attentionLabel, /upload and verify before activation/i)
assert.ok(operational.attentionItems.some((item) => /reported received/i.test(item)))

console.log('Direct listing document status phase 3 checks passed.')
