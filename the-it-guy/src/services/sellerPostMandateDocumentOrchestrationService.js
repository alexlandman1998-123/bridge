import {
  buildSellerRequirementProfile,
  getRequiredSellerDocuments,
} from '../lib/privateListingRequirementEngine.js'
import { buildSellerDocumentRequestPlan, issueSellerDocumentRequests } from './sellerDocumentRequestOrchestrationService.js'
import {
  SELLER_POST_MANDATE_DOCUMENT_REASON,
  SELLER_POST_MANDATE_DOCUMENT_WORKFLOW,
  evaluateSellerPostMandateDocumentWorkflow,
  resolveSellerPostMandatePortalToken,
} from './sellerPostMandateDocumentContract.js'

export const SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_VERSION = 'seller_post_mandate_document_orchestration_v1'

export const SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_STATUS = Object.freeze({
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
  FAILED: 'failed',
})

export const SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_REASON = Object.freeze({
  COMPLETED: 'completed',
  ALREADY_COMPLETED: 'already_completed',
  EMAIL_DISABLED: 'email_disabled',
})

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function firstText(...values) {
  return values.map(normalizeText).find(Boolean) || ''
}

function getObject(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {}
}

function toArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      const next = value[key]
      if (next === undefined || typeof next === 'function') return acc
      acc[key] = stableValue(next)
      return acc
    }, {})
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value))
}

function compactHash(value = '') {
  const input = normalizeText(value)
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function buildSellerPortalLink(token = '', baseUrl = '') {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) return ''
  const origin =
    normalizeText(baseUrl) ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://app.arch9.co.za')
  return `${origin}/client/${normalizedToken}/selling`
}

function resolveListing(context = {}) {
  return getObject(context.listing)
}

function resolveOnboarding(context = {}) {
  const listing = resolveListing(context)
  return getObject(
    context.onboarding,
    context.sellerOnboarding,
    listing.sellerOnboarding,
    listing.seller_onboarding,
  )
}

function resolveFormData(context = {}) {
  const onboarding = resolveOnboarding(context)
  return getObject(
    context.formData,
    context.sellerOnboardingFormData,
    onboarding.formData,
    onboarding.form_data,
  )
}

function resolveOrganisationId(context = {}, evaluation = {}) {
  const listing = resolveListing(context)
  return firstText(
    context.organisationId,
    context.organisation_id,
    listing.organisationId,
    listing.organisation_id,
    evaluation.organisationId,
  )
}

function resolveLeadId(context = {}) {
  const listing = resolveListing(context)
  return firstText(
    context.leadId,
    context.lead_id,
    listing.sellerLeadId,
    listing.seller_lead_id,
    listing.originatingCrmLeadId,
    listing.originating_crm_lead_id,
  )
}

function resolvePropertyTitle(listing = {}) {
  return firstText(
    listing.propertyAddress,
    listing.address,
    listing.addressLine1,
    listing.address_line_1,
    listing.title,
    listing.listingTitle,
    listing.listing_title,
    'your property',
  )
}

function resolveSellerName(context = {}) {
  const listing = resolveListing(context)
  const formData = resolveFormData(context)
  const seller = getObject(context.seller, listing.seller, listing.seller_contact)
  const fullName = firstText(
    formData.sellerName,
    formData.seller_name,
    formData.fullName,
    formData.full_name,
    seller.name,
    listing.sellerName,
    listing.seller_name,
  )
  if (fullName) return fullName
  const firstName = firstText(formData.sellerFirstName, formData.seller_first_name, formData.firstName, formData.first_name)
  const surname = firstText(formData.sellerSurname, formData.seller_surname, formData.surname, formData.lastName, formData.last_name)
  return firstText([firstName, surname].filter(Boolean).join(' '), 'Seller')
}

