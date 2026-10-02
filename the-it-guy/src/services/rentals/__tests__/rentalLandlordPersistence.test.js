// @vitest-environment jsdom
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { __privateListingServiceTestUtils, updatePrivateListing } from '../../privateListingService'
import { buildRentalPrivateListingPayload, RENTAL_LISTING_INITIAL_FORM, RENTAL_SELECT_OPTIONS, validateRentalListingDraftForm } from '../rentalListingDraftModel'
import { buildRentalListingEditForm, buildRentalListingUpdatePayload } from '../rentalListingEditModel'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: mocks.from } }))
vi.mock('../../suggestionGenerationService', () => ({ queueListingSuggestionGeneration: async () => null }))

const organisationId = '11111111-1111-4111-8111-111111111111'
const listingId = '22222222-2222-4222-8222-222222222222'
const fields = ['landlordType', 'landlordName', 'landlordEmail', 'landlordPhone', 'mandateStatus', 'marketingApprovalStatus', 'mandateStartDate', 'mandateEndDate']
const form = {
  ...RENTAL_LISTING_INITIAL_FORM,
  landlordName: "Zoë O'Neill & Partners (Pty) Ltd",
  landlordEmail: 'owner+rentals@example.co.za', landlordPhone: '+44 20 7946 0123',
  mandateStartDate: '2026-10-02', mandateEndDate: '2027-10-01',
  propertyAddress: '12 Example Road', monthlyRent: '11000', availableFrom: '2026-10-01',
  depositPolicy: 'no_deposit', description: 'Rental home',
}
let database
let injectedError
let updateAttempts = 0
const serialize = (value) => value && typeof value === 'object' ? JSON.stringify(value) : value
const captured = (value) => Object.fromEntries(fields.map((key) => [key, value[key]]))

async function insert(capture) {
  const payload = __privateListingServiceTestUtils.buildPrivateListingPayload(buildRentalPrivateListingPayload(capture, { organisationId }))
  await database.query('DELETE FROM private_listings')
  const keys = ['id', ...Object.keys(payload)]
  await database.query(`INSERT INTO private_listings (${keys.join(',')}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(',')})`, [listingId, ...Object.values(payload).map(serialize)])
  return (await database.query('SELECT * FROM private_listings WHERE id = $1', [listingId])).rows[0]
}

beforeAll(async () => {
  database = new PGlite()
  const payload = __privateListingServiceTestUtils.buildPrivateListingPayload(buildRentalPrivateListingPayload(form, { organisationId }))
  const columns = Object.entries(payload).map(([key, value]) => `${key} ${key.endsWith('_json') ? 'jsonb NOT NULL' : typeof value === 'number' ? 'numeric' : typeof value === 'boolean' ? 'boolean' : 'text'}`)
  await database.exec(`CREATE TABLE private_listings (id uuid PRIMARY KEY, ${columns.join(',')}, CHECK (mandate_status IN ('not_started','in_progress','ready','generated','sent','viewed','signed','signed_uploaded','signed_external_pending_upload','rejected','expired')))`)
  mocks.from.mockImplementation((table) => {
    let patch
    let id
    const execute = async () => {
      if (table !== 'private_listings') return { data: [], error: null }
      updateAttempts += 1
      if (injectedError) return { data: null, error: injectedError }
      const keys = Object.keys(patch)
      try {
        const result = await database.query(`UPDATE private_listings SET ${keys.map((key, index) => `${key} = $${index + 1}`).join(',')} WHERE id = $${keys.length + 1} RETURNING *`, [...Object.values(patch).map(serialize), id])
        return { data: result.rows[0], error: null }
      } catch (error) { return { data: null, error } }
    }
    const query = {
      update(value) { patch = value; return query }, eq(key, value) { id = value; return query },
      select() { return query }, in() { return query }, order() { return query },
      single: execute, then(resolve, reject) { return execute().then(resolve, reject) },
    }
    return query
  })
}, 20000)
afterAll(async () => { await database?.close() })

it('persists and reopens all eight fields for every landlord type, capture mandate status and marketing approval', async () => {
  let combinations = 0
  for (const type of RENTAL_SELECT_OPTIONS.landlordType) {
    for (const mandate of RENTAL_SELECT_OPTIONS.mandateStatus) {
      for (const approval of RENTAL_SELECT_OPTIONS.marketingApprovalStatus) {
        const original = { ...form, landlordType: type.value, mandateStatus: mandate.value, marketingApprovalStatus: approval.value }
        expect(validateRentalListingDraftForm(original, { organisationId })).toEqual([])
        const stored = await insert(original)
        expect(captured(buildRentalListingEditForm(stored))).toEqual(captured(original))
        const changed = { ...original, landlordName: `${original.landlordName} updated`, landlordPhone: '+27 82 123 4567', landlordEmail: 'updated@example.co.za', mandateEndDate: '2028-10-01' }
        const updated = await updatePrivateListing(listingId, buildRentalListingUpdatePayload(changed, stored), { includeRequirementsAndDocuments: false })
        expect(captured(buildRentalListingEditForm(updated))).toEqual(captured(changed))
        const reloaded = (await database.query('SELECT * FROM private_listings WHERE id = $1', [listingId])).rows[0]
        expect(captured(buildRentalListingEditForm(reloaded))).toEqual(captured(changed))
        combinations += 1
      }
    }
  }
  expect(combinations).toBe(105)
}, 20000)

