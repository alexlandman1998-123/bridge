import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const clientPortalPage = await readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const migration = await readFile(
  new URL('../../supabase/migrations/202607270001_client_portal_bootstrap_hot_path_indexes.sql', import.meta.url),
  'utf8',
)

const coreLoaderStart = apiSource.indexOf('export async function fetchClientPortalCoreByToken')
const coreLoaderEnd = apiSource.indexOf('function mapClientPortalContextRow', coreLoaderStart)
const coreLoader = apiSource.slice(coreLoaderStart, coreLoaderEnd)

assert.match(apiSource, /function isStatementTimeoutError\(error\)/, 'statement timeout detection must be centralized')
assert.match(
  coreLoader,
  /isStatementTimeoutError\(documentError\)[\s\S]*Optional document summary unavailable/,
  'core portal bootstrap must not fail when optional document summaries time out',
)
assert.match(
  coreLoader,
  /isStatementTimeoutError\(appointmentsError\)[\s\S]*Optional appointments unavailable/,
  'core portal bootstrap must not fail when optional appointment summaries time out',
)
assert.match(
  coreLoader,
  /isStatementTimeoutError\(rolePlayerError\)[\s\S]*Optional role-player summary unavailable/,
  'core portal bootstrap must not fail when optional role-player decoration times out',
)
assert.match(
  clientPortalPage,
  /function getClientPortalLoadErrorMessage\(error[\s\S]*temporarily taking too long to load/,
  'client portal load errors must hide raw database timeout text',
)
assert.doesNotMatch(
  clientPortalPage,
  /setError\(loadError\?\.message \|\| 'We could not refresh your client workspace right now\.'\)/,
  'background refresh failures must not replace an already visible portal with a blocking error',
)
assert.match(migration, /client_portal_links_active_token_idx/, 'portal token bootstrap must have an active-token index')
assert.match(migration, /document_packets_transaction_type_updated_idx/, 'OTP packet lookup must have a transaction hot-path index')
assert.match(migration, /document_packet_signers_packet_created_idx/, 'packet signer decoration must have a packet-created index')

console.log('client portal bootstrap reliability tests passed')
