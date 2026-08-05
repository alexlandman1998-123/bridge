import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'

export const OTP_TEMPLATE_TARGET_FREEZE_VERSION = 'otp_template_target_freeze_phase0_v1'

export const OTP_TRANSITION_TEMPLATE_KEY = 'otp_default_v1'
export const OTP_LIVE_TEMPLATE_RENDER_MODE = 'native_structured'
export const OTP_LIVE_TEMPLATE_OUTPUT_FORMAT = 'pdf'
export const OTP_LIVE_TEMPLATE_PACKET_TYPE = 'otp'

export const OTP_PHASE0_LIVE_TEMPLATE_REQUIREMENTS = Object.freeze([
  Object.freeze({
    code: 'route_specific_template_key',
    label: 'Route-specific template key',
    required: true,
    detail: 'Live OTP candidates must use a frozen route template key, not the transition default.',
  }),
  Object.freeze({
    code: 'canonical_packet_bound_pdf',
    label: 'Canonical packet-bound PDF runtime',
    required: true,
    detail: 'Live OTP output must be a sealed canonical PDF generated through native structured rendering.',
  }),
  Object.freeze({
    code: 'route_metadata',
    label: 'Explicit OTP route metadata',
    required: true,
    detail: 'Every live OTP candidate must declare the exact otp_document_variant it serves.',
  }),
  Object.freeze({
    code: 'branded_shell',
    label: 'Route-appropriate branded shell',
    required: true,
    detail: 'The branded shell must be present before publication: logo, organisation details, footer, page numbering and website placement.',
  }),
  Object.freeze({
    code: 'content_scan',
    label: 'Current OTP content scan',
    required: true,
    detail: 'The content scanner must be current and passing for the exact route wording.',
  }),
  Object.freeze({
    code: 'source_owner_metadata',
    label: 'Source-owner metadata',
    required: true,
    detail: 'Field-bearing sections must declare their data owner so buyer, seller, property, conveyancer and legal facts do not blur together.',
  }),
  Object.freeze({
    code: 'render_validation',
    label: 'Current render validation',
    required: true,
    detail: 'A current PDF render validation must exist before the template can be treated as launch-ready.',
  }),
  Object.freeze({
    code: 'signature_geometry',
    label: 'Route-aware signature and initials geometry',
    required: true,
    detail: 'Signer and initials placement must be route-aware and validated before signing.',
  }),
  Object.freeze({
    code: 'counsel_approval',
    label: 'Counsel-approved wording',
    required: true,
    detail: 'Legal wording must have recorded counsel approval before live publication.',
  }),
])

export const OTP_PHASE0_ROUTE_SEPARATION_RULES = Object.freeze([
  Object.freeze({
    routeKey: 'resale_existing_property',
    templateKey: 'otp_resale_existing_property_v1',
    requiredContentFamilies: Object.freeze([
      'definitions',
      'parties',
      'property',
      'purchase_price',
      'suspensive_conditions',
      'occupation_rent',
      'fixtures_defects_disclosure',
      'transfer_conveyancer',
      'special_conditions',
      'offer_acceptance',
    ]),
    forbiddenContentFamilies: Object.freeze([
      'development_unit',
      'development_defects',
      'body_corporate',
    ]),
  }),
  Object.freeze({
    routeKey: 'new_development',
    templateKey: 'otp_new_development_v1',
    requiredContentFamilies: Object.freeze([
      'definitions',
      'parties',
      'development_unit',
      'purchase_price',
      'suspensive_conditions',
      'development_defects',
      'body_corporate',
      'transfer_conveyancer',
      'special_conditions',
      'offer_acceptance',
    ]),
    forbiddenContentFamilies: Object.freeze([
      'fixtures_defects_disclosure',
      'occupation_rent',
    ]),
  }),
])

