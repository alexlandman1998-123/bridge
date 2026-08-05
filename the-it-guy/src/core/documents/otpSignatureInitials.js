import { getCanonicalMergeFieldDefinition } from './mergeFieldRegistry.js'
import { getOtpFieldDefinition } from './otpFieldRegistry.js'
import { OTP_DOCUMENT_VARIANTS, normalizeOtpDocumentVariant } from './otpRouteUniverse.js'
import {
  OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT,
  buildOtpBrandedShellManifest,
} from './otpTemplateBrandedShell.js'

export const OTP_SIGNATURE_INITIALS_VERSION = 'otp_signature_initials_phase8_v1'
export const OTP_SIGNATURE_FIELD_LAYOUT_CONTRACT = 'otp_signature_initials_field_layout_phase8_v1'

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

function cloneArray(value = []) {
  return Object.freeze([...(Array.isArray(value) ? value : [])])
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function signingRole({ role, label, signatureKey, initialsKey, variants = ['resale_existing_property', 'new_development'], required = true, order = 1, capacity = '' } = {}) {
  return Object.freeze({
    role,
    label,
    signatureKey,
    initialsKey,
    variants: cloneArray(variants.map(normalizeOtpDocumentVariant).filter(Boolean)),
    required: Boolean(required),
    order,
    capacity,
  })
}

export const OTP_SIGNATURE_ROLES = Object.freeze([
  signingRole({
    role: 'purchaser_1',
    label: 'Purchaser',
    signatureKey: 'buyer_signature',
    initialsKey: 'buyer_initials',
    order: 1,
    capacity: 'buyer_or_authorised_buyer_representative',
  }),
  signingRole({
    role: 'seller',
    label: 'Seller',
    signatureKey: 'seller_signature',
    initialsKey: 'seller_initials',
    variants: ['resale_existing_property'],
    order: 2,
    capacity: 'seller_or_authorised_seller_representative',
  }),
  signingRole({
    role: 'developer_authorised_signatory',
    label: 'Developer authorised signatory',
    signatureKey: 'developer_signature',
    initialsKey: 'developer_initials',
    variants: ['new_development'],
    order: 2,
    capacity: 'developer_authorised_signatory',
  }),
  signingRole({
    role: 'contractor_authorised_signatory',
    label: 'Contractor authorised signatory',
    signatureKey: 'contractor_signature',
    initialsKey: 'contractor_initials',
    variants: ['new_development'],
    order: 3,
    capacity: 'contractor_acknowledgement',
  }),
  signingRole({
    role: 'agent',
    label: 'Agent',
    signatureKey: 'agent_signature',
    initialsKey: 'agent_initials',
    variants: ['new_development'],
    order: 4,
    capacity: 'selling_agent_acknowledgement',
  }),
])

function cloneRole(role = {}) {
  return {
    ...role,
    variants: [...(role.variants || [])],
  }
}

export function listOtpSignatureRoles({ variant = '' } = {}) {
  const normalizedVariant = normalizeOtpDocumentVariant(variant)
  return OTP_SIGNATURE_ROLES
    .filter((role) => !normalizedVariant || role.variants.includes(normalizedVariant))
    .sort((left, right) => left.order - right.order || left.role.localeCompare(right.role))
    .map(cloneRole)
}

function plannedField({ role, type, placeholderKey = '', required = true, repeat = '', placement = '', fieldGroup = 'signature_zone' } = {}) {
  return {
    contract: OTP_SIGNATURE_FIELD_LAYOUT_CONTRACT,
    signerRole: role.role,
    signerLabel: role.label,
    fieldType: type,
    placeholderKey,
    required: Boolean(required),
    repeat,
    placement,
    fieldGroup,
    signingOrder: role.order,
  }
}

export function buildOtpSignatureInitialsManifest({ variant = 'resale_existing_property' } = {}) {
  const documentVariant = normalizeOtpDocumentVariant(variant)
  const variantDefinition = OTP_DOCUMENT_VARIANTS.find((item) => item.key === documentVariant)
  const roles = listOtpSignatureRoles({ variant: documentVariant })
  const fields = roles.flatMap((role) => [
    plannedField({ role, type: 'signature', placeholderKey: role.signatureKey, placement: 'signature_zone' }),
    plannedField({ role, type: 'initial', placeholderKey: role.initialsKey, repeat: 'every_page', placement: 'page_footer_margin', fieldGroup: 'page_initials' }),
    plannedField({ role, type: 'date', placeholderKey: 'signed_date', placement: 'signature_zone' }),
  ])
  const placeholderKeys = unique(fields.map((field) => field.placeholderKey))

  return {
    version: OTP_SIGNATURE_INITIALS_VERSION,
    layoutContract: OTP_SIGNATURE_FIELD_LAYOUT_CONTRACT,
    shellSignatureLayoutContract: OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT,
    documentVariant,
    variantLabel: variantDefinition?.label || documentVariant,
    roles,
    fields,
    placeholderKeys,
    requiredSignerRoles: roles.filter((role) => role.required).map((role) => role.role),
    initialsRepeatPolicy: 'every_page',
    dateFieldPolicy: 'per_signer_signature_date',
    freeTextFallbackAllowed: false,
    mutatedData: false,
  }
}

function shellPlannedFields(variant) {
  const manifest = buildOtpBrandedShellManifest({ variant })
  const slot = manifest.slots.find((item) => item.slotType === 'signature_zone')
  return {
    slot,
    fields: (slot?.signing?.planned_fields || []).map((field) => ({
      signerRole: normalizeKey(field.signer_role || field.signerRole),
      fieldType: normalizeKey(field.field_type || field.fieldType),
      required: field.required === true,
      repeat: normalizeKey(field.repeat),
    })),
  }
}

function fieldIdentity(field = {}) {
  return `${normalizeKey(field.signerRole)}:${normalizeKey(field.fieldType)}:${field.required === true}:${normalizeKey(field.repeat)}`
}

function addCheck(checks, pass, code, detail) {
  checks.push({ code, pass: Boolean(pass), detail })
}

function auditRoute(variant) {
  const manifest = buildOtpSignatureInitialsManifest({ variant })
  const { slot, fields: shellFields } = shellPlannedFields(manifest.documentVariant)
  const shellIdentities = new Set(shellFields.map(fieldIdentity))
  const planIdentities = new Set(manifest.fields.map(fieldIdentity))
  const fieldRegistryGaps = []
  const mergeRegistryGaps = []
  const routeFieldGaps = []
  const shellFieldGaps = []
  const missingInitials = []
  const missingDates = []

  for (const placeholderKey of manifest.placeholderKeys) {
    const fieldDefinition = getOtpFieldDefinition(placeholderKey)
    if (!fieldDefinition) {
      fieldRegistryGaps.push(placeholderKey)
    } else if (!fieldDefinition.variants.includes(manifest.documentVariant)) {
      routeFieldGaps.push(placeholderKey)
    }
    if (!getCanonicalMergeFieldDefinition(placeholderKey, { packetType: 'otp' })) {
      mergeRegistryGaps.push(placeholderKey)
    }
  }

  for (const field of manifest.fields) {
    if (!shellIdentities.has(fieldIdentity(field))) shellFieldGaps.push(fieldIdentity(field))
  }
  for (const shellField of shellFields) {
    if (!planIdentities.has(fieldIdentity(shellField))) shellFieldGaps.push(fieldIdentity(shellField))
  }

  for (const role of manifest.roles) {
    if (!manifest.fields.some((field) => field.signerRole === role.role && field.fieldType === 'initial' && field.repeat === 'every_page')) {
      missingInitials.push(role.role)
    }
    if (!manifest.fields.some((field) => field.signerRole === role.role && field.fieldType === 'date')) {
      missingDates.push(role.role)
    }
  }

  return {
    variant: manifest.documentVariant,
    label: manifest.variantLabel,
    manifest,
    shellSlotKey: slot?.key || '',
    shellPlaceholderKeys: slot?.placeholderKeys || [],
    shellFieldCount: shellFields.length,
    fieldRegistryGaps,
    mergeRegistryGaps,
    routeFieldGaps,
    shellFieldGaps: unique(shellFieldGaps),
    missingInitials,
    missingDates,
  }
}

export function buildOtpSignatureInitialsAudit({ checkedAt = new Date().toISOString() } = {}) {
  const routeAudits = OTP_DOCUMENT_VARIANTS.map((variant) => auditRoute(variant.key))
  const resale = routeAudits.find((audit) => audit.variant === 'resale_existing_property')
  const development = routeAudits.find((audit) => audit.variant === 'new_development')
  const checks = []
  const fieldRegistryGaps = routeAudits.flatMap((audit) => audit.fieldRegistryGaps.map((key) => ({ variant: audit.variant, key })))
  const mergeRegistryGaps = routeAudits.flatMap((audit) => audit.mergeRegistryGaps.map((key) => ({ variant: audit.variant, key })))
  const routeFieldGaps = routeAudits.flatMap((audit) => audit.routeFieldGaps.map((key) => ({ variant: audit.variant, key })))
  const shellFieldGaps = routeAudits.flatMap((audit) => audit.shellFieldGaps.map((key) => ({ variant: audit.variant, key })))
  const missingInitials = routeAudits.flatMap((audit) => audit.missingInitials.map((role) => ({ variant: audit.variant, role })))
  const missingDates = routeAudits.flatMap((audit) => audit.missingDates.map((role) => ({ variant: audit.variant, role })))
  const resaleRoles = new Set(resale?.manifest.requiredSignerRoles || [])
  const developmentRoles = new Set(development?.manifest.requiredSignerRoles || [])
  const developmentPlaceholders = new Set(development?.manifest.placeholderKeys || [])
  const resalePlaceholders = new Set(resale?.manifest.placeholderKeys || [])

  addCheck(checks, routeAudits.length === 2, 'PHASE8_SIGNATURE_INITIALS_BOTH_ROUTES_PRESENT', 'Signature and initials manifests resolve both resale and new-development routes.')
  addCheck(checks, resaleRoles.has('purchaser_1') && resaleRoles.has('seller') && !resaleRoles.has('developer_authorised_signatory'), 'PHASE8_RESALE_SIGNERS_BOUND', 'Resale route requires purchaser and seller signatures only.')
  addCheck(checks, developmentRoles.has('purchaser_1') && developmentRoles.has('developer_authorised_signatory') && developmentRoles.has('contractor_authorised_signatory') && developmentRoles.has('agent') && !developmentRoles.has('seller'), 'PHASE8_DEVELOPMENT_SIGNERS_BOUND', 'New-development route requires purchaser, developer, contractor and agent signature/acknowledgement fields.')
  addCheck(checks, !developmentPlaceholders.has('seller_signature') && !developmentPlaceholders.has('seller_initials'), 'PHASE8_NO_RESALE_SIGNATURES_IN_DEVELOPMENT', 'New-development signing plan excludes seller signature and initials.')
  addCheck(checks, !resalePlaceholders.has('developer_signature') && !resalePlaceholders.has('developer_initials') && !resalePlaceholders.has('contractor_signature') && !resalePlaceholders.has('agent_signature'), 'PHASE8_NO_DEVELOPMENT_SIGNATURES_IN_RESALE', 'Resale signing plan excludes developer, contractor and agent signing fields.')
  addCheck(checks, fieldRegistryGaps.length === 0, 'PHASE8_SIGNATURE_FIELDS_IN_FIELD_REGISTRY', fieldRegistryGaps.length ? `Missing OTP fields: ${fieldRegistryGaps.map((gap) => gap.key).join(', ')}` : 'Every signature, initial and date placeholder is in the OTP field registry.')
  addCheck(checks, mergeRegistryGaps.length === 0, 'PHASE8_SIGNATURE_FIELDS_IN_MERGE_REGISTRY', mergeRegistryGaps.length ? `Missing merge fields: ${mergeRegistryGaps.map((gap) => gap.key).join(', ')}` : 'Every signature, initial and date placeholder is canonical for OTP.')
  addCheck(checks, routeFieldGaps.length === 0, 'PHASE8_SIGNATURE_FIELDS_ROUTE_ELIGIBLE', routeFieldGaps.length ? `Route field gaps: ${routeFieldGaps.map((gap) => `${gap.variant}:${gap.key}`).join(', ')}` : 'Every signing placeholder is route eligible.')
  addCheck(checks, shellFieldGaps.length === 0, 'PHASE8_SHELL_SIGNATURE_PLAN_MATCHES', shellFieldGaps.length ? `Shell plan mismatches: ${shellFieldGaps.map((gap) => `${gap.variant}:${gap.key}`).join(', ')}` : 'Branded shell signature-zone planned fields match the Phase 8 signing plan.')
  addCheck(checks, missingInitials.length === 0, 'PHASE8_INITIALS_REQUIRED_FOR_EVERY_SIGNER', missingInitials.length ? `Missing initials: ${missingInitials.map((gap) => `${gap.variant}:${gap.role}`).join(', ')}` : 'Every required signer has required initials on every page.')
  addCheck(checks, missingDates.length === 0, 'PHASE8_DATE_FIELD_REQUIRED_FOR_EVERY_SIGNER', missingDates.length ? `Missing dates: ${missingDates.map((gap) => `${gap.variant}:${gap.role}`).join(', ')}` : 'Every required signer has a signature date field.')
  addCheck(checks, routeAudits.every((audit) => audit.manifest.freeTextFallbackAllowed === false), 'PHASE8_NO_FREE_TEXT_SIGNING_FALLBACKS', 'Signing fields are generated by signing runtime, not free-text template rows.')

  const blockers = checks.filter((check) => !check.pass)

  return {
    version: OTP_SIGNATURE_INITIALS_VERSION,
    layoutContract: OTP_SIGNATURE_FIELD_LAYOUT_CONTRACT,
    checkedAt,
    mutatedData: false,
    status: blockers.length ? 'OTP_SIGNATURE_INITIALS_REMEDIATION_REQUIRED' : 'OTP_SIGNATURE_INITIALS_READY_FOR_RENDERER_WIRING',
    summary: {
      routeCount: routeAudits.length,
      roleCount: routeAudits.reduce((sum, audit) => sum + audit.manifest.roles.length, 0),
      fieldCount: routeAudits.reduce((sum, audit) => sum + audit.manifest.fields.length, 0),
      resaleSignerCount: resale?.manifest.roles.length || 0,
      developmentSignerCount: development?.manifest.roles.length || 0,
      blockerCount: blockers.length,
    },
    checks,
    routeAudits,
    blockers,
    fieldRegistryGaps,
    mergeRegistryGaps,
    routeFieldGaps,
    shellFieldGaps,
    missingInitials,
    missingDates,
  }
}

function table(headers = [], rows = []) {
  const escape = (value) => normalizeText(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n')
}

export function formatOtpSignatureInitialsAuditMarkdown(report = buildOtpSignatureInitialsAudit()) {
  return [
    '# OTP Template vNext Phase 8 Signatures And Initials',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Layout contract: ${report.layoutContract}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Routes', report.summary.routeCount],
        ['Total signer roles', report.summary.roleCount],
        ['Total planned fields', report.summary.fieldCount],
        ['Resale signer roles', report.summary.resaleSignerCount],
        ['New-development signer roles', report.summary.developmentSignerCount],
        ['Blockers', report.summary.blockerCount],
      ],
    ),
    '',
    '## Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Route Signing Plans',
    '',
    table(
      ['Route', 'Signer Roles', 'Placeholders', 'Initials Policy', 'Date Policy'],
      report.routeAudits.map((audit) => [
        audit.label,
        audit.manifest.roles.map((role) => role.role).join(', '),
        audit.manifest.placeholderKeys.join(', '),
        audit.manifest.initialsRepeatPolicy,
        audit.manifest.dateFieldPolicy,
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 8 locks route-aware signature, initials and signing-date plans. It does not dispatch signing links, render final PDF coordinates, approve wet-ink/e-sign legal formalities, or replace visual PDF/signing-envelope QA.',
    '',
  ].join('\n')
}
