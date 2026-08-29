import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BOND_APPLICATION_FINANCE_MONITOR_VERSION,
  buildBondApplicationFinanceOperationalStatus,
} from '../src/modules/bond/application/workspace/index.js'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_ROOT = path.resolve(PROJECT_ROOT, '..')

const healthy = buildBondApplicationFinanceOperationalStatus({
  version: BOND_APPLICATION_FINANCE_MONITOR_VERSION,
  totalEvents: 100,
  fallbackCount: 2,
  refreshFailureCount: 3,
  identityInvalidCount: 0,
})
assert.equal(healthy.status, 'HEALTHY')
assert.equal(healthy.rollbackRecommended, false)

const noTraffic = buildBondApplicationFinanceOperationalStatus({
  version: BOND_APPLICATION_FINANCE_MONITOR_VERSION,
  totalEvents: 0,
})
assert.equal(noTraffic.status, 'NO_TRAFFIC')
assert.equal(noTraffic.healthy, true)

const degraded = buildBondApplicationFinanceOperationalStatus({
  version: BOND_APPLICATION_FINANCE_MONITOR_VERSION,
  totalEvents: 20,
  fallbackCount: 1,
  refreshFailureCount: 2,
})
assert.equal(degraded.status, 'DEGRADED')
assert.equal(degraded.rollbackRecommended, false)

const blocked = buildBondApplicationFinanceOperationalStatus({
  version: BOND_APPLICATION_FINANCE_MONITOR_VERSION,
  totalEvents: 10,
  identityInvalidCount: 1,
})
assert.equal(blocked.status, 'BLOCKED')
assert.equal(blocked.rollbackRecommended, true)

const unavailable = buildBondApplicationFinanceOperationalStatus({}, { rpcAvailable: false })
assert.equal(unavailable.status, 'BLOCKED')

const migrationFile = fs.readdirSync(path.join(REPOSITORY_ROOT, 'supabase/migrations'))
  .find((name) => name.endsWith('_bond_application_finance_phase7_monitoring.sql'))
assert.ok(migrationFile)
const migration = fs.readFileSync(path.join(REPOSITORY_ROOT, 'supabase/migrations', migrationFile), 'utf8')
assert.match(migration, /security invoker/i)
assert.match(migration, /set search_path = ''/i)
assert.match(migration, /from public\.telemetry_events/i)
assert.match(migration, /from anon/i)
assert.match(migration, /from authenticated/i)
assert.match(migration, /grant execute .* to service_role/i)
assert.doesNotMatch(migration, /user_id|workspace_id|route/i)

const monitorScript = fs.readFileSync(path.join(PROJECT_ROOT, 'scripts/monitor-bond-application-finance-phase7.mjs'), 'utf8')
assert.match(monitorScript, /SUPABASE_SERVICE_ROLE_KEY/)
assert.doesNotMatch(monitorScript, /serviceRoleKey\s*=\s*['"][^'"]+['"]/)

console.log('bond application Finance phase 7 monitoring checks passed')
