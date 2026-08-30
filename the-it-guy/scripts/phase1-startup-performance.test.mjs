import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

const header = read('src/components/HeaderBar.jsx')
const notificationsApi = read('src/lib/headerNotificationsApi.js')
const quickCreateLauncher = read('src/components/LazyQuickCreateDropdown.jsx')
const quickCreate = read('src/components/QuickCreateDropdown.jsx')
const indexCss = read('src/index.css')
const indexHtml = read('index.html')
const adminVercel = read('../apps/admin/vercel.json')
const rootVercel = read('../vercel.json')
const dashboardMigration = read('../supabase/migrations/20260830125035_attorney_dashboard_rpc_hot_path.sql')

assert.ok(!header.includes("import QuickCreateDropdown from './QuickCreateDropdown'"), 'Header must not eagerly import Quick Create.')
assert.ok(header.includes("import LazyQuickCreateDropdown from './LazyQuickCreateDropdown'"), 'Header should use the lazy Quick Create launcher.')
assert.ok(header.includes('requestIdleCallback(beginBackgroundRefresh'), 'Notifications should wait for browser idle time on startup.')
assert.ok(header.includes('userId: notificationUserId'), 'Header should reuse the resolved user identity for notifications.')

assert.ok(quickCreateLauncher.includes("lazy(() => import('./QuickCreateDropdown'))"), 'Quick Create workflow should load dynamically.')
assert.ok(quickCreateLauncher.includes('initialOpen'), 'Quick Create should open as soon as its deferred module arrives.')
assert.ok(quickCreate.includes("initialOpen = false"), 'Quick Create should support deferred first-open state.')

assert.ok(notificationsApi.includes('userId: suppliedUserId = null'), 'Notification API should accept the user identity already resolved by the app shell.')
assert.ok(notificationsApi.includes("String(suppliedUserId || '').trim() || await currentUserId()"), 'Notification API should only call Auth when the shell does not have a user identity.')

assert.ok(!indexCss.includes("@import url('https://fonts.googleapis.com"), 'Global CSS must not block rendering on a remote font import.')
assert.ok(indexHtml.includes('rel="preconnect" href="https://fonts.googleapis.com"'), 'App HTML should preconnect to the font stylesheet host.')
assert.ok(indexHtml.includes('rel="preconnect" href="https://fonts.gstatic.com" crossorigin'), 'App HTML should preconnect to the font file host.')

for (const [name, source] of [['admin', adminVercel], ['marketing', rootVercel]]) {
  const config = JSON.parse(source)
  const assetHeader = config.headers?.find((entry) => entry.source === '/assets/:path*')
  assert.ok(assetHeader, `${name} deployment should define a cache policy for versioned assets.`)
  assert.equal(assetHeader.headers?.[0]?.value, 'public, max-age=31536000, immutable', `${name} assets should be immutable for one year.`)
}

assert.ok(dashboardMigration.includes("set search_path = ''"), 'The dashboard SECURITY DEFINER function must use an empty search path.')
assert.ok(dashboardMigration.includes('revoke all on function public.get_attorney_dashboard_snapshot'), 'The dashboard function must not inherit public execution.')

console.log('phase 1 startup performance contract ok')
