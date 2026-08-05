import { getCanonicalMergeFieldDefinition } from './mergeFieldRegistry.js'
import {
  OTP_DATA_SOURCE_OWNERS,
  OTP_DOCUMENT_VARIANTS,
  normalizeOtpDocumentVariant,
} from './otpRouteUniverse.js'

export const OTP_TEMPLATE_BRANDED_SHELL_VERSION = 'otp_template_vnext_phase6_branded_pdf_shell_v1'
export const OTP_BRANDED_SHELL_LAYOUT_CONTRACT = 'otp_branded_pdf_shell_phase6_v1'
export const OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT = 'arch9-otp-route-aware-signature-layout-v1'

export const OTP_BRANDED_SHELL_PAGE_BASELINE = Object.freeze({
  pageWidth: 595.28,
  pageHeight: 841.89,
  margin: 48,
  headerTop: 793.89,
  headerHeight: 74,
  logoMaxWidth: 150,
  logoMaxHeight: 46,
  topRightWidth: 232,
  titleBandHeight: 38,
  bodyTop: 675,
  footerSafeY: 56,
  footerHeight: 34,
  footerLeftWidth: 188,
  footerCenterWidth: 123,
  footerRightWidth: 188,
  signatureBlockHeight: 232,
  routeBadgeHeight: 18,
})

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

function cloneObject(value = {}) {
  return Object.freeze({ ...(value && typeof value === 'object' && !Array.isArray(value) ? value : {}) })
}

function shellSlot({
  key,
  label,
  slotType,
  region,
  sortOrder,
  variants = ['resale_existing_property', 'new_development'],
  required = true,
  sourceOwners = [],
  placeholderKeys = [],
  blankRenderPolicy = 'fallback_or_hide',
  fallbackText = '',
  layout = {},
  signing = {},
} = {}) {
  return Object.freeze({
    key,
    label,
    slotType,
    region,
    sortOrder,
    variants: cloneArray(variants),
    required: Boolean(required),
    sourceOwners: cloneArray(sourceOwners),
    placeholderKeys: cloneArray(placeholderKeys),
    blankRenderPolicy,
    fallbackText,
    layout: cloneObject({
      contract: OTP_BRANDED_SHELL_LAYOUT_CONTRACT,
      ...layout,
    }),
    signing: cloneObject(signing),
  })
}