function normalizeDocumentForPayload(document = {}) {
  return {
    id: firstText(document.requirementId, document.requirement_id, document.id),
    key: normalizeKey(firstText(document.requirementKey, document.requirement_key, document.key, document.name)),
    name: firstText(document.name, document.requirementName, document.requirement_name, document.label, document.key),
    description: firstText(document.description, document.requirementDescription, document.requirement_description),
    priority: normalizeKey(firstText(document.priority, document.requestPriority, document.request_priority, 'required')),
    dueDate: firstText(document.dueDate, document.due_date, document.requestDueDate, document.request_due_date),
    isReplacement: Boolean(document.isReplacement),
  }
}

function requirementKey(requirement = {}) {
  return normalizeKey(firstText(
    requirement.requirementKey,
    requirement.requirement_key,
    requirement.documentKey,
    requirement.document_key,
    requirement.key,
    requirement.name,
    requirement.label,
  ))
}

function mergeDerivedRequirementWithPersisted(derived = {}, persisted = null) {
  if (!persisted) return derived
  return {
    ...derived,
    ...persisted,
    requirement_key: derived.requirement_key || derived.requirementKey || persisted.requirement_key || persisted.requirementKey,
    requirementKey: derived.requirementKey || derived.requirement_key || persisted.requirementKey || persisted.requirement_key,
    requirement_name: derived.requirement_name || derived.requirementName || persisted.requirement_name || persisted.requirementName,
    requirementName: derived.requirementName || derived.requirement_name || persisted.requirementName || persisted.requirement_name,
    requirement_description: derived.requirement_description || derived.requirementDescription || persisted.requirement_description || persisted.requirementDescription,
    requirementDescription: derived.requirementDescription || derived.requirement_description || persisted.requirementDescription || persisted.requirement_description,
    requirement_group: derived.requirement_group || derived.group || persisted.requirement_group || persisted.group,
    document_visibility: derived.document_visibility || derived.visibility || persisted.document_visibility || persisted.visibility,
    visibility: derived.visibility || derived.document_visibility || persisted.visibility || persisted.document_visibility,
    is_required: derived.is_required !== false,
    required: derived.required !== false,
    generated_from: {
      ...(derived.generated_from && typeof derived.generated_from === 'object' ? derived.generated_from : {}),
      ...(persisted.generated_from && typeof persisted.generated_from === 'object' ? persisted.generated_from : {}),
      sellerStructurePack: true,
    },
  }
}

function structureLabel(profile = {}) {
  const sellerType = normalizeKey(profile.sellerType || profile.sellerBranch)
  const labels = {
    company: 'Company seller',
    trust: 'Trust seller',
    deceased_estate: 'Deceased estate seller',
    multiple_individuals: 'Multiple individual sellers',
    multiple_owners: 'Multiple individual sellers',
    power_of_attorney: 'Power of attorney seller',
    married: 'Individual seller',
    individual: 'Individual seller',
  }
  const base = labels[sellerType] || 'Seller'
  const marital = normalizeKey(profile.maritalRegime)
  if (sellerType === 'individual' || sellerType === 'married') {
    if (marital === 'married_in_community' || marital === 'in_community') return `${base} - married in community of property`
    if (marital === 'antenuptial_contract' || marital === 'married_out_of_community' || marital === 'out_of_community') return `${base} - married out of community of property`
    if (marital === 'foreign_marriage') return `${base} - foreign marriage`
  }
  return base
}

function coercePostMandateRequirementListing(listing = {}, formData = {}) {
  const onboarding = getObject(listing.sellerOnboarding, listing.seller_onboarding)
  const status = firstText(
    listing.listingStatus,
    listing.listing_status,
    listing.status,
    listing.lifecycleStatus,
    listing.lifecycle_status,
    'onboarding_completed',
  )
  const normalizedStatus = normalizeKey(status)
  const lifecycleStatus = normalizedStatus && normalizedStatus !== 'seller_lead' ? status : 'onboarding_completed'
  return {
    ...listing,
    listingStatus: lifecycleStatus,
    listing_status: lifecycleStatus,
    status: lifecycleStatus,
    lifecycleStatus,
    lifecycle_status: lifecycleStatus,
    sellerOnboarding: {
      ...onboarding,
      status: firstText(onboarding.status, onboarding.onboarding_status, 'completed'),
      formData,
      form_data: formData,
    },
  }
}

