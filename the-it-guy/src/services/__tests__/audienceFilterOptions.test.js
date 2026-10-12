import { beforeEach, expect, test, vi } from 'vitest'
import { getAudienceFilterOptions, previewSavedAudience } from '../emailCampaignService'
import { supabase } from '../../lib/supabaseClient'
vi.mock('../../lib/supabaseClient', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))
beforeEach(() => vi.resetAllMocks())

test('reads all organisation-scoped pages and returns distinct existing values', async () => {
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() }
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query)
  query.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, id) => ({ id, area: 'Cape Town', lead_stage: 'qualified', tags: ['show-day', ''] })), error: null })
    .mockResolvedValueOnce({ data: [{ id: 501, area: 'Durban', lead_stage: null, tags: ['investor', 'show-day'] }], error: null })
  supabase.from.mockReturnValue(query)
  expect(await getAudienceFilterOptions('agency')).toEqual({ preferred_area: ['Cape Town', 'Durban'], lead_stage: ['qualified'], tags: ['investor', 'show-day'] })
  expect(query.eq.mock.calls).toEqual([['organisation_id', 'agency'], ['organisation_id', 'agency']])
  expect(query.range.mock.calls).toEqual([[0, 499], [500, 999]])
})

test('missing organisation never reads contacts', async () => {
  expect(await getAudienceFilterOptions(null)).toEqual({ preferred_area: [], lead_stage: [], tags: [] })
  expect(supabase.from).not.toHaveBeenCalled()
})

test('read errors are not presented as empty choices', async () => {
  const query = { select: () => query, eq: () => query, order: () => query, range: vi.fn().mockResolvedValue({ data: null, error: new Error('Denied') }) }
  supabase.from.mockReturnValue(query)
  await expect(getAudienceFilterOptions('agency')).rejects.toThrow('Denied')
})

test('full view uses the canonical matcher with an explicit page and organisation', async () => {
  supabase.rpc.mockResolvedValue({ data: { count: 26, contacts: [] }, error: null })
  const rules = { operator: 'AND', rules: [{ field: 'tags', operator: 'in', value: ['show-day'] }] }
  await previewSavedAudience({ organisationId: 'agency', rules, limit: 25, offset: 25 })
  expect(supabase.rpc).toHaveBeenCalledWith('email_audience_preview', { p_organisation_id: 'agency', p_rules: rules, p_limit: 25, p_offset: 25 })
})
