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
console.log('Application resume preserves saved screen, completed steps and correction identity without mutating the source')
