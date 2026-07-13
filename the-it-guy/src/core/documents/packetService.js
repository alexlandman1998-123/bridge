import { generateMandateDocumentFromTemplate, generateOtpDocumentFromTemplate } from '../../lib/api'
import {
  addPacketEvent,
  archiveDocumentPacket,
  checkDocumentConversionHealth as checkDocumentConversionHealthRecord,
  createDocumentPacketSigners as createPacketSignersRecord,
  createDocumentSigningFields as createPacketSigningFieldRecords,
  createDocumentPacketVersion,
  generateFinalSignedDocument as generateFinalSignedDocumentRecord,
  deleteDocumentPacketSigners as deletePacketSignersRecord,
  deleteDocumentSigningFields as deletePacketSigningFieldsRecord,
  createPacket,
  fetchDocumentPacket,
  generateDocumentPacketSigningLinks as generatePacketSigningLinksRecord,
  getPacketTemplate,
  getPacketTemplates,
  getDocumentPacketSigningSummary as getPacketSigningSummaryRecord,
  getPackets,
  listDocumentPacketSigners as listPacketSignersRecord,
  listDocumentSigningFields as listPacketSigningFieldsRecord,
  listDocumentPacketVersions,
  resolveDocumentPacketBranding,
  resolveActivePacketTemplate,
  updatePacket,
  updateDocumentSigningFieldStatus as updateSigningFieldStatusRecord,
  validateDocumentPacketPlaceholders,
} from './packetServiceApiAdapter'
import {
  buildPacketSectionManifest,
  renderPacketPreviewHtml,
  resolveMandatePacketPlaceholders,
  resolveOtpPacketPlaceholders,
  validateSellerPartyReadiness,
  validatePacketPlaceholders,
} from './packetWorkflow'
import { normalizeMergeFieldPayload } from './mergeFieldRegistry'
import { validateMandateGenerationData } from './mandateValidation'
import {
  buildMandateTemplateRoutingAudit,
  normalizeMandateTemplateVariant,
  resolveMandateTemplateRoutingProfile,
  scoreMandateTemplateCandidate,
} from './mandateTemplateRouting'
import {
  buildMandateTemplatePublishGateReport,
  formatMandateTemplatePublishGateIssue,
} from './mandateTemplatePublishGate'
import {
  buildMandateTemplateRuntimeLaunchReadiness,
  formatMandateTemplateLaunchReadinessIssue,
} from './mandateTemplateLaunchReadiness'
import {
  NATIVE_RENDERER_VERSION,
  normalizeTemplateRenderMode,
  resolveTemplateStorageConfig as resolveStructuredTemplateStorageConfig,
  templateIsUsableForGeneration,
  templateUsesNativeRenderer,
} from './structuredTemplateRenderer'
import { FEATURE_FLAGS } from '../../lib/featureFlags'
import {
  filterMandateSigningRows,
  resolveMandateSecondarySignerConfig,
  resolveMandateSpouseRequirementFromFields,
} from '../../lib/mandateSignatureRules'
import {
  COMMERCIAL_DOCUMENT_PACKET_TYPES,
  resolveCommercialDocumentContext,
} from '../../services/documents/commercialDocumentAdapterService'
import { classifySellerParty } from './documentPartyClassification'
import { resolveConditionalPackAudit } from './conditionalPackAudit'
import { evaluateVisibilityRules } from './sectionVisibilityRules'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNullableText(value) {
  const text = normalizeText(value)
  return text || null
}

const TEMPLATE_PREVIEW_VALIDATION_ACTION = 'template_preview'

function normalizeValidationAction(value, fallback = 'preview') {
  const action = normalizeText(value || fallback).toLowerCase()
  return action || fallback
}

function mapMandateValidationIssue(issue = {}) {
  return {
    sectionKey: issue.groupKey || 'mandate_validation',
    sectionLabel: issue.group || 'Mandate Validation',
    placeholderKey: issue.field,
    placeholderLabel: issue.label,
    message: issue.message,
  }
}

function normalizeValidationRequirement(issue = {}, source = 'template') {
  const placeholderKey = normalizeText(issue.placeholderKey || issue.placeholder_key || issue.field || issue.key)
  const placeholderLabel = normalizeText(issue.placeholderLabel || issue.placeholder_label || issue.label || placeholderKey)
  const sectionKey = normalizeText(issue.sectionKey || issue.section_key || issue.groupKey || source)
  const sectionLabel = normalizeText(issue.sectionLabel || issue.section_label || issue.group || 'Data required later')
  let message = normalizeText(issue.message) ||
    (placeholderLabel ? `${placeholderLabel} is needed when generating a real document.` : 'Live data is needed when generating a real document.')
  if (/^Missing\s/i.test(message) && placeholderLabel) {
    message = `${placeholderLabel} will be required when generating a real document.`
  } else if (/^Optional\s/i.test(message) && placeholderLabel) {
    message = `${placeholderLabel} can be collected when generating a real document.`
  } else if (/is required before generating/i.test(message)) {
    message = message.replace(/is required before generating/i, 'will be required when generating')
  } else if (/is not captured/i.test(message)) {
    message = message.replace(/is not captured/i, 'can be collected')
  }

  return {
    sectionKey,
    sectionLabel,
    placeholderKey,
    placeholderLabel,
    message,
    source,
    required: Boolean(issue.required),
  }
}

function dedupeValidationRequirements(issues = []) {
  const seen = new Set()
  const rows = []

  for (const issue of issues) {
    const normalized = normalizeValidationRequirement(issue, issue?.source || 'template')
    const placeholderKey = normalizeText(normalized.placeholderKey).toLowerCase()
    const key = placeholderKey
      ? `placeholder|${placeholderKey}`
      : `message|${normalizeText(normalized.sectionKey).toLowerCase()}|${normalizeText(normalized.message).toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(normalized)
  }

  return rows
}

function dedupeValidationIssues(issues = []) {
  const seen = new Set()
  const rows = []

  for (const issue of issues) {
    const placeholderKey = normalizeText(issue?.placeholderKey || issue?.placeholder_key || issue?.field || issue?.key).toLowerCase()
    const sectionKey = normalizeText(issue?.sectionKey || issue?.section_key || issue?.groupKey || issue?.source).toLowerCase()
    const message = normalizeText(issue?.message).toLowerCase()
    const key = placeholderKey
      ? `placeholder|${placeholderKey}`
      : `message|${sectionKey}|${message}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(issue)
  }

  return rows
}

function buildWarningsSnapshot(context = {}, validation = {}) {
  const contextWarnings = Array.isArray(context?.mandateValidation?.warnings)
    ? context.mandateValidation.warnings
    : []
  return dedupeValidationIssues([
    ...contextWarnings,
    ...(validation?.warnings || []),
  ])
}

function isMissingPlaceholderWarning(issue = {}, missingPlaceholderKeys = new Set()) {
  const placeholderKey = normalizeText(issue.placeholderKey || issue.placeholder_key).toLowerCase()
  const message = normalizeText(issue.message)
  return Boolean(placeholderKey && missingPlaceholderKeys.has(placeholderKey) && /^(Missing|Optional)\s/i.test(message))
}

function normalizeNullableUuid(value) {
  const text = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null
}

function normalizePathSegment(value = '', fallback = 'item') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback
}

function resolvePublicAssetUrl(value = '') {
  const raw = normalizeText(value)
  if (!raw) return ''
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw
  const path = raw.startsWith('/') ? raw : `/${raw}`
  const configuredBase =
    normalizeText(import.meta.env?.VITE_PUBLIC_APP_URL) ||
    normalizeText(import.meta.env?.VITE_APP_URL) ||
    normalizeText(import.meta.env?.VITE_SITE_URL)
  const browserBase = typeof window !== 'undefined' ? normalizeText(window.location?.origin) : ''
  const base = (configuredBase || browserBase).replace(/\/+$/, '')
  return base ? `${base}${path}` : path
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

function hashString(value = '') {
  let hash = 2166136261
  const input = String(value || '')
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function buildContentFingerprint(value) {
  return hashString(stableSerialize(value))
}

function sanitizeTemplatePlaceholders(placeholders = {}) {
  return Object.entries(placeholders && typeof placeholders === 'object' ? placeholders : {}).reduce((acc, [key, value]) => {
    acc[key] = value === null || value === undefined || value === '' ? 'Not provided' : value
    return acc
  }, {})
}

function resolveTemplateVersion(template = null) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  return (
    normalizeText(template?.version_tag) ||
    normalizeText(template?.versionTag) ||
    normalizeText(metadata?.version) ||
    normalizeText(metadata?.templateVersion) ||
    normalizeText(template?.updated_at) ||
    null
  )
}

function buildGenerationOutputPath({ packet, context = {}, generatedAt = new Date().toISOString() } = {}) {
  const organisationId = normalizePathSegment(packet?.organisation_id || context?.organisationId, 'organisation')
  const leadOrPacketId =
    normalizeText(context?.lead?.lead_id || context?.lead?.id || context?.leadId) ||
    normalizeText(packet?.lead_id) ||
    normalizeText(packet?.id) ||
    'packet'
  const timestamp = generatedAt.replace(/[^0-9a-z]/gi, '')
  return `mandates/${organisationId}/${normalizePathSegment(leadOrPacketId, 'packet')}/${timestamp}.pdf`
}

function buildGenerationPayload({
  packet = null,
  context = {},
  validation = {},
  template = null,
  templateResolution = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const mandateData = context?.mandateData || context?.generatedDataSnapshot || null
  const mandateValidation = context?.mandateValidation || validation?.mandateValidation || null
  const templateMetadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  const mandateScenarioProfile = validation?.mandateScenarioProfile ||
    mandateData?.scenarioProfile ||
    mandateData?.mandateScenarioProfile ||
    null
  const mandateTemplateVariant =
    normalizeText(validation?.placeholders?.mandate_template_variant) ||
    normalizeText(mandateData?.placeholders?.mandate_template_variant) ||
    normalizeText(mandateScenarioProfile?.templateVariant)
  const templateRouting = templateResolution?.mandateTemplateRouting || null
  const templateResolutionSource = normalizeText(templateResolution?.source) || null
  const outputBucket =
    normalizeText(template?.template_output_bucket) ||
    normalizeText(template?.templateOutputBucket) ||
    normalizeText(templateMetadata?.template_output_bucket) ||
    normalizeText(templateMetadata?.output_bucket) ||
    normalizeText(templateMetadata?.outputBucket) ||
    null
  return {
    packetId: normalizeText(packet?.id) || null,
    mandateData,
    mandateScenarioProfile,
    mandateTemplateVariant: mandateTemplateVariant || null,
    mandateTemplateRouting: templateRouting,
    templateResolutionSource,
    mandateTemplateFallback: Boolean(validation?.mandateTemplateFallback),
    mandateTemplateFallbackWarning: validation?.mandateTemplateFallbackWarning || null,
    mandateTemplateContentGate: validation?.mandateTemplateContentGate || null,
    mandateTemplateLaunchReadiness: validation?.mandateTemplateLaunchReadiness || null,
    validation: mandateValidation || buildValidationSummary(validation),
    template: template
      ? {
          id: normalizeText(template?.id) || null,
          key: normalizeText(template?.template_key || template?.key) || null,
          label: normalizeText(template?.template_label || template?.label) || null,
          version: resolveTemplateVersion(template),
          outputBucket,
          renderMode: resolveTemplateRenderMode(template, packet?.packet_type || context?.packetType || ''),
          rendererVersion: templateUsesNativeRenderer(template, packet?.packet_type || context?.packetType || '')
            ? NATIVE_RENDERER_VERSION
            : null,
          mandateTemplateVariant: mandateTemplateVariant || null,
          mandateTemplateRouting: templateRouting,
        }
      : null,
    templateResolution: templateResolution
      ? {
          source: templateResolutionSource,
          candidateCount: Number.isFinite(Number(templateResolution.candidateCount))
            ? Number(templateResolution.candidateCount)
            : null,
          candidateModuleTypes: Array.isArray(templateResolution.candidateModuleTypes)
            ? templateResolution.candidateModuleTypes
            : [],
          mandateTemplateRouting: templateRouting,
        }
      : null,
    sourceContext: mandateData?.sourceContext || context?.sourceContext || null,
    generatedAt,
    generatedBy: normalizeText(context?.generatedByUserId) || null,
  }
}

function resolveReadOnlyAnnexures(sourceContext = null) {
  const context = sourceContext && typeof sourceContext === 'object' ? sourceContext : {}
  if (Array.isArray(context.readOnlyAnnexures)) return context.readOnlyAnnexures
  if (Array.isArray(context.read_only_annexures)) return context.read_only_annexures
  if (Array.isArray(context.otpAnnexures)) return context.otpAnnexures
  if (Array.isArray(context.otp_annexures)) return context.otp_annexures
  const disclosureAnnexure = context.propertyDisclosureAnnexure || context.property_disclosure_annexure
  return disclosureAnnexure && typeof disclosureAnnexure === 'object' ? [disclosureAnnexure] : []
}

function buildRenderProvenance({
  packetType = '',
  template = null,
  validation = {},
  pdfPlaceholders = {},
  generationPayload = null,
  templateVersion = null,
  generatedAt = null,
} = {}) {
  const normalizedPacketType = normalizeText(packetType || validation?.packetType).toLowerCase()
  const renderMode = resolveTemplateRenderMode(template, normalizedPacketType)
  const rendererVersion = renderMode === 'native_structured' ? NATIVE_RENDERER_VERSION : 'legacy_docx'
  const sectionManifest = Array.isArray(validation?.sectionManifest) ? validation.sectionManifest : []
  const mandateScenarioProfile = generationPayload?.mandateScenarioProfile || validation?.mandateScenarioProfile || null
  const mandateTemplateVariant =
    normalizeText(generationPayload?.mandateTemplateVariant) ||
    normalizeText(mandateScenarioProfile?.templateVariant) ||
    normalizeText(pdfPlaceholders?.mandate_template_variant)
  const contentFingerprint = buildContentFingerprint({
    packetType: normalizedPacketType,
    renderMode,
    templateId: normalizeText(template?.id) || null,
    templateVersion: templateVersion || null,
    mandateTemplateVariant: mandateTemplateVariant || null,
    placeholders: pdfPlaceholders && typeof pdfPlaceholders === 'object' ? pdfPlaceholders : {},
    sections: sectionManifest,
  })

  return {
    packetType: normalizedPacketType || null,
    renderMode,
    rendererVersion,
    templateId: normalizeText(template?.id) || null,
    templateKey: normalizeText(template?.template_key || template?.key) || null,
    templateLabel: normalizeText(template?.template_label || template?.label) || null,
    templateVersion: templateVersion || null,
    templateResolutionSource: normalizeText(generationPayload?.templateResolutionSource) || null,
    mandateTemplateVariant: mandateTemplateVariant || null,
    mandateTemplateFallback: Boolean(generationPayload?.mandateTemplateFallback),
    mandateTemplateLaunchReadinessStatus: normalizeText(generationPayload?.mandateTemplateLaunchReadiness?.status) || null,
    sellerClauseProfile: normalizeText(mandateScenarioProfile?.sellerClauseProfile || pdfPlaceholders?.seller_clause_profile) || null,
    propertyClauseProfile: normalizeText(mandateScenarioProfile?.propertyClauseProfile || pdfPlaceholders?.property_clause_profile) || null,
    generatedAt: generatedAt || null,
    sectionManifestHash: buildContentFingerprint(sectionManifest),
    placeholderHash: buildContentFingerprint(pdfPlaceholders && typeof pdfPlaceholders === 'object' ? pdfPlaceholders : {}),
    generationPayloadHash: buildContentFingerprint(generationPayload && typeof generationPayload === 'object' ? generationPayload : {}),
    contentFingerprint,
  }
}

async function recordGenerationFailure({
  packet = null,
  template = null,
  validation = {},
  artifact = {},
  failureCode = '',
  failureMessage = '',
  pdfPlaceholders = {},
  generationPayload = null,
  templateVersion = null,
  templateResolution = null,
  generatedAt = null,
  sourceContextSnapshot = null,
  context = {},
} = {}) {
  const renderProvenance = buildRenderProvenance({
    packetType: validation?.packetType,
    template,
    validation,
    pdfPlaceholders,
    generationPayload,
    templateVersion,
    generatedAt,
  })
  const failedVersion = await createDocumentPacketVersionSafely({
    packetId: packet.id,
    renderStatus: 'failed',
    renderedDocumentId: artifact.renderedDocumentId,
    renderedFilePath: artifact.renderedFilePath,
    renderedFileName: artifact.renderedFileName,
    renderedFileUrl: artifact.renderedFileUrl,
    placeholdersResolvedJson: pdfPlaceholders,
    placeholdersMissingJson: validation.missingPlaceholders,
    sectionManifestJson: validation.sectionManifest,
    validationSummaryJson: {
      ...buildValidationSummary(validation),
      generationStatus: 'failed',
      failureCode,
      failureMessage,
      generationPayload,
      templateVersion,
      templateResolution,
      generatedAt,
      render_provenance: renderProvenance,
      generatedDataSnapshot: context?.mandateData || context?.generatedDataSnapshot || null,
      missingFieldsSnapshot: context?.mandateValidation?.missingRequiredFields || validation.missingPlaceholders || [],
      warningsSnapshot: buildWarningsSnapshot(context, validation),
      sourceContext: sourceContextSnapshot,
    },
    generatedBy: context?.generatedByUserId || null,
    generatedAt,
  })

  await addPacketEvent({
    packetId: packet.id,
    organisationId: packet.organisation_id,
    versionId: failedVersion.id,
    eventType: 'generation_failed',
    eventPayload: {
      activity_type: 'generation_failed',
      leadId: context?.lead?.lead_id || context?.lead?.id || context?.leadId || null,
      transactionId: context?.transaction?.id || context?.transactionId || null,
      packetType: validation.packetType,
      failureCode,
      failureMessage,
      failed_action: 'generate',
      missing_fields: context?.mandateValidation?.missingRequiredFields || validation.missingPlaceholders || [],
      source_context: sourceContextSnapshot,
      message: failureMessage,
      metadata: {
        error_code: failureCode,
        safe_error_summary: failureMessage,
      },
    },
  })

  await updatePacketFresh(packet.id, {
    status: 'draft',
    sourceContextJson: {
      ...(packet?.source_context_json || {}),
      lastFailureCode: failureCode,
      lastFailureMessage: failureMessage,
      lastFailureVersion: failedVersion.version_number,
      generationPayload,
      templateVersion,
      templateResolution,
      generatedAt,
      renderProvenance,
      generatedDataSnapshot: context?.mandateData || context?.generatedDataSnapshot || null,
      missingFieldsSnapshot: context?.mandateValidation?.missingRequiredFields || validation.missingPlaceholders || [],
      warningsSnapshot: buildWarningsSnapshot(context, validation),
      sourceContext: sourceContextSnapshot,
    },
  })

  return failedVersion
}

async function createDocumentPacketVersionSafely(input = {}) {
  try {
    return await createDocumentPacketVersion(input)
  } catch (error) {
    console.error('[PACKETS] packet version creation failed', {
      packetId: normalizeText(input?.packetId) || null,
      renderStatus: normalizeText(input?.renderStatus) || null,
      code: error?.code || null,
      message: error?.message || null,
    })
    throw createPacketError(
      'PACKET_VERSION_CREATE_FAILED',
      toFriendlyGenerationMessage('PACKET_VERSION_CREATE_FAILED'),
      { cause: error },
    )
  }
}

function createPacketError(code, message, details = {}) {
  const error = new Error(message)
  error.code = code
  error.details = details
  return error
}

async function updatePacketFresh(packetId, updates = {}) {
  const resolvedPacketId = normalizeText(packetId)
  if (!resolvedPacketId) throw new Error('packetId is required.')

  const prepareUpdates = async () => {
    const latestPacket = await fetchDocumentPacket(resolvedPacketId, {
      includeVersions: false,
      includeEvents: false,
    })
    const latestSourceContext =
      latestPacket?.source_context_json && typeof latestPacket.source_context_json === 'object'
        ? latestPacket.source_context_json
        : {}
    return {
      ...updates,
      expectedUpdatedAt: latestPacket?.updated_at || null,
      sourceContextJson: updates.sourceContextJson && typeof updates.sourceContextJson === 'object'
        ? {
            ...latestSourceContext,
            ...updates.sourceContextJson,
          }
        : updates.sourceContextJson,
    }
  }

  try {
    return await updatePacket(resolvedPacketId, await prepareUpdates())
  } catch (error) {
    if (normalizeText(error?.code).toUpperCase() !== 'STALE_PACKET_STATE') throw error
    return updatePacket(resolvedPacketId, await prepareUpdates())
  }
}

function isMissingPacketTemplateSchemaError(error) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message).toLowerCase()
  return (
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes("document_packet_templates") ||
    message.includes('schema cache')
  )
}

