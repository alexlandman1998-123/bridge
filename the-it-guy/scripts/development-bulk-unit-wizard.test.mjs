import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = join(__dirname, '..')

const source = readFileSync(join(root, 'src/pages/DevelopmentDetail.jsx'), 'utf8')

assert.match(
  source,
  /const BULK_UNIT_STEPS = \[\s*\{ id: 'breakdown', label: 'Unit Breakdown' \},\s*\{ id: 'numbering', label: 'Unit Numbers' \},\s*\{ id: 'options', label: 'Unit Options' \},\s*\{ id: 'phases', label: 'Building Phases' \},\s*\{ id: 'review', label: 'Review & Edit' \},/s,
  'Bulk unit uploader should be a five-step guided wizard.',
)

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

assert.match(
  source,
  /unitOptions:\s*\{\s*oneBed: \{ enabled: true, label: '1 Bed'/s,
  'Bulk unit form should include 1 bed, 2 bed, and 3 bed unit options.',
)

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
  /bulkUnitForm\.generatedRows\.map\(\(row, index\) =>[\s\S]*updateBulkGeneratedRow\(index, \{ unitType: event\.target\.value \}\)[\s\S]*updateBulkGeneratedRow\(index, \{ listPrice: event\.target\.value \}\)/,
  'Review table should allow quick editing unit type and price.',
)

assert.match(
  source,
  /generatedRows\.map\(\(row\) =>\s*saveDevelopmentUnit\(\{[\s\S]*unitNumber: row\.unitNumber,[\s\S]*unitType: row\.unitType,[\s\S]*listPrice: row\.listPrice === '' \? 0 : row\.listPrice,/,
  'Bulk creation should save the reviewed generated rows, including edited type and price.',
)

console.log('development-bulk-unit-wizard checks passed')
