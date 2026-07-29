import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* global process */

import {
  applyBondApplicationTransformation,
  acceptBondOriginatorIntakePackage,
  BOND_BUYER_GRANT_ACKNOWLEDGEMENT_STATUSES,
  approveBondApplicationExportPackage,
  BOND_BUYER_OFFER_DECISION_STATUSES,
  BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES,
  BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES,
  BOND_ORIGINATOR_FORMAL_INTEGRATION_VERSION,
  BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES,
  BOND_ORIGINATOR_DOCUMENT_REQUEST_TYPES,
  BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES,
  BOND_APPLICATION_GOVERNANCE_REPORT_STATUSES,
  BOND_ORIGINATOR_INTERNAL_READINESS_STATUSES,
  BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES,
  BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_VERSION,
  BOND_ORIGINATOR_PROGRESS_EVENT_TYPES,
  BOND_ORIGINATOR_PROGRESS_STATUSES,
  BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS,
  BOND_ORIGINATOR_PROGRESS_WORKSPACE_VERSION,
  BOND_ORIGINATOR_OFFER_GRANT_WORKSPACE_VERSION,
  BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES,
  BOND_ORIGINATOR_OPERATIONAL_HARDENING_VERSION,
  BOND_ORIGINATOR_OPERATIONAL_INCIDENT_SEVERITIES,
  BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES,
  BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_VERSION,
  BOND_ORIGINATOR_DOCUMENT_REQUEST_PRIORITIES,
  BOND_ORIGINATOR_DOCUMENT_REQUEST_WORKSPACE_VERSION,
  BOND_ORIGINATOR_WORKSPACE_MVP_VERSION,
  BOND_APPLICATION_RECIPIENT_FORMAT_KEYS,
  BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS,
  buildBondApplicationGovernanceReport,
  buildBondApplicationGovernanceReportCsv,
  buildBondApplicationGovernanceReportViewModel,
  buildBondOriginatorFormalIntegrationActivationPlan,
  buildBondOriginatorFormalIntegrationReadinessReport,
  buildBondOriginatorFormalIntegrationViewModel,
  buildBondOriginatorInternalReadinessCsv,
  buildBondOriginatorInternalReadinessReport,
  buildBondOriginatorInternalReadinessViewModel,
  buildBondOriginatorIntakePackageViewModel,
  buildBondOriginatorMultiOriginatorRolloutLaunchPlan,
  buildBondOriginatorMultiOriginatorRolloutReport,
  buildBondOriginatorMultiOriginatorRolloutViewModel,
  buildBondOriginatorDocumentRequestQueueViewModel,
  buildBondOriginatorDocumentRequestTargetOptions,
  buildBondOriginatorDocumentRequestViewModel,
  buildBondOriginatorWorkspaceMvpViewModel,
  buildBondOriginatorWorkspacePackageDetailViewModel,
  buildBondOriginatorAgentProgressViewModel,
  buildBondOriginatorAttorneyHandoffViewModel,
  buildBondApplicationRecipientFormatPackage,
  buildBondApplicationRecipientFormatViewModel,
  buildBondOriginatorBuyerOfferDecision,
  buildBondOriginatorBuyerGrantAcknowledgement,
  buildBondOriginatorBuyerOfferGrantViewModel,
  buildBondOriginatorOfferCaptureViewModel,
  buildBondOriginatorGrantCaptureViewModel,
  buildBondOriginatorOfferGrantCaptureWorkspaceViewModel,
  buildBondOriginatorDocumentRequestSummary,
  buildBondOriginatorOneOriginatorPilotLaunchPlan,
  buildBondOriginatorOneOriginatorPilotReport,
  buildBondOriginatorOneOriginatorPilotViewModel,
  buildBondOriginatorOperationalHardeningReport,
  buildBondOriginatorOperationalHardeningRunbook,
  buildBondOriginatorOperationalHardeningViewModel,
  buildBondOriginatorOfferGrantSummary,
  buildBondOriginatorProgressTimeline,
  buildBondOriginatorProgressEventViewModel,
  buildBondOriginatorProgressMilestones,
  buildBondOriginatorProgressWorkspaceViewModel,
  buildBondApplicationMappingCoverageReport,
  buildCanonicalBondApplicationExport,
  canonicalizeBondApplicationExport,
  confirmManualBondApplicationSubmission,
  createBondOriginatorBankOfferCapture,
  createBondOriginatorDocumentRequest,
  createBondOriginatorGrantCapture,
  filterBondOriginatorDocumentRequestsForViewer,
  filterBondOriginatorProgressForViewer,
  filterBondOriginatorWorkspacePackagesForViewer,
  getBondApplicationRecipientFormatProfile,
  getBondApplicationDestinationAdapter,
  hashBondApplicationSnapshot,
  hashCanonicalBondApplicationExport,
  listBondApplicationRecipientFormatProfiles,
  listBondApplicationDestinationAdapters,
  markBondOriginatorDocumentRequestViewed,
  prepareBondApplicationExportPackage,
  prepareBondOriginatorIntakePackage,
  publishBondOriginatorBankOfferToBuyer,
  publishBondOriginatorGrantToBuyer,
  recordBondOriginatorOfferBuyerDecision,
  recordBondOriginatorRequestedDocumentUpload,
  recordBondOriginatorProgressUpdate,
  recordBondOriginatorOperationalIncident,
  recordBondOriginatorPackageDownload,
  recordBondApplicationDeliveryAttempt,
  reviewBondOriginatorRequestedDocument,
  supersedeBondApplicationExportPackage,
  validateBondApplicationDestinationAdapter,
  validateBondApplicationRecipientFormatProfile,
  validateBondApplicationExportEligibility,
  validateCanonicalBondApplicationExport,
} from '../../application/index.js'
import {
  resolveBondApplicationExportsFlag,
  resolveBondApplicationIntegrationCapabilities,
} from '../../../../lib/guidedBondApplicationFeatureFlag.js'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDirectory, '../../../../..')

function readFile(relativePath) {
  const appPath = path.join(repoRoot, relativePath)
  if (fs.existsSync(appPath)) return fs.readFileSync(appPath, 'utf8')
  return fs.readFileSync(path.join(repoRoot, '..', relativePath), 'utf8')
}

function snapshotFixture(extra = {}) {
  return {
    snapshotSchemaVersion: '3',
    submissionVersion: 2,
    transaction: { id: 'transaction-phase8', reference: 'TX-8' },
    property: { unitNumber: 'A101', developmentName: 'Sanitized Estate' },
    finance: { purchasePrice: '2500000', depositAmount: '250000', requestedBondAmount: '2250000' },
    application: { applicantStructure: 'joint_with_surety', selectedBankIds: ['bank-a'] },
    selectedBanks: [{ bankId: 'bank-a', bankName: 'Bank A' }],
    participants: [
      {
        participantId: 'participant-primary',
        participantKey: 'primary_applicant:1',
        role: 'primary_applicant',
        answers: {
          personal: { first_name: 'Primary', surname: 'Buyer', identity_number: '9001010000000' },
          contact: { email: 'primary@example.test', phone: '+27110000001' },
          employment: { occupation_status: 'permanent_employee', employer_name: 'Primary Employer' },
          expenses: { gross_salary: '65000' },
          bankAccounts: [{ id: 'primary-account', bankName: 'Bank A', balance: '12000' }],
          debts: [{ id: 'debt-1', monthlyPayment: '3500' }],
        },
        declarations: [{ declarationKey: 'privacy_consent', version: '1', acceptedAt: '2026-07-28T08:00:00Z' }],
      },
      {
        participantId: 'participant-co',
        participantKey: 'co_applicant:1',
        role: 'co_applicant',
        answers: {
          personal: { first_name: 'Co', surname: 'Buyer' },
          employment: { occupation_status: 'self_employed', business_name: 'Co Business' },
          expenses: { gross_salary: '72000' },
        },
        declarations: [{ declarationKey: 'privacy_consent', version: '1', acceptedAt: '2026-07-28T08:05:00Z' }],
      },
      {
        participantId: 'participant-surety',
        participantKey: 'surety:1',
        role: 'surety',
        answers: {
          personal: { first_name: 'Sam', surname: 'Surety' },
          financial_position: { net_asset_position: 'positive' },
          surety_terms_confirmation: { approved_terms_version: 'blocked-pending-legal' },
        },
        declarations: [{ declarationKey: 'surety_release_blocker', version: 'draft', acceptedAt: null }],
      },
    ],
    documentManifest: [
      { participantKey: 'primary_applicant:1', participantRole: 'primary_applicant', requirementKey: 'primary_applicant:1:identity', canonicalDocumentType: 'buyer_id_document', matchedDocumentId: 'doc-primary-id', storagePath: 'private/path.pdf' },
      { participantKey: 'co_applicant:1', participantRole: 'co_applicant', requirementKey: 'co_applicant:1:income', canonicalDocumentType: 'proof_of_income', matchedDocumentId: 'doc-co-income' },
      { participantKey: 'surety:1', participantRole: 'surety', requirementKey: 'surety:1:identity', canonicalDocumentType: 'buyer_id_document', matchedDocumentId: 'doc-surety-id' },
      { requirementKey: 'shared:purchase_agreement', canonicalDocumentType: 'purchase_agreement', matchedDocumentId: 'doc-shared' },
    ],
    signerManifest: [
      { participantId: 'participant-primary', participantKey: 'primary_applicant:1', participantRole: 'primary_applicant', status: 'completed', signingToken: 'never-export' },
      { participantId: 'participant-co', participantKey: 'co_applicant:1', participantRole: 'co_applicant', status: 'completed' },
      { participantId: 'participant-surety', participantKey: 'surety:1', participantRole: 'surety', status: 'completed' },
    ],
    source: { reviewContextHash: 'review-context-v2', navigationState: { screen: 'done' }, portalToken: 'never-export' },
    internalNote: 'never export',
    versions: { flowVersion: 'phase-7-v1' },
    ...extra,
  }
}

async function submittedSubmissionFixture(extra = {}) {
  const snapshot = snapshotFixture()
  const hash = await hashBondApplicationSnapshot(snapshot)
  return {
    id: 'submission-phase8-v2',
    transaction_id: 'transaction-phase8',
    bond_application_id: 'application-phase8',
    status: 'submitted',
    submission_version: 2,
    snapshot_json: snapshot,
    snapshot_hash: hash,
    source_application_revision: 8,
    review_context_hash: 'review-context-v2',
    submitted_at: '2026-07-28T09:00:00Z',
    ...extra,
  }
}

function fullR1MigrationEvidence() {
  return {
    phase5_submissions: true,
    phase6_participants: true,
    phase7_sureties_revisions: true,
    phase8_external_exports: true,
    phase8a_originator_intake: true,
    phase8b_originator_document_requests: true,
    phase8c_originator_progress_tracking: true,
    phase8d_offers_grants: true,
    phase8e_buyer_offer_grant_experience: true,
    phase8f_agent_progress_view: true,
    phase8g_attorney_handoff: true,
    phase8h_recipient_specific_formats: true,
    phase8i_governance_reporting: true,
  }
}

async function runFeatureFlagTests() {
  assert.equal(resolveBondApplicationExportsFlag({ env: {}, config: {}, organisation: {}, transaction: {} }).enabled, false)
  assert.equal(resolveBondApplicationIntegrationCapabilities({
    env: {},
    config: {
      guided_bond_application_v2: true,
      guided_bond_application_participants_v1: true,
      bond_application_exports_v1: true,
      bond_application_ooba_adapter_v1: true,
      bond_application_bank_adapters_v1: true,
      bond_application_live_delivery_v1: true,
      bond_application_external_status_sync_v1: true,
    },
  }).liveDeliveryV1, true)
  assert.equal(resolveBondApplicationIntegrationCapabilities({
    config: {
      guided_bond_application_v2: true,
      bond_application_exports_v1: true,
      bond_application_ooba_adapter_v1: true,
    },
  }).exportsV1, false)
}

async function runCanonicalExportTests() {
  const submission = await submittedSubmissionFixture()
  const canonical = buildCanonicalBondApplicationExport({ submission, generatedAt: '2026-07-28T10:00:00Z' })
  assert.equal(canonical.canonicalSchemaVersion, 'phase-8-canonical-v1')
  assert.equal(canonical.source.snapshotHash, submission.snapshot_hash)
  assert.equal(canonical.participants.length, 3)
  assert.equal(canonical.participants.find((participant) => participant.role === 'surety').documents.length, 1)
  assert.equal(canonical.documents.manifest.length, 1)
  assert.equal(canonical.application.finance.purchasePrice.amount, '2500000.00')
  assert.equal(JSON.stringify(canonical).includes('never-export'), false)
  assert.equal(JSON.stringify(canonical).includes('private/path.pdf'), false)
  assert.equal(validateCanonicalBondApplicationExport(canonical).valid, true)

  const same = buildCanonicalBondApplicationExport({
    submission: await submittedSubmissionFixture({ snapshot_json: snapshotFixture({ source: { reviewContextHash: 'review-context-v2', navigationState: { screen: 'another' } } }) }),
    generatedAt: '2026-07-28T10:00:00Z',
  })
  assert.equal(await hashCanonicalBondApplicationExport(canonical), await hashCanonicalBondApplicationExport(same))

  const changed = buildCanonicalBondApplicationExport({
    submission: await submittedSubmissionFixture({ snapshot_json: snapshotFixture({ finance: { purchasePrice: '2600000' } }) }),
    generatedAt: '2026-07-28T10:00:00Z',
  })
  assert.notEqual(await hashCanonicalBondApplicationExport(canonical), await hashCanonicalBondApplicationExport(changed))
  assert.equal(canonicalizeBondApplicationExport(canonical), canonicalizeBondApplicationExport(buildCanonicalBondApplicationExport({ submission, generatedAt: '2026-07-28T10:00:00Z' })))
}

async function runAdapterRegistryTests() {
  const adapters = listBondApplicationDestinationAdapters()
  assert.ok(adapters.some((adapter) => adapter.destinationKey === 'ooba'))
  const ooba = getBondApplicationDestinationAdapter('ooba')
  assert.equal(ooba.enabled, false)
  assert.equal(ooba.officialSpecificationAvailable, false)
  assert.equal(validateBondApplicationDestinationAdapter(ooba).valid, false)
  const coverage = buildBondApplicationMappingCoverageReport(ooba)
  assert.equal(coverage.unmappedSourceGroups.includes('participants'), true)
  assert.equal(ooba.mapCanonicalToDestination({}).ok, false)
}

async function runTransformationTests() {
  assert.equal(applyBondApplicationTransformation('date_to_yyyy_mm_dd', '2026-07-28T12:30:00Z'), '2026-07-28')
  assert.equal(applyBondApplicationTransformation('boolean_to_yes_no', false), 'No')
  assert.equal(applyBondApplicationTransformation('boolean_to_y_n', 'yes'), 'Y')
  assert.equal(applyBondApplicationTransformation('exact_money_to_decimal_string', { amount: '1,234.5' }), '1234.50')
  assert.equal(applyBondApplicationTransformation('exact_money_to_minor_units', '1234.56'), 123456)
  assert.deepEqual(applyBondApplicationTransformation('phone_to_e164_or_block', '011 000 0001'), { blocked: true, reason: 'phone_not_e164', value: '0110000001' })
}

