import { expect, it, vi } from 'vitest'
vi.mock('../../../lib/supabaseClient',() => ({supabase:null}))
import { acceptSellerOnboardingDraftAnswer } from '../sellerOnboardingDraftReviewService.js'
const listing = {id:'listing',sellerOnboarding:{id:'onboarding',status:'completed',updatedAt:'2026-10-13T10:00:00Z'}}

it('passes the saved revision and field to the guarded RPC and returns its receipt', async () => {
  const data = {id:'onboarding',draft_comparison_json:{differences:[]}}
  const client = {rpc:vi.fn().mockResolvedValue({data})}
  expect(await acceptSellerOnboardingDraftAnswer({listing,key:'bedrooms'},{client})).toBe(data)
  expect(client.rpc).toHaveBeenCalledWith('accept_seller_onboarding_draft_answer',{
    p_listing_id:'listing',p_field:'bedrooms',p_expected_updated_at:'2026-10-13T10:00:00Z',
  })
})

it('fails closed for unavailable context, rejected requests and unconfirmed receipts', async () => {
  const client = {rpc:vi.fn().mockResolvedValue({data:{id:'onboarding'}})}
  await expect(acceptSellerOnboardingDraftAnswer({listing:{id:'listing'},key:'bedrooms'},{client})).rejects.toThrow('Load the latest')
  expect(client.rpc).not.toHaveBeenCalled()
  await expect(acceptSellerOnboardingDraftAnswer({listing,key:'bedrooms'},{client})).rejects.toThrow('could not be confirmed')
  client.rpc.mockResolvedValue({error:new Error('The seller details changed.')})
  await expect(acceptSellerOnboardingDraftAnswer({listing,key:'bedrooms'},{client})).rejects.toThrow('seller details changed')
})
