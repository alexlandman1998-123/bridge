import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

const propertyWorkspaceStart = source.indexOf("leadWorkspaceTab === 'property'")
assert.notEqual(propertyWorkspaceStart, -1, 'Seller lead property workspace block is missing.')

const nextWorkspaceTab = source.indexOf("leadWorkspaceTab === 'documents'", propertyWorkspaceStart)
assert.notEqual(nextWorkspaceTab, -1, 'Seller lead documents workspace marker is missing after property block.')

const propertyWorkspace = source.slice(propertyWorkspaceStart, nextWorkspaceTab)

for (const removedCopy of [
  'Marketing Information & Media',
  'Edit Marketing Information',
  'Manage Media',
  'Published listing description',
  'Key selling points',
]) {
  assert.ok(!propertyWorkspace.includes(removedCopy), `Seller lead Property workspace should not render ${removedCopy}.`)
}

assert.ok(propertyWorkspace.includes('Property Profile'), 'Seller lead Property workspace should still render the property profile.')
assert.ok(propertyWorkspace.includes('Property Characteristics'), 'Seller lead Property workspace should still render property characteristics.')
assert.ok(propertyWorkspace.includes('Occupancy & Ownership'), 'Seller lead Property workspace should still render occupancy and ownership.')
assert.ok(propertyWorkspace.includes('Listing not created'), 'Pre-mandate property record should be shown as an uncreated listing.')
assert.ok(!propertyWorkspace.includes('listing.status}'), 'The raw private listing status must not appear in the indicator.')
assert.ok(propertyWorkspace.includes('selectedSellerJourney.onboardingSubmitted ? ('), 'Create Draft Listing must require submitted onboarding.')
assert.ok(propertyWorkspace.includes('handleCreateSellerPropertyDraftListing()'), 'Listing readiness must use the private draft creation action.')
assert.ok(propertyWorkspace.includes('Open {selectedLeadPropertyWorkspace.listing.isPrivateDraft'), 'A created draft must be openable from Listing & Readiness.')
assert.ok(!propertyWorkspace.includes("handleSellerJourneyAction('create_listing')"), 'Listing readiness must not use the mandate-gated journey action.')

const propertyEditor = source.slice(source.indexOf("sellerLeadEditMode === 'property' ? ("), source.indexOf("sellerLeadEditMode === 'characteristics' ? ("))
for (const field of ['propertyAddress', 'propertyType', 'erfNumber', 'sectionalTitle', 'sectionNumber', 'unitNumber', 'propertySuburb', 'propertyCity', 'propertyProvince', 'propertyPostalCode']) {
  assert.ok(propertyEditor.includes(`updateSellerProfileEditField('${field}'`), `Property Profile editor is missing ${field}.`)
}
assert.ok(propertyEditor.includes('Complex / Estate / Scheme'), 'Property Profile editor should use one shared name field.')
assert.ok(propertyEditor.includes('estateComplexName: value, schemeName: value'), 'The shared name must update both legacy fields.')
for (const removedField of ['placeholder="Scheme name"', 'placeholder="GPS latitude"', 'placeholder="GPS longitude"']) {
  assert.ok(!propertyEditor.includes(removedField), `Property Profile editor should not render ${removedField}.`)
}
assert.ok(source.includes("{ label: 'Complex / Estate / Scheme'"), 'Property Profile should show one shared name row.')
for (const removedLabel of ["{ label: 'Scheme name'", "{ label: 'GPS coordinates'", "{ label: 'Storeys'", "{ label: 'Year built'", "{ label: 'Condition'"]) {
  assert.ok(!source.includes(removedLabel), `Seller lead Property workspace should not show ${removedLabel}.`)
}
assert.ok(propertyWorkspace.includes('xl:self-stretch'), 'Property Characteristics and Occupancy cards should stretch to equal height on desktop.')
assert.ok(propertyEditor.includes('ownershipScheme: value'), 'Property title type must update the stored structure type.')
assert.ok(source.includes("'listing_review', 'mandate_ready'"), 'An explicit private review draft must count as a listing while an intake shell does not.')
assert.ok(source.includes('createPrivateDraft: true,') && source.includes('suppressSellerPortalInvite: true,'), 'Private draft creation must suppress the seller portal invite.')
assert.ok(source.includes("listingStatus: 'listing_review'"), 'An existing seller intake shell must be promoted to a private review draft.')
for (const field of ['estateComplexName', 'erfNumber', 'schemeName', 'sectionNumber', 'unitNumber', 'propertyPostalCode', 'latitude', 'longitude']) {
  assert.ok(source.includes(`${field}: normalizeText(form.`), `Manual property capture does not persist ${field}.`)
}

console.log('Seller lead property workspace presentation and capture contract verified.')
