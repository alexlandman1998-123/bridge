import assert from 'node:assert/strict'
import test from 'node:test'
import { createSellerOnboardingDraftReviewFixture } from '../../../scripts/lib/sellerOnboardingDraftReviewFixture.mjs'
import { readSellerOnboardingDraftComparison, sellerOnboardingDraftPublicationBlocker } from '../../core/documents/sellerOnboardingDraftComparison.js'
import { applyListingSellerOnboardingSaveSnapshot } from '../listings/listingSellerCanonicalUpdateModel.js'

test('listing comparison handles the initial loading state before a listing is available', () => {
  for (const listing of [null, undefined, {}, { sourceListing: null }]) {
    const comparison = readSellerOnboardingDraftComparison(listing)
    assert.deepEqual(comparison.differences, [])
    assert.deepEqual(comparison.pending, [])
    assert.equal(comparison.awaitingResubmission, false)
    assert.equal(sellerOnboardingDraftPublicationBlocker(listing), '')
  }
})

test('seller draft differences survive projection, review, correction and publication', async t => {
  const {db,ids,read,submit,accept} = await createSellerOnboardingDraftReviewFixture()
  try {
    await t.test('captures five versus four before submission overwrites the publication draft', async () => {
      // Saving seller progress already changes the raw form; the publication
      // draft still retains what the agent captured.
      await db.exec(`update private_listing_seller_onboarding set form_data='{"bedrooms":"4"}'`)
      await db.exec('update listing_publication_data set parking_bays=1')
      const receipt = await submit({bedrooms:'4',bathrooms:'2.0',garages:'0',askingPrice:'2,500,000',propertyType:'house',propertyAddress:'1 Example Road'})
      assert.equal(receipt.status,'completed')
      const saved = await read()
      assert.deepEqual(saved.draft_comparison_json.differences,[{key:'bedrooms',label:'Bedrooms',draftValue:5,sellerValue:4,status:'pending'}])
      assert.equal((await db.query('select bedrooms from listing_publication_data')).rows[0].bedrooms,4)
      const listing = {id:ids.listing,sellerOnboarding:{...saved,draftComparison:saved.draft_comparison_json}}
      assert.match(sellerOnboardingDraftPublicationBlocker(listing),/1 difference/)
      assert.equal(readSellerOnboardingDraftComparison({sourceListing:listing}).pending.length,1)
    })
    await t.test('blocks all website projections and both queue actions', async () => {
      await assert.rejects(db.exec(`update private_listing_seller_onboarding set form_data=form_data||'{"sellerOnboardingReview":{"status":"approved"}}'`), /before approving/)
      for (const table of ['listing_publication_data','website_listing_publications','website_partner_listing_publications']) {
        await assert.rejects(db.query(`insert into ${table}(listing_id,status) values($1,'published')`,[ids.listing]), /Review the differences/)
      }
      await assert.rejects(db.query("select enqueue_listing_publication($1,array['property24'])",[ids.listing]), /Review the differences/)
      await assert.rejects(db.query("select enqueue_listing_publication_update($1,array['private_property'],$2)",[ids.listing,ids.actor]), /Review the differences/)
      await assert.rejects(db.query('select assert_seller_onboarding_draft_reviewed($1)',[ids.listing]), /Review the differences/)
      await db.query("insert into listing_publication_jobs values($1,$2,$3,'processing',null,now())",[ids.actor,ids.listing,ids.onboarding])
      assert.equal((await db.query('select begin_listing_publication_dispatch($1,$2)',[ids.actor,ids.onboarding])).rows[0].begin_listing_publication_dispatch,false)
      assert.equal((await db.query('select state from listing_publication_jobs')).rows[0].state,'failed')
    })
    await t.test('rejects forged comparison data, unknown fields, stale saves and unauthorised reviewers', async () => {
      await assert.rejects(db.query("update private_listing_seller_onboarding set draft_comparison_json='{}'"), /managed by seller review/)
      await assert.rejects(accept('unknown'), /no submitted difference/)
      await assert.rejects(accept('bedrooms','2000-01-01T00:00:00Z'), /details changed/)
      await db.exec("select set_config('fixture.access','no',false)")
      await assert.rejects(accept(), /cannot review/)
      await db.exec("select set_config('fixture.access','yes',false); select set_config('fixture.review','no',false)")
      await assert.rejects(accept(), /cannot review/)
      await db.exec("select set_config('fixture.review','yes',false)")
      assert.equal((await db.query("select has_function_privilege('anon','public.accept_seller_onboarding_draft_answer(uuid,text,timestamptz)','execute') allowed")).rows[0].allowed,false)
    })
    await t.test('accepts only the reviewed answer and records both values and reviewer', async () => {
      const receipt = await accept()
      assert.equal(receipt.draft_comparison_json.differences[0].status,'accepted')
      assert.equal(receipt.draft_comparison_json.history[0].actor,ids.actor)
      assert.equal(receipt.draft_comparison_json.history[0].draftValue,5)
      assert.equal(receipt.draft_comparison_json.history[0].sellerValue,4)
      assert.equal(receipt.form_data.bedrooms,'4')
      const listing = applyListingSellerOnboardingSaveSnapshot({id:ids.listing},receipt)
      assert.equal(sellerOnboardingDraftPublicationBlocker(listing),'')
      await db.query('select assert_seller_onboarding_draft_reviewed($1)',[ids.listing])
      await db.query("update listing_publication_data set status='Published' where listing_id=$1",[ids.listing])
      await db.query("insert into website_listing_publications values($1,'published')",[ids.listing])
      await accept()
      assert.equal((await read()).draft_comparison_json.history.length,1)
    })
    await t.test('an edited answer reopens review without losing the earlier decision', async () => {
      await db.exec(`update private_listing_seller_onboarding set form_data=form_data||'{"bedrooms":""}',updated_at=clock_timestamp()`)
      assert.equal((await read()).draft_comparison_json.differences[0].status,'pending')
      await assert.rejects(accept(), /supply this answer/)
      await db.exec(`update private_listing_seller_onboarding set form_data=form_data||'{"bedrooms":"3"}',updated_at=clock_timestamp()`)
      const comparison = (await read()).draft_comparison_json
      assert.equal(comparison.differences[0].status,'pending')
      assert.equal(comparison.differences[0].draftValue,5)
      assert.equal(comparison.differences[0].sellerValue,3)
      assert.equal(comparison.history.length,1)
      await assert.rejects(db.query("update website_listing_publications set status='published'"), /Review the differences/)
    })
    await t.test('canonical correction reopens the existing token and resubmission compares against the original five', async () => {
      const o = await read()
      const listing = (await db.query('select * from private_listings')).rows[0]
      const form = {sellerOnboardingReview:{status:'correction_requested',reason:'Please confirm the bedroom count.'},__sellerSave:{onboardingId:o.id,updatedAt:o.updated_at}}
      await db.query('select save_private_listing_seller_canonical_update($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
        [ids.listing,form,{},{},{},'in_progress',null,null,null,ids.actor,'seller_onboarding_review','test',[],listing.updated_at])
      assert.equal((await read()).status,'in_progress')
      assert.equal((await read()).submitted_at,null)
      await assert.rejects(accept(), /resubmit/)
      await submit({bedrooms:'2',sellerOnboardingReview:{status:'awaiting_agent_review'}})
      assert.equal((await read()).draft_comparison_json.differences[0].draftValue,5)
      assert.equal((await read()).draft_comparison_json.differences[0].sellerValue,2)
    })
    await t.test('matching the original draft resolves the difference; zero and missing optional values behave correctly', async () => {
      await db.exec(`update private_listing_seller_onboarding set form_data=form_data||'{"bedrooms":"5"}'`)
      assert.deepEqual((await read()).draft_comparison_json.differences,[])
      const result = (await db.query('select seller_save_private.build_draft_comparison(null,$1,$2) comparison',[
        {bedrooms:5,garages:1,asking_price:2000000},{bedrooms:'',garages:'0',askingPrice:'2 000 000.00'}])).rows[0].comparison
      assert.deepEqual(result.differences,[{key:'garages',label:'Garages',draftValue:1,sellerValue:0,status:'pending'}])
      assert.equal(sellerOnboardingDraftPublicationBlocker({sellerOnboarding:{status:'completed'}}),'')
      const existing = {draftValues:{property_type:'House'},differences:[{key:'propertyType',draftValue:'House',sellerValue:'Townhouse',status:'accepted'}]}
      const normalized = (await db.query('select seller_save_private.build_draft_comparison($1,null,$2) comparison',[existing,{propertyType:'town house'}])).rows[0].comparison
      assert.equal(normalized.differences[0].status,'accepted')
      const changed = (await db.query('select seller_save_private.build_draft_comparison($1,null,$2) comparison',[existing,{propertyType:'Apartment'}])).rows[0].comparison
      assert.equal(changed.differences[0].status,'pending')
    })
    await t.test('accepts fields separately and puts reviewed aliases into the actual advertising projection', async () => {
      await db.exec(`update private_listing_seller_onboarding set form_data=form_data||'{"parkingCount":"2","bathrooms":"3"}',updated_at=clock_timestamp()`)
      assert.equal((await read()).draft_comparison_json.differences.length,2)
      const receipt = await accept('parkingBays')
      assert.equal(receipt.form_data.parkingCount,'2')
      assert.equal((await db.query('select parking_bays from listing_publication_data')).rows[0].parking_bays,2)
      await assert.rejects(db.query('select assert_seller_onboarding_draft_reviewed($1)',[ids.listing]), /Review the differences/)
      await accept('bathrooms')
      assert.equal((await db.query('select bathrooms from listing_publication_data')).rows[0].bathrooms,'3')
      await db.query('select assert_seller_onboarding_draft_reviewed($1)',[ids.listing])
    })
  } finally {await db.close()}
})
