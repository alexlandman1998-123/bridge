import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createLiveRefreshQueue } from '../src/core/transactions/liveRefreshQueue.js'

// Execute the actual hook with a deterministic browser clock and deferred I/O.
const source = readFileSync('src/hooks/useTransactionLiveRefresh.js', 'utf8')
  .replace(/^import .*\n/gm, '').replace('export default function', 'function')
let now = 0, calls = 0, resolveRead, effects = [], timers = new Map(), id = 0
const window = {
  setTimeout(fn, delay) { timers.set(++id, { fn, at: now + delay }); return id },
  clearTimeout(key) { timers.delete(key) },
  setInterval(fn, delay) { timers.set(++id, { fn, at: now + delay, interval: delay }); return id },
  clearInterval(key) { timers.delete(key) },
  addEventListener() {}, removeEventListener() {},
}
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])) } static now() { return now } }
const hook = new Function('useEffect', 'useRef', 'useState', 'createLiveRefreshQueue', 'window', 'document', 'navigator', 'Date', 'isSupabaseConfigured', 'supabase',
  `${source}; return useTransactionLiveRefresh`)(
  effect => effects.push(effect), value => ({ current: value }), value => [value, () => {}], createLiveRefreshQueue,
  window, { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }, { onLine: true }, Clock, true, {},
)
hook({ transactionId: 'matter', realtime: false, refreshOnMount: false, debounceMs: 0, pollingIntervalMs: 15000,
  onRefresh: () => { calls++; return new Promise(resolve => { resolveRead = resolve }) },
})
const cleanups = effects.map(effect => effect())
async function advance(ms) {
  const until = now + ms
  while (true) {
    const entry = [...timers].filter(([,t]) => t.at <= until).sort((a,b) => a[1].at-b[1].at)[0]
    if (!entry) break
    const [key,timer] = entry
    now = timer.at
    if (timer.interval) timer.at += timer.interval
    else timers.delete(key)
    timer.fn()
    for (let i=0;i<8;i++) await Promise.resolve()
  }
  now = until
}
async function finish(value) { resolveRead(value); for(let i=0;i<12;i++) await Promise.resolve() }
assert.equal(calls,0,'initial page loader must not be duplicated')
// The shared hook deterministically staggers five-role polling by up to 3s.
await advance(18000)
assert.equal(calls,1)
await advance(90000)
assert.equal(calls,1,'six polls must not overlap or queue behind an unfinished read')
await finish(true)
assert.equal(calls,1,'no queued poll starts immediately after the read')
await advance(30000)
assert.equal(calls,2)
await finish(false)
await advance(30000)
assert.equal(calls,2,'failed read must back off')
await advance(20000)
assert.equal(calls,3)
cleanups.forEach(cleanup => cleanup?.())
await finish(true)
await advance(120000)
assert.equal(calls,3,'unmount stops polling')
console.log('PASS: actual live hook initial-load dedupe, slow-read backpressure, cooldown, failure backoff and disposal')
