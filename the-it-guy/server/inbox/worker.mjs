import { createClient } from '@supabase/supabase-js'
import { setTimeout } from 'node:timers/promises'
import { sendOne } from './sender.mjs'
import { receiveOne } from './receiver.mjs'
const { SUPABASE_URL } = process.env
let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (process.env.SUPABASE_SECRET_KEYS) {
  try {
    const keys = JSON.parse(process.env.SUPABASE_SECRET_KEYS)
    serviceKey = keys.default || Object.values(keys).find(value => String(value).startsWith('sb_secret_')) || serviceKey
  } catch { throw new Error('Set a valid server-only Supabase secret key map.') }
}
if (!SUPABASE_URL || !serviceKey) throw new Error('Set server-only Supabase receiving credentials before starting the worker.')
const db = createClient(SUPABASE_URL, serviceKey, {
  global: { fetch: (url, init) => fetch(url, { ...init, signal: init?.signal || AbortSignal.timeout(45000) }) }, auth: { persistSession: false, autoRefreshToken: false } })
let stopping = false
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => { stopping = true })
do {
  let claimed = false
  // Each direction gets its own error boundary; a broken sending queue must
  // not stop receiving, and one slow mailbox never starts a parallel process.
  try { claimed = await sendOne(db) } catch { console.info('{"status":"failed","code":"outgoing_queue_unavailable"}') }
  if (!stopping) {
    try { claimed = (await receiveOne(db)) || claimed } catch { console.info('{"status":"failed","code":"receiving_queue_unavailable"}') }
  }
  if (process.argv.includes('--once') || stopping) break
  if (!claimed) await setTimeout(5000)
} while (!stopping)
