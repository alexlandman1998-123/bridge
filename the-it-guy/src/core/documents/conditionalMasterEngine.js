import {
  CONDITIONAL_MASTER_RESOLVER_VERSION,
  CONDITIONAL_MASTER_VERSION,
  getConditionalMasterPackDefinitions,
  getConditionalMasterTemplateDefinition,
} from './conditionalMasterTemplateDefinitions.js'
import {
  VISIBILITY_ENGINE_VERSION,
  evaluateVisibilityRulesDetailed,
  normalizeVisibilityConditionInput,
} from './sectionVisibilityRules.js'

export const CONDITIONAL_MASTER_ENGINE_VERSION = 'conditional-master-engine-v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s./-]+/g, '_')
}

function getSectionKey(section = {}) {
  return normalizeKey(section.section_key || section.sectionKey || section.key)
}

function getSectionLabel(section = {}) {
  return normalizeText(section.section_label || section.sectionLabel || section.label || getSectionKey(section))
}

function getSectionMetadata(section = {}) {
  if (section.metadata_json && typeof section.metadata_json === 'object') return section.metadata_json
  if (section.metadataJson && typeof section.metadataJson === 'object') return section.metadataJson
  if (section.metadata && typeof section.metadata === 'object') return section.metadata
  return {}
}

function getSectionCondition(section = {}) {
  if (section.condition_json && typeof section.condition_json === 'object') return section.condition_json
  if (section.conditionJson && typeof section.conditionJson === 'object') return section.conditionJson
  if (section.condition && typeof section.condition === 'object') return section.condition
  const metadata = getSectionMetadata(section)
  return metadata.visibility_rules && typeof metadata.visibility_rules === 'object' ? metadata.visibility_rules : {}
}

function normalizeRuleValue(value, operator) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',')
  const normalized = values.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
  return ['in', 'not_in'].includes(operator) ? normalized.sort() : normalized.slice(0, 1)
}

function buildRuleSignature(condition = {}) {
  const normalized = normalizeVisibilityConditionInput(condition)
  return JSON.stringify({
    enabled: normalized.enabled,
    field: normalizeKey(normalized.field),
    operator: normalizeKey(normalized.operator),
    value: normalizeRuleValue(normalized.value, normalized.operator),
  })
}

function engineIssue(code, message, { sectionKey = '', sectionLabel = '', details = {} } = {}) {
  return {
    code,
    source: 'conditional_engine',
    message,
    sectionKey: normalizeKey(sectionKey),
    sectionLabel: normalizeText(sectionLabel || sectionKey),
    required: true,
    details,
  }
}

function hasCondition(condition = {}) {
  return Boolean(condition && typeof condition === 'object' && Object.keys(condition).length)
}

