import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  CopyPlus,
  Eye,
  FileSignature,
  FileText,
  FlaskConical,
  Layers3,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  Upload,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { renderPacketPreview } from '../../core/documents/packetService'
import {
  buildCanonicalMergeSampleData,
  listCanonicalMergeFields,
  suggestCanonicalMergeFieldKey,
  validateTemplateTokensAgainstRegistry,
} from '../../core/documents/mergeFieldRegistry'
import {
  createDocumentPacketTemplate,
  deleteDocumentPacketTemplate,
  fetchDocumentPacketTemplate,
  listDocumentPacketTemplates,
  listDocumentPlaceholderDefinitions,
  updateDocumentPacketTemplate,
  uploadDocumentPacketTemplateAsset,
  upsertDocumentPlaceholderDefinition,
} from '../../lib/documentPacketsApi'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchOrganisationSettings } from '../../lib/settingsApi'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  settingsFieldClass,
  settingsFieldSpanClass,
  settingsGridClass,
} from './settingsUi'
import { useWorkspace } from '../../context/WorkspaceContext'
import {
  NATIVE_RENDERER_VERSION,
  TEMPLATE_RENDER_MODES,
  normalizeTemplateRenderMode,
  templateHasLegacySource,
} from '../../core/documents/structuredTemplateRenderer'

const SUPPORTED_PACKET_TYPES = [
  {
    key: 'otp',
    label: 'Offer To Purchase',
    shortLabel: 'OTP',
    icon: FileSignature,
    subtitle: 'Template set for offer drafting and buyer signature journeys.',
  },
  {
    key: 'mandate',
    label: 'Mandate Agreement',
    shortLabel: 'Mandate',
    icon: FileText,
    subtitle: 'Template set for seller mandates and listing activation workflows.',
  },
  {
    key: 'commercial_lease',
    label: 'Commercial Lease',
    shortLabel: 'Lease',
    icon: FileText,
    subtitle: 'Template set for commercial leasing mandates and lease workflows.',
  },
  {
    key: 'commercial_sale',
    label: 'Commercial Sale',
    shortLabel: 'Sale',
    icon: FileSignature,
    subtitle: 'Template set for commercial sales mandates and due diligence workflows.',
  },
]

const TEMPLATE_STATUS_OPTIONS = [
  { key: 'draft', label: 'Draft' },
  { key: 'in_review', label: 'In Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'active', label: 'Active' },
  { key: 'deprecated', label: 'Deprecated' },
  { key: 'archived', label: 'Archived' },
]

const PLACEHOLDER_KEY_PATTERN = /^[a-z0-9_.-]+$/i

const TEMPLATE_RENDER_MODE_OPTIONS = [
  { key: TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED, label: 'Native Structured' },
  { key: TEMPLATE_RENDER_MODES.LEGACY_DOCX, label: 'Legacy DOCX' },
]

function getDefaultRenderMode(packetType = 'otp') {
  const normalized = normalizeText(packetType).toLowerCase()
  return normalized === 'mandate' || normalized.startsWith('commercial_')
    ? TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED
    : TEMPLATE_RENDER_MODES.LEGACY_DOCX
}

function getTemplateFormatForMode(renderMode = TEMPLATE_RENDER_MODES.LEGACY_DOCX) {
  return renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? 'html' : 'docx'
}

function createStarterSections(packetType = 'otp') {
  const normalized = normalizeText(packetType).toLowerCase()
  if (normalized === 'mandate') {
    return [
      {
        sectionKey: 'introduction_purpose',
        sectionLabel: 'Introduction and Purpose',
        sectionType: 'legal_text',
        legalText: '{{mandate_introduction_purpose}}',
        placeholderKeysText: 'mandate_introduction_purpose',
        isRequired: true,
        sortOrder: 0,
      },
      {
        sectionKey: 'parties',
        sectionLabel: 'Parties',
        sectionType: 'dynamic_fields',
        legalText: 'Seller: {{seller_full_name}}\nSeller ID: {{seller_id_number}}\nOrganisation: {{organisation_name}}\nAgent: {{agent_full_name}}',
        placeholderKeysText: 'seller_full_name, seller_id_number, organisation_name, agent_full_name, seller_email, seller_phone',
        isRequired: true,
        sortOrder: 1,
      },
      {
        sectionKey: 'property_details',
        sectionLabel: 'Property Details',
        sectionType: 'dynamic_fields',
        legalText: 'Property address: {{property_address}}\nSuburb: {{property_suburb}}\nCity: {{property_city}}\nProperty type: {{property_type}}\nAsking price: {{asking_price}}',
        placeholderKeysText: 'property_address, property_suburb, property_city, property_type, asking_price, purchase_price',
        isRequired: true,
        sortOrder: 2,
      },
      {
        sectionKey: 'mandate_terms',
        sectionLabel: 'Mandate Terms',
        sectionType: 'legal_text',
        legalText: 'Mandate type: {{mandate_type}}\nStart date: {{mandate_start_date}}\nEnd date: {{mandate_end_date}}\nCommission structure: {{commission_structure}}\nVAT handling: {{vat_handling}}\nAuthority: {{mandate_authority_granted}}',
        placeholderKeysText: 'mandate_type, mandate_start_date, mandate_end_date, commission_structure, vat_handling, mandate_authority_granted, mandate_commission_percent',
        isRequired: true,
        sortOrder: 3,
      },
      {
        sectionKey: 'signature_pages',
        sectionLabel: 'Signature Pages',
        sectionType: 'signature_zone',
        legalText: 'Signed by {{seller_full_name}} and {{agent_full_name}}',
        placeholderKeysText: 'seller_full_name, agent_full_name',
        isRequired: true,
        sortOrder: 4,
      },
    ]
  }

  if (normalized.startsWith('commercial_')) {
    const familyLabel = normalized === 'commercial_sale' ? 'Commercial Sales' : 'Commercial Leasing'
    return [
      {
        sectionKey: 'commercial_context',
        sectionLabel: 'Commercial Context',
        sectionType: 'dynamic_fields',
        legalText: 'Transaction type: {{transaction_type}}\nAsset category: {{asset_category}}\nTemplate family: ' + familyLabel,
        placeholderKeysText: 'transaction_type, asset_category',
        isRequired: true,
        sortOrder: 0,
      },
      {
        sectionKey: 'parties',
        sectionLabel: 'Parties',
        sectionType: 'dynamic_fields',
        legalText: 'Landlord / Owner Company: {{landlord_company_name}}\nAsset Manager: {{asset_manager_name}}\nBroker: {{broker_name}}',
        placeholderKeysText: 'landlord_company_name, asset_manager_name, broker_name',
        isRequired: true,
        sortOrder: 1,
      },
      {
        sectionKey: 'asset_details',
        sectionLabel: 'Asset Details',
        sectionType: 'dynamic_fields',
        legalText: 'Property: {{property_name}}\nAddress: {{property_address}}\nGLA / Area: {{gla}}\nRental per m²: {{rental_per_m2}}\nOperating Costs: {{office_operating_costs}}\nSale Price: {{sale_price}}',
        placeholderKeysText: 'property_name, property_address, gla, rental_per_m2, office_operating_costs, sale_price',
        isRequired: true,
        sortOrder: 2,
      },
      {
        sectionKey: 'commercial_terms',
        sectionLabel: 'Commercial Terms',
        sectionType: 'legal_text',
        legalText: 'Mandate type: {{mandate_type}}\nStart date: {{mandate_start_date}}\nExpiry date: {{mandate_expiry_date}}\nCommission: {{commission_percentage}}',
        placeholderKeysText: 'mandate_type, mandate_start_date, mandate_expiry_date, commission_percentage',
        isRequired: true,
        sortOrder: 3,
      },
      {
        sectionKey: 'signature_pages',
        sectionLabel: 'Signature Pages',
        sectionType: 'signature_zone',
        legalText: 'Signed by {{landlord_company_name}} through {{asset_manager_name}} and {{broker_name}}',
        placeholderKeysText: 'landlord_company_name, asset_manager_name, broker_name',
        isRequired: true,
        sortOrder: 4,
      },
    ]
  }

  return [
    {
      sectionKey: 'parties',
      sectionLabel: 'Parties',
      sectionType: 'dynamic_fields',
      legalText: 'Buyer: {{buyer_full_name}}\nSeller: {{seller_full_name}}',
      placeholderKeysText: 'buyer_full_name, seller_full_name',
      isRequired: true,
      sortOrder: 0,
    },
    {
      sectionKey: 'terms',
      sectionLabel: 'Purchase Terms',
      sectionType: 'legal_text',
      legalText: 'Purchase price: {{purchase_price}}',
      placeholderKeysText: 'purchase_price',
      isRequired: true,
      sortOrder: 1,
    },
    {
      sectionKey: 'signatures',
      sectionLabel: 'Signatures',
      sectionType: 'signature_zone',
      legalText: 'Signed by {{buyer_full_name}} and {{seller_full_name}}',
      placeholderKeysText: 'buyer_full_name, seller_full_name',
      isRequired: true,
      sortOrder: 2,
    },
  ]
}

function getTemplateRenderValidation(template = null) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  return metadata.last_render_validation && typeof metadata.last_render_validation === 'object'
    ? metadata.last_render_validation
    : {}
}

function hasExplicitTemplateRenderMode(template = null) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  return Boolean(normalizeText(metadata.render_mode || metadata.renderMode || template?.render_mode || template?.renderMode))
}

function classifyTemplateMigrationState(template = null, packetType = 'mandate') {
  const renderMode = normalizeTemplateRenderMode(template, packetType)
  const validation = getTemplateRenderValidation(template)
  const renderable = validation.renderable === true || validation.isRenderable === true
  const explicitRenderMode = hasExplicitTemplateRenderMode(template)

  if (renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED) {
    return {
      key: renderable ? 'structured_ready_native' : 'structured_incomplete',
      renderMode,
      renderable,
      explicitRenderMode,
      label: renderable ? 'Structured-ready native' : 'Structured-incomplete',
    }
  }

  return {
    key: 'legacy_docx_only',
    renderMode,
    renderable: templateHasLegacySource(template),
    explicitRenderMode,
    label: 'Legacy DOCX only',
  }
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNullableText(value) {
  const text = normalizeText(value)
  return text || null
}

function normalizeTemplateStatus(template = {}) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  const fromMetadata = normalizeText(metadata.lifecycle_status || metadata.template_status).toLowerCase()
  if (fromMetadata) return fromMetadata
  if (template?.is_active === false) return 'archived'
  return template?.is_default ? 'active' : 'draft'
}

function detectTemplateTokenIssues(text = '') {
  const value = String(text || '')
  const openMatches = value.match(/{{/g) || []
  const closeMatches = value.match(/}}/g) || []
  const malformed = []

  const tokenMatches = [...value.matchAll(/{{\s*([^{}]+?)\s*}}/g)]
  const tokens = tokenMatches
    .map((match) => normalizeText(match[1]))
    .filter(Boolean)

  if (openMatches.length !== closeMatches.length) {
    malformed.push('Unbalanced placeholder braces detected.')
  }

  for (const token of tokens) {
    if (!PLACEHOLDER_KEY_PATTERN.test(token)) {
      malformed.push(`Placeholder "${token}" contains unsupported characters.`)
    }
  }

  return {
    tokens,
    malformed,
  }
}

function sectionsFromTemplate(template = null) {
  const sections = Array.isArray(template?.sections) ? template.sections : []
  return sections.map((section, index) => {
    const legalText = String(section.legal_text || section.legalText || '')
    const tokenScan = detectTemplateTokenIssues(legalText)
    const placeholderKeysFromSection = Array.isArray(section.placeholder_keys)
      ? section.placeholder_keys
      : Array.isArray(section.placeholderKeys)
        ? section.placeholderKeys
        : []

    const allPlaceholderKeys = Array.from(
      new Set([...placeholderKeysFromSection.map((item) => normalizeText(item)).filter(Boolean), ...tokenScan.tokens]),
    )

    return {
      id: section.id || null,
      sectionKey: normalizeText(section.section_key || section.sectionKey || `section_${index + 1}`),
      sectionLabel: normalizeText(section.section_label || section.sectionLabel || `Section ${index + 1}`),
      sectionType: normalizeText(section.section_type || section.sectionType || 'legal_text') || 'legal_text',
      legalText,
      placeholderKeys: allPlaceholderKeys,
      placeholderKeysText: allPlaceholderKeys.join(', '),
      isRequired: section.is_required === undefined ? true : Boolean(section.is_required),
      sortOrder: Number.isFinite(Number(section.sort_order)) ? Number(section.sort_order) : index,
    }
  })
}

function toTemplateForm(template = null) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  const packetType = normalizeText(template?.packet_type || template?.packetType || metadata?.packet_type || metadata?.packetType || 'otp')
  const renderMode = normalizeTemplateRenderMode(template, packetType) || getDefaultRenderMode(packetType)

  return {
    templateLabel: normalizeText(template?.template_label || template?.templateLabel),
    description: String(template?.description || ''),
    versionTag: normalizeText(template?.version_tag || template?.versionTag || 'v1') || 'v1',
    renderMode,
    templateFormat: normalizeText(template?.template_format || template?.templateFormat || getTemplateFormatForMode(renderMode)) || getTemplateFormatForMode(renderMode),
    templateStoragePath:
      normalizeText(template?.template_storage_path || metadata.template_storage_path || metadata.templatePath || ''),
    templateStorageBucket:
      normalizeText(template?.template_storage_bucket || metadata.template_storage_bucket || metadata.templateBucket || ''),
    templateFileName:
      normalizeText(template?.template_file_name || metadata.template_file_name || metadata.templateFilename || ''),
    templateOutputBucket:
      normalizeText(template?.template_output_bucket || metadata.template_output_bucket || metadata.outputBucket || ''),
    templateStatus: normalizeTemplateStatus(template),
    isActive: template?.is_active === undefined ? true : Boolean(template?.is_active),
    isDefault: Boolean(template?.is_default),
    sections: sectionsFromTemplate(template),
    metadataJson: metadata,
  }
}

function mapSectionForSave(section = {}, index = 0) {
  const placeholderKeys = String(section.placeholderKeysText || '')
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean)

  return {
    sectionKey: normalizeText(section.sectionKey || `section_${index + 1}`),
    sectionLabel: normalizeText(section.sectionLabel || `Section ${index + 1}`),
    sectionType: normalizeText(section.sectionType || 'legal_text') || 'legal_text',
    legalText: String(section.legalText || ''),
    placeholderKeys,
    isRequired: section.isRequired === undefined ? true : Boolean(section.isRequired),
    sortOrder: Number.isFinite(Number(section.sortOrder)) ? Number(section.sortOrder) : index,
  }
}

function templateSort(left, right) {
  const leftOrg = Boolean(left?.organisation_id)
  const rightOrg = Boolean(right?.organisation_id)
  if (leftOrg !== rightOrg) return leftOrg ? -1 : 1
  const leftDefault = Boolean(left?.is_default)
  const rightDefault = Boolean(right?.is_default)
  if (leftDefault !== rightDefault) return leftDefault ? -1 : 1
  return String(right?.updated_at || '').localeCompare(String(left?.updated_at || ''))
}

