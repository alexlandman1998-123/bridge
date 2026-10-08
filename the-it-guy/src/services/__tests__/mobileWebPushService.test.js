// @vitest-environment jsdom
import { expect, test, vi } from 'vitest'
vi.mock('../../lib/supabaseClient.js', () => ({ supabase: null }))
import { createMobileWebPushService } from '../mobileWebPushService.js'

function fixture({ permission = 'default', agent = '', standalone = true } = {}) {
  const publicKey = btoa('public-key').replace(/=/g, '')
  const subscription = { options: { applicationServerKey: Uint8Array.from('public-key', (c) => c.charCodeAt(0)).buffer },
    toJSON: () => ({ endpoint: 'https://web.push.apple.com/test', keys: {} }), unsubscribe: vi.fn(async () => true) }
  const registration = { active: true, pushManager: { getSubscription: vi.fn(async () => null), subscribe: vi.fn(async () => subscription) } }
  const win = { isSecureContext: true, PushManager: {}, Notification: { permission, requestPermission: vi.fn(async () => 'granted') },
    atob, setTimeout, clearTimeout, matchMedia: () => ({ matches: standalone }) }
  const nav = { userAgent: agent, standalone, serviceWorker: { register: vi.fn(async () => registration), getRegistration: vi.fn(async () => registration) } }
  const client = { auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'a' }, access_token: 'token' } } })) } }
  const fetcher = vi.fn(async (_, options) => ({ ok: true, json: async () => options.method === 'GET' ? { publicKey } : { subscriptionId: 'saved' } }))
  return { service: createMobileWebPushService({ client, win, nav, fetcher }), client, win, nav, fetcher, subscription, registration, publicKey }
}

test('unsupported iPhone tabs and denied permission cannot show enabled or send registration', async () => {
  const tab = fixture({ agent: 'iPhone', standalone: false })
  expect((await tab.service.load('a')).unavailable).toBe(true)
  expect(tab.fetcher).not.toHaveBeenCalled()
  const denied = fixture({ permission: 'denied' })
  await expect(denied.service.enable('a', denied.publicKey)).rejects.toThrow('blocked')
  expect(denied.registration.pushManager.subscribe).not.toHaveBeenCalled()
})

test('permission happens in the tap and enabled requires the server to save the subscription', async () => {
  const f = fixture()
  const promise = f.service.enable('a', f.publicKey)
  expect(f.win.Notification.requestPermission).toHaveBeenCalledOnce()
  expect(f.fetcher).not.toHaveBeenCalled()
  expect((await promise).subscriptionId).toBe('saved')
  expect(f.registration.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }))
  f.fetcher.mockResolvedValue({ ok: false, status: 503, json: async () => ({ message: 'Could not save' }) })
  await expect(f.service.enable('a', f.publicKey)).rejects.toThrow('Could not save')
  expect(f.subscription.unsubscribe).toHaveBeenCalled()
})

test('refresh checks registration ownership and account switching prevents sending', async () => {
  const f = fixture({ permission: 'granted' })
  f.registration.pushManager.getSubscription.mockResolvedValue(f.subscription)
  f.fetcher.mockImplementation(async (_, options) => ({ ok: true, json: async () => options.method === 'GET' ? { publicKey: f.publicKey } : { subscriptionId: null } }))
  expect((await f.service.load('a')).subscriptionId).toBeNull()
  await expect(f.service.test('b', 'saved')).rejects.toThrow('Sign in')
  expect(f.fetcher).toHaveBeenCalledTimes(2)
  await f.service.enable('a', f.publicKey).catch(() => {})
  expect(f.subscription.unsubscribe).toHaveBeenCalled()
})

test('rotated VAPID keys require new registration and provider acceptance is required for a test', async () => {
  const f = fixture({ permission: 'granted' })
  f.registration.pushManager.getSubscription.mockResolvedValue(f.subscription)
  f.fetcher.mockResolvedValue({ ok: true, json: async () => ({ publicKey: btoa('rotated-key') }) })
  expect((await f.service.load('a')).subscriptionId).toBeNull()
  f.fetcher.mockResolvedValue({ ok: true, json: async () => ({}) })
  await expect(f.service.test('a', 'saved')).rejects.toThrow('not accepted')
})

test('successful server removal remains disabled when browser unsubscription fails', async () => {
  const f = fixture()
  f.registration.pushManager.getSubscription.mockResolvedValue(f.subscription)
  f.subscription.unsubscribe.mockRejectedValue(new Error('Device unavailable'))
  expect((await f.service.disable('a', 'saved')).message).toContain('Notifications disabled for this account')
  expect(JSON.parse(f.fetcher.mock.calls[0][1].body)).toEqual({ action: 'remove', subscriptionId: 'saved' })
})
