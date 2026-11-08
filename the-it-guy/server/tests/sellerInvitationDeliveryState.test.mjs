import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { actor, agentA, outsider, listingA, transactionSellerFixture } from '../../scripts/fixtures/seller-alignment-database.mjs'

test('preparing a new seller link defers sent status, retains revision checks and denies outsiders', async () => {
  const db = await transactionSellerFixture()
  try {
    await db.exec('reset role')
    await db.query('delete from private_listing_seller_onboarding where private_listing_id=$1', [listingA])
    await db.query("update private_listings set seller_onboarding_status='not_started' where id=$1", [listingA])
    const prepare = async revision => (await db.query("select bridge_prepare_seller_onboarding_link($1,'new-invitation-token',now()+interval '1 day',$2::jsonb,'individual','individual','single',$3) receipt", [listingA, { sellerName: 'Fixture Seller', __sellerSave: revision }, agentA])).rows[0].receipt
    await actor(db, 'authenticated', outsider)
    await assert.rejects(prepare({ onboardingId: null, updatedAt: null, deferStatusTransition: true }), error => error.code === '42501')
    await actor(db, 'authenticated', agentA)
    const prepared = await prepare({ onboardingId: null, updatedAt: null, deferStatusTransition: true })
    assert.equal(prepared.onboarding.status, 'not_started')
    const listing = (await db.query('select seller_onboarding_status from private_listings where id=$1', [listingA])).rows[0]
    assert.equal(listing.seller_onboarding_status, 'not_started')
    await assert.rejects(prepare({ onboardingId: null, updatedAt: null, deferStatusTransition: true }), error => error.code === 'PT409')
    const sent = await prepare({ onboardingId: prepared.onboarding.id, updatedAt: prepared.onboarding.updated_at })
    assert.equal(sent.onboarding.status, 'sent', 'explicit non-deferred legacy delivery retains its established behavior')
    await db.exec('reset role')
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20261108171920_seller_invitation_preparation_delivery_state.sql', import.meta.url), 'utf8'))
    assert.equal((await db.query("select has_function_privilege('anon','seller_save_private.prepare_link(uuid,text,timestamptz,jsonb,text,text,text,uuid)','execute') allowed")).rows[0].allowed, false)
  } finally { await db.close() }
})
