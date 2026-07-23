import { describe, expect, it } from 'vitest'
import { OTP_DOCUMENT_TYPES, resolveSalesWorkflowSnapshot } from '../salesWorkflow'

const completeOnboarding = {
  onboardingStatus: 'submitted',
  requiredDocuments: [],
}

describe('sales workflow Phase 0 signed OTP containment', () => {
  it('does not let manual OTP evidence unlock signed OTP or Finance', () => {
    const snapshot = resolveSalesWorkflowSnapshot({
      ...completeOnboarding,
      documents: [{
        document_type: 'manual_otp_evidence',
        category: 'Signed OTP evidence',
        document_name: 'signed-otp-upload.pdf',
        status: 'uploaded',
      }],
    })

    expect(snapshot.signedOtpReceived).toBe(false)
    expect(snapshot.readyForFinance).toBe(false)
  })

  it('does not trust a direct signed OTP re-upload as canonical completion', () => {
    const snapshot = resolveSalesWorkflowSnapshot({
      ...completeOnboarding,
      documents: [{
        document_type: OTP_DOCUMENT_TYPES.signedReuploaded,
        category: 'Signed OTP',
        document_name: 'signed-otp.pdf',
        status: 'uploaded',
      }],
    })

    expect(snapshot.signedOtpReceived).toBe(false)
    expect(snapshot.readyForFinance).toBe(false)
  })

  it('accepts only a canonical final OTP artifact as the signed proof', () => {
    const snapshot = resolveSalesWorkflowSnapshot({
      ...completeOnboarding,
      documents: [{
        document_type: OTP_DOCUMENT_TYPES.signedFinal,
        category: 'Offer to Purchase (OTP) · Signed Final',
        document_name: 'canonical-signed-otp.pdf',
        status: 'signed',
      }],
    })

    expect(snapshot.signedOtpReceived).toBe(true)
    expect(snapshot.readyForFinance).toBe(true)
  })
})
