import { expect, it } from 'vitest'
import { buyerCaptureDetails, hasBuyerCaptureDetails } from '../buyerCaptureDetails.js'

it('shows onboarding details only for the explicitly linked buyer', () => {
  const context = { primaryParticipantId: 'primary', buyerId: 'buyer', formData: { identity_number: 'saved', seller_name: 'Other person', __bridge_flags: { complete: true } } }
  expect(buyerCaptureDetails({ id: 'primary', buyer_party_id: 'buyer' }, context)).toEqual({ identity_number: 'saved' })
  expect(buyerCaptureDetails({ id: 'secondary', buyer_party_id: 'other' }, context)).toEqual({})
})

it('does not use shared names or email as an onboarding identity match', () => {
  expect(buyerCaptureDetails({ id: 'person', participant_email: 'shared@example.test' }, { formData: { email: 'shared@example.test', identity_number: 'private' } })).toEqual({})
})

it('keeps an explicit onboarding identity ahead of the current primary', () => {
  const context = { primaryParticipantId: 'current', buyerId: 'current-profile', formData: { buyer_participant_id: 'previous', identity_number: 'private' } }
  expect(buyerCaptureDetails({ id: 'current', buyer_party_id: 'current-profile' }, context)).toEqual({})
})

it('does not turn a seller-only manual capture into a captured buyer profile', () => {
  expect(hasBuyerCaptureDetails({ seller_name: 'Backfill Seller', seller_type: 'individual', __bridge_transaction_seller_capture: { source: 'agent_manual' }, __bridge_transaction_parties: { version: 'transaction_party_profile_v1', seller: { people: [{ name: 'Seller' }] }, buyer: { people: [{ id: 'placeholder' }] } } })).toBe(false)
  expect(hasBuyerCaptureDetails({ purchase_finance_type: 'cash', purchaser_type: 'individual' })).toBe(false)
  expect(hasBuyerCaptureDetails({ first_name: 'Buyer' })).toBe(true)
  expect(hasBuyerCaptureDetails({ __bridge_transaction_parties: { buyer: { people: [{ name: 'Buyer' }] } } })).toBe(true)
})
