import { readFileSync } from 'node:fs'
import { rentalTenancyUploadDatabase, actor, org, property, unit, tenant } from './rentalTenancyUploadDatabase.js'
import { installRentalLandlordProfileSaving } from './rentalLandlordProfileDatabase.js'
import { rentalOnboardingClient } from './rentalOnboardingClient.js'
export { actor, org, property, unit, tenant }
export const tenantUser = '90909090-9090-4909-8909-909090909090'
export const landlordUser = '80808080-8080-4808-8808-808080808080'
const root = new URL('../../../../supabase/migrations/', import.meta.url)

// Current repair chain, with no approved application, standing mandate or
// completed lead seeded. Every tested milestone must use its actual guard.
export async function rentalJourneyAcceptanceDatabase() {
  const db = await rentalTenancyUploadDatabase({ seedJourney: false })
  for (const file of ['20261008120849_rental_landlord_conditional_document_requirements.sql', '20260906163617_corrective_rental_portal_foundation.sql', '20260916060921_rental_client_portal_account_access.sql', '20260916062046_rental_client_portal_access_manager.sql', '20260830102633_rental_maintenance_request_intake.sql', '20260830102724_rental_maintenance_triage_assignment.sql', '20260916130953_rental_tenant_maintenance_portal_bridge.sql', '20261014214622_rental_portal_journey_parity.sql', '20261014221411_rental_client_portal_activation_retry.sql']) await db.exec(readFileSync(new URL(file, root), 'utf8'))
  await installRentalLandlordProfileSaving(db, { conditionalMatrix: false })
  await db.exec(`
    alter table auth.users add column email text;
    update auth.users set email='agent@example.test' where id='${actor}';
    insert into auth.users(id,email) values('${tenantUser}','tenant@example.test'),('${landlordUser}','owner@example.test');
    create schema extensions;
    -- PGlite lacks the hosted pgcrypto extension. Its built-in SHA-256 verifies
    -- the same invitation hashes; fixture token entropy is not a hosted test.
    create function extensions.digest(input text, algorithm text) returns bytea language sql as $$ select sha256(convert_to(input,'UTF8')) $$;
    create function extensions.gen_random_bytes(amount integer) returns bytea language sql as $$ select decode(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'hex') $$;
    grant usage on schema extensions to authenticated,service_role;
    create table private_listing_activity(id uuid primary key default gen_random_uuid(),private_listing_id uuid,activity_type text,metadata jsonb,created_at timestamptz default now());
    alter table private_listing_activity enable row level security;
    grant select,insert on private_listing_activity to authenticated;
    create policy activity_scope on private_listing_activity to authenticated using(bridge_can_access_private_listing(private_listing_id)) with check(bridge_can_access_private_listing(private_listing_id));
    grant insert on leads to authenticated;
    create table rental_entity_documents(id uuid primary key,property_id uuid,organisation_id uuid,document_label text,document_category text,link_state text,created_at timestamptz default now());
    grant usage on schema public,auth to service_role; grant all on all tables in schema public,auth to service_role; alter role service_role bypassrls;
  `)
  await db.query("insert into rental_application_fee_settings(organisation_id,amount,payment_instructions) values($1,350,'Use the saved application reference')", [org])
  const files = new Map(), signedTickets = new Map()
  const scopedWork = work => db.transaction(async tx => {
    await tx.query("select set_config('test.actor',$1,true)", [actor]); await tx.exec('set local role authenticated'); return work(tx)
  })
  const store = async (bucket, path, source, contentType) => {
    const bytes = source instanceof Uint8Array ? Buffer.from(source) : typeof source.arrayBuffer === 'function' ? Buffer.from(await source.arrayBuffer()) : Buffer.from('%PDF-1.7\nFixture uploaded evidence\n%%EOF')
    const size = source.size || bytes.length, metadata = { size, mimetype: contentType }
    if (bucket === 'rental-lease-files') await scopedWork(tx => tx.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)', [bucket, path, JSON.stringify(metadata)]))
    else await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)', [bucket, path, JSON.stringify(metadata)])
    files.set(`${bucket}/${path}`, bytes)
    return { data: { path } }
  }
  const storage = { from: bucket => ({
    upload: async (path, source, options) => { try { return await store(bucket, path, source, options.contentType) } catch (error) { return { error } } },
    info: async path => { const row = (await db.query('select metadata from storage.objects where bucket_id=$1 and name=$2', [bucket, path])).rows[0]; return row ? { data: { size: row.metadata.size, contentType: row.metadata.mimetype } } : { error: new Error('File unavailable') } },
    createSignedUploadUrl: async path => { const ticket = `${bucket}/${path}`; signedTickets.set(ticket, { bucket, path }); return { data: { signedUrl: `https://fixture.test/upload/${encodeURIComponent(ticket)}` } } },
    createSignedUrl: async (path, ttl) => files.has(`${bucket}/${path}`) ? { data: { signedUrl: `https://fixture.test/file/${encodeURIComponent(`${bucket}/${path}`)}?ttl=${ttl}` } } : { error: new Error('File unavailable') },
    remove: async paths => { for (const path of paths) { files.delete(`${bucket}/${path}`); await db.query('delete from storage.objects where bucket_id=$1 and name=$2', [bucket, path]) } return {} },
  }) }
  const agent = rentalOnboardingClient(db, storage, actor, true), admin = rentalOnboardingClient(db, storage, actor)
  admin.auth.getUser = async jwt => {
    const id = { 'fixture-agent': actor, 'fixture-tenant': tenantUser, 'fixture-landlord': landlordUser }[jwt]
    return id ? { data: { user: { id } } } : { error: new Error('Invalid fixture session') }
  }
  return {
    db, agent, admin, files,
    scopedWork,
    clientForUser: userId => rentalOnboardingClient(db, storage, userId, true),
    storeSignedUpload: async (url, source, mimeType) => { const ticket = decodeURIComponent(new URL(url).pathname.slice('/upload/'.length)); const target = signedTickets.get(ticket); if (!target) throw new Error('Invalid fixture upload ticket'); return store(target.bucket, target.path, source, mimeType) },
    advance: async (leadId, stage, values = {}) => scopedWork(async tx => {
      const saved = (await tx.query('select raw_enquiry_payload from leads where lead_id=$1 for update', [leadId])).rows[0].raw_enquiry_payload
      const event = { stage, recordedAt: new Date().toISOString(), recordedBy: actor, ...values.evidence }
      const payload = { ...saved, ...values, stage, workflow: { lastEvent: event, events: [...(saved.workflow?.events || []), event] } }; delete payload.evidence
      return (await tx.query('update leads set stage=$2,raw_enquiry_payload=$3 where lead_id=$1 returning *', [leadId, stage, JSON.stringify(payload)])).rows[0]
    }),
  }
}
