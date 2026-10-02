import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

// Exercise the production query builder with a recording Supabase adapter.
const source = await fs.readFile(new URL('../agencyBranchService.js', import.meta.url), 'utf8')
const implementation = source.slice(source.indexOf('export async function readScopedBranchRows('), source.indexOf('export async function getBranch(branchId)')).replace('export ', '')
const calls = []
let response = () => ({ data: [], error: null })
const supabase = { from(table) {
  const call = { table }; calls.push(call)
  const query = {
    select(value) { call.select = value; return query },
    eq(field, value) { call.eq = [field, value]; return query },
    in(field, values) { call.in = [field, values]; return query },
    order(field) { call.order = field; return query },
    async range(start, end) { call.range = [start, end]; return response(call) },
  }
  return query
} }
const read = new Function('supabase', 'isMissingTableError', 'isSchemaMismatchError', `${implementation}; return readScopedBranchRows`)(supabase, error => error.code === '42P01', error => error.code === '42703')
assert.deepEqual(await read('leads', 'org-a', 'branch_id', []), { rows: [], available: true })
assert.equal(calls.length, 0, 'empty scope must not trigger an unfiltered query')
response = call => ({ data: Array.from({ length: call.range[0] === 0 ? 500 : 2 }, (_, i) => ({ id: call.range[0] + i })), error: null })
const result = await read('leads', 'org-a', 'branch_id', ['branch-a', 'branch-a'], 'lead_id')
assert.equal(result.rows.length, 502)
assert.deepEqual(calls.map(call => call.range), [[0, 499], [500, 999]])
for (const call of calls) {
  assert.deepEqual(call.eq, ['organisation_id', 'org-a'])
  assert.deepEqual(call.in, ['branch_id', ['branch-a']])
  assert.equal(call.order, 'lead_id')
}
calls.length = 0
response = () => ({ data: [], error: null })
await read('offers', 'org-a', 'buyer_lead_id', Array.from({ length: 101 }, (_, i) => `lead-${i}`))
assert.deepEqual(calls.map(call => call.in[1].length), [100, 1])
for (const code of ['42501', 'PGRST301', '42P01', '42703']) {
  response = () => ({ data: null, error: { code } })
  assert.deepEqual(await read('offers', 'org-a', 'buyer_lead_id', ['lead-a']), { rows: [], available: false }, 'denied/missing reads must not fabricate valid zero totals')
}
response = () => ({ data: null, error: new Error('network failed') })
await assert.rejects(read('offers', 'org-a', 'buyer_lead_id', ['lead-a']), /network failed/)
const loader = await fs.readFile(new URL('../branchDashboardDataService.js', import.meta.url), 'utf8')
assert.ok(loader.includes('const branch = await getBranch(branchId)'))
assert.ok(!loader.includes('getBranches('), 'dashboard must not load organisation-wide operational records')
console.log('branch dashboard scope: database filters, pagination, batching and denied reads passed')
