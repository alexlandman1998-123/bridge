import { describe, expect, it } from 'vitest'
import { canTransitionPrivateListing } from '../privateListingLifecycle'

const manualMandateEvidence = {
  document_type: 'manual_mandate_evidence',
  category: 'Mandate evidence',
  document_name: 'manually-signed-mandate.pdf',
  status: 'uploaded',
  visibility: 'internal',
}

const canonicalMandatePacket = {
  id: 'packet-1',
  state: 'completed',
  version: {
    id: 'version-1',
    final_signed_file_path: 'document-packets/packet-1/final.pdf',
  },
}

describe('private listing Phase 0 mandate containment', () => {
  it('does not let manual mandate evidence advance to mandate signed', () => {
    const result = canTransitionPrivateListing({
      listingStatus: 'mandate_sent',
      mandateStatus: 'signed_uploaded',
      documents: [manualMandateEvidence],
    }, 'mandate_signed')

    expect(result.allowed).toBe(false)
    expect(result.blockers.join(' ')).toMatch(/canonical mandate packet/i)
  })

  it('does not let manual mandate evidence activate a listing', () => {
    const result = canTransitionPrivateListing({
      listingStatus: 'mandate_signed',
      mandateStatus: 'signed_uploaded',
      documents: [manualMandateEvidence],
    }, 'active')

    expect(result.allowed).toBe(false)
    expect(result.blockers.join(' ')).toMatch(/canonical mandate packet/i)
  })

  it('does not let an override bypass canonical mandate completion', () => {
    const signedResult = canTransitionPrivateListing({
      listingStatus: 'mandate_sent',
      mandateStatus: 'signed_uploaded',
      documents: [manualMandateEvidence],
    }, 'mandate_signed', { allowOverride: true })
    const activeResult = canTransitionPrivateListing({
      listingStatus: 'mandate_signed',
      mandateStatus: 'signed_uploaded',
      documents: [manualMandateEvidence],
    }, 'active', { allowOverride: true })

    expect(signedResult.allowed).toBe(false)
    expect(activeResult.allowed).toBe(false)
    expect(signedResult.nonOverridableBlockers.join(' ')).toMatch(/canonical mandate packet/i)
    expect(activeResult.nonOverridableBlockers.join(' ')).toMatch(/canonical mandate packet/i)
  })

  it('does not treat an artifact on a non-completed packet as signed proof', () => {
    const result = canTransitionPrivateListing({
      listingStatus: 'mandate_sent',
      mandatePacket: {
        id: 'packet-1',
        state: 'sent',
        version: {
          id: 'version-1',
          final_signed_file_path: 'document-packets/packet-1/final.pdf',
        },
      },
    }, 'mandate_signed')

    expect(result.allowed).toBe(false)
    expect(result.blockers.join(' ')).toMatch(/canonical mandate packet/i)
  })

  it('does not treat a signed URL without an authoritative final artifact path as signed proof', () => {
    const result = canTransitionPrivateListing({
      listingStatus: 'mandate_sent',
      mandatePacket: {
        id: 'packet-1',
        state: 'completed',
        version: {
          id: 'version-1',
          final_signed_file_access_url: 'https://storage.example.test/signed.pdf?token=temporary',
        },
      },
    }, 'mandate_signed', { allowOverride: true })

    expect(result.allowed).toBe(false)
    expect(result.nonOverridableBlockers.join(' ')).toMatch(/canonical mandate packet/i)
  })

  it('allows the lifecycle only after a completed canonical packet has a final artifact', () => {
    const signedResult = canTransitionPrivateListing({
      listingStatus: 'mandate_sent',
      mandatePacket: canonicalMandatePacket,
      documents: [manualMandateEvidence],
    }, 'mandate_signed')
    const activeResult = canTransitionPrivateListing({
      listingStatus: 'mandate_signed',
      mandatePacket: canonicalMandatePacket,
    }, 'active')

    expect(signedResult.allowed).toBe(true)
    expect(activeResult.allowed).toBe(true)
  })
})
