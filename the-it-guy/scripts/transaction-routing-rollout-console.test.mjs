import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pageSource = fs.readFileSync(path.join(root, 'src/pages/TransactionRoutingRolloutPage.jsx'), 'utf8')
const apiSource = fs.readFileSync(path.join(root, 'src/lib/api.js'), 'utf8')
const appSource = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8')
const rolesSource = fs.readFileSync(path.join(root, 'src/lib/roles.js'), 'utf8')
const sidebarSource = fs.readFileSync(path.join(root, 'src/components/Sidebar.jsx'), 'utf8')
const packageSource = fs.readFileSync(path.join(root, 'package.json'), 'utf8')

assert.match(
  pageSource,
  /runTransactionRoutingProfileBackfill/,
  'Phase 7 rollout console should use the Phase 6 routing backfill API.',
)
assert.match(
  pageSource,
  /dryRun:\s*true/,
  'Phase 7 rollout console should load and refresh with a dry-run.',
)
assert.match(
  pageSource,
  /dryRun:\s*false/,
  'Phase 7 rollout console should expose an explicit apply path.',
)
assert.match(
  pageSource,
  /window\.confirm/,
  'Phase 7 rollout console should require confirmation before applying a real backfill.',
)
assert.match(
  pageSource,
  /destructiveOperations/,
  'Phase 7 rollout console should show destructive operation counts from the plan.',
)
assert.match(
  apiSource,
  /dryRun = true/,
  'Phase 6 API must remain dry-run by default for Phase 7.',
)
assert.match(
  appSource,
  /TransactionRoutingRolloutPage/,
  'App routes should lazy-load the transaction routing rollout console.',
)
assert.match(
  appSource,
  /\/platform\/transaction-routing-rollout/,
  'App routes should expose the transaction routing rollout URL.',
)
assert.match(
  rolesSource,
  /platform_transaction_routing/,
  'Platform admin navigation should include the transaction routing rollout entry.',
)
assert.match(
  sidebarSource,
  /platform_transaction_routing:\s*Workflow/,
  'Sidebar should render the routing rollout entry with an operations icon.',
)
assert.match(
  packageSource,
  /"test:transaction-routing-rollout-console": "node scripts\/transaction-routing-rollout-console\.test\.mjs"/,
  'Package scripts should expose the Phase 7 rollout console guard.',
)

console.log('transaction-routing-rollout-console tests passed')
