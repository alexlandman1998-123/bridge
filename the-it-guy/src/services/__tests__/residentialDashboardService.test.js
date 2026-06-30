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
        newLeads: 5,
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
        dashboardFlow: [
          { key: 'buyer_onboarding', label: 'Buyer Onboarding', count: 2, value: 18000000, percentage: 14 },
          { key: 'otp_signed', label: 'OTP Signed', count: 6, value: 56200000, percentage: 45 },
          { key: 'finance', label: 'Finance', count: 2, value: 24000000, percentage: 19 },
          { key: 'transfer', label: 'Transfer', count: 1, value: 15200000, percentage: 12 },
          { key: 'ready_for_registration', label: 'Ready For Registration', count: 1, value: 12000000, percentage: 10 },
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
  assert.equal(model.kpis.length, 5, 'principal dashboard should expose five KPI cards')
  assert.equal(model.kpis[4].label, 'New Leads', 'principal dashboard should include agency-wide new leads')
  assert.equal(model.kpis[4].value, '5', 'principal new leads KPI should use the provided lead count')
  assert.equal(model.transactionFlow.stages.length, 5, 'sales flow should expose five stages')
  assert.equal(model.transactionFlow.stages[0].label, 'Buyer Onboarding', 'transaction flow should start with buyer onboarding')
  assert.equal(model.transactionFlow.buyerOnboarding.count, 2, 'buyer onboarding stage should preserve count')
  assert.equal(model.transactionFlow.otpSigned.formattedValue.startsWith('R'), true, 'transaction flow should format stage values')
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
  assert.equal(model.kpis[4].label, 'My New Leads', 'agent KPI labels should keep personal lead scope')
  assert.equal(model.transactionFlow.emptyState, true, 'leasing flow should safely render an empty state')
  assert.equal(model.transactionHealth.emptyState, true, 'leasing health should safely render an empty state')
  assert.equal(model.topPerformers.hidden, true, 'agent scope should not show top performers')
}

{
  const model = deriveResidentialDashboardMetrics({
    scope: 'principal',
    mode: 'sales',
    source: {
      activeTransactions: [
        {
          id: 'tx-dev-1',
          development: { id: 'dev-1', name: 'Junoah Estate' },
          unit: { id: 'unit-1', development_id: 'dev-1' },
          buyer: { name: 'Client Buyer' },
          transaction: {
            id: 'tx-dev-1',
            transaction_type: 'developer_sale',
            reservation_required: true,
            reservation_status: 'paid',
            onboarding_status: 'Complete',
          },
        },
      ],
    },
  })

  assert.equal(model.activeTransactions.rows[0].nextAction, 'Review reservation proof of payment', 'developer dashboard rows should use developer readiness next actions')
  assert.equal(model.activeTransactions.rows[0].health.key, 'waiting', 'developer reservation review should surface as waiting health')
}

{
  const model = deriveResidentialDashboardMetrics({
    scope: 'principal',
    mode: 'sales',
    source: {
      activeTransactions: [
        {
          development: { id: 'dev-1', name: 'Junoah Estate' },
          unit: { id: 'unit-1', development_id: 'dev-1', price: 2500000 },
          buyer: { name: 'Buyer One' },
          transaction: {
            id: 'tx-dev-dep',
            transaction_type: 'developer_sale',
            current_main_stage: 'DEP',
            purchase_price: 2500000,
          },
        },
        {
          development: { id: 'dev-1', name: 'Junoah Estate' },
          unit: { id: 'unit-2', development_id: 'dev-1', price: 3000000 },
          buyer: { name: 'Buyer Two' },
          transaction: {
            id: 'tx-dev-fin',
            transaction_type: 'developer_sale',
            current_main_stage: 'FIN',
            purchase_price: 3000000,
          },
        },
        {
          development: { id: 'dev-1', name: 'Junoah Estate' },
          unit: { id: 'unit-3', development_id: 'dev-1', price: 4000000 },
          buyer: { name: 'Buyer Three' },
          transaction: {
            id: 'tx-dev-xfer',
            transaction_type: 'developer_sale',
            current_main_stage: 'XFER',
            purchase_price: 4000000,
          },
        },
      ],
    },
  })

  assert.equal(model.transactionFlow.summaryLabel, 'Development Pipeline Overview', 'developer-heavy active rows should use development flow context')
  assert.equal(model.transactionFlow.buyerOnboarding.label, 'Reservation / Buyer Setup', 'developer first flow stage should include reservation setup')
  assert.equal(model.transactionFlow.buyerOnboarding.count, 1, 'developer DEP rows should bucket into reservation setup')
  assert.equal(model.transactionFlow.finance.count, 1, 'developer FIN rows should bucket into finance')
  assert.equal(model.transactionFlow.transfer.count, 1, 'developer XFER rows should bucket into transfer')
  assert.equal(model.transactionFlow.pipelineValue, 9500000, 'developer flow should include nested transaction and unit values')
}

console.log('residentialDashboardService tests passed')
