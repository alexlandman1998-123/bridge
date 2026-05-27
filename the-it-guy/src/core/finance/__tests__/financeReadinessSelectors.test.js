import assert from 'node:assert/strict'
import {
  calculateAffordabilityEstimate,
  calculateFinanceReadinessScore,
  FINANCE_READINESS_DISCLAIMER,
  formatFinanceCurrency,
  getFinanceReadinessAnalytics,
  getFinanceReadinessSummary,
  isFinanceReadinessSafeCopy,
  shouldShowBondReadinessCta,
  shouldShowFinanceReadinessSection,
} from '../financeReadinessSelectors.js'
import { buildBondNewApplicationViewModel } from '../../../services/bondOperationalQueueService.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const baseInput = {
  monthlyIncome: 85000,
  monthlyDebt: 8000,
  monthlyExpenses: 22000,
  deposit: 250000,
  employmentDurationMonths: 36,
  dependants: 1,
  documentReadiness: 0.9,
  onboardingCompleteness: 0.9,
}

test('affordability estimate calculation returns conservative range', () => {
  const estimate = calculateAffordabilityEstimate(baseInput)
  assert.ok(estimate.estimatedPurchaseRangeMin > 0)
  assert.ok(estimate.estimatedPurchaseRangeMax > estimate.estimatedPurchaseRangeMin)
  assert.ok(estimate.estimatedMonthlyRepayment > 0)
  assert.notEqual(estimate.affordabilityBand, 'Incomplete')
})

test('high debt lowers readiness score', () => {
  const lowDebt = calculateFinanceReadinessScore(baseInput)
  const highDebt = calculateFinanceReadinessScore({ ...baseInput, monthlyDebt: 42000 })
  assert.ok(highDebt.score < lowDebt.score)
  assert.ok(highDebt.risks.some((risk) => /debt/i.test(risk)))
})

test('deposit improves readiness score', () => {
  const noDeposit = calculateFinanceReadinessScore({ ...baseInput, deposit: 0 })
  const strongDeposit = calculateFinanceReadinessScore({ ...baseInput, deposit: 350000 })
  assert.ok(strongDeposit.score > noDeposit.score)
})

test('missing onboarding reduces readiness score', () => {
  const complete = calculateFinanceReadinessScore(baseInput)
  const incomplete = calculateFinanceReadinessScore({ ...baseInput, documentReadiness: 0, onboardingCompleteness: 0 })
  assert.ok(incomplete.score < complete.score)
})

test('readiness labels render correctly', () => {
  assert.equal(calculateFinanceReadinessScore(baseInput).label, 'Strong')
  assert.equal(calculateFinanceReadinessScore({ monthlyIncome: 0 }).label, 'Incomplete')
})

test('risk flags render correctly', () => {
  const summary = getFinanceReadinessSummary({
    transaction: { finance_type: 'bond', purchase_price: 1800000 },
    onboardingFormData: {
      finance_readiness: {
        affordability_inputs: {
          monthlyIncome: 30000,
          monthlyDebt: 16000,
          monthlyExpenses: 14000,
          deposit: 0,
          employmentDurationMonths: 2,
        },
      },
    },
  })
  assert.ok(summary.riskFlags.some((risk) => /debt|deposit|employment|buffer/i.test(risk)))
})

test('cash buyers do not see bond readiness CTA', () => {
  assert.equal(shouldShowBondReadinessCta({ finance_type: 'cash' }), false)
})

test('bond buyers see finance readiness section', () => {
  assert.equal(shouldShowFinanceReadinessSection({ finance_type: 'bond' }), true)
})

test('hybrid buyers see finance readiness section', () => {
  assert.equal(shouldShowFinanceReadinessSection({ finance_type: 'hybrid' }), true)
})

test('readiness summary survives missing data', () => {
  const summary = getFinanceReadinessSummary({})
  assert.equal(summary.readinessScore.label, 'Incomplete')
  assert.ok(Array.isArray(summary.missingItems))
})

test('estimated repayment displays correctly', () => {
  const estimate = calculateAffordabilityEstimate(baseInput)
  assert.match(formatFinanceCurrency(estimate.estimatedMonthlyRepayment), /^R/)
})

test('disclaimer text renders and stays copy-safe', () => {
  assert.match(FINANCE_READINESS_DISCLAIMER, /do not constitute financial approval or credit advice/i)
  assert.equal(isFinanceReadinessSafeCopy(FINANCE_READINESS_DISCLAIMER), true)
  assert.equal(isFinanceReadinessSafeCopy('Guaranteed pre-approved by bank'), false)
})

test('raw internal IDs never render in bond intake view model labels', () => {
  const item = buildBondNewApplicationViewModel({
    transaction: {
      id: '11111111-1111-4111-8111-111111111111',
      finance_type: 'bond',
      buyer_name: 'Alex Buyer',
      preferred_bond_originator_name: '22222222-2222-4222-8222-222222222222',
      bond_originator: 'system@bridge.internal',
    },
  })
  assert.equal(item.preferredOriginatorName, 'Unassigned originator')
})

test('existing lead page finance summary does not break without a transaction', () => {
  const summary = getFinanceReadinessSummary({
    transaction: { finance_type: 'bond' },
    onboardingFormData: {},
  })
  assert.ok(summary.nextRecommendedAction)
  assert.ok(summary.disclaimer)
})

test('finance readiness integrates with New Applications queue safely', () => {
  const item = buildBondNewApplicationViewModel({
    transaction: {
      id: 'tx-queue-1',
      finance_type: 'bond',
      buyer_name: 'Queue Buyer',
      purchase_price: 2100000,
    },
    onboardingFormData: {
      finance_readiness: {
        affordability_inputs: baseInput,
      },
    },
    documentRequests: [{ id: 'income-doc', category: 'finance', title: 'Payslip', status: 'uploaded' }],
    documents: [{ document_request_id: 'income-doc', status: 'uploaded' }],
  })
  assert.ok(item.financeReadinessScore > 0)
  assert.ok(item.affordabilityEstimate.estimatedPurchaseRangeMax > 0)
})

test('analytics helpers expose future dashboard metrics', () => {
  const analytics = getFinanceReadinessAnalytics([
    { transaction: { id: 'a', finance_type: 'bond' }, onboardingFormData: { finance_readiness: { affordability_inputs: baseInput } } },
    { transaction: { id: 'b', finance_type: 'bond' }, onboardingFormData: {} },
  ])
  assert.ok(analytics.averageReadinessScore >= 0)
  assert.ok(Array.isArray(analytics.readinessHeatmapInputs))
})

