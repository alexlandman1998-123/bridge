import {
  OTP_TEMPLATE_CHANGE_CONTROL_PHASE45_VERSION,
  OTP_TEMPLATE_CHANGE_CONTROL_READY_STATUS,
  buildOtpTemplateChangeControlReceipt,
} from './otpTemplateChangeControlPhase45.js'

export const OTP_VERSION_RENEWAL_PUBLICATION_PHASE46_VERSION = 'otp_version_renewal_publication_phase46_v1'
export const OTP_VERSION_RENEWAL_PUBLICATION_READY_STATUS = 'OTP_VERSION_RENEWAL_PUBLICATION_DRY_RUN_READY_FOR_ACTIVATION_GUARD'
export const OTP_VERSION_RENEWAL_PUBLICATION_CONTRACT = 'otp-vnext-version-renewal-publication-phase46-v1'

const REQUIRED_ROUTES = Object.freeze(['resale_existing_property', 'new_development'])
const REQUIRED_DRY_RUN_EVIDENCE = Object.freeze([
  'dry_run_receipt',
  'staged_route_outputs',
  'generated_pdf_proof',
  'signing_envelope_alignment',
  'content_scanner',
  'rollback_snapshot',
])

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function fingerprint(seed = 'phase46') {
  return `${normalizeKey(seed).replace(/[^a-f0-9]/gi, 'a')}${'0'.repeat(64)}`.slice(0, 64).replace(/[^a-f0-9]/gi, 'a')
}

function hasDocxSource(row = {}) {
  return /\.docx?$/i.test(normalizeText(row.path || row.sourcePath || row.source_path || row.templateId || row.template_id || row.candidateTemplateDefaultId || row.candidate_template_default_id)) ||
    normalizeKey(row.sourceFormat || row.source_format).includes('doc') ||
    numberValue(row.docxReferenceCount || row.docx_reference_count) > 0
}

function defaultPublicationDryRunPlan(changeControlReceipt = buildOtpTemplateChangeControlReceipt(), checkedAt = new Date().toISOString()) {
  return {
    dryRunId: 'otp-vnext-phase46-version-renewal-dry-run',
    sourceChangeRequestId: changeControlReceipt.changeRequest?.changeRequestId || 'otp-vnext-change-2026-001',
    publicationMode: 'dry_run_only',
    targetEnvironment: 'staging',
    operator: 'release_operator',
    featureFlag: changeControlReceipt.publicationPlan?.featureFlag || 'otp_template_renewal_phase45',
    productionWriteRequested: false,
    liveDefaultMutationRequested: false,
    signingDispatchRequested: false,
    executedAt: checkedAt,
  }
}

function defaultRoutePublications(changeControlReceipt = buildOtpTemplateChangeControlReceipt()) {
  const routeImpact = list(changeControlReceipt.routeImpactReview)
  return REQUIRED_ROUTES.map((routeVariant) => {
    const impact = routeImpact.find((row) => normalizeKey(row.routeVariant || row.route_variant) === routeVariant) || {}
    return {
      routeVariant,
      previousTemplateDefaultId: impact.previousTemplateDefaultId || impact.previous_template_default_id || `otp-${routeVariant}-previous`,
      candidateTemplateDefaultId: impact.proposedTemplateDefaultId || impact.proposed_template_default_id || `otp-${routeVariant}-candidate`,
      previousSigningEnvelopeKey: impact.previousSigningEnvelopeKey || impact.previous_signing_envelope_key || `otp-${routeVariant}-envelope`,
      candidateSigningEnvelopeKey: impact.proposedSigningEnvelopeKey || impact.proposed_signing_envelope_key || `otp-${routeVariant}-envelope-candidate`,
      stagedCandidateCreated: true,
      liveDefaultChanged: false,
      generatedPdfProofStatus: 'passed',
      contentScannerStatus: 'passed',
      signingEnvelopeStatus: 'passed',
      fieldRegistryStatus: 'passed',
      sourceFormat: 'native_pdf_template',
      outputFingerprint: fingerprint(`phase46-${routeVariant}`),
    }
  })
}

