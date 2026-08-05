import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { buildOtpControlledVersionRenewalActivationDryRunPhase48Audit } from '../src/core/documents/otpControlledVersionRenewalActivationDryRunPhase48.js'
import { buildOtpVersionRenewalActivationReceiptPhase49Audit } from '../src/core/documents/otpVersionRenewalActivationReceiptPhase49.js'
import { buildOtpVersionRenewalLiveWriteGuardPhase50Audit } from '../src/core/documents/otpVersionRenewalLiveWriteGuardPhase50.js'
import { buildOtpControlledVersionRenewalApplyDryRunPhase51Audit } from '../src/core/documents/otpControlledVersionRenewalApplyDryRunPhase51.js'
import { buildOtpVersionRenewalApplyReceiptPhase52Audit } from '../src/core/documents/otpVersionRenewalApplyReceiptPhase52.js'
import { buildOtpPostRenewalMonitoringCloseoutPhase53Audit } from '../src/core/documents/otpPostRenewalMonitoringCloseoutPhase53.js'
import { buildOtpTemplateRenewalSteadyStateReviewPhase54Audit } from '../src/core/documents/otpTemplateRenewalSteadyStateReviewPhase54.js'
import { buildOtpTemplateRenewalChangeIntakePhase55Audit } from '../src/core/documents/otpTemplateRenewalChangeIntakePhase55.js'
import { buildOtpTemplateRenewalScopingAndTriagePhase56Audit } from '../src/core/documents/otpTemplateRenewalScopingAndTriagePhase56.js'
import { buildOtpTemplateRenewalWorkPackageDraftPhase57Audit } from '../src/core/documents/otpTemplateRenewalWorkPackageDraftPhase57.js'
import { buildOtpTemplateRenewalAttorneyReviewPacketPhase58Audit } from '../src/core/documents/otpTemplateRenewalAttorneyReviewPacketPhase58.js'
import { buildOtpTemplateRenewalAttorneyResponsePhase59Audit } from '../src/core/documents/otpTemplateRenewalAttorneyResponsePhase59.js'
import { buildOtpTemplateRenewalTemplateUpdateDraftPhase60Audit } from '../src/core/documents/otpTemplateRenewalTemplateUpdateDraftPhase60.js'
import {
  OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_CONTRACT,
  OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_PHASE61_VERSION,
  OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_READY_STATUS,
  buildOtpTemplateRenewalPdfSigningProofPhase61Audit,
  buildOtpTemplateRenewalPdfSigningProofReceipt,
  formatOtpTemplateRenewalPdfSigningProofPhase61Markdown,
} from '../src/core/documents/otpTemplateRenewalPdfSigningProofPhase61.js'

const checkedAt = '2026-08-06T19:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase61Source = await readFile(new URL('../src/core/documents/otpTemplateRenewalPdfSigningProofPhase61.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-template-renewal-pdf-signing-proof-phase61'],
  'node scripts/otp-template-renewal-pdf-signing-proof-phase61.test.mjs',
  'package.json should expose the OTP template renewal PDF/signing proof Phase 61 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-template-renewal-pdf-signing-proof-phase61'],
  'node scripts/report-otp-template-renewal-pdf-signing-proof-phase61.mjs',
  'package.json should expose the OTP template renewal PDF/signing proof Phase 61 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-pdf-signing-proof-phase61'),
  'OTP vNext verification should include Phase 61 PDF/signing proof.',
)

assert.equal(OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_PHASE61_VERSION, 'otp_template_renewal_generated_pdf_signing_envelope_proof_phase61_v1')
assert.equal(OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_CONTRACT, 'otp-vnext-template-renewal-generated-pdf-signing-envelope-proof-phase61-v1')
assert.equal(OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_READY_STATUS, 'OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_READY_FOR_ATTORNEY_RECHECK')

