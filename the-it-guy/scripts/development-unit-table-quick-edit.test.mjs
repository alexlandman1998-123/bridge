import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const detailSource = readFileSync(resolve(root, 'src/pages/DevelopmentDetail.jsx'), 'utf8')
const apiSource = readFileSync(resolve(root, 'src/lib/api.js'), 'utf8')

assert.match(
  detailSource,
  /\[\s*'Block',\s*'Unit Number',\s*'Purchaser',\s*'Status',\s*'Sales Price',\s*'Handover Date',\s*'Floorplan',\s*\]/,
  'units table headers should be ordered Block, Unit Number, Purchaser, Status, Sales Price, Handover Date, Floorplan',
)

assert.ok(
  detailSource.includes('const UNIT_QUICK_FIELD_CLASS ='),
  'unit table should use inline quick-edit field styling',
)

assert.ok(
  detailSource.includes('async function handleUnitQuickSave(unit, patch') &&
    detailSource.includes('Unit ${nextUnitNumber} already exists in this development.'),
  'unit quick edits should save through a shared handler and prevent duplicate unit numbers',
)

assert.ok(
  detailSource.includes('updateDevelopmentTransactionSalesPrice(unit.currentTransactionId, nextSalesPrice)'),
  'sales price quick edits should update linked transaction prices when a transaction exists',
)

assert.ok(
  detailSource.includes('async function handleUnitHandoverDateQuickChange(unit, nextDate)') &&
    detailSource.includes('upsertTransactionHandover({'),
  'handover date quick edits should use the transaction handover API',
)

assert.ok(
  detailSource.includes('function applyUnitQuickUpdate(unitId,') &&
    detailSource.includes('applyUnitQuickUpdate(unit.id, {'),
  'inline unit edits should update only the changed Stock Master row locally',
)

for (const handlerName of [
  'handleUnitQuickSave',
  'handleUnitHandoverDateQuickChange',
  'handleUnitStatusQuickChange',
]) {
  const handlerSource = detailSource.match(
    new RegExp(`async function ${handlerName}\\([\\s\\S]*?(?=\\n  (?:async )?function |\\n  function |\\n  const )`),
  )?.[0]
  assert.ok(handlerSource, `${handlerName} should be defined`)
  assert.ok(!handlerSource.includes('await loadData()'), `${handlerName} should not reload the entire development page`)
}

assert.ok(
  detailSource.includes('floorplanDocumentOptions.map((item) => (') &&
    detailSource.includes("field: 'floorplanId'"),
  'floorplan quick edits should use existing floorplan document options',
)

assert.ok(
  !detailSource.includes('className="cursor-pointer transition hover:bg-[#f8fbff]" onClick={() => openUnitModal(unit)}'),
  'unit rows should no longer force agents into the unit modal for table edits',
)

assert.ok(
  apiSource.includes('export async function updateDevelopmentTransactionSalesPrice') &&
    apiSource.includes('purchase_price: normalizedPrice'),
  'API should expose a focused helper for linked transaction sales price quick edits',
)

console.log('development unit table quick-edit checks passed')
