import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildSellerLeadListingPrefill } from '../src/lib/sellerLeadListingPrefill.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('seller onboarding fields win over seller lead fallbacks when creating a listing draft', () => {
  const prefill = buildSellerLeadListingPrefill({
    capturedAt: '2026-08-25T08:00:00.000Z',
    currentAgent: { id: 'agent-1', email: 'agent@example.com' },
    contact: {
      firstName: 'Lead',
      lastName: 'Fallback',
      email: 'lead@example.com',
      phone: '0820000000',
    },
    lead: {
      leadId: 'lead-1',
      sellerPropertyAddress: '1 Lead Street, Pretoria',
      propertyInterest: 'House',
      estimatedValue: 2500000,
      suburb: 'Brooklyn',
      city: 'Pretoria',
      province: 'Gauteng',
      sellerOnboarding: {
        formData: {
          sellerName: 'Submitted',
          sellerSurname: 'Seller',
          sellerEmail: 'submitted@example.com',
          sellerPhone: '0831111111',
          propertyAddress: '22 Portal Avenue, Waterkloof, Pretoria',
          propertyType: 'Townhouse',
          propertyStructureType: 'sectional_title',
          estateOrHoa: true,
          estateName: 'Waterkloof Estate',
          unitNumber: '7',
          onAuction: true,
          priceOnApplication: true,
          showReducedBanner: true,
          noTransferDuty: true,
          bedrooms: '4',
          bathrooms: '3',
          garages: '2',
          parkingCount: '1',
          floorSize: '210',
          erfSize: '450',
          propertyDescription: 'North-facing family townhouse with renovated kitchen.',
          amenities: ['clubhouse', 'security'],
          imageGallery: [{ id: 'img-1', url: 'https://cdn.example.com/house.jpg' }],
        },
      },
    },
  })

  assert.equal(prefill.form.sellerEmail, 'submitted@example.com')
  assert.equal(prefill.form.propertyAddress, '22 Portal Avenue, Waterkloof, Pretoria')
  assert.equal(prefill.form.propertyType, 'Townhouse')
  assert.equal(prefill.form.propertyStructureType, 'sectional_title')
  assert.equal(prefill.listingPayload.propertyStructureType, 'sectional_title')
  assert.equal(prefill.publicationData.bedrooms, 4)
  assert.equal(prefill.publicationData.bathrooms, 3)
  assert.equal(prefill.publicationData.floorSize, 210)
  assert.equal(prefill.publicationData.erfSize, 450)
  assert.equal(prefill.publicationData.description, 'North-facing family townhouse with renovated kitchen.')
  assert.deepEqual(prefill.publicationData.amenities, ['clubhouse', 'security'])
  assert.equal(prefill.media.galleryImages[0].url, 'https://cdn.example.com/house.jpg')
})

test('seller lead prefill creates a reviewable draft without portal publication', () => {
  const prefill = buildSellerLeadListingPrefill({
    capturedAt: '2026-08-25T08:00:00.000Z',
    lead: {
      leadId: 'lead-2',
      sellerPropertyAddress: '14 Direct Road, Cape Town',
      propertyInterest: 'Apartment',
      budget: 1800000,
      sellerOnboarding: {
        formData: {
          hasSignedMandate: false,
          hasSignedPropertyConditionDisclosure: false,
          hasSignedFicaForm: false,
        },
      },
    },
  })

  assert.equal(prefill.publicationData.status, 'Draft')
  assert.equal(prefill.listingPayload.listingVisibility, 'internal')
  assert.equal(prefill.listingPayload.property24Status, 'not_published')
  assert.equal(prefill.listingPayload.privatePropertyStatus, 'not_published')
  assert.equal(prefill.listingPayload.bridgeListingStatus, 'not_published')
  assert.equal(prefill.sellerOnboardingFormData.complianceDeclarations.uploadsRequired, false)
})

test('agency seller conversion persists aligned prefill and draft distribution data', () => {
  const agencySource = readFileSync(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
  assert.match(agencySource, /buildSellerLeadListingPrefill\(/)
  assert.match(agencySource, /persistSellerProfileOnboardingFormData\(\{\s*[\s\S]*formData: prefilledFormData/)
  assert.match(agencySource, /syncPrivateListingDistributionData\(createdListingId,\s*\{\s*[\s\S]*publicationData:\s*\{\s*[\s\S]*status: 'Draft'/)
  assert.match(agencySource, /externalLinks: \[\]/)
})

console.log('seller lead listing prefill alignment tests passed')
