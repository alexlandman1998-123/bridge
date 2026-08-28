import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const unitsSource = await readFile(new URL('../src/pages/Units.jsx', import.meta.url), 'utf8')

test('transaction list keeps a scoped summary snapshot for client-side filtering', () => {
  assert.match(unitsSource, /const transactionListSnapshotRef = useRef\(\{ key: '', rows: \[\], options: \[\] \}\)/)
  assert.match(unitsSource, /transactionListSnapshotRef\.current\.key === serverScopeKey/)
  assert.match(unitsSource, /timer\.mark\('summary_snapshot_hit'/)
  assert.match(unitsSource, /rows: unitsData \|\| \[\]/)
})

test('search and presentation filters are excluded from the server query key', () => {
  const keyStart = unitsSource.indexOf('const serverScopeKey = JSON.stringify(')
  const keyEnd = unitsSource.indexOf('const cachedSnapshot', keyStart)
  assert.notEqual(keyStart, -1)
  assert.notEqual(keyEnd, -1)
  const keySource = unitsSource.slice(keyStart, keyEnd)

  for (const localFilter of [
    'search',
    'readiness',
    'missingDocs',
    'risk',
    'blocked',
    'assignedToMe',
    'transactionStatus',
    'dateRange',
    'sortBy',
    'sortDirection',
    'stage',
    'financeType',
  ]) {
    assert.doesNotMatch(keySource, new RegExp(`filters\\.${localFilter}`))
  }
})

test('transaction mutations and update events explicitly bypass the snapshot', () => {
  assert.match(unitsSource, /function refreshTransactions\(\) \{\s*void loadData\(\{ force: true \}\)/)
  assert.ok((unitsSource.match(/await loadData\(\{ force: true \}\)/g) || []).length >= 3)
  assert.match(unitsSource, /onIntakeActionComplete=\{\(\) => loadData\(\{ force: true \}\)\}/)
  assert.match(unitsSource, /if \(force && transactionListSnapshotRef\.current\.key === serverScopeKey\)/)
})

test('server filtering remains scoped to inputs consumed by summary loaders', () => {
  assert.match(unitsSource, /source: 'participant_transactions',[\s\S]*userId: profile\.id,[\s\S]*roleType: participantScopedRole/)
  assert.match(unitsSource, /source: 'developer_transactions',[\s\S]*organisationId: developerOrganisationId,[\s\S]*developmentId: filters\.developmentId/)
  assert.match(unitsSource, /source: 'unit_transactions',[\s\S]*workspaceId: workspace\.id,[\s\S]*developmentId: filters\.developmentId/)
  assert.ok((unitsSource.match(/stage: 'all',\s*financeType: 'all'/g) || []).length >= 3)
})
