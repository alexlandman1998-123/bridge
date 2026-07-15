import { buildLegalClausePackCoverage, listPublishableLegalClausePackKeys } from './legalClausePackCoverage.js'
import { resolveOtpReferenceMatrixGovernance } from './otpReferenceMatrixGovernance.js'
import { resolveLegalTemplateGovernance } from './legalTemplateGovernance.js'
import { buildOtpAttorneyReadiness } from './otpAttorneyReadiness.js'
import { OTP_RUNTIME_ASSEMBLY_VERSION } from './otpRuntimeAssembly.js'

export const OTP_LAUNCH_READINESS_VERSION = 'otp_launch_readiness_v1'
export const OTP_ROLLOUT_VERSION = 'otp_governed_rollout_v1'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getMetadata(template = {}) {
  return asRecord(template.metadata_json || template.metadataJson)
}

function isLive(template = {}) {
  const metadata = getMetadata(template)
  const status = normalizeText(template.status || template.template_status || metadata.lifecycle_status).toLowerCase()
  return template.is_active !== false && (Boolean(template.is_default) || ['active', 'published', 'live'].includes(status))
}

function uniqueMessages(values = []) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

export function buildOtpLaunchReadiness({ candidateTemplate = null, liveTemplate = null } = {}) {
  if (!candidateTemplate) {
    return {
      schemaVersion: OTP_LAUNCH_READINESS_VERSION,
      status: 'missing',
      candidateTemplateId: null,
      liveTemplateId: liveTemplate?.id || null,
      canActivate: false,
      canGenerateLive: false,
      steps: [],
      blockers: ['Create an OTP review draft before preparing a governed rollout.'],
      rollback: null,
    }
  }

  const sections = Array.isArray(candidateTemplate.sections) ? candidateTemplate.sections : []
  const metadata = getMetadata(candidateTemplate)
  const attorneyReadiness = buildOtpAttorneyReadiness({ template: candidateTemplate, sections })
  const coverage = buildLegalClausePackCoverage({
    template: candidateTemplate,
    sections,
    requiredPackKeys: listPublishableLegalClausePackKeys(),
    allowLegacy: false,
    requireApproval: true,
  })
  const matrix = resolveOtpReferenceMatrixGovernance(candidateTemplate)
  const governance = resolveLegalTemplateGovernance(candidateTemplate, { allowLegacy: false })
  const runtimeContractVersion = normalizeText(metadata.otp_runtime_assembly_version || candidateTemplate.otp_runtime_assembly_version)
  const runtimeReady = runtimeContractVersion === OTP_RUNTIME_ASSEMBLY_VERSION
  const structureReady = attorneyReadiness.summary.coreCount > 0 && attorneyReadiness.signingCount > 0
  const wordingReady = attorneyReadiness.summary.wordingReady && coverage.missingWording.length === 0
  const legalApprovalReady = attorneyReadiness.canPublish && coverage.canPublish
  const certificationReady = matrix.passed && matrix.matchesTemplate
  const contentReady = structureReady && wordingReady && legalApprovalReady && runtimeReady && certificationReady
  const candidateIsLive = isLive(candidateTemplate)
  const canGenerateLive = contentReady && candidateIsLive && governance.selectableForSigning
  const canActivate = contentReady && !candidateIsLive
  const legacyLive = liveTemplate && !normalizeText(getMetadata(liveTemplate).otp_runtime_assembly_version)
  const rollout = asRecord(metadata.otp_rollout || metadata.otpRollout)

  const steps = [
    {
      key: 'structure',
      label: 'Document structure',
      passed: structureReady,
      detail: structureReady
        ? `${attorneyReadiness.summary.coreCount} standard core section${attorneyReadiness.summary.coreCount === 1 ? '' : 's'} and signing are present.`
        : 'Add an identifiable standard legal core and signing section.',
    },
    {
      key: 'wording',
      label: 'Clause wording',
      passed: wordingReady,
      detail: `${attorneyReadiness.summary.clauseWordingCount}/${attorneyReadiness.summary.requiredClauseCount} conditional packs have wording.`,
    },
    {
      key: 'approval',
      label: 'Legal approval',
      passed: legalApprovalReady,
      detail: legalApprovalReady
        ? `${attorneyReadiness.summary.approvedReviewItems}/${attorneyReadiness.summary.totalReviewItems} legal review items are approved and locked.`
        : `${attorneyReadiness.summary.pendingReviewItems} legal review item${attorneyReadiness.summary.pendingReviewItems === 1 ? '' : 's'} remain.`,
    },
    {
      key: 'runtime',
      label: 'Runtime enforcement',
      passed: runtimeReady,
      detail: runtimeReady ? 'Phase 4 runtime enforcement is configured.' : 'Save the template with the supported Phase 4 runtime contract.',
    },
    {
      key: 'certification',
      label: 'Reference certification',
      passed: certificationReady,
      detail: certificationReady
        ? `${matrix.passedCount}/${matrix.scenarioCount} reference transactions are certified for the current wording.`
        : matrix.blockingReasons.includes('matrix_result_stale')
          ? 'The saved certification belongs to older wording.'
          : 'Run, pass and save the Phase 5 reference transaction matrix.',
    },
    {
      key: 'activation',
      label: 'Live activation',
      passed: canGenerateLive,
      detail: canGenerateLive
        ? 'This governed OTP is live and selectable for signing.'
        : canActivate
          ? 'Ready for an authorised publisher to activate.'
          : candidateIsLive
            ? `Live template is blocked: ${(governance.blockingReasons || []).join(', ').replaceAll('_', ' ') || 'governance checks incomplete'}.`
            : 'Complete the preceding stages before activation.',
    },
  ]
  const blockers = uniqueMessages([
    ...(!structureReady ? ['Document structure is incomplete.'] : []),
    ...(!wordingReady ? [`${coverage.missingWording.length} conditional pack${coverage.missingWording.length === 1 ? '' : 's'} lack wording.`] : []),
    ...(!legalApprovalReady ? [`${attorneyReadiness.summary.pendingReviewItems} legal review item${attorneyReadiness.summary.pendingReviewItems === 1 ? '' : 's'} require approval.`] : []),
    ...(!runtimeReady ? ['The supported runtime assembly contract has not been adopted.'] : []),
    ...(!certificationReady ? ['The reference transaction certification is missing, failing or stale.'] : []),
    ...(candidateIsLive && !governance.selectableForSigning
      ? [`Live template governance is blocked: ${governance.blockingReasons.join(', ').replaceAll('_', ' ')}.`]
      : []),
  ])
  const status = canGenerateLive
    ? 'live_governed'
    : canActivate
      ? 'ready_for_activation'
      : candidateIsLive && legacyLive
        ? 'live_legacy'
        : candidateIsLive
          ? 'live_blocked'
          : 'preparing_candidate'

  return {
    schemaVersion: OTP_LAUNCH_READINESS_VERSION,
    rolloutVersion: OTP_ROLLOUT_VERSION,
    status,
    candidateTemplateId: candidateTemplate.id || null,
    candidateTemplateLabel: candidateTemplate.template_label || candidateTemplate.templateLabel || null,
    liveTemplateId: liveTemplate?.id || null,
    liveTemplateLabel: liveTemplate?.template_label || liveTemplate?.templateLabel || null,
    candidateIsLive,
    legacyLive: Boolean(legacyLive),
    contentReady,
    canActivate,
    canGenerateLive,
    steps,
    blockers,
    attorneyReadiness,
    coverage,
    matrix,
    governance,
    runtimeContractVersion: runtimeContractVersion || null,
    rollback: rollout.previousTemplateId || rollout.previous_template_id
      ? {
          templateId: rollout.previousTemplateId || rollout.previous_template_id,
          templateLabel: rollout.previousTemplateLabel || rollout.previous_template_label || null,
          activatedAt: rollout.activatedAt || rollout.activated_at || null,
        }
      : null,
  }
}
