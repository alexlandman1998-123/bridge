import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const scriptPath = path.join(appRoot, 'scripts', 'private-property-deactivate-sandbox-user-2.mjs')
const source = fs.readFileSync(scriptPath, 'utf8')
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch9-private-property-agent-deactivate-'))
const baselinePath = path.join(outputDir, 'baseline.json')
const output = path.join(outputDir, 'agent-lifecycle.json')

assert.match(source, /ARCH9-SANDBOX-USER-2/)
assert.match(source, /--inactive/)
assert.match(source, /--apply/)
assert.match(source, /private-property-create-agent\.mjs/)
assert.match(source, /retryAttempted: false/)
assert.match(source, /private_property_agent_update_not_confirmed/)
assert.doesNotMatch(source, /createPrivatePropertyClient/)
assert.doesNotMatch(source, /updateAgent\(/)

fs.writeFileSync(baselinePath, `${JSON.stringify({
  phase: 'private-property-sandbox-phase1-baseline',
  status: 'CAPTURED',
  baseline: { agents: [{ agentId: 'ARCH9-SANDBOX-USER-2' }] },
}, null, 2)}\n`)
const result = spawnSync(process.execPath, [scriptPath, `--baseline=${baselinePath}`, `--output=${output}`], {
  cwd: appRoot,
  encoding: 'utf8',
})
assert.equal(result.status, 0, result.stderr)
const report = JSON.parse(fs.readFileSync(output, 'utf8'))
assert.equal(report.status, 'DRY_RUN')
assert.equal(report.baseline.ready, true)
assert.equal(report.safety.privatePropertyApiCalled, false)
assert.equal(report.safety.listingOrAgentChanged, false)
assert.equal(report.agent.intendedActive, false)

fs.rmSync(outputDir, { recursive: true, force: true })
console.log('Private Property Sandbox User 2 deactivation contract passed')
