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
  /const BRIDGE_AUTH_BOOTSTRAP_RETRY_BASE_MS = 1500/,
  'retryable bridge auth bootstrap failures should use a short initial backoff',
)

assert.match(
  source,
  /const BRIDGE_AUTH_BOOTSTRAP_RETRY_MAX_MS = 8000/,
  'retryable bridge auth bootstrap failures should cap retry backoff',
)

assert.match(
  source,
  /const BRIDGE_AUTH_BOOTSTRAP_RETRY_JITTER_MS = 750/,
  'retryable bridge auth bootstrap failures should add jitter to avoid synchronized retry storms',
)

assert.match(
  source,
  /const MAX_RETRYABLE_BRIDGE_BOOT_ATTEMPTS = 2/,
  'retryable bridge auth bootstrap failures should be capped so navigation is not held in a permanent loading loop',
)

assert.match(
  source,
  /const AUTH_BOOT_OBSERVABILITY_STORAGE_KEY = 'arch9:auth-boot-observability:v1'/,
  'auth boot observability should keep a session-scoped breadcrumb buffer',
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
  /bridgeRetryScopeRef\.current\.key !== retryScopeKey[\s\S]*?bridgeRetryScopeRef\.current = \{ key: retryScopeKey, attempts: 0 \}/,
  'retry attempts should be scoped to the current user and selected workspace',
)

assert.match(
  source,
  /const retryReason = getBridgeBootstrapRetryReason\(error\)[\s\S]*?retryAttemptsUsed < MAX_RETRYABLE_BRIDGE_BOOT_ATTEMPTS[\s\S]*?getBridgeBootstrapRetryDelayMs\(retryAttemptsUsed\)/,
  'retryable bridge bootstrap errors should use classified bounded backoff instead of a fixed retry loop',
)

assert.match(
  source,
  /trackAuthMetric\('auth_boot_retry_scheduled'[\s\S]*?retryReason/,
  'scheduled retry attempts should be tracked with retry reason metadata',
)

const degradedStateIndex = source.indexOf('const degradedState = retryReason')
const retryAttemptsIndex = source.indexOf('const retryAttemptsUsed = bridgeRetryScopeRef.current.attempts || 0')
assert.ok(degradedStateIndex > -1, 'retryable bridge boot failures should attempt a last-good degraded workspace recovery')
assert.ok(retryAttemptsIndex > -1, 'retryable bridge boot failures should still keep bounded retry bookkeeping')
assert.ok(
  retryAttemptsIndex < degradedStateIndex,
  'last-good degraded workspace recovery should use retry bookkeeping before deciding whether to schedule recovery',
)

assert.match(
  source,
  /if \(degradedState\) \{[\s\S]*?setAuthState\(degradedState\)[\s\S]*?trackAuthMetric\('auth_boot_degraded'[\s\S]*?scheduleRetry\(\{ keepCurrentState: true \}\)[\s\S]*?return/,
  'last-good degraded workspace recovery should keep cached access while scheduling a background retry',
)

assert.match(
  source,
  /writeAuthBootBreadcrumb\([\s\S]*?keepCurrentState \? 'bridge_boot_degraded_retry_scheduled' : 'bridge_boot_retry_scheduled'/,
  'degraded background retries should write a distinct breadcrumb for support diagnostics',
)

assert.match(
  source,
  /writeAuthBootBreadcrumb\('bridge_boot_failed'[\s\S]*?reportError\(error,[\s\S]*?breadcrumbs: failureBreadcrumbs/,
  'auth boot failures should attach recent breadcrumbs to error reports',
)

assert.match(
  source,
  /trackAuthMetric\('auth_boot_failed'[\s\S]*?retryExhausted/,
  'terminal auth boot failures should emit structured telemetry',
)

const authBootSource = await readFile(new URL('../src/lib/authBoot.js', import.meta.url), 'utf8')

assert.match(
  authBootSource,
  /const AUTH_BOOT_REQUIRED_STEP_TIMEOUT_MS = 10000/,
  'required profile boot fallback should leave enough room for workspace resolution inside the bridge bootstrap cap',
)

assert.match(
  authBootSource,
  /const AUTH_BOOT_OPTIONAL_STEP_TIMEOUT_MS = 5000/,
  'optional auth boot steps should fail open quickly instead of delaying route rendering',
)

assert.match(
  authBootSource,
  /const AUTH_BOOT_HEALTH_PROBE_TIMEOUT_MS = 2500/,
  'auth boot health probe should be short enough to diagnose backend health without delaying normal boot',
)

assert.match(
  authBootSource,
  /const AUTH_BOOT_WORKSPACE_STEP_TIMEOUT_MS = 12000/,
  'workspace resolution should have a per-step timeout that fits comfortably below the bridge bootstrap cap',
)

assert.match(
  authBootSource,
  /'bootHealth\.probe'[\s\S]*?probeAuthBootHealth\(\{ user, client: supabase \}\)/,
  'bridge auth boot should run a lightweight health probe before workspace resolution',
)

assert.match(
  authBootSource,
  /attachBootHealthToWorkspaceResolution\(workspaceResolution, bootHealth\)/,
  'workspace diagnostics should carry boot health probe results for later support and telemetry',
)

assert.match(
  authBootSource,
  /label: 'workspace\.resolveCurrentWorkspace'[\s\S]*?timeoutMs: AUTH_BOOT_WORKSPACE_STEP_TIMEOUT_MS/,
  'initial workspace resolution should be bounded by the workspace step timeout',
)

console.log('auth bridge bootstrap timeout contract ok')
