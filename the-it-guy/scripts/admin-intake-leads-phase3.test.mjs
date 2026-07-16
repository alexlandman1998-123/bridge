import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const [api, service, page, detail, table] = await Promise.all([
  read('server/services/publicDemoEnquiriesApi.js'),
  read('src/services/adminIntakeLeadService.js'),
  read('src/pages/PlatformLeadsPage.jsx'),
  read('src/components/platform/leads/LeadDetailPanel.jsx'),
  read('src/components/platform/leads/LeadTable.jsx'),
])

for (const field of ['salesStage', 'priority', 'assignedToUserId', 'nextAction', 'nextActionAt', 'lostReason', 'internalNotes']) {
  assert.match(api, new RegExp(`'${field}'`), `Missing workflow write field: ${field}`)
}
assert.match(api, /unknownFields[\s\S]*ADMIN_LEAD_PATCH_FIELDS/, 'The API must reject fields outside the workflow whitelist')
assert.match(api, /stage === 'lost'[\s\S]*lostReason/, 'Lost leads must require a reason')
assert.match(api, /createAuthenticatedClient\(getBearerToken\(headers\)\)/, 'Workflow writes must retain the authenticated user')
assert.match(api, /rpc\('arch9_admin_update_demo_enquiry_v1'/, 'Workflow writes must use the audited database RPC')
assert.doesNotMatch(api, /if \(normalizedMethod === 'PATCH'\)[\s\S]*?\.from\(DEMO_ENQUIRIES_TABLE\)[\s\S]*?\.update\(/, 'The API must not bypass the audited RPC with a direct lead update')
assert.match(api, /listAdminLeadAssignees\(serviceClient, user\.id\)/, 'The list response must include eligible internal owners')

assert.match(service, /export async function updateAdminIntakeLead/, 'The client needs a workflow update method')
assert.match(service, /JSON\.stringify\(\{ id: leadId, patch \}\)/, 'The client must send a bounded patch object')
assert.match(service, /assignees: Array\.isArray\(data\.assignees\)/, 'The client must normalize the assignee directory')

assert.match(page, /saveLeadWorkflow/, 'The page must coordinate workflow saves')
assert.match(page, /activity audit/, 'Successful audited updates must be confirmed to the operator')
assert.match(page, /role="status"/, 'Save confirmation must be accessible')
assert.match(detail, /Save lead workflow/, 'The detail panel must expose an explicit save action')
assert.match(detail, /type="datetime-local"/, 'The detail panel must schedule next actions')
assert.match(detail, /Visible to Arch9 staff only/, 'Internal notes must be clearly marked private')
assert.match(detail, /draft\.salesStage === 'lost'/, 'The UI must enforce the lost-reason requirement')
assert.match(table, /owner\?\.name \|\| 'Assigned'/, 'The table should display the assigned staff member')

console.log('Admin intake Leads Phase 3 passed')

