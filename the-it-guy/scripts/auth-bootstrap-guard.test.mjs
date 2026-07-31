import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

function readSource(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8')
}

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} is missing: ${needle}`)
}

const authSession = readSource('src', 'context', 'AuthSessionContext.jsx')
const app = readSource('src', 'App.jsx')

assertIncludes(authSession, 'BRIDGE_AUTH_BOOTSTRAP_TIMEOUT_MS = 25000', 'Bridge auth hard timeout')
assertIncludes(authSession, 'BRIDGE_AUTH_BOOTSTRAP_SLOW_MS = 10000', 'Bridge auth slow warning')
assertIncludes(authSession, 'createBootstrapTimeoutError', 'Typed auth bootstrap timeout error')
assertIncludes(authSession, "error.code = phase === 'bridge' ? 'bridge_auth_bootstrap_timeout'", 'Bridge timeout code')
assertIncludes(authSession, 'withBootstrapTimeout(\n          loadBridgeAuthState({ session, selectedWorkspaceId })', 'Bridge boot timeout wrapper')
assertIncludes(authSession, 'getDiagnostics: getActiveAuthBootStepDiagnostics', 'Auth boot step diagnostics on timeout')
assertIncludes(authSession, "trackAuthMetric(error?.code === 'bridge_auth_bootstrap_timeout' ? 'auth_boot_timeout'", 'Auth timeout telemetry')
assertIncludes(authSession, 'bootErrorCode: error?.code ||', 'Auth error code state')

assertIncludes(app, 'WORKSPACE_GATE_SLOW_MS = 10000', 'Auth gate slow state budget')
assertIncludes(app, 'Your session is valid, but workspace setup is taking too long.', 'Valid-session timeout recovery copy')
assertIncludes(app, 'Retry will re-run profile, workspace, and onboarding checks', 'Retry without sign-out copy')
assertIncludes(app, 'const retryBootstrap = onRetryBootstrap || retryWorkspaceBootstrap', 'Single retry bootstrap handler')

console.log('auth bootstrap guard checks passed')
