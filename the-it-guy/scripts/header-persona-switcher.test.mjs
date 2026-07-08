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
  /const \{ role, agencyWorkflowMode \} = workspaceContext/,
  'header should only read the active role fields it needs',
)
assert.doesNotMatch(
  source,
  /showPersonaSwitcher|setActivePersona|personaOptions|rolePreviewActive/,
  'header should not keep persona-switcher state or visibility logic',
)
assert.doesNotMatch(
  source,
  /ui-shell-role-switch|aria-label="Active persona"|<span>View<\/span>/,
  'header should not render the View role switcher',
)

console.log('header persona switcher removal tests passed')
