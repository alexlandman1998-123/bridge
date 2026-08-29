import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BOND_APPLICATION_FINANCE_STABILIZATION_VERSION,
  buildBondApplicationFinanceStabilizationDecision,
} from '../src/modules/bond/application/workspace/index.js'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_ROOT = path.resolve(PROJECT_ROOT, '..')

const signOff = buildBondApplicationFinanceStabilizationDecision({
  version: BOND_APPLICATION_FINANCE_STABILIZATION_VERSION,
  totalEvents: 200,
  activeDays: 7,
  populatedWorkspaceEventCount: 20,
  fallbackCount: 1,
  refreshFailureCount: 2,
  identityInvalidCount: 0,
})
assert.equal(signOff.decision, 'SIGN_OFF')
assert.equal(signOff.fallbackRetirementApproved, true)

const hold = buildBondApplicationFinanceStabilizationDecision({
  version: BOND_APPLICATION_FINANCE_STABILIZATION_VERSION,
  totalEvents: 0,
  activeDays: 0,
  populatedWorkspaceEventCount: 0,
})
assert.equal(hold.decision, 'HOLD')
assert.equal(hold.fallbackRetirementApproved, false)
assert.deepEqual(hold.failedChecks.map((item) => item.key), ['event_volume', 'active_days', 'populated_workspace'])

const rollback = buildBondApplicationFinanceStabilizationDecision({
  version: BOND_APPLICATION_FINANCE_STABILIZATION_VERSION,
  totalEvents: 100,
  activeDays: 3,
  populatedWorkspaceEventCount: 5,
  identityInvalidCount: 1,
})
assert.equal(rollback.decision, 'ROLLBACK')
assert.equal(rollback.fallbackRetirementApproved, false)

const migrationFile = fs.readdirSync(path.join(REPOSITORY_ROOT, 'supabase/migrations'))
  .find((name) => name.endsWith('_bond_application_finance_phase8_stabilization.sql'))
assert.ok(migrationFile)
const migration = fs.readFileSync(path.join(REPOSITORY_ROOT, 'supabase/migrations', migrationFile), 'utf8')
assert.match(migration, /security invoker/i)
assert.match(migration, /set search_path = ''/i)
assert.match(migration, /from public\.telemetry_events/i)
assert.match(migration, /from authenticated/i)
assert.match(migration, /grant execute .* to service_role/i)
assert.doesNotMatch(migration, /user_id|workspace_id|route/i)

const workspaceSource = fs.readFileSync(
  path.join(PROJECT_ROOT, 'src/modules/bond/application/workspace/bondApplicationWorkspace.js'),
  'utf8',
)
assert.match(workspaceSource, /workspaceView\s*\?\s*'database_rpc'\s*:\s*'client_fallback'/)

console.log('bond application Finance phase 8 stabilisation checks passed')