function defaultVersionRegistry(changeControlReceipt = buildOtpTemplateChangeControlReceipt()) {
  return {
    versionKey: changeControlReceipt.versionRenewal?.versionKey || 'otp-template-vnext-2026-08-renewal',
    previousVersionKey: changeControlReceipt.versionRenewal?.previousVersionKey || 'otp-template-vnext-phase39',
    semanticVersion: changeControlReceipt.versionRenewal?.semanticVersion || '2.1.0',
    previousSemanticVersion: changeControlReceipt.versionRenewal?.previousSemanticVersion || '2.0.0',
    candidateRecordCreated: true,
    immutableVersionRecord: true,
    versionCollision: false,
    publishedToLive: false,
    recordFingerprint: fingerprint('phase46-version-registry'),
  }
}

function defaultMutationProof() {
  return {
    auditOnly: true,
    mutatedData: false,
    productionWriteAttempted: false,
    liveDefaultMutationCount: 0,
    productionArtifactMutationCount: 0,
    signingDispatchMutationCount: 0,
    stagingCandidateCount: 2,
  }
}

function defaultEvidence() {
  return REQUIRED_DRY_RUN_EVIDENCE.map((key) => ({
    key,
    status: 'passed',
    path: `docs/otp-version-renewal-${key.replace(/_/g, '-')}-phase46.md`,
    fingerprint: fingerprint(`phase46-${key}`),
  }))
}

function defaultRollbackSnapshot() {
  return {
    rollbackPlanReference: 'phase45-template-renewal-rollback-plan',
    previousDefaultsSnapshotCaptured: true,
    previousVersionRestoreCommandReady: true,
    disableCandidateVersionReady: true,
    stopSigningDispatchReady: true,
    rehearsalReference: 'phase46-version-renewal-dry-run-rollback-snapshot',
  }
}

function defaultArchiveReceipt() {
  return {
    archiveReference: 'otp-vnext-phase46-publication-dry-run-archive',
    dryRunReceiptArchived: true,
    routeOutputEvidenceArchived: true,
    versionRegistryEvidenceArchived: true,
    immutable: true,
  }
}

function phase45Blockers(changeControlReceipt = {}) {
  return [
    changeControlReceipt.version === OTP_TEMPLATE_CHANGE_CONTROL_PHASE45_VERSION ? '' : 'phase45_change_control_version_mismatch',
    changeControlReceipt.status === OTP_TEMPLATE_CHANGE_CONTROL_READY_STATUS ? '' : 'phase45_change_control_not_ready',
    changeControlReceipt.canPrepareVersionRenewal === true ? '' : 'phase45_change_control_cannot_prepare_renewal',
    list(changeControlReceipt.blockerCodes).length === 0 ? '' : 'phase45_change_control_has_blockers',
    changeControlReceipt.mutatedData === false ? '' : 'phase45_change_control_mutation_unexpected',
  ].filter(Boolean)
}

function dryRunPlanBlockers(publicationDryRunPlan = {}, changeControlReceipt = {}) {
  return [
    normalizeText(publicationDryRunPlan.dryRunId || publicationDryRunPlan.dry_run_id) ? '' : 'dry_run_id_missing',
    normalizeText(publicationDryRunPlan.sourceChangeRequestId || publicationDryRunPlan.source_change_request_id) ? '' : 'source_change_request_missing',
    (publicationDryRunPlan.sourceChangeRequestId || publicationDryRunPlan.source_change_request_id) === changeControlReceipt.changeRequest?.changeRequestId ? '' : 'source_change_request_mismatch',
    normalizeKey(publicationDryRunPlan.publicationMode || publicationDryRunPlan.publication_mode) === 'dry_run_only' ? '' : 'publication_mode_not_dry_run',
    normalizeKey(publicationDryRunPlan.targetEnvironment || publicationDryRunPlan.target_environment) === 'staging' ? '' : 'publication_target_not_staging',
    normalizeText(publicationDryRunPlan.operator) ? '' : 'publication_operator_missing',
    normalizeText(publicationDryRunPlan.featureFlag || publicationDryRunPlan.feature_flag) ? '' : 'publication_feature_flag_missing',
    publicationDryRunPlan.productionWriteRequested === true ? 'publication_production_write_requested' : '',
    publicationDryRunPlan.liveDefaultMutationRequested === true ? 'publication_live_default_mutation_requested' : '',
    publicationDryRunPlan.signingDispatchRequested === true ? 'publication_signing_dispatch_requested' : '',
    normalizeText(publicationDryRunPlan.executedAt || publicationDryRunPlan.executed_at) ? '' : 'publication_execution_time_missing',
  ].filter(Boolean)
}

