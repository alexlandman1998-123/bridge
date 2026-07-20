import {
  assessConditionalMasterTemplate,
  getConditionalMasterPackDefinitions,
  getConditionalMasterTemplateDefinition,
} from './conditionalMasterTemplateDefinitions.js'
import { evaluateConditionalMasterSections } from './conditionalMasterEngine.js'
import { evaluateConditionalSigningPlan } from './conditionalSigningEngine.js'
import {
  buildLegalDocumentScenarioPlaceholders,
  resolveCanonicalLegalDocumentScenario,
} from './legalDocumentScenarioProfile.js'

export const CONDITIONAL_MASTER_COVERAGE_VERSION = 'conditional-master-coverage-v1'

const PARTY_CASES = Object.freeze([
  Object.freeze({ entityType: 'individual', maritalRegime: 'single', key: 'individual_single' }),
  Object.freeze({ entityType: 'individual', maritalRegime: 'out_of_community', key: 'individual_out_of_community' }),
  Object.freeze({ entityType: 'individual', maritalRegime: 'in_community', key: 'individual_in_community' }),
  Object.freeze({ entityType: 'company', maritalRegime: '', key: 'company' }),
  Object.freeze({ entityType: 'close_corporation', maritalRegime: '', key: 'close_corporation' }),
  Object.freeze({ entityType: 'trust', maritalRegime: '', key: 'trust' }),
])

const PROPERTY_CASES = Object.freeze(['full_title', 'sectional_title'])
const FINANCE_CASES = Object.freeze(['cash', 'bond', 'combination'])

