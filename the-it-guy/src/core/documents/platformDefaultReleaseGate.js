import { assessLegalTemplateApproval } from './legalTemplateApproval.js'
import { assessNativeStarterTemplate } from './nativeStarterTemplateAssurance.js'
import { assessPlatformDefaultScenarioLogic } from './platformDefaultScenarioLogic.js'

export const PLATFORM_DEFAULT_RELEASE_GATE_CONTRACT = 'legal-template-platform-default-release-gate-v1'

export const PLATFORM_DEFAULT_TEMPLATE_KEYS = Object.freeze({
  mandate: 'mandate_default_v1',
  otp: 'otp_default_v1',
})

export const PLATFORM_DEFAULT_RELEASE_GATE_BLOCKER_CODES = Object.freeze({
  mandateDefaultCardinality: 'P7_GLOBAL_MANDATE_DEFAULT_CARDINALITY',
  otpDefaultCardinality: 'P7_GLOBAL_OTP_DEFAULT_CARDINALITY',
  scenarioLogicInvalid: 'P7_SCENARIO_LOGIC_INVALID',
})

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function isPlatformOwned(template = {}) {
  return !text(template.organisation_id || template.organisationId)
}

function isLiveDefault(template = {}) {
  return lower(template.status) === 'published' && template.is_active === true && template.is_default === true
}

function code(packetType, suffix) {
  return `P7_GLOBAL_${text(packetType).toUpperCase()}_${suffix}`
}

function blocker(blockers, codeValue, detail, evidence = {}) {
  blockers.push({ code: codeValue, detail, ...evidence })
}

function warning(warnings, codeValue, detail, evidence = {}) {
  warnings.push({ code: codeValue, detail, ...evidence })
}

export function hydratePlatformTemplates(templates = [], sections = []) {
  const sectionsByTemplateId = new Map()
  for (const section of Array.isArray(sections) ? sections : []) {
    const templateId = text(section?.template_id || section?.templateId)
    if (!templateId) continue
    const rows = sectionsByTemplateId.get(templateId) || []
    rows.push(section)
    sectionsByTemplateId.set(templateId, rows)
  }

  return (Array.isArray(templates) ? templates : []).map((template) => ({
    ...template,
    sections: Array.isArray(template?.sections) ? template.sections : sectionsByTemplateId.get(text(template?.id)) || [],
  }))
}

