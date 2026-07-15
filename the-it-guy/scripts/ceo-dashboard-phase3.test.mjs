import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../../', import.meta.url)
const [migration, app, data, css] = await Promise.all([
  readFile(new URL('supabase/migrations/202607150016_ceo_dashboard_phase3.sql', root), 'utf8'),
  readFile(new URL('apps/admin/src/App.jsx', root), 'utf8'),
  readFile(new URL('apps/admin/src/lib/adminData.js', root), 'utf8'),
  readFile(new URL('apps/admin/src/styles/admin.css', root), 'utf8'),
])

assert.match(migration, /arch9_admin_ceo_lead_workflow_v1/, 'Phase 3 lead context RPC is missing')
assert.match(migration, /if not public\.bridge_is_platform_admin\(\)/, 'Lead context RPC must require platform admin access')
assert.match(migration, /security definer/, 'Lead context RPC must use the guarded security-definer pattern')
assert.match(migration, /internalNotes/, 'Lead context must return existing internal notes')
assert.match(migration, /system_role[\s\S]*department/, 'Assignees must be limited using canonical staff fields')
assert.match(migration, /revoke all on function public\.arch9_admin_ceo_lead_workflow_v1/, 'Default RPC execution must be revoked')
assert.match(migration, /grant execute[\s\S]*to authenticated/, 'Authenticated platform admins need RPC execution')

assert.match(data, /supabase\.rpc\('arch9_admin_ceo_lead_workflow_v1'/, 'Client must load lead detail through the guarded RPC')
assert.match(data, /supabase\.rpc\('arch9_admin_update_demo_enquiry_v1'/, 'Client must mutate leads through the audited RPC')
assert.doesNotMatch(data, /from\('demo_enquiries'\)\.(update|upsert|insert)/, 'Client must not write directly to demo_enquiries')
assert.match(data, /allowedKeys = new Set/, 'Client must allow-list mutation fields')

for (const field of ['Owner', 'Priority', 'Sales stage', 'Next action', 'Next action date', 'Internal notes']) {
  assert.ok(app.includes(field), `Lead workflow is missing field: ${field}`)
}
assert.match(app, /aria-modal="true"/, 'Lead workflow must be exposed as a modal dialog')
assert.match(app, /event\.key === 'Escape'/, 'Lead workflow must close with Escape')
assert.match(app, /form\.salesStage === 'lost'/, 'Lost leads must require a reason')
assert.match(app, /Object\.keys\(patch\)\.length/, 'Workflow must not send no-op mutations')
assert.match(app, /await onSaved\(\)/, 'Dashboard must refresh after a successful mutation')

assert.match(css, /\.lead-workflow-overlay/, 'Lead workflow overlay styles are missing')
assert.match(css, /\.lead-workflow-drawer/, 'Lead workflow drawer styles are missing')
assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.lead-workflow-drawer/, 'Lead workflow must be mobile responsive')

console.log('CEO dashboard Phase 3 contract passed')