function incrementVersionTag(versionTag = 'v1') {
  const normalized = normalizeText(versionTag) || 'v1'
  const match = normalized.match(/^(.*?)(\d+)$/)
  if (!match) return `${normalized}-v2`
  const [, prefix = '', numberPart = '1'] = match
  const nextNumber = Number(numberPart) + 1
  return `${prefix}${nextNumber}`
}

function statusPillClass(status = '') {
  const key = normalizeText(status).toLowerCase()
  if (key === 'active' || key === 'approved' || key === 'signed') {
    return 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]'
  }
  if (key === 'in_review' || key === 'deprecated') {
    return 'border-[#f4e2bf] bg-[#fff8ec] text-[#7d520d]'
  }
  if (key === 'archived') {
    return 'border-[#e2eaf3] bg-[#f7fafc] text-[#5f7288]'
  }
  return 'border-[#d7e2ee] bg-white text-[#4f637a]'
}

function formatRenderModeLabel(renderMode = TEMPLATE_RENDER_MODES.LEGACY_DOCX) {
  return renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? 'Built in app' : 'File based'
}

function getTemplateReadinessTone(classification = {}) {
  if (classification.key === 'structured_ready_native') return 'success'
  if (classification.key === 'legacy_docx_only') return 'info'
  return 'warning'
}

function getTemplateReadinessLabel(classification = {}) {
  if (classification.key === 'structured_ready_native') return 'Ready'
  if (classification.key === 'structured_incomplete') return 'Needs attention'
  if (classification.key === 'legacy_docx_only') return 'Legacy'
  return classification.label || 'Draft'
}

function canDeleteTemplateRecord(template = null, siblingTemplates = []) {
  if (!template?.organisation_id) return false
  if (template?.is_default) {
    return (siblingTemplates || []).some((row) => row?.organisation_id && row.id !== template.id)
  }
  const status = normalizeTemplateStatus(template)
  return ['draft', 'in_review', 'deprecated', 'archived'].includes(status)
}

function getReplacementTemplateForDelete(template = null, siblingTemplates = []) {
  if (!template?.is_default) return null
  return [...(siblingTemplates || [])]
    .filter((row) => row?.organisation_id && row.id !== template.id)
    .sort((left, right) => {
      const leftActive = Boolean(left?.is_active)
      const rightActive = Boolean(right?.is_active)
      if (leftActive !== rightActive) return leftActive ? -1 : 1
      return templateSort(left, right)
    })[0] || null
}

function summarizeTemplateValidation({
  form = {},
  placeholderRegistry = [],
  packetType = 'otp',
  canonicalFields = [],
} = {}) {
  const blockers = []
  const warnings = []
  const normalizedPacketType = normalizeText(packetType).toLowerCase() || 'otp'
  const renderMode = normalizeText(form.renderMode || getDefaultRenderMode(normalizedPacketType)) || getDefaultRenderMode(normalizedPacketType)
  const usesNativeRenderer = renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED

  if (!normalizeText(form.templateLabel)) {
    blockers.push('Template label is required.')
  }

  if (!normalizeText(form.versionTag)) {
    blockers.push('Version tag is required.')
  }

  if (!usesNativeRenderer && !normalizeText(form.templateStoragePath)) {
    warnings.push('DOCX storage path is not configured yet. Generation will fail until a template file path is saved.')
  }

  const sections = Array.isArray(form.sections) ? form.sections : []
  if (!sections.length) {
    blockers.push('Add at least one template section.')
  }

  const tokenSet = new Set()
  const malformedTokens = []
  const duplicateSectionKeys = new Set()
  const seenSectionKeys = new Set()
  const legacyTokens = []

  for (const section of sections) {
    const sectionKey = normalizeText(section.sectionKey)
    if (!sectionKey) {
      blockers.push('Every section must have a section key.')
    }
    if (sectionKey && seenSectionKeys.has(sectionKey)) {
      duplicateSectionKeys.add(sectionKey)
    }
    seenSectionKeys.add(sectionKey)

    const legalScan = detectTemplateTokenIssues(section.legalText)
    for (const token of legalScan.tokens) tokenSet.add(token)
    for (const issue of legalScan.malformed) {
      malformedTokens.push(`${normalizeText(section.sectionLabel || section.sectionKey || 'Section')}: ${issue}`)
    }

    for (const token of String(section.placeholderKeysText || '')
      .split(',')
      .map((item) => normalizeText(item))
      .filter(Boolean)) {
      if (!PLACEHOLDER_KEY_PATTERN.test(token)) {
        malformedTokens.push(`${normalizeText(section.sectionLabel || section.sectionKey || 'Section')}: Placeholder "${token}" is malformed.`)
      } else {
        tokenSet.add(token)
      }
    }
  }

  if (duplicateSectionKeys.size) {
    blockers.push(`Duplicate section keys found: ${Array.from(duplicateSectionKeys).join(', ')}`)
  }

  if (malformedTokens.length) {
    blockers.push(...malformedTokens)
  }

  const requiredRegistryKeys = new Set(
    (placeholderRegistry || [])
      .filter((item) => {
        if (item?.is_active === false || !item?.is_required_default) return false
        const registryPacketType = normalizeText(item?.packet_type || item?.packetType).toLowerCase()
        return !registryPacketType || registryPacketType === normalizedPacketType
      })
      .map((item) => normalizeText(item.placeholder_key))
      .filter(Boolean),
  )

  const tokenValidation = validateTemplateTokensAgainstRegistry({
    tokens: Array.from(tokenSet),
    packetType: normalizedPacketType,
  })
  for (const row of tokenValidation.deprecated || []) {
    legacyTokens.push(row)
  }

  const canonicalRequired = new Set(
    (canonicalFields || [])
      .filter((field) => field.required)
      .map((field) => normalizeText(field.key))
      .filter(Boolean),
  )
  const effectiveRequired = new Set([...requiredRegistryKeys, ...canonicalRequired])

  const missingRequired = Array.from(effectiveRequired).filter((key) => {
    const existsDirectly = tokenSet.has(key)
    const existsByAlias = (tokenValidation.normalized || []).includes(key)
    return !existsDirectly && !existsByAlias
  })
  if (missingRequired.length) {
    warnings.push(`Required merge fields are missing from template sections: ${missingRequired.map((key) => `{{${key}}}`).join(', ')}.`)
  }

  const unknownTokens = (tokenValidation.unknown || []).map((row) => row.token)
  if (unknownTokens.length) {
    const withSuggestions = (tokenValidation.unknown || []).map((row) => {
      const suggestion = row.suggested || suggestCanonicalMergeFieldKey(row.token, { packetType })
      return suggestion ? `Unknown field {{${row.token}}}. Suggested replacement: {{${suggestion}}}` : `Unknown field {{${row.token}}}. Add it to the registry or replace it.`
    })
    warnings.push(withSuggestions.join(' '))
  }

  if (legacyTokens.length) {
    warnings.push(
      `Deprecated merge fields detected: ${legacyTokens
        .map((row) => `{{${row.token}}} should become {{${row.canonicalKey}}}`)
        .join('; ')}. These still resolve through aliases for now.`,
    )
  }

  const renderable = blockers.length === 0
  if (usesNativeRenderer && missingRequired.length > 0) {
    warnings.push('Native structured template is missing recommended merge fields, but it can still be activated and generated.')
  }

  return {
    blockers,
    warnings,
    renderable,
    usesNativeRenderer,
    renderMode,
    sectionCount: sections.length,
    tokenCount: tokenSet.size,
    tokenList: Array.from(tokenSet).sort(),
    unknownTokens,
    missingRequired,
    deprecatedTokens: legacyTokens,
    normalizedTokenList: tokenValidation.normalized || [],
    lastValidatedAt: new Date().toISOString(),
  }
}

function buildTemplateMetadata(form = {}, existingMetadata = {}, uploadMeta = null) {
  const renderMode = normalizeText(form.renderMode || TEMPLATE_RENDER_MODES.LEGACY_DOCX) || TEMPLATE_RENDER_MODES.LEGACY_DOCX
  const nextMetadata = {
    ...(existingMetadata && typeof existingMetadata === 'object' ? existingMetadata : {}),
    lifecycle_status: normalizeText(form.templateStatus || 'draft') || 'draft',
    render_mode: renderMode,
    template_storage_path: normalizeNullableText(form.templateStoragePath),
    template_storage_bucket: normalizeNullableText(form.templateStorageBucket),
    template_file_name: normalizeNullableText(form.templateFileName),
    template_output_bucket: normalizeNullableText(form.templateOutputBucket),
    native_renderer_version: renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? NATIVE_RENDERER_VERSION : null,
    last_render_validation: form.validationSummary && typeof form.validationSummary === 'object'
      ? {
          renderable: Boolean(form.validationSummary.renderable),
          blockingIssues: Array.isArray(form.validationSummary.blockers) ? form.validationSummary.blockers : [],
          warnings: Array.isArray(form.validationSummary.warnings) ? form.validationSummary.warnings : [],
          tokenCount: Number(form.validationSummary.tokenCount || 0),
          sectionCount: Number(form.validationSummary.sectionCount || 0),
          missingRequired: Array.isArray(form.validationSummary.missingRequired) ? form.validationSummary.missingRequired : [],
          deprecatedTokens: Array.isArray(form.validationSummary.deprecatedTokens) ? form.validationSummary.deprecatedTokens : [],
          resolvedPlaceholderKeys: Array.isArray(form.validationSummary.normalizedTokenList)
            ? form.validationSummary.normalizedTokenList
            : [],
          validatedAt: form.validationSummary.lastValidatedAt || new Date().toISOString(),
        }
      : null,
  }

  if (uploadMeta && typeof uploadMeta === 'object') {
    nextMetadata.template_uploaded_at = new Date().toISOString()
    nextMetadata.template_upload_source = 'settings_legal_templates'
  }

  return nextMetadata
}

function buildSamplePreviewContext(packetType = 'otp') {
  const normalized = normalizeText(packetType).toLowerCase()
  if (normalized === 'mandate') {
    return {
      lead: {
        lead_name: 'Sample Seller',
        seller_name: 'Sample Seller',
        seller_email: 'seller@example.com',
        seller_phone: '0820000000',
      },
      mandateDraft: {
        selling_price: 4500000,
        mandate_type: 'sole',
        special_conditions: 'No special conditions captured in sample mode.',
      },
      generatedByName: 'Bridge Template Tester',
      generatedByRole: 'principal',
    }
  }

  if (normalized.startsWith('commercial_')) {
    return {
      packetType: normalized,
      documentContextType: 'commercial',
      commercialTransactionType: normalized === 'commercial_sale' ? 'sale' : 'lease',
      assetCategory: 'office',
      landlord: {
        name: 'Harcourts Capital Properties',
        registration_number: '2024/123456/07',
        vat_number: '4123456789',
        registered_address: '100 Main Road, Sandton',
        postal_address: 'PO Box 1000, Sandton, 2196',
        phone: '011 000 0000',
        email: 'landlord@example.com',
      },
      assetManager: {
        full_name: 'Jordan Parker',
        position: 'Asset Manager',
        email: 'manager@example.com',
        mobile: '082 555 1234',
        id_number: '8001015009087',
        signing_capacity: 'Authorised Signatory',
        authorityConfirmed: true,
      },
      property: {
        property_name: 'Bridge Towers',
        address: '100 Main Road, Sandton',
        building_grade: 'A Grade',
        gla_m2: 1250,
        office_area_m2: 750,
        parking_bays: 18,
        asking_rental_per_m2: 165,
        operating_costs: 22,
        asking_sale_price: 12500000,
        rates_and_taxes: 12400,
        lease_term_months: 36,
        escalation_percentage: 8,
        availability_date: '2026-08-01',
        occupation_date: '2026-09-01',
      },
      broker: {
        full_name: 'Alex Broker',
        email: 'broker@example.com',
        mobile: '082 000 0000',
      },
      mandateType: normalized === 'commercial_sale' ? 'Sales Mandate' : 'Leasing Mandate',
      commissionPercentage: '7.5%',
      mandateStartDate: '2026-06-01',
      mandateExpiryDate: '2026-12-31',
      generatedByName: 'Bridge Template Tester',
      generatedByRole: 'principal',
    }
  }

  return {
    transaction: {
      unit_number: 'Unit 12',
      development_name: 'Sample Estate',
      sale_price: 3250000,
      purchase_price: 3250000,
      stage: 'Offer',
      finance_type: 'bond',
      buyer_name: 'Sample Buyer',
    },
    unit: {
      unit_number: '12',
      development_name: 'Sample Estate',
      erf_number: 'ERF-1204',
    },
    buyer: {
      full_name: 'Sample Buyer',
      email: 'buyer@example.com',
      phone: '0830000000',
    },
    specialConditions: 'Sample preview condition.',
    generatedByName: 'Bridge Template Tester',
    generatedByRole: 'principal',
  }
}

