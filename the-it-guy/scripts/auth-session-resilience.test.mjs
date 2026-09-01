#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/context/AuthSessionContext.jsx', import.meta.url), 'utf8')

assert.match(
  source,
  /async function restoreSessionWithJwtRecovery\(\)[\s\S]*?supabase\.auth\.getSession\(\)[\s\S]*?isUnsupportedJwtAlgorithmError[\s\S]*?supabase\.auth\.refreshSession\(\)/,
  'unsupported JWT algorithms should receive one refresh recovery attempt',
)

assert.doesNotMatch(
  source,
  /isUnsupportedJwtAlgorithmError\(error\)\) await clearSupabaseLocalAuthState\(\)/,
  'a token algorithm error must not erase a user’s local session during session bootstrap',
)

assert.match(
  source,
  /trackAuthMetric\('logout_requested',[\s\S]*?await supabase\.auth\.signOut\(\)/,
  'logout intent must be recorded before the session is revoked',
)

assert.match(
  source,
  /getAuthStateMetricEvent\(event\)[\s\S]*?trackAuthMetric\(metricEvent,[\s\S]*?authFlowId: getAuthFlowId\(\)/,
  'auth state changes should carry a session-scoped correlation identifier',
)

assert.match(
  source,
  /metricEvent === 'signed_out' && !logoutRequestedRef\.current[\s\S]*?storePendingAuthDiagnostic\('unexpected_signed_out'\)/,
  'unexpected sign-outs should survive locally until the next authenticated telemetry write',
)

console.log('auth session resilience contract ok')
