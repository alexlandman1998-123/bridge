import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const scriptPath = path.join(appRoot, 'scripts', 'private-property-plan-follow-up-actions.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch9-private-property-follow-up-plan-'))
const output = path.join(outputDir, 'plan.json')

assert.match(source, /const FOLLOW_UP_ACTIONS = \[/)
assert.match(source, /rental-residential-per-week-hide-address/)
assert.match(source, /agent-user-2-inactive/)
assert.match(source, /sale-land-offers-from/)
assert.match(source, /follow_up_action_handlers_not_registered/)
assert.match(source, /baseline_not_captured_or_target_mismatch/)
assert.doesNotMatch(source, /createPrivatePropertyCliClient/)
assert.doesNotMatch(source, /updateListing\(/)
assert.doesNotMatch(source, /updateAgent\(/)
assert.doesNotMatch(source, /listingStatusUpdate\(/)

const result = spawnSync(process.execPath, [scriptPath, '--action=all', `--output=${output}`], {
  cwd: appRoot,
  encoding: 'utf8',
})
assert.equal(result.status, 0, result.stderr)
const report = JSON.parse(fs.readFileSync(output, 'utf8'))
assert.equal(report.status, 'DRY_RUN')
assert.equal(report.actions.length, 8)
assert.equal(report.safety.privatePropertyApiCalled, false)
assert.equal(report.safety.listingOrAgentChanged, false)
assert.equal(report.blockers.some((item) => item.startsWith('baseline_missing:')), true)

fs.rmSync(outputDir, { recursive: true, force: true })
console.log('Private Property follow-up action runner contract passed')
