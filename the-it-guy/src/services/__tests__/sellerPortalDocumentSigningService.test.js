import { beforeEach, describe, expect, it, vi } from 'vitest'
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ supabase: { functions: { invoke } } }))
import { assertSellerDocumentUploadAvailable, sendSellerDocumentForSignature } from '../sellerPortalDocumentSigningService.js'

describe('seller per-document signing service', () => {
  beforeEach(() => invoke.mockReset())
  it('preserves the server delivery failure rather than the generic client error', async () => {
    invoke.mockResolvedValue({ error: { message: 'HTTP failure', context: { json: async () => ({ error: 'Delivery failed; retry this reviewed copy.', code: 'DELIVERY_FAILED' }) } } })
    await expect(sendSellerDocumentForSignature('listing', 'signed_mandate')).rejects.toMatchObject({ message: 'Delivery failed; retry this reviewed copy.', code: 'DELIVERY_FAILED' })
    expect(invoke).toHaveBeenCalledWith('seller-portal-document-signing', { body: { action: 'issue', listingId: 'listing', documentKey: 'signed_mandate' } })
  })
  it('refreshes before upload and protects active or completed online evidence', async () => {
    for (const status of ['prepared', 'sent', 'partially_signed', 'signed', 'reviewed']) {
      invoke.mockResolvedValueOnce({ data: { documents: [{ document_key: 'signed_mandate', status }] } })
      await expect(assertSellerDocumentUploadAvailable('listing', 'signed_mandate')).rejects.toThrow(/active or completed/)
    }
    invoke.mockResolvedValueOnce({ data: { documents: [{ document_key: 'signed_mandate', status: 'revoked' }] } })
    await expect(assertSellerDocumentUploadAvailable('listing', 'signed_mandate')).resolves.toBeUndefined()
  })
  it('does not allow an upload when current signing status cannot be confirmed', async () => {
    invoke.mockResolvedValue({ error: { message: 'Signing status unavailable' } })
    await expect(assertSellerDocumentUploadAvailable('listing', 'signed_mandate')).rejects.toThrow(/unavailable/)
  })
})
