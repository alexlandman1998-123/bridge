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
  updatePacket,
  updateDocumentSigningFieldStatus as updateSigningFieldStatusRecord,
  validateDocumentPacketPlaceholders,
} from './packetServiceApiAdapter'
import {
  buildPacketSectionManifest,
  renderPacketPreviewHtml,
  resolveMandatePacketPlaceholders,
  resolveOtpPacketPlaceholders,
  validatePacketPlaceholders,
} from './packetWorkflow'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNullableText(value) {
  const text = normalizeText(value)
  return text || null
}

function createPacketError(code, message, details = {}) {
  const error = new Error(message)
  error.code = code
  error.details = details
  return error
}

function resolveTemplateConfig(template = null) {
  const metadata = template?.metadata_json && typeof template.metadata_json === 'object' ? template.metadata_json : {}
  return {
    templatePath:
      normalizeText(template?.template_storage_path) ||
      normalizeText(template?.templateStoragePath) ||
      normalizeText(metadata?.template_storage_path) ||
      normalizeText(metadata?.templatePath) ||
      '',
    templateBucket:
      normalizeText(template?.template_storage_bucket) ||
      normalizeText(template?.templateStorageBucket) ||
      normalizeText(metadata?.template_storage_bucket) ||
      normalizeText(metadata?.template_bucket) ||
      normalizeText(metadata?.templateBucket) ||
      '',
    templateFilename:
      normalizeText(template?.template_file_name) ||
      normalizeText(template?.templateFileName) ||
      normalizeText(metadata?.template_file_name) ||
      normalizeText(metadata?.template_filename) ||
      normalizeText(metadata?.templateFilename) ||
      normalizeText(template?.template_label) ||
      normalizeText(template?.template_key) ||
      '',
    outputBucket:
      normalizeText(template?.template_output_bucket) ||
      normalizeText(template?.templateOutputBucket) ||
      normalizeText(metadata?.template_output_bucket) ||
      normalizeText(metadata?.output_bucket) ||
      normalizeText(metadata?.outputBucket) ||
      '',
  }
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
  if (message.includes('template source missing') || message.includes('template not found') || message.includes('unable to download')) {
    return 'MISSING_TEMPLATE_FILE'
  }
  if (message.includes('upload') && message.includes('storage')) {
    return 'STORAGE_UPLOAD_FAILED'
  }
  if (message.includes('render failed') || message.includes('placeholder')) {
    return 'DOCX_RENDER_FAILED'
  }
  return 'DOCX_GENERATION_FAILED'
}

function toFriendlyGenerationMessage(code = '', fallback = '') {
  switch (code) {
    case 'VALIDATION_BLOCKED':
      return 'Validation blocked: fix required packet fields before generating the DOCX.'
    case 'MISSING_TEMPLATE_FILE':
      return 'Missing template file: upload or configure a valid template path before generation.'
    case 'STORAGE_UPLOAD_FAILED':
      return 'Storage upload failed: the DOCX could not be saved to storage.'
    case 'MISSING_RENDERED_FILE_PATH':
    case 'MISSING_RENDERED_FILE_REFERENCE':
      return 'Generation failed: no document file reference was returned.'
    case 'MISSING_DOCUMENT_RECORD':
      return 'Generation failed: document record could not be linked to this packet version.'
    case 'DOCX_RENDER_FAILED':
      return 'Template render failed: check required placeholders and template tags.'
    default:
      return fallback || 'Packet generation failed. Please retry after checking template and data.'
  }
}

