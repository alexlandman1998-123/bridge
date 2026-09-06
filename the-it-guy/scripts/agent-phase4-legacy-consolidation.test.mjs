import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')
const app = read('src/App.jsx')
const principalDashboard = read('src/pages/PrincipalDashboard.jsx')
const commandCenter = read('src/components/dashboard/BridgeCommandCenterDashboard.jsx')
const agents = read('src/pages/Agents.jsx')

for (const [name, source] of [
  ['Principal dashboard', principalDashboard],
  ['Bridge command centre', commandCenter],
  ['Agent directory', agents],
]) {
  assert.doesNotMatch(source, /(?:navigate|goTo)\((?:`|'|")\/agents(?:\/|`|'|")/, `${name} must not create new traffic through the legacy Agent route.`)
  assert.doesNotMatch(source, /(?:navigate|goTo)\((?:`|'|")\/agent\/agents(?:\/|`|'|")/, `${name} must not use the duplicate singular Agent route.`)
}

assert.match(principalDashboard, /navigate\('\/agency\/agents'\)/, 'Principal dashboard must link directly to the canonical directory.')
assert.match(principalDashboard, /navigate\(`\/agency\/agents\/\$\{agent\.agentId\}`\)/, 'Principal dashboard must link directly to canonical agent workspaces.')
assert.match(commandCenter, /goTo\('\/agency\/agents'\)/, 'Command centre must link directly to the canonical directory.')
assert.match(agents, /navigate\(`\/agency\/agents\/\$\{encodeURIComponent\(targetId\)\}`/, 'Agent rows must keep canonical, safely encoded workspace links.')

// Old bookmarks remain inbound-only compatibility routes. They must redirect
// instead of rendering a second Agent UI implementation.
assert.match(app, /path="\/agents"[\s\S]{0,180}<Navigate to="\/agency\/agents" replace/, 'Legacy directory bookmarks must redirect to the canonical route.')
assert.match(app, /path="\/agents\/:agentId"[\s\S]{0,220}<LegacyAgentWorkspaceRedirect \/>/, 'Legacy workspace bookmarks must use the compatibility redirect.')
assert.match(app, /path="\/agent\/agents\/:agentId"[\s\S]{0,220}<LegacyAgentWorkspaceRedirect \/>/, 'Singular Agent bookmarks must use the same compatibility redirect.')
assert.doesNotMatch(app, /AgentReportingPage/, 'The retired reporting screen must stay out of the application graph.')

console.log('Agent Phase 4 legacy consolidation checks passed.')