export function resolveSellerPostMandateStructureRequirementPack(context = {}) {
  const listing = resolveListing(context)
  const formData = resolveFormData(context)
  const persisted = toArray(
    context.requirements ||
      context.documentRequirements ||
      context.requiredDocuments ||
      listing.documentRequirements ||
      listing.document_requirements,
  )
  let profile = null
  let derived = []
  try {
    profile = buildSellerRequirementProfile(formData, coercePostMandateRequirementListing(listing, formData))
    derived = getRequiredSellerDocuments(profile)
  } catch (error) {
    console.warn('[seller-post-mandate-documents] seller structure requirement derivation failed', error)
  }

  const persistedByKey = new Map(persisted.map((requirement) => [requirementKey(requirement), requirement]).filter(([key]) => Boolean(key)))
  const derivedRequirements = toArray(derived)
    .filter((requirement) => requirementKey(requirement))
    .map((requirement) => mergeDerivedRequirementWithPersisted(requirement, persistedByKey.get(requirementKey(requirement)) || null))
  const requirements = derivedRequirements.length ? derivedRequirements : persisted
  const source = derivedRequirements.length ? 'seller_onboarding_structure' : 'persisted_requirements'
  const sellerStructure = profile
    ? {
      sellerType: profile.sellerType || '',
      sellerBranch: profile.sellerBranch || '',
      ownershipType: profile.ownershipType || '',
      maritalRegime: profile.maritalRegime || '',
      propertyBranch: profile.propertyBranch || '',
      propertyStructureType: profile.propertyStructureType || '',
      documentTriggers: toArray(profile.documentTriggers),
      label: structureLabel(profile),
    }
    : null

  return {
    source,
    sellerStructure,
    profile,
    requirements,
    derivedRequirementCount: derivedRequirements.length,
    persistedRequirementCount: persisted.length,
    requirementKeys: requirements.map(requirementKey).filter(Boolean),
  }
}

export function buildSellerPostMandateDocumentOrchestrationDedupeKey({
  listingId = '',
  mandatePacketId = '',
} = {}) {
  const listingPart = normalizeText(listingId)
  if (!listingPart) return ''
  return [
    SELLER_POST_MANDATE_DOCUMENT_WORKFLOW.key,
    listingPart,
    normalizeText(mandatePacketId) || 'no_mandate_packet',
    'v1',
  ].join(':')
}

export function buildSellerPostMandateDocumentPackFingerprint({
  sellerStructure = null,
  outstandingDocuments = [],
  documentPackSource = '',
} = {}) {
  const documentKeys = toArray(outstandingDocuments)
    .map((document) => normalizeKey(firstText(document.requirementKey, document.requirement_key, document.key, document.name)))
    .filter(Boolean)
    .sort()
  const structure = sellerStructure && typeof sellerStructure === 'object'
    ? {
      sellerType: sellerStructure.sellerType || sellerStructure.seller_type || '',
      sellerBranch: sellerStructure.sellerBranch || sellerStructure.seller_branch || '',
      ownershipType: sellerStructure.ownershipType || sellerStructure.ownership_type || '',
      maritalRegime: sellerStructure.maritalRegime || sellerStructure.marital_regime || '',
      propertyBranch: sellerStructure.propertyBranch || sellerStructure.property_branch || '',
      propertyStructureType: sellerStructure.propertyStructureType || sellerStructure.property_structure_type || '',
      documentTriggers: toArray(sellerStructure.documentTriggers || sellerStructure.document_triggers).map(normalizeKey).sort(),
    }
    : {}
  return compactHash(stableStringify({
    version: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_VERSION,
    source: normalizeKey(documentPackSource),
    sellerStructure: structure,
    documentKeys,
  }))
}

