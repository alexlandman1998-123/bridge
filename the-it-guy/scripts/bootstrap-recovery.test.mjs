import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const [indexHtml, appSource, packageJson] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('src/App.jsx', 'utf8'),
  readFile('package.json', 'utf8'),
])
const packageDefinition = JSON.parse(packageJson)

assert.match(indexHtml, /arch9:bootstrap-retry:v1/, 'The HTML shell must remember a bounded bootstrap retry.')
assert.match(indexHtml, /window\.addEventListener\('error'/, 'The HTML shell must catch a failed entry script before React starts.')
assert.match(indexHtml, /window\.addEventListener\('unhandledrejection'/, 'The HTML shell must catch a failed module import before React starts.')
assert.match(indexHtml, /Finishing the latest update/, 'A failed bootstrap must show a recovery screen instead of a blank page.')
assert.match(indexHtml, /arch9_bootstrap_reload/, 'Bootstrap recovery must navigate with a cache-busting URL.')
assert.match(appSource, /__arch9MarkBootstrapReady\?\.\(\)/, 'The app must retire the bootstrap retry after React has mounted.')
assert.match(packageDefinition.scripts['build:guarded'], /test:bootstrap-recovery/, 'Guarded builds must verify bootstrap recovery.')

const bootstrap = indexHtml.match(/<script>\s*([\s\S]*?)<\/script>/)[1]
function browserFixture(retryCount = 0) {
  const events = {}, requests = [], navigations = [], storage = new Map()
  const root = { innerHTML: '' }
  let click
  if (retryCount) storage.set('arch9:bootstrap-retry:v1', JSON.stringify({ count: retryCount, timestamp: Date.now() }))
  const window = {
    location: { pathname: '/auth', origin: 'https://app.arch9.co.za', href: 'https://app.arch9.co.za/auth', replace: url => navigations.push(url) },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout, clearTimeout, addEventListener: (name, handler) => { events[name] = handler },
  }
  const document = {
    querySelectorAll: () => [
      { src: 'https://app.arch9.co.za/assets/main.js' },
      { href: 'https://app.arch9.co.za/assets/icons.js' },
      { href: 'https://app.arch9.co.za/assets/icons.js' },
      { href: 'https://other.example/assets/foreign.js' },
      { href: 'https://app.arch9.co.za/api/private.js' },
    ],
    getElementById: id => id === 'root' ? root : { addEventListener: (_, handler) => { click = handler } },
  }
  runInNewContext(bootstrap, { window, document, URL, fetch: (url, options) => { requests.push({ url, options }); return Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }) } })
  return { window, events, requests, navigations, root, click: () => click() }
}
const settle = () => new Promise(setImmediate)
const failedModule = { target: { tagName: 'SCRIPT', src: 'https://app.arch9.co.za/assets/main.js' } }

const automatic = browserFixture()
automatic.events.error(failedModule)
automatic.events.error(failedModule)
assert.equal(automatic.navigations.length, 0, 'Revalidate modules before navigating.')
await settle()
assert.deepEqual(automatic.requests.map(r => r.url), ['https://app.arch9.co.za/assets/main.js', 'https://app.arch9.co.za/assets/icons.js'])
assert.ok(automatic.requests.every(r => r.options.cache === 'reload' && r.options.credentials === 'same-origin'), 'Bypass cached failures and replace the cached responses.')
assert.equal(automatic.navigations.length, 1, 'Concurrent failures must share one bounded retry.')
assert.match(automatic.navigations[0], /arch9_bootstrap_reload=/)

const exhausted = browserFixture(1)
exhausted.events.error(failedModule)
await settle()
assert.equal(exhausted.navigations.length, 0, 'Never create an automatic refresh loop.')
assert.match(exhausted.root.innerHTML, /Refresh Arch9/)
exhausted.click()
exhausted.click()
await settle()
assert.equal(exhausted.requests.length, 2, 'The visible retry must revalidate cached modules once.')
assert.equal(exhausted.navigations.length, 1)

const apiFailure = browserFixture()
apiFailure.events.unhandledrejection({ reason: new Error('Failed to fetch') })
await settle()
assert.equal(apiFailure.requests.length, 0, 'An unrelated API failure must not replace the app with a module recovery screen.')
assert.equal(apiFailure.navigations.length, 0)

const mounted = browserFixture()
mounted.window.__arch9MarkBootstrapReady()
mounted.events.error(failedModule)
await settle()
assert.equal(mounted.requests.length, 0, 'Mounted app errors belong to the existing route recovery boundary.')

console.log('bootstrap recovery contract and cached-module runtime checks passed')
