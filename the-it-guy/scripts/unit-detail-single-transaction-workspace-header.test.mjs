import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'pages', 'UnitDetail.jsx'), 'utf8')

const headerRenders = source.match(/<TransactionWorkspaceHeader\b/g) || []

assert.equal(headerRenders.length, 1, 'UnitDetail should render exactly one canonical TransactionWorkspaceHeader')
assert.match(source, /toolbar=\{workspaceNavigationSection\}/, 'UnitDetail should use the same workspace menu toolbar for every role')
assert.match(source, /const canonicalWorkspaceHeaderConfig = isAgentWorkspace/, 'Agent-specific header details should be config, not a separate header render path')
assert.match(source, /contextLabel: 'Transaction Command Center'/, 'Agent command-center wording should be passed through the canonical header config')
assert.match(source, /id: 'back-to-transactions'[\s\S]*icon: 'arrow_left'/, 'Agent back navigation should live in the canonical header actions')
assert.doesNotMatch(source, /const agentHeroHeader\b/, 'UnitDetail should not reintroduce an agent-only transaction hero')
assert.doesNotMatch(source, /const agentBackLink\b/, 'UnitDetail should not reintroduce an agent-only toolbar')
assert.doesNotMatch(source, /const agentMetricSection\b/, 'Agent metrics should flow through the canonical header stats')
assert.doesNotMatch(source, /headline=\{isAgentWorkspace \?/, 'SharedTransactionShell headline should not branch by agent workspace')

console.log('unit detail single transaction workspace header checks passed')