export function buildSellerPostMandateDocumentWorkflowRunDedupeKey({
  listingId = '',
  mandatePacketId = '',
  documentPackFingerprint = '',
} = {}) {
  const base = buildSellerPostMandateDocumentOrchestrationDedupeKey({ listingId, mandatePacketId })
  const fingerprint = normalizeText(documentPackFingerprint)
  return base && fingerprint ? `${base}:${fingerprint}` : base
}

export function resolveSellerPostMandateDocumentRequirements(context = {}, evaluation = null) {
  const evaluated = evaluation || evaluateSellerPostMandateDocumentWorkflow(context)
  return toArray(evaluated.outstandingDocuments).map((item) => item.raw || item)
}

export function buildSellerPostMandateDocumentEmailPayload({
  context = {},
  evaluation = null,
  portalLink = '',
  requiredDocuments = null,
} = {}) {
  const evaluated = evaluation || evaluateSellerPostMandateDocumentWorkflow(context)
  const listing = resolveListing(context)
  const normalizedPortalLink = normalizeText(portalLink)
  if (!evaluated.sellerEmail || !normalizedPortalLink) return null

  const outstandingDocuments = toArray(requiredDocuments || evaluated.outstandingDocuments).map(normalizeDocumentForPayload)
  const pack = context.structureRequirementPack && typeof context.structureRequirementPack === 'object'
    ? context.structureRequirementPack
    : resolveSellerPostMandateStructureRequirementPack(context)
  const documentPackFingerprint = buildSellerPostMandateDocumentPackFingerprint({
    sellerStructure: pack.sellerStructure,
    outstandingDocuments,
    documentPackSource: pack.source,
  })

  return {
    type: SELLER_POST_MANDATE_DOCUMENT_WORKFLOW.emailType,
    emailKind: SELLER_POST_MANDATE_DOCUMENT_WORKFLOW.emailKind,
    communicationType: SELLER_POST_MANDATE_DOCUMENT_WORKFLOW.communicationType,
    to: evaluated.sellerEmail,
    organisationId: resolveOrganisationId(context, evaluated),
    leadId: resolveLeadId(context),
    listingId: evaluated.listingId,
    mandatePacketId: evaluated.mandatePacketId || null,
    sellerName: resolveSellerName(context),
    propertyTitle: resolvePropertyTitle(listing),
    propertyType: firstText(listing.propertyType, listing.property_type),
    onboardingLink: normalizedPortalLink,
    portalLink: normalizedPortalLink,
    transactionReference: firstText(listing.listingReference, listing.listing_reference),
    agentName: firstText(listing.assignedAgentName, listing.assignedAgent, listing.agentName, listing.agent_name, 'Your agent'),
    organisationName: firstText(listing.agencyOrganisation, listing.organisationName, listing.organisation_name, listing.agencyName, 'Arch9'),
    supportEmail: firstText(listing.assignedAgentEmail, listing.agentEmail, listing.agent_email),
    requiredDocuments: outstandingDocuments,
    outstandingDocumentCount: outstandingDocuments.length,
    sellerStructure: pack.sellerStructure || null,
    documentPackSource: pack.source || 'persisted_requirements',
    documentPackRequirementKeys: toArray(pack.requirementKeys),
    documentPackFingerprint,
    workflowDedupeKey: buildSellerPostMandateDocumentWorkflowRunDedupeKey({
      listingId: evaluated.listingId,
      mandatePacketId: evaluated.mandatePacketId,
      documentPackFingerprint,
    }),
    orchestrationVersion: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_VERSION,
  }
}

