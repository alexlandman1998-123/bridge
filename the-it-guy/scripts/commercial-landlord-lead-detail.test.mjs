import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const detailSource = await fs.readFile(new URL('../src/modules/commercial/pages/CommercialLeadDetailPage.jsx', import.meta.url), 'utf8')

for (const marker of [
  'LandlordOverview',
  'LandlordProfilePanel',
  'LandlordPropertyPanel',
  'LandlordMandatePanel',
  'LandlordDocumentsPanel',
  'LandlordConversionPanel',
]) {
  assert.match(detailSource, new RegExp(marker), `landlord detail should include ${marker}`)
}

for (const journeyStage of [
  'Lead Captured',
  'Contacted',
  'Landlord Onboarding Sent',
  'Property Confirmed',
  'Vacancy Created',
  'Mandate Confirmed',
  'Matched to Tenant',
  'Deal Created',
]) {
  assert.match(detailSource, new RegExp(journeyStage), `landlord journey should include ${journeyStage}`)
}

for (const fallback of [
  'No broker assigned',
  'No vacancy created',
  'Mandate not confirmed',
  'No activity yet',
  'Property details pending',
  'Vacancy not created',
  'Rental not captured',
]) {
  assert.match(detailSource, new RegExp(fallback), `landlord detail should render fallback ${fallback}`)
}

for (const documentName of [
  'Company Registration Document',
  'Owner / Director ID',
  'Proof of Ownership',
  'Rates Account',
  'Existing Lease Schedule',
  'Floor Plans',
  'Mandate Agreement',
  'Property Photos',
]) {
  assert.match(detailSource, new RegExp(documentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `document checklist should include ${documentName}`)
}

assert.match(detailSource, /function buildLandlordVacancyPrefill/, 'create-vacancy prefill mapper should exist')
for (const mappedField of [
  'source_lead_id',
  'landlord_name',
  'contact_name',
  'formatted_address',
  'area_node',
  'vacancy_type',
  'broker_assignment',
  'asking_rental',
  'operating_costs',
  'minimum_lease_term',
]) {
  assert.match(detailSource, new RegExp(mappedField), `vacancy prefill should map ${mappedField}`)
}

assert.match(detailSource, /commercial-create-vacancy-draft/, 'create vacancy action should emit a safe prefilled draft event')
assert.match(detailSource, /Mandate \/ Terms/, 'landlord tabs should include Mandate / Terms')
assert.match(detailSource, /Match Tenant Requirement/, 'match tenant action should be present')
assert.match(detailSource, /Convert to Deal/, 'convert to deal action should be present')

console.log('commercial landlord lead detail tests passed')
