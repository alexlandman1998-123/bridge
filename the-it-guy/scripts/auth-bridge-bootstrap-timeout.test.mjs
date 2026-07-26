import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const authSessionContext = await readFile(new URL('../src/context/AuthSessionContext.jsx', import.meta.url), 'utf8')
const authBoot = await readFile(new URL('../src/lib/authBoot.js', import.meta.url), 'utf8')

assert.match(
  authSessionContext,
  /withBootstrapTimeout\(\s*loadBridgeAuthState\(\{ session, selectedWorkspaceId \}\),\s*\{\s*timeoutMs: BRIDGE_AUTH_BOOTSTRAP_TIMEOUT_MS,\s*phase: 'bridge',\s*getDiagnostics: getActiveAuthBootStepDiagnostics,\s*\}/s,
  'bridge auth boot must be bounded by the configured bootstrap timeout',
)

const loadBridgeAuthStateBody = authBoot.slice(authBoot.indexOf('export async function loadBridgeAuthState'))
assert.ok(loadBridgeAuthStateBody.includes('const user = session.user'), 'bridge auth boot should reuse the restored session user')
assert.ok(
  !loadBridgeAuthStateBody.includes('supabase.auth.getUser()'),
  'bridge auth boot should not block on Supabase auth.getUser during workspace bootstrap',
)

console.log('auth bridge bootstrap timeout tests passed')
