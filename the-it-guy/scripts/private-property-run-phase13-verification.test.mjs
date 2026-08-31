import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const scriptPath = path.join(appRoot, 'scripts', 'private-property-run-phase13-verification.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch9-private-property-phase13-verification-'))
const freeze = path.join(root, 'freeze.json')
const baseline = path.join(root, 'baseline.json')
const execution = path.join(root, 'execution.json')
const output = path.join(root, 'phase13.json')

assert.match(source, /private-property-verify-follow-up-action\.mjs/)
assert.match(source, /action_execution_not_confirmed/)
assert.match(source, /saleResidentialNewPropertyId/)
assert.match(source, /saleLandOffersFrom/)
assert.match(source, /PENDING_MANUAL_CHECK/)
assert.match(source, /rawCredentialsStored: false/)

fs.writeFileSync(freeze, `${JSON.stringify({ status: 'FROZEN', inputDigest: 'freeze-digest', inputs: { saleResidentialNewPropertyId: 'PP-SANDBOX-SALE-RES-VIDEO-002', saleLandOffersFrom: 1400000 } })}\n`)
fs.writeFileSync(baseline, '{"status":"CAPTURED"}\n')
fs.writeFileSync(execution, '{"actionId":"sale-land-offers-from","status":"SUBMITTED"}\n')
const ready = spawnSync(process.execPath, [scriptPath, '--action=sale-land-offers-from', `--freeze=${freeze}`, `--baseline=${baseline}`, `--execution-report=${execution}`, `--output=${output}`], { cwd: appRoot, encoding: 'utf8' })
assert.equal(ready.status, 0, ready.stderr)
const readyReport = JSON.parse(fs.readFileSync(output, 'utf8'))
assert.equal(readyReport.status, 'READY_TO_VERIFY')
assert.equal(readyReport.safety.privatePropertyApiCalled, false)

fs.writeFileSync(execution, '{"actionId":"sale-land-offers-from","status":"ATTENTION_REQUIRED"}\n')
const blocked = spawnSync(process.execPath, [scriptPath, '--action=sale-land-offers-from', `--freeze=${freeze}`, `--baseline=${baseline}`, `--execution-report=${execution}`, `--output=${path.join(root, 'blocked.json')}`], { cwd: appRoot, encoding: 'utf8' })
assert.equal(blocked.status, 1)
assert.match(blocked.stdout, /action_execution_not_confirmed/)

fs.rmSync(root, { recursive: true, force: true })
console.log('Private Property Phase 13 verification contract passed')
