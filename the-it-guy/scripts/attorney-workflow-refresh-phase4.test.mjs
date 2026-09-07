import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile('../supabase/migrations/20260907183523_attorney_workflow_refresh_signals.sql', 'utf8')
const detailPage = await readFile('src/pages/AttorneyTransactionDetail.jsx', 'utf8')
const liveRefresh = await readFile('src/hooks/useTransactionLiveRefresh.js', 'utf8')
const clientPortal = await readFile('src/pages/ClientPortal.jsx', 'utf8')
const unitDetail = await readFile('src/pages/UnitDetail.jsx', 'utf8')

assert.match(migration, /create or replace function public\.bridge_emit_attorney_workflow_refresh_signal\(\)/i)
assert.match(migration, /security definer/i)
assert.match(migration, /set search_path = ''/i)
assert.match(migration, /revoke all on function public\.bridge_emit_attorney_workflow_refresh_signal\(\) from public/i)
assert.match(migration, /insert into public\.transaction_refresh_signals/i)
assert.match(migration, /version = public\.transaction_refresh_signals\.version \+ 1/i)
assert.match(migration, /after insert or update of status, comment, completed_at, completed_by, visibility_scope/i)
assert.match(migration, /on public\.transaction_subprocess_steps/i)

assert.match(detailPage, /const refreshCanonicalTransactionSnapshot = useCallback/i)
assert.match(detailPage, /invalidateTransactionWorkspaceCoreCache\(normalizedTransactionId\)/i)
assert.match(detailPage, /fetchTransactionRouteCoreById\(normalizedTransactionId\)/i)
assert.match(detailPage, /requestTransactionRollup\(normalizedTransactionId, \{ force: true \}\)/i)
assert.match(detailPage, /refreshTransactionDatasets\(\['workflow', 'activity'\], \{ reason: `live:\$\{reason\}` \}\)/i)
assert.match(detailPage, /new CustomEvent\('itg:transaction-updated'/i)
assert.match(detailPage, /source: 'attorney_workflow_atomic_update'/i)

assert.match(liveRefresh, /table: 'transaction_refresh_signals'/i)
assert.match(liveRefresh, /transaction_version_changed/i)
assert.match(clientPortal, /useTransactionLiveRefresh\(/i)
assert.match(unitDetail, /useTransactionLiveRefresh\(/i)

console.log('Attorney workflow atomic refresh propagation checks passed.')
