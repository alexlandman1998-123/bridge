import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PRIVATE_PROPERTY_FOLLOW_UP_ROWS } from './private-property-follow-up-workbook-model.mjs'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const scriptPath = path.join(appRoot, 'scripts', 'private-property-run-phase15-return-package.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch9-private-property-phase15-return-package-'))
const workbook = path.join(root, 'completed.xlsx')
const completion = path.join(root, 'completion.json')
const phase14 = path.join(root, 'phase14.json')
const output = path.join(root, 'phase15.json')

assert.match(source, /private-property-prepare-follow-up-return-package\.mjs/)
assert.match(source, /phase14_workbook_not_exported/)
assert.match(source, /emailSent: false/)
assert.match(source, /--prepare/)

fs.writeFileSync(workbook, 'completed workbook fixture')
fs.writeFileSync(completion, `${JSON.stringify({
  status: 'EXPORTED',
  output: workbook,
  plan: { status: 'READY_TO_EXPORT', rows: PRIVATE_PROPERTY_FOLLOW_UP_ROWS.map((item) => ({ actionId: item.actionId, completed: true })) },
})}\n`)
fs.writeFileSync(phase14, `${JSON.stringify({ status: 'EXPORTED', workbookOutput: workbook, workbookReport: completion })}\n`)
const ready = spawnSync(process.execPath, [scriptPath, `--phase14=${phase14}`, '--recipient=onboarding@privateproperty.co.za', `--output=${output}`], { cwd: appRoot, encoding: 'utf8' })
assert.equal(ready.status, 0, ready.stderr)
const readyReport = JSON.parse(fs.readFileSync(output, 'utf8'))
assert.equal(readyReport.status, 'READY_TO_PREPARE')
assert.equal(readyReport.safety.emailSent, false)

const blocked = spawnSync(process.execPath, [scriptPath, `--phase14=${path.join(root, 'missing.json')}`, '--recipient=onboarding@privateproperty.co.za', `--output=${path.join(root, 'blocked.json')}`], { cwd: appRoot, encoding: 'utf8' })
assert.equal(blocked.status, 1)
assert.match(blocked.stdout, /phase14_workbook_not_exported/)

fs.rmSync(root, { recursive: true, force: true })
console.log('Private Property Phase 15 return package contract passed')