async function runEligibilityPackageDeliveryTests() {
  const submission = await submittedSubmissionFixture()
  const ooba = getBondApplicationDestinationAdapter('ooba')
  const eligibility = await validateBondApplicationExportEligibility({ submission, destinationAdapter: ooba })
  assert.equal(eligibility.eligible, false)
  assert.ok(eligibility.issues.some((item) => item.code === 'official_destination_specification_missing'))

  const draftEligibility = await validateBondApplicationExportEligibility({ submission: { ...submission, status: 'awaiting_signatures' } })
  assert.equal(draftEligibility.eligible, false)
  assert.ok(draftEligibility.issues.some((item) => item.code === 'submission_not_submitted'))

  const supersededEligibility = await validateBondApplicationExportEligibility({ submission: { ...submission, superseded_at: '2026-07-28T11:00:00Z' } })
  assert.equal(supersededEligibility.eligible, false)
  assert.ok(supersededEligibility.issues.some((item) => item.code === 'submission_superseded'))

  const tamperedEligibility = await validateBondApplicationExportEligibility({
    submission: { ...submission, snapshot_json: snapshotFixture({ finance: { purchasePrice: '999' } }) },
  })
  assert.ok(tamperedEligibility.issues.some((item) => item.code === 'snapshot_hash_mismatch'))

  const prepared = await prepareBondApplicationExportPackage({
    submission,
    destinationKey: 'ooba',
    idempotencyKey: 'prepare-1',
    generatedAt: '2026-07-28T10:00:00Z',
  })
  assert.equal(prepared.ok, false)
  assert.equal(prepared.package.status, 'validation_failed')
  assert.equal(prepared.package.destinationPayload, null)
  assert.equal(prepared.package.operationalContext.noAutomaticBankSubmission, true)
  assert.equal(JSON.stringify(prepared.package).includes('transaction_bond_applications'), false)

  const repeated = await prepareBondApplicationExportPackage({
    submission,
    existingPackage: prepared.package,
    idempotencyKey: 'prepare-1',
  })
  assert.equal(repeated.idempotent, true)

  const approved = approveBondApplicationExportPackage({ exportPackage: prepared.package, approvedBy: 'originator' })
  assert.equal(approved.ok, false)
  assert.equal(approved.reason, 'package_has_blocking_validation_issues')

  const approvedPackage = {
    ...prepared.package,
    status: 'approved',
    validationIssues: [],
    id: 'package-1',
  }
  const attempt = recordBondApplicationDeliveryAttempt({ exportPackage: approvedPackage, idempotencyKey: 'delivery-1' })
  assert.equal(attempt.ok, true)
  assert.equal(attempt.attempt.bankWorkflowUpdateDeferred, true)

  const confirmationMissingReference = confirmManualBondApplicationSubmission({ exportPackage: approvedPackage })
  assert.equal(confirmationMissingReference.ok, false)
  const confirmation = confirmManualBondApplicationSubmission({
    exportPackage: approvedPackage,
    externalReference: 'OOBA-REF-123',
    confirmedBy: 'originator',
  })
  assert.equal(confirmation.ok, true)
  assert.equal(confirmation.bankWorkflowUpdateProposal.requiresAuthorizedOriginatorReview, true)
  assert.equal(confirmation.package.status, 'delivered')

  const superseded = supersedeBondApplicationExportPackage({ exportPackage: approvedPackage, supersededByPackageId: 'package-2' })
  assert.equal(superseded.status, 'superseded')
}

async function runOriginatorIntakePackageTests() {
  const submission = await submittedSubmissionFixture()
  const prepared = await prepareBondOriginatorIntakePackage({
    submission,
    originatorRecipient: {
      id: 'originator-user',
      name: 'OOBA Intake Team',
    },
    packageDocuments: [{
      documentRole: 'main_application',
      matchedDocumentId: 'signed-application-doc',
      status: 'signed',
      signedUrl: 'never-export',
    }],
    idempotencyKey: 'originator-intake-1',
    generatedAt: '2026-07-28T10:30:00Z',
  })
  assert.equal(prepared.ok, true)
  assert.equal(prepared.package.destinationKey, 'bond_originator_intake')
  assert.equal(prepared.package.destinationType, 'bond_originator')
  assert.equal(prepared.package.status, 'ready_for_originator')
  assert.equal(prepared.package.documentBundleManifest.packageDocumentCount, 1)
  assert.equal(prepared.package.documentBundleManifest.supportingDocuments.length, 4)
  assert.equal(JSON.stringify(prepared.package).includes('never-export'), false)
  assert.equal(prepared.package.operationalContext.noAutomaticBankSubmission, true)

  const repeated = await prepareBondOriginatorIntakePackage({
    submission,
    existingPackage: prepared.package,
    idempotencyKey: 'originator-intake-1',
  })
  assert.equal(repeated.idempotent, true)

  const readyView = buildBondOriginatorIntakePackageViewModel({ exportPackage: prepared.package })
  assert.equal(readyView.statusLabel, 'Package ready')
  assert.equal(readyView.actions.canAccept, true)
  assert.equal(readyView.actions.canDownload, false)
  assert.equal(readyView.documentCounts.total, 5)

  const accepted = acceptBondOriginatorIntakePackage({
    exportPackage: { ...prepared.package, id: 'originator-package-1' },
    acceptedBy: 'originator-user',
    acceptedAt: '2026-07-28T11:00:00Z',
  })
  assert.equal(accepted.ok, true)
  assert.equal(accepted.package.status, 'accepted_by_originator')
  assert.equal(accepted.event.sensitivePayloadIncluded, false)
  assert.equal(accepted.package.operationalContext.noAutomaticBankSubmission, true)

  const acceptedView = buildBondOriginatorIntakePackageViewModel({ exportPackage: accepted.package })
  assert.equal(acceptedView.actions.canDownload, true)
  assert.equal(acceptedView.actions.canRequestMoreDocuments, true)

  const download = recordBondOriginatorPackageDownload({
    exportPackage: accepted.package,
    downloadedBy: 'originator-user',
    downloadedAt: '2026-07-28T11:05:00Z',
    documentIds: ['signed-application-doc', 'doc-primary-id', 'doc-co-income'],
    idempotencyKey: 'download-1',
  })
  assert.equal(download.ok, true)
  assert.equal(download.package.status, 'downloaded')
  assert.equal(download.package.downloadCount, 1)
  assert.equal(download.attempt.deliveryMethod, 'originator_package_download')
  assert.equal(download.attempt.bankWorkflowUpdateDeferred, true)
  assert.equal(download.bankWorkflowUpdateProposal, undefined)

  const downloadView = buildBondOriginatorIntakePackageViewModel({ exportPackage: download.package })
  assert.equal(downloadView.statusLabel, 'Downloaded by originator')
  assert.equal(downloadView.downloadCount, 1)
  assert.equal(downloadView.bankWorkflowUnchanged, true)
}

async function runRecipientSpecificFormatTests() {
  const profiles = listBondApplicationRecipientFormatProfiles()
  assert.ok(profiles.some((profile) => profile.profileKey === BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.oobaOriginatorManual))
  assert.equal(validateBondApplicationRecipientFormatProfile(
    getBondApplicationRecipientFormatProfile(BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.arch9OriginatorManual),
  ).valid, true)
  assert.equal(validateBondApplicationRecipientFormatProfile(
    getBondApplicationRecipientFormatProfile(BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.oobaOfficialPayload),
  ).valid, false)

  const submission = await submittedSubmissionFixture()
  const prepared = await prepareBondOriginatorIntakePackage({
    submission,
    originatorRecipient: { id: 'ooba-originator', name: 'OOBA Intake Team' },
    packageDocuments: [{
      documentRole: 'main_application',
      matchedDocumentId: 'signed-application-doc',
      status: 'signed',
      signedUrl: 'never-export',
    }],
    idempotencyKey: 'originator-intake-recipient-formats',
    generatedAt: '2026-07-28T10:30:00Z',
  })
  const formatPackage = await buildBondApplicationRecipientFormatPackage({
    exportPackage: { ...prepared.package, id: 'originator-package-recipient-formats' },
    recipientProfileKey: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.oobaOriginatorManual,
    requestedBy: 'originator-user',
    idempotencyKey: 'recipient-formats-1',
    generatedAt: '2026-07-28T14:00:00Z',
  })
  assert.equal(formatPackage.ok, true)
  assert.equal(formatPackage.formatPackage.status, 'ready_for_download')
  assert.equal(formatPackage.formatPackage.manualDownloadOnly, true)
  assert.equal(formatPackage.formatPackage.liveDeliveryEnabled, false)
  assert.equal(formatPackage.formatPackage.bankWorkflowUnchanged, true)
  assert.equal(formatPackage.formatPackage.artifacts.length, 3)
  assert.ok(formatPackage.formatPackage.artifacts.some((artifact) => artifact.formatKey === BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.originatorJson))
  assert.ok(formatPackage.formatPackage.artifacts.some((artifact) => artifact.formatKey === BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.originatorSummaryCsv))
  assert.ok(formatPackage.formatPackage.artifacts.some((artifact) => artifact.formatKey === BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.documentManifestCsv))
  assert.ok(formatPackage.formatPackage.blockedArtifacts.some((artifact) => artifact.formatKey === BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.oobaOfficialPayload))
  assert.ok(formatPackage.formatPackage.blockerSummary.some((issue) => issue.code === 'official_schema_missing'))
  assert.equal(JSON.stringify(formatPackage.formatPackage).includes('never-export'), false)
  assert.equal(JSON.stringify(formatPackage.formatPackage).includes('private/path.pdf'), false)
  assert.equal(JSON.stringify(formatPackage.formatPackage).includes('signingToken'), false)

  const view = buildBondApplicationRecipientFormatViewModel({ formatPackage: formatPackage.formatPackage })
  assert.equal(view.available, true)
  assert.equal(view.actions.canDownload, true)
  assert.equal(view.actions.canLiveDeliver, false)
  assert.equal(view.blockedFormats.length, 1)
  assert.equal(JSON.stringify(view).includes('identity_number'), false)

  const repeated = await buildBondApplicationRecipientFormatPackage({
    exportPackage: prepared.package,
    existingFormatPackage: formatPackage.formatPackage,
    idempotencyKey: 'recipient-formats-1',
  })
  assert.equal(repeated.idempotent, true)

  const officialOoba = await buildBondApplicationRecipientFormatPackage({
    exportPackage: prepared.package,
    recipientProfileKey: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.oobaOfficialPayload,
  })
  assert.equal(officialOoba.ok, false)
  assert.equal(officialOoba.formatPackage.status, 'blocked')
  assert.equal(officialOoba.formatPackage.artifacts.length, 0)
  assert.ok(officialOoba.formatPackage.blockerSummary.some((issue) => issue.code === 'transport_policy_missing'))
  assert.equal(officialOoba.formatPackage.liveDeliveryEnabled, false)

  const officialBank = await buildBondApplicationRecipientFormatPackage({
    exportPackage: prepared.package,
    recipientProfileKey: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.bankOfficialPayload,
  })
  assert.equal(officialBank.ok, false)
  assert.ok(officialBank.formatPackage.blockerSummary.some((issue) => issue.code === 'acknowledgement_contract_missing'))
  assert.equal(JSON.stringify(officialBank.formatPackage).includes('transaction_bond_applications'), false)
}

async function runOriginatorDocumentRequestTests() {
  const submission = await submittedSubmissionFixture()
  const prepared = await prepareBondOriginatorIntakePackage({
    submission,
    originatorRecipient: { id: 'originator-user', name: 'Bond Originator' },
    idempotencyKey: 'originator-intake-doc-requests',
    generatedAt: '2026-07-28T10:30:00Z',
  })
  const notAccepted = createBondOriginatorDocumentRequest({
    exportPackage: prepared.package,
    title: 'Latest payslip',
    buyerInstruction: 'Please upload your latest payslip.',
    canonicalDocumentType: 'proof_of_income',
  })
  assert.equal(notAccepted.ok, false)
  assert.equal(notAccepted.reason, 'originator_package_not_accepted')

  const accepted = acceptBondOriginatorIntakePackage({
    exportPackage: { ...prepared.package, id: 'originator-package-doc-requests' },
    acceptedBy: 'originator-user',
  })
  const primaryRequest = createBondOriginatorDocumentRequest({
    exportPackage: accepted.package,
    requestType: BOND_ORIGINATOR_DOCUMENT_REQUEST_TYPES.replacement,
    participantKey: 'primary_applicant:1',
    participantRole: 'primary_applicant',
    requirementKey: 'primary_applicant:1:income',
    canonicalDocumentType: 'proof_of_income',
    title: 'Latest payslip',
    buyerInstruction: 'Please upload your latest income document.',
    internalNote: 'Internal affordability note must stay private.',
    requestedBy: 'originator-user',
    idempotencyKey: 'request-primary-income',
    createdAt: '2026-07-28T12:00:00Z',
  })
  assert.equal(primaryRequest.ok, true)
  assert.equal(primaryRequest.request.status, BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.sent)
  assert.equal(primaryRequest.request.requiresNewSubmission, false)
  assert.equal(primaryRequest.request.bankWorkflowUnchanged, true)
  assert.equal(primaryRequest.request.sourceSnapshotHash, accepted.package.sourceSnapshotHash)

  const repeated = createBondOriginatorDocumentRequest({
    exportPackage: accepted.package,
    existingRequest: primaryRequest.request,
    idempotencyKey: 'request-primary-income',
  })
  assert.equal(repeated.idempotent, true)

  const coRequest = createBondOriginatorDocumentRequest({
    exportPackage: accepted.package,
    participantKey: 'co_applicant:1',
    participantRole: 'co_applicant',
    requirementKey: 'co_applicant:1:bank_statement',
    canonicalDocumentType: 'bank_statement',
    title: 'Bank statement',
    buyerInstruction: 'Please upload the latest bank statement.',
    requestedBy: 'originator-user',
  })
  assert.equal(coRequest.ok, true)

  const sharedRequest = createBondOriginatorDocumentRequest({
    exportPackage: accepted.package,
    requestType: BOND_ORIGINATOR_DOCUMENT_REQUEST_TYPES.supplemental,
    requirementKey: 'shared:deposit_evidence',
    canonicalDocumentType: 'deposit_evidence',
    title: 'Deposit evidence',
    buyerInstruction: 'Please upload proof of the deposit payment.',
    requestedBy: 'originator-user',
  })
  assert.equal(sharedRequest.ok, true)
  assert.equal(sharedRequest.request.targetScope, 'application_documents')

  const buyerVisible = filterBondOriginatorDocumentRequestsForViewer({
    requests: [primaryRequest.request, coRequest.request, sharedRequest.request],
    viewerRole: 'primary_applicant',
    viewerParticipantKey: 'primary_applicant:1',
  })
  assert.equal(buyerVisible.length, 2)
  assert.equal(buyerVisible.some((request) => request.participantKey === 'co_applicant:1'), false)
  assert.equal(JSON.stringify(buyerVisible).includes('Internal affordability note'), false)

  const viewed = markBondOriginatorDocumentRequestViewed({
    request: primaryRequest.request,
    viewedAt: '2026-07-28T12:05:00Z',
  })
  assert.equal(viewed.ok, true)
  assert.equal(viewed.request.status, BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.viewed)

  const uploaded = recordBondOriginatorRequestedDocumentUpload({
    request: viewed.request,
    documentId: 'doc-primary-latest-payslip',
    uploadedBy: 'participant-primary',
    uploadedAt: '2026-07-28T12:10:00Z',
    idempotencyKey: 'upload-primary-income',
  })
  assert.equal(uploaded.ok, true)
  assert.equal(uploaded.request.status, BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.awaitingReview)
  assert.equal(uploaded.request.linkedDocumentId, 'doc-primary-latest-payslip')
  assert.equal(uploaded.event.bankWorkflowUnchanged, true)

  const acceptedDocument = reviewBondOriginatorRequestedDocument({
    request: uploaded.request,
    action: 'accept',
    reviewedBy: 'originator-user',
    reviewedAt: '2026-07-28T12:20:00Z',
  })
  assert.equal(acceptedDocument.ok, true)
  assert.equal(acceptedDocument.request.status, BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.accepted)
  assert.equal(acceptedDocument.event.bankWorkflowUnchanged, true)

  const moreInfo = reviewBondOriginatorRequestedDocument({
    request: coRequest.request,
    action: 'more_information',
    reviewedBy: 'originator-user',
    buyerSafeFeedback: 'Please upload the full statement showing all pages.',
    internalNote: 'Private originator context',
  })
  assert.equal(moreInfo.ok, true)
  assert.equal(moreInfo.request.status, BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.needsMoreInformation)
  const coVisible = filterBondOriginatorDocumentRequestsForViewer({
    requests: [moreInfo.request],
    viewerRole: 'co_applicant',
    viewerParticipantKey: 'co_applicant:1',
  })
  assert.equal(coVisible.length, 1)
  assert.equal(JSON.stringify(coVisible).includes('Private originator context'), false)
  assert.equal(coVisible[0].buyerSafeFeedback, 'Please upload the full statement showing all pages.')

  const summary = buildBondOriginatorDocumentRequestSummary([
    acceptedDocument.request,
    moreInfo.request,
    sharedRequest.request,
  ])
  assert.equal(summary.total, 3)
  assert.equal(summary.open, 2)
  assert.equal(summary.accepted, 1)
  assert.equal(summary.needsMoreInformation, 1)

  const packageView = buildBondOriginatorIntakePackageViewModel({
    exportPackage: {
      ...accepted.package,
      documentRequests: [acceptedDocument.request, moreInfo.request, sharedRequest.request],
    },
  })
  assert.equal(packageView.documentRequestSummary.open, 2)
  assert.equal(packageView.actions.canRequestMoreDocuments, true)
}

