import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const workspace = await readFile('src/pages/AttorneyTransactionDetail.jsx', 'utf8')
const portal = await readFile('src/pages/ClientPortal.jsx', 'utf8')
assert.match(workspace, /function lazyWorkspacePanel/)
assert.match(portal, /function lazyPortalPanel/)
for (const component of ['AttorneyAssignmentSection', 'BondOriginatorAgentProgressView', 'BondOriginatorAttorneyHandoffView', 'TransactionNotificationDeliveryPanel']) {
  assert.match(workspace, new RegExp(`const ${component} = lazyWorkspacePanel\\(`), `${component} must be tab-loaded.`)
}
for (const component of ['GuidedBondApplication', 'BuyerFinanceWorkspace', 'BuyerTeamWorkspace', 'ClientAppointmentsSection', 'ClientPortalMatterAccountsPanel']) {
  assert.match(portal, new RegExp(`const ${component} = lazyPortalPanel\\(`), `${component} must be section-loaded.`)
}

const assets = await readdir('dist/assets')
for (const [prefix, ceilingKb] of [['AttorneyTransactionDetail', 255], ['ClientPortal', 210]]) {
  const asset = assets.find((name) => new RegExp(`^${prefix}-.*\\.js$`).test(name))
  assert.ok(asset, `Fresh build must contain ${prefix}.`)
  const built = await readFile(`dist/assets/${asset}`)
  assert.doesNotMatch(built.toString('utf8'), /from"\.\/api-[A-Za-z0-9_-]+\.js"/)
  const gzipBytes = gzipSync(built).byteLength
  assert.ok(gzipBytes <= ceilingKb * 1024, `${prefix} is ${gzipBytes} bytes gzip; Phase 7 ceiling is ${ceilingKb} KB.`)
  console.log(`${prefix} Phase 7 tab boundary passed (${gzipBytes} bytes gzip).`)
}
