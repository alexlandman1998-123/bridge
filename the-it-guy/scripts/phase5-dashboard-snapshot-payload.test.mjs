import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const serviceSource = readFileSync(new URL('../src/services/attorneyDashboard.js', import.meta.url), 'utf8')
const migrationSource = readFileSync(new URL('../../supabase/migrations/20260830125035_attorney_dashboard_rpc_hot_path.sql', import.meta.url), 'utf8')

assert.match(serviceSource, /p_detail_limit: 50/, 'The first dashboard view should request only its bounded working set.')
assert.match(serviceSource, /clearanceCertificates: Number\(kpis\.clearance_certificates \|\| 0\)/)
assert.match(serviceSource, /invoicesOverdue: Number\(kpis\.invoices_overdue \|\| 0\)/)
assert.match(serviceSource, /stalledMatters: Number\(kpis\.stalled_matters \|\| 0\)/)
assert.match(serviceSource, /kpis\.clearanceCertificates \?\? uniqueMatters/)
assert.match(serviceSource, /kpis\.invoicesOverdue \?\? uniqueMatters/)
assert.match(serviceSource, /kpis\.stalledMatters \?\? uniqueMatters/)
assert.match(migrationSource, /as clearance_certificates/)
assert.match(migrationSource, /as invoices_overdue/)
assert.match(migrationSource, /as stalled_matters/)

console.log('phase 5 dashboard snapshot payload contract ok')
