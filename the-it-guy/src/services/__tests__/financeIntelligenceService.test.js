import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import {
  buildExecutiveReportModel,
  buildOperationalHeatmapModel,
  buildReadinessFunnel,
  buildReadinessOutcomeCalibration,
  calculateApprovalProbability,
  calculateBankEfficiency,
  calculateOperationalRisk,
  calculateTransactionVelocity,
  FINANCE_INTELLIGENCE_DISCLAIMER,
  generateFinanceInsights,
  getActualFinanceOutcome,
  getCachedFinanceIntelligence,
  getReadinessOutcomeCalibrationForRow,
  isPredictiveCopySafe,
} from '../financeIntelligenceService.js'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function makeRow(overrides = {}) {
  return {
    transaction: {
      id: 'tx-fin-intel-1',
      finance_type: 'bond',
      stage: 'Submitted',
      current_main_stage: 'FIN',
      bank: 'FNB',
      purchase_price: 1800000,
      deposit_amount: 180000,
      assigned_agent: 'Maya Pillay',
      bond_originator: 'Sarah Finance',
      created_at: '2026-05-01T08:00:00.000Z',
      updated_at: '2026-05-06T08:00:00.000Z',
      ...overrides.transaction,
    },
    buyer: { name: 'Alex Buyer' },
    development: { name: 'Waterkloof Ridge' },
    onboardingFormData: {
      finance_readiness: {
        affordability_inputs: {
          monthlyIncome: 85000,
          monthlyDebt: 9000,
          monthlyExpenses: 23000,
          deposit: 180000,
          employmentDurationMonths: 30,
          documentReadiness: 0.85,
          onboardingCompleteness: 0.9,
        },
      },
      bond_application: { submitted_at: '2026-05-03T08:00:00.000Z' },
      ...overrides.onboardingFormData,
    },
    documentSummary: { totalRequired: 4, uploadedCount: 3, missingCount: 1, ...overrides.documentSummary },
    documentRequests: overrides.documentRequests || [{ id: 'payslip', status: 'uploaded', created_at: '2026-05-01T08:00:00.000Z' }],
    documents: overrides.documents || [{ document_request_id: 'payslip', status: 'uploaded', uploaded_at: '2026-05-02T08:00:00.000Z' }],
    transactionEvents: overrides.transactionEvents || [],
  }
}

const rows = [
  makeRow(),
  makeRow({
    transaction: { id: 'tx-fin-intel-2', bank: 'ABSA', updated_at: '2026-05-18T08:00:00.000Z' },
    documentSummary: { totalRequired: 5, uploadedCount: 1, missingCount: 4 },
    onboardingFormData: { finance_readiness: { affordability_inputs: { monthlyIncome: 30000, monthlyDebt: 18000 } } },
  }),
  makeRow({
    transaction: { id: 'tx-fin-intel-3', bank: 'FNB', stage: 'Bond Approved', current_main_stage: 'Approval' },
    documentSummary: { totalRequired: 3, uploadedCount: 3, missingCount: 0 },
  }),
]

test('approval confidence calculations produce safe bands', () => {
  const result = calculateApprovalProbability(rows[0])
  assert.ok(result.score > 0)
  assert.match(result.probabilityBand, /Probability|Confidence|Attention|Data/)
})

test('operational risk calculations detect missing documents', () => {
  const result = calculateOperationalRisk(rows[1])
  assert.ok(result.riskScore > 0)
  assert.ok(result.bottlenecks.some((item) => /document/i.test(item)))
})

test('velocity calculations include timelines', () => {
  const result = calculateTransactionVelocity(rows[0])
  assert.ok(result.expectedCompletionDays > 0)
  assert.ok(result.expectedApprovalDays > 0)
  assert.ok(result.delayProbability >= 0)
})

test('funnel conversion logic returns staged percentages', () => {
  const funnel = buildReadinessFunnel(rows)
  assert.equal(funnel[0].key, 'lead')
  assert.ok(funnel.every((stage) => Number.isFinite(stage.conversionRate)))
})