async function runOriginatorDocumentRequestWorkspaceTests() {
  const submission = await submittedSubmissionFixture()
  const prepared = await prepareBondOriginatorIntakePackage({
    submission,
    originatorRecipient: { id: 'originator-user', name: 'Bond Originator' },
    packageDocuments: [{
      documentRole: 'main_application',
      matchedDocumentId: 'signed-application-doc',
      status: 'signed',
      signedUrl: 'never-export',
    }],
    idempotencyKey: 'originator-intake-r3-doc-requests',
    generatedAt: '2026-07-28T10:30:00Z',
  })
  const accepted = acceptBondOriginatorIntakePackage({
    exportPackage: { ...prepared.package, id: 'originator-package-r3-doc-requests' },
    acceptedBy: 'originator-user',
  })
  const primaryRequest = createBondOriginatorDocumentRequest({
    exportPackage: accepted.package,
    requestType: BOND_ORIGINATOR_DOCUMENT_REQUEST_TYPES.missing,
    priority: BOND_ORIGINATOR_DOCUMENT_REQUEST_PRIORITIES.urgent,
    participantKey: 'primary_applicant:1',
    participantRole: 'primary_applicant',
    requirementKey: 'primary_applicant:1:latest_payslip',
    canonicalDocumentType: 'proof_of_income',
    title: 'Latest payslip',
    buyerInstruction: 'Please upload your latest payslip.',
    internalNote: 'Originator-only affordability context.',
    requestedBy: 'originator-user',
    dueAt: '2026-08-01T10:00:00Z',
    idempotencyKey: 'r3-request-primary',
    createdAt: '2026-07-28T12:00:00Z',
  })
  const coRequest = createBondOriginatorDocumentRequest({
    exportPackage: accepted.package,
    participantKey: 'co_applicant:1',
    participantRole: 'co_applicant',
    requirementKey: 'co_applicant:1:bank_statement',
    canonicalDocumentType: 'bank_statement',
    title: 'Bank statement',
    buyerInstruction: 'Please upload the latest bank statement.',
    internalNote: 'Do not show to primary.',
    requestedBy: 'originator-user',
    idempotencyKey: 'r3-request-co',
  })
  const uploaded = recordBondOriginatorRequestedDocumentUpload({
    request: primaryRequest.request,
    documentId: 'doc-primary-latest-payslip',
    uploadedBy: 'participant-primary',
    uploadedAt: '2026-07-28T12:10:00Z',
    idempotencyKey: 'r3-upload-primary',
  })

  const originatorRequestView = buildBondOriginatorDocumentRequestViewModel({
    request: uploaded.request,
    viewer: 'originator',
  })
  assert.equal(originatorRequestView.workspaceVersion, BOND_ORIGINATOR_DOCUMENT_REQUEST_WORKSPACE_VERSION)
  assert.equal(originatorRequestView.group, 'awaiting_originator_review')
  assert.equal(originatorRequestView.actions.canAccept, true)
  assert.equal(originatorRequestView.actions.canCreateNewSubmission, false)
  assert.equal(originatorRequestView.actions.canMutateBankWorkflow, false)
  assert.equal(originatorRequestView.internalNote, 'Originator-only affordability context.')

  const buyerRequestView = buildBondOriginatorDocumentRequestViewModel({
    request: uploaded.request,
    viewer: 'buyer',
    viewerRole: 'primary_applicant',
    viewerParticipantKey: 'primary_applicant:1',
  })
  assert.equal(buyerRequestView.actions.canUpload, true)
  assert.equal(buyerRequestView.privacy.internalNoteIncluded, false)
  assert.equal(JSON.stringify(buyerRequestView).includes('Originator-only'), false)

  const hiddenFromPrimary = buildBondOriginatorDocumentRequestViewModel({
    request: coRequest.request,
    viewer: 'buyer',
    viewerRole: 'primary_applicant',
    viewerParticipantKey: 'primary_applicant:1',
  })
  assert.equal(hiddenFromPrimary, null)

  const originatorQueue = buildBondOriginatorDocumentRequestQueueViewModel({
    exportPackage: accepted.package,
    requests: [uploaded.request, coRequest.request],
    viewer: 'originator',
    generatedAt: '2026-07-28T12:30:00Z',
  })
  assert.equal(originatorQueue.summary.total, 2)
  assert.equal(originatorQueue.groups.awaitingOriginatorReview.length, 1)
  assert.equal(originatorQueue.actions.canReviewRequests, true)
  assert.equal(originatorQueue.actions.canCreateNewSubmission, false)
  assert.equal(originatorQueue.workflowBoundary.noNewSubmissionVersion, true)
  assert.equal(originatorQueue.workflowBoundary.bankWorkflowUnchanged, true)
  assert.equal(JSON.stringify(originatorQueue).includes('never-export'), false)

  const primaryQueue = buildBondOriginatorDocumentRequestQueueViewModel({
    exportPackage: accepted.package,
    requests: [uploaded.request, coRequest.request],
    viewer: 'buyer',
    viewerRole: 'primary_applicant',
    viewerParticipantKey: 'primary_applicant:1',
  })
  assert.equal(primaryQueue.summary.total, 1)
  assert.equal(JSON.stringify(primaryQueue).includes('Do not show to primary'), false)

  const targets = buildBondOriginatorDocumentRequestTargetOptions({
    exportPackage: accepted.package,
  })
  assert.equal(targets.workspaceVersion, BOND_ORIGINATOR_DOCUMENT_REQUEST_WORKSPACE_VERSION)
  assert.equal(targets.options.some((option) => option.requirementKey === 'primary_applicant:1:identity'), true)
  assert.equal(targets.payloadsExcluded, true)
  assert.equal(JSON.stringify(targets).includes('private/path.pdf'), false)

  const acceptedDocument = reviewBondOriginatorRequestedDocument({
    request: uploaded.request,
    action: 'accept',
    reviewedBy: 'originator-user',
  })
  const resolvedQueue = buildBondOriginatorDocumentRequestQueueViewModel({
    exportPackage: accepted.package,
    requests: [acceptedDocument.request],
    viewer: 'originator',
  })
  assert.equal(resolvedQueue.summary.accepted, 1)
  assert.equal(resolvedQueue.workflowBoundary.signedSnapshotUnchanged, true)
}

async function runOriginatorProgressTrackingTests() {
  const submission = await submittedSubmissionFixture()
  const prepared = await prepareBondOriginatorIntakePackage({
    submission,
    originatorRecipient: { id: 'originator-user', name: 'Bond Originator' },
    idempotencyKey: 'originator-intake-progress',
    generatedAt: '2026-07-28T10:30:00Z',
  })
  const tooEarly = recordBondOriginatorProgressUpdate({
    exportPackage: { ...prepared.package, status: 'validation_failed' },
    title: 'Review started',
    summary: 'The originator is reviewing the application.',
  })
  assert.equal(tooEarly.ok, false)
  assert.equal(tooEarly.reason, 'originator_package_not_ready_for_progress')

  const accepted = acceptBondOriginatorIntakePackage({
    exportPackage: { ...prepared.package, id: 'originator-package-progress' },
    acceptedBy: 'originator-user',
    acceptedAt: '2026-07-28T11:00:00Z',
  })
  const downloaded = recordBondOriginatorPackageDownload({
    exportPackage: accepted.package,
    downloadedBy: 'originator-user',
    downloadedAt: '2026-07-28T11:05:00Z',
    documentIds: ['signed-application-doc'],
  })
  const update = recordBondOriginatorProgressUpdate({
    exportPackage: downloaded.package,
    eventType: BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.originatorProcessing,
    status: BOND_ORIGINATOR_PROGRESS_STATUSES.inProgress,
    title: 'Originator processing',
    summary: 'The bond originator is processing the submitted information.',
    internalNote: 'Internal queue detail',
    recordedBy: 'originator-user',
    idempotencyKey: 'originator-progress-1',
    occurredAt: '2026-07-28T12:00:00Z',
  })
  assert.equal(update.ok, true)
  assert.equal(update.progressEvent.bankWorkflowUnchanged, true)
  assert.equal(update.event.bankWorkflowUnchanged, true)

  const repeated = recordBondOriginatorProgressUpdate({
    exportPackage: downloaded.package,
    existingEvent: update.progressEvent,
    idempotencyKey: 'originator-progress-1',
  })
  assert.equal(repeated.idempotent, true)

  const buyerHiddenUpdate = recordBondOriginatorProgressUpdate({
    exportPackage: downloaded.package,
    eventType: BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.onHold,
    status: BOND_ORIGINATOR_PROGRESS_STATUSES.onHold,
    title: 'Internal originator hold',
    summary: 'Internal review is underway.',
    internalNote: 'Do not show to buyer',
    visibility: { visibleToBuyer: false, visibleToAgent: true, visibleToOriginator: true },
    occurredAt: '2026-07-28T12:05:00Z',
  })
  assert.equal(buyerHiddenUpdate.ok, true)

  const agentHiddenUpdate = recordBondOriginatorProgressUpdate({
    exportPackage: downloaded.package,
    eventType: BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.originatorProcessing,
    status: BOND_ORIGINATOR_PROGRESS_STATUSES.inProgress,
    title: 'Originator private processing',
    summary: 'This should not be visible to agents.',
    internalNote: 'Do not show to agent',
    visibility: { visibleToBuyer: false, visibleToAgent: false, visibleToOriginator: true },
    occurredAt: '2026-07-28T12:06:00Z',
  })
  assert.equal(agentHiddenUpdate.ok, true)

  const documentRequest = createBondOriginatorDocumentRequest({
    exportPackage: downloaded.package,
    participantKey: 'primary_applicant:1',
    participantRole: 'primary_applicant',
    requirementKey: 'primary_applicant:1:payslip',
    canonicalDocumentType: 'proof_of_income',
    title: 'Payslip',
    buyerInstruction: 'Please upload your latest payslip.',
    createdAt: '2026-07-28T12:10:00Z',
  })
  const timeline = buildBondOriginatorProgressTimeline({
    exportPackage: {
      ...downloaded.package,
      progressEvents: [update.progressEvent, buyerHiddenUpdate.progressEvent, agentHiddenUpdate.progressEvent],
      documentRequests: [documentRequest.request],
    },
  })
  assert.ok(timeline.events.some((event) => event.eventType === BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.packageAccepted))
  assert.ok(timeline.events.some((event) => event.eventType === BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.packageDownloaded))
  assert.ok(timeline.events.some((event) => event.eventType === BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.documentsRequested))
  assert.equal(timeline.summary.bankWorkflowUnchanged, true)

  const buyerTimeline = filterBondOriginatorProgressForViewer({ timeline, viewer: 'buyer' })
  assert.equal(JSON.stringify(buyerTimeline).includes('Internal queue detail'), false)
  assert.equal(JSON.stringify(buyerTimeline).includes('Internal originator hold'), false)
  const agentTimeline = filterBondOriginatorProgressForViewer({ timeline, viewer: 'agent' })
  assert.equal(agentTimeline.events.some((event) => event.title === 'Internal originator hold'), true)
  assert.equal(agentTimeline.events.some((event) => event.title === 'Originator private processing'), false)
  assert.equal(JSON.stringify(agentTimeline).includes('Do not show to buyer'), false)

  const view = buildBondOriginatorIntakePackageViewModel({
    exportPackage: {
      ...downloaded.package,
      progressEvents: [update.progressEvent],
      documentRequests: [documentRequest.request],
    },
  })
  assert.equal(view.progressSummary.bankWorkflowUnchanged, true)
  assert.ok(view.progressSummary.currentLabel)

  const originatorEventView = buildBondOriginatorProgressEventViewModel({
    event: update.progressEvent,
    viewer: BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS.originator,
  })
  assert.equal(originatorEventView.workspaceVersion, BOND_ORIGINATOR_PROGRESS_WORKSPACE_VERSION)
  assert.equal(originatorEventView.internalNote, 'Internal queue detail')
  assert.equal(originatorEventView.trackingOnly, true)
  assert.equal(originatorEventView.bankWorkflowUnchanged, true)

  const buyerEventView = buildBondOriginatorProgressEventViewModel({
    event: update.progressEvent,
    viewer: BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS.buyer,
  })
  assert.equal(JSON.stringify(buyerEventView).includes('Internal queue detail'), false)
  assert.equal(buyerEventView.sensitivePayloadIncluded, false)

  const hiddenBuyerEvent = buildBondOriginatorProgressEventViewModel({
    event: buyerHiddenUpdate.progressEvent,
    viewer: BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS.buyer,
  })
  assert.equal(hiddenBuyerEvent, null)

  const milestones = buildBondOriginatorProgressMilestones({
    exportPackage: downloaded.package,
    progressEvents: [update.progressEvent],
    documentRequests: [documentRequest.request],
  })
  assert.equal(milestones.workspaceVersion, BOND_ORIGINATOR_PROGRESS_WORKSPACE_VERSION)
  assert.ok(milestones.milestones.some((milestone) => milestone.key === 'package_accepted' && milestone.status === 'complete'))
  assert.ok(milestones.milestones.some((milestone) => milestone.key === 'document_requests' && milestone.open === 1))
  assert.equal(milestones.bankWorkflowUnchanged, true)

  const originatorProgressWorkspace = buildBondOriginatorProgressWorkspaceViewModel({
    exportPackage: downloaded.package,
    progressEvents: [update.progressEvent, buyerHiddenUpdate.progressEvent, agentHiddenUpdate.progressEvent],
    documentRequests: [documentRequest.request],
    viewer: BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS.originator,
    generatedAt: '2026-07-28T12:30:00Z',
  })
  assert.equal(originatorProgressWorkspace.workspaceVersion, BOND_ORIGINATOR_PROGRESS_WORKSPACE_VERSION)
  assert.equal(originatorProgressWorkspace.actions.canRecordProgress, true)
  assert.equal(originatorProgressWorkspace.actions.canMutateBankWorkflow, false)
  assert.equal(originatorProgressWorkspace.actions.canCreateOffer, false)
  assert.equal(originatorProgressWorkspace.workflowBoundary.progressIsNotBankDecision, true)
  assert.equal(originatorProgressWorkspace.workflowBoundary.noAutomaticBankSubmission, true)
  assert.equal(JSON.stringify(originatorProgressWorkspace).includes('Internal queue detail'), true)
  assert.equal(JSON.stringify(originatorProgressWorkspace).includes('never-export'), false)

  const buyerProgressWorkspace = buildBondOriginatorProgressWorkspaceViewModel({
    exportPackage: downloaded.package,
    progressEvents: [update.progressEvent, buyerHiddenUpdate.progressEvent, agentHiddenUpdate.progressEvent],
    documentRequests: [documentRequest.request],
    viewer: BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS.buyer,
  })
  assert.equal(JSON.stringify(buyerProgressWorkspace).includes('Internal queue detail'), false)
  assert.equal(JSON.stringify(buyerProgressWorkspace).includes('Internal originator hold'), false)
  assert.equal(buyerProgressWorkspace.workflowBoundary.bankWorkflowUnchanged, true)

  const agentProgressView = buildBondOriginatorAgentProgressViewModel({
    exportPackage: {
      ...downloaded.package,
      progressEvents: [update.progressEvent, buyerHiddenUpdate.progressEvent, agentHiddenUpdate.progressEvent],
      documentRequestSummary: {
        total: 2,
        open: 1,
        awaitingReview: 1,
        accepted: 1,
        latestAt: '2026-07-28T12:20:00Z',
      },
      offerGrantSummary: {
        offers: { total: 2, published: 2, accepted: 1, latestAt: '2026-07-28T13:10:00Z' },
        grants: { total: 1, published: 1, signed: 0, latestAt: '2026-07-28T13:25:00Z' },
      },
    },
  })
  assert.equal(agentProgressView.available, true)
  assert.equal(agentProgressView.trackingOnly, true)
  assert.equal(agentProgressView.bankWorkflowUnchanged, true)
  assert.equal(agentProgressView.offerWorkflowMutationDeferred, true)
  assert.equal(agentProgressView.grantWorkflowMutationDeferred, true)
  assert.ok(agentProgressView.cards.some((card) => card.key === 'document_requests' && card.value === '1 open'))
  assert.ok(agentProgressView.nextActions.some((action) => action.includes('Buyer accepted an offer')))
  assert.equal(JSON.stringify(agentProgressView).includes('Do not show to agent'), false)
  assert.equal(JSON.stringify(agentProgressView).includes('Originator private processing'), false)
}

