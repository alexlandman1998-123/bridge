import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoRoot = process.cwd()
const statementPath = path.join(repoRoot, 'src/core/attorneyAccounting/matterAccountStatement.js')
const attorneyPanelPath = path.join(repoRoot, 'src/components/AttorneyMatterAccountsPanel.jsx')
const clientPanelPath = path.join(repoRoot, 'src/components/client-portal/ClientPortalMatterAccountsPanel.jsx')

const statementSource = fs.readFileSync(statementPath, 'utf8')
const attorneyPanelSource = fs.readFileSync(attorneyPanelPath, 'utf8')
const clientPanelSource = fs.readFileSync(clientPanelPath, 'utf8')

assert.match(statementSource, /export function buildMatterFinancialStatementCsv/, 'Phase 4 must expose a pure statement CSV builder')
assert.match(statementSource, /export function buildMatterFinancialStatementFileName/, 'Phase 4 must expose deterministic statement filenames')
assert.match(statementSource, /export function downloadMatterFinancialStatement/, 'Phase 4 must expose a browser download helper')
assert.match(statementSource, /Bridge matter account statement/, 'Statement export must include a clear title')
assert.match(statementSource, /Ledger entries/, 'Statement export must include ledger entries')
assert.match(statementSource, /Published documents/, 'Statement export must include document references')
assert.match(statementSource, /Updates/, 'Statement export must include account update events')
assert.match(statementSource, /includeInternal \? events : events\.filter/, 'Statement export must support hiding internal attorney events')
assert.match(statementSource, /new Blob\(\[csv\], \{ type: 'text\/csv;charset=utf-8' \}\)/, 'Statement download must use CSV blob output')
assert.match(statementSource, /URL\.createObjectURL/, 'Statement download must create a browser object URL')
assert.doesNotMatch(statementSource, /invoice/i, 'Phase 4 statement export must not introduce invoice generation')

assert.match(attorneyPanelSource, /Download,/, 'Attorney panel must import the download icon')
assert.match(attorneyPanelSource, /downloadMatterFinancialStatement/, 'Attorney panel must use the shared statement downloader')
assert.match(attorneyPanelSource, /includeInternal: true/, 'Attorney statement downloads must include internal audit context')
assert.match(attorneyPanelSource, /generatedFor: 'attorney'/, 'Attorney statement downloads must be labelled for attorney use')
assert.match(attorneyPanelSource, /Download statement/, 'Attorney panel must expose statement download action')

assert.match(clientPanelSource, /downloadMatterFinancialStatement/, 'Client portal panel must use the shared statement downloader')
assert.match(clientPanelSource, /includeInternal: false/, 'Client statement downloads must hide internal audit context')
assert.match(clientPanelSource, /generatedFor: workspaceLabel/, 'Client statement downloads must be labelled for the active buyer/seller workspace')
assert.match(clientPanelSource, /Download statement/, 'Client portal must expose statement download action')

console.log('Attorney accounting Phase 4 statement download contract checks passed.')
