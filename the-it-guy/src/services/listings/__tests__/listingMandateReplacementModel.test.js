import { describe, expect, it } from 'vitest'
import {
  buildListingMandateReplacementWorkflow,
  createListingMandateTermsRevision,
} from '../listingMandateReplacementModel.js'

const oldSigned = {
  signing_group_id: 'old-group',
  status: 'signed',
  selected_documents: ['mandate'],
  created_at: '2026-09-01T08:00:00.000Z',
  signed_at: '2026-09-01T09:00:00.000Z',
}

describe('listing mandate replacement workflow', () => {
  it('requires an amendment without invalidating the signed source pack', () => {
    const revision = createListingMandateTermsRevision({
      previous: { askingPrice: 1000000, mandateType: 'sole' },
      next: { askingPrice: 950000, mandateType: 'sole' },
      recordedAt: '2026-09-10T08:00:00.000Z',
    })
    const result = buildListingMandateReplacementWorkflow({ sessions: [oldSigned], revisions: [revision], refreshRequired: true, amendmentRequired: true })
    expect(result.status).toBe('amendment_required')
    expect(result.sourceSigningGroupId).toBe('old-group')
    expect(result.changedFieldLabels).toContain('Asking price')
  })

  it('reports a replacement pack as pending while any required signer is active', () => {
    const revision = { changed: true, changedFields: ['mandateTerms'], recordedAt: '2026-09-10T08:00:00.000Z' }
    const replacement = { signing_group_id: 'new-group', status: 'active', selected_documents: ['mandate'], created_at: '2026-09-11T08:00:00.000Z' }
    const result = buildListingMandateReplacementWorkflow({ sessions: [oldSigned, replacement], revisions: [revision], refreshRequired: true })
    expect(result.status).toBe('replacement_pending')
    expect(result.pendingSigningGroupId).toBe('new-group')
  })

  it('treats the new mandate as current only after every signer has signed', () => {
    const revision = { changed: true, changedFields: ['commissionPercentage'], recordedAt: '2026-09-10T08:00:00.000Z' }
    const signedReplacement = [
      { signing_group_id: 'new-group', status: 'signed', selected_documents: ['mandate'], created_at: '2026-09-11T08:00:00.000Z', signed_at: '2026-09-12T08:00:00.000Z' },
      { signing_group_id: 'new-group', status: 'signed', selected_documents: ['mandate'], created_at: '2026-09-11T08:00:00.000Z', signed_at: '2026-09-12T09:00:00.000Z' },
    ]
    const result = buildListingMandateReplacementWorkflow({ sessions: [oldSigned, ...signedReplacement], revisions: [revision], refreshRequired: true, amendmentRequired: true })
    expect(result.status).toBe('current')
    expect(result.effectiveSigningGroupId).toBe('new-group')
  })

  it('keeps the replacement pending until all signers finish', () => {
    const revision = { changed: true, changedFields: ['commissionPercentage'], recordedAt: '2026-09-10T08:00:00.000Z' }
    const partial = [
      { signing_group_id: 'new-group', status: 'signed', selected_documents: ['mandate'], created_at: '2026-09-11T08:00:00.000Z', signed_at: '2026-09-12T08:00:00.000Z' },
      { signing_group_id: 'new-group', status: 'active', selected_documents: ['mandate'], created_at: '2026-09-11T08:00:00.000Z' },
    ]
    expect(buildListingMandateReplacementWorkflow({ sessions: [oldSigned, ...partial], revisions: [revision] }).status).toBe('replacement_pending')
  })

  it('tracks seller notes and special conditions as mandate changes', () => {
    const revision = createListingMandateTermsRevision({
      previous: { specialConditions: 'Existing condition', sellerNotes: 'Existing note' },
      next: { specialConditions: 'Updated condition', sellerNotes: 'Existing note' },
    })
    expect(revision.changedFields).toEqual(['specialConditions'])
  })
})
