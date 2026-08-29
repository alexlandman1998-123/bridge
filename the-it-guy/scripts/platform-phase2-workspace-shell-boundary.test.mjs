import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const page = await readFile('src/pages/AttorneyTransactionDetail.jsx', 'utf8')
const boundary = await readFile('src/lib/transactionWorkspaceApi.js', 'utf8')

assert.doesNotMatch(page, /from ['"]\.\.\/lib\/api['"]/, 'Transaction workspace must not statically import the legacy API.')
assert.doesNotMatch(page, /from ['"]\.\.\/services\/transactionFinanceService['"]/, 'Finance actions must remain action-loaded.')
assert.doesNotMatch(page, /from ['"]\.\.\/lib\/settingsApi['"]/, 'Partner settings must remain dataset-loaded.')
assert.match(page, /from ['"]\.\.\/lib\/transactionWorkspaceApi['"]/, 'Transaction workspace must use its async API boundary.')
assert.match(page, /lazy\(\(\) => import\(['"]\.\.\/components\/AttorneyMatterAccountsPanel['"]\)\)/, 'Attorney accounts must load with its tab.')
assert.match(page, /lazy\(\(\) => import\(['"]\.\.\/components\/transaction\/TransactionFinanceCommandCenter['"]\)\)/, 'Finance command center must load with its tab.')
assert.match(boundary, /workspaceApiPromise \|\|= import\('\.\/api'\)/, 'Workspace API must be loaded once and on demand.')
for (const method of ['fetchTransactionCoreById', 'fetchTransactionDocumentsWorkspace', 'fetchTransactionFinanceWorkspace', 'fetchTransactionWorkflowWorkspace']) {
  assert.match(boundary, new RegExp(`['"]${method}['"]`), `Workspace boundary must expose ${method}.`)
}

const assets = await readdir('dist/assets')
const pageAsset = assets.find((name) => /^AttorneyTransactionDetail-.*\.js$/.test(name))
assert.ok(pageAsset, 'Fresh build must contain the Transaction workspace chunk.')
const builtPage = await readFile(`dist/assets/${pageAsset}`)
const builtPageText = builtPage.toString('utf8')
assert.doesNotMatch(builtPageText, /from"\.\/api-[A-Za-z0-9_-]+\.js"/, 'Built workspace shell must not statically import the legacy API chunk.')
const gzipBytes = gzipSync(builtPage).byteLength
assert.ok(gzipBytes <= 275 * 1024, `Transaction workspace chunk is ${gzipBytes} bytes gzip; Phase 2 ceiling is 275 KB.`)

console.log(`Platform Phase 2 workspace shell boundary passed (${gzipBytes} bytes gzip).`)
