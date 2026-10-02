import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const organisationPage = await readFile(new URL('../src/pages/settings/SettingsOrganisationPage.jsx', import.meta.url), 'utf8')

// Exercise the actual save handler with a pending first write. The organisation
// write must not begin until branding persistence has completed successfully.
const saveHandlerSource = organisationPage.slice(
  organisationPage.indexOf('  async function handleSave(event)'),
  organisationPage.indexOf('  async function toggleAttorneyModule'),
)
for (const section of ['organisation', 'branding', 'business-lines']) {
for (const firstWriteFails of [false, true]) {
  const calls = []
  let resolveBranding
  let rejectBranding
  const pendingBranding = new Promise((resolve, reject) => {
    resolveBranding = resolve
    rejectBranding = reject
  })
  const noop = () => {}
  const state = {
    organisation: {
      name: 'Example Agency', companyEmail: 'office@example.test',
      companyPhone: '0123456789', addressLine1: '1 Example Road',
      primaryContactPerson: 'Principal Agent', logoUrl: 'https://example.test/logo.png',
    },
    onboarding: {
      organisationType: 'agency',
      branding: { brandColours: { primary: '#123456' } },
      branches: [{ name: 'Main Branch' }],
    },
  }
  const dependencies = {
    canEdit: true, state, saving: false, uploadingLogoTarget: '',
    setSaving: noop, setError: noop, setMessage: noop,
    synchronizeAgencyBusinessLines: (value) => value, isBondOriginator: false,
    saveAgencyOnboardingDraft: (input, options) => {
      assert.deepEqual(input, state.onboarding, `${section} save must preserve onboarding fields`)
      assert.equal(options.syncCommercialAccess, true)
      calls.push('branding'); return pendingBranding
    },
    updateOrganisationSettings: async (input) => {
      assert.deepEqual(input, state.organisation, `${section} save must preserve company and contact fields`)
      calls.push('organisation'); return {}
    },
    upsertAreaFromAddress: async () => {}, buildOrganisationAddressValue: noop,
    setState: noop, setInitialState: noop, applyOrganisationState: noop, refreshAuthState: noop,
    showBrandingOnly: section === 'branding', BRANDING_SUCCESS_MESSAGE: 'Saved', ORGANISATION_SUCCESS_MESSAGE: 'Saved',
  }
  const handleSave = new Function(...Object.keys(dependencies), `${saveHandlerSource}\nreturn handleSave`)(...Object.values(dependencies))
  const saving = handleSave()
  assert.deepEqual(calls, ['branding'], 'settings save must not overlap branding and organisation writes')
  if (firstWriteFails) rejectBranding(new Error('Branding save failed'))
  else resolveBranding({ onboarding: {} })
  await saving
  assert.deepEqual(calls, firstWriteFails ? ['branding'] : ['branding', 'organisation'], 'second write must wait for a successful first write')
}
}

console.log('Settings branding save order tests passed')
