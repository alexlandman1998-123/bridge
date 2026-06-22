import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const detailSource = await fs.readFile(new URL('../src/modules/commercial/pages/CommercialLeadDetailPage.jsx', import.meta.url), 'utf8')

for (const marker of [
  'SellerOverview',
  'SellerProfilePanel',
  'SellerPropertyPanel',
  'SellerMandatePanel',
  'SellerListingPanel',
  'SellerDocumentsPanel',
  'SellerConversionPanel',
]) {
  assert.match(detailSource, new RegExp(marker), `seller detail should include ${marker}`)
}

for (const journeyStage of [
  'Lead Captured',
  'Contacted',
  'Seller Onboarding Sent',
  'Property Confirmed',
  'Mandate Sent',
  'Mandate Signed',
  'Listing Created',
  'Buyer Interest',
  'Offer Received',
  'Deal Created',
]) {
  assert.match(detailSource, new RegExp(journeyStage), `seller journey should include ${journeyStage}`)
}

for (const readinessMarker of [
  'Listing Readiness Score',
  'Listing Readiness',
  'Contact Details',
  'Property Details',
  'Ownership Verified',
  'Seller Onboarding Complete',
  'Mandate Signed',
  'Photos Uploaded',
  'Required Documents Uploaded',
  'Listing Created',
  'Ready',
  'Needs Attention',
  'Incomplete',
]) {
  assert.match(detailSource, new RegExp(readinessMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `seller readiness should include ${readinessMarker}`)
}

for (const field of [
  'Seller / Company Name',
  'Relationship Type',
  'Property Address',
  'Area / Node',
  'Asset Class',
  'Property Type',
  'GLA',
  'Erf Size',
  'Parking',
  'Ownership Type',
  'Occupancy Status',
  'Listing Status',
  'Listing Price',
  'Marketing Status',
  'Online Status',
]) {
  assert.match(detailSource, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `seller workspace should render ${field}`)
}

for (const documentName of [
  'Company Registration',
  'Director IDs',
  'Trust Documents',
  'Rates Account',
  'Title Deed',
  'Lease Schedule',
  'Property Photos',
  'Floor Plans',
  'Mandate Agreement',
]) {
  assert.match(detailSource, new RegExp(documentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `seller document checklist should include ${documentName}`)
}

assert.match(detailSource, /function buildSellerListingPrefill/, 'create-listing prefill mapper should exist')
for (const mappedField of [
  'commercial_sales_seller_lead',
  'source_lead_id',
  'seller_name',
  'contact_name',
  'property_name',
  'formatted_address',
  'area_node',
  'asset_class',
  'broker_assignment',
  'listing_price',
]) {
  assert.match(detailSource, new RegExp(mappedField), `listing prefill should map ${mappedField}`)
}

for (const actionOrTab of [
  'Send Seller Onboarding',
  'Generate Mandate',
  'Create Listing',
  'Preview Listing',
  'Publish Listing',
  'commercial-create-sales-listing-draft',
  'Convert to Deal',
]) {
  assert.match(detailSource, new RegExp(actionOrTab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `seller workspace should expose ${actionOrTab}`)
}

console.log('commercial sales seller lead detail tests passed')