export const OTP_TARGET_ROUTE_TEMPLATES = Object.freeze([
  Object.freeze({
    routeKey: 'resale_existing_property',
    templateKey: 'otp_resale_existing_property_v1',
    label: 'Existing / resale property OTP',
    status: 'target_pending_publication',
    defaultRole: 'primary_resale_otp',
  }),
  Object.freeze({
    routeKey: 'new_development',
    templateKey: 'otp_new_development_v1',
    label: 'New development OTP',
    status: 'target_pending_publication',
    defaultRole: 'primary_new_development_otp',
  }),
])

export const OTP_TEMPLATE_TARGET_FREEZE_RULES = Object.freeze([
  Object.freeze({
    code: 'OTP_DEFAULT_TRANSITION_ONLY',
    severity: 'blocking',
    statement: `${OTP_TRANSITION_TEMPLATE_KEY} is a transition starter/fallback only and must not be treated as a launch-ready live OTP standard.`,
  }),
  Object.freeze({
    code: 'OTP_RESALE_ROUTE_REQUIRED',
    severity: 'blocking',
    statement: 'Existing and resale property transactions require a first-class resale OTP template before live OTP automation.',
  }),
  Object.freeze({
    code: 'OTP_DEVELOPMENT_ROUTE_REQUIRED',
    severity: 'blocking',
    statement: 'Developer, off-plan and new-development transactions require a first-class new-development OTP template before live OTP automation.',
  }),
  Object.freeze({
    code: 'OTP_ROUTE_TEMPLATE_LOCK_REQUIRED',
    severity: 'blocking',
    statement: 'Each route template must carry explicit route metadata, current content-scan metadata, render validation and counsel approval before replacing the transition default.',
  }),
  Object.freeze({
    code: 'OTP_CANONICAL_PDF_ONLY',
    severity: 'blocking',
    statement: 'Live OTP automation must generate a sealed packet-bound PDF through native structured rendering; DOCX may remain only as a reference or transition source artifact.',
  }),
  Object.freeze({
    code: 'OTP_BRANDED_SHELL_REQUIRED',
    severity: 'blocking',
    statement: 'Each live OTP route must carry the production branded shell: logo, organisation details, footer positions, page numbering and website placement.',
  }),
  Object.freeze({
    code: 'OTP_RESALE_DEVELOPMENT_SEPARATION_REQUIRED',
    severity: 'blocking',
    statement: 'Resale and new-development OTP wording, fields and signature geometry must remain separate first-class routes.',
  }),
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function readValue(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key]
    if (value !== undefined && value !== null && normalizeText(value) !== '') return value
  }
  return ''
}

function readMetadata(template = {}) {
  const raw = template.metadata_json || template.metadataJson || {}
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
}

function truthy(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  return ['true', 'yes', 'y', '1', 'pass', 'passed', 'ready', 'current', 'approved', 'validated'].includes(normalized)
}

function currentPassing(value = {}) {
  if (!value || typeof value !== 'object') return false
  if (value.current === false || value.stale === true) return false
  if (value.passed === false || value.pass === false || value.renderable === false || value.validated === false) return false
  return truthy(value.current) || truthy(value.passed) || truthy(value.pass) || truthy(value.renderable) || truthy(value.validated)
}

function blocker(code, message, extra = {}) {
  return { code, severity: 'blocking', message, ...extra }
}

function cloneTarget(target = {}) {
  return { ...target }
}

function cloneRule(rule = {}) {
  return { ...rule }
}

function cloneRequirement(requirement = {}) {
  return { ...requirement }
}

function cloneRouteSeparationRule(rule = {}) {
  return {
    ...rule,
    requiredContentFamilies: [...(rule.requiredContentFamilies || [])],
    forbiddenContentFamilies: [...(rule.forbiddenContentFamilies || [])],
  }
}

export function listOtpTargetRouteTemplates() {
  return OTP_TARGET_ROUTE_TEMPLATES.map(cloneTarget)
}

export function listOtpLiveTemplateRequirements() {
  return OTP_PHASE0_LIVE_TEMPLATE_REQUIREMENTS.map(cloneRequirement)
}

