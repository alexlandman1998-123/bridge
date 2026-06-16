import assert from 'node:assert/strict'
import {
  buildListingPayload,
  createInitialValues,
  validateWizardStep,
} from '../commercialListingWizardModel.js'

function makeLookups() {
  return {
    landlords: [{ value: 'landlord-1', label: 'Atlas Fund' }],
    brokers: [{ value: 'broker-1', label: 'Maya Patel' }],
    properties: [{ value: 'property-1', label: 'Midrand Logistics Park' }],
    vacancies: [{ value: 'vacancy-1', label: 'Unit 4B' }],
  }
}

function leaseDraftValues() {
  return {
    ...createInitialValues(makeLookups()),
    listing_intent: 'lease',
    property_category: 'industrial',
    property_link_mode: 'new',
    new_property_name: 'Midrand Logistics Park',
    new_property_city: 'Midrand',
    broker_id: 'broker-1',
    title: 'Midrand Logistics Park Unit 4B',
    listing_status: 'draft',
  }
}

{
  const errors = validateWizardStep(4, leaseDraftValues())
  assert.equal(errors.available_area, undefined, 'draft leases should not require full lease terms')
  assert.equal(errors.gross_rental_per_m2, undefined, 'draft leases should not require pricing')
  assert.equal(errors.availability_date, undefined, 'draft leases should not require availability')
}

{
  const errors = validateWizardStep(4, {
    ...leaseDraftValues(),
    listing_status: 'available',
  })
  assert.equal(errors.available_area, 'Available area is required.')
  assert.equal(errors.gross_rental_per_m2, 'Rental per m2 is required.')
  assert.equal(errors.availability_date, 'Availability date is required.')
}

{
  const payload = buildListingPayload({
    ...leaseDraftValues(),
    listing_status: 'available',
    visibility: 'public',
    new_property_address: '1 Sterling Road',
    new_property_suburb: 'Halfway House',
    available_area: '1200',
    gross_lettable_area: '1500',
    gross_rental_per_m2: '85',
    availability_date: '2026-08-01',
    unit_or_floor_suite: 'Unit 4B',
    new_vacancy_name: 'Unit 4B',
    warehouse_height: '8m',
    roller_shutter_doors: '3',
    three_phase_power: true,
    photo_urls: 'https://example.com/one.jpg\nhttps://example.com/two.jpg',
    brochure_url: 'https://example.com/brochure.pdf',
    internal_notes: 'Broker has draft mandate.',
  }, makeLookups())

  assert.equal(payload.listing_type, 'lease')
  assert.equal(payload.listing_category, 'industrial')
  assert.equal(payload.listing_status, 'available')
  assert.equal(payload.pricing, 85)
  assert.equal(payload.available_from, '2026-08-01')
  assert.equal(payload.new_property_name, 'Midrand Logistics Park')
  assert.equal(payload.new_vacancy_name, 'Unit 4B')
  assert.equal(payload.new_vacancy_status, 'available')
  assert.deepEqual(payload.media_json.photos, ['https://example.com/one.jpg', 'https://example.com/two.jpg'])
  assert.equal(payload.metadata_json.lease_terms.available_area, 1200)
  assert.equal(payload.metadata_json.commercial_attributes.roller_shutter_doors, 3)
  assert.equal(payload.marketing_json.visibility, 'public')
}

{
  const payload = buildListingPayload({
    ...createInitialValues(makeLookups()),
    listing_intent: 'sale',
    property_category: 'retail',
    property_link_mode: 'existing',
    property_id: 'property-1',
    landlord_id: 'landlord-1',
    broker_id: 'broker-1',
    title: 'Retail investment portfolio',
    listing_status: 'under_offer',
    asking_price: '12500000',
    building_size: '2800',
    sale_mandate_status: 'exclusive',
    cap_rate: '9.1',
    tenant_schedule: 'National grocer and pharmacy.',
  }, makeLookups())

  assert.equal(payload.property_id, 'property-1')
  assert.equal(payload.vacancy_id, null)
  assert.equal(payload.pricing, 12500000)
  assert.equal(payload.new_vacancy_name, null)
  assert.equal(payload.metadata_json.sale_terms.building_size, 2800)
  assert.equal(payload.metadata_json.sale_terms.cap_rate, 9.1)
}

console.log('commercialListingWizardModel tests passed')
