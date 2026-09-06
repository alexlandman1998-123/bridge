import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const matrix = JSON.parse(readFileSync('config/agent-phase0-screen-matrix.json', 'utf8'))
const app = readFileSync('src/App.jsx', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

assert.equal(matrix.contract, 'arch9-agent-phase0-screen-matrix-v1')
assert.deepEqual(matrix.requiredStates, ['loading', 'ready', 'empty', 'permission_denied', 'error', 'retrying'])
assert.equal(matrix.screens.length >= 18, true, 'The primary Agent screen inventory must remain complete.')

const names = new Set()
const routes = new Set()
for (const screen of matrix.screens) {
  assert.equal(typeof screen.name, 'string')
  assert.match(screen.route, /^\//)
  assert.equal(typeof screen.readyText, 'string')
  assert.equal(screen.readyText.length > 0, true)
  assert.equal(Array.isArray(screen.roles) && screen.roles.length > 0, true)
  assert.equal(names.has(screen.name), false, `Duplicate screen name: ${screen.name}`)
  assert.equal(routes.has(screen.route), false, `Duplicate screen route: ${screen.route}`)
  names.add(screen.name)
  routes.add(screen.route)

  const escapedRoute = screen.route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  assert.match(app, new RegExp(`path=["']${escapedRoute}(?:[/:?][^"']*)?["']`), `${screen.route} must remain registered in App.jsx`)
  for (const role of screen.roles) {
    assert.equal(typeof matrix.roles[role], 'string', `${screen.name} references an undefined role: ${role}`)
  }
}

for (const budget of Object.values(matrix.performanceBudgetsMs)) {
  assert.equal(Number.isFinite(budget) && budget > 0, true, 'Performance budgets must be positive numbers.')
}

for (const script of ['test:agent-phase0-contract', 'smoke:agent-phase0', 'verify:agent-phase0']) {
  assert.equal(typeof packageJson.scripts[script], 'string', `Missing package script: ${script}`)
}

console.log(`Agent Phase 0 contract checks passed (${matrix.screens.length} screens).`)
