import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../../', import.meta.url)
const [app, data, css] = await Promise.all([
  readFile(new URL('apps/admin/src/App.jsx', root), 'utf8'),
  readFile(new URL('apps/admin/src/lib/adminData.js', root), 'utf8'),
  readFile(new URL('apps/admin/src/styles/admin.css', root), 'utf8'),
])

assert.match(data, /arch9_admin_ceo_dashboard_v1/, 'Dashboard must use the guarded Phase 1 RPC')
assert.match(data, /p_start: range\.start\.toISOString\(\)/, 'Selected range start must reach the RPC')
assert.match(data, /p_end: range\.end\.toISOString\(\)/, 'Selected range end must reach the RPC')
assert.match(data, /Number\(payload\.version\) !== 1/, 'Client must enforce the dashboard contract version')
assert.match(data, /ceoDashboard: normalizeCeoDashboard/, 'Normalized CEO data must be part of the snapshot')

for (const label of ['Active agents', 'Active listings', 'Active transactions', 'Revenue this month']) {
  assert.ok(app.includes(label), `Missing CEO metric: ${label}`)
}

for (const section of ['New business enquiries', 'Attention required', 'Business pulse', 'Top organisations']) {
  assert.ok(app.includes(section), `Missing CEO dashboard section: ${section}`)
}

assert.match(app, /Recognised revenue unavailable/, 'Unavailable revenue must not render as a fabricated zero')
assert.match(app, /dashboard\.warnings/, 'Dashboard warnings must be visible')
assert.match(app, /aria-busy="true"/, 'Dashboard must expose its loading state')
assert.match(app, /CEO dashboard data is unavailable/, 'Dashboard must expose a recoverable error state')
assert.match(app, /role="list" tabIndex="0"/, 'Scrollable lead queue must be keyboard reachable')

assert.match(css, /\.ceo-metric-grid/, 'Phase 2 metric layout styles are missing')
assert.match(css, /\.lead-card-row[\s\S]*overflow-x: auto/, 'Lead intake must scroll horizontally')
assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.ceo-metric-grid/, 'CEO dashboard must include a mobile layout')

console.log('CEO dashboard Phase 2 contract passed')
