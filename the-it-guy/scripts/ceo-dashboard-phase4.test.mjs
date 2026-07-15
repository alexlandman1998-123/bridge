import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../../', import.meta.url)
const [app, data, css, phase1] = await Promise.all([
  readFile(new URL('apps/admin/src/App.jsx', root), 'utf8'),
  readFile(new URL('apps/admin/src/lib/adminData.js', root), 'utf8'),
  readFile(new URL('apps/admin/src/styles/admin.css', root), 'utf8'),
  readFile(new URL('supabase/migrations/202607150014_ceo_dashboard_phase1.sql', root), 'utf8'),
])

assert.match(phase1, /arch9_admin_set_revenue_target_v1/, 'Phase 4 requires the audited Phase 1 target RPC')
assert.match(phase1, /ceo_revenue_target_updated/, 'Revenue target changes must be audited')
assert.match(data, /supabase\.rpc\('arch9_admin_set_revenue_target_v1'/, 'Client must set targets through the guarded RPC')
assert.match(data, /p_target_amount_cents: Math\.round\(amount \* 100\)/, 'Target input must convert rand to integer cents')
assert.doesNotMatch(data, /from\('platform_revenue_targets'\)\.(insert|update|upsert)/, 'Browser must not write revenue targets directly')

for (const text of ['Set monthly target', 'Monthly revenue target', 'Target amount', 'Executive note', 'Save target']) {
  assert.ok(app.includes(text), `Revenue target workflow is missing: ${text}`)
}
assert.match(app, /await setCeoRevenueTarget/, 'Target dialog must persist through the data layer')
assert.match(app, /await onSaved\(\)/, 'Target dialog must refresh the CEO dashboard after save')
assert.match(app, /Changes are recorded in the platform audit trail/, 'Target dialog must communicate audit behavior')

for (const route of ['/admin/platform-health', '/admin/transactions', '/admin/revenue', '/admin/organisations']) {
  assert.ok(app.includes(route), `Executive navigation is missing route: ${route}`)
}
assert.match(app, /attentionContextFromPath/, 'Attention query context must survive dashboard navigation')
assert.match(app, /Opened from the CEO dashboard attention queue/, 'Destination views must show attention context')
assert.match(app, /handleOpenOrganisation/, 'Top organisations must drill into the organisation workspace')

assert.match(css, /\.revenue-target-dialog/, 'Revenue target dialog styles are missing')
assert.match(css, /\.executive-attention-context/, 'Attention navigation context styles are missing')
assert.match(css, /\.ceo-metric-action/, 'Revenue target card action styles are missing')

console.log('CEO dashboard Phase 4 contract passed')
