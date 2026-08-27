import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const clientPortalSource = readFileSync(
  new URL('../src/pages/ClientPortal.jsx', import.meta.url),
  'utf8',
)
const prospectDemoSource = readFileSync(
  new URL('../src/pages/ProspectBuyerDemo.jsx', import.meta.url),
  'utf8',
)
const appSource = readFileSync(
  new URL('../src/App.jsx', import.meta.url),
  'utf8',
)

test('buyer and seller portal routes remain protected by the shared error boundary', () => {
  assert.match(appSource, /path="\/client\/:token\/buying"[\s\S]*?<ClientPortal \/>/)
  assert.match(appSource, /path="\/client\/:token\/selling"[\s\S]*?<ClientPortal \/>/)
})

test('production client portal normalizes absent listing data before seller compliance projection', () => {
  assert.match(clientPortalSource, /listing: portal\?\.listing \|\| \{\}/)
  assert.match(clientPortalSource, /const activeSellingContext =[\s\S]*?\|\| null/)
})

test('prospect demo does not render fallback branding for an unresolved or stale slug', () => {
  assert.match(prospectDemoSource, /const \[loadedConfigToken, setLoadedConfigToken\] = useState\(''\)/)
  assert.match(prospectDemoSource, /setLoadedConfigToken\(token\)/)
  assert.match(prospectDemoSource, /if \(loading \|\| loadedConfigToken !== token\) return <ProspectBuyerDemoLoading \/>/)
  assert.match(prospectDemoSource, /role="status" aria-live="polite">Loading buyer portal/)
})
