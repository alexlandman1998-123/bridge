import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../attorneyMatterWorkspace.js', import.meta.url), 'utf8')

assert.match(source, /export function buildAttorneyMatterWorkspaceFromSnapshot/, 'Snapshot presenter should be exported.')
assert.match(source, /function normalizeSnapshotMatterRow[\s\S]*?matterId: row\.transactionId[\s\S]*?matterReference: row\.matterNumber/, 'Snapshot rows should retain matter identity and reference.')
assert.match(source, /kpis: buildSnapshotKpis\(snapshot\.kpis\)/, 'KPI aggregates must come from SQL, not the page rows.')
assert.match(source, /totalRows: Math\.max\(0, Number\(pagination\.totalRows \|\| 0\)\)/, 'Pagination total must come from the SQL snapshot.')

console.log('attorney matter snapshot presentation tests passed')
