import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const route = await readFile(new URL('../src/pages/agency/AgencyLeadListRoutePage.jsx', import.meta.url), 'utf8')
const dialog = await readFile(new URL('../src/components/leads/LeadCreateDialog.jsx', import.meta.url), 'utf8')
const assignmentSelect = await readFile(new URL('../src/components/AgentAssignmentSelect.jsx', import.meta.url), 'utf8')

assert.match(route, /import LeadCreateDialog from '\.\.\/\.\.\/components\/leads\/LeadCreateDialog'/)
assert.match(dialog, /import AgentAssignmentSelect from '\.\.\/AgentAssignmentSelect'/)
assert.match(dialog, /const LEAD_CREATE_SOURCE_OPTIONS = Object\.freeze\(\[/)
assert.match(dialog, /'Property24'/)
assert.match(dialog, /'Show Day'/)
assert.match(dialog, /'Referral'/)
assert.match(dialog, /value=\{form\[sourceField\]/)
assert.match(dialog, /LEAD_CREATE_SOURCE_OPTIONS\.map/)
assert.match(dialog, /<AgentAssignmentSelect/)
assert.match(dialog, /<AgentAssignmentSelect\s+compact/)
assert.match(dialog, /max-w-4xl/)
assert.match(route, /avatarUrl:/)
assert.match(route, /isCurrentUser: true/)
assert.doesNotMatch(route, /Assigned to<select/)
assert.match(assignmentSelect, /compact = false/)
assert.match(assignmentSelect, /min-w-0 flex-1 truncate/)
assert.match(route, /void createAgencyCrmLeadActivity/)
assert.match(route, /void loadLeads\(\{ forceRefresh: true \}\)/)

console.log('agency lead create dialog control checks passed')
