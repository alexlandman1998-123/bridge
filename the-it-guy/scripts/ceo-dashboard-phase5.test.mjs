import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../../', import.meta.url)
const [app, data, css] = await Promise.all([
  readFile(new URL('apps/admin/src/App.jsx', root), 'utf8'),
  readFile(new URL('apps/admin/src/lib/adminData.js', root), 'utf8'),
  readFile(new URL('apps/admin/src/styles/admin.css', root), 'utf8'),
])

const lightweightLoader = data.match(/export async function loadCeoDashboardSnapshot[\s\S]*?\n}\n/)?.[0] || ''
assert.match(lightweightLoader, /arch9_admin_ceo_dashboard_v1/, 'Lightweight refresh must use the aggregate CEO RPC')
assert.doesNotMatch(lightweightLoader, /tryTable|\.from\(/, 'Lightweight refresh must not reload legacy admin tables')
assert.match(app, /loadCeoDashboardSnapshot\(dateRange\)/, 'Automatic refresh must use the lightweight loader')
assert.match(app, /window\.setInterval\(refreshCeoDashboard, 90000\)/, 'CEO dashboard must refresh on a bounded interval')
assert.match(app, /document\.addEventListener\('visibilitychange'/, 'Dashboard must recover when the tab becomes visible')
assert.match(app, /window\.addEventListener\('online'/, 'Dashboard must recover when connectivity returns')
assert.match(app, /navigator\.onLine \|\| document\.hidden/, 'Background or offline tabs must not poll')
assert.match(app, /refreshInFlight\.current/, 'Concurrent dashboard refreshes must be suppressed')
assert.match(app, /Showing the last successful update/, 'Failed refreshes must preserve the last successful snapshot')

assert.match(data, /export function buildCeoDashboardCsv/, 'Phase 5 must provide a deterministic executive CSV builder')
for (const section of ['Overview', 'Business pulse', 'Attention', 'New business', 'Top organisations']) {
  assert.ok(data.includes(section), `CSV report is missing section: ${section}`)
}
assert.match(data, /replace\(\/"\/g, '\"\"'\)/, 'CSV values must escape quotes')
assert.match(app, /Export report/, 'CEO toolbar must expose report export')
assert.match(app, /text\/csv;charset=utf-8/, 'Export must use the CSV content type')
assert.match(app, /URL\.revokeObjectURL/, 'Export must release its object URL')

assert.match(app, /Data may be stale/, 'Dashboard must expose stale-data status')
assert.match(app, /Offline · showing last update/, 'Dashboard must expose offline status')
assert.match(css, /span\.stale/, 'Stale status styling is missing')
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, 'Dashboard must respect reduced-motion preferences')
assert.match(css, /@media print/, 'Dashboard must provide print-safe executive output')

console.log('CEO dashboard Phase 5 contract passed')
