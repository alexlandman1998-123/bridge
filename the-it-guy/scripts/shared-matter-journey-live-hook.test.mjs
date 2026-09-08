import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
const require = createRequire(import.meta.url)
const dom = new JSDOM('<div id="root"></div>', { url: 'https://test.invalid' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let visible = 'visible', online = true
Object.defineProperty(document, 'visibilityState', { get: () => visible })
Object.defineProperty(navigator, 'onLine', { get: () => online })
const intervals = new Map()
let counter = 0, channels = 0, queries = 0, removed = 0
window.setInterval = callback => { const id = ++counter; intervals.set(id, callback); return id }
window.clearInterval = id => intervals.delete(id)
const handlers = new Map()
let subscribe, revision = 4, queryError = false
globalThis.__liveRefreshTestClient = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
    queries++; return queryError ? { error: Error('no signal table') } : { data: { version: revision } }
  } }) }) }),
  channel: () => { channels++; return {
    on(_event, filter, callback) { handlers.set(filter.table, callback); return this },
    subscribe(callback) { subscribe = callback },
  } },
  removeChannel: async () => { removed++ },
}
const stub = 'data:text/javascript,' + encodeURIComponent('export const isSupabaseConfigured=true; export const supabase=globalThis.__liveRefreshTestClient')
const source = readFileSync(new URL('../src/hooks/useTransactionLiveRefresh.js', import.meta.url), 'utf8')
  .replace("'react'", JSON.stringify(pathToFileURL(require.resolve('react')).href))
  .replace("'../lib/supabaseClient'", JSON.stringify(stub))
  .replace("'../core/transactions/liveRefreshQueue'", JSON.stringify(new URL('../src/core/transactions/liveRefreshQueue.js', import.meta.url).href))
const { default: useLive } = await import('data:text/javascript,' + encodeURIComponent(source))
let state, reads = 0, succeed = true
const refresh = async () => { reads++; return succeed }
function Probe(props) { state = useLive({ transactionId: 'matter', onRefresh: refresh, debounceMs: 0, ...props }); return null }
const root = createRoot(document.getElementById('root'))
const flush = async(action = () => {}) => act(async () => { action(); await new Promise(r => setTimeout(r, 15)) })
await flush(() => root.render(React.createElement(Probe, { realtime: false, scopeKey: 'portal-a' })))
await flush()
assert.equal(channels, 0)
assert.equal(queries, 0)
assert.equal(reads, 1)
assert.equal(state.connectionState, 'polling')
visible = 'hidden'
await flush(() => [...intervals.values()].forEach(fn => fn()))
assert.equal(reads, 1)
visible = 'visible'
await flush(() => document.dispatchEvent(new window.Event('visibilitychange')))
assert.equal(reads, 2)
online = false
await flush(() => window.dispatchEvent(new window.Event('offline')))
assert.equal(state.connectionState, 'offline')
await flush(() => [...intervals.values()].forEach(fn => fn()))
assert.equal(reads, 2)
online = true
await flush(() => window.dispatchEvent(new window.Event('online')))
assert.equal(reads, 3)
succeed = false
await flush(() => [...intervals.values()].forEach(fn => fn()))
assert.ok(state.lastErrorAt)
succeed = true
await flush(() => [...intervals.values()].forEach(fn => fn()))
assert.equal(state.lastErrorAt, null)
await flush(() => root.render(React.createElement(Probe, { realtime: true, scopeKey: 'professional' })))
await flush()
assert.equal(channels, 1)
await flush(() => subscribe('SUBSCRIBED'))
assert.equal(state.connectionState, 'live')
await flush(() => [...intervals.values()].forEach(fn => fn())) // acknowledge 4
const before = reads
await flush(() => handlers.get('transaction_refresh_signals')({ new: { version: revision } }))
assert.equal(reads, before)
revision++
succeed = false
await flush(() => handlers.get('transaction_refresh_signals')({ new: { version: revision } }))
assert.ok(state.lastErrorAt)
succeed = true
await flush(() => [...intervals.values()].forEach(fn => fn()))
assert.equal(state.lastErrorAt, null)
const recovered = reads
queryError = true
await flush(() => [...intervals.values()].forEach(fn => fn()))
assert.equal(reads, recovered + 1)
await flush(() => subscribe('CLOSED'))
assert.equal(state.connectionState, 'polling')
await flush(() => root.unmount())
assert.equal(intervals.size, 0)
assert.equal(removed, 1)
const stopped = reads
await flush(() => window.dispatchEvent(new window.Event('focus')))
assert.equal(reads, stopped)
dom.window.close()
console.log('Live hook: authorised portal polling, visibility/offline recovery, signal retry, fallback and cleanup passed.')
