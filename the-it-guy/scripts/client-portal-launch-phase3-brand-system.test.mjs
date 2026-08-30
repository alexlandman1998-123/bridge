import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const [themeSource, brandMarkSource, buyerDemoSource, portalSource, appCss, contract] = await Promise.all([
  readFile(new URL('src/components/client-portal/buyerPortalTheme.js', root), 'utf8'),
  readFile(new URL('src/components/client-portal/AgencyBrandMark.jsx', root), 'utf8'),
  readFile(new URL('src/pages/ProspectBuyerDemo.jsx', root), 'utf8'),
  readFile(new URL('src/pages/ClientPortal.jsx', root), 'utf8'),
  readFile(new URL('src/App.css', root), 'utf8'),
  readFile(new URL('config/client-portal-launch-contract.json', root), 'utf8').then(JSON.parse),
])

test('agency theme owns identity tokens while semantic colours remain fixed', () => {
  for (const variable of ['--portal-primary', '--portal-secondary', '--portal-accent', '--portal-on-primary', '--portal-success', '--portal-warning', '--portal-error', '--portal-information', '--portal-focus']) {
    assert.match(themeSource, new RegExp(variable))
  }
  for (const semantic of contract.branding.systemControlledSemanticTokens) {
    assert.ok(['success', 'warning', 'error', 'information', 'focus'].includes(semantic))
  }
  assert.match(themeSource, /getPortalAccessibleForeground/)
  assert.match(themeSource, /primaryActionStyle/)
  assert.match(themeSource, /accentActionStyle/)
})

test('buyer and seller portals consume the same agency theme contract', () => {
  assert.match(buyerDemoSource, /style=\{brand\.cssVariables\}/)
  assert.match(portalSource, /sellerPortalTheme = createBuyerPortalTheme/)
  assert.match(portalSource, /style=\{effectiveWorkspace === 'seller' \? sellerPortalTheme\.cssVariables : buyerPortalTheme\.cssVariables\}/)
  assert.match(portalSource, /style=\{effectiveWorkspace === 'seller' \? sellerPortalTheme\.sidebarStyle : buyerPortalSidebarStyle\}/)
  assert.match(portalSource, /sellerTheme=\{sellerPortalTheme\}/)
  assert.match(portalSource, /sellerTheme\?\.heroOverlayStyle/)
})

test('agency logos fail safely to a branded accessible monogram', () => {
  assert.match(brandMarkSource, /onError=\{\(\) => setFailedUrl\(logoUrl\)\}/)
  assert.match(brandMarkSource, /getInitials/)
  assert.match(brandMarkSource, /aria-label=\{`\$\{name \|\| 'Agency'\} brand`\}/)
  assert.match(buyerDemoSource, /<AgencyBrandMark/)
  assert.match(portalSource, /<AgencyBrandMark name=\{sellerAgencyName/)
})

test('modern interaction layer supports focus, selection and reduced motion', () => {
  assert.match(appCss, /\.agency-client-portal/)
  assert.match(appCss, /:focus-visible/)
  assert.match(appCss, /--portal-focus/)
  assert.match(appCss, /prefers-reduced-motion: reduce/)
  assert.match(appCss, /text-rendering: optimizeLegibility/)
})

test('seller support controls meet the Phase 0 touch target', () => {
  assert.ok(contract.principles.minimumTouchTargetPx >= 44)
  assert.match(portalSource, /mailto:\$\{sellerAgentEmail\}[\s\S]{0,220}min-h-\[44px\]/)
  assert.match(portalSource, /tel:\$\{sellerAgentPhone\}[\s\S]{0,220}min-h-\[44px\]/)
})
