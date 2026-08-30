import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const route = await readFile(new URL('../src/pages/agency/AgencyLeadListRoutePage.jsx', import.meta.url), 'utf8')

assert.match(route, /import AgentAssignmentSelect from '\.\.\/\.\.\/components\/AgentAssignmentSelect'/)
assert.match(route, /const LEAD_SOURCE_OPTIONS = Object\.freeze\(\[/)
assert.match(route, /'Property24'/)
assert.match(route, /'Show Day'/)
assert.match(route, /'Referral'/)
assert.match(route, /<select required[^>]+value=\{form\.source\}/)
assert.match(route, /LEAD_SOURCE_OPTIONS\.map/)
assert.match(route, /<AgentAssignmentSelect/)
assert.match(route, /avatarUrl:/)
assert.match(route, /isCurrentUser: true/)
assert.doesNotMatch(route, /Assigned to<select/)

console.log('agency lead create dialog control checks passed')
