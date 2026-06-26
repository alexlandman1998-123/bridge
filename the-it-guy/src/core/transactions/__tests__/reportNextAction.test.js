import assert from 'node:assert/strict'
import { getReportNextAction } from '../reportNextAction.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('uses developer readiness action for developer sale rows', () => {
  const nextAction = getReportNextAction({
    development: { id: 'dev-1', name: 'Junoah Estate' },
    unit: { id: 'unit-1', development_id: 'dev-1' },
    buyer: { name: 'Client Buyer' },
    transaction: {
      id: 'tx-1',
      transaction_type: 'developer_sale',
      current_main_stage: 'AVAIL',
      reservation_required: true,
      reservation_status: 'paid',
      onboarding_status: 'Complete',
    },
  })

  assert.equal(nextAction, 'Review reservation proof of payment')
})

test('keeps private property fallback behaviour', () => {
  const nextAction = getReportNextAction({
    buyer: { name: 'Client Buyer' },
    transaction: {
      transaction_type: 'private_property',
      current_main_stage: 'AVAIL',
    },
  })

  assert.equal(nextAction, 'Send onboarding information sheet')
})
