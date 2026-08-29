import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('agent and buyer render the same transaction journey component', async () => {
  const [agent, buyer, sharedTracker] = await Promise.all([
    read('src/pages/AttorneyTransactionDetail.jsx'),
    read('src/components/client-portal/BuyerPortalJourney.jsx'),
    read('src/components/transaction/TransactionJourneyTracker.jsx'),
  ])

  assert.match(agent, /<TransactionJourneyTracker[\s\S]*?model=\{journeyModel\}/)
  assert.match(buyer, /<TransactionJourneyTracker[\s\S]*?model=\{model\}/)
  assert.match(sharedTracker, /data-transaction-journey="shared"/)
  assert.match(sharedTracker, /model\?\.currentWorkflowItem\?\.summary/)
  assert.match(sharedTracker, /model\.currentWorkflowItem\.ownerLabel/)
})

test('agent consumes the rollup snapshot with an explicit legacy fallback', async () => {
  const source = await read('src/pages/AttorneyTransactionDetail.jsx')

  assert.match(source, /snapshot: transactionRollup\?\.transactionJourneySnapshot \|\| null/)
  assert.match(source, /fallbackSteps: agentOverviewJourneyStages/)
  assert.match(source, /journeyModel=\{agentOverviewJourneyModel\}/)
})

test('buyer portal fetches a token-scoped snapshot and preserves its production fallback', async () => {
  const [api, workspace, portal] = await Promise.all([
    read('src/lib/api.js'),
    read('src/services/clientPortalWorkspaceService.js'),
    read('src/pages/ClientPortal.jsx'),
  ])

  assert.match(api, /fetchClientPortalJourneySnapshotByToken/)
  assert.match(api, /actorRole: normalizeRoleType\(actorRole \|\| 'buyer'\)/)
  assert.match(workspace, /transactionJourneySnapshotPromise/)
  assert.match(workspace, /transactionJourneySnapshot,/)
  assert.match(portal, /snapshot: workspaceData\?\.transactionJourneySnapshot \|\| null/)
  assert.match(portal, /fallbackModel: legacyBuyerJourneyPresentationModel/)
})

