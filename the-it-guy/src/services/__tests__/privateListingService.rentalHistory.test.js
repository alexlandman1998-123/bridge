// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { getPrivateListingActivity } from '../privateListingService'
const mocks = vi.hoisted(() => ({ from: vi.fn(), range: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: mocks.from } }))
const id = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  vi.clearAllMocks()
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: mocks.range }
  mocks.from.mockReturnValue(query)
})
it('reads later history pages rather than silently losing older changes', async () => {
  const first = Array.from({ length: 500 }, (_, index) => ({ id: String(index) }))
  mocks.range.mockResolvedValueOnce({ data: first }).mockResolvedValueOnce({ data: [{ id: 'older change' }] })
  const result = await getPrivateListingActivity(id, { requireAvailable: true })
  expect(result).toHaveLength(501)
  expect(result.at(-1).id).toBe('older change')
  expect(mocks.range.mock.calls).toEqual([[0, 499], [500, 999]])
})
it('rejects a failed later read rather than displaying partial history', async () => {
  mocks.range.mockResolvedValueOnce({ data: Array(500).fill({ id: 'event' }) }).mockResolvedValueOnce({ error: new Error('History read denied') })
  await expect(getPrivateListingActivity(id, { requireAvailable: true })).rejects.toThrow('History read denied')
})