export function evaluateConditionalMasterSections({
  packetType = '',
  sections = [],
  placeholders = {},
  canonicalPlaceholders = placeholders,
  scenarioProfile = null,
} = {}) {
  const definition = getConditionalMasterTemplateDefinition(packetType)
  if (!definition) {
    return {
      engineVersion: CONDITIONAL_MASTER_ENGINE_VERSION,
      visibilityEngineVersion: VISIBILITY_ENGINE_VERSION,
      applies: false,
      canProceed: true,
      sections: [],
      includedSectionKeys: [],
      excludedSectionKeys: [],
      includedPackKeys: [],
      excludedPackKeys: [],
      issues: [],
    }
  }

  const sourceSections = Array.isArray(sections) ? sections : []
  const packs = getConditionalMasterPackDefinitions(definition.packetType)
  const packByKey = new Map(packs.map((pack) => [pack.key, pack]))
  const activePackSource = Array.isArray(scenarioProfile?.activeClausePacks)
    ? scenarioProfile.activeClausePacks
    : Array.isArray(scenarioProfile?.activePackKeys)
      ? scenarioProfile.activePackKeys
      : []
  const expectedActivePacks = new Set(activePackSource)
  const sectionCounts = sourceSections.reduce((counts, section) => {
    const key = getSectionKey(section)
    if (key) counts.set(key, (counts.get(key) || 0) + 1)
    return counts
  }, new Map())
  const issues = []

  if (!scenarioProfile?.complete) {
    issues.push(engineIssue(
      'CONDITIONAL_SCENARIO_INCOMPLETE',
      'The canonical legal scenario must be complete before conditional sections can be resolved.',
      { sectionKey: 'legal_scenario', sectionLabel: 'Legal scenario' },
    ))
  }

  for (const expectedPackKey of expectedActivePacks) {
    if (!packByKey.has(expectedPackKey)) {
      issues.push(engineIssue(
        'CONDITIONAL_RESOLVER_PACK_UNKNOWN',
        `The canonical scenario resolver selected unknown pack ${expectedPackKey}.`,
        { sectionKey: expectedPackKey, sectionLabel: expectedPackKey },
      ))
    }
  }

  for (const pack of packs) {
    const count = sectionCounts.get(pack.key) || 0
    if (count === 0) {
      issues.push(engineIssue('CONDITIONAL_PACK_MISSING', `Required conditional section ${pack.label} is missing.`, { sectionKey: pack.key, sectionLabel: pack.label }))
    } else if (count > 1) {
      issues.push(engineIssue('CONDITIONAL_PACK_DUPLICATE', `Conditional section ${pack.label} appears more than once.`, { sectionKey: pack.key, sectionLabel: pack.label, details: { count } }))
    }
  }

  const decisions = sourceSections.map((section, index) => {
    const sectionKey = getSectionKey(section)
    const sectionLabel = getSectionLabel(section)
    const condition = getSectionCondition(section)
    const pack = packByKey.get(sectionKey) || null
    const metadata = getSectionMetadata(section)
    const evaluation = evaluateVisibilityRulesDetailed(condition, pack ? canonicalPlaceholders : placeholders, {
      strict: Boolean(pack || hasCondition(condition)),
      path: `sections.${sectionKey || index}.condition`,
    })
    const sectionIssues = []
    let ruleIntegrity = true
    let expectedActive = null
    let visible = evaluation.visible

    if (pack) {
      expectedActive = expectedActivePacks.has(pack.key)
      ruleIntegrity = buildRuleSignature(condition) === buildRuleSignature(pack.conditionJson)
      if (metadata.conditional_pack !== true) {
        sectionIssues.push(engineIssue('CONDITIONAL_PACK_METADATA_INVALID', `${pack.label} is not marked as a conditional master pack.`, { sectionKey, sectionLabel }))
      }
      if (normalizeText(metadata.conditional_master_version) !== CONDITIONAL_MASTER_VERSION) {
        sectionIssues.push(engineIssue('CONDITIONAL_MASTER_VERSION_MISMATCH', `${pack.label} does not use the current conditional master version.`, {
          sectionKey,
          sectionLabel,
          details: { expected: CONDITIONAL_MASTER_VERSION, actual: metadata.conditional_master_version || null },
        }))
      }
      if (!ruleIntegrity) {
        sectionIssues.push(engineIssue('CONDITIONAL_RULE_DRIFT', `The protected inclusion rule for ${pack.label} does not match the master manifest.`, { sectionKey, sectionLabel }))
      }
      if (metadata.condition_rule_locked !== true) {
        sectionIssues.push(engineIssue('CONDITIONAL_RULE_UNLOCKED', `The inclusion rule for ${pack.label} is not marked as protected.`, { sectionKey, sectionLabel }))
      }
      if (evaluation.valid && evaluation.visible !== expectedActive) {
        sectionIssues.push(engineIssue('CONDITIONAL_DECISION_MISMATCH', `The inclusion result for ${pack.label} disagrees with the canonical scenario resolver.`, {
          sectionKey,
          sectionLabel,
          details: { expectedActive, evaluatedVisible: evaluation.visible },
        }))
      }
      visible = Boolean(scenarioProfile?.complete && ruleIntegrity && evaluation.valid && evaluation.visible && expectedActive)
    } else if (metadata.conditional_pack === true) {
      sectionIssues.push(engineIssue('CONDITIONAL_PACK_UNKNOWN', `${sectionLabel} is marked as a core pack but is not present in the master manifest.`, { sectionKey, sectionLabel }))
      visible = false
    }

    for (const error of evaluation.errors || []) {
      sectionIssues.push(engineIssue(error.code || 'CONDITIONAL_RULE_INVALID', error.message || `The inclusion rule for ${sectionLabel} is invalid.`, {
        sectionKey,
        sectionLabel,
        details: error,
      }))
    }
    if (sectionIssues.length) visible = false
    issues.push(...sectionIssues)

    return {
      index,
      sectionKey,
      sectionLabel,
      conditionalPack: Boolean(pack),
      packKey: pack?.key || null,
      expectedActive,
      ruleIntegrity,
      visible,
      decision: sectionIssues.length ? 'blocked' : visible ? 'included' : 'excluded',
      condition: evaluation,
      issueCodes: sectionIssues.map((issue) => issue.code),
    }
  })

  const includedSectionKeys = decisions.filter((decision) => decision.visible).map((decision) => decision.sectionKey)
  const excludedSectionKeys = decisions.filter((decision) => !decision.visible).map((decision) => decision.sectionKey)
  const includedPackKeys = decisions.filter((decision) => decision.conditionalPack && decision.visible).map((decision) => decision.packKey)
  const excludedPackKeys = decisions.filter((decision) => decision.conditionalPack && !decision.visible).map((decision) => decision.packKey)

  return {
    engineVersion: CONDITIONAL_MASTER_ENGINE_VERSION,
    visibilityEngineVersion: VISIBILITY_ENGINE_VERSION,
    masterVersion: CONDITIONAL_MASTER_VERSION,
    resolverVersion: CONDITIONAL_MASTER_RESOLVER_VERSION,
    applies: true,
    packetType: definition.packetType,
    scenarioKey: normalizeText(scenarioProfile?.scenarioKey) || null,
    scenarioComplete: Boolean(scenarioProfile?.complete),
    canProceed: issues.length === 0,
    expectedActivePackKeys: [...expectedActivePacks],
    includedSectionKeys,
    excludedSectionKeys,
    includedPackKeys,
    excludedPackKeys,
    sections: decisions,
    issues,
  }
}