function assessTemplate(packetType, candidates = []) {
  const blockers = []
  const warnings = []
  const expectedKey = PLATFORM_DEFAULT_TEMPLATE_KEYS[packetType]
  const matching = candidates.filter((template) => (
    isPlatformOwned(template) &&
    lower(template.packet_type || template.packetType) === packetType &&
    lower(template.template_key || template.templateKey) === expectedKey
  ))
  const live = matching.filter(isLiveDefault)

  if (live.length !== 1) {
    blocker(
      blockers,
      code(packetType, 'DEFAULT_CARDINALITY'),
      `Expected one active/default global ${packetType} template, found ${live.length}.`,
      { found: live.length },
    )
  }

  const template = live[0] || matching[0] || null
  if (!template) {
    return {
      packetType,
      expectedKey,
      templateId: null,
      ready: false,
      blockers,
      warnings,
      evidence: { matchingCount: matching.length, liveDefaultCount: live.length },
    }
  }

  const metadata = record(template.metadata_json || template.metadataJson)
  const format = lower(template.template_format || template.templateFormat)
  const moduleType = lower(template.module_type || template.moduleType)
  const renderMode = text(metadata.render_mode || metadata.renderMode)

  if (moduleType !== 'agency') {
    blocker(blockers, code(packetType, 'MODULE_INVALID'), `Expected agency module, found ${moduleType || 'missing'}.`)
  }
  if (!['structured', 'json'].includes(format)) {
    blocker(blockers, code(packetType, 'FORMAT_INVALID'), `Expected structured/json format, found ${format || 'missing'}.`)
  }
  if (renderMode !== 'native_structured') {
    blocker(blockers, code(packetType, 'RENDER_MODE_INVALID'), 'Platform default must use native_structured render mode.')
  }
  if (template.is_default !== true) {
    blocker(blockers, code(packetType, 'NOT_DEFAULT'), 'Platform default must be marked is_default.')
  }
  if (template.is_active !== true) {
    blocker(blockers, code(packetType, 'NOT_ACTIVE'), 'Platform default must be active.')
  }
  if (!isPlatformOwned(template)) {
    blocker(blockers, code(packetType, 'NOT_PLATFORM_OWNED'), 'Platform default must not be organisation-owned.')
  }
  if (metadata.platform_default_can_route_without_org_template !== true) {
    warning(
      warnings,
      code(packetType, 'PLATFORM_DEFAULT_MARKER_MISSING'),
      'Template is otherwise assessable, but the explicit route-without-organisation marker is missing.',
    )
  }

  const starterAssessment = assessNativeStarterTemplate(template)
  if (!starterAssessment.ready) {
    blocker(
      blockers,
      code(packetType, 'NATIVE_STARTER_INVALID'),
      starterAssessment.blockers.join('; '),
      { nativeStarterBlockers: starterAssessment.blockers },
    )
  }

  const approvalAssessment = assessLegalTemplateApproval(template, { expectedPacketType: packetType })
  if (!approvalAssessment.approved) {
    blocker(
      blockers,
      code(packetType, 'NOT_RUNTIME_RELEASED'),
      approvalAssessment.reasons.join(', '),
      { approvalReasons: approvalAssessment.reasons },
    )
  }

  return {
    packetType,
    expectedKey,
    templateId: text(template.id) || null,
    templateKey: text(template.template_key || template.templateKey),
    ready: blockers.length === 0,
    blockers,
    warnings,
    evidence: {
      matchingCount: matching.length,
      liveDefaultCount: live.length,
      sectionCount: Array.isArray(template.sections) ? template.sections.length : 0,
      status: text(template.status),
      active: template.is_active === true,
      default: template.is_default === true,
      moduleType,
      format,
      renderMode,
      legalApproval: approvalAssessment,
      nativeStarter: {
        ready: starterAssessment.ready,
        blockers: starterAssessment.blockers,
      },
    },
  }
}

export function assessPlatformDefaultReleaseGate({
  templates = [],
  sections = [],
  includeScenarioLogic = true,
} = {}) {
  const hydrated = hydratePlatformTemplates(templates, sections)
  const mandate = assessTemplate('mandate', hydrated)
  const otp = assessTemplate('otp', hydrated)
  const blockers = [...mandate.blockers, ...otp.blockers]
  const warnings = [...mandate.warnings, ...otp.warnings]
  const scenarioLogic = includeScenarioLogic ? assessPlatformDefaultScenarioLogic() : null

  if (scenarioLogic && !scenarioLogic.ready) {
    blocker(
      blockers,
      'P7_SCENARIO_LOGIC_INVALID',
      `Scenario logic failed ${scenarioLogic.blockers.length} checks.`,
      { scenarioBlockers: scenarioLogic.blockers },
    )
  }

  return {
    phase: 7,
    contract: PLATFORM_DEFAULT_RELEASE_GATE_CONTRACT,
    status: blockers.length ? 'NO_GO' : 'GO',
    ready: blockers.length === 0,
    mutatedData: false,
    blockerCount: blockers.length,
    warningCount: warnings.length,
    blockers,
    warnings,
    evidence: {
      templates: {
        mandate,
        otp,
      },
      scenarioLogic: scenarioLogic
        ? {
            contract: scenarioLogic.contract,
            ready: scenarioLogic.ready,
            scenarioCount: scenarioLogic.scenarioCount,
            blockerCount: scenarioLogic.blockers.length,
          }
        : { skipped: true },
      customisationContract: {
        platformDefaultsImmutable: true,
        organisationDraftRequiredForEdits: true,
        phase: 5,
      },
      readinessContract: {
        approvedPlatformDefaultCountsAsReady: true,
        draftOrganisationOverrideIsWarning: true,
        missingRuntimeReleasedTemplateIsBlocked: true,
        phase: 4,
      },
    },
    checkedAt: new Date().toISOString(),
  }
}
