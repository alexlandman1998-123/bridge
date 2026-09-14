import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SELLER_ONBOARDING_ATTORNEY_CONSENT_STATUSES,
  SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES,
  SELLER_ONBOARDING_ATTORNEY_RECOMMENDATION_CONTRACT,
  buildSellerOnboardingAttorneyInstructionReadiness,
  confirmSellerOnboardingAttorneyInstruction,
  createSellerOnboardingAttorneyRecommendation,
  recordSellerOnboardingAttorneyConsent,
  readSellerOnboardingAttorneyRecommendation,
  resolveSellerOnboardingAttorneyChoiceAuthority,
  reviseSellerOnboardingAttorneyRecommendation,
  sellerOnboardingAttorneyRecommendationRequiresDecision,
} from '../sellerOnboardingAttorneyRecommendation.js'

test('records an optional agency recommendation without seller consent or instruction', () => {
  const recommendation = createSellerOnboardingAttorneyRecommendation({
    partner: {
      id: 'partner-connection:connection-1',
      connectionId: 'connection-1',
      relationshipId: 'relationship-1',
      partnerRoleConfigurationId: 'role-config-1',
      partnerOrganisationId: 'organisation-1',
      companyName: 'Example Conveyancers',
    },
    selectedAt: '2026-09-14T10:00:00.000Z',
    selectedBy: 'agent-1',
  })

  assert.equal(recommendation.contract, SELLER_ONBOARDING_ATTORNEY_RECOMMENDATION_CONTRACT)
  assert.equal(recommendation.status, 'recommended')
  assert.equal(recommendation.companyName, 'Example Conveyancers')
  assert.equal(recommendation.sellerConsentStatus, 'not_requested')
  assert.equal(recommendation.instructionStatus, 'not_instructed')
  assert.equal(readSellerOnboardingAttorneyRecommendation({ preferredTransferAttorneyRecommendation: recommendation }).partnerConnectionId, 'connection-1')
})

test('keeps an empty attorney recommendation explicitly optional', () => {
  const recommendation = createSellerOnboardingAttorneyRecommendation()
  assert.equal(recommendation.status, 'not_selected')
  assert.equal(recommendation.disclosureRequired, false)
  assert.equal(recommendation.instructionStatus, 'not_instructed')
})

test('records seller acceptance of a recommendation without creating an attorney instruction', () => {
  const recommendation = createSellerOnboardingAttorneyRecommendation({
    partner: { partnerOrganisationId: 'organisation-1', companyName: 'Example Conveyancers' },
    selectedAt: '2026-09-14T10:00:00.000Z',
  })

  assert.equal(sellerOnboardingAttorneyRecommendationRequiresDecision({ preferredTransferAttorneyRecommendation: recommendation }), true)

  const updated = recordSellerOnboardingAttorneyConsent({
    recommendation,
    decision: SELLER_ONBOARDING_ATTORNEY_CONSENT_STATUSES.ACCEPTED,
    decidedAt: '2026-09-14T10:05:00.000Z',
  })

  assert.equal(updated.sellerConsentStatus, 'accepted')
  assert.equal(updated.sellerConsentRecordedAt, '2026-09-14T10:05:00.000Z')
  assert.equal(updated.instructionStatus, 'not_instructed')
  assert.equal(sellerOnboardingAttorneyRecommendationRequiresDecision({ preferredTransferAttorneyRecommendation: updated }), false)
})

test('keeps a multi-owner attorney preference separate from each required mandate signature', () => {
  const authority = resolveSellerOnboardingAttorneyChoiceAuthority({
    recommendation: { status: 'recommended', companyName: 'Example Conveyancers' },
    signing: {
      signers: [
        { id: 'seller-1', name: 'Alex Seller', role: 'seller_1', roleLabel: 'Seller 1', required: true },
        { id: 'seller-2', name: 'Sam Seller', role: 'seller_2', roleLabel: 'Seller 2', required: true },
      ],
    },
  })

  assert.equal(authority.responseScope, 'seller_preference_only')
  assert.equal(authority.responseSignerId, 'seller-1')
  assert.equal(authority.requiresAllMandateSigners, true)
  assert.equal(authority.requiredMandateSignerCount, 2)
  assert.equal(authority.instructionStatus, 'not_instructed')
})

