import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/202607130005_private_listing_inline_select_policy.sql'),
  'utf8',
)

function policyBody(policyName) {
  const pattern = new RegExp(
    `create policy ${policyName}[\\s\\S]+?(?=drop policy|commit;)`,
    'i',
  )
  const match = migration.match(pattern)
  assert.ok(match, `${policyName} policy should be recreated`)
  return match[0]
}

const selectPolicy = policyBody('private_listings_select_scoped')
const updatePolicy = policyBody('private_listings_update_scoped')

for (const [name, body] of [
  ['select', selectPolicy],
  ['update', updatePolicy],
]) {
  assert.match(body, /bridge_is_active_member\(organisation_id\)/, `${name} policy should use the candidate row organisation`)
  assert.match(body, /assigned_agent_id\s*=\s*auth\.uid\(\)/, `${name} policy should keep assigned-agent access`)
  assert.doesNotMatch(body, /bridge_can_access_private_listing\(id\)/, `${name} policy must not re-query private_listings by id`)
}

console.log('private listing returning RLS policy tests passed')
