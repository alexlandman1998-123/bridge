import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createMandateCommercialTermsRevision,
  hasMandateCommercialTermsChanged,
  normalizeMandateCommercialTerms,
} from '../mandateCommercialTermsRevision.js'

test('normalizes commercial mandate terms before comparing revisions', () => {
  assert.deepEqual(normalizeMandateCommercialTerms({
    commission_percentage: '7.5',
    vat_handling: 'Inclusive',
    digital_mandate_requested: 'yes',
  }), {
    commissionPercentage: 7.5,
    commissionAmount: 0,
    vatHandling: 'inclusive',
    mandateTerms: '',
    paymentResponsibility: '',
    digitalMandateRequested: true,
  })
})

test('records a change history without creating a revision for equivalent terms', () => {
  const previous = { commissionPercentage: '7.5', vatHandling: 'exclusive', digitalMandateRequested: true }
  assert.equal(hasMandateCommercialTermsChanged(previous, { commission_percentage: 7.5, vat_handling: 'exclusive', digital_mandate_requested: true }), false)

  const revision = createMandateCommercialTermsRevision({
    previous,
    next: { commissionPercentage: 8, vatHandling: 'inclusive', digitalMandateRequested: true },
    revisions: [{ version: 1 }],
    actor: 'agent-1',
    recordedAt: '2026-09-14T10:00:00.000Z',
  })

  assert.equal(revision.version, 2)
  assert.equal(revision.changed, true)
  assert.deepEqual(revision.changedFields, ['commissionPercentage', 'vatHandling'])
  assert.equal(revision.actor, 'agent-1')
})
