import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { buildRentalListingUpdatePayload, buildRentalListingEditForm } from '../rentalListingEditModel.js'
import { buildRentalPublicationDraft } from '../rentalListingDraftModel.js'
import { buildRentalProperty24Readiness } from '../rentalListingProperty24ReadinessModel.js'
import { buildRentalProperty24FieldComparison } from '../rentalListingProperty24FieldComparisonModel.js'
import { buildRentalListingIndexRow } from '../rentalListingIndexModel.js'
import { buildRentalMediaProgress, getRentalMediaLinks } from '../rentalListingMediaModel.js'
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
const root = '../../../../../supabase/migrations/'
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
 await db.exec(`insert into listing_publication_data(listing_id,title,listing_type,status) values('${listing}','Before','Rental','Published');
 insert into listing_media(id,listing_id,media_type,file_url,is_cover) values('${image}','${listing}','image','https://example.test/retained.jpg',true),('${otherImage}','${otherListing}','image','https://example.test/other.jpg',true);
 insert into listing_media(listing_id,media_type,file_url,caption) values('${listing}','video','https://example.test/video','Video'),('${listing}','virtual_tour','https://example.test/tour','Tour'),('${listing}','floor_plan','https://example.test/plan','Plan');
 insert into listing_external_links(listing_id,platform,url,status,visible_to_seller) values('${listing}','Property24','https://example.test/p24','Published',true);
 set role authenticated; select set_config('request.jwt.claim.sub','${actor}',false);`)
 const save = async({id=listing,expected=initial,listingPatch=patch,projection=publication,photos=gallery,cover=0}={})=>(await db.query('select public.save_rental_listing_snapshot($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6) as receipt',[id,expected,JSON.stringify(listingPatch),JSON.stringify(projection),JSON.stringify(photos),cover])).rows[0].receipt
 const first=await save()
 assert.equal(first.facts.rentalInfo.property24ExpiryDate,'2027-04-30'); assert.equal(first.facts.rentalInfo.mandateEndDate,'2027-12-31')
 assert.equal(first.publication.status,'Published'); assert.equal(first.media.filter(r=>r.media_type!=='image').length,3)
 assert.equal(first.externalLinks.length,1); assert.equal(first.media.find(r=>r.file_url.endsWith('retained.jpg')).id,image)
 assert.equal(first.media.filter(r=>r.is_cover).length,1)
 const reloaded={id:listing,updatedAt:first.updatedAt,listingCategory:'rental',sellerCanonicalFacts:first.facts,listingMedia:first.media}
 const edit=buildRentalListingEditForm(reloaded)
 assert.equal(edit.property24ExpiryDate,'2027-04-30'); assert.equal(edit.mandateEndDate,'2027-12-31')
 assert.equal(buildRentalProperty24Readiness(reloaded).payloadPreview.expiryDate,'2027-04-30')
 assert.ok(JSON.stringify(buildRentalProperty24FieldComparison(reloaded)).includes('2027-04-30'))
 const count=async()=>(await db.query('select count(*)::int as count from listing_media where listing_id=$1',[listing])).rows[0].count
 const title=async()=>(await db.query('select title from private_listings where id=$1',[listing])).rows[0].title
 await assert.rejects(save({expected:first.updatedAt,listingPatch:{...patch,title:'Must roll back'},projection:{...publication,bathrooms:'invalid'},photos:[],cover:null}))
 assert.equal(await title(),patch.title); assert.equal(await count(),5)
 await db.exec(`reset role; create function reject_test_photo() returns trigger language plpgsql as $$begin if new.caption='FAIL_INSERT' then raise exception 'fixture insert failure'; end if; return new; end$$;
 create trigger reject_test_photo before insert on listing_media for each row execute function reject_test_photo(); set role authenticated;`)
 await assert.rejects(save({expected:first.updatedAt,listingPatch:{...patch,title:'Must also roll back'},photos:[{id:'failed',url:'https://example.test/fail.jpg',name:'FAIL_INSERT'}]}),/fixture insert failure/)
 assert.equal(await count(),5); assert.equal(await title(),patch.title)
 await assert.rejects(save(),/changed after it was opened/)
 await assert.rejects(save({id:otherListing}),/outside your organisation/)
 await assert.rejects(save({expected:first.updatedAt,photos:[{id:otherImage,url:'https://example.test/hijack.jpg'}]}))
 await db.exec(`select set_config('request.jwt.claim.sub','${readonlyActor}',false)`); await assert.rejects(save({expected:first.updatedAt}))
 await db.exec("select set_config('request.jwt.claim.sub','',false)"); await assert.rejects(save({expected:first.updatedAt}),/Sign in/)
 await db.exec(`select set_config('request.jwt.claim.sub','${actor}',false)`)
 const retry=await save({expected:first.updatedAt})
 assert.deepEqual(retry.media.map(r=>r.id).sort(),first.media.map(r=>r.id).sort())
 await db.exec(`reset role; drop policy listing_media_member_access on listing_media;
 create policy image_read on listing_media for select to authenticated using(true);
 create policy image_insert on listing_media for insert to authenticated with check(true);
 create policy image_update on listing_media for update to authenticated using(true) with check(true);
 set role authenticated;`)
 await assert.rejects(save({expected:retry.updatedAt,photos:[],cover:null}),/could not all be saved or removed/)
 assert.equal(await count(),5)
 await db.exec(`reset role; create policy image_delete on listing_media for delete to authenticated using(listing_id='${listing}'); set role authenticated;`)
 const removed=await save({expected:retry.updatedAt,photos:[],cover:null})
 assert.equal(removed.media.length,3); assert.equal(removed.externalLinks.length,1)
 const originalVideo = removed.media.find(row => row.media_type === 'video')
 const originalTour = removed.media.find(row => row.media_type === 'virtual_tour')
 await db.exec(`insert into listing_media(listing_id,media_type,file_url) values('${listing}','video','https://example.test/second-video')`)
 const linkPatch = { ...patch, sellerCanonicalFacts: { ...patch.sellerCanonicalFacts, marketingMedia: { videoLink: 'https://example.test/edited-video', virtualTourLink: 'https://example.test/edited-tour' } } }
 const linkEdits = [{ id: originalVideo.id, type: 'video', url: 'https://example.test/edited-video' }, { id: originalTour.id, type: 'virtual_tour', url: 'https://example.test/edited-tour' }]
 const saveMedia = async(expected, edits=linkEdits, nextPatch=linkPatch) => (await db.query('select public.save_rental_listing_media_snapshot($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7::jsonb) as receipt', [listing,expected,JSON.stringify(nextPatch),JSON.stringify(publication),'[]',null,JSON.stringify(edits)])).rows[0].receipt
 const linked = await saveMedia(removed.updatedAt)
 assert.equal(linked.media.find(row => row.id === originalVideo.id).file_url, 'https://example.test/edited-video')
 assert.equal(linked.media.find(row => row.id === originalTour.id).file_url, 'https://example.test/edited-tour')
 assert.equal(buildRentalListingEditForm({ sellerCanonicalFacts: linked.facts, listingMedia: linked.media }).videoLink, 'https://example.test/edited-video')
 assert.equal(linked.externalLinks.length, 1)
 await assert.rejects(saveMedia(linked.updatedAt, [{ id: otherImage, type: 'video', url: 'https://example.test/edited-video' }]), /unavailable/)
 await assert.rejects(saveMedia(linked.updatedAt, [{ id: originalVideo.id, type: 'video', url: 'javascript:alert(1)' }]), /HTTP or HTTPS/)
 const clearedPatch = { ...linkPatch, sellerCanonicalFacts: { ...linkPatch.sellerCanonicalFacts, marketingMedia: { videoLink: '', virtualTourLink: '' } } }
 // Denied media updates must roll back the preceding full listing save too.
 await db.exec(`reset role; drop policy image_update on listing_media; create policy image_update on listing_media for update to authenticated using(media_type='image') with check(media_type='image'); set role authenticated;`)
 await assert.rejects(saveMedia(linked.updatedAt), /denied|unavailable/)
 assert.equal(new Date((await db.query('select updated_at from private_listings where id=$1',[listing])).rows[0].updated_at).getTime(), new Date(linked.updatedAt).getTime())
 await db.exec(`reset role; drop policy image_update on listing_media; create policy image_update on listing_media for update to authenticated using(true) with check(true); set role authenticated;`)
 const cleared = await saveMedia(linked.updatedAt, linkEdits.map(row => ({...row,url:''})), clearedPatch)
 assert.equal(cleared.media.length,2)
 assert.ok(cleared.media.some(row=>row.media_type==='floor_plan'))
 assert.ok(cleared.media.some(row=>row.file_url==='https://example.test/second-video'))
 assert.equal(getRentalMediaLinks({ sellerCanonicalFacts: cleared.facts, listingMedia: cleared.media }).videoLink,'')
 assert.equal(buildRentalMediaProgress({ sellerCanonicalFacts: cleared.facts, listingMedia: cleared.media }).find(row=>row.key==='video').complete,false)
 const added = await saveMedia(cleared.updatedAt, linkEdits.map(row => ({...row,id:null})))
 assert.equal(added.media.length,4)
 const repeated = await saveMedia(added.updatedAt, linkEdits.map(row => ({...row,id:null})))
 assert.deepEqual(repeated.media.map(row=>row.id).sort(),added.media.map(row=>row.id).sort())
 const saveGallery = async(expected, photos, cover) => (await db.query('select public.save_rental_listing_gallery($1,$2,$3::jsonb,$4) as receipt', [listing,expected,JSON.stringify(photos),cover])).rows[0].receipt
 const gallerySaved = await saveGallery(repeated.updatedAt,gallery,1)
 assert.deepEqual(gallerySaved.facts,repeated.facts)
 assert.deepEqual(gallerySaved.publication,repeated.publication)
 assert.equal(gallerySaved.media.find(row=>row.id===image).is_cover,false)
 assert.equal(gallerySaved.media.filter(row=>row.is_cover).length,1)
 await assert.rejects(saveGallery(repeated.updatedAt,gallery,0),/changed after it was opened/)
 const galleryRemoved = await saveGallery(gallerySaved.updatedAt,[],null)
 assert.equal(galleryRemoved.media.length,4)
 assert.equal(buildRentalListingIndexRow({ listingMedia: galleryRemoved.media, imageUrl:'https://example.test/stale-cover.jpg' }).imageUrl,'')
 assert.equal(galleryRemoved.externalLinks.length,1)
 // Older incomplete rentals can edit their gallery without creating a projection
 // or replacing their existing (possibly empty) canonical facts.
 await db.exec(`delete from listing_publication_data where listing_id='${listing}'; update private_listings set seller_canonical_facts_json=null where id='${listing}';`)
 const legacyVersion = (await db.query('select updated_at from private_listings where id=$1',[listing])).rows[0].updated_at
 const legacyGallery = await saveGallery(legacyVersion,gallery,0)
 assert.equal(legacyGallery.publication,null)
 assert.equal((await db.query('select seller_canonical_facts_json from private_listings where id=$1',[listing])).rows[0].seller_canonical_facts_json,null)
 await db.exec('reset role')
 assert.equal((await db.query('select file_url from listing_media where id=$1',[otherImage])).rows[0].file_url,'https://example.test/other.jpg')
 console.log('Rental persistence SQL checks passed: expiry/readback, preserved assets/links/IDs, rollback, stale and unauthorised saves.')
} catch (error) { console.error(error.message, error.where || ''); process.exitCode = 1 } finally { await db.close() }
