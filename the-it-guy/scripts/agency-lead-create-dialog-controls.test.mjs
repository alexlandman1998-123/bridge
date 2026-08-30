import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const route = await readFile(new URL('../src/pages/agency/AgencyLeadListRoutePage.jsx', import.meta.url), 'utf8')
const assignmentSelect = await readFile(new URL('../src/components/AgentAssignmentSelect.jsx', import.meta.url), 'utf8')

assert.match(route, /import AgentAssignmentSelect from '\.\.\/\.\.\/components\/AgentAssignmentSelect'/)
assert.match(route, /const LEAD_SOURCE_OPTIONS = Object\.freeze\(\[/)
assert.match(route, /'Property24'/)
assert.match(route, /'Show Day'/)
assert.match(route, /'Referral'/)
assert.match(route, /<select required[^>]+value=\{form\.source\}/)
assert.match(route, /LEAD_SOURCE_OPTIONS\.map/)
assert.match(route, /<AgentAssignmentSelect/)
assert.match(route, /<AgentAssignmentSelect\s+compact/)
assert.match(route, /max-h-\[calc\(100vh-1\.5rem\)\]/)
assert.match(route, /max-w-4xl/)
assert.match(route, /overflow-y-auto/)
assert.match(route, /<footer className="flex shrink-0/)
assert.match(route, /avatarUrl:/)
assert.match(route, /isCurrentUser: true/)
assert.doesNotMatch(route, /Assigned to<select/)
assert.match(assignmentSelect, /compact = false/)
assert.match(assignmentSelect, /min-w-0 flex-1 truncate/)
assert.match(route, /void createAgencyCrmLeadActivity/)
assert.match(route, /void loadLeads\(\{ forceRefresh: true \}\)/)

console.log('agency lead create dialog control checks passed')
