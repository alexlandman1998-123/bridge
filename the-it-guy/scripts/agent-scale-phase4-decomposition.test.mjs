import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'

const config = JSON.parse(readFileSync('config/agent-scale-phase4-decomposition-budgets.json', 'utf8'))
const agents = readFileSync('src/pages/Agents.jsx', 'utf8')
const workspaceUi = readFileSync('src/components/agents/AgentWorkspaceUi.jsx', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

assert.equal(config.contract, 'arch9-agent-scale-phase4-decomposition-budgets-v1')
for (const [file, budget] of Object.entries(config.sourceLineBudgets)) {
  const lineCount = readFileSync(file, 'utf8').split(/\r?\n/).length
  assert.ok(lineCount <= budget, `${file} has ${lineCount} lines; Phase 4 budget is ${budget}. Extract a coherent module instead of raising the ceiling.`)
}

for (const component of ['AgentManagementCard', 'AgentWorkspaceKpiCard', 'DetailInfoRow', 'EmptyWorkspaceState', 'LockedAgentFilterChip', 'PrincipalAgentTabShell', 'WorkspaceCard']) {
  assert.match(workspaceUi, new RegExp(`export function ${component}\\b`), `Missing extracted workspace component: ${component}`)
  assert.doesNotMatch(agents, new RegExp(`function ${component}\\b`), `${component} must not return to the Agents route monolith.`)
}
assert.match(agents, /from '\.\.\/components\/agents\/AgentWorkspaceUi'/)

if (statExists('dist/assets')) {
  const assets = readdirSync('dist/assets')
  for (const [prefix, budget] of Object.entries(config.routeChunkByteBudgets)) {
    const matches = assets.filter((file) => new RegExp(`^${prefix}-[^.]+\\.js$`).test(file))
    assert.equal(matches.length, 1, `Expected one built ${prefix} route chunk, found ${matches.length}.`)
    const bytes = statSync(`dist/assets/${matches[0]}`).size
    assert.ok(bytes <= budget, `${prefix} chunk is ${bytes} bytes; Phase 4 budget is ${budget}.`)
  }
}

for (const script of ['test:agent-scale-phase4', 'verify:agent-scale-phase4']) {
  assert.equal(typeof packageJson.scripts[script], 'string', `Missing package script: ${script}`)
}
assert.match(packageJson.scripts['verify:agent-scale-phase4'], /verify:agent-scale-phase3/)

console.log('Agent scale Phase 4 decomposition checks passed.')

function statExists(file) {
  try { return statSync(file).isDirectory() } catch { return false }
}
