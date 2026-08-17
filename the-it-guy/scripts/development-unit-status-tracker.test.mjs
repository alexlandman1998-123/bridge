import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const detailSource = readFileSync(resolve(root, 'src/pages/DevelopmentDetail.jsx'), 'utf8')

assert.ok(
  detailSource.includes('updateTransactionLifecycleStage,'),
  'development detail should import transaction lifecycle updates for linked transactions',
)

assert.ok(
  detailSource.includes('const DEVELOPMENT_UNIT_STATUS_OPTIONS = [') &&
    detailSource.includes("{ value: 'OTP Signed', label: 'OTP'") &&
    detailSource.includes("{ value: 'Sold', label: 'Sold'") &&
    detailSource.includes("{ value: 'Registered', label: 'Registered'"),
  'development units should share a broad stock status vocabulary',
)

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
    detailSource.includes('await saveDevelopmentUnit(buildUnitQuickSavePayload(unit, { status: nextStatusValue }))'),
  'unit table should save quick status changes directly onto the stock row',
)

assert.ok(
  detailSource.includes('if (unit.currentTransactionId && statusOption.lifecycleStage)') &&
    detailSource.includes("source: 'development_unit_status_quick_update'"),
  'quick status changes should sync lifecycle only when an Arch9 transaction exists',
)

assert.ok(
  detailSource.includes('if (!row?.transaction?.id) {') &&
    detailSource.includes('return false') &&
    detailSource.includes("buyerDisplayName: row?.buyer?.name || 'No buyer assigned'"),
  'development transaction tab should only show rows backed by real transaction records',
)

assert.ok(
  !detailSource.includes('row.isManualUnitStatus') &&
    !detailSource.includes("buyerDisplayName: row?.buyer?.name || (isManualUnitStatus ? 'External / direct sale'"),
  'transaction row clicks should not fall back to the stock-master unit drawer',
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
