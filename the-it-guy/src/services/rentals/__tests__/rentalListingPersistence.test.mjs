import assert from 'node:assert/strict'
import { buildRentalListingEditForm } from '../rentalListingEditModel.js'
import { buildRentalProperty24Readiness } from '../rentalListingProperty24ReadinessModel.js'
import { buildRentalProperty24FieldComparison } from '../rentalListingProperty24FieldComparisonModel.js'
import { buildRentalListingIndexRow } from '../rentalListingIndexModel.js'
import { buildRentalMediaProgress, getRentalMediaLinks } from '../rentalListingMediaModel.js'
import { createRentalListingAcceptanceFixture } from '../../../../scripts/lib/rentalListingAcceptanceFixture.mjs'
const { db, actor, org, listing, otherOrg, otherListing, image, otherImage, readonlyActor, initial, draft, patch, publication, gallery } = await createRentalListingAcceptanceFixture()
try {
 assert.equal((await db.query('select storage_path from listing_media where storage_bucket=$1',['documents'])).rows[0].storage_path,`private-listings/${listing}/gallery/durable.jpg`)
 assert.equal((await db.query("select count(*)::int as count from listing_media where storage_bucket is null and file_url like '%supabase.co/storage/%'")).rows[0].count,2)
 const save = async({id=listing,expected=initial,listingPatch=patch,projection=publication,photos=gallery,cover=0}={})=>(await db.query('select public.save_rental_listing_snapshot($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6) as receipt',[id,expected,JSON.stringify(listingPatch),JSON.stringify(projection),JSON.stringify(photos),cover])).rows[0].receipt
 const auditCount=async()=>(await db.query('select count(*)::int as count from private_listing_activity')).rows[0].count
 const first=await save()
 assert.ok(first.activityId)
 assert.equal(await auditCount(),1)
 const firstAudit=(await db.query('select * from private_listing_activity where id=$1',[first.activityId])).rows[0]
 assert.equal(firstAudit.performed_by,actor); assert.equal(firstAudit.visibility,'internal')
 assert.equal(firstAudit.metadata.before.details.title,'Before')
 assert.equal(firstAudit.metadata.after.facts.rentalInfo.property24ExpiryDate,'2027-04-30')
 assert.ok(firstAudit.metadata.before.media.length>firstAudit.metadata.after.media.length)
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
 assert.equal(await auditCount(),1)
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
 const countBeforeVideo=await auditCount()
 const linked = await saveMedia(removed.updatedAt)
 assert.equal(await auditCount(),countBeforeVideo+1)
 const videoAudit=(await db.query('select metadata from private_listing_activity where id=$1',[linked.activityId])).rows[0].metadata
 assert.equal(videoAudit.before.media.find(row=>row.id===originalVideo.id).file_url,'https://example.test/video')
 assert.equal(videoAudit.after.media.find(row=>row.id===originalVideo.id).file_url,'https://example.test/edited-video')
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
 await db.exec(`reset role; update listing_media set storage_bucket='listing-media',storage_path='imported/existing.jpg' where id='${image}'; set role authenticated;`)
 const imported = await saveGallery(legacyGallery.updatedAt,gallery,0)
 assert.equal(imported.media.find(row=>row.id===image).storage_path,'imported/existing.jpg')
 const durable = [{id:'upload-identity',url:'https://example.test/fresh.jpg',bucket:'documents',path:`private-listings/${listing}/gallery/durable.jpg`}]
 const durableSaved = await saveGallery(imported.updatedAt,durable,0)
 assert.equal(durableSaved.media.find(row=>row.media_type==='image').storage_path,durable[0].path)
 const durableRetry = await saveGallery(durableSaved.updatedAt,[{...durable[0],url:'https://example.test/new-token.jpg'}],0)
 assert.equal(durableRetry.media.find(row=>row.media_type==='image').id,durableSaved.media.find(row=>row.media_type==='image').id)
 await assert.rejects(saveGallery(durableRetry.updatedAt,[{...durable[0],path:`private-listings/${otherListing}/gallery/foreign.jpg`}],0),/unavailable/)
 await assert.rejects(saveGallery(durableRetry.updatedAt,[{...durable[0],path:`private-listings/${listing}/gallery/missing.jpg`}],0),/unavailable/)
 const durableFull = await save({expected:durableRetry.updatedAt,photos:durable})
 assert.equal(durableFull.media.find(row=>row.media_type==='image').storage_bucket,'documents')
 const beforeDenied=await auditCount()
 await db.exec(`reset role; drop policy history_write on private_listing_activity; create policy history_write on private_listing_activity for insert to authenticated with check(false); set role authenticated;`)
 await assert.rejects(save({expected:durableFull.updatedAt,listingPatch:{...patch,title:'Audit failure must roll back'},photos:[],cover:null}),/row-level security/)
 await assert.rejects(saveGallery(durableFull.updatedAt,[],null),/row-level security/)
 assert.equal(await auditCount(),beforeDenied)
 assert.equal(await title(),patch.title)
 assert.equal((await db.query('select storage_path from listing_media where listing_id=$1 and media_type=$2',[listing,'image'])).rows[0].storage_path,durable[0].path)
 assert.equal(new Date((await db.query('select updated_at from private_listings where id=$1',[listing])).rows[0].updated_at).getTime(),new Date(durableFull.updatedAt).getTime())
 await db.exec('reset role')
 const functions=(await db.query("select proname,prosecdef,proconfig from pg_proc where proname in ('save_rental_listing_snapshot_v2','save_rental_listing_gallery_v2','record_rental_listing_change','rental_listing_history_snapshot')")).rows
 assert.equal(functions.length,4); assert.ok(functions.every(row=>!row.prosecdef && row.proconfig.includes('search_path=\"\"')))
 assert.equal((await db.query("select has_table_privilege('authenticated','private_listing_activity','UPDATE') as allowed")).rows[0].allowed,false)
 assert.equal((await db.query("select has_function_privilege('anon','public.save_rental_listing_snapshot_v2(uuid,timestamptz,jsonb,jsonb,jsonb,integer,jsonb)','EXECUTE') as allowed")).rows[0].allowed,false)
 assert.equal((await db.query('select file_url from listing_media where id=$1',[otherImage])).rows[0].file_url,'https://example.test/other.jpg')
 console.log('Rental persistence SQL checks passed: expiry/readback, preserved assets/links/IDs, rollback, stale and unauthorised saves.')
} catch (error) { console.error(error.message, error.where || ''); process.exitCode = 1 } finally { await db.close() }