async function runOriginatorOfferGrantCaptureTests() {
  const submission = await submittedSubmissionFixture()
  const prepared = await prepareBondOriginatorIntakePackage({
    submission,
    originatorRecipient: { id: 'originator-user', name: 'Bond Originator' },
    idempotencyKey: 'originator-intake-offers-grants',
    generatedAt: '2026-07-28T10:30:00Z',
  })
  const tooEarly = createBondOriginatorBankOfferCapture({
    exportPackage: prepared.package,
    bankName: 'Bank A',
  })
  assert.equal(tooEarly.ok, false)
  assert.equal(tooEarly.reason, 'originator_package_not_accepted')

  const accepted = acceptBondOriginatorIntakePackage({
    exportPackage: { ...prepared.package, id: 'originator-package-offers-grants' },
    acceptedBy: 'originator-user',
  })
  const offer = createBondOriginatorBankOfferCapture({
    exportPackage: accepted.package,
    id: 'offer-capture-bank-a',
    bankName: 'Bank A',
    offeredAmount: '2250000',
    interestRate: '11.25',
    interestRateType: 'variable',
    monthlyRepayment: '22350.50',
    termMonths: '240',
    validUntil: '2026-08-28',
    quoteDocumentId: 'doc-bank-a-offer',
    conditionsSummary: 'Subject to standard bank conditions.',
    capturedBy: 'originator-user',
    idempotencyKey: 'offer-bank-a',
    capturedAt: '2026-07-28T13:00:00Z',
  })
  assert.equal(offer.ok, true)
  assert.equal(offer.offerCapture.status, BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.captured)
  assert.equal(offer.offerCapture.createsBankApplication, false)
  assert.equal(offer.offerCapture.bankWorkflowUnchanged, true)
  assert.equal(offer.quoteWriteProposal.automaticWrite, false)
  assert.equal(offer.quoteWriteProposal.action, 'create_transaction_bond_quote')

  const repeated = createBondOriginatorBankOfferCapture({
    exportPackage: accepted.package,
    existingOfferCapture: offer.offerCapture,
    idempotencyKey: 'offer-bank-a',
  })
  assert.equal(repeated.idempotent, true)

  const publishedOffer = publishBondOriginatorBankOfferToBuyer({
    offerCapture: offer.offerCapture,
    publishedBy: 'originator-user',
    linkedBondQuoteId: 'quote-bank-a',
    publishedAt: '2026-07-28T13:05:00Z',
  })
  assert.equal(publishedOffer.ok, true)
  assert.equal(publishedOffer.offerCapture.status, BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.publishedToBuyer)
  assert.equal(publishedOffer.offerCapture.linkedBondQuoteId, 'quote-bank-a')

  const decision = recordBondOriginatorOfferBuyerDecision({
    offerCapture: publishedOffer.offerCapture,
    decision: 'accepted',
    decidedBy: 'participant-primary',
    decidedAt: '2026-07-28T13:10:00Z',
  })
  assert.equal(decision.ok, true)
  assert.equal(decision.offerCapture.status, BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.acceptedByBuyer)
  assert.equal(decision.offerDecisionProposal.automaticWrite, false)
  assert.equal(decision.offerDecisionProposal.action, 'record_bond_offer_decision')

  const missingGrantDocument = createBondOriginatorGrantCapture({
    exportPackage: accepted.package,
    bankName: 'Bank A',
  })
  assert.equal(missingGrantDocument.ok, false)
  assert.equal(missingGrantDocument.reason, 'grant_document_required')

  const grant = createBondOriginatorGrantCapture({
    exportPackage: accepted.package,
    offerCaptureId: offer.offerCapture.id || 'offer-capture-bank-a',
    linkedBondQuoteId: 'quote-bank-a',
    bankName: 'Bank A',
    approvedAmount: '2250000',
    grantDocumentId: 'doc-grant-bank-a',
    grantReference: 'GRANT-A-1',
    conditionsSummary: 'Formal grant received from originator.',
    capturedBy: 'originator-user',
    idempotencyKey: 'grant-bank-a',
    capturedAt: '2026-07-28T13:20:00Z',
  })
  assert.equal(grant.ok, true)
  assert.equal(grant.grantCapture.status, BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.received)
  assert.equal(grant.grantCapture.bankWorkflowUnchanged, true)
  assert.equal(grant.grantMilestoneProposal.automaticWrite, false)
  assert.equal(grant.grantMilestoneProposal.action, 'record_grant_received')

  const publishedGrant = publishBondOriginatorGrantToBuyer({
    grantCapture: grant.grantCapture,
    publishedBy: 'originator-user',
    publishedAt: '2026-07-28T13:25:00Z',
  })
  assert.equal(publishedGrant.ok, true)
  assert.equal(publishedGrant.grantCapture.status, BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.publishedToBuyer)

  const capturedOfferWorkspaceCard = buildBondOriginatorOfferCaptureViewModel({
    offerCapture: offer.offerCapture,
    documents: [
      { id: 'doc-bank-a-offer', name: 'Bank A offer.pdf', category: 'Bond Offer', url: '/secure/hidden-originator-offer-url' },
    ],
    viewer: 'originator',
  })
  assert.equal(capturedOfferWorkspaceCard.workspaceVersion, BOND_ORIGINATOR_OFFER_GRANT_WORKSPACE_VERSION)
  assert.equal(capturedOfferWorkspaceCard.source, 'originator_supplied')
  assert.equal(capturedOfferWorkspaceCard.actions.canPublishToBuyer, true)
  assert.equal(capturedOfferWorkspaceCard.actions.canCreateBankApplication, false)
  assert.equal(capturedOfferWorkspaceCard.actions.canAutoSubmitToBank, false)
  assert.equal(capturedOfferWorkspaceCard.workflowBoundary.bankWorkflowUnchanged, true)
  assert.equal(capturedOfferWorkspaceCard.quoteDocument.secureAccessRequired, true)
  assert.equal(JSON.stringify(capturedOfferWorkspaceCard).includes('/secure/hidden-originator-offer-url'), false)

  const buyerHiddenCapturedOffer = buildBondOriginatorOfferCaptureViewModel({
    offerCapture: offer.offerCapture,
    viewer: 'buyer',
  })
  assert.equal(buyerHiddenCapturedOffer, null)

  const grantWorkspaceCard = buildBondOriginatorGrantCaptureViewModel({
    grantCapture: publishedGrant.grantCapture,
    documents: [
      { id: 'doc-grant-bank-a', name: 'Bank A grant.pdf', category: 'Bond Grant', url: '/secure/hidden-originator-grant-url' },
    ],
    viewer: 'originator',
  })
  assert.equal(grantWorkspaceCard.workspaceVersion, BOND_ORIGINATOR_OFFER_GRANT_WORKSPACE_VERSION)
  assert.equal(grantWorkspaceCard.source, 'originator_supplied')
  assert.equal(grantWorkspaceCard.actions.canCreateBankApplication, false)
  assert.equal(grantWorkspaceCard.actions.canMutateGrantWorkflow, false)
  assert.equal(grantWorkspaceCard.workflowBoundary.grantWorkflowUnchanged, true)
  assert.equal(JSON.stringify(grantWorkspaceCard).includes('/secure/hidden-originator-grant-url'), false)

  const offerGrantWorkspace = buildBondOriginatorOfferGrantCaptureWorkspaceViewModel({
    exportPackage: {
      ...accepted.package,
      offerCaptures: [offer.offerCapture, publishedOffer.offerCapture],
      grantCaptures: [publishedGrant.grantCapture],
    },
    documents: [
      { id: 'doc-bank-a-offer', name: 'Bank A offer.pdf', category: 'Bond Offer', url: '/secure/hidden-originator-offer-url' },
      { id: 'doc-grant-bank-a', name: 'Bank A grant.pdf', category: 'Bond Grant', url: '/secure/hidden-originator-grant-url' },
    ],
    viewer: 'originator',
  })
  assert.equal(offerGrantWorkspace.workspaceVersion, BOND_ORIGINATOR_OFFER_GRANT_WORKSPACE_VERSION)
  assert.equal(offerGrantWorkspace.actions.canCaptureOffer, true)
  assert.equal(offerGrantWorkspace.actions.canCaptureGrant, true)
  assert.equal(offerGrantWorkspace.actions.canPublishToBuyer, true)
  assert.equal(offerGrantWorkspace.actions.canCreateBankApplication, false)
  assert.equal(offerGrantWorkspace.actions.canMutateBankWorkflow, false)
  assert.equal(offerGrantWorkspace.workflowBoundary.originatorProcessesExternally, true)
  assert.equal(offerGrantWorkspace.workflowBoundary.noAutomaticBankSubmission, true)
  assert.equal(offerGrantWorkspace.summary.offerCount, 2)
  assert.equal(offerGrantWorkspace.summary.publishedOfferCount, 1)
  assert.equal(offerGrantWorkspace.summary.grantCount, 1)
  assert.equal(JSON.stringify(offerGrantWorkspace).includes('/secure/hidden-originator'), false)
  assert.equal(JSON.stringify(offerGrantWorkspace).includes('bank application row'), false)

  const summary = buildBondOriginatorOfferGrantSummary({
    offerCaptures: [decision.offerCapture],
    grantCaptures: [publishedGrant.grantCapture],
  })
  assert.equal(summary.offerCount, 1)
  assert.equal(summary.acceptedOfferCount, 1)
  assert.equal(summary.grantCount, 1)
  assert.equal(summary.publishedGrantCount, 1)
  assert.equal(summary.bankWorkflowUnchanged, true)

  const view = buildBondOriginatorIntakePackageViewModel({
    exportPackage: {
      ...accepted.package,
      offerCaptures: [decision.offerCapture],
      grantCaptures: [publishedGrant.grantCapture],
    },
  })
  assert.equal(view.offerGrantSummary.offerCount, 1)
  assert.equal(view.offerGrantSummary.grantCount, 1)

  const buyerView = buildBondOriginatorBuyerOfferGrantViewModel({
    exportPackage: {
      ...accepted.package,
      offerCaptures: [
        publishedOffer.offerCapture,
        {
          ...offer.offerCapture,
          id: 'hidden-captured-offer',
          status: BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.captured,
          internalNote: 'Do not show this note',
        },
      ],
      grantCaptures: [publishedGrant.grantCapture],
    },
    documents: [
      { id: 'doc-bank-a-offer', name: 'Bank A offer.pdf', category: 'Bond Offer', url: '/secure/bank-a-offer' },
      { id: 'doc-grant-bank-a', name: 'Bank A grant.pdf', category: 'Bond Grant', url: '/secure/bank-a-grant' },
    ],
    acceptedOfferId: publishedOffer.offerCapture.id,
    signedOfferDocumentId: 'signed-offer-doc',
  })
  assert.equal(buyerView.offers.length, 1)
  assert.equal(buyerView.offers[0].bankName, 'Bank A')
  assert.equal(buyerView.offers[0].buyerDecision, BOND_BUYER_OFFER_DECISION_STATUSES.accepted)
  assert.equal(buyerView.offers[0].quoteDocument.name, 'Bank A offer.pdf')
  assert.equal(JSON.stringify(buyerView).includes('Do not show this note'), false)
  assert.equal(buyerView.grants.length, 1)
  assert.equal(buyerView.grants[0].grantDocument.name, 'Bank A grant.pdf')
  assert.equal(buyerView.summary.bankWorkflowUnchanged, true)
  assert.equal(buyerView.summary.offerWorkflowMutationDeferred, true)

  const buyerDecision = buildBondOriginatorBuyerOfferDecision({
    offerCapture: publishedOffer.offerCapture,
    decision: 'declined',
    decidedBy: 'participant-primary',
    decidedAt: '2026-07-28T13:15:00Z',
  })
  assert.equal(buyerDecision.ok, true)
  assert.equal(buyerDecision.offerCapture.status, BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.declinedByBuyer)
  assert.equal(buyerDecision.offerDecisionProposal.automaticWrite, false)

  const grantAcknowledgement = buildBondOriginatorBuyerGrantAcknowledgement({
    grantCapture: publishedGrant.grantCapture,
    acknowledgedBy: 'participant-primary',
    signedGrantDocumentId: 'signed-grant-doc',
    acknowledgedAt: '2026-07-28T13:30:00Z',
  })
  assert.equal(grantAcknowledgement.ok, true)
  assert.equal(grantAcknowledgement.grantAcknowledgement.status, BOND_BUYER_GRANT_ACKNOWLEDGEMENT_STATUSES.signed)
  assert.equal(grantAcknowledgement.grantMilestoneProposal.automaticWrite, false)
  assert.equal(grantAcknowledgement.grantAcknowledgement.bankWorkflowUnchanged, true)

  const attorneyHandoffView = buildBondOriginatorAttorneyHandoffViewModel({
    handoffPackage: {
      ...accepted.package,
      offerCaptures: [decision.offerCapture],
      grantCaptures: [{
        ...publishedGrant.grantCapture,
        status: BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.buyerSigned,
        signedGrantDocumentId: 'signed-grant-doc',
      }],
    },
    documents: [
      { id: 'doc-grant-bank-a', name: 'Bank A grant.pdf', category: 'Bond Grant', url: '/secure/bank-a-grant' },
      { id: 'signed-grant-doc', name: 'Signed Bank A grant.pdf', category: 'Signed Bond Grant', url: '/secure/signed-bank-a-grant' },
    ],
    rolePlayers: [
      { roleType: 'bond_attorney', participantName: 'Bond Attorneys Inc', status: 'active' },
      { roleType: 'cancellation_attorney', participantName: 'Cancellation Attorneys Inc', status: 'active' },
    ],
  })
  assert.equal(attorneyHandoffView.available, true)
  assert.equal(attorneyHandoffView.status, 'signed_grant_available')
  assert.equal(attorneyHandoffView.grants.length, 1)
  assert.equal(attorneyHandoffView.grants[0].signedGrantDocument.name, 'Signed Bank A grant.pdf')
  assert.equal(attorneyHandoffView.assignments.bondAttorney, 'Bond Attorneys Inc')
  assert.equal(attorneyHandoffView.bankWorkflowUnchanged, true)
  assert.equal(attorneyHandoffView.offerWorkflowMutationDeferred, true)
  assert.equal(attorneyHandoffView.grantWorkflowMutationDeferred, true)
  assert.equal(JSON.stringify(attorneyHandoffView).includes('bank application'), false)
}

async function runGovernanceReportingTests() {
  const submission = await submittedSubmissionFixture()
  const prepared = await prepareBondOriginatorIntakePackage({
    submission,
    originatorRecipient: { id: 'ooba-originator', name: 'OOBA Intake Team' },
    idempotencyKey: 'originator-intake-governance',
    generatedAt: '2026-07-28T10:30:00Z',
  })
  const accepted = acceptBondOriginatorIntakePackage({
    exportPackage: { ...prepared.package, id: 'originator-package-governance' },
    acceptedBy: 'originator-user',
    acceptedAt: '2026-07-28T11:00:00Z',
  })
  const downloaded = recordBondOriginatorPackageDownload({
    exportPackage: accepted.package,
    downloadedBy: 'originator-user',
    downloadedAt: '2026-07-28T11:05:00Z',
    documentIds: ['signed-application-doc'],
  })
  const formatPackage = await buildBondApplicationRecipientFormatPackage({
    exportPackage: downloaded.package,
    recipientProfileKey: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.oobaOriginatorManual,
    idempotencyKey: 'governance-format-1',
    generatedAt: '2026-07-28T14:00:00Z',
  })
  const documentRequest = createBondOriginatorDocumentRequest({
    exportPackage: downloaded.package,
    participantKey: 'primary_applicant:1',
    participantRole: 'primary_applicant',
    requirementKey: 'primary_applicant:1:payslip',
    canonicalDocumentType: 'proof_of_income',
    title: 'Payslip',
    buyerInstruction: 'Please upload your latest payslip.',
  })
  const progress = recordBondOriginatorProgressUpdate({
    exportPackage: downloaded.package,
    eventType: BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.originatorProcessing,
    status: BOND_ORIGINATOR_PROGRESS_STATUSES.inProgress,
    title: 'Originator processing',
    summary: 'The bond originator is processing the submitted information.',
    occurredAt: '2026-07-28T12:00:00Z',
  })
  const capturedOffer = createBondOriginatorBankOfferCapture({
    exportPackage: downloaded.package,
    id: 'governance-offer',
    bankName: 'Bank A',
    offeredAmount: '2250000',
    capturedBy: 'originator-user',
    capturedAt: '2026-07-28T13:00:00Z',
  })
  const publishedOffer = publishBondOriginatorBankOfferToBuyer({
    offerCapture: capturedOffer.offerCapture,
    publishedBy: 'originator-user',
    linkedBondQuoteId: 'quote-governance',
  })
  const buyerDecision = recordBondOriginatorOfferBuyerDecision({
    offerCapture: publishedOffer.offerCapture,
    decision: 'accepted',
    decidedBy: 'participant-primary',
  })
  const grant = createBondOriginatorGrantCapture({
    exportPackage: downloaded.package,
    bankName: 'Bank A',
    approvedAmount: '2250000',
    grantDocumentId: 'doc-governance-grant',
    signedGrantDocumentId: 'doc-governance-signed-grant',
    capturedBy: 'originator-user',
  })
  const report = buildBondApplicationGovernanceReport({
    exportPackage: downloaded.package,
    recipientFormatPackages: [formatPackage.formatPackage],
    documentRequests: [documentRequest.request],
    progressEvents: [progress.progressEvent],
    offerCaptures: [buyerDecision.offerCapture],
    grantCaptures: [grant.grantCapture],
    deliveryAttempts: [downloaded.attempt],
    generatedBy: 'governance-user',
    generatedAt: '2026-07-28T15:00:00Z',
  })
  assert.equal(report.status, BOND_APPLICATION_GOVERNANCE_REPORT_STATUSES.blocked)
  assert.equal(report.decisionBoundary.arch9FacilitatesOnly, true)
  assert.equal(report.decisionBoundary.originatorProcessesExternally, true)
  assert.equal(report.decisionBoundary.automaticBankSubmission, false)
  assert.equal(report.controls.liveDeliveryEnabled, false)
  assert.equal(report.controls.bankWorkflowUnchanged, true)
  assert.equal(report.recipientFormatSummary.readyForDownload, 1)
  assert.equal(report.recipientFormatSummary.blocked, 1)
  assert.ok(report.blockerSummary.some((issue) => issue.code === 'official_schema_missing'))
  assert.equal(report.operationalSummary.documentRequests.open, 1)
  assert.equal(report.operationalSummary.offersAndGrants.acceptedOfferCount, 1)
  assert.equal(report.operationalSummary.offersAndGrants.signedGrantCount, 1)
  assert.equal(JSON.stringify(report).includes('never-export'), false)
  assert.equal(JSON.stringify(report).includes('private/path.pdf'), false)
  assert.equal(JSON.stringify(report).includes('Internal'), false)

  const view = buildBondApplicationGovernanceReportViewModel({ report })
  assert.equal(view.available, true)
  assert.equal(view.statusLabel, 'Blocked')
  assert.equal(view.actions.canLiveDeliver, false)
  assert.equal(view.actions.canMutateBankWorkflow, false)
  assert.equal(view.bankWorkflowUnchanged, true)

  const csv = buildBondApplicationGovernanceReportCsv(report)
  assert.ok(csv.includes('arch9_facilitates_only,true'))
  assert.ok(csv.includes('automatic_bank_submission,false'))
  assert.ok(csv.includes('live_delivery_enabled,false'))
  assert.ok(csv.includes('bank_workflow_unchanged,true'))
  assert.equal(csv.includes('identity_number'), false)

  const unsafeReport = buildBondApplicationGovernanceReport({
    exportPackage: {
      ...downloaded.package,
      operationalContext: {
        ...downloaded.package.operationalContext,
        liveDeliveryEnabled: true,
      },
    },
    recipientFormatPackages: [{ ...formatPackage.formatPackage, liveDeliveryEnabled: true }],
  })
  assert.equal(unsafeReport.status, BOND_APPLICATION_GOVERNANCE_REPORT_STATUSES.blocked)
  assert.ok(unsafeReport.blockerSummary.some((issue) => issue.code === 'live_delivery_enabled'))
}