test('bank efficiency calculations aggregate lenders', () => {
  const efficiency = calculateBankEfficiency(rows)
  assert.ok(efficiency.some((item) => item.bank === 'FNB'))
  assert.ok(efficiency.every((item) => Number.isFinite(item.approvalRate)))
})

test('phase 5 calibration compares readiness bands with finance outcomes', () => {
  const calibration = buildReadinessOutcomeCalibration([
    rows[0],
    makeRow({ transaction: { id: 'tx-cal-approved', stage: 'Bond Approved', current_main_stage: 'Approved' } }),
    makeRow({
      transaction: { id: 'tx-cal-declined', stage: 'Declined', current_main_stage: 'Declined' },
      onboardingFormData: {
        finance_readiness: {
          affordability_inputs: {
            monthlyIncome: 90000,
            monthlyDebt: 6000,
            monthlyExpenses: 18000,
            deposit: 260000,
            employmentDurationMonths: 48,
            documentReadiness: 1,
            onboardingCompleteness: 1,
          },
        },
      },
    }),
    makeRow({
      transaction: { id: 'tx-cal-low-approved', stage: 'Approved', current_main_stage: 'Approved' },
      documentSummary: { totalRequired: 4, uploadedCount: 0, missingCount: 4 },
      onboardingFormData: {
        finance_readiness: {
          affordability_inputs: {
            monthlyIncome: 0,
            monthlyDebt: 0,
            monthlyExpenses: 0,
            deposit: 0,
            employmentDurationMonths: 0,
            documentReadiness: 0,
            onboardingCompleteness: 0,
          },
        },
      },
    }),
  ])
  assert.ok(calibration.terminalOutcomes >= 3)
  assert.ok(calibration.bands.length > 0)
  assert.ok(calibration.strongDeclines >= 1)
  assert.ok(calibration.lowScoreApprovals >= 1)
  assert.equal(isPredictiveCopySafe(calibration.disclaimer), true)
})

test('phase 5 row calibration identifies overstated and underestimated signals', () => {
  const overstated = getReadinessOutcomeCalibrationForRow(makeRow({
    transaction: { id: 'tx-overstated', stage: 'Declined', current_main_stage: 'Declined' },
    onboardingFormData: {
      finance_readiness: {
        affordability_inputs: {
          monthlyIncome: 90000,
          monthlyDebt: 6000,
          monthlyExpenses: 18000,
          deposit: 260000,
          employmentDurationMonths: 48,
          documentReadiness: 1,
          onboardingCompleteness: 1,
        },
      },
    },
  }))
  const underestimated = getReadinessOutcomeCalibrationForRow(makeRow({
    transaction: { id: 'tx-underestimated', stage: 'Approved', current_main_stage: 'Approved' },
    documentSummary: { totalRequired: 4, uploadedCount: 0, missingCount: 4 },
    onboardingFormData: {
      finance_readiness: {
        affordability_inputs: {
          monthlyIncome: 0,
          monthlyDebt: 0,
          monthlyExpenses: 0,
          deposit: 0,
          employmentDurationMonths: 0,
          documentReadiness: 0,
          onboardingCompleteness: 0,
        },
      },
    },
  }))
  assert.equal(getActualFinanceOutcome({ transaction: { stage: 'Declined' } }).key, 'declined')
  assert.equal(overstated.label, 'Readiness Overstated')
  assert.equal(underestimated.label, 'Readiness Underestimated')
})

test('readiness distribution and cached analytics survive large datasets', () => {
  const largeRows = Array.from({ length: 650 }, (_, index) => makeRow({ transaction: { id: `tx-large-${index}`, bank: index % 2 ? 'FNB' : 'ABSA' } }))
  const analytics = getCachedFinanceIntelligence(largeRows, 'large-fixture')
  assert.equal(analytics.readinessFunnel[0].count, 650)
  assert.ok(analytics.bankEfficiency.length >= 2)
  assert.ok(analytics.readinessOutcomeCalibration.bands.length >= 1)
})

