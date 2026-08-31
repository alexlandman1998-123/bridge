import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const scriptPath = path.join(appRoot, 'scripts', 'private-property-run-phase11-rental-sequence.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arch9-private-property-phase11-rentals-'))
const freeze = path.join(root, 'freeze.json')
const phase10 = path.join(root, 'phase10.json')
const baseline = path.join(root, 'baseline.json')
const output = path.join(root, 'phase11.json')

assert.match(source, /prior_action_not_verified/)
assert.match(source, /agent_user_2_inactive_not_confirmed/)
assert.match(source, /apply_requires_exactly_one_phase11_action/)
assert.match(source, /agentContactStored: false/)
assert.match(source, /private-property-run-rental-follow-up\.mjs/)

fs.writeFileSync(freeze, `${JSON.stringify({ status: 'FROZEN', inputDigest: 'freeze-digest' })}\n`)
fs.writeFileSync(phase10, `${JSON.stringify({ status: 'CAPTURED', baseline: { inputFreezeDigest: 'freeze-digest' } })}\n`)
fs.writeFileSync(baseline, `${JSON.stringify({ status: 'CAPTURED' })}\n`)
const ready = spawnSync(process.execPath, [scriptPath, '--action=rental-residential-per-week-hide-address', `--freeze=${freeze}`, `--phase10=${phase10}`, `--baseline=${baseline}`, `--output=${output}`], { cwd: appRoot, encoding: 'utf8' })
assert.equal(ready.status, 0, ready.stderr)
const readyReport = JSON.parse(fs.readFileSync(output, 'utf8'))
assert.equal(readyReport.status, 'READY_TO_RUN')
assert.equal(readyReport.safety.privatePropertyApiCalled, false)

const blocked = spawnSync(process.execPath, [scriptPath, '--action=rental-commercial-add-agent-images', `--freeze=${freeze}`, `--phase10=${phase10}`, `--baseline=${baseline}`, `--output=${path.join(root, 'blocked.json')}`], { cwd: appRoot, encoding: 'utf8' })
assert.equal(blocked.status, 1)
assert.match(blocked.stdout, /prior_action_not_verified:rental-residential-per-week-hide-address/)

fs.rmSync(root, { recursive: true, force: true })
console.log('Private Property Phase 11 rental sequence contract passed')