async function runOriginatorInternalReadinessTests() {
  const submission = await submittedSubmissionFixture()
  const prepared = await prepareBondOriginatorIntakePackage({
    submission,
    originatorRecipient: { id: 'ooba-originator', name: 'OOBA Intake Team' },
    packageDocuments: [{
      documentRole: 'main_application',
      matchedDocumentId: 'signed-application-doc',
      status: 'signed',
    }],
    idempotencyKey: 'originator-intake-r1',
    generatedAt: '2026-07-28T10:30:00Z',
  })
  const formatPackage = await buildBondApplicationRecipientFormatPackage({
    exportPackage: { ...prepared.package, id: 'originator-package-r1' },
    recipientProfileKey: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.oobaOriginatorManual,
    idempotencyKey: 'r1-format-1',
    generatedAt: '2026-07-28T14:00:00Z',
  })
  const governanceReport = buildBondApplicationGovernanceReport({
    exportPackage: { ...prepared.package, id: 'originator-package-r1' },
    recipientFormatPackages: [formatPackage.formatPackage],
    generatedBy: 'governance-user',
    generatedAt: '2026-07-28T15:00:00Z',
  })
  const readiness = buildBondOriginatorInternalReadinessReport({
    exportPackage: { ...prepared.package, id: 'originator-package-r1' },
    governanceReport,
    recipientFormatPackages: [formatPackage.formatPackage],
    migrationsApplied: fullR1MigrationEvidence(),
    featureFlags: {
      defaults: {
        guided_bond_application_v2: false,
        guided_bond_application_participants_v1: false,
        bond_application_exports_v1: false,
        bond_application_live_delivery_v1: false,
      },
      publicOverrideEnabled: false,
    },
    regressionChecks: {
      phase8_targeted_tests: true,
      targeted_lint: true,
      production_build: true,
    },
    stagingChecks: {
      buyerSubmission: true,
      originatorPackageGeneration: true,
      documentManifestAndSignedDocs: true,
    },
    operationalControls: {
      manualReleaseAuthorityDefined: true,
      releaseApproverRole: 'bond_operations_lead',
    },
    generatedBy: 'readiness-user',
    generatedAt: '2026-07-28T16:00:00Z',
  })
  assert.equal(readiness.status, BOND_ORIGINATOR_INTERNAL_READINESS_STATUSES.ready)
  assert.equal(readiness.rolloutBoundary.arch9FacilitatesOnly, true)
  assert.equal(readiness.rolloutBoundary.originatorProcessesExternally, true)
  assert.equal(readiness.rolloutBoundary.automaticBankSubmission, false)
  assert.equal(readiness.rolloutBoundary.liveOobaDelivery, false)
  assert.equal(readiness.summary.blocked, 0)
  assert.equal(readiness.checklist.every((check) => check.status === 'passed'), true)
  assert.equal(JSON.stringify(readiness).includes('identity_number'), false)
  assert.equal(JSON.stringify(readiness).includes('never-export'), false)

  const view = buildBondOriginatorInternalReadinessViewModel({ report: readiness })
  assert.equal(view.available, true)
  assert.equal(view.actions.canIntroduceOriginators, true)
  assert.equal(view.actions.canLiveDeliver, false)
  assert.equal(view.actions.canMutateBankWorkflow, false)

  const csv = buildBondOriginatorInternalReadinessCsv(readiness)
  assert.ok(csv.includes('arch9_facilitates_only,true'))
  assert.ok(csv.includes('automatic_bank_submission,false'))
  assert.ok(csv.includes('live_ooba_delivery,false'))
  assert.ok(csv.includes('feature_flags_default_off,passed'))

  const blocked = buildBondOriginatorInternalReadinessReport({
    exportPackage: prepared.package,
    governanceReport,
    recipientFormatPackages: [formatPackage.formatPackage],
    migrationsApplied: { phase5_submissions: true },
    featureFlags: {
      defaults: { bond_application_live_delivery_v1: true },
      publicOverrideEnabled: true,
    },
    regressionChecks: { phase8_targeted_tests: true },
    stagingChecks: { buyerSubmission: false },
  })
  assert.equal(blocked.status, BOND_ORIGINATOR_INTERNAL_READINESS_STATUSES.blocked)
  assert.ok(blocked.issues.some((issue) => issue.code === 'migrations_applied'))
  assert.ok(blocked.issues.some((issue) => issue.code === 'feature_flags_default_off'))
  assert.ok(blocked.issues.some((issue) => issue.code === 'manual_release_authority_defined'))
  assert.equal(buildBondOriginatorInternalReadinessViewModel({ report: blocked }).actions.canIntroduceOriginators, false)
}

async function runOriginatorWorkspaceMvpTests() {
  const submission = await submittedSubmissionFixture()
  const prepared = await prepareBondOriginatorIntakePackage({
    submission,
    originatorRecipient: { id: 'originator-user', name: 'OOBA Intake Team' },
    packageDocuments: [{
      documentRole: 'main_application',
      matchedDocumentId: 'signed-application-doc',
      status: 'signed',
      signedUrl: 'never-export',
    }],
    idempotencyKey: 'originator-workspace-package',
    generatedAt: '2026-07-28T10:30:00Z',
  })
  const packageReady = {
    ...prepared.package,
    id: 'originator-workspace-package',
    assignment: {
      id: 'workspace-assignment-1',
      assignedToProfileId: 'originator-user',
      status: 'assigned',
      assignedAt: '2026-07-28T16:20:00Z',
    },
  }

  const workspace = buildBondOriginatorWorkspaceMvpViewModel({
    packages: [
      packageReady,
      {
        ...packageReady,
        id: 'other-originator-package',
        assignment: { assignedToProfileId: 'other-originator', status: 'assigned' },
      },
    ],
    viewerOriginatorId: 'originator-user',
    generatedAt: '2026-07-28T16:30:00Z',
  })
  assert.equal(workspace.workspaceVersion, BOND_ORIGINATOR_WORKSPACE_MVP_VERSION)
  assert.equal(workspace.packageCount, 1)
  assert.equal(workspace.packages[0].actions.canAccept, true)
  assert.equal(workspace.actions.canLiveDeliver, false)
  assert.equal(workspace.actions.canMutateBankWorkflow, false)
  assert.equal(workspace.workflowBoundary.originatorProcessesExternally, true)

  const visiblePackages = filterBondOriginatorWorkspacePackagesForViewer({
    packages: [packageReady],
    viewerOriginatorId: 'other-originator',
  })
  assert.equal(visiblePackages.length, 0)

  const accepted = acceptBondOriginatorIntakePackage({
    exportPackage: packageReady,
    acceptedBy: 'originator-user',
    acceptedAt: '2026-07-28T16:35:00Z',
  })
  const documentRequest = createBondOriginatorDocumentRequest({
    exportPackage: accepted.package,
    id: 'workspace-doc-request',
    requestType: BOND_ORIGINATOR_DOCUMENT_REQUEST_TYPES.supplemental,
    participantKey: 'primary_applicant:1',
    participantRole: 'primary_applicant',
    requirementKey: 'primary_applicant:1:latest_payslip',
    canonicalDocumentType: 'proof_of_income',
    title: 'Latest payslip',
    buyerInstruction: 'Please upload your latest payslip.',
    internalNote: 'never expose this note',
    requestedBy: 'originator-user',
    idempotencyKey: 'workspace-request-1',
    createdAt: '2026-07-28T16:40:00Z',
  })
  const progress = recordBondOriginatorProgressUpdate({
    exportPackage: accepted.package,
    eventType: BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.originatorProcessing,
    status: BOND_ORIGINATOR_PROGRESS_STATUSES.inProgress,
    title: 'Processing started',
    summary: 'The originator has started processing the application externally.',
    internalNote: 'never expose internal progress',
    recordedBy: 'originator-user',
    occurredAt: '2026-07-28T16:45:00Z',
    idempotencyKey: 'workspace-progress-1',
  })
  const offer = createBondOriginatorBankOfferCapture({
    exportPackage: accepted.package,
    id: 'workspace-offer',
    bankName: 'Bank A',
    offeredAmount: '2250000',
    capturedBy: 'originator-user',
    idempotencyKey: 'workspace-offer-1',
    capturedAt: '2026-07-28T16:50:00Z',
  })

  const detail = buildBondOriginatorWorkspacePackageDetailViewModel({
    exportPackage: {
      ...accepted.package,
      documentRequests: [documentRequest.request],
      progressEvents: [progress.progressEvent],
      offerCaptures: [offer.offerCapture],
    },
  })
  assert.equal(detail.available, true)
  assert.equal(detail.actions.canDownload, true)
  assert.equal(detail.actions.canRequestDocuments, true)
  assert.equal(detail.actions.canCaptureOffersAndGrants, true)
  assert.equal(detail.actions.canLiveDeliver, false)
  assert.equal(detail.actions.canAutoSubmitToBank, false)
  assert.equal(detail.documentRequestSummary.open, 1)
  assert.equal(detail.documents.some((document) => document.documentId === 'signed-application-doc'), true)
  assert.equal(detail.payloadsExcluded, true)
  assert.equal(detail.tokensExcluded, true)
  assert.equal(detail.publicDocumentUrlsExcluded, true)
  assert.equal(JSON.stringify(detail).includes('never-export'), false)
  assert.equal(JSON.stringify(detail).includes('private/path.pdf'), false)
  assert.equal(JSON.stringify(detail).includes('identity_number'), false)
  assert.equal(JSON.stringify(detail).includes('never expose'), false)
  assert.equal(JSON.stringify(detail).includes('destinationPayload'), false)
  assert.equal(JSON.stringify(detail).includes('canonicalExport'), false)
}

async function runOneOriginatorPilotTests() {
  const submission = await submittedSubmissionFixture()
  const prepared = await prepareBondOriginatorIntakePackage({
    submission,
    originatorRecipient: { id: 'pilot-originator', name: 'Pilot Bond Originator' },
    packageDocuments: [{
      documentRole: 'main_application',
      matchedDocumentId: 'signed-application-doc',
      status: 'signed',
      signedUrl: 'never-export',
    }],
    idempotencyKey: 'originator-pilot-package',
    generatedAt: '2026-07-28T10:30:00Z',
  })
  const pilotPackage = {
    ...prepared.package,
    id: 'pilot-package-1',
    assignment: {
      id: 'pilot-assignment-1',
      assignedToProfileId: 'pilot-originator',
      status: 'assigned',
      assignedAt: '2026-07-28T17:00:00Z',
    },
  }
  const governanceReport = buildBondApplicationGovernanceReport({
    exportPackage: pilotPackage,
    generatedBy: 'governance-user',
    generatedAt: '2026-07-28T17:05:00Z',
  })
  const readiness = buildBondOriginatorInternalReadinessReport({
    exportPackage: pilotPackage,
    governanceReport,
    recipientFormatPackages: [{
      recipientProfileKey: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.arch9OriginatorManual,
      status: 'ready_for_download',
      manualDownloadOnly: true,
    }],
    migrationsApplied: fullR1MigrationEvidence(),
    featureFlags: {
      defaults: {
        guided_bond_application_v2: false,
        bond_application_exports_v1: false,
        bond_application_live_delivery_v1: false,
      },
      publicOverrideEnabled: false,
    },
    regressionChecks: {
      phase8_targeted_tests: true,
      targeted_lint: true,
      production_build: true,
    },
    stagingChecks: {
      buyerSubmission: true,
      originatorPackageGeneration: true,
      documentManifestAndSignedDocs: true,
    },
    operationalControls: {
      manualReleaseAuthorityDefined: true,
      releaseApproverRole: 'bond_operations_lead',
    },
  })
  assert.equal(readiness.status, BOND_ORIGINATOR_INTERNAL_READINESS_STATUSES.ready)

  const pilotReport = buildBondOriginatorOneOriginatorPilotReport({
    readinessReport: readiness,
    originatorRecipient: { id: 'pilot-originator', name: 'Pilot Bond Originator' },
    packages: [pilotPackage],
    pilotControls: {
      maxPilotPackages: 3,
      liveDeliveryEnabled: false,
      automaticBankSubmission: false,
      bankWorkflowMutation: false,
      supportOwner: 'bond-ops',
      rollbackOwner: 'product-lead',
    },
    generatedBy: 'pilot-manager',
    generatedAt: '2026-07-28T17:10:00Z',
  })
  assert.equal(pilotReport.pilotVersion, BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_VERSION)
  assert.equal(pilotReport.status, BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.ready)
  assert.equal(pilotReport.scope.maxActiveOriginators, 1)
  assert.equal(pilotReport.rolloutBoundary.maximumActiveOriginators, 1)
  assert.equal(pilotReport.rolloutBoundary.automaticBankSubmission, false)
  assert.equal(pilotReport.rolloutBoundary.bankWorkflowMutation, false)
  assert.equal(JSON.stringify(pilotReport).includes('identity_number'), false)
  assert.equal(JSON.stringify(pilotReport).includes('never-export'), false)

  const launch = buildBondOriginatorOneOriginatorPilotLaunchPlan({
    pilotReport,
    packages: [pilotPackage],
    launchedBy: 'pilot-manager',
    launchedAt: '2026-07-28T17:15:00Z',
  })
  assert.equal(launch.ok, true)
  assert.equal(launch.launchPlan.status, BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.active)
  assert.equal(launch.launchPlan.packageAssignments.length, 1)
  assert.equal(launch.launchPlan.actions.canAssignSecondOriginator, false)
  assert.equal(launch.launchPlan.actions.canAutoSubmitToBank, false)
  assert.equal(launch.launchPlan.actions.canMutateBankWorkflow, false)

  const progress = recordBondOriginatorProgressUpdate({
    exportPackage: pilotPackage,
    eventType: BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.originatorProcessing,
    status: BOND_ORIGINATOR_PROGRESS_STATUSES.inProgress,
    title: 'Pilot processing started',
    summary: 'The pilot originator is processing the application externally.',
  })
  const acceptedPilotPackage = { ...pilotPackage, status: 'accepted_by_originator' }
  const documentRequest = createBondOriginatorDocumentRequest({
    exportPackage: acceptedPilotPackage,
    requestType: BOND_ORIGINATOR_DOCUMENT_REQUEST_TYPES.supplemental,
    participantKey: 'primary_applicant:1',
    participantRole: 'primary_applicant',
    requirementKey: 'primary_applicant:1:latest_bank_statement',
    canonicalDocumentType: 'bank_statement',
    title: 'Latest bank statement',
    buyerInstruction: 'Please upload your latest bank statement.',
  })
  const offer = createBondOriginatorBankOfferCapture({
    exportPackage: acceptedPilotPackage,
    id: 'pilot-offer',
    bankName: 'Bank A',
    offeredAmount: '2250000',
  })
  const view = buildBondOriginatorOneOriginatorPilotViewModel({
    pilotReport,
    launchPlan: launch.launchPlan,
    packages: [pilotPackage],
    progressEvents: [progress.progressEvent],
    documentRequests: [documentRequest.request],
    offerCaptures: [offer.offerCapture],
  })
  assert.equal(view.pilotVersion, BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_VERSION)
  assert.equal(view.status, BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.active)
  assert.equal(view.actions.canStartPilot, false)
  assert.equal(view.actions.canPausePilot, true)
  assert.equal(view.actions.canAddSecondOriginator, false)
  assert.equal(view.actions.canLiveDeliver, false)
  assert.equal(view.actions.canAutoSubmitToBank, false)
  assert.equal(view.workflowBoundary.maximumActiveOriginators, 1)
  assert.equal(view.payloadsExcluded, true)
  assert.equal(view.tokensExcluded, true)
  assert.equal(view.publicDocumentUrlsExcluded, true)
  assert.equal(JSON.stringify(view).includes('never-export'), false)
  assert.equal(JSON.stringify(view).includes('canonicalExport'), false)

  const blockedSecondOriginator = buildBondOriginatorOneOriginatorPilotReport({
    readinessReport: readiness,
    originatorRecipient: { id: 'pilot-originator', name: 'Pilot Bond Originator' },
    packages: [
      pilotPackage,
      {
        ...pilotPackage,
        id: 'pilot-package-2',
        assignment: { assignedToProfileId: 'second-originator', status: 'assigned' },
      },
    ],
    pilotControls: {
      maxPilotPackages: 3,
      supportOwner: 'bond-ops',
      rollbackOwner: 'product-lead',
    },
  })
  assert.equal(blockedSecondOriginator.status, BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.blocked)
  assert.ok(blockedSecondOriginator.issues.some((issue) => issue.code === 'no_second_originator'))
  assert.equal(buildBondOriginatorOneOriginatorPilotLaunchPlan({ pilotReport: blockedSecondOriginator }).ok, false)
}

