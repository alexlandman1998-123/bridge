import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync('src/services/documents/transactionCanonicalDocumentRequirementService.js', 'utf8')
const fn = source.slice(source.indexOf('export async function maybeResolveTransactionDocumentRequirements('))
let writes = 0
globalThis.__documentReadTest = {
  load: async () => ({ matter: [{ key: 'signed_otp', status: 'approved' }] }),
  write: async () => { writes++; return { requirements: [] } },
}
const stub = `const supabase = {}; const DOCUMENT_ROLLOUT_MODES = { parity:'parity', canonicalPrimary:'canonical_primary', canonicalOnly:'canonical_only' };
const getCanonicalDocumentRolloutMode = () => 'canonical_primary';
const isLegacyDocumentAdapterWritebackEnabled = () => false;
const fetchTransactionDocumentRequirementsByTransactionIds = globalThis.__documentReadTest.load;
const resolveTransactionDocumentRequirements = globalThis.__documentReadTest.write;`
const { maybeResolveTransactionDocumentRequirements: resolve } = await import('data:text/javascript,' + encodeURIComponent(stub + fn))
const result = await resolve({ transactionId: 'matter', readOnly: true })
assert.equal(result.requirements[0].status, 'approved')
assert.equal(result.skipped, false)
assert.equal(writes, 0, 'Reading a workspace must not reconcile/write projections')
assert.equal((await resolve({ transactionId: 'empty', readOnly: true })).skipped, true)
await resolve({ transactionId: 'matter' })
assert.equal(writes, 1, 'Explicit sync keeps its mutation path')
const api = readFileSync('src/lib/api.js', 'utf8')
assert.match(api, /maybeResolveTransactionDocumentRequirements\(\{[\s\S]*?readOnly: !sync/)
const page = readFileSync('src/pages/AttorneyTransactionDetail.jsx', 'utf8')
assert.match(page, /includeDatasets: \['workflow', 'activity'\]/)
console.log('Workspace projection reads are read-only; explicit sync and refresh deduplication preserved')