test('predictive helpers survive incomplete data', () => {
  const insights = generateFinanceInsights({ transaction: { id: 'empty' } })
  assert.ok(Array.isArray(insights.recommendations))
})

test('no guaranteed approval wording is allowed', () => {
  assert.equal(isPredictiveCopySafe(FINANCE_INTELLIGENCE_DISCLAIMER), true)
  assert.equal(isPredictiveCopySafe('This file is guaranteed and will be approved by bank'), false)
})

test('executive report generation includes required models', () => {
  const report = buildExecutiveReportModel(rows, { title: 'Executive Pipeline Report' })
  assert.equal(report.title, 'Executive Pipeline Report')
  assert.ok(report.charts.bankEfficiency.length)
  assert.ok(report.charts.readinessOutcomeCalibration.bands.length)
  assert.ok(report.futureAiHooks.approvalPredictionModelInput)
  assert.ok(report.futureAiHooks.readinessCalibrationInput)
})

test('sorting by confidence and risk works with generated fields', () => {
  const byConfidence = rows.map((row) => ({ row, score: calculateApprovalProbability(row).score })).sort((a, b) => b.score - a.score)
  const byRisk = rows.map((row) => ({ row, score: calculateOperationalRisk(row).riskScore })).sort((a, b) => b.score - a.score)
  assert.ok(byConfidence[0].score >= byConfidence[1].score)
  assert.ok(byRisk[0].score >= byRisk[1].score)
})

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
  ssr: { noExternal: ['react-router', 'react-router-dom'] },
})

try {
  const heatmapModule = await server.ssrLoadModule('/src/components/analytics/OperationalHeatmap.jsx')
  const Heatmap = heatmapModule.default
  const heatmapMarkup = renderToStaticMarkup(React.createElement(Heatmap, {
    rows: buildOperationalHeatmapModel(rows, { groupBy: 'bank' }),
  }))

  test('heatmap rendering outputs operational cells', () => {
    assert.match(heatmapMarkup, /FNB|ABSA/)
    assert.match(heatmapMarkup, /risk/)
  })

  try {
    const dashboardModule = await server.ssrLoadModule('/src/components/bond/BondDashboard.jsx')
    const { MemoryRouter } = await server.ssrLoadModule('react-router-dom')
    const Dashboard = dashboardModule.default
    const dashboardMarkup = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(Dashboard, {
        workspaceId: 'workspace-1',
        user: { profile: { id: 'user-1' } },
        initialState: {
          loading: false,
          error: '',
          snapshot: {
            totalApplications: 3,
            heroKpis: [],
            headerSummary: { text: '3 active applications' },
            activeApplications: [],
            bankBreakdown: [],
            bankLeadTimes: [],
            pipelineFlow: [],
            buyerDemographics: {},
            approvalConfidenceDistribution: [
              { key: 'high', label: 'High confidence', count: 1, color: '#2f8a63' },
            ],
            readinessFunnel: buildReadinessFunnel(rows),
            bankEfficiency: calculateBankEfficiency(rows),
            buyerQualityDistribution: { high: 1, moderate: 1, atRisk: 1, incomplete: 0 },
            operationalRiskMatrix: [],
            operationalRisk: [],
            recentBankActivity: [],
            teamPerformance: [],
            connectedPartners: [],
            operationalHeatmap: buildOperationalHeatmapModel(rows, { groupBy: 'bank' }),
          },
        },
      })),
    )

    test('dashboard analytics rendering includes intelligence sections and disclaimer', () => {
      assert.match(dashboardMarkup, /Approval Confidence Distribution/)
      assert.match(dashboardMarkup, /Bank Efficiency Layer/)
      assert.match(dashboardMarkup, /Final financial approval remains subject to lender assessment/)
    })
  } catch (error) {
    if (!/require is not defined|ERR_AMBIGUOUS_MODULE_SYNTAX/i.test(String(error?.message || error))) {
      throw error
    }
    console.log('skip - dashboard analytics render check requires React Router SSR compatibility')
  }
} finally {
  await server.close()
}
