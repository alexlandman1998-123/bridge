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
  /const BRIDGE_AUTH_BOOTSTRAP_RETRY_MS = 3000/,
  'retryable bridge auth bootstrap failures should automatically retry without a sign-in loop',
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

assert.match(
  source,
  /isRetryableBridgeBootstrapError\(error\)[\s\S]*?status: 'loading'[\s\S]*?setBootAttempt\(\(previous\) => previous \+ 1\)/,
  'retryable bridge bootstrap errors should stay in the loading gate and schedule another boot attempt',
)

const authBootSource = await readFile(new URL('../src/lib/authBoot.js', import.meta.url), 'utf8')

assert.match(
  authBootSource,
  /const AUTH_BOOT_WORKSPACE_STEP_TIMEOUT_MS = 18000/,
  'workspace resolution should have a per-step timeout below the bridge bootstrap cap',
)

assert.match(
  authBootSource,
  /label: 'workspace\.resolveCurrentWorkspace'[\s\S]*?timeoutMs: AUTH_BOOT_WORKSPACE_STEP_TIMEOUT_MS/,
  'initial workspace resolution should be bounded by the workspace step timeout',
)

console.log('auth bridge bootstrap timeout contract ok')
