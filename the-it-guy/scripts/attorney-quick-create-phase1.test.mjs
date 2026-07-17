import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/components/QuickCreateDropdown.jsx', import.meta.url), 'utf8')
const attorneyStart = source.indexOf('const ATTORNEY_QUICK_CREATE_GROUPS')
const attorneyEnd = source.indexOf('const BOND_ORIGINATOR_QUICK_CREATE_GROUPS')

assert.ok(attorneyStart >= 0, 'Attorney quick-create configuration should exist')
assert.ok(attorneyEnd > attorneyStart, 'Attorney quick-create configuration should be isolated')

const attorneySource = source.slice(attorneyStart, attorneyEnd)
const expectedActions = [
  ['attorney-matter', 'New Matter', '/attorney/leads', 'creationIntent'],
  ['attorney-lead', 'New Lead / Referral', '/attorney/leads', 'openCreateLead'],
  ['attorney-appointment', 'New Appointment', '/attorney/scheduling', 'openCreateAppointment'],
]

for (const action of expectedActions) {
  for (const token of action) {
    assert.ok(attorneySource.includes(token), `Attorney quick-create should include ${token}`)
  }
}

for (const agentOnlyType of ['listing', 'prospect', 'transaction', 'viewing', 'third-party']) {
  assert.doesNotMatch(
    attorneySource,
    new RegExp(`type:\\s*['"]${agentOnlyType}['"]`),
    `Attorney quick-create should not include agent-only ${agentOnlyType}`,
  )
}

assert.equal(
  (attorneySource.match(/type:\s*'attorney-/g) || []).length,
  3,
  'Attorney quick-create should expose exactly three actions',
)
assert.match(
  source,
  /if \(role === 'attorney'\) \{[\s\S]*?ATTORNEY_QUICK_CREATE_GROUPS[\s\S]*?if \(role === 'bond_originator'\) return BOND_ORIGINATOR_QUICK_CREATE_GROUPS/,
  'Attorney menu selection should occur before other quick-create fallbacks',
)
assert.match(source, /return location\.pathname\.startsWith\('\/commercial'\) \? COMMERCIAL_QUICK_CREATE_GROUPS : RESIDENTIAL_QUICK_CREATE_GROUPS/)

console.log('Attorney quick-create Phase 1 checks passed.')
