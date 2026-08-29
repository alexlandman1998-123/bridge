import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pipeline = readFileSync(resolve(root, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const loader = readFileSync(resolve(root, 'src/pages/agency/buyerFinanceTransactionDataLoader.js'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

const loaderRequest = pipeline.indexOf('loadBuyerFinanceTransactionData({')
assert.notEqual(loaderRequest, -1, 'buyer finance and transaction hydration should use the isolated loader')
const effectStart = pipeline.lastIndexOf('useEffect(() => {', loaderRequest)
const effectEnd = pipeline.indexOf('\n  useEffect(() => {', loaderRequest)
const diagnosticEffect = pipeline.slice(effectStart, effectEnd === -1 ? pipeline.length : effectEnd)

assert.match(diagnosticEffect, /LEAD_WORKSPACE_REQUEST_FAMILIES\.lifecycleDiagnostic/)
assert.match(diagnosticEffect, /shouldLoadBuyerFinanceTransactionTab\(buyerWorkspaceTab\)/)
assert.ok(diagnosticEffect.indexOf('shouldLoadLeadWorkspaceRequest') < diagnosticEffect.indexOf('loadBuyerFinanceTransactionData({'))
assert.ok(diagnosticEffect.indexOf('shouldLoadBuyerFinanceTransactionTab') < diagnosticEffect.indexOf('loadBuyerFinanceTransactionData({'))
assert.match(diagnosticEffect, /revision: selectedLeadOffersRefreshTick/)
assert.doesNotMatch(pipeline, /getBuyerLeadLifecycleDiagnostic\(\{/)

assert.match(loader, /new Set\(\['buyer_profile', 'onboarding_otp'\]\)/)
assert.match(loader, /const pendingLoads = new Map\(\)/)
assert.match(loader, /const completedLoads = new Map\(\)/)
assert.match(loader, /revision: Number\(revision\) \|\| 0/)

const saveBuyerProfileStart = pipeline.indexOf('async function handleSaveBuyerProfile')
const saveBuyerProfileEnd = pipeline.indexOf('\n  function handleToggleViewingPlanProperty', saveBuyerProfileStart)
const saveBuyerProfileBlock = pipeline.slice(saveBuyerProfileStart, saveBuyerProfileEnd)
assert.match(saveBuyerProfileBlock, /setSelectedLeadOffersRefreshTick\(\(value\) => value \+ 1\)/)

assert.match(
  packageJson.scripts['verify:buyer-leads-performance'],
  /test:buyer-leads-finance-transaction-isolation-phase6(?: && |$)/,
)

console.log('buyer leads Phase 6 finance and transaction isolation checks passed')
