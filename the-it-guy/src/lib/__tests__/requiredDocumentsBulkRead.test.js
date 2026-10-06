import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(new URL('../api.js', import.meta.url), 'utf8')
const body = source.slice(
  source.indexOf('async function fetchTransactionRequiredDocumentsByTransactionIdsLegacy('),
  source.indexOf('\nfunction buildRequiredChecklistFromRows('),
)
const read = new Function(
  'isOptionalRelationKnownMissing', 'isMissingColumnError',
  'rememberMissingOptionalRelation', 'normalizeRequiredDocumentRows',
  `${body}; return fetchTransactionRequiredDocumentsByTransactionIdsLegacy`,
)(() => false, (error, column) => error?.missing === column, () => false, rows => rows)

function clientFor(results, calls) {
  return { from() {
    const query = {
      select() { return query },
      in(_column, ids) { query.ids = ids; return query },
      order() {
        calls.push(query.ids)
        return Promise.resolve(results(query.ids, calls.length))
      },
    }
    return query
  } }
}

test('bulk checklist read retains every transaction and requirement', async () => {
  const ids = Array.from({ length: 31 }, (_, index) => `tx-${index}`)
  const calls = []
  const rows = await read(clientFor(batch => ({ data: batch.flatMap(transaction_id => [
    { id: `${transaction_id}-a`, transaction_id },
    { id: `${transaction_id}-b`, transaction_id },
  ]) }), calls), ids)
  assert.deepEqual(calls.flat(), ids)
  assert.ok(calls.every(batch => batch.length <= 5))
  assert.equal(Object.keys(rows).length, 31)
  assert.ok(Object.values(rows).every(requirements => requirements.length === 2))
})

test('schema compatibility fallback retains the current batch scope', async () => {
  const calls = []
  const rows = await read(clientFor((ids, attempt) => attempt === 1
    ? { error: { missing: 'enabled' } }
    : { data: ids.map(transaction_id => ({ transaction_id })) }, calls), ['one', 'two'])
  assert.deepEqual(calls, [['one', 'two'], ['one', 'two']])
  assert.deepEqual(Object.keys(rows), ['one', 'two'])
})

test('a failed batch rejects instead of presenting a partial checklist', async () => {
  const calls = []
  const failure = { code: '57014', message: 'statement timeout' }
  await assert.rejects(read(clientFor((ids, attempt) => attempt === 2
    ? { error: failure }
    : { data: ids.map(transaction_id => ({ transaction_id })) }, calls),
  Array.from({ length: 9 }, (_, index) => `tx-${index}`)), error => error === failure)
})
