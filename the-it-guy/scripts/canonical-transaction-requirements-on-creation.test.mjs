import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const apiSource = readFileSync(resolve(root, 'src/lib/api.js'), 'utf8')
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
const ensureStart = apiSource.indexOf('export async function ensureTransactionRequiredDocuments')
const ensureEnd = apiSource.indexOf('\nexport async function ', ensureStart + 1)
const ensureSource = apiSource.slice(ensureStart, ensureEnd === -1 ? apiSource.length : ensureEnd)

assert.match(creationSource, /canonicalSourceRequired:\s*true/)
assert.match(ensureSource, /if \(canonicalSourceRequired\)/)
assert.match(ensureSource, /resolveTransactionDocumentRequirements\(/)
assert.match(ensureSource, /TRANSACTION_CANONICAL_PERSISTENCE_MODES\.creationRpc/)
assert.match(ensureSource, /writeLegacyProjection:\s*true/)
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

console.log('canonical transaction requirements on creation contract passed')
