import { AlertCircle, ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import LegalDocumentWorkspace from '../components/documents/LegalDocumentWorkspace'
import Button from '../components/ui/Button'
import { useWorkspace } from '../context/WorkspaceContext'
import { archivePacket, generatePacketVersion, listPacketTemplates } from '../core/documents/packetService'
import {
  buildPacketSectionManifest,
  renderPacketPreviewHtml,
  resolveMandatePacketPlaceholders,
} from '../core/documents/packetWorkflow'
import { templateIsUsableForGeneration } from '../core/documents/structuredTemplateRenderer'
import {
  mapSellerOnboardingToMandateData,
  validateMandateGenerationData,
} from '../core/documents/mandateDataMapper'
import { documentPacketBelongsToLead, resolveDocumentPacketStatus } from '../core/documents/packetStatusResolver'
import { OTP_DOCUMENT_TYPES } from '../core/transactions/salesWorkflow'
import { addLeadActivity, getAgencyPipelineSnapshot, listAgencyLeads, updateAgencyLead } from '../lib/agencyPipelineService'
import {
  createDocumentPacket,
  fetchDocumentPacket,
  listDocumentPackets,
  resolveDocumentPacketBranding,
} from '../lib/documentPacketsApi'
import { fetchTransactionById, updateOtpDocumentWorkflowState } from '../lib/api'
import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { fetchAgencyOnboardingSettings } from '../lib/settingsApi'
import { getSellerOnboardingByToken } from '../services/privateListingService'

function normalizeText(value) {
  return String(value || '').trim()
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function normalizeLeadUuid(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  if (isUuidLike(raw)) return raw
  const withoutPrefix = raw.replace(/^lead_/i, '')
  return isUuidLike(withoutPrefix) ? withoutPrefix : ''
}

function resolveModeFromQuery(mode = '') {
  const key = normalizeKey(mode)
  if (['generate', 'edit', 'send', 'signed', 'view'].includes(key)) return key
  if (key === 'view_signed') return 'signed'
  return 'view'
}

function resolveDocumentLabel(packetType = '') {
  return normalizeKey(packetType) === 'otp' ? 'Offer to Purchase' : 'Mandate Agreement'
}

function toFriendlyPageError(error = null) {
  const raw = normalizeText(error?.message || error)
  const message = raw.toLowerCase()
  if (message.includes('invalid input syntax for type uuid')) {
    return 'The transaction or packet reference in this link is invalid. Check the link and try again.'
  }
  if (message.includes('permission denied') || message.includes('row-level security')) {
    return 'You do not have permission to view this legal document workspace.'
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Bridge could not reach the legal document service. Please retry.'
  }
  return raw || 'Unable to load this legal document workspace.'
}

function resolveSafeReturnPath(value = '') {
  const text = normalizeText(value)
  if (!text || !text.startsWith('/')) return ''
  if (text.startsWith('//')) return ''
  return text
}

function resolveTransactionReference(detail = null, fallback = '') {
  const unit = detail?.unit || null
  const transaction = detail?.transaction || null
  const buyer = detail?.buyer || null
  return [
    unit?.unit_number ? `Unit ${unit.unit_number}` : '',
    unit?.development?.name || '',
    buyer?.name ? `Buyer: ${buyer.name}` : '',
    transaction?.stage || transaction?.current_main_stage || '',
  ].filter(Boolean).join(' · ') || fallback || 'Transaction document context'
}

function buildAgentFromProfile(profile = null) {
  return {
    id: normalizeText(profile?.id),
    fullName:
      normalizeText(profile?.fullName) ||
      [profile?.firstName, profile?.lastName].map(normalizeText).filter(Boolean).join(' ') ||
      'Bridge User',
    email: normalizeText(profile?.email).toLowerCase(),
    phone: normalizeText(profile?.phone || profile?.phoneNumber || profile?.mobile || profile?.cellphone),
    ffcNumber: normalizeText(profile?.ffcNumber || profile?.ppraNumber || profile?.fidelityFundCertificateNumber),
  }
}

function findLeadContext({ organisationId = '', leadId = '' } = {}) {
  const normalizedLeadId = normalizeText(leadId)
  const dbLeadId = normalizeLeadUuid(normalizedLeadId)
  if (!organisationId || !normalizedLeadId) {
    return { lead: null, contact: null, linkedTransaction: null }
  }

  const snapshot = getAgencyPipelineSnapshot(organisationId)
  const leads = Array.isArray(snapshot?.leads) ? snapshot.leads : []
  const lead = leads.find((item) => {
    const itemId = normalizeText(item?.leadId)
    return itemId === normalizedLeadId || normalizeLeadUuid(itemId) === dbLeadId
  }) || null
  if (!lead) return { lead: null, contact: null, linkedTransaction: null }

  const contacts = Array.isArray(snapshot?.contacts) ? snapshot.contacts : []
  const contact = contacts.find((item) => normalizeText(item?.contactId) === normalizeText(lead.contactId)) || null
  const deals = Array.isArray(snapshot?.deals) ? snapshot.deals : []
  const linkedTransaction =
    deals
      .filter((row) => normalizeText(row?.leadId) === normalizeText(lead.leadId))
      .sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0))[0] || null

  return { lead, contact, linkedTransaction }
}

function buildLooseLeadContextFromRoute({ organisationId = '', leadId = '' } = {}) {
  const normalizedLeadId = normalizeText(leadId)
  if (!normalizedLeadId) return { lead: null, contact: null, linkedTransaction: null }
  const lead = {
    leadId: normalizedLeadId,
    organisationId: normalizeText(organisationId) || null,
    leadCategory: 'Seller',
    stage: 'Mandate Draft',
    status: 'Mandate Draft',
    sellerPropertyAddress: '',
    areaInterest: '',
    propertyInterest: '',
  }
  return { lead, contact: null, linkedTransaction: null }
}