export const OTP_BRANDED_SHELL_SLOTS = Object.freeze([
  shellSlot({
    key: 'brand_header',
    label: 'Brand header',
    slotType: 'header',
    region: 'top_left',
    sortOrder: 0,
    sourceOwners: ['organisation_agent_settings'],
    placeholderKeys: ['organisation_logo_url', 'organisation_trading_name'],
    fallbackText: '{{organisation_trading_name}}',
    layout: {
      logoPlacement: 'top_left',
      x: 48,
      y: 747,
      width: 190,
      height: 54,
      logoMaxWidth: OTP_BRANDED_SHELL_PAGE_BASELINE.logoMaxWidth,
      logoMaxHeight: OTP_BRANDED_SHELL_PAGE_BASELINE.logoMaxHeight,
      allowTextFallback: true,
    },
  }),
  shellSlot({
    key: 'document_header_details',
    label: 'Company and document details header',
    slotType: 'header_details',
    region: 'top_right',
    sortOrder: 1,
    sourceOwners: ['organisation_agent_settings', 'transaction_offer_terms', 'legal_template_registry'],
    placeholderKeys: [
      'organisation_trading_name',
      'organisation_legal_name',
      'organisation_registration_number',
      'organisation_vat_number',
      'organisation_registered_address',
      'agent_full_name',
      'agent_email',
      'agent_phone',
      'otp_document_variant',
      'transaction_reference',
      'document_reference',
      'template_version',
    ],
    fallbackText: 'Offer to Purchase',
    layout: {
      detailsPlacement: 'top_right',
      x: 315,
      y: 747,
      width: OTP_BRANDED_SHELL_PAGE_BASELINE.topRightWidth,
      height: 64,
      align: 'right',
      companyDetailsPlacement: 'top_right',
      maxLines: 7,
      includesRouteBadge: true,
      includesDocumentReference: true,
      hideEmptyRows: true,
    },
  }),
  shellSlot({
    key: 'otp_title_band',
    label: 'OTP title band',
    slotType: 'title_band',
    region: 'below_header',
    sortOrder: 5,
    sourceOwners: ['transaction_offer_terms'],
    placeholderKeys: ['otp_document_variant'],
    fallbackText: 'OFFER TO PURCHASE',
    layout: {
      title: 'OFFER TO PURCHASE',
      subtitleToken: 'otp_document_variant',
      x: 48,
      y: 696,
      width: 499,
      height: OTP_BRANDED_SHELL_PAGE_BASELINE.titleBandHeight,
      includesRouteBadge: true,
    },
  }),
  shellSlot({
    key: 'resale_transaction_summary',
    label: 'Resale transaction summary',
    slotType: 'summary_band',
    region: 'body_lead',
    sortOrder: 10,
    variants: ['resale_existing_property'],
    sourceOwners: ['buyer_onboarding', 'seller_onboarding', 'listing_property_record', 'transaction_offer_terms'],
    placeholderKeys: ['buyer_full_name', 'seller_full_name', 'property_address', 'purchase_price'],
    fallbackText: 'Resale property offer summary',
    layout: {
      route: 'resale_existing_property',
      x: 48,
      y: 646,
      width: 499,
      minHeight: 44,
      maxHeight: 74,
      hideEmptyRows: true,
    },
  }),
  shellSlot({
    key: 'development_transaction_summary',
    label: 'New development transaction summary',
    slotType: 'summary_band',
    region: 'body_lead',
    sortOrder: 10,
    variants: ['new_development'],
    sourceOwners: ['buyer_onboarding', 'development_setup', 'development_unit_setup', 'transaction_offer_terms'],
    placeholderKeys: ['buyer_full_name', 'developer_name', 'development_name', 'property_unit_number', 'purchase_price', 'vat_inclusive_purchase_price'],
    fallbackText: 'New development offer summary',
    layout: {
      route: 'new_development',
      x: 48,
      y: 646,
      width: 499,
      minHeight: 50,
      maxHeight: 88,
      hideEmptyRows: true,
    },
  }),
  shellSlot({
    key: 'agency_footer_left',
    label: 'Agency footer left',
    slotType: 'footer',
    region: 'bottom_left',
    sortOrder: 90,
    sourceOwners: ['organisation_agent_settings'],
    placeholderKeys: ['organisation_trading_name'],
    fallbackText: '{{organisation_trading_name}}',
    layout: {
      footerPlacement: 'bottom_left',
      x: 48,
      y: 30,
      width: OTP_BRANDED_SHELL_PAGE_BASELINE.footerLeftWidth,
      height: OTP_BRANDED_SHELL_PAGE_BASELINE.footerHeight,
      align: 'left',
      maxLines: 1,
      hideEmptyRows: true,
    },
  }),
  shellSlot({
    key: 'page_number_footer_middle',
    label: 'Page number footer middle',
    slotType: 'footer_page_number',
    region: 'bottom_middle',
    sortOrder: 91,
    sourceOwners: ['rendering_runtime'],
    placeholderKeys: [],
    blankRenderPolicy: 'runtime_generated',
    fallbackText: 'Page {page} of {totalPages}',
    layout: {
      footerPlacement: 'bottom_middle',
      x: 236,
      y: 30,
      width: OTP_BRANDED_SHELL_PAGE_BASELINE.footerCenterWidth,
      height: OTP_BRANDED_SHELL_PAGE_BASELINE.footerHeight,
      align: 'center',
      pageNumberFormat: 'Page {page} of {totalPages}',
      runtimeGenerated: true,
    },
  }),
  shellSlot({
    key: 'website_footer_right',
    label: 'Website footer right',
    slotType: 'footer',
    region: 'bottom_right',
    sortOrder: 92,
    sourceOwners: ['organisation_agent_settings'],
    placeholderKeys: ['organisation_website'],
    fallbackText: '{{organisation_website}}',
    layout: {
      footerPlacement: 'bottom_right',
      x: 359,
      y: 30,
      width: OTP_BRANDED_SHELL_PAGE_BASELINE.footerRightWidth,
      height: OTP_BRANDED_SHELL_PAGE_BASELINE.footerHeight,
      align: 'right',
      maxLines: 1,
      hideEmptyRows: true,
    },
  }),
  shellSlot({
    key: 'resale_signature_zone',
    label: 'Resale signature zone',
    slotType: 'signature_zone',
    region: 'signature',
    sortOrder: 100,
    variants: ['resale_existing_property'],
    sourceOwners: ['signing_runtime'],
    placeholderKeys: ['buyer_signature', 'buyer_initials', 'seller_signature', 'seller_initials', 'signed_date'],
    blankRenderPolicy: 'runtime_generated',
    fallbackText: 'Signature fields generated at signing runtime',
    layout: {
      renderMode: 'signature_zone_only',
      suppressSectionBody: true,
      signatureLayoutContract: OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT,
      height: OTP_BRANDED_SHELL_PAGE_BASELINE.signatureBlockHeight,
      signerColumns: 2,
      initialsPlacement: 'page_footer_margin',
      initialsRequiredOnEveryPage: true,
      datePlacement: 'signature_zone',
    },
    signing: {
      planned_fields: [
        { signer_role: 'purchaser_1', field_type: 'signature', required: true },
        { signer_role: 'purchaser_1', field_type: 'initial', required: true, repeat: 'every_page' },
        { signer_role: 'purchaser_1', field_type: 'date', required: true },
        { signer_role: 'seller', field_type: 'signature', required: true },
        { signer_role: 'seller', field_type: 'initial', required: true, repeat: 'every_page' },
        { signer_role: 'seller', field_type: 'date', required: true },
      ],
    },
  }),
  shellSlot({
    key: 'development_signature_zone',
    label: 'New development signature zone',
    slotType: 'signature_zone',
    region: 'signature',
    sortOrder: 100,
    variants: ['new_development'],
    sourceOwners: ['signing_runtime'],
    placeholderKeys: [
      'buyer_signature',
      'buyer_initials',
      'developer_signature',
      'developer_initials',
      'contractor_signature',
      'contractor_initials',
      'agent_signature',
      'agent_initials',
      'signed_date',
    ],
    blankRenderPolicy: 'runtime_generated',
    fallbackText: 'Signature fields generated at signing runtime',
    layout: {
      renderMode: 'signature_zone_only',
      suppressSectionBody: true,
      signatureLayoutContract: OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT,
      height: OTP_BRANDED_SHELL_PAGE_BASELINE.signatureBlockHeight,
      signerColumns: 2,
      initialsPlacement: 'page_footer_margin',
      initialsRequiredOnEveryPage: true,
      datePlacement: 'signature_zone',
    },
    signing: {
      planned_fields: [
        { signer_role: 'purchaser_1', field_type: 'signature', required: true },
        { signer_role: 'purchaser_1', field_type: 'initial', required: true, repeat: 'every_page' },
        { signer_role: 'purchaser_1', field_type: 'date', required: true },
        { signer_role: 'developer_authorised_signatory', field_type: 'signature', required: true },
        { signer_role: 'developer_authorised_signatory', field_type: 'initial', required: true, repeat: 'every_page' },
        { signer_role: 'developer_authorised_signatory', field_type: 'date', required: true },
        { signer_role: 'contractor_authorised_signatory', field_type: 'signature', required: true },
        { signer_role: 'contractor_authorised_signatory', field_type: 'initial', required: true, repeat: 'every_page' },
        { signer_role: 'contractor_authorised_signatory', field_type: 'date', required: true },
        { signer_role: 'agent', field_type: 'signature', required: true },
        { signer_role: 'agent', field_type: 'initial', required: true, repeat: 'every_page' },
        { signer_role: 'agent', field_type: 'date', required: true },
      ],
    },
  }),
])

