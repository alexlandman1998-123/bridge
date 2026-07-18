import { buildCanonicalTemplateDefinition, validateCanonicalTemplateDefinition } from './canonicalTemplateDefinition.js'

export const NATIVE_STARTER_TEMPLATE_KEYS = Object.freeze({
  mandate: 'mandate_default_v1',
  otp: 'otp_default_v1',
  addendum: 'addendum_default_v1',
})

const MINIMUM_SECTION_COUNTS = Object.freeze({ mandate: 10, otp: 12, addendum: 5 })
const FILLER_COPY_PATTERN = /update this clause|lorem ipsum|todo|tbd|insert (?:clause|text)|placeholder copy/i

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

export function assessNativeStarterTemplate(template = {}) {
  const definition = template?.schemaVersion
    ? template
    : buildCanonicalTemplateDefinition(template)
  const contract = validateCanonicalTemplateDefinition(definition)
  const blockers = [...contract.blockers]
  const expectedKey = NATIVE_STARTER_TEMPLATE_KEYS[definition.documentType]
  const sections = Array.isArray(definition.sections) ? definition.sections : []

  if (!expectedKey || definition.templateKey !== expectedKey) blockers.push('Template is not a recognized Arch9 native starter.')
  if (definition.sourceMode !== 'native') blockers.push('Starter template must use the native structured renderer.')
  if (definition.status !== 'active') blockers.push('Starter template must be active.')
  if (sections.length < (MINIMUM_SECTION_COUNTS[definition.documentType] || 1)) {
    blockers.push(`Starter template requires at least ${MINIMUM_SECTION_COUNTS[definition.documentType] || 1} sections.`)
  }
  for (const section of sections) {
    if (!text(section?.content)) blockers.push(`Starter section ${section?.key || 'unknown'} has no usable wording.`)
    if (FILLER_COPY_PATTERN.test(text(section?.content))) blockers.push(`Starter section ${section?.key || 'unknown'} contains filler copy.`)
  }
  if (!sections.some((section) => section.type === 'signature_zone')) blockers.push('Starter template requires a visible signature section.')
  if (!Array.isArray(definition.defaultSignerRoles) || !definition.defaultSignerRoles.length) blockers.push('Starter template requires default signer roles.')
  if (definition.branding?.inheritOrganisationBranding !== true) blockers.push('Starter template must inherit organisation branding by default.')

  return {
    ready: blockers.length === 0,
    blockers: Array.from(new Set(blockers)),
    definition,
  }
}

export function assertNativeStarterTemplate(template = {}) {
  const assessment = assessNativeStarterTemplate(template)
  if (assessment.ready) return assessment.definition
  const error = new Error(`Native starter template is not usable: ${assessment.blockers[0]}`)
  error.code = 'NATIVE_STARTER_TEMPLATE_INVALID'
  error.blockers = assessment.blockers
  throw error
}
