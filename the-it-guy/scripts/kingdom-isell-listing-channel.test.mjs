import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const kingdom = '13c6b79f-1d8b-4886-aabf-42ea49565ef5'
const isell = '6cb5b65b-51cb-4fba-aef4-75b6201f9c21'
const site = '0160e45a-2268-4875-91d7-275c43f574d0'
const actor = '00000000-0000-4000-8000-000000000101'
const listing = '00000000-0000-4000-8000-000000000201'
const otherListing = '00000000-0000-4000-8000-000000000202'
const media = '00000000-0000-4000-8000-000000000301'

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select '${actor}'::uuid $$;
create table public.organisations (id uuid primary key, name text);
create table public.website_sites (id uuid primary key, organisation_id uuid, status text);
create table public.private_listings (id uuid primary key, organisation_id uuid, assigned_agent_id uuid, arch9_reference text);
create table public.website_domains (id uuid primary key, website_site_id uuid, hostname text, status text, domain_kind text, is_primary boolean, created_at timestamptz);
create table public.listing_publication_data (id uuid primary key, listing_id uuid, title text, address text, suburb text, province text, property_type text, listing_type text, asking_price numeric, bedrooms integer, bathrooms numeric, parking_bays integer, floor_size numeric, description text, features jsonb, amenities jsonb, status text, updated_at timestamptz);
create table public.listing_media (id uuid primary key, listing_id uuid, media_type text, file_url text, caption text, sort_order integer, updated_at timestamptz);
create table public.organisation_users (organisation_id uuid, user_id uuid, email text, first_name text, last_name text, branch_id uuid, membership_status text, status text, role text, updated_at timestamptz);
create table public.profiles (id uuid primary key, first_name text, last_name text, phone_number text);
create table public.contacts (contact_id uuid primary key default gen_random_uuid(), organisation_id uuid, assigned_agent_id uuid, first_name text, last_name text, email text, phone text, contact_type text, notes text, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.leads (lead_id uuid primary key default gen_random_uuid(), organisation_id uuid, branch_id uuid, assigned_agent_id uuid, assigned_user_id uuid, assigned_agent_email text, contact_id uuid, lead_domain text, lead_category text, lead_direction text, lead_source text, source_channel text, stage text, status text, priority text, ownership_status text, assigned_at timestamptz, sla_due_at timestamptz, listing_id uuid, enquired_listing_id uuid, enquired_property_title text, enquired_property_address text, enquired_property_price numeric, source_reference_id text, raw_enquiry_payload jsonb, notes text);
create table public.lead_activities (organisation_id uuid, lead_id uuid, agent_id uuid, activity_type text, activity_note text, activity_date timestamptz, outcome text);
create table public.website_lead_submissions (website_site_id uuid, request_fingerprint text, created_at timestamptz);
create function public.bridge_is_active_member(p_org uuid) returns boolean language sql as $$ select exists(select 1 from public.organisation_users where organisation_id = p_org and user_id = auth.uid() and coalesce(membership_status, status) = 'active') $$;
create function public.set_updated_at_timestamp() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
insert into auth.users values ('${actor}');
insert into public.organisations values ('${kingdom}', 'Kingdom Real Estate'), ('${isell}', 'ISellProperty.co.za'), ('00000000-0000-4000-8000-000000000999', 'Other agency');
insert into public.website_sites values ('${site}', '${kingdom}', 'published');
insert into public.website_domains values ('00000000-0000-4000-8000-000000000401', '${site}', 'www.kingdomrealestate.co.za', 'active', 'custom', true, now());
insert into public.private_listings values ('${listing}', '${isell}', '${actor}', 'A9-ISP-123456'), ('${otherListing}', '00000000-0000-4000-8000-000000000999', null, 'A9-OTH-123456');
insert into public.organisation_users values ('${isell}', '${actor}', 'agent@example.test', 'I', 'Sell', null, 'active', 'active', 'agent', now());
insert into public.listing_publication_data values ('00000000-0000-4000-8000-000000000501', '${listing}', 'Test home', 'Test street', 'Pretoria', 'Gauteng', 'House', 'Sale', 1000000, 3, 2, 1, 100, 'Description', '[]', '[]', 'Published', now());
insert into public.listing_media values ('${media}', '${listing}', 'image', 'https://example.test/image.jpg', 'Front', 0, now());
`)

const migration = readFileSync(new URL('../../supabase/migrations/20260929105311_kingdom_isell_listing_channel.sql', import.meta.url), 'utf8')
await db.exec(migration)
const status = (await db.query('select public.website_get_partner_listing_status($1) as result', [listing])).rows[0].result
assert.equal(status.available, true)
assert.equal(status.eligible, true)
assert.equal(status.hostname, 'www.kingdomrealestate.co.za')

const storagePath = `organisations/${isell}/websites/${site}/listings/${listing}/${media}/sha256.jpg`
const assets = [{ source_media_id: media, storage_path: storagePath, public_url: `https://example.supabase.co/storage/v1/object/public/listing-media/${storagePath}`, content_type: 'image/jpeg' }]
await db.query('select public.website_commit_partner_listing_publication($1,$2,$3,$4,$5,$6)', [listing, site, 'publish', actor, 'agent@example.test', JSON.stringify(assets)])
const channel = (await db.query('select status, publication_json, media_json from public.website_partner_listing_publications where listing_id=$1', [listing])).rows[0]
assert.equal(channel.status, 'published')
assert.equal(channel.publication_json.consultant_name, 'I Sell')
assert.equal(channel.media_json[0].file_url, assets[0].public_url)

await assert.rejects(
  db.query('insert into public.website_partner_listing_publications(grant_id,website_site_id,listing_id,status) select id,$1,$2,$3 from public.website_partner_listing_grants limit 1', [site, otherListing, 'published']),
  /outside its approved organisation pair/,
)
await assert.rejects(
  db.query('select public.website_commit_partner_listing_publication($1,$2,$3,$4,$5,$6)', [otherListing, site, 'publish', actor, 'agent@example.test', JSON.stringify(assets)]),
  /not approved/,
)

// The canonical membership state takes precedence when the legacy status differs.
await db.exec("update public.organisation_users set status = 'pending' where membership_status = 'active'")
const enquiry = (await db.query('select public.website_capture_partner_listing_enquiry($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result', [
  'www.kingdomrealestate.co.za', listing, 'Buyer Example', 'buyer@example.test', null, 'Can I view this property?', true, false,
  'kingdom-test-key-0001', null, JSON.stringify({ pagePath: '/properties/test-home' }),
])).rows[0].result
assert.equal(enquiry.accepted, true)
const routed = (await db.query('select organisation_id, assigned_agent_id, listing_id from public.leads where lead_id=$1', [enquiry.leadId])).rows[0]
assert.equal(routed.organisation_id, isell)
assert.equal(routed.assigned_agent_id, actor)
assert.equal(routed.listing_id, listing)
const duplicate = (await db.query('select public.website_capture_partner_listing_enquiry($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result', [
  'www.kingdomrealestate.co.za', listing, 'Buyer Example', 'buyer@example.test', null, 'Can I view this property?', true, false,
  'kingdom-test-key-0001', null, '{}',
])).rows[0].result
assert.equal(duplicate.duplicate, true)
assert.equal((await db.query('select count(*)::integer as count from public.leads')).rows[0].count, 1)

await assert.rejects(
  db.query('select public.website_capture_partner_listing_enquiry($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [
    'another-agency.example.test', listing, 'Other Buyer', 'other@example.test', null, null, true, false,
    'kingdom-test-key-0003', null, '{}',
  ]),
  /Published website not found/,
)
await db.exec('update public.website_partner_listing_grants set enabled = false')
assert.equal((await db.query('select public.website_get_partner_listing_status($1) as result', [listing])).rows[0].result.available, false)
await assert.rejects(
  db.query('select public.website_capture_partner_listing_enquiry($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [
    'www.kingdomrealestate.co.za', listing, 'Other Buyer', 'other@example.test', null, null, true, false,
    'kingdom-test-key-0004', null, '{}',
  ]),
  /Published website listing not found/,
)
await db.exec('update public.website_partner_listing_grants set enabled = true')

await db.query('select public.website_commit_partner_listing_publication($1,$2,$3,$4,$5,$6)', [listing, site, 'unpublish', actor, 'agent@example.test', '[]'])
await assert.rejects(
  db.query('select public.website_capture_partner_listing_enquiry($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [
    'www.kingdomrealestate.co.za', listing, 'Another Buyer', 'another@example.test', null, null, true, false,
    'kingdom-test-key-0002', null, '{}',
  ]),
  /Published website listing not found/,
)

await db.close()
console.log('Kingdom / I Sell publication boundary and enquiry routing passed')
