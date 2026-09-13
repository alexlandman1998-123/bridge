import assert from 'node:assert/strict'
import { buildBondApplicationState, toLegacyBondApplication } from '../legacy/bondApplicationLegacyAdapter.js'
import { getGuidedBondApplicationMetadataFromState } from '../guided/phase2GuidedFlow.js'
import { createEmptyBondApplicationState } from '../bondApplicationState.js'
const legacy = toLegacyBondApplication(createEmptyBondApplicationState())
legacy._meta = { originator_correction_id: 'correction-1', guided_bond_application_v2: { current_screen_key: 'employment_type', completed_screen_keys: ['application_confirmation','applicant_structure'] } }
const portal = { onboardingFormData: { formData: { bond_application: legacy } } }
const state = buildBondApplicationState(portal)
assert.equal(getGuidedBondApplicationMetadataFromState(state).current_screen_key, 'employment_type')
assert.equal(state.compatibility.legacyBase._meta.originator_correction_id, 'correction-1')
state.compatibility.legacyBase._meta.guided_bond_application_v2.completed_screen_keys.push('other')
assert.equal(legacy._meta.guided_bond_application_v2.completed_screen_keys.length, 2)
assert.equal(toLegacyBondApplication(state)._meta.originator_correction_id, 'correction-1')
state.application.signatureEvidence = { method: 'html_canvas', dataUrl: 'data:image/png;base64,AA==', signerName: 'Sample Buyer', signedAt: '2026-09-13T12:00:00.000Z', confirmed: true }
const signedLegacy = toLegacyBondApplication(state)
const resumedSignedState = buildBondApplicationState({ onboardingFormData: { formData: { bond_application: signedLegacy } } })
assert.equal(resumedSignedState.application.signatureEvidence.signerName, 'Sample Buyer')
assert.equal(resumedSignedState.application.signatureEvidence.confirmed, true)
console.log('Application resume preserves saved screen, completed steps and correction identity without mutating the source')