function TemplateStatusPill({ status = 'draft', children = null }) {
  const label = children || TEMPLATE_STATUS_OPTIONS.find((item) => item.key === status)?.label || 'Draft'
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.12em] ${statusPillClass(status)}`}>
      {label}
    </span>
  )
}

const STUDIO_TABS = [
  { key: 'template', label: 'Template' },
  { key: 'variables', label: 'Variables' },
  { key: 'settings', label: 'Settings' },
  { key: 'preview', label: 'Test & Preview' },
  { key: 'activity', label: 'Activity' },
]

const STUDIO_VARIABLE_GROUPS = [
  { key: 'buyer', label: 'Buyer', categories: ['Buyer Details'] },
  { key: 'seller', label: 'Seller', categories: ['Seller Details'] },
  { key: 'property', label: 'Property', categories: ['Property Details'] },
  { key: 'finance', label: 'Finance', categories: ['Transaction Terms', 'Mandate Terms'] },
  { key: 'commission', label: 'Commission', categories: ['Commission'] },
  {
    key: 'more',
    label: 'More Variables',
    categories: [
      'Agent / Agency',
      'Developer',
      'Attorney / Conveyancer',
      'Signing',
      'Branding',
      'Commercial Context',
      'Landlord / Owner Company',
      'Asset Manager / Signatory',
      'Commercial / Office',
      'Industrial',
      'Retail',
      'Agricultural',
      'Document Metadata',
    ],
  },
]

const studioPrimaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-[16px] bg-[#0a66ff] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(10,102,255,0.22)] transition hover:bg-[#0958da] disabled:cursor-not-allowed disabled:opacity-60'
const studioSecondaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-[16px] border border-[#dbe7f3] bg-white px-4 py-2.5 text-sm font-semibold text-[#102033] shadow-[0_12px_24px_rgba(15,23,42,0.04)] transition hover:border-[#bfd5f5] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60'
const studioQuietButtonClass = 'inline-flex items-center justify-center gap-2 rounded-[16px] border border-transparent bg-[#f5f8fc] px-4 py-2.5 text-sm font-semibold text-[#51657c] transition hover:border-[#dbe7f3] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60'
const studioDangerButtonClass = 'inline-flex items-center justify-center gap-2 rounded-[16px] border border-[#f3d5d7] bg-white px-4 py-2.5 text-sm font-semibold text-[#b4383e] transition hover:bg-[#fff6f6] disabled:cursor-not-allowed disabled:opacity-60'

function formatDateTime(value = '') {
  const normalized = normalizeText(value)
  if (!normalized) return '—'
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized
  return date.toLocaleString()
}

function formatDateOnly(value = '') {
  const normalized = normalizeText(value)
  if (!normalized) return '—'
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized
  return date.toLocaleDateString()
}

function getTemplateActorLabel(template = null) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  return (
    normalizeText(
      template?.updated_by_name
      || metadata.updated_by_name
      || metadata.updatedByName
      || template?.created_by_name
      || metadata.created_by_name
      || metadata.createdByName,
    )
    || 'Not available'
  )
}

function getVariableGroups(fields = []) {
  return STUDIO_VARIABLE_GROUPS
    .map((group) => ({
      ...group,
      fields: fields.filter((field) => group.categories.includes(normalizeText(field.category))),
    }))
    .filter((group) => group.fields.length)
}

function getSectionVisualState(section = {}, packetType = 'otp') {
  const content = normalizeText(section.legalText)
  const tokenScan = detectTemplateTokenIssues(section.legalText)
  const placeholderKeys = String(section.placeholderKeysText || '')
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean)
  const validation = validateTemplateTokensAgainstRegistry({
    tokens: Array.from(new Set([...tokenScan.tokens, ...placeholderKeys])),
    packetType,
  })

  if (content && tokenScan.malformed.length === 0 && (validation.unknown || []).length === 0) {
    return {
      key: 'complete',
      label: 'Complete',
      icon: <CheckCircle2 size={16} className="text-[#20b26b]" />,
    }
  }

  if (!content && section.isRequired === false) {
    return {
      key: 'optional',
      label: 'Optional',
      icon: <CircleDot size={14} className="text-[#9fb0c4]" />,
    }
  }

  return {
    key: 'attention',
    label: tokenScan.malformed.length || (validation.unknown || []).length ? 'Needs review' : 'Incomplete',
    icon: <AlertTriangle size={15} className="text-[#f5a524]" />,
  }
}

function TemplateStudioPanel({ eyebrow = '', title = '', description = '', actions = null, className = '', children }) {
  return (
    <section className={`rounded-[28px] border border-[#dbe7f3] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.05)] ${className}`.trim()}>
      {(eyebrow || title || description || actions) ? (
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            {eyebrow ? <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7a8da6]">{eyebrow}</p> : null}
            {title ? <h3 className="text-[1.05rem] font-semibold text-[#102033]">{title}</h3> : null}
            {description ? <p className="text-sm leading-6 text-[#6b7c93]">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

function TemplateStudioMetricCard({ label, value, description, tone = 'default' }) {
  const toneClasses = tone === 'success'
    ? 'border-[#d6efe1] bg-[#f5fbf8]'
    : tone === 'warning'
      ? 'border-[#f6e4bf] bg-[#fffaf1]'
      : 'border-[#dbe7f3] bg-white'

  return (
    <div className={`rounded-[22px] border p-4 shadow-[0_12px_24px_rgba(15,23,42,0.04)] ${toneClasses}`}>
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">{label}</p>
      <p className="mt-3 text-[1.8rem] font-semibold leading-none text-[#102033]">{value}</p>
      {description ? <p className="mt-2 text-sm leading-5 text-[#6b7c93]">{description}</p> : null}
    </div>
  )
}

function TemplateStudioTabButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-[16px] px-4 py-2.5 text-sm font-semibold transition',
        active
          ? 'border border-[#bcd6ff] bg-[#eef5ff] text-[#0a66ff] shadow-[0_10px_22px_rgba(10,102,255,0.10)]'
          : 'border border-transparent bg-white/70 text-[#6b7c93] hover:border-[#dbe7f3] hover:text-[#102033]',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

export default function SettingsSigningTemplatesPage({
  templateModuleType = 'agency',
  allowedPacketTypes = ['otp', 'mandate'],
  title = 'Template Studio',
  eyebrow = 'Settings / Legal Templates',
  description = 'Manage document templates, versions, merge fields, previews, and publishing.',
} = {}) {
  const { role } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [deletingTemplate, setDeletingTemplate] = useState(false)
  const [backfillingTemplateModes, setBackfillingTemplateModes] = useState(false)
  const [uploadingTemplate, setUploadingTemplate] = useState(false)
  const [testingTemplate, setTestingTemplate] = useState(false)
  const [savingPlaceholder, setSavingPlaceholder] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [membershipRole, setMembershipRole] = useState('viewer')
  const [packetType, setPacketType] = useState(allowedPacketTypes[0] || 'otp')
  const [templatesByType, setTemplatesByType] = useState({})
  const [placeholdersByType, setPlaceholdersByType] = useState({})
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateDetail, setTemplateDetail] = useState(null)
  const [form, setForm] = useState(toTemplateForm(null))
  const [placeholderForm, setPlaceholderForm] = useState({
    placeholderKey: '',
    entityScope: 'transaction',
    dataType: 'text',
    description: '',
    exampleValue: '',
    isRequiredDefault: false,
    isActive: true,
  })
  const [previewState, setPreviewState] = useState({ loading: false, html: '', warnings: [], critical: [], error: '' })
  const [mergeFieldSearch, setMergeFieldSearch] = useState('')
  const [mergeFieldCategory, setMergeFieldCategory] = useState('all')
  const [activeTab, setActiveTab] = useState('template')
  const [selectedSectionIndex, setSelectedSectionIndex] = useState(0)
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const clauseTextareaRef = useRef(null)

  const canEdit = canManageOrganisationSettings({ appRole: role, membershipRole })
  const visiblePacketTypes = useMemo(() => SUPPORTED_PACKET_TYPES.filter((item) => allowedPacketTypes.includes(item.key)), [allowedPacketTypes])
  const normalizedModuleType = normalizeText(templateModuleType || 'agency').toLowerCase() || 'agency'

  const loadTemplatesAndRegistry = useCallback(async ({
    targetPacketType = allowedPacketTypes[0] || 'otp',
    preferredTemplateId = '',
  } = {}) => {
    const templateRows = await Promise.all(allowedPacketTypes.map(async (type) => ([
      type,
      await listDocumentPacketTemplates({
        packetType: type,
        moduleType: normalizedModuleType,
        includeInactive: true,
      }),
    ])))
    const placeholderRows = await Promise.all(allowedPacketTypes.map(async (type) => ([
      type,
      await listDocumentPlaceholderDefinitions({
        packetType: type,
        includeInactive: true,
      }).catch(() => []),
    ])))

    const nextByType = templateRows.reduce((accumulator, [type, rows]) => {
      accumulator[type] = [...(rows || [])].sort(templateSort)
      return accumulator
    }, {})

    setTemplatesByType(nextByType)
    setPlaceholdersByType(placeholderRows.reduce((accumulator, [type, rows]) => {
      accumulator[type] = rows || []
      return accumulator
    }, {}))

    const selectedList = nextByType[targetPacketType] || []
    if (!selectedList.length) {
      setSelectedTemplateId('')
      setTemplateDetail(null)
      setForm(toTemplateForm(null))
      return
    }

    const currentStillExists = selectedList.some((item) => item.id === preferredTemplateId)
    setSelectedTemplateId(currentStillExists ? preferredTemplateId : selectedList[0].id)
  }, [allowedPacketTypes, normalizedModuleType])

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        setError('')
        const context = await fetchOrganisationSettings()
        if (!active) return
        setMembershipRole(normalizeOrganisationMembershipRole(context?.membershipRole))
        await loadTemplatesAndRegistry({
          targetPacketType: allowedPacketTypes[0] || 'otp',
          preferredTemplateId: '',
        })
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || 'Unable to load legal templates.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [allowedPacketTypes, loadTemplatesAndRegistry])

  useEffect(() => {
    const selectedList = templatesByType[packetType] || []
    if (!selectedList.length) {
      setSelectedTemplateId('')
      setTemplateDetail(null)
      setForm(toTemplateForm(null))
      return
    }

    if (!selectedTemplateId || !selectedList.some((item) => item.id === selectedTemplateId)) {
      setSelectedTemplateId(selectedList[0].id)
    }
  }, [packetType, selectedTemplateId, templatesByType])

  useEffect(() => {
    let active = true
    async function loadDetail() {
      if (!selectedTemplateId) {
        setTemplateDetail(null)
        setForm(toTemplateForm(null))
        setPreviewState({ loading: false, html: '', warnings: [], critical: [], error: '' })
        return
      }

      try {
        setError('')
        const detail = await fetchDocumentPacketTemplate(selectedTemplateId, { includeSections: true })
        if (!active) return
        setTemplateDetail(detail)
        setForm(toTemplateForm(detail))
        setPreviewState({ loading: false, html: '', warnings: [], critical: [], error: '' })
      } catch (detailError) {
        if (active) {
          setError(detailError?.message || 'Unable to load template details.')
        }
      }
    }

    void loadDetail()

    return () => {
      active = false
    }
  }, [selectedTemplateId])

  useEffect(() => {
    setSelectedSectionIndex(0)
    setShowPublishConfirm(false)
  }, [selectedTemplateId])

  useEffect(() => {
    const sectionCount = Array.isArray(form.sections) ? form.sections.length : 0
    if (!sectionCount) {
      if (selectedSectionIndex !== 0) setSelectedSectionIndex(0)
      return
    }
    if (selectedSectionIndex > sectionCount - 1) {
      setSelectedSectionIndex(sectionCount - 1)
    }
  }, [form.sections, selectedSectionIndex])

  const selectedList = useMemo(
    () => templatesByType[packetType] || [],
    [packetType, templatesByType],
  )
  const selectedTemplate = useMemo(
    () => selectedList.find((item) => item.id === selectedTemplateId) || null,
    [selectedList, selectedTemplateId],
  )
  const deletableSiblingTemplates = useMemo(
    () => selectedList.filter((item) => item?.organisation_id && item.id !== selectedTemplateId),
    [selectedList, selectedTemplateId],
  )
  const selectedClassification = useMemo(
    () => classifyTemplateMigrationState(selectedTemplate, packetType),
    [packetType, selectedTemplate],
  )
  const deleteReplacementTemplate = useMemo(
    () => getReplacementTemplateForDelete(selectedTemplate, deletableSiblingTemplates),
    [deletableSiblingTemplates, selectedTemplate],
  )

  const selectedIsOrgOwned = Boolean(selectedTemplate?.organisation_id)
  const migrationReport = useMemo(() => {
    const rows = selectedList.map((template) => ({
      template,
      classification: classifyTemplateMigrationState(template, packetType),
    }))
    return {
      total: rows.length,
      nativeReady: rows.filter((row) => row.classification.key === 'structured_ready_native').length,
      nativeBlocked: rows.filter((row) => row.classification.key === 'structured_incomplete').length,
      legacyDocx: rows.filter((row) => row.classification.key === 'legacy_docx_only').length,
      missingRenderMode: rows.filter((row) => row.template?.organisation_id && !row.classification.explicitRenderMode).length,
      defaultTemplate: rows.find((row) => row.template?.is_default) || null,
      rows,
    }
  }, [packetType, selectedList])
  const placeholderRegistry = useMemo(
    () => placeholdersByType[packetType] || [],
    [packetType, placeholdersByType],
  )
  const canonicalFields = useMemo(
    () => listCanonicalMergeFields({ packetType }),
    [packetType],
  )
  const canonicalSampleMap = useMemo(
    () => buildCanonicalMergeSampleData({ packetType }),
    [packetType],
  )
  const canonicalCategories = useMemo(
    () => ['all', ...Array.from(new Set(canonicalFields.map((row) => normalizeText(row.category)).filter(Boolean)))],
    [canonicalFields],
  )
  const filteredCanonicalFields = useMemo(() => {
    const search = normalizeText(mergeFieldSearch).toLowerCase()
    return canonicalFields.filter((field) => {
      if (mergeFieldCategory !== 'all' && normalizeText(field.category) !== mergeFieldCategory) return false
      if (!search) return true
      return (
        normalizeText(field.key).toLowerCase().includes(search) ||
        normalizeText(field.label).toLowerCase().includes(search) ||
        normalizeText(field.description).toLowerCase().includes(search)
      )
    })
  }, [canonicalFields, mergeFieldCategory, mergeFieldSearch])
  const validationSummary = useMemo(
    () => summarizeTemplateValidation({
      form,
      placeholderRegistry,
      packetType,
      canonicalFields,
    }),
    [canonicalFields, form, packetType, placeholderRegistry],
  )
  const variableGroups = useMemo(
    () => getVariableGroups(canonicalFields),
    [canonicalFields],
  )
  const selectedSection = useMemo(
    () => (Array.isArray(form.sections) ? form.sections[selectedSectionIndex] || null : null),
    [form.sections, selectedSectionIndex],
  )
  const sectionStatuses = useMemo(
    () => (form.sections || []).map((section) => getSectionVisualState(section, packetType)),
    [form.sections, packetType],
  )
  const selectedSectionTokens = useMemo(() => {
    if (!selectedSection) return []
    const tokenScan = detectTemplateTokenIssues(selectedSection.legalText)
    const placeholderKeys = String(selectedSection.placeholderKeysText || '')
      .split(',')
      .map((item) => normalizeText(item))
      .filter(Boolean)
    return Array.from(new Set([...(selectedSection.placeholderKeys || []), ...placeholderKeys, ...tokenScan.tokens]))
  }, [selectedSection])
  const selectedSectionUnknownTokens = useMemo(
    () => validateTemplateTokensAgainstRegistry({ tokens: selectedSectionTokens, packetType }).unknown || [],
    [packetType, selectedSectionTokens],
  )
  const resolvedFieldCount = Math.max(validationSummary.tokenCount - validationSummary.unknownTokens.length, 0)
  const unresolvedFieldCount = validationSummary.unknownTokens.length + validationSummary.missingRequired.length
  const studioStats = useMemo(() => {
    const liveTemplates = selectedList.filter((row) => Boolean(row?.is_default) || normalizeTemplateStatus(row) === 'active').length
    const draftTemplates = selectedList.filter((row) => {
      const status = normalizeTemplateStatus(row)
      return ['draft', 'in_review', 'approved'].includes(status) && !row?.is_default
    }).length
    const needsAttention = migrationReport.rows.filter((row) => (
      row.classification.key === 'structured_incomplete'
      || (!row.classification.explicitRenderMode && row.template?.organisation_id)
    )).length

    return [
      {
        label: 'Total Templates',
        value: migrationReport.total,
        description: 'All versions available for this document type.',
      },
      {
        label: 'Live Templates',
        value: liveTemplates,
        description: 'Currently active defaults and live versions.',
        tone: liveTemplates ? 'success' : 'default',
      },
      {
        label: 'Draft Templates',
        value: draftTemplates,
        description: 'Editable drafts and review-ready versions.',
      },
      {
        label: 'Needs Attention',
        value: needsAttention,
        description: 'Templates with incomplete structured setup.',
        tone: needsAttention ? 'warning' : 'success',
      },
      {
        label: 'Legacy Templates',
        value: migrationReport.legacyDocx,
        description: 'DOCX-based templates still in circulation.',
      },
    ]
  }, [migrationReport.legacyDocx, migrationReport.rows, migrationReport.total, selectedList])
  const liveTemplate = useMemo(
    () => migrationReport.defaultTemplate?.template || selectedList.find((row) => row?.is_default) || null,
    [migrationReport.defaultTemplate, selectedList],
  )
  const studioHealthChecks = useMemo(() => {
    const docxReady = normalizeText(form.renderMode) === TEMPLATE_RENDER_MODES.LEGACY_DOCX
      ? Boolean(normalizeText(form.templateStoragePath))
      : true
    const publishReady = validationSummary.blockers.length === 0
      && (normalizeText(form.renderMode) === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? validationSummary.renderable : docxReady)

    return [
      {
        label: validationSummary.blockers.length ? `${validationSummary.blockers.length} blocking issue${validationSummary.blockers.length === 1 ? '' : 's'} to resolve` : 'No blocking issues',
        passed: validationSummary.blockers.length === 0,
      },
      {
        label: validationSummary.missingRequired.length ? `${validationSummary.missingRequired.length} required variable${validationSummary.missingRequired.length === 1 ? '' : 's'} missing` : 'Required variables covered',
        passed: validationSummary.missingRequired.length === 0,
      },
      {
        label: previewState.html ? 'Preview generated' : 'Preview not generated yet',
        passed: Boolean(previewState.html) && !previewState.error,
      },
      {
        label: publishReady ? 'Publishing ready' : 'Save and validate before publishing',
        passed: publishReady,
      },
    ]
  }, [form.renderMode, form.templateStoragePath, previewState.error, previewState.html, validationSummary.blockers.length, validationSummary.missingRequired.length, validationSummary.renderable])
  const templateHealthPercent = useMemo(() => {
    if (!studioHealthChecks.length) return 0
    const passedCount = studioHealthChecks.filter((item) => item.passed).length
    return Math.round((passedCount / studioHealthChecks.length) * 100)
  }, [studioHealthChecks])
  const activityItems = useMemo(() => {
    if (!selectedTemplate) return []
    const items = []
    if (selectedTemplate.created_at) {
      items.push({
        key: 'created',
        title: 'Template created',
        detail: 'This version became available in the template library.',
        timestamp: selectedTemplate.created_at,
      })
    }
    if (selectedTemplate.updated_at) {
      items.push({
        key: 'updated',
        title: 'Last updated',
        detail: 'Latest saved changes to this template version.',
        timestamp: selectedTemplate.updated_at,
      })
    }
    if (selectedTemplate.is_default) {
      items.push({
        key: 'live',
        title: 'Live default',
        detail: 'New documents of this type use this version.',
        timestamp: selectedTemplate.updated_at || selectedTemplate.created_at,
      })
    }
    return items
  }, [selectedTemplate])
  const stickyStatusLabel = useMemo(() => {
    if (!selectedTemplate) return 'No template selected'
    if (selectedTemplate.is_default) return `Live ${form.versionTag || selectedTemplate.version_tag || 'v1'}`
    if (selectedClassification.key === 'legacy_docx_only') return `Legacy ${form.versionTag || selectedTemplate.version_tag || 'v1'}`
    return `${TEMPLATE_STATUS_OPTIONS.find((item) => item.key === normalizeTemplateStatus(selectedTemplate))?.label || 'Draft'} ${form.versionTag || selectedTemplate.version_tag || 'v1'}`
  }, [form.versionTag, selectedClassification.key, selectedTemplate])
  const stickyNextStep = useMemo(() => {
    if (!selectedTemplate) {
      return {
        title: 'Choose a template to begin',
        description: 'Select a version from the left to start editing or reviewing.',
      }
    }
    if (!selectedIsOrgOwned) {
      return {
        title: 'Create a draft to make changes',
        description: 'Base templates stay read-only until you create an organisation-owned draft.',
      }
    }
    if (!previewState.html) {
      return {
        title: 'Generate a preview before publishing',
        description: 'Run a safe sample preview to validate wording and variables.',
      }
    }
    if (!form.isDefault) {
      return {
        title: 'Publish when this draft is ready',
        description: 'New documents will use this version after you publish it as live.',
      }
    }
    return {
      title: 'This template is live',
      description: 'New documents of this type already start from this version.',
    }
  }, [form.isDefault, previewState.html, selectedIsOrgOwned, selectedTemplate])

  const templateTypeConfig = visiblePacketTypes.find((item) => item.key === packetType) || visiblePacketTypes[0] || SUPPORTED_PACKET_TYPES[0]

  async function refreshAll() {
    await loadTemplatesAndRegistry({
      targetPacketType: packetType,
      preferredTemplateId: selectedTemplateId,
    })
  }

  async function handleBackfillRenderModes() {
    if (packetType !== 'mandate' || !canEdit) return

    const candidates = migrationReport.rows.filter((row) => row.template?.organisation_id && !row.classification.explicitRenderMode)
    if (!candidates.length) {
      setMessage('All organisation-owned mandate templates already have an explicit render mode.')
      return
    }

    try {
      setBackfillingTemplateModes(true)
      setError('')
      setMessage('')

      for (const row of candidates) {
        const template = row.template
        const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
        const nextRenderMode = templateHasLegacySource(template)
          ? TEMPLATE_RENDER_MODES.LEGACY_DOCX
          : TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED
        await updateDocumentPacketTemplate(template.id, {
          metadataJson: {
            ...metadata,
            render_mode: nextRenderMode,
            native_renderer_version: nextRenderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? NATIVE_RENDERER_VERSION : null,
          },
          templateFormat: getTemplateFormatForMode(nextRenderMode),
        })
      }

      await refreshAll()
      setMessage(`Backfilled render modes for ${candidates.length} mandate template${candidates.length === 1 ? '' : 's'}.`)
    } catch (backfillError) {
      setError(backfillError?.message || 'Unable to backfill template render modes.')
    } finally {
      setBackfillingTemplateModes(false)
    }
  }

  async function handleCreateTemplate() {
    try {
      setCreatingTemplate(true)
      setError('')
      setMessage('')

      const timestamp = Date.now()
      const renderMode = getDefaultRenderMode(packetType)
      const created = await createDocumentPacketTemplate({
        packetType,
        moduleType: normalizedModuleType,
        templateKey: `${packetType}_template_${timestamp}`,
        templateLabel: `${templateTypeConfig.shortLabel} Template ${new Date().toLocaleDateString()}`,
        description: 'Draft legal template',
        versionTag: 'v1',
        templateFormat: getTemplateFormatForMode(renderMode),
        isDefault: false,
        isActive: false,
        metadataJson: {
          lifecycle_status: 'draft',
          render_mode: renderMode,
          native_renderer_version: renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? NATIVE_RENDERER_VERSION : null,
        },
        sections: createStarterSections(packetType).map((section, index) => mapSectionForSave(section, index)),
      })

      await refreshAll()
      setSelectedTemplateId(created?.id || '')
      setMessage('New draft template created.')
    } catch (createError) {
      setError(createError?.message || 'Unable to create template.')
    } finally {
      setCreatingTemplate(false)
    }
  }

  async function handleCreateEditableCopy() {
    if (!templateDetail) return

    try {
      setCloning(true)
      setError('')
      setMessage('')

      const cloned = await createDocumentPacketTemplate({
        packetType,
        moduleType: normalizedModuleType,
        templateKey: `${normalizeText(templateDetail.template_key || packetType)}_org_${Date.now()}`,
        templateLabel: `${normalizeText(templateDetail.template_label || templateTypeConfig.label)} (Organisation)`,
        description: templateDetail.description || '',
        versionTag: normalizeText(templateDetail.version_tag || 'v1') || 'v1',
        templateFormat: normalizeText(templateDetail.template_format || getTemplateFormatForMode(getDefaultRenderMode(packetType))) || getTemplateFormatForMode(getDefaultRenderMode(packetType)),
        templateStoragePath: normalizeText(templateDetail.template_storage_path || ''),
        metadataJson: {
          ...(templateDetail?.metadata_json && typeof templateDetail.metadata_json === 'object' ? templateDetail.metadata_json : {}),
          lifecycle_status: normalizeTemplateStatus(templateDetail),
          render_mode: normalizeTemplateRenderMode(templateDetail, packetType),
        },
        sections: (templateDetail.sections || []).map((section, index) => mapSectionForSave({
          sectionKey: section.section_key,
          sectionLabel: section.section_label,
          sectionType: section.section_type,
          legalText: section.legal_text,
          placeholderKeysText: Array.isArray(section.placeholder_keys) ? section.placeholder_keys.join(', ') : '',
          isRequired: section.is_required,
          sortOrder: section.sort_order ?? index,
        }, index)),
      })

      await refreshAll()
      setSelectedTemplateId(cloned?.id || '')
      setMessage('Editable organisation template created from selected base template.')
    } catch (cloneError) {
      setError(cloneError?.message || 'Unable to create editable copy.')
    } finally {
      setCloning(false)
    }
  }

  async function handleCreateNextVersion() {
    if (!templateDetail || !selectedTemplate) return

    try {
      setCloning(true)
      setError('')
      setMessage('')

      const currentVersion = normalizeText(form.versionTag || templateDetail.version_tag || 'v1') || 'v1'
      const nextVersion = incrementVersionTag(currentVersion)
      const cloned = await createDocumentPacketTemplate({
        packetType,
        moduleType: normalizedModuleType,
        templateKey: `${normalizeText(selectedTemplate.template_key || packetType)}_${Date.now()}`,
        templateLabel: `${normalizeText(form.templateLabel || selectedTemplate.template_label || templateTypeConfig.label)} ${nextVersion.toUpperCase()}`,
        description: form.description,
        versionTag: nextVersion,
        templateFormat: getTemplateFormatForMode(form.renderMode),
        templateStoragePath: normalizeText(form.templateStoragePath),
        isDefault: false,
        isActive: false,
        metadataJson: buildTemplateMetadata({ ...form, templateStatus: 'draft', validationSummary }, form.metadataJson || {}, null),
        sections: (form.sections || []).map((section, index) => mapSectionForSave(section, index)),
      })

      await refreshAll()
      setSelectedTemplateId(cloned?.id || '')
      setMessage(`Template version ${nextVersion} created as a new draft.`)
    } catch (cloneError) {
      setError(cloneError?.message || 'Unable to create next version.')
    } finally {
      setCloning(false)
    }
  }

  async function handleDeleteTemplate() {
    if (!selectedTemplateId || !selectedTemplate || !selectedIsOrgOwned || !canEdit) return
    if (!canDeleteTemplateRecord(selectedTemplate, selectedList)) {
      setError('Create or keep another organisation-owned template first, then this version can be deleted.')
      return
    }
    const replacementTemplate = deleteReplacementTemplate

    const confirmed = window.confirm(
      selectedTemplate?.is_default
        ? `Delete "${selectedTemplate.template_label || selectedTemplate.template_key}"?\n\nAnother organisation template will be promoted to default first. This removes the template record and its sections.`
        : `Delete "${selectedTemplate.template_label || selectedTemplate.template_key}"?\n\nThis removes this draft/version template record and its sections.`,
    )
    if (!confirmed) return

    try {
      setDeletingTemplate(true)
      setError('')
      setMessage('')
      await deleteDocumentPacketTemplate(selectedTemplateId, {
        replacementTemplateId: replacementTemplate?.id || null,
      })
      await refreshAll()
      setMessage(
        selectedTemplate?.is_default && replacementTemplate
          ? `Template deleted. "${replacementTemplate.template_label || replacementTemplate.template_key}" is now the default.`
          : 'Template deleted.',
      )
    } catch (deleteError) {
      setError(deleteError?.message || 'Unable to delete template.')
    } finally {
      setDeletingTemplate(false)
    }
  }

  function addSection() {
    const nextIndex = (form.sections || []).length
    setForm((previous) => ({
      ...previous,
      sections: [
        ...(previous.sections || []),
        {
          id: null,
          sectionKey: `section_${(previous.sections || []).length + 1}`,
          sectionLabel: `Section ${(previous.sections || []).length + 1}`,
          sectionType: 'legal_text',
          legalText: '',
          placeholderKeysText: '',
          isRequired: true,
          sortOrder: (previous.sections || []).length,
        },
      ],
    }))
    setSelectedSectionIndex(nextIndex)
  }

  function updateSection(index, patch) {
    setForm((previous) => ({
      ...previous,
      sections: (previous.sections || []).map((section, sectionIndex) => (
        sectionIndex === index ? { ...section, ...patch } : section
      )),
    }))
  }

  function removeSection(index) {
    setForm((previous) => ({
      ...previous,
      sections: (previous.sections || []).filter((_, sectionIndex) => sectionIndex !== index),
    }))
    setSelectedSectionIndex((previous) => {
      if (previous > index) return previous - 1
      if (previous === index) return Math.max(0, index - 1)
      return previous
    })
  }

  async function handleUploadTemplateFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !selectedTemplateId || !selectedTemplate) return
    if (normalizeText(form.renderMode) === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED) {
      setError('Native structured templates do not require a DOCX upload. Switch this template to Legacy DOCX mode if you need to attach a base file.')
      return
    }

    try {
      setUploadingTemplate(true)
      setError('')
      setMessage('')

      const uploaded = await uploadDocumentPacketTemplateAsset({
        file,
        packetType,
        moduleType: normalizedModuleType,
        templateKey: normalizeText(selectedTemplate.template_key || selectedTemplateId),
      })

      setForm((previous) => ({
        ...previous,
        templateStoragePath: normalizeText(uploaded.path),
        templateStorageBucket: normalizeText(uploaded.bucket),
        templateFileName: normalizeText(uploaded.fileName),
      }))
      setMessage('DOCX template uploaded. Save to apply this file to the template version.')
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload DOCX template.')
    } finally {
      setUploadingTemplate(false)
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!selectedTemplateId || !selectedTemplate) return

    if (!selectedIsOrgOwned) {
      setError('Create an organisation-owned template copy before editing this template.')
      return
    }

    if (validationSummary.blockers.length) {
      setError('Resolve template blockers before saving.')
      return
    }

    const isActivatingNativeTemplate =
      normalizeText(form.renderMode) === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED &&
      (Boolean(form.isActive) || Boolean(form.isDefault) || ['approved', 'active'].includes(normalizeText(form.templateStatus).toLowerCase()))
    if (isActivatingNativeTemplate && !validationSummary.renderable) {
      setError('This native template is not renderable yet. Cover the required fields before activating it.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')

      const metadataJson = buildTemplateMetadata({ ...form, validationSummary }, form.metadataJson || {}, null)
      await updateDocumentPacketTemplate(selectedTemplateId, {
        templateLabel: form.templateLabel,
        description: form.description,
        versionTag: form.versionTag,
        templateFormat: getTemplateFormatForMode(form.renderMode),
        templateStoragePath: form.templateStoragePath,
        isActive: form.isActive,
        isDefault: form.isDefault,
        metadataJson,
        sections: (form.sections || []).map((section, index) => mapSectionForSave(section, index)),
      })

      if (form.isDefault) {
        const orgTemplates = (templatesByType[packetType] || []).filter((row) => row.organisation_id && row.id !== selectedTemplateId && row.is_default)
        for (const row of orgTemplates) {
          // keep one active default template per packet type
          await updateDocumentPacketTemplate(row.id, { isDefault: false })
        }
      }

      await refreshAll()
      setMessage('Legal template saved.')
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save legal template.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSetAsDefault() {
    if (!selectedTemplateId || !selectedIsOrgOwned || !canEdit) return
    if (normalizeText(form.renderMode) === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED && !validationSummary.renderable) {
      setError('This native template is not renderable yet. Cover the required fields before making it the default.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setMessage('')

      const metadataJson = buildTemplateMetadata({ ...form, validationSummary }, form.metadataJson || {}, null)
      await updateDocumentPacketTemplate(selectedTemplateId, {
        templateLabel: form.templateLabel,
        description: form.description,
        versionTag: form.versionTag,
        templateFormat: getTemplateFormatForMode(form.renderMode),
        templateStoragePath: form.templateStoragePath,
        isActive: true,
        isDefault: true,
        metadataJson,
        sections: (form.sections || []).map((section, index) => mapSectionForSave(section, index)),
      })

      const orgTemplates = (templatesByType[packetType] || []).filter((row) => row.organisation_id)
      for (const row of orgTemplates) {
        const shouldBeDefault = row.id === selectedTemplateId
        if (Boolean(row.is_default) !== shouldBeDefault) {
          await updateDocumentPacketTemplate(row.id, {
            isDefault: shouldBeDefault,
            isActive: shouldBeDefault ? true : row.is_active,
          })
        }
      }

      await refreshAll()
      setMessage('Default template updated for this document type.')
    } catch (defaultError) {
      setError(defaultError?.message || 'Unable to set template as default.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestGenerate() {
    if (!templateDetail) return

    try {
      setTestingTemplate(true)
      setError('')
      setMessage('')
      setPreviewState({ loading: true, html: '', warnings: [], critical: [], error: '' })

      const preview = await renderPacketPreview({
        packetType,
        context: buildSamplePreviewContext(packetType),
        template: templateDetail,
        title: `${templateTypeConfig.shortLabel} template validation preview`,
      })

      setPreviewState({
        loading: false,
        html: preview?.previewHtml || '',
        warnings: preview?.warnings || [],
        critical: preview?.critical || [],
        error: '',
      })

      if (preview?.critical?.length) {
        setMessage('Template preview generated with validation blockers. Review the checklist before activation.')
      } else {
        setMessage('Template preview generated using sample data.')
      }
    } catch (previewError) {
      setPreviewState({
        loading: false,
        html: '',
        warnings: [],
        critical: [],
        error: previewError?.message || 'Unable to generate template preview.',
      })
    } finally {
      setTestingTemplate(false)
    }
  }

  async function handleSavePlaceholder(event) {
    event.preventDefault()

    const placeholderKey = normalizeText(placeholderForm.placeholderKey)
    if (!placeholderKey) {
      setError('Merge field key is required.')
      return
    }
    if (!PLACEHOLDER_KEY_PATTERN.test(placeholderKey)) {
      setError('Merge field key can only include letters, numbers, dots, underscores, and hyphens.')
      return
    }

    try {
      setSavingPlaceholder(placeholderKey)
      setError('')
      setMessage('')

      await upsertDocumentPlaceholderDefinition({
        packetType,
        placeholderKey,
        entityScope: normalizeText(placeholderForm.entityScope || 'transaction'),
        dataType: normalizeText(placeholderForm.dataType || 'text'),
        description: normalizeNullableText(placeholderForm.description),
        exampleValue: normalizeNullableText(placeholderForm.exampleValue),
        isRequiredDefault: Boolean(placeholderForm.isRequiredDefault),
        isActive: placeholderForm.isActive !== false,
      })

      await refreshAll()
      setPlaceholderForm({
        placeholderKey: '',
        entityScope: 'transaction',
        dataType: 'text',
        description: '',
        exampleValue: '',
        isRequiredDefault: false,
        isActive: true,
      })
      setMessage('Merge field definition saved.')
    } catch (placeholderError) {
      setError(placeholderError?.message || 'Unable to save merge field definition.')
    } finally {
      setSavingPlaceholder('')
    }
  }

  async function togglePlaceholderFlag(row, field, nextValue) {
    try {
      const rowKey = normalizeText(row?.placeholder_key)
      if (!rowKey) return
      setSavingPlaceholder(rowKey)
      setError('')
      setMessage('')

      await upsertDocumentPlaceholderDefinition({
        packetType: row.packet_type || packetType,
        placeholderKey: row.placeholder_key,
        entityScope: row.entity_scope || 'transaction',
        dataType: row.data_type || 'text',
        description: row.description || '',
        exampleValue: row.example_value || '',
        isRequiredDefault: field === 'isRequiredDefault' ? nextValue : Boolean(row.is_required_default),
        isActive: field === 'isActive' ? nextValue : Boolean(row.is_active),
      })

      await refreshAll()
      setMessage('Merge field updated.')
    } catch (updateError) {
      setError(updateError?.message || 'Unable to update merge field definition.')
    } finally {
      setSavingPlaceholder('')
    }
  }

  async function handleCopyToken(token = '') {
    const normalizedToken = normalizeText(token)
    if (!normalizedToken) return
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`{{${normalizedToken}}}`)
      }
      setMessage(`Copied {{${normalizedToken}}} to clipboard.`)
    } catch {
      setMessage(`Token ready: {{${normalizedToken}}}`)
    }
  }

  function handleCreateDraftAction() {
    if (!selectedTemplate) return
    if (selectedIsOrgOwned) {
      void handleCreateNextVersion()
      return
    }
    void handleCreateEditableCopy()
  }

  function handleInsertVariableToken(token = '') {
    const normalizedToken = normalizeText(token)
    if (!normalizedToken || !selectedSection || !selectedIsOrgOwned || !canEdit) return

    const rawToken = `{{${normalizedToken}}}`
    const textarea = clauseTextareaRef.current
    const currentValue = String(selectedSection.legalText || '')
    let nextValue = rawToken
    let cursorPosition = rawToken.length

    if (textarea && typeof textarea.selectionStart === 'number' && typeof textarea.selectionEnd === 'number') {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      nextValue = `${currentValue.slice(0, start)}${rawToken}${currentValue.slice(end)}`
      cursorPosition = start + rawToken.length
    } else {
      const prefix = currentValue && !/\s$/.test(currentValue) ? ' ' : ''
      nextValue = `${currentValue}${prefix}${rawToken}`
      cursorPosition = nextValue.length
    }

    const nextPlaceholderKeys = Array.from(new Set([...(selectedSection.placeholderKeys || []), normalizedToken]))
    updateSection(selectedSectionIndex, {
      legalText: nextValue,
      placeholderKeysText: nextPlaceholderKeys.join(', '),
      placeholderKeys: nextPlaceholderKeys,
    })

    requestAnimationFrame(() => {
      if (textarea) {
        textarea.focus()
        textarea.setSelectionRange(cursorPosition, cursorPosition)
      }
    })
  }

  function openPublishDialog() {
    if (!selectedTemplateId || !selectedIsOrgOwned || !canEdit || saving || form.isDefault) return
    setShowPublishConfirm(true)
  }

  async function confirmPublishTemplate() {
    setShowPublishConfirm(false)
    await handleSetAsDefault()
  }

  if (loading) {
    return <SettingsLoadingState label="Loading legal template library…" />
  }

  return (
    <div className={`space-y-6 rounded-[34px] border border-[#dbe7f3] bg-[linear-gradient(180deg,#ffffff_0%,#f7fafe_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-7 xl:p-8 ${selectedTemplate && activeTab === 'template' ? 'pb-[132px]' : ''}`}>
      <header className="space-y-6 border-b border-[#e3edf7] pb-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#7a8da6]">{eyebrow}</p>
            <div className="space-y-2">
              <h1 className="text-[2rem] font-semibold tracking-[-0.02em] text-[#102033] sm:text-[2.15rem]">{title}</h1>
              <p className="max-w-3xl text-[15px] leading-7 text-[#6b7c93]">{description}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={studioSecondaryButtonClass}
              onClick={() => setActiveTab('activity')}
              disabled={!selectedTemplate}
            >
              <Layers3 size={15} />
              <span>Versions</span>
            </button>

            <button
              type="button"
              className={studioSecondaryButtonClass}
              onClick={handleCreateDraftAction}
              disabled={!selectedTemplate || cloning || !canEdit}
            >
              <CopyPlus size={15} />
              <span>{cloning ? 'Duplicating…' : 'Duplicate'}</span>
            </button>

            <details className="relative">
              <summary className={`${studioSecondaryButtonClass} list-none cursor-pointer`}>
                <MoreHorizontal size={15} />
                <span>More</span>
                <ChevronDown size={14} />
              </summary>
              <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-[22px] border border-[#dbe7f3] bg-white p-2 shadow-[0_22px_40px_rgba(15,23,42,0.14)]">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-[16px] px-3 py-2.5 text-left text-sm font-semibold text-[#102033] transition hover:bg-[#f6f9fc]"
                  onClick={() => setActiveTab('settings')}
                >
                  <span>Template settings</span>
                  <ChevronDown size={14} className="-rotate-90 text-[#8aa0b7]" />
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-[16px] px-3 py-2.5 text-left text-sm font-semibold text-[#102033] transition hover:bg-[#f6f9fc] disabled:opacity-60"
                  onClick={(event) => void handleSave(event)}
                  disabled={!selectedTemplate || !selectedIsOrgOwned || !canEdit || saving}
                >
                  <span>{saving ? 'Saving…' : 'Save'}</span>
                  <Save size={14} className="text-[#8aa0b7]" />
                </button>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-[16px] px-3 py-2.5 text-left text-sm font-semibold text-[#102033] transition hover:bg-[#f6f9fc] disabled:opacity-60"
                  onClick={openPublishDialog}
                  disabled={!selectedTemplate || !selectedIsOrgOwned || !canEdit || saving || Boolean(form.isDefault)}
                >
                  <span>{form.isDefault ? 'Already live' : 'Publish as Live'}</span>
                  <ShieldCheck size={14} className="text-[#8aa0b7]" />
                </button>
                {packetType === 'mandate' && canEdit ? (
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-[16px] px-3 py-2.5 text-left text-sm font-semibold text-[#102033] transition hover:bg-[#f6f9fc] disabled:opacity-60"
                    onClick={() => void handleBackfillRenderModes()}
                    disabled={backfillingTemplateModes || migrationReport.missingRenderMode === 0}
                  >
                    <span>{backfillingTemplateModes ? 'Backfilling…' : 'Backfill Render Modes'}</span>
                    <Sparkles size={14} className="text-[#8aa0b7]" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-[16px] px-3 py-2.5 text-left text-sm font-semibold text-[#b4383e] transition hover:bg-[#fff7f7] disabled:opacity-60"
                  onClick={() => void handleDeleteTemplate()}
                  disabled={!selectedTemplate || deletingTemplate || !canDeleteTemplateRecord(selectedTemplate, selectedList)}
                >
                  <span>{deletingTemplate ? 'Deleting…' : 'Delete Draft / Version'}</span>
                  <Trash2 size={14} className="text-[#cf6368]" />
                </button>
              </div>
            </details>

            {canEdit ? (
              <button
                type="button"
                className={studioPrimaryButtonClass}
                onClick={() => void handleCreateTemplate()}
                disabled={creatingTemplate}
              >
                <Plus size={15} />
                <span>{creatingTemplate ? 'Creating…' : 'New Template'}</span>
              </button>
            ) : null}
          </div>
        </div>

        {!canEdit ? (
          <SettingsBanner tone="warning">
            Read-only for your role. Principal-level administrators can edit legal templates and merge-field governance.
          </SettingsBanner>
        ) : null}

        {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
        {message ? <SettingsBanner tone="success">{message}</SettingsBanner> : null}

        <div className="grid gap-4 xl:grid-cols-2">
          {visiblePacketTypes.map((item) => {
            const active = packetType === item.key
            const Icon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setPacketType(item.key)}
                className={[
                  'flex min-h-[132px] flex-col rounded-[24px] border p-5 text-left shadow-[0_14px_28px_rgba(15,23,42,0.04)] transition',
                  active
                    ? 'border-[#bcd6ff] bg-[#eef5ff]'
                    : 'border-[#dbe7f3] bg-white hover:border-[#bfd5f5] hover:bg-[#fbfdff]',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#dbe7f3] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#52667d]">
                    <Icon size={15} />
                    <span>{item.shortLabel}</span>
                  </div>
                  {active ? (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#0a66ff] text-white">
                      <Check size={16} />
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 text-[1.15rem] font-semibold text-[#102033]">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-[#6b7c93]">
                  {item.key === 'otp'
                    ? 'Used for buyer offer drafting and signature flows.'
                    : item.key === 'mandate'
                      ? 'Used for seller mandates and listing activation flows.'
                      : item.key === 'commercial_sale'
                        ? 'Used for commercial sales mandates and due diligence workflows.'
                        : 'Used for commercial leasing mandates, heads of terms, and lease workflows.'}
                </p>
              </button>
            )
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {studioStats.map((item) => (
            <TemplateStudioMetricCard
              key={item.label}
              label={item.label}
              value={item.value}
              description={item.description}
              tone={item.tone}
            />
          ))}
        </div>

        {migrationReport.defaultTemplate ? (
          <div className="rounded-[22px] border border-[#dbe7f3] bg-white px-4 py-3 text-sm text-[#475d75] shadow-[0_12px_24px_rgba(15,23,42,0.04)]">
            <span className="font-semibold text-[#102033]">Live now:</span>{' '}
            {migrationReport.defaultTemplate.template.template_label || migrationReport.defaultTemplate.template.template_key}
            {' '}is currently {migrationReport.defaultTemplate.classification.label.toLowerCase()}.
          </div>
        ) : (
          <SettingsBanner tone="warning">No default template is active for this document type yet.</SettingsBanner>
        )}

        <div className="flex flex-wrap gap-2">
          {STUDIO_TABS.map((tab) => (
            <TemplateStudioTabButton
              key={tab.key}
              active={activeTab === tab.key}
              label={tab.label}
              onClick={() => setActiveTab(tab.key)}
            />
          ))}
        </div>
      </header>

      {activeTab === 'template' ? (
        selectedTemplate ? (
          <>
            <form onSubmit={handleSave} className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_400px] xl:items-start">
              <div className="space-y-6 xl:sticky xl:top-4">
                <TemplateStudioPanel
                  eyebrow="Template Library"
                  title="Template List"
                  description="Select the version you want to update, review, or publish."
                >
                  <div className="rounded-[24px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-[1.02rem] font-semibold text-[#102033]">{selectedTemplate.template_label || selectedTemplate.template_key}</p>
                        <p className="text-sm leading-6 text-[#6b7c93]">{selectedTemplate.description || 'Default structured template for agency transactions.'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedTemplate.is_default ? <TemplateStatusPill status="active">Default</TemplateStatusPill> : null}
                        <TemplateStatusPill status={normalizeTemplateStatus(selectedTemplate)}>
                          {TEMPLATE_STATUS_OPTIONS.find((item) => item.key === normalizeTemplateStatus(selectedTemplate))?.label || 'Draft'}
                        </TemplateStatusPill>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="inline-flex rounded-full border border-[#d9e4ef] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#52667d]">
                        {selectedClassification.renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? 'Native' : 'Legacy'}
                      </span>
                      <span className="inline-flex rounded-full border border-[#d9e4ef] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#52667d]">
                        {form.versionTag || selectedTemplate.version_tag || 'v1'}
                      </span>
                      <span className="inline-flex rounded-full border border-[#d9e4ef] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#52667d]">
                        Updated {formatDateOnly(selectedTemplate.updated_at)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {selectedList.map((template) => {
                      const active = selectedTemplateId === template.id
                      const classification = classifyTemplateMigrationState(template, packetType)
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => setSelectedTemplateId(template.id)}
                          className={[
                            'w-full rounded-[20px] border px-4 py-3 text-left transition',
                            active
                              ? 'border-[#bcd6ff] bg-[#eef5ff] shadow-[0_12px_24px_rgba(10,102,255,0.08)]'
                              : 'border-[#e2ecf5] bg-white hover:border-[#c9d9eb] hover:bg-[#fbfdff]',
                          ].join(' ')}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#102033]">{template.template_label || template.template_key}</p>
                              <p className="mt-1 text-xs text-[#6b7c93]">{template.version_tag || 'v1'} · {formatRenderModeLabel(classification.renderMode)}</p>
                            </div>
                            <span className="text-xs text-[#8aa0b7]">{formatDateOnly(template.updated_at)}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </TemplateStudioPanel>

                <TemplateStudioPanel
                  eyebrow="Document Structure"
                  title="Sections"
                  description="Focus on one clause at a time instead of editing every block in a long form."
                  actions={
                    canEdit && selectedIsOrgOwned ? (
                      <button type="button" className={studioSecondaryButtonClass} onClick={addSection}>
                        <Plus size={15} />
                        <span>Add Section</span>
                      </button>
                    ) : null
                  }
                >
                  {(form.sections || []).length ? (
                    <div className="space-y-2">
                      {(form.sections || []).map((section, index) => {
                        const state = sectionStatuses[index]
                        const active = selectedSectionIndex === index
                        return (
                          <button
                            key={`${section.sectionKey}-${index}`}
                            type="button"
                            onClick={() => setSelectedSectionIndex(index)}
                            className={[
                              'flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition',
                              active
                                ? 'border border-[#bcd6ff] bg-[#eef5ff] shadow-[inset_0_0_0_1px_rgba(10,102,255,0.08)]'
                                : 'border border-transparent bg-white hover:border-[#dbe7f3] hover:bg-[#fbfdff]',
                            ].join(' ')}
                          >
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#0a66ff] shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-[#102033]">{section.sectionLabel || `Section ${index + 1}`}</span>
                              <span className="block text-xs text-[#6b7c93]">{state.label}</span>
                            </span>
                            <span className="shrink-0">{state.icon}</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <SettingsEmptyState
                      title="No sections configured"
                      description="Create your first section to start structuring this template."
                      action={
                        canEdit && selectedIsOrgOwned ? (
                          <button type="button" className={studioSecondaryButtonClass} onClick={addSection}>
                            <Plus size={15} />
                            <span>Add Section</span>
                          </button>
                        ) : null
                      }
                    />
                  )}
                </TemplateStudioPanel>
              </div>

              <div className="space-y-6">
                <TemplateStudioPanel
                  eyebrow="Clause Editor"
                  title={selectedSection ? selectedSection.sectionLabel || `Section ${selectedSectionIndex + 1}` : 'No section selected'}
                  description={selectedSection ? `Section ${selectedSectionIndex + 1} of ${(form.sections || []).length}` : 'Select a section from the left to edit.'}
                  actions={
                    <div className="flex flex-wrap gap-2">
                      {selectedIsOrgOwned && canEdit ? (
                        <button type="submit" className={studioPrimaryButtonClass} disabled={saving}>
                          <Save size={15} />
                          <span>{saving ? 'Saving…' : 'Save'}</span>
                        </button>
                      ) : null}
                      {selectedIsOrgOwned && canEdit ? (
                        <button
                          type="button"
                          className={studioSecondaryButtonClass}
                          onClick={openPublishDialog}
                          disabled={
                            saving
                            || Boolean(form.isDefault)
                            || (
                              normalizeText(form.renderMode) === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED
                              && !validationSummary.renderable
                            )
                          }
                        >
                          <ShieldCheck size={15} />
                          <span>{form.isDefault ? 'Live Default' : 'Publish as Live'}</span>
                        </button>
                      ) : null}
                    </div>
                  }
                >
                  {!selectedIsOrgOwned ? (
                    <SettingsBanner tone="warning">
                      This is a shared base template. Create a draft first if you want to change clauses, section settings, or publishing state.
                    </SettingsBanner>
                  ) : null}

                  {selectedSection ? (
                    <div className="space-y-5">
                      {selectedSectionUnknownTokens.length ? (
                        <SettingsBanner tone="warning">
                          Unknown variables in this section: {selectedSectionUnknownTokens.map((item) => `{{${item.token}}}`).join(', ')}.
                        </SettingsBanner>
                      ) : null}

                      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_250px]">
                        <div className="space-y-4">
                          <label className={settingsFieldClass}>
                            Section title
                            <input
                              type="text"
                              value={selectedSection.sectionLabel}
                              disabled={!canEdit || !selectedIsOrgOwned}
                              onChange={(event) => updateSection(selectedSectionIndex, { sectionLabel: event.target.value })}
                            />
                          </label>

                          <div className="rounded-[22px] border border-[#dbe7f3] bg-[#f6f9fc] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3edf7] pb-3">
                              <div className="flex items-center gap-2 text-sm font-semibold text-[#102033]">
                                <span className="inline-flex items-center gap-2 rounded-[14px] border border-[#dbe7f3] bg-white px-3 py-2 text-sm">
                                  <Type size={14} />
                                  Plain text editor
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <details className="relative">
                                  <summary className={`${studioSecondaryButtonClass} list-none cursor-pointer`}>
                                    <Sparkles size={14} />
                                    <span>Insert Variable</span>
                                    <ChevronDown size={14} />
                                  </summary>
                                  <div className="absolute right-0 top-full z-20 mt-2 w-[320px] max-h-[420px] overflow-auto rounded-[22px] border border-[#dbe7f3] bg-white p-3 shadow-[0_22px_40px_rgba(15,23,42,0.14)]">
                                    <div className="space-y-3">
                                      {variableGroups.map((group) => (
                                        <div key={group.key} className="rounded-[18px] border border-[#eef3f8] bg-[#fbfdff] p-3">
                                          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">{group.label}</p>
                                          <div className="mt-2 flex flex-wrap gap-2">
                                            {group.fields.map((field) => (
                                              <button
                                                key={field.key}
                                                type="button"
                                                className="rounded-[14px] border border-[#dbe7f3] bg-white px-3 py-1.5 text-xs font-semibold text-[#102033] transition hover:border-[#bcd6ff] hover:bg-[#eef5ff]"
                                                onClick={() => handleInsertVariableToken(field.key)}
                                                disabled={!selectedIsOrgOwned || !canEdit}
                                              >
                                                {field.label}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <button
                                      type="button"
                                      className="mt-3 w-full rounded-[16px] border border-[#dbe7f3] bg-[#f6f9fc] px-3 py-2.5 text-sm font-semibold text-[#0a66ff] transition hover:bg-[#eef5ff]"
                                      onClick={() => setActiveTab('variables')}
                                    >
                                      View all variables
                                    </button>
                                  </div>
                                </details>

                                <button
                                  type="button"
                                  className={studioQuietButtonClass}
                                  onClick={() => setActiveTab('variables')}
                                >
                                  <Eye size={14} />
                                  <span>View all variables</span>
                                </button>
                              </div>
                            </div>

                            <label className={`${settingsFieldClass} mt-4`}>
                              Clause content
                              <textarea
                                ref={clauseTextareaRef}
                                rows={14}
                                value={selectedSection.legalText}
                                disabled={!canEdit || !selectedIsOrgOwned}
                                onChange={(event) => updateSection(selectedSectionIndex, { legalText: event.target.value })}
                                placeholder="Write the clause text here and place variables where needed, for example {{seller_full_name}}."
                              />
                            </label>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-[22px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Section Summary</p>
                            <p className="mt-3 text-base font-semibold text-[#102033]">Section {selectedSectionIndex + 1} of {(form.sections || []).length}</p>
                            <p className="mt-2 text-sm text-[#6b7c93]">{sectionStatuses[selectedSectionIndex]?.label}</p>
                            <p className="mt-3 text-sm text-[#475d75]">Type: {selectedSection.sectionType || 'legal_text'}</p>
                          </div>

                          <div className="rounded-[22px] border border-[#dbe7f3] bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Variables</p>
                              <button
                                type="button"
                                className="text-sm font-semibold text-[#0a66ff]"
                                onClick={() => setActiveTab('variables')}
                              >
                                View all
                              </button>
                            </div>
                            {selectedSectionTokens.length ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {selectedSectionTokens.map((token) => (
                                  <span
                                    key={token}
                                    className="inline-flex items-center gap-1 rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#35546c]"
                                  >
                                    <CircleDot size={10} />
                                    {token}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-3 text-sm leading-6 text-[#6b7c93]">No variables used in this clause yet.</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <details className="rounded-[22px] border border-[#dbe7f3] bg-white p-4">
                        <summary className="cursor-pointer list-none text-sm font-semibold text-[#102033]">Block settings</summary>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <label className={settingsFieldClass}>
                            Section key
                            <input
                              type="text"
                              value={selectedSection.sectionKey}
                              disabled={!canEdit || !selectedIsOrgOwned}
                              onChange={(event) => updateSection(selectedSectionIndex, { sectionKey: event.target.value })}
                            />
                          </label>

                          <label className={settingsFieldClass}>
                            Section type
                            <select
                              value={selectedSection.sectionType}
                              disabled={!canEdit || !selectedIsOrgOwned}
                              onChange={(event) => updateSection(selectedSectionIndex, { sectionType: event.target.value })}
                            >
                              <option value="legal_text">Legal Text</option>
                              <option value="dynamic_fields">Dynamic Fields</option>
                              <option value="conditional_clause">Conditional Clause</option>
                              <option value="annexure">Annexure</option>
                              <option value="signature_zone">Signature Zone</option>
                              <option value="metadata">Metadata</option>
                            </select>
                          </label>

                          <label className={settingsFieldClass}>
                            Sort order
                            <input
                              type="number"
                              value={selectedSection.sortOrder}
                              disabled={!canEdit || !selectedIsOrgOwned}
                              onChange={(event) => updateSection(selectedSectionIndex, { sortOrder: Number(event.target.value || 0) })}
                            />
                          </label>

                          <label className={settingsFieldClass}>
                            Merge fields used in this block
                            <input
                              type="text"
                              value={selectedSection.placeholderKeysText || ''}
                              disabled={!canEdit || !selectedIsOrgOwned}
                              onChange={(event) => updateSection(selectedSectionIndex, { placeholderKeysText: event.target.value })}
                              placeholder="seller_full_name, purchase_price"
                            />
                          </label>
                        </div>

                        {canEdit && selectedIsOrgOwned ? (
                          <div className="mt-4 flex justify-end">
                            <button type="button" className={studioDangerButtonClass} onClick={() => removeSection(selectedSectionIndex)}>
                              <Trash2 size={14} />
                              <span>Remove Section</span>
                            </button>
                          </div>
                        ) : null}
                      </details>
                    </div>
                  ) : (
                    <SettingsEmptyState
                      title="No section selected"
                      description="Choose a section from the left to edit clause wording and block settings."
                    />
                  )}
                </TemplateStudioPanel>
              </div>

              <div className="space-y-6 xl:sticky xl:top-4">
                <TemplateStudioPanel
                  eyebrow="Preview"
                  title="Live Preview"
                  description="Sample data preview of the current saved template version."
                  actions={
                    <button
                      type="button"
                      className={studioSecondaryButtonClass}
                      onClick={() => setActiveTab('preview')}
                    >
                      <Eye size={14} />
                      <span>Open Preview</span>
                    </button>
                  }
                >
                  <div className="rounded-[24px] border border-[#dbe7f3] bg-[#f5f7fb] p-4">
                    <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8da6]">
                      <span>Sample Preview</span>
                      <span>{previewState.html ? 'Saved template preview' : 'Run Test Generate'}</span>
                    </div>
                    <div className="mt-4 flex min-h-[420px] items-start justify-center overflow-auto rounded-[22px] border border-[#e7eef6] bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#f5f7fb_100%)] p-4">
                      <div className="w-full max-w-[320px] rounded-[18px] border border-[#e2eaf3] bg-white p-6 shadow-[0_24px_40px_rgba(15,23,42,0.12)]">
                        {previewState.loading ? (
                          <SettingsLoadingState compact label="Preparing sample preview…" />
                        ) : previewState.error ? (
                          <SettingsBanner tone="error">{previewState.error}</SettingsBanner>
                        ) : previewState.html ? (
                          <div className="space-y-3 text-sm leading-6 text-[#233246]">
                            {previewState.critical.length ? (
                              <SettingsBanner tone="error">Critical validation issues detected in sample preview.</SettingsBanner>
                            ) : null}
                            {previewState.warnings.length ? (
                              <SettingsBanner tone="warning">Sample preview generated with warning-level data gaps.</SettingsBanner>
                            ) : null}
                            <div dangerouslySetInnerHTML={{ __html: previewState.html }} />
                          </div>
                        ) : (
                          <SettingsEmptyState
                            title="Sample Preview"
                            description="Run Test Generate to render this template with safe sample data."
                          />
                        )}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#dbe7f3] bg-white/90 px-4 py-3 text-sm text-[#6b7c93]">
                      <span>Preview uses the currently saved version of this template.</span>
                      <button
                        type="button"
                        className={studioSecondaryButtonClass}
                        onClick={() => void handleTestGenerate()}
                        disabled={testingTemplate}
                      >
                        <FlaskConical size={14} />
                        <span>{testingTemplate ? 'Generating…' : 'Test Generate'}</span>
                      </button>
                    </div>
                  </div>
                </TemplateStudioPanel>

                <TemplateStudioPanel
                  eyebrow="Checks"
                  title="Template Health"
                  description="A quick view of readiness, variable coverage, and publishing safety."
                >
                  <div className="rounded-[24px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border-[6px] border-[#20b26b] bg-white text-xl font-semibold text-[#102033]">
                        {templateHealthPercent}%
                      </div>
                      <div>
                        <p className="text-base font-semibold text-[#102033]">Template Health</p>
                        <p className="mt-1 text-sm leading-6 text-[#6b7c93]">
                          {validationSummary.warnings.length
                            ? `${validationSummary.warnings.length} warning${validationSummary.warnings.length === 1 ? '' : 's'} to review before publishing.`
                            : 'No warning-level issues detected right now.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {studioHealthChecks.map((item) => (
                      <div
                        key={item.label}
                        className={`flex items-center gap-3 rounded-[18px] border px-4 py-3 text-sm ${item.passed ? 'border-[#d6efe1] bg-[#f5fbf8] text-[#1f7a45]' : 'border-[#f6e4bf] bg-[#fffaf1] text-[#8a5b06]'}`}
                      >
                        {item.passed ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-[22px] border border-[#dbe7f3] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Variables</p>
                        <p className="mt-2 text-[1.65rem] font-semibold text-[#102033]">
                          {resolvedFieldCount}/{validationSummary.tokenCount}
                        </p>
                        <p className="mt-1 text-sm text-[#6b7c93]">
                          {unresolvedFieldCount
                            ? `${unresolvedFieldCount} field${unresolvedFieldCount === 1 ? '' : 's'} still need attention.`
                            : 'All detected variables resolve cleanly.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={studioQuietButtonClass}
                        onClick={() => setActiveTab('variables')}
                      >
                        <Eye size={14} />
                        <span>View all</span>
                      </button>
                    </div>
                  </div>
                </TemplateStudioPanel>
              </div>
            </form>

            <div className="sticky bottom-4 z-20">
              <div className="rounded-[30px] border border-[#dbe7f3] bg-white/95 p-5 shadow-[0_26px_54px_rgba(15,23,42,0.14)] backdrop-blur">
                <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_auto] xl:items-center">
                  <div className="space-y-2">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Template Status</p>
                    <p className="text-lg font-semibold text-[#102033]">{stickyStatusLabel}</p>
                    <p className="text-sm text-[#6b7c93]">Last published: {formatDateTime(selectedTemplate?.is_default ? selectedTemplate.updated_at : liveTemplate?.updated_at)}</p>
                    <p className="text-sm text-[#6b7c93]">Published by: {selectedTemplate?.is_default ? getTemplateActorLabel(selectedTemplate) : getTemplateActorLabel(liveTemplate)}</p>
                  </div>

                  <div className="rounded-[22px] border border-[#dbe7f3] bg-[#f8fbff] px-4 py-4">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Next Step</p>
                    <p className="mt-2 text-lg font-semibold text-[#102033]">{stickyNextStep.title}</p>
                    <p className="mt-1 text-sm leading-6 text-[#6b7c93]">{stickyNextStep.description}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <button
                      type="button"
                      className={studioSecondaryButtonClass}
                      onClick={handleCreateDraftAction}
                      disabled={!selectedTemplate || cloning || !canEdit}
                    >
                      <CopyPlus size={14} />
                      <span>{cloning ? 'Creating…' : 'Create Draft'}</span>
                    </button>

                    <button
                      type="button"
                      className={studioSecondaryButtonClass}
                      onClick={() => setActiveTab('preview')}
                    >
                      <Eye size={14} />
                      <span>Preview</span>
                    </button>

                    <button
                      type="button"
                      className={studioPrimaryButtonClass}
                      onClick={() => void handleTestGenerate()}
                      disabled={testingTemplate}
                    >
                      <FlaskConical size={14} />
                      <span>{testingTemplate ? 'Generating…' : 'Test Generate'}</span>
                    </button>

                    <details className="relative">
                      <summary className={`${studioSecondaryButtonClass} list-none cursor-pointer`}>
                        <MoreHorizontal size={14} />
                        <span>More</span>
                        <ChevronDown size={14} />
                      </summary>
                      <div className="absolute bottom-full right-0 z-20 mb-2 w-64 rounded-[22px] border border-[#dbe7f3] bg-white p-2 shadow-[0_22px_40px_rgba(15,23,42,0.14)]">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between rounded-[16px] px-3 py-2.5 text-left text-sm font-semibold text-[#102033] transition hover:bg-[#f6f9fc] disabled:opacity-60"
                          onClick={(event) => void handleSave(event)}
                          disabled={!selectedIsOrgOwned || !canEdit || saving}
                        >
                          <span>{saving ? 'Saving…' : 'Save'}</span>
                          <Save size={14} className="text-[#8aa0b7]" />
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between rounded-[16px] px-3 py-2.5 text-left text-sm font-semibold text-[#102033] transition hover:bg-[#f6f9fc] disabled:opacity-60"
                          onClick={openPublishDialog}
                          disabled={!selectedIsOrgOwned || !canEdit || Boolean(form.isDefault)}
                        >
                          <span>{form.isDefault ? 'Already live' : 'Publish as Live'}</span>
                          <ShieldCheck size={14} className="text-[#8aa0b7]" />
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between rounded-[16px] px-3 py-2.5 text-left text-sm font-semibold text-[#b4383e] transition hover:bg-[#fff7f7] disabled:opacity-60"
                          onClick={() => void handleDeleteTemplate()}
                          disabled={deletingTemplate || !canDeleteTemplateRecord(selectedTemplate, selectedList)}
                        >
                          <span>{deletingTemplate ? 'Deleting…' : 'Delete Draft / Version'}</span>
                          <Trash2 size={14} className="text-[#cf6368]" />
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <TemplateStudioPanel
            eyebrow="Template Workspace"
            title="No templates yet"
            description="Create your first template to start building clause content, testing previews, and managing publishing."
          >
            <SettingsEmptyState
              title="No templates found"
              description="There are no template records for this legal document type yet."
              action={
                canEdit ? (
                  <button type="button" className={studioPrimaryButtonClass} onClick={() => void handleCreateTemplate()}>
                    <Plus size={15} />
                    <span>Create First Template</span>
                  </button>
                ) : null
              }
            />
          </TemplateStudioPanel>
        )
      ) : null}

      {activeTab === 'variables' ? (
        selectedTemplate ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
            <TemplateStudioPanel
              eyebrow="Variable Library"
              title="Insert Variable"
              description="Human-friendly variable groups for clause editing, with the existing raw tokens preserved under the hood."
            >
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
                <label className={settingsFieldClass}>
                  Search variables
                  <div className="relative">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8aa0b7]" />
                    <input
                      type="text"
                      value={mergeFieldSearch}
                      onChange={(event) => setMergeFieldSearch(event.target.value)}
                      placeholder="Search key, label, description..."
                      className="pl-10"
                    />
                  </div>
                </label>
                <label className={settingsFieldClass}>
                  Category
                  <select
                    value={mergeFieldCategory}
                    onChange={(event) => setMergeFieldCategory(event.target.value)}
                  >
                    {canonicalCategories.map((category) => (
                      <option key={category} value={category}>
                        {category === 'all' ? 'All Categories' : category}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 space-y-4">
                {variableGroups.map((group) => {
                  const groupRows = filteredCanonicalFields.filter((field) => group.categories.includes(normalizeText(field.category)))
                  if (!groupRows.length) return null
                  return (
                    <div key={group.key} className="rounded-[22px] border border-[#dbe7f3] bg-[#fbfdff] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">{group.label}</p>
                          <p className="mt-1 text-sm text-[#6b7c93]">{groupRows.length} available variable{groupRows.length === 1 ? '' : 's'}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {groupRows.map((field) => (
                          <div key={field.key} className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#e7eef6] bg-white px-4 py-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#102033]">{field.label}</p>
                              <p className="mt-1 font-mono text-[11px] text-[#6b7c93]">{`{{${field.key}}}`}</p>
                              <p className="mt-1 text-xs text-[#8aa0b7]">{field.description}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className={studioSecondaryButtonClass}
                                onClick={() => handleInsertVariableToken(field.key)}
                                disabled={!selectedSection || !selectedIsOrgOwned || !canEdit}
                              >
                                <Sparkles size={14} />
                                <span>Insert</span>
                              </button>
                              <button
                                type="button"
                                className={studioQuietButtonClass}
                                onClick={() => void handleCopyToken(field.key)}
                              >
                                <span>Copy Token</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </TemplateStudioPanel>

            <div className="space-y-6">
              <TemplateStudioPanel
                eyebrow="Registry"
                title="Template Variables"
                description="Advanced merge-field mappings and governance for this document type."
              >
                <div className="overflow-x-auto rounded-[20px] border border-[#dbe7f3] bg-white">
                  <table className="min-w-[620px] w-full text-left text-sm">
                    <thead className="bg-[#f6f9fc] text-[0.68rem] uppercase tracking-[0.14em] text-[#6b7d93]">
                      <tr>
                        <th className="px-4 py-3">Merge Field</th>
                        <th className="px-4 py-3">Entity</th>
                        <th className="px-4 py-3">Required</th>
                        <th className="px-4 py-3">Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {placeholderRegistry.length ? placeholderRegistry.map((row) => {
                        const rowKey = normalizeText(row.placeholder_key)
                        const rowSaving = savingPlaceholder === rowKey
                        return (
                          <tr key={`${row.packet_type}-${row.placeholder_key}`} className="border-t border-[#ecf1f6]">
                            <td className="px-4 py-3">
                              <p className="font-mono text-xs font-semibold text-[#162334]">{row.placeholder_key}</p>
                              <p className="text-xs text-[#6b7d93]">{row.description || 'No description yet.'}</p>
                            </td>
                            <td className="px-4 py-3 text-[#445b73]">{row.entity_scope || 'transaction'}</td>
                            <td className="px-4 py-3">
                              <label className="inline-flex items-center gap-2 text-xs text-[#445b73]">
                                <input
                                  type="checkbox"
                                  checked={Boolean(row.is_required_default)}
                                  disabled={!canEdit || rowSaving}
                                  onChange={(event) => void togglePlaceholderFlag(row, 'isRequiredDefault', event.target.checked)}
                                />
                                Required
                              </label>
                            </td>
                            <td className="px-4 py-3">
                              <label className="inline-flex items-center gap-2 text-xs text-[#445b73]">
                                <input
                                  type="checkbox"
                                  checked={row.is_active !== false}
                                  disabled={!canEdit || rowSaving}
                                  onChange={(event) => void togglePlaceholderFlag(row, 'isActive', event.target.checked)}
                                />
                                Active
                              </label>
                            </td>
                          </tr>
                        )
                      }) : (
                        <tr>
                          <td className="px-4 py-6 text-sm text-[#6b7d93]" colSpan={4}>
                            No merge-field definitions yet for this template type.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TemplateStudioPanel>

              {canEdit ? (
                <TemplateStudioPanel
                  eyebrow="Advanced"
                  title="Add Custom Variable"
                  description="Create additional merge fields without changing the existing resolution logic."
                >
                  <div className={settingsGridClass}>
                    <label className={settingsFieldClass}>
                      Placeholder key
                      <input
                        type="text"
                        value={placeholderForm.placeholderKey}
                        onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, placeholderKey: event.target.value }))}
                        placeholder="seller_full_name"
                      />
                    </label>
                    <label className={settingsFieldClass}>
                      Entity scope
                      <input
                        type="text"
                        value={placeholderForm.entityScope}
                        onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, entityScope: event.target.value }))}
                        placeholder="transaction"
                      />
                    </label>
                    <label className={settingsFieldClass}>
                      Data type
                      <input
                        type="text"
                        value={placeholderForm.dataType}
                        onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, dataType: event.target.value }))}
                        placeholder="text"
                      />
                    </label>
                    <label className={settingsFieldClass}>
                      Example value
                      <input
                        type="text"
                        value={placeholderForm.exampleValue}
                        onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, exampleValue: event.target.value }))}
                      />
                    </label>
                    <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                      Description
                      <textarea
                        rows={3}
                        value={placeholderForm.description}
                        onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, description: event.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="flex items-center gap-3 rounded-[18px] border border-[#dbe7f3] bg-[#fbfdff] px-4 py-3 text-sm text-[#445b73]">
                      <input
                        type="checkbox"
                        checked={Boolean(placeholderForm.isRequiredDefault)}
                        onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, isRequiredDefault: event.target.checked }))}
                      />
                      Required by default
                    </label>
                    <label className="flex items-center gap-3 rounded-[18px] border border-[#dbe7f3] bg-[#fbfdff] px-4 py-3 text-sm text-[#445b73]">
                      <input
                        type="checkbox"
                        checked={placeholderForm.isActive !== false}
                        onChange={(event) => setPlaceholderForm((previous) => ({ ...previous, isActive: event.target.checked }))}
                      />
                      Active
                    </label>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      className={studioPrimaryButtonClass}
                      onClick={(event) => void handleSavePlaceholder(event)}
                      disabled={Boolean(savingPlaceholder)}
                    >
                      <Plus size={15} />
                      <span>{savingPlaceholder ? 'Saving…' : 'Save Variable'}</span>
                    </button>
                  </div>
                </TemplateStudioPanel>
              ) : null}
            </div>
          </div>
        ) : (
          <SettingsEmptyState
            title="Choose a template first"
            description="Select or create a template to manage its variables."
          />
        )
      ) : null}

      {activeTab === 'settings' ? (
        selectedTemplate ? (
          <form onSubmit={handleSave} className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <TemplateStudioPanel
              eyebrow="Template Settings"
              title="Template Metadata"
              description="Name, describe, and control the status of the version you are editing."
            >
              <div className={settingsGridClass}>
                <label className={settingsFieldClass}>
                  Template name
                  <input
                    type="text"
                    value={form.templateLabel}
                    disabled={!canEdit || !selectedIsOrgOwned}
                    onChange={(event) => setForm((previous) => ({ ...previous, templateLabel: event.target.value }))}
                  />
                </label>

                <label className={settingsFieldClass}>
                  Version label
                  <input
                    type="text"
                    value={form.versionTag}
                    disabled={!canEdit || !selectedIsOrgOwned}
                    onChange={(event) => setForm((previous) => ({ ...previous, versionTag: event.target.value }))}
                  />
                </label>

                <label className={settingsFieldClass}>
                  Status
                  <select
                    value={form.templateStatus}
                    disabled={!canEdit || !selectedIsOrgOwned}
                    onChange={(event) => setForm((previous) => ({ ...previous, templateStatus: event.target.value }))}
                  >
                    {TEMPLATE_STATUS_OPTIONS.map((item) => (
                      <option key={item.key} value={item.key}>{item.label}</option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-3 rounded-[18px] border border-[#dbe7f3] bg-[#fbfdff] px-4 py-3 text-sm text-[#445b73]">
                  <input
                    type="checkbox"
                    checked={Boolean(form.isActive)}
                    disabled={!canEdit || !selectedIsOrgOwned}
                    onChange={(event) => setForm((previous) => ({ ...previous, isActive: event.target.checked }))}
                  />
                  Make this version available to the team
                </label>

                <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                  Description
                  <textarea
                    rows={4}
                    value={form.description}
                    disabled={!canEdit || !selectedIsOrgOwned}
                    onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))}
                    placeholder="Short note to help your team know when to use this version."
                  />
                </label>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-[20px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Ownership</p>
                  <p className="mt-3 text-sm font-semibold text-[#102033]">{selectedIsOrgOwned ? 'Organisation version' : 'Shared base version'}</p>
                  <p className="mt-2 text-xs leading-5 text-[#6b7c93]">
                    {selectedIsOrgOwned
                      ? 'Your team can edit this version, save changes, and publish it live.'
                      : 'Create a draft copy before making wording or publishing changes.'}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Generation Mode</p>
                  <p className="mt-3 text-sm font-semibold text-[#102033]">{formatRenderModeLabel(selectedClassification.renderMode)}</p>
                  <p className="mt-2 text-xs leading-5 text-[#6b7c93]">
                    {selectedClassification.renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED
                      ? 'Built from sections and merge fields inside Bridge.'
                      : 'Uses an uploaded DOCX file as the base template.'}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8da6]">Live Use</p>
                  <p className="mt-3 text-sm font-semibold text-[#102033]">{form.isDefault ? 'Currently live default' : 'Not the live default'}</p>
                  <p className="mt-2 text-xs leading-5 text-[#6b7c93]">
                    {form.isDefault
                      ? 'New documents of this type already start from this version.'
                      : 'Publish this version as live when you are ready for new documents to use it.'}
                  </p>
                </div>
              </div>
            </TemplateStudioPanel>

            <div className="space-y-6">
              <TemplateStudioPanel
                eyebrow="Generation"
                title="Output & Storage"
                description="Keep the existing generation mode and file paths intact while making changes to this version."
              >
                <div className={settingsGridClass}>
                  <label className={settingsFieldClass}>
                    Generation mode
                    <select
                      value={form.renderMode}
                      disabled={!canEdit || !selectedIsOrgOwned}
                      onChange={(event) => setForm((previous) => {
                        const nextRenderMode = event.target.value
                        return {
                          ...previous,
                          renderMode: nextRenderMode,
                          templateFormat: getTemplateFormatForMode(nextRenderMode),
                        }
                      })}
                    >
                      {TEMPLATE_RENDER_MODE_OPTIONS
                        .filter((item) => packetType === 'mandate' || packetType.startsWith('commercial_') || item.key === TEMPLATE_RENDER_MODES.LEGACY_DOCX)
                        .map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.key === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? 'Built in app' : 'File based (DOCX)'}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className={settingsFieldClass}>
                    Output type
                    <input type="text" value={form.templateFormat} disabled readOnly />
                  </label>

                  <label className={settingsFieldClass}>
                    Output bucket
                    <input
                      type="text"
                      value={form.templateOutputBucket}
                      disabled={!canEdit || !selectedIsOrgOwned}
                      onChange={(event) => setForm((previous) => ({ ...previous, templateOutputBucket: event.target.value }))}
                    />
                  </label>
                </div>

                {form.renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? (
                  <div className="mt-4">
                    <SettingsBanner tone={validationSummary.renderable ? 'success' : 'warning'}>
                      {validationSummary.renderable
                        ? 'This in-app template is ready to use. No DOCX file is needed.'
                        : 'This in-app template can still be saved, but you may want to review warnings before publishing it live.'}
                    </SettingsBanner>
                  </div>
                ) : null}

                <div className="mt-5 rounded-[22px] border border-[#dbe7f3] bg-[#fbfdff] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-[#102033]">
                        {form.renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED ? 'In-app rendering' : 'DOCX source file'}
                      </h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7c93]">
                        {form.renderMode === TEMPLATE_RENDER_MODES.NATIVE_STRUCTURED
                          ? 'This version is built from sections and merge fields inside the app.'
                          : 'This version depends on an uploaded DOCX file path and bucket.'}
                      </p>
                    </div>

                    {form.renderMode === TEMPLATE_RENDER_MODES.LEGACY_DOCX && canEdit && selectedIsOrgOwned ? (
                      <label className={`${studioSecondaryButtonClass} cursor-pointer`}>
                        <Upload size={14} />
                        <span>{uploadingTemplate ? 'Uploading…' : 'Upload DOCX'}</span>
                        <input
                          type="file"
                          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          className="hidden"
                          onChange={(event) => void handleUploadTemplateFile(event)}
                          disabled={uploadingTemplate}
                        />
                      </label>
                    ) : null}
                  </div>

                  {form.renderMode === TEMPLATE_RENDER_MODES.LEGACY_DOCX ? (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className={settingsFieldClass}>
                        Storage bucket
                        <input
                          type="text"
                          value={form.templateStorageBucket}
                          disabled={!canEdit || !selectedIsOrgOwned}
                          onChange={(event) => setForm((previous) => ({ ...previous, templateStorageBucket: event.target.value }))}
                        />
                      </label>

                      <label className={settingsFieldClass}>
                        File name
                        <input
                          type="text"
                          value={form.templateFileName}
                          disabled={!canEdit || !selectedIsOrgOwned}
                          onChange={(event) => setForm((previous) => ({ ...previous, templateFileName: event.target.value }))}
                        />
                      </label>

                      <label className={`${settingsFieldClass} ${settingsFieldSpanClass}`}>
                        Storage path
                        <input
                          type="text"
                          value={form.templateStoragePath}
                          disabled={!canEdit || !selectedIsOrgOwned}
                          onChange={(event) => setForm((previous) => ({ ...previous, templateStoragePath: event.target.value }))}
                          placeholder="legal-templates/{organisation}/{packetType}/template.docx"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </TemplateStudioPanel>

              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={studioSecondaryButtonClass} onClick={() => setActiveTab('preview')}>
                  <Eye size={14} />
                  <span>Preview</span>
                </button>
                <button
                  type="submit"
                  className={studioPrimaryButtonClass}
                  disabled={!canEdit || !selectedIsOrgOwned || saving}
                >
                  <Save size={14} />
                  <span>{saving ? 'Saving…' : 'Save Template'}</span>
                </button>
              </div>
            </div>
          </form>
        ) : (
          <SettingsEmptyState
            title="Choose a template first"
            description="Select or create a template to edit metadata and generation settings."
          />
        )
      ) : null}

      {activeTab === 'preview' ? (
        selectedTemplate ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <TemplateStudioPanel
              eyebrow="Test & Preview"
              title="Sample Preview"
              description="Validate the current saved template with safe sample data before publishing."
              actions={
                <button
                  type="button"
                  className={studioPrimaryButtonClass}
                  onClick={() => void handleTestGenerate()}
                  disabled={testingTemplate}
                >
                  <FlaskConical size={14} />
                  <span>{testingTemplate ? 'Generating…' : 'Test Generate'}</span>
                </button>
              }
            >
              <div className="rounded-[24px] border border-[#dbe7f3] bg-[#f5f7fb] p-5">
                <div className="flex min-h-[620px] items-start justify-center overflow-auto rounded-[22px] border border-[#e7eef6] bg-[radial-gradient(circle_at_top,_#ffffff_0%,_#f5f7fb_100%)] p-5">
                  <div className="w-full max-w-[760px] rounded-[20px] border border-[#e2eaf3] bg-white p-8 shadow-[0_26px_48px_rgba(15,23,42,0.12)]">
                    {previewState.loading ? (
                      <SettingsLoadingState compact label="Preparing sample preview…" />
                    ) : previewState.error ? (
                      <SettingsBanner tone="error">{previewState.error}</SettingsBanner>
                    ) : previewState.html ? (
                      <div className="space-y-4 text-sm leading-6 text-[#233246]">
                        {previewState.critical.length ? (
                          <SettingsBanner tone="error">Critical validation issues detected in sample preview.</SettingsBanner>
                        ) : null}
                        {previewState.warnings.length ? (
                          <SettingsBanner tone="warning">Sample preview generated with warning-level data gaps.</SettingsBanner>
                        ) : null}
                        <div dangerouslySetInnerHTML={{ __html: previewState.html }} />
                      </div>
                    ) : (
                      <SettingsEmptyState
                        title="Preview not generated yet"
                        description="Run Test Generate to render this template using sample data without affecting live transactions."
                      />
                    )}
                  </div>
                </div>
              </div>
            </TemplateStudioPanel>

            <div className="space-y-6">
              <TemplateStudioPanel
                eyebrow="Health"
                title="Checklist"
                description="Use the existing validation summary to decide whether this template is safe to publish."
              >
                <div className="space-y-3">
                  {validationSummary.blockers.length ? validationSummary.blockers.map((item) => (
                    <p key={`preview-blocker-${item}`} className="flex items-start gap-2 rounded-[16px] border border-[#f3d1ce] bg-[#fff4f3] px-4 py-3 text-sm text-[#8e1f15]">
                      <XCircle size={16} className="mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </p>
                  )) : (
                    <p className="flex items-center gap-2 rounded-[16px] border border-[#ccead8] bg-[#f2fbf5] px-4 py-3 text-sm text-[#1f7a45]">
                      <CheckCircle2 size={16} />
                      No blocking issues detected.
                    </p>
                  )}

                  {validationSummary.warnings.map((item) => (
                    <p key={`preview-warning-${item}`} className="flex items-start gap-2 rounded-[16px] border border-[#f4e2bf] bg-[#fff8ec] px-4 py-3 text-sm text-[#7d520d]">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </p>
                  ))}
                </div>
              </TemplateStudioPanel>

              <TemplateStudioPanel
                eyebrow="Field Coverage"
                title="Fields Used"
                description="Variables detected across the current template version."
              >
                {validationSummary.tokenList.length ? (
                  <div className="flex flex-wrap gap-2">
                    {validationSummary.tokenList.map((token) => (
                      <span
                        key={token}
                        className="inline-flex items-center gap-1 rounded-full border border-[#dbe7f3] bg-[#f8fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#35546c]"
                      >
                        <CircleDot size={10} />
                        {token}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-[#6b7c93]">No merge fields detected yet for this template version.</p>
                )}
              </TemplateStudioPanel>
            </div>
          </div>
        ) : (
          <SettingsEmptyState
            title="Choose a template first"
            description="Select or create a template before running test generation and preview."
          />
        )
      ) : null}

      {activeTab === 'activity' ? (
        selectedTemplate ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
            <TemplateStudioPanel
              eyebrow="Version History"
              title="Template Versions"
              description="Available versions for this document type, with the current selection highlighted."
            >
              <div className="space-y-3">
                {selectedList.map((template) => {
                  const status = normalizeTemplateStatus(template)
                  const classification = classifyTemplateMigrationState(template, packetType)
                  const active = template.id === selectedTemplateId
                  return (
                    <div
                      key={template.id}
                      className={[
                        'rounded-[20px] border p-4',
                        active ? 'border-[#bcd6ff] bg-[#eef5ff]' : 'border-[#dbe7f3] bg-white',
                      ].join(' ')}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-[#102033]">{template.template_label || template.template_key}</p>
                          <p className="text-sm text-[#6b7c93]">{template.description || 'No description yet.'}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {template.is_default ? <TemplateStatusPill status="active">Default</TemplateStatusPill> : null}
                          <TemplateStatusPill status={status}>{TEMPLATE_STATUS_OPTIONS.find((item) => item.key === status)?.label || 'Draft'}</TemplateStatusPill>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 text-sm text-[#445b73] md:grid-cols-3">
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7a8da6]">Version</p>
                          <p className="mt-1">{template.version_tag || 'v1'}</p>
                        </div>
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7a8da6]">Generation</p>
                          <p className="mt-1">{formatRenderModeLabel(classification.renderMode)}</p>
                        </div>
                        <div>
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7a8da6]">Updated</p>
                          <p className="mt-1">{formatDateTime(template.updated_at)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </TemplateStudioPanel>

            <div className="space-y-6">
              <TemplateStudioPanel
                eyebrow="Current Activity"
                title="Publishing Context"
                description="Live status and recent template timestamps from the current record."
              >
                <div className="space-y-3">
                  {activityItems.length ? activityItems.map((item) => (
                    <div key={item.key} className="rounded-[18px] border border-[#dbe7f3] bg-[#fbfdff] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#102033]">{item.title}</p>
                        <span className="inline-flex items-center gap-1 text-xs text-[#7a8da6]">
                          <Clock3 size={12} />
                          {formatDateTime(item.timestamp)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#6b7c93]">{item.detail}</p>
                    </div>
                  )) : (
                    <p className="text-sm leading-6 text-[#6b7c93]">Activity will appear here as template timestamps become available.</p>
                  )}
                </div>
              </TemplateStudioPanel>

              <TemplateStudioPanel
                eyebrow="Publishing"
                title="Live Template"
                description="The version new documents currently use."
              >
                {liveTemplate ? (
                  <div className="rounded-[22px] border border-[#dbe7f3] bg-[#f8fbff] p-4">
                    <p className="text-base font-semibold text-[#102033]">{liveTemplate.template_label || liveTemplate.template_key}</p>
                    <p className="mt-2 text-sm text-[#6b7c93]">{liveTemplate.version_tag || 'v1'} · {formatDateTime(liveTemplate.updated_at)}</p>
                    <p className="mt-2 text-sm text-[#6b7c93]">Published by: {getTemplateActorLabel(liveTemplate)}</p>
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-[#6b7c93]">No live default template is active yet for this document type.</p>
                )}
              </TemplateStudioPanel>
            </div>
          </div>
        ) : (
          <SettingsEmptyState
            title="Choose a template first"
            description="Select or create a template to review versions and publishing context."
          />
        )
      ) : null}

      {showPublishConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(16,32,51,0.28)] px-4">
          <div className="w-full max-w-md rounded-[30px] border border-[#dbe7f3] bg-white p-6 shadow-[0_28px_60px_rgba(15,23,42,0.24)]">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7a8da6]">Publish Template</p>
            <h2 className="mt-3 text-[1.35rem] font-semibold text-[#102033]">Publish this template?</h2>
            <p className="mt-3 text-sm leading-7 text-[#6b7c93]">
              New documents of this type will use this version going forward. Existing transactions will not be changed.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={studioSecondaryButtonClass} onClick={() => setShowPublishConfirm(false)}>
                Cancel
              </button>
              <button type="button" className={studioPrimaryButtonClass} onClick={() => void confirmPublishTemplate()} disabled={saving}>
                <ShieldCheck size={14} />
                <span>{saving ? 'Publishing…' : 'Publish Template'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
