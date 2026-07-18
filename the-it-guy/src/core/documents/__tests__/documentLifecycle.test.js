import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DOCUMENT_LIFECYCLE_STATES,
  assertDocumentLifecycleTransition,
  canTransitionDocumentLifecycle,
  isDocumentLifecycleEditable,
  normalizeDocumentLifecycleState,
  resolveDocumentLifecycleStateFromPacket,
  toDocumentPacketStorageStatus,
} from '../documentLifecycle.js'

test('defines the seven canonical legal-document lifecycle states', () => {
  assert.deepEqual(DOCUMENT_LIFECYCLE_STATES, [
    'draft',
    'pdf_generated',
    'ready_to_send',
    'sent',
    'partially_signed',
    'completed',
    'archived',
  ])
})

test('normalizes legacy lifecycle and packet status values without migration', () => {
  assert.equal(normalizeDocumentLifecycleState('ready_for_generation'), 'draft')
  assert.equal(normalizeDocumentLifecycleState('generated'), 'pdf_generated')
  assert.equal(normalizeDocumentLifecycleState('approved'), 'ready_to_send')
  assert.equal(normalizeDocumentLifecycleState('locked'), 'ready_to_send')
  assert.equal(normalizeDocumentLifecycleState('signing_prep'), 'ready_to_send')
  assert.equal(normalizeDocumentLifecycleState('signed'), 'completed')
  assert.equal(normalizeDocumentLifecycleState('voided'), 'archived')
})

test('maps canonical lifecycle states to database-compatible packet statuses', () => {
  assert.equal(toDocumentPacketStorageStatus('draft'), 'draft')
  assert.equal(toDocumentPacketStorageStatus('pdf_generated'), 'generated')
  assert.equal(toDocumentPacketStorageStatus('ready_to_send'), 'signing_prep')
  assert.equal(toDocumentPacketStorageStatus('completed'), 'completed')
})

test('reconciles stale legacy source context with authoritative signing storage states', () => {
  assert.equal(resolveDocumentLifecycleStateFromPacket({ status: 'generated', source_context_json: { lifecycle_state: 'draft' } }), 'pdf_generated')
  assert.equal(resolveDocumentLifecycleStateFromPacket({ status: 'signing_prep', source_context_json: { lifecycle_state: 'approved' } }), 'ready_to_send')
  assert.equal(resolveDocumentLifecycleStateFromPacket({ status: 'sent', source_context_json: { lifecycle_state: 'draft' } }), 'sent')
  assert.equal(resolveDocumentLifecycleStateFromPacket({ status: 'completed', source_context_json: { lifecycle_state: 'sent' } }), 'completed')
})

test('allows the intended forward flow and explicit draft corrections', () => {
  assert.equal(canTransitionDocumentLifecycle('draft', 'pdf_generated'), true)
  assert.equal(canTransitionDocumentLifecycle('pdf_generated', 'ready_to_send'), true)
  assert.equal(canTransitionDocumentLifecycle('ready_to_send', 'sent'), true)
  assert.equal(canTransitionDocumentLifecycle('sent', 'partially_signed'), true)
  assert.equal(canTransitionDocumentLifecycle('partially_signed', 'completed'), true)
  assert.equal(canTransitionDocumentLifecycle('completed', 'archived'), true)
  assert.equal(canTransitionDocumentLifecycle('ready_to_send', 'draft'), true)
})

test('blocks invalid lifecycle jumps and keeps completed documents immutable', () => {
  assert.equal(canTransitionDocumentLifecycle('draft', 'sent'), false)
  assert.equal(canTransitionDocumentLifecycle('completed', 'draft'), false)
  assert.throws(() => assertDocumentLifecycleTransition('draft', 'completed'), /Transition blocked/)
  assert.equal(isDocumentLifecycleEditable('draft'), true)
  assert.equal(isDocumentLifecycleEditable('generated'), true)
  assert.equal(isDocumentLifecycleEditable('sent'), false)
})
