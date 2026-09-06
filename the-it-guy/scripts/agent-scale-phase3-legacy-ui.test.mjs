import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const agents = readFileSync('src/pages/Agents.jsx', 'utf8')
const app = readFileSync('src/App.jsx', 'utf8')
const actionMatrix = JSON.parse(readFileSync('config/agent-scale-phase2-action-matrix.json', 'utf8'))
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

assert.deepEqual(actionMatrix.allowedPlaceholders, [], 'Scale Phase 3 permits no interactive Agent management placeholders.')
assert.doesNotMatch(agents, /openPlaceholder/)
assert.doesNotMatch(agents, /intentionally staged as a safe management placeholder/)
assert.doesNotMatch(agents, /requires the connected account workflow\. Nothing was changed yet/)
assert.doesNotMatch(agents, /setPendingAction\(/)
assert.doesNotMatch(agents, /onCreateTransaction=\{\(\) =>/)

for (const capability of [
  'messaging is not connected',
  'calling is not connected',
  'Deal assignment is not connected',
  'Listing assignment is not connected',
  'notification preferences are not connected',
  'team allocation is not connected',
  'account deactivation is not connected',
  'organisation removal is not connected',
]) {
  assert.match(agents, new RegExp(capability), `Missing explicit unavailable state: ${capability}`)
}

for (const mode of ['profile', 'permissions', 'commission']) {
  assert.match(agents, new RegExp(`openManagementModal\\('${mode}'\\)`), `${mode} must retain its working management modal.`)
}
assert.match(agents, /open=\{\['commission', 'permissions', 'profile'\]\.includes\(modalMode\)\}/)

assert.match(app, /path="\/agents"[\s\S]{0,180}<Navigate to="\/agency\/agents" replace/)
assert.doesNotMatch(app, /AgentReportingPage/)

for (const script of ['test:agent-scale-phase3', 'verify:agent-scale-phase3']) {
  assert.equal(typeof packageJson.scripts[script], 'string', `Missing package script: ${script}`)
}
assert.match(packageJson.scripts['verify:agent-scale-phase3'], /verify:agent-scale-phase2/)

console.log('Agent scale Phase 3 legacy UI checks passed.')
