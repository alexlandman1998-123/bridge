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
    pathname: '/client/super-secret-client-token/documents',
    search: '?email=client@example.com&tab=documents',
    hash: '#raw-token-fragment',
  },
  innerWidth: 1440,
  innerHeight: 900,
  localStorage: createLocalStorageMock(),
  addEventListener() {},
  removeEventListener() {},
  confirm: () => true,
}

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    onLine: true,
    userAgent: 'Phase5DiagnosticsTest/1.0',
    language: 'en-ZA',
    clipboard: {
      async writeText(value) {
        globalThis.__copiedUxDiagnosticBundle = value
      },
    },
  },
})

const {
  buildSafeRoute,
  buildUxDiagnosticBundle,
  buildUxDiagnosticSnapshot,
  clearStoredUxDiagnosticSnapshots,
  copyUxDiagnosticBundle,
  getStoredUxDiagnosticSnapshots,
  removeStoredUxDiagnosticSnapshot,
  storeUxDiagnosticSnapshot,
  summarizeUxDiagnosticSnapshots,
  UX_DIAGNOSTICS_HISTORY_LIMIT,
} = await import('../src/services/observability/uxDiagnostics.js')

assert.equal(
  buildSafeRoute({
    pathname: '/client/super-secret-client-token/documents',
    search: '?email=client@example.com&tab=documents',
    hash: '#raw-token-fragment',
  }),
  '/client/[redacted]/documents?email=[redacted]&tab=documents#[redacted]',
  'client portal tokens should be redacted from path, query, and hash',
)
assert.equal(buildSafeRoute({ pathname: '/client/onboarding/onboarding-token' }), '/client/onboarding/[redacted]')
assert.equal(buildSafeRoute({ pathname: '/external/external-access-token' }), '/external/[redacted]')
assert.equal(buildSafeRoute({ pathname: '/agent/invite/invite-token' }), '/agent/invite/[redacted]')
assert.equal(buildSafeRoute({ pathname: '/offers/session/offer-session-token' }), '/offers/session/[redacted]')

const criticalSnapshot = buildUxDiagnosticSnapshot({
  source: 'phase5-test',
  category: 'ux_friction',
  severity: 'critical',
  message: 'Client portal broke on a token route.',
  metadata: {
    token: 'must-not-persist',
    parties: [
      { email: 'client@example.com', action: 'open_documents' },
      { phone: '+27820000000', action: 'retry' },
    ],
  },
})
const mediumSnapshot = buildUxDiagnosticSnapshot({
  source: 'phase5-test-secondary',
  severity: 'medium',
  message: 'Secondary packet.',
})

assert.equal(criticalSnapshot.route, '/client/[redacted]/documents?email=[redacted]&tab=documents#[redacted]')
assert.equal(criticalSnapshot.metadata.token, '[redacted]')
assert.equal(criticalSnapshot.metadata.parties[0].email, '[redacted]')
assert.equal(criticalSnapshot.metadata.parties[0].action, 'open_documents')
assert.equal(criticalSnapshot.metadata.parties[1].phone, '[redacted]')

storeUxDiagnosticSnapshot(criticalSnapshot)
storeUxDiagnosticSnapshot(mediumSnapshot)
const stored = getStoredUxDiagnosticSnapshots()
assert.equal(stored.length, 2, 'diagnostic history should store multiple local packets')
assert.equal(UX_DIAGNOSTICS_HISTORY_LIMIT, 20, 'diagnostic history should retain a bounded number of packets')

const summary = summarizeUxDiagnosticSnapshots(stored)
assert.equal(summary.total, 2)
assert.equal(summary.hasCritical, true)
assert.equal(summary.severityCounts.critical, 1)
assert.equal(summary.latestReference, mediumSnapshot.reference)

const bundle = buildUxDiagnosticBundle(stored)
assert.equal(bundle.type, 'arch9_ux_diagnostics_bundle')
assert.equal(bundle.snapshots.length, 2)
assert.equal(bundle.summary.total, 2)

const copyResult = await copyUxDiagnosticBundle(stored)
assert.equal(copyResult.copied, true)
assert.match(globalThis.__copiedUxDiagnosticBundle, /arch9_ux_diagnostics_bundle/)
assert.doesNotMatch(globalThis.__copiedUxDiagnosticBundle, /super-secret-client-token|client@example\.com|raw-token-fragment|must-not-persist|\+27820000000/)

const afterRemove = removeStoredUxDiagnosticSnapshot(mediumSnapshot.reference)
assert.equal(afterRemove.length, 1, 'individual diagnostics should be removable')
assert.equal(afterRemove[0].reference, criticalSnapshot.reference)
assert.equal(clearStoredUxDiagnosticSnapshots().length, 0, 'diagnostic history should be clearable')
assert.equal(getStoredUxDiagnosticSnapshots().length, 0)

const historyPanelSource = readFileSync(new URL('../src/components/feedback/UxDiagnosticsHistoryPanel.jsx', import.meta.url), 'utf8')
const settingsSupportSource = readFileSync(new URL('../src/pages/settings/SettingsSupportPage.jsx', import.meta.url), 'utf8')
const platformDiagnosticsSource = readFileSync(new URL('../src/pages/PlatformDiagnosticsPage.jsx', import.meta.url), 'utf8')
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8')

assert.match(historyPanelSource, /data-ux-diagnostics-history/, 'history panel should expose a stable browser marker')
assert.match(historyPanelSource, /Copy all/, 'history panel should allow bundle copying')
assert.match(historyPanelSource, /Clear/, 'history panel should allow local history clearing')
assert.match(settingsSupportSource, /UxDiagnosticsHistoryPanel/, 'settings support should expose local diagnostics history')
assert.match(platformDiagnosticsSource, /UX friction reports/, 'platform diagnostics should expose UX friction reports')
assert.match(packageJson, /test:phase5-ux-diagnostics-close-loop/, 'package.json should expose the phase 5 diagnostics check')

console.log('Phase 5 UX diagnostics close-loop checks passed')