it('keeps explicitly cleared contacts and dates empty and preserves details outside the editor', async () => {
  const stored = await insert(form)
  stored.seller_canonical_facts_json.landlordIdentity = { registrationNumber: '2026/123456/07' }
  stored.seller_canonical_facts_json.rentalInfo.documentReference = 'signed-mandate-1'
  const cleared = { ...form, landlordEmail: '', landlordPhone: '', mandateStartDate: '', mandateEndDate: '' }
  const updated = await updatePrivateListing(listingId, buildRentalListingUpdatePayload(cleared, stored), { includeRequirementsAndDocuments: false })
  const staleLegacyData = { ...updated, sellerEmail: 'stale@example.com', sellerPhone: 'old phone', mandateStartDate: '2020-01-01', mandateEndDate: '2020-12-31' }
  expect(captured(buildRentalListingEditForm(staleLegacyData))).toEqual(captured(cleared))
  expect(updated.sellerCanonicalFacts.landlordIdentity.registrationNumber).toBe('2026/123456/07')
  expect(updated.sellerCanonicalFacts.rentalInfo.documentReference).toBe('signed-mandate-1')
})

it('reopens the latest document mandate status and preserves all supported legacy statuses on update', async () => {
  const stored = await insert(form)
  for (const status of ['ready', 'generated', 'viewed', 'signed_external_pending_upload', 'rejected', 'expired', 'signed_uploaded']) {
    const edit = buildRentalListingEditForm({ ...stored, mandate_status: status })
    expect(edit.mandateStatus).toBe(status)
    expect(validateRentalListingDraftForm(edit, { organisationId })).toEqual([])
    const saved = await updatePrivateListing(listingId, buildRentalListingUpdatePayload(edit, stored), { includeRequirementsAndDocuments: false })
    expect(buildRentalListingEditForm(saved).mandateStatus).toBe(status)
  }
})

it('fails without discarding fields or retrying a reduced update when the schema is incompatible', async () => {
  const stored = await insert(form)
  const before = updateAttempts
  injectedError = { code: 'PGRST204', message: "Could not find the 'seller_canonical_facts_json' column of 'private_listings' in the schema cache" }
  try {
    await expect(updatePrivateListing(listingId, buildRentalListingUpdatePayload({ ...form, landlordName: 'Must not save' }, stored))).rejects.toThrow('No rental fields were discarded')
  } finally { injectedError = null }
  expect(updateAttempts - before).toBe(1)
  expect((await database.query('SELECT seller_canonical_facts_json FROM private_listings')).rows[0].seller_canonical_facts_json.landlordName).toBe(form.landlordName)
})

it('rejects missing names, invalid email, impossible dates, reversed date ranges and unsupported choices', () => {
  for (const change of [{ landlordName: ' ' }, { landlordEmail: 'invalid@' }, { mandateStartDate: '2026-02-30' }, { mandateStartDate: '2027-01-01', mandateEndDate: '2026-12-31' }, { landlordType: 'unsupported' }, { mandateStatus: 'unsupported' }, { marketingApprovalStatus: 'unsupported' }]) {
    expect(validateRentalListingDraftForm({ ...form, ...change }, { organisationId }).length).toBeGreaterThan(0)
  }
})

it('propagates a database timeout without reporting success or changing owner details', async () => {
  const stored = await insert(form)
  injectedError = { code: '57014', message: 'canceling statement due to statement timeout' }
  try {
    await expect(updatePrivateListing(listingId, buildRentalListingUpdatePayload({ ...form, landlordName: 'Must not save' }, stored))).rejects.toMatchObject(injectedError)
  } finally { injectedError = null }
  expect((await database.query('SELECT seller_canonical_facts_json FROM private_listings')).rows[0].seller_canonical_facts_json.landlordName).toBe(form.landlordName)
})

