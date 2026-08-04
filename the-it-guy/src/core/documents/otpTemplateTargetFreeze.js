import {
  OTP_DOCUMENT_VARIANTS,
} from './otpRouteUniverse.js'

export const OTP_TEMPLATE_TARGET_FREEZE_VERSION = 'otp_template_target_freeze_phase0_v1'

export const OTP_TRANSITION_TEMPLATE_KEY = 'otp_default_v1'

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
])

function cloneTarget(target = {}) {
  return { ...target }
}

function cloneRule(rule = {}) {
  return { ...rule }
}

export function listOtpTargetRouteTemplates() {
  return OTP_TARGET_ROUTE_TEMPLATES.map(cloneTarget)
}

export function getOtpTargetRouteTemplate(routeKey = '') {
  return listOtpTargetRouteTemplates().find((target) => target.routeKey === routeKey) || null
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
    rules: OTP_TEMPLATE_TARGET_FREEZE_RULES.map(cloneRule),
    summary: {
      routeVariantCount: variantKeys.length,
      targetRouteTemplateCount: OTP_TARGET_ROUTE_TEMPLATES.length,
      blockerCount: blockers.length,
    },
    blockers,
  }
}
