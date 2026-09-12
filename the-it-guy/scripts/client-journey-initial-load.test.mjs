import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transform } from 'esbuild'
import { buildTransactionJourneyPresentation } from '../src/core/transactions/transactionJourneyPresentation.js'
const page=readFileSync('src/pages/ClientPortal.jsx','utf8')
const workspace=readFileSync('src/services/clientPortalWorkspaceService.js','utf8')
assert.match(page,/CLIENT_PORTAL_CORE_LOAD_TIMEOUT_MS = 30000/)
assert.match(page,/import TransactionJourneyTracker from '..\/components\/transaction\/TransactionJourneyTracker'/)
assert.match(workspace,/legalOnly: mode === 'core'/)
assert.match(workspace,/mode === 'core' \? await transactionJourneySnapshotPromise : null/)
assert.match(page,/Journey freshness must not depend[\s\S]*?legalOnly: true/)
assert.match(page,/portalLoadScopeRef.current !== scope/)
const legalJourney={status:'ready',snapshot:{lanes:[]}}
const fallback={source:'test',steps:[],progressPercent:67}
const model=buildTransactionJourneyPresentation({snapshot:{schemaVersion:1,legalOnly:true,milestones:[],legalJourney},fallbackModel:fallback})
assert.equal(model.legalJourney,legalJourney)
assert.equal(model.progressPercent,67)
assert.equal(model.highLevelJourney,undefined,'Legal-only reads must not manufacture pending commercial milestones')
await transform(page,{loader:'jsx'})
console.log('PASS: bounded startup, independent canonical journey read, scope guard, no fabricated milestones, JSX compilation')
