import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveBuyerDocumentRequestParticipants,
  scopeBuyerDocumentRequirements,
} from '../documentRequestParticipantScope.js'

const FORM_DATA = Object.freeze({
  purchaser_type: 'individual',
  purchase_mode: 'co_purchasing',
  purchasers: [
    { first_name: 'Alex', last_name: 'Buyer' },
    { first_name: 'Taylor', last_name: 'Buyer' },
  ],
})

test('resolves stable purchaser keys and human-readable names', () => {
  const participants = resolveBuyerDocumentRequestParticipants(FORM_DATA, 'individual')
  assert.equal(participants.primary.participantKey, 'purchaser:1')
  assert.equal(participants.primary.participantLabel, 'Purchaser 1 (Alex Buyer)')
  assert.equal(participants.secondary.participantKey, 'purchaser:2')
  assert.equal(participants.secondary.participantLabel, 'Purchaser 2 (Taylor Buyer)')
})

test('scopes otherwise equivalent identity requests without changing their base taxonomy', () => {
  const scoped = scopeBuyerDocumentRequirements([
    { key: 'id_document', label: 'ID Document' },
    { key: 'co_purchaser_id_document', label: 'ID Document' },
    { key: 'marriage_certificate', label: 'Marriage Certificate' },
  ], FORM_DATA, 'individual')

  assert.equal(scoped[0].requirementInstanceKey, 'purchaser:1:id_document')
  assert.equal(scoped[0].label, 'Purchaser 1 (Alex Buyer) — ID Document')
  assert.equal(scoped[1].requirementInstanceKey, 'purchaser:2:co_purchaser_id_document')
  assert.equal(scoped[1].label, 'Purchaser 2 (Taylor Buyer) — ID Document')
  assert.equal(scoped[2].participantKey, undefined)
})

test('keeps a non-purchasing spouse distinct from Purchaser 2', () => {
  const scoped = scopeBuyerDocumentRequirements([
    { key: 'spouse_id_optional', label: 'Spouse ID Copy' },
  ], {
    purchaser_type: 'married_anc',
    spouse_full_name: 'Jordan Buyer',
    spouse_is_co_purchaser: 'no',
  }, 'married_anc')

  assert.equal(scoped[0].participantKey, 'spouse:1')
  assert.equal(scoped[0].participantRole, 'spouse_related_party')
  assert.equal(scoped[0].label, 'Spouse (Jordan Buyer) — Spouse ID Copy')
})

