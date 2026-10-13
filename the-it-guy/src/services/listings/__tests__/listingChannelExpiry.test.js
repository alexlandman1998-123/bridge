import { expect, it, vi } from 'vitest'
vi.mock('../../../lib/supabaseClient', () => ({ supabase: null }))
import { getListingChannelExpiries, saveListingChannelExpiry } from '../listingChannelExpiry'

it('saves only the chosen channels, passing exact saved revisions and returning durable receipts', async () => {
  const settings = [{ channel: 'property24', expiry_date: '2099-12-31', state: 'queued', message: 'Update queued.' }]
  const client = { rpc: vi.fn(async () => ({ data: settings })) }
  const result = await saveListingChannelExpiry('listing', { expiryDate: '2099-12-31', channels: ['Property24'], previous: [{ channel: 'property24', updated_at: '2026-10-13T10:00:00.123456Z' }] }, { client })
  expect(client.rpc).toHaveBeenCalledWith('save_listing_channel_expiry', { p_listing_id: 'listing', p_expiry_date: '2099-12-31', p_channels: ['property24'], p_expected: { property24: '2026-10-13T10:00:00.123456Z' } })
  expect(result.settings).toEqual(settings)
  expect(result.results[0].status).toBe('saved')
  expect(result.message).toContain('queued')
})
it('does not send invalid dates or channels and never reports an incomplete receipt as saved', async () => {
  const client = { rpc: vi.fn(async () => ({ data: [] })) }
  await expect(saveListingChannelExpiry('listing', { expiryDate: '2020-01-01', channels: ['Property24'] }, { client })).rejects.toThrow('future')
  await expect(saveListingChannelExpiry('listing', { expiryDate: '2099-12-31', channels: ['Unknown'] }, { client })).rejects.toThrow('active listing channel')
  expect(client.rpc).not.toHaveBeenCalled()
  await expect(saveListingChannelExpiry('listing', { expiryDate: '2099-12-31', channels: ['Property24'] }, { client })).rejects.toThrow('could not be confirmed')
})
it('reads per-channel dates and exposes loading failures', async () => {
  const rows = [{ channel: 'private_property', expiry_date: '2099-11-30' }]
  const query = { select: vi.fn(() => query), eq: vi.fn(async () => ({ data: rows })) }
  expect(await getListingChannelExpiries('listing', { client: { from: () => query } })).toEqual(rows)
  query.eq.mockResolvedValue({ error: { code: '42501' } })
  await expect(getListingChannelExpiries('listing', { client: { from: () => query } })).rejects.toThrow('could not be loaded')
})
