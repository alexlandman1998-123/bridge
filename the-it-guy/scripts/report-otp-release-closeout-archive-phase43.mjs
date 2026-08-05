import { readFile, writeFile } from 'node:fs/promises'

import {
  buildOtpCommercialTermsPersistencePhase24Audit,
} from '../src/core/documents/otpCommercialTermsPersistencePhase24.js'
import {
  buildOtpCommercialTermsReviewPhase25Audit,
} from '../src/core/documents/otpCommercialTermsReviewPhase25.js'
import {
  buildOtpCommercialTermsRuntimePhase26Audit,
} from '../src/core/documents/otpCommercialTermsRuntimePhase26.js'
import {
  buildOtpGeneratedPdfProofPhase27Audit,
} from '../src/core/documents/otpGeneratedPdfProofPhase27.js'
import {
  buildOtpMatterAttorneyQuotePortalPhase28Audit,
} from '../src/core/documents/otpMatterAttorneyQuotePortalPhase28.js'
import {
  buildOtpFinalProductionReadinessGatePhase29Audit,
} from '../src/core/documents/otpFinalProductionReadinessGatePhase29.js'
import {
  buildOtpAgentControlledEditsPhase30Audit,
} from '../src/core/documents/otpAgentControlledEditsPhase30.js'
import {
  buildOtpAgentReviewUiPhase31Audit,
} from '../src/core/documents/otpAgentReviewUiPhase31.js'
import {
  buildOtpAgentReviewRuntimeProofPhase32Audit,
} from '../src/core/documents/otpAgentReviewRuntimeProofPhase32.js'
import {
  buildOtpAgentReviewSigningAlignmentPhase33Audit,
} from '../src/core/documents/otpAgentReviewSigningEnvelopeAlignmentPhase33.js'
import {
  buildOtpAgentReviewDispatchGuardPhase34Audit,
} from '../src/core/documents/otpAgentReviewDispatchGuardPhase34.js'
import {
  buildOtpAgentReviewSignerSessionPhase35Audit,
} from '../src/core/documents/otpAgentReviewSignerSessionPhase35.js'
import {
  buildOtpAgentReviewCompletionGuardPhase36Audit,
} from '../src/core/documents/otpAgentReviewCompletionGuardPhase36.js'
import {
  buildOtpFinalSignedArtifactProofPhase37Audit,
} from '../src/core/documents/otpFinalSignedArtifactProofPhase37.js'
import {
  buildOtpEndToEndStagingWalkthroughPhase38Audit,
} from '../src/core/documents/otpEndToEndStagingWalkthroughPhase38.js'
import {
  buildOtpProductionReleaseDecisionPhase39Audit,
} from '../src/core/documents/otpProductionReleaseDecisionPhase39.js'
import {
  buildOtpControlledProductionCutoverPhase40Audit,
} from '../src/core/documents/otpControlledProductionCutoverPhase40.js'
import {
  buildOtpPostCutoverMonitoringPhase41Audit,
} from '../src/core/documents/otpPostCutoverMonitoringPhase41.js'
import {
  buildOtpProductionStabilisationSignoffPhase42Audit,
} from '../src/core/documents/otpProductionStabilisationSignoffPhase42.js'
import {
  buildOtpReleaseCloseoutArchivePhase43Audit,
  formatOtpReleaseCloseoutArchivePhase43Markdown,
} from '../src/core/documents/otpReleaseCloseoutArchivePhase43.js'
import { renderOtpGeneratedPdfProofPhase27 } from './render-otp-generated-pdf-proof-phase27.mjs'

const checkedAt = process.env.OTP_RELEASE_CLOSEOUT_ARCHIVE_REPORT_TIME || new Date().toISOString()
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const migrationSql = await readFile(new URL('../../supabase/migrations/202608050010_otp_commercial_terms_persistence.sql', import.meta.url), 'utf8')
const persistenceServiceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsPersistenceService.js', import.meta.url), 'utf8')
const reviewComponentSource = await readFile(new URL('../src/components/documents/OtpCommercialTermsReviewPanel.jsx', import.meta.url), 'utf8')
const runtimeServiceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsRuntimeService.js', import.meta.url), 'utf8')
const portalServiceSource = await readFile(new URL('../src/services/documents/otpMatterAttorneyQuotePortalService.js', import.meta.url), 'utf8')
const workspaceSource = await readFile(new URL('../src/components/documents/LegalDocumentWorkspace.jsx', import.meta.url), 'utf8')
const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
const signerPortalSource = await readFile(new URL('../src/pages/SignerPortal.jsx', import.meta.url), 'utf8')
const externalSigningApiSource = await readFile(new URL('../src/lib/externalSigningApi.js', import.meta.url), 'utf8')
const signingSessionContractSource = await readFile(new URL('../src/core/documents/signingSessionContract.js', import.meta.url), 'utf8')

