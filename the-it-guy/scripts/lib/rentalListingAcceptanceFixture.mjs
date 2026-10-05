// Isolated PostgreSQL fixture shared by persistence and browser acceptance.
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { buildRentalListingUpdatePayload } from '../../src/services/rentals/rentalListingEditModel.js'
import { buildRentalPublicationDraft } from '../../src/services/rentals/rentalListingDraftModel.js'
export async function createRentalListingAcceptanceFixture() {
const db = new PGlite()
const ids = Array.from({length:8},(_,i)=>`${i+1}`.repeat(8)+'-'+`${i+1}`.repeat(4)+'-4'+`${i+1}`.repeat(3)+'-8'+`${i+1}`.repeat(3)+'-'+`${i+1}`.repeat(12))
const [actor,org,listing,otherOrg,otherListing,image,otherImage,readonlyActor] = ids
const initial = '2026-10-01T00:00:00Z'
const draft = { propertyAddress:'10 Test Road',landlordName:'Fixture owner',propertyType:'Apartment',monthlyRent:12000,
 mandateEndDate:'2027-12-31',property24ExpiryDate:'2027-04-30',marketingApprovalStatus:'approved',description:'Rental home',
 propertyCategory:'residential',bedrooms:2,bathrooms:1,depositPolicy:'no_deposit' }
const patch = buildRentalListingUpdatePayload(draft)
const publication = buildRentalPublicationDraft(draft)
const gallery = [{id:image,url:'https://example.test/retained.jpg',name:'Retained'},{id:'upload-new',url:'https://example.test/new.jpg',name:'New'}]
const root = '../../../supabase/migrations/'
const textColumns = ['title','property_category','property_type','listing_category','address_line_1','formatted_address','street_address','street_number','street_name','suburb','city','province','postal_code','country','google_place_id','description','internal_listing_notes','listing_preview_description','seller_type','mandate_type','mandate_status']
try {
 await db.exec(`create role authenticated; create role anon; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create table organisation_users(organisation_id uuid,user_id uuid,status text);
 create function bridge_is_active_member(o uuid) returns boolean language sql stable as $$select exists(select 1 from public.organisation_users where organisation_id=o and user_id=auth.uid() and status='active')$$;
 create table private_listings(id uuid primary key,organisation_id uuid,listing_status text default 'seller_lead',listing_visibility text default 'internal',
 ${textColumns.map(c=>`${c} text`).join(',')},asking_price numeric,estimated_value numeric,latitude numeric,longitude numeric,
 seller_canonical_facts_json jsonb,seller_canonical_fact_readiness_json jsonb,seller_canonical_facts_updated_at timestamptz,updated_at timestamptz default now());
 grant select on organisation_users to authenticated; grant select,update on private_listings to authenticated;
 alter table private_listings enable row level security;
 create policy rental_read on private_listings for select to authenticated using(bridge_is_active_member(organisation_id));
 create policy rental_write on private_listings for update to authenticated using(bridge_is_active_member(organisation_id) and auth.uid()<>'${readonlyActor}'::uuid) with check(bridge_is_active_member(organisation_id) and auth.uid()<>'${readonlyActor}'::uuid);
 insert into organisation_users values('${org}','${actor}','active'),('${org}','${readonlyActor}','active');
 insert into private_listings(id,organisation_id,listing_category,title,updated_at) values('${listing}','${org}','rental','Before','${initial}'),('${otherListing}','${otherOrg}','rental','Other','${initial}');
 create function public.set_updated_at_timestamp() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end$$;`)
 await db.exec(await readFile(new URL(root+'202606030001_listing_distribution_workspace.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL(root+'20261004091223_rental_listing_atomic_persistence.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL(root+'20261004092331_rental_listing_media_controls.sql',import.meta.url),'utf8'))
 await db.exec(`alter table listing_media add column storage_bucket text, add column storage_path text;
 create schema storage; grant usage on schema storage to authenticated;
 create table storage.objects(bucket_id text,name text);
 grant select on storage.objects to authenticated; alter table storage.objects enable row level security;
 create policy objects_read on storage.objects for select to authenticated using(name like 'private-listings/${listing}/%');
 insert into storage.objects values('documents','private-listings/${listing}/gallery/durable.jpg'),('documents','private-listings/${otherListing}/gallery/foreign.jpg');
 insert into listing_media(listing_id,media_type,file_url) values('${listing}','image','https://isdowlnollckzvltkasn.supabase.co/storage/v1/object/sign/documents/private-listings/${listing}/gallery/durable.jpg?token=expired');`)
 await db.exec(`insert into listing_media(listing_id,media_type,file_url) values
 ('${listing}','image','https://isdowlnollckzvltkasn.supabase.co/storage/v1/object/sign/documents/private-listings/${otherListing}/gallery/foreign.jpg?token=expired'),
 ('${listing}','image','https://isdowlnollckzvltkasn.supabase.co/storage/v1/object/sign/documents/private-listings/${listing}/gallery/missing.jpg?token=expired');`)
 await db.exec(await readFile(new URL(root+'20261004151831_rental_photo_storage_identity.sql',import.meta.url),'utf8'))
 await db.exec(`create table private_listing_activity(id uuid primary key default gen_random_uuid(),private_listing_id uuid references private_listings(id),activity_type text,activity_title text,activity_description text,performed_by uuid,visibility text,metadata jsonb,created_at timestamptz default now());
 alter table private_listing_activity enable row level security;
 grant select,insert on private_listing_activity to authenticated;
 create policy history_read on private_listing_activity for select to authenticated using(exists(select 1 from private_listings p where p.id=private_listing_id));
 create policy history_write on private_listing_activity for insert to authenticated with check(performed_by=auth.uid() and exists(select 1 from private_listings p where p.id=private_listing_id));`)
 await db.exec(await readFile(new URL(root+'20261004154901_rental_listing_durable_history.sql',import.meta.url),'utf8'))
 await db.exec(await readFile(new URL(root+'20261004163134_rental_listing_expiry_isolated_save.sql',import.meta.url),'utf8'))
 await db.exec(`insert into listing_publication_data(listing_id,title,listing_type,status) values('${listing}','Before','Rental','Published');
 insert into listing_media(id,listing_id,media_type,file_url,is_cover) values('${image}','${listing}','image','https://example.test/retained.jpg',true),('${otherImage}','${otherListing}','image','https://example.test/other.jpg',true);
 insert into listing_media(listing_id,media_type,file_url,caption) values('${listing}','video','https://example.test/video','Video'),('${listing}','virtual_tour','https://example.test/tour','Tour'),('${listing}','floor_plan','https://example.test/plan','Plan');
 insert into listing_external_links(listing_id,platform,url,status,visible_to_seller) values('${listing}','Property24','https://example.test/p24','Published',true);
 set role authenticated; select set_config('request.jwt.claim.sub','${actor}',false);`)
return { db, actor, org, listing, otherOrg, otherListing, image, otherImage, readonlyActor, initial, draft, patch, publication, gallery }
} catch (error) { await db.close(); throw error }
}
