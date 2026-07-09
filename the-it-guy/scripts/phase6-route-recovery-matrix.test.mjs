import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

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
    pathname: '/client/bad-token/documents',
    search: '?email=client@example.com&token=secret',
    hash: '#unsafe',
  },
  innerWidth: 390,
  innerHeight: 844,
  localStorage: createLocalStorageMock(),
}

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    onLine: true,
    userAgent: 'Phase6RouteRecovery/1.0',
    language: 'en-ZA',
    clipboard: {
      async writeText(value) {
        globalThis.__copiedRouteRecoveryPacket = value
      },
    },
  },
})

const {
  UX_DIAGNOSTICS_STORAGE_KEY,
  buildSafeRoute,
  buildUxDiagnosticSnapshot,
  copyUxDiagnosticSnapshot,
  storeUxDiagnosticSnapshot,
} = await import('../src/services/observability/uxDiagnostics.js')

const tokenRouteGateSource = read('../src/components/routing/TokenRouteGate.jsx')
const appSource = read('../src/App.jsx')
const packageJson = JSON.parse(read('../package.json'))

assert.match(tokenRouteGateSource, /UxDiagnosticsActions/, 'TokenRouteGate should expose diagnostics for invalid secure links')
assert.match(tokenRouteGateSource, /invalid_token_route/, 'invalid token route diagnostics should use a stable category')
assert.match(tokenRouteGateSource, /Help Centre/, 'invalid token routes should offer a support path')
assert.match(tokenRouteGateSource, /metadata=\{\{ routeParam: paramKey, title \}\}/, 'invalid token diagnostics should avoid storing raw token values')

const routeContracts = [
  { route: '/client/bad', wrapper: /<Route path="\/client\/:token" element=\{<TokenRouteGate>/ },
  { route: '/client/bad/documents', wrapper: /<Route path="\/client\/:token\/documents" element=\{<TokenRouteGate>/ },
  { route: '/external/bad', wrapper: /<TokenRouteGate paramKey="accessToken"/ },
  { route: '/partner-portal/bad', wrapper: /<Route path="\/partner-portal\/:token" element=\{<TokenRouteGate>/ },
  { route: '/commercial/portal/bad', wrapper: /<Route path="\/commercial\/portal\/:token" element=\{<TokenRouteGate>/ },
  { route: '/transaction-invite/bad', wrapper: /<Route path="\/transaction-invite\/:token" element=\{<TokenRouteGate>/ },
  { route: '/invite/bad', wrapper: /<Route path="\/invite\/:token" element=\{<TokenRouteGate>/ },
  { route: '/status/bad', wrapper: /<Route path="\/status\/:token" element=\{<TokenRouteGate>/ },
]

for (const contract of routeContracts) {
  assert.match(appSource, contract.wrapper, `Route ${contract.route} should remain wrapped in TokenRouteGate`)
}

assert.equal(
  buildSafeRoute({
    pathname: '/client/bad-token/documents',
    search: '?email=client@example.com&token=secret',
    hash: '#unsafe',
  }),
  '/client/[redacted]/documents?email=[redacted]&token=[redacted]#[redacted]',
  'route recovery diagnostics should redact token-like path, query, and hash data',
)

const snapshot = storeUxDiagnosticSnapshot(buildUxDiagnosticSnapshot({
  source: 'token_route_gate:token',
  category: 'invalid_token_route',
  severity: 'high',
  message: 'Invalid access link',
  metadata: {
    routeParam: 'token',
    title: 'Invalid access link',
    token: 'must-not-persist',
  },
}))

assert.equal(snapshot.source, 'token_route_gate:token')
assert.equal(snapshot.category, 'invalid_token_route')
assert.equal(snapshot.metadata.routeParam, 'token')
assert.equal(snapshot.metadata.token, '[redacted]')
assert.doesNotMatch(JSON.stringify(snapshot), /bad-token|client@example\.com|must-not-persist|#unsafe/)

await copyUxDiagnosticSnapshot(snapshot)
assert.doesNotMatch(globalThis.__copiedRouteRecoveryPacket, /bad-token|client@example\.com|must-not-persist|#unsafe/)
assert.equal(JSON.parse(window.localStorage.getItem(UX_DIAGNOSTICS_STORAGE_KEY)).length, 1)

assert.equal(
  packageJson.scripts?.['test:phase6-route-recovery-matrix'],
  'node scripts/phase6-route-recovery-matrix.test.mjs',
  'package.json should expose the Phase 6 route recovery matrix',
)

console.log('Phase 6 route recovery matrix checks passed')
