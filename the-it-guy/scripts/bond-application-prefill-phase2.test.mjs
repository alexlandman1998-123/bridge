import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { getBondApplicationOtpUnlockState } from '../src/modules/bond/application/prefill/bondApplicationOtpUnlockGate.js'

const root = process.cwd()

function makeGateInput(overrides = {}) {
  return {
    portal: {
      transaction: {
        finance_type: 'bond',
        finance_managed_by: 'bond_originator',
        onboarding_status: '',
        current_main_stage: 'OTP',
        ...overrides.transaction,
      },
      otpPacket: overrides.otpPacket || null,
      documents: overrides.documents || [],
      onboardingFormData: {
        formData: {
          purchase_finance_type: 'bond',
          finance_managed_by: 'bond_originator',
          ...(overrides.formData || {}),
        },
      },
      ...(overrides.portal || {}),
    },
    financeType: overrides.financeType || 'bond',
    financeManagedBy: overrides.financeManagedBy || 'bond_originator',
    mainStage: overrides.mainStage || 'OTP',
    requiredDocuments: overrides.requiredDocuments || [],
    documents: overrides.lookupDocuments || [],
  }
}

function runGateChecks() {
  assert.equal(
    getBondApplicationOtpUnlockState(makeGateInput({ financeType: 'cash' })).status,
    'not_required',
    'cash transactions should not expose the bond application gate',
  )

  assert.equal(
    getBondApplicationOtpUnlockState(makeGateInput({ financeManagedBy: 'buyer' })).status,
    'not_available',
    'buyer-managed finance should not unlock the originator application',
  )

  const locked = getBondApplicationOtpUnlockState(makeGateInput())
  assert.equal(locked.status, 'locked')
  assert.equal(locked.unlocked, false)
  assert.equal(locked.blocked, true)
  assert.equal(locked.reason, 'awaiting_otp')

  const preparingFromStatus = getBondApplicationOtpUnlockState(makeGateInput({
    transaction: { onboarding_status: 'awaiting_signed_otp' },
  }))
  assert.equal(preparingFromStatus.status, 'preparing')
  assert.equal(preparingFromStatus.unlocked, false)
  assert.equal(preparingFromStatus.reason, 'otp_in_progress_status')

  const preparingFromDocument = getBondApplicationOtpUnlockState(makeGateInput({
    requiredDocuments: [{ key: 'generated_otp', label: 'Offer to Purchase', complete: true }],
  }))
  assert.equal(preparingFromDocument.status, 'preparing')
  assert.equal(preparingFromDocument.reason, 'otp_in_progress_document')

  const unlockedFromStatus = getBondApplicationOtpUnlockState(makeGateInput({
    transaction: { onboarding_status: 'signed_otp_received' },
  }))
  assert.equal(unlockedFromStatus.status, 'unlocked')
  assert.equal(unlockedFromStatus.unlocked, true)
  assert.equal(unlockedFromStatus.reason, 'signed_otp_status')

  const unlockedFromPacket = getBondApplicationOtpUnlockState(makeGateInput({
    otpPacket: { state: 'fully_signed' },
  }))
  assert.equal(unlockedFromPacket.status, 'unlocked')
  assert.equal(unlockedFromPacket.reason, 'signed_otp_packet')

  const unlockedFromDocument = getBondApplicationOtpUnlockState(makeGateInput({
    lookupDocuments: [{ document_type: 'signed_otp', name: 'Signed Offer to Purchase.pdf' }],
  }))
  assert.equal(unlockedFromDocument.status, 'unlocked')
  assert.equal(unlockedFromDocument.reason, 'signed_otp_document')

  const unlockedFromFinanceStage = getBondApplicationOtpUnlockState(makeGateInput({
    mainStage: 'FIN',
  }))
  assert.equal(unlockedFromFinanceStage.status, 'unlocked')
  assert.equal(unlockedFromFinanceStage.reason, 'finance_stage_reached')
}

async function runStaticChecks() {
  const [clientPortalSource, docSource, helperSource] = await Promise.all([
    readFile(resolve(root, 'src/pages/ClientPortal.jsx'), 'utf8'),
    readFile(resolve(root, 'docs/bond-application/phase-2-prefill-otp-unlock-gate.md'), 'utf8'),
    readFile(resolve(root, 'src/modules/bond/application/prefill/bondApplicationOtpUnlockGate.js'), 'utf8'),
  ])

  assert.match(clientPortalSource, /getBondApplicationOtpUnlockState/)
  assert.match(clientPortalSource, /bondApplicationOtpUnlockState\.unlocked/)
  assert.match(clientPortalSource, /Complete the OTP step/)
  assert.match(clientPortalSource, /Prefill ready/)
  assert.match(clientPortalSource, /OTP: \{otpStatusLabel\}/)
  assert.match(clientPortalSource, /buyerPortalBondApplicationStatusValue/)
  assert.match(clientPortalSource, /Ready to complete from your secure link/)
  assert.match(helperSource, /SIGNED_OTP_STATUS_VALUES/)
  assert.match(helperSource, /FINANCE_OR_LATER_STAGES/)
  assert.match(helperSource, /signed_otp_document/)
  assert.match(docSource, /Before OTP evidence exists/)
  assert.match(docSource, /While OTP is loaded or awaiting signature/)
  assert.match(docSource, /Once signed OTP evidence exists/)
  assert.match(docSource, /does not parse raw OTP PDFs/)
}

runGateChecks()
await runStaticChecks()

console.log('Bond application prefill Phase 2 checks passed.')
