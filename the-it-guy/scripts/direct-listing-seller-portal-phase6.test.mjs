import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'
import {
  buildSellerPortalFormDataFromDirectListing,
  hasDirectListingPortalIntake,
} from '../src/lib/directListingSellerPortalBridge.js'

const sellerOnboardingSource = readFileSync(new URL('../src/pages/SellerOnboarding.jsx', import.meta.url), 'utf8')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function buildListingFromDirectPayload(payload, extra = {}) {
  return {
    id: 'listing_direct_phase6',
    seller: {
      name: payload.sellerCanonicalFacts?.sellerName,
      email: payload.sellerPortalInvite?.destinationEmail,
      phone: payload.sellerPortalInvite?.destinationPhone,
    },
    sellerOnboarding: {
      status: 'sent',
      formData: payload.sellerOnboardingFormData,
    },
    sellerCanonicalFacts: payload.sellerCanonicalFacts,
    complianceDeclarations: payload.complianceDeclarations,
    ...extra,
  }
}

test('Seller Portal detects direct listing intake records', () => {
  const payload = buildDirectListingIntakePayload({
    sellerType: 'individual',
    sellerName: 'Sam',
    sellerSurname: 'Seller',
    sellerEmail: 'sam@example.com',
  })
  const listing = buildListingFromDirectPayload(payload)

  assert.equal(hasDirectListingPortalIntake(listing), true)
  assert.equal(hasDirectListingPortalIntake({ sellerOnboarding: { formData: {} } }), false)
})

test('Seller Portal maps company, sectional-title, mandate, and declarations from direct listing format', () => {
  const payload = buildDirectListingIntakePayload({
    sellerType: 'company',
    sellerName: 'Cara',
    sellerSurname: 'Contact',
    sellerEmail: 'cara@example.com',
    sellerPhone: '+27 82 123 4567',
    companyName: 'Direct Portal Holdings',
    companyRegistrationNumber: '2026/123456/07',
    companyDirectors: [{ fullName: 'Dina Director', email: 'dina@example.com', phone: '+27 82 000 0001' }],
    propertyAddress: '12 Scheme Road',
    propertyStructureType: 'sectional_title',
    unitNumber: '17',
    complexName: 'Oak Scheme',
    mandateType: 'tri',
    hasSignedMandate: true,
    hasSignedPropertyConditionDisclosure: false,
    hasSignedFicaForm: true,
  })
  const formData = buildSellerPortalFormDataFromDirectListing(buildListingFromDirectPayload(payload))

  assert.equal(formData.ownerEntityType, 'company')
  assert.equal(formData.ownerStructureType, 'company')
  assert.equal(formData.ownershipType, 'company')
  assert.equal(formData.companyName, 'Direct Portal Holdings')
  assert.equal(formData.companyDirectors.length, 1)
  assert.equal(formData.propertyStructureType, 'sectional_title')
  assert.equal(formData.unitNumber, '17')
  assert.equal(formData.schemeName, 'Oak Scheme')
  assert.equal(formData.mandateType, 'tri_mandate')
  assert.equal(formData.reportedMandateHeld, true)
  assert.equal(formData.reportedPropertyConditionDisclosureHeld, false)
  assert.equal(formData.reportedFicaFormHeld, true)
  assert.equal(formData.directListingUploadsRequired, false)
})

test('Seller Portal maps trust and foreign owner branches without requiring uploads', () => {
  const trustPayload = buildDirectListingIntakePayload({
    sellerType: 'trust',
    sellerName: 'Theo',
    sellerSurname: 'Trustee',
    sellerEmail: 'trust@example.com',
    trustName: 'Direct Portal Trust',
    trustees: [{ fullName: 'Tina Trustee', email: 'tina@example.com' }],
  })
  const trustFormData = buildSellerPortalFormDataFromDirectListing(buildListingFromDirectPayload(trustPayload))

  assert.equal(trustFormData.ownerEntityType, 'trust')
  assert.equal(trustFormData.ownerStructureType, 'trust')
  assert.equal(trustFormData.trustName, 'Direct Portal Trust')
  assert.equal(trustFormData.trustees.length, 1)
  assert.equal(trustFormData.directListingUploadsRequired, false)

  const foreignPayload = buildDirectListingIntakePayload({
    sellerType: 'foreign_individual',
    sellerName: 'Franco',
    sellerSurname: 'Foreign',
    sellerEmail: 'foreign@example.com',
    foreignOwnerCountry: 'United Kingdom',
    foreignPassportNumber: 'GB123456',
  })
  const foreignFormData = buildSellerPortalFormDataFromDirectListing(buildListingFromDirectPayload(foreignPayload))

  assert.equal(foreignFormData.ownerEntityType, 'foreign')
  assert.equal(foreignFormData.ownerStructureType, 'foreign_individual')
  assert.equal(foreignFormData.ownershipType, 'individual')
  assert.equal(foreignFormData.foreignOwnerCountry, 'United Kingdom')
  assert.equal(foreignFormData.foreignPassportNumber, 'GB123456')
})

test('SellerOnboarding applies the direct listing bridge and shows declaration summary copy', () => {
  assert.match(sellerOnboardingSource, /buildSellerPortalFormDataFromDirectListing/)
  assert.match(sellerOnboardingSource, /hasDirectListingPortalIntake/)
  assert.match(sellerOnboardingSource, /\.\.\.buildSellerPortalFormDataFromDirectListing\(listing\)/)
  assert.match(sellerOnboardingSource, /directListingComplianceSummary/)
  assert.match(sellerOnboardingSource, /upload them here so the listing can move toward activation or publish/)
})
