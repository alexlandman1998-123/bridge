import { expect, it, vi } from 'vitest'
import { searchRentalLandlordContacts } from '../rentalLandlordMandateRepository.js'
vi.mock('../../../lib/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: null }))
function client() {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [] }) }
  return { db: { from: vi.fn().mockReturnValue(query) }, query }
}
it('keeps email punctuation and fences contact searching to the selected organisation', async () => {
  const { db, query } = client()
  await searchRentalLandlordContacts('org', 'owner+rentals@example.co.za', { client: db })
  expect(query.eq).toHaveBeenCalledWith('organisation_id', 'org')
  expect(query.or.mock.calls[0][0]).toContain('email.ilike.%owner+rentals@example.co.za%')
})
it('supports full personal names across the separate name fields and excludes filter delimiters from entered text', async () => {
  const { db, query } = client()
  await searchRentalLandlordContacts('org', "Zoë O'Neill", { client: db })
  expect(query.or.mock.calls[0][0]).toContain("and(first_name.ilike.%Zoë%,last_name.ilike.%O'Neill%)")
  await searchRentalLandlordContacts('org', 'Owner),status.eq.hidden', { client: db })
  expect(query.or.mock.calls[1][0]).not.toContain('Owner),')
})
