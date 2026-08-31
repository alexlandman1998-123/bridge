import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const scriptPath = path.join(appRoot, 'scripts', 'private-property-prepare-follow-up-return-package.mjs')
const followUpRows = [
  'rental-residential-per-week-hide-address',
  'rental-commercial-add-agent-images',
  'agent-user-2-inactive',
  'rental-commercial-to-residential',
  'sale-residential-change-unique-id',
  'sale-commercial-cancel-showday-reduce-price',
  'sale-farm-reorder-agents',
  'sale-land-offers-from',
]
const source = fs.readFileSync(scriptPath, 'utf8')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch9-private-property-return-package-'))
const workbook = path.join(root, 'private-property-follow-up-completed.xlsx')
const completionReport = path.join(root, 'completion.json')
const packagePath = path.join(root, 'return-package.json')
const draftPath = path.join(root, 'reply.md')

assert.match(source, /completion_workbook_not_exported/)
assert.match(source, /emailSent: false/)
assert.match(source, /sha256/)
assert.match(source, /emailBody/)

fs.writeFileSync(workbook, 'private-property-workbook-fixture')
fs.writeFileSync(completionReport, `${JSON.stringify({
  status: 'EXPORTED',
  output: workbook,
  plan: { status: 'READY_TO_EXPORT', rows: followUpRows.map((actionId) => ({ actionId, completed: true })) },
})}\n`)
const result = spawnSync(process.execPath, [
  scriptPath,
  `--completion-report=${completionReport}`,
  `--output=${packagePath}`,
  `--email-draft=${draftPath}`,
  '--recipient=onboarding@privateproperty.co.za',
], { cwd: appRoot, encoding: 'utf8' })
assert.equal(result.status, 0, result.stderr)
const returnPackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
assert.equal(returnPackage.status, 'READY_TO_SEND')
assert.equal(returnPackage.attachment.sha256, crypto.createHash('sha256').update('private-property-workbook-fixture').digest('hex'))
assert.match(fs.readFileSync(draftPath, 'utf8'), /completed spreadsheet/)
assert.equal(returnPackage.safety.emailSent, false)

const blocked = spawnSync(process.execPath, [scriptPath, `--completion-report=${completionReport}`, `--output=${path.join(root, 'blocked.json')}`], { cwd: appRoot, encoding: 'utf8' })
assert.equal(blocked.status, 1)
assert.match(blocked.stdout, /missing_recipient/)

fs.rmSync(root, { recursive: true, force: true })
console.log('Private Property follow-up return package contract passed')
