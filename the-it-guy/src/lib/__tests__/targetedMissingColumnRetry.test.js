import assert from 'node:assert/strict'
import {
  extractReportedMissingPayloadColumns,
  retryMutationWithoutReportedMissingColumns,
} from '../targetedMissingColumnRetry.js'

const canonicalPayload = {
  transaction_type: 'developer_sale',
  purchaser_type: 'company',
  finance_managed_by: 'client',
  purchase_price: 2_190_000,
  cash_amount: 2_190_000,
  sale_route: 'internal_developer_sale',
  sale_channel: 'developer_direct',
}

assert.deepEqual(
  extractReportedMissingPayloadColumns(
    {
      code: 'PGRST204',
      message: "Could not find the 'sale_channel' column of 'transactions' in the schema cache",
    },
    canonicalPayload,
  ),
  ['sale_channel'],
)

assert.deepEqual(
  extractReportedMissingPayloadColumns(
    {
      code: '42703',
      message: 'column transactions.sale_route does not exist',
      hint: 'Perhaps you meant to reference the column transactions.transaction_type.',
    },
    canonicalPayload,
  ),
  ['sale_route'],
  'a suggested column in the hint must not be treated as missing',
)

assert.deepEqual(
  extractReportedMissingPayloadColumns(
    {
      code: 'PGRST116',
      message: "Could not find the 'sale_channel' column of 'transactions' in the schema cache",
    },
    canonicalPayload,
  ),
  [],
  'singular response errors are not missing-column errors',
)

const executedPayloads = []
const retryResult = await retryMutationWithoutReportedMissingColumns({
  initialResult: {
    data: null,
    error: {
      code: 'PGRST204',
      message: "Could not find the 'sale_channel' column of 'transactions' in the schema cache",
    },
  },
  payload: canonicalPayload,
  execute: async (payload) => {
    executedPayloads.push(payload)
    if (executedPayloads.length === 1) {
      return {
        data: null,
        error: {
          code: '42703',
          message: 'column transactions.sale_route does not exist',
        },
      }
    }
    return { data: { id: 'transaction-1' }, error: null }
  },
})

assert.equal(retryResult.attempts, 2)
assert.deepEqual(retryResult.removedColumns, ['sale_channel', 'sale_route'])
assert.equal(retryResult.result.data.id, 'transaction-1')
assert.equal(executedPayloads[0].sale_channel, undefined)
assert.equal(executedPayloads[0].sale_route, 'internal_developer_sale')
assert.equal(executedPayloads[1].sale_channel, undefined)
assert.equal(executedPayloads[1].sale_route, undefined)

for (const payload of executedPayloads) {
  assert.equal(payload.transaction_type, 'developer_sale')
  assert.equal(payload.purchaser_type, 'company')
  assert.equal(payload.finance_managed_by, 'client')
  assert.equal(payload.purchase_price, 2_190_000)
  assert.equal(payload.cash_amount, 2_190_000)
}

let guardedExecutionCount = 0
const guardedResult = await retryMutationWithoutReportedMissingColumns({
  initialResult: {
    data: null,
    error: {
      code: 'PGRST204',
      message: "Could not find the 'organisation_id' column of 'transactions' in the schema cache",
    },
  },
  payload: { organisation_id: 'org-1', transaction_type: 'developer_sale' },
  canRemoveColumn: (column) => column !== 'organisation_id',
  execute: async () => {
    guardedExecutionCount += 1
    return { data: null, error: null }
  },
})

assert.equal(guardedExecutionCount, 0)
assert.deepEqual(guardedResult.removedColumns, [])
assert.equal(guardedResult.payload.organisation_id, 'org-1')

console.log('targeted missing-column retry tests passed')
