import { describe, expect, it } from 'vitest'
import { canTransitionPrivateListing, evaluatePrivateListingTransitionGuards, isCurrentListingImportActivation } from '../privateListingLifecycle'

describe('private listing mandate activation policy', () => {
  it('allows mandate signed without canonical packet or manual upload proof', () => {
    const result = canTransitionPrivateListing({
      listingStatus: 'mandate_sent',
      mandateStatus: 'signed_external_pending_upload',
    }, 'mandate_signed')

    expect(result.allowed).toBe(true)
    expect(result.blockers.join(' ')).not.toMatch(/canonical mandate packet|manual signed mandate upload/i)
    expect(result.nonOverridableBlockers).toEqual([])
  })

  it('allows activation without canonical packet or manual upload proof', () => {
    const result = canTransitionPrivateListing({
      listingStatus: 'mandate_signed',
      mandateStatus: 'signed_external_pending_upload',
    }, 'active')

    expect(result.allowed).toBe(true)
    expect(result.blockers.join(' ')).not.toMatch(/canonical mandate packet|manual signed mandate upload/i)
    expect(result.nonOverridableBlockers).toEqual([])
  })

  it('does not make missing mandate proof override-only', () => {
    const result = canTransitionPrivateListing({
      listingStatus: 'listing_review',
      mandateStatus: 'not_started',
    }, 'active')

    expect(result.allowed).toBe(true)
    expect(result.overrideRequired).toBe(false)
    expect(result.blockers.join(' ')).not.toMatch(/canonical mandate packet|manual signed mandate upload/i)
  })

  it('keeps unrelated sequencing guards in place', () => {
    const result = canTransitionPrivateListing({
      listingStatus: 'mandate_ready',
    }, 'under_offer')

    expect(result.allowed).toBe(false)
    expect(result.blockers.join(' ')).toMatch(/must be active before moving under offer/i)
  })

  it('keeps current-listing import detection available for audit context', () => {
    const notes = `BRIDGE_QUICK_ADD_METADATA:${JSON.stringify({
      origin: 'quick_add',
      source: 'quick_add',
      quickAddIntent: 'active_listing',
    })}`
    const listing = {
      listingStatus: 'listing_review',
      mandateStatus: 'signed_external_pending_upload',
      internalListingNotes: notes,
    }
    const blockers = evaluatePrivateListingTransitionGuards(listing, 'active')

    expect(isCurrentListingImportActivation(listing, 'active')).toBe(true)
    expect(blockers.join(' ')).not.toMatch(/canonical mandate packet|manual signed mandate upload/i)
  })
})
