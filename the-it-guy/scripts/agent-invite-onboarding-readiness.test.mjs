import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'

const root = process.cwd()

const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'))

const REQUIRED_TESTS = [
  {
    name: 'unified invite architecture',
    scriptName: 'test:unified-invites',
    scriptPath: 'scripts/unified-invites.test.mjs',
  },
  {
    name: 'workspace user invite hardening',
    scriptName: 'test:workspace-user-invites',
    scriptPath: 'scripts/workspace-user-invites.test.mjs',
  },
]

for (const test of REQUIRED_TESTS) {
  assert.equal(
    packageJson.scripts?.[test.scriptName],
    `node ${test.scriptPath}`,
    `Package script ${test.scriptName} must stay wired to ${test.scriptPath}.`,
  )
}

for (const test of REQUIRED_TESTS) {
  const result = spawnSync(process.execPath, [test.scriptPath], {
    cwd: root,
    encoding: 'utf8',
  })

  assert.equal(result.error, undefined, `${test.name} failed to start: ${result.error?.message || ''}`)
  assert.equal(
    result.status,
    0,
    `${test.name} failed.\nSTDOUT:\n${result.stdout || '(empty)'}\nSTDERR:\n${result.stderr || '(empty)'}`,
  )
}

console.log('agent invite onboarding readiness tests passed')
