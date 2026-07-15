import {
  buildLegalClausePackCoverage,
  listPublishableLegalClausePackKeys,
  resolveSectionClauseApproval,
} from './legalClausePackCoverage.js'
import { classifyOtpBaselineSection } from './otpLegalBaseline.js'

export const OTP_ATTORNEY_READINESS_VERSION = 'otp_attorney_readiness_v1'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function getSectionKey(section = {}, index = 0) {
  return normalizeText(section.sectionKey || section.section_key || `section_${index + 1}`)
}

function getSectionLabel(section = {}, index = 0) {
  return normalizeText(section.sectionLabel || section.section_label) || getSectionKey(section, index).replace(/_/g, ' ')
}

function hasWording(section = {}) {
  return Boolean(normalizeText(section.legalText || section.legal_text))
}

export function buildOtpAttorneyReadiness({ template = {}, sections = null } = {}) {
  const rows = Array.isArray(sections) ? sections : Array.isArray(template.sections) ? template.sections : []
  const standardReviewItems = rows
    .map((section, index) => ({ section, index, classification: classifyOtpBaselineSection(section) }))
    .filter((entry) => ['core_wording', 'transaction_data'].includes(entry.classification))
    .map(({ section, index, classification }) => {
      const approval = resolveSectionClauseApproval(section, { legacyCompatible: false })
      const wordingPresent = hasWording(section)
      return {
        key: getSectionKey(section, index),
        label: getSectionLabel(section, index),
        category: classification === 'core_wording' ? 'Standard legal wording' : 'Transaction schedule',
        wordingPresent,
        approval,
        status: !wordingPresent ? 'missing_wording' : approval.approved ? 'approved' : approval.status === 'attorney_review' ? 'attorney_review' : 'approval_required',
      }
    })
  const clauseCoverage = buildLegalClausePackCoverage({
    template: { ...template, sections: rows },
    sections: rows,
    requiredPackKeys: listPublishableLegalClausePackKeys(),
    allowLegacy: false,
    requireApproval: true,
  })
  const signingCount = rows.filter((section) => classifyOtpBaselineSection(section) === 'signing').length
  const coreCount = standardReviewItems.filter((item) => item.category === 'Standard legal wording').length
  const standardMissingWording = standardReviewItems.filter((item) => !item.wordingPresent)
  const standardApprovalRequired = standardReviewItems.filter((item) => item.wordingPresent && !item.approval.approved)
  const blockers = [
    ...standardMissingWording.map((item) => ({ code: 'standard_wording_missing', key: item.key, message: `${item.label} has no wording.` })),
    ...standardApprovalRequired.map((item) => ({ code: 'standard_approval_required', key: item.key, message: `${item.label} requires attorney approval.` })),
    ...clauseCoverage.blockingItems.map((item) => ({ code: item.status, key: item.key, message: `${item.label} ${item.status === 'missing_wording' ? 'has no linked wording' : 'requires attorney approval'}.` })),
    ...(coreCount ? [] : [{ code: 'standard_core_missing', key: 'standard_core', message: 'No standard OTP legal core is configured.' }]),
    ...(signingCount ? [] : [{ code: 'signing_missing', key: 'signing', message: 'No signing section is configured.' }]),
  ]
  const totalReviewItems = standardReviewItems.length + clauseCoverage.requiredCount
  const approvedReviewItems = standardReviewItems.filter((item) => item.approval.approved).length + clauseCoverage.coveredCount
  const wordingReady = coreCount > 0 && standardMissingWording.length === 0 && clauseCoverage.missingWording.length === 0 && signingCount > 0
  return {
    schemaVersion: OTP_ATTORNEY_READINESS_VERSION,
    templateId: template.id || null,
    standardReviewItems,
    clauseCoverage,
    signingCount,
    blockers,
    summary: {
      totalReviewItems,
      approvedReviewItems,
      pendingReviewItems: Math.max(0, totalReviewItems - approvedReviewItems),
      coreCount,
      clauseWordingCount: clauseCoverage.requiredCount - clauseCoverage.missingWording.length,
      requiredClauseCount: clauseCoverage.requiredCount,
      wordingReady,
      approvalPercent: totalReviewItems ? Math.round((approvedReviewItems / totalReviewItems) * 100) : 0,
    },
    canSubmitForAttorneyReview: wordingReady,
    canPublish: wordingReady && blockers.length === 0,
  }
}
