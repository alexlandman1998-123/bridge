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
  'Landlord Onboarding Complete',
  'Mandate Sent',
  'Mandate Complete',
  'Landlord Onboarded',
]) {
  assert.match(detailSource, new RegExp(journeyStage), `landlord journey should include ${journeyStage}`)
}

const landlordJourneyBody = detailSource.match(/function buildLandlordJourney\(lead = \{\}, activities = \[\]\) \{[\s\S]*?\n\}/)?.[0] || ''
assert.ok(landlordJourneyBody, 'landlord journey builder should exist')
for (const removedStage of [
  'Property Confirmed',
  'Vacancy Created',
  'Matched to Tenant',
  'Deal Created',
]) {
  assert.doesNotMatch(landlordJourneyBody, new RegExp(removedStage), `landlord journey should not include operational stage ${removedStage}`)
}

for (const enumValue of [
  'LEAD_CAPTURED',
  'CONTACTED',
  'ONBOARDING_SENT',
  'ONBOARDING_COMPLETE',
  'MANDATE_SENT',
  'MANDATE_COMPLETE',
  'LANDLORD_ONBOARDED',
]) {
  assert.match(detailSource, new RegExp(enumValue), `landlord journey enum should include ${enumValue}`)
}

for (const uiCopy of [
  'Landlord Journey',
  'Progress from lead to active landlord client.',
  'Landlord Successfully Onboarded',
  'Properties, vacancies and leasing activity are managed separately.',
]) {
  assert.match(detailSource, new RegExp(uiCopy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `landlord journey UI should include ${uiCopy}`)
}

for (const fallback of [
  'No broker assigned',
  'Not sent',
  'Prospective landlord',
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
assert.match(detailSource, /relationship conversion signals/, 'landlord readiness should focus on relationship conversion')

const apiSource = await fs.readFile(new URL('../src/modules/commercial/services/commercialCanvassingApi.js', import.meta.url), 'utf8')
for (const field of ['landlordJourneyStage', 'landlord_journey_stage', 'stageCompletedAt', 'stage_completed_at', 'stageCompletedBy', 'stage_completed_by']) {
  assert.match(apiSource, new RegExp(field), `commercial canvassing API should map ${field}`)
}

const migrationSource = await fs.readFile(new URL('../../supabase/migrations/202606220001_commercial_landlord_journey_stage.sql', import.meta.url), 'utf8')
for (const field of ['landlord_journey_stage', 'stage_completed_at', 'stage_completed_by']) {
  assert.match(migrationSource, new RegExp(field), `landlord journey migration should add ${field}`)
}

console.log('commercial landlord lead detail tests passed')
