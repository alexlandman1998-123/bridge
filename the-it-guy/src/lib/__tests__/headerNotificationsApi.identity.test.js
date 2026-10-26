import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), leadResult: null, builders: {} }))
vi.mock('../supabaseClient', () => ({ supabase: { from: mocks.from } }))
const leadId = 'a0000000-0000-0000-0000-000000000001'
const row = { id: 'alert', user_id: 'me', title: 'New buyer lead received', message: 'New enquiry', is_read: false, event_data: { leadId } }
beforeEach(() => {
  vi.resetModules()
  mocks.from.mockReset()
  mocks.builders = {}
  mocks.leadResult = { data: [{ lead_id: leadId, lead_source: 'Property24', contacts: { first_name: 'Sarah', last_name: 'Jacobs' } }], error: null }
  mocks.from.mockImplementation((table) => {
    const builder = {}
    for (const method of ['select', 'eq', 'order', 'limit', 'in']) builder[method] = vi.fn(() => builder)
    builder.then = (resolve, reject) => Promise.resolve(table === 'leads' ? mocks.leadResult : { data: [row], error: null }).then(resolve, reject)
    mocks.builders[table] = builder
    return builder
  })
})
it('enriches old alerts with the visible lead contact and source in one bounded lookup', async () => {
  const { fetchMyNotifications } = await import('../headerNotificationsApi.js')
  const result = await fetchMyNotifications({ userId: 'me' })
  expect(result.notifications[0].eventData).toMatchObject({ leadName: 'Sarah Jacobs', leadSource: 'Property24' })
  expect(result.unreadCount).toBe(1)
  expect(mocks.builders.leads.in).toHaveBeenCalledWith('lead_id', [leadId])
  expect(mocks.builders.leads.select).toHaveBeenCalledWith('lead_id, lead_source, contacts!leads_contact_id_fkey(first_name,last_name)')
})
it('keeps alerts visible when lead details cannot be read', async () => {
  mocks.leadResult = { data: null, error: { message: 'Not accessible' } }
  const { fetchMyNotifications } = await import('../headerNotificationsApi.js')
  const result = await fetchMyNotifications({ userId: 'me' })
  expect(result.notifications[0].eventData).toEqual({ leadId })
  expect(result.unreadCount).toBe(1)
})
it('preserves the recorded name and platform without another lookup', async () => {
  const original = row.event_data
  row.event_data = { leadId, leadName: 'Alex Buyer', leadSource: 'Private Property' }
  try {
    const { fetchMyNotifications } = await import('../headerNotificationsApi.js')
    const result = await fetchMyNotifications({ userId: 'me' })
    expect(result.notifications[0].eventData.leadName).toBe('Alex Buyer')
    expect(mocks.from).not.toHaveBeenCalledWith('leads')
  } finally { row.event_data = original }
})
