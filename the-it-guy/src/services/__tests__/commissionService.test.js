import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const {
  buildCommissionTrackerFromRows,
  calculateCommissionAmounts,
  getCommissionStatusBucket,
} = await server.ssrLoadModule('/src/services/commissionService.js')

const now = new Date('2026-07-05T12:00:00+02:00')

const amounts = calculateCommissionAmounts({
  transaction: {
    purchase_price: 1000000,
    gross_commission_percentage: 7.5,
  },
  commissionRow: {
    agent_split_percentage_snapshot: 60,
    agency_split_percentage_snapshot: 40,
  },
  referralPayout: 5000,
})

assert.equal(amounts.grossAmount, 75000)
assert.equal(amounts.agentCommission, 45000)
assert.equal(amounts.agencyCommission, 30000)
assert.equal(amounts.companyCommission, 25000)

assert.equal(
  getCommissionStatusBucket({ registered_at: '2026-07-04T08:00:00Z', stage: 'Registered' }, {}),
  'due',
)
assert.equal(
  getCommissionStatusBucket({ stage: 'OTP signed' }, { status: 'confirmed' }),
  'confirmed',
)
assert.equal(
  getCommissionStatusBucket({ stage: 'Open' }, { status: 'paid' }),
  'paid',
)

const tracker = buildCommissionTrackerFromRows({
  now,
  target: { targetAmount: 100000 },
  scope: 'company',
  levels: [{ id: 'standard', name: 'Standard', agentPercentage: 60, agencyPercentage: 40, isDefault: true }],
  transactions: [
    {
      id: 'tx-registered',
      purchase_price: 1000000,
      assigned_agent: 'Ava Agent',
      assigned_agent_email: 'ava@example.test',
      gross_commission_percentage: 7.5,
      registered_at: '2026-07-04T08:00:00Z',
      stage: 'Registered',
    },
    {
      id: 'tx-confirmed',
      purchase_price: 800000,
      assigned_agent: 'Ava Agent',
      assigned_agent_email: 'ava@example.test',
      gross_commission_percentage: 5,
      expected_transfer_date: '2026-07-20T08:00:00Z',
      stage: 'OTP signed',
    },
    {
      id: 'tx-projected',
      purchase_price: 500000,
      assigned_agent: 'Ben Broker',
      assigned_agent_email: 'ben@example.test',
      gross_commission_percentage: 5,
      expected_transfer_date: '2026-08-03T08:00:00Z',
      stage: 'Open',
    },
  ],
  transactionCommissions: [
    {
      transaction_id: 'tx-registered',
      gross_commission_amount: 75000,
      agent_commission_amount: 45000,
      agency_commission_amount: 30000,
    },
    {
      transaction_id: 'tx-confirmed',
      gross_commission_amount: 40000,
      agent_commission_amount: 24000,
      agency_commission_amount: 16000,
      status: 'confirmed',
    },
    {
      transaction_id: 'tx-projected',
      gross_commission_amount: 25000,
      agent_commission_amount: 15000,
      agency_commission_amount: 10000,
      status: 'projected',
    },
  ],
})

assert.equal(tracker.dueAmount, 30000)
assert.equal(tracker.confirmedAmount, 16000)
assert.equal(tracker.projectedAmount, 10000)
assert.equal(tracker.currentAmount, 46000)
assert.equal(tracker.projectedCommission, 56000)
assert.equal(tracker.percentageAchieved, 46)
assert.equal(tracker.status, 'on_track')
assert.equal(tracker.activeDealsCount, 2)
assert.equal(tracker.topContributors[0].name, 'Ava Agent')

await server.close()

console.log('commissionService tests passed')