function resolveTemplateConfig(template = null) {
  return resolveStructuredTemplateStorageConfig(template)
}

function resolveTemplateRenderMode(template = null, packetType = '') {
  return normalizeTemplateRenderMode(template, packetType)
}

function resolveTemplateModuleType(packetType = '', context = {}, template = null) {
  const explicit =
    normalizeText(context?.moduleType) ||
    normalizeText(context?.module_type) ||
    normalizeText(context?.templateModuleType) ||
    normalizeText(context?.template_module_type) ||
    normalizeText(template?.module_type)
  if (explicit) return explicit.toLowerCase()

  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  if (COMMERCIAL_DOCUMENT_PACKET_TYPES.includes(normalizedPacketType)) return 'commercial'
  return 'residential'
}

function resolveTemplateModuleCandidatesForPacket(packetType = '', moduleType = '') {
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  const normalizedModuleType = normalizeText(moduleType).toLowerCase()
  const candidates = []

  if (normalizedModuleType) candidates.push(normalizedModuleType)
  if (normalizedPacketType.startsWith('commercial_')) {
    candidates.push('commercial')
  } else if (['mandate', 'otp', 'addendum', 'supporting_legal', 'custom'].includes(normalizedPacketType)) {
    candidates.push('residential', 'agency')
  }
  candidates.push('shared')
  return Array.from(new Set(candidates.filter(Boolean)))
}

function resolveTemplateOrganisationId(context = {}) {
  return normalizeNullableUuid(
    context?.organisationId ||
    context?.organisation_id ||
    context?.transaction?.organisation_id ||
    context?.lead?.organisation_id ||
    context?.privateListing?.organisation_id ||
    context?.listing?.organisation_id ||
    context?.property?.organisation_id ||
    context?.deal?.organisation_id ||
    context?.landlord?.organisation_id ||
    context?.company?.organisation_id,
  )
}

function templateIsPublishedForRouting(template = {}) {
  const status = normalizeText(template?.status).toLowerCase()
  if (status) return status === 'published'
  return template?.is_active !== false
}

function resolveTemplateUpdatedAt(template = {}) {
  const parsed = Date.parse(template?.published_at || template?.updated_at || template?.created_at || '')
  return Number.isFinite(parsed) ? parsed : 0
}

function compareTemplateRoutingTie(left = {}, right = {}, { organisationId = '', moduleCandidates = [] } = {}) {
  const leftOrg = normalizeText(left?.organisation_id)
  const rightOrg = normalizeText(right?.organisation_id)
  const resolvedOrganisationId = normalizeText(organisationId)
  const leftOwnerRank = leftOrg && leftOrg === resolvedOrganisationId ? 0 : leftOrg ? 1 : 2
  const rightOwnerRank = rightOrg && rightOrg === resolvedOrganisationId ? 0 : rightOrg ? 1 : 2
  if (leftOwnerRank !== rightOwnerRank) return leftOwnerRank - rightOwnerRank

  const leftModule = normalizeText(left?.module_type).toLowerCase()
  const rightModule = normalizeText(right?.module_type).toLowerCase()
  const leftModuleRank = moduleCandidates.includes(leftModule) ? moduleCandidates.indexOf(leftModule) : moduleCandidates.length + 1
  const rightModuleRank = moduleCandidates.includes(rightModule) ? moduleCandidates.indexOf(rightModule) : moduleCandidates.length + 1
  if (leftModuleRank !== rightModuleRank) return leftModuleRank - rightModuleRank

  if (Boolean(left?.is_default) !== Boolean(right?.is_default)) return left?.is_default ? -1 : 1
  const updatedDelta = resolveTemplateUpdatedAt(right) - resolveTemplateUpdatedAt(left)
  if (updatedDelta) return updatedDelta
  return normalizeText(left?.id).localeCompare(normalizeText(right?.id))
}

async function resolveMandateScenarioTemplateForPacket({
  packetType,
  context = {},
  moduleType = '',
  organisationId = null,
  includeSections = true,
} = {}) {
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  if (normalizedPacketType !== 'mandate') return null

  const resolvedModuleType = normalizeText(moduleType) || resolveTemplateModuleType(normalizedPacketType, context)
  const moduleCandidates = resolveTemplateModuleCandidatesForPacket(normalizedPacketType, resolvedModuleType)
  const resolvedOrganisationId = organisationId || resolveTemplateOrganisationId(context)
  const rawPlaceholders = resolvePacketTypeContext(normalizedPacketType, context)
  const placeholders = normalizeMergeFieldPayload(rawPlaceholders, {
    packetType: normalizedPacketType,
    includeAliasKeys: true,
  }).payload
  const scenarioProfile = resolveMandateTemplateRoutingProfile({
    placeholders,
    seller: context?.mandateData?.seller || null,
    property: context?.mandateData?.property || null,
    mandate: context?.mandateData?.mandate || null,
    sourceContext: context?.mandateData?.sourceContext || context?.sourceContext || null,
    context,
  })

  const templateGroups = await Promise.all(
    moduleCandidates.map((candidateModuleType) => getPacketTemplates({
      packetType: normalizedPacketType,
      moduleType: candidateModuleType,
      includeInactive: false,
      organisationId: resolvedOrganisationId,
    }).catch((error) => {
      if (isMissingPacketTemplateSchemaError(error)) return []
      throw error
    })),
  )

  const templateById = new Map()
  for (const template of templateGroups.flat()) {
    if (!template?.id || !templateIsPublishedForRouting(template)) continue
    templateById.set(template.id, template)
  }

  const scored = Array.from(templateById.values())
    .map((candidateTemplate) => scoreMandateTemplateCandidate(candidateTemplate, {
      scenarioProfile,
      placeholders,
      context,
    }))
    .filter((row) => row.compatible)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return compareTemplateRoutingTie(left.template, right.template, {
        organisationId: resolvedOrganisationId,
        moduleCandidates,
      })
    })

  const selection = scored[0] || null
  if (!selection?.template?.id) {
    return {
      template: null,
      source: 'none',
      organisationId: resolvedOrganisationId,
      moduleType: resolvedModuleType,
      packetType: normalizedPacketType,
      candidateModuleTypes: moduleCandidates,
      candidateCount: templateById.size,
      mandateScenarioProfile: scenarioProfile,
      mandateTemplateRouting: buildMandateTemplateRoutingAudit(null, {
        profile: scenarioProfile,
      }),
    }
  }

  const hydratedTemplate = includeSections
    ? await getPacketTemplate(selection.template.id, { includeSections: true })
    : selection.template
  const routingAudit = buildMandateTemplateRoutingAudit(
    { ...selection, template: hydratedTemplate || selection.template },
    { profile: scenarioProfile },
  )
  const matchedSpecificRoute = (selection.reasons || []).some((reason) => [
    'exact_variant_metadata',
    'clause_profile_metadata',
    'seller_profile_metadata',
    'property_profile_metadata',
    'template_name_variant_match',
  ].includes(reason))

  return {
    template: hydratedTemplate || selection.template,
    source: matchedSpecificRoute
      ? 'mandate_scenario_variant'
      : 'mandate_scenario_fallback',
    organisationId: resolvedOrganisationId,
    moduleType: normalizeText((hydratedTemplate || selection.template)?.module_type || resolvedModuleType),
    packetType: normalizedPacketType,
    candidateModuleTypes: moduleCandidates,
    candidateCount: templateById.size,
    mandateScenarioProfile: scenarioProfile,
    mandateTemplateRouting: routingAudit,
  }
}

