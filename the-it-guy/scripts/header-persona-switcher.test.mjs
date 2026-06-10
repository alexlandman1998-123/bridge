import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'src/components/HeaderBar.jsx'), 'utf8')

assert.equal(
  packageJson.scripts['test:header-persona-switcher'],
  'node scripts/header-persona-switcher.test.mjs',
  'package script should expose the header persona switcher regression',
)

assert.match(
  source,
  /const isAgentWorkspaceRole = role === 'agent' \|\| role === 'principal' \|\| role === 'headquarters'/,
  'header should identify agent workspace roles',
)
assert.match(
  source,
  /const showPersonaSwitcher = role !== 'bond_originator' && !isAgentWorkspaceRole && !isAgentsDirectoryRoute/,
  'header should hide the persona switcher in agent workspaces',
)
assert.match(
  source,
  /\{showPersonaSwitcher \? \(\s*<div\s+className="ui-shell-role-switch ui-shell-role-switch-premium/,
  'premium headers should also respect the persona switcher visibility rule',
)

console.log('header-persona-switcher tests passed')