test('marks an entity representative choice as subject to its existing authority review', () => {
  const authority = resolveSellerOnboardingAttorneyChoiceAuthority({
    recommendation: { status: 'recommended', companyName: 'Example Conveyancers' },
    signing: {
      signers: [{
        id: 'company-authorised-signatory',
        name: 'Casey Director',
        role: 'authorised_signatory',
        roleLabel: 'Authorised signatory',
        capacity: 'Director',
        required: true,
        authorityRequired: true,
        authorityRequirement: { key: 'company_resolution', label: 'Company resolution / signing authority' },
      }],
    },
  })

  assert.equal(authority.responseSignerName, 'Casey Director')
  assert.equal(authority.requiresAuthorityReview, true)
  assert.equal(authority.authorityRequirement.key, 'company_resolution')
})

test('only makes a seller-accepted recommendation ready after mandate signature and authority review', () => {
  const recommendation = {
    status: 'recommended',
    companyName: 'Example Conveyancers',
    sellerConsentStatus: 'accepted',
    sellerChoiceAuthority: {
      requiresAuthorityReview: true,
      responseSignerId: 'company-authorised-signatory',
    },
    instructionStatus: 'not_instructed',
  }
  const unsigned = buildSellerOnboardingAttorneyInstructionReadiness({ recommendation })
  assert.equal(unsigned.status, SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES.AWAITING_MANDATE_SIGNATURE)

  const awaitingAuthority = buildSellerOnboardingAttorneyInstructionReadiness({
    recommendation,
    mandate: { isSigned: true },
    signing: { signers: [{ id: 'company-authorised-signatory', status: 'authority_uploaded' }] },
  })
  assert.equal(awaitingAuthority.status, SELLER_ONBOARDING_ATTORNEY_INSTRUCTION_STATUSES.AWAITING_AUTHORITY_REVIEW)

  const ready = buildSellerOnboardingAttorneyInstructionReadiness({
    recommendation,
    mandate: { isSigned: true },
    signing: { signers: [{ id: 'company-authorised-signatory', status: 'skipped_by_authority' }] },
  })
  assert.equal(ready.canCreateAgencyInstruction, true)
  const confirmed = confirmSellerOnboardingAttorneyInstruction({
    recommendation,
    readiness: ready,
    instructedAt: '2026-09-14T11:00:00.000Z',
    instructedBy: 'agent-1',
  })
  assert.equal(confirmed.instructionStatus, 'agency_instruction_confirmed')
  assert.equal(confirmed.allocationStatus, 'not_allocated')
})

test('revising a recommendation preserves the old audit snapshot and requires a fresh seller choice', () => {
  const current = {
    ...createSellerOnboardingAttorneyRecommendation({
      partner: { id: 'connection-1', partnerOrganisationId: 'firm-1', companyName: 'First Conveyancers' },
      selectedAt: '2026-09-14T09:00:00.000Z',
    }),
    sellerConsentStatus: 'accepted',
    sellerConsentRecordedAt: '2026-09-14T10:00:00.000Z',
  }
  const revised = reviseSellerOnboardingAttorneyRecommendation({
    current,
    partner: { id: 'connection-2', partnerOrganisationId: 'firm-2', companyName: 'Second Conveyancers' },
    revisedAt: '2026-09-14T11:00:00.000Z',
    revisedBy: 'agent-1',
  })

  assert.equal(revised.companyName, 'Second Conveyancers')
  assert.equal(revised.revision, 2)
  assert.equal(revised.sellerConsentStatus, 'not_requested')
  assert.equal(revised.instructionStatus, 'not_instructed')
  assert.equal(revised.supersedes.companyName, 'First Conveyancers')
  assert.equal(revised.supersedes.sellerConsentStatus, 'accepted')
  assert.equal(revised.recommendationRevisionHistory.length, 1)
})

test('does not silently revise a recommendation after formal agency instruction', () => {
  assert.throws(() => reviseSellerOnboardingAttorneyRecommendation({
    current: {
      status: 'recommended',
      companyName: 'First Conveyancers',
      instructionStatus: 'agency_instruction_confirmed',
    },
    partner: { partnerOrganisationId: 'firm-2', companyName: 'Second Conveyancers' },
  }), /transaction instruction workflow/)
})

test('records declined and deferred choices without changing the agency recommendation', () => {
  const recommendation = createSellerOnboardingAttorneyRecommendation({
    partner: { partnerOrganisationId: 'organisation-1', companyName: 'Example Conveyancers' },
  })

  for (const decision of ['declined', 'deferred']) {
    const updated = recordSellerOnboardingAttorneyConsent({ recommendation, decision })
    assert.equal(updated.sellerConsentStatus, decision)
    assert.equal(updated.companyName, 'Example Conveyancers')
    assert.equal(updated.instructionStatus, 'not_instructed')
  }
})
