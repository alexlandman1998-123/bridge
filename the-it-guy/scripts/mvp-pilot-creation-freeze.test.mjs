import assert from 'node:assert/strict'
import {
  assertMvpPilotCreationAllowed,
  resolveMvpPilotCreationFreeze,
} from '../src/lib/mvpPilotCreationFreeze.js'

const productionDefault = resolveMvpPilotCreationFreeze({ VITE_APP_ENV: 'production' })
assert.equal(productionDefault.paused, false)
assert.equal(productionDefault.source, 'default_unpaused')

const explicitResume = resolveMvpPilotCreationFreeze({
  VITE_APP_ENV: 'production',
  VITE_MVP_PILOT_CREATION_PAUSED: 'false',
})
assert.equal(explicitResume.paused, false)
assert.equal(explicitResume.source, 'explicit_configuration')

const explicitPause = resolveMvpPilotCreationFreeze({
  VITE_APP_ENV: 'production',
  VITE_MVP_PILOT_CREATION_PAUSED: 'true',
})
assert.equal(explicitPause.paused, true)
assert.equal(explicitPause.source, 'explicit_configuration')

assert.throws(
  () => assertMvpPilotCreationAllowed({
    operation: 'create a transaction',
    env: { VITE_APP_ENV: 'production', VITE_MVP_PILOT_CREATION_PAUSED: 'true' },
  }),
  (error) => error?.code === 'mvp_pilot_creation_paused',
)

console.log('MVP pilot creation freeze checks passed.')
