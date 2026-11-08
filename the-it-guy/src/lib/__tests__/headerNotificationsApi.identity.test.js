import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), auth: vi.fn(), leadResult: null, builders: {} }))
vi.mock('../supabaseClient', () => ({ supabase: { from: mocks.from, auth: { getUser: mocks.auth } } }))
const leadId = 'a0000000-0000-0000-0000-000000000001'
const row = { id: 'alert', user_id: 'me', title: 'New buyer lead received', message: 'New enquiry', is_read: false, event_data: { leadId } }
beforeEach(() => {
  vi.resetModules()
  mocks.from.mockReset()
  mocks.auth.mockResolvedValue({ data: { user: { id: 'me' } }, error: null })
  mocks.builders = {}
  mocks.leadResult = { data: [{ lead_id: leadId, lead_source: 'Property24', contacts: { first_name: 'Sarah', last_name: 'Jacobs' } }], error: null }
  mocks.from.mockImplementation((table) => {
    const builder = {}
    for (const method of ['select', 'eq', 'order', 'limit', 'in', 'update']) builder[method] = vi.fn(() => builder)
    builder.maybeSingle = vi.fn(async () => ({ data: row, error: null }))
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

it('shares identical reads but isolates cached results by viewer and requested limit', async () => {
  const { fetchMyNotifications } = await import('../headerNotificationsApi.js')
  await Promise.all([fetchMyNotifications({ userId: 'one' }), fetchMyNotifications({ userId: 'one' })])
  expect(mocks.from.mock.calls.filter(([table]) => table === 'transaction_notifications')).toHaveLength(1)
  await fetchMyNotifications({ userId: 'one' })
  expect(mocks.from.mock.calls.filter(([table]) => table === 'transaction_notifications')).toHaveLength(1)
  await fetchMyNotifications({ userId: 'two' })
  expect(mocks.builders.transaction_notifications.eq).toHaveBeenCalledWith('user_id', 'two')
  await fetchMyNotifications({ userId: 'two', limit: 5 })
  expect(mocks.from.mock.calls.filter(([table]) => table === 'transaction_notifications')).toHaveLength(3)
})

it('bounds oversized requested inbox windows and keeps unread filters separate', async () => {
  const { fetchMyNotifications } = await import('../headerNotificationsApi.js')
  await fetchMyNotifications({ userId: 'one', limit: 100000 })
  expect(mocks.builders.transaction_notifications.limit).toHaveBeenCalledWith(100)
  await fetchMyNotifications({ userId: 'one', unreadOnly: true })
  expect(mocks.builders.transaction_notifications.eq).toHaveBeenCalledWith('is_read', false)
  expect(mocks.from.mock.calls.filter(([table]) => table === 'transaction_notifications')).toHaveLength(2)
})

it('does not repopulate the cache with a read that started before a notification was marked read', async () => {
  const original = mocks.from.getMockImplementation()
  let finish
  let first = true
  mocks.from.mockImplementation(table => {
    const builder = original(table)
    if (table === 'transaction_notifications' && first) {
      first = false
      builder.then = (resolve, reject) => new Promise(done => { finish = done }).then(resolve, reject)
    }
    return builder
  })
  const { fetchMyNotifications, markNotificationRead } = await import('../headerNotificationsApi.js')
  const oldRead = fetchMyNotifications({ userId: 'me' })
  // Promise assimilation starts the fixture's pending query in a microtask.
  await Promise.resolve(); await Promise.resolve()
  await markNotificationRead('alert')
  finish({ data: [row], error: null })
  await oldRead
  await fetchMyNotifications({ userId: 'me' })
  expect(mocks.from.mock.calls.filter(([table]) => table === 'transaction_notifications')).toHaveLength(3)
})
