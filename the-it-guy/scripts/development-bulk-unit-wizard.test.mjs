import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'
import { parse } from '@babel/parser'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = join(__dirname, '..')

const source = readFileSync(join(root, 'src/pages/DevelopmentDetail.jsx'), 'utf8')

const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })
const steps = ast.program.body.flatMap(node => node.declarations || []).find(node => node.id?.name === 'BULK_UNIT_STEPS').init
assert.deepEqual(steps.elements.map(node => Object.fromEntries(node.properties.map(property => [property.key.name, property.value.value]))), [
  { id: 'breakdown', label: 'Unit Breakdown' },
  { id: 'numbering', label: 'Unit Numbers' },
  { id: 'options', label: 'Unit Options' },
  { id: 'phases', label: 'Building Phases' },
  { id: 'review', label: 'Review & Edit' },
], 'Bulk unit uploader should preserve all five ordered steps, independent of formatting.')

assert.match(
  source,
  /breakdownMode: 'individual'/,
  'Bulk unit form should capture whether units are individual or in blocks.',
)

assert.match(
  source,
  /blockPrefixMode: 'block'/,
  'Bulk unit form should support block-prefixed unit numbering.',
)

const unitOptions = ast.program.body.flatMap(node => node.declarations || []).find(node => node.id?.name === 'DEFAULT_BULK_UNIT_FORM').init.properties.find(property => property.key.name === 'unitOptions').value.properties
for (const [key,label] of [['oneBed','1 Bed'],['twoBed','2 Bed'],['threeBed','3 Bed']]) {
  const fields = Object.fromEntries(unitOptions.find(property => property.key.name === key).value.properties.map(property => [property.key.name, property.value.value]))
  assert.equal(typeof fields.enabled,'boolean')
  if (key === 'oneBed') assert.equal(fields.enabled,true)
  assert.equal(fields.label,label)
}

assert.match(
  source,
  /function buildBulkUnitRows\(form = \{\}\)/,
  'Bulk unit rows should be generated from the completed wizard inputs.',
)

assert.match(
  source,
  /function updateBulkGeneratedRow\(rowIndex, patch\)/,
  'Generated unit rows should be quick editable before creation.',
)

assert.match(
  source,
  /bulkUnitForm\.generatedRows\.map\(\(row, index\) =>[\s\S]*updateBulkGeneratedRow\(index,\s*\{\s*unitType: event\.target\.value\s*\}\)[\s\S]*updateBulkGeneratedRow\(index,\s*\{\s*listPrice: event\.target\.value\s*\}\)/,
  'Review table should allow quick editing unit type and price.',
)

assert.match(
  source,
  /await saveDevelopmentUnitsBatch\(data\.development\.id, generatedRows\)/,
  'Bulk creation must commit the reviewed rows through one atomic batch command.',
)
assert.doesNotMatch(source, /generatedRows\.map\(\(row\) =>\s*saveDevelopmentUnit\(/,
  'Bulk creation must not split the batch into independent stock writes.')

console.log('development-bulk-unit-wizard checks passed')
