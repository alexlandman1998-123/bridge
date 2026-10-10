import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const migration = name => readFile(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')

test('website price terms preserve publication permissions and media guards for own and partner websites', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$select '${id(1)}'::uuid$$;
      create table private_listings (id uuid primary key, organisation_id uuid, assigned_agent_id uuid, seller_canonical_facts_json jsonb);
      create table organisation_users (organisation_id uuid, user_id uuid, email text, membership_status text, status text, first_name text, last_name text, updated_at timestamptz);
      create table organisations (id uuid, name text);
      create table profiles (id uuid, first_name text, last_name text, phone_number text);
      create function bridge_is_active_member(org uuid) returns boolean language sql as $$select exists(select 1 from public.organisation_users where organisation_id=org and user_id=auth.uid() and membership_status='active')$$;
      create table website_sites (id uuid primary key, organisation_id uuid, status text);
      create table website_domains (website_site_id uuid, hostname text, status text, is_primary boolean, domain_kind text, created_at timestamptz);
      create table listing_publication_data (id uuid primary key, listing_id uuid, title text, status text, listing_type text, asking_price numeric, features jsonb, amenities jsonb, suburb text, province text, property_type text, bedrooms numeric, bathrooms numeric, parking_bays numeric, floor_size numeric, description text, updated_at timestamptz);
      create table listing_media (id uuid primary key, listing_id uuid, media_type text, file_url text, caption text, sort_order integer, updated_at timestamptz);
      create table website_listing_media_assets (website_site_id uuid, listing_id uuid, source_media_id uuid, status text, public_url text, retired_at timestamptz, updated_by uuid);
      create table website_listing_publications (id uuid default gen_random_uuid(), website_site_id uuid, listing_id uuid unique, status text, publication_json jsonb, media_json jsonb, published_at timestamptz, unpublished_at timestamptz, last_synced_at timestamptz, created_by uuid, updated_by uuid);
      create table website_partner_listing_grants (id uuid primary key, source_organisation_id uuid, website_site_id uuid, enabled boolean, created_at timestamptz);
      create table website_partner_listing_publications (id uuid default gen_random_uuid(), grant_id uuid, website_site_id uuid, listing_id uuid, status text, publication_json jsonb, media_json jsonb, published_at timestamptz, unpublished_at timestamptz, last_synced_at timestamptz, created_by uuid, updated_by uuid, unique(website_site_id,listing_id));
      insert into private_listings values ('${id(7)}','${id(2)}','${id(1)}','{"landlordName":"PRIVATE-CANARY","rentalInfo":{"rentalPriceFrequency":"weekly"}}');
      insert into organisation_users (organisation_id,user_id,membership_status) values ('${id(2)}','${id(1)}','active');
      insert into organisations values ('${id(2)}','Example Agency');
      insert into website_sites values ('${id(3)}','${id(2)}','published'), ('${id(5)}','${id(4)}','published');
      insert into website_domains (website_site_id,hostname,status) values ('${id(3)}','example.test','active'), ('${id(5)}','partner.test','active');
      insert into website_partner_listing_grants values ('${id(6)}','${id(2)}','${id(5)}',true,now());
      insert into listing_publication_data (id,listing_id,title,status,listing_type,asking_price,features) values ('${id(9)}','${id(7)}','Example listing','Published','Sale',null,'["price_on_application"]');
      insert into listing_media (id,listing_id,media_type,file_url,sort_order) values ('${id(8)}','${id(7)}','image','https://example.test/image.jpg',0);
      insert into website_listing_media_assets (website_site_id,listing_id,source_media_id,status,public_url) values ('${id(3)}','${id(7)}','${id(8)}','active','https://example.test/public.jpg');
    `)
    await db.exec(await migration('20260916121032_website_listing_optional_metadata'))
    const partner = await migration('20261001104037_independent_kingdom_listing_publication')
    // Load the actual status/commit functions, without the unrelated enquiry RPC.
    await db.exec(partner.slice(0, partner.indexOf('create or replace function public.website_capture_partner_listing_enquiry')) + '\ncommit;')
    const status = async partnerSite => (await db.query(`select website_get_${partnerSite ? 'partner_listing_status' : 'listing_publication_status'}($1) as value`, [id(7)])).rows[0].value
    assert.equal((await status(false)).eligible, false)
    assert.equal((await status(true)).eligible, false)
    await db.exec(await migration('20261010111500_website_listing_public_price_terms'))
    assert.equal((await status(false)).eligible, true)
    assert.equal((await status(true)).eligible, true)
    const path = `organisations/${id(2)}/websites/${id(5)}/listings/${id(7)}/image.jpg`
    const assets = [{ source_media_id: id(8), storage_path: path, public_url: `https://example.test/storage/v1/object/public/listing-media/${path}`, content_type: 'image/jpeg' }]
    const publish = async partnerSite => db.query(partnerSite
      ? 'select website_commit_partner_listing_publication($1,$2,$3,$4,$5,$6)'
      : 'select website_commit_listing_publication($1,$2,$3,$4)', partnerSite
      ? [id(7),id(5),'publish',id(1),'',JSON.stringify(assets)] : [id(7),'publish',id(1),''])
    for (const partnerSite of [false,true]) {
      await publish(partnerSite)
      const snapshot = (await db.query(`select publication_json from website_${partnerSite ? 'partner_' : ''}listing_publications`)).rows[0].publication_json
      assert.equal(snapshot.asking_price, undefined)
      assert.equal(JSON.stringify(snapshot).includes('PRIVATE-CANARY'), false)
    }
    await db.exec("update listing_publication_data set features='[]'")
    for (const partnerSite of [false,true]) { assert.equal((await status(partnerSite)).eligible, false); await assert.rejects(publish(partnerSite), /price|completed listing details/i) }
    await db.exec("update listing_publication_data set listing_type='Rental', asking_price=0, features='[\"price_on_application\"]'")
    for (const partnerSite of [false,true]) await assert.rejects(publish(partnerSite), /price|completed listing details/i)
    await db.exec("update listing_publication_data set asking_price=1200")
    for (const frequency of ['monthly','weekly','daily','annual','per_square_metre']) {
      await db.query('update private_listings set seller_canonical_facts_json=jsonb_set(seller_canonical_facts_json,\'{rentalInfo,rentalPriceFrequency}\',$1::jsonb)', [JSON.stringify(frequency)])
      for (const partnerSite of [false,true]) {
        await publish(partnerSite)
        const snapshot = (await db.query(`select publication_json from website_${partnerSite ? 'partner_' : ''}listing_publications`)).rows[0].publication_json
        assert.equal(snapshot.asking_price,1200); assert.equal(snapshot.rental_price_frequency,frequency)
      }
    }
    await db.exec("update listing_media set file_url=''")
    for (const partnerSite of [false,true]) await assert.rejects(publish(partnerSite), /image|durable/i)
    await db.exec("update organisation_users set membership_status='inactive'")
    for (const partnerSite of [false,true]) await assert.rejects(publish(partnerSite), /outside.*organisation/i)
    for (const signature of ['website_commit_listing_publication(uuid,text,uuid,text)','website_commit_partner_listing_publication(uuid,uuid,text,uuid,text,jsonb)']) {
      assert.equal((await db.query('select has_function_privilege(\'authenticated\',$1,\'EXECUTE\') as allowed',[signature])).rows[0].allowed,false)
      assert.equal((await db.query('select has_function_privilege(\'service_role\',$1,\'EXECUTE\') as allowed',[signature])).rows[0].allowed,true)
    }
  } finally { await db.close() }
})
