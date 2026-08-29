import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const start = source.indexOf('function ArchlineDocumentsWorkspace(')
const end = source.indexOf('function ArchlineTasksWorkspace', start)
const workspace = source.slice(start, end)

test('removes duplicate documents workspace headings and helper copy', () => {
  assert.doesNotMatch(workspace, /Manage, review and request documents for this matter/)
  assert.doesNotMatch(workspace, /Live status across required, missing, review, and received document rows/)
  assert.doesNotMatch(workspace, />Document Health</)
})

test('keeps request and upload actions in the party filter panel header', () => {
  const panelStart = workspace.indexOf('<ArchlinePanel className="overflow-hidden">')
  const filterHeader = workspace.indexOf('sm:items-center sm:justify-between', panelStart)
  const requestAction = workspace.indexOf('Request Document', filterHeader)
  const uploadAction = workspace.indexOf('Upload Document', requestAction)
  const partyGrid = workspace.indexOf('visibleParties.length > 1', uploadAction)

  assert.ok(panelStart >= 0)
  assert.ok(filterHeader > panelStart)
  assert.ok(requestAction > filterHeader)
  assert.ok(uploadAction > requestAction)
  assert.ok(partyGrid > uploadAction)
})
