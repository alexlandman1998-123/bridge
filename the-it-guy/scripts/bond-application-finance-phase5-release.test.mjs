import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createServer } from 'vite'

import {
  BOND_APPLICATION_FINANCE_RELEASE_VERSION,
  buildBondApplicationFinanceReleaseReadiness,
} from '../src/modules/bond/application/workspace/index.js'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_ROOT = path.resolve(PROJECT_ROOT, '..')
const localEvidence = {
  identity_contract: true,
  workspace_contract: true,
  agent_safe_contract: true,
  journey_ui: true,
  where_we_are_ui: true,
  refresh_resilience: true,
  regression_suite: true,
  production_build: true,
  remote_rpc: false,
}

{
  const readiness = buildBondApplicationFinanceReleaseReadiness(localEvidence)
  assert.equal(readiness.version, BOND_APPLICATION_FINANCE_RELEASE_VERSION)
  assert.equal(readiness.decision, 'GO')
  assert.equal(readiness.blockingChecks.length, 0)
  assert.equal(readiness.warningChecks[0]?.key, 'remote_rpc')
  assert.match(readiness.summary, /remote RPC deployment remains pending/i)
}

{
  const readiness = buildBondApplicationFinanceReleaseReadiness({ ...localEvidence, requireRemoteRpc: true })
  assert.equal(readiness.decision, 'BLOCKED')
  assert.deepEqual(readiness.blockingChecks.map((item) => item.key), ['remote_rpc'])
}

{
  const readiness = buildBondApplicationFinanceReleaseReadiness({
    ...localEvidence,
    remote_rpc: true,
    requireRemoteRpc: true,
  })
  assert.equal(readiness.decision, 'GO')
  assert.equal(readiness.warningChecks.length, 0)
}

const identityMigration = fs.readFileSync(
  path.join(REPOSITORY_ROOT, 'supabase/migrations/202608280001_agent_bond_application_identity.sql'),
  'utf8',
)
const workspaceMigration = fs.readFileSync(
  path.join(REPOSITORY_ROOT, 'supabase/migrations/20260828195452_agent_bond_application_workspace_view.sql'),
  'utf8',
)
for (const migration of [identityMigration, workspaceMigration]) {
  assert.match(migration, /bridge_can_access_transaction_spine/)
  assert.match(migration, /revoke all on function/)
  assert.match(migration, /grant execute .* to authenticated/)
  assert.doesNotMatch(migration, /auth\.role\(/)
}
for (const forbiddenField of ['destination_payload_json', 'snapshot_json', 'person_id', 'contact_id']) {
  assert.ok(!workspaceMigration.includes(forbiddenField), `release RPC must not expose ${forbiddenField}`)
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const telemetryModule = await server.ssrLoadModule('/src/services/bondApplicationFinanceTelemetryService.js')
  const componentModule = await server.ssrLoadModule('/src/components/bond/BondOriginatorAgentProgressView.jsx')
  const telemetryEvent = telemetryModule.buildBondApplicationFinanceTelemetryEvent({
    workspace: {
      version: 'agent-bond-application-workspace-fallback-v1',
      source: 'client_fallback',
      available: true,
      valid: true,
      application: { id: 'must-not-be-reported', answers: { identityNumber: 'must-not-leak' } },
    },
    liveState: { connectionState: 'live' },
  })
  assert.equal(telemetryEvent.eventName, 'bond_application_finance_fallback_active')
  assert.equal(telemetryEvent.metadata.source, 'client_fallback')
  assert.equal(telemetryEvent.metadata.healthKey, 'compatibility_mode')
  assert.deepEqual(Object.keys(telemetryEvent.metadata).sort(), [
    'available',
    'connectionState',
    'contract',
    'healthKey',
    'source',
    'valid',
    'workspaceVersion',
  ])
  const serializedTelemetry = JSON.stringify(telemetryEvent)
  assert.ok(!serializedTelemetry.includes('must-not-be-reported'))
  assert.ok(!serializedTelemetry.includes('must-not-leak'))

  const markup = ReactDOMServer.renderToStaticMarkup(
    React.createElement(componentModule.default, {
      applicationWorkspace: {
        version: 'agent-bond-application-workspace-fallback-v1',
        source: 'client_fallback',
        available: true,
        valid: true,
        application: { id: 'application-1' },
        originator: { package: null, progressEvents: [], documentRequests: [], offerCaptures: [], grantCaptures: [] },
        finance: { workflow: null, applications: [], quotes: [], decisions: [], instruction: null, bankOutcomes: [] },
        guarantees: { steps: [] },
      },
      liveState: { connectionState: 'live' },
      transaction: { id: 'transaction-1' },
    }),
  )
  assert.ok(markup.includes('Compatibility mode'))

  const transactionDetail = fs.readFileSync(path.join(PROJECT_ROOT, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')
  assert.match(transactionDetail, /trackBondApplicationFinanceWorkspaceState/)
  assert.match(transactionDetail, /agentShouldUseOriginatorFinanceTracker/)

  const packageJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'))
  assert.ok(packageJson.scripts['test:bond-application-finance-phase5'])
  assert.match(packageJson.scripts['verify:bond-application-finance'], /npm run build/)
} finally {
  await server.close()
}

console.log('bond application Finance phase 5 release checks passed')
