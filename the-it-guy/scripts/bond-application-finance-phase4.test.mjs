import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createServer } from 'vite'

import { buildAgentBondApplicationWorkspaceHealth } from '../src/modules/bond/application/workspace/index.js'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const applicationWorkspace = {
  available: true,
  valid: true,
  lastUpdatedAt: '2026-08-28T18:00:00Z',
  application: {
    id: 'application-1',
    createdAt: '2026-08-20T08:00:00Z',
    participantSummary: { total: 1, ready: 1, outstanding: 0 },
    documentRequirementSummary: { total: 2, satisfied: 2, outstanding: 0 },
  },
  originator: {
    package: { id: 'package-1', packageReadyAt: '2026-08-21T08:00:00Z', originatorRecipientName: 'BetterBond' },
    progressEvents: [],
    documentRequests: [],
    documentRequestSummary: { total: 0, open: 0, awaitingReview: 0 },
    offerCaptures: [],
    grantCaptures: [],
  },
  finance: {
    workflow: { id: 'workflow-1', status: 'active', currentStage: 'submitted_to_banks' },
    applications: [{ id: 'bank-application-1', bankName: 'ABSA', status: 'submitted', submittedAt: '2026-08-22T08:00:00Z' }],
    quotes: [],
    decisions: [],
    instruction: null,
    bankOutcomes: [],
  },
  guarantees: { steps: [] },
}

{
  const health = buildAgentBondApplicationWorkspaceHealth({
    workspace: applicationWorkspace,
    liveState: { connectionState: 'live', lastRefreshAt: '2026-08-28T18:05:00Z' },
  })
  assert.equal(health.key, 'live')
  assert.equal(health.label, 'Live sync')
  assert.equal(health.lastCheckedAt, '2026-08-28T18:05:00Z')
}

{
  const health = buildAgentBondApplicationWorkspaceHealth({
    workspace: applicationWorkspace,
    liveState: {
      connectionState: 'polling',
      lastRefreshAt: '2026-08-28T18:05:00Z',
      lastErrorAt: '2026-08-28T18:06:00Z',
      lastErrorMessage: 'network unavailable',
    },
  })
  assert.equal(health.key, 'refresh_error')
  assert.equal(health.label, 'Refresh issue')
}

{
  const health = buildAgentBondApplicationWorkspaceHealth({
    workspace: { ...applicationWorkspace, valid: false },
    liveState: { connectionState: 'live' },
  })
  assert.equal(health.key, 'identity_error')
  assert.equal(health.tone, 'danger')
}

const liveRefreshSource = fs.readFileSync(path.join(PROJECT_ROOT, 'src/hooks/useTransactionLiveRefresh.js'), 'utf8')
assert.match(liveRefreshSource, /lastRefreshReason/)
assert.match(liveRefreshSource, /lastErrorAt/)
assert.match(liveRefreshSource, /lastErrorMessage/)
assert.match(liveRefreshSource, /const handleFocus = \(\) => void reconcileVersion\(\)/)
assert.match(liveRefreshSource, /document\.visibilityState === 'visible'\) void reconcileVersion\(\)/)
assert.doesNotMatch(liveRefreshSource, /scheduleRefresh\('poll_interval'/)
assert.doesNotMatch(liveRefreshSource, /scheduleRefresh\('visibility_restored'/)

for (const sensitiveTable of [
  'bond_applications',
  'transaction_bond_application_export_packages',
  'transaction_bond_originator_document_requests',
  'transaction_bond_originator_bank_offer_captures',
]) {
  assert.ok(!liveRefreshSource.includes(`table: '${sensitiveTable}'`), `must not stream raw ${sensitiveTable} rows to the agent client`)
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const componentModule = await server.ssrLoadModule('/src/components/bond/BondOriginatorAgentProgressView.jsx')
  const markup = ReactDOMServer.renderToStaticMarkup(
    React.createElement(componentModule.default, {
      applicationWorkspace,
      liveState: { connectionState: 'live', lastRefreshAt: '2026-08-28T18:05:00Z' },
      transaction: { id: 'transaction-1', bond_originator: 'BetterBond' },
      onRefresh: () => {},
    }),
  )
  assert.ok(markup.includes('Live sync'))
  assert.ok(!markup.includes('Last checked:'))
  assert.ok(markup.includes('Refresh'))

  const transactionDetail = fs.readFileSync(path.join(PROJECT_ROOT, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
  assert.match(transactionDetail, /pollingIntervalMs: workspaceRole === 'agent' \? 15_000 : 30_000/)
  assert.match(transactionDetail, /liveState=\{transactionLiveState\}/)
  assert.match(transactionDetail, /if \(background\) \{\s*throw loadError/)
  assert.match(transactionDetail, /onRefresh=\{\(\) => loadData\(\{ background: true \}\)\.catch\(\(\) => null\)\}/)
} finally {
  await server.close()
}

console.log('bond application Finance phase 4 checks passed')
