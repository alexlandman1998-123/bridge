import { readDomainApiSource } from './helpers/domainApiSource.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const apiSource = readDomainApiSource()
const migrationSource = readFileSync(
  resolve(root, '../supabase/migrations/20260831125339_add_transaction_creation_lifecycle.sql'),
  'utf8',
)

const functionStart = apiSource.indexOf('export async function createTransactionFromWizard')
assert.notEqual(functionStart, -1, 'createTransactionFromWizard must exist')
const nextFunction = apiSource.indexOf('\nexport async function ', functionStart + 1)
const creationSource = apiSource.slice(functionStart, nextFunction === -1 ? apiSource.length : nextFunction)

for (const column of [
  'creation_status',
  'creation_started_at',
  'creation_completed_at',
  'creation_incomplete_at',
  'creation_steps',
  'creation_error',
]) {
  assert.match(apiSource, new RegExp(`['"]${column}['"]`), `${column} must be protected from schema fallback`)
  assert.match(migrationSource, new RegExp(`add column if not exists ${column}`))
}

assert.match(creationSource, /status: 'initializing'/)
assert.match(creationSource, /\.\.\.initialCreationLifecyclePatch/)
assert.match(creationSource, /expectedAttorneyAssignments/)
assert.match(creationSource, /propagationResult\.attorneyAssignments\.length < expectedAttorneyAssignments/)
assert.match(creationSource, /if \(!onboardingRecord\?\.token\)/)
assert.match(creationSource, /if \(!onboardingSnapshot \|\| typeof onboardingSnapshot !== 'object'\)/)
assert.match(creationSource, /if \(!requiredDocumentRows\.length\)/)
assert.match(creationSource, /sellerHandoffRequired:\s*transactionType === 'private_property'/)
assert.match(creationSource, /bridge_verify_private_transaction_seller_handoff/)
assert.match(creationSource, /'seller_handoff'/)
assert.match(creationSource, /if \(!clientPortalLink\?\.token\)/)
assert.match(creationSource, /status: 'complete'/)
assert.match(creationSource, /status: 'incomplete'/)
assert.match(creationSource, /TRANSACTION_CREATION_STATUS_PERSISTENCE_FAILED/)
assert.match(creationSource, /TransactionCreationIncompleteError/)
assert.doesNotMatch(creationSource, /requiredDocsGenerated:\s*true/)

const conflictStart = creationSource.indexOf("if (transactionResult.error?.code === '23505')")
const conflictEnd = creationSource.indexOf('if (transactionResult.error) {', conflictStart)
assert(conflictStart >= 0 && conflictEnd > conflictStart)
const conflictHandler = new Function('transactionResult', 'client', creationSource.slice(conflictStart, conflictEnd))
const writeForbidden = new Proxy({}, { get() { throw new Error('A duplicate wizard request must never overwrite an existing deal') } })
assert.throws(() => conflictHandler({ error: { code: '23505' } }, writeForbidden), error => error.code === 'TRANSACTION_CREATION_CONFLICT')

assert.match(migrationSource, /creation_status in \('initializing', 'complete', 'incomplete'\)/)
assert.match(migrationSource, /creation_status = 'complete' and creation_completed_at is not null/)
assert.match(migrationSource, /creation_status = 'incomplete' and creation_incomplete_at is not null/)
assert.match(migrationSource, /alter column creation_status set default 'initializing'/)
assert.match(migrationSource, /creation_status = 'complete' or coalesce\(is_active, false\) = false/)

console.log('transaction creation lifecycle persistence contract passed')

