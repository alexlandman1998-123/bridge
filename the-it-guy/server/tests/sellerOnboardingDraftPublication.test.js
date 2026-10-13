import { expect, it, vi } from 'vitest'
import { applyProperty24ListingPublish } from '../property24/publishService.js'
import { runPrivatePropertyControlledPublishRehearsal } from '../services/privatePropertyControlledPublishService.js'

it('Property24 rejects unresolved onboarding before any portal call', async () => {
  const error = {code:'23514',message:'Review the differences between the listing draft and seller onboarding before publishing.'}
  const supabase = {rpc:vi.fn().mockResolvedValue({error})}
  const property24 = {saveListing:vi.fn()}
  await expect(applyProperty24ListingPublish({supabase,property24,config:{listingId:'listing'},preview:{payload:{}}})).rejects.toBe(error)
  expect(supabase.rpc).toHaveBeenCalledWith('assert_seller_onboarding_draft_reviewed',{p_listing_id:'listing'})
  expect(property24.saveListing).not.toHaveBeenCalled()
})

it('Private Property rejects unresolved onboarding before readiness or portal calls', async () => {
  const error = {code:'23514',message:'Review the differences before publishing.'}
  const client = {rpc:vi.fn().mockResolvedValue({error}),from:vi.fn()}
  const privateProperty = {updateListing:vi.fn()}
  await expect(runPrivatePropertyControlledPublishRehearsal({client,listingId:'listing',apply:true,privateProperty})).rejects.toBe(error)
  expect(client.rpc).toHaveBeenCalledWith('assert_seller_onboarding_draft_reviewed',{p_listing_id:'listing'})
  expect(client.from).not.toHaveBeenCalled()
  expect(privateProperty.updateListing).not.toHaveBeenCalled()
})
