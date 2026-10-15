import { afterAll, beforeAll, expect, it } from 'vitest'
import { rentalListingInventoryDatabase, actor, org, property, unit, listing } from './fixtures/rentalListingInventoryDatabase.js'
import { rentalOnboardingClient } from './fixtures/rentalOnboardingClient.js'
import { ensureRentalListingVacancy, getRentalListingInventory } from '../../src/services/rentals/rentalListingInventoryRepository.js'
import { vi } from 'vitest'
vi.mock('../../src/lib/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: null }))
let db, client
const second = '88888888-8888-4888-8888-888888888888'
async function saveListing(id = listing, patch = {}) {
  const facts = { propertyId: property, unitId: unit, rentalInfo: { rentalPriceFrequency: 'monthly', availableFrom: '2026-11-01', depositAmount: 22000, leasePeriodMonths: 12 }, ...patch }
  await db.query('insert into private_listings(id,organisation_id,assigned_agent_id,address_line_1,city,asking_price,seller_canonical_facts_json) values($1,$2,$3,$4,$5,11000,$6)', [id, org, actor, '12 Saved Road', 'Pretoria', JSON.stringify(facts)])
}
beforeAll(async () => { db = await rentalListingInventoryDatabase(); client = rentalOnboardingClient(db, {}, actor, true); await saveListing() }, 30000)
afterAll(async () => { await db?.close() })

it('connects real inventory, records one draft vacancy, and reopens the same saved connection on retry', async () => {
  const connected = await ensureRentalListingVacancy(listing, org, { client })
  expect(connected).toMatchObject({ listingId: listing, propertyId: property, unitId: unit, vacancyStatus: 'draft' })
  const vacancy = (await db.query('select * from rental_vacancies where id=$1', [connected.vacancyId])).rows[0]
  expect(Number(vacancy.asking_rent)).toBe(11000)
  expect(Number(vacancy.deposit_amount)).toBe(22000)
  expect(vacancy.lease_term_months).toBe(12)
  expect(vacancy.available_from.toISOString().slice(0, 10)).toBe('2026-11-01')
  expect(await getRentalListingInventory(listing, org, { client })).toMatchObject({ vacancyId: vacancy.id, propertyId: property, unitId: unit })
  expect((await ensureRentalListingVacancy(listing, org, { client })).vacancyId).toBe(vacancy.id)
  expect((await db.query('select count(*)::int total from rental_vacancy_status_history')).rows[0].total).toBe(1)
})
it('does not duplicate or overwrite the in-progress vacancy when another advert or price arrives', async () => {
  await saveListing(second)
  await expect(ensureRentalListingVacancy(second, org, { client })).rejects.toThrow('another listing')
  await db.query('update private_listings set asking_price=14000 where id=$1', [listing])
  const value = await ensureRentalListingVacancy(listing, org, { client })
  expect(Number((await db.query('select asking_rent from rental_vacancies where id=$1', [value.vacancyId])).rows[0].asking_rent)).toBe(11000)
  expect((await db.query('select rental_vacancy_id from private_listings where id=$1', [second])).rows[0].rental_vacancy_id).toBeNull()
})
it('rejects sales links, removal and reassignment of an existing vacancy', async () => {
  const value = await ensureRentalListingVacancy(listing, org, { client })
  await expect(db.query("update private_listings set listing_category='private_sale' where id=$1", [listing])).rejects.toThrow()
  await expect(db.query('update private_listings set rental_vacancy_id=null where id=$1', [listing])).rejects.toThrow('cannot be replaced')
  await expect(db.query('update private_listings set rental_vacancy_id=$1 where id=$2', [value.vacancyId, second])).rejects.toThrow()
})
it('cannot create a vacancy for an occupied unit or a closed advert', async () => {
  await db.exec(`delete from private_listings where id='${second}'; update rental_units set status='occupied',active_tenancy_id='${second}' where id='${unit}'`)
  await saveListing(second)
  await expect(ensureRentalListingVacancy(second, org, { client })).rejects.toThrow('occupied')
  await db.exec(`update rental_units set status='vacant',active_tenancy_id=null where id='${unit}'; update private_listings set listing_status='withdrawn' where id='${second}'`)
  await expect(ensureRentalListingVacancy(second, org, { client })).rejects.toThrow('closed')
})
it('checks the authenticated organisation and rejects anonymous direct calls', async () => {
  await expect(ensureRentalListingVacancy(listing, second, { client })).rejects.toThrow('organisation')
  await db.exec('set role anon')
  await expect(db.query('select rental_ensure_listing_vacancy($1,$2)', [listing, org])).rejects.toThrow('permission')
  await db.exec('reset role')
})
it('leaves non-monthly listings outside the monthly application vacancy flow', async () => {
  await db.exec(`delete from private_listings where id='${second}'`)
  await saveListing(second, { rentalInfo: { rentalPriceFrequency: 'daily' } })
  expect(await ensureRentalListingVacancy(second, org, { client })).toEqual({ listingId: second, applicable: false })
  expect((await db.query('select count(*)::int total from rental_vacancies')).rows[0].total).toBe(1)
})
it('links the existing landlord contact and rejects a contact from another organisation', async () => {
  const result = await client.from('rental_property_landlords').insert({ organisation_id: org, property_id: property, party_id: actor, ownership_share: 100, is_primary_contact: true }).select('id').single()
  expect(result.error).toBeNull()
  await db.query('insert into contacts values($1,$2,$3,$4,$5,$6)', [second, second, 'Foreign', 'Owner', '', ''])
  const denied = await client.from('rental_property_landlords').insert({ organisation_id: org, property_id: property, party_id: second, ownership_share: 100, is_primary_contact: false }).select('id').single()
  expect(denied.error.message).toContain('existing landlord contact')
  expect((await db.query('select count(*)::int total from contacts where contact_id=$1', [actor])).rows[0].total).toBe(1)
  // Historical links remain editable without forcing an identity backfill.
  await db.exec('alter table rental_property_landlords disable trigger rental_validate_landlord_contact')
  await db.query('insert into rental_property_landlords(organisation_id,property_id,party_id,ownership_share) values($1,$2,$3,25)', [org, property, listing])
  await db.exec('alter table rental_property_landlords enable trigger rental_validate_landlord_contact')
  const retained = await client.from('rental_property_landlords').update({ organisation_id: org, ownership_share: 20 }).eq('party_id', listing).select('party_id,ownership_share').single()
  expect(retained.error).toBeNull()
  expect(Number(retained.data.ownership_share)).toBe(20)
})
it('retains submitted declarations while linking the exact property, unit and vacancy to its landlord portfolio', async () => {
  const leadId = '99999999-9999-4999-8999-999999999999'
  const raw = { arch9RentalLead: true, classification: 'rental', role: 'landlord', landlordProfile: { name: 'Saved Landlord' }, landlordPortfolio: [{ id: 'home', address: '12 Saved Road', canonicalPropertyId: property, canonicalUnitId: unit }] }
  await db.query('insert into leads(lead_id,organisation_id,raw_enquiry_payload) values($1,$2,$3)', [leadId, org, JSON.stringify(raw)])
  await db.query("insert into rental_landlord_onboarding(lead_id,organisation_id,version,status,declaration_json) values($1,$2,2,'submitted',$3)", [leadId, org, JSON.stringify({ declaredAt: '2026-10-10', name: 'Saved declaration' })])
  // A previously accepted mandate snapshot; new mandate approval is exercised
  // by the existing onboarding acceptance suite, not bypassed by this handoff.
  await db.exec('alter table rental_property_mandates disable trigger user')
  await db.query("insert into rental_property_mandates(organisation_id,property_id,mandate_status,authority_status,metadata_json) values($1,$2,'active','confirmed',$3)", [org, property, JSON.stringify({ leadId, signedEvidenceReference: 'uploaded/signed-mandate', signedAt: '2026-10-10' })])
  await db.exec('alter table rental_property_mandates enable trigger user')
  const admin = rentalOnboardingClient(db, {}, actor)
  const args = { p_lead_id: leadId, p_expected_version: 2, p_payload: { propertyId: 'home', listingId: listing, expectedDiscovery: { profile: raw.landlordProfile, portfolio: raw.landlordPortfolio } }, p_scope: { organisation_id: org }, p_actor: actor }
  const linked = await admin.rpc('rental_landlord_onboarding_link_property', args)
  expect(linked.error).toBeNull()
  const row = (await db.query('select raw_enquiry_payload from leads where lead_id=$1', [leadId])).rows[0]
  expect(row.raw_enquiry_payload.landlordPortfolio[0]).toMatchObject({ listingId: listing, canonicalPropertyId: property, canonicalUnitId: unit, vacancyId: (await ensureRentalListingVacancy(listing, org, { client })).vacancyId })
  const onboarding = (await db.query('select version,status,declaration_json from rental_landlord_onboarding where lead_id=$1', [leadId])).rows[0]
  expect(onboarding).toEqual({ version: 3, status: 'submitted', declaration_json: { declaredAt: '2026-10-10', name: 'Saved declaration' } })
  expect((await admin.rpc('rental_landlord_onboarding_link_property', args)).error).toBeNull()
  expect((await db.query('select count(*)::int total from rental_landlord_onboarding_events where lead_id=$1', [leadId])).rows[0].total).toBe(1)
  const denied = await admin.rpc('rental_landlord_onboarding_link_property', { ...args, p_payload: { propertyId: 'home', listingId: second } })
  expect(denied.error).toBeTruthy()
  expect((await db.query('select version from rental_landlord_onboarding where lead_id=$1', [leadId])).rows[0].version).toBe(3)
})
