import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/lib/documentPacketsApi.js', import.meta.url), 'utf8')
const start = source.indexOf('async function getAuthenticatedUser(client)')
const end = source.indexOf('\nasync function resolvePacketContext', start)
const implementation = source.slice(start, end)

assert.match(implementation, /client\.auth\.getSession\(\)/, 'packet authentication should use the established session first')
assert.match(implementation, /sessionUser\?\.id/, 'the session fast path must require an authenticated user')
assert.match(implementation, /const authResult = await client\.auth\.getUser\(\)/, 'missing sessions must retain the verified auth fallback')
assert.ok(
  implementation.indexOf('client.auth.getSession()') < implementation.indexOf('client.auth.getUser()'),
  'the local session must be consulted before the remote auth lookup',
)

console.log('document packet session fast-path checks passed')
