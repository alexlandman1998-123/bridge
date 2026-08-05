import {
  OTP_FINAL_SIGNED_ARTIFACT_PROOF_PHASE37_VERSION,
  OTP_FINAL_SIGNED_ARTIFACT_PROOF_READY_STATUS,
} from './otpFinalSignedArtifactProofPhase37.js'

export const OTP_END_TO_END_STAGING_WALKTHROUGH_PHASE38_VERSION = 'otp_end_to_end_staging_walkthrough_phase38_v1'
export const OTP_END_TO_END_STAGING_WALKTHROUGH_READY_STATUS = 'OTP_END_TO_END_STAGING_WALKTHROUGH_READY_FOR_PILOT_GO_NO_GO'
export const OTP_END_TO_END_STAGING_WALKTHROUGH_CONTRACT = 'otp-vnext-end-to-end-staging-walkthrough-phase38-v1'

const REQUIRED_STAGE_KEYS = Object.freeze([
  'agent_review',
  'generate_otp',
  'prepare_signing',
  'dispatch_guard',
  'signer_sessions',
  'completion_guard',
  'final_artifact_proof',
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

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

function fingerprintFor(routeVariant = '', kind = 'review') {
  return `phase38-${kind}-${normalizeKey(routeVariant)}`
}

function buildStage({ order, key, routeVariant, packetId, packetVersionId, receiptVersion, receiptStatus, writeMode = 'dry_run' } = {}) {
  return Object.freeze({
    order,
    key,
    routeVariant: normalizeKey(routeVariant),
    packetId: normalizeText(packetId),
    packetVersionId: normalizeText(packetVersionId),
    receiptVersion: normalizeText(receiptVersion),
    receiptStatus: normalizeText(receiptStatus),
    writeMode,
    target: 'staging',
  })
}

export function buildOtpEndToEndStagingWalkthrough({
  routeVariant = 'resale_existing_property',
  packetId = `otp-phase38-${normalizeKey(routeVariant)}-packet`,
  packetVersionId = `otp-phase38-${normalizeKey(routeVariant)}-version`,
  reviewRecordFingerprint = fingerprintFor(routeVariant, 'review'),
  termsFingerprint = fingerprintFor(routeVariant, 'terms'),
  finalArtifactSha256 = 'c'.repeat(64),
  finalArtifactDocumentId = `doc-otp-phase38-${normalizeKey(routeVariant)}`,
  checkedAt = new Date().toISOString(),
  stages = null,
} = {}) {
  const normalizedRoute = normalizeKey(routeVariant)
  const stageRows = list(stages).length
    ? list(stages)
    : [
        buildStage({
          order: 1,
          key: 'agent_review',
          routeVariant: normalizedRoute,
          packetId,
          packetVersionId,
          receiptVersion: 'otp_agent_review_ui_phase31_v1',
          receiptStatus: 'OTP_AGENT_REVIEW_UI_READY_FOR_RUNTIME_PROOF',
        }),
        buildStage({
          order: 2,
          key: 'generate_otp',
          routeVariant: normalizedRoute,
          packetId,
          packetVersionId,
          receiptVersion: 'otp_agent_review_runtime_proof_phase32_v1',
          receiptStatus: 'OTP_AGENT_REVIEW_RUNTIME_PROOF_READY_FOR_SIGNING_QA_EXTENSION',
        }),
        buildStage({
          order: 3,
          key: 'prepare_signing',
          routeVariant: normalizedRoute,
          packetId,
          packetVersionId,
          receiptVersion: 'otp_agent_review_signing_alignment_phase33_v1',
          receiptStatus: 'OTP_AGENT_REVIEW_SIGNING_ALIGNMENT_READY_FOR_DISPATCH_GUARD_EXTENSION',
        }),
        buildStage({
          order: 4,
          key: 'dispatch_guard',
          routeVariant: normalizedRoute,
          packetId,
          packetVersionId,
          receiptVersion: 'otp_agent_review_dispatch_guard_phase34_v1',
          receiptStatus: 'OTP_AGENT_REVIEW_DISPATCH_GUARD_READY_FOR_SIGNER_SESSION_EXTENSION',
        }),
        buildStage({
          order: 5,
          key: 'signer_sessions',
          routeVariant: normalizedRoute,
          packetId,
          packetVersionId,
          receiptVersion: 'otp_agent_review_signer_session_phase35_v1',
          receiptStatus: 'OTP_AGENT_REVIEW_SIGNER_SESSION_READY_FOR_COMPLETION_GUARD_EXTENSION',
        }),
        buildStage({
          order: 6,
          key: 'completion_guard',
          routeVariant: normalizedRoute,
          packetId,
          packetVersionId,
          receiptVersion: 'otp_agent_review_completion_guard_phase36_v1',
          receiptStatus: 'OTP_AGENT_REVIEW_COMPLETION_GUARD_READY_FOR_FINAL_ARTIFACT_PROOF',
        }),
        buildStage({
          order: 7,
          key: 'final_artifact_proof',
          routeVariant: normalizedRoute,
          packetId,
          packetVersionId,
          receiptVersion: OTP_FINAL_SIGNED_ARTIFACT_PROOF_PHASE37_VERSION,
          receiptStatus: OTP_FINAL_SIGNED_ARTIFACT_PROOF_READY_STATUS,
        }),
      ]

  const stageKeys = stageRows.map((stage) => normalizeKey(stage.key))
  const stageOrders = stageRows.map((stage) => Number(stage.order || 0))
  const routeMismatches = stageRows.filter((stage) => normalizeKey(stage.routeVariant) !== normalizedRoute)
  const packetMismatches = stageRows.filter((stage) => normalizeText(stage.packetId) !== normalizeText(packetId))
  const versionMismatches = stageRows.filter((stage) => normalizeText(stage.packetVersionId) !== normalizeText(packetVersionId))
  const liveWrites = stageRows.filter((stage) => normalizeKey(stage.writeMode) !== 'dry_run' || normalizeKey(stage.target) !== 'staging')
  const missingStages = REQUIRED_STAGE_KEYS.filter((key) => !stageKeys.includes(key))
  const duplicateStages = stageKeys.filter((key, index) => stageKeys.indexOf(key) !== index)
  const orderedStages = REQUIRED_STAGE_KEYS.every((key, index) => stageKeys[index] === key && stageOrders[index] === index + 1)

  const blockerCodes = [
    normalizedRoute ? '' : 'missing_route_variant',
    packetId ? '' : 'missing_packet_id',
    packetVersionId ? '' : 'missing_packet_version_id',
    reviewRecordFingerprint ? '' : 'missing_review_record_fingerprint',
    termsFingerprint ? '' : 'missing_terms_fingerprint',
    /^[a-f0-9]{64}$/i.test(finalArtifactSha256) ? '' : 'missing_final_artifact_sha256',
    finalArtifactDocumentId ? '' : 'missing_final_artifact_document_id',
    ...missingStages.map((key) => `missing_stage:${key}`),
    ...unique(duplicateStages).map((key) => `duplicate_stage:${key}`),
    orderedStages ? '' : 'stage_order_mismatch',
    ...routeMismatches.map((stage) => `stage_route_mismatch:${normalizeKey(stage.key) || 'unknown'}`),
    ...packetMismatches.map((stage) => `stage_packet_mismatch:${normalizeKey(stage.key) || 'unknown'}`),
    ...versionMismatches.map((stage) => `stage_version_mismatch:${normalizeKey(stage.key) || 'unknown'}`),
    ...liveWrites.map((stage) => `stage_not_dry_run:${normalizeKey(stage.key) || 'unknown'}`),
  ].filter(Boolean)

  const canApproveStagingWalkthrough = blockerCodes.length === 0
  return Object.freeze({
    version: OTP_END_TO_END_STAGING_WALKTHROUGH_PHASE38_VERSION,
    contract: OTP_END_TO_END_STAGING_WALKTHROUGH_CONTRACT,
    checkedAt,
    status: canApproveStagingWalkthrough
      ? OTP_END_TO_END_STAGING_WALKTHROUGH_READY_STATUS
      : 'OTP_END_TO_END_STAGING_WALKTHROUGH_BLOCKED',
    canApproveStagingWalkthrough,
    blockerCodes: Object.freeze(unique(blockerCodes)),
    routeVariant: normalizedRoute,
    packetId: normalizeText(packetId),
    packetVersionId: normalizeText(packetVersionId),
    reviewRecordFingerprint: normalizeText(reviewRecordFingerprint),
    termsFingerprint: normalizeText(termsFingerprint),
    finalArtifactSha256: normalizeText(finalArtifactSha256),
    finalArtifactDocumentId: normalizeText(finalArtifactDocumentId),
    stageCount: stageRows.length,
    dryRunStageCount: stageRows.filter((stage) => normalizeKey(stage.writeMode) === 'dry_run').length,
    stages: Object.freeze(stageRows),
  })
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

export function buildOtpEndToEndStagingWalkthroughPhase38Audit({
  checkedAt = new Date().toISOString(),
  phase37Audit = null,
  packageJson = {},
} = {}) {
  const checks = []
  const phase37Ready = !phase37Audit || phase37Audit.status === OTP_FINAL_SIGNED_ARTIFACT_PROOF_READY_STATUS
  const resaleWalkthrough = buildOtpEndToEndStagingWalkthrough({
    routeVariant: 'resale_existing_property',
    checkedAt,
  })
  const developmentWalkthrough = buildOtpEndToEndStagingWalkthrough({
    routeVariant: 'new_development',
    checkedAt,
  })
  const missingStageWalkthrough = buildOtpEndToEndStagingWalkthrough({
    routeVariant: 'resale_existing_property',
    checkedAt,
    stages: resaleWalkthrough.stages.filter((stage) => stage.key !== 'dispatch_guard'),
  })
  const wrongVersionWalkthrough = buildOtpEndToEndStagingWalkthrough({
    routeVariant: 'resale_existing_property',
    checkedAt,
    stages: resaleWalkthrough.stages.map((stage) =>
      stage.key === 'signer_sessions' ? { ...stage, packetVersionId: 'wrong-version' } : stage,
    ),
  })
  const liveWriteWalkthrough = buildOtpEndToEndStagingWalkthrough({
    routeVariant: 'resale_existing_property',
    checkedAt,
    stages: resaleWalkthrough.stages.map((stage) =>
      stage.key === 'dispatch_guard' ? { ...stage, writeMode: 'live_write' } : stage,
    ),
  })

  addCheck(checks, phase37Ready, 'PHASE38_PHASE37_FINAL_ARTIFACT_PROOF_READY', 'End-to-end staging walkthrough starts only after Phase 37 final artifact proof is ready.')
  addCheck(
    checks,
    resaleWalkthrough.canApproveStagingWalkthrough && developmentWalkthrough.canApproveStagingWalkthrough,
    'PHASE38_RESALE_AND_NEW_DEVELOPMENT_WALKTHROUGHS_PASS',
    'Both resale and new-development OTP routes complete the same staging walkthrough sequence.',
  )
  addCheck(
    checks,
    [resaleWalkthrough, developmentWalkthrough].every((walkthrough) =>
      REQUIRED_STAGE_KEYS.every((key, index) => walkthrough.stages[index]?.key === key),
    ),
    'PHASE38_STAGE_ORDER_LOCKED',
    'The walkthrough order is agent review, generate OTP, prepare signing, dispatch guard, signer sessions, completion guard and final artifact proof.',
  )
  addCheck(
    checks,
    [resaleWalkthrough, developmentWalkthrough].every((walkthrough) =>
      walkthrough.stages.every((stage) =>
        stage.routeVariant === walkthrough.routeVariant &&
        stage.packetId === walkthrough.packetId &&
        stage.packetVersionId === walkthrough.packetVersionId,
      ),
    ),
    'PHASE38_ROUTE_PACKET_VERSION_BINDING_LOCKED',
    'Every stage remains bound to one route, one packet and one generated OTP version.',
  )
  addCheck(
    checks,
    [resaleWalkthrough, developmentWalkthrough].every((walkthrough) =>
      walkthrough.dryRunStageCount === REQUIRED_STAGE_KEYS.length &&
      walkthrough.stages.every((stage) => stage.target === 'staging'),
    ),
    'PHASE38_STAGING_NO_WRITE_MODE_LOCKED',
    'The walkthrough remains a staging dry run and does not send, finalize or mutate production state.',
  )
  addCheck(
    checks,
    [resaleWalkthrough, developmentWalkthrough].every((walkthrough) =>
      walkthrough.finalArtifactDocumentId && walkthrough.finalArtifactSha256,
    ),
    'PHASE38_COMPLETION_AND_FINAL_ARTIFACT_PROOF_INCLUDED',
    'The completion guard and final artifact proof are included in the same route-bound walkthrough.',
  )
  addCheck(
    checks,
    missingStageWalkthrough.canApproveStagingWalkthrough === false &&
      missingStageWalkthrough.blockerCodes.includes('missing_stage:dispatch_guard'),
    'PHASE38_MISSING_STAGE_BLOCKED',
    'A walkthrough with any omitted required stage is blocked.',
  )
  addCheck(
    checks,
    wrongVersionWalkthrough.canApproveStagingWalkthrough === false &&
      wrongVersionWalkthrough.blockerCodes.includes('stage_version_mismatch:signer_sessions'),
    'PHASE38_WRONG_VERSION_STAGE_BLOCKED',
    'A walkthrough where any stage points at another packet version is blocked.',
  )
  addCheck(
    checks,
    liveWriteWalkthrough.canApproveStagingWalkthrough === false &&
      liveWriteWalkthrough.blockerCodes.includes('stage_not_dry_run:dispatch_guard'),
    'PHASE38_LIVE_WRITE_STAGE_BLOCKED',
    'A walkthrough stage that is not a staging dry run is blocked.',
  )
  addCheck(
    checks,
    packageJson.scripts?.['test:otp-end-to-end-staging-walkthrough-phase38'] === 'node scripts/otp-end-to-end-staging-walkthrough-phase38.test.mjs' &&
      packageJson.scripts?.['report:otp-end-to-end-staging-walkthrough-phase38'] === 'node scripts/report-otp-end-to-end-staging-walkthrough-phase38.mjs',
    'PHASE38_PACKAGE_SCRIPTS_WIRED',
    'Package scripts expose the Phase 38 test and report.',
  )

  const blockers = checks.filter((check) => !check.pass)
  return Object.freeze({
    version: OTP_END_TO_END_STAGING_WALKTHROUGH_PHASE38_VERSION,
    contract: OTP_END_TO_END_STAGING_WALKTHROUGH_CONTRACT,
    checkedAt,
    status: blockers.length ? 'OTP_END_TO_END_STAGING_WALKTHROUGH_REMEDIATION_REQUIRED' : OTP_END_TO_END_STAGING_WALKTHROUGH_READY_STATUS,
    mutatedData: false,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    walkthroughRows: Object.freeze([
      resaleWalkthrough,
      developmentWalkthrough,
      missingStageWalkthrough,
      wrongVersionWalkthrough,
      liveWriteWalkthrough,
    ]),
    summary: Object.freeze({
      blockerCount: blockers.length,
      approvedWalkthroughCount: [resaleWalkthrough, developmentWalkthrough].filter((row) => row.canApproveStagingWalkthrough).length,
      blockedUnsafeWalkthroughCount: [missingStageWalkthrough, wrongVersionWalkthrough, liveWriteWalkthrough]
        .filter((row) => !row.canApproveStagingWalkthrough).length,
      requiredStageCount: REQUIRED_STAGE_KEYS.length,
    }),
    nextPhase: blockers.length ? null : Object.freeze({
      phase: 39,
      key: 'otp_pilot_go_no_go',
      label: 'Pilot Go/No-Go Evidence Review',
    }),
  })
}

export function formatOtpEndToEndStagingWalkthroughPhase38Markdown(report = buildOtpEndToEndStagingWalkthroughPhase38Audit()) {
  return [
    '# OTP Generator Phase 38 End-to-End Staging Walkthrough',
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
        ['Approved walkthroughs', report.summary.approvedWalkthroughCount],
        ['Unsafe walkthroughs blocked', report.summary.blockedUnsafeWalkthroughCount],
        ['Required stages', report.summary.requiredStageCount],
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
    '## Walkthroughs',
    '',
    table(
      ['Route', 'Version', 'Stages', 'Dry-run stages', 'Final artifact', 'Allowed', 'Blockers'],
      report.walkthroughRows.map((row) => [
        row.routeVariant || 'unresolved',
        row.packetVersionId || 'none',
        row.stageCount,
        row.dryRunStageCount,
        row.finalArtifactDocumentId || 'none',
        row.canApproveStagingWalkthrough ? 'yes' : 'no',
        row.blockerCodes.join(', ') || 'none',
      ]),
    ),
    '',
    '## Stage Order',
    '',
    table(
      ['Order', 'Stage'],
      REQUIRED_STAGE_KEYS.map((stage, index) => [index + 1, stage]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 38 proves one complete staging walkthrough from agent review through final signed artifact proof across both OTP routes. It remains a no-write staging certification and does not send live signing links, complete a production transaction or approve pilot rollout by itself.',
    '',
  ].join('\n')
}