async function runOperationalHardeningTests() {
  const submission = await submittedSubmissionFixture()
  const prepared = await prepareBondOriginatorIntakePackage({
    submission,
    originatorRecipient: { id: 'hardening-originator', name: 'Hardening Pilot Originator' },
    packageDocuments: [{
      documentRole: 'main_application',
      matchedDocumentId: 'signed-application-doc',
      status: 'signed',
      signedUrl: 'never-export',
    }],
    idempotencyKey: 'originator-hardening-package',
    generatedAt: '2026-07-28T10:30:00Z',
  })
  const pilotPackage = {
    ...prepared.package,
    id: 'hardening-package-1',
    status: 'accepted_by_originator',
    assignment: {
      id: 'hardening-assignment-1',
      assignedToProfileId: 'hardening-originator',
      status: 'accepted',
      assignedAt: '2026-07-28T17:00:00Z',
      acceptedAt: '2026-07-28T17:02:00Z',
    },
  }
  const governanceReport = buildBondApplicationGovernanceReport({
    exportPackage: pilotPackage,
    generatedBy: 'governance-user',
    generatedAt: '2026-07-28T17:05:00Z',
  })
  const readiness = buildBondOriginatorInternalReadinessReport({
    exportPackage: pilotPackage,
    governanceReport,
    recipientFormatPackages: [{
      recipientProfileKey: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.arch9OriginatorManual,
      status: 'ready_for_download',
      manualDownloadOnly: true,
    }],
    migrationsApplied: fullR1MigrationEvidence(),
    featureFlags: {
      defaults: {
        guided_bond_application_v2: false,
        bond_application_exports_v1: false,
        bond_application_live_delivery_v1: false,
      },
      publicOverrideEnabled: false,
    },
    regressionChecks: {
      phase8_targeted_tests: true,
      targeted_lint: true,
      production_build: true,
    },
    stagingChecks: {
      buyerSubmission: true,
      originatorPackageGeneration: true,
      documentManifestAndSignedDocs: true,
    },
    operationalControls: {
      manualReleaseAuthorityDefined: true,
      releaseApproverRole: 'bond_operations_lead',
    },
  })
  const pilotReport = buildBondOriginatorOneOriginatorPilotReport({
    readinessReport: readiness,
    originatorRecipient: { id: 'hardening-originator', name: 'Hardening Pilot Originator' },
    packages: [pilotPackage],
    pilotControls: {
      maxPilotPackages: 3,
      liveDeliveryEnabled: false,
      automaticBankSubmission: false,
      bankWorkflowMutation: false,
      supportOwner: 'bond-ops',
      rollbackOwner: 'product-lead',
    },
    generatedBy: 'pilot-manager',
    generatedAt: '2026-07-28T17:10:00Z',
  })
  const launch = buildBondOriginatorOneOriginatorPilotLaunchPlan({
    pilotReport,
    packages: [pilotPackage],
    launchedBy: 'pilot-manager',
    launchedAt: '2026-07-28T17:15:00Z',
  })
  const progress = recordBondOriginatorProgressUpdate({
    exportPackage: pilotPackage,
    eventType: BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.originatorProcessing,
    status: BOND_ORIGINATOR_PROGRESS_STATUSES.inProgress,
    title: 'Pilot processing started',
    summary: 'The pilot originator is processing the application externally.',
    occurredAt: '2026-07-28T17:20:00Z',
  })
  const documentRequest = createBondOriginatorDocumentRequest({
    exportPackage: pilotPackage,
    requestType: BOND_ORIGINATOR_DOCUMENT_REQUEST_TYPES.supplemental,
    participantKey: 'primary_applicant:1',
    participantRole: 'primary_applicant',
    requirementKey: 'primary_applicant:1:latest_bank_statement',
    canonicalDocumentType: 'bank_statement',
    title: 'Latest bank statement',
    buyerInstruction: 'Please upload your latest bank statement.',
  })
  const offer = createBondOriginatorBankOfferCapture({
    exportPackage: pilotPackage,
    id: 'hardening-offer',
    bankName: 'Bank A',
    offeredAmount: '2250000',
  })
  const incident = recordBondOriginatorOperationalIncident({
    severity: BOND_ORIGINATOR_OPERATIONAL_INCIDENT_SEVERITIES.low,
    title: 'Pilot support question',
    summary: 'Originator needed help finding the document queue.',
    detectedBy: 'support-user',
    detectedAt: '2026-07-28T17:30:00Z',
    resolvedAt: '2026-07-28T17:45:00Z',
  })
  assert.equal(incident.ok, true)
  assert.equal(incident.incident.sensitivePayloadIncluded, false)
  assert.equal(incident.incident.bankWorkflowUnchanged, true)

  const controls = {
    supportOwner: 'bond-ops',
    escalationOwner: 'ops-lead',
    rollbackOwner: 'product-lead',
    runbookAvailable: true,
    rollbackRunbookAvailable: true,
    pausePilotTested: true,
    monitoringCadence: 'daily',
    staleActivityThresholdHours: 48,
    maxAwaitingReviewDocumentRequests: 5,
    liveDeliveryEnabled: false,
    automaticBankSubmission: false,
    bankWorkflowMutation: false,
    offerWorkflowMutation: false,
    grantWorkflowMutation: false,
  }
  const report = buildBondOriginatorOperationalHardeningReport({
    pilotReport,
    launchPlan: launch.launchPlan,
    packages: [pilotPackage],
    progressEvents: [progress.progressEvent],
    documentRequests: [documentRequest.request],
    offerCaptures: [offer.offerCapture],
    incidents: [incident.incident],
    operationalControls: controls,
    generatedBy: 'operations-lead',
    generatedAt: '2026-07-28T18:00:00Z',
  })
  assert.equal(report.hardeningVersion, BOND_ORIGINATOR_OPERATIONAL_HARDENING_VERSION)
  assert.equal(report.status, BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES.healthy)
  assert.equal(report.scope.maximumActiveOriginators, 1)
  assert.equal(report.workflowBoundary.maximumActiveOriginators, 1)
  assert.equal(report.workflowBoundary.noAutomaticBankSubmission, true)
  assert.equal(report.workflowBoundary.liveDeliveryEnabled, false)
  assert.equal(report.workflowBoundary.bankWorkflowUnchanged, true)
  assert.equal(report.workflowBoundary.offerWorkflowUnchanged, true)
  assert.equal(report.workflowBoundary.grantWorkflowUnchanged, true)
  assert.equal(report.sensitivePayloadIncluded, false)
  assert.equal(JSON.stringify(report).includes('identity_number'), false)
  assert.equal(JSON.stringify(report).includes('never-export'), false)
  assert.equal(JSON.stringify(report).includes('canonicalExport'), false)
  assert.equal(JSON.stringify(report).includes('destinationPayload'), false)

  const view = buildBondOriginatorOperationalHardeningViewModel({ report })
  assert.equal(view.available, true)
  assert.equal(view.status, BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES.healthy)
  assert.equal(view.actions.canContinuePilot, true)
  assert.equal(view.actions.canExpandOriginators, false)
  assert.equal(view.actions.canLiveDeliver, false)
  assert.equal(view.actions.canAutoSubmitToBank, false)
  assert.equal(view.actions.canMutateBankWorkflow, false)
  assert.equal(view.payloadsExcluded, true)
  assert.equal(view.tokensExcluded, true)
  assert.equal(view.publicDocumentUrlsExcluded, true)

  const runbook = buildBondOriginatorOperationalHardeningRunbook({
    report,
    supportContact: 'support@example.test',
    escalationContact: 'ops@example.test',
    rollbackContact: 'product@example.test',
  })
  assert.equal(runbook.hardeningVersion, BOND_ORIGINATOR_OPERATIONAL_HARDENING_VERSION)
  assert.equal(runbook.boundaries.noRawTokens, true)
  assert.equal(runbook.boundaries.noAutomaticBankSubmission, true)
  assert.equal(runbook.boundaries.bankWorkflowUnchanged, true)
  assert.equal(runbook.rollback.doNotMutateBankWorkflow, true)
  assert.equal(runbook.steps.some((step) => step.key === 'pause_pilot'), true)

  const criticalIncident = recordBondOriginatorOperationalIncident({
    severity: BOND_ORIGINATOR_OPERATIONAL_INCIDENT_SEVERITIES.critical,
    title: 'Package access incident',
    summary: 'Secure package access issue under review.',
    detectedAt: '2026-07-28T18:10:00Z',
  })
  const blocked = buildBondOriginatorOperationalHardeningReport({
    pilotReport,
    launchPlan: launch.launchPlan,
    packages: [pilotPackage],
    progressEvents: [progress.progressEvent],
    documentRequests: [documentRequest.request],
    offerCaptures: [offer.offerCapture],
    incidents: [criticalIncident.incident],
    operationalControls: controls,
    generatedAt: '2026-07-28T18:30:00Z',
  })
  assert.equal(blocked.status, BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES.blocked)
  assert.ok(blocked.checklist.some((check) => check.key === 'no_open_critical_incidents' && check.status === 'blocked'))

  const stale = buildBondOriginatorOperationalHardeningReport({
    pilotReport,
    launchPlan: launch.launchPlan,
    packages: [pilotPackage],
    progressEvents: [{ ...progress.progressEvent, occurredAt: '2026-07-25T17:20:00Z' }],
    documentRequests: [documentRequest.request],
    offerCaptures: [offer.offerCapture],
    incidents: [],
    operationalControls: { ...controls, staleActivityThresholdHours: 24 },
    generatedAt: '2026-07-31T18:30:00Z',
  })
  assert.equal(stale.status, BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES.attentionRequired)
  assert.ok(stale.checklist.some((check) => check.key === 'recent_activity_present' && check.status === 'attention_required'))
}