async function resolveTemplateForPacket({ packetType, context = {}, template = null } = {}) {
  if (template?.id) {
    return {
      template,
      source: 'explicit',
      candidateCount: 1,
    }
  }

  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  if (!normalizedPacketType) {
    return {
      template: null,
      source: 'none',
      candidateCount: 0,
    }
  }

  try {
    if (normalizedPacketType === 'mandate') {
      const mandateTemplateResolution = await resolveMandateScenarioTemplateForPacket({
        packetType: normalizedPacketType,
        context,
        moduleType: resolveTemplateModuleType(normalizedPacketType, context, template),
        organisationId: resolveTemplateOrganisationId(context),
        includeSections: true,
      })
      if (mandateTemplateResolution?.template) return mandateTemplateResolution
    }

    return await resolveActivePacketTemplate({
      packetType: normalizedPacketType,
      moduleType: resolveTemplateModuleType(normalizedPacketType, context, template),
      organisationId: resolveTemplateOrganisationId(context),
      includeSections: true,
    })
  } catch (error) {
    if (isMissingPacketTemplateSchemaError(error)) {
      console.warn('[PACKETS] active template resolution unavailable; continuing with runtime fallback.', {
        code: error?.code || null,
        message: error?.message || null,
      })
      return {
        template: null,
        source: 'schema_unavailable',
        candidateCount: 0,
      }
    }
    throw error
  }
}

function shouldUseNativeGeneration(template = null, packetType = '') {
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  if (COMMERCIAL_DOCUMENT_PACKET_TYPES.includes(normalizedPacketType)) {
    return templateUsesNativeRenderer(template, normalizedPacketType)
  }
  if (normalizedPacketType === 'mandate') {
    return FEATURE_FLAGS.enableNativeMandateRenderer && templateUsesNativeRenderer(template, normalizedPacketType)
  }
  if (normalizedPacketType === 'otp') {
    return FEATURE_FLAGS.enableNativeOtpRenderer && templateUsesNativeRenderer(template, normalizedPacketType)
  }
  return false
}

function extractGeneratedArtifact(result = {}) {
  return {
    renderedDocumentId: normalizeNullableText(result?.documentRecord?.data?.id || result?.document?.id || result?.documentId),
    renderedFilePath: normalizeNullableText(
      result?.output?.filePath || result?.storage?.path || result?.path || result?.renderedFilePath,
    ),
    renderedFileName: normalizeNullableText(
      result?.output?.fileName ||
        result?.storage?.fileName ||
        result?.documentRecord?.data?.name ||
        result?.document?.name ||
        result?.fileName,
    ),
    renderedFileUrl: normalizeNullableText(
      result?.output?.signedUrl ||
        result?.storage?.publicUrl ||
        result?.documentRecord?.data?.url ||
        result?.document?.url ||
        result?.url ||
        result?.renderedFileUrl,
    ),
  }
}

function assertGenerationOutput(artifact = {}, packetType = 'packet') {
  if (!artifact?.renderedFilePath) {
    throw createPacketError(
      'MISSING_RENDERED_FILE_PATH',
      `${String(packetType).toUpperCase()} generation completed without a stored file path.`,
    )
  }
  if (!artifact?.renderedFileUrl && !artifact?.renderedFilePath) {
    throw createPacketError(
      'MISSING_RENDERED_FILE_REFERENCE',
      `${String(packetType).toUpperCase()} generation did not return a file reference.`,
    )
  }
  if (!artifact?.renderedDocumentId) {
    throw createPacketError(
      'MISSING_DOCUMENT_RECORD',
      `${String(packetType).toUpperCase()} generation did not create a linked document record.`,
    )
  }
}

function inferGenerationFailureCode(error) {
  const explicitCode = normalizeText(error?.code || error?.details?.errorCode)
  if (explicitCode) return explicitCode

  const message = normalizeText(error?.message || String(error)).toLowerCase()
  if (message.includes('taking too long') || message.includes('timeout')) {
    return 'GENERATION_TIMEOUT'
  }
  if (message.includes('template source missing') || message.includes('template not found') || message.includes('unable to download')) {
    return 'MISSING_TEMPLATE_FILE'
  }
  if (message.includes('not renderable') || message.includes('blocking issue')) {
    return 'NATIVE_TEMPLATE_NOT_RENDERABLE'
  }
  if (message.includes('html render')) {
    return 'HTML_RENDER_FAILED'
  }
  if (message.includes('pdf render') || message.includes('gotenberg')) {
    return 'PDF_RENDER_FAILED'
  }
  if (message.includes('upload') && message.includes('storage')) {
    return 'STORAGE_UPLOAD_FAILED'
  }
  if (message.includes('render failed') || message.includes('placeholder')) {
    return 'DOCX_RENDER_FAILED'
  }
  return 'DOCX_GENERATION_FAILED'
}

function isRetryablePacketError(error = null) {
  const code = normalizeText(error?.code).toUpperCase()
  const message = normalizeText(error?.message || error).toLowerCase()
  const details = normalizeText(error?.details).toLowerCase()
  return (
    ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'NETWORK_ERROR'].includes(code) ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('cors') ||
    message.includes('timeout') ||
    details.includes('timeout')
  )
}

async function withPacketRetries(task, {
  attempts = 2,
  retryDelayMs = 450,
} = {}) {
  let lastError = null
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    try {
      return await task(attempt)
    } catch (error) {
      lastError = error
      if (attempt >= attempts || !isRetryablePacketError(error)) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt))
    }
  }
  throw lastError || new Error('Retry failed.')
}

const PACKET_GENERATION_TIMEOUT_MS = 10000
const FINAL_SIGNED_GENERATION_TIMEOUT_MS = 45000

function withPacketTimeout(task, message, timeoutMs = PACKET_GENERATION_TIMEOUT_MS) {
  let timeoutId = null
  return Promise.race([
    task,
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(createPacketError('GENERATION_TIMEOUT', message)), timeoutMs)
    }),
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

function hasTemplateSource(templateConfig = {}) {
  return Boolean(
    normalizeText(templateConfig?.templatePath) ||
      (normalizeText(templateConfig?.templateBucket) && normalizeText(templateConfig?.templateFilename)),
  )
}

function templateHasUsableSource(template = null) {
  const packetType = normalizeText(template?.packet_type || template?.packetType)
  return templateIsUsableForGeneration(template, packetType)
}

function shouldAllowMandateTemplateFallback(template = null, packetType = '') {
  if (normalizeText(packetType).toLowerCase() !== 'mandate') return false
  if (shouldUseNativeGeneration(template, packetType)) return false
  return !template || !hasTemplateSource(resolveTemplateConfig(template))
}

function toFriendlyGenerationMessage(code = '', fallback = '') {
  switch (code) {
    case 'VALIDATION_BLOCKED':
      return 'The mandate is missing required information. Complete the highlighted fields before generating it.'
    case 'GENERATION_TIMEOUT':
      return 'The mandate data was valid, but the PDF is taking too long to generate. Please try again.'
    case 'MISSING_TEMPLATE_FILE':
      return 'The legal template could not be rendered. Check the active template configuration and try again.'
    case 'NATIVE_TEMPLATE_NOT_RENDERABLE':
      return 'The active legal template is not renderable yet. Complete the required sections and template fields before generating it.'
    case 'HTML_RENDER_FAILED':
      return 'The legal template could not be assembled into a final document. Please try again.'
    case 'PDF_RENDER_FAILED':
      return 'The legal document was assembled, but the PDF could not be created. Please try again.'
    case 'STORAGE_UPLOAD_FAILED':
      return 'The mandate was generated, but the PDF could not be saved. Please try again or contact support.'
    case 'MISSING_RENDERED_FILE_PATH':
    case 'MISSING_RENDERED_FILE_REFERENCE':
      return 'The mandate was generated, but the PDF download reference is missing. Please try again.'
    case 'MISSING_DOCUMENT_RECORD':
      return 'The mandate could not be linked correctly. Please refresh this workspace and try again.'
    case 'DOCX_RENDER_FAILED':
      return 'The mandate data was valid, but the PDF could not be generated. Please try again.'
    case 'PACKET_VERSION_CREATE_FAILED':
      return 'The mandate was generated, but Arch9 could not save the packet version. Please try again.'
    default:
      return fallback || 'The mandate could not be generated. Please retry after checking the seller and property information.'
  }
}

const DEFAULT_SIGNING_LAYOUT = {
  otp: {
    pageCount: 6,
    initialsRoles: [],
    conditionalInitialRoles: [],
    signatureRoles: ['purchaser_1', 'seller', 'agent', 'contractor'],
  },
  mandate: {
    pageCount: 3,
    initialsRoles: [],
    conditionalInitialRoles: [],
    signatureRoles: ['agent', 'seller', 'purchaser_2'],
    signerOrder: ['agent', 'seller'],
  },
}

const ROLE_FIELD_POSITION = {
  purchaser_1: { initialX: 140, signatureX: 120 },
  purchaser_2: { initialX: 300, signatureX: 280 },
  seller: { initialX: 460, signatureX: 440 },
  agent: { initialX: 620, signatureX: 600 },
  contractor: { initialX: 780, signatureX: 760 },
  witness_1: { initialX: 300, signatureX: 300 },
  witness_2: { initialX: 620, signatureX: 620 },
  other: { initialX: 140, signatureX: 120 },
}

