import { resolveLegalDocumentScenarioProfile } from './legalDocumentScenarioProfile.js'
import { resolveLegalDocumentSignerProfile } from './legalDocumentSignerProfile.js'
import { buildLegalDocumentScenarioPlaceholders } from './legalDocumentScenarioProfile.js'
import { getConditionalMasterTemplateDefinition } from './conditionalMasterTemplateDefinitions.js'
import { evaluateVisibilityRulesDetailed } from './sectionVisibilityRules.js'

export const CONDITIONAL_SIGNING_ENGINE_VERSION = 'conditional-signing-engine-v1'

const SCENARIO_CONTROLLED_ROLES = Object.freeze([
  'purchaser_1',
  'purchaser_2',
  'buyer_spouse',
  'seller',
  'seller_spouse',
  'agent',
])

function key(value) {
  return String(value ?? '').trim().toLowerCase()
}

function unique(values = []) {
  return Array.from(new Set(values.map(key).filter(Boolean)))
}

function issue(code, message, details = {}) {
  return {
    code,
    source: 'conditional_signing_engine',
    sectionKey: 'signature_pages',
    sectionLabel: 'Signing setup',
    message,
    required: true,
    details,
  }
}

function normalizeField(field = {}) {
  return {
    ...field,
    signerRole: key(field.signerRole || field.signer_role),
    fieldType: key(field.fieldType || field.field_type),
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((entry) => [entry, stableValue(value[entry])]))
}

function signature(value) {
  return JSON.stringify(stableValue(value ?? null))
}

function normalizeConditionForSignature(condition = null) {
  if (!condition || typeof condition !== 'object') return null
  const rule = condition.rule && typeof condition.rule === 'object' ? condition.rule : {}
  return {
    enabled: condition.enabled !== false,
    rule: {
      field: key(rule.field),
      operator: key(rule.operator),
      value: key(rule.value),
    },
  }
}