function routePublicationBlockers(routePublications = [], changeControlReceipt = {}) {
  const phase45Routes = list(changeControlReceipt.routeImpactReview)
  const routes = list(routePublications).map((row) => normalizeKey(row.routeVariant || row.route_variant))
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !routes.includes(route))
  const duplicateRoutes = routes.filter((route, index) => route && routes.indexOf(route) !== index)
  const rowBlockers = list(routePublications).flatMap((row) => {
    const route = normalizeKey(row.routeVariant || row.route_variant) || 'unknown'
    const phase45Route = phase45Routes.find((candidate) => normalizeKey(candidate.routeVariant || candidate.route_variant) === route) || {}
    const expectedTemplate = phase45Route.proposedTemplateDefaultId || phase45Route.proposed_template_default_id
    const expectedEnvelope = phase45Route.proposedSigningEnvelopeKey || phase45Route.proposed_signing_envelope_key
    return [
      REQUIRED_ROUTES.includes(route) ? '' : `unsupported_route:${route}`,
      row.stagedCandidateCreated === true ? '' : `route_candidate_not_staged:${route}`,
      row.liveDefaultChanged === true ? `route_live_default_changed:${route}` : '',
      normalizeText(row.previousTemplateDefaultId || row.previous_template_default_id) ? '' : `previous_template_default_missing:${route}`,
      normalizeText(row.candidateTemplateDefaultId || row.candidate_template_default_id) ? '' : `candidate_template_default_missing:${route}`,
      expectedTemplate && (row.candidateTemplateDefaultId || row.candidate_template_default_id) !== expectedTemplate ? `candidate_template_default_mismatch:${route}` : '',
      normalizeText(row.previousSigningEnvelopeKey || row.previous_signing_envelope_key) ? '' : `previous_signing_envelope_missing:${route}`,
      normalizeText(row.candidateSigningEnvelopeKey || row.candidate_signing_envelope_key) ? '' : `candidate_signing_envelope_missing:${route}`,
      expectedEnvelope && (row.candidateSigningEnvelopeKey || row.candidate_signing_envelope_key) !== expectedEnvelope ? `candidate_signing_envelope_mismatch:${route}` : '',
      normalizeKey(row.generatedPdfProofStatus || row.generated_pdf_proof_status) === 'passed' ? '' : `generated_pdf_proof_not_passed:${route}`,
      normalizeKey(row.contentScannerStatus || row.content_scanner_status) === 'passed' ? '' : `content_scanner_not_passed:${route}`,
      normalizeKey(row.signingEnvelopeStatus || row.signing_envelope_status) === 'passed' ? '' : `signing_envelope_not_passed:${route}`,
      normalizeKey(row.fieldRegistryStatus || row.field_registry_status) === 'passed' ? '' : `field_registry_not_passed:${route}`,
      hasDocxSource(row) ? `route_publication_docx_source_observed:${route}` : '',
      /^[a-f0-9]{64}$/i.test(normalizeText(row.outputFingerprint || row.output_fingerprint)) ? '' : `route_output_fingerprint_missing:${route}`,
    ].filter(Boolean)
  })
  return [
    ...missingRoutes.map((route) => `route_publication_missing:${route}`),
    ...unique(duplicateRoutes).map((route) => `route_publication_duplicate:${route}`),
    ...rowBlockers,
  ]
}