function createFallbackSignerName(role = 'other') {
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function buildSyntheticEmail(role = 'other') {
  return `pending+${String(role || 'other').toLowerCase()}@bridge.local`
}

function isMissingPlaceholderText(value = '') {
  const text = normalizeText(value)
  const lowered = text.toLowerCase()
  if (!lowered) return false
  if (lowered.startsWith('[missing:') || lowered.startsWith('missing:')) return true
  const normalized = lowered.replace(/[\s._-]+/g, '_')
  return ['missing', 'na', 'n_a', 'n/a', 'none', 'unknown', 'tbc', 'not_applicable', 'not_provided', 'no_spouse'].includes(normalized)
}

function firstResolvedText(...values) {
  return values.map((value) => normalizeText(value)).find((value) => value && !isMissingPlaceholderText(value)) || ''
}

function combinePersonName(firstName = '', surname = '') {
  return [normalizeText(firstName), normalizeText(surname)].filter(Boolean).join(' ').trim()
}

function isSyntheticSigningEmail(email = '') {
  return normalizeText(email).toLowerCase().endsWith('@bridge.local')
}

function resolveSignerSeed({ role, placeholders = {}, context = {} } = {}) {
  const normalizedRole = normalizeText(role).toLowerCase()
  const buyer = context?.buyer || {}
  const lead = context?.lead || {}
  const transaction = context?.transaction || {}
  const mandateDraft = context?.mandateDraft || {}
  const leadOnboarding =
    lead?.sellerOnboarding && typeof lead.sellerOnboarding === 'object'
      ? lead.sellerOnboarding
      : {}
  const leadOnboardingFormData =
    leadOnboarding?.formData && typeof leadOnboarding.formData === 'object'
      ? leadOnboarding.formData
      : {}
  const onboarding = {
    ...(leadOnboarding || {}),
    ...(leadOnboardingFormData || {}),
    ...((context?.onboardingFormData && typeof context.onboardingFormData === 'object')
      ? context.onboardingFormData
      : {}),
  }
  const sellerClassification = classifySellerParty({
    placeholders,
    context: {
      ...context,
      seller: {
        ...(context?.seller && typeof context.seller === 'object' ? context.seller : {}),
        entityType: onboarding?.entityType,
        entity_type: onboarding?.entity_type || onboarding?.seller_entity_type,
      },
    },
  })
  const sellerIsLegalEntity = sellerClassification.isLegalEntity
  const sellerDisplayName = firstResolvedText(
    sellerIsLegalEntity ? placeholders.seller_representative_name : '',
    sellerIsLegalEntity ? placeholders.representative_name : '',
    placeholders.seller_full_name,
    placeholders['seller.display_name'],
    placeholders['seller.full_name'],
    onboarding?.seller_full_name,
    onboarding?.fullName,
    onboarding?.display_name,
    onboarding?.displayName,
    onboarding?.sellerName,
    onboarding?.seller_name,
    combinePersonName(
      onboarding?.sellerFirstName || onboarding?.firstName || onboarding?.seller_name,
      onboarding?.sellerSurname || onboarding?.lastName || onboarding?.surname || onboarding?.seller_surname,
    ),
    lead?.name,
    combinePersonName(lead?.sellerName, lead?.sellerSurname),
    transaction?.seller_name,
  )
  const sellerEmail = firstResolvedText(
    sellerIsLegalEntity ? placeholders.seller_representative_email : '',
    sellerIsLegalEntity ? placeholders.representative_email : '',
    placeholders.seller_email,
    placeholders['seller.email'],
    onboarding?.email,
    onboarding?.sellerEmail,
    onboarding?.seller_email,
    lead?.sellerEmail,
    lead?.email,
    mandateDraft?.sellerEmail,
  )
  const spouseName = firstResolvedText(
    placeholders.seller_spouse_name,
    placeholders['seller.spouse_name'],
    onboarding?.spouseName,
    onboarding?.spouse_name,
    onboarding?.spouseFullName,
    onboarding?.spouse_full_name,
  )
  const spouseEmail = firstResolvedText(
    placeholders.seller_spouse_email,
    placeholders['seller.spouse_email'],
    onboarding?.spouseEmail,
    onboarding?.spouse_email,
  )
  const isMandatePacket = normalizeText(context?.packetType || context?.packet_type || placeholders.packet_type).toLowerCase() === 'mandate'
  const secondaryMandateSigner = isMandatePacket
    ? resolveMandateSecondarySignerConfig({
        sourceContext: context,
        placeholders,
      })
    : null

  const candidates = {
    purchaser_1: {
      name: [
        placeholders.buyer_full_name,
        placeholders['buyer.display_name'],
        buyer?.name,
        `${onboarding?.first_name || onboarding?.firstName || ''} ${onboarding?.last_name || onboarding?.lastName || ''}`.trim(),
      ],
      email: [placeholders.buyer_email, placeholders['buyer.email'], buyer?.email, onboarding?.email, onboarding?.buyer_email],
      required: true,
      conditional: false,
    },
    purchaser_2: {
      name: isMandatePacket
        ? [secondaryMandateSigner?.signerName]
        : [
            placeholders['buyer2.display_name'],
            placeholders['buyer_2.display_name'],
            onboarding?.co_buyer_name,
            onboarding?.coBuyerName,
            spouseName,
          ],
      email: isMandatePacket
        ? [secondaryMandateSigner?.signerEmail]
        : [placeholders['buyer2.email'], placeholders['buyer_2.email'], onboarding?.co_buyer_email, onboarding?.coBuyerEmail, spouseEmail],
      required: isMandatePacket ? Boolean(secondaryMandateSigner?.required) : false,
      conditional: isMandatePacket ? !secondaryMandateSigner?.required : true,
    },
    seller: {
      name: [
        sellerDisplayName,
      ],
      email: [sellerEmail],
      required: true,
      conditional: false,
    },
    agent: {
      name: [placeholders['agent.display_name'], transaction?.assigned_agent, context?.generatedByName],
      email: [placeholders['agent.email'], context?.generatedByUserEmail, context?.agentEmail],
      required: isMandatePacket,
      conditional: !isMandatePacket,
    },
    contractor: {
      name: [placeholders['contractor.company_name'], onboarding?.building_contractor_name, onboarding?.buildingContractorName],
      email: [placeholders['contractor.email'], onboarding?.building_contractor_email, onboarding?.buildingContractorEmail],
      required: false,
      conditional: true,
    },
  }

  const resolved = candidates[normalizedRole] || {
    name: [null],
    email: [null],
    required: false,
    conditional: true,
  }

  const name = resolved.name.map((item) => normalizeText(item)).find(Boolean) || ''
  const email = resolved.email.map((item) => normalizeText(item).toLowerCase()).find(Boolean) || ''
  return {
    role: normalizedRole,
    signerName: name || createFallbackSignerName(normalizedRole),
    signerEmail: email || buildSyntheticEmail(normalizedRole),
    hasSignal: Boolean(name || email),
    required: Boolean(resolved.required),
    conditional: Boolean(resolved.conditional),
  }
}

function buildDefaultSigningSeeds({
  packetType,
  placeholders = {},
  context = {},
  versionNumber = null,
} = {}) {
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  const config = DEFAULT_SIGNING_LAYOUT[normalizedPacketType] || DEFAULT_SIGNING_LAYOUT.otp
  const signaturePage = config.pageCount
  const initialsPages = Array.from({ length: config.pageCount }, (_, index) => index + 1)
  const initialY = 748
  const signatureY = 692
  const initialWidth = 44
  const initialHeight = 18
  const signatureWidth = 168
  const signatureHeight = 44

  const uniqueRoles = Array.from(new Set([...(config.signerOrder || []), ...config.initialsRoles, ...config.conditionalInitialRoles, ...config.signatureRoles]))
  const signerSeeds = uniqueRoles
    .map((role) => resolveSignerSeed({ role, placeholders, context: { ...context, packetType: normalizedPacketType } }))
    .filter((seed) => seed.required || seed.hasSignal)

  const signerByRole = signerSeeds.reduce((accumulator, signer) => {
    accumulator[signer.role] = signer
    return accumulator
  }, {})

  const fields = []

  for (const role of config.initialsRoles) {
    if (!signerByRole[role]) continue
    const position = ROLE_FIELD_POSITION[role] || ROLE_FIELD_POSITION.other
    initialsPages.forEach((pageNumber) => {
      fields.push({
        signerRole: role,
        signerName: signerByRole[role].signerName,
        signerEmail: signerByRole[role].signerEmail,
        fieldType: 'initial',
        pageNumber,
        xPosition: position.initialX,
        yPosition: initialY,
        width: initialWidth,
        height: initialHeight,
        required: true,
        status: 'pending',
      })
    })
  }

  for (const role of config.conditionalInitialRoles) {
    if (!signerByRole[role]) continue
    const position = ROLE_FIELD_POSITION[role] || ROLE_FIELD_POSITION.other
    fields.push({
      signerRole: role,
      signerName: signerByRole[role].signerName,
      signerEmail: signerByRole[role].signerEmail,
      fieldType: 'initial',
      pageNumber: Math.max(1, signaturePage - 1),
      xPosition: position.initialX,
      yPosition: initialY,
      width: initialWidth,
      height: initialHeight,
      required: true,
      status: 'pending',
    })
  }

  for (const role of config.signatureRoles) {
    if (!signerByRole[role]) continue
    const position = ROLE_FIELD_POSITION[role] || ROLE_FIELD_POSITION.other
    fields.push({
      signerRole: role,
      signerName: signerByRole[role].signerName,
      signerEmail: signerByRole[role].signerEmail,
      fieldType: 'signature',
      pageNumber: signaturePage,
      xPosition: position.signatureX,
      yPosition: signatureY,
      width: signatureWidth,
      height: signatureHeight,
      required: true,
      status: 'pending',
    })
  }

  const signers = signerSeeds.map((seed, index) => ({
    signerRole: seed.role,
    signerName: seed.signerName,
    signerEmail: seed.signerEmail,
    signingOrder: index + 1,
    status: 'pending',
  }))

  return {
    packetType: normalizedPacketType,
    versionNumber,
    signers,
    fields,
    pageCount: config.pageCount,
  }
}

function buildPacketTitle(packetType, context = {}) {
  if (COMMERCIAL_DOCUMENT_PACKET_TYPES.includes(normalizeText(packetType).toLowerCase())) {
    return resolveCommercialDocumentContext({ packetType, context })?.documentTitle || 'Commercial Document'
  }
  if (packetType === 'mandate') {
    const lead = context?.lead || {}
    const sellerName = [lead?.sellerName, lead?.sellerSurname].filter(Boolean).join(' ').trim() || lead?.name || 'Seller'
    return `Mandate • ${sellerName}`
  }

  const unit = context?.unit || {}
  const unitLabel = unit?.unit_number ? `Unit ${unit.unit_number}` : 'Transaction'
  return `Offer to Purchase • ${unitLabel}`
}

function withSystemPlaceholders(placeholders = {}, context = {}, branding = null) {
  const merged = { ...(placeholders || {}) }
  const organisationName =
    normalizeText(branding?.organisationName) ||
    normalizeText(context?.organisationName) ||
    normalizeText(context?.organisation?.displayName) ||
    normalizeText(context?.organisation?.name) ||
    normalizeText(context?.agency?.organisationName) ||
    normalizeText(context?.agency?.name) ||
    'Organisation'
  const logoLightUrl =
    normalizeNullableText(branding?.logoLightUrl) ||
    normalizeNullableText(branding?.organisationLogoUrl) ||
    normalizeNullableText(branding?.logoUrl) ||
    normalizeNullableText(context?.organisationLogoUrl) ||
    normalizeNullableText(context?.organisation?.logoLightUrl) ||
    normalizeNullableText(context?.organisation?.logoUrl) ||
    normalizeNullableText(context?.organisation?.logo_url) ||
    normalizeNullableText(context?.agency?.logoLightUrl) ||
    normalizeNullableText(context?.agency?.logoUrl)
  const logoDarkUrl =
    normalizeNullableText(branding?.logoDarkUrl) ||
    normalizeNullableText(branding?.organisationLogoDarkUrl) ||
    normalizeNullableText(branding?.logoHighContrastUrl) ||
    normalizeNullableText(context?.organisationLogoDarkUrl) ||
    normalizeNullableText(context?.organisation?.logoDarkUrl) ||
    normalizeNullableText(context?.agency?.logoDarkUrl) ||
    logoLightUrl
  const organisationWebsite =
    normalizeNullableText(branding?.website) ||
    normalizeNullableText(branding?.organisationWebsite) ||
    normalizeNullableText(branding?.organisation_website) ||
    normalizeNullableText(context?.organisation?.website) ||
    normalizeNullableText(context?.agency?.website)
  const organisationEmail =
    normalizeNullableText(branding?.email) ||
    normalizeNullableText(branding?.organisationEmail) ||
    normalizeNullableText(branding?.organisation_email) ||
    normalizeNullableText(context?.organisation?.email) ||
    normalizeNullableText(context?.agency?.email)
  const organisationPhysicalAddress =
    normalizeNullableText(branding?.physicalAddress) ||
    normalizeNullableText(branding?.physical_address) ||
    normalizeNullableText(branding?.organisationPhysicalAddress) ||
    normalizeNullableText(branding?.organisation_physical_address) ||
    normalizeNullableText(branding?.address) ||
    normalizeNullableText(context?.organisation?.physicalAddress) ||
    normalizeNullableText(context?.organisation?.physical_address) ||
    normalizeNullableText(context?.agency?.physicalAddress) ||
    normalizeNullableText(context?.agency?.address)
  const organisationPhone =
    normalizeNullableText(branding?.telephone) ||
    normalizeNullableText(branding?.phoneNumber) ||
    normalizeNullableText(branding?.phone_number) ||
    normalizeNullableText(branding?.phone) ||
    normalizeNullableText(branding?.organisationPhone) ||
    normalizeNullableText(branding?.organisation_phone) ||
    normalizeNullableText(context?.organisation?.telephone) ||
    normalizeNullableText(context?.organisation?.phoneNumber) ||
    normalizeNullableText(context?.organisation?.phone_number) ||
    normalizeNullableText(context?.agency?.phone)

  merged.organisation_name = merged.organisation_name || organisationName
  merged.organisation_logo_url = merged.organisation_logo_url || resolvePublicAssetUrl(logoLightUrl) || ''
  merged.organisation_logo_dark_url = merged.organisation_logo_dark_url || resolvePublicAssetUrl(logoDarkUrl) || ''
  merged.agency_logo_url = merged.agency_logo_url || merged.organisation_logo_url
  merged.organisation_website = merged.organisation_website || organisationWebsite || ''
  merged.organisation_email = merged.organisation_email || organisationEmail || ''
  merged.organisation_physical_address = merged.organisation_physical_address || organisationPhysicalAddress || ''
  merged.organisation_phone = merged.organisation_phone || organisationPhone || ''
  merged.organisation_telephone = merged.organisation_telephone || organisationPhone || ''

  merged['organisation.name'] = merged['organisation.name'] || merged.organisation_name
  merged['organisation.logo_url'] = merged['organisation.logo_url'] || merged.organisation_logo_url || ''
  merged['organisation.logo_light_url'] = merged['organisation.logo_light_url'] || merged.organisation_logo_url || ''
  merged['organisation.logo_dark_url'] = merged['organisation.logo_dark_url'] || merged.organisation_logo_dark_url || ''
  merged['organisation.website'] = merged['organisation.website'] || merged.organisation_website
  merged['organisation.email'] = merged['organisation.email'] || merged.organisation_email
  merged['organisation.physical_address'] = merged['organisation.physical_address'] || merged.organisation_physical_address
  merged['organisation.phone'] = merged['organisation.phone'] || merged.organisation_phone
  merged['agency.logo_url'] = merged['agency.logo_url'] || merged.agency_logo_url || merged.organisation_logo_url
  return merged
}

function humanizePlaceholderKey(value) {
  const normalized = normalizeText(value)
  if (!normalized) return 'Field'
  const lastKey = normalized.includes('.') ? normalized.split('.').slice(-1)[0] : normalized
  return lastKey
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function mapTemplateSectionToManifest(section = {}, placeholders = {}) {
  const metadata = section?.metadata_json && typeof section.metadata_json === 'object' ? section.metadata_json : {}
  const placeholderLabels = metadata?.placeholder_labels && typeof metadata.placeholder_labels === 'object'
    ? metadata.placeholder_labels
    : {}
  const placeholderKeys = Array.isArray(section?.placeholder_keys)
    ? section.placeholder_keys.filter((item) => normalizeText(item))
    : []
  const sectionLabel = normalizeText(section?.section_label || metadata?.section_title || section?.section_key || 'Section')
  const sectionKey = normalizeText(section?.section_key || sectionLabel)

  return {
    key: sectionKey,
    label: sectionLabel,
    required: Boolean(section?.is_required),
    sectionType: normalizeText(section?.section_type || metadata?.section_type || 'dynamic_fields'),
    sortOrder: Number.isFinite(Number(section?.sort_order)) ? Number(section.sort_order) : 0,
    visibilityRules: section?.condition_json && typeof section.condition_json === 'object' ? section.condition_json : {},
    editableBy: Array.isArray(metadata?.editable_by) ? metadata.editable_by : ['principal', 'super_admin', 'admin', 'agent'],
    isRepeatable: Boolean(section?.is_repeatable),
    placeholders: placeholderKeys.map((placeholderKey) => [
      placeholderKey,
      normalizeText(placeholderLabels?.[placeholderKey]) || humanizePlaceholderKey(placeholderKey),
    ]),
    legalText: normalizeText(section?.legal_text || metadata?.legal_text || ''),
    metadata,
    visible: evaluateVisibilityRules(section?.condition_json || metadata?.visibility_rules || null, placeholders),
  }
}

async function resolveSeededSectionManifest({ packetType, template = null, placeholders = {} } = {}) {
  if (!template?.id) {
    return buildPacketSectionManifest({ packetType, placeholders })
  }

  let hydratedTemplate = template
  if (!Array.isArray(template?.sections)) {
    hydratedTemplate = await getPacketTemplate(template.id, { includeSections: true })
  }

  const sections = Array.isArray(hydratedTemplate?.sections) ? hydratedTemplate.sections : []
  if (!sections.length) {
    return buildPacketSectionManifest({ packetType, placeholders })
  }

  return sections
    .map((section) => mapTemplateSectionToManifest(section, placeholders))
    .filter((section) => section.visible !== false)
    .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0))
}

function resolvePacketTypeContext(packetType, context = {}) {
  const normalized = normalizeText(packetType).toLowerCase()
  if (COMMERCIAL_DOCUMENT_PACKET_TYPES.includes(normalized)) {
    return resolveCommercialDocumentContext({
      packetType: normalized,
      context,
    })
  }
  if (normalized === 'mandate') {
    return resolveMandatePacketPlaceholders({
      mandateData: context?.mandateData || null,
      lead: context?.lead || null,
      privateListing: context?.privateListing || null,
      mandateDraft: context?.mandateDraft || null,
      agency: context?.agency || context?.organisation || null,
      organisation: context?.organisation || null,
      agent: context?.agent || {
        fullName: context?.generatedByName,
        email: context?.agentEmail || context?.generatedByUserEmail,
        phone: context?.agentPhone,
        ffcNumber: context?.agentFfcNumber,
      },
      contact: context?.contact || null,
      transaction: context?.transaction || null,
    })
  }

  return resolveOtpPacketPlaceholders({
    transaction: context?.transaction || null,
    unit: context?.unit || null,
    buyer: context?.buyer || null,
    onboardingFormData: context?.onboardingFormData || null,
    sellerDetails: context?.sellerDetails || context?.seller_details || null,
    agency: context?.agency || context?.organisation || null,
    organisation: context?.organisation || null,
    agent: context?.agent || {
      fullName: context?.generatedByName,
      email: context?.agentEmail || context?.generatedByUserEmail,
      phone: context?.agentPhone,
      ffcNumber: context?.agentFfcNumber,
    },
    listing: context?.listing || null,
    privateListing: context?.privateListing || context?.private_listing || null,
    propertyDisclosureAnnexure:
      context?.propertyDisclosureAnnexure ||
      context?.property_disclosure_annexure ||
      context?.sourceContext?.propertyDisclosureAnnexure ||
      context?.sourceContext?.property_disclosure_annexure ||
      null,
    sourceContext: context?.sourceContext || null,
    specialConditions: context?.specialConditions || '',
  })
}

