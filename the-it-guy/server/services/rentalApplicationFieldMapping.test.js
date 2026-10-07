import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { rentalOnboardingDatabase, actor, org, property } from '../tests/fixtures/rentalOnboardingDatabase.js'
import { rentalOnboardingClient } from '../tests/fixtures/rentalOnboardingClient.js'
import { rentalApplicationFieldScenario } from '../tests/fixtures/rentalApplicationFieldScenario.js'
import { handlePublicRentalApplication } from './publicRentalApplicationApi.js'
import { getRentalApplicationReview, listPersistedRentalApplicationsForLead } from '../../src/services/rentals/rentalApplicationRepository.js'
import { validateRentalApplicationFields } from '../../src/services/rentals/rentalApplicationFieldContract.js'

let db, client
beforeAll(async () => {
  db = await rentalOnboardingDatabase()
  await db.exec(`create table rental_application_access_tokens(id uuid default gen_random_uuid(),application_id uuid,token_hash text,expires_at timestamptz,revoked_at timestamptz,last_accessed_at timestamptz,subject_id text);
    alter table organisations add column name text,add column display_name text,add column logo_url text;
    create table organisation_settings(organisation_id uuid,settings_json jsonb);
    select set_config('test.actor','${actor}',false);`)
  client = rentalOnboardingClient(db, {}, actor)
}, 20000)
afterAll(async () => { await db?.close() })

it.each(['individual', 'joint_individuals', 'company', 'close_corporation', 'trust'])('preserves every %s field from applicant save to agent review and approved lease draft', async (type) => {
  const applicationId = randomUUID(), leadId = randomUUID(), unitId = randomUUID(), vacancyId = randomUUID()
  const token = `local-field-mapping-${applicationId}`
  const propertyData = { vacancyId, unitId, listingId: randomUUID(), title: 'Selected home', address: '12 Rental Road', monthlyRent: 11000, depositAmount: 22000 }
  await db.query('insert into leads(lead_id,organisation_id) values($1,$2)', [leadId, org])
  await db.query("insert into rental_units(id,organisation_id,status) values($1,$2,'available')", [unitId, org])
  await db.query('insert into rental_vacancies(id,organisation_id,property_id,unit_id,asking_rent,deposit_amount,lease_term_months) values($1,$2,$3,$4,9999,19998,6)', [vacancyId, org, property, unitId])
  await db.query('insert into rental_applications(id,organisation_id,lead_id,unit_id,vacancy_id,application_data) values($1,$2,$3,$4,$5,$6::jsonb)', [applicationId, org, leadId, unitId, vacancyId, JSON.stringify({ property: propertyData, onboarding: { source: 'agent' } })])
  await db.query("insert into rental_application_access_tokens(application_id,token_hash,expires_at) values($1,$2,'2099-01-01')", [applicationId, createHash('sha256').update(token).digest('hex')])
  const answers = rentalApplicationFieldScenario(type)
  const request = (method, body) => handlePublicRentalApplication({ method, body, token, env: { SUPABASE_URL: 'https://local.test', SUPABASE_SERVICE_ROLE_KEY: 'local-only' }, clientFactory: () => client })
  const saved = await request('PATCH', { version: 1, upgradeSchema: true, patch: { ...answers, property: { monthlyRent: 1 }, onboarding: { source: 'forged' } } })
  expect(saved.status).toBe(200)
  const expected = { ...answers, property: propertyData, ...(['company', 'close_corporation', 'trust'].includes(type) ? { documentInvalidations: [{ subjectId: 'entity' }] } : {}) }
  expect(validateRentalApplicationFields(expected)).toEqual([])
  expect(saved.body.application.data).toEqual(expected)
  expect((await request('GET')).body.application.data).toEqual(expected)
  const linked = await listPersistedRentalApplicationsForLead(org, leadId, { client })
  expect(linked).toHaveLength(1)
  expect(linked[0]).toMatchObject({ id: applicationId, version: 2, data: expected })
  const agent = await getRentalApplicationReview(applicationId, { client })
  expect(agent.data).toMatchObject(expected)
  expect(agent.data.onboarding.source).toBe('agent')

  // Approval is seeded for this mapping check. The separate review SQL suite
  // checks the document, screening and consent gates that allow approval.
  const approvedId = randomUUID()
  await db.transaction(async (fixture) => {
    // Local fixture setup only; restore trigger behaviour on transaction exit.
    await fixture.exec('set local session_replication_role=replica')
    await fixture.query("insert into rental_applications(id,organisation_id,unit_id,vacancy_id,status,application_data,submitted_snapshot_json) values($1,$2,$3,$4,'approved',$5::jsonb,$5::jsonb)", [approvedId, org, unitId, vacancyId, JSON.stringify({ ...expected, review: { internalNotes: 'Staff only' }, onboarding: { source: 'agent' } })])
  })
  const conversion = (await db.query('select rental_convert_application_to_tenancy($1,1) result', [approvedId])).rows[0].result
  const tenancy = (await db.query('select tenant_snapshot_json from rental_tenancies where id=$1', [conversion.tenancy_id])).rows[0]
  expect(tenancy.tenant_snapshot_json).toEqual(expected)
  const lease = (await db.query('select terms_json from rental_leases where id=$1', [conversion.lease_id])).rows[0]
  expect(lease.terms_json).toEqual({ monthly_rent: 11000, deposit_amount: 22000, lease_term_months: 12, intended_occupation_date: '2026-11-01' })
})
