import { readDomainApiSource } from './helpers/domainApiSource.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const apiSource = readDomainApiSource()
const requirementActionsSource = readFileSync(resolve(root, 'src/domains/documents/requirementActions.js'), 'utf8')
const resolverSource = readFileSync(resolve(root, 'src/services/documents/canonicalDocumentResolverService.js'), 'utf8')
const transactionResolverSource = readFileSync(resolve(root, 'src/services/documents/transactionCanonicalDocumentRequirementService.js'), 'utf8')
const adapterSource = readFileSync(resolve(root, 'src/services/documents/canonicalDocumentAdapterService.js'), 'utf8')
const migrationSource = readFileSync(
  resolve(root, '../supabase/migrations/20260831072652_canonical_transaction_requirements_on_creation.sql'),
  'utf8',
)

const creationStart = apiSource.indexOf('export async function createTransactionFromWizard')
const creationEnd = apiSource.indexOf('\nexport async function ', creationStart + 1)
const creationSource = apiSource.slice(creationStart, creationEnd === -1 ? apiSource.length : creationEnd)
const ensureStart = requirementActionsSource.indexOf('export async function ensureTransactionRequiredDocuments')
const ensureEnd = requirementActionsSource.indexOf('\nexport async function ', ensureStart + 1)
const ensureSource = requirementActionsSource.slice(ensureStart, ensureEnd === -1 ? requirementActionsSource.length : ensureEnd)

assert.match(creationSource, /canonicalSourceRequired:\s*true/)
assert.match(ensureSource, /if \(canonicalSourceRequired\)/)
assert.match(ensureSource, /resolveTransactionDocumentRequirements\(/)
assert.match(ensureSource, /TRANSACTION_CANONICAL_PERSISTENCE_MODES\.creationRpc/)
assert.match(ensureSource, /writeLegacyProjection:\s*false/)
assert.match(ensureSource, /CANONICAL_REQUIREMENT_SETUP_INCOMPLETE/)

assert.match(resolverSource, /export async function syncTransactionRequirementInstancesForCreation/)
assert.match(resolverSource, /bridge_sync_transaction_document_requirement_instances/)
assert.match(resolverSource, /CANONICAL_REQUIREMENT_PERSISTENCE_INCOMPLETE/)
assert.match(transactionResolverSource, /syncTransactionRequirementInstancesForCreation/)
assert.match(transactionResolverSource, /syncCanonicalInstancesToTransactionRequiredDocuments/)
assert.match(adapterSource, /export async function syncCanonicalInstancesToTransactionRequiredDocuments/)
assert.match(adapterSource, /source:\s*'canonical_instances'/)

assert.match(migrationSource, /security definer\s+set search_path = ''/i)
assert.match(migrationSource, /document_requirement_rules_authenticated_active_read/)
assert.match(migrationSource, /context_type = 'transaction'/)
assert.match(migrationSource, /context_id = p_transaction_id/)
assert.match(migrationSource, /transaction_id = p_transaction_id/)
assert.match(migrationSource, /revoke all on function[\s\S]*from public, anon/)
assert.match(migrationSource, /grant execute on function[\s\S]*to authenticated, service_role/)
assert.doesNotMatch(
  migrationSource,
  /grant (?:all|insert|update|delete)[^;]*document_requirement_instances[^;]*authenticated/i,
)

// Exercise the actual RPC boundary for the reported pending-policy failure.
Object.assign(process.env, { VITE_SUPABASE_URL: 'https://canonical-fixture.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_canonical_fixture' })
const server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { syncTransactionRequirementInstancesForCreation } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentResolverService.js')
  const levels = ['pending_policy_required', 'pending_policy_required_unless_waived', 'required', 'blocker', 'optional']
  const generatedInstances = levels.map((requirement_level, index) => ({ id: `requirement-${index}`, requirement_level }))
  let captured
  const client = { rpc: async (name, payload) => {
    captured = { name, payload }
    return { data: { instances: payload.p_generated_instances } }
  } }
  await syncTransactionRequirementInstancesForCreation({ transactionId: 'transaction', generatedInstances, client })
  assert.equal(captured.name, 'bridge_sync_transaction_document_requirement_instances')
  assert.deepEqual(captured.payload.p_generated_instances.map(row => row.requirement_level), ['optional', 'optional', 'required', 'blocker', 'optional'])
  assert.deepEqual(generatedInstances.map(row => row.requirement_level), levels, 'persistence translation must not mutate the policy model')
  await assert.rejects(syncTransactionRequirementInstancesForCreation({ transactionId: 'transaction', generatedInstances, client: { rpc: async () => ({ error: new Error('Permission denied') }) } }), /Permission denied/)
} finally {
  await server.close()
}

console.log('canonical transaction requirements on creation contract and pending-policy persistence passed')