export function listOtpBrandedShellSlots({ variant = '', region = '', slotType = '' } = {}) {
  const normalizedVariant = normalizeOtpDocumentVariant(variant)
  const normalizedRegion = normalizeKey(region)
  const normalizedSlotType = normalizeKey(slotType)
  return OTP_BRANDED_SHELL_SLOTS
    .filter((slot) => {
      if (normalizedVariant && !slot.variants.includes(normalizedVariant)) return false
      if (normalizedRegion && normalizeKey(slot.region) !== normalizedRegion) return false
      if (normalizedSlotType && normalizeKey(slot.slotType) !== normalizedSlotType) return false
      return true
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
}

export function buildOtpBrandedShellManifest({ variant = 'resale_existing_property' } = {}) {
  const documentVariant = normalizeOtpDocumentVariant(variant) || 'resale_existing_property'
  const definition = OTP_DOCUMENT_VARIANTS.find((item) => item.key === documentVariant)
  const slots = listOtpBrandedShellSlots({ variant: documentVariant })
  return {
    version: OTP_TEMPLATE_BRANDED_SHELL_VERSION,
    layoutContract: OTP_BRANDED_SHELL_LAYOUT_CONTRACT,
    signatureLayoutContract: OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT,
    documentVariant,
    variantLabel: definition?.label || documentVariant,
    slots,
    placeholderKeys: Array.from(new Set(slots.flatMap((slot) => slot.placeholderKeys))),
    sourceOwners: Array.from(new Set(slots.flatMap((slot) => slot.sourceOwners))),
  }
}

export function estimateOtpBrandedShellLayout({ variant = 'resale_existing_property', baseline = OTP_BRANDED_SHELL_PAGE_BASELINE } = {}) {
  const manifest = buildOtpBrandedShellManifest({ variant })
  const headerSlots = manifest.slots.filter((slot) => slot.slotType === 'header' || slot.slotType === 'header_details')
  const signatureSlots = manifest.slots.filter((slot) => slot.slotType === 'signature_zone')
  const summarySlots = manifest.slots.filter((slot) => slot.slotType === 'summary_band')
  const headerHeight = Math.max(...headerSlots.map((slot) => Number(slot.layout.height || 0)), baseline.headerHeight)
  const summaryHeight = Math.max(...summarySlots.map((slot) => Number(slot.layout.maxHeight || slot.layout.height || 0)), 0)
  const signatureHeight = Math.max(...signatureSlots.map((slot) => Number(slot.layout.height || 0)), baseline.signatureBlockHeight)
  const reservedFirstPageHeight = headerHeight + baseline.titleBandHeight + summaryHeight + signatureHeight + baseline.footerHeight
  const availableFirstPageHeight = baseline.pageHeight - (baseline.margin * 2)

  return {
    variant: manifest.documentVariant,
    slotCount: manifest.slots.length,
    headerHeight,
    summaryHeight,
    signatureHeight,
    footerHeight: baseline.footerHeight,
    reservedFirstPageHeight,
    availableFirstPageHeight,
    bodyTop: baseline.bodyTop,
    footerSafeY: baseline.footerSafeY,
    firstPageHasClauseSpace: reservedFirstPageHeight < availableFirstPageHeight,
  }
}

function addCheck(checks, pass, code, detail, severity = 'blocking') {
  checks.push({
    code,
    pass: Boolean(pass),
    severity,
    detail,
  })
}

function buildChecks({ manifests = [], layoutEstimates = [] } = {}) {
  const checks = []
  const ownerKeys = new Set(OTP_DATA_SOURCE_OWNERS.map((owner) => owner.key))
  const slots = manifests.flatMap((manifest) => manifest.slots)
  const allPlaceholderKeys = Array.from(new Set(slots.flatMap((slot) => slot.placeholderKeys)))
  const canonicalGaps = allPlaceholderKeys.filter((key) => !getCanonicalMergeFieldDefinition(key, { packetType: 'otp' }))
  const sourceOwnerGaps = Array.from(new Set(slots.flatMap((slot) => slot.sourceOwners))).filter((owner) => !ownerKeys.has(owner))
  const missingLayoutContracts = slots.filter((slot) => slot.layout.contract !== OTP_BRANDED_SHELL_LAYOUT_CONTRACT).map((slot) => slot.key)
  const unsafeRequiredSlots = slots.filter((slot) => slot.required && !normalizeText(slot.fallbackText) && slot.blankRenderPolicy !== 'runtime_generated').map((slot) => slot.key)
  const unsafeOptionalSlots = slots.filter((slot) => !slot.required && !['fallback_or_hide', 'hide_when_empty', 'runtime_generated'].includes(slot.blankRenderPolicy)).map((slot) => slot.key)
  const forbiddenBuyerOwnerMap = new Map([
    ['organisation_logo_url', 'organisation_agent_settings'],
    ['transfer_attorney_company_name', 'conveyancer_transfer_assignment'],
    ['trust_account_recipient', 'conveyancer_transfer_assignment'],
    ['developer_name', 'development_setup'],
    ['agent_ffc_number', 'organisation_agent_settings'],
  ])
  const buyerOwnedForbidden = slots
    .filter((slot) => slot.placeholderKeys.some((key) => {
      const expectedOwner = forbiddenBuyerOwnerMap.get(key)
      return expectedOwner && (!slot.sourceOwners.includes(expectedOwner) || slot.sourceOwners.every((owner) => owner === 'buyer_onboarding'))
    }))
    .map((slot) => slot.key)
  const topLeftLogo = slots.some((slot) => slot.key === 'brand_header' && slot.region === 'top_left' && slot.placeholderKeys.includes('organisation_logo_url') && slot.layout.logoPlacement === 'top_left')
  const topRightDetails = slots.some((slot) => slot.key === 'document_header_details' && slot.region === 'top_right' && slot.placeholderKeys.includes('otp_document_variant') && slot.layout.detailsPlacement === 'top_right')
  const topRightCompanyDetails = slots.some((slot) => (
    slot.key === 'document_header_details' &&
    slot.region === 'top_right' &&
    slot.layout.companyDetailsPlacement === 'top_right' &&
    [
      'organisation_trading_name',
      'organisation_legal_name',
      'organisation_registration_number',
      'organisation_registered_address',
      'agent_full_name',
      'agent_email',
      'agent_phone',
    ].every((key) => slot.placeholderKeys.includes(key))
  ))
  const footerLeft = slots.some((slot) => (
    slot.key === 'agency_footer_left' &&
    slot.region === 'bottom_left' &&
    slot.layout.footerPlacement === 'bottom_left' &&
    slot.layout.align === 'left' &&
    slot.placeholderKeys.includes('organisation_trading_name')
  ))
  const footerMiddle = slots.some((slot) => (
    slot.key === 'page_number_footer_middle' &&
    slot.region === 'bottom_middle' &&
    slot.slotType === 'footer_page_number' &&
    slot.sourceOwners.includes('rendering_runtime') &&
    slot.blankRenderPolicy === 'runtime_generated' &&
    slot.layout.footerPlacement === 'bottom_middle' &&
    slot.layout.align === 'center' &&
    slot.layout.pageNumberFormat === 'Page {page} of {totalPages}'
  ))
  const footerRight = slots.some((slot) => (
    slot.key === 'website_footer_right' &&
    slot.region === 'bottom_right' &&
    slot.layout.footerPlacement === 'bottom_right' &&
    slot.layout.align === 'right' &&
    slot.placeholderKeys.includes('organisation_website')
  ))

  addCheck(checks, topLeftLogo, 'PHASE5_TOP_LEFT_LOGO_SLOT_PRESENT', 'OTP shell has a top-left organisation logo slot with text fallback.')
  addCheck(checks, topRightDetails, 'PHASE5_TOP_RIGHT_DETAILS_SLOT_PRESENT', 'OTP shell has top-right route, reference and template details.')
  addCheck(checks, topRightCompanyDetails, 'PHASE6_COMPANY_DETAILS_TOP_RIGHT_PRESENT', 'Native PDF shell has top-right organisation, registration, address and agent details.')
  addCheck(checks, footerLeft, 'PHASE6_FOOTER_AGENCY_NAME_BOTTOM_LEFT_PRESENT', 'Native PDF shell renders agency/trading name in the bottom-left footer region.')
  addCheck(checks, footerMiddle, 'PHASE6_FOOTER_PAGE_NUMBER_BOTTOM_MIDDLE_PRESENT', 'Native PDF shell reserves runtime page number and total page count in the bottom-middle footer region.')
  addCheck(checks, footerRight, 'PHASE6_FOOTER_WEBSITE_BOTTOM_RIGHT_PRESENT', 'Native PDF shell renders organisation website in the bottom-right footer region.')
  addCheck(checks, topLeftLogo && topRightCompanyDetails && footerLeft && footerMiddle && footerRight, 'PHASE6_REFERENCE_BRANDED_CHROME_COMPLETE', 'Phase 1 reference branded chrome requirements are all represented in the native PDF shell.')
  addCheck(checks, manifests.length === 2 && manifests.some((item) => item.documentVariant === 'resale_existing_property') && manifests.some((item) => item.documentVariant === 'new_development'), 'PHASE5_RESALE_AND_DEVELOPMENT_SHELLS_PRESENT', 'OTP shell resolves both resale and new development manifests.')
  addCheck(checks, canonicalGaps.length === 0, 'PHASE5_SHELL_TOKENS_CANONICAL', canonicalGaps.length ? `Missing canonical OTP merge fields: ${canonicalGaps.join(', ')}` : 'Every shell placeholder is registered as an OTP merge field.')
  addCheck(checks, sourceOwnerGaps.length === 0, 'PHASE5_SHELL_SOURCE_OWNERS_KNOWN', sourceOwnerGaps.length ? `Unknown source owners: ${sourceOwnerGaps.join(', ')}` : 'Every shell slot has known Phase 2 source ownership.')
  addCheck(checks, missingLayoutContracts.length === 0, 'PHASE5_LAYOUT_CONTRACT_ON_EVERY_SLOT', missingLayoutContracts.length ? `Missing layout contract: ${missingLayoutContracts.join(', ')}` : 'Every shell slot carries the branded PDF shell layout contract.')
  addCheck(checks, unsafeRequiredSlots.length === 0 && unsafeOptionalSlots.length === 0, 'PHASE5_BLANK_RENDER_RISK_CONTROLLED', [...unsafeRequiredSlots, ...unsafeOptionalSlots].length ? `Unsafe slots: ${[...unsafeRequiredSlots, ...unsafeOptionalSlots].join(', ')}` : 'Required slots have fallbacks and optional slots are blank-safe.')
  addCheck(checks, buyerOwnedForbidden.length === 0, 'PHASE5_BUYER_ONBOARDING_NOT_DUMPING_GROUND', buyerOwnedForbidden.length ? `Buyer-owned forbidden shell data: ${buyerOwnedForbidden.join(', ')}` : 'Buyer onboarding does not own branding, transfer, developer, agent FFC or trust-account shell data.')

  for (const manifest of manifests) {
    const signatureSlots = manifest.slots.filter((slot) => slot.slotType === 'signature_zone')
    const lastSlot = manifest.slots[manifest.slots.length - 1]
    addCheck(checks, signatureSlots.length === 1, `PHASE5_${normalizeKey(manifest.documentVariant).toUpperCase()}_SINGLE_SIGNATURE_ZONE`, `${manifest.variantLabel} has exactly one signature zone.`)
    addCheck(checks, lastSlot?.slotType === 'signature_zone', `PHASE5_${normalizeKey(manifest.documentVariant).toUpperCase()}_SIGNATURE_ZONE_LAST`, `${manifest.variantLabel} keeps the signature zone last.`)
    addCheck(checks, signatureSlots.every((slot) => slot.layout.signatureLayoutContract === OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT && slot.layout.suppressSectionBody === true), `PHASE5_${normalizeKey(manifest.documentVariant).toUpperCase()}_SIGNATURE_LAYOUT_BOUND`, `${manifest.variantLabel} signature zone is bound to the OTP route-aware signature layout contract.`)
  }

  const resale = manifests.find((manifest) => manifest.documentVariant === 'resale_existing_property')
  const development = manifests.find((manifest) => manifest.documentVariant === 'new_development')
  addCheck(checks, Boolean(resale?.slots.some((slot) => slot.key === 'resale_transaction_summary' && slot.placeholderKeys.includes('seller_full_name'))), 'PHASE5_RESALE_SUMMARY_USES_SELLER', 'Resale shell summary uses seller and existing-property details.')
  addCheck(checks, Boolean(development?.slots.some((slot) => slot.key === 'development_transaction_summary' && slot.placeholderKeys.includes('developer_name') && slot.placeholderKeys.includes('development_name'))), 'PHASE5_DEVELOPMENT_SUMMARY_USES_DEVELOPER', 'New development shell summary uses developer, development and unit details.')
  addCheck(checks, Boolean(development?.slots.some((slot) => slot.slotType === 'signature_zone' && slot.placeholderKeys.includes('developer_signature') && !slot.placeholderKeys.includes('seller_signature'))), 'PHASE5_DEVELOPMENT_SIGNATURE_NOT_RESALE_SIGNATURE', 'New development shell uses developer signature instead of resale seller signature.')
  addCheck(checks, layoutEstimates.every((estimate) => estimate.firstPageHasClauseSpace), 'PHASE5_FIRST_PAGE_HAS_CLAUSE_SPACE', 'Reserved shell chrome leaves space for legal clauses on the first page.')

  return checks
}

export function buildOtpBrandedShellAudit({ checkedAt = new Date().toISOString() } = {}) {
  const manifests = OTP_DOCUMENT_VARIANTS.map((variant) => buildOtpBrandedShellManifest({ variant: variant.key }))
  const layoutEstimates = OTP_DOCUMENT_VARIANTS.map((variant) => estimateOtpBrandedShellLayout({ variant: variant.key }))
  const checks = buildChecks({ manifests, layoutEstimates })
  const blockers = checks.filter((check) => !check.pass && check.severity === 'blocking')
  const warnings = checks.filter((check) => !check.pass && check.severity !== 'blocking')

  return {
    version: OTP_TEMPLATE_BRANDED_SHELL_VERSION,
    checkedAt,
    mutatedData: false,
    layoutContract: OTP_BRANDED_SHELL_LAYOUT_CONTRACT,
    signatureLayoutContract: OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT,
    status: blockers.length ? 'OTP_BRANDED_SHELL_REMEDIATION_REQUIRED' : 'OTP_BRANDED_SHELL_READY_FOR_CONTENT_RULES',
    summary: {
      variantCount: manifests.length,
      slotCount: OTP_BRANDED_SHELL_SLOTS.length,
      canonicalPlaceholderCount: Array.from(new Set(OTP_BRANDED_SHELL_SLOTS.flatMap((slot) => slot.placeholderKeys))).length,
      topLeftLogo: checks.find((check) => check.code === 'PHASE5_TOP_LEFT_LOGO_SLOT_PRESENT')?.pass === true,
      topRightDetails: checks.find((check) => check.code === 'PHASE5_TOP_RIGHT_DETAILS_SLOT_PRESENT')?.pass === true,
      topRightCompanyDetails: checks.find((check) => check.code === 'PHASE6_COMPANY_DETAILS_TOP_RIGHT_PRESENT')?.pass === true,
      footerAgencyLeft: checks.find((check) => check.code === 'PHASE6_FOOTER_AGENCY_NAME_BOTTOM_LEFT_PRESENT')?.pass === true,
      footerPageNumberMiddle: checks.find((check) => check.code === 'PHASE6_FOOTER_PAGE_NUMBER_BOTTOM_MIDDLE_PRESENT')?.pass === true,
      footerWebsiteRight: checks.find((check) => check.code === 'PHASE6_FOOTER_WEBSITE_BOTTOM_RIGHT_PRESENT')?.pass === true,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    },
    checks,
    blockers,
    warnings,
    manifests,
    layoutEstimates,
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

export function formatOtpBrandedShellAuditMarkdown(report = buildOtpBrandedShellAudit()) {
  return [
    '# OTP Template vNext Phase 6 Branded PDF Shell',
    '',
    `Generated: ${report.checkedAt}`,
    `Version: ${report.version}`,
    `Status: ${report.status}`,
    `Mutated data: ${report.mutatedData === false ? 'false' : 'unknown'}`,
    '',
    '## Summary',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Variants', report.summary.variantCount],
        ['Shell slots', report.summary.slotCount],
        ['Canonical placeholders', report.summary.canonicalPlaceholderCount],
        ['Top-left logo', report.summary.topLeftLogo ? 'yes' : 'no'],
        ['Top-right details', report.summary.topRightDetails ? 'yes' : 'no'],
        ['Top-right company details', report.summary.topRightCompanyDetails ? 'yes' : 'no'],
        ['Footer agency left', report.summary.footerAgencyLeft ? 'yes' : 'no'],
        ['Footer page number middle', report.summary.footerPageNumberMiddle ? 'yes' : 'no'],
        ['Footer website right', report.summary.footerWebsiteRight ? 'yes' : 'no'],
        ['Blockers', report.summary.blockerCount],
        ['Warnings', report.summary.warningCount],
      ],
    ),
    '',
    '## Shell Checks',
    '',
    table(
      ['Check', 'Pass', 'Detail'],
      report.checks.map((check) => [check.code, check.pass ? 'yes' : 'no', check.detail]),
    ),
    '',
    '## Route Manifests',
    '',
    table(
      ['Variant', 'Slots', 'Placeholders', 'Source Owners'],
      report.manifests.map((manifest) => [
        manifest.variantLabel,
        manifest.slots.map((slot) => slot.key).join(', '),
        manifest.placeholderKeys.join(', '),
        manifest.sourceOwners.join(', '),
      ]),
    ),
    '',
    '## Layout Estimates',
    '',
    table(
      ['Variant', 'Reserved Height', 'Available Height', 'Signature Height', 'Clause Space'],
      report.layoutEstimates.map((estimate) => [
        estimate.variant,
        estimate.reservedFirstPageHeight,
        estimate.availableFirstPageHeight,
        estimate.signatureHeight,
        estimate.firstPageHasClauseSpace ? 'yes' : 'no',
      ]),
    ),
    '',
    '## Boundary',
    '',
    'Phase 6 defines the branded native PDF shell and deterministic shell audit. It does not publish a live template, approve counsel wording, or replace visual inspection of the rendered PDF artifact.',
    '',
  ].join('\n')
}