async function fetchLeadContextFromSupabase({ organisationId = '', leadId = '' } = {}) {
  if (!isSupabaseConfigured || !supabase) return { lead: null, contact: null, linkedTransaction: null }
  const scopedLeadId = normalizeLeadUuid(leadId)
  if (!scopedLeadId) return { lead: null, contact: null, linkedTransaction: null }

  let leadQuery = supabase
    .from('leads')
    .select('lead_id, organisation_id, assigned_agent_id, contact_id, lead_category, lead_direction, lead_source, stage, status, priority, budget, area_interest, property_interest, seller_property_address, estimated_value, notes, seller_onboarding_token, seller_onboarding_status, mandate_packet_id, listing_id, converted_transaction_id, created_at, updated_at')
    .eq('lead_id', scopedLeadId)

  if (isUuidLike(organisationId)) {
    leadQuery = leadQuery.eq('organisation_id', organisationId)
  }

  const leadResult = await leadQuery.maybeSingle()
  if (leadResult.error || !leadResult.data) {
    return { lead: null, contact: null, linkedTransaction: null }
  }

  const row = leadResult.data
  const contactId = normalizeText(row?.contact_id)
  const listingId = normalizeText(row?.listing_id)
  const [contactResult, onboardingResult, listingResult] = await Promise.all([
    contactId
      ? supabase
        .from('contacts')
        .select('contact_id, organisation_id, assigned_agent_id, first_name, last_name, phone, email, contact_type, notes, created_at, updated_at')
        .eq('contact_id', contactId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    listingId
      ? supabase
        .from('private_listing_seller_onboarding')
        .select('id, private_listing_id, token, status, submitted_at, updated_at, form_data')
        .eq('private_listing_id', listingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    listingId
      ? supabase
        .from('private_listings')
        .select('id, organisation_id, seller_lead_id, title, asking_price, estimated_value, address_line_1, address_line_2, suburb, city, province, postal_code, property_type, mandate_type, updated_at')
        .eq('id', listingId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const onboarding = onboardingResult?.data
    ? {
        ...(onboardingResult.data || {}),
        token: normalizeText(onboardingResult.data?.token),
        status: normalizeText(onboardingResult.data?.status),
        formData:
          onboardingResult.data?.form_data && typeof onboardingResult.data.form_data === 'object'
            ? onboardingResult.data.form_data
            : {},
      }
    : null

  const listing = listingResult?.data
    ? {
        id: normalizeText(listingResult.data.id),
        organisationId: normalizeText(listingResult.data.organisation_id),
        sellerLeadId: normalizeText(listingResult.data.seller_lead_id),
        listingTitle: normalizeText(listingResult.data.title),
        propertyAddress: [listingResult.data.address_line_1, listingResult.data.address_line_2].map(normalizeText).filter(Boolean).join(', '),
        addressLine1: normalizeText(listingResult.data.address_line_1),
        addressLine2: normalizeText(listingResult.data.address_line_2),
        suburb: normalizeText(listingResult.data.suburb),
        city: normalizeText(listingResult.data.city),
        province: normalizeText(listingResult.data.province),
        postalCode: normalizeText(listingResult.data.postal_code),
        propertyType: normalizeText(listingResult.data.property_type),
        mandateType: normalizeText(listingResult.data.mandate_type),
        askingPrice: Number(listingResult.data.asking_price || 0) || 0,
        estimatedValue: Number(listingResult.data.estimated_value || 0) || 0,
        sellerOnboardingStatus: normalizeText(onboarding?.status || row?.seller_onboarding_status),
        sellerOnboarding: onboarding ? { ...onboarding } : null,
      }
    : null

  const contact = contactResult?.data
    ? {
        contactId: normalizeText(contactResult.data.contact_id),
        organisationId: normalizeText(contactResult.data.organisation_id),
        assignedAgentId: normalizeText(contactResult.data.assigned_agent_id),
        firstName: normalizeText(contactResult.data.first_name),
        lastName: normalizeText(contactResult.data.last_name),
        phone: normalizeText(contactResult.data.phone),
        email: normalizeText(contactResult.data.email).toLowerCase(),
        contactType: normalizeText(contactResult.data.contact_type) || 'Lead',
        notes: normalizeText(contactResult.data.notes),
        createdAt: contactResult.data.created_at || null,
        updatedAt: contactResult.data.updated_at || null,
      }
    : null

  const lead = {
    leadId: normalizeText(row?.lead_id),
    organisationId: normalizeText(row?.organisation_id),
    assignedAgentId: normalizeText(row?.assigned_agent_id),
    assignedAgentName: '',
    assignedAgentEmail: '',
    contactId,
    leadCategory: normalizeText(row?.lead_category) || 'Buyer',
    leadDirection: normalizeText(row?.lead_direction) || 'Inbound',
    leadSource: normalizeText(row?.lead_source) || 'Other',
    stage: normalizeText(row?.stage) || 'New Lead',
    status: normalizeText(row?.status) || normalizeText(row?.stage) || 'New Lead',
    priority: normalizeText(row?.priority) || 'Medium',
    budget: Number(row?.budget || 0) || 0,
    areaInterest: normalizeText(row?.area_interest),
    propertyInterest: normalizeText(row?.property_interest),
    sellerPropertyAddress: normalizeText(row?.seller_property_address),
    estimatedValue: Number(row?.estimated_value || 0) || 0,
    notes: normalizeText(row?.notes),
    sellerOnboardingToken: normalizeText(row?.seller_onboarding_token || onboarding?.token),
    sellerOnboardingLink: '',
    sellerOnboardingStatus: normalizeText(row?.seller_onboarding_status || onboarding?.status),
    sellerWorkflowLeadId: normalizeText(listing?.sellerLeadId),
    mandatePacketId: normalizeText(row?.mandate_packet_id),
    listingId,
    sellerOnboarding: onboarding ? { ...onboarding } : null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    convertedDealId: normalizeText(row?.converted_transaction_id),
    convertedTransactionId: normalizeText(row?.converted_transaction_id),
  }

  return {
    lead,
    contact,
    linkedTransaction: normalizeText(row?.converted_transaction_id)
      ? { transactionId: normalizeText(row?.converted_transaction_id), dealId: normalizeText(row?.converted_transaction_id) }
      : null,
    privateListing: listing,
    listing,
  }
}

function findLeadContextAcrossStores({ organisationId = '', leadId = '' } = {}) {
  const direct = findLeadContext({ organisationId, leadId })
  if (direct.lead) return direct

  if (typeof window === 'undefined' || !leadId) return direct
  try {
    const normalizedLeadId = normalizeText(leadId)
    const dbLeadId = normalizeLeadUuid(normalizedLeadId)
    const candidateOrgIds = new Set([normalizeText(organisationId), 'default'].filter(Boolean))
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      const match = String(key || '').match(/^itg:agency-crm:v1:(.+)$/)
      if (match?.[1]) candidateOrgIds.add(match[1])
    }

    for (const candidateOrgId of candidateOrgIds) {
      const rows = listAgencyLeads(candidateOrgId, { includeAll: true })
      const lead = rows.find((item) => {
        const itemId = normalizeText(item?.leadId)
        return itemId === normalizedLeadId || (dbLeadId && normalizeLeadUuid(itemId) === dbLeadId)
      })
      if (!lead) continue
      const snapshot = getAgencyPipelineSnapshot(candidateOrgId)
      const contact =
        (Array.isArray(snapshot.contacts) ? snapshot.contacts : [])
          .find((item) => normalizeText(item?.contactId) === normalizeText(lead.contactId)) || null
      const linkedTransaction =
        (Array.isArray(snapshot.deals) ? snapshot.deals : [])
          .filter((row) => normalizeText(row?.leadId) === normalizeText(lead.leadId))
          .sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0))[0] || null
      return { lead, contact, linkedTransaction }
    }
  } catch {
    // Fall through to a loose route context so the workspace remains manually editable.
  }

  return buildLooseLeadContextFromRoute({ organisationId, leadId })
}

async function hydrateLeadContextWithSellerOnboarding(leadContext = {}) {
  const localOnboarding = leadContext?.lead?.sellerOnboarding || null
  if (
    localOnboarding?.formData &&
    typeof localOnboarding.formData === 'object' &&
    Object.keys(localOnboarding.formData).length
  ) {
    return leadContext
  }
  const token = normalizeText(leadContext?.lead?.sellerOnboardingToken || leadContext?.lead?.sellerOnboarding?.token)
  if (!token) {
    const listingId = normalizeText(leadContext?.lead?.listingId || leadContext?.privateListing?.id || leadContext?.listing?.id)
    if (!listingId || !isSupabaseConfigured || !supabase) return leadContext
    try {
      const onboardingQuery = await supabase
        .from('private_listing_seller_onboarding')
        .select('id, private_listing_id, token, status, submitted_at, updated_at, form_data')
        .eq('private_listing_id', listingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const onboarding = onboardingQuery?.data
      if (!onboarding) return leadContext
      return {
        ...leadContext,
        lead: {
          ...(leadContext.lead || {}),
          sellerOnboardingToken: normalizeText(onboarding?.token || leadContext?.lead?.sellerOnboardingToken),
          sellerOnboardingStatus: normalizeText(onboarding?.status || leadContext?.lead?.sellerOnboardingStatus),
          sellerOnboarding: {
            ...(leadContext?.lead?.sellerOnboarding || {}),
            ...onboarding,
            formData: onboarding?.form_data && typeof onboarding.form_data === 'object' ? onboarding.form_data : {},
          },
        },
      }
    } catch {
      return leadContext
    }
  }
  try {
    const context = await getSellerOnboardingByToken(token, { includeRequirementsAndDocuments: false })
    const listing = context?.listing || null
    const onboarding = listing?.sellerOnboarding || null
    if (!onboarding?.formData) return leadContext
    return {
      ...leadContext,
      privateListing: listing || leadContext.privateListing || null,
      listing: listing || leadContext.listing || null,
      lead: {
        ...(leadContext.lead || {}),
        listingId: normalizeText(listing?.id) || normalizeText(leadContext?.lead?.listingId),
        sellerOnboardingStatus: normalizeText(onboarding.status || leadContext?.lead?.sellerOnboardingStatus),
        sellerOnboarding: {
          ...(leadContext?.lead?.sellerOnboarding || {}),
          ...onboarding,
          formData: onboarding.formData || {},
        },
      },
    }
  } catch {
    return leadContext
  }
}

function createRuntimeDefaultTemplate(packetType = 'mandate') {
  const normalizedType = normalizeKey(packetType) === 'otp' ? 'otp' : 'mandate'
  const isOtp = normalizedType === 'otp'
  return {
    id: '',
    organisation_id: null,
    module_type: 'agency',
    packet_type: normalizedType,
    template_key: isOtp ? 'otp_default_v1' : 'mandate_default_v1',
    template_label: isOtp ? 'Offer to Purchase (OTP) · Runtime Default' : 'Mandate Agreement · Runtime Default',
    template_format: 'docx',
    version_tag: 'v1',
    description: 'Runtime fallback used when the global packet template seed has not been applied yet.',
    is_default: true,
    is_active: true,
    metadata_json: {
      template_scope: 'runtime_default',
      document_family: normalizedType,
      preview_layout: 'three_panel_packet',
    },
  }
}

function templateHasUsableSource(template = null) {
  return templateIsUsableForGeneration(template, normalizeText(template?.packet_type || template?.packetType || 'mandate'))
}

function getFirstTemplate(templates = [], packetType = 'mandate') {
  const rows = Array.isArray(templates) ? templates : []
  const usable = rows.find((template) => templateHasUsableSource(template))
  if (usable) return usable
  return rows[0] || createRuntimeDefaultTemplate(packetType)
}

function isLegalWorkspaceTimeoutError(error = null) {
  const message = normalizeText(error?.message || error).toLowerCase()
  return message.includes('taking too long') || message.includes('timeout')
}

function getLatestVersion(status = null) {
  const versions = Array.isArray(status?.versions) ? status.versions : []
  const generatedVersion = versions.find((row) => normalizeKey(row?.render_status) === 'generated')
  if (generatedVersion) return generatedVersion
  const usableVersion = versions.find((row) => ['generated', 'draft', 'ready'].includes(normalizeKey(row?.render_status)))
  if (usableVersion) return usableVersion
  return versions[0] || null
}

function isRuntimePacketId(value = '') {
  return normalizeText(value).startsWith('runtime_')
}

function buildRuntimePacket({ packetType = 'mandate', organisationId = null, transactionId = '', routeLeadId = '', transactionReference = '', actor = null, template = null } = {}) {
  const now = new Date().toISOString()
  const safeLeadId = normalizeText(routeLeadId).replace(/[^a-zA-Z0-9_-]/g, '') || 'lead'
  const safePacketType = ['mandate', 'otp'].includes(normalizeKey(packetType)) ? normalizeKey(packetType) : 'mandate'
  return {
    id: `runtime_${safePacketType}_${safeLeadId}`,
    organisation_id: organisationId || null,
    packet_type: safePacketType,
    title: `${resolveDocumentLabel(safePacketType)} - ${transactionReference || 'Lead'}`,
    status: 'draft',
    template_id: normalizeText(template?.id) || null,
    template_key_snapshot: normalizeText(template?.template_key || template?.templateKey || template?.key),
    template_label_snapshot: normalizeText(template?.template_label || template?.templateLabel || template?.label || resolveDocumentLabel(safePacketType)),
    transaction_id: transactionId || null,
    lead_id: normalizeLeadUuid(routeLeadId) || null,
    assigned_agent_id: isUuidLike(actor?.id) ? actor.id : null,
    created_by: isUuidLike(actor?.id) ? actor.id : null,
    source_context_json: {
      runtimeOnly: true,
      contextType: safePacketType === 'mandate' ? 'listing_seller' : 'transaction',
      uiLeadId: routeLeadId || null,
      transactionId: transactionId || null,
      signing_method: 'not_selected',
    },
    created_at: now,
    updated_at: now,
  }
}

function buildRuntimeMandateDraft({ packet, context = {}, branding = null } = {}) {
  const now = new Date().toISOString()
  const placeholders = resolveMandatePacketPlaceholders({
    mandateData: context?.mandateData || null,
    lead: context?.lead || null,
    privateListing: context?.privateListing || null,
    mandateDraft: context?.mandateDraft || null,
    agency: context?.agency || null,
    organisation: context?.organisation || null,
    agent: context?.agent || null,
    contact: context?.contact || null,
    transaction: context?.transaction || null,
  })
  const sectionManifest = buildPacketSectionManifest({
    packetType: 'mandate',
    placeholders,
  })
  const missingPlaceholders = []
  for (const section of sectionManifest) {
    for (const [placeholderKey, placeholderLabel] of section.placeholders || []) {
      if (placeholders?.[placeholderKey]) continue
      missingPlaceholders.push({
        sectionKey: section.key,
        sectionLabel: section.label,
        placeholderKey,
        placeholderLabel,
      })
    }
  }
  const previewHtml = renderPacketPreviewHtml({
    packetType: 'mandate',
    title: packet?.title || 'Mandate Agreement',
    placeholders,
    sectionManifest,
    branding: branding || {},
  })
  const version = {
    id: `${packet.id}_version_1`,
    packet_id: packet.id,
    organisation_id: packet.organisation_id || null,
    version_number: 1,
    render_status: 'draft',
    rendered_document_id: null,
    rendered_file_path: null,
    rendered_file_name: null,
    rendered_file_url: null,
    rendered_file_access_url: null,
    placeholders_resolved_json: placeholders,
    placeholders_missing_json: missingPlaceholders,
    section_manifest_json: sectionManifest,
    validation_summary_json: {
      isValidForGeneration: true,
      criticalCount: 0,
      warningCount: missingPlaceholders.length,
      critical: [],
      warnings: missingPlaceholders.map((row) => ({
        ...row,
        message: `${row.placeholderLabel || row.placeholderKey} is not filled yet.`,
      })),
      generatedDataSnapshot: context?.mandateData || context?.generatedDataSnapshot || null,
      missingFieldsSnapshot: context?.mandateValidation?.missingRequiredFields || missingPlaceholders,
      warningsSnapshot: context?.mandateValidation?.warnings || [],
      sourceContext: context?.mandateData?.sourceContext || context?.sourceContext || null,
      generationStatus: 'runtime_preview',
      previewOnly: true,
      runtimeOnly: true,
      previewOnlyReason: 'Runtime draft created without waiting for packet persistence.',
    },
    generated_by: context?.generatedByUserId || null,
    generated_at: now,
    created_at: now,
    updated_at: now,
  }

  return {
    packet,
    version,
    previewHtml,
    runtimeOnly: true,
    status: {
      packetType: 'mandate',
      state: 'draft',
      packet,
      versions: [version],
      signingSummary: null,
      warnings: ['Runtime draft created. Packet persistence will be required before sending or finalizing.'],
      actionHint: 'Draft preview is ready.',
    },
  }
}

function hasGeneratedRuntimeMandate(lead = null) {
  if (!lead) return false
  if (normalizeText(lead.mandatePacketId)) return false
  return ['generated', 'draft'].includes(normalizeKey(lead.mandateStatus)) || isRuntimePacketId(lead.mandateRuntimeDraftId)
}

function buildMandateGenerationContext({
  organisationId = null,
  transaction = null,
  transactionId = '',
  transactionDetail = null,
  leadContext = {},
  actor = {},
  role = 'agent',
  branding = null,
  settings = null,
} = {}) {
  const onboardingSettings = settings?.onboarding && typeof settings.onboarding === 'object' ? settings.onboarding : {}
  const organisationSettings = settings?.organisation && typeof settings.organisation === 'object' ? settings.organisation : {}
  const agencyInformation = onboardingSettings?.agencyInformation && typeof onboardingSettings.agencyInformation === 'object'
    ? onboardingSettings.agencyInformation
    : {}
  const principalInformation = onboardingSettings?.principalInformation && typeof onboardingSettings.principalInformation === 'object'
    ? onboardingSettings.principalInformation
    : {}
  const primaryBranch = Array.isArray(onboardingSettings?.branchStructure?.branches)
    ? onboardingSettings.branchStructure.branches[0] || {}
    : {}
  const leadOnboarding = leadContext.lead?.sellerOnboarding || {}
  const leadOnboardingFormData =
    leadOnboarding?.formData && typeof leadOnboarding.formData === 'object'
      ? leadOnboarding.formData
      : {}
  const onboardingFormData =
    transactionDetail?.onboardingFormData?.formData ||
    transactionDetail?.onboardingFormData ||
    leadOnboardingFormData ||
    {}
  const privateListing = leadContext.privateListing || leadContext.listing || leadOnboarding?.listing || null
  const sellerFirstName = normalizeText(
    leadContext.contact?.firstName ||
      onboardingFormData?.sellerFirstName ||
      onboardingFormData?.firstName,
  )
  const sellerSurname = normalizeText(
    leadContext.contact?.lastName ||
      onboardingFormData?.sellerSurname ||
      onboardingFormData?.lastName ||
      onboardingFormData?.surname,
  )
  const sellerDisplayName =
    [sellerFirstName, sellerSurname].filter(Boolean).join(' ') ||
    normalizeText(
      onboardingFormData?.seller_full_name ||
        onboardingFormData?.fullName ||
        onboardingFormData?.displayName ||
        onboardingFormData?.display_name,
    )
  return {
    organisationId,
    organisation: {
      id: organisationId,
      name: firstText(branding?.organisationName, organisationSettings.displayName, organisationSettings.name, agencyInformation.agencyName),
      displayName: firstText(branding?.organisationName, organisationSettings.displayName, organisationSettings.name, agencyInformation.agencyName),
      legalName: firstText(agencyInformation.agencyName, organisationSettings.displayName, organisationSettings.name),
      registrationNumber: firstText(agencyInformation.companyRegistrationNumber),
      vatNumber: firstText(agencyInformation.vatNumber),
      address: firstText(
        agencyInformation.physicalAddress,
        [organisationSettings.addressLine1, organisationSettings.addressLine2, organisationSettings.city, organisationSettings.province, organisationSettings.postalCode]
          .map(normalizeText)
          .filter(Boolean)
          .join(', '),
      ),
      branchName: firstText(primaryBranch.branchName),
      logoLightUrl: firstText(branding?.logoLightUrl, onboardingSettings?.branding?.logoLight, organisationSettings.logoUrl),
      logoDarkUrl: firstText(branding?.logoDarkUrl, onboardingSettings?.branding?.logoDark),
      logoUrl: firstText(branding?.logoLightUrl, onboardingSettings?.branding?.logoLight, organisationSettings.logoUrl),
      companyPhone: firstText(organisationSettings.companyPhone, agencyInformation.mainOfficeNumber),
    },
    agency: {
      name: firstText(agencyInformation.tradingName, branding?.organisationName, agencyInformation.agencyName, organisationSettings.displayName, organisationSettings.name),
      legalName: firstText(agencyInformation.agencyName, branding?.organisationName, organisationSettings.displayName, organisationSettings.name),
      organisationName: firstText(branding?.organisationName, organisationSettings.displayName, organisationSettings.name, agencyInformation.agencyName),
      tradingName: firstText(agencyInformation.tradingName),
      registrationNumber: firstText(agencyInformation.companyRegistrationNumber),
      vatNumber: firstText(agencyInformation.vatNumber),
      address: firstText(
        agencyInformation.physicalAddress,
        [organisationSettings.addressLine1, organisationSettings.addressLine2, organisationSettings.city, organisationSettings.province, organisationSettings.postalCode]
          .map(normalizeText)
          .filter(Boolean)
          .join(', '),
      ),
      branchName: firstText(primaryBranch.branchName),
      phone: firstText(agencyInformation.mainOfficeNumber, organisationSettings.companyPhone),
      logoUrl: firstText(branding?.logoLightUrl, onboardingSettings?.branding?.logoLight, organisationSettings.logoUrl),
      logoLightUrl: firstText(branding?.logoLightUrl, onboardingSettings?.branding?.logoLight, organisationSettings.logoUrl),
      logoDarkUrl: firstText(branding?.logoDarkUrl, onboardingSettings?.branding?.logoDark),
      eaabPpraNumber: firstText(agencyInformation.eaabPpraNumber),
    },
    agent: {
      fullName: firstText(actor.fullName, principalInformation.principalFullName),
      email: firstText(actor.email, principalInformation.emailAddress),
      phone: firstText(actor.phone, principalInformation.phoneNumber),
      ffcNumber: firstText(actor.ffcNumber, principalInformation.ppraNumber),
    },
    transaction,
    transactionId,
    privateListing,
    unit: transactionDetail?.unit || null,
    buyer: transactionDetail?.buyer || null,
    contact: leadContext.contact || null,
    onboardingFormData,
    generatedByRole: role || 'agent',
    generatedByUserId: actor.id,
    generatedByName: actor.fullName,
    generatedByUserEmail: actor.email,
    agentEmail: actor.email,
    lead: leadContext.lead
      ? {
          id: normalizeLeadUuid(leadContext.lead.leadId) || null,
          lead_id: normalizeLeadUuid(leadContext.lead.leadId) || null,
          name: sellerDisplayName,
          sellerName: sellerFirstName,
          sellerSurname: sellerSurname,
          sellerEmail: normalizeText(leadContext.contact?.email || onboardingFormData?.email || onboardingFormData?.sellerEmail),
          sellerPhone: normalizeText(leadContext.contact?.phone || onboardingFormData?.phone || onboardingFormData?.sellerPhone),
          propertyAddress: normalizeText(leadContext.lead?.sellerPropertyAddress || leadContext.lead?.areaInterest),
          propertyType: normalizeText(leadContext.lead?.propertyInterest) || 'Property',
          listingTitle: normalizeText(leadContext.lead?.propertyInterest || leadContext.lead?.sellerPropertyAddress),
          askingPrice: Number(leadContext.lead?.estimatedValue || leadContext.lead?.budget || 0) || null,
          estimatedValue: Number(leadContext.lead?.estimatedValue || leadContext.lead?.budget || 0) || null,
          assignedAgentName: normalizeText(leadContext.lead?.assignedAgentName || actor.fullName),
          assignedAgentEmail: normalizeText(leadContext.lead?.assignedAgentEmail || actor.email),
          sellerOnboardingStatus: normalizeText(leadContext.lead?.sellerOnboardingStatus || leadOnboarding?.status),
          sellerOnboarding: {
            ...leadOnboarding,
            status: normalizeText(leadOnboarding?.status || leadContext.lead?.sellerOnboardingStatus),
            formData: leadOnboarding?.formData && typeof leadOnboarding.formData === 'object' ? leadOnboarding.formData : {},
          },
        }
      : null,
  }
}

function buildRuntimeMandateStatusForLead({
  organisationId = null,
  transaction = null,
  transactionId = '',
  transactionDetail = null,
  transactionReference = '',
  routeLeadId = '',
  leadContext = {},
  actor = {},
  role = 'agent',
  branding = null,
  template = null,
  settings = null,
} = {}) {
  const packet = buildRuntimePacket({
    packetType: 'mandate',
    organisationId,
    transactionId,
    routeLeadId,
    transactionReference,
    actor,
    template,
  })
  return buildRuntimeMandateDraft({
    packet,
    context: buildMandateGenerationContext({
      organisationId,
      transaction,
      transactionId,
      transactionDetail,
      leadContext,
      actor,
      role,
      branding,
      settings,
    }),
    branding,
  }).status
}

const LEGAL_WORKSPACE_ROUTE_TIMEOUT_MS = 3500
const LEGAL_WORKSPACE_GENERATION_TIMEOUT_MS = 12000
const LEGAL_WORKSPACE_PACKET_SAVE_TIMEOUT_MS = 18000

function withLegalWorkspaceTimeout(task, message, timeoutMs = LEGAL_WORKSPACE_ROUTE_TIMEOUT_MS) {
  let timeoutId = null
  return Promise.race([
    task,
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
    }),
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

function buildFallbackPacketStatus(packetType = 'mandate', warning = '') {
  return {
    packetType: ['mandate', 'otp'].includes(normalizeKey(packetType)) ? normalizeKey(packetType) : 'mandate',
    state: 'NO_PACKET',
    packet: null,
    versions: [],
    signingSummary: null,
    warnings: warning ? [warning] : [],
    actionHint: 'No packet record was found for this context.',
  }
}

export default function LegalDocumentWorkspacePage() {
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const { profile, role } = useWorkspace()
  const [loadingContext, setLoadingContext] = useState(true)
  const [pageError, setPageError] = useState('')
  const [transactionDetail, setTransactionDetail] = useState(null)
  const [organisationId, setOrganisationId] = useState(null)
  const [workspaceBranding, setWorkspaceBranding] = useState(null)
  const [workspaceSettings, setWorkspaceSettings] = useState(null)
  const [leadContext, setLeadContext] = useState({ lead: null, contact: null, linkedTransaction: null })
  const [contextHydrated, setContextHydrated] = useState(false)
  const [initialStatus, setInitialStatus] = useState(null)
  const [validatedRoutePacketId, setValidatedRoutePacketId] = useState('')
  const initialStatusRef = useRef(null)
  const hasRenderedContextRef = useRef(false)

  useEffect(() => {
    initialStatusRef.current = initialStatus
  }, [initialStatus])

  const rawRoutePacketId = normalizeText(params.packetId || searchParams.get('packetId'))
  const routePacketId = isUuidLike(rawRoutePacketId) ? rawRoutePacketId : ''
  const routeLeadId = normalizeText(params.leadId || searchParams.get('leadId'))
  const routeTransactionId = normalizeText(params.transactionId || searchParams.get('transactionId'))
  const mode = resolveModeFromQuery(searchParams.get('mode'))
  const returnTo = resolveSafeReturnPath(searchParams.get('returnTo'))
  const requestedPacketType = normalizeKey(params.packetType || searchParams.get('packetType'))
  const packetType = ['mandate', 'otp'].includes(requestedPacketType)
    ? requestedPacketType
    : normalizeKey(initialStatus?.packet?.packet_type || initialStatus?.packetType || 'mandate')
  const actor = useMemo(() => buildAgentFromProfile(profile), [profile])
  const initialStatusValueRef = useRef(initialStatus)

  useEffect(() => {
    initialStatusValueRef.current = initialStatus
  }, [initialStatus])

  const backPath = useMemo(() => {
    if (returnTo) return returnTo
    if (routeTransactionId) return `/transactions/${routeTransactionId}`
    if (routeLeadId) return `/pipeline/leads/${routeLeadId}`
    return '/transactions'
  }, [returnTo, routeLeadId, routeTransactionId])

  const handleBack = useCallback(() => {
    navigate(backPath)
  }, [backPath, navigate])

  const loadRouteContext = useCallback(async () => {
    setContextHydrated(false)
    setLoadingContext(!hasRenderedContextRef.current)
    setPageError('')
    setValidatedRoutePacketId('')
    let renderedFallback = false
    try {
      let resolvedOrganisationId = null
      let resolvedTransactionId = routeTransactionId
      let resolvedPacketType = requestedPacketType
      let effectiveRoutePacketId = routePacketId
      const packetOwnershipWarnings = []

      if (routePacketId) {
        const packet = await withLegalWorkspaceTimeout(
          fetchDocumentPacket(routePacketId, { includeVersions: false, includeEvents: false }),
          'Packet lookup is taking too long.',
        )
        if (routeLeadId && !documentPacketBelongsToLead(packet, routeLeadId)) {
          effectiveRoutePacketId = ''
          packetOwnershipWarnings.push('The packet in this link belongs to another lead, so Bridge ignored it for this workspace.')
        }
        resolvedPacketType = resolvedPacketType || normalizeKey(packet?.packet_type || packet?.packetType || 'mandate')
        if (effectiveRoutePacketId) {
          resolvedTransactionId = resolvedTransactionId || normalizeText(packet?.transaction_id || packet?.transactionId)
        }
        resolvedOrganisationId = normalizeText(packet?.organisation_id || packet?.organisationId) || null
      }

      if (!['mandate', 'otp'].includes(resolvedPacketType)) {
        throw new Error('This legal document type is not supported.')
      }

      if (!resolvedTransactionId && !effectiveRoutePacketId && !routeLeadId) {
        throw new Error('A transaction, packet, or lead reference is required to open this workspace.')
      }

      let immediateLeadContext = findLeadContextAcrossStores({
        organisationId: null,
        leadId: routeLeadId,
      })
      if (!immediateLeadContext?.lead && routeLeadId) {
        const supabaseLeadContext = await withLegalWorkspaceTimeout(
          fetchLeadContextFromSupabase({
            organisationId: resolvedOrganisationId,
            leadId: routeLeadId,
          }),
          'Lead lookup is taking too long.',
          2500,
        ).catch(() => ({ lead: null, contact: null, linkedTransaction: null }))
        if (supabaseLeadContext?.lead) immediateLeadContext = supabaseLeadContext
      }
      immediateLeadContext = await withLegalWorkspaceTimeout(
        hydrateLeadContextWithSellerOnboarding(immediateLeadContext),
        'Seller onboarding lookup is taking too long.',
        2500,
      ).catch((onboardingError) => {
        console.warn('[LegalDocumentWorkspacePage] seller onboarding lookup unavailable; continuing with local lead context.', onboardingError)
        return immediateLeadContext
      })
      const immediateOrganisationId = normalizeText(immediateLeadContext.lead?.organisationId) || null
      const immediateTransactionId = normalizeText(
        immediateLeadContext.linkedTransaction?.transactionId || immediateLeadContext.linkedTransaction?.dealId,
      )
      if (!hasRenderedContextRef.current) {
        setTransactionDetail(null)
        setOrganisationId(immediateOrganisationId)
        setWorkspaceBranding(null)
        setWorkspaceSettings(null)
        setLeadContext(immediateLeadContext)
        setInitialStatus(
          resolvedPacketType === 'mandate' && hasGeneratedRuntimeMandate(immediateLeadContext.lead)
            ? buildRuntimeMandateStatusForLead({
                organisationId: immediateOrganisationId,
                transactionId: immediateTransactionId,
                transactionReference: [
                  normalizeText(immediateLeadContext.lead?.sellerPropertyAddress || immediateLeadContext.lead?.propertyInterest),
                  normalizeText(immediateLeadContext.lead?.leadCategory),
                ].filter(Boolean).join(' · '),
                routeLeadId,
                leadContext: immediateLeadContext,
                actor,
                role,
                settings: null,
              })
            : buildFallbackPacketStatus(resolvedPacketType)
        )
        setLoadingContext(false)
        renderedFallback = true
        hasRenderedContextRef.current = true
      }

      if (!resolvedTransactionId && immediateTransactionId) {
        resolvedTransactionId = immediateTransactionId
      }
      if (!resolvedOrganisationId && immediateOrganisationId) {
        resolvedOrganisationId = immediateOrganisationId
      }

      const settingsPromise = withLegalWorkspaceTimeout(
        fetchAgencyOnboardingSettings(),
        'Organisation settings are taking too long.',
      ).catch((settingsError) => {
        console.warn('[LegalDocumentWorkspacePage] organisation settings unavailable; continuing with route context.', settingsError)
        return null
      })

      let detail = null
      if (resolvedTransactionId) {
        detail = await withLegalWorkspaceTimeout(
          fetchTransactionById(resolvedTransactionId),
          'Transaction lookup is taking too long.',
        ).catch((transactionError) => {
          console.warn('[LegalDocumentWorkspacePage] transaction detail unavailable; continuing with route context.', transactionError)
          return null
        })
        if (!detail?.transaction?.id) {
          console.warn('[LegalDocumentWorkspacePage] transaction could not be found during background hydration.', {
            transactionId: resolvedTransactionId,
          })
        }
        resolvedOrganisationId = normalizeText(detail?.transaction?.organisation_id) || resolvedOrganisationId
      }

      const settings = await settingsPromise
      if (!resolvedOrganisationId) {
        resolvedOrganisationId = normalizeText(settings?.organisation?.id) || null
      }
      const brandingFromSettings = {
        organisationName:
          normalizeText(settings?.organisation?.display_name) ||
          normalizeText(settings?.organisation?.displayName) ||
          normalizeText(settings?.organisation?.name),
        logoLightUrl: normalizeText(settings?.onboarding?.branding?.logoLight) || normalizeText(settings?.organisation?.logo_url),
        logoDarkUrl: normalizeText(settings?.onboarding?.branding?.logoDark),
      }
      const packetBranding = resolvedOrganisationId
        ? await withLegalWorkspaceTimeout(
            resolveDocumentPacketBranding({ organisationId: resolvedOrganisationId }),
            'Workspace branding is taking too long.',
          ).catch((brandingError) => {
            console.warn('[LegalDocumentWorkspacePage] branding unavailable; continuing with settings fallback.', brandingError)
            return null
          })
        : null

      let nextLeadContext = immediateLeadContext.lead
        ? immediateLeadContext
        : findLeadContextAcrossStores({
            organisationId: resolvedOrganisationId,
            leadId: routeLeadId,
          })
      if (!nextLeadContext?.lead && routeLeadId) {
        const supabaseLeadContext = await withLegalWorkspaceTimeout(
          fetchLeadContextFromSupabase({
            organisationId: resolvedOrganisationId,
            leadId: routeLeadId,
          }),
          'Lead lookup is taking too long.',
          2500,
        ).catch(() => ({ lead: null, contact: null, linkedTransaction: null }))
        if (supabaseLeadContext?.lead) nextLeadContext = supabaseLeadContext
      }
      nextLeadContext = await withLegalWorkspaceTimeout(
        hydrateLeadContextWithSellerOnboarding(nextLeadContext),
        'Seller onboarding lookup is taking too long.',
        2500,
      ).catch((onboardingError) => {
        console.warn('[LegalDocumentWorkspacePage] seller onboarding lookup unavailable during hydration.', onboardingError)
        return nextLeadContext
      })
      if (!resolvedOrganisationId) {
        resolvedOrganisationId = normalizeText(nextLeadContext.lead?.organisationId) || null
      }

      const linkedTransactionId = normalizeText(
        nextLeadContext.linkedTransaction?.transactionId || nextLeadContext.linkedTransaction?.dealId,
      )
      if (!detail && linkedTransactionId) {
        detail = await withLegalWorkspaceTimeout(
          fetchTransactionById(linkedTransactionId),
          'Linked transaction lookup is taking too long.',
        ).catch((linkedTransactionError) => {
          console.warn('[LegalDocumentWorkspacePage] linked transaction unavailable; continuing with lead context.', linkedTransactionError)
          return null
        })
        resolvedTransactionId = normalizeText(detail?.transaction?.id || linkedTransactionId)
        if (detail?.transaction?.organisation_id && !resolvedOrganisationId) {
          resolvedOrganisationId = normalizeText(detail.transaction.organisation_id)
        }
      }

      const leadRuntimeMandate = resolvedPacketType === 'mandate'
        && routeLeadId
        && !effectiveRoutePacketId
        && !normalizeText(nextLeadContext.lead?.mandatePacketId)
      let status = leadRuntimeMandate && isRuntimePacketId(initialStatusRef.current?.packet?.id)
        ? initialStatusRef.current
        : initialStatusValueRef.current || buildFallbackPacketStatus(resolvedPacketType)
      if (leadRuntimeMandate && hasGeneratedRuntimeMandate(nextLeadContext.lead) && !isRuntimePacketId(status?.packet?.id)) {
        status = buildRuntimeMandateStatusForLead({
          organisationId: resolvedOrganisationId,
          transaction: detail?.transaction || null,
          transactionId: resolvedTransactionId,
          transactionDetail: detail,
          transactionReference: resolveTransactionReference(
            detail,
            [
              normalizeText(nextLeadContext.lead?.sellerPropertyAddress || nextLeadContext.lead?.propertyInterest),
              normalizeText(nextLeadContext.lead?.leadCategory),
            ].filter(Boolean).join(' · '),
          ),
          routeLeadId,
          leadContext: nextLeadContext,
          actor,
          role,
          branding: packetBranding || brandingFromSettings,
          settings,
        })
      }
      const canResolveStatus = Boolean(effectiveRoutePacketId || resolvedTransactionId || resolvedOrganisationId) && !leadRuntimeMandate
      if (canResolveStatus) {
        status = await withLegalWorkspaceTimeout(
          resolveDocumentPacketStatus({
            packetType: resolvedPacketType,
            packetId: effectiveRoutePacketId,
            transactionId: resolvedTransactionId,
            leadId: routeLeadId,
            organisationId: resolvedOrganisationId,
          }),
          'Packet status lookup is taking too long.',
        ).catch((statusError) => {
          console.warn('[LegalDocumentWorkspacePage] packet status unavailable; opening workspace in draft mode.', statusError)
          return buildFallbackPacketStatus(resolvedPacketType, 'Packet status lookup timed out. You can still prepare this draft manually.')
        })
      }
      if (packetOwnershipWarnings.length) {
        status = {
          ...(status || buildFallbackPacketStatus(resolvedPacketType)),
          warnings: [
            ...packetOwnershipWarnings,
            ...((Array.isArray(status?.warnings) ? status.warnings : [])),
          ],
        }
      }

      setTransactionDetail(detail)
      setOrganisationId(resolvedOrganisationId)
      setWorkspaceBranding({
        ...(packetBranding || {}),
        organisationName: normalizeText(packetBranding?.organisationName) || brandingFromSettings.organisationName,
        logoLightUrl: normalizeText(packetBranding?.logoLightUrl) || brandingFromSettings.logoLightUrl,
        logoDarkUrl: normalizeText(packetBranding?.logoDarkUrl) || brandingFromSettings.logoDarkUrl,
      })
      setWorkspaceSettings(settings)
      setLeadContext(nextLeadContext)
      setInitialStatus(status)
      setValidatedRoutePacketId(effectiveRoutePacketId)
      setContextHydrated(true)
    } catch (error) {
      if (renderedFallback) {
        console.warn('[LegalDocumentWorkspacePage] background route hydration failed after fallback render.', error)
      } else {
        setPageError(toFriendlyPageError(error))
      }
    } finally {
      if (!renderedFallback) setLoadingContext(false)
    }
  }, [actor, requestedPacketType, role, routeLeadId, routePacketId, routeTransactionId])

  useEffect(() => {
    void loadRouteContext()
  }, [loadRouteContext])

  const transaction = transactionDetail?.transaction || null
  const transactionId = normalizeText(transaction?.id || routeTransactionId || leadContext.linkedTransaction?.transactionId || leadContext.linkedTransaction?.dealId)
  const transactionReference = resolveTransactionReference(
    transactionDetail,
    [
      normalizeText(leadContext.lead?.sellerPropertyAddress || leadContext.lead?.propertyInterest),
      normalizeText(leadContext.lead?.leadCategory),
    ].filter(Boolean).join(' · '),
  )

  const resolveCurrentStatus = useCallback(async () => {
    const currentPacketId = normalizeText(validatedRoutePacketId || initialStatus?.packet?.id || '')
    if (isRuntimePacketId(currentPacketId)) {
      return initialStatus || buildFallbackPacketStatus(packetType)
    }
    const status = await withLegalWorkspaceTimeout(
      resolveDocumentPacketStatus({
        packetType,
        packetId: currentPacketId,
        transactionId,
        leadId: routeLeadId,
        organisationId,
      }),
      'Packet status is taking too long.',
    )
    setInitialStatus(status)
    return status
  }, [initialStatus, organisationId, packetType, routeLeadId, transactionId, validatedRoutePacketId])

  const ensurePacket = useCallback(async ({ template, allowRuntime = true, forceNew = false } = {}) => {
    const packetHint = forceNew
      ? ''
      : (
          normalizeText(validatedRoutePacketId) ||
          normalizeText(initialStatus?.packet?.id) ||
          normalizeText(packetType === 'mandate' ? leadContext.lead?.mandatePacketId : '')
        )

    if (allowRuntime && packetType === 'mandate' && routeLeadId && !packetHint) {
      return buildRuntimePacket({
        packetType,
        organisationId,
        transactionId,
        routeLeadId,
        transactionReference,
        actor: { id: actor.id },
        template,
      })
    }

    const currentStatus = packetHint && !isRuntimePacketId(packetHint)
      ? await resolveCurrentStatus().catch((statusError) => {
          if (!isLegalWorkspaceTimeoutError(statusError)) throw statusError
          console.warn('[LegalDocumentWorkspacePage] status lookup timed out while preparing packet; using current route state.', statusError)
          return initialStatus || buildFallbackPacketStatus(packetType)
        })
      : (forceNew ? buildFallbackPacketStatus(packetType) : (initialStatus || buildFallbackPacketStatus(packetType)))
    if (!forceNew && currentStatus?.packet?.id && (allowRuntime || !isRuntimePacketId(currentStatus.packet.id))) {
      return currentStatus.packet
    }

    const shouldLookupExistingPacket = !forceNew && Boolean(transactionId || normalizeLeadUuid(routeLeadId))
    if (shouldLookupExistingPacket) {
      const scopedPackets = await withLegalWorkspaceTimeout(
        listDocumentPackets({
          organisationId,
          packetType,
          transactionId: transactionId || null,
          leadId: normalizeLeadUuid(routeLeadId) || null,
          limit: 5,
        }),
        'Packet lookup is taking too long.',
      ).catch((packetLookupError) => {
        if (!isLegalWorkspaceTimeoutError(packetLookupError)) throw packetLookupError
        console.warn('[LegalDocumentWorkspacePage] packet lookup timed out while preparing packet; creating a draft packet.', packetLookupError)
        return []
      })
      const existing = Array.isArray(scopedPackets) ? scopedPackets[0] : null
      if (existing?.id) return existing
    }

    if (packetType === 'otp' && !transactionId) {
      throw new Error('A transaction is required before generating an OTP.')
    }

    const packet = await withLegalWorkspaceTimeout(
      createDocumentPacket({
        organisationId,
        packetType,
        title: `${resolveDocumentLabel(packetType)} - ${transactionReference}`,
        transactionId: isUuidLike(transactionId) ? transactionId : null,
        dealId: isUuidLike(transactionId) ? transactionId : null,
        leadId: normalizeLeadUuid(routeLeadId) || null,
        status: 'ready_for_generation',
        templateId: isUuidLike(template?.id) ? normalizeText(template?.id) : null,
        templateKeySnapshot: normalizeText(template?.template_key || template?.templateKey || template?.key),
        templateLabelSnapshot: normalizeText(template?.template_label || template?.templateLabel || template?.label || resolveDocumentLabel(packetType)),
        assignedAgentId: isUuidLike(actor.id) ? actor.id : null,
        sourceContextJson: {
          transactionId: transactionId || null,
          leadId: normalizeLeadUuid(routeLeadId) || null,
          uiLeadId: routeLeadId || null,
          route: 'legal_document_workspace_page',
        },
      }),
      'Packet creation is taking too long.',
      LEGAL_WORKSPACE_PACKET_SAVE_TIMEOUT_MS,
    )

    if (packetType === 'mandate' && leadContext.lead?.leadId) {
      updateAgencyLead(organisationId, leadContext.lead.leadId, {
        mandatePacketId: normalizeText(packet?.id),
      })
    }

    return packet
  }, [actor.id, initialStatus, leadContext.lead, organisationId, packetType, resolveCurrentStatus, routeLeadId, transactionId, transactionReference, validatedRoutePacketId])

  const handleGenerate = useCallback(async ({ onProgress, persistForSend = false, resetExisting = false } = {}) => {
    onProgress?.('Preparing draft...')
    const generationLookupTimeoutMs = 8000
    const templates = await withLegalWorkspaceTimeout(
      listPacketTemplates({
        packetType,
        moduleType: 'agency',
        includeInactive: false,
        organisationId,
      }),
      'Template lookup is taking too long.',
      generationLookupTimeoutMs,
    )
    const template = getFirstTemplate(templates, packetType)
    const resetMandatePacket = packetType === 'mandate' && resetExisting === true
    const existingPacketIdForReset = normalizeText(
      validatedRoutePacketId ||
      initialStatus?.packet?.id ||
      leadContext.lead?.mandatePacketId,
    )
    if (resetMandatePacket) {
      onProgress?.('Resetting failed mandate packet...')
      if (isUuidLike(existingPacketIdForReset)) {
        await archivePacket(existingPacketIdForReset, {
          reason: 'Reset failed mandate before regeneration.',
        }).catch((resetError) => {
          console.warn('[LegalDocumentWorkspacePage] failed mandate packet could not be archived; continuing with fresh packet generation.', resetError)
        })
      }
      if (leadContext.lead?.leadId) {
        await Promise.resolve(updateAgencyLead(organisationId, leadContext.lead.leadId, {
          mandatePacketId: '',
          mandateStatus: '',
          mandateGeneratedAt: '',
        })).catch((leadResetError) => {
          console.warn('[LegalDocumentWorkspacePage] lead mandate status could not be cleared before regeneration; continuing with fresh packet generation.', leadResetError)
        })
      }
      setInitialStatus(buildFallbackPacketStatus(packetType))
    }

    const leadRuntimeMandate = packetType === 'mandate'
      && routeLeadId
      && !validatedRoutePacketId
      && !initialStatus?.packet?.id
      && !normalizeText(leadContext.lead?.mandatePacketId)
      && !persistForSend
      && !resetMandatePacket
    const shouldResolveExistingStatus = !resetMandatePacket && Boolean(validatedRoutePacketId || initialStatus?.packet?.id || (transactionId && !leadRuntimeMandate))
    const existingStatus = shouldResolveExistingStatus
      ? await resolveCurrentStatus().catch((statusError) => {
          if (!isLegalWorkspaceTimeoutError(statusError)) throw statusError
          console.warn('[LegalDocumentWorkspacePage] status lookup timed out before generation; continuing with current route state.', statusError)
          return initialStatus || buildFallbackPacketStatus(packetType)
        })
      : (initialStatus || buildFallbackPacketStatus(packetType))
    if (['sent', 'partially_signed', 'signed', 'archived'].includes(normalizeKey(existingStatus?.state))) {
      throw new Error('This document is already sent or signed. Open the current packet instead of generating a new draft.')
    }

    let effectiveLeadContext = leadContext
    if (packetType === 'mandate') {
      effectiveLeadContext = await withLegalWorkspaceTimeout(
        hydrateLeadContextWithSellerOnboarding(leadContext),
        'Seller onboarding lookup is taking too long.',
        generationLookupTimeoutMs,
      ).catch((onboardingError) => {
        console.warn('[LegalDocumentWorkspacePage] seller onboarding refresh unavailable before generation; using loaded lead context.', onboardingError)
        return leadContext
      })
    }

    const generationContext = buildMandateGenerationContext({
      organisationId,
      transaction,
      transactionId,
      transactionDetail,
      leadContext: effectiveLeadContext,
      actor,
      role,
      branding: workspaceBranding,
      settings: workspaceSettings,
    })
    if (packetType === 'mandate') {
      const mandateData = mapSellerOnboardingToMandateData({
        onboardingSubmission: {
          ...((generationContext?.lead?.sellerOnboarding?.formData && typeof generationContext.lead.sellerOnboarding.formData === 'object')
            ? generationContext.lead.sellerOnboarding.formData
            : {}),
          status: normalizeText(generationContext?.lead?.sellerOnboardingStatus || generationContext?.lead?.sellerOnboarding?.status),
        },
        lead: generationContext?.lead || {},
        privateListing: generationContext?.privateListing || {},
        agency: generationContext?.agency || {},
        organisation: generationContext?.organisation || {},
        agent: generationContext?.agent || {},
        contact: generationContext?.contact || {},
        transaction: generationContext?.transaction || {},
        mandateDraft: generationContext?.mandateDraft || {},
      })
      const mandatePreflight = validateMandateGenerationData(mandateData, { action: 'generate' })
      generationContext.mandateData = mandateData
      generationContext.mandateValidation = mandatePreflight
      generationContext.generatedDataSnapshot = mandateData
      generationContext.sourceContext = mandateData.sourceContext
      if (!mandatePreflight.canProceed) {
        console.warn('[MANDATE] legal workspace preflight found missing data; continuing with mandate generation.', {
          leadId: normalizeText(generationContext?.lead?.leadId || routeLeadId),
          missingRequiredFields: mandatePreflight.missingRequiredFields,
          warnings: mandatePreflight.warnings,
        })
      }
    }

    const packet = await ensurePacket({ template, allowRuntime: !persistForSend && !resetMandatePacket, forceNew: resetMandatePacket })
    onProgress?.('Merging transaction details...')

    if (isRuntimePacketId(packet?.id)) {
      const runtimeDraft = buildRuntimeMandateDraft({
        packet,
        context: generationContext,
        branding: workspaceBranding,
      })
      setInitialStatus(runtimeDraft.status)
      if (packetType === 'mandate' && leadContext.lead?.leadId) {
        updateAgencyLead(organisationId, leadContext.lead.leadId, {
          mandateRuntimeDraftId: normalizeText(packet?.id),
          mandateStatus: 'generated',
          mandateGeneratedAt: new Date().toISOString(),
        })
        addLeadActivity(organisationId, leadContext.lead.leadId, {
          agent: { id: actor.id, name: normalizeText(profile?.full_name || profile?.fullName || profile?.email || actor.name), email: actor.email },
          activityType: 'Mandate Generated',
          activityNote: 'Mandate was generated successfully.',
          outcome: 'Generated',
        })
      }
      window.dispatchEvent(new Event('itg:transaction-updated'))
      return runtimeDraft
    }

    onProgress?.('Generating mandate PDF...')
    const generationResult = await withLegalWorkspaceTimeout(
      generatePacketVersion({
        packetId: packet.id,
        packetType,
        template,
        allowWarnings: true,
        forceGenerate: false,
        context: generationContext,
      }),
      'Draft generation is taking too long.',
      LEGAL_WORKSPACE_GENERATION_TIMEOUT_MS,
    )

    if (packetType === 'mandate' && leadContext.lead?.leadId) {
      updateAgencyLead(organisationId, leadContext.lead.leadId, {
        mandatePacketId: normalizeText(packet?.id),
        mandateStatus: 'generated',
      })
      addLeadActivity(organisationId, leadContext.lead.leadId, {
        agent: { id: actor.id, name: normalizeText(profile?.full_name || profile?.fullName || profile?.email || actor.name), email: actor.email },
        activityType: 'Mandate Generated',
        activityNote: 'Mandate was generated successfully.',
        outcome: 'Generated',
      })
    }

    let refreshedStatus = null
    try {
      onProgress?.('Refreshing draft status...')
      refreshedStatus = await withLegalWorkspaceTimeout(
        resolveDocumentPacketStatus({
          packetType,
          packetId: packet.id,
          transactionId,
          leadId: routeLeadId,
          organisationId,
        }),
        'Generated packet status is taking too long.',
      )
      setInitialStatus(refreshedStatus)
    } catch (statusError) {
      console.warn('[LegalDocumentWorkspacePage] generated packet status refresh failed; using generation result snapshot.', statusError)
      refreshedStatus = {
        packetType,
        state: 'generated',
        packet: generationResult.packet || packet,
        versions: [generationResult.version].filter(Boolean),
        signingSummary: null,
        warnings: generationResult.validation?.warnings || [],
        actionHint: 'Draft generated.',
      }
      setInitialStatus(refreshedStatus)
    }

    window.dispatchEvent(new Event('itg:transaction-updated'))
    return {
      ...generationResult,
      status: refreshedStatus,
    }
  }, [
    actor,
    ensurePacket,
    initialStatus,
    leadContext,
    organisationId,
    packetType,
    profile,
    resolveCurrentStatus,
    role,
    routeLeadId,
    transaction,
    transactionDetail,
    transactionId,
    validatedRoutePacketId,
    workspaceBranding,
    workspaceSettings,
  ])

  const handleSend = useCallback(async ({ resend = false, signerLinks = [], targetSignerRole = '', signingStatus = '' } = {}) => {
    const status = await resolveCurrentStatus()
    const latestVersion = getLatestVersion(status)
    if (packetType === 'otp' && latestVersion?.rendered_document_id) {
      await updateOtpDocumentWorkflowState({
        documentId: latestVersion.rendered_document_id,
        workflowState: OTP_DOCUMENT_TYPES.sentToClient,
        isClientVisible: true,
      })
    }
    if (packetType === 'mandate' && leadContext.lead?.leadId) {
      const sellerName =
        normalizeText(leadContext?.contact?.name) ||
        [leadContext?.contact?.firstName, leadContext?.contact?.lastName].map(normalizeText).filter(Boolean).join(' ') ||
        normalizeText(leadContext?.lead?.name) ||
        'Seller'
      const signerRows = Array.isArray(signerLinks) ? signerLinks : []
      const normalizedTargetRole = normalizeText(targetSignerRole).toLowerCase()
      const activeSigner =
        signerRows.find((signer) =>
          normalizeText(signer?.signing_link) &&
          (!normalizedTargetRole || normalizeText(signer?.signer_role).toLowerCase() === normalizedTargetRole)
        ) ||
        signerRows.find((signer) => normalizeText(signer?.signing_link)) ||
        null
      const recipientRole = normalizeText(activeSigner?.signer_role).toLowerCase() === 'seller' ? 'seller' : 'agent'
      const agentEmail = normalizeText(profile?.email || actor.email).toLowerCase()
      const agentName = normalizeText(profile?.full_name || profile?.fullName || profile?.email || actor.name || actor.email || 'Agent')
      const sellerEmail = normalizeText(activeSigner?.signer_email || leadContext?.contact?.email || leadContext?.lead?.sellerEmail || leadContext?.lead?.email).toLowerCase()
      const signingLink = normalizeText(activeSigner?.signing_link)
      const recipientEmail = recipientRole === 'seller' ? sellerEmail : normalizeText(activeSigner?.signer_email || agentEmail).toLowerCase()
      const recipientName = recipientRole === 'seller'
        ? normalizeText(activeSigner?.signer_name || sellerName)
        : normalizeText(activeSigner?.signer_name || agentName)
      if (!signingLink) {
        const linkError = new Error(`The ${recipientRole} signing link could not be created. Confirm the ${recipientRole} has an email address, then try again.`)
        linkError.code = 'SIGNING_LINK_FAILED'
        throw linkError
      }
      if (isSupabaseConfigured && recipientEmail) {
        await invokeEdgeFunction('send-email', {
          body: {
            type: 'seller_mandate_sent',
            to: recipientEmail,
            organisationId,
            packetId: normalizeText(status?.packet?.id || latestVersion?.packet_id || ''),
            recipientRole,
            recipientName,
            sellerName,
            propertyTitle: normalizeText(leadContext?.lead?.propertyAddress || leadContext?.lead?.listingTitle || transactionReference || 'your property'),
            mandateType: 'Mandate',
            portalLink: signingLink,
            agentName,
            resend: Boolean(resend),
          },
        })
      }
      const nextMandateStatus = normalizeText(signingStatus) || (recipientRole === 'seller' ? 'sent_to_seller' : 'sent_to_agent')
      updateAgencyLead(organisationId, leadContext.lead.leadId, {
        mandateStatus: nextMandateStatus,
        mandateSentAt: new Date().toISOString(),
        mandateSigningLink: signingLink,
      })
      addLeadActivity(organisationId, leadContext.lead.leadId, {
        agent: { id: actor.id, name: normalizeText(profile?.full_name || profile?.fullName || profile?.email || actor.name), email: actor.email },
        activityType: 'Mandate Sent',
        activityNote: resend
          ? `Mandate signing link was resent to the ${recipientRole}.`
          : `Mandate was sent to the ${recipientRole} for digital signing.`,
        outcome: resend ? `Signing link resent to ${recipientRole}` : `Sent to ${recipientRole} for digital signing`,
      })
    }
    window.dispatchEvent(new Event('itg:transaction-updated'))
  }, [actor, leadContext, organisationId, packetType, profile, resolveCurrentStatus, transactionReference])

  const openLatestDocument = useCallback(async ({ signed = false } = {}) => {
    const status = await resolveCurrentStatus()
    const latestVersion = getLatestVersion(status)
    const url = signed
      ? normalizeText(latestVersion?.final_signed_file_access_url || latestVersion?.final_signed_file_url)
      : normalizeText(latestVersion?.rendered_file_access_url || latestVersion?.rendered_file_url)
    if (!url) {
      throw new Error(signed ? 'Signed document is not available yet.' : 'Document preview is not available yet.')
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [resolveCurrentStatus])

  if (loadingContext) {
    return (
      <section className="flex min-h-[420px] items-center justify-center rounded-[18px] border border-[#dce6f2] bg-white text-sm font-semibold text-[#60758d]">
        Loading legal document workspace...
      </section>
    )
  }

  if (pageError) {
    return (
      <section className="rounded-[20px] border border-[#f1d8d0] bg-[#fff7f5] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-[#9d3b2b]">
              <AlertCircle size={16} />
              Legal Workspace Unavailable
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#142132]">This legal document could not be opened.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b7d93]">{pageError}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={handleBack}>
              <ArrowLeft size={14} />
              Back
            </Button>
            <Button type="button" onClick={() => void loadRouteContext()}>
              Retry
            </Button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <LegalDocumentWorkspace
      displayMode="page"
      open
      onBack={handleBack}
      onClose={handleBack}
      backLabel={routeLeadId && !transactionId ? 'Back to Lead' : 'Back to Transaction'}
      transactionId={transactionId}
      transactionReference={transactionReference}
      packetType={packetType}
      packetId={validatedRoutePacketId || normalizeText(initialStatus?.packet?.id)}
      mode={mode}
      initialStatus={initialStatus}
      organisationId={organisationId}
      branding={workspaceBranding}
      onGenerate={handleGenerate}
      onEdit={handleGenerate}
      onSend={handleSend}
      onView={() => openLatestDocument({ signed: false })}
      onViewSigned={() => openLatestDocument({ signed: true })}
      onRefreshContext={undefined}
      autoGenerateEnabled={contextHydrated}
    />
  )
}