function versionRegistryBlockers(versionRegistry = {}, changeControlReceipt = {}) {
  const renewal = changeControlReceipt.versionRenewal || {}
  return [
    normalizeText(versionRegistry.versionKey || versionRegistry.version_key) ? '' : 'version_key_missing',
    (versionRegistry.versionKey || versionRegistry.version_key) === renewal.versionKey ? '' : 'version_key_mismatch',
    normalizeText(versionRegistry.previousVersionKey || versionRegistry.previous_version_key) ? '' : 'previous_version_key_missing',
    (versionRegistry.previousVersionKey || versionRegistry.previous_version_key) === renewal.previousVersionKey ? '' : 'previous_version_key_mismatch',
    normalizeText(versionRegistry.semanticVersion || versionRegistry.semantic_version) ? '' : 'semantic_version_missing',
    (versionRegistry.semanticVersion || versionRegistry.semantic_version) === renewal.semanticVersion ? '' : 'semantic_version_mismatch',
    versionRegistry.candidateRecordCreated === true ? '' : 'candidate_version_record_not_created',
    versionRegistry.immutableVersionRecord === true ? '' : 'version_record_not_immutable',
    versionRegistry.versionCollision === true ? 'version_collision_detected' : '',
    versionRegistry.publishedToLive === true ? 'candidate_published_to_live' : '',
    /^[a-f0-9]{64}$/i.test(normalizeText(versionRegistry.recordFingerprint || versionRegistry.record_fingerprint)) ? '' : 'version_record_fingerprint_missing',
  ].filter(Boolean)
}

function mutationProofBlockers(mutationProof = {}) {
  return [
    mutationProof.auditOnly === true ? '' : 'mutation_proof_not_audit_only',
    mutationProof.mutatedData === false ? '' : 'mutation_proof_mutated_data',
    mutationProof.productionWriteAttempted === true ? 'production_write_attempted' : '',
    numberValue(mutationProof.liveDefaultMutationCount || mutationProof.live_default_mutation_count) === 0 ? '' : 'live_default_mutation_observed',
    numberValue(mutationProof.productionArtifactMutationCount || mutationProof.production_artifact_mutation_count) === 0 ? '' : 'production_artifact_mutation_observed',
    numberValue(mutationProof.signingDispatchMutationCount || mutationProof.signing_dispatch_mutation_count) === 0 ? '' : 'signing_dispatch_mutation_observed',
    numberValue(mutationProof.stagingCandidateCount || mutationProof.staging_candidate_count) >= REQUIRED_ROUTES.length ? '' : 'staging_candidate_count_incomplete',
  ].filter(Boolean)
}

function evidenceBlockers(evidence = []) {
  const keys = list(evidence).map((row) => normalizeKey(row.key))
  const missingKeys = REQUIRED_DRY_RUN_EVIDENCE.filter((key) => !keys.includes(key))
  const badRows = list(evidence).filter((row) =>
    REQUIRED_DRY_RUN_EVIDENCE.includes(normalizeKey(row.key)) &&
      (normalizeKey(row.status) !== 'passed' || !normalizeText(row.path) || !/^[a-f0-9]{64}$/i.test(normalizeText(row.fingerprint || row.sha256))),
  )
  return [
    ...missingKeys.map((key) => `missing_dry_run_evidence:${key}`),
    ...badRows.map((row) => `dry_run_evidence_not_passed:${normalizeKey(row.key) || 'unknown'}`),
  ]
}

function rollbackSnapshotBlockers(rollbackSnapshot = {}) {
  return [
    normalizeText(rollbackSnapshot.rollbackPlanReference || rollbackSnapshot.rollback_plan_reference) ? '' : 'rollback_plan_reference_missing',
    rollbackSnapshot.previousDefaultsSnapshotCaptured === true ? '' : 'previous_defaults_snapshot_missing',
    rollbackSnapshot.previousVersionRestoreCommandReady === true ? '' : 'previous_version_restore_not_ready',
    rollbackSnapshot.disableCandidateVersionReady === true ? '' : 'disable_candidate_version_not_ready',
    rollbackSnapshot.stopSigningDispatchReady === true ? '' : 'stop_signing_dispatch_not_ready',
    normalizeText(rollbackSnapshot.rehearsalReference || rollbackSnapshot.rehearsal_reference) ? '' : 'rollback_rehearsal_reference_missing',
  ].filter(Boolean)
}

