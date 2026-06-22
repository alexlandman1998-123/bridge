import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../src/modules/commercial/pages/CommercialCanvassingPage.jsx', import.meta.url), 'utf8')
const tenantForm = source.match(/function renderLeaseTenantFields\([\s\S]*?\n\}\n\nfunction renderSalesSellerFields/)?.[0] || ''
const prospectingForm = source.match(/function renderLeaseProspectingFields\([\s\S]*?\n\}\n\nfunction renderLeaseLandlordFields/)?.[0] || ''

assert.ok(tenantForm, 'tenant canvassing form should exist')
assert.ok(prospectingForm, 'lease prospecting form section should exist')

for (const marker of [
  'Contact / Company Details',
  'Company Name *',
  'Contact Person',
  'Contact Number *',
  'Email Address',
  'Business Details',
  'Industry',
  'Asset Class Interest *',
]) {
  assert.match(tenantForm, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `tenant canvassing form should include ${marker}`)
}

for (const marker of [
  'Prospecting Information',
  'Assigned Broker *',
  'Source',
  'Notes',
]) {
  assert.match(prospectingForm, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `tenant prospecting section should include ${marker}`)
}

for (const removedMarker of [
  'Current Address / Area',
  'Search current premises',
  'Use a premises address, suburb, or operating node.',
]) {
  assert.doesNotMatch(tenantForm, new RegExp(removedMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `tenant canvassing form should not include ${removedMarker}`)
}

assert.match(tenantForm, /grid gap-4 md:grid-cols-2[\s\S]*Industry[\s\S]*Asset Class Interest \*/, 'business details should render as a balanced two-column row on desktop')
assert.match(source, /<CreateLabel label="Notes" className="md:col-span-2">/, 'notes should span the full prospecting row')
assert.match(source, /role === 'tenant' \? null : ''/, 'tenant current address should be submitted as null')
assert.match(source, /role === 'tenant' \? null : compactCommercialAddressPayload\(createDraft\.preferredAreaValue\)/, 'tenant preferred-area address payload should be null')
assert.match(source, /className="h-11 w-full rounded-\[8px\][^"]*sm:w-auto/, 'focused create modal save button should be full width on mobile')

console.log('commercial tenant canvassing modal tests passed')
