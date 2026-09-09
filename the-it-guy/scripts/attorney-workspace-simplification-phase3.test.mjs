import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const source = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const overview = source.slice(source.indexOf('function ArchlineOverviewWorkspace('), source.indexOf('function ArchlineWorkflowWorkspace('))
assert.doesNotMatch(overview, /3 min|Estimated Time|Snooze|Live matter status and key dates/)
assert.match(overview, /View tasks/)
assert.match(overview, /Last updated \{formatDateTime\(matterHealth.updated_at\)\}/)
assert.match(overview, /onSaveMatterHealth/)
assert.match(overview, /const activityRows = activityFeed/)
assert.match(overview, /min-h-\[340px\] flex-col p-5/)
assert.match(overview, /h-\[252px\] space-y-3 overflow-y-auto overscroll-contain/)
assert.match(source, /<ArchlineActivityWorkspace\s+compact=\{workspaceRole === 'attorney'\}/)
assert.match(source, /workspaceRole === 'attorney' && activeWorkspaceMenu === 'activity'/)
assert.doesNotMatch(source, /\['overview', 'activity'\]\.includes\(activeWorkspaceMenu\)/)
assert.match(source, /<ArchlineOverviewWorkspace[\s\S]*?<AttorneyDealSetupHandoffPanel/)
assert.match(source, /stage.completed\} \/ \{stage.total\} complete/)
const docs = source.slice(source.indexOf('function ArchlineDocumentsWorkspace('), source.indexOf('function ArchlineDocumentsWorkspace(') + 24000)
assert.doesNotMatch(docs, /\{card.helper\}|\{party.description\}/)
for (const action of ['onRequest', 'onUpload', 'onReplace', 'onReview']) assert.ok(docs.includes(action))

const server = await createServer({ configFile: false, envFile: false, logLevel: 'silent', esbuild: { jsx: 'automatic' }, server: { middlewareMode: true } })
try {
  const { default: History } = await server.ssrLoadModule('/src/pages/transaction-workspace/tabs/ActivityWorkspaceTab.jsx')
  const entry = { id: 'event', title: 'Instruction completed', body: 'Original evidence remains outstanding.', authorName: 'Test attorney', createdAt: '2026-09-08T10:00:00Z' }
  const props = { entries: [entry], groupedEntries: [{ label: 'Today', items: [entry] }], composer: createElement('button', null, 'Add update') }
  const html = renderToStaticMarkup(createElement(History, { ...props, compact: true }))
  assert.match(html, />History</)
  assert.match(html, /Test attorney/)
  assert.match(html, /2026/)
  assert.match(html, /Add update/)
  assert.match(html, /<details[^>]*><summary[^>]*>View details<\/summary><p[^>]*>Original evidence remains outstanding\./)
  assert.doesNotMatch(html, /<details[^>]*\bopen\b|Quick Actions/)
  const ordinary = renderToStaticMarkup(createElement(History, props))
  assert.match(ordinary, /Matter Activity|Quick Actions/)
  assert.doesNotMatch(ordinary, /<details/)
  const duplicate = renderToStaticMarkup(createElement(History, { ...props, compact: true, groupedEntries: [{ label: 'Today', items: [{ ...entry, body: entry.title }] }] }))
  assert.equal(duplicate.split(entry.title).length - 1, 1)
  console.log('Phase 3: overview, header, document actions and compact history checks passed')
} finally { await server.close() }
