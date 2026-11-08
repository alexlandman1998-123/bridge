import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), update: vi.fn(), send: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ invokeEdgeFunction: mocks.send }))
vi.mock('../notificationOutboxService', () => ({ prepareNotificationOutbox: mocks.prepare, updateNotificationOutboxStatus: mocks.update }))
import { prepareBuyerOnboardingNotification } from '../buyerOnboardingNotificationService'
const input = { transactionId: 'transaction-one', email: 'buyer@example.test' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.prepare.mockResolvedValue({ plan: {}, items: [{ id: 'event-one', channel: 'email' }] })
  mocks.send.mockResolvedValue({ data: { ok: true, emailId: 'provider-one', deliveryId: 'delivery-one' } })
  mocks.update.mockResolvedValue({ id: 'event-one', status: 'sent' })
})
it('records a provider-confirmed buyer invitation', async () => {
  expect((await prepareBuyerOnboardingNotification(input)).sent).toBe(true)
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }))
})
it.each([undefined, {}, { ok: false }, { ok: true }, { ok: true, queued: true, deliveryId: 'queued' }, { ok: true, sent: false }, { error: { message: 'Sender unavailable' } }])('keeps unconfirmed email responses out of sent status: %j', async data => {
  mocks.send.mockResolvedValue({ data })
  const result = await prepareBuyerOnboardingNotification(input)
  expect(result.sent).toBe(false)
  expect(result.error).toBeTruthy()
  expect(mocks.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }))
})
it('preserves provider acceptance when recording the receipt fails', async () => {
  mocks.update.mockRejectedValue(new Error('database offline'))
  const result = await prepareBuyerOnboardingNotification(input)
  expect(result.sent).toBe(true)
  expect(result.warning).toMatch(/delivery record/)
  expect(result.error).toBeUndefined()
  expect(mocks.update).toHaveBeenCalledTimes(1)
  expect(mocks.send).toHaveBeenCalledTimes(1)
})
it.each(['suppressed', 'handoffRequired'])('does not send a suppressed or assisted intake: %s', async flag => {
  mocks.prepare.mockResolvedValue({ plan: { [flag]: true }, items: [] })
  const result = await prepareBuyerOnboardingNotification(input)
  expect(result.sent).toBe(false)
  expect(result[flag]).toBe(true)
  expect(mocks.send).not.toHaveBeenCalled()
})
