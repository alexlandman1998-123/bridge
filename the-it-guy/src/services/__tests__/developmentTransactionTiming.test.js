import { expect, it } from 'vitest'
import { assertDevelopmentBuyerTransactionReady } from '../developmentBuyerJourneyService.js'

const lead = { leadCategory: 'buyer', developmentId: 'development', developmentLeadContext: { preferredUnitId: 'unit', reservationState: 'reserved' } }
it('keeps the normal buyer flow unchanged', () => {
  expect(() => assertDevelopmentBuyerTransactionReady({ lead: { leadCategory: 'buyer' } })).not.toThrow()
})
it('requires the actual unit reservation', () => {
  expect(() => assertDevelopmentBuyerTransactionReady({ lead: { ...lead, developmentLeadContext: {} }, onboardingSubmitted: true, signedOtpComplete: true })).toThrow('reservation')
})
it.each([[false, false], [true, false], [false, true]])('does not create the development transaction with onboarding=%s and OTP=%s', (onboardingSubmitted, signedOtpComplete) => {
  expect(() => assertDevelopmentBuyerTransactionReady({ lead, onboardingSubmitted, signedOtpComplete })).toThrow('onboarding and the signed OTP')
})
it('allows the completed development handoff', () => {
  expect(() => assertDevelopmentBuyerTransactionReady({ lead, onboardingSubmitted: true, signedOtpComplete: true })).not.toThrow()
})
