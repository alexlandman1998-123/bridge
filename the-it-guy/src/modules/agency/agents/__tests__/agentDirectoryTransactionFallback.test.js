import { expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ client: null }))
vi.mock('../../../../lib/api/dashboardOverviewApi.js', async original => ({ ...(await original()), requireClient: () => api.client }))
vi.mock('../../../../services/matterPropertyContext.js', () => ({ hydrateMatterPropertyContext: async (_client, rows) => rows }))
import { fetchTransactionsListSummary } from '../../../../lib/api/dashboardTransactionSummaryApi.js'
import { buildAgentPerformanceModel } from '../agentPerformanceUtils.js'

it('retains agent assignments, stage and test flags when optional image columns are unavailable', async () => {
  const records = [
    { id: 'real', organisation_id: 'org', assigned_agent_email: 'kevin@example.test', stage: 'OTP Signed', current_main_stage: 'OTP', sales_price: 1240000 },
    { id: 'test', organisation_id: 'org', assigned_user_id: 'kevin-user', is_demo_data: true, current_main_stage: 'FIN', sales_price: 1000000 },
  ]
  let reads = 0
  api.client = { from: table => {
    if (table !== 'transactions') throw new Error(`Unexpected read: ${table}`)
    const query = {
      select(columns) { query.columns = columns.split(',').map(column => column.trim()); return query },
      then(resolve) {
        reads += 1
        return Promise.resolve(reads === 1
          ? { data: null, error: { code: '42703', message: 'column transactions.property_image_url does not exist' } }
          : { data: records.map(row => Object.fromEntries(query.columns.map(column => [column, row[column] ?? null]))), error: null }).then(resolve)
      },
    }
    return query
  } }
  const rows = await fetchTransactionsListSummary({ activeTransactionsOnly: false, includeSecondaryData: false })
  expect(reads).toBe(2)
  expect(rows[0].transaction.assigned_agent_email).toBe('kevin@example.test')
  expect(rows[1].transaction.is_demo_data).toBe(true)
  const result = buildAgentPerformanceModel({ agents: [{ id: 'kevin-user', email: 'kevin@example.test' }], transactions: rows })
  expect(result.agents[0].performance.activeTransactions).toBe(1)
  expect(result.agents[0].performance.pipelineValue).toBe(1240000)
  expect(result.agents[0].performance.stageCounts.otp).toBe(1)
})
