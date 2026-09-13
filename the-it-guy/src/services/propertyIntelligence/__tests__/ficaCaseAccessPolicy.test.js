import test from 'node:test'
import assert from 'node:assert/strict'
import { canApproveOrGenerateFicaCertificate, canCreateFicaCase, canReadFicaCase } from '../ficaCaseAccessPolicy.js'

const caseRecord = { subject_user_id: 'buyer', shared_party_user_ids: ['seller', 'coparty'], assigned_staff_user_ids: ['agent'] }

test('FICA case visibility follows the party and assigned-staff boundary', () => {
  for (const userId of ['buyer', 'seller', 'coparty', 'agent']) assert.equal(canReadFicaCase({ userId, role: 'buyer', caseRecord }), true)
  assert.equal(canReadFicaCase({ userId: 'reviewer', role: 'compliance_reviewer', caseRecord }), true)
  assert.equal(canReadFicaCase({ userId: 'attorney', role: 'attorney', caseRecord }), false)
  assert.equal(canReadFicaCase({ userId: 'originator', role: 'bond_originator', caseRecord }), false)
  assert.equal(canReadFicaCase({ userId: 'stranger', role: 'agent', caseRecord }), false)
  assert.equal(canReadFicaCase({ userId: 'buyer', role: 'buyer', caseRecord, tokenExpired: true }), false)
})

test('only agency staff can open a case and only compliance roles can approve', () => {
  assert.equal(canCreateFicaCase({ userId: 'agent', role: 'agent' }), true)
  assert.equal(canCreateFicaCase({ userId: 'buyer', role: 'buyer' }), false)
  assert.equal(canApproveOrGenerateFicaCertificate({ userId: 'reviewer', role: 'compliance_reviewer' }), true)
  assert.equal(canApproveOrGenerateFicaCertificate({ userId: 'agent', role: 'agent' }), false)
})
