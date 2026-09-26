import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/pages/AttorneyDashboardPage.jsx', import.meta.url), 'utf8')
const service = readFileSync(new URL('../src/services/attorneyDashboard.js', import.meta.url), 'utf8')
const hook = readFileSync(new URL('../src/hooks/useAttorneyDashboardLiveRefresh.js', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../supabase/migrations/20260926143000_attorney_dashboard_assignment_refresh_phase2.sql', import.meta.url), 'utf8')

assert.match(service, /import \{ buildMatterListProgress \} from '\.\/attorneyMatterProgress\.js'/)
assert.match(service, /buildMatterListProgress\([\s\S]*lane\?\.transaction_subprocess_steps \|\| \[\]/)
assert.doesNotMatch(service, /getCanonicalLegalWorkflowProgressPercent/)

assert.match(page, /useAttorneyDashboardLiveRefresh\(\{/)
assert.match(page, /onRefresh: \(\) => loadDashboard\(\{ background: true \}\)/)
assert.match(page, /if \(!background\) setLoading\(true\)/)
assert.match(page, /if \(!background\) setDashboard\(EMPTY_DASHBOARD\)/)

assert.match(hook, /table: 'transaction_refresh_signals'/)
assert.match(hook, /window\.setInterval\(\(\) => schedule\('dashboard_poll', true\)/)
assert.match(hook, /window\.addEventListener\('focus', recover\)/)
assert.match(hook, /window\.addEventListener\('itg:transaction-updated', onLocalTransactionUpdate\)/)
assert.match(hook, /supabase\.removeChannel\(channel\)/)
assert.match(hook, /queue\.stop\(\)/)

assert.match(migration, /create or replace function public\.bridge_emit_attorney_assignment_refresh_signal\(\)/i)
assert.match(migration, /security definer/i)
assert.match(migration, /set search_path = ''/i)
assert.match(migration, /revoke all on function public\.bridge_emit_attorney_assignment_refresh_signal\(\) from public/i)
assert.match(migration, /insert into public\.transaction_refresh_signals/i)
assert.match(migration, /version = public\.transaction_refresh_signals\.version \+ 1/i)
assert.match(migration, /after insert or update of firm_id,[\s\S]*status or delete/i)
assert.match(migration, /on public\.transaction_attorney_assignments/i)

console.log('Attorney dashboard live progress Phase 2 checks passed.')
