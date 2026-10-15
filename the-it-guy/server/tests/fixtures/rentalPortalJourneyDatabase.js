import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { rentalTenancyUploadDatabase, actor, org, property, unit, listing, lead } from './rentalTenancyUploadDatabase.js'
import { rentalOnboardingClient } from './rentalOnboardingClient.js'
import { rentalApplicationFieldScenario } from './rentalApplicationFieldScenario.js'
export { actor, org, property, unit, listing, lead }
export const tenantToken = 'fixture-tenant-portal', landlordToken = 'fixture-landlord-portal'
export const tenantMembership = '89898989-8989-4898-8989-898989898989', landlordMembership = '78787878-7878-4787-8787-787878787878'
const root = new URL('../../../../supabase/migrations/', import.meta.url)

export async function rentalPortalJourneyDatabase() {
  const db = await rentalTenancyUploadDatabase()
  for (const file of ['20260906163617_corrective_rental_portal_foundation.sql', '20260916060921_rental_client_portal_account_access.sql', '20260830102633_rental_maintenance_request_intake.sql', '20260830102724_rental_maintenance_triage_assignment.sql', '20260916130953_rental_tenant_maintenance_portal_bridge.sql', '20261014214622_rental_portal_journey_parity.sql']) await db.exec(readFileSync(new URL(file, root), 'utf8'))
  await db.exec(`create table rental_entity_documents(id uuid primary key,property_id uuid,organisation_id uuid,document_label text,document_category text,link_state text,created_at timestamptz default now());
    grant usage on schema public,auth to service_role; grant all on all tables in schema public,auth to service_role; alter role service_role bypassrls;`)
  const client = rentalOnboardingClient(db, {}, actor, true)
  const ensured = await client.rpc('rental_ensure_listing_vacancy', { p_listing_id: listing, p_organisation_id: org })
  if (ensured.error) throw ensured.error
  await db.query("update rental_vacancies set status='preparing' where id=$1", [ensured.data.vacancyId])
  await db.query("update rental_vacancies set status='marketing' where id=$1", [ensured.data.vacancyId])
  const prepared = await client.rpc('rental_prepare_tenant_application', { p_organisation_id: org, p_lead_id: lead, p_vacancy_id: ensured.data.vacancyId })
  if (prepared.error) throw prepared.error
  const app = prepared.data.application || prepared.data
  const data = rentalApplicationFieldScenario('joint_individuals'); data.property = app.application_data?.property || app.data?.property || {}
  // An earlier approved application is the input to this portal test. Approval
  // itself is exercised by the full application acceptance suite.
  await db.transaction(async tx => {
    await tx.exec('set local session_replication_role=replica')
    await tx.query("update rental_applications set status='approved',application_data=$1,submitted_snapshot_json=$1,submitted_at=now() where id=$2", [JSON.stringify(data), app.id])
    await tx.query("update leads set raw_enquiry_payload=jsonb_set(raw_enquiry_payload,'{stage}','\"placement_ready\"') where lead_id=$1", [lead])
  })
  const converted = await client.rpc('rental_convert_application_to_tenancy', { p_application_id: app.id, p_expected_version: app.version })
  if (converted.error) throw converted.error
  const tenancyId = converted.data.tenancy_id
  await db.query('insert into rental_tenant_portal_access_tokens(tenancy_id,token_hash,expires_at) values($1,$2,$3)', [tenancyId, createHash('sha256').update(tenantToken).digest('hex'), '2099-01-01'])
  await db.query('insert into rental_landlord_portal_access(property_id,token_hash,expires_at) values($1,$2,$3)', [property, createHash('sha256').update(landlordToken).digest('hex'), '2099-01-01'])
  await db.query("insert into rental_client_portal_memberships(id,organisation_id,user_id,audience,tenancy_id,status) values($1,$2,$3,'tenant',$4,'active')", [tenantMembership, org, actor, tenancyId])
  await db.query("insert into rental_client_portal_memberships(id,organisation_id,user_id,audience,property_id,status) values($1,$2,$3,'landlord',$4,'active')", [landlordMembership, org, actor, property])
  return { db, client, tenancyId, leaseId: converted.data.lease_id }
}
