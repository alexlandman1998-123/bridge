import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const scriptPath = path.join(appRoot, 'scripts', 'private-property-run-phase12-sale-sequence.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch9-private-property-phase12-sales-'))
const evidenceDir = path.join(root, 'evidence')
fs.mkdirSync(evidenceDir)
const freeze = path.join(root, 'freeze.json')
const phase10 = path.join(root, 'phase10.json')
const baseline = path.join(root, 'baseline.json')
const output = path.join(root, 'phase12.json')

assert.match(source, /phase11_rental_sequence_not_verified/)
assert.match(source, /prior_action_not_verified/)
assert.match(source, /saleResidentialNewPropertyId/)
assert.match(source, /saleLandOffersFrom/)
assert.match(source, /private-property-run-sale-follow-up\.mjs/)
assert.match(source, /apply_requires_exactly_one_phase12_action/)

fs.writeFileSync(freeze, `${JSON.stringify({ status: 'FROZEN', inputDigest: 'freeze-digest', inputs: { saleResidentialNewPropertyId: 'PP-SANDBOX-SALE-RES-VIDEO-002', saleLandOffersFrom: 1400000 } })}\n`)
fs.writeFileSync(phase10, `${JSON.stringify({ status: 'CAPTURED', baseline: { inputFreezeDigest: 'freeze-digest' } })}\n`)
fs.writeFileSync(baseline, `${JSON.stringify({ status: 'CAPTURED' })}\n`)
for (const fileName of [
  'private-property-verify-rental-residential-per-week-hide-address.json',
  'private-property-verify-rental-commercial-add-agent-images.json',
  'private-property-verify-rental-commercial-to-residential.json',
]) fs.writeFileSync(path.join(evidenceDir, fileName), '{"status":"VERIFIED"}\n')
fs.writeFileSync(path.join(evidenceDir, 'private-property-sandbox-user-2-inactive.json'), '{"status":"COMPLETED"}\n')

const ready = spawnSync(process.execPath, [scriptPath, '--action=sale-residential-change-unique-id', `--freeze=${freeze}`, `--phase10=${phase10}`, `--baseline=${baseline}`, `--evidence-dir=${evidenceDir}`, `--output=${output}`], { cwd: appRoot, encoding: 'utf8' })
assert.equal(ready.status, 0, ready.stderr)
const readyReport = JSON.parse(fs.readFileSync(output, 'utf8'))
assert.equal(readyReport.status, 'READY_TO_RUN')
assert.equal(readyReport.safety.privatePropertyApiCalled, false)

const blocked = spawnSync(process.execPath, [scriptPath, '--action=sale-commercial-cancel-showday-reduce-price', `--freeze=${freeze}`, `--phase10=${phase10}`, `--baseline=${baseline}`, `--evidence-dir=${evidenceDir}`, `--output=${path.join(root, 'blocked.json')}`], { cwd: appRoot, encoding: 'utf8' })
assert.equal(blocked.status, 1)
assert.match(blocked.stdout, /prior_action_not_verified:sale-residential-change-unique-id/)

fs.rmSync(root, { recursive: true, force: true })
console.log('Private Property Phase 12 sale sequence contract passed')