async function runMultiOriginatorRolloutTests() {
  const submission = await submittedSubmissionFixture()
  const prepared = await prepareBondOriginatorIntakePackage({
    submission,
    originatorRecipient: { id: 'rollout-originator-a', name: 'Rollout Originator A' },
    packageDocuments: [{
      documentRole: 'main_application',
      matchedDocumentId: 'signed-application-doc',
      status: 'signed',
      signedUrl: 'never-export',
    }],
    idempotencyKey: 'originator-rollout-package-a',
    generatedAt: '2026-07-28T10:30:00Z',
  })
  const packageA = {
    ...prepared.package,
    id: 'rollout-package-a',
    status: 'accepted_by_originator',
    assignment: {
      id: 'rollout-assignment-a',
      assignedToProfileId: 'rollout-originator-a',
      status: 'accepted',
      assignedAt: '2026-07-28T17:00:00Z',
      acceptedAt: '2026-07-28T17:02:00Z',
    },
  }
  const packageB = {
    ...prepared.package,
    id: 'rollout-package-b',
    transactionId: 'transaction-phase8-b',
    status: 'ready_for_originator',
    assignment: {
      id: 'rollout-assignment-b',
      assignedToProfileId: 'rollout-originator-b',
      status: 'assigned',
      assignedAt: '2026-07-28T17:05:00Z',
    },
  }
  const governanceReport = buildBondApplicationGovernanceReport({
    exportPackage: packageA,
    generatedBy: 'governance-user',
    generatedAt: '2026-07-28T17:05:00Z',
  })
  const readiness = buildBondOriginatorInternalReadinessReport({
    exportPackage: packageA,
    governanceReport,
    recipientFormatPackages: [{
      recipientProfileKey: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.arch9OriginatorManual,
      status: 'ready_for_download',
      manualDownloadOnly: true,
    }],
    migrationsApplied: fullR1MigrationEvidence(),
    featureFlags: {
      defaults: {
        guided_bond_application_v2: false,
        bond_application_exports_v1: false,
        bond_application_live_delivery_v1: false,
      },
      publicOverrideEnabled: false,
    },
    regressionChecks: {
      phase8_targeted_tests: true,
      targeted_lint: true,
      production_build: true,
    },
    stagingChecks: {
      buyerSubmission: true,
      originatorPackageGeneration: true,
      documentManifestAndSignedDocs: true,
    },
    operationalControls: {
      manualReleaseAuthorityDefined: true,
      releaseApproverRole: 'bond_operations_lead',
    },
  })
  const pilotReport = buildBondOriginatorOneOriginatorPilotReport({
    readinessReport: readiness,
    originatorRecipient: { id: 'rollout-originator-a', name: 'Rollout Originator A' },
    packages: [packageA],
    pilotControls: {
      maxPilotPackages: 3,
      supportOwner: 'bond-ops',
      rollbackOwner: 'product-lead',
      liveDeliveryEnabled: false,
      automaticBankSubmission: false,
      bankWorkflowMutation: false,
    },
  })
  const launch = buildBondOriginatorOneOriginatorPilotLaunchPlan({
    pilotReport,
    packages: [packageA],
    launchedBy: 'pilot-manager',
    launchedAt: '2026-07-28T17:15:00Z',
  })
  const hardeningReport = buildBondOriginatorOperationalHardeningReport({
    pilotReport,
    launchPlan: launch.launchPlan,
    packages: [packageA],
    progressEvents: [recordBondOriginatorProgressUpdate({
      exportPackage: packageA,
      eventType: BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.originatorProcessing,
      status: BOND_ORIGINATOR_PROGRESS_STATUSES.inProgress,
      title: 'Pilot processing started',
      summary: 'The pilot originator is processing the application externally.',
      occurredAt: '2026-07-28T17:20:00Z',
    }).progressEvent],
    documentRequests: [],
    offerCaptures: [],
    incidents: [],
    operationalControls: {
      supportOwner: 'bond-ops',
      escalationOwner: 'ops-lead',
      rollbackOwner: 'product-lead',
      runbookAvailable: true,
      rollbackRunbookAvailable: true,
      pausePilotTested: true,
      monitoringCadence: 'daily',
      liveDeliveryEnabled: false,
      automaticBankSubmission: false,
      bankWorkflowMutation: false,
      offerWorkflowMutation: false,
      grantWorkflowMutation: false,
    },
    generatedAt: '2026-07-28T18:00:00Z',
  })
  assert.equal(hardeningReport.status, BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES.healthy)

  const controls = {
    maxActiveOriginators: 3,
    maxPackagesPerOriginator: 2,
    supportOwner: 'bond-ops',
    escalationOwner: 'ops-lead',
    rollbackOwner: 'product-lead',
    monitoringCadence: 'daily',
    pauseRolloutTested: true,
    liveDeliveryEnabled: false,
    automaticBankSubmission: false,
    bankWorkflowMutation: false,
    offerWorkflowMutation: false,
    grantWorkflowMutation: false,
  }
  const report = buildBondOriginatorMultiOriginatorRolloutReport({
    hardeningReport,
    originatorRecipients: [
      { id: 'rollout-originator-a', name: 'Rollout Originator A' },
      { id: 'rollout-originator-b', name: 'Rollout Originator B' },
    ],
    packages: [packageA, packageB],
    rolloutControls: controls,
    generatedBy: 'operations-lead',
    generatedAt: '2026-07-28T19:00:00Z',
  })
  assert.equal(report.rolloutVersion, BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_VERSION)
  assert.equal(report.status, BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.ready)
  assert.equal(report.scope.originatorCount, 2)
  assert.equal(report.scope.maxActiveOriginators, 3)
  assert.equal(report.rolloutBoundary.maximumActiveOriginators, 3)
  assert.equal(report.rolloutBoundary.automaticBankSubmission, false)
  assert.equal(report.rolloutBoundary.liveOobaDelivery, false)
  assert.equal(report.rolloutBoundary.bankWorkflowMutation, false)
  assert.equal(report.sensitivePayloadIncluded, false)
  assert.equal(JSON.stringify(report).includes('identity_number'), false)
  assert.equal(JSON.stringify(report).includes('never-export'), false)
  assert.equal(JSON.stringify(report).includes('canonicalExport'), false)
  assert.equal(JSON.stringify(report).includes('destinationPayload'), false)

  const rolloutLaunch = buildBondOriginatorMultiOriginatorRolloutLaunchPlan({
    rolloutReport: report,
    packages: [packageA, packageB],
    launchedBy: 'operations-lead',
    launchedAt: '2026-07-28T19:05:00Z',
  })
  assert.equal(rolloutLaunch.ok, true)
  assert.equal(rolloutLaunch.launchPlan.status, BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.active)
  assert.equal(rolloutLaunch.launchPlan.packageAssignments.length, 2)
  assert.equal(rolloutLaunch.launchPlan.actions.canAddOriginatorOutsideCohort, false)
  assert.equal(rolloutLaunch.launchPlan.actions.canLiveDeliver, false)
  assert.equal(rolloutLaunch.launchPlan.actions.canAutoSubmitToBank, false)
  assert.equal(rolloutLaunch.launchPlan.actions.canMutateBankWorkflow, false)

  const rolloutView = buildBondOriginatorMultiOriginatorRolloutViewModel({
    rolloutReport: report,
    launchPlan: rolloutLaunch.launchPlan,
    packages: [packageA, packageB],
  })
  assert.equal(rolloutView.available, true)
  assert.equal(rolloutView.status, BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.active)
  assert.equal(rolloutView.actions.canPauseRollout, true)
  assert.equal(rolloutView.actions.canAddOriginatorOutsideCohort, false)
  assert.equal(rolloutView.actions.canLiveDeliver, false)
  assert.equal(rolloutView.actions.canAutoSubmitToBank, false)
  assert.equal(rolloutView.actions.canMutateBankWorkflow, false)
  assert.equal(rolloutView.workflowBoundary.maximumActiveOriginators, 3)
  assert.equal(rolloutView.payloadsExcluded, true)
  assert.equal(rolloutView.tokensExcluded, true)

  const blockedWithoutHardening = buildBondOriginatorMultiOriginatorRolloutReport({
    hardeningReport: { hardeningVersion: BOND_ORIGINATOR_OPERATIONAL_HARDENING_VERSION, status: BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES.blocked },
    originatorRecipients: [
      { id: 'rollout-originator-a', name: 'Rollout Originator A' },
      { id: 'rollout-originator-b', name: 'Rollout Originator B' },
    ],
    packages: [packageA, packageB],
    rolloutControls: controls,
  })
  assert.equal(blockedWithoutHardening.status, BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.blocked)
  assert.ok(blockedWithoutHardening.issues.some((issue) => issue.code === 'r7_hardening_healthy'))

  const packageOutsideCohort = {
    ...packageB,
    id: 'rollout-package-c',
    assignment: { assignedToProfileId: 'outside-originator', status: 'assigned' },
  }
  const blockedOutsideCohort = buildBondOriginatorMultiOriginatorRolloutReport({
    hardeningReport,
    originatorRecipients: [
      { id: 'rollout-originator-a', name: 'Rollout Originator A' },
      { id: 'rollout-originator-b', name: 'Rollout Originator B' },
    ],
    packages: [packageA, packageOutsideCohort],
    rolloutControls: controls,
  })
  assert.equal(blockedOutsideCohort.status, BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.blocked)
  assert.ok(blockedOutsideCohort.issues.some((issue) => issue.code === 'packages_assigned_to_approved_originators'))

  const blockedTooManyOriginators = buildBondOriginatorMultiOriginatorRolloutReport({
    hardeningReport,
    originatorRecipients: [
      { id: 'rollout-originator-a', name: 'Rollout Originator A' },
      { id: 'rollout-originator-b', name: 'Rollout Originator B' },
      { id: 'rollout-originator-c', name: 'Rollout Originator C' },
      { id: 'rollout-originator-d', name: 'Rollout Originator D' },
    ],
    packages: [packageA, packageB],
    rolloutControls: { ...controls, maxActiveOriginators: 3 },
  })
  assert.equal(blockedTooManyOriginators.status, BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.blocked)
  assert.ok(blockedTooManyOriginators.issues.some((issue) => issue.code === 'rollout_originator_limit'))
}

async function runFormalIntegrationReadinessTests() {
  const rolloutReport = {
    rolloutVersion: BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_VERSION,
    status: BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.active,
    scope: { originatorCount: 2, maxActiveOriginators: 3 },
  }
  const oobaAdapter = getBondApplicationDestinationAdapter('ooba')
  const blocked = buildBondOriginatorFormalIntegrationReadinessReport({
    rolloutReport,
    recipientAdapter: oobaAdapter,
    recipientProfileKey: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.oobaOfficialPayload,
    integrationContract: {
      destinationKey: 'ooba',
      approvedSchema: true,
      enumMap: true,
      schemaJson: { identity_number: 'never-export' },
      credentials: 'never-export',
    },
    formalControls: {
      sandboxOnly: true,
      technicalOwner: 'integrations-lead',
      businessOwner: 'bond-ops',
      rollbackOwner: 'product-lead',
      liveDeliveryEnabled: false,
      automaticBankSubmission: false,
      bankWorkflowMutation: false,
      offerWorkflowMutation: false,
      grantWorkflowMutation: false,
    },
    generatedBy: 'integrations-lead',
    generatedAt: '2026-07-28T20:00:00Z',
  })
  assert.equal(blocked.formalIntegrationVersion, BOND_ORIGINATOR_FORMAL_INTEGRATION_VERSION)
  assert.equal(blocked.status, BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.blocked)
  assert.ok(blocked.issues.some((issue) => issue.code === 'official_specification_contract_complete'))
  assert.equal(blocked.integrationBoundary.sandboxOnly, true)
  assert.equal(blocked.integrationBoundary.productionLiveDelivery, false)
  assert.equal(blocked.integrationBoundary.automaticBankSubmission, false)
  assert.equal(blocked.credentialsIncluded, false)
  assert.equal(blocked.rawSchemaIncluded, false)
  assert.equal(JSON.stringify(blocked).includes('identity_number'), false)
  assert.equal(JSON.stringify(blocked).includes('never-export'), false)

  const ready = buildBondOriginatorFormalIntegrationReadinessReport({
    rolloutReport,
    recipientAdapter: {
      destinationKey: 'ooba',
      label: 'OOBA sandbox',
      destinationType: 'bond_originator',
      adapterVersion: 'ooba-approved-sandbox-v1',
      enabled: false,
      officialSpecificationAvailable: true,
    },
    recipientProfileKey: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.oobaOfficialPayload,
    integrationContract: {
      destinationKey: 'ooba',
      approvedSchema: true,
      enumMap: true,
      validationRules: true,
      transportPolicy: true,
      credentialPolicy: true,
      acknowledgementContract: true,
      statusContract: true,
      securityReview: true,
      dataProcessingApproval: true,
      sandboxTestPlan: true,
      credentials: 'never-export',
      schemaJson: { bank_account_number: 'never-export' },
    },
    formalControls: {
      sandboxOnly: true,
      technicalOwner: 'integrations-lead',
      businessOwner: 'bond-ops',
      rollbackOwner: 'product-lead',
      liveDeliveryEnabled: false,
      automaticBankSubmission: false,
      bankWorkflowMutation: false,
      offerWorkflowMutation: false,
      grantWorkflowMutation: false,
    },
    generatedBy: 'integrations-lead',
    generatedAt: '2026-07-28T20:15:00Z',
  })
  assert.equal(ready.status, BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.readyForSandbox)
  assert.equal(ready.missingEvidence.length, 0)
  assert.equal(ready.integrationBoundary.sandboxOnly, true)
  assert.equal(ready.integrationBoundary.productionLiveDelivery, false)
  assert.equal(ready.integrationBoundary.liveOobaDelivery, false)
  assert.equal(ready.integrationBoundary.bankWorkflowMutation, false)
  assert.equal(JSON.stringify(ready).includes('bank_account_number'), false)
  assert.equal(JSON.stringify(ready).includes('never-export'), false)

  const activation = buildBondOriginatorFormalIntegrationActivationPlan({
    readinessReport: ready,
    activatedBy: 'integrations-lead',
    activatedAt: '2026-07-28T20:20:00Z',
  })
  assert.equal(activation.ok, true)
  assert.equal(activation.activationPlan.status, BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.sandboxActive)
  assert.equal(activation.activationPlan.mode, 'sandbox_only')
  assert.equal(activation.activationPlan.allowedActions.canRunSandboxValidation, true)
  assert.equal(activation.activationPlan.allowedActions.canGenerateProductionPayload, false)
  assert.equal(activation.activationPlan.allowedActions.canEnableLiveDelivery, false)
  assert.equal(activation.activationPlan.allowedActions.canAutoSubmitToBank, false)
  assert.equal(activation.activationPlan.allowedActions.canMutateBankWorkflow, false)

  const view = buildBondOriginatorFormalIntegrationViewModel({
    readinessReport: ready,
    activationPlan: activation.activationPlan,
  })
  assert.equal(view.available, true)
  assert.equal(view.status, BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.sandboxActive)
  assert.equal(view.actions.canRunSandboxValidation, true)
  assert.equal(view.actions.canGenerateProductionPayload, false)
  assert.equal(view.actions.canEnableLiveDelivery, false)
  assert.equal(view.actions.canAutoSubmitToBank, false)
  assert.equal(view.actions.canMutateBankWorkflow, false)
  assert.equal(view.credentialsExcluded, true)
  assert.equal(view.rawSchemasExcluded, true)

  const unsafe = buildBondOriginatorFormalIntegrationReadinessReport({
    rolloutReport,
    recipientAdapter: { destinationKey: 'ooba', label: 'OOBA sandbox', officialSpecificationAvailable: true },
    integrationContract: {
      destinationKey: 'ooba',
      approvedSchema: true,
      enumMap: true,
      validationRules: true,
      transportPolicy: true,
      credentialPolicy: true,
      acknowledgementContract: true,
      statusContract: true,
      securityReview: true,
      dataProcessingApproval: true,
      sandboxTestPlan: true,
    },
    formalControls: {
      sandboxOnly: true,
      technicalOwner: 'integrations-lead',
      businessOwner: 'bond-ops',
      rollbackOwner: 'product-lead',
      liveDeliveryEnabled: true,
      automaticBankSubmission: false,
      bankWorkflowMutation: false,
    },
  })
  assert.equal(unsafe.status, BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.blocked)
  assert.ok(unsafe.issues.some((issue) => issue.code === 'automation_boundary_intact'))
}

