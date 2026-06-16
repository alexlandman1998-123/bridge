import assert from 'node:assert/strict'

import {
  deriveResidentialDashboardMetrics,
  formatCurrencyCompactZAR,
} from '../residentialDashboardService.js'

{
  assert.equal(formatCurrencyCompactZAR(125400000).startsWith('R'), true, 'compact ZAR formatting should produce a currency string')
}

{
  const model = deriveResidentialDashboardMetrics({
    scope: 'principal',
    mode: 'sales',
    source: {
      kpis: {
        activeTransactions: 12,
        activeListings: 8,
        pipelineValue: 125400000,
        expectedCommission: 3120000,
      },
      pipeline: {
        salesFunnel: {
          leadToOtpConversion: 42,
          stages: [
            { key: 'leads', label: 'Leads', count: 20, value: 2000000 },
            { key: 'mandates', label: 'Mandates', count: 12, value: 1200000 },
            { key: 'viewings', label: 'Viewings', count: 10, value: 1000000 },
            { key: 'offers', label: 'Offers', count: 8, value: 800000 },
            { key: 'acceptedOtps', label: 'Accepted OTPs', count: 6, value: 600000 },
          ],
        },
        topAgents: [
          { agentId: 'a-1', agentName: 'Agent One', dealCount: 4, commission: 400000, trend: 8 },
        ],
      },
      transactions: {
        flow: [
          { key: 'otp', label: 'OTP', count: 6, percentage: 50 },
          { key: 'finance', label: 'Finance', count: 3, percentage: 25 },
          { key: 'transfer', label: 'Transfer', count: 2, percentage: 17 },
          { key: 'registration', label: 'Registration', count: 1, percentage: 8 },
        ],
        totalActive: 12,
      },
      activeTransactions: [
        { id: 'tx-1', address: '12 Sample Road', status: 'Under Offer', value: 2000000, daysInStage: '4d', assignedAgent: 'Agent One' },
      ],
      attentionRows: [
        { key: 'buyer', label: 'Buyer docs outstanding', reason: 'Waiting on signature', count: 2, tone: 'red' },
      ],
      forecastRows: [
        { key: 'this_month', label: 'This Month', rawValue: 1200000, trend: 5, trendLabel: 'vs previous period' },
        { key: 'next_month', label: 'Next Month', rawValue: 900000, trend: 3, trendLabel: 'vs previous period' },
      ],
      appointments: [
        { id: 'appt-1', time: '09:00', type: 'Viewing', property: '12 Sample Road', client: 'Buyer One', agent: 'Agent One', status: 'Upcoming' },
      ],
    },
  })

  assert.equal(model.kpis[0].label, 'Active Transactions', 'principal KPI labels should use agency scope')
  assert.equal(model.kpis[1].label, 'Active Listings / Mandates', 'principal KPI labels should include listings and mandates')
  assert.equal(model.transactionFlow.stages.length, 5, 'sales flow should expose five stages')
  assert.equal(model.transactionHealth.total, 12, 'transaction health should pick up the active transaction count')
  assert.equal(model.topPerformers.hidden, false, 'principal scope should show top performers')
  assert.equal(model.appointments.title, 'Appointments', 'principal scope should title the appointments section generically')
}

{
  const model = deriveResidentialDashboardMetrics({
    scope: 'agent',
    mode: 'leasing',
    source: {
      kpis: {
        activeTransactions: 4,
        activeListings: 3,
        pipelineValue: 400000,
        expectedCommission: 25000,
      },
    },
  })

  assert.equal(model.kpis[0].label, 'My Active Transactions', 'agent KPI labels should be personal')
  assert.equal(model.transactionFlow.emptyState, true, 'leasing flow should safely render an empty state')
  assert.equal(model.transactionHealth.emptyState, true, 'leasing health should safely render an empty state')
  assert.equal(model.topPerformers.hidden, true, 'agent scope should not show top performers')
}

console.log('residentialDashboardService tests passed')
