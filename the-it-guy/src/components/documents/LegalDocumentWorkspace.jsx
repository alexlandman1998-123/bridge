import { AlertCircle, ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, Download, Eye, FileCheck2, FileText, Link2, MoreHorizontal, Plus, Printer, ShieldCheck, UploadCloud, UsersRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '../ui/Button'
import Drawer from '../ui/Drawer'
import { useWorkspace } from '../../context/WorkspaceContext'
import { normalizeAppRole } from '../../lib/roles'
import {
  appendDocumentPacketEvent,
  createDocumentPacketSigners,
  createDocumentPacketVersion,
  fetchDocumentPacket,
  fetchDocumentPacketTemplate,
  updateDocumentPacket,
  updateDocumentPacketVersion,
  updateDocumentPacketVersionFinalArtifact,
  uploadFinalSignedPacketArtifact,
} from '../../lib/documentPacketsApi'
import { uploadDocument } from '../../lib/api'
import {
  generateFinalSignedPacketDocument,
  generateSigningLinks,
  listPacketTemplates,
  prepareSigningFields,
} from '../../core/documents/packetService'
import {
  getCanonicalMergeFieldDefinition,
  getRequiredCanonicalMergeFields,
  listCanonicalMergeFields,
  normalizeMergeFieldPayload,
} from '../../core/documents/mergeFieldRegistry'
import {
  resolveDocumentPacketActionState,
  resolveDocumentPacketStatus,
} from '../../core/documents/packetStatusResolver'
import {
  formatMandateValidationMessage,
  MAX_SIGNED_MANDATE_UPLOAD_BYTES,
  validateMandateGenerationData,
} from '../../core/documents/mandateValidation'
import {
  mandateRequiresSpouseSignature,
  resolveMandateSpouseRequirementFromFields,
} from '../../lib/mandateSignatureRules'
import { templateIsUsableForGeneration } from '../../core/documents/structuredTemplateRenderer'

function normalizeText(value) {
  return String(value || '').trim()
}

function isRuntimePacketId(value = '') {
  return normalizeText(value).startsWith('runtime_')
}

function isUuidLike(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function isPersistedPacketId(value = '') {
  const text = normalizeText(value)
  return isUuidLike(text) || isRuntimePacketId(text)
}

function hasLoadedWorkspaceSnapshot(status = null) {
  if (!status || typeof status !== 'object') return false
  const packetId = normalizeText(status?.packet?.id)
  const state = normalizeKey(status?.state)
  const versions = Array.isArray(status?.versions) ? status.versions : []

  if (isRuntimePacketId(packetId)) return true
  if (!packetId || !isUuidLike(packetId)) return false
  if (versions.length > 0) return true
  if (['sent', 'partially_signed', 'signed', 'approved', 'locked'].includes(state)) return true
  return false
}

function hasUsablePacketVersionForSigning(version = null) {
  if (!normalizeText(version?.id)) return false
  const renderStatus = normalizeKey(version?.render_status)
  return !renderStatus || ['generated', 'draft'].includes(renderStatus)
}

function getUsablePacketVersionForSigning(versions = []) {
  const rows = Array.isArray(versions) ? versions : []
  return rows.find((version) => hasUsablePacketVersionForSigning(version)) || null
}

function getGeneratedPacketVersionForSigning(versions = []) {
  const rows = Array.isArray(versions) ? versions : []
  return rows.find((version) => normalizeKey(version?.render_status) === 'generated') || null
}

function getSigningVersionSnapshot(status = null, fallbackVersion = null) {
  const rows = Array.isArray(status?.versions) ? status.versions : []
  const generatedVersion = getGeneratedPacketVersionForSigning(rows)
  if (generatedVersion?.id) return generatedVersion
  return fallbackVersion || rows[0] || null
}

function templateHasUsableSource(template = null) {
  return templateIsUsableForGeneration(template, normalizeText(template?.packet_type || template?.packetType || 'mandate'))
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

const WORKSPACE_REFRESH_TIMEOUT_MS = 3500

function withWorkspaceTimeout(task, message, timeoutMs = WORKSPACE_REFRESH_TIMEOUT_MS) {
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

function buildWorkspaceFallbackStatus(packetType = 'mandate', warning = '') {
  const normalizedPacketType = ['mandate', 'otp'].includes(normalizeKey(packetType)) ? normalizeKey(packetType) : 'mandate'
  return {
    packetType: normalizedPacketType,
    state: 'NO_PACKET',
    packet: null,
    versions: [],
    signingSummary: null,
    warnings: warning ? [warning] : [],
    actionHint: 'Packet details are still loading.',
  }
}

function slugifySectionKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function formatDateTime(value) {
  const text = normalizeText(value)
  if (!text) return '—'
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('en-ZA')
}

function formatRelativeTime(value) {
  const text = normalizeText(value)
  if (!text) return 'Not saved yet'
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return formatDateTime(text)
  const diffMs = parsed.getTime() - Date.now()
  const absMs = Math.abs(diffMs)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const units = [
    { unit: 'day', ms: 24 * 60 * 60 * 1000 },
    { unit: 'hour', ms: 60 * 60 * 1000 },
    { unit: 'minute', ms: 60 * 1000 },
  ]
  for (const { unit, ms } of units) {
    if (absMs >= ms || unit === 'minute') {
      return rtf.format(Math.round(diffMs / ms), unit)
    }
  }
  return 'just now'
}

function firstNonEmptyText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function fullNameFromParts(...parts) {
  return parts.map(normalizeText).filter(Boolean).join(' ')
}

function buildMergeChecklistRows({ packetType = 'mandate', placeholders = {} } = {}) {
  const normalized = normalizeMergeFieldPayload(placeholders, {
    packetType,
    includeAliasKeys: true,
  })
  const normalizedPayload = normalized.payload
  const requiredFields = getRequiredCanonicalMergeFields(packetType)
  const requiredSet = new Set(requiredFields.map((row) => row.key))
  const aliasByCanonical = new Map(
    (normalized.aliasHits || []).map((row) => [row.canonicalKey, row.alias]),
  )
  const preferredFieldKeys = [
    'buyer_full_name',
    'buyer_id_number',
    'buyer_email',
    'seller_full_name',
    'seller_id_number',
    'seller_email',
    'property_address',
    'unit_number',
    'purchase_price',
    'finance_type',
    'mandate_type',
    'asking_price',
    'agent_full_name',
    'agent_email',
    'organisation_name',
    'organisation_logo_url',
  ]
  const canonicalFields = listCanonicalMergeFields({ packetType })
  const fieldKeys = Array.from(new Set([
    ...requiredFields.map((field) => field.key),
    ...preferredFieldKeys,
    ...Object.keys(normalizedPayload)
      .map((key) => getCanonicalMergeFieldDefinition(key, { packetType })?.key)
      .filter(Boolean),
  ]))
    .filter((key) => canonicalFields.some((field) => field.key === key))
    .slice(0, 16)

  const rows = fieldKeys.map((fieldKey) => {
    const definition = getCanonicalMergeFieldDefinition(fieldKey, { packetType })
    const value = normalizeText(normalizedPayload[fieldKey])
    const alias = aliasByCanonical.get(fieldKey)
    const required = requiredSet.has(fieldKey)
    return {
      key: fieldKey,
      label: definition?.label || fieldKey,
      source: definition?.dataSource || 'Legal workspace context',
      value,
      required,
      alias,
      status: value ? (alias ? 'deprecated' : 'complete') : required ? 'missing' : 'warning',
    }
  })

  return {
    rows,
    unknownKeys: normalized.unknownKeys || [],
  }
}

function resolveMergeStatusTone(status = 'warning') {
  switch (status) {
    case 'complete':
      return 'border-[#d8f0e3] bg-[#effaf4] text-[#20b26b]'
    case 'missing':
      return 'border-[#fde4de] bg-[#fff5f2] text-[#c46a44]'
    case 'deprecated':
      return 'border-[#e1e8ff] bg-[#f4f7ff] text-[#4463d1]'
    default:
      return 'border-[#f8e1c1] bg-[#fff8ed] text-[#b57a1d]'
  }
}

function resolveMergeStatusLabel(status = 'warning') {
  switch (status) {
    case 'complete':
      return 'Resolved'
    case 'missing':
      return 'Missing'
    case 'deprecated':
      return 'Alias'
    default:
      return 'Optional'
  }
}

function compareTimelineDates(a, b) {
  const aTime = new Date(a || 0).getTime()
  const bTime = new Date(b || 0).getTime()
  return bTime - aTime
}

function resolveDocumentLabel(packetType) {
  return normalizeKey(packetType) === 'otp' ? 'Offer to Purchase' : 'Mandate Agreement'
}

function resolveVersionDownloadUrl(version = null, { preferSigned = false } = {}) {
  const signedUrl = normalizeText(version?.final_signed_file_access_url || version?.final_signed_file_url || '')
  const generatedUrl = normalizeText(version?.rendered_file_access_url || version?.rendered_file_url || '')
  return preferSigned ? signedUrl || generatedUrl : generatedUrl || signedUrl
}

function isPdfFile(file = null) {
  if (!file) return false
  return normalizeText(file?.type).toLowerCase() === 'application/pdf' || normalizeText(file?.name).toLowerCase().endsWith('.pdf')
}

function createWorkspaceError(code, message, details = {}) {
  const error = new Error(message)
  error.code = code
  error.details = details
  return error
}

function extractMandateValidationPayload(error = null) {
  if (!error || typeof error !== 'object') return null
  const directValidation = error?.validation
  if (directValidation?.fieldGroups) return directValidation
  if (directValidation?.mandateValidation?.fieldGroups) return directValidation.mandateValidation
  if (error?.details?.validation?.fieldGroups) return error.details.validation
  if (error?.details?.validation?.mandateValidation?.fieldGroups) return error.details.validation.mandateValidation
  if (error?.cause?.validation?.fieldGroups) return error.cause.validation
  if (error?.cause?.validation?.mandateValidation?.fieldGroups) return error.cause.validation.mandateValidation
  return null
}

function toFriendlyWorkspaceError(error = null, fallback = 'Unable to complete this legal action right now.') {
  const code = normalizeText(error?.code).toUpperCase()
  const raw = normalizeText(error?.message || error)
  const message = raw.toLowerCase()
  const mandateValidation = extractMandateValidationPayload(error)
  if (mandateValidation?.fieldGroups) {
    return formatMandateValidationMessage(mandateValidation)
  }
  if (code === 'STALE_PACKET_STATE') {
    return 'This document was updated by another user. Refresh and try again.'
  }
  if (code === 'PACKETS_RLS_DENIED' || message.includes('row-level security') || message.includes('permission denied')) {
    return 'Your role cannot complete this action in the current organisation context.'
  }
  if (code === 'NO_GENERATED_VERSION') return 'Generate a draft version before continuing.'
  if (code === 'GENERATION_TIMEOUT') {
    return 'Mandate generation is taking too long. The template render service looks stalled, so Bridge stopped waiting. Please try again.'
  }
  if (code === 'MISSING_TEMPLATE_FILE') return 'The active legal template is not available for rendering. Check the current template configuration first.'
  if (code === 'NATIVE_TEMPLATE_NOT_RENDERABLE') return 'The active native template is not renderable yet. Cover the required sections and merge fields first.'
  if (code === 'VALIDATION_BLOCKED') {
    const missingFields = Array.isArray(error?.validation?.critical)
      ? error.validation.critical
        .map((item) => normalizeText(item?.placeholderLabel || item?.field || item?.message))
        .filter(Boolean)
      : []
    if (missingFields.length) {
      return [
        'Missing Required Information',
        ...missingFields.slice(0, 10).map((label) => `- ${label}`),
        'Complete the missing information before continuing.',
      ].join('\n')
    }
    return 'Required legal fields are missing. Resolve validation blockers first.'
  }
  if (code === 'MANDATE_PREFLIGHT_BLOCKED') {
    return error?.validation
      ? formatMandateValidationMessage(error.validation)
      : raw || 'Seller onboarding is missing required information. Complete the missing fields before generating the mandate.'
  }
  if (code === 'SIGNERS_INCOMPLETE' || code === 'FIELDS_INCOMPLETE') {
    return 'Required signatures are still incomplete. Wait for all required signers to finish.'
  }
  if (code === 'SIGNING_LINK_FAILED') return 'The signing link could not be created. Please try again.'
  if (code === 'SIGNING_EMAIL_FAILED') return 'The mandate was prepared, but the signing email could not be sent. You can resend it from this page.'
  if (code === 'SIGNED_UPLOAD_FAILED') return 'The signed mandate could not be uploaded. Please upload a PDF file and try again.'
  if (message.includes('cors') || message.includes('network') || message.includes('failed to fetch')) {
    return 'Network or signing service connection failed. Please retry.'
  }
  if (message.includes('invalid input syntax for type uuid')) {
    return 'A related record reference is invalid. Refresh this workspace and retry.'
  }
  if (raw.startsWith('Missing Required Information')) {
    return raw
  }
  if (message.includes('cannot read') || message.includes('undefined') || message.includes('templatedata null')) {
    return 'Some seller onboarding information is still missing. Review the missing information panel and try again.'
  }
  if (message.includes('invalid uuid')) {
    return 'The mandate could not be linked correctly. Please refresh and try again.'
  }
  if (
    message.includes('template') &&
    (message.includes('render') || message.includes('failed')) &&
    !message.includes('required information is missing')
  ) {
    return raw || 'The mandate template could not be generated because required information is missing.'
  }
  if (message.includes('storage') || message.includes('insert failed')) {
    return 'The mandate file could not be saved right now. Please retry.'
  }
  return raw || fallback
}

function resolveLegalPermissions(appRole = 'viewer') {
  const rawRole = normalizeKey(appRole)
  const managementRoles = new Set([
    'principal',
    'owner',
    'admin',
    'super_admin',
    'branch_manager',
    'manager',
    'agency_admin',
    'agent_admin',
  ])
  const role = managementRoles.has(rawRole) ? 'agent' : normalizeAppRole(appRole)
  const isExternalOrReadOnly = role === 'client' || role === 'viewer'
  return {
    canView: true,
    canGenerate: !isExternalOrReadOnly,
    canEditDraft: !isExternalOrReadOnly,
    canApprove: !isExternalOrReadOnly,
    canLock: !isExternalOrReadOnly,
    canSend: !isExternalOrReadOnly,
    canResend: !isExternalOrReadOnly,
    canFinalize: !isExternalOrReadOnly,
    canManageSigners: !isExternalOrReadOnly,
  }
}

function isValidEmail(value) {
  const text = normalizeText(value).toLowerCase()
  if (!text || text.includes(' ')) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
}

const SIGNER_ROLE_BLUEPRINT = {
  mandate: [
    { role: 'agent', label: 'Agent', required: true },
    { role: 'seller', label: 'Seller', required: true },
  ],
  otp: [
    { role: 'purchaser_1', label: 'Buyer', required: true },
    { role: 'seller', label: 'Seller', required: true },
    { role: 'agent', label: 'Agent', required: false },
    { role: 'witness_1', label: 'Witness', required: false },
    { role: 'purchaser_2', label: 'Spouse', required: false },
  ],
}

const BRIDGE_LOGO_LIGHT_URL = '/brand/bridge_9_white_background.png'
const BRIDGE_LOGO_DARK_URL = '/brand/bridge_9_dark_background.png'

function resolveSignerBlueprint(packetType = 'mandate') {
  const key = normalizeKey(packetType)
  return SIGNER_ROLE_BLUEPRINT[key] || SIGNER_ROLE_BLUEPRINT.mandate
}

function buildSignerDefaultsFromContext({ sourceContext = {}, latestVersion = null, mandateDataSnapshot = null } = {}) {
  const generatedSnapshot = sourceContext?.generatedDataSnapshot && typeof sourceContext.generatedDataSnapshot === 'object'
    ? sourceContext.generatedDataSnapshot
    : latestVersion?.validation_summary_json?.generatedDataSnapshot && typeof latestVersion.validation_summary_json.generatedDataSnapshot === 'object'
      ? latestVersion.validation_summary_json.generatedDataSnapshot
    : mandateDataSnapshot && typeof mandateDataSnapshot === 'object'
      ? mandateDataSnapshot
      : {}
  const nestedSource = generatedSnapshot?.sourceContext && typeof generatedSnapshot.sourceContext === 'object'
    ? generatedSnapshot.sourceContext
    : latestVersion?.validation_summary_json?.sourceContext && typeof latestVersion.validation_summary_json.sourceContext === 'object'
      ? latestVersion.validation_summary_json.sourceContext
      : {}
  const placeholders = {
    ...(generatedSnapshot?.placeholders && typeof generatedSnapshot.placeholders === 'object' ? generatedSnapshot.placeholders : {}),
    ...(latestVersion?.placeholders_resolved_json && typeof latestVersion.placeholders_resolved_json === 'object' ? latestVersion.placeholders_resolved_json : {}),
  }
  const lead = {
    ...(nestedSource?.lead && typeof nestedSource.lead === 'object' ? nestedSource.lead : {}),
    ...(generatedSnapshot?.lead && typeof generatedSnapshot.lead === 'object' ? generatedSnapshot.lead : {}),
    ...(sourceContext?.lead && typeof sourceContext.lead === 'object' ? sourceContext.lead : {}),
  }
  const agent = {
    ...(nestedSource?.agent && typeof nestedSource.agent === 'object' ? nestedSource.agent : {}),
    ...(generatedSnapshot?.agent && typeof generatedSnapshot.agent === 'object' ? generatedSnapshot.agent : {}),
    ...(sourceContext?.agent && typeof sourceContext.agent === 'object' ? sourceContext.agent : {}),
  }
  const sellerOnboarding = {
    ...(nestedSource?.sellerOnboarding && typeof nestedSource.sellerOnboarding === 'object' ? nestedSource.sellerOnboarding : {}),
    ...(generatedSnapshot?.sellerOnboarding && typeof generatedSnapshot.sellerOnboarding === 'object' ? generatedSnapshot.sellerOnboarding : {}),
    ...(lead?.sellerOnboarding && typeof lead.sellerOnboarding === 'object' ? lead.sellerOnboarding : {}),
    ...(sourceContext?.sellerOnboarding && typeof sourceContext.sellerOnboarding === 'object' ? sourceContext.sellerOnboarding : {}),
  }
  const onboardingFormData = {
    ...(nestedSource?.onboardingFormData && typeof nestedSource.onboardingFormData === 'object' ? nestedSource.onboardingFormData : {}),
    ...(generatedSnapshot?.onboardingFormData && typeof generatedSnapshot.onboardingFormData === 'object' ? generatedSnapshot.onboardingFormData : {}),
    ...(sourceContext?.onboardingFormData && typeof sourceContext.onboardingFormData === 'object' ? sourceContext.onboardingFormData : {}),
    ...(sellerOnboarding?.formData && typeof sellerOnboarding.formData === 'object' ? sellerOnboarding.formData : {}),
  }

  const sellerFirstName = firstNonEmptyText(placeholders.seller_first_name, lead.sellerName, onboardingFormData.sellerFirstName, onboardingFormData.firstName)
  const sellerSurname = firstNonEmptyText(placeholders.seller_surname, lead.sellerSurname, onboardingFormData.sellerSurname, onboardingFormData.lastName, onboardingFormData.surname)
  const spouseFirstName = firstNonEmptyText(placeholders.seller_spouse_first_name, onboardingFormData.spouseFirstName, onboardingFormData.spouse_first_name)
  const spouseSurname = firstNonEmptyText(placeholders.seller_spouse_surname, onboardingFormData.spouseSurname, onboardingFormData.spouseLastName, onboardingFormData.spouse_surname)

  return {
    agent: {
      signerName: firstNonEmptyText(placeholders.agent_full_name, agent.fullName, agent.name, sourceContext.generatedByName, sourceContext.agentName, lead.assignedAgentName),
      signerEmail: firstNonEmptyText(placeholders.agent_email, agent.email, sourceContext.agentEmail, sourceContext.generatedByUserEmail, lead.assignedAgentEmail).toLowerCase(),
    },
    seller: {
      signerName: firstNonEmptyText(
        placeholders.seller_full_name,
        lead.sellerFullName,
        lead.name,
        onboardingFormData.sellerFullName,
        onboardingFormData.fullName,
        onboardingFormData.displayName,
        fullNameFromParts(sellerFirstName, sellerSurname),
      ),
      signerEmail: firstNonEmptyText(placeholders.seller_email, lead.sellerEmail, sourceContext.sellerEmail, nestedSource.sellerEmail, onboardingFormData.sellerEmail, onboardingFormData.email).toLowerCase(),
    },
    purchaser_2: {
      signerName: firstNonEmptyText(
        placeholders.seller_spouse_name,
        sourceContext.spouseName,
        nestedSource.spouseName,
        onboardingFormData.spouseName,
        onboardingFormData.spouseFullName,
        onboardingFormData.spouse_full_name,
        fullNameFromParts(spouseFirstName, spouseSurname),
      ),
      signerEmail: firstNonEmptyText(placeholders.seller_spouse_email, sourceContext.spouseEmail, nestedSource.spouseEmail, onboardingFormData.spouseEmail, onboardingFormData.spouse_email).toLowerCase(),
    },
  }
}

function resolveMandateSpouseRequirementFromSigningSummary(signingSummary = null) {
  return resolveMandateSpouseRequirementFromFields(signingSummary?.fields || [])
}

function resolveSignerStatusLabel(status = '', statusState = '') {
  const normalized = normalizeKey(status)
  if (!normalized || normalized === 'ready_to_send' || normalized === 'pending') {
    return normalizeKey(statusState) === 'sent' ? 'sent' : 'pending'
  }
  return normalized
}

function resolveSignerStatusTone(status = '', statusState = '') {
  const normalized = resolveSignerStatusLabel(status, statusState)
  if (normalized === 'signed') return 'border-[#cde8d6] bg-[#eef9f2] text-[#2e7b4f]'
  if (normalized === 'viewed') return 'border-[#d6e2ef] bg-[#f4f8fc] text-[#35546c]'
  if (normalized === 'sent') return 'border-[#dbe8fa] bg-[#edf4ff] text-[#215fba]'
  if (normalized === 'declined' || normalized === 'expired' || normalized === 'failed') {
    return 'border-[#f2d7d2] bg-[#fff4f2] text-[#a03a2a]'
  }
  return 'border-[#dfe6ef] bg-[#f5f8fb] text-[#60758d]'
}

function resolveSignerRoster({ packetType = 'mandate', signers = [], mandateSpouseRequired = false, signerDefaults = {} } = {}) {
  const rows = Array.isArray(signers) ? signers : []
  const byRole = new Map()
  for (const row of rows) {
    const role = normalizeKey(row?.signer_role || row?.role)
    if (!role || byRole.has(role)) continue
    byRole.set(role, row)
  }

  const normalizedPacketType = normalizeKey(packetType)
  const blueprint = [
    ...resolveSignerBlueprint(packetType),
    ...(normalizedPacketType === 'mandate' && mandateSpouseRequired
      ? [{ role: 'purchaser_2', label: 'Spouse', required: true }]
      : []),
  ]

  const roster = blueprint.map((item) => {
    const existing = byRole.get(item.role) || null
    const defaults = signerDefaults?.[item.role] || {}
    return {
      role: item.role,
      label: item.label,
      required: Boolean(item.required),
      signer: existing,
      signerName: normalizeText(existing?.signer_name || defaults.signerName || ''),
      signerEmail: normalizeText(existing?.signer_email || defaults.signerEmail || '').toLowerCase(),
      status: resolveSignerStatusLabel(existing?.status, ''),
      statusRaw: existing?.status || '',
      seenAt: normalizeText(existing?.viewed_at || ''),
      signedAt: normalizeText(existing?.signed_at || ''),
    }
  })

  const configured = new Set(roster.map((row) => row.role))
  for (const row of rows) {
    const role = normalizeKey(row?.signer_role || row?.role)
    if (!role || configured.has(role)) continue
    if (normalizedPacketType === 'mandate' && role === 'purchaser_2' && !mandateSpouseRequired) continue
    const defaults = signerDefaults?.[role] || {}
    roster.push({
      role,
      label: role.replace(/_/g, ' '),
      required: false,
      signer: row,
      signerName: normalizeText(row?.signer_name || defaults.signerName || ''),
      signerEmail: normalizeText(row?.signer_email || defaults.signerEmail || '').toLowerCase(),
      status: resolveSignerStatusLabel(row?.status, ''),
      statusRaw: row?.status || '',
      seenAt: normalizeText(row?.viewed_at || ''),
      signedAt: normalizeText(row?.signed_at || ''),
    })
  }
  return roster
}

function validateSignerRoster({ roster = [], lifecycleState = 'draft' } = {}) {
  const rows = Array.isArray(roster) ? roster : []
  const blockers = []
  const warnings = []
  const seenEmails = new Map()

  for (const row of rows) {
    const email = normalizeText(row?.signerEmail || '').toLowerCase()
    const name = normalizeText(row?.signerName)
    const isPlaceholder = email.endsWith('@bridge.local')
    if (row.required && !name) {
      blockers.push(`${row.label} name is missing.`)
    }
    if (row.required && (!isValidEmail(email) || isPlaceholder)) {
      blockers.push(`${row.label} email is missing or invalid.`)
    }
    if (email && !isPlaceholder) {
      const existing = seenEmails.get(email)
      if (existing) {
        blockers.push(`Duplicate signer email detected: ${email} is used by ${existing} and ${row.label}.`)
      } else {
        seenEmails.set(email, row.label)
      }
    }
    const signerStatus = normalizeKey(row?.statusRaw || row?.status)
    if (['declined', 'expired'].includes(signerStatus)) {
      warnings.push(`${row.label} is marked as ${signerStatus}. Consider resending the signing request.`)
    }
  }

  if (['approved', 'locked', 'sent', 'partially_signed', 'signed'].includes(lifecycleState)) {
    const requiredCount = rows.filter((row) => row.required).length
    const readyCount = rows.filter((row) => row.required && isValidEmail(row.signerEmail) && normalizeText(row.signerName)).length
    if (requiredCount > 0 && readyCount === 0) {
      blockers.push('Required signers are not configured yet.')
    }
  }

  return {
    blockers,
    warnings,
    isReady: blockers.length === 0,
  }
}

function normalizeSigningMethod(value) {
  const method = normalizeKey(value)
  if (method === 'digital' || method === 'physical') return method
  return 'not_selected'
}

function resolveSigningMethodLabel(method = 'not_selected') {
  const normalized = normalizeSigningMethod(method)
  if (normalized === 'digital') return 'Digital Mandate'
  if (normalized === 'physical') return 'Physical / Printed Mandate'
  return 'Not selected'
}

function hasDigitalSigningStarted(signers = []) {
  const rows = Array.isArray(signers) ? signers : []
  return rows.some((row) =>
    ['sent', 'viewed', 'signed', 'declined', 'expired'].includes(normalizeKey(row?.status)),
  )
}

const MERGE_TOKEN_REGEX = /{{\s*([a-zA-Z0-9._-]+)\s*}}/g
const DEFAULT_MANDATE_INTRODUCTION_PURPOSE =
  'This Mandate Agreement records the appointment of the Agent by the Seller to market the property described in this agreement and to perform the related services set out herein. The purpose of this document is to confirm the parties, the property, the mandate terms, commission arrangements, and any special conditions applicable to the marketing and sale of the property.'

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function normalizePlaceholderTokens(input = []) {
  const rows = Array.isArray(input) ? input : []
  return rows
    .map((row) => {
      if (Array.isArray(row)) {
        const token = normalizeText(row[0])
        const label = normalizeText(row[1]) || token
        if (!token) return null
        return { token, label, required: false }
      }
      if (row && typeof row === 'object') {
        const token = normalizeText(row.token || row.key || row.placeholderKey)
        const label = normalizeText(row.label || row.placeholderLabel || token)
        if (!token) return null
        return {
          token,
          label,
          required: Boolean(row.required),
        }
      }
      return null
    })
    .filter(Boolean)
}

function extractTemplateTokens(section = {}) {
  if (Array.isArray(section?.placeholders)) {
    return normalizePlaceholderTokens(section.placeholders)
  }
  if (section?.placeholders && typeof section.placeholders === 'object') {
    return Object.entries(section.placeholders).map(([token, label]) => ({
      token: normalizeText(token),
      label: normalizeText(label) || normalizeText(token),
      required: false,
    })).filter((item) => item.token)
  }
  return []
}

function detectMalformedMergeTokens(content = '') {
  const text = String(content || '')
  const openCount = (text.match(/{{/g) || []).length
  const closeCount = (text.match(/}}/g) || []).length
  return openCount !== closeCount
}

function buildDefaultSectionContent(section = {}, placeholders = {}) {
  const tokenRows = extractTemplateTokens(section)
  const heading = normalizeText(section?.label || 'Clause')
  if (normalizeKey(section?.key) === 'introduction_purpose') {
    return normalizeText(placeholders?.mandate_introduction_purpose) || DEFAULT_MANDATE_INTRODUCTION_PURPOSE
  }
  const base = [`${heading}`, '', 'Update this clause with transaction-specific legal wording before sending for signature.']
  const tokenLines = tokenRows.map((row) => {
    const resolvedValue = normalizeText(placeholders?.[row.token])
    return `- ${row.label}: ${resolvedValue || `{{${row.token}}}`}`
  })
  return [...base, ...(tokenLines.length ? ['', ...tokenLines] : [])].join('\n')
}

function convertManifestToEditableSections({
  packetType = 'mandate',
  manifest = [],
  placeholders = {},
  editableSnapshot = null,
} = {}) {
  const snapshotSections = Array.isArray(editableSnapshot?.sections) ? editableSnapshot.sections : []
  const snapshotByKey = new Map(snapshotSections.map((row) => [normalizeText(row?.key), row]))
  let sourceRows = Array.isArray(manifest) ? manifest : []
  const manifestHasMandateIntro = sourceRows.some((section) => normalizeKey(section?.key) === 'introduction_purpose')
  const snapshotMandateIntro = snapshotSections.find((section) => normalizeKey(section?.key) === 'introduction_purpose')
  const shouldInsertMandateIntro =
    normalizeKey(packetType) === 'mandate' &&
    !manifestHasMandateIntro &&
    !snapshotSections.some((section) => normalizeKey(section?.key) === 'introduction_purpose')
  if (shouldInsertMandateIntro) {
    sourceRows = [
      {
        key: 'introduction_purpose',
        label: 'Introduction and Purpose',
        required: true,
        placeholders: [['mandate_introduction_purpose', 'Introduction and Purpose']],
      },
      ...sourceRows,
    ]
  }
  if (!manifestHasMandateIntro && snapshotMandateIntro) {
    sourceRows = [snapshotMandateIntro, ...sourceRows]
  }
  const sourceKeySet = new Set(sourceRows.map((section) => normalizeText(section?.key)).filter(Boolean))
  const snapshotOnlyRows = snapshotSections.filter((section) => {
    const key = normalizeText(section?.key)
    return key && !sourceKeySet.has(key)
  })
  if (snapshotOnlyRows.length) {
    sourceRows = [...sourceRows, ...snapshotOnlyRows]
  }

  return sourceRows.map((section, index) => {
    const key = normalizeText(section?.key || `section_${index + 1}`)
    const snapshot = snapshotByKey.get(key)
    const tokenRows = normalizePlaceholderTokens(snapshot?.tokens || extractTemplateTokens(section)).map((token) => ({
      ...token,
      required: token.required || Boolean(section?.required),
    }))
    const isCustomSection = Boolean(section?.custom || snapshot?.custom)
    const hasSnapshotContent = Boolean(snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'content'))
    const content = hasSnapshotContent
      ? String(snapshot?.content || '')
      : isCustomSection
        ? String(section?.content || '')
        : normalizeText(section?.content) || buildDefaultSectionContent(section, placeholders)
    return {
      key,
      label: normalizeText(section?.label || snapshot?.label || `Section ${index + 1}`),
      required: Boolean(section?.required || snapshot?.required),
      content,
      tokens: tokenRows,
      custom: isCustomSection,
      visible: section?.visible !== false,
      editableBy: Array.isArray(section?.editableBy) ? section.editableBy : ['principal', 'admin', 'agent'],
    }
  })
}

function renderEditablePreviewHtml({
  packetType = 'mandate',
  title = 'Draft Preview',
  transactionReference = '',
  sections = [],
  branding = null,
} = {}) {
  const subtitle = normalizeText(transactionReference)
  const isMandate = normalizeKey(packetType) === 'mandate'
  const orgName = normalizeText(branding?.organisationName) || 'Agency Workspace'
  const agencyLogo =
    normalizeText(branding?.logoLightUrl) ||
    normalizeText(branding?.organisationLogoUrl) ||
    normalizeText(branding?.logoDarkUrl) ||
    normalizeText(branding?.logoHighContrastUrl) ||
    normalizeText(branding?.organisationLogoDarkUrl) ||
    normalizeText(branding?.organisationLogoHighContrastUrl)
  const bridgeLogo = normalizeText(branding?.bridgeLogoLightUrl) || BRIDGE_LOGO_LIGHT_URL
  const bridgeFallbackLabel = 'Bridge 9'
  const renderClauseText = (value) =>
    escapeHtml(value)
      .replace(/{{\s*([a-zA-Z0-9._-]+)\s*}}/g, '<span class="merge-missing">{{$1}}</span>')
      .replace(/\n/g, '<br />')

  const rows = (Array.isArray(sections) ? sections : [])
    .map((section, index) => {
      const content = String(section?.content || '')
      if (isMandate) {
        const blocks = content
          .split(/\n{2,}/)
          .map((block) => normalizeText(block))
          .filter(Boolean)
          .map((block) => `<p>${renderClauseText(block)}</p>`)
          .join('')
        return `
          <section class="legal-section">
            <h2><span>${index + 1}.</span> ${escapeHtml(section?.label || 'Clause')}</h2>
            ${blocks || '<p class="muted">No clause text captured.</p>'}
          </section>
        `
      }
      const paragraphHtml = content
        .split(/\n{2,}/)
        .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
        .join('')
      return `
        <article class="section">
          <h3>${escapeHtml(section?.label || 'Clause')}</h3>
          ${paragraphHtml || '<p class="muted">No clause text captured.</p>'}
        </article>
      `
    })
    .join('')

  if (isMandate) {
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { margin: 0; padding: 24px; font-family: Helvetica, Arial, sans-serif; background: #eef2f6; color: #1f2937; }
          .page { box-sizing: border-box; width: min(100%, 210mm); min-height: 286mm; margin: 0 auto; background: #fff; border: 1px solid #d8d8d8; box-shadow: 0 20px 56px rgba(15, 23, 42, 0.12); }
          .doc-header { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 18mm 18mm 8mm; border-bottom: 1px solid #d7d7d7; }
          .agency-brand, .bridge-brand { display: inline-flex; align-items: center; min-width: 0; color: #1f2937; font-size: 16px; font-weight: 800; letter-spacing: 0.01em; }
          .agency-brand img { max-width: 42mm; max-height: 15mm; object-fit: contain; }
          .bridge-brand { justify-content: flex-end; color: #68727d; }
          .bridge-brand img { max-width: 36mm; max-height: 12mm; object-fit: contain; }
          .doc-title { padding: 9mm 18mm 6mm; text-align: center; border-bottom: 1px solid #e4e4e4; }
          .doc-title h1 { margin: 0; color: #111827; font-size: 24px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }
          .doc-title p { margin: 7px 0 0; color: #5c6670; font-size: 12px; line-height: 1.45; }
          .doc-body { padding: 9mm 18mm 16mm; }
          .legal-section { margin: 0 0 9mm; break-inside: avoid; page-break-inside: avoid; }
          .legal-section h2 { margin: 0 0 4mm; padding: 0 0 2mm; border-bottom: 1px solid #d7d7d7; color: #111827; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; line-height: 1.35; text-transform: uppercase; }
          .legal-section h2 span { display: inline-block; min-width: 22px; }
          .legal-section p { margin: 0 0 3.5mm; color: #1f2937; font-size: 13px; line-height: 1.72; }
          .muted { color: #7c8ea4; }
          .merge-missing { color: #8a3b15; background: #fff6df; box-shadow: inset 0 -0.45em 0 rgba(255, 214, 120, 0.32); font-weight: 700; }
          .doc-footer { display: flex; align-items: center; justify-content: space-between; gap: 8mm; padding: 5mm 18mm 7mm; border-top: 1px solid #d8d8d8; color: #606a75; font-size: 10.5px; }
          .footer-brand, .footer-bridge { display: inline-flex; align-items: center; min-width: 34mm; max-width: 44mm; }
          .footer-bridge { justify-content: flex-end; }
          .doc-footer img { max-width: 34mm; max-height: 9mm; object-fit: contain; }
          .page-no { flex: 1; text-align: center; font-weight: 700; }
          @media print {
            body { padding: 0; background: #fff; }
            .page { width: 210mm; min-height: 297mm; border: 0; box-shadow: none; }
          }
          @media (max-width: 780px) {
            body { padding: 10px; }
            .page { min-height: 0; }
            .doc-header, .doc-title, .doc-body, .doc-footer { padding-left: 14px; padding-right: 14px; }
            .doc-footer { flex-wrap: wrap; justify-content: center; text-align: center; }
          }
        </style>
      </head>
      <body>
        <main class="page">
          <header class="doc-header">
            <span class="agency-brand">${agencyLogo ? `<img src="${escapeHtml(agencyLogo)}" alt="${escapeHtml(orgName)} logo" />` : escapeHtml(orgName)}</span>
            <span class="bridge-brand">${bridgeLogo ? `<img src="${escapeHtml(bridgeLogo)}" alt="Bridge 9" />` : escapeHtml(bridgeFallbackLabel)}</span>
          </header>
          <section class="doc-title">
            <h1>${escapeHtml(title)}</h1>
            <p>Document reference: ${escapeHtml(subtitle || 'Draft workspace preview')}<br />Preview pagination is illustrative; final PDF pagination is calculated during document export.</p>
          </section>
          <section class="doc-body">
            ${rows || '<section class="legal-section"><p class="muted">No draft sections are available yet.</p></section>'}
          </section>
          <footer class="doc-footer">
            <span class="footer-brand">${agencyLogo ? `<img src="${escapeHtml(agencyLogo)}" alt="${escapeHtml(orgName)} logo" />` : escapeHtml(orgName)}</span>
            <span class="page-no">Page 1 of 1 (preview)</span>
            <span class="footer-bridge">${bridgeLogo ? `<img src="${escapeHtml(bridgeLogo)}" alt="Bridge 9" />` : escapeHtml(bridgeFallbackLabel)}</span>
          </footer>
        </main>
      </body>
    </html>
    `
  }

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>${escapeHtml(title)}</title>
      <style>
        body { margin: 0; padding: 28px; font-family: "Avenir Next", "Segoe UI", sans-serif; background: #f7f9fc; color: #1b2c42; }
        .wrap { max-width: 920px; margin: 0 auto; background: white; border: 1px solid #d8e2ee; border-radius: 18px; padding: 26px; }
        h1 { margin: 0 0 4px; font-size: 24px; letter-spacing: -0.02em; }
        .sub { margin: 0 0 22px; color: #5f748c; font-size: 13px; }
        .type { display: inline-block; margin-bottom: 12px; border: 1px solid #d6e1ed; border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 700; color: #35546c; text-transform: uppercase; letter-spacing: 0.08em; }
        .section { border: 1px solid #e3ebf4; border-radius: 14px; padding: 14px 16px; margin-bottom: 12px; }
        .section h3 { margin: 0 0 10px; font-size: 15px; }
        .section p { margin: 0 0 8px; line-height: 1.6; font-size: 13px; }
        .muted { color: #7c8ea4; }
      </style>
    </head>
    <body>
      <main class="wrap">
        <span class="type">${escapeHtml(packetType)}</span>
        <h1>${escapeHtml(title)}</h1>
        <p class="sub">${escapeHtml(subtitle || 'Draft workspace preview')}</p>
        ${rows || '<article class="section"><p class="muted">No draft sections are available yet.</p></article>'}
      </main>
    </body>
  </html>
  `
}

function resolveWorkspaceStatusLabel(state) {
  const normalized = normalizeKey(state)
  if (normalized === 'no_packet') return 'No Draft'
  if (normalized === 'draft') return 'Draft'
  if (normalized === 'in_review') return 'Draft'
  if (normalized === 'approved') return 'Ready to Send'
  if (normalized === 'sent') return 'Sent for Signature'
  if (normalized === 'partially_signed') return 'Partially Signed'
  if (normalized === 'signed') return 'Fully Signed'
  if (normalized === 'archived') return 'Archived'
  if (normalized === 'voided') return 'Voided'
  return 'Status Unavailable'
}

function resolveSnapshotObject(...candidates) {
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) return candidate
  }
  return {}
}

function resolveFirstBrandingValue(source = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(source?.[key])
    if (value) return value
  }
  return ''
}

function resolveWorkspaceBranding({
  branding = null,
  packet = null,
  latestVersion = null,
  transactionReference = '',
} = {}) {
  const packetBranding = resolveSnapshotObject(
    packet?.branding_snapshot_json,
    packet?.brandingSnapshotJson,
  )
  const versionBranding = resolveSnapshotObject(
    latestVersion?.branding_snapshot_json,
    latestVersion?.brandingSnapshotJson,
  )
  const merged = {
    ...packetBranding,
    ...versionBranding,
    ...(branding && typeof branding === 'object' ? branding : {}),
  }
  const organisationName =
    normalizeText(merged.organisationName) ||
    normalizeText(merged.organisation_name) ||
    normalizeText(merged.displayName) ||
    normalizeText(merged.name) ||
    'Agency Workspace'
  const organisationInitials = organisationName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'AW'

  return {
    organisationName,
    organisationInitials,
    organisationLogoUrl: resolveFirstBrandingValue(merged, [
      'logoLightUrl',
      'logoLight',
      'organisationLogoUrl',
      'organisation_logo_url',
      'logo_url',
      'light_logo_url',
    ]),
    organisationLogoDarkUrl: resolveFirstBrandingValue(merged, [
      'logoHighContrastUrl',
      'highContrastLogoUrl',
      'organisationLogoHighContrastUrl',
      'organisation_high_contrast_logo_url',
      'logoDarkUrl',
      'logoDark',
      'organisationLogoDarkUrl',
      'organisation_logo_dark_url',
      'dark_logo_url',
      'logo_high_contrast_url',
    ]),
    bridgeLegalName: normalizeText(merged.bridgeLegalName) || normalizeText(merged.bridge_legal_name) || 'Bridge Legal',
    bridgeLogoLabel: normalizeText(merged.bridgeLogoLabel) || 'Bridge 9',
    bridgeLogoLightUrl: normalizeText(merged.bridgeLogoLightUrl) || normalizeText(merged.bridge_legal_logo_light_url) || BRIDGE_LOGO_LIGHT_URL,
    bridgeLogoDarkUrl: normalizeText(merged.bridgeLogoDarkUrl) || normalizeText(merged.bridge_legal_logo_dark_url) || BRIDGE_LOGO_DARK_URL,
    transactionReference: normalizeText(transactionReference),
  }
}

function resolvePrimaryActionLabel(mode, statusState, packetType) {
  const typeLabel = normalizeKey(packetType) === 'otp' ? 'OTP' : 'Mandate'
  const modeKey = normalizeKey(mode)
  if (modeKey === 'generate') {
    return normalizeKey(statusState) === 'no_packet' ? 'Generate Draft' : 'Preview Draft'
  }
  if (modeKey === 'edit') return 'Preview Draft'
  if (modeKey === 'send') return 'Send for Signature'
  if (modeKey === 'signed') return 'View Signed PDF'
  if (modeKey === 'view') {
    if (normalizeKey(statusState) === 'signed') return 'View Signed PDF'
    return `View ${typeLabel}`
  }
  if (normalizeKey(statusState) === 'in_review') return 'Preview Draft'
  if (normalizeKey(statusState) === 'approved') return 'Send for Signature'
  if (normalizeKey(statusState) === 'draft') return 'Preview Draft'
  if (normalizeKey(statusState) === 'signed') return 'View Signed PDF'
  return `Open ${typeLabel}`
}

function resolveModeFromAction(actionKey) {
  const key = normalizeKey(actionKey)
  if (key === 'generate') return 'generate'
  if (key === 'edit') return 'edit'
  if (key === 'send') return 'send'
  if (key === 'view_signed') return 'signed'
  return 'view'
}

const NORMALIZED_LIFECYCLE_STEPS = ['draft', 'approved', 'locked', 'sent', 'partially_signed', 'signed', 'archived']
const PHYSICAL_MANDATE_LIFECYCLE_STEPS = ['draft', 'approved', 'locked', 'printed', 'uploaded', 'signed', 'archived']
const PHYSICAL_LIFECYCLE_STATE_MAP = {
  sent: 'printed',
  partially_signed: 'uploaded',
}

function resolveDisplayLifecycleState(state = 'draft', signingMethod = 'digital') {
  const normalizedState = normalizeLifecycleState(state)
  if (normalizeSigningMethod(signingMethod) !== 'physical') return normalizedState
  return PHYSICAL_LIFECYCLE_STATE_MAP[normalizedState] || normalizedState
}

function resolveLifecycleSteps(signingMethod = 'digital') {
  return normalizeSigningMethod(signingMethod) === 'physical'
    ? PHYSICAL_MANDATE_LIFECYCLE_STEPS
    : NORMALIZED_LIFECYCLE_STEPS
}

const MANDATE_STATUS_BADGES = {
  draft: { label: 'Draft', className: 'border-[#dbe5f0] bg-[#f7fbff] text-[#526b84]' },
  generated: { label: 'Generated', className: 'border-[#cddded] bg-[#f1f7fd] text-[#2f5f89]' },
  generated_for_physical_signature: { label: 'Physical Signature Pending', className: 'border-[#f1dfb8] bg-[#fff8eb] text-[#8a5b12]' },
  uploaded_signed: { label: 'Signed PDF Uploaded', className: 'border-[#cde8d6] bg-[#eef9f2] text-[#2e7b4f]' },
  sent_for_signature: { label: 'Sent for Digital Signing', className: 'border-[#cddded] bg-[#f1f7fd] text-[#2f5f89]' },
  sent_to_agent: { label: 'Sent to Agent', className: 'border-[#cddded] bg-[#f1f7fd] text-[#2f5f89]' },
  agent_signed: { label: 'Agent Signed', className: 'border-[#f1dfb8] bg-[#fff8eb] text-[#8a5b12]' },
  sent_to_seller: { label: 'Sent to Seller', className: 'border-[#cddded] bg-[#f1f7fd] text-[#2f5f89]' },
  seller_signed: { label: 'Seller Signed', className: 'border-[#cde8d6] bg-[#eef9f2] text-[#2e7b4f]' },
  completed: { label: 'Completed', className: 'border-[#cde8d6] bg-[#eef9f2] text-[#2e7b4f]' },
  viewed: { label: 'Viewed by Seller', className: 'border-[#d8d2f0] bg-[#f5f2ff] text-[#5d4d9a]' },
  signed: { label: 'Signed', className: 'border-[#cde8d6] bg-[#eef9f2] text-[#2e7b4f]' },
  declined: { label: 'Declined', className: 'border-[#f1d8d0] bg-[#fff5f3] text-[#973824]' },
  cancelled: { label: 'Cancelled', className: 'border-[#e1e7ef] bg-[#f5f7fa] text-[#5d6d7f]' },
  failed: { label: 'Failed', className: 'border-[#f1d8d0] bg-[#fff5f3] text-[#973824]' },
}

function normalizeMandateStatus(statusState = null, sourceContext = {}, latestVersion = null) {
  const explicit = normalizeKey(statusState?.signingStatus || sourceContext.signing_status || sourceContext.signingStatus || sourceContext.mandateStatus)
  if (MANDATE_STATUS_BADGES[explicit]) return explicit
  if (normalizeText(latestVersion?.final_signed_file_path || latestVersion?.final_signed_file_url)) {
    return normalizeSigningMethod(sourceContext.signing_method || sourceContext.signingMethod) === 'physical' ? 'uploaded_signed' : 'signed'
  }
  if (normalizeText(latestVersion?.rendered_file_path || latestVersion?.rendered_file_url)) return 'generated'
  return 'draft'
}

function getMandateNextAction(status = 'draft', signingMethod = 'not_selected') {
  const normalized = normalizeKey(status)
  const method = normalizeSigningMethod(signingMethod)
  if (normalized === 'draft') return 'Generate the mandate PDF.'
  if (normalized === 'generated' && method === 'not_selected') return 'Choose digital signing or physical signature.'
  if (normalized === 'generated' && method === 'digital') return 'Send the mandate to the seller for digital signing.'
  if (normalized === 'generated' && method === 'physical') return 'Download the mandate for physical signature.'
  if (normalized === 'generated_for_physical_signature') return 'Upload the signed PDF once the seller has signed the printed document.'
  if (normalized === 'sent_for_signature') return 'Monitor signing progress or resend the signing link if needed.'
  if (normalized === 'sent_to_agent') return 'Wait for the agency representative to sign first.'
  if (normalized === 'agent_signed') return 'Agent has signed. Seller invitation is being prepared.'
  if (normalized === 'sent_to_seller') return 'Agent has signed. Wait for the seller to sign.'
  if (normalized === 'seller_signed' || normalized === 'completed') return 'All required signatures are complete.'
  if (normalized === 'viewed') return 'Seller has viewed the mandate. Wait for signature or follow up.'
  if (normalized === 'uploaded_signed') return 'Signed PDF is stored against this mandate.'
  if (normalized === 'signed') return 'Mandate is signed and stored.'
  if (normalized === 'declined') return 'Review the seller response and decide whether to resend or cancel.'
  if (normalized === 'failed') return 'Review the latest failure and retry after fixing the issue.'
  if (normalized === 'cancelled') return 'No further signing action is available on this mandate.'
  return 'Review mandate status.'
}

function normalizeLifecycleState(rawState = '') {
  const state = normalizeKey(rawState)
  if (state === 'no_packet' || !state) return 'draft'
  if (state === 'completed') return 'signed'
  if (state === 'voided') return 'archived'
  return NORMALIZED_LIFECYCLE_STEPS.includes(state) ? state : 'draft'
}

function resolveLifecycleCopy(state = 'draft', signingMethod = 'digital') {
  const key = resolveDisplayLifecycleState(state, signingMethod)
  const digitalMap = {
    draft: {
      current: 'Document is still editable.',
      next: 'Next step: approve this draft when it is ready.',
    },
    in_review: {
      current: 'Waiting for legal review and approval.',
      next: 'Next step: approve draft when legal checks pass.',
    },
    approved: {
      current: 'Document approved and ready for final locking.',
      next: 'Next step: lock this draft before signature sending.',
    },
    locked: {
      current: 'Document locked and ready to send.',
      next: 'Next step: send to signers.',
    },
    sent: {
      current: 'Waiting for signer completion.',
      next: 'Next step: monitor signing progress.',
    },
    partially_signed: {
      current: 'Some signers have completed.',
      next: 'Next step: wait for all required signatures.',
    },
    signed: {
      current: 'All signers completed successfully.',
      next: 'Next step: view and archive final signed artifact.',
    },
    archived: {
      current: 'Document lifecycle is archived.',
      next: 'No further actions available.',
    },
  }
  const physicalMap = {
    draft: {
      current: 'Document is still editable.',
      next: 'Next step: choose Physical / Printed Mandate and prepare the PDF.',
    },
    approved: {
      current: 'Document approved for physical signing.',
      next: 'Next step: lock the mandate before printing.',
    },
    locked: {
      current: 'Document is ready to print and sign offline.',
      next: 'Next step: download and print the mandate.',
    },
    printed: {
      current: 'Mandate is ready for physical signature.',
      next: 'Next step: upload the signed copy once all parties have signed.',
    },
    uploaded: {
      current: 'Signed mandate copy has been uploaded.',
      next: 'Next step: finalize and archive the manual signed record.',
    },
    signed: {
      current: 'Manual signed mandate is finalized.',
      next: 'Next step: view and archive the final signed artifact.',
    },
    archived: {
      current: 'Document lifecycle is archived.',
      next: 'No further actions available.',
    },
  }
  const map = normalizeSigningMethod(signingMethod) === 'physical' ? physicalMap : digitalMap
  return map[key] || map.draft
}

function resolveLifecycleProgress(state = 'draft', signingMethod = 'digital') {
  const steps = resolveLifecycleSteps(signingMethod)
  const key = resolveDisplayLifecycleState(state, signingMethod)
  const index = steps.indexOf(key)
  if (index < 0) return 0
  return Math.round(((index + 1) / steps.length) * 100)
}

function canEditForLifecycle(state = 'draft') {
  const key = normalizeLifecycleState(state)
  return key === 'draft' || key === 'in_review'
}

function canFinalizeSigningSummary(summary = null) {
  const signerCount = Number(summary?.signerCount || 0)
  const requiredSignatures = Number(summary?.requiredSignatures || 0)
  const allSignersSigned = Boolean(summary?.allSignersSigned)
  const requiredFieldCount = Number(summary?.requiredFieldCount || 0)
  const completedRequiredFieldCount = Number(summary?.completedRequiredFieldCount || 0)
  const allRequiredFieldsCompleted = Boolean(summary?.allRequiredFieldsCompleted)
  if (!signerCount || !requiredSignatures) return false
  if (!allSignersSigned) return false
  if (requiredFieldCount > 0 && !(allRequiredFieldsCompleted || completedRequiredFieldCount === requiredFieldCount)) {
    return false
  }
  return true
}

function humanizeLifecycleEvent(eventType = '') {
  const key = normalizeKey(eventType)
  const labels = {
    version_created: 'Draft created',
    validation_run: 'Validation run',
    draft_edited: 'Edited draft',
    draft_marked_in_review: 'Submitted for review',
    review_returned_to_draft: 'Returned to draft',
    draft_approved: 'Approved draft',
    document_locked: 'Locked document',
    sent_for_signature: 'Sent for signature',
    signing_method_selected: 'Signing method selected',
    signing_method_changed: 'Signing method changed',
    physical_mandate_downloaded: 'Physical mandate downloaded',
    manual_signed_document_uploaded: 'Manual signed mandate uploaded',
    signed_physical_mandate_uploaded: 'Signed physical mandate uploaded',
    digital_signing_prepared: 'Digital signing prepared',
    digital_signature_sent: 'Digital signature sent',
    mandate_sent_for_digital_signing: 'Mandate sent for digital signing',
    mandate_signing_link_resent: 'Mandate signing link resent',
    mandate_signing_email_resent: 'Mandate signing email resent',
    signer_link_viewed: 'Seller viewed mandate',
    signer_completed_signing: 'Seller signed mandate',
    mandate_signed_by_seller: 'Seller signed mandate',
    all_signers_completed: 'All signers completed mandate',
    signing_fields_prepared: 'Prepared signer fields',
    packet_regenerated: 'Regenerated draft',
    mandate_pdf_created: 'Mandate PDF created',
    mandate_validation_failed: 'Mandate validation failed',
    generation_started: 'Mandate generation started',
    generation_failed: 'Mandate generation failed',
    mandate_failed: 'Mandate action failed',
    packet_archived: 'Archived packet',
    final_signed_generated: 'Final signed generated',
  }
  return labels[key] || normalizeText(eventType).replace(/_/g, ' ')
}

function resolveEventMessage(event = {}) {
  const payload = event?.event_payload_json && typeof event.event_payload_json === 'object' ? event.event_payload_json : {}
  return normalizeText(payload.message) || humanizeLifecycleEvent(event?.event_type)
}

function resolveEventActor(event = {}) {
  const payload = event?.event_payload_json && typeof event.event_payload_json === 'object' ? event.event_payload_json : {}
  return normalizeText(payload.actor_name || payload.actorName) ||
    (normalizeText(event?.created_by) ? `Actor ${normalizeText(event.created_by).slice(0, 8)}…` : 'System action')
}

function getSafeErrorSummary(error = null) {
  const code = normalizeText(error?.code || error?.name)
  const message = normalizeText(error?.message || error)
  return {
    error_code: code || 'UNKNOWN_ERROR',
    safe_error_summary: message.slice(0, 240) || 'The action failed.',
  }
}

function DocumentOutlinePanel({
  sections = [],
  activeSectionKey = '',
  onSelectSection = null,
  canAddCustomSection = false,
  customSectionLabel = '',
  onCustomSectionLabelChange = null,
  onAddCustomSection = null,
  onRemoveSection = null,
  validationByKey = {},
  editorAvailable = false,
  onSwitchToEditor = null,
  mergeSummary = null,
}) {
  const fallbackSections = ['Parties', 'Property Details', 'Purchase Terms', 'Suspensive Conditions', 'Special Conditions', 'Signatures']
  const outlineSections = Array.isArray(sections) && sections.length
    ? sections
      .map((item) => ({
        key: normalizeText(item?.key || item?.label),
        label: normalizeText(item?.label || item?.key),
        custom: Boolean(item?.custom),
        required: Boolean(item?.required),
        content: normalizeText(item?.content),
      }))
      .filter((item) => item.label)
    : fallbackSections
      .map((label) => ({ key: label, label, custom: false, required: true, content: '' }))
  return (
    <section className="flex h-full min-h-[700px] flex-col rounded-[24px] border border-[#e5edf7] bg-white p-5 shadow-[0_16px_40px_rgba(16,32,51,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-[1rem] font-semibold text-[#102033]">Document Outline</h4>
          <p className="mt-1 text-xs text-[#6b7c93]">Navigate the mandate structure without changing the underlying document flow.</p>
        </div>
        {editorAvailable ? (
          <button
            type="button"
            onClick={onSwitchToEditor}
            className="inline-flex items-center rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c7d8eb] hover:bg-white"
          >
            Edit
          </button>
        ) : null}
      </div>

      <ul className="mt-5 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {outlineSections.map((item, index) => {
          const validation = validationByKey?.[item.key] || { blockers: [], warnings: [] }
          const hasContent = normalizeText(item.content).length >= 8
          const isComplete = hasContent && !validation.blockers?.length
          const hasAttention = !isComplete && (item.required || validation.blockers?.length || validation.warnings?.length)
          const isActive = activeSectionKey ? activeSectionKey === item.key : index === 0
          return (
            <li key={item.key || item.label}>
              <button
                type="button"
                onClick={() => onSelectSection?.(item.key)}
                className={`group flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition ${
                  isActive
                    ? 'border border-[#d7e8ff] bg-[#f4f8ff] shadow-[inset_3px_0_0_#0a66ff]'
                    : 'border border-transparent hover:bg-[#f8fbff]'
                }`}
              >
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  isActive ? 'bg-white text-[#0a66ff]' : 'bg-[#f4f7fb] text-[#6b7c93]'
                }`}>
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[#102033]">{item.label}</span>
                  {item.custom ? (
                    <span className="mt-0.5 block text-[0.72rem] text-[#6b7c93]">Custom section</span>
                  ) : null}
                </span>
                {isComplete ? (
                  <CheckCircle2 size={16} className="shrink-0 text-[#20b26b]" />
                ) : hasAttention ? (
                  <span className="inline-flex h-3 w-3 shrink-0 rounded-full bg-[#f5a524]" />
                ) : (
                  <Circle size={14} className="shrink-0 text-[#c7d3e3]" />
                )}
                {canAddCustomSection && !item.required ? (
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation()
                      onRemoveSection?.(item.key)
                    }}
                    className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#f1d9d2] bg-white text-[#b65b4b] opacity-0 transition group-hover:opacity-100"
                    aria-label={`Remove ${item.label}`}
                    title={`Remove ${item.label}`}
                  >
                    <X size={12} />
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>

      {canAddCustomSection ? (
        <div className="mt-5 rounded-[20px] border border-dashed border-[#d8e5f4] bg-[#fbfdff] p-4">
          <button
            type="button"
            onClick={onAddCustomSection}
            disabled={!normalizeText(customSectionLabel)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] border border-[#dde7f1] bg-white px-4 py-3 text-sm font-semibold text-[#35546c] transition hover:border-[#c9d8e9] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus size={15} />
            Add Custom Section
          </button>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={customSectionLabel}
              onChange={(event) => onCustomSectionLabelChange?.(event.target.value)}
              placeholder="Section name"
              className="min-w-0 flex-1 rounded-[14px] border border-[#d7e1ed] bg-white px-3 py-2.5 text-sm text-[#20344b] outline-none transition focus:border-[#9ec3eb] focus:ring-2 focus:ring-[#9ec3eb]/30"
            />
          </div>
        </div>
      ) : null}

      {mergeSummary ? (
        <div className="mt-5 border-t border-[#edf3fa] pt-5">
          {mergeSummary}
        </div>
      ) : null}
    </section>
  )
}

function MergeChecklistSummary({ packetType = 'mandate', placeholders = {}, onOpen = null }) {
  const { rows, unknownKeys } = buildMergeChecklistRows({ packetType, placeholders })
  const resolvedCount = rows.filter((row) => row.value).length
  const unresolvedCount = rows.filter((row) => !row.value).length

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-[0.95rem] font-semibold text-[#102033]">Merge Fields</h4>
          <p className="mt-1 text-xs text-[#6b7c93]">Resolved from onboarding, transaction, and packet context.</p>
        </div>
        <button
          type="button"
          onClick={() => onOpen?.()}
          className="inline-flex items-center rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c7d8eb] hover:bg-white"
        >
          View details
        </button>
      </div>
      <div className="mt-4 rounded-[18px] border border-[#edf3fa] bg-[#f8fbff] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[1.1rem] font-semibold text-[#102033]">{resolvedCount}/{rows.length} resolved</p>
            <p className="mt-1 text-sm text-[#6b7c93]">
              {unresolvedCount ? `${unresolvedCount} unresolved field${unresolvedCount === 1 ? '' : 's'}` : 'All tracked fields are resolved'}
            </p>
          </div>
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
            unresolvedCount ? 'border-[#f7debb] bg-[#fff8ed] text-[#b57a1d]' : 'border-[#d8f0e3] bg-[#effaf4] text-[#20b26b]'
          }`}>
            {unresolvedCount ? 'Needs review' : 'Ready'}
          </span>
        </div>
        {unknownKeys.length ? (
          <p className="mt-3 text-xs text-[#6b7c93]">
            {unknownKeys.length} unmapped field{unknownKeys.length === 1 ? '' : 's'} still need template review.
          </p>
        ) : null}
      </div>
    </div>
  )
}

function MergeChecklistPanel({ packetType = 'mandate', placeholders = {}, compact = false, onOpen = null }) {
  const { rows, unknownKeys } = buildMergeChecklistRows({ packetType, placeholders })
  const resolvedCount = rows.filter((row) => row.value).length
  const unresolvedCount = rows.filter((row) => !row.value).length

  if (compact) {
    return (
      <section className="rounded-[24px] border border-[#e5edf7] bg-white p-5 shadow-[0_16px_40px_rgba(16,32,51,0.05)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-[1rem] font-semibold text-[#102033]">Merge Fields</h4>
            <p className="mt-1 text-xs text-[#6b7c93]">Resolved from onboarding, transaction, and packet context.</p>
          </div>
          <button
            type="button"
            onClick={() => onOpen?.()}
            className="inline-flex items-center rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c7d8eb] hover:bg-white"
          >
            View details
          </button>
        </div>
        <div className="mt-4 rounded-[18px] border border-[#edf3fa] bg-[#f8fbff] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[1.2rem] font-semibold text-[#102033]">{resolvedCount}/{rows.length} resolved</p>
              <p className="mt-1 text-sm text-[#6b7c93]">
                {unresolvedCount ? `${unresolvedCount} unresolved field${unresolvedCount === 1 ? '' : 's'}` : 'All tracked fields are resolved'}
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
              unresolvedCount ? 'border-[#f7debb] bg-[#fff8ed] text-[#b57a1d]' : 'border-[#d8f0e3] bg-[#effaf4] text-[#20b26b]'
            }`}>
              {unresolvedCount ? 'Needs review' : 'Ready'}
            </span>
          </div>
          {unknownKeys.length ? (
            <p className="mt-3 text-xs text-[#6b7c93]">
              {unknownKeys.length} unmapped field{unknownKeys.length === 1 ? '' : 's'} still need template review.
            </p>
          ) : null}
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <article key={row.key} className="rounded-[18px] border border-[#e8eef7] bg-white px-4 py-3 shadow-[0_10px_28px_rgba(16,32,51,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#102033]">{row.label}</p>
              <p className="mt-1 font-mono text-[0.73rem] text-[#6b7c93]">{row.key}</p>
            </div>
            <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${resolveMergeStatusTone(row.status)}`}>
              {resolveMergeStatusLabel(row.status)}
            </span>
          </div>
          <p className="mt-3 text-sm text-[#102033]">{row.value || 'Not resolved yet'}</p>
          <p className="mt-1 text-xs text-[#6b7c93]">Source: {row.source}</p>
          {row.alias ? (
            <p className="mt-2 text-xs font-semibold text-[#4463d1]">
              Deprecated alias resolved: {row.alias} {'->'} {row.key}
            </p>
          ) : null}
          {!row.value && row.required ? (
            <p className="mt-2 text-xs font-semibold text-[#c46a44]">Required before generation.</p>
          ) : null}
        </article>
      ))}
      {unknownKeys.length ? (
        <div className="rounded-[18px] border border-[#f7debb] bg-[#fff8ed] px-4 py-3 text-sm text-[#9a6715]">
          {unknownKeys.length} unmapped field{unknownKeys.length === 1 ? '' : 's'} detected. Review template placeholders before finalizing.
        </div>
      ) : null}
    </div>
  )
}

function SignerChecklistPanel({ packetType = 'mandate', signers = [], statusState, mandateSpouseRequired = false }) {
  const signerRows = resolveSignerRoster({ packetType, signers, mandateSpouseRequired })
  return (
    <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4">
      <h4 className="text-sm font-semibold text-[#1a2f45]">Signer Checklist</h4>
      <div className="mt-3 space-y-2">
        {signerRows.map((row) => {
          const resolvedStatus = resolveSignerStatusLabel(row.statusRaw || row.status, statusState)
          const statusTimestamp = row.signedAt || row.seenAt || ''
          return (
            <article key={row.role} className="rounded-[10px] border border-[#e0e8f2] bg-[#f8fbff] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#2b3f57]">
                  {row.label}
                  {row.required ? <span className="ml-1 text-[#7b8ea4]">*</span> : null}
                </p>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold capitalize ${resolveSignerStatusTone(row.statusRaw || row.status, statusState)}`}>
                  {resolvedStatus}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#6b8098]">{row.signerName || 'Name pending'} • {row.signerEmail || 'Email pending'}</p>
              {statusTimestamp ? (
                <p className="mt-0.5 text-[0.68rem] text-[#8397ad]">Updated {formatDateTime(statusTimestamp)}</p>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function DraftEditorPanel({
  sections = [],
  onChangeSection = null,
  onInsertToken = null,
  validationByKey = {},
  collapsedSectionKeys = new Set(),
  onToggleSection = null,
}) {
  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const validation = validationByKey?.[section.key] || { blockers: [], warnings: [] }
        const tokenRows = Array.isArray(section.tokens) ? section.tokens : []
        const collapsed = collapsedSectionKeys instanceof Set
          ? collapsedSectionKeys.has(section.key)
          : Array.isArray(collapsedSectionKeys) && collapsedSectionKeys.includes(section.key)
        return (
          <article
            key={section.key}
            id={`legal-workspace-section-${slugifySectionKey(section.key)}`}
            className="scroll-mt-6 rounded-[16px] border border-[#dce6f2] bg-white p-3 sm:p-4"
          >
            <div className={`${collapsed ? '' : 'mb-2'} flex flex-wrap items-center justify-between gap-2`}>
              <button
                type="button"
                onClick={() => onToggleSection?.(section.key)}
                className="inline-flex min-w-0 items-center gap-2 text-left text-sm font-semibold text-[#1a2f45]"
              >
                {collapsed ? <ChevronRight size={15} className="shrink-0 text-[#7187a0]" /> : <ChevronDown size={15} className="shrink-0 text-[#7187a0]" />}
                <span className="truncate">{section.label}</span>
              </button>
              <div className="flex items-center gap-1.5">
                {section.custom ? (
                  <span className="inline-flex rounded-full border border-[#d9e5f1] bg-[#f5f8fc] px-2 py-0.5 text-[0.65rem] font-semibold text-[#61758c]">
                    Custom
                  </span>
                ) : null}
                {section.required ? (
                  <span className="inline-flex rounded-full border border-[#e8d8bc] bg-[#fff8ea] px-2 py-0.5 text-[0.65rem] font-semibold text-[#8a5b12]">
                    Required
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-[#dde7f1] bg-[#f5f8fc] px-2 py-0.5 text-[0.65rem] font-semibold text-[#61758c]">
                    Optional
                  </span>
                )}
                {validation.blockers.length ? (
                  <span className="inline-flex rounded-full border border-[#f2d7d2] bg-[#fff4f2] px-2 py-0.5 text-[0.65rem] font-semibold text-[#a03a2a]">
                    Blocked
                  </span>
                ) : validation.warnings.length ? (
                  <span className="inline-flex rounded-full border border-[#f4e2bf] bg-[#fff8ec] px-2 py-0.5 text-[0.65rem] font-semibold text-[#8a5b12]">
                    Warning
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-[#cde8d6] bg-[#eef9f2] px-2 py-0.5 text-[0.65rem] font-semibold text-[#2e7b4f]">
                    Ready
                  </span>
                )}
              </div>
            </div>

            {collapsed ? (
              <p className="mt-2 truncate rounded-[10px] border border-[#e6edf5] bg-[#fbfdff] px-3 py-2 text-xs text-[#6f839b]">
                {normalizeText(section.content) || 'No content captured yet.'}
              </p>
            ) : (
              <>
                <textarea
                  value={section.content}
                  onChange={(event) => onChangeSection?.(section.key, event.target.value)}
                  rows={Math.max(5, Math.min(10, String(section.content || '').split('\n').length + 2))}
                  className="w-full resize-y rounded-[12px] border border-[#d8e2ef] bg-[#fbfdff] px-3 py-2 text-sm leading-6 text-[#142132] outline-none transition focus:border-[#84a8cc] focus:ring-2 focus:ring-[#84a8cc]/20"
                  placeholder="Capture legal clause wording for this section..."
                />

                {tokenRows.length ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7187a0]">Insert Merge Field</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tokenRows.map((token) => (
                        <button
                          key={`${section.key}-${token.token}`}
                          type="button"
                          onClick={() => onInsertToken?.(section.key, token.token)}
                          className="inline-flex items-center rounded-full border border-[#d6e1ee] bg-[#f6f9fd] px-2 py-0.5 text-[0.68rem] font-semibold text-[#35546c] transition hover:bg-[#edf4fb]"
                        >
                          {`{{${token.token}}}`}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-[#768ba3]">Optional: click a field to pull live transaction data into this clause.</p>
                  </div>
                ) : null}

                {validation.blockers.length ? (
                  <div className="mt-3 space-y-1 rounded-[10px] border border-[#f2d7d2] bg-[#fff4f2] px-3 py-2 text-xs text-[#a03a2a]">
                    {validation.blockers.map((item, index) => <p key={`${section.key}-b-${index}`}>{item}</p>)}
                  </div>
                ) : null}
                {validation.warnings.length ? (
                  <div className="mt-3 space-y-1 rounded-[10px] border border-[#f4e2bf] bg-[#fff8ec] px-3 py-2 text-xs text-[#8a5b12]">
                    {validation.warnings.map((item, index) => <p key={`${section.key}-w-${index}`}>{item}</p>)}
                  </div>
                ) : null}
              </>
            )}
          </article>
        )
      })}
    </div>
  )
}

function SignerPreparationPanel({
  packetType = 'mandate',
  lifecycleState = 'draft',
  signingStatus = '',
  canManageSigners = true,
  roster = [],
  draftByRole = {},
  onDraftChange = null,
  validation = { blockers: [], warnings: [] },
  onPrepare = null,
  onSave = null,
  onSend = null,
  onResend = null,
  onRefresh = null,
  busy = false,
}) {
  const rows = Array.isArray(roster) ? roster : []
  const canEditRoster = canManageSigners && ['draft', 'in_review', 'approved', 'locked'].includes(normalizeLifecycleState(lifecycleState))
  const canSend = canManageSigners && ['draft', 'in_review', 'approved', 'locked'].includes(normalizeLifecycleState(lifecycleState))
  const canResend = canManageSigners && (
    ['sent', 'partially_signed'].includes(normalizeLifecycleState(lifecycleState)) ||
    ['sent_for_signature', 'sent_to_agent', 'agent_signed', 'sent_to_seller', 'viewed', 'failed'].includes(normalizeKey(signingStatus))
  )
  const agentRow = rows.find((row) => row.role === 'agent') || null
  const agentSigned = Boolean(agentRow?.signedAt) || normalizeKey(agentRow?.statusRaw || agentRow?.status) === 'signed'

  return (
    <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[#1a2f45]">Prepare for Signature</h4>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#dce6f2] bg-[#f7fbff] px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[#5a738d]">
          <UsersRound size={12} />
          {resolveDocumentLabel(packetType)}
        </span>
      </div>
      <p className="mt-2 text-xs text-[#6f839b]">
        Confirm signer identities and readiness before sending secure signing links.
      </p>

      <div className="mt-3 space-y-2">
        {rows.map((row) => {
          const draft = draftByRole[row.role] || { signerName: row.signerName, signerEmail: row.signerEmail }
          const resolvedStatus = resolveSignerStatusLabel(row.statusRaw || row.status, lifecycleState)
          const statusTone = resolveSignerStatusTone(row.statusRaw || row.status, lifecycleState)
          const rowStatus = normalizeKey(row.statusRaw || row.status)
          const editableRow = canEditRoster && (!row.signer || !isValidEmail(row.signerEmail) || row.signerEmail.endsWith('@bridge.local'))
          const canResendRow = canResend &&
            isValidEmail(row.signerEmail) &&
            !['signed', 'declined'].includes(rowStatus) &&
            !(normalizeKey(packetType) === 'mandate' && row.role === 'seller' && !agentSigned)
          return (
            <article key={row.role} className="rounded-[12px] border border-[#e0e8f2] bg-[#fbfdff] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#20344b]">
                  {row.label}
                  {row.required ? <span className="ml-1 text-[#7b8ea4]">*</span> : null}
                </p>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold capitalize ${statusTone}`}>
                  {resolvedStatus}
                </span>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={draft.signerName || ''}
                  onChange={(event) => onDraftChange?.(row.role, 'signerName', event.target.value)}
                  disabled={!editableRow || busy}
                  placeholder={`${row.label} name`}
                  className="rounded-[10px] border border-[#d7e1ed] bg-white px-3 py-2 text-xs text-[#20344b] outline-none focus:border-[#8ca8c4] disabled:cursor-not-allowed disabled:bg-[#f2f6fb] disabled:text-[#7b8fa5]"
                />
                <input
                  type="email"
                  value={draft.signerEmail || ''}
                  onChange={(event) => onDraftChange?.(row.role, 'signerEmail', event.target.value.toLowerCase())}
                  disabled={!editableRow || busy}
                  placeholder={`${row.label} email`}
                  className="rounded-[10px] border border-[#d7e1ed] bg-white px-3 py-2 text-xs text-[#20344b] outline-none focus:border-[#8ca8c4] disabled:cursor-not-allowed disabled:bg-[#f2f6fb] disabled:text-[#7b8fa5]"
                />
              </div>
              {row.signedAt ? (
                <p className="mt-1 text-[0.68rem] text-[#2e7b4f]">Signed {formatDateTime(row.signedAt)}</p>
              ) : row.seenAt && rowStatus === 'viewed' ? (
                <p className="mt-1 text-[0.68rem] text-[#60758d]">Last viewed {formatDateTime(row.seenAt)}</p>
              ) : null}
              {canResendRow ? (
                <div className="mt-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => void onResend?.(row.role)} disabled={busy}>
                    {busy ? 'Working…' : `Resend to ${row.label}`}
                  </Button>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>

      {validation.blockers?.length ? (
        <div className="mt-3 space-y-1 rounded-[10px] border border-[#f2d7d2] bg-[#fff4f2] px-3 py-2 text-xs text-[#a03a2a]">
          {validation.blockers.map((item, index) => <p key={`signer-b-${index}`}>{item}</p>)}
        </div>
      ) : null}
      {validation.warnings?.length ? (
        <div className="mt-3 space-y-1 rounded-[10px] border border-[#f4e2bf] bg-[#fff8ec] px-3 py-2 text-xs text-[#8a5b12]">
          {validation.warnings.map((item, index) => <p key={`signer-w-${index}`}>{item}</p>)}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => void onPrepare?.()} disabled={busy || !canEditRoster}>
          {busy ? 'Working…' : 'Prepare Signer Fields'}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => void onSave?.()} disabled={busy || !canEditRoster}>
          {busy ? 'Working…' : 'Save Signer Details'}
        </Button>
        <Button type="button" size="sm" onClick={() => void onSend?.()} disabled={busy || !canSend}>
          {busy ? 'Working…' : 'Send for Signature'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void onRefresh?.()} disabled={busy}>
          Refresh Signer Status
        </Button>
      </div>
      {!canEditRoster ? (
        <p className="mt-2 text-[0.7rem] text-[#6f839b]">
          {canManageSigners
            ? 'Signer details are locked once this document enters active signing or finalization states.'
            : 'Your role can view signer progress but cannot edit signer details.'}
        </p>
      ) : null}
    </section>
  )
}

function SignaturePreparationCard({
  packetType = 'mandate',
  roster = [],
  validation = { blockers: [], warnings: [] },
  busy = false,
  canManageSigners = true,
  onOpen = null,
}) {
  const rows = Array.isArray(roster) ? roster : []
  const requiredRows = rows.filter((row) => row.required)
  const readyRows = requiredRows.filter((row) => normalizeText(row.signerName) && isValidEmail(row.signerEmail))
  const blockerCount = Array.isArray(validation?.blockers) ? validation.blockers.length : 0
  const warningCount = Array.isArray(validation?.warnings) ? validation.warnings.length : 0
  const readyLabel = requiredRows.length
    ? `${readyRows.length}/${requiredRows.length} ready`
    : 'No required signers'

  return (
    <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-[#1a2f45]">Prepare for Signature</h4>
          <p className="mt-1 text-xs leading-5 text-[#6f839b]">Signer details open in a popup so this page stays tidy.</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="rounded-full border border-[#dce6f2] bg-[#f7fbff] px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-[#5a738d]">
            {resolveDocumentLabel(packetType)}
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${
            blockerCount ? 'border-[#f2d7d2] bg-[#fff4f2] text-[#a03a2a]' : 'border-[#cde8d6] bg-[#eef9f2] text-[#2e7b4f]'
          }`}>
            {readyLabel}
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        {rows.map((row) => {
          const rowReady = normalizeText(row.signerName) && isValidEmail(row.signerEmail)
          return (
            <div key={row.role} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#edf3fa] bg-[#fbfdff] px-3 py-2">
              <span className="min-w-0 truncate text-xs font-semibold text-[#20344b]">{row.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${rowReady ? 'bg-[#effaf4] text-[#2e7b4f]' : 'bg-[#fff8ec] text-[#8a5b12]'}`}>
                {rowReady ? 'Ready' : 'Needs details'}
              </span>
            </div>
          )
        })}
      </div>

      {blockerCount || warningCount ? (
        <p className="mt-3 text-xs text-[#8a6a1d]">
          {blockerCount ? `${blockerCount} signer detail${blockerCount === 1 ? '' : 's'} need attention.` : `${warningCount} signer warning${warningCount === 1 ? '' : 's'} to review.`}
        </p>
      ) : (
        <p className="mt-3 text-xs text-[#2e7b4f]">Signer identities are ready to send.</p>
      )}

      <Button type="button" size="sm" className="mt-3 w-full" onClick={() => onOpen?.()} disabled={busy || !canManageSigners}>
        {busy ? 'Working…' : 'Open Signature Prep'}
      </Button>
    </section>
  )
}

function SigningMethodPanel({
  method = 'not_selected',
  packetType = 'mandate',
  canChange = false,
  lockedReason = '',
  onSelect = null,
  onOpenSignaturePrep = null,
  signaturePrepSummary = null,
  busy = false,
  className = '',
}) {
  const options = [
    {
      key: 'digital',
      title: 'Digital Signing',
      description: 'Send the mandate to the seller to review and sign online.',
      Icon: Link2,
      next: 'Next step: prepare signers and send secure signing links.',
    },
    {
      key: 'physical',
      title: 'Physical Signature',
      description: 'Download the mandate, print it, sign it manually, and upload the signed PDF later.',
      Icon: Printer,
      next: 'Next step: download, print, sign offline, then upload the signed copy.',
    },
  ]

  return (
    <section className={`flex h-full flex-col rounded-[24px] border border-[#e5edf7] bg-white p-5 shadow-[0_16px_40px_rgba(16,32,51,0.05)] ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-[1rem] font-semibold text-[#102033]">Signing Method</h4>
          <p className="mt-1 text-sm text-[#6b7c93]">Choose how you&apos;d like to send this mandate.</p>
        </div>
        <span className="rounded-full border border-[#dce6f2] bg-[#f7fbff] px-3 py-1 text-[0.68rem] font-semibold text-[#526b84]">
          {resolveSigningMethodLabel(method)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {options.map(({ key, title, description, Icon, next }) => {
          const selected = normalizeSigningMethod(method) === key
          const OptionIcon = Icon
          const detailLine = key === 'digital' ? 'Fastest · ±2 mins average' : 'Download, print, sign, upload PDF.'
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect?.(key)}
              disabled={busy || (!canChange && !selected)}
              className={`flex h-full min-h-[150px] flex-col rounded-[20px] border p-4 text-left transition ${
                selected
                  ? 'border-[#0a66ff] bg-[#f4f8ff] shadow-[0_18px_44px_rgba(10,102,255,0.08)]'
                  : 'border-[#e7eef7] bg-[#fbfdff] hover:border-[#c7d8eb] hover:bg-white'
              } ${busy || (!canChange && !selected) ? 'cursor-not-allowed opacity-70' : ''}`}
            >
              <div className="flex min-h-0 flex-1 items-start gap-3">
                <span className={`mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border ${
                  selected ? 'border-[#cfe1ff] bg-white text-[#0a66ff]' : 'border-[#dce6f2] bg-white text-[#6d8299]'
                }`}>
                  <OptionIcon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[1rem] font-semibold text-[#102033]">{title}</span>
                    {selected ? (
                      <span className="rounded-full border border-[#cfe1ff] bg-white px-2 py-0.5 text-[0.62rem] font-semibold text-[#0a66ff]">
                        Selected
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-[#6b7c93]">{description}</span>
                  <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${
                    key === 'digital' ? 'bg-[#eef5ff] text-[#0a66ff]' : 'bg-[#f5f7fb] text-[#6b7c93]'
                  }`}>
                    {detailLine}
                  </span>
                  {selected ? <span className="mt-2 block text-[0.76rem] font-semibold text-[#0a66ff]">{next}</span> : null}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-4 rounded-[20px] border border-[#edf3fa] bg-[#f8fbff] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#102033]">Prepare for Signature</p>
            <p className="mt-1 text-xs leading-5 text-[#6b7c93]">
              Open signer details in a popup so this panel stays compact.
            </p>
          </div>
          <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${
            signaturePrepSummary?.tone === 'amber'
              ? 'border-[#f4e2bf] bg-[#fff8ec] text-[#8a5b12]'
              : 'border-[#cde8d6] bg-[#eef9f2] text-[#2e7b4f]'
          }`}>
            {signaturePrepSummary?.statusLabel || 'Ready to open'}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-[#dce6f2] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#5a738d]">
            {resolveDocumentLabel(packetType)}
          </span>
          <span className="inline-flex rounded-full border border-[#dce6f2] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#5a738d]">
            {signaturePrepSummary?.readyLabel || 'Signer details ready'}
          </span>
        </div>
        {lockedReason ? (
          <p className="mt-3 rounded-[16px] border border-[#f4e2bf] bg-[#fff8ec] px-4 py-3 text-sm text-[#8a5b12]">
            {lockedReason}
          </p>
        ) : !canChange ? (
          <p className="mt-3 text-sm text-[#6b7c93]">Generate the mandate before choosing a signing method.</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" className="w-full" onClick={() => onOpenSignaturePrep?.()} disabled={busy}>
            Open Signature Prep
          </Button>
        </div>
      </div>
    </section>
  )
}

function PhysicalMandatePanel({
  file = null,
  notes = '',
  confirmed = false,
  allPartiesSigned = false,
  uploaded = false,
  uploadedAt = '',
  signedUrl = '',
  busy = false,
  canFinalize = false,
  onDownload = null,
  onFileChange = null,
  onNotesChange = null,
  onConfirmedChange = null,
  onAllPartiesSignedChange = null,
  onUpload = null,
}) {
  return (
    <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-[#1a2f45]">Physical / Printed Mandate</h4>
          <p className="mt-1 text-xs leading-5 text-[#6f839b]">
            Download the mandate, print it, sign it with the seller, then upload the signed copy once completed.
          </p>
        </div>
        <Printer size={18} className="text-[#5d7892]" />
      </div>

      {uploaded ? (
        <article className="mt-3 rounded-[12px] border border-[#cde8d6] bg-[#eef9f2] px-3 py-2 text-xs text-[#2e7b4f]">
          <p className="font-semibold">Signed Mandate — Manual Upload</p>
          <p className="mt-0.5">Finalized {formatDateTime(uploadedAt)}</p>
          {signedUrl ? (
            <a href={signedUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex font-semibold text-[#20563b]">
              View signed copy
            </a>
          ) : null}
        </article>
      ) : (
        <div className="mt-3 space-y-3">
          <Button type="button" size="sm" variant="secondary" onClick={() => void onDownload?.()} disabled={busy}>
            Download PDF
          </Button>
          <label className="block rounded-[12px] border border-dashed border-[#ccdbea] bg-[#f8fbff] px-3 py-3 text-xs text-[#60758d]">
            <span className="flex items-center gap-2 font-semibold text-[#20344b]">
              <UploadCloud size={15} />
              Upload Signed Mandate
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="mt-2 block w-full text-xs text-[#60758d] file:mr-3 file:rounded-full file:border-0 file:bg-[#eaf2fa] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[#294f74]"
              onChange={(event) => onFileChange?.(event.target.files?.[0] || null)}
              disabled={busy || !canFinalize}
            />
            {file ? <span className="mt-2 block text-[#2f5f89]">{file.name}</span> : null}
          </label>
          <textarea
            value={notes}
            onChange={(event) => onNotesChange?.(event.target.value)}
            disabled={busy || !canFinalize}
            placeholder="Optional notes about the in-person signing."
            className="min-h-[76px] w-full rounded-[12px] border border-[#d7e1ed] bg-white px-3 py-2 text-xs text-[#20344b] outline-none focus:border-[#8ca8c4] disabled:bg-[#f3f6fa]"
          />
          <label className="flex items-start gap-2 rounded-[10px] border border-[#e1e9f2] bg-[#fbfdff] px-3 py-2 text-xs text-[#4f657c]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={allPartiesSigned}
              onChange={(event) => onAllPartiesSignedChange?.(event.target.checked)}
              disabled={busy || !canFinalize}
            />
            <span>All required parties have signed.</span>
          </label>
          <label className="flex items-start gap-2 rounded-[10px] border border-[#e1e9f2] bg-[#fbfdff] px-3 py-2 text-xs font-semibold text-[#3d536b]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmed}
              onChange={(event) => onConfirmedChange?.(event.target.checked)}
              disabled={busy || !canFinalize}
            />
            <span>I confirm this uploaded document is the signed mandate.</span>
          </label>
          <Button
            type="button"
            size="sm"
            onClick={() => void onUpload?.()}
            disabled={busy || !canFinalize || !file || !confirmed}
          >
            {busy ? 'Uploading…' : 'Finalize Manual Signed Mandate'}
          </Button>
        </div>
      )}
    </section>
  )
}

function ActivityPanel({
  activeTab = 'all',
  onTabChange = null,
  versions = [],
  events = [],
  templateLabel = '',
  templateKey = '',
  templateStoragePath = '',
  className = '',
}) {
  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'lifecycle', label: 'Lifecycle' },
    { key: 'audit', label: 'Audit' },
    { key: 'versions', label: 'Versions' },
  ]

  const versionItems = (Array.isArray(versions) ? versions : []).map((version) => {
    const provenance = version?.validation_summary_json?.render_provenance || version?.validation_summary_json?.renderProvenance || {}
    const frozen = version?.validation_summary_json?.frozen_render_snapshot || {}
    return {
      id: `version-${version.id}`,
      type: 'version',
      title: `Draft v${version.version_number || '—'}`,
      subtitle: [
        normalizeText(version?.validation_summary_json?.review_state) || normalizeText(version?.render_status) || 'draft',
        normalizeText(version?.generated_by) ? `by ${normalizeText(version.generated_by).slice(0, 8)}…` : '',
      ].filter(Boolean).join(' • '),
      detail: normalizeText(provenance.renderMode || frozen.renderMode)
        ? `${(provenance.renderMode || frozen.renderMode).replace(/_/g, ' ')}${normalizeText(frozen.contentFingerprint || provenance.contentFingerprint) ? ` • ${normalizeText(frozen.contentFingerprint || provenance.contentFingerprint).slice(0, 18)}` : ''}`
        : 'Version captured for this workspace.',
      timestamp: version.updated_at || version.created_at,
      kind: 'version',
    }
  })

  const eventItems = (Array.isArray(events) ? events : []).map((event) => ({
    id: `event-${event.id}`,
    type: 'event',
    title: resolveEventMessage(event),
    subtitle: resolveEventActor(event),
    detail: humanizeLifecycleEvent(event?.event_type),
    timestamp: event?.created_at,
    kind: normalizeText(event?.event_type).includes('audit') ? 'audit' : 'lifecycle',
  }))

  const visibleItems = (() => {
    if (activeTab === 'versions') return versionItems
    if (activeTab === 'lifecycle') return eventItems.filter((item) => item.kind === 'lifecycle')
    if (activeTab === 'audit') return eventItems
    return [...versionItems, ...eventItems].sort((left, right) => compareTimelineDates(left.timestamp, right.timestamp))
  })()

  return (
    <section className={`flex flex-col rounded-[24px] border border-[#e5edf7] bg-white p-5 shadow-[0_16px_40px_rgba(16,32,51,0.05)] ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-[1rem] font-semibold text-[#102033]">Activity</h4>
          <p className="mt-1 text-sm text-[#6b7c93]">Versions, lifecycle events, and audit history in one place.</p>
        </div>
        <span className="rounded-full border border-[#dce6f2] bg-[#f7fbff] px-3 py-1 text-[0.68rem] font-semibold text-[#526b84]">
          {visibleItems.length}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5 rounded-full border border-[#e8eef7] bg-[#f8fbff] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange?.(tab.key)}
            className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
              activeTab === tab.key ? 'bg-white text-[#0a66ff] shadow-[0_8px_18px_rgba(16,32,51,0.08)]' : 'text-[#6b7c93] hover:text-[#102033]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {visibleItems.length ? (
          visibleItems.map((item) => {
            const isVersion = item.type === 'version'
            return (
              <article key={item.id} className="rounded-[18px] border border-[#edf3fa] bg-[#fbfdff] px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    isVersion ? 'bg-[#eef5ff] text-[#0a66ff]' : 'bg-[#effaf4] text-[#20b26b]'
                  }`}>
                    {isVersion ? <FileText size={14} /> : <Check size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#102033]">{item.title}</p>
                    <p className="mt-1 text-xs text-[#6b7c93]">{item.subtitle}</p>
                    <p className="mt-1 text-xs text-[#8a99ad]">{item.detail}</p>
                  </div>
                  <span className="shrink-0 text-[0.72rem] text-[#8a99ad]">{formatDateTime(item.timestamp)}</span>
                </div>
              </article>
            )
          })
        ) : (
          <div className="rounded-[18px] border border-dashed border-[#dbe5f0] bg-[#f9fbff] px-4 py-5 text-sm text-[#6b7c93]">
            No activity captured yet.
          </div>
        )}
      </div>

      <div className="mt-4 rounded-[18px] border border-[#edf3fa] bg-[#f8fbff] px-4 py-3 text-xs text-[#6b7c93]">
        <p className="font-semibold text-[#102033]">Template</p>
        <p className="mt-2">Template: {templateLabel || 'Not linked'}</p>
        <p className="mt-1">Key: {templateKey || '—'}</p>
        <p className="mt-1 break-all">Storage path: {templateStoragePath || 'Missing'}</p>
      </div>
    </section>
  )
}

export default function LegalDocumentWorkspace({
  open = true,
  onClose,
  onBack = null,
  backLabel = 'Back to Transaction',
  displayMode = 'modal',
  transactionId = '',
  transactionReference = '',
  packetType = 'mandate',
  packetId = '',
  mode = 'view',
  initialStatus = null,
  organisationId = null,
  branding = null,
  onGenerate = null,
  onSend = null,
  onEdit = null,
  onView = null,
  onViewSigned = null,
  onRefreshContext = null,
  autoGenerateEnabled = true,
}) {
  const isPageMode = displayMode === 'page'
  const { role: workspaceRole } = useWorkspace()
  const legalPermissions = useMemo(
    () => resolveLegalPermissions(workspaceRole),
    [workspaceRole],
  )
  const [statusState, setStatusState] = useState(initialStatus || null)
  const [packetDetail, setPacketDetail] = useState(null)
  const [templateDetail, setTemplateDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionProgressMessage, setActionProgressMessage] = useState('')
  const [actionFeedback, setActionFeedback] = useState('')
  const [loadError, setLoadError] = useState('')
  const [signerBusy, setSignerBusy] = useState(false)
  const [signerDraftByRole, setSignerDraftByRole] = useState({})
  const [finalizeBusy, setFinalizeBusy] = useState(false)
  const [editableSections, setEditableSections] = useState([])
  const [collapsedSectionKeys, setCollapsedSectionKeys] = useState(() => new Set())
  const [customSectionLabel, setCustomSectionLabel] = useState('')
  const [draftReviewState, setDraftReviewState] = useState('draft')
  const [centerTab, setCenterTab] = useState('preview')
  const [manualSignedFile, setManualSignedFile] = useState(null)
  const [manualSignedNotes, setManualSignedNotes] = useState('')
  const [manualSignedConfirmed, setManualSignedConfirmed] = useState(false)
  const [manualSignedAllPartiesSigned, setManualSignedAllPartiesSigned] = useState(false)
  const [manualUploadBusy, setManualUploadBusy] = useState(false)
  const [mergeDetailsOpen, setMergeDetailsOpen] = useState(false)
  const [signerPrepOpen, setSignerPrepOpen] = useState(false)
  const [activityTab, setActivityTab] = useState('all')
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [bottomActionMenuOpen, setBottomActionMenuOpen] = useState(false)
  const [activeSectionKey, setActiveSectionKey] = useState('')
  const autoFinalizeGuardRef = useRef(new Set())
  const autoGenerateGuardRef = useRef('')
  const autoGenerateRunRef = useRef(0)
  const statusStateRef = useRef(initialStatus || null)
  const actionBusyRef = useRef(false)
  const signerBusyRef = useRef(false)
  const manualUploadBusyRef = useRef(false)
  const physicalDownloadBusyRef = useRef(false)
  const refreshWorkspacePromiseRef = useRef(null)
  const skippedInitialPageRefreshRef = useRef(false)

  useEffect(() => {
    if (!initialStatus) return
    statusStateRef.current = initialStatus
    setStatusState(initialStatus)
  }, [initialStatus])

  useEffect(() => {
    statusStateRef.current = statusState
  }, [statusState])

  useEffect(() => {
    actionBusyRef.current = actionBusy
  }, [actionBusy])

  useEffect(() => {
    signerBusyRef.current = signerBusy
  }, [signerBusy])

  useEffect(() => {
    manualUploadBusyRef.current = manualUploadBusy
  }, [manualUploadBusy])

  useEffect(() => {
    const nextSectionKey = normalizeText(editableSections?.[0]?.key)
    if (!nextSectionKey) {
      if (activeSectionKey) setActiveSectionKey('')
      return
    }
    const sectionStillExists = editableSections.some((section) => normalizeText(section?.key) === activeSectionKey)
    if (!activeSectionKey || !sectionStillExists) {
      setActiveSectionKey(nextSectionKey)
    }
  }, [activeSectionKey, editableSections])

  const effectiveMode = useMemo(() => {
    if (normalizeText(mode)) return normalizeKey(mode)
    const fallbackAction = resolveDocumentPacketActionState({
      packetType,
      state: statusState?.state || 'NO_PACKET',
    })
    return resolveModeFromAction(fallbackAction.actionKey)
  }, [mode, packetType, statusState?.state])

  const latestVersion = useMemo(() => {
    const versions = Array.isArray(statusState?.versions) ? statusState.versions : []
    return getGeneratedPacketVersionForSigning(versions) || getUsablePacketVersionForSigning(versions) || versions[0] || null
  }, [statusState?.versions])

  const workspaceBranding = useMemo(() => resolveWorkspaceBranding({
    branding,
    packet: statusState?.packet || packetDetail,
    latestVersion,
    transactionReference,
  }), [branding, latestVersion, packetDetail, statusState?.packet, transactionReference])

  const normalizedLifecycleState = useMemo(
    () => normalizeLifecycleState(statusState?.state),
    [statusState?.state],
  )
  const isMandatePacket = normalizeKey(packetType) === 'mandate'
  const sourceContext = useMemo(() => (
    statusState?.packet?.source_context_json && typeof statusState.packet.source_context_json === 'object'
      ? statusState.packet.source_context_json
      : {}
  ), [statusState?.packet?.source_context_json])
  const mandateSpouseRequired = useMemo(
    () => {
      if (!isMandatePacket) return false
      const signingRequirement = resolveMandateSpouseRequirementFromSigningSummary(statusState?.signingSummary)
      if (signingRequirement !== null) return signingRequirement
      return mandateRequiresSpouseSignature({ sourceContext, latestVersion })
    },
    [isMandatePacket, latestVersion, sourceContext, statusState?.signingSummary],
  )
  const signerDefaults = useMemo(() => (
    isMandatePacket
      ? buildSignerDefaultsFromContext({ sourceContext, latestVersion })
      : {}
  ), [isMandatePacket, latestVersion, sourceContext])

  const signerRoster = useMemo(() => {
    return resolveSignerRoster({
      packetType,
      signers: statusState?.signingSummary?.signers || [],
      mandateSpouseRequired,
      signerDefaults,
    })
  }, [mandateSpouseRequired, packetType, signerDefaults, statusState?.signingSummary?.signers])

  const signerValidation = useMemo(() => {
    const rosterWithDraft = signerRoster.map((row) => {
      const draft = signerDraftByRole[row.role] || null
      if (!draft) return row
      return {
        ...row,
        signerName: normalizeText(draft.signerName || row.signerName),
        signerEmail: normalizeText(draft.signerEmail || row.signerEmail).toLowerCase(),
      }
    })
    return validateSignerRoster({
      roster: rosterWithDraft,
      lifecycleState: normalizedLifecycleState,
    })
  }, [normalizedLifecycleState, signerDraftByRole, signerRoster])

  const editableAllowed = useMemo(() => {
    return canEditForLifecycle(normalizedLifecycleState)
  }, [normalizedLifecycleState])

  const editableSnapshot = useMemo(() => {
    const summary = latestVersion?.validation_summary_json
    if (summary && typeof summary === 'object' && summary.editable_draft && typeof summary.editable_draft === 'object') {
      return summary.editable_draft
    }
    return null
  }, [latestVersion?.validation_summary_json])

  const editableSectionsValidation = useMemo(() => {
    const byKey = {}
    for (const section of Array.isArray(editableSections) ? editableSections : []) {
      const blockers = []
      const warnings = []
      const content = String(section?.content || '')

      if (section?.required && normalizeText(content).length < 8) {
        blockers.push('Required clause is empty.')
      }
      if (detectMalformedMergeTokens(content)) {
        blockers.push('Malformed merge token syntax detected. Use {{token_name}} format.')
      }
      byKey[section.key] = { blockers, warnings }
    }
    return byKey
  }, [editableSections])

  const draftValidationSummary = useMemo(() => {
    const sections = Object.values(editableSectionsValidation || {})
    const blockers = sections.flatMap((row) => row.blockers || [])
    const warnings = sections.flatMap((row) => row.warnings || [])
    return {
      blockers,
      warnings,
      isValid: blockers.length === 0,
    }
  }, [editableSectionsValidation])

  const generatedPreviewUrl = normalizeText(
    latestVersion?.rendered_file_access_url || latestVersion?.rendered_file_url || '',
  )
  const signedPreviewUrl = normalizeText(
    latestVersion?.final_signed_file_access_url || latestVersion?.final_signed_file_url || '',
  )
  const signedPreviewPath = normalizeText(latestVersion?.final_signed_file_path || '')
  const signerSummary = statusState?.signingSummary || null
  const canFinalizeSignedRecord = useMemo(() => canFinalizeSigningSummary(signerSummary), [signerSummary])
  const isFullySignedLifecycle = normalizedLifecycleState === 'signed'
  const hasFinalArtifact = Boolean(signedPreviewPath || signedPreviewUrl)
  const mandateDataSnapshot = useMemo(() => {
    if (!isMandatePacket) return null
    if (sourceContext.generatedDataSnapshot && typeof sourceContext.generatedDataSnapshot === 'object') {
      return sourceContext.generatedDataSnapshot
    }
    if (latestVersion?.validation_summary_json?.generatedDataSnapshot && typeof latestVersion.validation_summary_json.generatedDataSnapshot === 'object') {
      return latestVersion.validation_summary_json.generatedDataSnapshot
    }
    if (latestVersion?.placeholders_resolved_json && typeof latestVersion.placeholders_resolved_json === 'object') {
      return {
        placeholders: latestVersion.placeholders_resolved_json,
        sourceContext: sourceContext.sourceContext || latestVersion?.validation_summary_json?.sourceContext || {},
      }
    }
    return null
  }, [isMandatePacket, latestVersion?.placeholders_resolved_json, latestVersion?.validation_summary_json, sourceContext])
  const signingMethod = isMandatePacket ? normalizeSigningMethod(sourceContext.signing_method || sourceContext.signingMethod) : 'digital'
  const mandateStatus = isMandatePacket ? normalizeMandateStatus(statusState, sourceContext, latestVersion) : ''
  const mandateStatusMeta = MANDATE_STATUS_BADGES[mandateStatus] || MANDATE_STATUS_BADGES.draft
  const mandateNextAction = getMandateNextAction(
    mandateStatus,
    signingMethod,
    sourceContext.sellerOnboardingStatus || sourceContext.seller_onboarding_status || mandateDataSnapshot?.sourceContext?.onboardingStatus,
  )
  const manualSignedDocumentId = normalizeText(sourceContext.manualSignedDocumentId || sourceContext.manual_signed_document_id)
  const manualSignedFilePath = normalizeText(sourceContext.manualSignedFilePath || sourceContext.manual_signed_file_path)
  const manualSignedUploadedAt = normalizeText(sourceContext.manualSignedUploadedAt || sourceContext.manual_signed_uploaded_at)
  const digitalSigningStarted = hasDigitalSigningStarted(statusState?.signingSummary?.signers)
  const manualSignedUploaded = Boolean(manualSignedDocumentId || manualSignedFilePath)
  const signingMethodLockedReason = (() => {
    if (!isMandatePacket) return ''
    if (hasFinalArtifact) return 'This mandate already has a final signed document. The signing method can no longer be changed.'
    if (manualSignedUploaded) return 'A manually signed mandate has already been uploaded. The signing method can no longer be changed.'
    if (digitalSigningStarted || ['sent', 'partially_signed', 'signed'].includes(normalizedLifecycleState)) {
      return 'This mandate has already been sent for digital signature. The signing method can no longer be changed.'
    }
    return ''
  })()
  const canChangeSigningMethod =
    isMandatePacket &&
    !signingMethodLockedReason &&
    ['draft', 'generated', 'in_review', 'approved', 'locked'].includes(normalizedLifecycleState) &&
    legalPermissions.canEditDraft
  const signerProgressMeta = useMemo(() => {
    const requiredRows = signerRoster.filter((row) => row.required)
    const signedRequired = requiredRows.filter((row) => normalizeKey(row.statusRaw || row.status) === 'signed').length
    const totalRequired = requiredRows.length
    const percent = totalRequired ? Math.round((signedRequired / totalRequired) * 100) : 0
    return {
      signedRequired,
      totalRequired,
      percent,
    }
  }, [signerRoster])
  const signaturePrepSummary = useMemo(() => {
    const blockerCount = Array.isArray(signerValidation.blockers) ? signerValidation.blockers.length : 0
    const warningCount = Array.isArray(signerValidation.warnings) ? signerValidation.warnings.length : 0
    return {
      readyLabel: signerProgressMeta.totalRequired
        ? `${signerProgressMeta.signedRequired}/${signerProgressMeta.totalRequired} ready`
        : 'No required signers',
      statusLabel: blockerCount
        ? `${blockerCount} signer detail${blockerCount === 1 ? '' : 's'} need attention`
        : warningCount
          ? `${warningCount} signer warning${warningCount === 1 ? '' : 's'} to review`
          : 'Signer identities ready',
      tone: blockerCount || warningCount ? 'amber' : 'green',
    }
  }, [
    signerProgressMeta.signedRequired,
    signerProgressMeta.totalRequired,
    signerValidation.blockers.length,
    signerValidation.warnings.length,
  ])

  const editablePreviewHtml = useMemo(() => {
    if (!editableSections.length) return ''
    return renderEditablePreviewHtml({
      packetType,
      title: resolveDocumentLabel(packetType),
      transactionReference,
      sections: editableSections,
      branding: workspaceBranding,
    })
  }, [editableSections, packetType, transactionReference, workspaceBranding])

  const eventHistory = useMemo(() => {
    const rows = Array.isArray(packetDetail?.events) ? packetDetail.events : []
    return rows.slice(0, 8)
  }, [packetDetail?.events])

  const headerStatusLabel = resolveWorkspaceStatusLabel(statusState?.state || 'NO_PACKET')
  const lifecycleCopy = resolveLifecycleCopy(normalizedLifecycleState, signingMethod)
  const lifecycleProgress = resolveLifecycleProgress(normalizedLifecycleState, signingMethod)

  const mergeChecklist = useMemo(() => {
    return buildMergeChecklistRows({
      packetType,
      placeholders: latestVersion?.placeholders_resolved_json || {},
    })
  }, [latestVersion?.placeholders_resolved_json, packetType])

  const mandatePreviewValidation = useMemo(() => {
    if (!isMandatePacket) return null
    return validateMandateGenerationData(mandateDataSnapshot || {}, { action: 'preview' })
  }, [isMandatePacket, mandateDataSnapshot])

  const mergeResolvedCount = mergeChecklist.rows.filter((row) => row.value).length
  const mergeUnresolvedCount = mergeChecklist.rows.filter((row) => !row.value).length
  const documentHealthPercent = mergeChecklist.rows.length
    ? Math.round((mergeResolvedCount / mergeChecklist.rows.length) * 100)
    : lifecycleProgress
  const documentHealthLabel =
    documentHealthPercent >= 85 ? 'Good' : documentHealthPercent >= 60 ? 'Review' : 'Needs work'
  const documentHealthItems = useMemo(() => {
    if (!isMandatePacket) {
      return [
        { key: 'lifecycle', label: 'Lifecycle progress', complete: lifecycleProgress >= 50 },
        { key: 'preview', label: 'Preview available', complete: Boolean(generatedPreviewUrl || signedPreviewUrl || editablePreviewHtml) },
        { key: 'signers', label: 'Signer readiness', complete: signerValidation.blockers.length === 0 },
      ]
    }
    const groups = mandatePreviewValidation?.fieldGroups && typeof mandatePreviewValidation.fieldGroups === 'object'
      ? mandatePreviewValidation.fieldGroups
      : {}
    const commissionWarnings = Array.isArray(groups.mandate?.warnings)
      ? groups.mandate.warnings.filter((issue) => ['commission_percentage', 'commission_amount'].includes(normalizeText(issue?.field)))
      : []
    return [
      {
        key: 'seller',
        label: 'Seller details',
        complete: !((groups.seller?.warnings || []).length || (groups.seller?.missingRequiredFields || []).length),
      },
      {
        key: 'property',
        label: 'Property details',
        complete: !((groups.property?.warnings || []).length || (groups.property?.missingRequiredFields || []).length),
      },
      {
        key: 'commission',
        label: 'Commission terms',
        complete: commissionWarnings.length === 0,
      },
    ]
  }, [
    editablePreviewHtml,
    generatedPreviewUrl,
    isMandatePacket,
    lifecycleProgress,
    mandatePreviewValidation?.fieldGroups,
    signedPreviewUrl,
    signerValidation.blockers.length,
  ])

  const workspaceSummary = useMemo(() => {
    const leadSummary = sourceContext.lead && typeof sourceContext.lead === 'object' ? sourceContext.lead : {}
    const transactionSummary = sourceContext.transaction && typeof sourceContext.transaction === 'object' ? sourceContext.transaction : {}
    const privateListingSummary = sourceContext.privateListing && typeof sourceContext.privateListing === 'object' ? sourceContext.privateListing : {}
    const sellerName = firstNonEmptyText(
      mandateDataSnapshot?.seller?.fullName,
      leadSummary.name,
      [leadSummary.sellerName, leadSummary.sellerSurname].map(normalizeText).filter(Boolean).join(' '),
    )
    const propertyLabel = firstNonEmptyText(
      mandateDataSnapshot?.property?.fullAddress,
      privateListingSummary.propertyAddress,
      leadSummary.propertyAddress,
      leadSummary.listingTitle,
      transactionSummary.property_address,
      transactionReference,
    )
    const stageLabel = firstNonEmptyText(
      leadSummary.stage,
      transactionSummary.stage,
      transactionSummary.current_main_stage,
      mandateStatusMeta.label,
      headerStatusLabel,
    )
    const statusLabel = firstNonEmptyText(
      normalizeText(headerStatusLabel).toLowerCase() === 'no draft' ? mandateStatusMeta.label : headerStatusLabel,
      normalizeText(headerStatusLabel).toLowerCase() === 'no draft' ? headerStatusLabel : mandateStatusMeta.label,
      normalizeText(statusState?.packet?.status),
    )
    const savedAt = firstNonEmptyText(
      latestVersion?.updated_at,
      latestVersion?.created_at,
      statusState?.packet?.updated_at,
      statusState?.packet?.created_at,
    )
    return {
      badge: firstNonEmptyText(mandateStatusMeta.label, headerStatusLabel, 'Draft'),
      seller: sellerName || 'Seller unavailable',
      property: propertyLabel || 'Property unavailable',
      transaction: transactionReference || 'Transaction reference unavailable',
      stage: stageLabel || 'Stage unavailable',
      status: statusLabel || 'Status unavailable',
      savedLabel: actionBusy
        ? 'Saving changes…'
        : savedAt
          ? `Saved ${formatRelativeTime(savedAt)}`
          : 'Draft not saved yet',
      savedAt,
    }
  }, [
    actionBusy,
    headerStatusLabel,
    latestVersion?.created_at,
    latestVersion?.updated_at,
    mandateDataSnapshot?.property?.fullAddress,
    mandateDataSnapshot?.seller?.fullName,
    mandateStatusMeta.label,
    sourceContext.lead,
    sourceContext.privateListing,
    sourceContext.transaction,
    statusState?.packet?.created_at,
    statusState?.packet?.status,
    statusState?.packet?.updated_at,
    transactionReference,
  ])

  const canSendForSignatureAction =
    legalPermissions.canManageSigners &&
    signingMethod === 'digital' &&
    ['draft', 'in_review', 'approved', 'locked'].includes(normalizedLifecycleState)
  const primaryLabel = useMemo(() => {
    if (normalizedLifecycleState === 'approved' || normalizedLifecycleState === 'locked') return 'Send for Signature'
    return resolvePrimaryActionLabel(effectiveMode, statusState?.state, packetType)
  }, [effectiveMode, normalizedLifecycleState, packetType, statusState?.state])

  const assertWorkspacePermission = useCallback((permissionKey, actionLabel) => {
    if (legalPermissions?.[permissionKey]) return
    throw new Error(`Your role cannot ${actionLabel} in this legal workspace.`)
  }, [legalPermissions])

  const assertMandateActionValidation = useCallback((action, extra = {}) => {
    if (!isMandatePacket) return null
    const validation = validateMandateGenerationData(mandateDataSnapshot || {}, {
      action,
      packetId: normalizeText(extra.packetId || statusStateRef.current?.packet?.id || packetId),
      versionId: normalizeText(extra.versionId || latestVersion?.id),
      leadId: normalizeText(extra.leadId || statusStateRef.current?.packet?.lead_id || ''),
      transactionId: normalizeText(extra.transactionId || statusStateRef.current?.packet?.transaction_id || transactionId),
      relatedRecordId: normalizeText(extra.relatedRecordId || statusStateRef.current?.packet?.lead_id || statusStateRef.current?.packet?.transaction_id || transactionId),
      file: extra.file,
      hasPermission: extra.hasPermission,
      signing: extra.signing || {},
    })
    if (validation.canProceed) return validation
    if (action !== 'upload_signed') {
      console.warn('[MANDATE] workspace preflight found missing data; continuing with action.', {
        action,
        missingRequiredFields: validation.missingRequiredFields,
        warnings: validation.warnings,
      })
      return validation
    }
    const error = new Error(formatMandateValidationMessage(validation))
    error.code = 'MANDATE_PREFLIGHT_BLOCKED'
    error.validation = validation
    throw error
  }, [isMandatePacket, latestVersion?.id, mandateDataSnapshot, packetId, transactionId])

  const refreshWorkspaceData = useCallback(async () => {
    if (refreshWorkspacePromiseRef.current) {
      return refreshWorkspacePromiseRef.current
    }

    let refreshPromise = null
    refreshPromise = (async () => {
      const currentStatus = statusStateRef.current || null
      const rawPacketId = normalizeText(currentStatus?.packet?.id || packetId)
      const currentPacketId = isPersistedPacketId(rawPacketId) ? rawPacketId : ''
      if ((!currentPacketId && currentStatus) || isRuntimePacketId(currentPacketId)) {
        setStatusState(currentStatus)
        setPacketDetail(null)
        return {
          resolved: currentStatus,
          detail: null,
        }
      }

      const resolved = await withWorkspaceTimeout(
        resolveDocumentPacketStatus({
          packetType,
          packetId: currentPacketId,
          transactionId,
          organisationId,
        }),
        'Packet status is taking too long to load.',
      ).catch((error) => {
        console.warn('[LegalDocumentWorkspace] packet status refresh timed out; keeping workspace usable.', error)
        return statusStateRef.current || buildWorkspaceFallbackStatus(packetType, 'Packet status is still loading. You can continue preparing the draft.')
      })
      setStatusState(resolved)

      const resolvedPacketId = normalizeText(resolved?.packet?.id || currentPacketId)
      if (isUuidLike(resolvedPacketId)) {
        try {
          const detail = await withWorkspaceTimeout(
            fetchDocumentPacket(resolvedPacketId, { includeVersions: false, includeEvents: true }),
            'Packet events are taking too long to load.',
          )
          setPacketDetail(detail || null)
          return {
            resolved,
            detail: detail || null,
          }
        } catch (error) {
          console.warn('[LegalDocumentWorkspace] packet detail refresh timed out; hiding audit history for now.', error)
          setPacketDetail(null)
          return {
            resolved,
            detail: null,
          }
        }
      }

      setPacketDetail(null)
      return {
        resolved,
        detail: null,
      }
    })().finally(() => {
      if (refreshWorkspacePromiseRef.current === refreshPromise) {
        refreshWorkspacePromiseRef.current = null
      }
    })

    refreshWorkspacePromiseRef.current = refreshPromise
    return refreshPromise
  }, [organisationId, packetId, packetType, transactionId])

  const logMandateFailure = useCallback(async (failedAction, error) => {
    if (!isMandatePacket) return
    const currentStatus = statusStateRef.current || {}
    const currentPacket = currentStatus?.packet || {}
    const currentPacketId = normalizeText(currentPacket?.id || packetId)
    if (!isUuidLike(currentPacketId)) return
    const currentSourceContext =
      currentPacket?.source_context_json && typeof currentPacket.source_context_json === 'object'
        ? currentPacket.source_context_json
        : {}
    const safeError = getSafeErrorSummary(error)
    const validation = error?.validation && typeof error.validation === 'object' ? error.validation : null
    try {
      await appendDocumentPacketEvent({
        packetId: currentPacketId,
        organisationId,
        versionId: normalizeText(latestVersion?.id) || null,
        eventType: validation ? 'mandate_validation_failed' : 'mandate_failed',
        eventPayload: {
          activity_type: validation ? 'mandate_validation_failed' : 'mandate_failed',
          lead_id: currentPacket?.lead_id || currentSourceContext.leadId || currentSourceContext.lead_id || null,
          transaction_id: currentPacket?.transaction_id || currentSourceContext.transactionId || transactionId || null,
          private_listing_id: currentPacket?.private_listing_id || currentSourceContext.privateListingId || null,
          document_packet_id: currentPacketId,
          document_packet_version_id: normalizeText(latestVersion?.id) || null,
          actor_role: workspaceRole,
          failed_action: failedAction,
          validation_result: validation
            ? {
                canProceed: validation.canProceed,
                summary: validation.summary || null,
              }
            : null,
          missing_fields: validation?.missingRequiredFields || [],
          source_context: currentSourceContext,
          message: validation
            ? 'Mandate generation failed because required information is missing.'
            : 'Mandate action failed. Please retry or refresh the workspace.',
          visibility: 'internal',
          metadata: safeError,
        },
      })
    } catch (auditError) {
      console.warn('[LegalDocumentWorkspace] mandate failure audit write skipped.', auditError)
    }
  }, [isMandatePacket, latestVersion?.id, organisationId, packetId, transactionId, workspaceRole])

  const updateWorkspacePacket = useCallback(async (targetPacketId, updates = {}) => {
    const resolvedPacketId = normalizeText(targetPacketId)
    if (!resolvedPacketId) throw new Error('Document packet is required before saving.')
    if (!isPersistedPacketId(resolvedPacketId)) {
      throw new Error('Document packet reference is not saved yet. Generate the packet again before continuing.')
    }
    if (isRuntimePacketId(resolvedPacketId)) {
      const updatedAt = new Date().toISOString()
      let updatedRuntimePacket = null
      setStatusState((previous) => {
        if (previous?.packet?.id !== resolvedPacketId) return previous
        const currentSourceContext = previous.packet.source_context_json && typeof previous.packet.source_context_json === 'object'
          ? previous.packet.source_context_json
          : {}
        updatedRuntimePacket = {
          ...previous.packet,
          ...(updates.title ? { title: updates.title } : {}),
          source_context_json: updates.sourceContextJson && typeof updates.sourceContextJson === 'object'
            ? {
                ...currentSourceContext,
                ...updates.sourceContextJson,
              }
            : previous.packet.source_context_json,
          updated_at: updatedAt,
        }
        return { ...previous, packet: updatedRuntimePacket }
      })
      return updatedRuntimePacket
    }

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
      const updatedPacket = await updateDocumentPacket(resolvedPacketId, await prepareUpdates())
      setStatusState((previous) => (
        previous?.packet?.id === updatedPacket?.id
          ? { ...previous, packet: updatedPacket }
          : previous
      ))
      return updatedPacket
    } catch (error) {
      if (normalizeText(error?.code).toUpperCase() !== 'STALE_PACKET_STATE') throw error
      const updatedPacket = await updateDocumentPacket(resolvedPacketId, await prepareUpdates())
      setStatusState((previous) => (
        previous?.packet?.id === updatedPacket?.id
          ? { ...previous, packet: updatedPacket }
          : previous
      ))
      return updatedPacket
    }
  }, [])

  const updateWorkspaceVersion = useCallback(async (packetVersionId, updates = {}) => {
    const resolvedVersionId = normalizeText(packetVersionId)
    if (!resolvedVersionId || !isUuidLike(resolvedVersionId)) return null
    const updatedVersion = await updateDocumentPacketVersion(resolvedVersionId, updates)
    setStatusState((previous) => {
      if (!previous?.versions?.length) return previous
      return {
        ...previous,
        versions: previous.versions.map((version) => (
          normalizeText(version?.id) === resolvedVersionId ? updatedVersion : version
        )),
      }
    })
    return updatedVersion
  }, [])

  useEffect(() => {
    let active = true
    if (!open) return () => { active = false }
    if (isPageMode && hasLoadedWorkspaceSnapshot(initialStatus) && !skippedInitialPageRefreshRef.current) {
      skippedInitialPageRefreshRef.current = true
      return () => {
        active = false
      }
    }

    const load = async () => {
      const shouldBlockPreview = !statusStateRef.current
      setLoading(shouldBlockPreview)
      setLoadError('')
      setActionFeedback('')
      try {
        await refreshWorkspaceData()
      } catch (error) {
        if (!active) return
        setLoadError(toFriendlyWorkspaceError(error, 'Unable to load document workspace right now.'))
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [initialStatus, isPageMode, open, refreshWorkspaceData])

  useEffect(() => {
    let active = true
    const templateId = normalizeText(statusState?.packet?.template_id)
    if (!open || !templateId) {
      setTemplateDetail(null)
      return () => {
        active = false
      }
    }

    const loadTemplate = async () => {
      try {
        const template = await fetchDocumentPacketTemplate(templateId, { includeSections: false })
        if (!active) return
        setTemplateDetail(template || null)
      } catch {
        if (active) setTemplateDetail(null)
      }
    }
    void loadTemplate()
    return () => {
      active = false
    }
  }, [open, statusState?.packet?.template_id])

  useEffect(() => {
    if (!open) return
    const manifest = Array.isArray(latestVersion?.section_manifest_json)
      ? latestVersion.section_manifest_json
      : []
    const placeholderMap = latestVersion?.placeholders_resolved_json && typeof latestVersion.placeholders_resolved_json === 'object'
      ? latestVersion.placeholders_resolved_json
      : {}
    const sections = convertManifestToEditableSections({
      packetType,
      manifest,
      placeholders: placeholderMap,
      editableSnapshot,
    })
    setEditableSections(sections)
    setCollapsedSectionKeys(new Set(sections.slice(1).map((section) => normalizeText(section?.key)).filter(Boolean)))
    setDraftReviewState(
      normalizeText(editableSnapshot?.review_state) || normalizeText(latestVersion?.validation_summary_json?.review_state) || 'draft',
    )
    if (sections.length && editableAllowed) {
      setCenterTab('editor')
    } else {
      setCenterTab('preview')
    }
  }, [editableAllowed, editableSnapshot, latestVersion?.id, latestVersion?.placeholders_resolved_json, latestVersion?.section_manifest_json, latestVersion?.validation_summary_json?.review_state, open, packetType])

  useEffect(() => {
    if (!open) return
    setSignerDraftByRole((previous) => {
      const next = {}
      for (const row of signerRoster) {
        const previousRow = previous[row.role] || {}
        next[row.role] = {
          signerName: normalizeText(previousRow.signerName || row.signerName),
          signerEmail: normalizeText(previousRow.signerEmail || row.signerEmail).toLowerCase(),
        }
      }
      return next
    })
  }, [open, signerRoster])

  useEffect(() => {
    if (!open) return
    if (loading || actionBusy || signerBusy || finalizeBusy) return
    if (!['sent', 'partially_signed', 'signed'].includes(normalizedLifecycleState)) return
    if (!canFinalizeSignedRecord) return
    if (hasFinalArtifact) return

    const resolvedPacketId = normalizeText(statusState?.packet?.id)
    const resolvedVersionId = normalizeText(latestVersion?.id)
    if (!resolvedPacketId || !resolvedVersionId) return
    const guardKey = `${resolvedPacketId}:${resolvedVersionId}`
    if (autoFinalizeGuardRef.current.has(guardKey)) return
    autoFinalizeGuardRef.current.add(guardKey)

    let active = true
    const runAutoFinalize = async () => {
      if (active) {
        setFinalizeBusy(true)
        setActionProgressMessage('Finalizing signed legal record…')
      }
      try {
        const result = await generateFinalSignedPacketDocument({
          packetId: resolvedPacketId,
          packetVersionId: resolvedVersionId,
          organisationId: statusState?.packet?.organisation_id || organisationId || null,
        })
        const nowIso = new Date().toISOString()
        await updateWorkspacePacket(resolvedPacketId, {
          status: 'completed',
          completedAt: nowIso,
          sourceContextJson: {
            ...(statusState?.packet?.source_context_json || {}),
            lifecycle_state: 'signed',
            finalizedAt: nowIso,
            finalSignedVersionId: resolvedVersionId,
            finalArtifactPath: normalizeText(result?.finalArtifact?.path || latestVersion?.final_signed_file_path || ''),
          },
        })
        await onRefreshContext?.()
        await refreshWorkspaceData()
        if (active) {
          setActionFeedback('All signers completed. Final signed copy has been archived.')
        }
      } catch (error) {
        if (active) {
          setLoadError(toFriendlyWorkspaceError(error, 'Unable to finalize signed record automatically.'))
        }
      } finally {
        if (active) {
          setFinalizeBusy(false)
          setActionProgressMessage('')
        }
      }
    }

    void runAutoFinalize()
    return () => {
      active = false
    }
  }, [
    actionBusy,
    canFinalizeSignedRecord,
    finalizeBusy,
    hasFinalArtifact,
    latestVersion?.id,
    latestVersion?.final_signed_file_path,
    loading,
    normalizedLifecycleState,
    onRefreshContext,
    organisationId,
    open,
    refreshWorkspaceData,
    signerBusy,
    statusState?.packet?.organisation_id,
    statusState?.packet?.id,
    statusState?.packet?.source_context_json,
    statusState?.packet?.updated_at,
    updateWorkspacePacket,
  ])

  function handleChangeSection(sectionKey, value) {
    const nextValue = String(value || '')
    setEditableSections((previous) =>
      previous.map((section) => (section.key === sectionKey ? { ...section, content: nextValue } : section)),
    )
  }

  function handleInsertToken(sectionKey, token) {
    const normalizedToken = normalizeText(token)
    if (!normalizedToken) return
    setEditableSections((previous) =>
      previous.map((section) => {
        if (section.key !== sectionKey) return section
        const text = String(section.content || '')
        const insertion = text.endsWith('\n') || !text ? `{{${normalizedToken}}}` : ` {{${normalizedToken}}}`
        return {
          ...section,
          content: `${text}${insertion}`,
        }
      }),
    )
  }

  function handleToggleSection(sectionKey) {
    const key = normalizeText(sectionKey)
    if (!key) return
    setCollapsedSectionKeys((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleAddCustomSection() {
    if (!editableAllowed) {
      setLoadError('Custom sections can only be added while this document is editable.')
      return
    }
    const label = normalizeText(customSectionLabel)
    if (!label) {
      setLoadError('Name the custom section before adding it to the document outline.')
      return
    }
    const key = `custom_${slugifySectionKey(label) || 'section'}_${Date.now().toString(36)}`
    setEditableSections((previous) => [
      ...previous,
      {
        key,
        label,
        required: false,
        content: '',
        tokens: [],
        visible: true,
        custom: true,
        editableBy: ['principal', 'admin', 'agent'],
      },
    ])
    setCollapsedSectionKeys((previous) => {
      const next = new Set(previous)
      next.delete(key)
      return next
    })
    setCustomSectionLabel('')
    setCenterTab('editor')
    setLoadError('')
  }

  function handleRemoveSection(sectionKey) {
    if (!editableAllowed || !legalPermissions.canEditDraft) {
      setLoadError('Document sections can only be removed while this document is editable.')
      return
    }
    const key = normalizeText(sectionKey)
    if (!key) return
    const target = editableSections.find((section) => normalizeText(section.key) === key)
    if (!target) return
    if (target.required) {
      setLoadError('Required mandate sections cannot be removed.')
      return
    }
    setEditableSections((previous) => previous.filter((section) => normalizeText(section.key) !== key))
    setCollapsedSectionKeys((previous) => {
      const next = new Set(previous)
      next.delete(key)
      return next
    })
    setActionFeedback(`${target.label || 'Section'} removed from this draft.`)
    setLoadError('')
  }

  function handleSignerDraftChange(role, field, value) {
    const normalizedRole = normalizeKey(role)
    if (!normalizedRole || !['signerName', 'signerEmail'].includes(field)) return
    setSignerDraftByRole((previous) => ({
      ...previous,
      [normalizedRole]: {
        ...(previous[normalizedRole] || {}),
        [field]: field === 'signerEmail' ? normalizeText(value).toLowerCase() : String(value || ''),
      },
    }))
  }

  async function saveSignerDetails({ includeOptional = false } = {}) {
    assertWorkspacePermission('canManageSigners', 'manage signer details')
    const currentStatus = statusStateRef.current || statusState
    const resolvedPacketId = normalizeText(currentStatus?.packet?.id || packetId)
    if (!resolvedPacketId) throw new Error('Generate a packet first before assigning signers.')
    const currentSigningVersion = getGeneratedPacketVersionForSigning(currentStatus?.versions || [])
    if (!currentSigningVersion?.id) throw createWorkspaceError('NO_GENERATED_VERSION', 'Generate a packet version before assigning signers.')

    const payload = signerRoster
      .map((row, index) => {
        const draft = signerDraftByRole[row.role] || {}
        const signerName = normalizeText(draft.signerName || row.signerName)
        const signerEmail = normalizeText(draft.signerEmail || row.signerEmail).toLowerCase()
        const isRequired = Boolean(row.required)
        const isPlaceholder = signerEmail.endsWith('@bridge.local')
        if (!signerName || !signerEmail || !isValidEmail(signerEmail) || isPlaceholder) return null
        if (!includeOptional && !isRequired) return null
        const existingEmail = normalizeText(row.signerEmail).toLowerCase()
        if (row.signer && existingEmail && existingEmail === signerEmail && normalizeText(row.signerName) === signerName) return null
        return {
          signerRole: row.role,
          signerName,
          signerEmail,
          signingOrder: index + 1,
          status: 'ready_to_send',
        }
      })
      .filter(Boolean)

    if (!payload.length) {
      return 0
    }

    await withWorkspaceTimeout(
      createDocumentPacketSigners({
        packetId: resolvedPacketId,
        packetVersionId: currentSigningVersion.id,
        packetDocumentId: currentSigningVersion?.rendered_document_id || null,
        signers: payload,
        organisationId: currentStatus?.packet?.organisation_id || organisationId || null,
        markSigningPrep: true,
      }),
      'Signer details are taking too long to save.',
      10000,
    )
    return payload.length
  }

  async function handlePrepareSignerFields() {
    assertWorkspacePermission('canManageSigners', 'prepare signer fields')
    const resolvedPacketId = normalizeText(statusState?.packet?.id || packetId)
    if (!resolvedPacketId) {
      setLoadError('Generate a document packet before preparing signer fields.')
      return
    }
    assertMandateActionValidation('generate', {
      packetId: resolvedPacketId,
      versionId: latestVersion?.id,
    })
    setSignerBusy(true)
    setLoadError('')
    setActionFeedback('')
    try {
      const signingVersion = getSigningVersionSnapshot(statusState, latestVersion)
      await prepareSigningFields({
        packetId: resolvedPacketId,
        packetType,
        organisationId: statusState?.packet?.organisation_id || organisationId || null,
        placeholders: signingVersion?.placeholders_resolved_json || latestVersion?.placeholders_resolved_json || {},
        context: statusState?.packet?.source_context_json || {},
      })
      await refreshWorkspaceData()
      setActionFeedback('Signer fields prepared. Review signer details and send when ready.')
    } catch (error) {
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to prepare signer fields right now.'))
    } finally {
      setSignerBusy(false)
    }
  }

  async function ensureSignerReadinessBeforeSend({ isResend = false, targetSignerRole = '' } = {}) {
    assertWorkspacePermission(isResend ? 'canResend' : 'canSend', isResend ? 'resend signing links' : 'send documents for signature')
    let workingStatus = statusStateRef.current || statusState
    let preparedVersionId = ''
    const ensurePrepared = async () => {
      const signingVersion = getSigningVersionSnapshot(workingStatus, latestVersion)
      const prepared = await prepareSigningFields({
        packetId: normalizeText(workingStatus?.packet?.id || packetId),
        packetType,
        organisationId: workingStatus?.packet?.organisation_id || organisationId || null,
        placeholders: signingVersion?.placeholders_resolved_json || latestVersion?.placeholders_resolved_json || {},
        context: workingStatus?.packet?.source_context_json || {},
      })
      preparedVersionId = normalizeText(prepared?.version?.id) || preparedVersionId
      const refreshed = await refreshWorkspaceData()
      workingStatus = refreshed?.resolved || statusStateRef.current || statusState
    }

    if (isResend) {
      const refreshed = await refreshWorkspaceData()
      workingStatus = refreshed?.resolved || statusStateRef.current || statusState || workingStatus
    } else {
      await ensurePrepared()
    }

    let latestRoster = resolveSignerRoster({
      packetType,
      signers: workingStatus?.signingSummary?.signers || [],
      mandateSpouseRequired,
      signerDefaults,
    }).map((row) => {
      const draft = signerDraftByRole[row.role] || null
      if (!draft) return row
      return {
        ...row,
        signerName: normalizeText(draft.signerName || row.signerName),
        signerEmail: normalizeText(draft.signerEmail || row.signerEmail).toLowerCase(),
      }
    })

    let check = validateSignerRoster({
      roster: latestRoster,
      lifecycleState: normalizeLifecycleState(workingStatus?.state),
    })

    if (!check.isReady && !isResend) {
      await ensurePrepared()
      latestRoster = resolveSignerRoster({
        packetType,
        signers: workingStatus?.signingSummary?.signers || [],
        mandateSpouseRequired,
        signerDefaults,
      }).map((row) => {
        const draft = signerDraftByRole[row.role] || null
        if (!draft) return row
        return {
          ...row,
          signerName: normalizeText(draft.signerName || row.signerName),
          signerEmail: normalizeText(draft.signerEmail || row.signerEmail).toLowerCase(),
        }
      })
      check = validateSignerRoster({
        roster: latestRoster,
        lifecycleState: normalizeLifecycleState(workingStatus?.state),
      })
    }

    if (!check.isReady) {
      throw new Error(`Cannot send: ${check.blockers[0]}`)
    }

    const hasDraftOverrides = latestRoster.some((row) => {
      const draft = signerDraftByRole[row.role] || {}
      const nextName = normalizeText(draft.signerName)
      const nextEmail = normalizeText(draft.signerEmail).toLowerCase()
      return Boolean(
        (nextName && nextName !== normalizeText(row.signerName)) ||
          (nextEmail && nextEmail !== normalizeText(row.signerEmail).toLowerCase()),
      )
    })
    const needsSignerPersistence = latestRoster.some((row) => {
      const signerName = normalizeText((signerDraftByRole[row.role] || {}).signerName || row.signerName)
      const signerEmail = normalizeText((signerDraftByRole[row.role] || {}).signerEmail || row.signerEmail).toLowerCase()
      return !row.signer && (row.required || signerEmail) && signerName && isValidEmail(signerEmail)
    })
    if ((hasDraftOverrides || needsSignerPersistence) && !isResend) {
      await saveSignerDetails({ includeOptional: true })
      const refreshed = await refreshWorkspaceData()
      workingStatus = refreshed?.resolved || workingStatus
    }

    const resolvedPacketId = normalizeText(workingStatus?.packet?.id || packetId)
    if (!resolvedPacketId) throw new Error('Packet record missing before signing send.')
    const versionId = normalizeText(
      preparedVersionId ||
      getGeneratedPacketVersionForSigning(workingStatus?.versions || [])?.id,
    )
    if (!versionId) throw new Error('No document version found for signing.')
    assertMandateActionValidation('send_for_signing', {
      packetId: resolvedPacketId,
      versionId,
      signing: {
        hasSignerName: latestRoster.some((row) => row.required && normalizeText(row.signerName)),
        hasSignerEmail: latestRoster.some((row) => row.required && isValidEmail(row.signerEmail)),
        signingFieldCount: workingStatus?.signingSummary?.fieldCount || 0,
        signingLinkReady: true,
      },
    })

    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://app.bridgenine.co.za'
    const linkResult = await generateSigningLinks({
      packetId: resolvedPacketId,
      packetVersionId: versionId,
      expiresInHours: 168,
      baseUrl: origin,
      organisationId: workingStatus?.packet?.organisation_id || organisationId || null,
      regenerate: Boolean(isResend),
      targetSignerRole,
    })

    if (isResend) {
      await appendDocumentPacketEvent({
        packetId: resolvedPacketId,
        organisationId: workingStatus?.packet?.organisation_id || organisationId || null,
        versionId,
        eventType: 'signer_links_resent',
        eventPayload: {
          signerCount: Array.isArray(linkResult?.signers) ? linkResult.signers.length : 0,
          targetSignerRole: normalizeKey(targetSignerRole) || null,
        },
      })
    }

    return {
      linkResult,
      workingStatus,
    }
  }

  function getFinalizationBlockers() {
    const blockers = []
    if (!statusState?.packet?.id) blockers.push('Document packet is missing.')
    if (!latestVersion?.id) blockers.push('No packet version is available for finalization.')
    if (isMandatePacket && signingMethod !== 'digital') {
      blockers.push(signingMethod === 'physical'
        ? 'Physical mandates must be finalized through the manual signed upload workflow.'
        : 'Select Digital Mandate before finalizing the digital signing record.')
    }
    if (!['sent', 'partially_signed', 'signed'].includes(normalizedLifecycleState)) {
      blockers.push('Document must be in sent/signing state before finalization.')
    }
    if (!canFinalizeSignedRecord) {
      blockers.push('All required signers and fields must be completed before finalization.')
    }
    const missingPlaceholders = Array.isArray(latestVersion?.placeholders_missing_json) ? latestVersion.placeholders_missing_json : []
    if (missingPlaceholders.length) {
      blockers.push('Unresolved merge placeholders remain on this version.')
    }
    return blockers
  }

  async function handleFinalizeSignedRecord({ silent = false } = {}) {
    const blockers = getFinalizationBlockers()
    if (blockers.length) {
      throw new Error(`Cannot finalize: ${blockers[0]}`)
    }
    if (hasFinalArtifact) {
      if (!silent) setActionFeedback('Final signed artifact is already available.')
      return { alreadyFinalized: true }
    }

    const resolvedPacketId = normalizeText(statusState?.packet?.id || packetId)
    const versionId = normalizeText(latestVersion?.id)
    if (!resolvedPacketId || !versionId) {
      throw new Error('Packet and version are required before finalization.')
    }

    setFinalizeBusy(true)
    setActionProgressMessage('Finalizing signed legal record…')
    try {
      const result = await generateFinalSignedPacketDocument({
        packetId: resolvedPacketId,
        packetVersionId: versionId,
        organisationId: statusState?.packet?.organisation_id || organisationId || null,
      })

      const nowIso = new Date().toISOString()
      await updateWorkspacePacket(resolvedPacketId, {
        status: 'completed',
        completedAt: nowIso,
        allowSigningMetadataUpdate: true,
        sourceContextJson: {
          ...(statusState?.packet?.source_context_json || {}),
          lifecycle_state: 'signed',
          finalizedAt: nowIso,
          finalSignedVersionId: versionId,
          finalArtifactPath: normalizeText(result?.finalArtifact?.path || latestVersion?.final_signed_file_path || ''),
        },
      })
      void Promise.resolve(onRefreshContext?.()).catch((refreshError) => {
        console.warn('[LegalDocumentWorkspace] background context refresh failed after action.', refreshError)
      })
      await refreshWorkspaceData()
      if (!silent) {
        setActionFeedback('Final signed document archived and locked as immutable legal record.')
      }
      return result
    } finally {
      setFinalizeBusy(false)
      setActionProgressMessage('')
    }
  }

  async function saveEditableDraftVersion({ reviewState = 'draft' } = {}) {
    const resolvedPacketId = normalizeText(statusState?.packet?.id || packetId)
    if (!resolvedPacketId) {
      throw new Error('Create or generate a packet first before saving edits.')
    }
    if (!editableAllowed) {
      throw new Error('Editing is locked for this document status.')
    }
    if (!editableSections.length) {
      throw new Error('No editable sections are available for this draft yet.')
    }
    if (!draftValidationSummary.isValid) {
      throw new Error('Resolve merge field blockers before saving this draft.')
    }

    const nowIso = new Date().toISOString()
    const editableDraftSnapshot = {
      review_state: normalizeText(reviewState) || 'draft',
      last_saved_at: nowIso,
      sections: editableSections.map((section) => ({
        key: section.key,
        label: section.label,
        required: Boolean(section.required),
        custom: Boolean(section.custom),
        content: String(section.content || ''),
        tokens: Array.isArray(section.tokens) ? section.tokens : [],
      })),
      warnings: draftValidationSummary.warnings,
      blockers: draftValidationSummary.blockers,
    }

    const version = await createDocumentPacketVersion({
      packetId: resolvedPacketId,
      renderStatus: 'draft',
      renderedDocumentId: latestVersion?.rendered_document_id || null,
      renderedFilePath: latestVersion?.rendered_file_path || null,
      renderedFileName: latestVersion?.rendered_file_name || null,
      renderedFileUrl: latestVersion?.rendered_file_url || null,
      placeholdersResolvedJson: latestVersion?.placeholders_resolved_json || {},
      placeholdersMissingJson: latestVersion?.placeholders_missing_json || [],
      sectionManifestJson: editableSections.map((section) => ({
        key: section.key,
        label: section.label,
        required: Boolean(section.required),
        custom: Boolean(section.custom),
        placeholders: (section.tokens || []).map((token) => [token.token, token.label]),
        content: section.content,
      })),
      validationSummaryJson: {
        ...(latestVersion?.validation_summary_json && typeof latestVersion.validation_summary_json === 'object'
          ? latestVersion.validation_summary_json
          : {}),
        review_state: editableDraftSnapshot.review_state,
        editable_draft: editableDraftSnapshot,
        editable_draft_saved_at: nowIso,
        editable_draft_warnings: draftValidationSummary.warnings,
      },
      generatedBy: statusState?.packet?.assigned_agent_id || statusState?.packet?.created_by || null,
      generatedAt: nowIso,
    })

    const latestPacketForMetadata = await fetchDocumentPacket(resolvedPacketId, {
      includeVersions: false,
      includeEvents: false,
    })
    const latestSourceContext =
      latestPacketForMetadata?.source_context_json && typeof latestPacketForMetadata.source_context_json === 'object'
        ? latestPacketForMetadata.source_context_json
        : statusState?.packet?.source_context_json || {}

    await updateWorkspacePacket(resolvedPacketId, {
      status: 'draft',
      sourceContextJson: {
        ...latestSourceContext,
        editableDraftLastSavedAt: nowIso,
        editableDraftReviewState: editableDraftSnapshot.review_state,
        editableDraftVersion: version?.version_number || null,
      },
    })

    await appendDocumentPacketEvent({
      packetId: resolvedPacketId,
      organisationId: statusState?.packet?.organisation_id || organisationId || null,
      versionId: version?.id || null,
      eventType: editableDraftSnapshot.review_state === 'in_review' ? 'draft_marked_in_review' : 'draft_edited',
      eventPayload: {
        versionNumber: version?.version_number || null,
        sectionCount: editableSections.length,
        warningCount: draftValidationSummary.warnings.length,
      },
    })

    setDraftReviewState(editableDraftSnapshot.review_state)
    return version
  }

  function assertLifecycleTransitionAllowed(nextState) {
    const current = normalizedLifecycleState
    const target = normalizeLifecycleState(nextState)
    const allowedTransitions = {
      draft: ['sent'],
      in_review: ['draft', 'sent'],
      approved: ['locked', 'sent'],
      locked: ['sent'],
      sent: [],
      partially_signed: [],
      signed: [],
      archived: [],
    }
    const allowed = allowedTransitions[current] || []
    if (!allowed.includes(target)) {
      throw new Error(`Transition blocked: ${current.replace(/_/g, ' ')} cannot move to ${target.replace(/_/g, ' ')}.`)
    }
  }

  function getApprovalAndSendBlockers({ requireSendState = false, packetOverride = null, statusOverride = null } = {}) {
    const effectiveStatus = statusOverride || statusStateRef.current || statusState || null
    const packet = packetOverride || effectiveStatus?.packet || null
    const versionRows = Array.isArray(effectiveStatus?.versions) ? effectiveStatus.versions : []
    const signingVersion = getUsablePacketVersionForSigning(versionRows) || latestVersion
    const blockers = []
    if (!packet?.id) blockers.push('Packet record is missing.')
    if (!signingVersion?.id) blockers.push('Generate a packet version before this action.')
    if (!draftValidationSummary.isValid) blockers.push('Resolve merge field blockers before continuing.')
    if (requireSendState && signerValidation.blockers.length) {
      blockers.push(signerValidation.blockers[0])
    }
    return blockers
  }

  async function ensureTemplateReferenceBeforeSend() {
    const packet = (statusStateRef.current || statusState)?.packet || null
    if (!isUuidLike(packet?.id)) return packet

    if (packet?.template_id) {
      try {
        const currentTemplate = await fetchDocumentPacketTemplate(packet.template_id, { includeSections: false })
        if (templateHasUsableSource(currentTemplate)) {
          return packet
        }
      } catch {
        // Continue into fallback template resolution.
      }
    }

    const templates = await listPacketTemplates({
      packetType,
      moduleType: 'agency',
      includeInactive: false,
      organisationId: packet.organisation_id || organisationId || null,
    })
    const template = Array.isArray(templates)
      ? templates.find((item) => normalizeText(item?.id) && templateHasUsableSource(item))
      : null
    if (!template?.id) {
      return packet
    }

    const updatedPacket = await updateWorkspacePacket(packet.id, {
      templateId: template.id,
      templateKeySnapshot: normalizeText(template.template_key || template.key),
      templateLabelSnapshot: normalizeText(template.template_label || template.label || template.name),
      allowTemplateReferenceBackfill: true,
    })
    const refreshed = await refreshWorkspaceData()
    return refreshed?.resolved?.packet || updatedPacket
  }

  function buildVersionGovernanceSummary({ target = 'draft', packet = null, version = null, nowIso = new Date().toISOString() } = {}) {
    const existingSummary = version?.validation_summary_json && typeof version.validation_summary_json === 'object'
      ? version.validation_summary_json
      : {}
    const renderProvenance = existingSummary.render_provenance && typeof existingSummary.render_provenance === 'object'
      ? existingSummary.render_provenance
      : existingSummary.renderProvenance && typeof existingSummary.renderProvenance === 'object'
        ? existingSummary.renderProvenance
        : {}
    const templateSnapshot = {
      templateId: normalizeText(packet?.template_id) || renderProvenance.templateId || null,
      templateKey: normalizeText(packet?.template_key_snapshot) || renderProvenance.templateKey || null,
      templateLabel: normalizeText(packet?.template_label_snapshot) || renderProvenance.templateLabel || null,
      templateVersion: normalizeText(existingSummary?.templateVersion || renderProvenance.templateVersion) || null,
    }
    const frozenRenderSnapshot = {
      versionId: normalizeText(version?.id) || null,
      versionNumber: Number(version?.version_number || 0) || null,
      renderStatus: normalizeText(version?.render_status) || null,
      renderedFilePath: normalizeText(version?.rendered_file_path) || null,
      renderedFileName: normalizeText(version?.rendered_file_name) || null,
      renderedFileUrl: normalizeText(version?.rendered_file_url) || null,
      contentFingerprint: normalizeText(renderProvenance.contentFingerprint) || null,
      sectionManifestHash: normalizeText(renderProvenance.sectionManifestHash) || null,
      placeholderHash: normalizeText(renderProvenance.placeholderHash) || null,
      renderMode: normalizeText(renderProvenance.renderMode) || null,
      rendererVersion: normalizeText(renderProvenance.rendererVersion) || null,
      templateSnapshot,
    }

    const nextSummary = {
      ...existingSummary,
      review_state: target,
      governance_updated_at: nowIso,
      frozen_render_snapshot: frozenRenderSnapshot,
    }

    if (target === 'approved') {
      nextSummary.approval_snapshot = {
        approvedAt: nowIso,
        approvedByRole: normalizeText(workspaceRole) || null,
        reviewState: target,
        ...frozenRenderSnapshot,
      }
    }

    if (target === 'locked') {
      nextSummary.lock_snapshot = {
        lockedAt: nowIso,
        lockedByRole: normalizeText(workspaceRole) || null,
        reviewState: target,
        ...frozenRenderSnapshot,
      }
      nextSummary.content_locked = true
      nextSummary.content_locked_at = nowIso
    }

    if (target === 'draft' || target === 'in_review') {
      nextSummary.content_locked = false
    }

    return nextSummary
  }

  async function transitionLifecycleState(nextState, { requireApprovalValidation = false } = {}) {
    const target = normalizeLifecycleState(nextState)
    const currentStatus = statusStateRef.current || statusState
    let packet = currentStatus?.packet
    if (!packet?.id) throw new Error('Document packet is required before lifecycle transitions.')
    assertLifecycleTransitionAllowed(target)

    if (requireApprovalValidation) {
      const blockers = getApprovalAndSendBlockers({ requireSendState: false })
      if (blockers.length) {
        throw new Error(`Cannot continue: ${blockers[0]}`)
      }
    }

    try {
      packet = await fetchDocumentPacket(packet.id, {
        includeVersions: false,
        includeEvents: false,
      }) || packet
    } catch {
      // Continue with the workspace snapshot; updateWorkspacePacket still refreshes before saving.
    }

    const nowIso = new Date().toISOString()
    const nextSourceContext = {
      ...(packet?.source_context_json || {}),
      lifecycle_state: target,
      lifecycle_updated_at: nowIso,
    }

    let nextPacketStatus = packet.status
    if (target === 'draft' || target === 'in_review' || target === 'approved') {
      nextPacketStatus = 'generated'
      if (target === 'approved') {
        nextSourceContext.approvedAt = nowIso
        nextSourceContext.approvedVersionNumber = latestVersion?.version_number || null
      }
    } else if (target === 'locked') {
      nextPacketStatus = 'signing_prep'
      nextSourceContext.lockedAt = nowIso
      nextSourceContext.lockedVersionNumber = latestVersion?.version_number || null
    } else if (target === 'sent') {
      nextPacketStatus = 'sent'
      nextSourceContext.sentAt = nowIso
    }

    const currentPacketStatus = normalizeKey(packet?.status)
    const statusNeedsGeneratedBase = ['signing_prep', 'sent'].includes(nextPacketStatus)
    const shouldPromoteToGeneratedFirst =
      statusNeedsGeneratedBase && ['draft', 'ready_for_generation'].includes(currentPacketStatus)
    const transitionBasePacket = shouldPromoteToGeneratedFirst
      ? await updateWorkspacePacket(packet.id, {
          status: 'generated',
        })
      : packet
    const transitionBaseStatus = normalizeKey(transitionBasePacket?.status)
    const canUpdateLifecycleContext = !['signing_prep', 'sent', 'partially_signed', 'completed'].includes(transitionBaseStatus)
    const transitionUpdates = {
      status: nextPacketStatus,
      sentAt: target === 'sent' ? nowIso : transitionBasePacket.sent_at,
    }

    if (canUpdateLifecycleContext) {
      transitionUpdates.sourceContextJson = {
        ...(transitionBasePacket?.source_context_json || {}),
        ...nextSourceContext,
      }
    }

    const updatedPacket = await updateWorkspacePacket(packet.id, transitionUpdates)
    const updatedVersion = latestVersion?.id
      ? await updateWorkspaceVersion(latestVersion.id, {
          validationSummaryJson: buildVersionGovernanceSummary({
            target,
            packet: updatedPacket,
            version: latestVersion,
            nowIso,
          }),
        })
      : null

    const eventTypeByState = {
      in_review: 'draft_marked_in_review',
      draft: 'review_returned_to_draft',
      approved: 'draft_approved',
      locked: 'document_locked',
      sent: 'sent_for_signature',
    }
    const eventType = eventTypeByState[target]
    if (eventType) {
      await appendDocumentPacketEvent({
        packetId: updatedPacket.id,
        organisationId: updatedPacket.organisation_id || organisationId || null,
        versionId: updatedVersion?.id || latestVersion?.id || null,
        eventType,
        eventPayload: {
          fromState: normalizedLifecycleState,
          toState: target,
          versionNumber: updatedVersion?.version_number || latestVersion?.version_number || null,
          contentFingerprint:
            normalizeText(updatedVersion?.validation_summary_json?.frozen_render_snapshot?.contentFingerprint) ||
            normalizeText(latestVersion?.validation_summary_json?.frozen_render_snapshot?.contentFingerprint) ||
            null,
        },
      })
    }
  }

  async function ensurePersistedPacketBeforeSend() {
    let currentStatus = statusStateRef.current || statusState
    if (!isRuntimePacketId(currentStatus?.packet?.id || packetId)) {
      try {
        const refreshed = await refreshWorkspaceData()
        currentStatus = refreshed?.resolved || statusStateRef.current || currentStatus
      } catch {
        currentStatus = statusStateRef.current || currentStatus
      }
    }
    if (typeof onGenerate !== 'function') {
      if (isRuntimePacketId(currentStatus?.packet?.id || packetId)) {
        throw new Error('Save this mandate as a packet before sending for signature.')
      }
      return currentStatus
    }

    const ensureGeneratedStatus = async (nextStatus) => {
      const generatedVersionId = normalizeText(getGeneratedPacketVersionForSigning(nextStatus?.versions || [])?.id)
      if (generatedVersionId) {
        return {
          hasGeneratedVersion: true,
          status: nextStatus,
        }
      }

      const resolvedPacketId = normalizeText(nextStatus?.packet?.id || packetId)
      if (!resolvedPacketId || isRuntimePacketId(resolvedPacketId)) {
        return {
          hasGeneratedVersion: false,
          status: nextStatus,
        }
      }

      try {
        const hydratedPacket = await withWorkspaceTimeout(
          fetchDocumentPacket(resolvedPacketId, {
            includeVersions: true,
            includeEvents: false,
          }),
          'Packet version details are taking too long to refresh.',
          5000,
        )
        const hydratedVersions = Array.isArray(hydratedPacket?.versions) ? hydratedPacket.versions : []
        const hydratedGeneratedVersionId = normalizeText(getGeneratedPacketVersionForSigning(hydratedVersions)?.id)
        const hydratedStatus = {
          ...(nextStatus || {}),
          packet: hydratedPacket || nextStatus?.packet || null,
          versions: hydratedVersions,
        }
        const hydratedPacketStatus = normalizeKey(hydratedStatus?.packet?.status)
        const hydratedSignerCount = Number(hydratedStatus?.signingSummary?.signerCount || nextStatus?.signingSummary?.signerCount || 0)
        const hydratedFieldCount = Number(hydratedStatus?.signingSummary?.fieldCount || nextStatus?.signingSummary?.fieldCount || 0)
        return {
          hasGeneratedVersion:
            Boolean(hydratedGeneratedVersionId) ||
            (
              ['signing_prep', 'sent', 'partially_signed', 'completed'].includes(hydratedPacketStatus) &&
              (hydratedSignerCount > 0 || hydratedFieldCount > 0)
            ),
          status: hydratedStatus,
        }
      } catch {
        const fallbackPacketStatus = normalizeKey(nextStatus?.packet?.status)
        const fallbackSignerCount = Number(nextStatus?.signingSummary?.signerCount || 0)
        const fallbackFieldCount = Number(nextStatus?.signingSummary?.fieldCount || 0)
        return {
          hasGeneratedVersion:
            ['signing_prep', 'sent', 'partially_signed', 'completed'].includes(fallbackPacketStatus) &&
            (fallbackSignerCount > 0 || fallbackFieldCount > 0),
          status: nextStatus,
        }
      }
    }

    const needsPersist = isRuntimePacketId(currentStatus?.packet?.id || packetId)
    const generationCheck = await ensureGeneratedStatus(currentStatus)
    currentStatus = generationCheck.status || currentStatus
    const needsGeneration = !generationCheck.hasGeneratedVersion
    if (!needsPersist && !needsGeneration) {
      statusStateRef.current = currentStatus
      setStatusState(currentStatus)
      return currentStatus
    }

    setActionProgressMessage(needsPersist ? 'Saving mandate packet before sending…' : 'Generating mandate draft before sending…')
    let generationResult = null
    try {
      generationResult = await onGenerate({
        persistForSend: true,
        onProgress: (message) => setActionProgressMessage(normalizeText(message)),
      })
    } catch (error) {
      const rawMessage = normalizeText(error?.message || error).toLowerCase()
      if (rawMessage.includes('signing fields already exist for this packet')) {
        const refreshed = await refreshWorkspaceData().catch(() => null)
        const lockedStatus = refreshed?.resolved || statusStateRef.current || currentStatus
        const lockedSignerCount = Number(lockedStatus?.signingSummary?.signerCount || 0)
        const lockedFieldCount = Number(lockedStatus?.signingSummary?.fieldCount || 0)
        if (lockedSignerCount > 0 || lockedFieldCount > 0) {
          statusStateRef.current = lockedStatus
          setStatusState(lockedStatus)
          return lockedStatus
        }
      }
      throw error
    }
    const nextStatus = generationResult?.status || statusStateRef.current || statusState
    if (!nextStatus?.packet?.id || isRuntimePacketId(nextStatus.packet.id)) {
      throw new Error('Mandate packet could not be saved before sending. Please retry Generate Mandate, then Send for Signature.')
    }
    const postGenerationCheck = await ensureGeneratedStatus(nextStatus)
    if (!postGenerationCheck.hasGeneratedVersion) {
      throw new Error('Mandate draft generation did not complete. Please retry Generate Mandate before sending for signature.')
    }
    statusStateRef.current = postGenerationCheck.status || nextStatus
    setStatusState(postGenerationCheck.status || nextStatus)
    return postGenerationCheck.status || nextStatus
  }

  async function handleSendForSignatureFromWorkspace({ resend = false, targetSignerRole = '' } = {}) {
    if (isMandatePacket && signingMethod !== 'digital') {
      throw new Error(signingMethod === 'physical'
        ? 'This mandate is set for physical signing. Use the manual upload workflow instead of digital signature sending.'
        : 'Select Digital Mandate before sending secure signing links.')
    }
    let persistedStatus = statusStateRef.current || statusState
    let packetForSend = persistedStatus?.packet || {}
    if (!resend) {
      persistedStatus = await ensurePersistedPacketBeforeSend()
      packetForSend = persistedStatus?.packet?.template_id
        ? persistedStatus.packet
        : await ensureTemplateReferenceBeforeSend()
      const blockers = getApprovalAndSendBlockers({
        requireSendState: true,
        packetOverride: packetForSend,
        statusOverride: persistedStatus,
      })
      if (blockers.length) {
        throw new Error(`Cannot send: ${blockers[0]}`)
      }
    } else if (!normalizeText(packetForSend?.id || packetId)) {
      throw new Error('Packet record missing before resending signing links.')
    }
    const currentSigningStatus = normalizeKey((statusStateRef.current || statusState)?.signingStatus || sourceContext.signing_status || sourceContext.signingStatus || sourceContext.mandateStatus)
    if (
      resend &&
      !['sent', 'partially_signed'].includes(normalizedLifecycleState) &&
      !['sent_for_signature', 'sent_to_agent', 'agent_signed', 'sent_to_seller', 'viewed', 'failed'].includes(currentSigningStatus)
    ) {
      throw new Error('Resend is only available after the document has been sent for signature.')
    }

    const currentStatus = statusStateRef.current || statusState
    const currentRoster = resolveSignerRoster({
      packetType,
      signers: currentStatus?.signingSummary?.signers || [],
      mandateSpouseRequired,
      signerDefaults,
    })
    const currentAgentSigner = currentRoster.find((row) => normalizeKey(row.role) === 'agent') || null
    const agentHasSigned = Boolean(currentAgentSigner?.signedAt) || normalizeKey(currentAgentSigner?.statusRaw || currentAgentSigner?.status) === 'signed'
    const normalizedTargetSignerRole = normalizeKey(targetSignerRole) || (isMandatePacket && !resend && !agentHasSigned ? 'agent' : '')
    setActionProgressMessage(resend ? `Refreshing ${normalizedTargetSignerRole ? normalizedTargetSignerRole.replace(/_/g, ' ') : 'signer'} link…` : 'Preparing signer links…')
    const { linkResult } = await ensureSignerReadinessBeforeSend({ isResend: resend, targetSignerRole: normalizedTargetSignerRole })
    if (!Array.isArray(linkResult?.signers) || !linkResult.signers.some((signer) => normalizeText(signer?.signing_link))) {
      throw createWorkspaceError('SIGNING_LINK_FAILED', 'The signing link could not be created. Please try again.')
    }
    const linkSigners = Array.isArray(linkResult?.signers) ? linkResult.signers : []
    const activeLinkSigner = linkSigners.find((signer) =>
      normalizeText(signer?.signing_link) &&
      (!normalizedTargetSignerRole || normalizeKey(signer?.signer_role) === normalizedTargetSignerRole)
    ) || linkSigners.find((signer) => normalizeText(signer?.signing_link)) || null
    const linkRecipientRole = normalizeKey(activeLinkSigner?.signer_role || normalizedTargetSignerRole)
    const workflowSigningStatus = normalizeText(linkResult?.signingStatus) ||
      (isMandatePacket
        ? (linkRecipientRole === 'seller' ? 'sent_to_seller' : 'sent_to_agent')
        : 'sent_for_signature')

    const currentPacketId = normalizeText(linkResult?.packetId || currentStatus?.packet?.id || packetId)
    const currentPacket = currentStatus?.packet || {}
    const versionId = normalizeText(linkResult?.packetVersionId || latestVersion?.id)
    const nowIso = new Date().toISOString()
    const signerEmails = linkSigners.map((signer) => normalizeText(signer?.signer_email).toLowerCase()).filter(Boolean)

    if (!resend) {
      const currentPacketStatus = normalizeKey(currentPacket?.status)
      if (['draft', 'ready_for_generation'].includes(currentPacketStatus)) {
        await updateWorkspacePacket(currentPacketId, {
          status: 'generated',
        })
      }
      if (currentPacketStatus !== 'sent') {
        await updateWorkspacePacket(currentPacketId, {
          status: 'sent',
          sentAt: nowIso,
        })
      }
    }

    await updateWorkspacePacket(currentPacketId, {
      sourceContextJson: {
        ...(currentPacket?.source_context_json || {}),
        signing_method: 'digital',
        signingMethod: 'digital',
        signing_status: workflowSigningStatus,
        signingStatus: workflowSigningStatus,
        mandateStatus: workflowSigningStatus,
        lifecycle_state: 'sent',
        sentAt: currentPacket?.sent_at || nowIso,
        sentBy: normalizeText(currentPacket?.assigned_agent_id || currentPacket?.created_by) || null,
        signerEmails,
        signerCount: signerEmails.length,
        signingLinkPreparedAt: nowIso,
        signingLinkLastSentAt: nowIso,
        signingLinkResentAt: resend ? nowIso : null,
        lastSigningRecipientRole: linkRecipientRole || null,
      },
      allowSigningMetadataUpdate: true,
    })

    await appendDocumentPacketEvent({
      packetId: currentPacketId,
      organisationId: currentPacket?.organisation_id || organisationId || null,
      versionId,
      eventType: resend ? 'mandate_signing_link_resent' : 'digital_signing_prepared',
      eventPayload: {
        transactionId: currentPacket?.transaction_id || transactionId || null,
        selectedMethod: 'digital',
        signerCount: signerEmails.length,
        signingStatus: workflowSigningStatus,
        targetSignerRole: linkRecipientRole || null,
        preparedAt: nowIso,
      },
    })

    setActionProgressMessage(resend ? 'Sending resend notifications…' : 'Sending signer notifications…')
    try {
      await onSend?.({
        resend,
        signerLinks: linkSigners,
        packetId: currentPacketId,
        targetSignerRole: linkRecipientRole,
        signingStatus: workflowSigningStatus,
      })
    } catch (sendError) {
      throw createWorkspaceError(
        'SIGNING_EMAIL_FAILED',
        'The mandate was prepared, but the signing email could not be sent. You can resend it from this page.',
        { cause: sendError },
      )
    }

    const refreshed = await resolveDocumentPacketStatus({
      packetType,
      packetId: currentPacketId,
      transactionId,
      organisationId,
    })
    statusStateRef.current = refreshed
    setStatusState(refreshed)
    await appendDocumentPacketEvent({
      packetId: currentPacketId,
      organisationId: refreshed?.packet?.organisation_id || currentPacket?.organisation_id || organisationId || null,
      versionId,
      eventType: resend ? 'mandate_signing_email_resent' : 'mandate_sent_for_digital_signing',
      eventPayload: {
        transactionId: refreshed?.packet?.transaction_id || currentPacket?.transaction_id || transactionId || null,
        selectedMethod: 'digital',
        signerCount: signerEmails.length,
        signingStatus: workflowSigningStatus,
        sentAt: nowIso,
      },
    })
  }

  async function runPrimaryAction() {
    const action = resolveDocumentPacketActionState({
      packetType,
      state: statusState?.state || 'NO_PACKET',
      isBusy: actionBusy,
    })
    if (actionBusyRef.current) return
    actionBusyRef.current = true
    setActionBusy(true)
    setLoadError('')
    setActionFeedback('')
    setActionProgressMessage('')
    try {
      if (normalizedLifecycleState === 'approved') {
        assertWorkspacePermission('canLock', 'lock approved documents')
        setActionProgressMessage('Locking approved document…')
        await transitionLifecycleState('locked', { requireApprovalValidation: true })
      } else if (normalizedLifecycleState === 'locked') {
        assertWorkspacePermission('canSend', 'send documents for signature')
        setActionProgressMessage('Preparing signature send…')
        await handleSendForSignatureFromWorkspace()
      } else if (action.actionKey === 'generate') {
        assertWorkspacePermission('canGenerate', 'generate legal drafts')
        setActionProgressMessage('Preparing template…')
        const generationResult = await onGenerate?.({
          onProgress: (message) => setActionProgressMessage(normalizeText(message)),
        })
        if (generationResult?.status) {
          statusStateRef.current = generationResult.status
          setStatusState(generationResult.status)
        }
        const hasGeneratedVersion = Boolean(getGeneratedPacketVersionForSigning(generationResult?.status?.versions || []))
        if (hasGeneratedVersion) {
          void refreshWorkspaceData().then((refreshed) => {
            if (refreshed?.resolved) {
              statusStateRef.current = refreshed.resolved
              setStatusState(refreshed.resolved)
            }
          }).catch((refreshError) => {
            console.warn('[LegalDocumentWorkspace] background draft status refresh failed after generation.', refreshError)
          })
        } else {
          setActionProgressMessage('Refreshing draft status…')
          const refreshed = await refreshWorkspaceData()
          if (refreshed?.resolved) {
            statusStateRef.current = refreshed.resolved
            setStatusState(refreshed.resolved)
          }
        }
      } else if (action.actionKey === 'send') {
        assertWorkspacePermission('canSend', 'send documents for signature')
        setActionProgressMessage('Preparing signature send…')
        await handleSendForSignatureFromWorkspace()
      } else if (action.actionKey === 'edit') {
        assertWorkspacePermission('canEditDraft', 'edit legal drafts')
        setActionProgressMessage('Saving editable draft…')
        if (editableAllowed) {
          await saveEditableDraftVersion({ reviewState: draftReviewState })
        } else {
          await onEdit?.()
        }
      } else if (action.actionKey === 'view_signed') {
        await onViewSigned?.()
      } else {
        await onView?.()
      }
      void Promise.resolve(onRefreshContext?.()).catch((refreshError) => {
        console.warn('[LegalDocumentWorkspace] background context refresh failed after primary action.', refreshError)
      })
      await refreshWorkspaceData()
      if (normalizedLifecycleState === 'approved') {
        setActionFeedback('Document locked and ready for signature sending.')
      } else if (action.actionKey === 'generate') {
        setActionFeedback('Draft generated successfully.')
      } else if (action.actionKey === 'edit') {
        setActionFeedback('Draft saved and version history updated.')
      } else if (action.actionKey === 'send' || normalizedLifecycleState === 'locked') {
        setActionFeedback('Document sent for signature workflow.')
      } else {
        setActionFeedback('Action completed successfully.')
      }
    } catch (error) {
      await logMandateFailure(action?.actionKey || normalizedLifecycleState || 'primary_action', error)
      setLoadError(toFriendlyWorkspaceError(error, 'Action failed. Please retry.'))
    } finally {
      setActionProgressMessage('')
      actionBusyRef.current = false
      setActionBusy(false)
    }
  }

  async function resetFailedMandateAndRegenerate() {
    if (!isMandatePacket || typeof onGenerate !== 'function' || actionBusyRef.current) return
    actionBusyRef.current = true
    setActionBusy(true)
    setLoadError('')
    setActionFeedback('')
    setActionProgressMessage('Resetting failed mandate...')
    try {
      const generationResult = await onGenerate({
        persistForSend: true,
        resetExisting: true,
        onProgress: (message) => setActionProgressMessage(normalizeText(message)),
      })
      if (generationResult?.status) {
        statusStateRef.current = generationResult.status
        setStatusState(generationResult.status)
      }
      setActionProgressMessage('Refreshing draft status...')
      const refreshed = await refreshWorkspaceData()
      if (refreshed?.resolved) {
        statusStateRef.current = refreshed.resolved
        setStatusState(refreshed.resolved)
      }
      setActionFeedback('Failed mandate reset and regenerated successfully.')
    } catch (error) {
      await logMandateFailure('reset_and_regenerate', error)
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to reset and regenerate this mandate right now.'))
    } finally {
      setActionProgressMessage('')
      actionBusyRef.current = false
      setActionBusy(false)
    }
  }

  useEffect(() => {
    if (!open || !isMandatePacket || effectiveMode !== 'generate' || statusState?.packet?.id || actionBusy || loading) return
    if (!autoGenerateEnabled) return
    if (!legalPermissions.canGenerate || typeof onGenerate !== 'function') return
    const autoGenerateKey = [
      packetType,
      normalizeText(packetId),
      normalizeText(transactionId),
      normalizeText(statusState?.state || 'NO_PACKET'),
    ].join(':')
    if (autoGenerateGuardRef.current === autoGenerateKey) return
    autoGenerateGuardRef.current = autoGenerateKey

    const runId = autoGenerateRunRef.current + 1
    autoGenerateRunRef.current = runId
    const isCurrentAutoGenerateRun = () => autoGenerateRunRef.current === runId

    const generateInitialDraft = async () => {
      if (actionBusyRef.current) return
      actionBusyRef.current = true
      setActionBusy(true)
      setLoadError('')
      setActionFeedback('')
      setActionProgressMessage('Generating draft…')
      try {
        const generationResult = await onGenerate({
          onProgress: (message) => setActionProgressMessage(normalizeText(message)),
        })
        if (!isCurrentAutoGenerateRun()) return
        if (generationResult?.status) {
          statusStateRef.current = generationResult.status
          setStatusState(generationResult.status)
        }
        const hasGeneratedVersion = Boolean(getGeneratedPacketVersionForSigning(generationResult?.status?.versions || []))
        if (hasGeneratedVersion) {
          void refreshWorkspaceData().then((refreshed) => {
            if (!isCurrentAutoGenerateRun()) return
            if (refreshed?.resolved) {
              statusStateRef.current = refreshed.resolved
              setStatusState(refreshed.resolved)
            }
          }).catch((refreshError) => {
            console.warn('[LegalDocumentWorkspace] background draft status refresh failed after auto-generation.', refreshError)
          })
        } else {
          setActionProgressMessage('Refreshing draft status…')
          const refreshed = await refreshWorkspaceData()
          if (!isCurrentAutoGenerateRun()) return
          if (refreshed?.resolved) {
            statusStateRef.current = refreshed.resolved
            setStatusState(refreshed.resolved)
          }
        }
        setActionFeedback('Draft generated successfully.')
      } catch (error) {
        await logMandateFailure('auto_generate', error)
        if (isCurrentAutoGenerateRun()) setLoadError(toFriendlyWorkspaceError(error, 'Unable to generate this mandate draft right now.'))
      } finally {
        if (isCurrentAutoGenerateRun()) {
          setActionProgressMessage('')
          actionBusyRef.current = false
          setActionBusy(false)
        }
      }
    }

    void generateInitialDraft()
  }, [
    actionBusy,
    effectiveMode,
    isMandatePacket,
    legalPermissions.canGenerate,
    logMandateFailure,
    loading,
    onGenerate,
    open,
    packetId,
    packetType,
    refreshWorkspaceData,
    statusState?.packet?.id,
    statusState?.state,
    transactionId,
    autoGenerateEnabled,
  ])

  async function runReviewAction(actionKey, options = {}) {
    if (actionBusyRef.current) return
    actionBusyRef.current = true
    setActionBusy(true)
    setLoadError('')
    setActionFeedback('')
    try {
      if (actionKey === 'return_draft') {
        assertWorkspacePermission('canApprove', 'return drafts to editing')
        await transitionLifecycleState('draft')
        setActionFeedback('Document returned to draft.')
      } else if (actionKey === 'approve_draft') {
        assertWorkspacePermission('canApprove', 'approve legal drafts')
        const blockers = getApprovalAndSendBlockers({ requireSendState: false })
        if (blockers.length) throw new Error(`Cannot approve: ${blockers[0]}`)
        await transitionLifecycleState('approved', { requireApprovalValidation: true })
        setActionFeedback('Draft approved and ready to lock.')
      } else if (actionKey === 'lock_document') {
        assertWorkspacePermission('canLock', 'lock approved documents')
        await transitionLifecycleState('locked', { requireApprovalValidation: true })
        setActionFeedback('Document locked and ready to send.')
      } else if (actionKey === 'send_signature') {
        assertWorkspacePermission('canSend', 'send documents for signature')
        await handleSendForSignatureFromWorkspace({ resend: false })
        setActionFeedback('Document sent for signature workflow.')
      } else if (actionKey === 'finalize_signed') {
        assertWorkspacePermission('canFinalize', 'finalize signed records')
        await handleFinalizeSignedRecord()
      } else if (actionKey === 'view_signing_status') {
        setCenterTab('preview')
        setActionFeedback('Signer status is shown in the right-side signer checklist.')
      } else if (actionKey === 'resend_signature') {
        assertWorkspacePermission('canResend', 'resend signing links')
        await handleSendForSignatureFromWorkspace({ resend: true, targetSignerRole: options.targetSignerRole || '' })
        const targetLabel = normalizeKey(options.targetSignerRole).replace(/_/g, ' ')
        setActionFeedback(targetLabel ? `Signing link resent to ${targetLabel}.` : 'Signing links resent to outstanding signers.')
      } else if (actionKey === 'view_signing_history') {
        setActionFeedback('Signing history is shown in the lifecycle/audit timeline.')
      } else if (actionKey === 'download_signed') {
        if (!signedPreviewUrl) throw new Error('Signed document is not available yet.')
        window.open(signedPreviewUrl, '_blank', 'noopener,noreferrer')
      } else if (actionKey === 'download_preview') {
        await handlePhysicalDownload()
      } else if (actionKey === 'view_draft') {
        await onView?.()
      }

      await onRefreshContext?.()
      await refreshWorkspaceData()
    } catch (error) {
      await logMandateFailure(actionKey || 'review_action', error)
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to complete this action right now.'))
    } finally {
      actionBusyRef.current = false
      setActionBusy(false)
    }
  }

  async function handleSaveSignerDetails() {
    if (signerBusyRef.current) return
    signerBusyRef.current = true
    setSignerBusy(true)
    setLoadError('')
    setActionFeedback('')
    try {
      const savedCount = await saveSignerDetails({ includeOptional: true })
      await refreshWorkspaceData()
      setActionFeedback(savedCount > 0 ? `Saved ${savedCount} signer update(s).` : 'Signer details are already up to date.')
    } catch (error) {
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to save signer details right now.'))
    } finally {
      signerBusyRef.current = false
      setSignerBusy(false)
    }
  }

  async function handleRefreshSignerStatus() {
    if (signerBusyRef.current) return
    signerBusyRef.current = true
    setSignerBusy(true)
    setLoadError('')
    try {
      await refreshWorkspaceData()
      setActionFeedback('Signer status refreshed.')
    } catch (error) {
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to refresh signer status right now.'))
    } finally {
      signerBusyRef.current = false
      setSignerBusy(false)
    }
  }

  async function handleSelectSigningMethod(nextMethod) {
    if (actionBusyRef.current) return
    const method = normalizeSigningMethod(nextMethod)
    if (!isMandatePacket || !['digital', 'physical'].includes(method)) return
    if (!statusState?.packet?.id) {
      setLoadError('Generate a mandate before selecting the signing method.')
      return
    }
    if (!canChangeSigningMethod) {
      setLoadError(signingMethodLockedReason || 'The signing method can no longer be changed for this mandate.')
      return
    }
    if (method === signingMethod) return

    actionBusyRef.current = true
    setActionBusy(true)
    setLoadError('')
    setActionFeedback('')
    try {
      const nowIso = new Date().toISOString()
      const previousMethod = signingMethod
      const updatedSourceContext = {
        ...(sourceContext || {}),
        signing_method: method,
        signingMethod: method,
        signing_method_selected_at: sourceContext.signing_method_selected_at || nowIso,
        signingMethodSelectedAt: sourceContext.signingMethodSelectedAt || nowIso,
        signing_method_updated_at: nowIso,
        signingMethodUpdatedAt: nowIso,
      }
      await updateWorkspacePacket(statusState.packet.id, {
        sourceContextJson: updatedSourceContext,
        allowSigningMetadataUpdate: true,
      })
      if (!isRuntimePacketId(statusState.packet.id)) {
        await appendDocumentPacketEvent({
          packetId: statusState.packet.id,
          organisationId: statusState?.packet?.organisation_id || organisationId || null,
          versionId: latestVersion?.id || null,
          eventType: previousMethod === 'not_selected' ? 'signing_method_selected' : 'signing_method_changed',
          eventPayload: {
            transactionId: statusState?.packet?.transaction_id || transactionId || null,
            previousMethod,
            selectedMethod: method,
          },
        })
        await refreshWorkspaceData()
      }
      setActionFeedback(`${resolveSigningMethodLabel(method)} selected.`)
    } catch (error) {
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to update the signing method right now.'))
    } finally {
      actionBusyRef.current = false
      setActionBusy(false)
    }
  }

  async function handlePhysicalDownload() {
    if (physicalDownloadBusyRef.current) return
    physicalDownloadBusyRef.current = true
    const ownsBusyState = !actionBusy
    if (ownsBusyState) {
      actionBusyRef.current = true
      setActionBusy(true)
    }
    setLoadError('')
    setActionFeedback('')

    try {
      assertMandateActionValidation('download', {
        packetId: statusState?.packet?.id || packetId,
        versionId: latestVersion?.id,
      })
      let link = signedPreviewUrl || generatedPreviewUrl
      let downloadVersionId = normalizeText(latestVersion?.id)
      const recordPhysicalDownloadEvent = async () => {
        if (!isMandatePacket || signingMethod !== 'physical' || !statusState?.packet?.id) return
        const downloadedAt = new Date().toISOString()
        try {
          await updateWorkspacePacket(statusState.packet.id, {
            sourceContextJson: {
              ...(statusState?.packet?.source_context_json || {}),
              signing_method: 'physical',
              signingMethod: 'physical',
              signing_status: 'generated_for_physical_signature',
              signingStatus: 'generated_for_physical_signature',
              physical_signature_status: 'generated_for_physical_signature',
              mandateStatus: 'generated_for_physical_signature',
              downloadedAt,
              downloaded_at: downloadedAt,
              downloadedVersionId: downloadVersionId || null,
            },
            allowSigningMetadataUpdate: true,
          })
          await appendDocumentPacketEvent({
            packetId: statusState.packet.id,
            organisationId: statusState?.packet?.organisation_id || organisationId || null,
            versionId: downloadVersionId || null,
            eventType: 'physical_mandate_downloaded',
            eventPayload: {
              transactionId: statusState?.packet?.transaction_id || transactionId || null,
              selectedMethod: signingMethod,
              source: 'generated_pdf',
              signingStatus: 'generated_for_physical_signature',
              downloadedAt,
            },
          })
        } catch (eventError) {
          console.warn('[LEGAL_WORKSPACE] physical download audit event failed', eventError)
        }
      }

      if (!link) {
        if (typeof onGenerate !== 'function') {
          throw new Error('Generate the mandate draft before downloading the physical signing copy.')
        }

        setActionProgressMessage('Generating downloadable mandate PDF…')
        const generationResult = await onGenerate({
          onProgress: (message) => setActionProgressMessage(normalizeText(message)),
        })
        link = resolveVersionDownloadUrl(generationResult?.version)
        downloadVersionId = normalizeText(generationResult?.version?.id) || downloadVersionId

        if (!link) {
          await onRefreshContext?.()
          const refreshed = await refreshWorkspaceData()
          const refreshedVersion = Array.isArray(refreshed?.resolved?.versions)
            ? refreshed.resolved.versions[0]
            : null
          link = resolveVersionDownloadUrl(refreshedVersion)
          downloadVersionId = normalizeText(refreshedVersion?.id) || downloadVersionId
        }
      }

      if (!link) {
        throw new Error('Bridge generated the mandate, but the download link is not ready yet. Refresh and try again.')
      }

      if (isMandatePacket && signingMethod === 'physical' && statusState?.packet?.id) {
        await recordPhysicalDownloadEvent()
      }
      window.open(link, '_blank', 'noopener,noreferrer')
      setActionFeedback('Physical signing PDF opened.')
    } catch (error) {
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to prepare the mandate PDF right now.'))
    } finally {
      setActionProgressMessage('')
      physicalDownloadBusyRef.current = false
      if (ownsBusyState) {
        actionBusyRef.current = false
        setActionBusy(false)
      }
    }
  }

  async function handleManualSignedUpload() {
    if (manualUploadBusyRef.current) return
    if (!isMandatePacket) return
    if (signingMethod !== 'physical') {
      setLoadError('Select Physical / Printed Mandate before uploading a manually signed copy.')
      return
    }
    if (!manualSignedFile) {
      setLoadError('Choose the signed mandate file before finalizing.')
      return
    }
    if (!isPdfFile(manualSignedFile)) {
      setLoadError('The signed mandate could not be uploaded. Please upload a PDF file and try again.')
      return
    }
    if (Number(manualSignedFile.size || 0) > MAX_SIGNED_MANDATE_UPLOAD_BYTES) {
      setLoadError('The signed mandate PDF must be 20 MB or smaller.')
      return
    }
    if (!manualSignedConfirmed) {
      setLoadError('Confirm that the uploaded document is the signed mandate before finalizing.')
      return
    }
    const resolvedPacketId = normalizeText(statusState?.packet?.id || packetId)
    const versionId = normalizeText(latestVersion?.id)
    if (!resolvedPacketId || !versionId) {
      setLoadError('A mandate packet and version are required before uploading the signed copy.')
      return
    }
    try {
      assertMandateActionValidation('upload_signed', {
        packetId: resolvedPacketId,
        versionId,
        relatedRecordId: normalizeText(statusState?.packet?.lead_id || statusState?.packet?.transaction_id || transactionId),
        file: manualSignedFile,
        hasPermission: legalPermissions.canFinalize,
      })
    } catch (validationError) {
      setLoadError(toFriendlyWorkspaceError(validationError, 'Signed mandate upload cannot continue yet.'))
      return
    }

    manualUploadBusyRef.current = true
    setManualUploadBusy(true)
    setActionProgressMessage('Uploading manually signed mandate…')
    setLoadError('')
    setActionFeedback('')
    try {
      const resolvedTransactionId = normalizeText(statusState?.packet?.transaction_id || transactionId)
      let documentRecord = null
      let uploadedArtifact = null
      const originalName = normalizeText(manualSignedFile.name)
      const extension = originalName.includes('.') ? originalName.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') : 'pdf'
      const manualUploadFileName = `Signed Mandate - Manual Upload.${extension || 'pdf'}`
      const uploadFile = typeof File === 'function'
        ? new File([manualSignedFile], manualUploadFileName, {
            type: manualSignedFile.type || 'application/pdf',
            lastModified: manualSignedFile.lastModified || Date.now(),
          })
        : manualSignedFile

      if (resolvedTransactionId) {
        documentRecord = await uploadDocument({
          transactionId: resolvedTransactionId,
          file: uploadFile,
          category: 'Signed Mandate',
          documentType: 'signed_mandate_manual_upload',
          visibilityScope: 'internal',
          stageKey: 'legal',
          requiredDocumentKey: 'signed_mandate',
        })
      } else {
        uploadedArtifact = await uploadFinalSignedPacketArtifact({
          packetId: resolvedPacketId,
          packetVersionId: versionId,
          file: uploadFile,
        })
      }

      const finalFilePath = normalizeText(documentRecord?.file_path || uploadedArtifact?.path)
      const finalFileName = normalizeText(documentRecord?.name || uploadedArtifact?.fileName || manualSignedFile.name)
      const finalFileUrl = normalizeText(documentRecord?.url || uploadedArtifact?.signedUrl)
      const finalFileBucket = normalizeText(uploadedArtifact?.bucket)
      const documentId = normalizeText(documentRecord?.id)
      const nowIso = new Date().toISOString()

      await updateDocumentPacketVersionFinalArtifact({
        packetId: resolvedPacketId,
        packetVersionId: versionId,
        finalSignedFilePath: finalFilePath,
        finalSignedFileName: finalFileName,
        finalSignedFileUrl: finalFileUrl,
        finalSignedFileBucket: finalFileBucket,
        finalSignedDocumentId: documentId,
        finalisedAt: nowIso,
      })

      const latestPacket = await fetchDocumentPacket(resolvedPacketId, { includeVersions: false, includeEvents: false })
      const latestStatus = normalizeKey(latestPacket?.status)
      let packetForCompletion = latestPacket
      if (['draft', 'ready_for_generation', 'signing_prep'].includes(latestStatus)) {
        packetForCompletion = await updateWorkspacePacket(resolvedPacketId, {
          status: 'generated',
        })
      }

      await updateWorkspacePacket(resolvedPacketId, {
        status: 'completed',
        completedAt: nowIso,
        allowSigningMetadataUpdate: true,
        sourceContextJson: {
          ...(packetForCompletion?.source_context_json || sourceContext || {}),
          signing_method: 'physical',
          signingMethod: 'physical',
          signing_status: 'uploaded_signed',
          signingStatus: 'uploaded_signed',
          mandateStatus: 'uploaded_signed',
          lifecycle_state: 'signed',
          finalizedAt: nowIso,
          finalSignedVersionId: versionId,
          finalArtifactPath: finalFilePath,
          finalSignedSource: 'manual_upload',
          manualSignedDocumentId: documentId || null,
          manualSignedFilePath: finalFilePath,
          manualSignedFileName: finalFileName,
          manualSignedUploadedAt: nowIso,
          uploadedAt: nowIso,
          uploaded_at: nowIso,
          manualSignedConfirmed: true,
          manualSignedAllPartiesSigned: Boolean(manualSignedAllPartiesSigned),
          manualSignedNotes: normalizeText(manualSignedNotes) || null,
        },
      })

      await appendDocumentPacketEvent({
        packetId: resolvedPacketId,
        organisationId: statusState?.packet?.organisation_id || organisationId || null,
        versionId,
        eventType: 'signed_physical_mandate_uploaded',
        eventPayload: {
          transactionId: resolvedTransactionId || null,
          documentId: documentId || null,
          finalFilePath,
          selectedMethod: 'physical',
          signingStatus: 'uploaded_signed',
          allRequiredPartiesSigned: Boolean(manualSignedAllPartiesSigned),
        },
      })

      setManualSignedFile(null)
      setManualSignedNotes('')
      setManualSignedConfirmed(false)
      setManualSignedAllPartiesSigned(false)
      await onRefreshContext?.()
      await refreshWorkspaceData()
      setActionFeedback('Signed mandate uploaded successfully.')
    } catch (error) {
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to upload and finalize the signed mandate right now.'))
    } finally {
      manualUploadBusyRef.current = false
      setManualUploadBusy(false)
      setActionProgressMessage('')
    }
  }

  const launchSigningReadyState =
    Boolean(statusState?.packet?.id) &&
    ['draft', 'in_review', 'approved', 'locked'].includes(normalizedLifecycleState)

  const workspacePrimaryLabel =
    isMandatePacket && launchSigningReadyState && signingMethod === 'not_selected'
      ? 'Select Signing Method'
      : isMandatePacket && launchSigningReadyState && signingMethod === 'physical' && !manualSignedUploaded
        ? 'Download PDF'
        : isMandatePacket && launchSigningReadyState && signingMethod === 'digital'
          ? 'Send for Signature'
          : primaryLabel
  const handleSendForSignatureIntent = () => {
    if (isMandatePacket && signingMethod === 'digital' && signerValidation.blockers.length) {
      setSignerPrepOpen(true)
      setLoadError('')
      setActionFeedback('Review signer details before sending the mandate.')
      return
    }
    void runReviewAction('send_signature')
  }
  const handleWorkspacePrimaryAction = () => {
    if (isMandatePacket && launchSigningReadyState && signingMethod === 'not_selected') {
      setLoadError('Choose Digital Mandate or Physical / Printed Mandate before continuing.')
      return
    }
    if (isMandatePacket && launchSigningReadyState && signingMethod === 'physical' && !manualSignedUploaded) {
      void handlePhysicalDownload()
      return
    }
    if (isMandatePacket && launchSigningReadyState && signingMethod === 'digital') {
      handleSendForSignatureIntent()
      return
    }
    void runPrimaryAction()
  }

  const handleSelectOutlineSection = useCallback((sectionKey) => {
    const normalizedSectionKey = normalizeText(sectionKey)
    if (!normalizedSectionKey) return
    setActiveSectionKey(normalizedSectionKey)
    if (editableAllowed) {
      setCenterTab('editor')
    }
    if (typeof document === 'undefined') return
    window.requestAnimationFrame(() => {
      document
        .getElementById(`legal-workspace-section-${slugifySectionKey(normalizedSectionKey)}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [editableAllowed])

  const handleFocusPreview = useCallback(() => {
    setCenterTab('preview')
  }, [])

  if (!open) return null

  const documentLabel = resolveDocumentLabel(packetType)
  const previewDownloadUrl = signedPreviewUrl || generatedPreviewUrl || ''
  const previewDownloadName = normalizeText(
    latestVersion?.final_signed_file_name ||
      latestVersion?.rendered_file_name ||
      `${slugifySectionKey(documentLabel) || 'document'}.pdf`,
  )
  const hasPreviewSurface = Boolean(generatedPreviewUrl || signedPreviewUrl || editablePreviewHtml)
  const shellClassName = isPageMode
    ? 'legal-document-workspace-page flex min-h-[calc(100vh-132px)] w-full flex-col overflow-hidden rounded-[28px] border border-[#dfe8f3] bg-[#f5f7fb]'
    : 'mx-auto flex h-full w-full max-w-[1760px] flex-col overflow-hidden rounded-[30px] border border-[#dfe8f3] bg-[#f5f7fb] shadow-[0_28px_70px_rgba(10,24,42,0.24)]'
  const rootClassName = isPageMode
    ? 'w-full'
    : 'fixed inset-0 z-[95] bg-[#0b1422]/55 px-2 py-2 sm:px-4 sm:py-4'
  const contentClassName = isPageMode
    ? 'min-h-0 flex-1 overflow-y-auto px-4 pb-20 pt-5 sm:px-6 sm:pb-24 sm:pt-6'
    : 'min-h-0 flex-1 overflow-y-auto px-4 pb-20 pt-4 sm:px-5 sm:pb-24 sm:pt-5'
  const desktopWorkspaceRailHeightClassName = 'xl:h-[clamp(700px,calc(100vh-14rem),880px)]'
  const mainGridClassName = `grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-stretch 2xl:grid-cols-[340px_minmax(0,1fr)] ${desktopWorkspaceRailHeightClassName}`
  const secondaryGridClassName = 'mt-5 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-stretch 2xl:grid-cols-[380px_minmax(0,1fr)]'

  return (
    <>
      <div className={rootClassName}>
        <div className={shellClassName}>
          <header className="border-b border-[#e5edf7] bg-white/95 px-4 py-4 backdrop-blur sm:px-6 sm:py-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-[#d7e4f3] bg-white text-[#51677f] transition hover:bg-[#f7faff]"
                  onClick={onBack || onClose}
                  aria-label={backLabel}
                  title={backLabel}
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-[1.7rem] font-semibold tracking-[-0.02em] text-[#102033]">
                      {documentLabel}
                    </h1>
                    <span className="inline-flex items-center rounded-full border border-[#f6d9b6] bg-[#fff6ea] px-3 py-1 text-xs font-semibold text-[#b8741e]">
                      {workspaceSummary.badge}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-6">
                    <div>
                      <p className="text-xs font-semibold text-[#7b8ea4]">Seller</p>
                      <p className="mt-1 font-medium text-[#102033]">{workspaceSummary.seller}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#7b8ea4]">Property</p>
                      <p className="mt-1 font-medium text-[#102033]">{workspaceSummary.property}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#7b8ea4]">Transaction</p>
                      <p className="mt-1 font-medium text-[#102033]">{workspaceSummary.transaction}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#7b8ea4]">Stage</p>
                      <p className="mt-1 font-medium text-[#102033]">{workspaceSummary.stage}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#7b8ea4]">Status</p>
                      <p className="mt-1 font-medium text-[#102033]">{workspaceSummary.status}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#7b8ea4]">Saved</p>
                      <p className="mt-1 inline-flex items-center gap-2 font-medium text-[#20b26b]">
                        <Check size={14} />
                        {workspaceSummary.savedLabel}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 self-start">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setHeaderMenuOpen((current) => !current)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-[#d7e4f3] bg-white text-[#51677f] transition hover:bg-[#f7faff]"
                    aria-label="Workspace actions"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {headerMenuOpen ? (
                    <div className="absolute right-0 top-[calc(100%+10px)] z-20 min-w-[220px] rounded-[20px] border border-[#e6edf7] bg-white p-2 shadow-[0_18px_48px_rgba(16,32,51,0.14)]">
                      <button
                        type="button"
                        onClick={() => {
                          setHeaderMenuOpen(false)
                          setMergeDetailsOpen(true)
                        }}
                        className="flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-sm font-medium text-[#102033] transition hover:bg-[#f8fbff]"
                      >
                        Merge field details
                        <ChevronRight size={14} className="text-[#8a99ad]" />
                      </button>
                      {generatedPreviewUrl && typeof onView === 'function' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false)
                            void onView?.()
                          }}
                          className="flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-sm font-medium text-[#102033] transition hover:bg-[#f8fbff]"
                        >
                          Open draft preview
                          <ChevronRight size={14} className="text-[#8a99ad]" />
                        </button>
                      ) : null}
                      {signedPreviewUrl && typeof onViewSigned === 'function' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setHeaderMenuOpen(false)
                            void onViewSigned?.()
                          }}
                          className="flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-sm font-medium text-[#102033] transition hover:bg-[#f8fbff]"
                        >
                          Open signed copy
                          <ChevronRight size={14} className="text-[#8a99ad]" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setHeaderMenuOpen(false)
                          void refreshWorkspaceData()
                        }}
                        className="flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-sm font-medium text-[#102033] transition hover:bg-[#f8fbff]"
                      >
                        Refresh workspace
                        <ChevronRight size={14} className="text-[#8a99ad]" />
                      </button>
                    </div>
                  ) : null}
                </div>
                {!isPageMode ? (
                  <button
                    type="button"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-[#d7e4f3] bg-white text-[#51677f] transition hover:bg-[#f7faff]"
                    onClick={onClose}
                    aria-label="Close workspace"
                  >
                    <X size={18} />
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          <div className={contentClassName}>
            {actionProgressMessage ? (
              <article className="mb-5 rounded-[18px] border border-[#dbe6f2] bg-[#f7fbff] px-4 py-3 text-sm font-semibold text-[#35546c]">
                {actionProgressMessage}
              </article>
            ) : null}
            {actionFeedback ? (
              <article className="mb-5 rounded-[18px] border border-[#d8f0e3] bg-[#effaf4] px-4 py-3 text-sm font-semibold text-[#23784d]">
                {actionFeedback}
              </article>
            ) : null}
            {loadError ? (
              <article className="mb-5 rounded-[20px] border border-[#f6ddd7] bg-[#fff6f3] px-4 py-4 text-sm text-[#973824]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[220px] flex-1">
                    {loadError.includes('\n') ? (
                      <>
                        <p className="font-semibold">{loadError.split('\n')[0]}</p>
                        <div className="mt-2 space-y-1 text-xs">
                          {loadError.split('\n').slice(1, -1).map((line) => (
                            line.startsWith('- ')
                              ? <p key={line} className="pl-4">• {line.slice(2)}</p>
                              : <p key={line} className="pt-1 font-semibold">{line}</p>
                          ))}
                        </div>
                        <p className="mt-2 text-xs font-semibold">{loadError.split('\n').at(-1)}</p>
                      </>
                    ) : (
                      <span>{loadError}</span>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (isMandatePacket && typeof onGenerate === 'function') {
                        void resetFailedMandateAndRegenerate()
                        return
                      }
                      void refreshWorkspaceData()
                    }}
                    disabled={loading || actionBusy}
                  >
                    {isMandatePacket && typeof onGenerate === 'function' ? 'Reset & Regenerate' : 'Retry'}
                  </Button>
                </div>
              </article>
            ) : null}
            {!legalPermissions.canEditDraft ? (
              <article className="mb-5 rounded-[18px] border border-[#e4ebf4] bg-[#f8fbff] px-4 py-3 text-sm font-semibold text-[#55708d]">
                Read-only mode: your role can view lifecycle progress and signer status, but cannot modify legal drafts.
              </article>
            ) : null}

            {isFullySignedLifecycle || hasFinalArtifact ? (
              <section className="mb-6 rounded-[24px] border border-[#cfe8d9] bg-[#effaf4] px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-[#20b26b]">Finalized Legal Record</p>
                    <p className="mt-1 text-base font-semibold text-[#1d5b3c]">All required signers completed this document.</p>
                    <p className="mt-1 text-sm text-[#347554]">Editing is locked. This signed version is immutable and archived.</p>
                  </div>
                  <div className="rounded-[18px] border border-[#c8e5d4] bg-white px-4 py-3 text-sm text-[#1d5b3c]">
                    <p>Signer completion: {signerProgressMeta.signedRequired}/{signerProgressMeta.totalRequired || 0}</p>
                    <p>Finalized: {formatDateTime(statusState?.packet?.completed_at || latestVersion?.finalised_at)}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {signedPreviewUrl ? (
                    <a
                      href={signedPreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-full border border-[#c8e5d4] bg-white px-4 py-2 text-sm font-semibold text-[#1d5b3c]"
                    >
                      View Final Signed PDF
                    </a>
                  ) : null}
                  {signedPreviewUrl ? (
                    <a
                      href={signedPreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      download={normalizeText(latestVersion?.final_signed_file_name || 'signed-mandate.pdf')}
                      className="inline-flex items-center rounded-full border border-[#c8e5d4] bg-white px-4 py-2 text-sm font-semibold text-[#1d5b3c]"
                    >
                      Download Signed Mandate
                    </a>
                  ) : null}
                  {!signedPreviewUrl && canFinalizeSignedRecord && legalPermissions.canFinalize ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => runReviewAction('finalize_signed')} disabled={actionBusy || finalizeBusy}>
                      {finalizeBusy ? 'Generating…' : 'Generate Signed PDF'}
                    </Button>
                  ) : null}
                </div>
              </section>
            ) : null}

            <div className={mainGridClassName}>
              <div className="xl:flex xl:h-full xl:min-h-0 xl:flex-col">
                <div className="xl:min-h-0 xl:flex-1">
                  <DocumentOutlinePanel
                    sections={editableSections}
                    activeSectionKey={activeSectionKey}
                    onSelectSection={handleSelectOutlineSection}
                    canAddCustomSection={editableAllowed && legalPermissions.canEditDraft}
                    customSectionLabel={customSectionLabel}
                    onCustomSectionLabelChange={setCustomSectionLabel}
                    onAddCustomSection={handleAddCustomSection}
                    onRemoveSection={handleRemoveSection}
                    validationByKey={editableSectionsValidation}
                    editorAvailable={editableAllowed}
                    onSwitchToEditor={() => setCenterTab('editor')}
                    mergeSummary={(
                      <MergeChecklistSummary
                        packetType={packetType}
                        placeholders={latestVersion?.placeholders_resolved_json || {}}
                        onOpen={() => setMergeDetailsOpen(true)}
                      />
                    )}
                  />
                </div>
              </div>

              <section className="min-h-[700px] rounded-[24px] border border-[#e5edf7] bg-white p-5 shadow-[0_18px_48px_rgba(16,32,51,0.06)] sm:p-6 xl:flex xl:h-full xl:min-h-0 xl:flex-col">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[1.15rem] font-semibold text-[#102033]">
                      {editableAllowed ? 'Document Editor' : 'Document Preview'}
                    </h3>
                    <p className="mt-1 text-sm text-[#6b7c93]">Preview stays tied to the existing packet generation and signing pipeline.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {editableAllowed ? (
                      <div className="inline-flex items-center rounded-full border border-[#dbe5f0] bg-[#f7faff] p-1">
                        <button
                          type="button"
                          className={`rounded-full px-4 py-2 text-xs font-semibold transition ${centerTab === 'editor' ? 'bg-white text-[#102033] shadow-[0_8px_18px_rgba(16,32,51,0.08)]' : 'text-[#6f839b]'}`}
                          onClick={() => setCenterTab('editor')}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`rounded-full px-4 py-2 text-xs font-semibold transition ${centerTab === 'preview' ? 'bg-white text-[#0a66ff] shadow-[0_8px_18px_rgba(16,32,51,0.08)]' : 'text-[#6f839b]'}`}
                          onClick={handleFocusPreview}
                        >
                          Preview
                        </button>
                      </div>
                    ) : null}
                    {generatedPreviewUrl && typeof onView === 'function' ? (
                      <Button type="button" size="sm" variant="secondary" onClick={() => void onView?.()}>
                        Open Draft
                      </Button>
                    ) : null}
                    {signedPreviewUrl && typeof onViewSigned === 'function' ? (
                      <Button type="button" size="sm" variant="secondary" onClick={() => void onViewSigned?.()}>
                        Signed Copy
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-6 rounded-[28px] border border-[#edf3fa] bg-[#f5f7fb] p-4 sm:p-6 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
                  {loading ? (
                    <div className="flex min-h-[620px] items-center justify-center rounded-[24px] border border-dashed border-[#d8e2ef] bg-white text-sm text-[#6f839b]">
                      Loading packet preview...
                    </div>
                  ) : null}

                  {!loading && !statusState?.packet?.id ? (
                    <div className="flex min-h-[620px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#d8e2ef] bg-white px-6 text-center">
                      <FileText size={24} className="text-[#7287a0]" />
                      <p className="mt-3 text-base font-semibold text-[#102033]">Generate the first draft to preview this document.</p>
                      <p className="mt-1 max-w-md text-sm text-[#6b7c93]">Bridge will create a packet draft and load the document lifecycle here without changing your existing data flow.</p>
                    </div>
                  ) : null}

                  {!loading && editableAllowed && centerTab === 'editor' && statusState?.packet?.id ? (
                    !editableSections.length ? (
                      <div className="flex min-h-[620px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#d8e2ef] bg-white px-6 text-center">
                        <AlertCircle size={24} className="text-[#9b6b1c]" />
                        <p className="mt-3 text-base font-semibold text-[#102033]">No editable draft sections are available yet.</p>
                        <p className="mt-1 max-w-md text-sm text-[#6b7c93]">Generate a draft first, then reopen this workspace to edit clauses.</p>
                      </div>
                    ) : (
                      <DraftEditorPanel
                        sections={editableSections}
                        onChangeSection={handleChangeSection}
                        onInsertToken={handleInsertToken}
                        validationByKey={editableSectionsValidation}
                        collapsedSectionKeys={collapsedSectionKeys}
                        onToggleSection={handleToggleSection}
                      />
                    )
                  ) : null}

                  {!loading && (!editableAllowed || centerTab === 'preview') && statusState?.packet?.id && !hasPreviewSurface ? (
                    <div className="flex min-h-[620px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#d8e2ef] bg-white px-6 text-center">
                      <AlertCircle size={24} className="text-[#9b6b1c]" />
                      <p className="mt-3 text-base font-semibold text-[#102033]">
                        {latestVersion?.id
                          ? 'Draft exists, but preview is not available yet.'
                          : 'Bridge could not generate this document. Check missing fields or template setup.'}
                      </p>
                      <p className="mt-1 max-w-md text-sm text-[#6b7c93]">Preview and final render controls still rely on the existing packet generation pipeline.</p>
                    </div>
                  ) : null}

                  {!loading && (!editableAllowed || centerTab === 'preview') && hasPreviewSurface ? (
                    <div className="space-y-4">
                      <div className="mx-auto max-w-[900px] rounded-[28px] bg-white p-4 shadow-[0_18px_48px_rgba(16,32,51,0.09)] sm:p-6">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-[#7b8ea4]">Preview</p>
                            <p className="mt-1 text-sm font-medium text-[#102033]">
                              {signedPreviewUrl ? 'Signed document sheet' : generatedPreviewUrl ? 'Generated draft sheet' : 'Live draft preview sheet'}
                            </p>
                          </div>
                          <span className="rounded-full border border-[#e2eaf5] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#5d7691]">
                            {signedPreviewUrl ? 'Signed copy' : generatedPreviewUrl ? 'PDF ready' : 'Live preview'}
                          </span>
                        </div>
                        <iframe
                          title={`${documentLabel} preview`}
                          src={signedPreviewUrl || generatedPreviewUrl || undefined}
                          srcDoc={!signedPreviewUrl && !generatedPreviewUrl ? editablePreviewHtml : undefined}
                          className="min-h-[640px] w-full rounded-[22px] border border-[#eef3f9] bg-white"
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[#e5edf7] bg-white px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-[#102033]">{signedPreviewUrl ? 'Signed copy available' : generatedPreviewUrl ? 'Draft PDF available' : 'Live draft preview'}</p>
                          <p className="mt-1 text-xs text-[#6b7c93]">Preview syncs with saved draft content while final PDF/DOCX generation stays on the existing workflow.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {generatedPreviewUrl && typeof onView === 'function' ? (
                            <Button type="button" size="sm" variant="secondary" onClick={() => void onView?.()}>
                              <Eye size={14} />
                              Open Draft
                            </Button>
                          ) : null}
                          {previewDownloadUrl ? (
                            <a
                              href={previewDownloadUrl}
                              target="_blank"
                              rel="noreferrer"
                              download={previewDownloadName}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-control border border-borderDefault bg-surface px-4 text-secondary font-semibold shadow-surface transition-all duration-200 hover:-translate-y-0.5 hover:border-borderStrong hover:bg-mutedBg"
                            >
                              <Download size={14} />
                              Download PDF
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>

            <div className={secondaryGridClassName}>
              <aside className="space-y-5">
                {isMandatePacket ? (
                  <SigningMethodPanel
                    method={signingMethod}
                    packetType={packetType}
                    canChange={canChangeSigningMethod}
                    lockedReason={signingMethodLockedReason}
                    onSelect={handleSelectSigningMethod}
                    onOpenSignaturePrep={() => setSignerPrepOpen(true)}
                    signaturePrepSummary={signaturePrepSummary}
                    busy={actionBusy || loading}
                    className="xl:min-h-[360px]"
                  />
                ) : null}

                {isMandatePacket && signingMethod === 'physical' ? (
                  <PhysicalMandatePanel
                    file={manualSignedFile}
                    notes={manualSignedNotes}
                    confirmed={manualSignedConfirmed}
                    allPartiesSigned={manualSignedAllPartiesSigned}
                    uploaded={manualSignedUploaded || isFullySignedLifecycle}
                    uploadedAt={manualSignedUploadedAt || statusState?.packet?.completed_at || latestVersion?.finalised_at}
                    signedUrl={signedPreviewUrl}
                    busy={manualUploadBusy || actionBusy || loading}
                    canFinalize={legalPermissions.canFinalize && ['approved', 'locked'].includes(normalizedLifecycleState)}
                    onDownload={handlePhysicalDownload}
                    onFileChange={setManualSignedFile}
                    onNotesChange={setManualSignedNotes}
                    onConfirmedChange={setManualSignedConfirmed}
                    onAllPartiesSignedChange={setManualSignedAllPartiesSigned}
                    onUpload={handleManualSignedUpload}
                  />
                ) : null}

              </aside>

              <aside className="space-y-5">
                <ActivityPanel
                  activeTab={activityTab}
                  onTabChange={setActivityTab}
                  versions={statusState?.versions || []}
                  events={eventHistory}
                  templateLabel={normalizeText(templateDetail?.template_label || statusState?.packet?.template_label_snapshot)}
                  templateKey={normalizeText(templateDetail?.template_key || statusState?.packet?.template_key_snapshot)}
                  templateStoragePath={normalizeText(templateDetail?.template_storage_path)}
                  className="xl:h-[360px]"
                />
              </aside>
            </div>

            <div className="mt-5 rounded-[28px] border border-[#e5edf7] bg-white p-4 shadow-[0_16px_40px_rgba(16,32,51,0.05)] sm:p-5">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_auto] xl:items-center">
                <div className="grid min-w-0 gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-center">
                  <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-[6px] border-[#d9efe4] bg-white text-[1.35rem] font-semibold text-[#20b26b]">
                      {documentHealthPercent}%
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[#102033]">Document Health</p>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${
                          documentHealthPercent >= 85 ? 'border-[#d8f0e3] bg-[#effaf4] text-[#20b26b]' : 'border-[#f7debb] bg-[#fff8ed] text-[#b57a1d]'
                        }`}>
                          {documentHealthLabel}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {documentHealthItems.map((item) => (
                          <p key={item.key} className={`flex items-center gap-2 text-sm ${item.complete ? 'text-[#35546c]' : 'text-[#8a6a1d]'}`}>
                            {item.complete ? <Check size={14} className="text-[#20b26b]" /> : <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#f5a524]" />}
                            {item.label} {item.complete ? 'complete' : 'needs attention'}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ea4]">Next step</p>
                      {mergeUnresolvedCount ? (
                        <button
                          type="button"
                          onClick={() => setMergeDetailsOpen(true)}
                          className="text-xs font-semibold text-[#0a66ff]"
                        >
                          View details
                        </button>
                      ) : (
                        <span className="rounded-full border border-[#cde8d6] bg-[#eef9f2] px-2.5 py-1 text-[0.68rem] font-semibold text-[#2e7b4f]">
                          All fields resolved
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[1.1rem] font-semibold text-[#102033]">{workspacePrimaryLabel}</p>
                    <p className="mt-1 max-w-2xl text-sm text-[#6b7c93]">
                      {firstNonEmptyText(mandateNextAction, lifecycleCopy.next, lifecycleCopy.current, 'Continue preparing the legal document workspace.')}
                    </p>
                  </div>
                </div>

                <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 xl:justify-end">
                  <Button type="button" size="md" onClick={handleWorkspacePrimaryAction} disabled={loading || actionBusy}>
                    {actionBusy ? 'Working…' : workspacePrimaryLabel}
                  </Button>
                  <Button type="button" size="md" variant="secondary" onClick={handleFocusPreview} disabled={loading || !statusState?.packet?.id}>
                    <Eye size={15} />
                    Preview
                  </Button>
                  <Button
                    type="button"
                    size="md"
                    variant="secondary"
                    onClick={handleSendForSignatureIntent}
                    disabled={loading || actionBusy || signerBusy || !canSendForSignatureAction}
                  >
                    Send for Signature
                  </Button>
                  <div className="relative">
                    <Button
                      type="button"
                      size="md"
                      variant="secondary"
                      onClick={() => setBottomActionMenuOpen((current) => !current)}
                    >
                      More
                      <ChevronDown size={15} />
                    </Button>
                    {bottomActionMenuOpen ? (
                      <div className="absolute bottom-[calc(100%+10px)] right-0 z-20 min-w-[220px] rounded-[20px] border border-[#e6edf7] bg-white p-2 shadow-[0_18px_48px_rgba(16,32,51,0.14)]">
                        {previewDownloadUrl ? (
                          <a
                            href={previewDownloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            download={previewDownloadName}
                            className="flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-sm font-medium text-[#102033] transition hover:bg-[#f8fbff]"
                            onClick={() => setBottomActionMenuOpen(false)}
                          >
                            Download PDF
                            <ChevronRight size={14} className="text-[#8a99ad]" />
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setBottomActionMenuOpen(false)
                            setMergeDetailsOpen(true)
                          }}
                          className="flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-sm font-medium text-[#102033] transition hover:bg-[#f8fbff]"
                        >
                          Merge field details
                          <ChevronRight size={14} className="text-[#8a99ad]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBottomActionMenuOpen(false)
                            void refreshWorkspaceData()
                          }}
                          className="flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-sm font-medium text-[#102033] transition hover:bg-[#f8fbff]"
                        >
                          Refresh workspace
                          <ChevronRight size={14} className="text-[#8a99ad]" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Drawer
        open={mergeDetailsOpen}
        onClose={() => setMergeDetailsOpen(false)}
        title="Merge Field Checklist"
        subtitle="Canonical values resolved from onboarding, transaction, and packet context."
        widthClassName="max-w-[720px]"
      >
        <div className="space-y-4">
          <div className="rounded-[18px] border border-[#edf3fa] bg-[#f8fbff] px-4 py-3">
            <p className="text-lg font-semibold text-[#102033]">{mergeResolvedCount}/{mergeChecklist.rows.length} resolved</p>
            <p className="mt-1 text-sm text-[#6b7c93]">
              {mergeUnresolvedCount ? `${mergeUnresolvedCount} unresolved field${mergeUnresolvedCount === 1 ? '' : 's'}` : 'All tracked fields are resolved'}
            </p>
          </div>
          <MergeChecklistPanel
            packetType={packetType}
            placeholders={latestVersion?.placeholders_resolved_json || {}}
          />
        </div>
      </Drawer>

      <Drawer
        open={signerPrepOpen}
        onClose={() => setSignerPrepOpen(false)}
        title="Prepare for Signature"
        subtitle="Confirm agent, seller, and spouse signer details before sending secure links."
        widthClassName="max-w-[760px]"
      >
        <SignerPreparationPanel
          packetType={packetType}
          lifecycleState={normalizedLifecycleState}
          signingStatus={statusState?.signingStatus || sourceContext.signing_status || sourceContext.signingStatus || sourceContext.mandateStatus}
          canManageSigners={legalPermissions.canManageSigners}
          roster={signerRoster}
          draftByRole={signerDraftByRole}
          onDraftChange={handleSignerDraftChange}
          validation={signerValidation}
          onPrepare={handlePrepareSignerFields}
          onSave={handleSaveSignerDetails}
          onSend={() => runReviewAction('send_signature')}
          onResend={(role) => runReviewAction('resend_signature', { targetSignerRole: role })}
          onRefresh={handleRefreshSignerStatus}
          busy={actionBusy || signerBusy || loading}
        />
      </Drawer>
    </>
  )
}
