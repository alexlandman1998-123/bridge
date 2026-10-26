import { beforeEach, expect, it, vi } from 'vitest'
const runtime = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
  choices: vi.fn(),
  listing: vi.fn(),
}))
vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getUser: runtime.getUser }, rpc: runtime.rpc },
}))
vi.mock('../justListedCampaignService', () => ({
  loadJustListedChoices: runtime.choices,
  loadJustListedSource: runtime.listing,
}))
import { loadHandoverContext } from '../handoverCampaignService'
beforeEach(() => {
  vi.clearAllMocks()
  runtime.getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
  runtime.rpc.mockResolvedValue({
    data: [
      {
        id: 'tx',
        reference: 'A9-100',
        area: 'Gardens',
        listing_id: 'listing',
        buyer_name: 'Private',
        sales_price: 900000,
      },
    ],
  })
  runtime.choices.mockResolvedValue({ listings: [{ id: 'listing' }] })
  runtime.listing.mockResolvedValue({
    images: [{ id: 'photo', url: 'https://example.test/photo.jpg' }],
  })
})
it('returns only public identifiers and refreshes permitted sold listing photos', async () => {
  const context = await loadHandoverContext('agency', 'me', {
    transactionId: 'tx',
    imageId: 'photo',
  })
  expect(context.transaction).toEqual({
    id: 'tx',
    reference: 'A9-100',
    area: 'Gardens',
    listingId: 'listing',
  })
  expect(JSON.stringify(context)).not.toContain('Private')
  expect(runtime.rpc).toHaveBeenCalledWith('marketing_handover_choices', {
    p_organisation_id: 'agency',
    p_offset: 0,
  })
  expect(runtime.listing).toHaveBeenCalledWith(
    'agency',
    'me',
    'listing',
    expect.any(Object),
    'just-sold',
  )
})
it('fails closed on changed account, unavailable transaction or RPC permission failure', async () => {
  expect(
    (await loadHandoverContext('agency', 'me', { transactionId: 'other' }))
      .transaction,
  ).toBeNull()
  runtime.rpc.mockResolvedValue({ error: { message: 'denied' } })
  await expect(loadHandoverContext('agency', 'me')).rejects.toThrow(
    /Unable to load/,
  )
  runtime.getUser.mockResolvedValue({ data: { user: { id: 'other' } } })
  await expect(loadHandoverContext('agency', 'me')).rejects.toThrow(
    /account changed/,
  )
})
it('offers branding if photos cannot load, flags a previously chosen missing photo for the pack validation', async () => {
  runtime.listing.mockRejectedValue(new Error('denied'))
  const current = await loadHandoverContext('agency', 'me', {
    transactionId: 'tx',
  })
  expect(current.images).toEqual([])
  expect(current.notice).toContain('agency branding')
  expect(
    (
      await loadHandoverContext('agency', 'me', {
        transactionId: 'tx',
        imageId: 'photo',
      })
    ).notice,
  ).toMatch(/photo is no longer available/)
})
it('paginates the permitted projection instead of silently dropping older transactions', async () => {
  runtime.rpc
    .mockResolvedValueOnce({
      data: Array.from({ length: 200 }, (_, i) => ({ id: 'tx' + i })),
    })
    .mockResolvedValueOnce({ data: [{ id: 'last' }] })
  const current = await loadHandoverContext('agency', 'me', {
    transactionId: 'last',
  })
  expect(current.transactions).toHaveLength(201)
  expect(runtime.rpc).toHaveBeenLastCalledWith('marketing_handover_choices', {
    p_organisation_id: 'agency',
    p_offset: 200,
  })
})