export function evaluateConditionalSigningPlan({
  packetType = '',
  placeholders = {},
  context = {},
  scenarioProfile = null,
  plannedFields = [],
  actualSigners = null,
  signerRoleDefinitions = null,
} = {}) {
  const normalizedPacketType = key(packetType) === 'otp' ? 'otp' : 'mandate'
  const resolvedScenario = scenarioProfile || resolveLegalDocumentScenarioProfile({
    packetType: normalizedPacketType,
    placeholders,
    context,
    sourceContext: context,
  })
  const signerProfile = resolveLegalDocumentSignerProfile({
    packetType: normalizedPacketType,
    placeholders,
    context,
    scenarioProfile: resolvedScenario,
  })
  const selectedSignerRoles = unique(signerProfile.signers.map((signer) => signer.role))
  const requiredSignerRoles = unique(
    signerProfile.signers.filter((signer) => signer.required).map((signer) => signer.role),
  )
  const excludedScenarioRoles = SCENARIO_CONTROLLED_ROLES.filter((role) => !selectedSignerRoles.includes(role))
  const fields = (Array.isArray(plannedFields) ? plannedFields : []).map(normalizeField)
  const fieldRoles = unique(fields.map((field) => field.signerRole))
  const signatureRoles = unique(
    fields.filter((field) => field.fieldType === 'signature' && field.required !== false).map((field) => field.signerRole),
  )
  const issues = []
  const masterDefinition = getConditionalMasterTemplateDefinition(normalizedPacketType)
  const scenarioPlaceholders = buildLegalDocumentScenarioPlaceholders(resolvedScenario)
  const roleDecisions = (masterDefinition?.defaultSignerRoles || []).map((definition) => {
    const condition = definition.conditionJson || definition.condition_json || null
    const evaluation = condition
      ? evaluateVisibilityRulesDetailed(condition, scenarioPlaceholders, {
          strict: true,
          path: `signer_roles.${definition.role}`,
        })
      : null
    const selectedByRule = Boolean(definition.required) || Boolean(condition && evaluation?.visible)
    const selectedByResolver = selectedSignerRoles.includes(key(definition.role))
    if ((definition.required || condition) && selectedByRule !== selectedByResolver) {
      issues.push(issue(
        'CONDITIONAL_SIGNER_DECISION_MISMATCH',
        'A protected signer-role rule disagrees with the canonical scenario signer plan.',
        { role: definition.role, selectedByRule, selectedByResolver },
      ))
    }
    return {
      role: key(definition.role),
      required: Boolean(definition.required),
      selectedByRule,
      selectedByResolver,
      condition,
      evaluation,
    }
  })

  if (Array.isArray(signerRoleDefinitions) && signerRoleDefinitions.length) {
    for (const expected of masterDefinition?.defaultSignerRoles || []) {
      const matches = signerRoleDefinitions.filter((item) => key(item.role || item.signerRole || item.signer_role) === key(expected.role))
      if (matches.length !== 1) {
        issues.push(issue(
          matches.length ? 'CONDITIONAL_SIGNER_ROLE_DUPLICATE' : 'CONDITIONAL_SIGNER_ROLE_MISSING',
          'The stored signer-role configuration must contain every protected master role exactly once.',
          { role: expected.role, count: matches.length },
        ))
        continue
      }
      const actual = matches[0]
      const actualCondition = actual.conditionJson || actual.condition_json || null
      const expectedCondition = expected.conditionJson || expected.condition_json || null
      if (
        Boolean(actual.required) !== Boolean(expected.required) ||
        signature(normalizeConditionForSignature(actualCondition)) !== signature(normalizeConditionForSignature(expectedCondition))
      ) {
        issues.push(issue(
          'CONDITIONAL_SIGNER_ROLE_RULE_DRIFT',
          'A protected signer-role requirement or activation rule has changed.',
          { role: expected.role },
        ))
      }
    }
  }

  if (!resolvedScenario.complete) {
    issues.push(issue(
      'CONDITIONAL_SIGNING_SCENARIO_INCOMPLETE',
      'The canonical legal scenario must be complete before the signer plan can be certified.',
      {
        missingFacts: resolvedScenario.missingRoutingFacts || [],
        conflictingFacts: resolvedScenario.conflictingFacts || [],
        invalidFacts: resolvedScenario.invalidFacts || [],
      },
    ))
  }

  for (const missing of signerProfile.missingRequiredSignerFacts || []) {
    issues.push(issue(
      'CONDITIONAL_SIGNER_FACT_MISSING',
      `${missing.label} is required before signing can be prepared.`,
      missing,
    ))
  }

  if (fields.length) {
    const unexpectedFieldRoles = fieldRoles.filter(
      (role) => SCENARIO_CONTROLLED_ROLES.includes(role) && !selectedSignerRoles.includes(role),
    )
    if (unexpectedFieldRoles.length) {
      issues.push(issue(
        'CONDITIONAL_SIGNING_FIELD_ROLE_UNEXPECTED',
        'The template contains signing fields for a party excluded by the canonical scenario.',
        { unexpectedRoles: unexpectedFieldRoles },
      ))
    }

    const missingSignatureRoles = requiredSignerRoles.filter((role) => !signatureRoles.includes(role))
    if (missingSignatureRoles.length) {
      issues.push(issue(
        'CONDITIONAL_SIGNING_FIELD_MISSING',
        'The template is missing a required signature field for the canonical signer plan.',
        { missingRoles: missingSignatureRoles },
      ))
    }

    const duplicateSignatureRoles = requiredSignerRoles.filter(
      (role) => fields.filter((field) => field.signerRole === role && field.fieldType === 'signature').length > 1,
    )
    if (duplicateSignatureRoles.length) {
      issues.push(issue(
        'CONDITIONAL_SIGNING_FIELD_DUPLICATE',
        'A required signer has more than one signature field in the signature section.',
        { duplicateRoles: duplicateSignatureRoles },
      ))
    }
  }

  if (Array.isArray(actualSigners)) {
    const actualRoles = unique(actualSigners.map((signer) => signer.signerRole || signer.signer_role || signer.role))
    const missingActualRoles = selectedSignerRoles.filter((role) => !actualRoles.includes(role))
    const unexpectedActualRoles = actualRoles.filter(
      (role) => SCENARIO_CONTROLLED_ROLES.includes(role) && !selectedSignerRoles.includes(role),
    )
    if (missingActualRoles.length) {
      issues.push(issue(
        'CONDITIONAL_SIGNER_ROSTER_MISSING',
        'The signing roster is missing a signer selected by the canonical scenario.',
        { missingRoles: missingActualRoles },
      ))
    }
    if (unexpectedActualRoles.length) {
      issues.push(issue(
        'CONDITIONAL_SIGNER_ROSTER_UNEXPECTED',
        'The signing roster contains a scenario-controlled signer who is not applicable.',
        { unexpectedRoles: unexpectedActualRoles },
      ))
    }
  }

  return {
    applies: ['mandate', 'otp'].includes(normalizedPacketType),
    engineVersion: CONDITIONAL_SIGNING_ENGINE_VERSION,
    signerProfileVersion: signerProfile.version || null,
    scenarioResolverVersion: resolvedScenario.resolverVersion || null,
    packetType: normalizedPacketType,
    scenarioKey: resolvedScenario.scenarioKey || null,
    scenarioComplete: Boolean(resolvedScenario.complete),
    selectedSignerRoles,
    requiredSignerRoles,
    excludedScenarioRoles,
    roleDecisions,
    plannedFieldRoles: fieldRoles,
    plannedSignatureRoles: signatureRoles,
    signers: signerProfile.signers,
    missingRequiredSignerFacts: signerProfile.missingRequiredSignerFacts || [],
    issues,
    documentCanProceed: issues.every((item) => item.code === 'CONDITIONAL_SIGNER_FACT_MISSING'),
    canPrepareSigning: issues.length === 0,
    canProceed: issues.length === 0,
  }
}