function text(value) {
  return String(value ?? '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[\s./-]+/g, '_')
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((itemKey) => `${JSON.stringify(itemKey)}:${stableSerialize(value[itemKey])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

function decisionHash(value) {
  let hash = 2166136261
  const input = stableSerialize(value)
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function getMetadata(value = {}) {
  if (value.metadata_json && typeof value.metadata_json === 'object') return value.metadata_json
  if (value.metadataJson && typeof value.metadataJson === 'object') return value.metadataJson
  if (value.metadata && typeof value.metadata === 'object') return value.metadata
  return {}
}

function getSections(template = {}) {
  return Array.isArray(template.sections) ? template.sections : []
}

function getSectionKey(section = {}) {
  return key(section.sectionKey || section.section_key || section.key)
}

function getSectionText(section = {}) {
  return text(section.legalText || section.legal_text || section.content || section.body)
}

function getSignerRoleDefinitions(template = {}, fallback = null) {
  const metadata = getMetadata(template)
  if (Array.isArray(template.defaultSignerRoles)) return template.defaultSignerRoles
  if (Array.isArray(template.default_signer_roles)) return template.default_signer_roles
  if (Array.isArray(metadata.defaultSignerRoles)) return metadata.defaultSignerRoles
  if (Array.isArray(metadata.default_signer_roles)) return metadata.default_signer_roles
  return fallback
}

function coverageIssue(code, message, details = {}) {
  return {
    code,
    source: 'conditional_master_coverage',
    sectionKey: key(details.sectionKey || 'conditional_master'),
    sectionLabel: text(details.sectionLabel || 'Conditional master coverage'),
    message,
    required: true,
    details,
  }
}

function uniqueIssues(issues = []) {
  const seen = new Set()
  return issues.filter((item) => {
    const identity = [item.code, item.sectionKey, item.message].join('|')
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

function signerFacts(profile = {}) {
  return {
    seller_full_name: 'Coverage Seller',
    seller_email: 'seller@coverage.example',
    seller_representative_name: 'Coverage Seller Representative',
    seller_representative_email: 'seller-representative@coverage.example',
    seller_spouse_full_name: 'Coverage Seller Spouse',
    seller_spouse_email: 'seller-spouse@coverage.example',
    buyer_full_name: 'Coverage Buyer',
    buyer_email: 'buyer@coverage.example',
    buyer_representative_name: 'Coverage Buyer Representative',
    buyer_representative_email: 'buyer-representative@coverage.example',
    buyer_spouse_full_name: 'Coverage Buyer Spouse',
    buyer_spouse_email: 'buyer-spouse@coverage.example',
    agent_full_name: 'Coverage Estate Agent',
    agent_email: 'agent@coverage.example',
    legal_document_scenario: profile.scenarioKey,
  }
}

export function listConditionalMasterCoverageCases(packetType = '') {
  const normalized = key(packetType) === 'otp' ? 'otp' : 'mandate'
  const cases = []
  for (const seller of PARTY_CASES) {
    for (const propertyTitleType of PROPERTY_CASES) {
      if (normalized === 'mandate') {
        cases.push({
          key: `seller_${seller.key}__${propertyTitleType}`,
          packetType: normalized,
          seller,
          buyer: null,
          propertyTitleType,
          financeType: '',
        })
        continue
      }
      for (const buyer of PARTY_CASES) {
        for (const financeType of FINANCE_CASES) {
          cases.push({
            key: `seller_${seller.key}__buyer_${buyer.key}__${propertyTitleType}__${financeType}`,
            packetType: normalized,
            seller,
            buyer,
            propertyTitleType,
            financeType,
          })
        }
      }
    }
  }
  return cases
}

function resolveCoverageScenario(testCase = {}) {
  return resolveCanonicalLegalDocumentScenario({
    packetType: testCase.packetType,
    seller: {
      entityType: testCase.seller.entityType,
      maritalRegime: testCase.seller.maritalRegime,
    },
    buyer: testCase.buyer
      ? {
          entityType: testCase.buyer.entityType,
          maritalRegime: testCase.buyer.maritalRegime,
        }
      : null,
    property: { titleType: testCase.propertyTitleType },
    transaction: testCase.financeType ? { financeType: testCase.financeType } : null,
  })
}

export function evaluateConditionalMasterCoverage({
  packetType = '',
  template = null,
  sections = null,
  signerRoleDefinitions = null,
  requireSignerRoleDefinitions = true,
  includeCases = false,
} = {}) {
  const normalizedPacketType = key(packetType || template?.packet_type || template?.packetType)
  const definition = getConditionalMasterTemplateDefinition(normalizedPacketType)
  if (!definition) {
    return {
      applies: false,
      coverageVersion: CONDITIONAL_MASTER_COVERAGE_VERSION,
      packetType: normalizedPacketType,
      ready: true,
      canProceed: true,
      issues: [],
      cases: [],
    }
  }

  const sourceTemplate = template && typeof template === 'object' ? template : {}
  const sourceSections = Array.isArray(sections) ? sections : getSections(sourceTemplate)
  const resolvedSignerRoles = getSignerRoleDefinitions(sourceTemplate, signerRoleDefinitions)
  const structuralAssessment = assessConditionalMasterTemplate(normalizedPacketType, sourceSections)
  const issues = []

  if (!structuralAssessment.valid) {
    issues.push(coverageIssue(
      'CONDITIONAL_COVERAGE_MASTER_STRUCTURE_INVALID',
      'The conditional master is missing protected packs, has duplicates or unlocked rules, or does not contain exactly one signature section.',
      structuralAssessment,
    ))
  }
  if (requireSignerRoleDefinitions && (!Array.isArray(resolvedSignerRoles) || !resolvedSignerRoles.length)) {
    issues.push(coverageIssue(
      'CONDITIONAL_COVERAGE_SIGNER_RULES_MISSING',
      'The conditional master does not contain its protected signer-role configuration.',
    ))
  }

  const sectionByKey = new Map(sourceSections.map((section) => [getSectionKey(section), section]))
  for (const pack of getConditionalMasterPackDefinitions(normalizedPacketType)) {
    if (!getSectionText(sectionByKey.get(pack.key) || {})) {
      issues.push(coverageIssue(
        'CONDITIONAL_COVERAGE_PACK_WORDING_MISSING',
        `${pack.label} does not contain approved wording.`,
        { sectionKey: pack.key, sectionLabel: pack.label },
      ))
    }
  }

  const coverageCases = listConditionalMasterCoverageCases(normalizedPacketType)
  const caseResults = coverageCases.map((testCase) => {
    const scenarioProfile = resolveCoverageScenario(testCase)
    const placeholders = {
      ...buildLegalDocumentScenarioPlaceholders(scenarioProfile),
      ...signerFacts(scenarioProfile),
    }
    const masterAudit = evaluateConditionalMasterSections({
      packetType: normalizedPacketType,
      sections: sourceSections,
      placeholders,
      canonicalPlaceholders: buildLegalDocumentScenarioPlaceholders(scenarioProfile),
      scenarioProfile,
    })
    const signingAudit = evaluateConditionalSigningPlan({
      packetType: normalizedPacketType,
      placeholders,
      scenarioProfile,
      signerRoleDefinitions: Array.isArray(resolvedSignerRoles) ? resolvedSignerRoles : null,
    })
    const ready = masterAudit.canProceed && signingAudit.documentCanProceed
    if (!ready) {
      for (const item of [...masterAudit.issues, ...signingAudit.issues.filter((entry) => entry.code !== 'CONDITIONAL_SIGNER_FACT_MISSING')]) {
        issues.push(coverageIssue(
          `COVERAGE_${item.code}`,
          item.message,
          {
            sectionKey: item.sectionKey,
            sectionLabel: item.sectionLabel,
            caseKey: testCase.key,
            scenarioKey: scenarioProfile.scenarioKey,
            engineIssue: item,
          },
        ))
      }
    }
    return {
      caseKey: testCase.key,
      scenarioKey: scenarioProfile.scenarioKey,
      facts: scenarioProfile.facts,
      expectedPackKeys: scenarioProfile.activePackKeys,
      includedPackKeys: masterAudit.includedPackKeys,
      selectedSignerRoles: signingAudit.selectedSignerRoles,
      issueCodes: [...masterAudit.issues, ...signingAudit.issues]
        .filter((item) => item.code !== 'CONDITIONAL_SIGNER_FACT_MISSING')
        .map((item) => item.code),
      ready,
    }
  })

  const coveredPackKeys = Array.from(new Set(caseResults.flatMap((item) => item.includedPackKeys))).sort()
  const expectedPackKeys = [...definition.packKeys].sort()
  const uncoveredPackKeys = expectedPackKeys.filter((packKey) => !coveredPackKeys.includes(packKey))
  if (uncoveredPackKeys.length) {
    issues.push(coverageIssue(
      'CONDITIONAL_COVERAGE_PACK_UNREACHABLE',
      'One or more protected packs cannot be reached by any supported legal scenario.',
      { uncoveredPackKeys },
    ))
  }

  const dedupedIssues = uniqueIssues(issues)
  const coveredCaseCount = caseResults.filter((item) => item.ready).length
  const ready = dedupedIssues.length === 0 && coveredCaseCount === caseResults.length
  const coverageDecisionHash = decisionHash({
    coverageVersion: CONDITIONAL_MASTER_COVERAGE_VERSION,
    packetType: normalizedPacketType,
    ready,
    expectedPackKeys,
    coveredPackKeys,
    issueCodes: dedupedIssues.map((item) => item.code),
  })
  return {
    applies: true,
    coverageVersion: CONDITIONAL_MASTER_COVERAGE_VERSION,
    packetType: normalizedPacketType,
    masterVersion: definition.masterVersion,
    resolverVersion: definition.resolverVersion,
    ready,
    canProceed: ready,
    decisionHash: coverageDecisionHash,
    caseCount: caseResults.length,
    coveredCaseCount,
    blockedCaseCount: caseResults.length - coveredCaseCount,
    scenarioCount: new Set(caseResults.map((item) => item.scenarioKey)).size,
    expectedPackKeys,
    coveredPackKeys,
    uncoveredPackKeys,
    structuralAssessment,
    signerRoleDefinitionsPresent: Array.isArray(resolvedSignerRoles) && resolvedSignerRoles.length > 0,
    issues: dedupedIssues,
    caseFailures: caseResults.filter((item) => !item.ready).slice(0, 20),
    cases: includeCases ? caseResults : [],
  }
}