const DEFAULT_SIGNING_LAYOUT = {
  otp: {
    pageCount: 6,
    initialsRoles: ['purchaser_1', 'seller'],
    conditionalInitialRoles: ['agent', 'contractor'],
    signatureRoles: ['purchaser_1', 'seller', 'agent', 'contractor'],
  },
  mandate: {
    pageCount: 3,
    initialsRoles: ['seller'],
    conditionalInitialRoles: ['agent'],
    signatureRoles: ['seller', 'agent'],
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

function resolveSignerSeed({ role, placeholders = {}, context = {} } = {}) {
  const normalizedRole = normalizeText(role).toLowerCase()
  const buyer = context?.buyer || {}
  const lead = context?.lead || {}
  const transaction = context?.transaction || {}
  const mandateDraft = context?.mandateDraft || {}
  const onboarding = context?.onboardingFormData || {}

  const candidates = {
    purchaser_1: {
      name: [
        placeholders['buyer.display_name'],
        buyer?.name,
        `${onboarding?.first_name || onboarding?.firstName || ''} ${onboarding?.last_name || onboarding?.lastName || ''}`.trim(),
      ],
      email: [placeholders['buyer.email'], buyer?.email, onboarding?.email, onboarding?.buyer_email],
      required: true,
      conditional: false,
    },
    purchaser_2: {
      name: [
        placeholders['buyer2.display_name'],
        placeholders['buyer_2.display_name'],
        onboarding?.co_buyer_name,
        onboarding?.coBuyerName,
      ],
      email: [placeholders['buyer2.email'], placeholders['buyer_2.email'], onboarding?.co_buyer_email, onboarding?.coBuyerEmail],
      required: false,
      conditional: true,
    },
    seller: {
      name: [
        placeholders['seller.display_name'],
        lead?.name,
        [lead?.sellerName, lead?.sellerSurname].filter(Boolean).join(' ').trim(),
        transaction?.seller_name,
      ],
      email: [placeholders['seller.email'], lead?.sellerEmail, mandateDraft?.sellerEmail],
      required: true,
      conditional: false,
    },
    agent: {
      name: [placeholders['agent.display_name'], transaction?.assigned_agent, context?.generatedByName],
      email: [placeholders['agent.email'], context?.generatedByUserEmail, context?.agentEmail],
      required: false,
      conditional: true,
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

  const uniqueRoles = Array.from(new Set([...config.initialsRoles, ...config.conditionalInitialRoles, ...config.signatureRoles]))
  const signerSeeds = uniqueRoles
    .map((role) => resolveSignerSeed({ role, placeholders, context }))
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
    'Bridge Workspace'
  const logoLightUrl = normalizeNullableText(branding?.logoLightUrl) || normalizeNullableText(context?.organisationLogoUrl)
  const bridgeLabel = normalizeText(branding?.bridgeLogoLabel) || 'bridge.'

  merged['organisation.name'] = merged['organisation.name'] || organisationName
  merged['organisation.logo_light_url'] = merged['organisation.logo_light_url'] || logoLightUrl || 'bridge-fallback'
  merged['bridge.name'] = merged['bridge.name'] || bridgeLabel
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

function isMeaningfullyPresent(value) {
  return !(value === null || value === undefined || value === '')
}

function evaluateVisibilityPredicate(rule = {}, placeholders = {}) {
  const key = normalizeText(rule.key || rule.placeholder || rule.field)
  const operator = normalizeText(rule.operator || 'exists').toLowerCase()
  const expected = rule.value
  const current = key ? placeholders?.[key] : undefined
  const currentText = normalizeText(current).toLowerCase()

  if (!key) return true

  if (operator === 'exists') return isMeaningfullyPresent(current)
  if (operator === 'missing') return !isMeaningfullyPresent(current)
  if (operator === 'truthy') return Boolean(current)
  if (operator === 'falsy') return !current
  if (operator === 'eq' || operator === 'equals') return currentText === normalizeText(expected).toLowerCase()
  if (operator === 'ne' || operator === 'not_equals') return currentText !== normalizeText(expected).toLowerCase()
  if (operator === 'in') {
    const values = Array.isArray(expected) ? expected : [expected]
    return values.map((item) => normalizeText(item).toLowerCase()).includes(currentText)
  }
  if (operator === 'not_in') {
    const values = Array.isArray(expected) ? expected : [expected]
    return !values.map((item) => normalizeText(item).toLowerCase()).includes(currentText)
  }

  return true
}

function evaluateVisibilityRules(ruleSet = null, placeholders = {}) {
  if (!ruleSet) return true
  if (typeof ruleSet === 'boolean') return ruleSet
  if (Array.isArray(ruleSet)) {
    return ruleSet.every((item) => evaluateVisibilityRules(item, placeholders))
  }
  if (typeof ruleSet !== 'object') return true

  if (Array.isArray(ruleSet.all)) {
    return ruleSet.all.every((item) => evaluateVisibilityRules(item, placeholders))
  }
  if (Array.isArray(ruleSet.any)) {
    return ruleSet.any.some((item) => evaluateVisibilityRules(item, placeholders))
  }
  if (ruleSet.not !== undefined) {
    return !evaluateVisibilityRules(ruleSet.not, placeholders)
  }

  return evaluateVisibilityPredicate(ruleSet, placeholders)
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
  if (normalized === 'mandate') {
    return resolveMandatePacketPlaceholders({
      lead: context?.lead || null,
      mandateDraft: context?.mandateDraft || null,
    })
  }

  return resolveOtpPacketPlaceholders({
    transaction: context?.transaction || null,
    unit: context?.unit || null,
    buyer: context?.buyer || null,
    onboardingFormData: context?.onboardingFormData || null,
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
  }
}

export async function listPacketTemplates(options = {}) {
  return getPacketTemplates(options)
}

export async function fetchPacketTemplate(templateId, options = {}) {
  return getPacketTemplate(templateId, options)
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
} = {}) {
  const normalizedPacketType = normalizeText(packetType).toLowerCase() || 'otp'
  const packetBranding = await resolvePacketBranding({
    organisationId: context?.organisationId || context?.transaction?.organisation_id || null,
  }).catch(() => null)
  const placeholders = withSystemPlaceholders(
    resolvePacketTypeContext(normalizedPacketType, context),
    context,
    packetBranding,
  )
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
  const registryValidation = await validateDocumentPacketPlaceholders({
    packetType: normalizedPacketType,
    placeholderPayload: placeholders,
  }).catch(() => null)

  return {
    packetType: normalizedPacketType,
    placeholders,
    sectionManifest: ruleValidation.sectionManifest,
    critical: ruleValidation.critical,
    warnings: ruleValidation.warnings,
    missingPlaceholders: ruleValidation.missingPlaceholders,
    isValidForGeneration: ruleValidation.isValidForGeneration,
    registryValidation,
    branding: packetBranding,
  }
}

export async function renderPacketPreview({
  packetType,
  context = {},
  branding = null,
  title = '',
  template = null,
} = {}) {
  const validation = await validatePacket({
    packetType,
    context,
    template,
  })
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
} = {}) {
  const rendered = await renderPacketPreview({
    packetType,
    context,
    title: buildPacketTitle(packetType, context),
    template,
  })

  const packet = await createOrReusePacket({
    packetId,
    packetType: rendered.packetType,
    context,
    template,
  })

  const updated = await updatePacket(packet.id, {
    status: 'draft',
    sourceContextJson: {
      ...(packet?.source_context_json || {}),
      previewPreparedAt: new Date().toISOString(),
      packetType: rendered.packetType,
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
    context,
    template,
  })

  const { packet, validation } = prepared
  if (!validation.isValidForGeneration && !forceGenerate) {
    const error = createPacketError(
      'VALIDATION_BLOCKED',
      'Critical packet data is missing. Fix validation issues before generation.',
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

  let artifact = {
    renderedDocumentId: null,
    renderedFilePath: null,
    renderedFileName: null,
    renderedFileUrl: null,
  }

  try {
    if (validation.packetType === 'otp') {
      const otpResult = await generateOtpDocumentFromTemplate({
        transactionId: context?.transaction?.id || context?.transactionId,
        specialConditions: context?.specialConditions || '',
        generatedByRole: context?.generatedByRole || '',
        generatedByUserId: context?.generatedByUserId || '',
        clientVisible: false,
      })
      artifact = extractGeneratedArtifact(otpResult)
      assertGenerationOutput(artifact, 'otp')
    } else if (validation.packetType === 'mandate') {
      const templateConfig = resolveTemplateConfig(template)
      const mandateResult = await generateMandateDocumentFromTemplate({
        packetId: packet.id,
        transactionId: context?.transaction?.id || context?.transactionId || null,
        leadId: context?.lead?.lead_id || context?.lead?.id || context?.leadId || null,
        templatePath: templateConfig.templatePath,
        templateBucket: templateConfig.templateBucket,
        templateFilename: templateConfig.templateFilename,
        outputBucket: templateConfig.outputBucket,
        placeholders: validation.placeholders || {},
        sectionManifest: validation.sectionManifest || [],
        generatedByRole: context?.generatedByRole || 'agent',
        generatedByUserId: context?.generatedByUserId || '',
        clientVisible: false,
      })
      artifact = extractGeneratedArtifact(mandateResult)
      assertGenerationOutput(artifact, 'mandate')
    }
  } catch (rawError) {
    const failureCode = inferGenerationFailureCode(rawError)
    const failureMessage = toFriendlyGenerationMessage(
      failureCode,
      normalizeText(rawError?.message || String(rawError)),
    )

    const failedVersion = await createDocumentPacketVersion({
      packetId: packet.id,
      renderStatus: 'failed',
      renderedDocumentId: artifact.renderedDocumentId,
      renderedFilePath: artifact.renderedFilePath,
      renderedFileName: artifact.renderedFileName,
      renderedFileUrl: artifact.renderedFileUrl,
      placeholdersResolvedJson: validation.placeholders,
      placeholdersMissingJson: validation.missingPlaceholders,
      sectionManifestJson: validation.sectionManifest,
      validationSummaryJson: {
        ...buildValidationSummary(validation),
        generationStatus: 'failed',
        failureCode,
        failureMessage,
      },
      generatedBy: context?.generatedByUserId || null,
      generatedAt: new Date().toISOString(),
    })

    await addPacketEvent({
      packetId: packet.id,
      organisationId: packet.organisation_id,
      versionId: failedVersion.id,
      eventType: 'generation_failed',
      eventPayload: {
        packetType: validation.packetType,
        failureCode,
        failureMessage,
      },
    })

    await updatePacket(packet.id, {
      status: 'draft',
      sourceContextJson: {
        ...(packet?.source_context_json || {}),
        lastFailureCode: failureCode,
        lastFailureMessage: failureMessage,
        lastFailureVersion: failedVersion.version_number,
      },
    })

    const error = createPacketError(failureCode, failureMessage, {
      failedVersionId: failedVersion.id,
      failedVersionNumber: failedVersion.version_number,
    })
    error.validation = validation
    throw error
  }

  const version = await createDocumentPacketVersion({
    packetId: packet.id,
    renderStatus: 'generated',
    renderedDocumentId: artifact.renderedDocumentId,
    renderedFilePath: artifact.renderedFilePath,
    renderedFileName: artifact.renderedFileName,
    renderedFileUrl: artifact.renderedFileUrl,
    placeholdersResolvedJson: validation.placeholders,
    placeholdersMissingJson: validation.missingPlaceholders,
    sectionManifestJson: validation.sectionManifest,
    validationSummaryJson: buildValidationSummary(validation),
    generatedBy: context?.generatedByUserId || null,
    generatedAt: new Date().toISOString(),
  })

  const updatedPacket = await updatePacket(packet.id, {
    status: 'generated',
    sourceContextJson: {
      ...(packet?.source_context_json || {}),
      lastGeneratedVersion: version.version_number,
    },
    brandingSnapshotJson: validation.branding || {},
  })

  await addPacketEvent({
    packetId: packet.id,
    organisationId: packet.organisation_id,
    versionId: version.id,
    eventType: version.version_number > 1 ? 'packet_regenerated' : 'version_generated',
    eventPayload: {
      versionNumber: version.version_number,
      renderStatus: version.render_status,
      renderedDocumentId: version.rendered_document_id,
      renderedFilePath: version.rendered_file_path,
    },
  })

  return {
    packet: updatedPacket,
    version,
    validation,
    previewHtml: prepared.previewHtml,
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

  const targetVersion = getLatestGeneratedVersion(packet.versions || [])
  if (!targetVersion?.id) {
    throw createPacketError('NO_GENERATED_VERSION', 'Generate a packet version before preparing signing fields.')
  }

  const currentSummary = await getPacketSigningSummaryRecord({
    packetId: resolvedPacketId,
    packetVersionId: targetVersion.id,
    organisationId,
  })

  if (currentSummary.fieldCount > 0 || currentSummary.signerCount > 0) {
    return {
      alreadyPrepared: true,
      packet,
      version: targetVersion,
      summary: currentSummary,
      seed: null,
    }
  }

  const seed = buildDefaultSigningSeeds({
    packetType: normalizeText(packetType) || normalizeText(packet?.packet_type),
    placeholders: placeholders && typeof placeholders === 'object' ? placeholders : {},
    context,
    versionNumber: targetVersion.version_number,
  })

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

  await updatePacket(packet.id, { status: 'generated' })
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
} = {}) {
  return generatePacketSigningLinksRecord({
    packetId,
    packetVersionId,
    expiresInHours,
    baseUrl,
    organisationId,
    regenerate,
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

  const incompleteSigners = (signingSummary.signers || []).filter(
    (signer) => String(signer?.status || '').toLowerCase() !== 'signed',
  )
  if (incompleteSigners.length) {
    throw createPacketError('SIGNERS_INCOMPLETE', 'All required signers must complete signing before finalisation.')
  }

  const requiredFields = (signingSummary.fields || []).filter((field) => field?.required)
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

  const result = await generateFinalSignedDocumentRecord({
    packetId: resolvedPacketId,
    packetVersionId: targetVersion.id,
    organisationId,
    outputBucket,
  })

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