export function buildSellerPostMandatePortalNotificationPayload({
  context = {},
  evaluation = null,
  dedupeKey = '',
  documentPackFingerprint = '',
} = {}) {
  const evaluated = evaluation || evaluateSellerPostMandateDocumentWorkflow(context)
  if (!evaluated.portalToken) return null
  const count = Number(evaluated.outstandingDocumentCount || 0)
  const suffix = count === 1 ? '1 document is ready for upload.' : `${count} documents are ready for upload.`
  return {
    token: evaluated.portalToken,
    clientRole: 'seller',
    notificationType: 'document_requested',
    title: 'Seller documents required',
    description: suffix,
    priority: 'high',
    status: 'unread',
    relatedEntityType: 'private_listing',
    relatedEntityId: evaluated.listingId,
    actionLabel: 'Upload Documents',
    actionRoute: 'documents',
    visibility: 'client_visible',
    dedupeKey: buildSellerPostMandateDocumentWorkflowRunDedupeKey({
      listingId: evaluated.listingId,
      mandatePacketId: evaluated.mandatePacketId,
      documentPackFingerprint,
    }) || normalizeText(dedupeKey) || buildSellerPostMandateDocumentOrchestrationDedupeKey(evaluated),
    metadata: {
      source: SELLER_POST_MANDATE_DOCUMENT_WORKFLOW.key,
      workflowVersion: SELLER_POST_MANDATE_DOCUMENT_WORKFLOW.version,
      orchestrationVersion: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_VERSION,
      mandatePacketId: evaluated.mandatePacketId || null,
      outstandingDocumentCount: count,
      outstandingDocumentKeys: toArray(evaluated.outstandingDocuments).map((item) => item.requirementKey).filter(Boolean),
      documentPackFingerprint: normalizeText(documentPackFingerprint) || null,
    },
  }
}

export function buildSellerPostMandateDocumentOrchestrationPlan(context = {}, {
  now = new Date(),
  dueBusinessDays = 5,
  reason = 'mandate_signed',
  baseUrl = '',
} = {}) {
  const structureRequirementPack = resolveSellerPostMandateStructureRequirementPack(context)
  const structureContext = {
    ...context,
    requirements: structureRequirementPack.requirements,
    documentRequirements: structureRequirementPack.requirements,
    structureRequirementPack,
  }
  const evaluation = evaluateSellerPostMandateDocumentWorkflow(structureContext)
  const dedupeKey = buildSellerPostMandateDocumentOrchestrationDedupeKey(evaluation)
  const requestRequirements = resolveSellerPostMandateDocumentRequirements(structureContext, evaluation)
  const documentPackFingerprint = buildSellerPostMandateDocumentPackFingerprint({
    sellerStructure: structureRequirementPack.sellerStructure,
    outstandingDocuments: evaluation.outstandingDocuments,
    documentPackSource: structureRequirementPack.source,
  })
  const workflowRunDedupeKey = buildSellerPostMandateDocumentWorkflowRunDedupeKey({
    listingId: evaluation.listingId,
    mandatePacketId: evaluation.mandatePacketId,
    documentPackFingerprint,
  })
  const documents = toArray(context.documents || context.uploadedDocuments || resolveListing(context).documents)
  const listing = {
    ...resolveListing(context),
    id: evaluation.listingId || resolveListing(context).id,
    sellerContactEmail: evaluation.sellerEmail,
  }
  const requestPlan = evaluation.ready
    ? buildSellerDocumentRequestPlan({
      listing,
      requirements: requestRequirements,
      documents,
      now,
      dueBusinessDays,
      reason,
    })
    : null
  const portalLink = evaluation.portalToken ? buildSellerPortalLink(evaluation.portalToken, baseUrl) : ''
  const emailPayload = evaluation.ready && portalLink
    ? buildSellerPostMandateDocumentEmailPayload({ context: structureContext, evaluation, portalLink })
    : null
  const notificationPayload = evaluation.ready && evaluation.portalToken
    ? buildSellerPostMandatePortalNotificationPayload({
      context: structureContext,
      evaluation,
      dedupeKey,
      documentPackFingerprint,
    })
    : null

  return {
    ok: true,
    ready: evaluation.ready,
    status: evaluation.ready
      ? SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_STATUS.COMPLETED
      : SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_STATUS.SKIPPED,
    reason: evaluation.ready ? SELLER_POST_MANDATE_DOCUMENT_REASON.READY : evaluation.reason,
    workflow: SELLER_POST_MANDATE_DOCUMENT_WORKFLOW,
    orchestrationVersion: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_VERSION,
    dedupeKey,
    workflowRunDedupeKey,
    documentPackFingerprint,
    evaluation,
    structureRequirementPack,
    listing,
    documents,
    requestRequirements,
    requestPlan,
    portalLink,
    emailPayload,
    notificationPayload,
  }
}

