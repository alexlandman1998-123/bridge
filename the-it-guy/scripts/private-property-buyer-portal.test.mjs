import { readDomainApiSource } from './helpers/domainApiSource.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createTransactionCreationLifecycle, requiresTransactionBuyerPortal, setTransactionCreationStepOutcome } from '../src/core/transactions/transactionCreationLifecycle.js'

const root = process.cwd()
const apiSource = readDomainApiSource()
const migrationSource = readFileSync(
  resolve(root, '../supabase/migrations/20260831125407_support_private_property_buyer_portals.sql'),
  'utf8',
)

assert.match(migrationSource, /alter column development_id drop not null/i)
assert.match(migrationSource, /alter column unit_id drop not null/i)
assert.match(migrationSource, /alter column transaction_id set not null/i)
assert.match(migrationSource, /client_portal_links_context_shape_check/i)
assert.match(migrationSource, /bridge_client_portal_link_matches_transaction/i)
assert.match(migrationSource, /transaction_row\.buyer_id is not distinct from link\.buyer_id/i)
assert.match(migrationSource, /v_transaction\.development_id is not null[\s\S]+development_settings/i)
assert.doesNotMatch(
  migrationSource,
  /not found or v_transaction\.development_id is null or v_transaction\.unit_id is null/i,
)

const creationStart = apiSource.indexOf('export async function createTransactionFromWizard')
const creationEnd = apiSource.indexOf('\nexport async function ', creationStart + 1)
const creationSource = apiSource.slice(creationStart, creationEnd)
assert.match(creationSource, /portalSetupRequired:\s*requiresTransactionBuyerPortal\(\{ transactionType, buyerId: buyer\?\.id, allowIncomplete, skipClientPortalSetup \}\)/)
const decision = creationSource.slice(creationSource.indexOf('  let creationLifecycle ='), creationSource.indexOf('  const initialCreationLifecyclePatch ='))
const portalStart = creationSource.indexOf('  try {', creationSource.indexOf("recordSetupWarning('seller_handoff'"))
const portal = creationSource.slice(portalStart, creationSource.indexOf('  const incompleteCreationSteps =', portalStart))
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const preparePortal = new AsyncFunction('scope', `with(scope){${decision};let clientPortalLink=null;${portal};return creationLifecycle.steps.portal_setup}`)
for (const transactionType of ['developer_sale', 'private_property']) {
  for (const [allowIncomplete, buyer] of [[true,null],[true,{id:'buyer'}],[false,{id:'buyer'}],[false,null]]) {
    let portalCalls=0
    const step = await preparePortal({ transactionType, allowIncomplete, buyer, skipClientPortalSetup:false,
      expectedAttorneyAssignments:0, expectedBondOriginatorAssignments:0, createTransactionCreationLifecycle, requiresTransactionBuyerPortal, setTransactionCreationStepOutcome,
      transactionPayload:{development_id:transactionType==='developer_sale'?'development':null,unit_id:transactionType==='developer_sale'?'unit':null},transaction:{id:'transaction'},
      recordSetupWarning(){},getOrCreateClientPortalLink:async()=>{portalCalls++;if(!buyer)throw new Error('Buyer is required');return{token:'local-token'}} })
    assert.equal(portalCalls,allowIncomplete&&!buyer?0:1)
    assert.equal(step.status,allowIncomplete&&!buyer?'not_required':buyer?'complete':'failed')
  }
}
assert.match(creationSource, /developmentId:\s*transactionPayload\.development_id/)
assert.match(creationSource, /unitId:\s*transactionPayload\.unit_id/)

const portalLinkStart = apiSource.indexOf('async function getOrCreateClientPortalLinkRecord')
const portalLinkEnd = apiSource.indexOf('\nfunction normalizeBuyerOnboardingPortalAccess', portalLinkStart)
const portalLinkSource = apiSource.slice(portalLinkStart, portalLinkEnd)
assert.match(portalLinkSource, /\.from\('transactions'\)/)
assert.match(portalLinkSource, /transactionDevelopmentId/)
assert.match(portalLinkSource, /transactionBuyerId/)
assert.match(portalLinkSource, /The selected buyer does not belong to this transaction/)
assert.match(portalLinkSource, /development_id:\s*transactionDevelopmentId/)
assert.match(portalLinkSource, /unit_id:\s*transactionUnitId/)
assert.match(portalLinkSource, /buyer_id:\s*transactionBuyerId/)
assert.match(apiSource, /if \(transaction\?\.id && transaction\?\.buyer_id\)/)
assert.match(apiSource, /if \(!transactionId \|\| !buyerId\)/)

for (const functionName of ['fetchClientPortalByToken', 'fetchClientPortalCoreByToken']) {
  const start = apiSource.indexOf(`export async function ${functionName}`)
  const end = apiSource.indexOf('\nexport async function ', start + 1)
  const source = apiSource.slice(start, end === -1 ? apiSource.length : end)
  assert.ok(source.indexOf('if (!transaction)') < source.indexOf('resolveClientPortalSettings'))
}

assert.match(apiSource, /function deriveClientPortalSettingsFromTransaction/)
assert.match(apiSource, /snag_reporting_enabled:\s*false/)
assert.match(apiSource, /service_reviews_enabled:\s*Boolean\(transaction\.unit_id\)/)
assert.match(apiSource, /reservation_deposit_enabled_by_default:\s*reservationRequired/)

console.log('private-property buyer portal contract passed')
