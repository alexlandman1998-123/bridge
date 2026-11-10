import assert from 'node:assert/strict'
import { parse } from '@babel/parser'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const detailSource = readFileSync(resolve(root, 'src/pages/DevelopmentDetail.jsx'), 'utf8')

assert.match(detailSource, /saveDevelopmentUnitStatus,/, 'Development detail must use the atomic stock/lifecycle command.')
const ast = parse(detailSource, { sourceType: 'module', plugins: ['jsx'] })
const statuses = ast.program.body.flatMap(node => node.declarations || []).find(node => node.id?.name === 'DEVELOPMENT_UNIT_STATUS_OPTIONS').init.elements.map(node => Object.fromEntries(node.properties.map(property => [property.key.name, property.value.value])))
for (const [value, label] of [['OTP Signed', 'OTP'], ['Sold', 'Sold'], ['Registered', 'Registered']]) {
  assert.equal(statuses.find(option => option.value === value)?.label, label, 'Unit status vocabulary must retain ' + value)
}

assert.ok(
  detailSource.includes('function resolveDevelopmentTrackerMainStage') &&
    detailSource.includes('const unitMainStage = resolveDevelopmentUnitStatusMainStage(unitStatus)'),
  'development tracker metrics should resolve manual unit status before falling back to transactions',
)

assert.ok(
  detailSource.includes('const developmentTrackerMetrics = useMemo(() => {') &&
    detailSource.includes('unitsAvailable: available') &&
    detailSource.includes('unitsSold: sold'),
  'overview and commercial stock counts should use tracker-aware unit metrics',
)

assert.ok(
  detailSource.includes('async function handleUnitStatusQuickChange(unit, nextStatus)') &&
    detailSource.includes('const savedUnit = await saveDevelopmentUnitStatus({'),
  'unit table should save quick stock status and lifecycle changes atomically',
)

assert.ok(
  detailSource.includes('transactionId: unit.currentTransactionId || null') &&
    detailSource.includes('expectedStatus: unit.status, status: nextStatusValue'),
  'the server command must receive the exact transaction association and original stock status',
)

assert.ok(
  detailSource.includes('function getDevelopmentTrackerProgressPercent(stageKey)') &&
    detailSource.includes("mainStageKey === 'AVAIL' || mainStageKey === 'BLOCKED'") &&
    detailSource.includes('const isManualUnitStatus = !row?.transaction?.id') &&
    detailSource.includes("buyerDisplayName: row?.buyer?.name || (isManualUnitStatus ? 'External / direct sale' : 'No buyer assigned'"),
  'development transaction tab should include manual in-progress unit rows while excluding available stock',
)

assert.ok(
  detailSource.includes('void handleUnitTransactionRecovery(row.unit)') && detailSource.includes('openDevelopmentTransactionWorkspace(row)') &&
    !detailSource.includes('openUnitModal(unit || row.unit)'),
  'manual development transaction rows should recover and open their transaction workspace, not the stock-master unit drawer',
)

assert.ok(
  detailSource.includes('Manual / external') &&
    detailSource.includes('handleUnitStatusQuickChange(unit, event.target.value)') &&
    detailSource.includes('event.stopPropagation()'),
  'unit table should expose an inline status selector without opening the unit drawer accidentally',
)

assert.ok(
  !detailSource.includes('handleUnitRowSave(unit)'),
  'old unused unit row save handler should not remain as the table save path',
)

console.log('development unit status tracker checks passed')
