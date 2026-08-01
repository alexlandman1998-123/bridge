#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/context/AuthSessionContext.jsx', import.meta.url), 'utf8')

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
  /withBootstrapTimeout\(loadBridgeAuthState\(\{ session, selectedWorkspaceId \}\), \{[\s\S]*?timeoutMs: BRIDGE_AUTH_BOOTSTRAP_TIMEOUT_MS[\s\S]*?phase: 'bridge'[\s\S]*?getDiagnostics: getActiveAuthBootStepDiagnostics/,
  'bridge auth bootstrap must enforce the timeout instead of only logging a slow warning',
)

assert.match(
  source,
  /Authentication bootstrap timed out while loading \$\{labels\.join\(', '\)\}\. Please retry\./,
  'bridge auth bootstrap timeout should include active boot-step diagnostics for support',
)

console.log('auth bridge bootstrap timeout contract ok')