// Exercise the real creation helper: agents use the authorized command rather
// than an administrator-only direct table write, and denied saves still fail.
const commissionStart = apiSource.indexOf('async function persistTransactionCommissionSnapshotIfPossible(')
const commissionEnd = apiSource.indexOf('\nasync function persistCommissionSnapshotToTransactionRowIfPossible(', commissionStart)
assert.ok(commissionStart > 0 && commissionEnd > commissionStart)
const persistCommission = new Function('normalizeNullableText', 'normalizeOptionalNumber',
  `${apiSource.slice(commissionStart, commissionEnd)}; return persistTransactionCommissionSnapshotIfPossible;`
)(value => value == null || value === '' ? null : String(value), value => value == null || value === '' ? null : Number(value))
const organisationId = '11111111-1111-4111-8111-111111111111'
const agentId = '22222222-2222-4222-8222-222222222222'
let calls = 0
const commissionClient = {
  from() { throw new Error('Creation must not bypass the commission command with a direct table write') },
  async rpc(name, args) {
    calls++
    assert.equal(name, 'bridge_upsert_transaction_commission_snapshot')
    assert.equal(args.p_transaction_id, 'demo-transaction')
    assert.equal(args.p_organisation_id, organisationId)
    assert.equal(args.p_assigned_agent_id, agentId)
    assert.equal(args.p_sale_price, 2190000)
    assert.equal(args.p_gross_commission_percentage, 3)
    assert.equal(args.p_status, 'projected')
    assert.equal('p_updated_at' in args, false)
    return { data: { id: 'commission-receipt' }, error: null }
  },
}
const commissionInput = { transactionId: 'demo-transaction', setup: { assignedAgentUserId: agentId },
  commissionSnapshot: { organisationId, salePrice: 2190000, grossCommissionPercentage: 3 } }
assert.equal((await persistCommission(commissionClient, commissionInput)).transaction_id, 'demo-transaction')
assert.equal(calls, 1)
const denied = { code: '42501', message: 'Not authorized' }
await assert.rejects(persistCommission({ ...commissionClient, rpc: async () => ({ error: denied }) }, commissionInput), error => error === denied)
assert.equal(await persistCommission(commissionClient, { transactionId: 'demo-transaction' }), null)
console.log('Creation commission command: authorized RPC, exact scope, denied errors and absent snapshot passed')

const { resolveTransactionWorkspaceRoute } = await import('../src/core/transactions/transactionWorkspaceRouting.js')
for (const [file,variable] of [['AgentNewDealWizard.jsx','createdDeal'],['NewTransactionWizard.jsx','createdTransaction']]) {
  const wizard = readFileSync(resolve(root,'src/components',file),'utf8')
  const footer = wizard.slice(wizard.indexOf('const footer ='))
  const handler = footer.match(/onClick=\{\(\) => \{([\s\S]*?)\n\s*\}\}\n\s*>\n\s*Open Transaction/)?.[1]
  assert.ok(handler, `${file}: actual Open Transaction handler is extractable`)
  const events = []
  new Function(variable,'resolveTransactionWorkspaceRoute','onClose','navigate',handler)(
    { transactionId:'saved-demo-id' },resolveTransactionWorkspaceRoute,
    () => events.push('closed'),(path,options) => events.push({path,options}),
  )
  assert.equal(events[0],'closed', `${file}: close the success modal before navigating`)
  assert.equal(events[1].path,'/transactions/saved-demo-id', `${file}: open the saved deal rather than a list search`)
}
console.log('Both wizard Open Transaction handlers close and open the saved transaction directly')

const sellerBondStart = creationSource.indexOf('  const capturedSellerBondStatus =')
const sellerBondEnd = creationSource.indexOf('  const transactionPayload =',sellerBondStart)
assert.ok(sellerBondStart>0 && sellerBondEnd>sellerBondStart)
const capturedSellerBondPatch = new Function('finance',`${creationSource.slice(sellerBondStart,sellerBondEnd)}; return sellerBondCapturePatch;`)
for (const [answer,expected] of [['yes',true],['no',false]]) {
  assert.deepEqual(capturedSellerBondPatch({captureSnapshot:{sellerBondStatus:answer}}),{
    seller_has_existing_bond:expected,existing_bond:expected,cancellation_required:expected,
  })
}
assert.deepEqual(capturedSellerBondPatch({}),{})
assert.deepEqual(capturedSellerBondPatch({captureSnapshot:{sellerBondStatus:'unknown'}}),{})
assert.match(creationSource,/const transactionPayload = \{\s*\.\.\.initialCreationLifecyclePatch,\s*\.\.\.sellerBondCapturePatch,/)
console.log('Wizard seller bond capture preserves explicit yes/no; unknown never writes null into required boolean flags')
