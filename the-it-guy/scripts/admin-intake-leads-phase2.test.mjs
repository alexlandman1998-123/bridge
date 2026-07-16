import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const [page, service, api, roles, sidebar, app] = await Promise.all([
  read('src/pages/PlatformLeadsPage.jsx'),
  read('src/services/adminIntakeLeadService.js'),
  read('server/services/publicDemoEnquiriesApi.js'),
  read('src/lib/roles.js'),
  read('src/components/Sidebar.jsx'),
  read('src/App.jsx'),
])

assert.match(roles, /key: 'platform_operations'[\s\S]*key: 'platform_leads'[\s\S]*to: '\/platform\/leads'/, 'Leads must live under Operations')
assert.match(sidebar, /platform_leads: ClipboardList/, 'Leads navigation needs an icon')
assert.match(app, /path="\/platform\/leads"[\s\S]*<PlatformLeadsPage/, 'The canonical Leads route must be registered')
assert.match(app, /path="\/platform\/demo-enquiries"[\s\S]*<PlatformLeadsPage/, 'The legacy demo enquiry route must remain compatible')

for (const filter of ['search', 'stage', 'priority', 'assignment', 'intakeKind', 'sort']) {
  assert.match(page, new RegExp(`${filter}:`), `Missing page filter: ${filter}`)
}
assert.match(page, /<LeadSummaryCards/, 'The Leads workspace needs queue metrics')
assert.match(page, /<LeadTable/, 'The Leads workspace needs the intake table')
assert.match(page, /<LeadDetailPanel/, 'The Leads workspace needs row drill-down')
assert.match(page, /Page \{page\} of/, 'The Leads workspace needs pagination')
assert.match(page, /role="alert"/, 'API failures must be announced accessibly')

assert.match(service, /\/api\/admin\/demo-enquiries\?/, 'The client must use the authenticated admin endpoint')
assert.match(service, /Authorization: `Bearer \$\{accessToken\}`/, 'The client must forward the authenticated session')
assert.match(service, /pageCount/, 'The client contract must include pagination metadata')
assert.match(service, /summary:/, 'The client contract must include operational counts')

assert.match(api, /const ADMIN_LEAD_SELECT = \[/, 'The API must use an explicit lead projection')
assert.doesNotMatch(api, /from\(DEMO_ENQUIRIES_TABLE\)[\s\S]{0,120}\.select\('\*', \{ count: 'exact' \}\)/, 'The list endpoint must not expose the entire lead row')
assert.match(api, /\.eq\('sales_stage', stage\)/, 'Stage filtering must use the canonical sales stage')
assert.match(api, /\.range\(offset, offset \+ limit - 1\)/, 'Pagination must be performed in the database')
assert.match(api, /unassigned: unassignedResult\.count/, 'The API must return the unassigned queue count')
assert.match(api, /overdue: overdueResult\.count/, 'The API must return the overdue queue count')

console.log('Admin intake Leads Phase 2 passed')

