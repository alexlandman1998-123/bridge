import assert from 'node:assert/strict'
import test from 'node:test'
import { saveAttorneyMatterNumber, savedAttorneyMatterNumber } from '../attorneyMatterNumberService.js'

function clientReturning(result, calls) {
  return {
    from(table) {
      calls.push(['from', table])
      return {
        update(values) {
          calls.push(['update', values])
          return {
            eq(column, value) {
              calls.push(['eq', column, value])
              return {
                select(columns) {
                  calls.push(['select', columns])
                  return { single: async () => result }
                },
              }
            },
          }
        },
      }
    },
  }
}

test('saves a firm reference to the shared transaction and confirms the returned row', async () => {
  const calls = []
  const client = clientReturning({ data: { matter_number: 'TUCK/2026/417' }, error: null }, calls)
  assert.equal(await saveAttorneyMatterNumber(client, 'transaction-1', '  TUCK/2026/417  '), 'TUCK/2026/417')
  assert.deepEqual(calls, [
    ['from', 'transactions'],
    ['update', { matter_number: 'TUCK/2026/417' }],
    ['eq', 'id', 'transaction-1'],
    ['select', 'matter_number'],
  ])
  assert.equal(savedAttorneyMatterNumber({ matter_number: 'TUCK/2026/417' }), 'TUCK/2026/417')
})

test('does not report success when the transaction cannot be updated', async () => {
  await assert.rejects(
    saveAttorneyMatterNumber(clientReturning({ data: null, error: Object.assign(new Error('No row'), { code: 'PGRST116' }) }, []), 'transaction-1', 'A-1'),
    /No row/,
  )
  await assert.rejects(
    saveAttorneyMatterNumber(clientReturning({ data: null, error: null }, []), 'transaction-1', 'A-1'),
    /could not be confirmed/,
  )
  await assert.rejects(
    saveAttorneyMatterNumber(clientReturning({ data: null, error: { code: '23505' } }, []), 'transaction-1', 'A-1'),
    /already used by another matter/,
  )
})