export function listOtpRouteSeparationRules() {
  return OTP_PHASE0_ROUTE_SEPARATION_RULES.map(cloneRouteSeparationRule)
}

export function getOtpTargetRouteTemplate(routeKey = '') {
  return listOtpTargetRouteTemplates().find((target) => target.routeKey === routeKey) || null
}

export function getOtpTargetTemplateKeys() {
  return listOtpTargetRouteTemplates().map((target) => target.templateKey)
}

export function isOtpTransitionTemplateKey(templateKey = '') {
  return normalizeText(templateKey) === OTP_TRANSITION_TEMPLATE_KEY
}

export function getOtpRouteSeparationRule(routeKey = '') {
  const normalizedRouteKey = normalizeKey(routeKey)
  return listOtpRouteSeparationRules().find((rule) => rule.routeKey === normalizedRouteKey) || null
}

export function assessOtpTemplatePhase0LaunchLock({ template = {} } = {}) {
  const metadata = readMetadata(template)
  const templateKey = normalizeText(readValue(template, ['template_key', 'templateKey']) || readValue(metadata, ['template_key', 'templateKey']))
  const packetType = normalizeKey(readValue(template, ['packet_type', 'packetType']) || readValue(metadata, ['packet_type', 'packetType']))
  const routeKey = normalizeKey(readValue(metadata, ['otp_document_variant', 'otpDocumentVariant', 'route_key', 'routeKey']) || readValue(template, ['otp_document_variant', 'otpDocumentVariant', 'route_key', 'routeKey']))
  const renderMode = normalizeKey(readValue(template, ['render_mode', 'renderMode']) || readValue(metadata, ['render_mode', 'renderMode']))
  const outputFormat = normalizeKey(readValue(template, ['output_format', 'outputFormat', 'rendered_output_format', 'renderedOutputFormat']) || readValue(metadata, ['output_format', 'outputFormat', 'rendered_output_format', 'renderedOutputFormat']))
  const target = getOtpTargetRouteTemplate(routeKey)
  const routeRule = getOtpRouteSeparationRule(routeKey)
  const targetKeys = getOtpTargetTemplateKeys()
  const blockers = []

  if (packetType && packetType !== OTP_LIVE_TEMPLATE_PACKET_TYPE) {
    blockers.push(blocker('OTP_PHASE0_PACKET_TYPE_NOT_OTP', 'Only OTP templates are eligible for the OTP Phase 0 launch lock.', { packetType }))
  }
  if (!templateKey) {
    blockers.push(blocker('OTP_PHASE0_TEMPLATE_KEY_MISSING', 'Template key is required before the OTP can be assessed.'))
  }
  if (isOtpTransitionTemplateKey(templateKey)) {
    blockers.push(blocker('OTP_PHASE0_TRANSITION_TEMPLATE_BLOCKED', `${OTP_TRANSITION_TEMPLATE_KEY} is transition/fallback only and cannot be a live OTP candidate.`, { templateKey }))
  }
  if (templateKey && !targetKeys.includes(templateKey)) {
    blockers.push(blocker('OTP_PHASE0_ROUTE_TEMPLATE_KEY_REQUIRED', 'Live OTP candidates must use one of the frozen route-specific template keys.', { templateKey, allowedTemplateKeys: targetKeys }))
  }
  if (!routeKey) {
    blockers.push(blocker('OTP_PHASE0_ROUTE_METADATA_MISSING', 'Live OTP candidates must declare otp_document_variant metadata.'))
  } else if (!target) {
    blockers.push(blocker('OTP_PHASE0_ROUTE_METADATA_UNKNOWN', `${routeKey} is not a frozen OTP route.`, { routeKey }))
  } else if (templateKey && target.templateKey !== templateKey) {
    blockers.push(blocker('OTP_PHASE0_ROUTE_TEMPLATE_MISMATCH', `${templateKey} does not match the frozen target key for ${routeKey}.`, { routeKey, expectedTemplateKey: target.templateKey, templateKey }))
  }
  if (renderMode !== normalizeKey(OTP_LIVE_TEMPLATE_RENDER_MODE)) {
    blockers.push(blocker('OTP_PHASE0_NATIVE_STRUCTURED_RENDER_REQUIRED', 'Live OTP candidates must use native structured rendering.', { renderMode: renderMode || 'missing', requiredRenderMode: OTP_LIVE_TEMPLATE_RENDER_MODE }))
  }
  if (outputFormat && outputFormat !== OTP_LIVE_TEMPLATE_OUTPUT_FORMAT) {
    blockers.push(blocker('OTP_PHASE0_CANONICAL_PDF_REQUIRED', 'Live OTP candidates must produce canonical PDF output.', { outputFormat, requiredOutputFormat: OTP_LIVE_TEMPLATE_OUTPUT_FORMAT }))
  }
  if (!truthy(metadata.canonical_pdf_required) && !truthy(metadata.packet_bound_pdf) && !truthy(metadata.canonical_packet_bound_pdf)) {
    blockers.push(blocker('OTP_PHASE0_PACKET_BOUND_PDF_FLAG_MISSING', 'Live OTP candidates must explicitly require canonical packet-bound PDF output.'))
  }
  if (!metadata.shell_layout_contract && !metadata.shell_version) {
    blockers.push(blocker('OTP_PHASE0_BRANDED_SHELL_METADATA_MISSING', 'Branded shell metadata is required before live OTP publication.'))
  }
  if (!metadata.signature_layout_contract && !metadata.signature_geometry_version) {
    blockers.push(blocker('OTP_PHASE0_SIGNATURE_GEOMETRY_METADATA_MISSING', 'Route-aware signature geometry metadata is required before live OTP publication.'))
  }
  if (!currentPassing(metadata.otp_content_scan || metadata.otpContentScan || metadata.content_scan || metadata.contentScan)) {
    blockers.push(blocker('OTP_PHASE0_CONTENT_SCAN_NOT_CURRENT', 'A current passing OTP content scan is required before live OTP publication.'))
  }
  if (!currentPassing(metadata.last_render_validation || metadata.lastRenderValidation || metadata.render_validation || metadata.renderValidation)) {
    blockers.push(blocker('OTP_PHASE0_RENDER_VALIDATION_NOT_CURRENT', 'A current passing render validation is required before live OTP publication.'))
  }
  if (!truthy(metadata.source_owner_metadata_current) && !truthy(metadata.sourceOwnerMetadataCurrent)) {
    blockers.push(blocker('OTP_PHASE0_SOURCE_OWNER_METADATA_MISSING', 'Source-owner metadata must be current before live OTP publication.'))
  }
  if (!truthy(metadata.counsel_approved) && !truthy(metadata.counselApproved) && !metadata.counsel_approval_recorded_at && !metadata.counselApprovalRecordedAt) {
    blockers.push(blocker('OTP_PHASE0_COUNSEL_APPROVAL_MISSING', 'Counsel approval must be recorded before live OTP publication.'))
  }
  if (routeRule) {
    const contentFamilies = new Set([
      ...(metadata.content_families || metadata.contentFamilies || []),
      ...(metadata.clause_families || metadata.clauseFamilies || []),
    ].map(normalizeKey))
    if (contentFamilies.size > 0) {
      const missingFamilies = routeRule.requiredContentFamilies.filter((family) => !contentFamilies.has(family))
      const forbiddenFamilies = routeRule.forbiddenContentFamilies.filter((family) => contentFamilies.has(family))
      if (missingFamilies.length) {
        blockers.push(blocker('OTP_PHASE0_ROUTE_REQUIRED_CONTENT_MISSING', `${routeKey} is missing required route content families.`, { routeKey, missingFamilies }))
      }
      if (forbiddenFamilies.length) {
        blockers.push(blocker('OTP_PHASE0_ROUTE_FORBIDDEN_CONTENT_PRESENT', `${routeKey} includes content families reserved for the other OTP route.`, { routeKey, forbiddenFamilies }))
      }
    }
  }

  return {
    version: OTP_TEMPLATE_TARGET_FREEZE_VERSION,
    templateKey,
    packetType: packetType || OTP_LIVE_TEMPLATE_PACKET_TYPE,
    routeKey,
    transitionTemplateKey: OTP_TRANSITION_TEMPLATE_KEY,
    allowedTemplateKeys: targetKeys,
    requirements: listOtpLiveTemplateRequirements(),
    routeSeparationRule: routeRule,
    status: blockers.length ? 'OTP_PHASE0_LAUNCH_LOCK_BLOCKED' : 'OTP_PHASE0_LAUNCH_LOCK_READY',
    launchReady: blockers.length === 0,
    blockers,
  }
}

