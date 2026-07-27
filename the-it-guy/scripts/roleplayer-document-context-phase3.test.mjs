import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mapSellerOnboardingToMandateData } from '../src/core/documents/mandateDataMapper.js'
import {
  buildRoleplayerDocumentContextParitySnapshot,
  compareRoleplayerDocumentContextParity,
  resolveSellerDisclosureDocumentContext,
} from '../src/lib/roleplayerDocumentContext.js'

const assetBaseUrl = 'https://assets.parity.example'
const canonicalBranding = {
  organisationName: 'Parity Realty',
  agencyName: 'Parity Realty',
  legalName: 'Parity Realty (Pty) Ltd',
  registrationNumber: '2026/765432/07',
  vatNumber: 'VAT 4780765432',
  fspNumber: 'PPRA FFC 20269999',
  physicalAddress: '9 Sync Street, Cape Town, 8001',
  email: 'documents@parity.example',
  phone: '+27 21 555 0300',
  website: 'www.parity.example',
  logoLightUrl: '/brand/parity-light.svg',
  logoDarkUrl: '/brand/parity-dark.svg',
}

const generatedDocument = {
  listingId: 'listing-context-parity',
  sellerId: 'seller-context-parity',
  propertyId: 'property-context-parity',
  transactionId: 'transaction-context-parity',
}

const listing = {
  id: generatedDocument.listingId,
  sellerProfileId: generatedDocument.sellerId,
  propertyProfileId: generatedDocument.propertyId,
  transactionId: generatedDocument.transactionId,
  transactionReference: 'TX-CONTEXT-PARITY',
  assetBaseUrl,
  seller: {
    name: 'Context Seller',
    idNumber: '8001015009087',
  },
  branding: canonicalBranding,
}

const sourceDisclosureContext = resolveSellerDisclosureDocumentContext({
  listing,
  formData: {
    sellerName: 'Context Seller',
    sellerIdNumber: '8001015009087',
    branding: canonicalBranding,
  },
  generatedDocument,
  assetBaseUrl,
})

const portalDisclosureContext = resolveSellerDisclosureDocumentContext({
  listing,
  formData: {
    sellerFirstName: 'Context',
    sellerSurname: 'Seller',
    sellerIdNumber: '8001015009087',
  },
  portalData: {
    listingId: generatedDocument.listingId,
    sellerProfileId: generatedDocument.sellerId,
    propertyProfileId: generatedDocument.propertyId,
    transaction: {
      id: generatedDocument.transactionId,
      reference: 'TX-CONTEXT-PARITY',
    },
    branding: canonicalBranding,
  },
  activeSellingContext: {
    branding: canonicalBranding,
  },
  generatedDocument,
  assetBaseUrl,
})

const mandateData = mapSellerOnboardingToMandateData({
  onboardingSubmission: {
    sellerName: 'Context Seller',
    idNumber: '8001015009087',
    propertyAddress: '9 Sync Street, Cape Town, 8001',
    mandateType: 'exclusive',
  },
  privateListing: {
    id: generatedDocument.listingId,
    propertyProfileId: generatedDocument.propertyId,
  },
  transaction: {
    id: generatedDocument.transactionId,
    reference: 'TX-CONTEXT-PARITY',
  },
  agency: {
    organisationName: canonicalBranding.organisationName,
    agencyName: canonicalBranding.agencyName,
    legalName: canonicalBranding.legalName,
    agencyRegistrationNumber: canonicalBranding.registrationNumber,
    vatNumber: canonicalBranding.vatNumber,
    fspNumber: canonicalBranding.fspNumber,
    agencyAddress: canonicalBranding.physicalAddress,
    email: canonicalBranding.email,
    phone: canonicalBranding.phone,
    website: canonicalBranding.website,
    logoLightUrl: canonicalBranding.logoLightUrl,
    logoHighContrastUrl: canonicalBranding.logoDarkUrl,
  },
  organisation: canonicalBranding,
})

const snapshots = [
  buildRoleplayerDocumentContextParitySnapshot({
    surfaceKey: 'seller_source_of_truth_annexure_a',
    source: sourceDisclosureContext,
    assetBaseUrl,
  }),
  buildRoleplayerDocumentContextParitySnapshot({
    surfaceKey: 'seller_portal_annexure_a',
    source: portalDisclosureContext,
    assetBaseUrl,
  }),
  buildRoleplayerDocumentContextParitySnapshot({
    surfaceKey: 'seller_mandate_packet',
    source: mandateData,
    branding: mandateData.branding,
    assetBaseUrl,
  }),
]

const requiredFields = [
  'sellerName',
  'sellerIdNumber',
  'organisationName',
  'legalName',
  'registrationNumber',
  'physicalAddress',
  'email',
  'phone',
  'website',
  'agencyLogoUrl',
]

const parity = compareRoleplayerDocumentContextParity(snapshots, { requiredFields })
assert.equal(parity.status, 'healthy')
assert.equal(parity.summary.surfaceCount, 3)
assert.equal(parity.summary.issueCount, 0)
assert.equal(parity.summary.mismatchCount, 0)
assert.equal(parity.summary.missingRequiredCount, 0)

for (const snapshot of parity.snapshots) {
  assert.equal(snapshot.sellerName, 'Context Seller')
  assert.equal(snapshot.sellerIdNumber, '8001015009087')
  assert.equal(snapshot.legalName, 'Parity Realty (Pty) Ltd')
  assert.equal(snapshot.registrationNumber, '2026/765432/07')
  assert.equal(snapshot.email, 'documents@parity.example')
  assert.equal(snapshot.phone, '+27 21 555 0300')
  assert.equal(snapshot.website, 'www.parity.example')
  assert.equal(snapshot.agencyLogoUrl, 'https://assets.parity.example/brand/parity-light.svg')
}

const brokenParity = compareRoleplayerDocumentContextParity([
  ...snapshots.slice(0, 2),
  {
    ...snapshots[2],
    surfaceKey: 'seller_mandate_packet_broken',
    email: 'old-template@example.invalid',
    website: '',
  },
], { requiredFields })

assert.equal(brokenParity.status, 'blocked')
assert.ok(
  brokenParity.issues.some((issue) => issue.code === 'roleplayer_context_field_mismatch' && issue.field === 'email'),
  'parity guard should catch a split email value between role/module surfaces',
)
assert.ok(
  brokenParity.issues.some((issue) => issue.code === 'roleplayer_context_field_missing' && issue.field === 'website'),
  'parity guard should catch missing required branding values',
)

const adapterSource = readFileSync(new URL('../src/lib/roleplayerDocumentContext.js', import.meta.url), 'utf8')
const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

assert.match(adapterSource, /ROLEPLAYER_DOCUMENT_CONTEXT_PARITY_VERSION/, 'shared adapter should expose the Phase 3 parity contract')
assert.match(adapterSource, /buildRoleplayerDocumentContextParitySnapshot/, 'shared adapter should expose parity snapshots')
assert.match(adapterSource, /compareRoleplayerDocumentContextParity/, 'shared adapter should expose parity comparison')
assert.match(packageSource, /test:roleplayer-document-context-phase3/, 'package script should register the Phase 3 roleplayer context parity guard')

console.log('roleplayer document context phase 3 tests passed')
