import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const transactionPage = await readFile('src/pages/AttorneyTransactionDetail.jsx', 'utf8')
const liveRefreshHook = await readFile('src/hooks/useTransactionLiveRefresh.js', 'utf8')
const overrideService = await readFile('src/services/journeyStageOverrideService.js', 'utf8')

assert.match(transactionPage, /if \(!force && activeRequest\?\.value\) return activeRequest\.value/)
assert.match(transactionPage, /value: result\.detail/)
assert.match(transactionPage, /resolvedAt: Date\.now\(\)/)
assert.match(transactionPage, /loadWorkspaceDataset\('workflow'\)/)
assert.doesNotMatch(
  transactionPage,
  /async function loadWorkflowOperations\(\)[\s\S]*getAttorneyWorkflowOperationsForTransaction\(transaction\.id\)/,
)
assert.match(transactionPage, /enabled: Boolean\(data\?\.__coreHydrated && !loading/)

assert.match(liveRefreshHook, /if \(nextVersion <= lastVersionRef\.current\) return/)
assert.match(liveRefreshHook, /const handleFocus = \(\) => void reconcileVersion\(\)/)
assert.doesNotMatch(liveRefreshHook, /scheduleRefresh\('window_focus'/)
assert.doesNotMatch(liveRefreshHook, /scheduleRefresh\('poll_interval'/)

assert.match(overrideService, /journeyStageOverridesSchemaAvailable = false/)
assert.match(overrideService, /!journeyStageOverridesSchemaAvailable\) return \[\]/)
assert.match(overrideService, /\['42P01', 'PGRST204', 'PGRST205'\]/)

console.log('Transaction Journey hydration performance checks passed.')
