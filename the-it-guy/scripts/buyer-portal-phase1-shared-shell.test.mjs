import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const clientPortalSource = await readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const demoPortalSource = await readFile(new URL('../src/pages/ProspectBuyerDemo.jsx', import.meta.url), 'utf8')
const sharedSidebarSource = await readFile(new URL('../src/components/client-portal/BuyerPortalDesktopSidebar.jsx', import.meta.url), 'utf8')

test('demo and production use the canonical buyer portal theme contract', () => {
  assert.match(clientPortalSource, /createBuyerPortalTheme/)
  assert.match(demoPortalSource, /createBuyerPortalTheme/)
  assert.doesNotMatch(clientPortalSource, /function normalizePortalBrandColour/)
  assert.doesNotMatch(demoPortalSource, /function normalizeHex/)
})
test('demo and production share buyer navigation and support primitives', () => {
  assert.match(demoPortalSource, /<BuyerPortalDesktopSidebar/)
  assert.match(clientPortalSource, /<BuyerPortalNavigationItem/)
  assert.match(clientPortalSource, /<BuyerPortalSupportPanel/)
  assert.match(sharedSidebarSource, /data-buyer-portal-shell="desktop-sidebar"/)
})

test('production keeps its canonical routes, data source, and workspace boundary', () => {
  assert.match(clientPortalSource, /getClientPortalWorkspaceData/)
  assert.match(clientPortalSource, /effectiveWorkspace === 'seller'/)
  assert.match(clientPortalSource, /getPortalNavigationPath\(token, workspaceNavigationScope, item\)/)
  assert.match(clientPortalSource, /data-buyer-portal-shell=\{effectiveWorkspace === 'seller' \? undefined : 'desktop-sidebar'\}/)
})
