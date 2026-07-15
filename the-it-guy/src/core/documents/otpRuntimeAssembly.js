import { classifyOtpBaselineSection } from './otpLegalBaseline.js'
import { resolveSectionClausePackKeys } from './legalClausePackCoverage.js'
import { evaluateVisibilityRules } from './sectionVisibilityRules.js'

export const OTP_RUNTIME_ASSEMBLY_VERSION = 'otp_runtime_assembly_v1'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getTemplateMetadata(template = {}) {
  return asRecord(template.metadata_json || template.metadataJson)
}

function getSections(template = {}, sections = null) {
  if (Array.isArray(sections)) return sections
  if (Array.isArray(template.sections)) return template.sections
  return []
}

function getSectionKey(section = {}, index = 0) {
  return normalizeKey(section.section_key || section.sectionKey || `section_${index + 1}`)
}

function getSectionLabel(section = {}, index = 0) {
  return normalizeText(section.section_label || section.sectionLabel) || getSectionKey(section, index).replace(/_/g, ' ')
}

function isVisible(section = {}, placeholders = {}) {
  const metadata = asRecord(section.metadata_json || section.metadataJson)
  const condition = section.condition_json || section.conditionJson || metadata.visibility_rules || null
  return evaluateVisibilityRules(condition, placeholders)
}

function getContractVersion(template = {}) {
  const metadata = getTemplateMetadata(template)
  return normalizeText(template.otp_runtime_assembly_version || metadata.otp_runtime_assembly_version)
}

function blocker(code, packKey, message, details = {}) {
  return { code, packKey: packKey || null, message, ...details }
}

export function buildOtpRuntimeAssembly({
  template = {},
  sections = null,
  placeholders = {},
  resolution = null,
  coverage = null,
} = {}) {
  const contractVersion = getContractVersion(template)
  const runtimeEnforced = Boolean(contractVersion)
  const supportedContract = !contractVersion || contractVersion === OTP_RUNTIME_ASSEMBLY_VERSION
  const expectedPackKeys = [...new Set((resolution?.activePackKeys || [])
    .map(normalizeKey)
    .filter((key) => key && key !== 'residential_resale_core_pack'))]
  const expectedSet = new Set(expectedPackKeys)
  const sectionRows = getSections(template, sections).map((section, index) => ({
    section,
    index,
    key: getSectionKey(section, index),
    label: getSectionLabel(section, index),
    classification: classifyOtpBaselineSection(section),
    packKeys: resolveSectionClausePackKeys(section),
    visible: isVisible(section, placeholders),
  }))
  const packRows = sectionRows.filter((row) => row.packKeys.length > 0)
  const visiblePackRows = packRows.filter((row) => row.visible)
  const selectedPackKeys = [...new Set(visiblePackRows.flatMap((row) => row.packKeys))]
  const selectedSet = new Set(selectedPackKeys)
  const missingPackKeys = expectedPackKeys.filter((key) => !selectedSet.has(key))
  const unexpectedPackKeys = selectedPackKeys.filter((key) => !expectedSet.has(key))
  const duplicatePackKeys = expectedPackKeys.filter((key) => (
    visiblePackRows.filter((row) => row.packKeys.includes(key)).length > 1
  ))
  const coverageByKey = new Map((coverage?.items || []).map((item) => [normalizeKey(item.key), item]))
  const unapprovedPackKeys = expectedPackKeys.filter((key) => {
    const item = coverageByKey.get(key)
    return !item || !item.covered
  })
  const coreCount = sectionRows.filter((row) => row.visible && row.classification === 'core_wording').length
  const signingCount = sectionRows.filter((row) => row.visible && row.classification === 'signing').length
  const blockers = [
    ...missingPackKeys.map((key) => blocker('required_pack_not_rendered', key, `${key.replace(/_/g, ' ')} is required by the onboarding facts but is not rendered.`)),
    ...unexpectedPackKeys.map((key) => blocker('unexpected_pack_rendered', key, `${key.replace(/_/g, ' ')} is rendered even though the onboarding facts did not activate it.`)),
    ...duplicatePackKeys.map((key) => blocker('duplicate_pack_rendered', key, `${key.replace(/_/g, ' ')} is rendered more than once.`)),
    ...unapprovedPackKeys.map((key) => blocker('pack_not_approved', key, `${key.replace(/_/g, ' ')} does not have approved and locked wording.`)),
    ...(supportedContract ? [] : [blocker('unsupported_runtime_contract', null, `Runtime assembly contract ${contractVersion} is not supported by this application build.`)]),
    ...(resolution?.draftAssemblyAllowed === false
      ? [blocker('deal_facts_not_assemblable', null, 'The captured deal facts do not support automated OTP assembly.')]
      : []),
    ...((resolution?.conflicts || []).map((item) => blocker('deal_fact_conflict', null, item.message, { conflictCode: item.code }))),
    ...(coreCount ? [] : [blocker('standard_core_not_rendered', null, 'No standard OTP legal core is rendered.')]),
    ...(signingCount ? [] : [blocker('signing_not_rendered', null, 'No OTP signing section is rendered.')]),
  ]
  const decisions = (resolution?.decisions || [])
    .filter((decision) => normalizeKey(decision.key) !== 'residential_resale_core_pack')
    .map((decision) => {
      const key = normalizeKey(decision.key)
      const expected = expectedSet.has(key)
      const rendered = selectedSet.has(key)
      return {
        key,
        label: decision.label || key.replace(/_/g, ' '),
        expected,
        rendered,
        matches: expected === rendered,
        reason: decision.reason || '',
        status: expected ? (rendered ? 'included' : 'missing') : (rendered ? 'unexpected' : 'excluded'),
      }
    })
  const canAssemble = blockers.length === 0
  return {
    schemaVersion: OTP_RUNTIME_ASSEMBLY_VERSION,
    contractVersion: contractVersion || null,
    runtimeEnforced,
    rolloutCompatible: !runtimeEnforced,
    templateId: template.id || null,
    selectionKey: resolution?.selectionKey || null,
    expectedPackKeys,
    selectedPackKeys,
    missingPackKeys,
    unexpectedPackKeys,
    duplicatePackKeys,
    unapprovedPackKeys,
    coreCount,
    signingCount,
    decisions,
    blockers,
    canAssemble,
    canReleaseForSigning: canAssemble && Boolean(resolution?.signingReady),
  }
}

export function buildOtpRuntimeAssemblyIssues(assembly = {}, { runtime = false } = {}) {
  return (assembly.blockers || []).map((item) => ({
    source: 'otp_runtime_assembly',
    sectionKey: item.packKey || 'otp_runtime_assembly',
    sectionLabel: 'OTP assembly',
    placeholderKey: item.packKey || item.code,
    placeholderLabel: item.packKey ? item.packKey.replace(/_/g, ' ') : 'OTP assembly',
    message: `${item.message}${runtime ? ' Generation is blocked until the template and onboarding route agree.' : ''}`,
    required: true,
    assemblyCode: item.code,
    packKey: item.packKey,
  }))
}