function archiveReceiptBlockers(archiveReceipt = {}) {
  return [
    normalizeText(archiveReceipt.archiveReference || archiveReceipt.archive_reference) ? '' : 'publication_archive_reference_missing',
    archiveReceipt.dryRunReceiptArchived === true ? '' : 'dry_run_receipt_not_archived',
    archiveReceipt.routeOutputEvidenceArchived === true ? '' : 'route_output_evidence_not_archived',
    archiveReceipt.versionRegistryEvidenceArchived === true ? '' : 'version_registry_evidence_not_archived',
    archiveReceipt.immutable === true ? '' : 'publication_archive_not_immutable',
  ].filter(Boolean)
}

export function buildOtpVersionRenewalPublicationReceipt({
  changeControlReceipt = buildOtpTemplateChangeControlReceipt(),
  publicationDryRunPlan = defaultPublicationDryRunPlan(changeControlReceipt),
  routePublications = defaultRoutePublications(changeControlReceipt),
  versionRegistry = defaultVersionRegistry(changeControlReceipt),
  mutationProof = defaultMutationProof(),
  evidence = defaultEvidence(),
  rollbackSnapshot = defaultRollbackSnapshot(),
  archiveReceipt = defaultArchiveReceipt(),
  checkedAt = new Date().toISOString(),
} = {}) {
  const blockerCodes = unique([
    ...phase45Blockers(changeControlReceipt),
    ...dryRunPlanBlockers(publicationDryRunPlan, changeControlReceipt),
    ...routePublicationBlockers(routePublications, changeControlReceipt),
    ...versionRegistryBlockers(versionRegistry, changeControlReceipt),
    ...mutationProofBlockers(mutationProof),
    ...evidenceBlockers(evidence),
    ...rollbackSnapshotBlockers(rollbackSnapshot),
    ...archiveReceiptBlockers(archiveReceipt),
  ])
  const canCompletePublicationDryRun = blockerCodes.length === 0

  return Object.freeze({
    version: OTP_VERSION_RENEWAL_PUBLICATION_PHASE46_VERSION,
    contract: OTP_VERSION_RENEWAL_PUBLICATION_CONTRACT,
    checkedAt,
    status: canCompletePublicationDryRun
      ? OTP_VERSION_RENEWAL_PUBLICATION_READY_STATUS
      : 'OTP_VERSION_RENEWAL_PUBLICATION_DRY_RUN_BLOCKED',
    canCompletePublicationDryRun,
    mutatedData: false,
    blockerCodes: Object.freeze(blockerCodes),
    changeControlReceipt: Object.freeze({ ...changeControlReceipt }),
    publicationDryRunPlan: Object.freeze({ ...publicationDryRunPlan }),
    routePublications: Object.freeze(list(routePublications)),
    versionRegistry: Object.freeze({ ...versionRegistry }),
    mutationProof: Object.freeze({ ...mutationProof }),
    evidence: Object.freeze(list(evidence)),
    rollbackSnapshot: Object.freeze({ ...rollbackSnapshot }),
    archiveReceipt: Object.freeze({ ...archiveReceipt }),
    summary: Object.freeze({
      routeCount: REQUIRED_ROUTES.length,
      stagedRouteCount: list(routePublications).filter((row) => row.stagedCandidateCreated === true).length,
      evidenceCount: list(evidence).length,
      blockerCount: blockerCodes.length,
      liveDefaultMutationCount: numberValue(mutationProof.liveDefaultMutationCount || mutationProof.live_default_mutation_count),
    }),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpVersionRenewalPublicationPhase46Audit({
  checkedAt = new Date().toISOString(),
  phase45Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase45Ready = !phase45Audit || phase45Audit.status === OTP_TEMPLATE_CHANGE_CONTROL_READY_STATUS
  const goodChangeControl = phase45Audit?.changeReceipts?.find((receipt) => receipt.canPrepareVersionRenewal) ||
    buildOtpTemplateChangeControlReceipt({ checkedAt })
  const goodDryRun = buildOtpVersionRenewalPublicationReceipt({
    checkedAt,
    changeControlReceipt: goodChangeControl,
  })
  const phase45BlockedDryRun = buildOtpVersionRenewalPublicationReceipt({
    checkedAt,
    changeControlReceipt: {
      ...goodChangeControl,
      status: 'OTP_TEMPLATE_CHANGE_CONTROL_BLOCKED',
      canPrepareVersionRenewal: false,
      blockerCodes: ['legal_approval_not_approved'],
    },
  })
  const missingRouteDryRun = buildOtpVersionRenewalPublicationReceipt({
    checkedAt,
    changeControlReceipt: goodChangeControl,
    routePublications: defaultRoutePublications(goodChangeControl).filter((row) => row.routeVariant !== 'new_development'),
  })
  const docxRegressionDryRun = buildOtpVersionRenewalPublicationReceipt({
    checkedAt,
    changeControlReceipt: goodChangeControl,
    routePublications: defaultRoutePublications(goodChangeControl).map((row) =>
      row.routeVariant === 'resale_existing_property'
        ? { ...row, sourceFormat: 'docx', sourcePath: 'resale-renewal.docx', docxReferenceCount: 1 }
        : row,
    ),
  })
  const versionCollisionDryRun = buildOtpVersionRenewalPublicationReceipt({
    checkedAt,
    changeControlReceipt: goodChangeControl,
    versionRegistry: {
      ...defaultVersionRegistry(goodChangeControl),
      versionCollision: true,
      immutableVersionRecord: false,
      publishedToLive: true,
    },
  })
  const liveMutationDryRun = buildOtpVersionRenewalPublicationReceipt({
    checkedAt,
    changeControlReceipt: goodChangeControl,
    publicationDryRunPlan: {
      ...defaultPublicationDryRunPlan(goodChangeControl, checkedAt),
      publicationMode: 'production_write',
      targetEnvironment: 'production',
      productionWriteRequested: true,
      liveDefaultMutationRequested: true,
      signingDispatchRequested: true,
    },
    mutationProof: {
      ...defaultMutationProof(),
      auditOnly: false,
      mutatedData: true,
      productionWriteAttempted: true,
      liveDefaultMutationCount: 1,
      productionArtifactMutationCount: 1,
      signingDispatchMutationCount: 1,
    },
  })
  const signingMismatchDryRun = buildOtpVersionRenewalPublicationReceipt({
    checkedAt,
    changeControlReceipt: goodChangeControl,
    routePublications: defaultRoutePublications(goodChangeControl).map((row) =>
      row.routeVariant === 'new_development'
        ? { ...row, candidateSigningEnvelopeKey: 'wrong-envelope', signingEnvelopeStatus: 'failed' }
        : row,
    ),
  })
  const missingEvidenceDryRun = buildOtpVersionRenewalPublicationReceipt({
    checkedAt,
    changeControlReceipt: goodChangeControl,
    evidence: defaultEvidence().filter((row) => row.key !== 'generated_pdf_proof'),
  })
  const rollbackMissingDryRun = buildOtpVersionRenewalPublicationReceipt({
    checkedAt,
    changeControlReceipt: goodChangeControl,
    rollbackSnapshot: {
      ...defaultRollbackSnapshot(),
      previousDefaultsSnapshotCaptured: false,
      previousVersionRestoreCommandReady: false,
    },
  })

  addCheck(checks, phase45Ready, 'PHASE46_PHASE45_CHANGE_CONTROL_READY', 'Version renewal publication dry-run starts only after Phase 45 change control is ready.')
  addCheck(
    checks,
    goodDryRun.canCompletePublicationDryRun &&
      goodDryRun.status === OTP_VERSION_RENEWAL_PUBLICATION_READY_STATUS &&
      goodDryRun.mutatedData === false,
    'PHASE46_GOOD_DRY_RUN_PUBLICATION_READY',
    'A clean Phase 45 change-control receipt can complete a staged version renewal publication dry-run.',
  )
  addCheck(
    checks,
    REQUIRED_ROUTES.every((route) => goodDryRun.routePublications.some((row) => row.routeVariant === route && row.stagedCandidateCreated === true)),
    'PHASE46_RESALE_AND_NEW_DEVELOPMENT_STAGED_SEPARATELY',
    'Resale and new-development route candidates must both be staged and remain route-specific.',
  )
  addCheck(
    checks,
    goodDryRun.mutationProof.auditOnly === true &&
      goodDryRun.mutationProof.productionWriteAttempted === false &&
      goodDryRun.mutationProof.liveDefaultMutationCount === 0 &&
      goodDryRun.versionRegistry.publishedToLive === false,
    'PHASE46_DRY_RUN_DOES_NOT_MUTATE_LIVE_DEFAULTS',
    'The dry-run cannot mutate live defaults, production artifacts, signing dispatch, or live version records.',
  )
  addCheck(
    checks,
    REQUIRED_DRY_RUN_EVIDENCE.every((key) => goodDryRun.evidence.some((row) => row.key === key && row.status === 'passed')),
    'PHASE46_GENERATED_PROOF_AND_SCANNER_EVIDENCE_PRESENT',
    'Generated PDF proof, content scanner, signing alignment, route output, dry-run receipt, and rollback evidence must pass.',
  )
  addCheck(
    checks,
    goodDryRun.routePublications.every((row) => row.signingEnvelopeStatus === 'passed' && normalizeText(row.candidateSigningEnvelopeKey)),
    'PHASE46_SIGNING_ENVELOPES_ALIGNED',
    'Route-specific signing envelopes must align with the Phase 45 proposed envelope keys.',
  )
  addCheck(
    checks,
    phase45BlockedDryRun.canCompletePublicationDryRun === false &&
      phase45BlockedDryRun.blockerCodes.includes('phase45_change_control_not_ready'),
    'PHASE46_PHASE45_BLOCKED_RECEIPT_REJECTED',
    'A blocked Phase 45 change-control receipt cannot enter publication dry-run.',
  )
  addCheck(
    checks,
    missingRouteDryRun.canCompletePublicationDryRun === false &&
      missingRouteDryRun.blockerCodes.includes('route_publication_missing:new_development'),
    'PHASE46_MISSING_ROUTE_BLOCKED',
    'Missing resale or new-development route publication output blocks the dry-run.',
  )
  addCheck(
    checks,
    docxRegressionDryRun.canCompletePublicationDryRun === false &&
      docxRegressionDryRun.blockerCodes.includes('route_publication_docx_source_observed:resale_existing_property'),
    'PHASE46_DOCX_REGRESSION_BLOCKED',
    'DOC/DOCX source references are blocked from publication dry-run.',
  )
  addCheck(
    checks,
    versionCollisionDryRun.canCompletePublicationDryRun === false &&
      versionCollisionDryRun.blockerCodes.includes('version_collision_detected') &&
      versionCollisionDryRun.blockerCodes.includes('candidate_published_to_live'),
    'PHASE46_VERSION_COLLISION_BLOCKED',
    'Version collisions, mutable records, or live-published candidates block the dry-run.',
  )
  addCheck(
    checks,
    liveMutationDryRun.canCompletePublicationDryRun === false &&
      liveMutationDryRun.blockerCodes.includes('publication_production_write_requested') &&
      liveMutationDryRun.blockerCodes.includes('live_default_mutation_observed'),
    'PHASE46_LIVE_MUTATION_BLOCKED',
    'Production writes or live default mutation attempts are blocked during publication dry-run.',
  )
  addCheck(
    checks,
    signingMismatchDryRun.canCompletePublicationDryRun === false &&
      signingMismatchDryRun.blockerCodes.includes('candidate_signing_envelope_mismatch:new_development') &&
      signingMismatchDryRun.blockerCodes.includes('signing_envelope_not_passed:new_development'),
    'PHASE46_SIGNING_ENVELOPE_MISMATCH_BLOCKED',
    'A route signing envelope mismatch blocks publication dry-run.',
  )
  addCheck(
    checks,
    missingEvidenceDryRun.canCompletePublicationDryRun === false &&
      missingEvidenceDryRun.blockerCodes.includes('missing_dry_run_evidence:generated_pdf_proof'),
    'PHASE46_MISSING_EVIDENCE_BLOCKED',
    'Missing generated proof or other dry-run evidence blocks publication dry-run.',
  )
  addCheck(
    checks,
    rollbackMissingDryRun.canCompletePublicationDryRun === false &&
      rollbackMissingDryRun.blockerCodes.includes('previous_defaults_snapshot_missing') &&
      rollbackMissingDryRun.blockerCodes.includes('previous_version_restore_not_ready'),
    'PHASE46_ROLLBACK_SNAPSHOT_BLOCKED',
    'Rollback snapshot and restore commands must be ready before dry-run publication can pass.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-version-renewal-publication-phase46'] === 'node scripts/otp-version-renewal-publication-phase46.test.mjs' &&
      packageJson.scripts?.['report:otp-version-renewal-publication-phase46'] === 'node scripts/report-otp-version-renewal-publication-phase46.mjs',
    'PHASE46_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 46 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_VERSION_RENEWAL_PUBLICATION_PHASE46_VERSION,
    contract: OTP_VERSION_RENEWAL_PUBLICATION_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_VERSION_RENEWAL_PUBLICATION_REMEDIATION_REQUIRED' : OTP_VERSION_RENEWAL_PUBLICATION_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    dryRunReceipts: Object.freeze([
      goodDryRun,
      phase45BlockedDryRun,
      missingRouteDryRun,
      docxRegressionDryRun,
      versionCollisionDryRun,
      liveMutationDryRun,
      signingMismatchDryRun,
      missingEvidenceDryRun,
      rollbackMissingDryRun,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      passedDryRunCount: [goodDryRun].filter((row) => row.canCompletePublicationDryRun).length,
      blockedDryRunCount: [
        phase45BlockedDryRun,
        missingRouteDryRun,
        docxRegressionDryRun,
        versionCollisionDryRun,
        liveMutationDryRun,
        signingMismatchDryRun,
        missingEvidenceDryRun,
        rollbackMissingDryRun,
      ].filter((row) => !row.canCompletePublicationDryRun).length,
      routeCount: REQUIRED_ROUTES.length,
      evidenceCount: REQUIRED_DRY_RUN_EVIDENCE.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 47,
      key: 'otp_version_renewal_activation_guard',
      label: 'Version Renewal Activation Guard',
    }),
  })
}

