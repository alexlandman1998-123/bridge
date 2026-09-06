import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (file) => readFileSync(file, 'utf8')
const transactionsApi = read('src/lib/transactionsListApi.js')
const dashboardService = read('src/services/principalDashboardService.js')
const dashboard = read('src/pages/PrincipalDashboard.jsx')
const units = read('src/pages/Units.jsx')
const agents = read('src/pages/Agents.jsx')
const leads = read('src/pages/AgentLeadsPage.jsx')

assert.match(transactionsApi, /transactions!transaction_participants_transaction_id_fkey!inner/)
assert.match(dashboardService, /code === '42501'/)
assert.match(dashboardService, /isPermissionSourceError\(error\)/)
assert.match(dashboard, /Some dashboard information is unavailable for your current access level/)
assert.match(units, /!error && !showInitialTransactionsLoading && isSupabaseConfigured/)
assert.doesNotMatch(agents, /settings\/commission-structures/)
assert.doesNotMatch(leads, /sellerProcessProfile:\s*KINGSTONS_SELLER_PROCESS_PROFILE/)

console.log('Agent Phase 1 stability checks passed.')
