import assert from 'node:assert/strict'
import {
  REVO_EXTENSION_KEY,
  REVO_ORGANISATION_ID,
  getWorkspaceExtensionAccess,
  hasWorkspaceExtension,
  isWorkspaceExtensionFeatureEnabled,
  resolveWorkspaceExtensions,
} from '../revoExtensionRegistry.js'

const enabledRevo = {
  organisation: { id: REVO_ORGANISATION_ID },
  organisationSettings: {
    workspaceExtensions: {
      revo: {
        enabled: true,
        features: {
          pilot_workflow: true,
          disabled_workflow: false,
        },
      },
    },
  },
}

assert.deepEqual(resolveWorkspaceExtensions(enabledRevo), [
  { key: REVO_EXTENSION_KEY, label: 'Revo extension', enabled: true },
])
assert.equal(hasWorkspaceExtension(REVO_EXTENSION_KEY, enabledRevo), true)
assert.equal(isWorkspaceExtensionFeatureEnabled(REVO_EXTENSION_KEY, 'pilot_workflow', enabledRevo), true)
assert.equal(isWorkspaceExtensionFeatureEnabled(REVO_EXTENSION_KEY, 'disabled_workflow', enabledRevo), false)
assert.equal(getWorkspaceExtensionAccess(REVO_EXTENSION_KEY, enabledRevo).code, 'enabled')

const disabledRevo = {
  organisationId: REVO_ORGANISATION_ID,
  organisationSettings: { workspaceExtensions: { revo: { enabled: false } } },
}
assert.equal(hasWorkspaceExtension(REVO_EXTENSION_KEY, disabledRevo), false)
assert.equal(getWorkspaceExtensionAccess(REVO_EXTENSION_KEY, disabledRevo).code, 'extension_disabled')

const nonRevoWithCopiedSetting = {
  organisationId: '9d91e631-538c-4b7e-b32a-47b0a95a816d',
  organisationSettings: { workspaceExtensions: { revo: { enabled: true, features: { pilot_workflow: true } } } },
}
assert.deepEqual(resolveWorkspaceExtensions(nonRevoWithCopiedSetting), [])
assert.equal(hasWorkspaceExtension(REVO_EXTENSION_KEY, nonRevoWithCopiedSetting), false)
assert.equal(isWorkspaceExtensionFeatureEnabled(REVO_EXTENSION_KEY, 'pilot_workflow', nonRevoWithCopiedSetting), false)
assert.equal(getWorkspaceExtensionAccess(REVO_EXTENSION_KEY, nonRevoWithCopiedSetting).code, 'organisation_not_allowed')

assert.equal(getWorkspaceExtensionAccess('unknown_extension', enabledRevo).code, 'extension_not_registered')
assert.equal(hasWorkspaceExtension(REVO_EXTENSION_KEY, { organisationId: REVO_ORGANISATION_ID }), false)

console.log('Revo extension registry isolation checks passed.')
