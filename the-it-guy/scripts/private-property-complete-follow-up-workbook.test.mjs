import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildPrivatePropertyWorkbookCompletionPlan } from './private-property-follow-up-workbook-model.mjs'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const scriptPath = path.join(appRoot, 'scripts', 'private-property-complete-follow-up-workbook.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch9-private-property-workbook-completion-'))
const reportPath = path.join(outputDir, 'plan.json')

assert.match(source, /SpreadsheetFile\.importXlsx/)
assert.match(source, /SpreadsheetFile\.exportXlsx/)
assert.match(source, /sheet\.getRange\(`C\$\{row\}`\)/)
assert.match(source, /sheet\.getRange\(`F\$\{row\}`\)/)
assert.match(source, /sheet\.getRange\(`G\$\{row\}`\)/)
assert.match(source, /--apply/)

const blockedPlan = buildPrivatePropertyWorkbookCompletionPlan({ outputDir })
assert.equal(blockedPlan.status, 'BLOCKED')
assert.equal(blockedPlan.blockers.length, 8)
for (const actionId of [
  'rental-residential-per-week-hide-address',
  'rental-commercial-add-agent-images',
  'rental-commercial-to-residential',
  'sale-residential-change-unique-id',
  'sale-commercial-cancel-showday-reduce-price',
  'sale-farm-reorder-agents',
  'sale-land-offers-from',
]) {
  fs.writeFileSync(path.join(outputDir, `private-property-verify-${actionId}.json`), `${JSON.stringify({ status: 'VERIFIED', verification: { observed: { privatePropertyReference: '' } } })}\n`)
}
fs.writeFileSync(path.join(outputDir, 'private-property-sandbox-user-2-inactive.json'), `${JSON.stringify({ status: 'COMPLETED', actionId: 'agent-user-2-inactive', agent: { agentId: 'ARCH9-SANDBOX-USER-2' } })}\n`)
const readyPlan = buildPrivatePropertyWorkbookCompletionPlan({ outputDir })
assert.equal(readyPlan.status, 'READY_TO_EXPORT')
assert.equal(readyPlan.updates.find((item) => item.row === 3).agentId, 'ARCH9-SANDBOX-USER-2')
assert.equal(readyPlan.updates.find((item) => item.row === 4).agentId, 'ARCH9-SANDBOX-USER-1')

const result = spawnSync(process.execPath, [scriptPath, `--evidence-dir=${outputDir}`, `--report=${reportPath}`], {
  cwd: appRoot,
  encoding: 'utf8',
})
assert.equal(result.status, 0, result.stderr)
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
assert.equal(report.status, 'DRY_RUN_READY')
assert.equal(report.safety.workbookEdited, false)

fs.rmSync(outputDir, { recursive: true, force: true })
console.log('Private Property follow-up workbook completion contract passed')
