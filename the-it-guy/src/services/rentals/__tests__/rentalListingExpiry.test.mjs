import assert from 'node:assert/strict'
import { createRentalListingAcceptanceFixture } from '../../../../scripts/lib/rentalListingAcceptanceFixture.mjs'
const { db, actor, listing, otherListing, readonlyActor, initial } = await createRentalListingAcceptanceFixture()
try {
 const snapshot=async()=>(await db.query('select rental_listing_history_snapshot($1) as value',[listing])).rows[0].value
 const save=async(date='2028-04-30',version=initial,id=listing)=>(await db.query('select save_rental_listing_expiry_v1($1,$2,$3) as value',[id,version,date])).rows[0].value
 // Missing projection/facts and unrelated fields must not prevent a date-only edit.
 await db.query('delete from listing_publication_data where listing_id=$1',[listing])
 const before=await snapshot();const saved=await save()
 assert.ok(saved.activityId);assert.equal(saved.facts.rentalInfo.property24ExpiryDate,'2028-04-30')
 const after=await snapshot();assert.deepEqual(after.media,before.media);assert.deepEqual(after.externalLinks,before.externalLinks);assert.deepEqual(after.publication,before.publication);assert.deepEqual(after.details,before.details)
 const audit=(await db.query('select * from private_listing_activity where id=$1',[saved.activityId])).rows[0]
 assert.equal(audit.performed_by,actor);assert.deepEqual(audit.metadata.before,before);assert.equal(audit.metadata.operation,'expiry')
 await assert.rejects(save('2029-04-30'),/changed after/)
 await assert.rejects(save('2020-01-01',saved.updatedAt),/future date/)
 await assert.rejects(save(null,saved.updatedAt),/future date/)
 await assert.rejects(save('2029-04-30',initial,otherListing),/outside your organisation/)
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[readonlyActor]);await assert.rejects(save('2029-04-30',saved.updatedAt))
 await db.query("select set_config('request.jwt.claim.sub','',false)");await assert.rejects(save('2029-04-30',saved.updatedAt),/Sign in/)
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor])
 // Preserve nested legacy facts, mandate expiry, and every unrelated capture field.
 await db.query('update private_listings set seller_canonical_facts_json=$2::jsonb where id=$1',[listing,JSON.stringify({rentalInfo:{mandateEndDate:'2030-01-01',other:'keep'},custom:{keep:true}})])
 const saved2=await save('2029-04-30',saved.updatedAt)
 assert.deepEqual(saved2.facts,{rentalInfo:{mandateEndDate:'2030-01-01',other:'keep',property24ExpiryDate:'2029-04-30'},custom:{keep:true}})
 await db.exec(`reset role; drop policy history_write on private_listing_activity; create policy history_write on private_listing_activity for insert to authenticated with check(false); set role authenticated;`)
 await assert.rejects(save('2030-04-30',saved2.updatedAt),/row-level security/)
 assert.deepEqual((await snapshot()).facts,saved2.facts)
 assert.equal(new Date((await db.query('select updated_at from private_listings where id=$1',[listing])).rows[0].updated_at).getTime(),new Date(saved2.updatedAt).getTime())
 await db.exec('reset role')
 assert.equal((await db.query("select has_function_privilege('anon','save_rental_listing_expiry_v1(uuid,timestamptz,date)','EXECUTE') as allowed")).rows[0].allowed,false)
 const fn=(await db.query("select prosecdef,proconfig from pg_proc where proname='save_rental_listing_expiry_v1'")).rows[0]
 assert.equal(fn.prosecdef,false);assert.ok(fn.proconfig.includes('search_path=""'))
 console.log('Rental isolated expiry SQL checks passed: legacy data, preserved fields/media/links, audit rollback, stale and unauthorised denial.')
} catch(error){console.error(error.message);process.exitCode=1} finally{await db.close()}
