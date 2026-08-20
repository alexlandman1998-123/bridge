import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/202608130006_admin_dashboard_operational_counts.sql', import.meta.url),
  'utf8',
)
const unitsAsListingsMigration = await readFile(
  new URL('../supabase/migrations/20260820174624_admin_dashboard_units_as_listings.sql', import.meta.url),
  'utf8',
)
const adminApp = await readFile(new URL('../apps/admin/src/App.jsx', import.meta.url), 'utf8')

assert.match(migration, /^begin;/)
assert.match(migration, /commit;\s*$/)
assert.match(migration, /v_active_transactions integer := 0;/)
assert.match(migration, /'activeTransactions', v_active_transactions/)
assert.match(migration, /'activeTransactions', v_active_transaction_rows/)
assert.match(migration, /'activeTransactions', v_active_transaction_rows,\s*'pipeline'/)
assert.match(migration, /grant execute on function public\.arch9_admin_dashboard_snapshot\(timestamptz, timestamptz\) to authenticated/)
assert.doesNotMatch(migration, /grant\s+[^;]*\s+to\s+anon/i)

assert.match(adminApp, /activeTransactions: \[\]/)
assert.match(adminApp, /activeTransactions: 0/)
assert.match(adminApp, /const activeTransactionRows = snapshot\?\.activeTransactions \|\| snapshot\?\.drilldowns\?\.activeTransactions \|\| \[\]/)
assert.match(adminApp, /drilldown: 'activeTransactions'/)
assert.match(adminApp, /const MOCK_ORGANISATION_NAMES = new Set/)
assert.match(adminApp, /'bridge9_realty'/)
assert.match(adminApp, /email\.endsWith\('\.test'\)/)
assert.match(adminApp, /fetchAdminRows\('organisation_users'\)/)
assert.match(adminApp, /fetchAdminRows\('organisations'\)/)
assert.match(adminApp, /fetchAdminRows\('developments'\)/)
assert.match(adminApp, /fetchAdminRows\('units'\)/)
assert.match(adminApp, /function isActiveUnitListingRow/)
assert.match(adminApp, /const activeListings = \[\.\.\.privateListingRows, \.\.\.unitListingRows\]/)
assert.match(adminApp, /sanitizeAdminDashboardSnapshot/)

assert.match(unitsAsListingsMigration, /^begin;/)
assert.match(unitsAsListingsMigration, /commit;\s*$/)
assert.match(unitsAsListingsMigration, /v_units jsonb := ''\[\]''::jsonb/)
assert.match(unitsAsListingsMigration, /public\.units/)
assert.match(unitsAsListingsMigration, /development units as listing inventory/)
assert.match(unitsAsListingsMigration, /notify pgrst, 'reload schema'/)

console.log('admin dashboard operational counts contract checks passed')