export function buildSellerPostMandateDocumentAuditSummary(plan = {}, {
  status = '',
  reason = '',
  requestIssuance = null,
  emailResult = null,
  notification = null,
  invitation = null,
  portalToken = '',
  portalLink = '',
} = {}) {
  const evaluation = plan.evaluation || {}
  const pack = plan.structureRequirementPack || {}
  const sellerStructure = pack.sellerStructure || plan.emailPayload?.sellerStructure || null
  const outstandingDocuments = toArray(evaluation.outstandingDocuments)
  const requestRequirements = toArray(plan.requestRequirements)
  const documentKeys = (outstandingDocuments.length ? outstandingDocuments : requestRequirements)
    .map((document) => normalizeKey(firstText(document.requirementKey, document.requirement_key, document.key, document.name)))
    .filter(Boolean)
    .sort()

  return {
    workflowKey: SELLER_POST_MANDATE_DOCUMENT_WORKFLOW.key,
    workflowVersion: SELLER_POST_MANDATE_DOCUMENT_WORKFLOW.version,
    orchestrationVersion: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_VERSION,
    status: normalizeKey(status || plan.status),
    reason: normalizeKey(reason || plan.reason),
    listingId: evaluation.listingId || plan.listing?.id || '',
    mandatePacketId: evaluation.mandatePacketId || '',
    dedupeKey: plan.dedupeKey || '',
    workflowRunDedupeKey: plan.workflowRunDedupeKey || '',
    documentPackFingerprint: plan.documentPackFingerprint || '',
    documentPackSource: pack.source || plan.emailPayload?.documentPackSource || '',
    documentPackRequirementKeys: toArray(pack.requirementKeys || plan.emailPayload?.documentPackRequirementKeys).map(normalizeKey).filter(Boolean),
    outstandingDocumentKeys: documentKeys,
    outstandingDocumentCount: documentKeys.length,
    sellerStructure: sellerStructure
      ? {
        sellerType: sellerStructure.sellerType || sellerStructure.seller_type || '',
        sellerBranch: sellerStructure.sellerBranch || sellerStructure.seller_branch || '',
        ownershipType: sellerStructure.ownershipType || sellerStructure.ownership_type || '',
        maritalRegime: sellerStructure.maritalRegime || sellerStructure.marital_regime || '',
        label: sellerStructure.label || '',
      }
      : null,
    derivedRequirementCount: Number(pack.derivedRequirementCount || 0),
    persistedRequirementCount: Number(pack.persistedRequirementCount || 0),
    requestCounts: requestIssuance?.counts || null,
    emailDeliveryId: normalizeText(emailResult?.deliveryId) || null,
    canonicalInviteId: normalizeText(emailResult?.canonicalInviteId) || null,
    inviteExpiresAt: normalizeText(invitation?.inviteExpiresAt || invitation?.invite_expires_at) || null,
    notificationCreated: Boolean(notification),
    portalTokenPresent: Boolean(normalizeText(portalToken || evaluation.portalToken)),
    portalLinkPresent: Boolean(normalizeText(portalLink || plan.portalLink)),
  }
}

async function defaultIssueRequests({ client, plan, now, dueBusinessDays, reason }) {
  return issueSellerDocumentRequests({
    client,
    listing: plan.listing,
    requirements: plan.requestRequirements,
    documents: toArray(plan?.documents || plan?.context?.documents || plan?.listing?.documents),
    now,
    dueBusinessDays,
    reason,
  })
}

