import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [agentsPage, button] = await Promise.all([
  readFile(new URL('../src/pages/Agents.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/ui/Button.jsx', import.meta.url), 'utf8'),
])

const tabsStart = agentsPage.indexOf('const AGENT_WORKSPACE_TABS = [')
const tabsEnd = agentsPage.indexOf('const ORGANISATION_ROLE_OPTIONS', tabsStart)
assert.ok(tabsStart >= 0 && tabsEnd > tabsStart, 'agent workspace tabs should be declared')
const tabsBlock = agentsPage.slice(tabsStart, tabsEnd)
assert.match(tabsBlock, /key: 'settings'[\s\S]*label: 'Settings'/, 'agent settings tab should be reachable from the workspace tabs')

const workspaceRenderStart = agentsPage.indexOf('<AgentWorkspace\n        agent={agent}')
const workspaceRender = agentsPage.slice(workspaceRenderStart, agentsPage.indexOf('</section>', workspaceRenderStart))
assert.ok(workspaceRenderStart >= 0, 'agent detail page should render AgentWorkspace')
assert.match(
  workspaceRender,
  /onRefresh=\{\(\) => loadFullWorkspace\(\{ blockInitialRender: false \}\)\}/,
  'agent settings saves should refresh the snapshot without remounting the workspace',
)
assert.doesNotMatch(
  workspaceRender,
  /onRefresh=\{loadWorkspace\}/,
  'agent settings saves must not use the full loading refresh that resets tab state',
)

assert.match(button, /type,\s*\.\.\.props/, 'Button should explicitly receive type before spreading props')
assert.match(button, /type: type \|\| 'button'/, 'Button should default native buttons to type="button"')

console.log('agent settings refresh stability checks passed')
