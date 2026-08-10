import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })

try {
  const {
    buildAcceptedOfferConversionCandidate,
    buildAcceptedOfferOnboardingPrefill,
  } = await server.ssrLoadModule('/src/lib/buyerLifecycleService.js')

  const selfManagedOffer = {
    id: 'offer-self-managed',
    organisationId: 'org-1',
    listingId: 'listing-1',
    buyerLeadId: 'buyer-1',
    offerAmount: 3_250_000,
    depositAmount: 150_000,
    bondComponent: 3_100_000,
    financeType: 'bond',
    conditions: {
      residentialOfferTerms: {
        buyer: {
          fullName: 'Jamie Self',
          email: 'jamie@example.test',
          phone: '0820000001',
        },
        capacity: {
          purchaserType: 'company',
          purchaserEntityName: 'Self Managed Holdings Pty Ltd',
        },
        finance: {
          financeType: 'bond',
          bondAssistancePreference: 'self_managed',
          bond_help_requested: 'no',
        },
      },
    },
  }

  const selfPrefill = buildAcceptedOfferOnboardingPrefill(selfManagedOffer)
  assert.equal(selfPrefill.purchaser_type, 'company')
  assert.equal(selfPrefill.purchaser_entity_type, 'company')
  assert.equal(selfPrefill.purchaser_entity_name, 'Self Managed Holdings Pty Ltd')
  assert.equal(selfPrefill.company_name, 'Self Managed Holdings Pty Ltd')
  assert.equal(selfPrefill.email, 'jamie@example.test')
  assert.equal(selfPrefill.bond_assistance_preference, 'self_managed')
  assert.equal(selfPrefill.bond_help_requested, 'no')
  assert.equal(selfPrefill.ooba_assist_requested, 'no')
  assert.equal(selfPrefill.finance_managed_by, 'client')
  assert.equal(selfPrefill.finance.bond_help_requested, 'no')
  assert.equal(selfPrefill.finance.finance_managed_by, 'client')
  assert.equal(selfPrefill.bond_assistance_selection, undefined)
  assert.equal(selfPrefill.bond_originator_name, undefined)

  const selfCandidate = buildAcceptedOfferConversionCandidate(selfManagedOffer, { now: '2026-08-10T10:00:00.000Z' })
  assert.equal(selfCandidate.contract, 'arch9-accepted-offer-conversion-candidate-v2')
  assert.equal(selfCandidate.purchaserType, 'company')
  assert.equal(selfCandidate.purchaserEntityType, 'company')
  assert.equal(selfCandidate.bondHelpRequested, 'no')
  assert.equal(selfCandidate.financeManagedBy, 'client')

  const assistedOffer = {
    id: 'offer-assisted',
    organisationId: 'org-1',
    listingId: 'listing-1',
    buyerContactId: 'contact-1',
    offerAmount: 4_500_000,
    cashComponent: 500_000,
    bondComponent: 4_000_000,
    financeType: 'hybrid',
    conditions: {
      residentialOfferTerms: {
        buyer: {
          fullName: 'Thandi Assisted',
          email: 'thandi@example.test',
          phone: '0820000002',
        },
        capacity: {
          purchaserType: 'trust',
          purchaserEntityName: 'Assisted Family Trust',
        },
        finance: {
          financeType: 'hybrid',
          bondAssistancePreference: 'originator_assisted',
          bond_help_requested: 'yes',
          bond_originator_name: 'Nominated Bond Co',
          bond_originator_contact: 'originator@example.test',
          bond_assistance_contact_consent: 'yes',
        },
      },
    },
  }

  const assistedPrefill = buildAcceptedOfferOnboardingPrefill(assistedOffer)
  assert.equal(assistedPrefill.purchaser_type, 'trust')
  assert.equal(assistedPrefill.purchaser_entity_type, 'trust')
  assert.equal(assistedPrefill.purchaser_entity_name, 'Assisted Family Trust')
  assert.equal(assistedPrefill.trust_name, 'Assisted Family Trust')
  assert.equal(assistedPrefill.purchase_finance_type, 'hybrid')
  assert.equal(assistedPrefill.bond_assistance_preference, 'originator_assisted')
  assert.equal(assistedPrefill.bond_help_requested, 'yes')
  assert.equal(assistedPrefill.ooba_assist_requested, 'yes')
  assert.equal(assistedPrefill.bond_assistance_selection, 'buyer_nominated')
  assert.equal(assistedPrefill.bond_assistance_contact_consent, 'yes')
  assert.equal(assistedPrefill.bond_originator_name, 'Nominated Bond Co')
  assert.equal(assistedPrefill.bond_originator_contact, 'originator@example.test')
  assert.equal(assistedPrefill.finance_managed_by, 'bond_originator')
  assert.equal(assistedPrefill.finance.bond_assistance_selection, 'buyer_nominated')
  assert.equal(assistedPrefill.finance.bond_originator_name, 'Nominated Bond Co')

  const assistedCandidate = buildAcceptedOfferConversionCandidate(assistedOffer, { now: '2026-08-10T10:00:00.000Z' })
  assert.equal(assistedCandidate.purchaserType, 'trust')
  assert.equal(assistedCandidate.purchaserEntityType, 'trust')
  assert.equal(assistedCandidate.bondAssistancePreference, 'originator_assisted')
  assert.equal(assistedCandidate.bondHelpRequested, 'yes')
  assert.equal(assistedCandidate.bondAssistanceSelection, 'buyer_nominated')
  assert.equal(assistedCandidate.bondOriginatorName, 'Nominated Bond Co')
  assert.equal(assistedCandidate.financeManagedBy, 'bond_originator')
} finally {
  await server.close()
}

console.log('accepted-offer-onboarding-continuity-phase2: passed')
