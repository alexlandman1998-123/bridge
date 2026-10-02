import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { client } = vi.hoisted(() => ({ client: { rpc: vi.fn(), from: vi.fn(), auth: { getUser: vi.fn() } } }))
vi.mock('../../lib/supabaseClient', () => ({
  supabase: client, isSupabaseConfigured: true, createScopedSupabaseClient: () => client,
  DOCUMENTS_BUCKET: 'documents', DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
  BRANDING_BUCKET_CANDIDATES: ['branding'], PROFILE_AVATAR_BUCKET_CANDIDATES: ['avatars'],
  LEGAL_TEMPLATES_BUCKET_CANDIDATES: ['legal-templates'],
}))
import { getSellerOnboardingByToken, submitSellerOnboarding, updateSellerOnboardingProgress } from '../privateListingService'

const listingId = '00000000-0000-4000-8000-000000000001'
const onboardingId = '00000000-0000-4000-8000-000000000002'
const rpcResult = (data, error = null) => Object.assign(Promise.resolve({ data, error }), { abortSignal() { return this } })

beforeEach(() => {
  vi.clearAllMocks()
  client.from.mockImplementation(() => { throw new Error('Unexpected direct table access') })
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network access') }))
})
afterEach(() => vi.unstubAllGlobals())

describe('seller token mutation boundary', () => {
  it.each(['PGRST202', '57014', '42501'])('progress fails closed for %s without a table fallback', async (code) => {
    const error = { code, message: 'bridge_update_private_listing_seller_onboarding_progress unavailable' }
    client.rpc.mockReturnValue(rpcResult(null, error))
    await expect(updateSellerOnboardingProgress('valid-token', { formData: { sellerName: 'Owner' } })).rejects.toEqual(error)
    expect(client.from).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('a missing submit RPC fails closed without a table fallback', async () => {
    const error = { code: 'PGRST202', message: 'bridge_complete_private_listing_seller_onboarding missing' }
    client.rpc.mockReturnValue(rpcResult(null, error))
    await expect(submitSellerOnboarding('valid-token', { formData: {} })).rejects.toEqual(error)
    expect(client.from).not.toHaveBeenCalled()
  })

  it('valid progress returns saved data without anonymous projection writes', async () => {
    client.rpc.mockImplementation((name) => rpcResult(name === 'bridge_can_access_private_listing' ? false : {
      listing: { id: listingId, listing_status: 'onboarding_sent' },
      onboarding: { id: onboardingId, private_listing_id: listingId, form_data: { sellerName: 'Owner', currentStep: 2 }, status: 'in_progress' },
    }))
    const result = await updateSellerOnboardingProgress('valid-token', { listingSnapshot: { id: listingId }, currentStep: 2, formData: { sellerFirstName: 'Owner', sellerSurname: 'Person' } })
    expect(result.listing.id).toBe(listingId)
    expect(result.onboarding.form_data.currentStep).toBe(2)
    const [, args] = client.rpc.mock.calls.find(([name]) => name === 'bridge_update_private_listing_seller_onboarding_progress')
    expect(args.p_form_data.canonicalSellerFacts.context.listing_id).toBe(listingId)
    expect(args.p_form_data.canonicalSellerFacts.seller.first_name).toBe('Owner')
    await vi.waitFor(() => expect(client.rpc).toHaveBeenCalledWith('bridge_can_access_private_listing', { target_listing_id: listingId }))
    expect(client.from).not.toHaveBeenCalled()
  })

  it('valid submission and timeout recovery retain the token receipt without anonymous follow-up writes', async () => {
    const receipt = { listingId, onboardingId, status: 'completed', submittedAt: '2026-10-01T10:00:00Z' }
    for (const timeout of [false, true]) {
      client.rpc.mockImplementation((name) => {
        if (name === 'bridge_can_access_private_listing') return rpcResult(false)
        if (timeout && name === 'bridge_complete_private_listing_seller_onboarding') return rpcResult(null, { code: '57014', message: 'canceling statement due to statement timeout' })
        return rpcResult(receipt)
      })
      const result = await submitSellerOnboarding('valid-token', { listingSnapshot: { id: listingId }, formData: { sellerName: 'Owner' } })
      expect(result.listing.id).toBe(listingId)
      expect(result.onboarding.status).toBe('completed')
    }
    expect(client.from).not.toHaveBeenCalled()
  })

  it.each([false, true])('reopening hydrates saved fields without table access (RPC pending deployment: %s)', async (rpcMissing) => {
    const form = { sellerName: 'Owner', currentStep: 3, companyRegistrationNumber: 'REG-TEST' }
    fetch.mockImplementation(async (url) => ({ ok: url.startsWith('/api/public/seller-onboarding-core?'), status: url.startsWith('/api/public/seller-onboarding-core?') ? 200 : 404, json: async () => ({ listing: { id: listingId }, onboarding: { id: onboardingId, private_listing_id: listingId, form_data: form } }) }))
    client.rpc.mockImplementation((name) => name === 'bridge_get_private_listing_seller_onboarding_form' && rpcMissing
      ? rpcResult(null, { code: 'PGRST202', message: 'bridge_get_private_listing_seller_onboarding_form missing' })
      : rpcResult(
      name === 'bridge_private_listing_seller_portal_core_payload'
        ? { listing: { id: listingId }, onboarding: { id: onboardingId, private_listing_id: listingId, form_data: { sellerName: 'Owner' } } }
        : name === 'bridge_get_private_listing_seller_onboarding_form'
          ? { id: onboardingId, private_listing_id: listingId, form_data: form }
          : null,
    ))
    client.from.mockImplementation((table) => {
      if (table === 'private_listing_seller_onboarding') throw new Error('Public table read is forbidden')
      const query = new Proxy({}, { get: (_target, property) => property === 'then'
        ? (resolve) => resolve({ data: [], error: null })
        : () => query })
      return query
    })
    const result = await getSellerOnboardingByToken('valid-token', { corePayload: true })
    expect(result.onboarding.form_data.companyRegistrationNumber).toBe('REG-TEST')
    expect(result.listing.sellerOnboarding.formData.currentStep).toBe(3)
    expect(client.rpc).toHaveBeenCalledWith('bridge_get_private_listing_seller_onboarding_form', { p_token: 'valid-token' })
    expect(client.from.mock.calls.some(([table]) => table === 'private_listing_seller_onboarding')).toBe(false)
  })

  it('secure workspace RPC failure never downgrades to the public API or tables', async () => {
    client.rpc.mockReturnValue(rpcResult(null, { code: 'PGRST202', message: 'bridge_private_listing_seller_portal_core_payload unavailable' }))
    await expect(getSellerOnboardingByToken('stable-token', { corePayload: true, requirePortalAccess: true })).rejects.toThrow('secure seller portal')
    expect(client.from).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('canonical seller save confirmation', () => {
  it('distinguishes committed data from a failed refresh', async () => {
    const { savePrivateListingSellerCanonicalUpdate } = await import('../privateListingService')
    const mutationId = '00000000-0000-4000-8000-000000000099'
    client.rpc.mockReturnValue(rpcResult({
      listing: { id: listingId, seller_canonical_facts_json: { sellerName: 'Saved Owner' } },
      onboarding: { id: onboardingId, private_listing_id: listingId, form_data: { sellerName: 'Saved Owner' }, status: 'in_progress' },
      mutationId,
    }))
    await expect(savePrivateListingSellerCanonicalUpdate({ listingId, mutationId, nextFormData: { sellerName: 'Saved Owner' } })).rejects.toMatchObject({
      code: 'SELLER_READBACK_FAILED', committed: true, listing: { sellerName: 'Saved Owner' },
    })
    expect(client.rpc).toHaveBeenCalledTimes(1)
  })

  it('does not claim success when the RPC returns no receipt', async () => {
    const { savePrivateListingSellerCanonicalUpdate } = await import('../privateListingService')
    client.rpc.mockReturnValue(rpcResult(null))
    await expect(savePrivateListingSellerCanonicalUpdate({ listingId, mutationId: '00000000-0000-4000-8000-000000000099' })).rejects.toMatchObject({ code: 'SELLER_SAVE_UNCONFIRMED' })
    expect(client.from).not.toHaveBeenCalled()
  })
})
