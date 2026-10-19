import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { rentalTenancyUploadDatabase, actor, org, property, unit, listing } from '../tests/fixtures/rentalTenancyUploadDatabase.js'
import { rentalOnboardingClient } from '../tests/fixtures/rentalOnboardingClient.js'
import { handlePublicRentalLandlordPortal } from './publicRentalLandlordPortalApi.js'
import { handleRentalClientPortalAccount } from './rentalClientPortalAccountApi.js'
const mocks = vi.hoisted(() => ({ client: null }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => mocks.client }))
let db, vacancyId
const token = 'fixture-landlord-token', membershipId = '88888888-8888-4888-8888-888888888888'
const env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' }
const account = () => handleRentalClientPortalAccount({ env, headers: { authorization: 'Bearer fixture-agent' }, query: { membershipId, audience: 'landlord' } })
beforeAll(async () => {
  db = await rentalTenancyUploadDatabase()
  for (const file of ['20260906163617_corrective_rental_portal_foundation.sql','20260830102633_rental_maintenance_request_intake.sql', '20260830102724_rental_maintenance_triage_assignment.sql','20260916130953_rental_tenant_maintenance_portal_bridge.sql']) await db.exec(readFileSync(new URL('../../../supabase/migrations/' + file, import.meta.url), 'utf8'))
  mocks.client = rentalOnboardingClient(db, {}, actor)
  const scoped = rentalOnboardingClient(db, {}, actor, true)
  vacancyId = (await scoped.rpc('rental_ensure_listing_vacancy', { p_listing_id: listing, p_organisation_id: org })).data.vacancyId
  await db.exec(`
    create table organisation_branding(organisation_id uuid primary key,organisation_display_name text,logo_light_url text,logo_dark_url text,logo_icon_url text,primary_brand_color text,secondary_brand_color text,accent_brand_color text);
    insert into organisation_branding values('${org}','Kingdom Real Estate','https://example.test/light.svg','https://example.test/dark.svg',null,'#123456','#234567','#bc3456');
    insert into organisation_settings values('${org}','{"privateSetting":"must-not-leak"}');
    create table rental_entity_documents(id uuid primary key,property_id uuid,organisation_id uuid,document_label text,document_category text,link_state text,created_at timestamptz default now());
    create table rental_client_portal_memberships(id uuid primary key,organisation_id uuid,user_id uuid,audience text,tenancy_id uuid,property_id uuid,status text,revoked_at timestamptz);
    insert into rental_client_portal_memberships(id,organisation_id,user_id,audience,property_id,status) values('${membershipId}','${org}','${actor}','landlord','${property}','active');
    insert into rental_units(id,organisation_id,property_id,unit_label,status) values('${membershipId}','${org}','${membershipId}','OTHER','vacant');
    insert into rental_vacancies(organisation_id,property_id,unit_id,asking_rent,status) values('${org}','${membershipId}','${membershipId}',99999,'draft');
  `)
  await db.query('insert into rental_landlord_portal_access(property_id,token_hash,expires_at) values($1,$2,$3)', [property, createHash('sha256').update(token).digest('hex'), '2099-01-01'])
}, 30000)
afterAll(async () => { await db?.close() })
it('shows the same saved listing and vacancy in token and signed-in landlord portals', async () => {
  const publicView = await handlePublicRentalLandlordPortal({ env, token })
  const accountView = await account()
  expect(publicView.status).toBe(200)
  expect(accountView.status).toBe(200)
  expect(accountView.body).toEqual(publicView.body)
  expect(accountView.body.listings).toHaveLength(1)
  expect(accountView.body.listings[0]).toMatchObject({ id: listing, rental_unit_id: unit, rental_vacancy_id: vacancyId })
  expect(accountView.body.vacancies).toHaveLength(1)
  expect(accountView.body.vacancies[0]).toMatchObject({ id: vacancyId, unit_id: unit, status: 'draft' })
  expect(Object.keys(accountView.body.listings[0]).sort()).toEqual(['id','listing_status','listing_visibility','rental_unit_id','rental_vacancy_id','title'])
  expect(accountView.body.branding).toMatchObject({ organisationId: org, agencyName: 'Kingdom Real Estate', logoDarkUrl: 'https://example.test/dark.svg', logoLightUrl: 'https://example.test/light.svg', primaryColour: '#123456', secondaryColour: '#234567', accentColour: '#bc3456' })
  expect(JSON.stringify(accountView.body)).not.toContain('must-not-leak')
})
it('uses the current agency onboarding CI ahead of the public branding row', async () => {
  await db.query('update organisation_settings set settings_json=$1 where organisation_id=$2', [JSON.stringify({ agencyOnboarding: { branding: { primaryColour: '#987654', accentColour: '#654321', logoDarkUrl: 'https://example.test/current.svg' } } }), org])
  const result = await account()
  expect(result.status).toBe(200)
  expect(result.body.branding).toMatchObject({ agencyName: 'Kingdom Real Estate', primaryColour: '#987654', secondaryColour: '#234567', accentColour: '#654321', logoDarkUrl: 'https://example.test/current.svg' })
})
it('denies another account and a membership whose organisation does not match the property', async () => {
  const missing = await handleRentalClientPortalAccount({ env, headers: { authorization: 'Bearer fixture-agent' }, query: { membershipId: listing, audience: 'landlord' } })
  expect(missing.status).toBe(403)
  await db.query('update rental_client_portal_memberships set organisation_id=$1 where id=$2', [listing, membershipId])
  expect((await account()).status).toBe(404)
  await db.query('update rental_client_portal_memberships set organisation_id=$1 where id=$2', [org, membershipId])
})
it('denies a revoked public link before returning any property state', async () => {
  await db.exec('update rental_landlord_portal_access set revoked_at=now()')
  const response = await handlePublicRentalLandlordPortal({ env, token })
  expect(response.status).toBe(401)
  expect(response.body.property).toBeUndefined()
  expect(response.body.branding).toBeUndefined()
})
