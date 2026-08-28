import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const sidebarSource = await readFile(new URL('../src/components/Sidebar.jsx', import.meta.url), 'utf8')
const cssSource = await readFile(new URL('../src/index.css', import.meta.url), 'utf8')

test('menu navigation commits router state synchronously and rejects duplicate destination clicks', () => {
  assert.match(sidebarSource, /pendingNavigationTarget === destination/)
  assert.match(sidebarSource, /navigate\(destination, \{ flushSync: true \}\)/)
  assert.match(sidebarSource, /onNavigateStart\?\.\(\{ target: destination, label \}\)/)
})

test('the clicked menu item exposes a visible and accessible pending state', () => {
  assert.match(sidebarSource, /aria-busy=\{navigationPending\}/)
  assert.match(sidebarSource, /aria-disabled=\{navigationPending\}/)
  assert.match(sidebarSource, /ui-sidebar-link-spinner/)
  assert.match(cssSource, /\.ui-sidebar-link-pending\s*\{[\s\S]*?cursor: progress;/)
})

test('stale route content is covered immediately until the destination commits', () => {
  assert.match(appSource, /ROUTE_NAVIGATION_SLOW_MS = 2500/)
  assert.match(appSource, /role="status" aria-live="polite"/)
  assert.match(appSource, /Still opening \$\{pendingRouteNavigation\.label\}/)
  assert.match(appSource, /<RouteCommitMarker routeKey=\{routeContentKey\} onCommit=\{handleRouteCommitted\} \/>/)
  assert.match(appSource, /pendingRouteNavigation \? 'invisible pointer-events-none'/)
})
