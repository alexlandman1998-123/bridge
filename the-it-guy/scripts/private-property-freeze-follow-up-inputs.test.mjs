import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const scriptPath = path.join(appRoot, 'scripts', 'private-property-freeze-follow-up-inputs.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch9-private-property-input-freeze-'))
const output = path.join(root, 'freeze.json')

assert.match(source, /confirmation_required:--freeze/)
assert.match(source, /offers_from_must_not_exceed_asking_price/)
assert.match(source, /agentContactStored: false/)
assert.match(source, /inputDigest/)

const valid = spawnSync(process.execPath, [
  scriptPath,
  '--freeze',
  '--new-property-id=PP-SANDBOX-SALE-RES-VIDEO-002',
  '--asking-price=1450000',
  '--offers-from=1400000',
  `--output=${output}`,
], { cwd: appRoot, encoding: 'utf8' })
assert.equal(valid.status, 0, valid.stderr)
const frozen = JSON.parse(fs.readFileSync(output, 'utf8'))
assert.equal(frozen.status, 'FROZEN')
assert.equal(frozen.inputs.saleLandOffersFrom, 1400000)
assert.equal(frozen.inputs.salesPricePresentation, 'OffersFrom')
assert.equal(frozen.safety.privatePropertyApiCalled, false)
assert.ok(frozen.inputDigest)

const blocked = spawnSync(process.execPath, [
  scriptPath,
  '--freeze',
  '--new-property-id=PP-SANDBOX-SALE-RES-VIDEO-001',
  '--asking-price=1000000',
  '--offers-from=1100000',
  `--output=${path.join(root, 'blocked.json')}`,
], { cwd: appRoot, encoding: 'utf8' })
assert.equal(blocked.status, 1)
assert.match(blocked.stdout, /new_property_id_must_differ_from_current_property_id/)
assert.match(blocked.stdout, /offers_from_must_not_exceed_asking_price/)

fs.rmSync(root, { recursive: true, force: true })
console.log('Private Property follow-up input freeze contract passed')