it('persists property category, address selection, property type, retirement choice and specifications on create and edit', async () => {
  const propertyFields = { propertyAddress: '81 Wild Avenue, Newlands, Pretoria', streetNumber: '81', streetName: 'Wild Avenue', suburb: 'Newlands', city: 'Pretoria', province: 'Gauteng', postalCode: '0081', latitude: -25.79, longitude: 28.29, googlePlaceId: 'place-81', unitNumber: '12', complexName: 'Rivers Edge', propertyType: 'Apartment', bedrooms: '2', bathrooms: '1.5', garages: '1', parkingBays: '2', floorSize: '92.5', erfSize: '350' }
  for (const propertyCategory of ['residential', 'commercial', 'industrial', 'retail', 'agricultural', 'vacant_land', 'mixed_use']) {
    for (const retirementAccommodation of ['yes', 'no']) {
      const capture = { ...form, ...propertyFields, propertyCategory, retirementAccommodation }
      const stored = await insert(capture)
      expect(buildRentalListingEditForm(stored)).toMatchObject({ ...propertyFields, propertyCategory, retirementAccommodation })
      const updated = await updatePrivateListing(listingId, buildRentalListingUpdatePayload({ ...capture, bedrooms: '3' }, stored), { includeRequirementsAndDocuments: false })
      expect(buildRentalListingEditForm(updated)).toMatchObject({ ...propertyFields, bedrooms: '3', propertyCategory, retirementAccommodation })
    }
  }
  const stored = await insert({ ...form, ...propertyFields })
  const cleared = { ...form, ...propertyFields, propertyAddress: '', streetNumber: '', streetName: '', suburb: '', city: '', province: '', postalCode: '', latitude: '', longitude: '', googlePlaceId: '', bedrooms: '0', floorSize: '', erfSize: '' }
  const updated = await updatePrivateListing(listingId, buildRentalListingUpdatePayload(cleared, stored), { includeRequirementsAndDocuments: false })
  expect(buildRentalListingEditForm({ ...updated, bedrooms: 5, floorSize: 999, latitude: -34, listingPublicationData: { floorSize: 999, erfSize: 999 } })).toMatchObject({ propertyAddress: '', streetNumber: '', suburb: '', latitude: '', longitude: '', googlePlaceId: '', bedrooms: '0', floorSize: '', erfSize: '' })
})

it('persists every documented category question, its enum choices, No, zero and explicit clearing through create/update/reopen', async () => {
  const { RENTAL_PORTAL_FIELDS, RENTAL_PROPERTY_TYPE_MAPPING, captureRentalPortalFacts, buildRentalPortalMapping, rentalFieldApplies } = await import('../rentalPortalFieldContract.js')
  const seen = new Set()
  const read = (object, path) => path.split('.').reduce((value, key) => value?.[key], object)
  for (const type of RENTAL_PROPERTY_TYPE_MAPPING) {
    // Different enum lengths are exercised without resetting other answers.
    for (let variant = 0; variant < 14; variant += 1) {
      const answers = Object.fromEntries(RENTAL_PORTAL_FIELDS.map((field) => [field.key, field.options ? field.options[variant % field.options.length] : field.format ? '2027-03-02' : field.type === 'boolean' ? variant % 2 === 0 : field.type === 'integer' || field.type === 'number' ? variant % 2 === 0 ? 0 : 12 : 'Confirmed detail']))
      const original = { ...form, petsPolicy: variant % 2 === 0 ? 'allowed' : 'not_allowed', propertyCategory: type.category, propertyType: type.type, rentalPortalFacts: answers }
      // Existing controls are authoritative for the descriptors they own.
      for (const field of RENTAL_PORTAL_FIELDS.filter((entry) => entry.formKey)) original[field.formKey] = field.type === 'boolean' ? variant % 2 === 0 ? 'no' : 'yes' : field.type === 'integer' || field.type === 'number' ? String(variant % 2 === 0 ? 0 : 12) : 'Confirmed detail'
      expect(validateRentalListingDraftForm(original, { organisationId })).toEqual([])
      const stored = await insert(original)
      const reopened = buildRentalListingEditForm(stored)
      expect(reopened.rentalPortalFacts).toEqual(captureRentalPortalFacts(original))
      const map = buildRentalPortalMapping(stored)
      for (const field of RENTAL_PORTAL_FIELDS.filter((entry) => rentalFieldApplies(entry, type.category, reopened.rentalPortalFacts))) {
        const value = reopened.rentalPortalFacts[field.key]
        if (value === null || value === undefined) continue
        seen.add(field.key)
        if (field.p24 && (!field.p24TitleTypes || field.p24TitleTypes.includes(reopened.rentalPortalFacts['propertyInfo.propertyDescription.propertyDescriptionType']))) expect(read(map.property24, field.p24), field.key).toEqual(value)
        if (field.pp && (!field.ppCategories || field.ppCategories.includes(type.category))) expect(map.privateProperty.attributes.find((attribute) => attribute.attributeType === field.pp)?.value, field.key).toBe(typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value))
      }
      // Retain all specialist answers through an unrelated edit, including fields
      // hidden by the current category/title choice.
      const updated = await updatePrivateListing(listingId, buildRentalListingUpdatePayload({ ...reopened, landlordName: 'Updated owner' }, stored), { includeRequirementsAndDocuments: false })
      expect(buildRentalListingEditForm(updated).rentalPortalFacts).toEqual(reopened.rentalPortalFacts)
    }
  }
  expect([...seen].sort()).toEqual(RENTAL_PORTAL_FIELDS.map((field) => field.key).sort())
  const cleared = { ...form, rentalPortalFacts: Object.fromEntries(RENTAL_PORTAL_FIELDS.map((field) => [field.key, null])) }
  const stored = await insert(cleared)
  const reopened = buildRentalListingEditForm(stored)
  expect(reopened.rentalPortalFacts).toEqual(captureRentalPortalFacts(cleared))
  expect(buildRentalPortalMapping(stored).fields).toEqual([])
}, 60000)
