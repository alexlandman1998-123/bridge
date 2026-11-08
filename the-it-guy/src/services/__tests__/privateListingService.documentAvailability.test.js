import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: api.from } }))
import { getPrivateListingDocuments, getPrivateListingDocumentRequirements } from '../privateListingService'
const id = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  api.from.mockImplementation(table => {
    const query = { select: () => query, eq: () => query, order: () => query,
      then: (resolve, reject) => Promise.resolve({ data: null, error: { code: '42P01', message: `relation "public.${table}" does not exist` } }).then(resolve, reject) }
    return query
  })
})
it.each([['documents', getPrivateListingDocuments], ['requirements', getPrivateListingDocumentRequirements]])('keeps unavailable %s distinct from a confirmed empty checklist, including cached failures', async (_label, read) => {
  await expect(read(id, { requireAvailable: true })).rejects.toThrow('unavailable')
  await expect(read(id)).resolves.toEqual([])
  await expect(read(id, { requireAvailable: true })).rejects.toThrow('database setup')
})
