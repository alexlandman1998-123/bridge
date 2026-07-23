import assert from 'node:assert/strict'
import {
  assertMvpPilotCreationAllowed,
  resolveMvpPilotCreationFreeze,
} from '../src/lib/mvpPilotCreationFreeze.js'

const productionDefault = resolveMvpPilotCreationFreeze({ VITE_APP_ENV: 'production' })
assert.equal(productionDefault.paused, true)
assert.equal(productionDefault.source, 'production_fail_closed_default')

const explicitResume = resolveMvpPilotCreationFreeze({
  VITE_APP_ENV: 'production',
  VITE_MVP_PILOT_CREATION_PAUSED: 'false',
})
assert.equal(explicitResume.paused, false)
assert.equal(explicitResume.source, 'explicit_configuration')

assert.throws(
  () => assertMvpPilotCreationAllowed({
    operation: 'create a transaction',
    env: { VITE_APP_ENV: 'production' },
  }),
  (error) => error?.code === 'mvp_pilot_creation_paused',
)

console.log('MVP pilot creation freeze checks passed.')
