import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const principalDashboard = readFileSync('src/pages/PrincipalDashboard.jsx', 'utf8')
const agents = readFileSync('src/pages/Agents.jsx', 'utf8')
const enquiries = readFileSync('src/pages/AgentEnquiriesPage.jsx', 'utf8')
const quickCreate = readFileSync('src/components/QuickCreateDropdown.jsx', 'utf8')
const browserSmoke = readFileSync('scripts/agent-phase0-browser-smoke.mjs', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

for (const [name, source] of [['Principal dashboard', principalDashboard], ['Agent directory', agents]]) {
  assert.doesNotMatch(source, /<tr[^>]*onClick=/, `${name} must not expose mouse-only clickable table rows.`)
}

assert.match(principalDashboard, /aria-label=\{`Open \$\{agent\.agentName \|\| 'agent'\} workspace`\}/, 'Dashboard agent links need explicit accessible names.')
assert.match(agents, /aria-label=\{`Open \$\{row\.name \|\| 'agent'\} workspace`\}/, 'Directory agent links need explicit accessible names.')
assert.match(agents, /focus-visible:ring-2/, 'Agent row actions need visible keyboard focus.')
assert.doesNotMatch(agents, /<button[^>]*>View watchlist<\/button>/, 'The attention card must not expose a no-op watchlist button.')
assert.match(enquiries, /aria-label="Enquiries created from"/, 'The enquiry start-date filter needs an accessible name.')
assert.match(enquiries, /aria-label="Enquiries created to"/, 'The enquiry end-date filter needs an accessible name.')
assert.match(quickCreate, /previousLocationRef/, 'Lazy Quick Create must stay open on its initial mount and dismiss only after navigation.')

for (const marker of ['horizontalOverflowPx', 'unnamedControls', 'focusReachedControl']) {
  assert.match(browserSmoke, new RegExp(marker), `Phase 5 browser acceptance must capture ${marker}.`)
}
assert.match(browserSmoke, /result\.horizontalOverflowPx > 2/, 'Root horizontal overflow must fail browser acceptance.')
assert.match(browserSmoke, /result\.unnamedControls\.length/, 'Unnamed interactive controls must fail browser acceptance.')
assert.match(browserSmoke, /!result\.focusReachedControl/, 'Broken keyboard focus must fail browser acceptance.')
assert.match(browserSmoke, /VITE_ENABLE_DEV_AUTH_BYPASS=true/, 'A missing development bypass must fail immediately with actionable setup guidance.')
assert.match(browserSmoke, /expectedBypassAuthNoise/, 'Development-bypass 401 noise must be classified separately from application console failures.')
assert.match(browserSmoke, /attempt < 8/, 'Keyboard acceptance must traverse past skip links and non-focusable shell nodes.')
assert.match(browserSmoke, /main \[aria-busy="true"\]/, 'A visible heading must not be mistaken for readiness while the route shell is still busy.')

for (const script of ['test:agent-phase5-ui-release', 'smoke:agent-phase5', 'verify:agent-phase5']) {
  assert.equal(typeof packageJson.scripts[script], 'string', `Missing package script: ${script}`)
}

console.log('Agent Phase 5 UI and release checks passed.')