function runMigrationAndDocumentationTests() {
  const migration = readFile('../supabase/migrations/202607280006_guided_bond_application_phase8_external_exports.sql')
  assert.ok(migration.includes('transaction_bond_application_export_packages'))
  assert.ok(migration.includes('transaction_bond_application_delivery_attempts'))
  assert.ok(migration.includes('transaction_bond_application_external_events'))
  assert.ok(migration.includes('bridge_prevent_bond_application_export_package_mutation'))
  assert.ok(migration.includes("auth.role() = 'service_role'"))
  assert.ok(migration.includes('Phase 8 export preparation must not create this row automatically'))
  assert.equal(/create table[^;]+bank_payload/i.test(migration), false)

  const phase8aMigration = readFile('../supabase/migrations/202607280007_guided_bond_application_phase8a_originator_intake.sql')
  assert.ok(phase8aMigration.includes('ready_for_originator'))
  assert.ok(phase8aMigration.includes('accepted_by_originator'))
  assert.ok(phase8aMigration.includes('originator_package_download'))
  assert.ok(phase8aMigration.includes('bridge_record_bond_originator_intake_download'))
  assert.ok(phase8aMigration.includes('without mutating bank workflow'))

  const phase8bMigration = readFile('../supabase/migrations/202607280008_guided_bond_application_phase8b_originator_document_requests.sql')
  assert.ok(phase8bMigration.includes('transaction_bond_originator_document_requests'))
  assert.ok(phase8bMigration.includes('missing_document'))
  assert.ok(phase8bMigration.includes('replacement_document'))
  assert.ok(phase8bMigration.includes('supplemental_document'))
  assert.ok(phase8bMigration.includes('bridge_record_bond_originator_document_request_upload'))
  assert.ok(phase8bMigration.includes('requires_new_submission = false'))
  assert.ok(phase8bMigration.includes('bank_workflow_unchanged = true'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phase8bMigration), false)

  const phase8cMigration = readFile('../supabase/migrations/202607280009_guided_bond_application_phase8c_originator_progress_tracking.sql')
  assert.ok(phase8cMigration.includes('transaction_bond_originator_progress_events'))
  assert.ok(phase8cMigration.includes('originator_processing'))
  assert.ok(phase8cMigration.includes('bank_workflow_unchanged = true'))
  assert.ok(phase8cMigration.includes('offer_workflow_unchanged = true'))
  assert.ok(phase8cMigration.includes('grant_workflow_unchanged = true'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phase8cMigration), false)

  const phase8dMigration = readFile('../supabase/migrations/202607280010_guided_bond_application_phase8d_originator_offers_grants.sql')
  assert.ok(phase8dMigration.includes('transaction_bond_originator_bank_offer_captures'))
  assert.ok(phase8dMigration.includes('transaction_bond_originator_grant_captures'))
  assert.ok(phase8dMigration.includes('linked_bond_quote_id'))
  assert.ok(phase8dMigration.includes('creates_bank_application = false'))
  assert.ok(phase8dMigration.includes('offer_workflow_unchanged = true'))
  assert.ok(phase8dMigration.includes('grant_workflow_unchanged = true'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phase8dMigration), false)

  const phase8eMigration = readFile('../supabase/migrations/202607280011_guided_bond_application_phase8e_buyer_offer_grant_experience.sql')
  assert.ok(phase8eMigration.includes('transaction_bond_originator_buyer_offer_decisions'))
  assert.ok(phase8eMigration.includes('transaction_bond_originator_buyer_grant_acknowledgements'))
  assert.ok(phase8eMigration.includes('decision_proposal_json'))
  assert.ok(phase8eMigration.includes('grant_milestone_proposal_json'))
  assert.ok(phase8eMigration.includes('bridge_client_portal_bond_originator_offer_grant_package'))
  assert.ok(phase8eMigration.includes('Returns sanitized fields only'))
  assert.ok(phase8eMigration.includes('creates_bank_application = false'))
  assert.ok(phase8eMigration.includes('bank_workflow_unchanged = true'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phase8eMigration), false)

  const phase8fMigration = readFile('../supabase/migrations/202607280012_guided_bond_application_phase8f_agent_progress_view.sql')
  assert.ok(phase8fMigration.includes('bridge_agent_bond_originator_progress_view'))
  assert.ok(phase8fMigration.includes('bridge_can_access_transaction_spine'))
  assert.ok(phase8fMigration.includes('visible_to_agent = true'))
  assert.ok(phase8fMigration.includes('internal notes'))
  assert.ok(phase8fMigration.includes('bankWorkflowUnchanged'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phase8fMigration), false)

  const phase8gMigration = readFile('../supabase/migrations/202607280013_guided_bond_application_phase8g_attorney_handoff.sql')
  assert.ok(phase8gMigration.includes('bridge_attorney_bond_originator_handoff_view'))
  assert.ok(phase8gMigration.includes('bridge_can_access_transaction_spine'))
  assert.ok(phase8gMigration.includes('signed_grant_document_id'))
  assert.ok(phase8gMigration.includes('without exposing export payload JSON'))
  assert.ok(phase8gMigration.includes('bankWorkflowUnchanged'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phase8gMigration), false)

  const phase8hMigration = readFile('../supabase/migrations/202607280014_guided_bond_application_phase8h_recipient_specific_formats.sql')
  assert.ok(phase8hMigration.includes('transaction_bond_application_recipient_format_packages'))
  assert.ok(phase8hMigration.includes('phase-8h-recipient-formats-v1'))
  assert.ok(phase8hMigration.includes('bridge_originator_recipient_format_packages_view'))
  assert.ok(phase8hMigration.includes('manual_download_only = true'))
  assert.ok(phase8hMigration.includes('live_delivery_enabled = false'))
  assert.ok(phase8hMigration.includes('no_automatic_bank_submission = true'))
  assert.ok(phase8hMigration.includes('bank_workflow_unchanged = true'))
  assert.ok(phase8hMigration.includes('metadata-only recipient-format view'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phase8hMigration), false)

  const phase8iMigration = readFile('../supabase/migrations/202607280015_guided_bond_application_phase8i_governance_reporting.sql')
  assert.ok(phase8iMigration.includes('transaction_bond_application_governance_reports'))
  assert.ok(phase8iMigration.includes('phase-8i-governance-report-v1'))
  assert.ok(phase8iMigration.includes('bridge_bond_application_governance_report_view'))
  assert.ok(phase8iMigration.includes('reporting_only = true'))
  assert.ok(phase8iMigration.includes('sensitive_payload_included = false'))
  assert.ok(phase8iMigration.includes('no_automatic_bank_submission = true'))
  assert.ok(phase8iMigration.includes('live_delivery_enabled = false'))
  assert.ok(phase8iMigration.includes('bank_workflow_unchanged = true'))
  assert.ok(phase8iMigration.includes('Reports are observational only'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phase8iMigration), false)

  const phaseR1Migration = readFile('../supabase/migrations/202607280016_originator_rollout_phase_r1_internal_readiness.sql')
  assert.ok(phaseR1Migration.includes('transaction_bond_originator_internal_readiness_reports'))
  assert.ok(phaseR1Migration.includes('phase-r1-originator-internal-readiness-v1'))
  assert.ok(phaseR1Migration.includes('bridge_bond_originator_internal_readiness_view'))
  assert.ok(phaseR1Migration.includes('reporting_only = true'))
  assert.ok(phaseR1Migration.includes('sensitive_payload_included = false'))
  assert.ok(phaseR1Migration.includes('no_automatic_bank_submission = true'))
  assert.ok(phaseR1Migration.includes('live_delivery_enabled = false'))
  assert.ok(phaseR1Migration.includes('bank_workflow_unchanged = true'))
  assert.ok(phaseR1Migration.includes('do not enable originator access or bank delivery'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phaseR1Migration), false)

  const phaseR2Migration = readFile('../supabase/migrations/202607280017_originator_rollout_phase_r2_workspace_mvp.sql')
  assert.ok(phaseR2Migration.includes('transaction_bond_originator_workspace_assignments'))
  assert.ok(phaseR2Migration.includes('phase-r2-originator-workspace-mvp-v1'))
  assert.ok(phaseR2Migration.includes('bridge_bond_originator_workspace_mvp_view'))
  assert.ok(phaseR2Migration.includes('bridge_accept_bond_originator_workspace_package'))
  assert.ok(phaseR2Migration.includes('metadata-only originator workspace'))
  assert.ok(phaseR2Migration.includes('sensitive_payload_included = false'))
  assert.ok(phaseR2Migration.includes('no_automatic_bank_submission = true'))
  assert.ok(phaseR2Migration.includes('live_delivery_enabled = false'))
  assert.ok(phaseR2Migration.includes('bank_workflow_unchanged = true'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phaseR2Migration), false)

  const phaseR3Migration = readFile('../supabase/migrations/202607280018_originator_rollout_phase_r3_document_requests.sql')
  assert.ok(phaseR3Migration.includes('phase-r3-originator-document-requests-v1'))
  assert.ok(phaseR3Migration.includes('request_priority'))
  assert.ok(phaseR3Migration.includes('bridge_create_bond_originator_workspace_document_request'))
  assert.ok(phaseR3Migration.includes('bridge_review_bond_originator_workspace_document_request'))
  assert.ok(phaseR3Migration.includes('bridge_originator_document_request_queue_view'))
  assert.ok(phaseR3Migration.includes('bridge_client_portal_bond_originator_document_requests_view'))
  assert.ok(phaseR3Migration.includes('requires_new_submission = false'))
  assert.ok(phaseR3Migration.includes('sensitive_payload_included = false'))
  assert.ok(phaseR3Migration.includes('no_automatic_bank_submission = true'))
  assert.ok(phaseR3Migration.includes('live_delivery_enabled = false'))
  assert.ok(phaseR3Migration.includes('bank_workflow_unchanged = true'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phaseR3Migration), false)

  const phaseR4Migration = readFile('../supabase/migrations/202607280019_originator_rollout_phase_r4_progress_tracking.sql')
  assert.ok(phaseR4Migration.includes('phase-r4-originator-progress-tracking-v1'))
  assert.ok(phaseR4Migration.includes('progress_category'))
  assert.ok(phaseR4Migration.includes('bridge_record_bond_originator_workspace_progress_update'))
  assert.ok(phaseR4Migration.includes('bridge_originator_progress_workspace_view'))
  assert.ok(phaseR4Migration.includes('bridge_client_portal_bond_originator_progress_view'))
  assert.ok(phaseR4Migration.includes('tracking_only'))
  assert.ok(phaseR4Migration.includes('progress_is_not_bank_decision'))
  assert.ok(phaseR4Migration.includes('sensitive_payload_included'))
  assert.ok(phaseR4Migration.includes('no_automatic_bank_submission'))
  assert.ok(phaseR4Migration.includes('live_delivery_enabled'))
  assert.ok(phaseR4Migration.includes('bank_workflow_unchanged'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phaseR4Migration), false)

  const phaseR5Migration = readFile('../supabase/migrations/202607280020_originator_rollout_phase_r5_offers_grants_capture.sql')
  assert.ok(phaseR5Migration.includes('phase-r5-originator-offers-grants-capture-v1'))
  assert.ok(phaseR5Migration.includes('bridge_capture_bond_originator_workspace_bank_offer'))
  assert.ok(phaseR5Migration.includes('bridge_publish_bond_originator_workspace_bank_offer'))
  assert.ok(phaseR5Migration.includes('bridge_capture_bond_originator_workspace_grant'))
  assert.ok(phaseR5Migration.includes('bridge_publish_bond_originator_workspace_grant'))
  assert.ok(phaseR5Migration.includes('bridge_originator_offer_grant_capture_workspace_view'))
  assert.ok(phaseR5Migration.includes("capture_source = 'originator_supplied'"))
  assert.ok(phaseR5Migration.includes('creates_bank_application = false'))
  assert.ok(phaseR5Migration.includes('no_automatic_bank_submission'))
  assert.ok(phaseR5Migration.includes('live_delivery_enabled'))
  assert.ok(phaseR5Migration.includes('bank_workflow_unchanged = true'))
  assert.ok(phaseR5Migration.includes('offer_workflow_unchanged = true'))
  assert.ok(phaseR5Migration.includes('grant_workflow_unchanged = true'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phaseR5Migration), false)

  const phaseR6Migration = readFile('../supabase/migrations/202607280021_originator_rollout_phase_r6_one_originator_pilot.sql')
  assert.ok(phaseR6Migration.includes('transaction_bond_originator_one_originator_pilots'))
  assert.ok(phaseR6Migration.includes('phase-r6-one-originator-pilot-v1'))
  assert.ok(phaseR6Migration.includes('maximum_active_originators = 1'))
  assert.ok(phaseR6Migration.includes('one_originator_pilot_id'))
  assert.ok(phaseR6Migration.includes('bridge_start_bond_originator_one_originator_pilot'))
  assert.ok(phaseR6Migration.includes('bridge_pause_bond_originator_one_originator_pilot'))
  assert.ok(phaseR6Migration.includes('bridge_bond_originator_one_originator_pilot_view'))
  assert.ok(phaseR6Migration.includes('A ready R1 internal readiness report is required'))
  assert.ok(phaseR6Migration.includes('no_automatic_bank_submission = true'))
  assert.ok(phaseR6Migration.includes('live_delivery_enabled = false'))
  assert.ok(phaseR6Migration.includes('bank_workflow_unchanged = true'))
  assert.ok(phaseR6Migration.includes('offer_workflow_unchanged = true'))
  assert.ok(phaseR6Migration.includes('grant_workflow_unchanged = true'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phaseR6Migration), false)

  const phaseR7Migration = readFile('../supabase/migrations/202607280022_originator_rollout_phase_r7_operational_hardening.sql')
  assert.ok(phaseR7Migration.includes('transaction_bond_originator_operational_hardening_reports'))
  assert.ok(phaseR7Migration.includes('transaction_bond_originator_operational_incidents'))
  assert.ok(phaseR7Migration.includes('phase-r7-operational-hardening-v1'))
  assert.ok(phaseR7Migration.includes('bridge_record_bond_originator_operational_incident'))
  assert.ok(phaseR7Migration.includes('bridge_create_bond_originator_operational_hardening_report'))
  assert.ok(phaseR7Migration.includes('bridge_bond_originator_operational_hardening_view'))
  assert.ok(phaseR7Migration.includes('maximum_active_originators'))
  assert.ok(phaseR7Migration.includes('no_automatic_bank_submission = true'))
  assert.ok(phaseR7Migration.includes('live_delivery_enabled = false'))
  assert.ok(phaseR7Migration.includes('bank_workflow_unchanged = true'))
  assert.ok(phaseR7Migration.includes('offer_workflow_unchanged = true'))
  assert.ok(phaseR7Migration.includes('grant_workflow_unchanged = true'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phaseR7Migration), false)

  const phaseR8Migration = readFile('../supabase/migrations/202607280023_originator_rollout_phase_r8_multi_originator_rollout.sql')
  assert.ok(phaseR8Migration.includes('transaction_bond_originator_multi_originator_rollouts'))
  assert.ok(phaseR8Migration.includes('phase-r8-multi-originator-rollout-v1'))
  assert.ok(phaseR8Migration.includes('multi_originator_rollout_id'))
  assert.ok(phaseR8Migration.includes('bridge_start_bond_originator_multi_originator_rollout'))
  assert.ok(phaseR8Migration.includes('bridge_pause_bond_originator_multi_originator_rollout'))
  assert.ok(phaseR8Migration.includes('bridge_bond_originator_multi_originator_rollout_view'))
  assert.ok(phaseR8Migration.includes('A healthy R7 operational hardening report is required'))
  assert.ok(phaseR8Migration.includes('maximum_active_originators'))
  assert.ok(phaseR8Migration.includes('no_automatic_bank_submission = true'))
  assert.ok(phaseR8Migration.includes('live_delivery_enabled = false'))
  assert.ok(phaseR8Migration.includes('bank_workflow_unchanged = true'))
  assert.ok(phaseR8Migration.includes('offer_workflow_unchanged = true'))
  assert.ok(phaseR8Migration.includes('grant_workflow_unchanged = true'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phaseR8Migration), false)

  const phaseR9Migration = readFile('../supabase/migrations/202607280024_originator_rollout_phase_r9_optional_formal_integrations.sql')
  assert.ok(phaseR9Migration.includes('transaction_bond_originator_formal_integrations'))
  assert.ok(phaseR9Migration.includes('phase-r9-optional-formal-integrations-v1'))
  assert.ok(phaseR9Migration.includes('bridge_create_bond_originator_formal_integration_readiness'))
  assert.ok(phaseR9Migration.includes('bridge_activate_bond_originator_formal_integration_sandbox'))
  assert.ok(phaseR9Migration.includes('bridge_bond_originator_formal_integration_view'))
  assert.ok(phaseR9Migration.includes('sandbox_only = true'))
  assert.ok(phaseR9Migration.includes('production_live_delivery_enabled = false'))
  assert.ok(phaseR9Migration.includes('raw_schema_stored = false'))
  assert.ok(phaseR9Migration.includes('credentials_stored = false'))
  assert.ok(phaseR9Migration.includes('no_automatic_bank_submission = true'))
  assert.ok(phaseR9Migration.includes('live_delivery_enabled = false'))
  assert.ok(phaseR9Migration.includes('bank_workflow_unchanged = true'))
  assert.ok(phaseR9Migration.includes('offer_workflow_unchanged = true'))
  assert.ok(phaseR9Migration.includes('grant_workflow_unchanged = true'))
  assert.equal(/transaction_bond_applications[^_]/i.test(phaseR9Migration), false)

  const docs = readFile('docs/bond-application/phase-8-external-mapping-and-delivery.md')
  assert.ok(docs.includes('Official Specification Blocker'))
  assert.ok(docs.includes('No OOBA recipient mapping, bank-specific mapping or live delivery is enabled by default'))
  assert.ok(docs.includes('Phase 8B Originator Document Requests'))
  assert.ok(docs.includes('Phase 8C Originator Progress Tracking'))
  assert.ok(docs.includes('Phase 8D Bank Offers And Grants Capture'))
  assert.ok(docs.includes('Phase 8E Buyer Offer/Grant Experience'))
  assert.ok(docs.includes('Phase 8F Agent Progress View'))
  assert.ok(docs.includes('Phase 8G Attorney Handoff'))
  assert.ok(docs.includes('Phase 8H Recipient-Specific Formats'))
  assert.ok(docs.includes('Phase 8I Governance And Reporting'))
  assert.ok(docs.includes('Phase R1 Internal Readiness'))
  assert.ok(docs.includes('Phase R2 Originator Workspace MVP'))
  assert.ok(docs.includes('Phase R3 Document Requests'))
  assert.ok(docs.includes('Phase R4 Progress Tracking'))
  assert.ok(docs.includes('Phase R5 Offers And Grants Capture'))
  assert.ok(docs.includes('Arch9 remains a facilitator in this phase'))
  assert.ok(docs.includes('Phase R6 Pilot With One Bond Originator'))
  assert.ok(docs.includes('maximum_active_originators = 1'))
  assert.ok(docs.includes('Phase R7 Operational Hardening'))
  assert.ok(docs.includes('bridge_bond_originator_operational_hardening_view'))
  assert.ok(docs.includes('R7 does not expand the pilot beyond one active bond originator'))
  assert.ok(docs.includes('Phase R8 Multi-Originator Rollout'))
  assert.ok(docs.includes('bridge_bond_originator_multi_originator_rollout_view'))
  assert.ok(docs.includes('R8 expands only to an approved originator cohort'))
  assert.ok(docs.includes('Phase R9 Optional Formal Integrations'))
  assert.ok(docs.includes('bridge_bond_originator_formal_integration_view'))
  assert.ok(docs.includes('R9 is sandbox-only by default'))
  assert.ok(docs.includes('OOBA is handled as a bond-originator recipient'))

  const integrationSource = readFile('src/modules/bond/integrations/adapters/bondApplicationAdapterRegistry.js')
  assert.equal(/puppeteer|playwright|browser automation|portal scraping/i.test(integrationSource), false)
}

async function main() {
  await runFeatureFlagTests()
  await runCanonicalExportTests()
  await runAdapterRegistryTests()
  await runTransformationTests()
  await runEligibilityPackageDeliveryTests()
  await runOriginatorIntakePackageTests()
  await runRecipientSpecificFormatTests()
  await runOriginatorDocumentRequestTests()
  await runOriginatorDocumentRequestWorkspaceTests()
  await runOriginatorProgressTrackingTests()
  await runOriginatorOfferGrantCaptureTests()
  await runGovernanceReportingTests()
  await runOriginatorInternalReadinessTests()
  await runOriginatorWorkspaceMvpTests()
  await runOneOriginatorPilotTests()
  await runOperationalHardeningTests()
  await runMultiOriginatorRolloutTests()
  await runFormalIntegrationReadinessTests()
  runMigrationAndDocumentationTests()
  console.log('Phase 8 external mapping and delivery tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