const phase24Audit = buildOtpCommercialTermsPersistencePhase24Audit({
  checkedAt,
  migrationSql,
  serviceSource: persistenceServiceSource,
})
const phase25Audit = buildOtpCommercialTermsReviewPhase25Audit({
  checkedAt,
  phase24Audit,
  reviewComponentSource,
})
const phase26Audit = buildOtpCommercialTermsRuntimePhase26Audit({
  checkedAt,
  phase25Audit,
  serviceSource: runtimeServiceSource,
})
const renderEvidence = await renderOtpGeneratedPdfProofPhase27()
const phase27Audit = buildOtpGeneratedPdfProofPhase27Audit({
  checkedAt,
  phase26Audit,
  renderEvidence,
})
const phase28Audit = buildOtpMatterAttorneyQuotePortalPhase28Audit({
  checkedAt,
  phase27Audit,
  migrationSql,
  serviceSource: portalServiceSource,
})
const phase29Audit = buildOtpFinalProductionReadinessGatePhase29Audit({
  checkedAt,
  phase27Audit,
  phase28Audit,
})
const phase30Audit = buildOtpAgentControlledEditsPhase30Audit({
  checkedAt,
  phase29Audit,
})
const phase31Audit = buildOtpAgentReviewUiPhase31Audit({
  checkedAt,
  phase30Audit,
  workspaceSource,
  packageJson,
})
const phase32Audit = buildOtpAgentReviewRuntimeProofPhase32Audit({
  checkedAt,
  phase31Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase33Audit = buildOtpAgentReviewSigningAlignmentPhase33Audit({
  checkedAt,
  phase31Audit,
  phase32Audit,
  packetServiceSource,
  packageJson,
})
const phase34Audit = buildOtpAgentReviewDispatchGuardPhase34Audit({
  checkedAt,
  phase33Audit,
  packetServiceSource,
  workspaceSource,
  packageJson,
})
const phase35Audit = buildOtpAgentReviewSignerSessionPhase35Audit({
  checkedAt,
  phase34Audit,
  signerPortalSource,
  externalSigningApiSource,
  signingSessionContractSource,
  packageJson,
})
const phase36Audit = buildOtpAgentReviewCompletionGuardPhase36Audit({
  checkedAt,
  phase35Audit,
  packetServiceSource,
  packageJson,
})
const phase37Audit = buildOtpFinalSignedArtifactProofPhase37Audit({
  checkedAt,
  phase36Audit,
  packetServiceSource,
  packageJson,
})
const phase38Audit = buildOtpEndToEndStagingWalkthroughPhase38Audit({
  checkedAt,
  phase37Audit,
  packageJson,
})
const phase39Audit = buildOtpProductionReleaseDecisionPhase39Audit({
  checkedAt,
  phase38Audit,
  packageJson,
})
const phase40Audit = buildOtpControlledProductionCutoverPhase40Audit({
  checkedAt,
  phase39Audit,
  packageJson,
})
const phase41Audit = buildOtpPostCutoverMonitoringPhase41Audit({
  checkedAt,
  phase40Audit,
  packageJson,
})
const phase42Audit = buildOtpProductionStabilisationSignoffPhase42Audit({
  checkedAt,
  phase41Audit,
  packageJson,
})
const report = buildOtpReleaseCloseoutArchivePhase43Audit({
  checkedAt,
  phase42Audit,
  packageJson,
})
const outputUrl = new URL('../docs/otp-release-closeout-archive-phase43.md', import.meta.url)

await writeFile(outputUrl, formatOtpReleaseCloseoutArchivePhase43Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