async function defaultSendEmail({ client, emailPayload }) {
  if (!emailPayload) return { skipped: true, reason: 'email_payload_missing' }
  if (!client?.functions?.invoke) throw new Error('A Supabase client with functions.invoke is required to send seller portal email.')
  const { data, error } = await client.functions.invoke('send-email', { body: emailPayload })
  if (error || data?.error) throw new Error(error?.message || data?.error || 'Seller portal document email could not be sent.')
  return data || { ok: true }
}

export async function orchestrateSellerPostMandateDocumentRequest({
  client = null,
  context = {},
  now = new Date(),
  dueBusinessDays = 5,
  reason = 'mandate_signed',
  baseUrl = '',
  skipEmail = false,
  hasAlreadyCompleted = null,
  issueRequests = defaultIssueRequests,
  ensurePortalContext = null,
  issuePortalInvite = null,
  sendEmail = defaultSendEmail,
  createNotification = null,
  recordEvent = null,
} = {}) {
  const plan = buildSellerPostMandateDocumentOrchestrationPlan(context, { now, dueBusinessDays, reason, baseUrl })

  const record = async (eventType, payload = {}) => {
    if (!recordEvent) return null
    return recordEvent({
      client,
      eventType,
      plan,
      context,
      evaluation: plan.evaluation,
      payload,
    })
  }

  if (!plan.ready) {
    const auditSummary = buildSellerPostMandateDocumentAuditSummary(plan, {
      status: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_STATUS.SKIPPED,
      reason: plan.reason,
    })
    await record('seller_post_mandate_documents_skipped', {
      reason: plan.reason,
      dedupeKey: plan.dedupeKey,
      workflowRunDedupeKey: plan.workflowRunDedupeKey,
      documentPackFingerprint: plan.documentPackFingerprint,
      auditSummary,
    })
    return {
      ...plan,
      auditSummary,
      skipped: true,
      sent: false,
    }
  }

  if (hasAlreadyCompleted) {
    const alreadyCompleted = await hasAlreadyCompleted({
      client,
      context,
      plan,
      evaluation: plan.evaluation,
      dedupeKey: plan.dedupeKey,
      workflowRunDedupeKey: plan.workflowRunDedupeKey,
      documentPackFingerprint: plan.documentPackFingerprint,
    })
    if (alreadyCompleted) {
      const auditSummary = buildSellerPostMandateDocumentAuditSummary(plan, {
        status: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_STATUS.SKIPPED,
        reason: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_REASON.ALREADY_COMPLETED,
      })
      await record('seller_post_mandate_documents_skipped', {
        reason: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_REASON.ALREADY_COMPLETED,
        dedupeKey: plan.dedupeKey,
        workflowRunDedupeKey: plan.workflowRunDedupeKey,
        documentPackFingerprint: plan.documentPackFingerprint,
        auditSummary,
      })
      return {
        ...plan,
        auditSummary,
        status: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_STATUS.SKIPPED,
        reason: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_REASON.ALREADY_COMPLETED,
        skipped: true,
        sent: false,
      }
    }
  }

  let portalToken = plan.evaluation.portalToken
  let portalContext = null
  if (ensurePortalContext) {
    portalContext = await ensurePortalContext({
      client,
      context,
      plan,
      evaluation: plan.evaluation,
      portalToken,
    })
    portalToken = firstText(
      portalContext?.sellerWorkspaceToken,
      portalContext?.seller_workspace_token,
      portalContext?.portalToken,
      portalContext?.token,
      portalToken,
      resolveSellerPostMandatePortalToken({ ...context, portalContext }),
    )
  }

  const requestIssuance = await issueRequests({
    client,
    context,
    plan: {
      ...plan,
      context,
    },
    evaluation: plan.evaluation,
    now,
    dueBusinessDays,
    reason,
  })

  let portalLink = portalToken ? buildSellerPortalLink(portalToken, baseUrl) : plan.portalLink
  let invitation = null
  if (issuePortalInvite) {
    invitation = await issuePortalInvite({
      client,
      context,
      plan,
      evaluation: plan.evaluation,
      portalToken,
    })
    const stablePortalToken = firstText(invitation?.stablePortalToken, invitation?.stable_portal_token, portalToken)
    const inviteToken = firstText(invitation?.inviteToken, invitation?.invite_token, invitation?.token)
    portalLink = firstText(invitation?.portalLink, invitation?.portal_link, invitation?.invitationLink, invitation?.invitation_link) ||
      (stablePortalToken ? buildSellerPortalLink(stablePortalToken, baseUrl) : inviteToken ? buildSellerPortalLink(inviteToken, baseUrl) : portalLink)
  }

  const emailPayload = buildSellerPostMandateDocumentEmailPayload({
    context,
    evaluation: {
      ...plan.evaluation,
      portalToken,
    },
    portalLink,
  })

  if (!emailPayload || skipEmail) {
    const auditSummary = buildSellerPostMandateDocumentAuditSummary(plan, {
      status: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_STATUS.SKIPPED,
      reason: skipEmail ? SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_REASON.EMAIL_DISABLED : 'email_payload_missing',
      requestIssuance,
      portalToken,
      portalLink,
    })
    await record('seller_post_mandate_documents_skipped', {
      reason: skipEmail ? SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_REASON.EMAIL_DISABLED : 'email_payload_missing',
      dedupeKey: plan.dedupeKey,
      workflowRunDedupeKey: plan.workflowRunDedupeKey,
      documentPackFingerprint: plan.documentPackFingerprint,
      requestCounts: requestIssuance?.counts || null,
      auditSummary,
    })
    return {
      ...plan,
      auditSummary,
      portalToken,
      portalContext,
      portalLink,
      requestIssuance,
      emailPayload,
      status: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_STATUS.SKIPPED,
      reason: skipEmail ? SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_REASON.EMAIL_DISABLED : 'email_payload_missing',
      skipped: true,
      sent: false,
    }
  }

  const emailResult = await sendEmail({
    client,
    context,
    plan,
    evaluation: plan.evaluation,
    emailPayload,
    portalLink,
  })

  const notificationPayload = portalToken
    ? buildSellerPostMandatePortalNotificationPayload({
      context,
      evaluation: {
        ...plan.evaluation,
        portalToken,
      },
      dedupeKey: plan.dedupeKey,
      documentPackFingerprint: plan.documentPackFingerprint,
    })
    : null
  const notification = createNotification && notificationPayload
    ? await createNotification({
      client,
      context,
      plan,
      evaluation: plan.evaluation,
      notificationPayload,
    })
    : null

  const auditSummary = buildSellerPostMandateDocumentAuditSummary(plan, {
    status: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_STATUS.COMPLETED,
    reason: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_REASON.COMPLETED,
    requestIssuance,
    emailResult,
    notification,
    invitation,
    portalToken,
    portalLink,
  })
  await record('seller_post_mandate_documents_completed', {
    dedupeKey: plan.dedupeKey,
    workflowRunDedupeKey: plan.workflowRunDedupeKey,
    documentPackFingerprint: plan.documentPackFingerprint,
    orchestrationVersion: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_VERSION,
    requestCounts: requestIssuance?.counts || null,
    deliveryId: normalizeText(emailResult?.deliveryId) || null,
    canonicalInviteId: normalizeText(emailResult?.canonicalInviteId) || null,
    inviteExpiresAt: normalizeText(invitation?.inviteExpiresAt || invitation?.invite_expires_at) || null,
    stablePortalTokenPresent: Boolean(normalizeText(invitation?.stablePortalToken || invitation?.stable_portal_token)),
    notificationCreated: Boolean(notification),
    auditSummary,
  })

  return {
    ...plan,
    auditSummary,
    portalToken,
    portalContext,
    portalLink,
    invitation,
    requestIssuance,
    emailPayload,
    emailResult,
    notificationPayload,
    notification,
    status: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_STATUS.COMPLETED,
    reason: SELLER_POST_MANDATE_DOCUMENT_ORCHESTRATION_REASON.COMPLETED,
    sent: true,
    skipped: false,
  }
}