for (const token of [
  'PHASE61_DRAFT_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE61_MISSING_ROUTE_PDF_BLOCKED',
  'PHASE61_INCOMPLETE_PDF_BLOCKED',
  'PHASE61_INCOMPLETE_SIGNING_ENVELOPE_BLOCKED',
  'PHASE61_ALIGNMENT_BLOCKED',
  'PHASE61_PRODUCTION_WRITE_BLOCKED',
]) {
  assert.ok(phase61Source.includes(token), `phase61 source should include ${token}`)
}

const phase48Audit = buildOtpControlledVersionRenewalActivationDryRunPhase48Audit({ checkedAt, packageJson })
const phase49Audit = buildOtpVersionRenewalActivationReceiptPhase49Audit({ checkedAt, phase48Audit, packageJson })
const phase50Audit = buildOtpVersionRenewalLiveWriteGuardPhase50Audit({ checkedAt, phase49Audit, packageJson })
const phase51Audit = buildOtpControlledVersionRenewalApplyDryRunPhase51Audit({ checkedAt, phase50Audit, packageJson })
const phase52Audit = buildOtpVersionRenewalApplyReceiptPhase52Audit({ checkedAt, phase51Audit, packageJson })
const phase53Audit = buildOtpPostRenewalMonitoringCloseoutPhase53Audit({ checkedAt, phase52Audit, packageJson })
const phase54Audit = buildOtpTemplateRenewalSteadyStateReviewPhase54Audit({ checkedAt, phase53Audit, packageJson })
const phase55Audit = buildOtpTemplateRenewalChangeIntakePhase55Audit({ checkedAt, phase54Audit, packageJson })
const phase56Audit = buildOtpTemplateRenewalScopingAndTriagePhase56Audit({ checkedAt, phase55Audit, packageJson })
const phase57Audit = buildOtpTemplateRenewalWorkPackageDraftPhase57Audit({ checkedAt, phase56Audit, packageJson })
const phase58Audit = buildOtpTemplateRenewalAttorneyReviewPacketPhase58Audit({ checkedAt, phase57Audit, packageJson })
const phase59Audit = buildOtpTemplateRenewalAttorneyResponsePhase59Audit({ checkedAt, phase58Audit, packageJson })
const phase60Audit = buildOtpTemplateRenewalTemplateUpdateDraftPhase60Audit({ checkedAt, phase59Audit, packageJson })
const audit = buildOtpTemplateRenewalPdfSigningProofPhase61Audit({
  checkedAt,
  phase60Audit,
  packageJson,
})

assert.equal(audit.version, OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_PHASE61_VERSION)
assert.equal(audit.contract, OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_CONTRACT)
assert.equal(audit.status, OTP_TEMPLATE_RENEWAL_PDF_SIGNING_PROOF_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.mutatedData, false)
assert.equal(audit.nextPhase.phase, 62)
assert.equal(audit.nextPhase.key, 'otp_template_renewal_attorney_recheck_decision')

