import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appRoot = new URL('../', import.meta.url)
const repositoryRoot = new URL('../../', import.meta.url)
const readApp = (relativePath) => readFile(new URL(relativePath, appRoot), 'utf8')
const readRepository = (relativePath) => readFile(new URL(relativePath, repositoryRoot), 'utf8')

test('transaction list paints core rows before optional enrichment', async () => {
  const units = await readApp('src/pages/Units.jsx')

  assert.match(units, /includeEnrichment: false/)
  assert.match(units, /enrichTransactionListSummaryRows\(coreRows/)
  assert.match(units, /setEnrichmentRevision\(\(revision\) => revision \+ 1\)/)
  assert.match(units, /startTransition/)
})

test('independent transaction summary reads no longer form waterfalls', async () => {
  const api = await readApp('src/lib/api.js')

  assert.match(api, /\[workflowsQuery, instructionsQuery\] = await Promise\.all/)
  assert.match(api, /\[buyersQuery, unitsQuery, directDevelopmentsQuery\] = await Promise\.all/)
  assert.match(api, /if \(!includeEnrichment\) \{\s+return rows\s+\}/)
  assert.match(api, /const bondTransactionIds =/)
})

test('finance workflow RLS keeps write checks off the read path', async () => {
  const migration = await readRepository(
    'supabase/migrations/20260828144545_transaction_list_rls_hot_path_phase3.sql',
  )

  assert.match(migration, /drop policy if exists transaction_finance_workflows_modify/)
  assert.match(migration, /create policy transaction_finance_workflows_authenticated_select/)
  assert.match(migration, /create policy transaction_finance_workflows_authenticated_insert/)
  assert.match(migration, /create policy transaction_finance_workflows_authenticated_update/)
  assert.match(migration, /create policy transaction_finance_workflows_authenticated_delete/)
  assert.match(migration, /\(select auth\.uid\(\)\)/)
})
