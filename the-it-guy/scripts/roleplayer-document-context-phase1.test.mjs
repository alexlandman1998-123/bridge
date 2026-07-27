import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  resolveDocumentBrandingContext,
  resolveSellerDisclosureDocumentContext,
} from '../src/lib/roleplayerDocumentContext.js'

const branding = resolveDocumentBrandingContext({
  assetBaseUrl: 'https://assets.example.test/root',
  sources: [
    {
      organisationName: 'Portal Agency',
      logoLightUrl: 'brand/light.svg',
      email: 'portal@example.test',
      phone: '+27 21 000 0000',
    },
    {
      organisationName: 'Listing Agency',
      logoUrl: '/listing/logo.svg',
      email: 'listing@example.test',
      website: 'www.listing.example.test',
      registrationNumber: '2020/000001/07',
    },
  ],
})

assert.equal(branding.organisationName, 'Portal Agency')
assert.equal(branding.agencyName, 'Portal Agency')
assert.equal(branding.logoLightUrl, 'https://assets.example.test/root/brand/light.svg')
assert.equal(branding.logoUrl, 'https://assets.example.test/root/listing/logo.svg')
assert.equal(branding.agencyLogoUrl, 'https://assets.example.test/root/brand/light.svg')
assert.equal(branding.email, 'portal@example.test')
assert.equal(branding.phone, '+27 21 000 0000')
assert.equal(branding.website, 'www.listing.example.test')
assert.equal(
  branding.contactItems.map((item) => item.type).join(','),
  'company,registration,email,phone,website',
)

const disclosureContext = resolveSellerDisclosureDocumentContext({
  listing: {
    id: 'listing-1',
    sellerProfileId: 'seller-1',
    propertyProfileId: 'property-1',
    seller: {
      name: 'Listing Seller',
      idNumber: '7001015009087',
    },
    branding: {
      organisationName: 'Listing Agency',
      email: 'listing@example.test',
      website: 'www.listing.example.test',
    },
  },
  formData: {
    sellerFirstName: 'Form',
    sellerSurname: 'Seller',
    portalBranding: {
      organisationName: 'Form Portal Agency',
      phone: '+27 82 000 0000',
    },
  },
  portalData: {
    transaction: {
      id: 'transaction-1',
      reference: 'TX-001',
    },
    branding: {
      organisationName: 'Portal Agency',
      email: 'portal@example.test',
    },
  },
  activeSellingContext: {
    branding: {
      logoLightUrl: 'active/light.svg',
      organisationName: 'Active Agency',
    },
  },
  generatedDocument: {
    listingId: 'generated-listing-1',
    sellerId: 'generated-seller-1',
    propertyId: 'generated-property-1',
  },
  assetBaseUrl: 'https://assets.example.test',
})

assert.equal(disclosureContext.sellerName, 'Form Seller')
assert.equal(disclosureContext.sellerIdNumber, '7001015009087')
assert.equal(disclosureContext.sellerId, 'generated-seller-1')
assert.equal(disclosureContext.propertyId, 'generated-property-1')
assert.equal(disclosureContext.listingId, 'generated-listing-1')
assert.equal(disclosureContext.transactionId, 'transaction-1')
assert.equal(disclosureContext.transactionReference, 'TX-001')
assert.equal(disclosureContext.branding.organisationName, 'Active Agency')
assert.equal(disclosureContext.branding.logoLightUrl, 'https://assets.example.test/active/light.svg')
assert.equal(disclosureContext.branding.email, 'portal@example.test')
assert.equal(disclosureContext.branding.phone, '+27 82 000 0000')
assert.equal(disclosureContext.branding.website, 'www.listing.example.test')

const disclosureGeneratedDocumentFallback = resolveSellerDisclosureDocumentContext({
  disclosure: {
    generatedDocument: {
      listingId: 'disclosure-listing-1',
      sellerId: 'disclosure-seller-1',
    },
  },
})

assert.equal(disclosureGeneratedDocumentFallback.listingId, 'disclosure-listing-1')
assert.equal(disclosureGeneratedDocumentFallback.sellerId, 'disclosure-seller-1')

const propertyDisclosureSource = readFileSync(new URL('../src/lib/propertyDisclosure.js', import.meta.url), 'utf8')
const sellerRequirementsSource = readFileSync(new URL('../src/services/sellerDocumentRequirementsService.js', import.meta.url), 'utf8')
const clientPortalSource = readFileSync(new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url), 'utf8')

assert.match(propertyDisclosureSource, /resolveDocumentBrandingContext/, 'Annexure A renderer should use the shared document branding adapter')
assert.match(sellerRequirementsSource, /resolveSellerDisclosureDocumentContext/, 'seller source-of-truth should use the shared seller disclosure adapter')
assert.match(clientPortalSource, /resolveSellerDisclosureDocumentContext/, 'seller portal document centre should use the shared seller disclosure adapter')
assert.doesNotMatch(sellerRequirementsSource, /function resolveSellerDocumentBranding/, 'seller source-of-truth should not keep a separate branding resolver')
assert.doesNotMatch(clientPortalSource, /const disclosureBranding = \{/, 'seller portal should not keep a separate disclosure branding resolver')

console.log('roleplayer document context phase 1 tests passed')
