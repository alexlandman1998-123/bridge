import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildBondApplicationFinanceReleaseReadiness,
} from '../src/modules/bond/application/workspace/index.js'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_ROOT = path.resolve(PROJECT_ROOT, '..')
const identityMigration = fs.readFileSync(
  path.join(REPOSITORY_ROOT, 'supabase/migrations/202608280001_agent_bond_application_identity.sql'),
  'utf8',
)
const workspaceMigration = fs.readFileSync(
  path.join(REPOSITORY_ROOT, 'supabase/migrations/20260828195452_agent_bond_application_workspace_view.sql'),
  'utf8',
)

for (const [name, migration] of [
  ['bridge_agent_bond_application_identity', identityMigration],
  ['bridge_agent_bond_application_workspace_view', workspaceMigration],
]) {
  assert.match(migration, new RegExp(`security definer[\\s\\S]*set search_path = public`, 'i'))
  assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\(uuid, uuid\\) from public`, 'i'))
  assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\(uuid, uuid\\) from anon`, 'i'))
  assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(uuid, uuid\\) to authenticated`, 'i'))
  assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(uuid, uuid\\) to service_role`, 'i'))
  assert.doesNotMatch(migration, /auth\.role\(/)
}

const apiSource = fs.readFileSync(path.join(PROJECT_ROOT, 'src/lib/api.js'), 'utf8')
assert.match(apiSource, /client\.rpc\('bridge_agent_bond_application_identity'/)
assert.match(apiSource, /client\.rpc\('bridge_agent_bond_application_workspace_view'/)

const readiness = buildBondApplicationFinanceReleaseReadiness({
  identity_contract: true,
  workspace_contract: true,
  agent_safe_contract: true,
  journey_ui: true,
  where_we_are_ui: true,
  refresh_resilience: true,
  regression_suite: true,
  production_build: true,
  remote_rpc: true,
  requireRemoteRpc: true,
})
assert.equal(readiness.decision, 'GO')
assert.equal(readiness.blockingChecks.length, 0)
assert.equal(readiness.warningChecks.length, 0)
assert.match(readiness.summary, /all local and remote release checks pass/i)

const packageJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'))
assert.ok(packageJson.scripts['test:bond-application-finance-phase6'])
assert.match(packageJson.scripts['verify:bond-application-finance'], /test:bond-application-finance-phase6/)

console.log('bond application Finance phase 6 cutover checks passed')
