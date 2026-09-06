import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const matrix = JSON.parse(readFileSync('config/agent-scale-phase2-action-matrix.json', 'utf8'))
const smoke = readFileSync('scripts/agent-scale-phase2-functional-smoke.mjs', 'utf8')
const agents = readFileSync('src/pages/Agents.jsx', 'utf8')
const dashboard = readFileSync('src/pages/PrincipalDashboard.jsx', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

assert.equal(matrix.contract, 'arch9-agent-scale-phase2-action-matrix-v1')
assert.ok(matrix.safeScenarios.length >= 6)
for (const scenario of matrix.safeScenarios) {
  assert.ok(scenario.name && scenario.route && scenario.steps.length && scenario.expect)
}
for (const required of ['quick_create_opens', 'quick_create_lead_opens_dialog', 'transactions_navigation_survives_reload', 'pipeline_leads_navigation_survives_reload', 'settings_navigation_survives_reload', 'enquiries_search_accepts_input']) {
  assert.ok(matrix.safeScenarios.some((scenario) => scenario.name === required), `Missing safe scenario: ${required}`)
}

const placeholderModes = [...agents.matchAll(/openPlaceholder\('([^']+)'\)/g)].map((match) => match[1])
assert.deepEqual([...new Set(placeholderModes)].sort(), matrix.allowedPlaceholders, 'Visible placeholder actions changed; classify or remove them explicitly.')
assert.match(smoke, /survivesReload/)
assert.match(smoke, /mutation_or_external_effect/)
assert.match(smoke, /Unexpected browser error/)
assert.match(smoke, /Unexpected failed request/)
assert.match(smoke, /useDevBypass && \/\^\\\[PrincipalDashboard/, 'Only local dev bypass may classify the known unauthenticated dashboard fetch as expected noise.')
assert.match(dashboard, /Invalidate in-flight reads/)
assert.match(dashboard, /dashboardLoadSequenceRef\.current \+= 1/)

for (const script of ['test:agent-scale-phase2', 'smoke:agent-scale-phase2', 'verify:agent-scale-phase2']) {
  assert.equal(typeof packageJson.scripts[script], 'string', `Missing package script: ${script}`)
}
assert.match(packageJson.scripts['verify:agent-scale-phase2'], /verify:agent-scale-phase1/)

console.log('Agent scale Phase 2 functional contracts passed.')
