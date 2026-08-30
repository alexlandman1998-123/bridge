#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const authBoot = await readFile(new URL('../src/lib/authBoot.js', import.meta.url), 'utf8')
const authContext = await readFile(new URL('../src/context/AuthSessionContext.jsx', import.meta.url), 'utf8')
const telemetry = await readFile(new URL('../src/services/observability/dashboardPerformanceTelemetry.js', import.meta.url), 'utf8')
const metrics = await readFile(new URL('../src/services/observability/performanceMetrics.js', import.meta.url), 'utf8')

assert.match(authBoot, /const completedAuthBootSteps = \[\][\s\S]*?const MAX_COMPLETED_AUTH_BOOT_STEPS = 50/)
assert.match(authBoot, /export function summarizeAuthBootStepDiagnostics\(steps = \[\]\)[\s\S]*?contextRpcDurationMs[\s\S]*?workspaceResolutionDurationMs[\s\S]*?onboardingDurationMs/)
assert.match(authBoot, /authBootstrap: \{[\s\S]*?mode: startupBootstrapMode[\s\S]*?\.\.\.authBootTiming/)

for (const field of [
  'bootstrapMode',
  'contextRpcDurationMs',
  'profileDurationMs',
  'workspaceResolutionDurationMs',
  'onboardingDurationMs',
  'usedConsolidatedStartupContext',
  'usedLegacyProfileFallback',
]) {
  assert.match(telemetry, new RegExp(`'${field}'`), `performance telemetry must allow ${field}`)
}

assert.match(authContext, /const startupTimingMetadata = \{[\s\S]*?usedConsolidatedStartupContext: authBootstrap\.mode === 'consolidated_rpc'/)
assert.match(authContext, /void persistDashboardPerformanceTrace\(bridgeTrace, \{[\s\S]*?workspaceResolutionDurationMs/)
assert.match(metrics, /'dashboard\.auth\.bridge_boot': 4000/)

console.log('auth boot performance telemetry contract ok')
