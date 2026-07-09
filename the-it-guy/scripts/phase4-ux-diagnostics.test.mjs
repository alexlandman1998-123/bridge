import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function createLocalStorageMock() {
  const entries = new Map()
  return {
    getItem: (key) => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
    clear: () => entries.clear(),
  }
}

global.window = {
  location: {
    pathname: '/mobile/leads',
    search: '?create=lead&token=super-secret&email=agent@example.com',
    hash: '#capture',
  },
  innerWidth: 390,
  innerHeight: 844,
  localStorage: createLocalStorageMock(),
}

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    onLine: false,
    userAgent: 'Phase4TestBrowser/1.0',
    language: 'en-ZA',
    clipboard: {
      async writeText(value) {
        globalThis.__copiedUxDiagnostic = value
      },
    },
  },
})

const {
  UX_DIAGNOSTICS_STORAGE_KEY,
  buildSafeRoute,
  buildUxDiagnosticSnapshot,
  copyUxDiagnosticSnapshot,
  getBrowserDiagnosticContext,
  getStoredUxDiagnosticSnapshots,
  serializeUxDiagnosticSnapshot,
  storeUxDiagnosticSnapshot,
} = await import('../src/services/observability/uxDiagnostics.js')

assert.equal(
  buildSafeRoute({
    pathname: '/agent/invite/abc',
    search: '?token=abc123&tab=review&phone=0825550101',
    hash: '#private',
  }),
  '/agent/invite/[redacted]?token=[redacted]&tab=review&phone=[redacted]#[redacted]',
  'diagnostic routes should redact sensitive query params and hash',
)

const browser = getBrowserDiagnosticContext()
assert.equal(browser.route, '/mobile/leads?create=lead&token=[redacted]&email=[redacted]#[redacted]')
assert.equal(browser.viewport, '390x844')
assert.equal(browser.online, false)
assert.equal(browser.storageAvailable, true)

const snapshot = buildUxDiagnosticSnapshot({
  source: 'phase4-test',
  category: 'ux_friction',
  severity: 'critical',
  message: 'User could not recover a workflow.',
  userRole: 'agent',
  workspaceType: 'agency',
  metadata: {
    visibleDraftCount: 1,
    email: 'should-not-persist@example.com',
    token: 'secret',
    nested: { phone: '0825550101', action: 'resume' },
  },
})

assert.match(snapshot.reference, /^UX-\d{8}-[A-Z0-9]{1,6}$/)
assert.equal(snapshot.metadata.email, '[redacted]')
assert.equal(snapshot.metadata.token, '[redacted]')
assert.equal(snapshot.metadata.nested.phone, '[redacted]')
assert.equal(snapshot.metadata.nested.action, 'resume')
assert.match(serializeUxDiagnosticSnapshot(snapshot), /"reference": "UX-/)

storeUxDiagnosticSnapshot(snapshot)
assert.equal(getStoredUxDiagnosticSnapshots().length, 1, 'diagnostic snapshot should be stored locally')
assert.equal(JSON.parse(window.localStorage.getItem(UX_DIAGNOSTICS_STORAGE_KEY)).length, 1, 'diagnostics should use the expected local storage key')

await copyUxDiagnosticSnapshot(snapshot)
assert.match(globalThis.__copiedUxDiagnostic, /"source": "phase4-test"/, 'copy should write the diagnostic JSON to clipboard')

const diagnosticsActionsSource = readFileSync(new URL('../src/components/feedback/UxDiagnosticsActions.jsx', import.meta.url), 'utf8')
const accessStateSource = readFileSync(new URL('../src/components/access/AccessState.jsx', import.meta.url), 'utf8')
const errorBoundarySource = readFileSync(new URL('../src/components/AppErrorBoundary.jsx', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const mobileCreateSource = readFileSync(new URL('../src/components/mobile-shell/MobileCreateSheet.jsx', import.meta.url), 'utf8')
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

assert.match(diagnosticsActionsSource, /data-ux-diagnostics-actions/, 'diagnostics action component should expose a stable marker')
assert.match(diagnosticsActionsSource, /Copy diagnostics/, 'diagnostics action should support copying context')
assert.match(diagnosticsActionsSource, /Report issue/, 'diagnostics action should support reporting context')
assert.match(accessStateSource, /UxDiagnosticsActions/, 'access states should expose diagnostics')
assert.match(errorBoundarySource, /UxDiagnosticsActions/, 'error boundaries should expose diagnostics')
assert.match(appSource, /slow_workspace_validation/, 'slow protected route loading should expose diagnostics')
assert.match(mobileCreateSource, /mobile_create_recovery/, 'mobile create recovery should expose diagnostics')
assert.match(packageJson, /test:phase4-ux-diagnostics/, 'package.json should expose the phase 4 diagnostics check')

console.log('Phase 4 UX diagnostics checks passed')
