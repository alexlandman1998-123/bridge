import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const pageSource = await readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

const loaderStart = apiSource.indexOf('export async function fetchTransactionDocumentsWorkspace')
const loaderEnd = apiSource.indexOf('async function resolveTransactionWorkspaceReadContext', loaderStart)
assert.ok(loaderStart >= 0 && loaderEnd > loaderStart, 'focused Documents loader must be exported before the full loader')

const loaderSource = apiSource.slice(loaderStart, loaderEnd)
for (const requiredCall of [
  'loadSharedDocuments',
  'fetchOnboardingFormDataForTransaction',
  'loadTransactionDocumentRequestsByIds',
  'loadTransactionChecklistItemsByIds',
  'loadTransactionIssueOverridesByIds',
  'fetchTransactionRequiredDocumentsByTransactionIds',
]) {
  assert.match(loaderSource, new RegExp(requiredCall), `focused loader must include ${requiredCall}`)
}
assert.match(loaderSource, /await Promise\.all\(\[/, 'focused datasets must start concurrently')

for (const excludedCall of [
  'ensureTransactionChecklistItems',
  'ensureTransactionSubprocesses',
  'getTransactionFinanceWorkflow',
  'fetchTransactionEvents',
  'fetchTransactionAppointments',
  'fetchNormalizedBondApplicationBundle',
]) {
  assert.doesNotMatch(loaderSource, new RegExp(excludedCall), `focused loader must not hydrate ${excludedCall}`)
}

assert.match(pageSource, /fetchTransactionDocumentsWorkspace\(requestedTransactionId, \{ hydrationContext \}\)/)
assert.match(pageSource, /__documentsHydrated: true/)
assert.match(pageSource, /!data\.__isShell/, 'empty route shells must not masquerade as hydrated document datasets')
assert.match(pageSource, /activeWorkspaceMenu !== 'documents'/)
assert.match(pageSource, /Documents could not be loaded/)

console.log('transaction Documents workspace loader checks passed')

for (const loaderName of [
  'fetchTransactionActivityWorkspace',
  'fetchTransactionPartnersWorkspace',
  'fetchTransactionFinanceWorkspace',
  'fetchTransactionWorkflowWorkspace',
]) {
  assert.match(apiSource, new RegExp(`export async function ${loaderName}`), `${loaderName} must be exported`)
  assert.match(pageSource, new RegExp(loaderName), `${loaderName} must be wired into the transaction workspace`)
}
assert.match(pageSource, /const loadWorkspaceDataset = useCallback/)
assert.match(pageSource, /\['stakeholders', 'parties'\]\.includes\(activeWorkspaceMenu\)/)
assert.match(pageSource, /\['today', 'tasks', 'transfer'\]\.includes\(activeWorkspaceMenu\)/)
assert.match(apiSource, /getTransactionFinanceWorkflow\(canonicalTransactionId, \{ client, createIfMissing: false \}\)/)

console.log('transaction lazy workspace dataset checks passed')

assert.match(apiSource, /export async function createTransactionWorkspaceHydrationContext/)
assert.match(apiSource, /options\.hydrationContext \|\| await resolveTransactionWorkspaceReadContext\(transactionId\)/)
assert.match(pageSource, /const requestWorkspaceHydrationContext = useCallback/)
assert.match(pageSource, /workspaceHydrationContextRef\.current = \{ key: contextKey, promise, value: null \}/)
assert.match(pageSource, /fetchTransactionById\(transactionId, \{ hydrationContext \}\)/)
assert.match(pageSource, /fetchTransactionDocumentsWorkspace\(requestedTransactionId, \{ hydrationContext \}\)/)
assert.match(pageSource, /workspaceHydrationContextRef\.current = \{ key: '', promise: null, value: null \}/)

console.log('transaction hydration context cache checks passed')

assert.match(pageSource, /background && !fullRefresh && backgroundRefreshHandlerRef\.current/)
assert.match(pageSource, /return backgroundRefreshHandlerRef\.current\(\{ reason: refreshReason \|\| 'legacy_background_refresh' \}\)/)
assert.match(pageSource, /const refreshTransactionDatasets = useCallback/)
assert.match(pageSource, /const refreshActiveWorkspaceDataset = useCallback/)
assert.match(pageSource, /refreshTransactionDatasets\(\['documents', 'activity'\], \{ reason: 'document_request_created' \}\)/)
assert.match(pageSource, /refreshTransactionDatasets\(\['workflow', 'activity'\], \{ reason: 'workflow_mutation' \}\)/)
assert.match(pageSource, /refreshActiveWorkspaceDataset\(\{ reason: `live:\$\{reason\}` \}\)/)

console.log('transaction targeted background refresh checks passed')

assert.match(apiSource, /const knownMissingOptionalRelations = new Set\(\)/)
assert.match(apiSource, /function rememberMissingOptionalRelation\(relationName, error\)/)
assert.match(apiSource, /export function getKnownMissingOptionalRelations\(\)/)
assert.match(apiSource, /export function resetKnownMissingOptionalRelations\(\)/)
for (const relationName of [
  'transaction_subprocesses',
  'transaction_proxy_updates',
  'document_requests',
  'transaction_checklist_items',
  'transaction_issue_overrides',
  'transaction_required_documents',
  'transaction_referral_incentives',
  'transaction_referral_incentive_events',
  'appointments',
]) {
  assert.match(apiSource, new RegExp(`isOptionalRelationKnownMissing\\('${relationName}'\\)`), `${relationName} must have a negative-cache guard`)
  assert.match(apiSource, new RegExp(`rememberMissingOptionalRelation\\('${relationName}'`), `${relationName} must register confirmed absence`)
}
const optionalCacheSource = apiSource.slice(
  apiSource.indexOf('const knownMissingOptionalRelations'),
  apiSource.indexOf('function isMissingColumnError'),
)
assert.doesNotMatch(optionalCacheSource, /isPermissionDeniedError/, 'permission failures must not enter the missing-relation cache')

console.log('optional relation negative-cache checks passed')

const loadDataStart = pageSource.indexOf('const loadData = useCallback')
const loadDataEnd = pageSource.indexOf('const loadDocumentsWorkspace = useCallback', loadDataStart)
const loadDataSource = pageSource.slice(loadDataStart, loadDataEnd)
const cutoverGuardIndex = loadDataSource.indexOf('if (!fullRefresh)')
const monolithCallIndex = loadDataSource.indexOf('fetchTransactionById(transactionId, { hydrationContext })')
assert.ok(cutoverGuardIndex >= 0, 'normal hydration must have a full-refresh cutover guard')
assert.ok(monolithCallIndex > cutoverGuardIndex, 'the monolithic loader must remain behind the explicit full-refresh guard')
assert.match(loadDataSource, /__coreHydrated: true/)
assert.match(loadDataSource, /__isRouteShell: false/)
assert.match(loadDataSource, /if \(!fullRefresh\) \{[\s\S]*return null[\s\S]*fetchTransactionById/)

console.log('transaction modular hydration cutover checks passed')
