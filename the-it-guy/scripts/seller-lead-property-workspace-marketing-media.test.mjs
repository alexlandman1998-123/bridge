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
assert.ok(!propertyWorkspace.includes("handleSellerJourneyAction('create_listing')"), 'Listing readiness must not create a listing.')
assert.ok(!propertyWorkspace.includes("handleSellerJourneyAction('open_listing')"), 'Listing readiness must not open a listing.')

const propertyEditor = source.slice(source.indexOf("sellerLeadEditMode === 'property' ? ("), source.indexOf("sellerLeadEditMode === 'characteristics' ? ("))
for (const field of ['propertyAddress', 'propertyType', 'estateComplexName', 'erfNumber', 'sectionalTitle', 'schemeName', 'sectionNumber', 'unitNumber', 'propertySuburb', 'propertyCity', 'propertyProvince', 'propertyPostalCode', 'latitude', 'longitude']) {
  assert.ok(propertyEditor.includes(`updateSellerProfileEditField('${field}'`), `Property Profile editor is missing ${field}.`)
}
assert.ok(propertyEditor.includes('ownershipScheme: value'), 'Property title type must update the stored structure type.')
assert.ok(source.includes('hasListing: journey?.listingCreated === true'), 'A private pre-mandate listing shell must not count as a listing.')
for (const field of ['estateComplexName', 'erfNumber', 'schemeName', 'sectionNumber', 'unitNumber', 'propertyPostalCode', 'latitude', 'longitude']) {
  assert.ok(source.includes(`${field}: normalizeText(form.`), `Manual property capture does not persist ${field}.`)
}

console.log('Seller lead property workspace presentation and capture contract verified.')
