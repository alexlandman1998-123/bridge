import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync('src/lib/api.js','utf8')
const start = source.indexOf('async function buildTransactionWorkspaceShellFromTransaction(')
const end = source.indexOf('\nexport async function fetchTransactionCoreById', start)
const factory = new Function('hydrateMatterPropertyContext', 'normalizeStage', 'normalizeMainStage', 'resolveAttorneyOperationalStageKey',
  'getDefaultTrustInvestmentForm','getDefaultHandoverRecord','getDefaultOccupationalRentRecord','buildDefaultSubprocessState',
  'normalizePurchaserType','getPurchaserTypeLabel','getRolePermissions','summarizeDocumentRequests','summarizeChecklistItems',
  'DEFAULT_DEVELOPMENT_SETTINGS', `${source.slice(start,end)}; return buildTransactionWorkspaceShellFromTransaction`)
const forbidden = () => { throw Error('Optional relation must not block route core') }
const identity = value => value
const empty = () => ({})
const build = factory(forbidden,identity,identity,identity,empty,empty,empty,empty,identity,identity,empty,empty,empty,{})
const shell = await build({from:forbidden}, {id:'matter',buyer_id:'buyer',development_id:'development'}, {routeOnly:true})
assert.equal(shell.transaction.id, 'matter')
assert.equal(shell.buyer,null)
assert.equal(shell.development,null)
assert.ok(source.includes('buildTransactionWorkspaceShellFromTransaction(client, query.data, { routeOnly: true })'))
const page=readFileSync('src/pages/AttorneyTransactionDetail.jsx','utf8')
assert.ok(page.includes('Retry matter'))
assert.ok(page.includes('if (resetMatterScopeRef.current === currentMatterAccessKey) return'))
assert.ok(page.includes('if (liveMatterScopeRef.current !== loadScope) return null'))
assert.ok(page.includes('void fetchTransactionCoreById(transactionId)'), 'Optional metadata still hydrates later')
console.log('PASS: verified core renders without optional relation queries; metadata hydration and retry retained')
