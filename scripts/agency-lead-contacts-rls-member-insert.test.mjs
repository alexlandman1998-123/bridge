import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/202608130005_agency_lead_contacts_member_insert_rls_repair.sql', import.meta.url),
  'utf8',
)

function policyBody(policyName) {
  const match = migration.match(new RegExp(`create policy ${policyName}[\\s\\S]*?(?=\\n\\n(?:drop policy|grant|notify|commit))`, 'i'))
  assert.ok(match, `${policyName} policy is missing`)
  return match[0]
}

assert.match(migration, /^begin;/)
assert.match(migration, /commit;\s*$/)
assert.doesNotMatch(migration, /grant\s+[^;]*\s+to\s+anon/i)

const contactsPolicy = policyBody('contacts_agency_write')
assert.match(contactsPolicy, /for all to authenticated/)
assert.match(contactsPolicy, /not exists \([\s\S]*lead\.lead_domain = 'attorney'/)
assert.match(contactsPolicy, /public\.bridge_can_access_assignment\(organisation_id, assigned_agent_id, null\)/)
assert.match(contactsPolicy, /with check \([\s\S]*public\.bridge_is_active_member\(organisation_id\)/)
assert.doesNotMatch(
  contactsPolicy.match(/with check \([\s\S]*?\n\);/)?.[0] || '',
  /bridge_membership_role\(organisation_id\) = 'agent'[\s\S]*assigned_agent_id = auth\.uid\(\)/,
)

const leadsPolicy = policyBody('leads_agency_write')
assert.match(leadsPolicy, /coalesce\(lead_domain, 'agency'\) <> 'attorney'/)
assert.match(leadsPolicy, /public\.bridge_can_access_assignment\(organisation_id, assigned_agent_id, null\)/)
assert.match(leadsPolicy, /with check \([\s\S]*public\.bridge_is_active_member\(organisation_id\)/)
assert.doesNotMatch(
  leadsPolicy.match(/with check \([\s\S]*?\n\);/)?.[0] || '',
  /bridge_membership_role\(organisation_id\) = 'agent'[\s\S]*assigned_agent_id = auth\.uid\(\)/,
)

assert.match(migration, /notify pgrst, 'reload schema'/)

console.log('agency Lead Contact member insert RLS repair checks passed')
