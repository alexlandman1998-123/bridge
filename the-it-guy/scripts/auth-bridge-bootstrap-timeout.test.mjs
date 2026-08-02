#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/context/AuthSessionContext.jsx', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const profileSource = await readFile(new URL('../src/lib/profileApi.js', import.meta.url), 'utf8')

assert.match(
  source,
  /const BRIDGE_AUTH_BOOTSTRAP_TIMEOUT_MS = 45000/,
  'bridge auth bootstrap should keep a bounded timeout window',
)

assert.match(
  source,
  /const BRIDGE_AUTH_BOOTSTRAP_SLOW_MS = 15000/,
  'bridge auth bootstrap should log slow diagnostics before the hard timeout',
)

assert.match(
  source,
  /withBootstrapTimeout\(loadBridgeAuthStateWithTransientRetry\(\{[\s\S]*?session,[\s\S]*?selectedWorkspaceId,[\s\S]*?\}\), \{[\s\S]*?timeoutMs: BRIDGE_AUTH_BOOTSTRAP_TIMEOUT_MS[\s\S]*?phase: 'bridge'[\s\S]*?getDiagnostics: getActiveAuthBootStepDiagnostics/,
  'bridge auth bootstrap must enforce one bounded timeout around the retrying boot task',
)

assert.match(
  source,
  /Authentication bootstrap timed out while loading \$\{labels\.join\(', '\)\}\. Please retry\./,
  'bridge auth bootstrap timeout should include active boot-step diagnostics for support',
)

assert.match(
  source,
  /const BRIDGE_AUTH_BOOTSTRAP_TRANSIENT_RETRY_DELAYS_MS = Object\.freeze\(\[1200, 3200\]\)/,
  'bridge auth bootstrap should retry fast transient failures without extending the bounded timeout window excessively',
)

assert.match(
  source,
  /function isRecoverableBridgeBootstrapError\(error\)[\s\S]*?error\?\.code === 'PGRST002'[\s\S]*?text\.includes\('failed to fetch'\)[\s\S]*?text\.includes\('schema cache'\)/,
  'bridge auth bootstrap should classify failed fetch and PostgREST schema-cache retries as recoverable',
)

assert.match(
  source,
  /trackAuthMetric\('auth_boot_transient_retry'/,
  'bridge auth bootstrap retries should emit telemetry for production diagnostics',
)

assert.match(
  appSource,
  /const restartSignIn = useCallback\(\(\) => \{[\s\S]*?Promise\.resolve\(onLogout\?\.\(\)\)\.finally\(\(\) => \{[\s\S]*?window\.location\.assign\('\/auth'\)/,
  'auth error sign-in escape hatch must clear the stuck session before navigating to /auth',
)

assert.match(
  appSource,
  /<button[\s\S]*?className="auth-secondary-cta"[\s\S]*?onClick=\{restartSignIn\}[\s\S]*?>[\s\S]*?Go to Sign-in/,
  'account bootstrap error screen should use the restart sign-in escape hatch',
)

assert.match(
  profileSource,
  /function isTransientSchemaCacheError\(error\)[\s\S]*?code === 'PGRST002'[\s\S]*?could not query the database for the schema cache[\s\S]*?retrying/,
  'profile bootstrap should preserve transient PostgREST schema-cache retries as retryable errors',
)

assert.match(
  profileSource,
  /function isMissingTableError\(error, tableName\)[\s\S]*?if \(isTransientSchemaCacheError\(error\)\) return false/,
  'profile bootstrap must not misclassify PGRST002 as a missing profiles migration',
)

console.log('auth bridge bootstrap timeout contract ok')
