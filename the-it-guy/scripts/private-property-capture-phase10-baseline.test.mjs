import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const scriptPath = path.join(appRoot, 'scripts', 'private-property-capture-phase10-baseline.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch9-private-property-phase10-baseline-'))
const freeze = path.join(root, 'freeze.json')
const output = path.join(root, 'phase10.json')

assert.match(source, /private-property-capture-sandbox-baseline\.mjs/)
assert.match(source, /phase9_input_freeze_missing/)
assert.match(source, /inputFreezeDigest/)
assert.match(source, /privatePropertyApiCalled: false/)
assert.match(source, /--capture/)

fs.writeFileSync(freeze, `${JSON.stringify({
  phase: 'private-property-sandbox-phase9-input-freeze',
  status: 'FROZEN',
  inputDigest: 'a'.repeat(64),
  inputs: {
    saleResidentialNewPropertyId: 'PP-SANDBOX-SALE-RES-VIDEO-002',
    saleLandAskingPrice: 1450000,
    saleLandOffersFrom: 1400000,
  },
})}\n`)
const ready = spawnSync(process.execPath, [scriptPath, `--freeze=${freeze}`, `--output=${output}`], { cwd: appRoot, encoding: 'utf8' })
assert.equal(ready.status, 0, ready.stderr)
const readyReport = JSON.parse(fs.readFileSync(output, 'utf8'))
assert.equal(readyReport.status, 'READY_TO_CAPTURE')
assert.equal(readyReport.safety.privatePropertyApiCalled, false)
assert.equal(readyReport.inputFreeze.inputDigest, 'a'.repeat(64))

const blocked = spawnSync(process.execPath, [scriptPath, `--freeze=${path.join(root, 'missing.json')}`, `--output=${path.join(root, 'blocked.json')}`], { cwd: appRoot, encoding: 'utf8' })
assert.equal(blocked.status, 1)
assert.match(blocked.stdout, /phase9_input_freeze_missing/)

fs.rmSync(root, { recursive: true, force: true })
console.log('Private Property Phase 10 baseline contract passed')
