import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const agentsSource = fs.readFileSync(path.join(root, 'src/pages/Agents.jsx'), 'utf8')
const commissionServiceSource = fs.readFileSync(path.join(root, 'src/services/commissionService.js'), 'utf8')

function sourceBlock(source, startToken, endToken) {
  const start = source.indexOf(startToken)
  assert.notEqual(start, -1, `missing source token: ${startToken}`)
  const end = source.indexOf(endToken, start + startToken.length)
  assert.notEqual(end, -1, `missing end token after ${startToken}: ${endToken}`)
  return source.slice(start, end)
}

assert.equal(
  packageJson.scripts['test:agent-commission-phase6'],
  'node scripts/agent-commission-structure-phase6.test.mjs',
  'package script should expose the agent commission phase 6 regression',
)

const safeSelectBlock = sourceBlock(
  commissionServiceSource,
  'async function safeSelect',
  'async function safeMaybeSingle',
)
assert.match(
  safeSelectBlock,
  /typeof variant === 'string' \? \{ fields: variant, filters: \[\] \}/,
  'safeSelect should accept per-variant select metadata',
)
assert.match(
  safeSelectBlock,
  /\[\.\.\.filters, \.\.\.variant\.filters\]/,
  'safeSelect should apply variant-specific filters after global filters',
)

const targetReadBlock = sourceBlock(
  commissionServiceSource,
  'async function getCommissionTargets',
  'export async function updateCommissionTarget',
)
assert.ok(targetReadBlock.includes('targetSelectVariants'), 'target reads should choose metric-aware and legacy select variants')
assert.ok(targetReadBlock.includes('TARGET_SELECT_FIELDS_WITH_METRIC'), 'target reads should try the metric schema first')
assert.ok(targetReadBlock.includes('TARGET_SELECT_FIELDS_LEGACY'), 'target reads should fall back to the legacy schema')
assert.ok(
  targetReadBlock.includes("filters: [{ column: 'target_metric', value: normalizedMetric }]"),
  'target reads should scope metric filtering to the metric-aware variant only',
)
assert.ok(
  targetReadBlock.includes('normalizeTarget(row, targetMetric ? { targetMetric: normalizedMetric } : {})'),
  'legacy target rows should retain the requested metric in normalized output',
)

const targetWriteBlock = sourceBlock(
  commissionServiceSource,
  'export async function updateCommissionTarget',
  'function getDealValue',
)
assert.ok(targetWriteBlock.includes('const buildClearQuery'), 'target writes should reuse clear query construction')
assert.ok(targetWriteBlock.includes('includeMetric = true'), 'target writes should clear metric-specific rows first')
assert.ok(targetWriteBlock.includes("query = query.eq('target_metric', targetMetric)"), 'metric-aware clears should include target_metric')
assert.ok(targetWriteBlock.includes('buildClearQuery({ includeMetric: false })'), 'target writes should retry legacy clears without target_metric')
assert.ok(targetWriteBlock.includes('TARGET_SELECT_FIELDS_WITH_METRIC'), 'target writes should insert/select the metric schema first')
assert.ok(targetWriteBlock.includes('TARGET_SELECT_FIELDS_LEGACY'), 'target writes should retry insert/select against legacy schema')
assert.ok(targetWriteBlock.includes('const { target_metric: _targetMetric, ...legacyPayload } = payload'), 'legacy insert should remove target_metric from payload')
assert.ok(targetWriteBlock.includes('normalizeTarget(legacyResult.data, { targetMetric })'), 'legacy insert result should preserve requested metric')

const modalBlock = sourceBlock(
  agentsSource,
  "{modalMode === 'commission' ? (",
  ") : modalMode === 'permissions' ? (",
)
assert.ok(modalBlock.includes('Company Target Period'), 'browser smoke contract should keep the target period control visible')
assert.ok(modalBlock.includes('Commission to Company Target'), 'browser smoke contract should keep the target amount control visible')
assert.ok(agentsSource.includes('commissionSummaryLoading'), 'browser save should wait for target hydration')

console.log('agent commission structure phase 6 checks passed')
