import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'

const source = await readFile(new URL('../../public/push-sw.js', import.meta.url), 'utf8')
function worker() {
  const handlers = {}; const shown = []; const opened = []
  const self = { location: { origin: 'https://app.arch9.co.za' }, addEventListener: (key, fn) => { handlers[key] = fn },
    registration: { showNotification: async (title, options) => { shown.push({ title, options }) } },
    clients: { matchAll: async () => [], openWindow: async (url) => opened.push(url) } }
  runInNewContext(source, { self, URL })
  return { handlers, shown, opened, self }
}
test('push wakes the worker and always displays a notification, including invalid payloads', async () => {
  const f = worker(); let pending
  f.handlers.push({ data: { json: () => ({ title: 'Arch9 test notification', body: 'Your Arch9 notifications are working.' }) }, waitUntil: (p) => { pending = p } })
  await pending
  assert.equal(f.shown[0].title, 'Arch9 test notification')
  f.handlers.push({ data: { json: () => { throw new Error() } }, waitUntil: (p) => { pending = p } })
  await pending
  assert.equal(f.shown[1].title, 'Arch9')
  assert.ok(!f.handlers.fetch, 'Push worker must not cache application requests')
})
test('notification taps only open mobile paths on the Arch9 origin', async () => {
  const f = worker()
  for (const [url, expected] of [['https://evil.test/mobile/inbox', '/mobile/inbox'], ['/api/secrets', '/mobile/inbox'], ['/mobile/documents', '/mobile/documents']]) {
    let pending
    f.handlers.notificationclick({ notification: { close() {}, data: { url } }, waitUntil: (p) => { pending = p } })
    await pending
    assert.equal(f.opened.at(-1), `https://app.arch9.co.za${expected}`)
  }
  let focused = false; let navigated
  f.self.clients.matchAll = async () => [{ url: 'https://app.arch9.co.za/mobile/home', navigate: async (url) => { navigated = url }, focus: () => { focused = true } }]
  let pending
  f.handlers.notificationclick({ notification: { close() {}, data: { url: '/mobile/inbox' } }, waitUntil: (p) => { pending = p } })
  await pending
  assert.equal(navigated, 'https://app.arch9.co.za/mobile/inbox')
  assert.equal(focused, true)
})