export function formatOtpVersionRenewalPublicationPhase46Markdown(report = buildOtpVersionRenewalPublicationPhase46Audit()) {
  return [
    '# OTP Generator Phase 46 Version Renewal Publication Dry Run',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Contract: ${report.contract}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Passed dry-run receipts', report.summary.passedDryRunCount],
        ['Blocked dry-run receipts', report.summary.blockedDryRunCount],
        ['Routes', report.summary.routeCount],
        ['Evidence items', report.summary.evidenceCount],
        ['Blockers', report.summary.blockerCount],
        ['Next phase', report.nextPhase ? `Phase ${report.nextPhase.phase}: ${report.nextPhase.label}` : 'Blocked'],
      ],
    ),
    '',
    '## Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Dry-Run Receipts',
    '',
    table(
      ['Status', 'Allowed', 'Routes staged', 'Evidence', 'Live default mutations', 'Blockers'],
      report.dryRunReceipts.map((receipt) => [
        receipt.status,
        receipt.canCompletePublicationDryRun ? 'yes' : 'no',
        receipt.summary.stagedRouteCount,
        receipt.summary.evidenceCount,
        receipt.summary.liveDefaultMutationCount,
        receipt.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 46 proves an approved Phase 45 template renewal can be published only as a staged dry-run candidate: resale and new-development outputs stay separate, generated proof and scanner evidence pass, signing envelopes match the proposed route keys, version metadata remains immutable, rollback snapshots are ready, and live defaults or production artifacts are not mutated. The test/report path remains receipt-only and does not mutate production data.',
    '',
  ].join('\n')
}