export function buildOtpTemplateTargetFreezeAudit({ checkedAt = new Date().toISOString() } = {}) {
  const variantKeys = OTP_DOCUMENT_VARIANTS.map((variant) => variant.key)
  const targetKeys = OTP_TARGET_ROUTE_TEMPLATES.map((target) => target.routeKey)
  const missingTargets = variantKeys.filter((variantKey) => !targetKeys.includes(variantKey))
  const unknownTargets = targetKeys.filter((targetKey) => !variantKeys.includes(targetKey))
  const transitionTargetConflict = OTP_TARGET_ROUTE_TEMPLATES.some((target) => target.templateKey === OTP_TRANSITION_TEMPLATE_KEY)
  const duplicateTemplateKeys = OTP_TARGET_ROUTE_TEMPLATES
    .map((target) => target.templateKey)
    .filter((templateKey, index, list) => list.indexOf(templateKey) !== index)
  const blockers = [
    ...missingTargets.map((routeKey) => ({
      code: 'OTP_TARGET_ROUTE_MISSING',
      routeKey,
      message: `No frozen target template key is declared for ${routeKey}.`,
    })),
    ...unknownTargets.map((routeKey) => ({
      code: 'OTP_TARGET_ROUTE_UNKNOWN',
      routeKey,
      message: `${routeKey} is not a known OTP document variant.`,
    })),
    ...(transitionTargetConflict
      ? [{
          code: 'OTP_TRANSITION_TEMPLATE_USED_AS_TARGET',
          templateKey: OTP_TRANSITION_TEMPLATE_KEY,
          message: `${OTP_TRANSITION_TEMPLATE_KEY} cannot be one of the frozen route template targets.`,
        }]
      : []),
    ...duplicateTemplateKeys.map((templateKey) => ({
      code: 'OTP_TARGET_TEMPLATE_KEY_DUPLICATE',
      templateKey,
      message: `${templateKey} is declared more than once as an OTP target template key.`,
    })),
  ]

  return {
    version: OTP_TEMPLATE_TARGET_FREEZE_VERSION,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_TEMPLATE_TARGET_FREEZE_REMEDIATION_REQUIRED' : 'OTP_TEMPLATE_TARGET_FROZEN',
    transitionTemplateKey: OTP_TRANSITION_TEMPLATE_KEY,
    transitionTemplateRole: 'starter_fallback_only',
    targetRouteTemplates: listOtpTargetRouteTemplates(),
    liveTemplateRequirements: listOtpLiveTemplateRequirements(),
    routeSeparationRules: listOtpRouteSeparationRules(),
    rules: OTP_TEMPLATE_TARGET_FREEZE_RULES.map(cloneRule),
    summary: {
      routeVariantCount: variantKeys.length,
      targetRouteTemplateCount: OTP_TARGET_ROUTE_TEMPLATES.length,
      liveTemplateRequirementCount: OTP_PHASE0_LIVE_TEMPLATE_REQUIREMENTS.length,
      routeSeparationRuleCount: OTP_PHASE0_ROUTE_SEPARATION_RULES.length,
      blockerCount: blockers.length,
    },
    blockers,
  }
}