function buildValidationSummary(validation = {}) {
  return {
    isValidForGeneration: Boolean(validation?.isValidForGeneration),
    criticalCount: validation?.critical?.length || 0,
    warningCount: validation?.warnings?.length || 0,
    critical: validation?.critical || [],
    warnings: validation?.warnings || [],
    aliasHits: validation?.aliasHits || [],
    unknownFields: validation?.unknownFields || [],
    mandateValidation: validation?.mandateValidation || null,
    conditionalPackDataRequirements: validation?.conditionalPackDataRequirements || [],
    conditionalPackMissingPlaceholders: validation?.conditionalPackMissingPlaceholders || [],
    conditionalPackAudit: validation?.conditionalPackAudit || null,
    templateResolutionSource: validation?.templateResolutionSource || null,
    mandateTemplateFallback: Boolean(validation?.mandateTemplateFallback),
    mandateTemplateFallbackWarning: validation?.mandateTemplateFallbackWarning || null,
    mandateTemplateContentGate: validation?.mandateTemplateContentGate || null,
    mandateTemplateLaunchReadiness: validation?.mandateTemplateLaunchReadiness || null,
  }
}

function formatMandateTemplateRouteLabel(value = '') {
  return normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function buildMandateTemplateFallbackWarning({
  validation = {},
  templateResolution = null,
} = {}) {
  const packetType = normalizeText(validation?.packetType || templateResolution?.packetType).toLowerCase()
  if (packetType !== 'mandate') return null
  if (normalizeText(templateResolution?.source) !== 'mandate_scenario_fallback') return null

  const routing = templateResolution?.mandateTemplateRouting || {}
  const mandateTemplateVariant =
    normalizeText(validation?.mandateTemplateVariant) ||
    normalizeText(validation?.placeholders?.mandate_template_variant) ||
    normalizeText(routing?.mandateTemplateVariant) ||
    normalizeText(templateResolution?.mandateScenarioProfile?.templateVariant)
  if (!mandateTemplateVariant || mandateTemplateVariant === 'default') return null

  const routeLabel = formatMandateTemplateRouteLabel(mandateTemplateVariant)
  const selectedTemplate =
    normalizeText(routing?.selectedTemplateLabel) ||
    normalizeText(routing?.selectedTemplateKey) ||
    'the selected default mandate template'

  return {
    source: 'mandate_template_routing',
    sectionKey: 'mandate_template_variant',
    sectionLabel: 'Mandate template routing',
    placeholderKey: 'mandate_template_variant',
    placeholderLabel: 'Mandate route',
    message: `No live ${routeLabel} mandate template is routable yet, so generation is using ${selectedTemplate}. Publish the route-specific template before relying on this packet as final.`,
    required: false,
    warningCode: 'MANDATE_TEMPLATE_ROUTE_FALLBACK',
    mandateTemplateVariant,
    selectedTemplateId: routing?.selectedTemplateId || null,
    selectedTemplateKey: routing?.selectedTemplateKey || null,
  }
}

function resolveMandateTemplateRuntimeRouteKey(validation = {}, templateResolution = null) {
  const template = templateResolution?.template || null
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object'
    ? template.metadata_json
    : template?.metadataJson && typeof template.metadataJson === 'object'
      ? template.metadataJson
      : {}
  const templateRoute = normalizeMandateTemplateVariant(
    metadata.mandate_template_variant ||
      metadata.mandateTemplateVariant ||
      metadata.template_variant ||
      metadata.templateVariant ||
      '',
  )
  const scenarioRoute = normalizeMandateTemplateVariant(
    validation?.mandateTemplateVariant ||
      validation?.placeholders?.mandate_template_variant ||
      templateResolution?.mandateTemplateRouting?.mandateTemplateVariant ||
      templateResolution?.mandateScenarioProfile?.templateVariant ||
      '',
  )
  const resolutionSource = normalizeText(templateResolution?.source)

  if (resolutionSource === 'mandate_scenario_variant') {
    return scenarioRoute || templateRoute || 'default'
  }
  if (templateRoute && templateRoute !== 'default') return templateRoute
  if (resolutionSource === 'mandate_scenario_fallback') return 'default'
  return scenarioRoute || templateRoute || 'default'
}

function mapMandateTemplateContentGateIssue(issue = {}, gate = {}, { required = true } = {}) {
  const signalKey = normalizeText(issue.signalGroupKey || issue.conditionalPackKey || issue.code || 'mandate_template_content')
  const signalLabel = normalizeText(issue.signalGroupLabel || issue.conditionalPackKey || 'Mandate template content')
  return {
    source: 'mandate_template_content_gate',
    sectionKey: normalizeText(issue.sectionKey) || 'mandate_template_content',
    sectionLabel: normalizeText(issue.sectionLabel) || 'Mandate template content',
    placeholderKey: signalKey,
    placeholderLabel: signalLabel,
    message: formatMandateTemplatePublishGateIssue(issue),
    required,
    warningCode: normalizeText(issue.code) || 'MANDATE_TEMPLATE_CONTENT_GATE',
    mandateTemplateVariant: normalizeText(gate.routeKey),
    mandateTemplateRouteLabel: normalizeText(gate.routeLabel),
    selectedTemplateId: normalizeText(gate.selectedTemplateId) || null,
    selectedTemplateKey: normalizeText(gate.selectedTemplateKey) || null,
  }
}

function mapMandateTemplateLaunchReadinessIssue(issue = {}, readiness = {}, { required = true } = {}) {
  const routeKey = normalizeText(issue.routeKey || readiness.routeKey || 'mandate_template_variant')
  const routeLabel = normalizeText(issue.routeLabel || readiness.routeLabel || 'Mandate route')
  return {
    source: 'mandate_template_launch_readiness',
    sectionKey: 'mandate_template_launch_readiness',
    sectionLabel: 'Mandate launch readiness',
    placeholderKey: routeKey,
    placeholderLabel: routeLabel,
    message: formatMandateTemplateLaunchReadinessIssue(issue),
    required,
    warningCode: normalizeText(issue.code) || 'MANDATE_TEMPLATE_LAUNCH_READINESS',
    mandateTemplateVariant: routeKey,
    mandateTemplateRouteLabel: routeLabel,
    selectedTemplateId: normalizeText(issue.templateId || readiness.selectedTemplateId) || null,
    selectedTemplateKey: normalizeText(issue.templateKey || readiness.selectedTemplateKey) || null,
  }
}

function buildMandateTemplateRuntimeContentGate(validation = {}, templateResolution = null) {
  if (normalizeText(validation?.packetType).toLowerCase() !== 'mandate') return null
  const template = templateResolution?.template || null
  if (!template?.id) return null

  const routeKey = resolveMandateTemplateRuntimeRouteKey(validation, templateResolution)
  const gate = buildMandateTemplatePublishGateReport(
    {
      ...template,
      packet_type: 'mandate',
      packetType: 'mandate',
    },
    {
      packetType: 'mandate',
      routeKey,
    },
  )

  return {
    ...gate,
    source: 'mandate_template_runtime_content_gate',
    selectedTemplateId: normalizeText(template.id) || null,
    selectedTemplateKey: normalizeText(template.template_key || template.key) || null,
    selectedTemplateLabel: normalizeText(template.template_label || template.label) || null,
    templateResolutionSource: normalizeText(templateResolution?.source) || null,
    mandateTemplateRouting: templateResolution?.mandateTemplateRouting || null,
  }
}

function withMandateTemplateRoutingWarnings(validation = {}, templateResolution = null) {
  const templateResolutionSource = normalizeText(templateResolution?.source || validation?.templateResolutionSource) || null
  const fallbackWarning = buildMandateTemplateFallbackWarning({
    validation,
    templateResolution,
  })
  const contentGate = buildMandateTemplateRuntimeContentGate(validation, templateResolution)
  const launchReadiness = buildMandateTemplateRuntimeLaunchReadiness(validation, templateResolution, {
    action: validation?.validationAction,
  })
  const contentGateBlockers = (contentGate?.blockers || [])
    .map((issue) => mapMandateTemplateContentGateIssue(issue, contentGate, { required: true }))
  const contentGateWarnings = (contentGate?.warnings || [])
    .map((issue) => mapMandateTemplateContentGateIssue(issue, contentGate, { required: false }))
  const launchReadinessBlockers = (launchReadiness?.shouldBlockGeneration ? launchReadiness.blockers : [])
    .map((issue) => mapMandateTemplateLaunchReadinessIssue(issue, launchReadiness, { required: true }))
  const launchReadinessWarnings = (!launchReadiness?.shouldBlockGeneration ? launchReadiness?.warnings || [] : [])
    .map((issue) => mapMandateTemplateLaunchReadinessIssue(issue, launchReadiness, { required: false }))

  return {
    ...validation,
    templateResolutionSource,
    mandateTemplateLaunchReadiness: launchReadiness
      ? {
          readinessVersion: launchReadiness.readinessVersion,
          status: launchReadiness.status,
          action: launchReadiness.action,
          shouldBlockGeneration: Boolean(launchReadiness.shouldBlockGeneration),
          canGenerateWithoutFallback: Boolean(launchReadiness.canGenerateWithoutFallback),
          routeKey: launchReadiness.routeKey,
          routeLabel: launchReadiness.routeLabel,
          templateResolutionSource: launchReadiness.templateResolutionSource,
          selectedTemplateId: launchReadiness.selectedTemplateId,
          selectedTemplateKey: launchReadiness.selectedTemplateKey,
          selectedTemplateLabel: launchReadiness.selectedTemplateLabel,
          blockerCodes: (launchReadiness.blockers || []).map((issue) => normalizeText(issue.code)).filter(Boolean),
          warningCodes: (launchReadiness.warnings || []).map((issue) => normalizeText(issue.code)).filter(Boolean),
        }
      : validation?.mandateTemplateLaunchReadiness || null,
    mandateTemplateContentGate: contentGate
      ? {
          gateVersion: contentGate.gateVersion,
          scannerVersion: contentGate.scannerVersion,
          ruleVersion: contentGate.ruleVersion,
          routeKey: contentGate.routeKey,
          routeLabel: contentGate.routeLabel,
          isValidForGeneration: contentGate.isValidForPublish,
          blockingCount: contentGate.blockingCount,
          warningCount: contentGate.warningCount,
          selectedTemplateId: contentGate.selectedTemplateId,
          selectedTemplateKey: contentGate.selectedTemplateKey,
          selectedTemplateLabel: contentGate.selectedTemplateLabel,
          templateResolutionSource: contentGate.templateResolutionSource,
          blockerCodes: contentGate.metadata?.blockerCodes || [],
          warningCodes: contentGate.metadata?.warningCodes || [],
          presentSignalGroupKeys: contentGate.metadata?.presentSignalGroupKeys || [],
          presentPackKeys: contentGate.metadata?.presentPackKeys || [],
          missingRecommendedPackKeys: contentGate.metadata?.missingRecommendedPackKeys || [],
          scannedAt: contentGate.metadata?.scannedAt || new Date().toISOString(),
        }
      : validation?.mandateTemplateContentGate || null,
    critical: dedupeValidationIssues([
      ...(validation?.critical || []),
      ...contentGateBlockers,
      ...launchReadinessBlockers,
    ]),
    mandateTemplateFallback: Boolean(fallbackWarning || validation?.mandateTemplateFallback),
    mandateTemplateFallbackWarning: fallbackWarning || validation?.mandateTemplateFallbackWarning || null,
    warnings: dedupeValidationIssues([
      ...(validation?.warnings || []),
      ...(fallbackWarning ? [fallbackWarning] : []),
      ...contentGateWarnings,
      ...launchReadinessWarnings,
    ]),
    isValidForGeneration: (contentGateBlockers.length || launchReadinessBlockers.length) ? false : validation?.isValidForGeneration,
  }
}

export async function listPacketTemplates(options = {}) {
  try {
    const templates = await getPacketTemplates(options)
    const rows = Array.isArray(templates) ? templates : []
    if (rows.length <= 1) return rows
    const withSource = rows.filter((template) => templateHasUsableSource(template))
    const withoutSource = rows.filter((template) => !templateHasUsableSource(template))
    return [...withSource, ...withoutSource]
  } catch (error) {
    if (isMissingPacketTemplateSchemaError(error)) {
      console.warn('[PACKETS] signing template tables unavailable; continuing with empty templates.', {
        code: error?.code || null,
        message: error?.message || null,
      })
      return []
    }
    throw error
  }
}

export async function fetchPacketTemplate(templateId, options = {}) {
  return getPacketTemplate(templateId, options)
}

export async function resolveActiveTemplate({
  packetType,
  moduleType = '',
  organisationId = null,
  context = {},
  includeSections = true,
} = {}) {
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  if (normalizedPacketType === 'mandate') {
    const mandateTemplateResolution = await resolveMandateScenarioTemplateForPacket({
      packetType: normalizedPacketType,
      context: {
        ...context,
        moduleType,
        organisationId,
      },
      moduleType: normalizeText(moduleType) || resolveTemplateModuleType(normalizedPacketType, context),
      organisationId: organisationId || resolveTemplateOrganisationId(context),
      includeSections,
    })
    if (mandateTemplateResolution?.template) return mandateTemplateResolution
  }

  return resolveActivePacketTemplate({
    packetType,
    moduleType: normalizeText(moduleType) || resolveTemplateModuleType(packetType, context),
    organisationId: organisationId || resolveTemplateOrganisationId(context),
    includeSections,
  })
}

export async function listPackets(options = {}) {
  return getPackets(options)
}

export async function fetchPacket(packetId, options = {}) {
  return fetchDocumentPacket(packetId, options)
}

export async function listPacketVersions(packetId) {
  return listDocumentPacketVersions(packetId)
}

export async function archivePacket(packetId, options = {}) {
  return archiveDocumentPacket(packetId, options)
}

export async function resolvePacketBranding(options = {}) {
  return resolveDocumentPacketBranding(options)
}

export async function validatePacket({
  packetType,
  context = {},
  template = null,
  validationAction = null,
} = {}) {
  const normalizedPacketType = normalizeText(packetType).toLowerCase() || 'otp'
  const packetBranding = await resolvePacketBranding({
    organisationId: context?.organisationId || context?.transaction?.organisation_id || null,
  }).catch(() => null)
  const placeholdersRaw = withSystemPlaceholders(
    resolvePacketTypeContext(normalizedPacketType, context),
    context,
    packetBranding,
  )
  const placeholders = normalizeMergeFieldPayload(placeholdersRaw, {
    packetType: normalizedPacketType,
    includeAliasKeys: true,
  }).payload
  const sectionManifest = await resolveSeededSectionManifest({
    packetType: normalizedPacketType,
    template,
    placeholders,
  })
  const ruleValidation = validatePacketPlaceholders({
    packetType: normalizedPacketType,
    placeholders,
    sectionManifest,
  })
  const conditionalPackAudit = resolveConditionalPackAudit({
    packetType: normalizedPacketType,
    placeholders,
  })
  const conditionalPackPreflight = conditionalPackAudit.preflight || {}
  const conditionalPackDataRequirements = conditionalPackPreflight.dataRequirements || []
  const conditionalPackMissingPlaceholders = conditionalPackPreflight.missingPlaceholders || []
  const conditionalPackMissingKeys = conditionalPackPreflight.missingKeys || new Set()
  const sellerValidation = validateSellerPartyReadiness({
    packetType: normalizedPacketType,
    placeholders,
  })
  const mandateScenarioProfile = normalizedPacketType === 'mandate'
    ? resolveMandateTemplateRoutingProfile({
        placeholders,
        seller: context?.mandateData?.seller || null,
        property: context?.mandateData?.property || null,
        mandate: context?.mandateData?.mandate || null,
        sourceContext: context?.mandateData?.sourceContext || context?.sourceContext || null,
        context,
      })
    : null
  const mandateValidationAction = normalizeValidationAction(validationAction || context?.validationAction || 'preview')
  const isTemplatePreview = mandateValidationAction === TEMPLATE_PREVIEW_VALIDATION_ACTION
  const isCommercialPacket = COMMERCIAL_DOCUMENT_PACKET_TYPES.includes(normalizedPacketType)
  const allowMandateGenerationGaps = normalizedPacketType === 'mandate' && mandateValidationAction !== 'upload_signed'
  const mandateValidation = normalizedPacketType === 'mandate'
    ? validateMandateGenerationData(
        context?.mandateData || {
          placeholders,
          seller: {},
          property: {},
          mandate: {},
          agency: {},
          agent: {},
          sourceContext: context?.sourceContext || {},
        },
        {
          action: mandateValidationAction,
          sectionManifest,
          hasTemplate: Boolean(template || sectionManifest.length),
        },
      )
    : null
  const commercialValidation = isCommercialPacket
    ? {
        canProceed: ruleValidation.isValidForGeneration,
        blockingErrors: [],
        warnings: ruleValidation.warnings || [],
        missingRequiredFields: ruleValidation.missingPlaceholders || [],
      }
    : null
  const registryValidation = await validateDocumentPacketPlaceholders({
    packetType: normalizedPacketType,
    placeholderPayload: placeholders,
  }).catch(() => null)
  const missingPlaceholderKeys = new Set(
    (ruleValidation.missingPlaceholders || [])
      .map((issue) => normalizeText(issue?.placeholderKey || issue?.placeholder_key).toLowerCase())
      .filter(Boolean),
  )
  const ruleCritical = ruleValidation.critical || []
  const ruleWarnings = ruleValidation.warnings || []
  const missingPlaceholderWarnings = ruleWarnings.filter((issue) => isMissingPlaceholderWarning(issue, missingPlaceholderKeys))
  const structuralRuleWarnings = ruleWarnings.filter((issue) => !isMissingPlaceholderWarning(issue, missingPlaceholderKeys))
  const nonConditionalRuleWarnings = ruleWarnings.filter((issue) => {
    const placeholderKey = normalizeText(issue?.placeholderKey || issue?.placeholder_key).toLowerCase()
    return !placeholderKey || !conditionalPackMissingKeys.has(placeholderKey)
  })
  const sellerCriticalIssues = sellerValidation.critical || []
  const sellerWarningIssues = sellerValidation.warnings || []
  const mandateBlockingIssues = (mandateValidation?.blockingErrors || []).map(mapMandateValidationIssue)
  const mandateWarningIssues = (mandateValidation?.warnings || []).map(mapMandateValidationIssue)
  const previewDataRequirements = isTemplatePreview
    ? dedupeValidationRequirements([
        ...missingPlaceholderWarnings.map((issue) => ({
          ...issue,
          source: 'template_placeholder',
        })),
        ...sellerCriticalIssues.map((issue) => ({
          ...issue,
          source: 'seller_readiness',
        })),
        ...sellerWarningIssues.map((issue) => ({
          ...issue,
          source: 'seller_readiness',
        })),
        ...mandateBlockingIssues.map((issue) => ({
          ...issue,
          source: 'mandate_readiness',
        })),
        ...mandateWarningIssues.map((issue) => ({
          ...issue,
          source: 'mandate_readiness',
        })),
        ...conditionalPackMissingPlaceholders.map((issue) => ({
          ...issue,
          source: 'conditional_pack',
        })),
      ])
    : []
  const criticalIssues = isTemplatePreview
    ? [...ruleCritical]
    : allowMandateGenerationGaps
      ? [
          ...sellerCriticalIssues,
          ...conditionalPackMissingPlaceholders,
        ]
      : [
          ...ruleCritical,
          ...sellerCriticalIssues,
          ...mandateBlockingIssues,
          ...conditionalPackMissingPlaceholders,
        ]
  const warningIssues = isTemplatePreview
    ? [...structuralRuleWarnings]
    : [
        ...nonConditionalRuleWarnings,
        ...sellerWarningIssues,
        ...mandateWarningIssues,
      ]
  const missingPlaceholders = dedupeValidationIssues([
    ...conditionalPackMissingPlaceholders,
    ...(ruleValidation.missingPlaceholders || []),
  ])
  const conditionalPackCanProceed = Boolean(conditionalPackPreflight.canProceed)

  return {
    packetType: normalizedPacketType,
    placeholders,
    sectionManifest: ruleValidation.sectionManifest,
    validationAction: mandateValidationAction,
    critical: criticalIssues,
    warnings: warningIssues,
    dataRequirements: previewDataRequirements,
    conditionalPackDataRequirements,
    conditionalPackMissingPlaceholders,
    conditionalPackAudit,
    mandateScenarioProfile,
    mandateTemplateVariant: mandateScenarioProfile?.templateVariant || null,
    missingPlaceholders,
    aliasHits: ruleValidation.aliasHits || [],
    unknownFields: ruleValidation.unknownFields || [],
    isValidForGeneration: isTemplatePreview
      ? ruleValidation.isValidForGeneration
      : isCommercialPacket
      ? ruleValidation.isValidForGeneration && conditionalPackCanProceed
      : (
          conditionalPackCanProceed &&
          sellerValidation.canProceed &&
          (allowMandateGenerationGaps || (ruleValidation.isValidForGeneration && (!mandateValidation || mandateValidation.canProceed)))
        ),
    registryValidation,
    mandateValidation,
    sellerValidation,
    commercialValidation,
    branding: packetBranding,
  }
}

export async function renderPacketPreview({
  packetType,
  context = {},
  branding = null,
  title = '',
  template = null,
  validationAction = 'preview',
} = {}) {
  const templateResolution = await resolveTemplateForPacket({ packetType, context, template })
  const resolvedTemplate = templateResolution.template || null
  const baseValidation = await validatePacket({
    packetType,
    context,
    template: resolvedTemplate,
    validationAction,
  })
  const validation = withMandateTemplateRoutingWarnings(baseValidation, templateResolution)
  if (
    validation.packetType === 'mandate' &&
    validationAction === 'upload_signed' &&
    validation.mandateValidation &&
    !validation.mandateValidation.canProceed
  ) {
    const error = createPacketError(
      'MANDATE_PREFLIGHT_BLOCKED',
      'Mandate data is missing required information for this action.',
    )
    error.validation = validation.mandateValidation
    throw error
  }
  const packetBranding = branding || (await resolvePacketBranding({
    organisationId: context?.organisationId || context?.transaction?.organisation_id || null,
  }).catch(() => null)) || validation?.branding || null

  const previewHtml = renderPacketPreviewHtml({
    packetType: validation.packetType,
    title: normalizeText(title) || buildPacketTitle(validation.packetType, context),
    placeholders: validation.placeholders,
    sectionManifest: validation.sectionManifest,
    branding: packetBranding || {},
  })

  return {
    ...validation,
    branding: packetBranding,
    previewHtml,
    template: resolvedTemplate,
    templateResolution,
  }
}

async function createOrReusePacket({
  packetId = null,
  packetType,
  context = {},
  template = null,
} = {}) {
  if (packetId) {
    const existing = await fetchDocumentPacket(packetId, { includeVersions: false, includeEvents: false })
    if (existing) {
      return existing
    }
  }

  const packet = await createPacket({
    organisationId: context?.organisationId || null,
    packetType,
    title: buildPacketTitle(packetType, context),
    status: 'draft',
    templateId: template?.id || null,
    templateKeySnapshot: template?.template_key || null,
    templateLabelSnapshot: template?.template_label || null,
    transactionId: context?.transaction?.id || context?.transactionId || null,
    leadId: context?.lead?.lead_id || context?.lead?.id || context?.leadId || null,
    contactId: context?.contact?.contact_id || context?.contactId || null,
    dealId: context?.deal?.deal_id || context?.dealId || null,
    unitId: context?.unit?.id || context?.unitId || null,
    assignedAgentId:
      context?.assignedAgentId ||
      context?.transaction?.assigned_user_id ||
      context?.transaction?.owner_user_id ||
      null,
    sourceContextJson: {
      packetType,
      contextType: packetType === 'mandate' ? 'listing_seller' : 'transaction',
    },
  })

  return packet
}

export async function savePacketDraft({
  packetId = null,
  packetType,
  context = {},
  template = null,
  validationAction = 'preview',
} = {}) {
  const templateResolution = await resolveTemplateForPacket({ packetType, context, template })
  const resolvedTemplate = templateResolution.template || null
  const renderedPreview = await renderPacketPreview({
    packetType,
    context,
    title: buildPacketTitle(packetType, context),
    template: resolvedTemplate,
    validationAction,
  })
  const rendered = withMandateTemplateRoutingWarnings(renderedPreview, templateResolution)

  const packet = await createOrReusePacket({
    packetId,
    packetType: rendered.packetType,
    context,
    template: resolvedTemplate,
  })
  const preparedAt = new Date().toISOString()
  const generationPayload = buildGenerationPayload({
    packet,
    context,
    validation: rendered,
    template: resolvedTemplate,
    templateResolution,
    generatedAt: preparedAt,
  })
  const previewRenderProvenance = buildRenderProvenance({
    packetType: rendered.packetType,
    template: resolvedTemplate,
    validation: rendered,
    pdfPlaceholders: sanitizeTemplatePlaceholders(rendered.placeholders || {}),
    generationPayload,
    templateVersion: resolveTemplateVersion(resolvedTemplate),
    generatedAt: preparedAt,
  })

  const packetStatus = normalizeText(packet?.status).toLowerCase()
  const canUpdateTemplateSnapshot = resolvedTemplate?.id &&
    normalizeText(packet?.template_id) !== normalizeText(resolvedTemplate.id) &&
    !['sent', 'partially_signed', 'completed', 'voided', 'archived'].includes(packetStatus)
  const updated = await updatePacketFresh(packet.id, {
    status: 'draft',
    ...(canUpdateTemplateSnapshot
      ? {
          templateId: resolvedTemplate.id,
          templateKeySnapshot: resolvedTemplate.template_key || resolvedTemplate.key || null,
          templateLabelSnapshot: resolvedTemplate.template_label || resolvedTemplate.label || null,
        }
      : {}),
    sourceContextJson: {
      ...(packet?.source_context_json || {}),
      previewPreparedAt: preparedAt,
      packetType: rendered.packetType,
      generationPayload,
      renderProvenancePreview: previewRenderProvenance,
      templateVersion: resolveTemplateVersion(resolvedTemplate),
      templateResolution,
      templateResolutionSource: rendered.templateResolutionSource || templateResolution?.source || null,
      mandateTemplateVariant: rendered.mandateTemplateVariant || null,
      mandateScenarioProfile: rendered.mandateScenarioProfile || null,
      mandateTemplateRouting: templateResolution?.mandateTemplateRouting || null,
      mandateTemplateFallback: Boolean(rendered.mandateTemplateFallback),
      mandateTemplateFallbackWarning: rendered.mandateTemplateFallbackWarning || null,
      mandateTemplateContentGate: rendered.mandateTemplateContentGate || null,
      mandateTemplateLaunchReadiness: rendered.mandateTemplateLaunchReadiness || null,
      generatedDataSnapshot: context?.mandateData || context?.generatedDataSnapshot || null,
      missingFieldsSnapshot: context?.mandateValidation?.missingRequiredFields || rendered?.critical || [],
      warningsSnapshot: buildWarningsSnapshot(context, rendered),
      sourceContext: context?.mandateData?.sourceContext || context?.sourceContext || null,
    },
    brandingSnapshotJson: rendered.branding || {},
  })

  await addPacketEvent({
    packetId: updated.id,
    organisationId: updated.organisation_id,
    eventType: 'validation_run',
    eventPayload: buildValidationSummary(rendered),
  })

  return {
    packet: updated,
    validation: rendered,
    previewHtml: rendered.previewHtml,
    template: resolvedTemplate,
    templateResolution,
  }
}

export async function generatePacketVersion({
  packetId = null,
  packetType,
  context = {},
  template = null,
  allowWarnings = true,
  forceGenerate = false,
} = {}) {
  const prepared = await savePacketDraft({
    packetId,
    packetType,
    context: {
      ...context,
      validationAction: 'generate',
    },
    template,
    validationAction: 'generate',
  })

  const { packet, validation } = prepared
  const effectiveTemplate = prepared.template || template || null
  const isMandatePacket = validation.packetType === 'mandate'
  const hasConditionalPackBlockingIssues = (validation.critical || []).some((issue) => issue?.source === 'conditional_pack')
  const hasMandateTemplateContentGateBlockingIssues = (validation.critical || []).some((issue) => issue?.source === 'mandate_template_content_gate')
  const hasMandateTemplateLaunchReadinessBlockingIssues = (validation.critical || []).some((issue) => issue?.source === 'mandate_template_launch_readiness')
  const allowGenerationBypass = (isMandatePacket && !hasConditionalPackBlockingIssues && !hasMandateTemplateContentGateBlockingIssues && !hasMandateTemplateLaunchReadinessBlockingIssues) || forceGenerate
  if (!validation.isValidForGeneration && !allowGenerationBypass) {
    const error = createPacketError(
      hasMandateTemplateLaunchReadinessBlockingIssues
        ? 'MANDATE_TEMPLATE_LAUNCH_READINESS_BLOCKED'
        : hasMandateTemplateContentGateBlockingIssues ? 'MANDATE_TEMPLATE_CONTENT_GATE_BLOCKED' : 'VALIDATION_BLOCKED',
      hasMandateTemplateLaunchReadinessBlockingIssues
        ? 'Mandate template launch readiness is blocked. Publish the correct route template before generation.'
        : hasMandateTemplateContentGateBlockingIssues
          ? 'Mandate template wording does not match the selected route. Fix the template content before generation.'
          : 'Critical packet data is missing. Fix validation issues before generation.',
    )
    error.validation = validation
    throw error
  }

  if (!allowWarnings && validation.warnings.length) {
    const error = createPacketError(
      'WARNINGS_BLOCKED',
      'Packet has warnings. Resolve warning-level data before generation.',
    )
    error.validation = validation
    throw error
  }

  const generatedAt = new Date().toISOString()
  const generationPayload = buildGenerationPayload({
    packet,
    context,
    validation,
    template: effectiveTemplate,
    templateResolution: prepared.templateResolution || null,
    generatedAt,
  })
  const pdfPlaceholders = sanitizeTemplatePlaceholders(validation.placeholders || {})
  const templateVersion = resolveTemplateVersion(effectiveTemplate)
  const sourceContextSnapshot = context?.mandateData?.sourceContext || context?.sourceContext || null
  const readOnlyAnnexures = resolveReadOnlyAnnexures(sourceContextSnapshot)
  await addPacketEvent({
    packetId: packet.id,
    organisationId: packet.organisation_id,
    eventType: 'generation_started',
    eventPayload: {
      activity_type: validation.packetType === 'mandate'
        ? 'mandate_generation_started'
        : COMMERCIAL_DOCUMENT_PACKET_TYPES.includes(validation.packetType)
          ? 'commercial_document_generation_started'
          : 'generation_started',
      leadId: context?.lead?.lead_id || context?.lead?.id || context?.leadId || null,
      transactionId: context?.transaction?.id || context?.transactionId || null,
      packetType: validation.packetType,
      templateVersion,
      templateResolutionSource: generationPayload.templateResolutionSource || null,
      mandateTemplateVariant: generationPayload.mandateTemplateVariant || null,
      mandateTemplateRouting: generationPayload.mandateTemplateRouting || null,
      mandateTemplateFallback: Boolean(generationPayload.mandateTemplateFallback),
      mandateTemplateFallbackWarning: generationPayload.mandateTemplateFallbackWarning || null,
      mandateTemplateContentGate: generationPayload.mandateTemplateContentGate || null,
      mandateTemplateLaunchReadiness: generationPayload.mandateTemplateLaunchReadiness || null,
      generatedAt,
      message: validation.packetType === 'mandate'
        ? 'Mandate generation started.'
        : COMMERCIAL_DOCUMENT_PACKET_TYPES.includes(validation.packetType)
          ? 'Commercial document generation started.'
          : 'Document generation started.',
    },
  }).catch((eventError) => {
    console.warn('[PACKETS] generation_started event could not be recorded; continuing generation.', eventError)
  })

  let artifact = {
    renderedDocumentId: null,
    renderedFilePath: null,
    renderedFileName: null,
    renderedFileUrl: null,
  }
  let renderStatus = 'generated'
  let previewOnlyGeneration = false
  let previewOnlyReason = ''

  try {
    if (validation.packetType === 'otp') {
      const otpResult = await withPacketRetries(() => generateOtpDocumentFromTemplate({
        transactionId: context?.transaction?.id || context?.transactionId,
        specialConditions: context?.specialConditions || '',
        placeholders: pdfPlaceholders,
        sourceContext: sourceContextSnapshot,
        generatedByRole: context?.generatedByRole || '',
        generatedByUserId: context?.generatedByUserId || '',
        clientVisible: false,
      }))
      artifact = extractGeneratedArtifact(otpResult)
      assertGenerationOutput(artifact, 'otp')
    } else if (validation.packetType === 'mandate' || COMMERCIAL_DOCUMENT_PACKET_TYPES.includes(validation.packetType)) {
      const templateConfig = resolveTemplateConfig(effectiveTemplate)
      const renderMode = resolveTemplateRenderMode(effectiveTemplate, validation.packetType)
      const useNativeRenderer = shouldUseNativeGeneration(effectiveTemplate, validation.packetType)
      if (!templateIsUsableForGeneration(effectiveTemplate, validation.packetType) && !shouldAllowMandateTemplateFallback(effectiveTemplate, validation.packetType)) {
        throw createPacketError(
          useNativeRenderer ? 'NATIVE_TEMPLATE_NOT_RENDERABLE' : 'MISSING_TEMPLATE_FILE',
          useNativeRenderer
            ? 'The active legal template is not renderable yet. Complete the required sections and template fields before generating it.'
            : COMMERCIAL_DOCUMENT_PACKET_TYPES.includes(validation.packetType)
              ? 'The commercial template could not be rendered. Please check the template setup.'
              : 'The mandate template could not be rendered. Please check the template setup.',
        )
      }
      const mandateResult = await withPacketTimeout(
        withPacketRetries(() => generateMandateDocumentFromTemplate({
          packetId: packet.id,
          transactionId: normalizeNullableUuid(context?.transaction?.id || context?.transactionId),
          leadId: normalizeNullableUuid(context?.lead?.lead_id || context?.lead?.id || context?.leadId),
          templatePath: templateConfig.templatePath,
          templateBucket: templateConfig.templateBucket,
          templateFilename: templateConfig.templateFilename,
          outputBucket: templateConfig.outputBucket,
          outputPath: buildGenerationOutputPath({ packet, context, generatedAt }),
          renderMode,
          placeholders: pdfPlaceholders,
          sectionManifest: validation.sectionManifest || [],
          generationPayload,
          sourceContext: sourceContextSnapshot,
          branding: validation.branding || {},
          templateVersion,
          generatedByRole: context?.generatedByRole || 'agent',
          generatedByUserId: context?.generatedByUserId || '',
          clientVisible: false,
        }), {
          attempts: 1,
        }),
        'Mandate document rendering is taking too long.',
      )
      artifact = extractGeneratedArtifact(mandateResult)
      assertGenerationOutput(artifact, validation.packetType)
    }
  } catch (rawError) {
    const failureCode = inferGenerationFailureCode(rawError)
    const failureMessage = toFriendlyGenerationMessage(
      failureCode,
      normalizeText(rawError?.message || String(rawError)),
    )

    if (validation.packetType === 'mandate') {
      console.warn('[PACKETS] mandate render failed; continuing with a generated preview-only draft.', {
        packetId: packet.id,
        failureCode,
        failureMessage,
      })
      previewOnlyGeneration = true
      previewOnlyReason = failureMessage
    } else {
      const isTimeoutFailure = failureCode === 'GENERATION_TIMEOUT'
      if (isTimeoutFailure) {
        void recordGenerationFailure({
          packet,
          template: effectiveTemplate,
          validation,
          artifact,
          failureCode,
          failureMessage,
          pdfPlaceholders,
          generationPayload,
          templateVersion,
          templateResolution: prepared.templateResolution || null,
          generatedAt,
          sourceContextSnapshot,
          context,
        }).catch((failureLoggingError) => {
          console.warn('[PACKETS] generation timeout bookkeeping could not be recorded promptly.', failureLoggingError)
        })

        const error = createPacketError(failureCode, failureMessage)
        error.validation = validation
        throw error
      }

      const failedVersion = await recordGenerationFailure({
        packet,
        template: effectiveTemplate,
        validation,
        artifact,
        failureCode,
        failureMessage,
        pdfPlaceholders,
        generationPayload,
        templateVersion,
        templateResolution: prepared.templateResolution || null,
        generatedAt,
        sourceContextSnapshot,
        context,
      })

      const error = createPacketError(failureCode, failureMessage, {
        failedVersionId: failedVersion.id,
        failedVersionNumber: failedVersion.version_number,
      })
      error.validation = validation
      throw error
    }
  }

  if (previewOnlyGeneration) {
    renderStatus = 'generated'
  }

  const renderProvenance = buildRenderProvenance({
    packetType: validation.packetType,
    template: effectiveTemplate,
    validation,
    pdfPlaceholders,
    generationPayload,
    templateVersion,
    generatedAt,
  })

  const version = await createDocumentPacketVersionSafely({
    packetId: packet.id,
    renderStatus,
    renderedDocumentId: artifact.renderedDocumentId,
    renderedFilePath: artifact.renderedFilePath,
    renderedFileName: artifact.renderedFileName,
    renderedFileUrl: artifact.renderedFileUrl,
    placeholdersResolvedJson: pdfPlaceholders,
    placeholdersMissingJson: validation.missingPlaceholders,
    sectionManifestJson: validation.sectionManifest,
    validationSummaryJson: {
      ...buildValidationSummary(validation),
      generationStatus: previewOnlyGeneration ? 'preview_only' : 'generated',
      previewOnly: previewOnlyGeneration,
      previewOnlyReason: previewOnlyReason || null,
      generationPayload,
      templateVersion,
      templateResolution: prepared.templateResolution || null,
      generatedAt,
      render_provenance: renderProvenance,
      generatedDataSnapshot: context?.mandateData || context?.generatedDataSnapshot || null,
      missingFieldsSnapshot: context?.mandateValidation?.missingRequiredFields || validation.missingPlaceholders || [],
      warningsSnapshot: buildWarningsSnapshot(context, validation),
      sourceContext: sourceContextSnapshot,
      readOnlyAnnexures,
      annexures: readOnlyAnnexures,
    },
    generatedBy: context?.generatedByUserId || null,
    generatedAt,
  })

  const updatedPacket = await updatePacketFresh(packet.id, {
    status: 'generated',
    sourceContextJson: {
      ...(packet?.source_context_json || {}),
      lastGeneratedVersion: version.version_number,
      previewOnlyGeneration,
      previewOnlyReason: previewOnlyReason || null,
      generationPayload,
      templateVersion,
      generatedAt,
      renderProvenance,
      templateResolutionSource: generationPayload.templateResolutionSource || null,
      mandateTemplateVariant: generationPayload.mandateTemplateVariant || null,
      mandateScenarioProfile: generationPayload.mandateScenarioProfile || null,
      mandateTemplateRouting: generationPayload.mandateTemplateRouting || null,
      mandateTemplateFallback: Boolean(generationPayload.mandateTemplateFallback),
      mandateTemplateFallbackWarning: generationPayload.mandateTemplateFallbackWarning || null,
      mandateTemplateContentGate: generationPayload.mandateTemplateContentGate || null,
      mandateTemplateLaunchReadiness: generationPayload.mandateTemplateLaunchReadiness || null,
      generatedDataSnapshot: context?.mandateData || context?.generatedDataSnapshot || null,
      missingFieldsSnapshot: context?.mandateValidation?.missingRequiredFields || validation.missingPlaceholders || [],
      warningsSnapshot: buildWarningsSnapshot(context, validation),
      sourceContext: sourceContextSnapshot,
      readOnlyAnnexures,
      annexures: readOnlyAnnexures,
    },
    brandingSnapshotJson: validation.branding || {},
  })

  await addPacketEvent({
    packetId: packet.id,
    organisationId: packet.organisation_id,
    versionId: version.id,
    eventType: previewOnlyGeneration ? 'draft_preview_generated' : version.version_number > 1 ? 'packet_regenerated' : 'version_generated',
    eventPayload: {
      activity_type: previewOnlyGeneration
        ? 'mandate_draft_preview_generated'
        : COMMERCIAL_DOCUMENT_PACKET_TYPES.includes(validation.packetType)
          ? 'commercial_document_generated'
          : 'mandate_generated',
      leadId: context?.lead?.lead_id || context?.lead?.id || context?.leadId || null,
      transactionId: context?.transaction?.id || context?.transactionId || null,
      versionNumber: version.version_number,
      renderStatus: version.render_status,
      renderedDocumentId: version.rendered_document_id,
      renderedFilePath: version.rendered_file_path,
      previewOnly: previewOnlyGeneration,
      previewOnlyReason: previewOnlyReason || null,
      templateResolutionSource: generationPayload.templateResolutionSource || null,
      mandateTemplateVariant: generationPayload.mandateTemplateVariant || null,
      mandateTemplateRouting: generationPayload.mandateTemplateRouting || null,
      mandateTemplateFallback: Boolean(generationPayload.mandateTemplateFallback),
      mandateTemplateFallbackWarning: generationPayload.mandateTemplateFallbackWarning || null,
      mandateTemplateContentGate: generationPayload.mandateTemplateContentGate || null,
      mandateTemplateLaunchReadiness: generationPayload.mandateTemplateLaunchReadiness || null,
      message: previewOnlyGeneration
        ? 'Mandate draft preview was generated.'
        : COMMERCIAL_DOCUMENT_PACKET_TYPES.includes(validation.packetType)
          ? 'Commercial document was generated successfully.'
          : 'Mandate was generated successfully.',
    },
  })

  if ((validation.packetType === 'mandate' || COMMERCIAL_DOCUMENT_PACKET_TYPES.includes(validation.packetType)) && !previewOnlyGeneration && version.rendered_file_path) {
    await addPacketEvent({
      packetId: packet.id,
      organisationId: packet.organisation_id,
      versionId: version.id,
      eventType: 'mandate_pdf_created',
      eventPayload: {
        activity_type: 'mandate_pdf_created',
        leadId: context?.lead?.lead_id || context?.lead?.id || context?.leadId || null,
        transactionId: context?.transaction?.id || context?.transactionId || null,
        renderedFilePath: version.rendered_file_path,
        renderedFileName: version.rendered_file_name,
        message: COMMERCIAL_DOCUMENT_PACKET_TYPES.includes(validation.packetType)
          ? 'Commercial document PDF was created.'
          : 'Mandate PDF was created.',
      },
    })
  }

  return {
    packet: updatedPacket,
    version,
    validation,
    previewHtml: prepared.previewHtml,
    template: effectiveTemplate,
    templateResolution: prepared.templateResolution || null,
  }
}

export async function regeneratePacket({
  packetId,
  packetType,
  context = {},
  template = null,
} = {}) {
  if (!packetId) throw new Error('packetId is required for regeneration.')
  return generatePacketVersion({
    packetId,
    packetType,
    context,
    template,
    allowWarnings: true,
    forceGenerate: false,
  })
}

export async function getPacketValidationState({
  packetType,
  context = {},
  template = null,
} = {}) {
  const validation = await validatePacket({ packetType, context, template })
  return buildValidationSummary(validation)
}

export async function listPacketSigners({ packetId, packetVersionId = null, organisationId = null } = {}) {
  return listPacketSignersRecord({ packetId, packetVersionId, organisationId })
}

export async function listPacketSigningFields({
  packetId,
  packetVersionId = null,
  signerRole = null,
  organisationId = null,
} = {}) {
  return listPacketSigningFieldsRecord({ packetId, packetVersionId, signerRole, organisationId })
}

export async function getPacketSigningSummary({ packetId, packetVersionId = null, organisationId = null } = {}) {
  return getPacketSigningSummaryRecord({ packetId, packetVersionId, organisationId })
}

export async function createPacketSigners({
  packetId,
  packetVersionId,
  packetDocumentId = null,
  signers = [],
  organisationId = null,
  markSigningPrep = true,
} = {}) {
  return createPacketSignersRecord({
    packetId,
    packetVersionId,
    packetDocumentId,
    signers,
    organisationId,
    markSigningPrep,
  })
}

export async function createPacketSigningFields({
  packetId,
  packetVersionId,
  packetDocumentId = null,
  fields = [],
  organisationId = null,
  markSigningPrep = true,
} = {}) {
  return createPacketSigningFieldRecords({
    packetId,
    packetVersionId,
    packetDocumentId,
    fields,
    organisationId,
    markSigningPrep,
  })
}

export async function updatePacketSigningFieldStatus({
  fieldId,
  status,
  completedAt = null,
  completedByEmail = null,
} = {}) {
  return updateSigningFieldStatusRecord({
    fieldId,
    status,
    completedAt,
    completedByEmail,
  })
}

function getLatestGeneratedVersion(versions = []) {
  return (versions || []).find((item) => String(item?.render_status || '').toLowerCase() === 'generated') || null
}

export async function prepareSigningFields({
  packetId,
  packetType,
  context = {},
  placeholders = {},
  organisationId = null,
} = {}) {
  const resolvedPacketId = normalizeText(packetId)
  if (!resolvedPacketId) throw new Error('packetId is required.')

  const packet = await fetchDocumentPacket(resolvedPacketId, {
    includeVersions: true,
    includeEvents: false,
  })
  if (!packet) throw new Error('Document packet not found.')

  const latestGeneratedVersion = getLatestGeneratedVersion(packet.versions || [])
  const targetVersion = latestGeneratedVersion
  if (!targetVersion?.id) {
    throw createPacketError('NO_GENERATED_VERSION', 'Generate a packet version before preparing signing fields.')
  }

  const currentSummary = await getPacketSigningSummaryRecord({
    packetId: resolvedPacketId,
    packetVersionId: targetVersion.id,
    organisationId,
  })

  const seed = buildDefaultSigningSeeds({
    packetType: normalizeText(packetType) || normalizeText(packet?.packet_type),
    placeholders: placeholders && typeof placeholders === 'object' ? placeholders : {},
    context,
    versionNumber: targetVersion.version_number,
  })

  if (currentSummary.fieldCount > 0 || currentSummary.signerCount > 0) {
    const currentSigners = Array.isArray(currentSummary.signers) ? currentSummary.signers : []
    const currentFields = Array.isArray(currentSummary.fields) ? currentSummary.fields : []
    const needsSignerRepair = seed.signers.some((seedSigner) => {
      const existingSigner = currentSigners.find(
        (row) => normalizeText(row?.signer_role || row?.signerRole).toLowerCase() === normalizeText(seedSigner?.signerRole).toLowerCase(),
      )
      if (!existingSigner) return true
      const existingName = normalizeText(existingSigner?.signer_name || existingSigner?.signerName)
      const existingEmail = normalizeText(existingSigner?.signer_email || existingSigner?.signerEmail).toLowerCase()
      const nextEmail = normalizeText(seedSigner?.signerEmail).toLowerCase()
      if (!existingName && seedSigner?.signerName) return true
      if ((!existingEmail || isSyntheticSigningEmail(existingEmail)) && nextEmail && !isSyntheticSigningEmail(nextEmail)) return true
      return false
    })
    const missingFields = seed.fields.filter((seedField) => {
      const role = normalizeText(seedField?.signerRole).toLowerCase()
      const type = normalizeText(seedField?.fieldType).toLowerCase()
      const page = Number(seedField?.pageNumber)
      return !currentFields.some((existingField) => (
        normalizeText(existingField?.signer_role || existingField?.signerRole).toLowerCase() === role &&
        normalizeText(existingField?.field_type || existingField?.fieldType).toLowerCase() === type &&
        Number(existingField?.page_number || existingField?.pageNumber) === page
      ))
    })

    if (needsSignerRepair && seed.signers.length) {
      await createPacketSignersRecord({
        packetId: resolvedPacketId,
        packetVersionId: targetVersion.id,
        packetDocumentId: targetVersion?.rendered_document_id || null,
        signers: seed.signers,
        organisationId,
        markSigningPrep: true,
      })
      const repairedSummary = await getPacketSigningSummaryRecord({
        packetId: resolvedPacketId,
        packetVersionId: targetVersion.id,
        organisationId,
      })
      return {
        alreadyPrepared: false,
        repairedExisting: true,
        packet,
        version: targetVersion,
        summary: repairedSummary,
        seed,
      }
    }

    if (missingFields.length) {
      await createPacketSigningFieldRecords({
        packetId: resolvedPacketId,
        packetVersionId: targetVersion.id,
        packetDocumentId: targetVersion?.rendered_document_id || null,
        fields: missingFields,
        organisationId,
        markSigningPrep: true,
      })
      const repairedSummary = await getPacketSigningSummaryRecord({
        packetId: resolvedPacketId,
        packetVersionId: targetVersion.id,
        organisationId,
      })
      return {
        alreadyPrepared: false,
        repairedExisting: true,
        packet,
        version: targetVersion,
        summary: repairedSummary,
        seed,
      }
    }

    return {
      alreadyPrepared: true,
      packet,
      version: targetVersion,
      summary: currentSummary,
      seed,
    }
  }

  if (!seed.signers.length || !seed.fields.length) {
    throw createPacketError('NO_SIGNING_FIELDS', 'Unable to prepare default signing fields from current packet data.')
  }

  await createPacketSignersRecord({
    packetId: resolvedPacketId,
    packetVersionId: targetVersion.id,
    packetDocumentId: targetVersion?.rendered_document_id || null,
    signers: seed.signers,
    organisationId,
    markSigningPrep: true,
  })

  await createPacketSigningFieldRecords({
    packetId: resolvedPacketId,
    packetVersionId: targetVersion.id,
    packetDocumentId: targetVersion?.rendered_document_id || null,
    fields: seed.fields,
    organisationId,
    markSigningPrep: true,
  })

  await addPacketEvent({
    packetId: resolvedPacketId,
    organisationId: packet.organisation_id,
    versionId: targetVersion.id,
    eventType: 'signing_fields_prepared',
    eventPayload: {
      packetType: normalizeText(packetType) || normalizeText(packet?.packet_type),
      signerCount: seed.signers.length,
      fieldCount: seed.fields.length,
    },
  })

  const updatedSummary = await getPacketSigningSummaryRecord({
    packetId: resolvedPacketId,
    packetVersionId: targetVersion.id,
    organisationId,
  })

  return {
    alreadyPrepared: false,
    packetId: resolvedPacketId,
    version: targetVersion,
    summary: updatedSummary,
    seed,
  }
}

export async function resetSigningFields({
  packetId,
  packetVersionId = null,
  organisationId = null,
} = {}) {
  const resolvedPacketId = normalizeText(packetId)
  if (!resolvedPacketId) throw new Error('packetId is required.')

  const packet = await fetchDocumentPacket(resolvedPacketId, {
    includeVersions: true,
    includeEvents: false,
  })
  if (!packet) throw new Error('Document packet not found.')

  const targetVersion =
    (packetVersionId
      ? (packet.versions || []).find((item) => String(item?.id || '') === String(packetVersionId))
      : getLatestGeneratedVersion(packet.versions || [])) || null
  if (!targetVersion?.id) {
    throw createPacketError('NO_SIGNING_VERSION', 'No generated packet version found for signing reset.')
  }

  const summary = await getPacketSigningSummaryRecord({
    packetId: resolvedPacketId,
    packetVersionId: targetVersion.id,
    organisationId,
  })

  const anyCompletedField = (summary.fields || []).some((field) => String(field?.status || '').toLowerCase() === 'completed')
  const anyCompletedSigner = (summary.signers || []).some((signer) =>
    ['signed', 'declined'].includes(String(signer?.status || '').toLowerCase()),
  )
  if (anyCompletedField || anyCompletedSigner) {
    throw createPacketError(
      'SIGNING_ALREADY_PROGRESSING',
      'Cannot reset signing fields because at least one signer has already completed signing activity.',
    )
  }

  await deletePacketSigningFieldsRecord({
    packetId: resolvedPacketId,
    packetVersionId: targetVersion.id,
    organisationId,
  })
  await deletePacketSignersRecord({
    packetId: resolvedPacketId,
    packetVersionId: targetVersion.id,
    organisationId,
  })

  await updatePacketFresh(packet.id, { status: 'generated' })
  await addPacketEvent({
    packetId: resolvedPacketId,
    organisationId: packet.organisation_id,
    versionId: targetVersion.id,
    eventType: 'signing_fields_reset',
    eventPayload: {
      packetVersionId: targetVersion.id,
    },
  })

  const updatedSummary = await getPacketSigningSummaryRecord({
    packetId: resolvedPacketId,
    packetVersionId: targetVersion.id,
    organisationId,
  })

  return {
    packetId: resolvedPacketId,
    version: targetVersion,
    summary: updatedSummary,
  }
}

export async function generateSigningLinks({
  packetId,
  packetVersionId = null,
  expiresInHours = 72,
  baseUrl = '',
  organisationId = null,
  regenerate = false,
  targetSignerRole = '',
} = {}) {
  return generatePacketSigningLinksRecord({
    packetId,
    packetVersionId,
    expiresInHours,
    baseUrl,
    organisationId,
    regenerate,
    targetSignerRole,
  })
}

export async function generateFinalSignedPacketDocument({
  packetId,
  packetVersionId = null,
  organisationId = null,
  outputBucket = '',
} = {}) {
  const resolvedPacketId = normalizeText(packetId)
  if (!resolvedPacketId) throw new Error('packetId is required.')

  const packet = await fetchDocumentPacket(resolvedPacketId, {
    includeVersions: true,
    includeEvents: false,
  })
  if (!packet) throw new Error('Document packet not found.')

  const targetVersion =
    (packetVersionId
      ? (packet.versions || []).find((item) => String(item?.id || '') === String(packetVersionId))
      : getLatestGeneratedVersion(packet.versions || [])) || null

  if (!targetVersion?.id) {
    throw createPacketError('NO_GENERATED_VERSION', 'No generated packet version found for finalisation.')
  }

  const signingSummary = await getPacketSigningSummaryRecord({
    packetId: resolvedPacketId,
    packetVersionId: targetVersion.id,
    organisationId,
  })

  if (!signingSummary?.signerCount) {
    throw createPacketError('MISSING_SIGNERS', 'No signers configured for this packet version.')
  }

  const mandateSpouseRequired = normalizeText(packet?.packet_type).toLowerCase() === 'mandate' &&
    (() => {
      const spouseRequirement = resolveMandateSpouseRequirementFromFields(signingSummary.fields || [])
      if (spouseRequirement !== null) return spouseRequirement
      return resolveMandateSecondarySignerConfig({ packet }).required
    })()
  const relevantSigners = normalizeText(packet?.packet_type).toLowerCase() === 'mandate'
    ? filterMandateSigningRows(signingSummary.signers || [], { requiresSpouse: mandateSpouseRequired })
    : (signingSummary.signers || [])
  const relevantFields = normalizeText(packet?.packet_type).toLowerCase() === 'mandate'
    ? filterMandateSigningRows(signingSummary.fields || [], { requiresSpouse: mandateSpouseRequired })
    : (signingSummary.fields || [])

  const incompleteSigners = relevantSigners.filter(
    (signer) => String(signer?.status || '').toLowerCase() !== 'signed',
  )
  if (incompleteSigners.length) {
    throw createPacketError('SIGNERS_INCOMPLETE', 'All required signers must complete signing before finalisation.')
  }

  const requiredFields = relevantFields.filter((field) => field?.required)
  const incompleteFields = requiredFields.filter((field) => String(field?.status || '').toLowerCase() !== 'completed')
  if (incompleteFields.length) {
    throw createPacketError('FIELDS_INCOMPLETE', 'Required signing fields are incomplete for this packet version.')
  }

  const missingAssets = requiredFields.filter((field) => {
    const type = String(field?.field_type || '').toLowerCase()
    const needsAsset = type === 'initial' || type === 'signature'
    return needsAsset && !normalizeText(field?.signature_asset_path)
  })
  if (missingAssets.length) {
    throw createPacketError('MISSING_SIGNATURE_ASSETS', 'Required signature assets are missing for one or more fields.')
  }

  const result = await withPacketTimeout(
    generateFinalSignedDocumentRecord({
      packetId: resolvedPacketId,
      packetVersionId: targetVersion.id,
      organisationId,
      outputBucket,
    }),
    'Final signed document generation is taking too long.',
    FINAL_SIGNED_GENERATION_TIMEOUT_MS,
  )

  await addPacketEvent({
    packetId: resolvedPacketId,
    organisationId: packet.organisation_id,
    versionId: targetVersion.id,
    eventType: 'final_signed_document_requested',
    eventPayload: {
      packetVersionId: targetVersion.id,
    },
  })

  const refreshedPacket = await fetchDocumentPacket(resolvedPacketId, {
    includeVersions: true,
    includeEvents: false,
  })

  return {
    ...result,
    packet: refreshedPacket || packet,
  }
}

export async function getDocumentConversionHealthStatus() {
  return checkDocumentConversionHealthRecord()
}
