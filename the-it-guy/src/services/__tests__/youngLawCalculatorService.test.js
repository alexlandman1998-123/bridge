import assert from 'node:assert/strict'
import {
  calculateDeceasedEstateCosts,
  calculateEstateDuty,
  calculateSellerNetProceeds,
  calculateYoungLawTransfer,
} from '../youngLawCalculatorService.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

test('transfer calculator uses current transfer-duty threshold', () => {
  const result = calculateYoungLawTransfer({
    purchasePrice: 1210000,
    bondAmount: 900000,
  })

  assert.equal(result.summary.transferDuty, 0)
  assert.ok(result.primaryMetric.value > 0)
})

test('transfer calculator excludes transfer duty on VAT sale path', () => {
  const result = calculateYoungLawTransfer({
    purchasePrice: 2500000,
    bondAmount: 1500000,
    transactionBasis: 'vat',
  })

  assert.equal(result.summary.transferDuty, 0)
  assert.equal(result.matterPath.isVatSale, true)
  assert.equal(result.secondaryMetrics[0].display, 'Excluded')
  assert.deepEqual(result.sources, [])
})

test('transfer calculator removes bond registration costs for cash purchase path', () => {
  const result = calculateYoungLawTransfer({
    purchasePrice: 2500000,
    financeType: 'cash',
    bondAmount: 0,
  })

  assert.equal(result.matterPath.usesBond, false)
  assert.equal(result.matterPath.financeLabel, 'Cash purchase')
  assert.equal(result.lineItems.some((item) => item.key === 'bond-professional-fee'), false)
  assert.equal(result.secondaryMetrics.some((metric) => metric.label === 'Deposit balance'), false)
  assert.ok(result.secondaryMetrics.some((metric) => metric.label === 'Purchase price'))
})

test('transfer calculator treats zero bond amount as cash path', () => {
  const result = calculateYoungLawTransfer({
    purchasePrice: 2500000,
    financeType: 'bond',
    bondAmount: 0,
  })

  assert.equal(result.input.financeType, 'cash')
  assert.equal(result.matterPath.usesBond, false)
  assert.equal(result.lineItems.some((item) => item.key === 'deeds-office-bond'), false)
})

test('seller proceeds subtracts settlement, commission and clearance costs', () => {
  const result = calculateSellerNetProceeds({
    salePrice: 2000000,
    bondSettlement: 1000000,
    agentCommissionRate: 5,
    ratesClearance: 10000,
    levyClearance: 0,
    complianceCertificates: 5000,
    bondCancellationFee: 4000,
    repairsAndMoving: 1000,
  })

  assert.equal(result.summary.commission, 100000)
  assert.equal(result.summary.netProceeds, 880000)
})

test('estate duty applies abatement before duty bands', () => {
  assert.equal(calculateEstateDuty(0), 0)
  assert.equal(calculateEstateDuty(1000000), 200000)
  assert.equal(calculateEstateDuty(31000000), 6250000)
})

test('deceased estate highlights liquidity gap when cash is short', () => {
  const result = calculateDeceasedEstateCosts({
    grossEstate: 8000000,
    liabilities: 500000,
    spouseDeduction: 0,
    cashAvailable: 100000,
    incomeAfterDeath: 0,
    propertyTransferValue: 0,
  })

  assert.equal(result.summary.dutiableEstate, 4000000)
  assert.equal(result.summary.estateDuty, 800000)
  assert.ok(result.summary.liquidityPosition < 0)
})
