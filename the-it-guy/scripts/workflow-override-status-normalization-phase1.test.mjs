#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  evaluatePrivateListingTransitionGuards,
} from '../src/lib/privateListingLifecycle.js'
import {
  getListingActivationReadiness,
  getListingReadinessSummary,
} from '../src/lib/sellerDocumentRequirementEngine.js'
import { getSellerPortalStageMeta } from '../src/lib/sellerPortalStageMapper.js'
import { buildSellerJourney } from '../src/services/sellerJourneyService.js'

const PROJECT_ROOT = new URL('../', import.meta.url)

function readProjectFile(relativePath) {
  return fs.readFileSync(new URL(relativePath, PROJECT_ROOT), 'utf8')
}

function buildListing(overrides = {}) {
  return {
    id: 'listing-phase1',
    listingStatus: 'mandate_sent',
    sellerOnboardingStatus: 'completed',
    sellerType: 'individual',
    seller_type: 'individual',
    addressLine1: '12 Oak Road',
    askingPrice: 2500000,
    propertyCategory: 'residential',
    propertyStructureType: 'freehold',
    organisationId: 'org-1',
    assignedAgentId: 'agent-1',
    mandateType: 'sole',
    mandateDuration: '90 days',
    mandateStatus: 'signed_external_pending_upload',
    sellerOnboarding: {
      status: 'completed',
      formData: {
        sellerFirstName: 'Alex',
        sellerSurname: 'Seller',
        ownershipType: 'individual',
        propertyAddress: '12 Oak Road',
        propertyCategory: 'residential',
        propertyStructureType: 'freehold',
        askingPrice: 2500000,
        mandateType: 'sole',
        mandateDuration: '90 days',
        commissionPercentage: '5',
      },
    },
    documentRequirements: [
      {
        id: 'signed-mandate-req',
        requirement_key: 'signed_mandate',
        requirement_name: 'Signed Mandate',
        status: 'required',
        is_required: true,
      },
    ],
    documents: [],
    ...overrides,
  }
}

const pendingUploadListing = buildListing()
assert.deepEqual(evaluatePrivateListingTransitionGuards(pendingUploadListing, 'mandate_signed'), [])
assert.deepEqual(evaluatePrivateListingTransitionGuards(pendingUploadListing, 'active'), [])

const pendingSummary = getListingReadinessSummary(pendingUploadListing)
assert.equal(pendingSummary.mandateSigned, true)
assert.equal(pendingSummary.mandateSignatureCaptured, true)
assert.equal(pendingSummary.signedMandateDocumentComplete, false)
assert.equal(pendingSummary.activeReady, false)
assert.equal(pendingSummary.readinessState, 'attention_required')
assert.equal(pendingSummary.missingRequirements.some((row) => row?.requirement_key === 'signed_mandate'), true)

const pendingActivation = getListingActivationReadiness(pendingSummary)
assert.equal(pendingActivation.ready, false)
assert.equal(pendingActivation.mandateSigned, true)
assert.equal(pendingActivation.mandateSignatureCaptured, true)
assert.equal(pendingActivation.signedMandateDocumentComplete, false)

const uploadedAliasSummary = getListingReadinessSummary(buildListing({ mandateStatus: 'uploaded_signed' }))
assert.equal(uploadedAliasSummary.mandateSigned, true)
assert.equal(uploadedAliasSummary.signedMandateDocumentComplete, true)
assert.equal(uploadedAliasSummary.activeReady, true)
assert.equal(uploadedAliasSummary.readinessState, 'ready_for_activation')

const signedUploadedSummary = getListingReadinessSummary(buildListing({ mandateStatus: 'signed_uploaded' }))
assert.equal(signedUploadedSummary.mandateSigned, true)
assert.equal(signedUploadedSummary.signedMandateDocumentComplete, true)
assert.equal(signedUploadedSummary.activeReady, true)

const journey = buildSellerJourney({
  lead: {
    leadId: 'lead-phase1',
    leadCategory: 'seller',
    sellerPropertyAddress: '12 Oak Road',
    mandateStatus: 'signed_external_pending_upload',
  },
})
assert.equal(journey.mandateStatus, 'signed')
assert.equal(journey.stage.key, 'mandate_signed')
assert.equal(journey.steps.find((step) => step.key === 'mandate_signed')?.state, 'current')

const portalStage = getSellerPortalStageMeta({
  mandateStatus: 'signed_external_pending_upload',
})
assert.equal(portalStage.currentStageKey, 'listed')

const packageJson = readProjectFile('package.json')
assert.match(packageJson, /"test:workflow-override-status-normalization-phase1":\s*"node scripts\/workflow-override-status-normalization-phase1\.test\.mjs"/)

console.log('workflow override status normalization Phase 1 tests passed')
