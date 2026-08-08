import { describe, expect, it } from 'vitest'
import { OTP_DOCUMENT_TYPES, resolveSalesWorkflowSnapshot } from '../salesWorkflow'
import { buildKingstonsBuyerOtpReadiness } from '../kingstonsBuyerOtpReadiness'

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

  it('allows Kingston manual signed OTP evidence only when the Kingston gate is explicitly enabled', () => {
    const manualSignedOtp = {
      id: 'transaction-doc-signed-otp',
      document_type: 'signed_otp',
      name: 'Signed OTP - Buyer.pdf',
      storage_path: 'transactions/tx-1/signed-otp.pdf',
      status: 'uploaded',
    }
    const kingstonsBuyerOtpReadiness = buildKingstonsBuyerOtpReadiness({
      documents: [manualSignedOtp],
    })

    const genericSnapshot = resolveSalesWorkflowSnapshot({
      ...completeOnboarding,
      documents: [manualSignedOtp],
      kingstonsBuyerOtpReadiness,
    })
    expect(genericSnapshot.signedOtpReceived).toBe(false)
    expect(genericSnapshot.readyForFinance).toBe(false)

    const kingstonsSnapshot = resolveSalesWorkflowSnapshot({
      ...completeOnboarding,
      documents: [manualSignedOtp],
      allowKingstonsManualSignedOtp: true,
      kingstonsBuyerOtpReadiness,
    })
    expect(kingstonsSnapshot.signedOtpReceived).toBe(true)
    expect(kingstonsSnapshot.readyForFinance).toBe(true)
    expect(kingstonsSnapshot.signedOtpSource).toBe('kingstons_manual_upload')
    expect(kingstonsSnapshot.kingstonsManualSignedOtpReady).toBe(true)
    expect(kingstonsSnapshot.nextAction).toBe('move_ready_for_finance')
    expect(kingstonsSnapshot.blockers).toEqual([])
  })
})
