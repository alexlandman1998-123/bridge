import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), meta: vi.fn(), queries: [], pages: {} }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { from: mocks.from } }))
vi.mock('../metaIntegrationService', () => ({ metaIntegrationRequest: mocks.meta }))
import { loadWorkspaceMarketingCalendar } from '../workspaceCalendarService'
beforeEach(() => {
  mocks.queries.length = 0; mocks.pages = {}; mocks.meta.mockReset().mockResolvedValue({ posts: [] })
  mocks.from.mockReset().mockImplementation(table => {
    const calls = [], query = { table, calls }
    for (const method of ['select', 'eq', 'order', 'or', 'range']) query[method] = (...args) => { calls.push([method, ...args]); return query }
    query.abortSignal = signal => {
      calls.push(['abortSignal', signal]); mocks.queries.push(query)
      const page = calls.find(row => row[0] === 'range')[1] / 500
      const response = mocks.pages[table]?.[page] || { data: [] }
      return Promise.resolve(response)
    }
    return query
  })
})
const range = { from: '2026-10-26', to: '2026-11-01', signal: new AbortController().signal }
it('reads only workspace-scoped metadata, limits by visible SAST dates and pages without analytics', async () => {
  mocks.pages.marketing_campaigns = [{ data: [{ id: 'plan', name: 'Spring', status: 'active', start_date: '2026-10-26', end_date: '2026-11-01' }] }]
  mocks.pages.email_campaigns = [{ data: Array.from({ length: 500 }, (_, i) => ({ id: `mail-${i}`, name: `Email ${i}`, status: 'sent', sent_at: '2026-10-25T22:15:00Z' })) }, { data: [{ id: 'last', name: 'Last email', status: 'scheduled', scheduled_for: '2026-11-01T20:00:00Z' }] }]
  const result = await loadWorkspaceMarketingCalendar('org-a', range)
  expect(result.items).toHaveLength(502); expect(result.warnings).toEqual([])
  expect(result.items.find(row => row.sourceId === 'mail-0').startDate).toBe('2026-10-26')
  expect(mocks.queries).toHaveLength(5)
  for (const query of mocks.queries) {
    expect(query.calls).toContainEqual(['eq', 'organisation_id', 'org-a'])
    expect(query.calls).toContainEqual(['abortSignal', range.signal])
    expect(query.calls.find(row => row[0] === 'select')[1]).not.toContain('*')
  }
  const email = mocks.queries.find(query => query.table === 'email_campaigns')
  expect(email.calls.find(row => row[0] === 'or')[1]).toContain('sent_at.gte.2026-10-26T00:00:00+02:00')
  expect(email.calls.find(row => row[0] === 'or')[1]).toContain('scheduled_for.lt.2026-11-02T00:00:00+02:00')
  expect(mocks.meta).toHaveBeenCalledWith('org-a', 'calendar_posts')
})
it('retains healthy sources and reports unavailable sources explicitly', async () => {
  mocks.pages.email_campaigns = [{ error: { message: 'provider token must not be echoed' } }]
  mocks.pages.whatsapp_campaign_performance = [{ data: [{ id: 'message', name: 'WhatsApp', status: 'sent', sent_at: '2026-10-26T10:00:00Z' }] }]
  mocks.meta.mockRejectedValue(new Error('private provider details'))
  const result = await loadWorkspaceMarketingCalendar('org-b', range)
  expect(result.items).toHaveLength(1)
  expect(result.warnings).toEqual(['Email could not be loaded.', 'Facebook posts could not be loaded.'])
  expect(JSON.stringify(result)).not.toMatch(/private provider|provider token/)
})
it('does not contact any source without a workspace, valid range or after cancellation', async () => {
  await expect(loadWorkspaceMarketingCalendar('', range)).rejects.toThrow('connected workspace')
  await expect(loadWorkspaceMarketingCalendar('org', { ...range, from: '2026-02-30' })).rejects.toThrow('valid calendar')
  await expect(loadWorkspaceMarketingCalendar('org', { ...range, signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' })
  expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.meta).not.toHaveBeenCalled()
})
it('does not turn undated drafts into calendar appointments or duplicate linked communications', async () => {
  mocks.pages.marketing_campaigns = [{ data: [{ id: 'plan', name: 'Draft', status: 'draft' }] }]
  mocks.pages.email_campaigns = [{ data: [{ id: 'mail', name: 'Email', status: 'scheduled', scheduled_for: '2026-10-26T08:00:00Z' }] }]
  mocks.pages.marketing_campaign_activities = [{ data: [{ id: 'link', campaign_id: 'plan', email_campaign_id: 'mail', channel: 'email' }] }]
  const result = await loadWorkspaceMarketingCalendar('org', range)
  expect(result.items).toHaveLength(1); expect(result.items[0].campaignName).toBe('Draft')
})