for (const check of [
  'PHASE61_PHASE60_TEMPLATE_UPDATE_DRAFT_READY',
  'PHASE61_GOOD_PDF_SIGNING_PROOF_READY',
  'PHASE61_PROOF_BOUND_TO_TEMPLATE_UPDATE_DRAFT',
  'PHASE61_BOTH_ROUTE_PDFS_GENERATED',
  'PHASE61_BOTH_ROUTE_ENVELOPES_MAPPED',
  'PHASE61_PDF_CONTENT_AND_LAYOUT_PROVED',
  'PHASE61_SIGNING_FIELDS_ROLE_SCOPED',
  'PHASE61_PDF_ENVELOPE_ALIGNMENT_PROVED',
  'PHASE61_NO_PRODUCTION_WRITE_ALLOWED',
  'PHASE61_DRAFT_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE61_MISSING_ROUTE_PDF_BLOCKED',
  'PHASE61_INCOMPLETE_PDF_BLOCKED',
  'PHASE61_INCOMPLETE_SIGNING_ENVELOPE_BLOCKED',
  'PHASE61_CONTENT_SCAN_BLOCKED',
  'PHASE61_ALIGNMENT_BLOCKED',
  'PHASE61_DOCX_PROOF_BLOCKED',
  'PHASE61_DISPATCH_BLOCKED',
  'PHASE61_EVIDENCE_BLOCKED',
  'PHASE61_PRODUCTION_WRITE_BLOCKED',
  'PHASE61_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodTemplateDraft = phase60Audit.templateUpdateDraftReceipts.find((receipt) => receipt.canStartQaAndAttorneyRecheck)
const blockedReceipt = buildOtpTemplateRenewalPdfSigningProofReceipt({
  checkedAt,
  templateUpdateDraftReceipt: goodTemplateDraft,
  proofManifest: {
    proofId: '',
    status: 'approved',
    provedAt: '',
    templateUpdateDraftFingerprint: 'wrong',
    attorneyResponseFingerprint: 'wrong',
    routeCount: 1,
    proofMode: 'production_write',
    qaOwner: '',
    attorneyReviewerRole: '',
    attorneyRecheckRequired: false,
    attorneyApprovalGranted: true,
    productionWriteRequested: true,
    proofOnly: false,
  },
  pdfProofs: [],
  signingEnvelopeProofs: [],
  contentScan: {
    scanId: '',
    status: 'failed',
    routeCount: 0,
    missingLegalWordingCount: 1,
    missingBuyerCostObligationCount: 1,
    missingSignatureBlockCount: 1,
    visibleRouteMarkerCount: 1,
    visibleSourceColumnCount: 1,
    docxReferenceCount: 1,
    attorneyRecheckRequired: false,
  },
  alignmentMatrix: {
    matrixId: '',
    status: 'misaligned',
    routeCount: 0,
    pdfProofCount: 0,
    signingEnvelopeProofCount: 0,
    signerRoles: [],
    everyRouteHasPdf: false,
    everyRouteHasEnvelope: false,
    everyEnvelopeMatchesPdf: false,
    everyPageInitialled: false,
    witnessesMapped: false,
    routeSeparated: false,
    attorneyApprovalGranted: true,
    signingDispatchRequested: true,
    productionWriteRequested: true,
  },
  reviewRouting: {
    currentOwnerRole: '',
    nextOwnerRole: 'release_operator',
    attorneyReviewerRole: '',
    nextAction: 'publish',
    deliveryMode: 'email',
    emailDispatchRequested: true,
    signingDispatchRequested: true,
    productionWriteRequested: true,
  },
  evidence: [],
  noWriteProof: {
    proofOnly: false,
    productionWriteAttempted: true,
    attorneyApprovalMutationCount: 1,
    publicationApprovalMutationCount: 1,
    legalWordingMutationCount: 1,
    templateDefaultMutationCount: 1,
    signingEnvelopeMutationCount: 1,
    signingDispatchMutationCount: 1,
    finalPdfMutationCount: 1,
  },
})

assert.equal(blockedReceipt.canRequestAttorneyRecheck, false)
for (const blocker of [
  'pdf_signing_proof_id_missing',
  'pdf_signing_proof_template_update_draft_fingerprint_mismatch',
  'pdf_proof_route_missing:resale_existing_property',
  'signing_proof_route_missing:new_development',
  'pdf_content_scan_legal_wording_missing',
  'pdf_signing_alignment_role_missing:buyer_witness',
  'pdf_signing_proof_email_dispatch_requested',
  'pdf_signing_proof_evidence_missing:no_write_attestation',
  'pdf_signing_proof_production_write_attempted',
]) {
  assert.ok(blockedReceipt.blockerCodes.includes(blocker), `blocked receipt should include ${blocker}`)
}

const markdown = formatOtpTemplateRenewalPdfSigningProofPhase61Markdown(audit)
for (const token of [
  'OTP Generator Phase 61 Generated PDF And Signing Envelope Proof',
  'OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_READY_FOR_ATTORNEY_RECHECK',
  'Phase 62: Attorney Recheck Decision',
  'buyer_witness',
  'seller_witness',
  'pdf_proof_docx_source_observed:resale_existing_property',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP template renewal generated PDF and signing envelope proof Phase 61 contract passed.')
