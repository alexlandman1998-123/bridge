import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PRIVATE_PROPERTY_FOLLOW_UP_ROWS } from './private-property-follow-up-workbook-model.mjs'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const scriptPath = path.join(appRoot, 'scripts', 'private-property-run-phase14-workbook-export.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch9-private-property-phase14-workbook-'))
const evidenceDir = path.join(root, 'evidence')
fs.mkdirSync(evidenceDir)
const freeze = path.join(root, 'freeze.json')
const phase10 = path.join(root, 'phase10.json')
const workbookTemplate = path.join(root, 'template.xlsx')
const output = path.join(root, 'phase14.json')

assert.match(source, /private-property-complete-follow-up-workbook\.mjs/)
assert.match(source, /phase10_baseline_not_bound_to_freeze/)
assert.match(source, /spreadsheet_template_missing/)
assert.match(source, /workbookEdited: false/)
assert.match(source, /--export/)

fs.writeFileSync(freeze, '{"status":"FROZEN","inputDigest":"freeze-digest"}\n')
fs.writeFileSync(phase10, '{"status":"CAPTURED","baseline":{"inputFreezeDigest":"freeze-digest"}}\n')
fs.writeFileSync(workbookTemplate, 'template fixture')
for (const action of PRIVATE_PROPERTY_FOLLOW_UP_ROWS) {
  const fileName = action.agentOnly ? 'private-property-verify-agent-user-2-inactive.json' : `private-property-verify-${action.actionId}.json`
  const status = action.agentOnly ? 'VERIFIED' : 'VERIFIED'
  fs.writeFileSync(path.join(evidenceDir, fileName), `${JSON.stringify({ status, actionId: action.actionId, verification: { observed: { privatePropertyReference: action.reference } } })}\n`)
}
const ready = spawnSync(process.execPath, [scriptPath, `--freeze=${freeze}`, `--phase10=${phase10}`, `--source=${workbookTemplate}`, `--evidence-dir=${evidenceDir}`, `--agent-evidence=${path.join(evidenceDir, 'private-property-verify-agent-user-2-inactive.json')}`, `--output=${output}`], { cwd: appRoot, encoding: 'utf8' })
assert.equal(ready.status, 0, ready.stderr)
const readyReport = JSON.parse(fs.readFileSync(output, 'utf8'))
assert.equal(readyReport.status, 'READY_TO_EXPORT')
assert.equal(readyReport.safety.workbookEdited, false)

fs.rmSync(root, { recursive: true, force: true })
console.log('Private Property Phase 14 workbook export contract passed')
