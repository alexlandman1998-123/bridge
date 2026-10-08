import { supabase } from '../lib/supabaseClient.js'

export function createMobileWebPushService({ client = supabase, win = globalThis.window, nav = globalThis.navigator,
  fetcher = globalThis.fetch } = {}) {
  function supportMessage() {
    const ios = /iPad|iPhone|iPod/.test(nav?.userAgent || '') || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1)
    if (ios && !(nav.standalone || win?.matchMedia?.('(display-mode: standalone)').matches)) {
      return 'On iPhone, add Arch9 to your Home Screen, then open it from its icon to enable notifications.'
    }
    if (!win?.isSecureContext || !nav?.serviceWorker || !win?.PushManager || !win?.Notification) {
      return 'Push notifications are unavailable in this browser. On iPhone, use iOS 16.4 or later and open Arch9 from your Home Screen.'
    }
    if (win.Notification.permission === 'denied') return 'Notifications are blocked. Allow Arch9 notifications in your device settings, then try again.'
    return ''
  }
  async function request(userId, body) {
    const session = await client?.auth.getSession()
    if (!userId || session?.error || session?.data?.session?.user?.id !== userId) throw new Error('Sign in before enabling notifications.')
    const response = await fetcher('/api/mobile/push', {
      method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: { Authorization: `Bearer ${session.data.session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    let data
    try { data = await response.json() } catch { throw new Error('Notifications are temporarily unavailable.') }
    if (!response.ok) throw Object.assign(new Error(data.message || 'Notifications are temporarily unavailable.'), { status: response.status })
    return data
  }
  function decodeKey(key) {
    const binary = win.atob(key.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  }
  function matchesKey(subscription, publicKey) {
    const current = subscription.options?.applicationServerKey
    if (!current) return false
    return Array.from(new Uint8Array(current)).join(',') === Array.from(decodeKey(publicKey)).join(',')
  }
  async function load(userId) {
    const message = supportMessage()
    if (message) return { subscriptionId: null, message, unavailable: true }
    const config = await request(userId)
    const registration = await nav.serviceWorker.getRegistration('/')
    const subscription = await registration?.pushManager.getSubscription()
    if (win.Notification.permission !== 'granted' || !subscription || !matchesKey(subscription, config.publicKey)) {
      return { publicKey: config.publicKey, subscriptionId: null }
    }
    const status = await request(userId, { action: 'status', subscription: subscription.toJSON() })
    return { publicKey: config.publicKey, subscriptionId: status.subscriptionId }
  }
  async function enable(userId, publicKey) {
    const message = supportMessage()
    if (message) throw new Error(message)
    if (!publicKey) throw new Error('Notification setup is still loading. Please try again.')
    // Permission must be requested directly within the user's tap, before network awaits.
    const permission = await win.Notification.requestPermission()
    if (permission !== 'granted') throw new Error('Notification permission was not granted.')
    const registration = await nav.serviceWorker.register('/push-sw.js', { scope: '/', updateViaCache: 'none' })
    if (!registration.active) {
      let timer
      try {
        await Promise.race([nav.serviceWorker.ready, new Promise((_, reject) => {
          timer = win.setTimeout(() => reject(new Error('Notification setup timed out. Please try again.')), 12000)
        })])
      } finally { win.clearTimeout(timer) }
    }
    let subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      const existing = matchesKey(subscription, publicKey)
        ? await request(userId, { action: 'status', subscription: subscription.toJSON() }) : {}
      if (existing.subscriptionId) return { publicKey, subscriptionId: existing.subscriptionId }
      // A new account or VAPID key gets a new endpoint; never reassign another account's endpoint.
      if (!await subscription.unsubscribe()) throw new Error('The previous registration could not be removed. Please try again.')
      subscription = null
    }
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) })
    try {
      const saved = await request(userId, { action: 'register', subscription: subscription.toJSON(), publicKey })
      if (!saved.subscriptionId) throw new Error('Notifications could not be enabled. Please try again.')
      return { publicKey, subscriptionId: saved.subscriptionId }
    } catch (error) {
      await subscription.unsubscribe().catch(() => {})
      throw error
    }
  }
  async function disable(userId, subscriptionId) {
    await request(userId, { action: 'remove', subscriptionId })
    try {
      const registration = await nav.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription && !await subscription.unsubscribe()) throw new Error()
      return { message: 'Notifications disabled on this device.' }
    } catch {
      return { message: 'Notifications disabled for this account. Reload to finish removing the device subscription.' }
    }
  }
  async function test(userId, subscriptionId) {
    const result = await request(userId, { action: 'test', subscriptionId })
    if (result.accepted !== true) throw new Error('The test was not accepted. Please try again.')
    return result
  }
  return { load, enable, disable, test }
}

export const mobileWebPushService = createMobileWebPushService()
