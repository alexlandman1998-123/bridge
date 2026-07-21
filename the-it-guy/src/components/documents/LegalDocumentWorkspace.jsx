import { AlertCircle, ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, Download, Eye, FileCheck2, FileText, Link2, MoreHorizontal, Plus, Printer, ShieldCheck, UploadCloud, UsersRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import Button from '../ui/Button'
import SigningOperationalStatusCard from './SigningOperationalStatusCard'
import SigningProgressTimeline from './SigningProgressTimeline'
import SigningActivityHistory from './SigningActivityHistory'
import SigningCompletionCertificate from './SigningCompletionCertificate'
import { DocumentJourneyProgress } from './DocumentJourneyProgress'
import { DocumentMobileActionDock } from './DocumentMobileActionDock'
import { DocumentAccessibilityNavigation } from './DocumentAccessibilityNavigation'
import { DocumentOutcomeNotice } from './DocumentOutcomeNotice'
import Drawer from '../ui/Drawer'
import { useWorkspace } from '../../context/WorkspaceContext'
import { normalizeAppRole } from '../../lib/appRoleMetadata'
import {
  appendDocumentPacketEvent,
  createDocumentPacketSigners,
  fetchDocumentPacket,
  fetchDocumentPacketTemplate,
  freezeEditableDocumentRevisionForRender,
  completeEditableDocumentRenderFreeze,
  verifyFrozenEditableRenderOutput,
  verifyServerAttestedNativePdfRender,
  persistGeneratedPdfToTransaction,
  requestPersistedPdfAccess,
  fetchSigningFieldLayout,
  saveSigningFieldPlacement,
  applySigningFieldLayout,
  completeAppliedEnvelopeDispatch,
  getFinalDocumentCompletionStatus,
  retryFinalDocumentCompletion,
  restoreEditableDocumentDraftRevision,
  saveEditableDocumentDraftRevision,
  transitionDocumentPacketLifecycle,
  updateDocumentPacket,
  updateDocumentPacketVersion,
  updateDocumentPacketVersionFinalArtifact,
  uploadFinalSignedPacketArtifact,
} from '../../lib/documentPacketsApi'
import { createSigningFieldBlock } from '../../core/documents/signingFieldLayout'
import { uploadDocument } from '../../lib/api'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
import {
  generateFinalSignedPacketDocument,
  generateSigningLinks,
  listPacketTemplates,
  prepareSigningFields,
  resolveActiveTemplate,
} from '../../core/documents/packetService'
import { resolveLegalDocumentGenerationRecovery } from '../../core/documents/legalDocumentGenerationRecovery'
import { captureLegalDocumentGenerationBaseline, reconcileLegalDocumentGenerationFailure } from '../../core/documents/legalDocumentGenerationReconciliation'
import { resolveLegalDocumentRetryPolicy } from '../../core/documents/legalDocumentGenerationRetryPolicy'
import { recordLegalDocumentGenerationSupportHandoff } from '../../core/documents/legalDocumentGenerationSupportHandoff'
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
  getMandateSignerRoleLabel,
  resolveMandateSecondarySignerConfig,
  resolveMandateSpouseRequirementFromFields,
} from '../../lib/mandateSignatureRules'
import { templateIsUsableForGeneration } from '../../core/documents/structuredTemplateRenderer'
import { resolveLegalDocumentSignerProfile } from '../../core/documents/legalDocumentSignerProfile'
import { resolveSigningOperationalStatus } from '../../core/documents/signingOperationalStatus'
import { findLatestPilotDocumentFallback, findLatestSignableGeneratedVersion, isPilotDocumentFallbackVersion } from '../../core/documents/pilotDocumentFallback'
import { buildDocumentResponsibility } from '../../core/documents/documentResponsibility'
import { buildDocumentHelpRecovery } from '../../core/documents/documentHelpRecovery'
import { buildDocumentJourneyProgress } from '../../core/documents/documentJourneyProgress'
import { getConditionalMasterPackDefinitions } from '../../core/documents/conditionalMasterTemplateDefinitions'
import { buildDocumentMobileAction } from '../../core/documents/documentMobileAction'
import { buildDocumentAccessibility } from '../../core/documents/documentAccessibility'
import { buildDocumentOutcomeFeedback } from '../../core/documents/documentOutcomeFeedback'
import { recordDocumentExperienceEvent } from '../../services/documentExperienceTelemetryService'
import {
  DOCUMENT_LIFECYCLE_STATES,
  assertDocumentLifecycleTransition,
  getDocumentLifecycleLabel,
  isDocumentLifecycleEditable,
  normalizeDocumentLifecycleState,
  resolveDocumentLifecycleStateFromPacket,
} from '../../core/documents/documentLifecycle'

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
  if (['pdf_generated', 'ready_to_send', 'sent', 'partially_signed', 'completed', 'archived'].includes(state)) return true
  return false
}

function hasUsablePacketVersionForSigning(version = null) {
  if (!normalizeText(version?.id)) return false
  if (isPilotDocumentFallbackVersion(version)) return false
  const renderStatus = normalizeKey(version?.render_status)
  return !renderStatus || ['generated', 'draft'].includes(renderStatus)
}

function getUsablePacketVersionForSigning(versions = []) {
  const rows = Array.isArray(versions) ? versions : []
  return rows.find((version) => hasUsablePacketVersionForSigning(version)) || null
}

function getGeneratedPacketVersionForSigning(versions = []) {
  return findLatestSignableGeneratedVersion(versions)
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
    'property_unit_number',
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

function groupConditionalPackIssues(issues = []) {
  const groups = new Map()
  for (const issue of issues || []) {
    const key = normalizeText(issue?.packKey || issue?.sectionKey || issue?.source || 'conditional_pack')
    const label = normalizeText(issue?.packLabel || issue?.sectionLabel || 'Conditional clause pack')
    const fieldLabel = normalizeText(issue?.placeholderLabel || issue?.placeholderKey || issue?.message)
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label,
        fields: [],
      })
    }
    if (fieldLabel && !groups.get(key).fields.includes(fieldLabel)) {
      groups.get(key).fields.push(fieldLabel)
    }
  }
  return Array.from(groups.values())
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
    return 'Mandate generation is taking too long. The template render service looks stalled, so Arch9 stopped waiting. Please try again.'
  }
  if (code === 'MISSING_TEMPLATE_FILE') return 'The active legal template is not available for rendering. Check the current template configuration first.'
  if (code === 'NATIVE_TEMPLATE_NOT_RENDERABLE') return 'The active native template is not renderable yet. Cover the required sections and merge fields first.'
  if (code === 'VALIDATION_BLOCKED') {
    const legalScenarioConflicts = Array.isArray(error?.validation?.legalDocumentConflictingFacts)
      ? error.validation.legalDocumentConflictingFacts
      : []
    if (legalScenarioConflicts.length) {
      return [
        'Legal Setup Conflict',
        ...legalScenarioConflicts.map((fact) => `- ${String(fact.field).replace(/_/g, ' ')}`),
        'Resolve the conflicting saved values before generating the document.',
      ].join('\n')
    }
    const legalScenarioInvalid = Array.isArray(error?.validation?.legalDocumentInvalidFacts)
      ? error.validation.legalDocumentInvalidFacts
      : []
    if (legalScenarioInvalid.length) {
      return [
        'Legal Setup Invalid',
        ...legalScenarioInvalid.map((fact) => `- ${String(fact.field).replace(/_/g, ' ')}`),
        'Choose a recognised value before generating the document.',
      ].join('\n')
    }
    const legalScenarioMissing = Array.isArray(error?.validation?.legalDocumentMissingRoutingFacts)
      ? error.validation.legalDocumentMissingRoutingFacts
      : []
    if (legalScenarioMissing.length) {
      return [
        'Legal Setup Incomplete',
        ...legalScenarioMissing.map((field) => `- ${String(field).replace(/_/g, ' ')}`),
        'Confirm these answers before generating the document.',
      ].join('\n')
    }
    const conditionalPackMissing = Array.isArray(error?.validation?.conditionalPackMissingPlaceholders)
      ? error.validation.conditionalPackMissingPlaceholders
      : []
    if (conditionalPackMissing.length) {
      const grouped = groupConditionalPackIssues(conditionalPackMissing)
      return [
        'Conditional Pack Data Missing',
        ...grouped.slice(0, 6).map((group) => `- ${group.label}: ${group.fields.slice(0, 6).join(', ')}`),
        'Complete the missing information before continuing.',
      ].join('\n')
    }
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

function isLegacyBridgeLogoUrl(value) {
  const text = normalizeText(value).toLowerCase()
  return text.includes('/brand/bridge_9') || text.includes('bridge_9_') || text.includes('bridge9')
}

function resolveSignerBlueprint(packetType = 'mandate', options = {}) {
  const key = normalizeKey(packetType)
  if (Array.isArray(options.legalSignerProfile?.signers)) {
    return options.legalSignerProfile.signers.map((signer) => ({
      role: signer.role,
      label: signer.label,
      required: Boolean(signer.required),
    }))
  }
  const mandateType = normalizeKey(options.mandateType || options.contextType)
  if (key === 'mandate' && mandateType === 'developer_agent_mandate') {
    return [
      { role: 'agent', label: 'Selling Agent', required: true },
      { role: 'seller', label: 'Developer', required: true },
    ]
  }
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
  const secondaryMandateSigner = resolveMandateSecondarySignerConfig({
    sourceContext: {
      ...sourceContext,
      sellerOnboarding,
      onboardingFormData,
    },
    latestVersion,
    placeholders,
  })

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
      signerName: normalizeText(secondaryMandateSigner?.signerName || ''),
      signerEmail: normalizeText(secondaryMandateSigner?.signerEmail || '').toLowerCase(),
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

function resolveSignerRoster({ packetType = 'mandate', signers = [], mandateSecondarySignerRequired = false, secondarySignerLabel = 'Co-signer', signerDefaults = {}, sourceContext = {}, legalSignerProfile = null } = {}) {
  const rows = Array.isArray(signers) ? signers : []
  const byRole = new Map()
  for (const row of rows) {
    const role = normalizeKey(row?.signer_role || row?.role)
    if (!role || byRole.has(role)) continue
    byRole.set(role, row)
  }

  const normalizedPacketType = normalizeKey(packetType)
  const mandateType = normalizeKey(sourceContext?.mandateType || sourceContext?.contextType)
  const blueprint = [
    ...resolveSignerBlueprint(packetType, { mandateType, legalSignerProfile }),
    ...(normalizedPacketType === 'mandate' && mandateSecondarySignerRequired && !legalSignerProfile
      ? [{ role: 'purchaser_2', label: secondarySignerLabel, required: true }]
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
    if (normalizedPacketType === 'mandate' && role === 'purchaser_2' && (legalSignerProfile || !mandateSecondarySignerRequired)) continue
    const defaults = signerDefaults?.[role] || {}
    roster.push({
      role,
      label: role === 'purchaser_2' ? secondarySignerLabel : role.replace(/_/g, ' '),
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

  if (['ready_to_send', 'sent', 'partially_signed', 'completed'].includes(normalizeDocumentLifecycleState(lifecycleState))) {
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

function firstPreviewText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function compactPreviewText(values = []) {
  return values.map((value) => normalizeText(value)).filter(Boolean).join(', ')
}

function resolvePreviewCompanyDetails(branding = {}) {
  const address = firstPreviewText(
    branding?.physicalAddress,
    branding?.physical_address,
    branding?.organisationPhysicalAddress,
    branding?.organisation_physical_address,
    branding?.address,
    compactPreviewText([branding?.addressLine1, branding?.addressLine2, branding?.city, branding?.province, branding?.postalCode]),
  )
  return [
    firstPreviewText(branding?.website, branding?.organisationWebsite, branding?.organisation_website, branding?.companyWebsite),
    firstPreviewText(branding?.email, branding?.organisationEmail, branding?.organisation_email, branding?.companyEmail),
    address,
    firstPreviewText(branding?.telephone, branding?.phoneNumber, branding?.phone_number, branding?.phone, branding?.organisationPhone, branding?.organisation_phone),
  ].filter(Boolean)
}

function renderPreviewCompanyDetails(items = [], fallback = '', className = 'company-details') {
  const rows = items.length ? items : [normalizeText(fallback)].filter(Boolean)
  if (!rows.length) return ''
  return `<span class="${className}">${rows.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</span>`
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
  if (Array.isArray(section?.mergeFields)) {
    return normalizePlaceholderTokens(section.mergeFields)
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
  const protectedConditionalPackKeys = new Set(
    getConditionalMasterPackDefinitions(packetType)
      .map((pack) => normalizeText(pack?.key))
      .filter(Boolean),
  )
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
    return key && !sourceKeySet.has(key) && !protectedConditionalPackKeys.has(key)
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
      metadata: section?.metadata && typeof section.metadata === 'object'
        ? section.metadata
        : section?.metadata_json && typeof section.metadata_json === 'object'
          ? section.metadata_json
          : snapshot?.metadata && typeof snapshot.metadata === 'object'
            ? snapshot.metadata
            : {},
      signingFields: Array.isArray(section?.signingFields)
        ? section.signingFields
        : Array.isArray(section?.signing_fields)
          ? section.signing_fields
          : Array.isArray(snapshot?.signingFields)
            ? snapshot.signingFields
            : [],
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
  const companyDetails = resolvePreviewCompanyDetails(branding)
  const headerCompanyDetailsHtml = renderPreviewCompanyDetails(companyDetails, orgName, 'company-details')
  const footerCompanyDetailsHtml = renderPreviewCompanyDetails(companyDetails.slice(0, 2), orgName, 'footer-company')
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
          .agency-brand { display: inline-flex; align-items: center; min-width: 0; color: #1f2937; font-size: 16px; font-weight: 800; letter-spacing: 0.01em; }
          .agency-brand img { max-width: 42mm; max-height: 15mm; object-fit: contain; }
          .company-details { display: grid; justify-items: end; gap: 2px; max-width: 78mm; color: #1f2937; font-size: 10.5px; font-weight: 600; line-height: 1.35; text-align: right; }
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
          .footer-brand, .footer-company { display: inline-flex; align-items: center; min-width: 34mm; max-width: 44mm; }
          .footer-company { display: grid; justify-items: end; gap: 1px; text-align: right; }
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
            .doc-header { flex-wrap: wrap; }
            .company-details { justify-items: start; text-align: left; }
            .doc-footer { flex-wrap: wrap; justify-content: center; text-align: center; }
            .footer-company { justify-items: center; text-align: center; }
          }
        </style>
      </head>
      <body>
        <main class="page">
          <header class="doc-header">
            <span class="agency-brand">${agencyLogo ? `<img src="${escapeHtml(agencyLogo)}" alt="${escapeHtml(orgName)} logo" />` : escapeHtml(orgName)}</span>
            ${headerCompanyDetailsHtml}
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
            ${footerCompanyDetailsHtml}
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
  return getDocumentLifecycleLabel(normalized) || 'Status Unavailable'
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
    bridgeLegalName: normalizeText(merged.bridgeLegalName) || normalizeText(merged.bridge_legal_name) || 'Arch9 Legal',
    bridgeLogoLabel: normalizeText(merged.bridgeLogoLabel) || 'Arch9',
    bridgeLogoLightUrl: isLegacyBridgeLogoUrl(merged.bridgeLogoLightUrl || merged.bridge_legal_logo_light_url)
      ? ''
      : normalizeText(merged.bridgeLogoLightUrl) || normalizeText(merged.bridge_legal_logo_light_url),
    bridgeLogoDarkUrl: isLegacyBridgeLogoUrl(merged.bridgeLogoDarkUrl || merged.bridge_legal_logo_dark_url)
      ? ''
      : normalizeText(merged.bridgeLogoDarkUrl) || normalizeText(merged.bridge_legal_logo_dark_url),
    website: resolveFirstBrandingValue(merged, [
      'website',
      'organisationWebsite',
      'organisation_website',
      'companyWebsite',
    ]),
    organisationWebsite: resolveFirstBrandingValue(merged, [
      'organisationWebsite',
      'organisation_website',
      'website',
      'companyWebsite',
    ]),
    email: resolveFirstBrandingValue(merged, [
      'email',
      'organisationEmail',
      'organisation_email',
      'companyEmail',
      'contactEmail',
    ]),
    organisationEmail: resolveFirstBrandingValue(merged, [
      'organisationEmail',
      'organisation_email',
      'email',
      'companyEmail',
      'contactEmail',
    ]),
    physicalAddress: resolveFirstBrandingValue(merged, [
      'physicalAddress',
      'physical_address',
      'organisationPhysicalAddress',
      'organisation_physical_address',
      'address',
    ]),
    organisationPhysicalAddress: resolveFirstBrandingValue(merged, [
      'organisationPhysicalAddress',
      'organisation_physical_address',
      'physicalAddress',
      'physical_address',
      'address',
    ]),
    telephone: resolveFirstBrandingValue(merged, [
      'telephone',
      'phoneNumber',
      'phone_number',
      'phone',
      'organisationPhone',
      'organisation_phone',
    ]),
    phoneNumber: resolveFirstBrandingValue(merged, [
      'phoneNumber',
      'phone_number',
      'telephone',
      'phone',
      'organisationPhone',
      'organisation_phone',
    ]),
    organisationPhone: resolveFirstBrandingValue(merged, [
      'organisationPhone',
      'organisation_phone',
      'phoneNumber',
      'phone_number',
      'telephone',
      'phone',
    ]),
    transactionReference: normalizeText(transactionReference),
  }
}

function formatMandateRouteLabel(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  return text
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function resolveMandateRoutingSnapshot({
  sourceContext = {},
  latestVersion = null,
  packet = null,
  templateDetail = null,
} = {}) {
  const summary = latestVersion?.validation_summary_json && typeof latestVersion.validation_summary_json === 'object'
    ? latestVersion.validation_summary_json
    : {}
  const renderProvenance = resolveSnapshotObject(summary.render_provenance, summary.renderProvenance)
  const generationPayload = resolveSnapshotObject(
    sourceContext.generationPayload,
    sourceContext.generation_payload,
    summary.generationPayload,
    summary.generation_payload,
  )
  const templateResolution = resolveSnapshotObject(
    sourceContext.templateResolution,
    sourceContext.template_resolution,
    summary.templateResolution,
    summary.template_resolution,
    generationPayload.templateResolution,
    generationPayload.template_resolution,
  )
  const routing = resolveSnapshotObject(
    sourceContext.mandateTemplateRouting,
    sourceContext.mandate_template_routing,
    generationPayload.mandateTemplateRouting,
    generationPayload.mandate_template_routing,
    templateResolution.mandateTemplateRouting,
    templateResolution.mandate_template_routing,
    summary.mandateTemplateRouting,
    summary.mandate_template_routing,
  )
  const fallbackWarning = resolveSnapshotObject(
    sourceContext.mandateTemplateFallbackWarning,
    sourceContext.mandate_template_fallback_warning,
    summary.mandateTemplateFallbackWarning,
    summary.mandate_template_fallback_warning,
    generationPayload.mandateTemplateFallbackWarning,
    generationPayload.mandate_template_fallback_warning,
  )

  const variant = firstNonEmptyText(
    sourceContext.mandateTemplateVariant,
    sourceContext.mandate_template_variant,
    generationPayload.mandateTemplateVariant,
    generationPayload.mandate_template_variant,
    summary.mandateTemplateVariant,
    summary.mandate_template_variant,
    routing.mandateTemplateVariant,
    routing.mandate_template_variant,
    renderProvenance.mandateTemplateVariant,
    renderProvenance.mandate_template_variant,
    latestVersion?.placeholders_resolved_json?.mandate_template_variant,
  )
  const selectedTemplate = firstNonEmptyText(
    routing.selectedTemplateLabel,
    routing.selected_template_label,
    routing.selectedTemplateKey,
    routing.selected_template_key,
    templateDetail?.template_label,
    templateDetail?.templateLabel,
    packet?.template_label_snapshot,
    packet?.templateLabelSnapshot,
  )
  const templateResolutionSource = firstNonEmptyText(
    sourceContext.templateResolutionSource,
    sourceContext.template_resolution_source,
    generationPayload.templateResolutionSource,
    generationPayload.template_resolution_source,
    summary.templateResolutionSource,
    summary.template_resolution_source,
    templateResolution.source,
  )
  const fallback = Boolean(
    sourceContext.mandateTemplateFallback ||
      sourceContext.mandate_template_fallback ||
      summary.mandateTemplateFallback ||
      summary.mandate_template_fallback ||
      generationPayload.mandateTemplateFallback ||
      generationPayload.mandate_template_fallback ||
      fallbackWarning.message ||
      normalizeKey(templateResolutionSource) === 'mandate_scenario_fallback',
  )
  const routeLabel = formatMandateRouteLabel(variant) || 'Route pending'
  const matchReasons = Array.isArray(routing.matchReasons)
    ? routing.matchReasons
    : Array.isArray(routing.match_reasons)
      ? routing.match_reasons
      : []

  const hasSignal = Boolean(
    variant ||
      selectedTemplate ||
      templateResolutionSource ||
      routing.selectedTemplateId ||
      routing.selected_template_id,
  )

  return {
    hasSignal,
    fallback,
    variant,
    routeLabel,
    selectedTemplate: selectedTemplate || 'Template not linked',
    templateResolutionSource,
    sellerProfile: formatMandateRouteLabel(firstNonEmptyText(routing.sellerClauseProfile, routing.seller_clause_profile, generationPayload.mandateScenarioProfile?.sellerClauseProfile)),
    propertyProfile: formatMandateRouteLabel(firstNonEmptyText(routing.propertyClauseProfile, routing.property_clause_profile, generationPayload.mandateScenarioProfile?.propertyClauseProfile)),
    propertyTitleType: formatMandateRouteLabel(firstNonEmptyText(routing.propertyTitleType, routing.property_title_type, generationPayload.mandateScenarioProfile?.propertyTitleType)),
    warningMessage: normalizeText(fallbackWarning.message) ||
      (fallback && variant ? `No live ${routeLabel} mandate template is routable yet, so this packet is using ${selectedTemplate || 'the selected default mandate template'}.` : ''),
    matchReasons,
    statusLabel: fallback
      ? 'Fallback active'
      : normalizeKey(templateResolutionSource) === 'mandate_scenario_variant'
        ? 'Scenario route matched'
        : variant
          ? 'Route selected'
          : 'Route pending',
  }
}

function resolvePrimaryActionLabel(mode, statusState, packetType) {
  const typeLabel = normalizeKey(packetType) === 'otp' ? 'OTP' : 'Mandate'
  const modeKey = normalizeKey(mode)
  if (modeKey === 'generate') {
    return normalizeKey(statusState) === 'no_packet' ? `Generate ${typeLabel} Draft` : 'Preview Draft'
  }
  if (modeKey === 'edit') return 'Preview Draft'
  if (modeKey === 'send') return 'Send for Signature'
  if (modeKey === 'signed') return 'View Signed PDF'
  if (modeKey === 'view') {
    if (normalizeDocumentLifecycleState(statusState) === 'completed') return 'View Signed PDF'
    return `View ${typeLabel}`
  }
  if (normalizeDocumentLifecycleState(statusState) === 'ready_to_send') return 'Send for Signature'
  if (['draft', 'pdf_generated'].includes(normalizeDocumentLifecycleState(statusState))) return 'Preview Draft'
  if (normalizeDocumentLifecycleState(statusState) === 'completed') return 'View Signed PDF'
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

const NORMALIZED_LIFECYCLE_STEPS = DOCUMENT_LIFECYCLE_STATES
const PHYSICAL_MANDATE_LIFECYCLE_STEPS = ['draft', 'pdf_generated', 'ready_to_send', 'printed', 'uploaded', 'completed', 'archived']
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
  if (normalized === 'generated' && method === 'digital') return 'Send the mandate to the required signers for digital signing.'
  if (normalized === 'generated' && method === 'physical') return 'Download the mandate for physical signature.'
  if (normalized === 'generated_for_physical_signature') return 'Upload the signed PDF once the required signers have signed the printed document.'
  if (normalized === 'sent_for_signature') return 'Monitor signing progress or resend the signing link if needed.'
  if (normalized === 'sent_to_agent') return 'Wait for the agency representative to sign first.'
  if (normalized === 'agent_signed') return 'Agent has signed. Seller invitation is being prepared.'
  if (normalized === 'sent_to_seller') return 'Agent has signed. Wait for the remaining seller-side signers to sign.'
  if (normalized === 'seller_signed' || normalized === 'completed') return 'All required signatures are complete.'
  if (normalized === 'viewed') return 'A signer has viewed the mandate. Wait for signature or follow up.'
  if (normalized === 'uploaded_signed') return 'Signed PDF is stored against this mandate.'
  if (normalized === 'signed') return 'Mandate is signed and stored.'
  if (normalized === 'declined') return 'Review the signer response and decide whether to resend or cancel.'
  if (normalized === 'failed') return 'Review the latest failure and retry after fixing the issue.'
  if (normalized === 'cancelled') return 'No further signing action is available on this mandate.'
  return 'Review mandate status.'
}

function normalizeLifecycleState(rawState = '') {
  return normalizeDocumentLifecycleState(rawState)
}

function resolveLifecycleCopy(state = 'draft', signingMethod = 'digital') {
  const key = resolveDisplayLifecycleState(state, signingMethod)
  const digitalMap = {
    draft: {
      current: 'Document is still editable.',
      next: 'Next step: generate the PDF when the content is ready.',
    },
    pdf_generated: {
      current: 'PDF generated. The document can still be edited and regenerated.',
      next: 'Next step: add or verify signing fields, then mark it ready to send.',
    },
    ready_to_send: {
      current: 'PDF and signing fields are ready.',
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
    completed: {
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
      next: 'Next step: generate the PDF.',
    },
    pdf_generated: {
      current: 'PDF generated. The mandate can still be edited and regenerated.',
      next: 'Next step: mark the PDF ready for physical signing.',
    },
    ready_to_send: {
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
    completed: {
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
  return isDocumentLifecycleEditable(state)
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

function SignerChecklistPanel({ packetType = 'mandate', signers = [], statusState, mandateSecondarySignerRequired = false, secondarySignerLabel = 'Co-signer' }) {
  const sourceContext = statusState?.packet?.source_context_json && typeof statusState.packet.source_context_json === 'object'
    ? statusState.packet.source_context_json
    : {}
  const signerRows = resolveSignerRoster({ packetType, signers, mandateSecondarySignerRequired, secondarySignerLabel, sourceContext })
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

function PdfSigningFieldCanvas({ pdfUrl = '', fields = [], onFieldChange = null, onPageCountChange = null, disabled = false }) {
  const canvasRef = useRef(null)
  const pageRef = useRef(null)
  const dragRef = useRef(null)
  const [pdfDocument, setPdfDocument] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [renderError, setRenderError] = useState('')
  const pageFields = fields.filter((field) => Number(field.pageNumber || 1) === pageNumber)

  useEffect(() => {
    if (!pdfUrl) return undefined
    let cancelled = false
    const task = pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false })
    task.promise.then((document) => {
      if (cancelled) return
      setPdfDocument(document)
      setPageCount(Math.max(1, document.numPages || 1))
      onPageCountChange?.(Math.max(1, document.numPages || 1))
      setPageNumber((current) => Math.min(Math.max(1, current), document.numPages || 1))
      setRenderError('')
    }).catch(() => {
      if (!cancelled) setRenderError('PDF preview could not be loaded. Refresh the certified PDF link and retry.')
    })
    return () => {
      cancelled = true
      task.destroy?.()
    }
  }, [onPageCountChange, pdfUrl])

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return undefined
    let cancelled = false
    let renderTask = null
    pdfDocument.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return
      const baseViewport = page.getViewport({ scale: 1 })
      const targetWidth = Math.min(680, pageRef.current?.clientWidth || 680)
      const viewport = page.getViewport({ scale: targetWidth / baseViewport.width })
      const canvas = canvasRef.current
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const context = canvas.getContext('2d')
      renderTask = page.render({ canvasContext: context, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] })
      return renderTask.promise
    }).catch((error) => {
      if (!cancelled && error?.name !== 'RenderingCancelledException') setRenderError('This PDF page could not be rendered.')
    })
    return () => {
      cancelled = true
      renderTask?.cancel?.()
    }
  }, [pageNumber, pdfDocument])

  function beginPointerAction(event, field, mode = 'move') {
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = {
      id: field.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      x: Number(field.xPosition || 0),
      y: Number(field.yPosition || 0),
      width: Number(field.width || 0),
      height: Number(field.height || 0),
    }
  }

  function movePointer(event) {
    const drag = dragRef.current
    const page = pageRef.current
    if (!drag || !page) return
    const rect = page.getBoundingClientRect()
    const dx = ((event.clientX - drag.startX) / rect.width) * 595
    const dy = ((event.clientY - drag.startY) / rect.height) * 842
    const snap = (value) => Math.round(value / 4) * 4
    if (drag.mode === 'resize') {
      const width = Math.min(595 - drag.x, Math.max(24, snap(drag.width + dx)))
      const height = Math.min(842 - drag.y, Math.max(18, snap(drag.height + dy)))
      onFieldChange?.(drag.id, { width, height })
    } else {
      const xPosition = Math.min(595 - drag.width, Math.max(0, snap(drag.x + dx)))
      const yPosition = Math.min(842 - drag.height, Math.max(0, snap(drag.y + dy)))
      onFieldChange?.(drag.id, { xPosition, yPosition })
    }
  }

  function endPointerAction() {
    dragRef.current = null
  }

  return (
    <div className="mt-3 rounded-[14px] border border-[#dce6f2] bg-[#eaf0f7] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Button type="button" size="sm" variant="secondary" disabled={pageNumber <= 1} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>Previous</Button>
        <span className="text-xs font-semibold text-[#526b85]">Page {pageNumber} of {pageCount}</span>
        <Button type="button" size="sm" variant="secondary" disabled={pageNumber >= pageCount} onClick={() => setPageNumber((value) => Math.min(pageCount, value + 1))}>Next</Button>
      </div>
      {renderError ? <p className="rounded-[10px] border border-[#f2d7d2] bg-[#fff4f2] p-3 text-xs text-[#a03a2a]">{renderError}</p> : null}
      <div ref={pageRef} className="relative mx-auto aspect-[595/842] w-full max-w-[595px] overflow-hidden bg-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {pageFields.map((field) => (
          <div
            key={field.id}
            role="button"
            tabIndex={0}
            onPointerDown={(event) => beginPointerAction(event, field, 'move')}
            onPointerMove={movePointer}
            onPointerUp={endPointerAction}
            onPointerCancel={endPointerAction}
            className={`absolute touch-none select-none rounded-[5px] border-2 px-1 text-center text-[10px] font-bold shadow-sm ${field.fieldType === 'initial' ? 'border-[#4d86c6] bg-[#e8f2ff]/90 text-[#24518a]' : 'border-[#20a861] bg-[#e9f8ef]/90 text-[#116b3b]'}`}
            style={{
              left: `${(Number(field.xPosition || 0) / 595) * 100}%`,
              top: `${(Number(field.yPosition || 0) / 842) * 100}%`,
              width: `${(Number(field.width || 1) / 595) * 100}%`,
              height: `${(Number(field.height || 1) / 842) * 100}%`,
            }}
          >
            <span className="pointer-events-none">{field.fieldType === 'initial' ? 'INITIAL' : 'SIGN'} · {String(field.signerRole || '').replace(/_/g, ' ')}</span>
            <span
              role="presentation"
              onPointerDown={(event) => beginPointerAction(event, field, 'resize')}
              onPointerMove={movePointer}
              onPointerUp={endPointerAction}
              onPointerCancel={endPointerAction}
              className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize rounded-tl bg-current"
            />
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-[#60758d]">Drag blocks to place them. Use the bottom-right handle to resize. Positions snap to a 4-point grid.</p>
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
  onResend = null,
  onRefresh = null,
  signingLayout = [],
  onAddSigningBlock = null,
  onSigningBlockChange = null,
  onRemoveSigningBlock = null,
  onSaveSigningLayout = null,
  onApplySigningLayout = null,
  signingLayoutRevision = 0,
  signingLayoutBusy = false,
  pdfPreviewUrl = '',
  onSigningPdfPageCountChange = null,
  busy = false,
}) {
  const rows = Array.isArray(roster) ? roster : []
  const canEditRoster = canManageSigners && ['draft', 'pdf_generated', 'ready_to_send'].includes(normalizeLifecycleState(lifecycleState))
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

      <div className="mt-4 rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-[#20344b]">Signature and initial blocks</p>
            <p className="mt-1 text-[0.68rem] text-[#6f839b]">Draft layout revision {signingLayoutRevision || 'new'} · saving does not send the document.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => onAddSigningBlock?.('signature')} disabled={busy || signingLayoutBusy || !canEditRoster}>Add signature</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => onAddSigningBlock?.('initial')} disabled={busy || signingLayoutBusy || !canEditRoster}>Add initials</Button>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {(signingLayout || []).map((field) => (
            <div key={field.id} className="grid gap-2 rounded-[12px] border border-[#e1e9f3] bg-white p-2 sm:grid-cols-[1fr_1fr_auto]">
              <select
                value={field.signerRole}
                onChange={(event) => onSigningBlockChange?.(field.id, 'signerRole', event.target.value)}
                disabled={busy || signingLayoutBusy || !canEditRoster}
                className="rounded-[9px] border border-[#d7e1ed] bg-white px-2 py-2 text-xs text-[#20344b]"
              >
                {['seller','seller_spouse','purchaser_1','purchaser_2','buyer_spouse','agent','witness_1','witness_2','other'].map((role) => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}
              </select>
              <label className="flex items-center gap-2 rounded-[9px] border border-[#e3eaf3] bg-[#f8fbff] px-3 py-1 text-xs font-semibold capitalize text-[#20344b]">
                {field.fieldType} · page
                <input
                  type="number"
                  min="1"
                  value={field.pageNumber}
                  onChange={(event) => onSigningBlockChange?.(field.id, 'pageNumber', Math.max(1, Number(event.target.value) || 1))}
                  disabled={busy || signingLayoutBusy || !canEditRoster}
                  className="w-14 rounded border border-[#d7e1ed] bg-white px-1 py-1 text-xs"
                />
              </label>
              <Button type="button" size="sm" variant="ghost" onClick={() => onRemoveSigningBlock?.(field.id)} disabled={busy || signingLayoutBusy || !canEditRoster}>Remove</Button>
            </div>
          ))}
          {!signingLayout?.length ? <p className="text-xs text-[#768ba3]">No blocks added yet.</p> : null}
        </div>
        {signingLayout?.length && pdfPreviewUrl ? (
          <PdfSigningFieldCanvas
            pdfUrl={pdfPreviewUrl}
            fields={signingLayout}
            disabled={busy || signingLayoutBusy || !canEditRoster}
            onPageCountChange={onSigningPdfPageCountChange}
            onFieldChange={(fieldId, patch) => Object.entries(patch).forEach(([key, value]) => onSigningBlockChange?.(fieldId, key, value))}
          />
        ) : null}
        <Button type="button" size="sm" className="mt-3" onClick={() => void onSaveSigningLayout?.()} disabled={busy || signingLayoutBusy || !canEditRoster || !signingLayout?.length}>
          {signingLayoutBusy ? 'Saving layout…' : 'Save block layout'}
        </Button>
        <Button type="button" size="sm" variant="secondary" className="ml-2 mt-3" onClick={() => void onApplySigningLayout?.()} disabled={busy || signingLayoutBusy || !canEditRoster || !signingLayoutRevision}>
          Apply layout to signers
        </Button>
      </div>

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
        <Button type="button" size="sm" onClick={() => void onPrepare?.()} disabled={busy || !canEditRoster}>
          {busy ? 'Working…' : 'Save and Prepare'}
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
      <div className="flex flex-wrap items-start justify-between gap-3">
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
  canResend = false,
  onResend = null,
  resendSummary = '',
  signaturePrepSummary = null,
  busy = false,
  className = '',
}) {
  const options = [
    {
      key: 'digital',
      title: 'Digital Signing',
      description: 'Send the mandate to the required seller-side signers to review and sign online.',
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
    <section className={`flex min-h-0 flex-col rounded-[24px] border border-[#e5edf7] bg-white p-5 shadow-[0_16px_40px_rgba(16,32,51,0.05)] ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-[1rem] font-semibold text-[#102033]">Signing Method</h4>
          <p className="mt-1 text-sm text-[#6b7c93]">Choose how you&apos;d like to send this mandate.</p>
        </div>
        <span className="rounded-full border border-[#dce6f2] bg-[#f7fbff] px-3 py-1 text-[0.68rem] font-semibold text-[#526b84]">
          {resolveSigningMethodLabel(method)}
        </span>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-5">
        <div className="grid gap-3 md:grid-cols-2">
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
                className={`flex h-full min-h-[136px] flex-col rounded-[20px] border p-4 text-left transition ${
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

        <div className="rounded-[20px] border border-[#edf3fa] bg-[#f8fbff] p-4">
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
          {canResend ? (
            <div className="mt-3 rounded-[16px] border border-[#dbe8f6] bg-white px-4 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#102033]">Resend signing links</p>
                  <p className="mt-1 text-xs leading-5 text-[#6b7c93]">
                    {resendSummary || 'Refresh and resend links to outstanding signers without changing the mandate.'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => onResend?.()} disabled={busy}>
                    {busy ? 'Working…' : 'Resend Links'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onOpenSignaturePrep?.()} disabled={busy}>
                    Choose Recipient
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" size="sm" className="w-full" onClick={() => onOpenSignaturePrep?.()} disabled={busy}>
              Open Signature Prep
            </Button>
          </div>
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
  currentEditableVersionId = '',
  canRestoreVersions = false,
  restoreBusyVersionId = '',
  onRestoreVersion = null,
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
      version,
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
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-[#e5edf7] bg-white p-5 shadow-[0_16px_40px_rgba(16,32,51,0.05)] ${className}`}>
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

      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2 [scrollbar-gutter:stable]">
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
                {isVersion && canRestoreVersions && item.version?.id !== currentEditableVersionId && Array.isArray(item.version?.editable_content_json?.sections) && item.version.editable_content_json.sections.length ? (
                  <div className="mt-3 flex justify-end border-t border-[#edf3fa] pt-3">
                    <button
                      type="button"
                      className="rounded-full border border-[#d7e3f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#a9c2dc] hover:bg-[#f4f8fc] disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void onRestoreVersion?.(item.version)}
                      disabled={Boolean(restoreBusyVersionId)}
                    >
                      {restoreBusyVersionId === item.version.id ? 'Restoring…' : 'Restore as new draft'}
                    </button>
                  </div>
                ) : null}
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

function MandateRoutePanel({ routing = null, className = '' }) {
  if (!routing?.hasSignal) return null

  const fallback = Boolean(routing.fallback)
  const statusClassName = fallback
    ? 'border-[#f7dfba] bg-[#fff8ed] text-[#9b6b1c]'
    : 'border-[#d8f0e3] bg-[#effaf4] text-[#23784d]'
  const iconClassName = fallback
    ? 'bg-[#fff3dd] text-[#9b6b1c]'
    : 'bg-[#effaf4] text-[#20b26b]'

  const rows = [
    { key: 'seller', label: 'Seller', value: routing.sellerProfile || 'Not classified' },
    { key: 'property', label: 'Property', value: routing.propertyProfile || routing.propertyTitleType || 'Not classified' },
    { key: 'template', label: 'Template', value: routing.selectedTemplate || 'Template not linked' },
  ]

  return (
    <section className={`rounded-[24px] border border-[#e5edf7] bg-white p-5 shadow-[0_16px_40px_rgba(16,32,51,0.05)] ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] ${iconClassName}`}>
            {fallback ? <AlertCircle size={17} /> : <ShieldCheck size={17} />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ea4]">Mandate route</p>
            <h4 className="mt-1 truncate text-[1rem] font-semibold text-[#102033]">{routing.routeLabel}</h4>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-[0.68rem] font-semibold ${statusClassName}`}>
          {routing.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-3 rounded-[16px] border border-[#edf3fa] bg-[#f8fbff] px-3 py-2.5">
            <span className="text-xs font-semibold text-[#7b8ea4]">{row.label}</span>
            <span className="min-w-0 max-w-[68%] truncate text-right text-xs font-semibold text-[#102033]" title={row.value}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {fallback ? (
        <div className="mt-4 rounded-[18px] border border-[#f4dfbf] bg-[#fff8ed] px-4 py-3 text-sm text-[#795315]">
          <p className="font-semibold text-[#7a4d10]">Route-specific template missing</p>
          <p className="mt-1 leading-5">{routing.warningMessage}</p>
          <a
            href="/settings/signing-templates"
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#f1d4a5] bg-white px-3 py-2 text-xs font-semibold text-[#7a4d10]"
          >
            Open Template Settings
            <ChevronRight size={13} />
          </a>
        </div>
      ) : (
        <p className="mt-4 rounded-[18px] border border-[#d9eee4] bg-[#effaf4] px-4 py-3 text-sm font-semibold text-[#23784d]">
          This packet is using the routed mandate template.
        </p>
      )}
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
  onSignedFinalized = null,
  onRefreshContext = null,
  autoGenerateEnabled = true,
}) {
  const isPageMode = displayMode === 'page'
  const { role: workspaceRole, profile: workspaceProfile } = useWorkspace()
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
  const [generationRecovery, setGenerationRecovery] = useState(null)
  const [signerBusy, setSignerBusy] = useState(false)
  const [signerDraftByRole, setSignerDraftByRole] = useState({})
  const [finalizeBusy, setFinalizeBusy] = useState(false)
  const [finalCompletionState, setFinalCompletionState] = useState(null)
  const [finalCompletionBusy, setFinalCompletionBusy] = useState(false)
  const [editableSections, setEditableSections] = useState([])
  const [editableDirty, setEditableDirty] = useState(false)
  const [draftSaveState, setDraftSaveState] = useState('saved')
  const [draftLastSavedAt, setDraftLastSavedAt] = useState('')
  const [restoreBusyVersionId, setRestoreBusyVersionId] = useState('')
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
  const [certifiedPdfAccessUrl, setCertifiedPdfAccessUrl] = useState('')
  const [pdfAccessBusy, setPdfAccessBusy] = useState(false)
  const [signingFieldLayout, setSigningFieldLayout] = useState([])
  const [signingFieldLayoutRevision, setSigningFieldLayoutRevision] = useState(0)
  const [signingFieldLayoutBusy, setSigningFieldLayoutBusy] = useState(false)
  const [signingPdfPageCount, setSigningPdfPageCount] = useState(1)
  const autoFinalizeGuardRef = useRef(new Set())
  const autoGenerateGuardRef = useRef('')
  const autoGenerateRunRef = useRef(0)
  const statusStateRef = useRef(initialStatus || null)
  const actionBusyRef = useRef(false)
  const generationFailureCountsRef = useRef(new Map())
  const recordedGenerationHandoffsRef = useRef(new Set())
  const signerBusyRef = useRef(false)
  const manualUploadBusyRef = useRef(false)
  const physicalDownloadBusyRef = useRef(false)
  const refreshWorkspacePromiseRef = useRef(null)
  const skippedInitialPageRefreshRef = useRef(false)
  const centerTabInitializedRef = useRef(false)
  const centerTabPreferenceRef = useRef(null)
  const autosavePromiseRef = useRef(null)
  const lastWorkspaceJourneyTelemetryRef = useRef('')
  const lastWorkspaceOutcomeTelemetryRef = useRef('')

  const recordWorkspaceExperience = useCallback((eventName, metadata = {}) => {
    void recordDocumentExperienceEvent({
      eventName,
      surface: 'workspace',
      role: workspaceRole,
      packetType,
      userId: workspaceProfile?.user_id || workspaceProfile?.userId || workspaceProfile?.id || '',
      workspaceId: organisationId || workspaceProfile?.organisation_id || workspaceProfile?.organisationId || '',
      ...metadata,
    })
  }, [organisationId, packetType, workspaceProfile?.id, workspaceProfile?.organisationId, workspaceProfile?.organisation_id, workspaceProfile?.userId, workspaceProfile?.user_id, workspaceRole])

  const applyPreparedSigningState = useCallback((prepared, fallbackStatus = statusStateRef.current || statusState) => {
    if (!prepared) return fallbackStatus
    const nextVersion = prepared?.version || null
    const existingVersions = Array.isArray(fallbackStatus?.versions) ? fallbackStatus.versions : []
    const nextVersions = nextVersion
      ? [nextVersion, ...existingVersions.filter((version) => normalizeText(version?.id) !== normalizeText(nextVersion?.id))]
      : existingVersions
    const nextStatus = {
      ...(fallbackStatus || {}),
      packet: prepared?.packet || fallbackStatus?.packet || null,
      versions: nextVersions,
      signingSummary: prepared?.summary || fallbackStatus?.signingSummary || null,
    }
    statusStateRef.current = nextStatus
    setStatusState(nextStatus)
    return nextStatus
  }, [statusState])

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

  useEffect(() => {
    const resolvedPacketId = normalizeText(statusState?.packet?.id || packetId)
    const resolvedVersionId = normalizeText(latestVersion?.id)
    if (!signerPrepOpen || !resolvedPacketId || !resolvedVersionId || latestVersion?.transaction_pdf_persisted !== true) return undefined
    let cancelled = false
    setSigningFieldLayoutBusy(true)
    fetchSigningFieldLayout({ packetId: resolvedPacketId, versionId: resolvedVersionId })
      .then((layout) => {
        if (cancelled) return
        setSigningFieldLayout(Array.isArray(layout?.fields) ? layout.fields : [])
        setSigningFieldLayoutRevision(Number(layout?.revision || 0))
        setSigningPdfPageCount(Number(layout?.pdfPageCount || 1))
      })
      .catch((error) => {
        if (!cancelled) setLoadError(toFriendlyWorkspaceError(error, 'Unable to load the signature block layout.'))
      })
      .finally(() => {
        if (!cancelled) setSigningFieldLayoutBusy(false)
      })
    return () => { cancelled = true }
  }, [latestVersion?.id, latestVersion?.transaction_pdf_persisted, packetId, signerPrepOpen, statusState?.packet?.id])

  const editableVersion = useMemo(() => {
    const versions = Array.isArray(statusState?.versions) ? statusState.versions : []
    return versions.find((version) => (
      normalizeKey(version?.edit_status) === 'draft' &&
      Array.isArray(version?.editable_content_json?.sections) &&
      version.editable_content_json.sections.length > 0
    )) || versions.find((version) => (
      normalizeKey(version?.render_status) === 'draft' &&
      Array.isArray(version?.section_manifest_json) &&
      version.section_manifest_json.length > 0
    )) || latestVersion
  }, [latestVersion, statusState?.versions])

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
  const isOtpPacket = normalizeKey(packetType) === 'otp'
  const sourceContext = useMemo(() => (
    statusState?.packet?.source_context_json && typeof statusState.packet.source_context_json === 'object'
      ? statusState.packet.source_context_json
      : {}
  ), [statusState?.packet?.source_context_json])
  const mandateSecondarySignerConfig = useMemo(
    () => {
      if (!isMandatePacket) {
        return {
          role: 'purchaser_2',
          kind: '',
          label: 'Co-signer',
          required: false,
          signerName: '',
          signerEmail: '',
        }
      }
      const signingRequirement = resolveMandateSpouseRequirementFromSigningSummary(statusState?.signingSummary)
      const resolved = resolveMandateSecondarySignerConfig({ sourceContext, latestVersion })
      if (signingRequirement !== null) {
        return {
          ...resolved,
          required: signingRequirement,
        }
      }
      return resolved
    },
    [isMandatePacket, latestVersion, sourceContext, statusState?.signingSummary],
  )
  const legalSignerProfile = useMemo(() => (
    isMandatePacket || isOtpPacket
      ? resolveLegalDocumentSignerProfile({
          packetType,
          placeholders: latestVersion?.placeholders_resolved_json || {},
          context: sourceContext,
        })
      : null
  ), [isMandatePacket, isOtpPacket, latestVersion?.placeholders_resolved_json, packetType, sourceContext])
  const signerDefaults = useMemo(() => {
    if (!legalSignerProfile) return {}
    const scenarioDefaults = Object.fromEntries(legalSignerProfile.signers.map((signer) => [signer.role, {
      signerName: signer.signerName,
      signerEmail: signer.signerEmail,
    }]))
    if (!isMandatePacket) return scenarioDefaults
    const legacyDefaults = buildSignerDefaultsFromContext({ sourceContext, latestVersion })
    return Object.fromEntries(Object.entries(scenarioDefaults).map(([role, value]) => [role, {
      signerName: value.signerName || legacyDefaults?.[role]?.signerName || '',
      signerEmail: value.signerEmail || legacyDefaults?.[role]?.signerEmail || '',
    }]))
  }, [isMandatePacket, latestVersion, legalSignerProfile, sourceContext])

  const signerRoster = useMemo(() => {
    return resolveSignerRoster({
      packetType,
      signers: statusState?.signingSummary?.signers || [],
      mandateSecondarySignerRequired: Boolean(mandateSecondarySignerConfig?.required),
      secondarySignerLabel: mandateSecondarySignerConfig?.label || 'Co-signer',
      signerDefaults,
      sourceContext,
      legalSignerProfile,
    })
  }, [legalSignerProfile, mandateSecondarySignerConfig?.label, mandateSecondarySignerConfig?.required, packetType, signerDefaults, sourceContext, statusState?.signingSummary?.signers])

  const effectiveSignerRoster = useMemo(() => {
    const rows = [...signerRoster]
    const existingRoles = new Set(rows.map((row) => row.role))
    for (const field of signingFieldLayout) {
      const role = normalizeKey(field?.signerRole)
      if (!role || existingRoles.has(role)) continue
      existingRoles.add(role)
      rows.push({
        role,
        label: role.replace(/_/g, ' '),
        required: true,
        signer: null,
        signerName: '',
        signerEmail: '',
        status: 'Pending',
        statusRaw: 'pending',
        seenAt: '',
        signedAt: '',
      })
    }
    return rows
  }, [signerRoster, signingFieldLayout])

  const signerValidation = useMemo(() => {
    const rosterWithDraft = effectiveSignerRoster.map((row) => {
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
  }, [effectiveSignerRoster, normalizedLifecycleState, signerDraftByRole])

  const editableAllowed = useMemo(() => {
    return canEditForLifecycle(normalizedLifecycleState)
  }, [normalizedLifecycleState])

  const editableSnapshot = useMemo(() => {
    if (editableVersion?.editable_content_json && typeof editableVersion.editable_content_json === 'object' && Array.isArray(editableVersion.editable_content_json.sections)) {
      return editableVersion.editable_content_json
    }
    const summary = editableVersion?.validation_summary_json
    if (summary && typeof summary === 'object' && summary.editable_draft && typeof summary.editable_draft === 'object') {
      return summary.editable_draft
    }
    return null
  }, [editableVersion?.editable_content_json, editableVersion?.validation_summary_json])

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

  const hydratedGeneratedPreviewUrl = normalizeText(latestVersion?.rendered_file_access_url || latestVersion?.rendered_file_url || '')
  useEffect(() => {
    setCertifiedPdfAccessUrl(hydratedGeneratedPreviewUrl)
  }, [hydratedGeneratedPreviewUrl, latestVersion?.id])
  const generatedPreviewUrl = certifiedPdfAccessUrl || hydratedGeneratedPreviewUrl
  const signedPreviewUrl = normalizeText(
    latestVersion?.final_signed_file_access_url || latestVersion?.final_signed_file_url || '',
  )
  const signedPreviewPath = normalizeText(latestVersion?.final_signed_file_path || '')

  useEffect(() => {
    const resolvedPacketId = normalizeText(statusState?.packet?.id || packetId)
    const resolvedVersionId = normalizeText(latestVersion?.id)
    if (!isUuidLike(resolvedPacketId) || !isUuidLike(resolvedVersionId) || !signedPreviewPath) {
      setFinalCompletionState(null)
      return undefined
    }
    let active = true
    getFinalDocumentCompletionStatus({ packetId: resolvedPacketId, versionId: resolvedVersionId })
      .then((result) => { if (active) setFinalCompletionState(result) })
      .catch((error) => {
        console.warn('[LegalDocumentWorkspace] final completion status unavailable.', error)
        if (active) setFinalCompletionState(null)
      })
    return () => { active = false }
  }, [latestVersion?.id, packetId, signedPreviewPath, statusState?.packet?.id])

  async function handleRetryFinalCompletion() {
    const resolvedPacketId = normalizeText(statusState?.packet?.id || packetId)
    const resolvedVersionId = normalizeText(latestVersion?.id)
    if (!isUuidLike(resolvedPacketId) || !isUuidLike(resolvedVersionId)) return
    try {
      setFinalCompletionBusy(true)
      setActionFeedback('')
      const result = await retryFinalDocumentCompletion({ packetId: resolvedPacketId, versionId: resolvedVersionId })
      setFinalCompletionState(result?.status || await getFinalDocumentCompletionStatus({ packetId: resolvedPacketId, versionId: resolvedVersionId }))
      setActionFeedback('Final signed document completed across the transaction and portal surfaces.')
      await refreshWorkspaceData()
    } catch (error) {
      setActionFeedback(error?.message || 'The signed PDF is safe, but completion still needs attention. Please retry.')
    } finally {
      setFinalCompletionBusy(false)
    }
  }
  const signerSummary = statusState?.signingSummary || null
  const canFinalizeSignedRecord = useMemo(() => canFinalizeSigningSummary(signerSummary), [signerSummary])
  const isFullySignedLifecycle = normalizedLifecycleState === 'completed'
  const hasFinalArtifact = Boolean(signedPreviewPath || signedPreviewUrl)
  const signingOperationalStatus = useMemo(() => resolveSigningOperationalStatus({
    packetType,
    packet: statusState?.packet || {},
    versions: statusState?.versions || [],
    signingSummary: statusState?.signingSummary || {},
    finalCompletion: finalCompletionState || statusState?.finalCompletion || null,
    viewerRole: workspaceRole,
  }), [finalCompletionState, packetType, statusState?.finalCompletion, statusState?.packet, statusState?.signingSummary, statusState?.versions, workspaceRole])
  const documentJourney = useMemo(() => buildDocumentJourneyProgress({
    surface: 'workspace',
    state: signingOperationalStatus.state,
  }), [signingOperationalStatus.state])
  const responsibility = useMemo(() => buildDocumentResponsibility({
    surface: 'workspace',
    role: workspaceRole,
    state: signingOperationalStatus.state,
    signers: statusState?.signingSummary?.signers || [],
  }), [signingOperationalStatus.state, statusState?.signingSummary?.signers, workspaceRole])
  const helpRecovery = useMemo(() => buildDocumentHelpRecovery({
    surface: 'workspace',
    role: workspaceRole,
    state: signingOperationalStatus.state,
    issue: loadError,
    hasPreview: Boolean(generatedPreviewUrl || signedPreviewUrl),
  }), [generatedPreviewUrl, loadError, signedPreviewUrl, signingOperationalStatus.state, workspaceRole])
  const outcomeFeedback = useMemo(() => buildDocumentOutcomeFeedback({
    surface: 'workspace',
    message: actionFeedback,
  }), [actionFeedback])

  useEffect(() => {
    const state = signingOperationalStatus.state
    if (!open || !state || lastWorkspaceJourneyTelemetryRef.current === state) return
    lastWorkspaceJourneyTelemetryRef.current = state
    recordWorkspaceExperience('journey_viewed', { state })
  }, [open, recordWorkspaceExperience, signingOperationalStatus.state])

  useEffect(() => {
    const category = outcomeFeedback?.category || ''
    const outcomeKey = `${signingOperationalStatus.state}:${category}`
    if (!open || !category || lastWorkspaceOutcomeTelemetryRef.current === outcomeKey) return
    lastWorkspaceOutcomeTelemetryRef.current = outcomeKey
    recordWorkspaceExperience('outcome_shown', { state: signingOperationalStatus.state, category })
  }, [open, outcomeFeedback?.category, recordWorkspaceExperience, signingOperationalStatus.state])

  function handleHelpRecoveryAction(actionId) {
    recordWorkspaceExperience('recovery_selected', { state: signingOperationalStatus.state, actionId, category: helpRecovery.category })
    if (actionId === 'review_information') {
      setMergeDetailsOpen(true)
      centerTabPreferenceRef.current = 'editor'
      setCenterTab('editor')
    } else if (actionId === 'refresh') {
      void refreshWorkspaceData()
    } else if (actionId === 'retry') {
      if (activeGenerationRecovery) void handleGenerationRecoveryAction()
      else if (isMandatePacket && typeof onGenerate === 'function') void resetFailedMandateAndRegenerate()
      else void refreshWorkspaceData()
    }
  }
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
  // Seller onboarding is a digital-signing flow. Physical signing remains an explicit
  // exception, but agents should not need to make a default-method click first.
  const signingMethod = isMandatePacket
    ? normalizeSigningMethod(sourceContext.signing_method || sourceContext.signingMethod || 'digital')
    : 'digital'
  const mandateStatus = isMandatePacket ? normalizeMandateStatus(statusState, sourceContext, latestVersion) : ''
  const mandateStatusMeta = MANDATE_STATUS_BADGES[mandateStatus] || MANDATE_STATUS_BADGES.draft
  const mandateRoutingSnapshot = isMandatePacket
    ? resolveMandateRoutingSnapshot({
        sourceContext,
        latestVersion,
        packet: statusState?.packet || packetDetail,
        templateDetail,
      })
    : null
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
    if (digitalSigningStarted || ['sent', 'partially_signed', 'completed'].includes(normalizedLifecycleState)) {
      return 'This mandate has already been sent for digital signature. The signing method can no longer be changed.'
    }
    return ''
  })()
  const currentSigningStatusForActions = normalizeKey(statusState?.signingStatus || sourceContext.signing_status || sourceContext.signingStatus || sourceContext.mandateStatus)
  const canResendSignatureLinks =
    isMandatePacket &&
    signingMethod === 'digital' &&
    legalPermissions.canResend &&
    !hasFinalArtifact &&
    !manualSignedUploaded &&
    (
      ['sent', 'partially_signed'].includes(normalizedLifecycleState) ||
      ['sent_for_signature', 'sent_to_agent', 'agent_signed', 'sent_to_seller', 'viewed', 'failed'].includes(currentSigningStatusForActions)
    )
  const resendSignatureSummary = (() => {
    if (!canResendSignatureLinks) return ''
    if (currentSigningStatusForActions === 'sent_to_agent') return 'Refresh the agent signing link if the first signer did not receive it.'
    if (['agent_signed', 'sent_to_seller', 'viewed'].includes(currentSigningStatusForActions)) {
      return 'Refresh seller-side signing links for outstanding recipients.'
    }
    if (currentSigningStatusForActions === 'failed') return 'Retry delivery after checking the signer details.'
    return 'Refresh and resend links to outstanding signers without changing the mandate.'
  })()
  const canChangeSigningMethod =
    isMandatePacket &&
    !signingMethodLockedReason &&
    ['draft', 'pdf_generated', 'ready_to_send'].includes(normalizedLifecycleState) &&
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
    signerValidation.blockers,
    signerValidation.warnings,
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
  const documentHealthItems = (() => {
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
      {
        key: 'mandate_route',
        label: 'Mandate route',
        complete: mandateRoutingSnapshot?.hasSignal ? !mandateRoutingSnapshot.fallback : true,
      },
    ]
  })()

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

  const primaryLabel = useMemo(() => {
    if (normalizedLifecycleState === 'ready_to_send') return 'Send for Signature'
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
        const template = await fetchDocumentPacketTemplate(templateId, { includeSections: true })
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
    centerTabInitializedRef.current = false
    centerTabPreferenceRef.current = null
  }, [mode, packetType, transactionId])

  useEffect(() => {
    if (!open) return
    const editableManifest = Array.isArray(editableVersion?.section_manifest_json)
      ? editableVersion.section_manifest_json
      : []
    const generatedManifest = Array.isArray(latestVersion?.section_manifest_json)
      ? latestVersion.section_manifest_json
      : []
    const templateManifest = Array.isArray(templateDetail?.canonical_definition?.sections)
      ? templateDetail.canonical_definition.sections
      : Array.isArray(templateDetail?.sections)
        ? templateDetail.sections
        : []
    // Old editable revisions were seeded with just the introduction section. Prefer the
    // real generated/template outline whenever it has more than that stale placeholder.
    const manifest = generatedManifest.length > 1
      ? generatedManifest
      : templateManifest.length > 1
        ? templateManifest
        : editableManifest
    const placeholderMap = editableVersion?.placeholders_resolved_json && typeof editableVersion.placeholders_resolved_json === 'object'
      ? editableVersion.placeholders_resolved_json
      : {}
    const sections = convertManifestToEditableSections({
      packetType,
      manifest,
      placeholders: placeholderMap,
      editableSnapshot,
    })
    setEditableSections(sections)
    setEditableDirty(false)
    setDraftSaveState('saved')
    setDraftLastSavedAt(normalizeText(editableVersion?.updated_at || editableVersion?.created_at))
    setCollapsedSectionKeys(new Set(sections.slice(1).map((section) => normalizeText(section?.key)).filter(Boolean)))
    setDraftReviewState(
      normalizeText(editableSnapshot?.review_state || editableSnapshot?.reviewState) || normalizeText(editableVersion?.validation_summary_json?.review_state) || 'draft',
    )
    setCenterTab((currentTab) => {
      const preferredTab = centerTabPreferenceRef.current
      if (preferredTab === 'editor' && sections.length && editableAllowed) return 'editor'
      if (preferredTab === 'preview') return 'preview'
      if (currentTab === 'editor' && (!sections.length || !editableAllowed)) return 'preview'
      if (!centerTabInitializedRef.current) {
        centerTabInitializedRef.current = true
        return normalizeKey(mode) === 'edit' && sections.length && editableAllowed ? 'editor' : 'preview'
      }
      return currentTab
    })
  }, [editableAllowed, editableSnapshot, editableVersion?.id, editableVersion?.placeholders_resolved_json, editableVersion?.section_manifest_json, editableVersion?.validation_summary_json?.review_state, latestVersion?.section_manifest_json, mode, open, packetType, templateDetail?.canonical_definition?.sections, templateDetail?.sections])

  useEffect(() => {
    if (!editableDirty || !open || !editableAllowed || !editableSections.length || actionBusy) return undefined
    const timeoutId = window.setTimeout(() => {
      if (autosavePromiseRef.current) return
      setDraftSaveState('saving')
      const savePromise = saveEditableDraftVersion({ reviewState: draftReviewState, source: 'autosave' })
        .then((version) => {
          setEditableDirty(false)
          setDraftSaveState('saved')
          setDraftLastSavedAt(normalizeText(version?.updated_at || version?.created_at || new Date().toISOString()))
          return version
        })
        .catch((error) => {
          const conflict = normalizeText(error?.code) === 'STALE_EDITABLE_DOCUMENT_REVISION'
          setDraftSaveState(conflict ? 'conflict' : 'error')
          setLoadError(conflict
            ? 'This document changed in another session. Reload before continuing so no wording is overwritten.'
            : toFriendlyWorkspaceError(error, 'Autosave failed. Your changes remain in this browser; retry Save.'))
        })
        .finally(() => {
          autosavePromiseRef.current = null
        })
      autosavePromiseRef.current = savePromise
    }, 1500)
    return () => window.clearTimeout(timeoutId)
  }, [actionBusy, draftReviewState, editableDirty, editableSections, editableAllowed, editableVersion?.id, open])

  useEffect(() => {
    if (!editableDirty) return undefined
    const warnBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [editableDirty])

  useEffect(() => {
    if (!open) return
    setSignerDraftByRole((previous) => {
      const next = {}
      for (const row of effectiveSignerRoster) {
        const previousRow = previous[row.role] || {}
        next[row.role] = {
          signerName: normalizeText(previousRow.signerName || row.signerName),
          signerEmail: normalizeText(previousRow.signerEmail || row.signerEmail).toLowerCase(),
        }
      }
      return next
    })
  }, [effectiveSignerRoster, open])

  useEffect(() => {
    if (!open) return
    if (loading || actionBusy || signerBusy || finalizeBusy) return
    if (!['sent', 'partially_signed', 'completed'].includes(normalizedLifecycleState)) return
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
        await transitionDocumentPacketLifecycle({
          packetId: resolvedPacketId,
          nextState: 'completed',
          versionId: resolvedVersionId,
          sourceContextPatch: {
            finalizedAt: nowIso,
            finalSignedVersionId: resolvedVersionId,
            finalArtifactPath: normalizeText(result?.finalArtifact?.path || latestVersion?.final_signed_file_path || ''),
          },
          eventPayload: { source: 'auto_finalize' },
        })
        await onSignedFinalized?.({
          source: 'auto_finalize',
          packetId: resolvedPacketId,
          packetVersionId: resolvedVersionId,
          packet: statusState?.packet || null,
          version: latestVersion || null,
          finalArtifact: result?.finalArtifact || null,
          finalFilePath: normalizeText(result?.finalArtifact?.path || latestVersion?.final_signed_file_path || ''),
          finalFileName: normalizeText(result?.finalArtifact?.fileName || latestVersion?.final_signed_file_name || 'signed-mandate.pdf'),
          finalFileUrl: normalizeText(result?.finalArtifact?.signedUrl || result?.finalArtifact?.url || latestVersion?.final_signed_file_url || latestVersion?.final_signed_file_access_url || ''),
          finalFileBucket: normalizeText(result?.finalArtifact?.bucket || latestVersion?.final_signed_file_bucket || ''),
          signingMethod: signingMethod || 'digital',
          signingStatus: 'signed',
          finalizedAt: nowIso,
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
    latestVersion?.final_signed_file_name,
    latestVersion?.final_signed_file_url,
    latestVersion?.final_signed_file_access_url,
    latestVersion?.final_signed_file_bucket,
    loading,
    normalizedLifecycleState,
    onSignedFinalized,
    onRefreshContext,
    organisationId,
    open,
    refreshWorkspaceData,
    signingMethod,
    signerBusy,
    statusState?.packet?.organisation_id,
    statusState?.packet?.id,
    statusState?.packet?.source_context_json,
    statusState?.packet?.updated_at,
    updateWorkspacePacket,
  ])

  function markEditableDraftDirty() {
    setEditableDirty(true)
    setDraftSaveState('unsaved')
  }

  function handleChangeSection(sectionKey, value) {
    const nextValue = String(value || '')
    markEditableDraftDirty()
    setEditableSections((previous) =>
      previous.map((section) => (section.key === sectionKey ? { ...section, content: nextValue } : section)),
    )
  }

  function handleInsertToken(sectionKey, token) {
    const normalizedToken = normalizeText(token)
    if (!normalizedToken) return
    markEditableDraftDirty()
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
    markEditableDraftDirty()
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
    centerTabPreferenceRef.current = 'editor'
    setCenterTab('editor')
    setLoadError('')
    setGenerationRecovery(null)
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
    markEditableDraftDirty()
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

    const payload = effectiveSignerRoster
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
    setActionProgressMessage('Preparing signature fields…')
    try {
      setActionProgressMessage('Saving signer details…')
      const savedCount = await saveSignerDetails({ includeOptional: true })
      let workingStatus = statusStateRef.current || statusState
      if (savedCount > 0) {
        const refreshed = await refreshWorkspaceData()
        if (refreshed?.resolved) {
          statusStateRef.current = refreshed.resolved
          setStatusState(refreshed.resolved)
          workingStatus = refreshed.resolved
        }
      }
      setActionProgressMessage('Preparing signature fields…')
      const signingVersion = getSigningVersionSnapshot(workingStatus, latestVersion)
      const prepared = await prepareSigningFields({
        packetId: resolvedPacketId,
        packetType,
        organisationId: workingStatus?.packet?.organisation_id || organisationId || null,
        placeholders: signingVersion?.placeholders_resolved_json || latestVersion?.placeholders_resolved_json || {},
        context: workingStatus?.packet?.source_context_json || {},
      })
      applyPreparedSigningState(prepared)
      setActionFeedback(savedCount > 0 ? 'Signer details saved and signature fields prepared.' : 'Signature fields prepared. Signer details were already up to date.')
    } catch (error) {
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to prepare signer fields right now.'))
    } finally {
      setSignerBusy(false)
      setActionProgressMessage('')
    }
  }

  function handleAddSigningBlock(fieldType) {
    const defaultRole = packetType === 'otp' ? 'purchaser_1' : 'seller'
    setSigningFieldLayout((current) => [
      ...current,
      createSigningFieldBlock({ fieldType, signerRole: defaultRole, index: current.length }),
    ])
  }

  function handleSigningBlockChange(fieldId, key, value) {
    setSigningFieldLayout((current) => current.map((field) => (
      field.id === fieldId ? { ...field, [key]: value } : field
    )))
  }

  function handleRemoveSigningBlock(fieldId) {
    setSigningFieldLayout((current) => current.filter((field) => field.id !== fieldId))
  }

  async function handleSaveSigningLayout() {
    const resolvedPacketId = normalizeText(statusState?.packet?.id || packetId)
    const resolvedVersionId = normalizeText(latestVersion?.id)
    if (!resolvedPacketId || !resolvedVersionId) {
      setLoadError('Generate and persist the PDF before adding signature blocks.')
      return
    }
    setSigningFieldLayoutBusy(true)
    setLoadError('')
    try {
      const saved = await saveSigningFieldPlacement({
        packetId: resolvedPacketId,
        versionId: resolvedVersionId,
        fields: signingFieldLayout,
        expectedRevision: signingFieldLayoutRevision,
        pdfPageCount: signingPdfPageCount,
      })
      setSigningFieldLayout(saved.fields)
      setSigningFieldLayoutRevision(Number(saved.revision || 0))
      setActionFeedback(`Signature block layout saved (${saved.fields.length} block${saved.fields.length === 1 ? '' : 's'}).`)
    } catch (error) {
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to save the signature block layout.'))
    } finally {
      setSigningFieldLayoutBusy(false)
    }
  }

  async function handleApplySigningLayout() {
    const resolvedPacketId = normalizeText(statusState?.packet?.id || packetId)
    const resolvedVersionId = normalizeText(latestVersion?.id)
    if (!resolvedPacketId || !resolvedVersionId || signingFieldLayoutRevision < 1) {
      setLoadError('Save the visual block layout before applying it to signers.')
      return
    }
    setSigningFieldLayoutBusy(true)
    setLoadError('')
    setActionFeedback('')
    try {
      await saveSignerDetails({ includeOptional: true })
      const applied = await applySigningFieldLayout({
        packetId: resolvedPacketId,
        versionId: resolvedVersionId,
        layoutRevision: signingFieldLayoutRevision,
      })
      const refreshed = await refreshWorkspaceData()
      if (refreshed?.resolved) {
        statusStateRef.current = refreshed.resolved
        setStatusState(refreshed.resolved)
      }
      setActionFeedback(`Signing layout applied to ${applied.fieldCount} field${applied.fieldCount === 1 ? '' : 's'}. The document has not been sent.`)
    } catch (error) {
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to map the signature layout to the selected signers.'))
    } finally {
      setSigningFieldLayoutBusy(false)
    }
  }

  async function ensureSignerReadinessBeforeSend({ isResend = false, targetSignerRole = '' } = {}) {
    assertWorkspacePermission(isResend ? 'canResend' : 'canSend', isResend ? 'resend signing links' : 'send documents for signature')
    let workingStatus = statusStateRef.current || statusState
    let preparedVersionId = ''
    let preparedDuringSend = false
    const ensurePrepared = async () => {
      preparedDuringSend = true
      setActionProgressMessage('Preparing signature fields…')
      const signingVersion = getSigningVersionSnapshot(workingStatus, latestVersion)
      const prepared = await prepareSigningFields({
        packetId: normalizeText(workingStatus?.packet?.id || packetId),
        packetType,
        organisationId: workingStatus?.packet?.organisation_id || organisationId || null,
        placeholders: signingVersion?.placeholders_resolved_json || latestVersion?.placeholders_resolved_json || {},
        context: workingStatus?.packet?.source_context_json || {},
      })
      preparedVersionId = normalizeText(prepared?.version?.id) || preparedVersionId
      workingStatus = applyPreparedSigningState(prepared, workingStatus)
    }

    const alreadyPrepared = Number(workingStatus?.signingSummary?.signerCount || 0) > 0 &&
      Number(workingStatus?.signingSummary?.fieldCount || 0) > 0
    if (isResend) {
      const refreshed = await refreshWorkspaceData()
      workingStatus = refreshed?.resolved || statusStateRef.current || statusState || workingStatus
    } else if (!alreadyPrepared) {
      await ensurePrepared()
    } else {
      preparedVersionId = normalizeText(getGeneratedPacketVersionForSigning(workingStatus?.versions || [])?.id)
    }

    let latestRoster = resolveSignerRoster({
      packetType,
      signers: workingStatus?.signingSummary?.signers || [],
      mandateSecondarySignerRequired: Boolean(mandateSecondarySignerConfig?.required),
      secondarySignerLabel: mandateSecondarySignerConfig?.label || 'Co-signer',
      signerDefaults,
      sourceContext: workingStatus?.packet?.source_context_json || sourceContext,
      legalSignerProfile,
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
      setActionProgressMessage('Saving signer details…')
      await saveSignerDetails({ includeOptional: true })
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

    setActionProgressMessage(preparedDuringSend ? 'Creating secure signing links…' : 'Refreshing secure signing links…')
    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://app.arch9.co.za'
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
    if (!['sent', 'partially_signed', 'completed'].includes(normalizedLifecycleState)) {
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
      await transitionDocumentPacketLifecycle({
        packetId: resolvedPacketId,
        nextState: 'completed',
        versionId,
        sourceContextPatch: {
          finalizedAt: nowIso,
          finalSignedVersionId: versionId,
          finalArtifactPath: normalizeText(result?.finalArtifact?.path || latestVersion?.final_signed_file_path || ''),
        },
        eventPayload: { source: 'manual_finalize' },
      })
      await onSignedFinalized?.({
        source: 'manual_finalize',
        packetId: resolvedPacketId,
        packetVersionId: versionId,
        packet: statusState?.packet || null,
        version: latestVersion || null,
        finalArtifact: result?.finalArtifact || null,
        finalFilePath: normalizeText(result?.finalArtifact?.path || latestVersion?.final_signed_file_path || ''),
        finalFileName: normalizeText(result?.finalArtifact?.fileName || latestVersion?.final_signed_file_name || 'signed-mandate.pdf'),
        finalFileUrl: normalizeText(result?.finalArtifact?.signedUrl || result?.finalArtifact?.url || latestVersion?.final_signed_file_url || latestVersion?.final_signed_file_access_url || ''),
        finalFileBucket: normalizeText(result?.finalArtifact?.bucket || latestVersion?.final_signed_file_bucket || ''),
        signingMethod: signingMethod || 'digital',
        signingStatus: 'signed',
        finalizedAt: nowIso,
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

  async function saveEditableDraftVersion({ reviewState = 'draft', source = 'manual' } = {}) {
    if (source !== 'autosave' && autosavePromiseRef.current) {
      return autosavePromiseRef.current
    }
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

    if (!editableVersion?.id) {
      throw new Error('The editable document revision is missing. Reload the workspace and retry.')
    }

    setDraftSaveState('saving')
    const result = await saveEditableDocumentDraftRevision({
      packetId: resolvedPacketId,
      baseVersionId: editableVersion.id,
      expectedEditSequence: editableVersion.edit_sequence || 0,
      baseDocument: editableVersion.editable_content_json || editableSnapshot || {},
      sections: editableSections.map((section) => ({
        key: section.key,
        label: section.label,
        required: Boolean(section.required),
        custom: Boolean(section.custom),
        content: section.content,
        mergeFields: (section.tokens || []).map((token) => token.token).filter(Boolean),
        metadata: section.metadata && typeof section.metadata === 'object' ? section.metadata : {},
        signingFields: Array.isArray(section.signingFields) ? section.signingFields : [],
      })),
      placeholders: editableVersion?.placeholders_resolved_json || {},
      validationSummary: {
        ...(editableVersion?.validation_summary_json && typeof editableVersion.validation_summary_json === 'object'
          ? editableVersion.validation_summary_json
          : {}),
        review_state: normalizeText(reviewState) || 'draft',
        editable_save_source: normalizeText(source) || 'manual',
        editable_draft_warnings: draftValidationSummary.warnings,
      },
      reviewState,
    })
    const version = result.version
    setStatusState((previous) => ({
      ...(previous || {}),
      packet: result.packet || previous?.packet || null,
      versions: [version, ...(previous?.versions || []).map((row) => (
        normalizeText(row?.id) === normalizeText(editableVersion.id) ? { ...row, edit_status: 'superseded' } : row
      ))],
    }))
    setDraftReviewState(normalizeText(reviewState) || 'draft')
    setEditableDirty(false)
    setDraftSaveState('saved')
    setDraftLastSavedAt(normalizeText(version?.updated_at || version?.created_at || new Date().toISOString()))
    return version
  }

  async function handleRestoreEditableVersion(sourceVersion = null) {
    if (!sourceVersion?.id || !editableVersion?.id || !statusState?.packet?.id) return
    const confirmed = window.confirm(`Restore draft v${sourceVersion.version_number || '—'}? Its wording will be copied into a new draft; current history will remain unchanged.`)
    if (!confirmed) return
    try {
      setRestoreBusyVersionId(sourceVersion.id)
      setLoadError('')
      const result = await restoreEditableDocumentDraftRevision({
        packetId: statusState.packet.id,
        sourceVersionId: sourceVersion.id,
        baseVersionId: editableVersion.id,
        expectedEditSequence: editableVersion.edit_sequence || 0,
      })
      setStatusState((previous) => ({
        ...(previous || {}),
        packet: result.packet || previous?.packet || null,
        versions: [result.version, ...(previous?.versions || []).map((row) => (
          normalizeText(row?.id) === normalizeText(editableVersion.id) ? { ...row, edit_status: 'superseded' } : row
        ))],
      }))
      setEditableDirty(false)
      setDraftSaveState('saved')
      setDraftLastSavedAt(normalizeText(result.version?.updated_at || result.version?.created_at || new Date().toISOString()))
      setActionFeedback(`Draft v${sourceVersion.version_number || '—'} restored as a new editable revision.`)
      await refreshWorkspaceData()
    } catch (error) {
      setDraftSaveState(normalizeText(error?.code) === 'STALE_EDITABLE_DOCUMENT_REVISION' ? 'conflict' : 'error')
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to restore this document revision.'))
    } finally {
      setRestoreBusyVersionId('')
    }
  }

  async function handleWorkspaceClose() {
    const close = onBack || onClose
    if (typeof close !== 'function') return
    if (editableDirty && editableAllowed) {
      try {
        await saveEditableDraftVersion({ reviewState: draftReviewState, source: 'navigation' })
      } catch (error) {
        setDraftSaveState(normalizeText(error?.code) === 'STALE_EDITABLE_DOCUMENT_REVISION' ? 'conflict' : 'error')
        setLoadError(toFriendlyWorkspaceError(error, 'Save the draft before leaving this workspace.'))
        return
      }
    }
    close()
  }

  function assertLifecycleTransitionAllowed(nextState, currentState = normalizedLifecycleState) {
    return assertDocumentLifecycleTransition(currentState, nextState)
  }

  function getSendReadinessBlockers({ requireSignerReadiness = false, packetOverride = null, statusOverride = null } = {}) {
    const effectiveStatus = statusOverride || statusStateRef.current || statusState || null
    const packet = packetOverride || effectiveStatus?.packet || null
    const versionRows = Array.isArray(effectiveStatus?.versions) ? effectiveStatus.versions : []
    const signingVersion = getUsablePacketVersionForSigning(versionRows) || latestVersion
    const blockers = []
    if (!packet?.id) blockers.push('Packet record is missing.')
    if (!signingVersion?.id) blockers.push('Generate a packet version before this action.')
    if (!draftValidationSummary.isValid) blockers.push('Resolve merge field blockers before continuing.')
    if (requireSignerReadiness && signerValidation.blockers.length) {
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

    const resolvedOrganisationId = packet.organisation_id || organisationId || null
    const activeTemplateResolution = await resolveActiveTemplate({
      packetType,
      moduleType: 'residential',
      organisationId: resolvedOrganisationId,
      context: { organisationId: resolvedOrganisationId },
    }).catch((templateError) => {
      console.warn('[LegalDocumentWorkspace] active template resolution failed before send; trying legacy template list.', templateError)
      return null
    })
    let template = activeTemplateResolution?.template && templateHasUsableSource(activeTemplateResolution.template)
      ? activeTemplateResolution.template
      : null

    if (!template?.id) {
      const templates = await listPacketTemplates({
        packetType,
        moduleType: 'agency',
        includeInactive: false,
        organisationId: resolvedOrganisationId,
      })
      template = Array.isArray(templates)
        ? templates.find((item) => normalizeText(item?.id) && templateHasUsableSource(item))
        : null
    }
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

  function buildVersionLifecycleSummary({ target = 'draft', packet = null, version = null, nowIso = new Date().toISOString() } = {}) {
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

    nextSummary.content_locked = ['sent', 'partially_signed', 'completed', 'archived'].includes(target)
    if (nextSummary.content_locked) nextSummary.content_locked_at = nowIso

    return nextSummary
  }

  async function transitionLifecycleState(nextState, { validateReadiness = false, sourceContextPatch = {} } = {}) {
    const target = normalizeLifecycleState(nextState)
    const currentStatus = statusStateRef.current || statusState
    let packet = currentStatus?.packet
    if (!packet?.id) throw new Error('Document packet is required before lifecycle transitions.')
    const currentLifecycleState = normalizeDocumentLifecycleState(
      currentStatus?.state || packet?.source_context_json?.lifecycle_state || packet?.status,
    )
    assertLifecycleTransitionAllowed(target, currentLifecycleState)

    if (validateReadiness) {
      const blockers = getSendReadinessBlockers({ requireSignerReadiness: false })
      if (blockers.length) {
        throw new Error(`Cannot continue: ${blockers[0]}`)
      }
    }

    const nowIso = new Date().toISOString()
    const transition = await transitionDocumentPacketLifecycle({
      packetId: packet.id,
      nextState: target,
      versionId: latestVersion?.id || null,
      sourceContextPatch: {
        ...(target === 'sent' ? { sentAt: nowIso } : {}),
        ...(sourceContextPatch && typeof sourceContextPatch === 'object' ? sourceContextPatch : {}),
      },
      eventPayload: {
        versionNumber: latestVersion?.version_number || null,
        contentFingerprint:
          normalizeText(latestVersion?.validation_summary_json?.frozen_render_snapshot?.contentFingerprint) ||
          null,
      },
    })
    const updatedPacket = transition.packet
    statusStateRef.current = currentStatus
      ? { ...currentStatus, packet: updatedPacket, state: target.toUpperCase() }
      : currentStatus
    setStatusState((previous) => previous ? { ...previous, packet: updatedPacket, state: target.toUpperCase() } : previous)
    const updatedVersion = latestVersion?.id && target !== 'sent'
      ? await updateWorkspaceVersion(latestVersion.id, {
          validationSummaryJson: buildVersionLifecycleSummary({
            target,
            packet: updatedPacket,
            version: latestVersion,
            nowIso,
          }),
        })
      : latestVersion

    return { packet: updatedPacket, version: updatedVersion, transition }
  }

  async function ensurePersistedPacketBeforeSend() {
    let currentStatus = statusStateRef.current || statusState
    const hasGeneratedVersion = Boolean(getGeneratedPacketVersionForSigning(currentStatus?.versions || [])?.id)
    if (!isRuntimePacketId(currentStatus?.packet?.id || packetId) && !hasGeneratedVersion) {
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

  async function handleSendForSignatureFromWorkspace({ resend = false, reminder = false, targetSignerRole = '' } = {}) {
    const sendStartedAt = Date.now()
    const logSendStage = (stage, metadata = {}) => {
      console.info('[LegalDocumentWorkspace] mandate signing timing', {
        stage,
        elapsedMs: Date.now() - sendStartedAt,
        packetId: normalizeText(statusStateRef.current?.packet?.id || packetId) || null,
        resend,
        ...metadata,
      })
    }
    if (isMandatePacket && signingMethod !== 'digital') {
      throw new Error(signingMethod === 'physical'
        ? 'This mandate is set for physical signing. Use the manual upload workflow instead of digital signature sending.'
        : 'Select Digital Mandate before sending secure signing links.')
    }
    let persistedStatus = statusStateRef.current || statusState
    let packetForSend = persistedStatus?.packet || {}
    let lifecycleBeforeSend = normalizeDocumentLifecycleState(
      persistedStatus?.state || persistedStatus?.packet?.source_context_json?.lifecycle_state || persistedStatus?.packet?.status,
    )
    if (!resend) {
      persistedStatus = await ensurePersistedPacketBeforeSend()
      lifecycleBeforeSend = normalizeDocumentLifecycleState(
        persistedStatus?.state || persistedStatus?.packet?.source_context_json?.lifecycle_state || persistedStatus?.packet?.status,
      )
      packetForSend = persistedStatus?.packet?.template_id
        ? persistedStatus.packet
        : await ensureTemplateReferenceBeforeSend()
      const blockers = getSendReadinessBlockers({
        // Signer fields are prepared by the send flow below when they do not exist yet.
        requireSignerReadiness: false,
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
      mandateSecondarySignerRequired: Boolean(mandateSecondarySignerConfig?.required),
      secondarySignerLabel: mandateSecondarySignerConfig?.label || 'Co-signer',
      signerDefaults,
      sourceContext: currentStatus?.packet?.source_context_json || sourceContext,
      legalSignerProfile,
    })
    if (reminder) {
      const normalizedReminderRole = normalizeKey(targetSignerRole)
      if (!normalizedReminderRole) throw new Error('Choose a signer before sending a reminder.')
      const reminderSigner = (currentStatus?.signingSummary?.signers || []).find(
        (signer) => normalizeKey(signer?.signer_role) === normalizedReminderRole,
      )
      const reminderStatus = normalizeKey(reminderSigner?.status)
      const token = normalizeText(reminderSigner?.signing_token)
      const expiresAt = Date.parse(reminderSigner?.token_expires_at || '')
      const previousReminderAt = Date.parse(reminderSigner?.reminder_sent_at || '')
      if (!['sent', 'viewed'].includes(reminderStatus)) {
        throw new Error('A reminder is only available for a signer with an active sent link.')
      }
      if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw new Error('This signing link has expired. Send a new link instead of a reminder.')
      }
      if (Number.isFinite(previousReminderAt) && Date.now() - previousReminderAt < 24 * 60 * 60 * 1000) {
        throw new Error('A reminder was sent within the last 24 hours. Wait until the follow-up window reopens.')
      }
      const recipientEmail = normalizeText(reminderSigner?.signer_email).toLowerCase()
      if (!recipientEmail) throw new Error('This signer does not have an email address for reminders.')

      const currentPacketId = normalizeText(currentStatus?.packet?.id || packetId)
      const versionId = normalizeText(reminderSigner?.packet_version_id || latestVersion?.id)
      const reminderSentAt = new Date().toISOString()
      const previousReminders = currentStatus?.packet?.source_context_json?.signingRemindersByRole
      const remindersByRole = previousReminders && typeof previousReminders === 'object' ? previousReminders : {}
      const previousReminder = remindersByRole[normalizedReminderRole]
      setActionProgressMessage(`Sending reminder to ${normalizedReminderRole.replace(/_/g, ' ')}…`)
      if (typeof onSend !== 'function') throw new Error('Signing email delivery is not configured for this workspace.')
      const sendResult = await onSend({
        reminder: true,
        resend: false,
        signerLinks: [{ ...reminderSigner, signing_link: `${window.location.origin}/sign/${token}` }],
        packetId: currentPacketId,
        targetSignerRole: normalizedReminderRole,
        signingStatus: normalizeText(currentStatus?.signingStatus) || 'sent_for_signature',
      })
      await updateWorkspacePacket(currentPacketId, {
        sourceContextJson: {
          ...(currentStatus?.packet?.source_context_json || {}),
          signingRemindersByRole: {
            ...remindersByRole,
            [normalizedReminderRole]: {
              sentAt: reminderSentAt,
              count: Number(previousReminder?.count || 0) + 1,
            },
          },
        },
        allowSigningMetadataUpdate: true,
      })
      await appendDocumentPacketEvent({
        packetId: currentPacketId,
        organisationId: currentStatus?.packet?.organisation_id || organisationId || null,
        versionId,
        eventType: 'signer_reminder_sent',
        eventPayload: {
          contract: 'arch9-signing-follow-up-v1',
          signerRole: normalizedReminderRole,
          reminderNumber: Number(previousReminder?.count || 0) + 1,
          sentAt: reminderSentAt,
          emailDeliveryId: normalizeText(sendResult?.emailDeliveryId) || null,
          recipientEmailPresent: true,
        },
      })
      return
    }
    const currentAgentSigner = currentRoster.find((row) => normalizeKey(row.role) === 'agent') || null
    const agentHasSigned = Boolean(currentAgentSigner?.signedAt) || normalizeKey(currentAgentSigner?.statusRaw || currentAgentSigner?.status) === 'signed'
    const normalizedTargetSignerRole = normalizeKey(targetSignerRole) || (isMandatePacket && !resend && !agentHasSigned ? 'agent' : '')
    const currentRoleLabels = currentRoster.reduce((accumulator, row) => {
      accumulator[normalizeKey(row.role)] = row.label
      return accumulator
    }, {})
    const targetSignerLabel = normalizedTargetSignerRole
      ? getMandateSignerRoleLabel(normalizedTargetSignerRole, {
          secondarySignerLabel: mandateSecondarySignerConfig?.label || 'Co-signer',
          roleLabels: currentRoleLabels,
        }).toLowerCase()
      : 'signer'
    setActionProgressMessage(resend ? `Refreshing ${targetSignerLabel} link…` : 'Preparing signer links…')
    const { linkResult } = await ensureSignerReadinessBeforeSend({ isResend: resend, targetSignerRole: normalizedTargetSignerRole })
    logSendStage('signers_ready')
    if (!Array.isArray(linkResult?.signers) || !linkResult.signers.some((signer) => normalizeText(signer?.signing_link))) {
      throw createWorkspaceError('SIGNING_LINK_FAILED', 'The signing link could not be created. Please try again.')
    }
    if (!resend && lifecycleBeforeSend === 'pdf_generated') {
      await transitionLifecycleState('ready_to_send', { validateReadiness: true })
      lifecycleBeforeSend = 'ready_to_send'
    }
    if (!resend) {
      assertDocumentLifecycleTransition(lifecycleBeforeSend, 'sent')
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

    if (!resend && lifecycleBeforeSend !== 'sent') {
      await transitionLifecycleState('sent', {
        sourceContextPatch: {
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
      })
    }
    logSendStage('packet_marked_sent')

    void appendDocumentPacketEvent({
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
    }).catch((eventError) => {
      console.warn('[LegalDocumentWorkspace] could not record signing preparation event', eventError)
    })

    setActionProgressMessage(resend ? 'Sending resend notifications…' : 'Sending signer notifications…')
    let sendResult = null
    if (linkResult?.dispatchAlreadyDelivered && !resend) {
      sendResult = { emailConfirmed: true, deduplicated: true }
    } else {
      try {
        if (typeof onSend !== 'function') throw new Error('Signing email delivery is not configured for this workspace.')
        sendResult = await onSend({
          resend,
          signerLinks: linkSigners,
          packetId: currentPacketId,
          targetSignerRole: linkRecipientRole,
          signingStatus: workflowSigningStatus,
        })
        logSendStage('email_confirmed')
        void completeAppliedEnvelopeDispatch({
          dispatchId: linkResult?.dispatchId,
          success: true,
          deliveryEvidence: {
            emailDeliveryId: normalizeText(sendResult?.emailDeliveryId) || null,
            emailDeliveryIds: Array.isArray(sendResult?.emailDeliveryIds) ? sendResult.emailDeliveryIds : [],
            recipientEmail: normalizeText(sendResult?.recipientEmail) || null,
            recipientEmails: Array.isArray(sendResult?.recipientEmails) ? sendResult.recipientEmails : [],
            recipientRole: normalizeText(sendResult?.recipientRole || linkRecipientRole) || null,
            emailConfirmed: Boolean(sendResult?.emailConfirmed || sendResult?.emailDeliveryId || sendResult?.recipientEmail),
          },
        }).catch((dispatchError) => {
          console.warn('[LegalDocumentWorkspace] could not complete signing dispatch record', dispatchError)
        })
      } catch (sendError) {
        if (linkResult?.dispatchId) {
          await completeAppliedEnvelopeDispatch({
            dispatchId: linkResult.dispatchId,
            success: false,
            deliveryEvidence: { error: normalizeText(sendError?.message || String(sendError)) },
          }).catch(() => null)
        }
        throw createWorkspaceError(
          'SIGNING_EMAIL_FAILED',
          'The document was prepared, but the signing email could not be sent. You can resend it from this page.',
          { cause: sendError },
        )
      }
    }

    setActionProgressMessage('Finalizing send…')
    void resolveDocumentPacketStatus({
      packetType,
      packetId: currentPacketId,
      transactionId,
      organisationId,
    }).then((refreshed) => {
      statusStateRef.current = refreshed
      setStatusState(refreshed)
    }).catch((statusError) => {
      console.warn('[LegalDocumentWorkspace] signing status refresh failed after send.', statusError)
    })
    void appendDocumentPacketEvent({
      packetId: currentPacketId,
      organisationId: currentPacket?.organisation_id || organisationId || null,
      versionId,
      eventType: resend ? 'mandate_signing_email_resent' : 'mandate_sent_for_digital_signing',
      eventPayload: {
        transactionId: currentPacket?.transaction_id || transactionId || null,
        selectedMethod: 'digital',
        signerCount: signerEmails.length,
        signingStatus: workflowSigningStatus,
        sentAt: nowIso,
        emailDeliveryId: normalizeText(sendResult?.emailDeliveryId) || null,
        emailConfirmed: Boolean(sendResult?.emailConfirmed || sendResult?.emailDeliveryId || sendResult?.recipientEmail),
        emailDeliveryIds: Array.isArray(sendResult?.emailDeliveryIds) ? sendResult.emailDeliveryIds : [],
        recipientCount: Array.isArray(sendResult?.recipientEmails) ? sendResult.recipientEmails.length : (sendResult?.recipientEmail ? 1 : 0),
        recipientRole: normalizeText(sendResult?.recipientRole || linkRecipientRole) || null,
        recipientEmailPresent: Boolean(normalizeText(sendResult?.recipientEmail)),
      },
    }).catch((auditError) => {
      console.warn('[LegalDocumentWorkspace] signing email audit write skipped.', auditError)
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
    setGenerationRecovery(null)
    setActionFeedback('')
    setActionProgressMessage('')
    try {
      if (normalizedLifecycleState === 'ready_to_send') {
        assertWorkspacePermission('canSend', 'send documents for signature')
        setActionProgressMessage('Preparing signature send…')
        await handleSendForSignatureFromWorkspace()
      } else if (action.actionKey === 'generate') {
        setActionProgressMessage('Preparing template…')
        await handleGeneratePacketDraft()
        return
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
      if (action.actionKey === 'generate') {
        setActionFeedback('Draft generated successfully.')
      } else if (action.actionKey === 'edit') {
        setActionFeedback('Draft saved and version history updated.')
      } else if (action.actionKey === 'send' || normalizedLifecycleState === 'ready_to_send') {
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
    if (!open || !isMandatePacket || effectiveMode !== 'generate' || actionBusy || loading) return
    if (!autoGenerateEnabled) return
    if (!legalPermissions.canGenerate || typeof onGenerate !== 'function') return
    if (editableDirty || autosavePromiseRef.current) return
    const existingGeneratedVersion = getGeneratedPacketVersionForSigning(statusState?.versions || [])
    if (statusState?.packet?.id && existingGeneratedVersion?.id) return
    const autoGenerateKey = [
      packetType,
      normalizeText(statusState?.packet?.id || packetId),
      normalizeText(transactionId),
      normalizeText(statusState?.state || 'NO_PACKET'),
      normalizeText(existingGeneratedVersion?.id || 'NO_GENERATED_VERSION'),
      editableSections.length,
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
      setActionProgressMessage(statusState?.packet?.id ? 'Generating mandate PDF…' : 'Generating draft…')
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
        setActionFeedback(generationResult?.actionFeedback || 'Draft generated successfully.')
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
    editableDirty,
    editableSections.length,
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
    statusState?.versions,
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
      if (actionKey === 'send_signature') {
        assertWorkspacePermission('canSend', 'send documents for signature')
        await handleSendForSignatureFromWorkspace({ resend: false })
        setActionFeedback('Document sent for signature workflow.')
      } else if (actionKey === 'finalize_signed') {
        assertWorkspacePermission('canFinalize', 'finalize signed records')
        await handleFinalizeSignedRecord()
      } else if (actionKey === 'view_signing_status') {
        centerTabPreferenceRef.current = 'preview'
        setCenterTab('preview')
        setActionFeedback('Signer status is shown in the right-side signer checklist.')
      } else if (actionKey === 'resend_signature') {
        assertWorkspacePermission('canResend', 'resend signing links')
        await handleSendForSignatureFromWorkspace({ resend: true, targetSignerRole: options.targetSignerRole || '' })
        const targetLabel = normalizeKey(options.targetSignerRole).replace(/_/g, ' ')
        setActionFeedback(targetLabel ? `Signing link resent to ${targetLabel}.` : 'Signing links resent to outstanding signers.')
      } else if (actionKey === 'remind_signer') {
        assertWorkspacePermission('canResend', 'send signer reminders')
        await handleSendForSignatureFromWorkspace({ reminder: true, targetSignerRole: options.targetSignerRole || '' })
        const targetLabel = normalizeKey(options.targetSignerRole).replace(/_/g, ' ')
        setActionFeedback(`Reminder sent to ${targetLabel || 'signer'} using the current secure link.`)
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

      if (['send_signature', 'resend_signature', 'remind_signer'].includes(actionKey)) {
        void Promise.resolve(onRefreshContext?.()).catch((refreshError) => {
          console.warn('[LegalDocumentWorkspace] background context refresh failed after signing action.', refreshError)
        })
      } else {
        await onRefreshContext?.()
        await refreshWorkspaceData()
      }
    } catch (error) {
      await logMandateFailure(actionKey || 'review_action', error)
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to complete this action right now.'))
    } finally {
      actionBusyRef.current = false
      setActionBusy(false)
      setActionProgressMessage('')
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
        void appendDocumentPacketEvent({
          packetId: statusState.packet.id,
          organisationId: statusState?.packet?.organisation_id || organisationId || null,
          versionId: latestVersion?.id || null,
          eventType: previousMethod === 'not_selected' ? 'signing_method_selected' : 'signing_method_changed',
          eventPayload: {
            transactionId: statusState?.packet?.transaction_id || transactionId || null,
            previousMethod,
            selectedMethod: method,
          },
        }).catch((auditError) => {
          console.warn('[LegalDocumentWorkspace] signing method audit write skipped.', auditError)
        })
      }
      setActionFeedback(`${resolveSigningMethodLabel(method)} selected.`)
    } catch (error) {
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to update the signing method right now.'))
    } finally {
      actionBusyRef.current = false
      setActionBusy(false)
    }
  }

  async function refreshCertifiedPdfAccess(purpose = 'preview', { open = false } = {}) {
    const resolvedPacketId = normalizeText(statusState?.packet?.id || packetId)
    const resolvedVersionId = normalizeText(latestVersion?.id)
    if (!resolvedPacketId || !resolvedVersionId || latestVersion?.transaction_pdf_persisted !== true) {
      throw createWorkspaceError('D4_CERTIFIED_PDF_UNAVAILABLE', 'Generate and persist the PDF before trying to open it.')
    }
    setPdfAccessBusy(true)
    try {
      const access = await requestPersistedPdfAccess({
        packetId: resolvedPacketId,
        versionId: resolvedVersionId,
        purpose,
      })
      setCertifiedPdfAccessUrl(access.signedUrl)
      if (open) window.open(access.signedUrl, '_blank', 'noopener,noreferrer')
      return access
    } catch (error) {
      setLoadError(toFriendlyWorkspaceError(error, 'The certified PDF could not be opened. Refresh the document and try again.'))
      throw error
    } finally {
      setPdfAccessBusy(false)
    }
  }

  function handleWorkspacePdfDownload() {
    if (signedPreviewUrl) {
      window.open(signedPreviewUrl, '_blank', 'noopener,noreferrer')
      return
    }
    void refreshCertifiedPdfAccess('download', { open: true }).catch(() => null)
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
      if (!signedPreviewUrl && latestVersion?.transaction_pdf_persisted === true) {
        const certifiedAccess = await refreshCertifiedPdfAccess('download')
        link = certifiedAccess.signedUrl
      }
      const recordPhysicalDownloadEvent = async () => {
        if (!isMandatePacket || signingMethod !== 'physical' || !statusState?.packet?.id) return
        const downloadedAt = new Date().toISOString()
        try {
          const physicalPacket = await fetchDocumentPacket(statusState.packet.id, { includeVersions: false, includeEvents: false })
          let physicalLifecycleState = resolveDocumentLifecycleStateFromPacket(physicalPacket)
          if (physicalLifecycleState === 'draft') {
            await transitionDocumentPacketLifecycle({
              packetId: statusState.packet.id,
              nextState: 'pdf_generated',
              versionId: downloadVersionId || null,
              eventPayload: { signingMethod: 'physical', source: 'physical_download' },
            })
            physicalLifecycleState = 'pdf_generated'
          }
          if (physicalLifecycleState === 'pdf_generated') {
            await transitionDocumentPacketLifecycle({
              packetId: statusState.packet.id,
              nextState: 'ready_to_send',
              versionId: downloadVersionId || null,
              eventPayload: { signingMethod: 'physical', source: 'physical_download' },
            })
            physicalLifecycleState = 'ready_to_send'
          }
          await transitionDocumentPacketLifecycle({
            packetId: statusState.packet.id,
            nextState: 'sent',
            versionId: downloadVersionId || null,
            sourceContextPatch: {
              signing_method: 'physical',
              signingMethod: 'physical',
              signing_status: 'generated_for_physical_signature',
              signingStatus: 'generated_for_physical_signature',
              physical_signature_status: 'generated_for_physical_signature',
              mandateStatus: 'generated_for_physical_signature',
              lifecycle_state: 'sent',
              downloadedAt,
              downloaded_at: downloadedAt,
              downloadedVersionId: downloadVersionId || null,
            },
            eventPayload: { signingMethod: 'physical', source: 'physical_download' },
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
        throw new Error('Arch9 generated the mandate, but the download link is not ready yet. Refresh and try again.')
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

      let packetForCompletion = await fetchDocumentPacket(resolvedPacketId, { includeVersions: false, includeEvents: false })
      let physicalLifecycleState = resolveDocumentLifecycleStateFromPacket(packetForCompletion)
      if (physicalLifecycleState === 'pdf_generated') {
        packetForCompletion = (await transitionDocumentPacketLifecycle({
          packetId: resolvedPacketId,
          nextState: 'ready_to_send',
          versionId,
          eventPayload: { signingMethod: 'physical', source: 'manual_upload' },
        })).packet
        physicalLifecycleState = 'ready_to_send'
      }
      if (physicalLifecycleState === 'ready_to_send') {
        packetForCompletion = (await transitionDocumentPacketLifecycle({
          packetId: resolvedPacketId,
          nextState: 'sent',
          versionId,
          sourceContextPatch: { signing_method: 'physical', signingMethod: 'physical' },
          eventPayload: { signingMethod: 'physical', source: 'manual_upload' },
        })).packet
      }

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

      packetForCompletion = (await transitionDocumentPacketLifecycle({
        packetId: resolvedPacketId,
        nextState: 'completed',
        versionId,
        sourceContextPatch: {
          signing_method: 'physical',
          signingMethod: 'physical',
          signing_status: 'uploaded_signed',
          signingStatus: 'uploaded_signed',
          mandateStatus: 'uploaded_signed',
          lifecycle_state: 'completed',
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
        eventPayload: {
          signingMethod: 'physical',
          signingStatus: 'uploaded_signed',
          source: 'manual_upload',
        },
      })).packet

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

      await onSignedFinalized?.({
        source: 'manual_upload',
        packetId: resolvedPacketId,
        packetVersionId: versionId,
        packet: packetForCompletion || statusState?.packet || null,
        version: latestVersion || null,
        finalFilePath,
        finalFileName,
        finalFileUrl,
        finalFileBucket,
        finalSignedDocumentId: documentId || null,
        signingMethod: 'physical',
        signingStatus: 'uploaded_signed',
        finalizedAt: nowIso,
        manualSignedAllPartiesSigned: Boolean(manualSignedAllPartiesSigned),
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
    ['draft', 'pdf_generated', 'ready_to_send'].includes(normalizedLifecycleState)

  const workspacePrimaryLabel =
    isMandatePacket && launchSigningReadyState && signingMethod === 'not_selected'
      ? 'Select Signing Method'
      : isMandatePacket && launchSigningReadyState && signingMethod === 'physical' && !manualSignedUploaded
        ? 'Download PDF'
        : isMandatePacket && launchSigningReadyState && signingMethod === 'digital'
          ? 'Send for Signature'
          : primaryLabel
  const hasGeneratedMandateVersion = Boolean(getGeneratedPacketVersionForSigning(statusState?.versions || [])?.id)
  const pilotFallbackVersion = findLatestPilotDocumentFallback(statusState?.versions || [])
  const showGeneratePdfButton =
    legalPermissions.canGenerate &&
    typeof onGenerate === 'function' &&
    (isMandatePacket || isOtpPacket) &&
    normalizeKey(statusState?.state) !== 'loading' &&
    !hasGeneratedMandateVersion
  const handleSendForSignatureIntent = () => {
    void runReviewAction('send_signature')
  }
  const handleGeneratePacketDraft = async () => {
    if (typeof onGenerate !== 'function' || actionBusyRef.current) return
    assertWorkspacePermission('canGenerate', 'generate legal drafts')
    actionBusyRef.current = true
    setActionBusy(true)
    setLoadError('')
    setGenerationRecovery(null)
    setActionFeedback('')
    setActionProgressMessage(`Generating ${isOtpPacket ? 'OTP' : 'mandate'}…`)
    const generationBaseline = captureLegalDocumentGenerationBaseline(statusStateRef.current)
    let renderFreeze = null
    try {
      const renderEditedRevision = Boolean(editableDirty || autosavePromiseRef.current)
      let renderSourceVersion = editableVersion
      if (renderEditedRevision) {
        setActionProgressMessage('Saving the latest wording…')
        renderSourceVersion = await saveEditableDraftVersion({ reviewState: draftReviewState, source: 'generation' })
      }
      if (renderEditedRevision && renderSourceVersion?.id && Array.isArray(renderSourceVersion?.editable_content_json?.sections) && renderSourceVersion.editable_content_json.sections.length) {
        setActionProgressMessage('Freezing the saved document revision…')
        renderFreeze = await freezeEditableDocumentRevisionForRender({
          packetId: normalizeText(statusState?.packet?.id || packetId),
          versionId: renderSourceVersion.id,
          expectedEditSequence: renderSourceVersion.edit_sequence || 0,
        })
      }
      const generationResult = await onGenerate({
        ...(renderFreeze?.freezeId ? { editableSections, renderFreeze } : {}),
        onProgress: (message) => setActionProgressMessage(normalizeText(message)),
      })
      if (generationResult?.status) {
        statusStateRef.current = generationResult.status
        setStatusState(generationResult.status)
      }
      const hasGeneratedVersion = Boolean(getGeneratedPacketVersionForSigning(generationResult?.status?.versions || []))
      const generatedVersion = getGeneratedPacketVersionForSigning(generationResult?.status?.versions || [])
      if (renderFreeze?.freezeId && generatedVersion?.id) {
        setActionProgressMessage('Verifying generated PDF…')
        await Promise.all([
          verifyFrozenEditableRenderOutput({
            packetId: normalizeText(statusState?.packet?.id || packetId),
            freezeId: renderFreeze.freezeId,
            generatedVersionId: generatedVersion.id,
          }),
          verifyServerAttestedNativePdfRender({
            packetId: normalizeText(statusState?.packet?.id || packetId),
            freezeId: renderFreeze.freezeId,
            generatedVersionId: generatedVersion.id,
          }),
        ])
        setActionProgressMessage('Saving generated PDF…')
        await persistGeneratedPdfToTransaction({
          packetId: normalizeText(statusState?.packet?.id || packetId),
          generatedVersionId: generatedVersion.id,
        })
        await completeEditableDocumentRenderFreeze({
          packetId: normalizeText(statusState?.packet?.id || packetId),
          freezeId: renderFreeze.freezeId,
          generatedVersionId: generatedVersion.id,
          success: true,
        })
      }
      if (hasGeneratedVersion) {
        void Promise.resolve(onRefreshContext?.()).catch((refreshError) => {
          console.warn('[LegalDocumentWorkspace] background context refresh failed after generation.', refreshError)
        })
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
          const refreshedGeneratedVersion = getGeneratedPacketVersionForSigning(refreshed.resolved.versions || [])
          if (renderFreeze?.freezeId && refreshedGeneratedVersion?.id) {
            setActionProgressMessage('Verifying generated PDF…')
            await Promise.all([
              verifyFrozenEditableRenderOutput({
                packetId: normalizeText(statusState?.packet?.id || packetId),
                freezeId: renderFreeze.freezeId,
                generatedVersionId: refreshedGeneratedVersion.id,
              }),
              verifyServerAttestedNativePdfRender({
                packetId: normalizeText(statusState?.packet?.id || packetId),
                freezeId: renderFreeze.freezeId,
                generatedVersionId: refreshedGeneratedVersion.id,
              }),
            ])
            setActionProgressMessage('Saving generated PDF…')
            await persistGeneratedPdfToTransaction({
              packetId: normalizeText(statusState?.packet?.id || packetId),
              generatedVersionId: refreshedGeneratedVersion.id,
            })
            await completeEditableDocumentRenderFreeze({
              packetId: normalizeText(statusState?.packet?.id || packetId),
              freezeId: renderFreeze.freezeId,
              generatedVersionId: refreshedGeneratedVersion.id,
              success: true,
            })
          }
        }
      }
      const generatedPilotFallback = generationResult?.pilotFallback || findLatestPilotDocumentFallback(generationResult?.status?.versions || [])
      setActionFeedback(generatedPilotFallback?.message || generationResult?.actionFeedback || `${isOtpPacket ? 'OTP' : 'Mandate'} generated successfully.`)
      generationFailureCountsRef.current.clear()
    } catch (error) {
      if (renderFreeze?.freezeId) {
        await completeEditableDocumentRenderFreeze({
          packetId: normalizeText(statusState?.packet?.id || packetId),
          freezeId: renderFreeze.freezeId,
          success: false,
          failureMessage: normalizeText(error?.message || String(error)),
        }).catch((freezeError) => {
          console.warn('[LegalDocumentWorkspace] render freeze failure could not be recorded.', freezeError)
        })
      }
      await logMandateFailure(`generate_${isOtpPacket ? 'otp' : 'mandate'}`, error)
      setActionProgressMessage('Checking whether the draft completed…')
      const reconciliation = await reconcileLegalDocumentGenerationFailure({
        error,
        baseline: generationBaseline,
        loadStatus: refreshWorkspaceData,
      })
      if (reconciliation.confirmed) {
        if (reconciliation.status) {
          statusStateRef.current = reconciliation.status
          setStatusState(reconciliation.status)
        }
        setLoadError('')
        setGenerationRecovery(null)
        setActionFeedback(`${isOtpPacket ? 'OTP' : 'Mandate'} generation completed. The recovered draft is ready to review.`)
        generationFailureCountsRef.current.clear()
        void Promise.resolve(onRefreshContext?.()).catch(() => null)
        return
      }
      const recoveryPacketType = isOtpPacket ? 'otp' : 'mandate'
      const baseRecovery = resolveLegalDocumentGenerationRecovery(error, { packetType: recoveryPacketType })
      const recoveryPacketId = normalizeText(error?.packetId || statusStateRef.current?.packet?.id || packetId)
      const failureSignature = `${recoveryPacketType}:${recoveryPacketId || 'unsaved'}:${baseRecovery.code}`
      const policy = resolveLegalDocumentRetryPolicy({
        recovery: baseRecovery,
        previousFailureCount: generationFailureCountsRef.current.get(failureSignature) || 0,
        packetType: recoveryPacketType,
        packetId: recoveryPacketId,
      })
      generationFailureCountsRef.current.set(failureSignature, policy.failureCount)
      const displayMessage = `${policy.message} Next step: ${policy.nextAction}`
      setGenerationRecovery({ ...policy, displayMessage, packetId: recoveryPacketId })
      setLoadError(displayMessage)
      if (policy.escalated || policy.autoHandoff) void ensureGenerationSupportHandoff({ ...policy, displayMessage, packetId: recoveryPacketId })
    } finally {
      setActionProgressMessage('')
      actionBusyRef.current = false
      setActionBusy(false)
    }
  }
  const activeGenerationRecovery = generationRecovery?.displayMessage === loadError ? generationRecovery : null
  async function ensureGenerationSupportHandoff(policy) {
    const supportReference = normalizeText(policy?.supportReference)
    if (!supportReference || recordedGenerationHandoffsRef.current.has(supportReference)) return false
    const currentPacket = statusStateRef.current?.packet || {}
    const result = await recordLegalDocumentGenerationSupportHandoff({
      appendEvent: appendDocumentPacketEvent,
      packetId: normalizeText(policy?.packetId || currentPacket?.id || packetId),
      organisationId: currentPacket?.organisation_id || organisationId || null,
      policy,
      packetType: isOtpPacket ? 'otp' : 'mandate',
      surface: 'workspace',
    })
    if (result.recorded) recordedGenerationHandoffsRef.current.add(supportReference)
    return result.recorded
  }
  const handleGenerationRecoveryAction = async () => {
    if (!activeGenerationRecovery || actionBusyRef.current) return
    if (activeGenerationRecovery.actionKey === 'retry') {
      await handleGeneratePacketDraft()
      return
    }
    if (activeGenerationRecovery.actionKey === 'refresh') {
      setActionProgressMessage('Refreshing draft status…')
      const refreshed = await refreshWorkspaceData().catch(() => null)
      setActionProgressMessage('')
      const generated = getGeneratedPacketVersionForSigning(refreshed?.resolved?.versions || [])
      if (generated) {
        setLoadError('')
        setGenerationRecovery(null)
        setActionFeedback(`${isOtpPacket ? 'OTP' : 'Mandate'} draft status refreshed and ready to review.`)
      }
      return
    }
    if (activeGenerationRecovery.actionKey === 'review_information') {
      setMergeDetailsOpen(true)
      return
    }
    if (activeGenerationRecovery.actionKey === 'sign_in') {
      window.location.assign('/auth')
      return
    }
    if (['contact_admin', 'contact_support'].includes(activeGenerationRecovery.actionKey)) {
      const reference = activeGenerationRecovery.supportReference
      const recorded = await ensureGenerationSupportHandoff(activeGenerationRecovery)
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reference).catch(() => null)
      }
      setActionFeedback(`Reference ${reference} copied. Include it when asking for help.${recorded ? ' The handoff was added to this packet’s audit trail.' : ''}`)
    }
  }
  const handleWorkspacePrimaryAction = () => {
    recordWorkspaceExperience('primary_action_selected', { state: signingOperationalStatus.state, actionId: 'workspace_primary' })
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
    if (!hasGeneratedMandateVersion && typeof onGenerate === 'function') {
      void handleGeneratePacketDraft()
      return
    }
    void runPrimaryAction()
  }

  const handleSelectOutlineSection = useCallback((sectionKey) => {
    const normalizedSectionKey = normalizeText(sectionKey)
    if (!normalizedSectionKey) return
    setActiveSectionKey(normalizedSectionKey)
    if (editableAllowed) {
      centerTabPreferenceRef.current = 'editor'
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
    centerTabPreferenceRef.current = 'preview'
    setCenterTab('preview')
    if (latestVersion?.transaction_pdf_persisted === true) {
      void refreshCertifiedPdfAccess('preview').catch(() => null)
    }
  }, [latestVersion?.id, latestVersion?.transaction_pdf_persisted, statusState?.packet?.id])

  if (!open) return null

  const documentLabel = resolveDocumentLabel(packetType)
  const previewDownloadUrl = signedPreviewUrl || generatedPreviewUrl || ''
  const hasPreviewSurface = Boolean(generatedPreviewUrl || signedPreviewUrl || editablePreviewHtml)
  const showInlineEditor = Boolean(editableAllowed && centerTab === 'editor' && statusState?.packet?.id)
  const showInlinePreview = Boolean(statusState?.packet?.id && hasPreviewSurface && (!editableAllowed || centerTab === 'preview'))
  const showPreviewUnavailable = Boolean(statusState?.packet?.id && !hasPreviewSurface && (!editableAllowed || centerTab === 'preview'))
  const shellClassName = isPageMode
    ? 'legal-document-workspace-page flex min-h-[calc(100vh-132px)] w-full flex-col overflow-hidden rounded-[28px] border border-[#dfe8f3] bg-[#f5f7fb]'
    : 'mx-auto flex h-full w-full max-w-[1760px] flex-col overflow-hidden rounded-[30px] border border-[#dfe8f3] bg-[#f5f7fb] shadow-[0_28px_70px_rgba(10,24,42,0.24)]'
  const rootClassName = isPageMode
    ? 'w-full'
    : 'fixed inset-0 z-[95] bg-[#0b1422]/55 px-2 py-2 sm:px-4 sm:py-4'
  const contentClassName = isPageMode
    ? 'min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-5 sm:px-6 sm:pb-28 sm:pt-6 md:pb-24'
    : 'min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-4 sm:px-5 sm:pb-28 sm:pt-5 md:pb-24'
  const desktopWorkspaceRailHeightClassName = 'xl:h-[clamp(700px,calc(100vh-14rem),880px)]'
  const mainGridClassName = `grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-stretch 2xl:grid-cols-[340px_minmax(0,1fr)] ${desktopWorkspaceRailHeightClassName}`
  const secondaryGridClassName = 'mt-6 grid gap-5 xl:grid-cols-[minmax(500px,1.05fr)_minmax(340px,0.95fr)] xl:items-stretch 2xl:grid-cols-[minmax(560px,1.1fr)_minmax(380px,0.9fr)]'
  const reviewRailPanelClassName = 'min-h-[420px] xl:h-[clamp(470px,calc(100vh-22rem),620px)]'
  const workspaceMobileAction = buildDocumentMobileAction({
    surface: 'workspace',
    primaryAction: {
      id: 'workspace_primary',
      label: workspacePrimaryLabel,
      description: firstNonEmptyText(mandateNextAction, lifecycleCopy.next, lifecycleCopy.current, 'Continue with the next document step.'),
    },
    recoveryAction: helpRecovery.hasIssue && helpRecovery.action
      ? { ...helpRecovery.action, description: helpRecovery.summary }
      : null,
    blocked: helpRecovery.hasIssue,
    currentOwnerLabel: responsibility.currentOwner?.label || responsibility.currentOwner?.name,
  })
  const workspaceAccessibility = buildDocumentAccessibility({
    surface: 'workspace',
    journey: documentJourney,
    responsibility,
    helpRecovery,
    mobileAction: workspaceMobileAction,
    contentTargetId: 'document-workspace-content',
    actionsTargetId: 'document-workspace-actions',
  })
  function handleMobileAction(actionId) {
    if (actionId === 'workspace_primary') handleWorkspacePrimaryAction()
    else handleHelpRecoveryAction(actionId)
  }

  return (
    <>
      <div className={rootClassName}>
        <DocumentAccessibilityNavigation model={workspaceAccessibility} />
        <div className={shellClassName}>
          <header className="border-b border-[#e5edf7] bg-white/95 px-4 py-4 backdrop-blur sm:px-6 sm:py-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-[#d7e4f3] bg-white text-[#51677f] transition hover:bg-[#f7faff]"
                  onClick={() => void handleWorkspaceClose()}
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
                  <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-[#607387]">
                    {isFullySignedLifecycle || hasFinalArtifact
                      ? `Review and download the final signed ${isOtpPacket ? 'OTP' : 'mandate'}. This legal record is locked and cannot be edited.`
                      : isMandatePacket
                        ? 'Generate, preview and send the seller mandate. Seller and property details stay managed from the Seller workspace.'
                        : 'Generate, preview and send this legal document from the existing packet workflow.'}
                  </p>
                </div>
              </div>

              <div id="document-workspace-actions" className="flex scroll-mt-24 flex-wrap items-start gap-2 self-start">
                {editableAllowed && legalPermissions.canEditDraft ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      centerTabPreferenceRef.current = 'editor'
                      setCenterTab('editor')
                    }}
                    disabled={loading || actionBusy}
                  >
                    <FileText size={14} />
                    Edit
                  </Button>
                ) : null}
                {hasPreviewSurface ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (generatedPreviewUrl && typeof onView === 'function') {
                        void onView()
                        return
                      }
                      handleFocusPreview()
                    }}
                    disabled={loading || actionBusy}
                  >
                    <Eye size={14} />
                    Preview
                  </Button>
                ) : null}
                {showGeneratePdfButton ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleGeneratePacketDraft()}
                    disabled={loading || actionBusy}
                  >
                    {actionBusy ? 'Working…' : editableSections.length ? 'Generate PDF' : `Generate ${isOtpPacket ? 'OTP' : 'Mandate'}`}
                  </Button>
                ) : null}
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
                    onClick={() => void handleWorkspaceClose()}
                    aria-label="Close workspace"
                  >
                    <X size={18} />
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          <div id="document-workspace-content" tabIndex={-1} className={`${contentClassName} focus:outline-none`}>
            {actionProgressMessage ? (
              <article className="mb-5 rounded-[18px] border border-[#dbe6f2] bg-[#f7fbff] px-4 py-3 text-sm font-semibold text-[#35546c]">
                {actionProgressMessage}
              </article>
            ) : null}
            {actionFeedback ? (
              <div className="mb-5">
                <DocumentOutcomeNotice model={outcomeFeedback} onDismiss={() => setActionFeedback('')} />
              </div>
            ) : null}
            {pilotFallbackVersion ? (
              <article className="mb-5 rounded-[18px] border border-[#f4e2bf] bg-[#fff8ec] px-4 py-3 text-sm text-[#7d520d]">
                <p className="font-semibold">Pilot review draft — not for signature</p>
                <p className="mt-1">This preview is internal review material only. Correct the issue and generate a verified document before preparing signatures, downloading a signing copy, or sending anything to a client.</p>
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
                    onClick={() => activeGenerationRecovery
                      ? void handleGenerationRecoveryAction()
                      : isMandatePacket && typeof onGenerate === 'function'
                        ? void resetFailedMandateAndRegenerate()
                        : void refreshWorkspaceData()}
                    disabled={loading || actionBusy}
                  >
                    {activeGenerationRecovery?.actionLabel || (isMandatePacket && typeof onGenerate === 'function' ? 'Reset & Regenerate' : 'Retry')}
                  </Button>
                </div>
              </article>
            ) : null}
            {!legalPermissions.canEditDraft ? (
              <article className="mb-5 rounded-[18px] border border-[#e4ebf4] bg-[#f8fbff] px-4 py-3 text-sm font-semibold text-[#55708d]">
                Read-only mode: your role can view lifecycle progress and signer status, but cannot modify legal drafts.
              </article>
            ) : null}

            <div className="mb-5">
              <DocumentJourneyProgress model={documentJourney} />
            </div>
            {!isMandatePacket ? (
              <div className="mb-5">
                <SigningOperationalStatusCard status={signingOperationalStatus} />
              </div>
            ) : null}
            {statusState?.signingSummary?.signers?.length ? (
              <div id="legal-document-signer-progress" className="mb-5 scroll-mt-24">
                <SigningProgressTimeline
                  signers={statusState.signingSummary.signers}
                  canManage={legalPermissions.canSend || legalPermissions.canResend}
                  busy={actionBusy || signerBusy}
                  onSignerAction={(action, signer) => {
                    if (action === 'resend') void runReviewAction('resend_signature', { targetSignerRole: signer.role })
                    else if (action === 'remind') void runReviewAction('remind_signer', { targetSignerRole: signer.role })
                    else if (action === 'send') void runReviewAction('send_signature')
                  }}
                />
              </div>
            ) : null}
            {statusState?.signingActivity?.rows?.length ? (
              <div id="legal-document-signing-activity" className="mb-5 scroll-mt-24">
                <SigningActivityHistory history={statusState.signingActivity} />
              </div>
            ) : null}

            {isFullySignedLifecycle || hasFinalArtifact ? (
              <section data-testid="finalized-legal-record" className="mb-6 rounded-[24px] border border-[#cfe8d9] bg-[#effaf4] px-5 py-4" aria-label="Finalized legal record" role="status" aria-live="polite">
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
                      download={normalizeText(latestVersion?.final_signed_file_name || `signed-${isOtpPacket ? 'otp' : 'mandate'}.pdf`)}
                      className="inline-flex items-center rounded-full border border-[#c8e5d4] bg-white px-4 py-2 text-sm font-semibold text-[#1d5b3c]"
                    >
                      {`Download Signed ${isOtpPacket ? 'OTP' : 'Mandate'}`}
                    </a>
                  ) : null}
                  {!signedPreviewUrl && canFinalizeSignedRecord && legalPermissions.canFinalize ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => runReviewAction('finalize_signed')} disabled={actionBusy || finalizeBusy}>
                      {finalizeBusy ? 'Generating…' : 'Generate Signed PDF'}
                    </Button>
                  ) : null}
                </div>
                {finalCompletionState ? (
                  <div data-testid="final-completion-state" className={`mt-4 rounded-[16px] border px-4 py-3 text-sm ${finalCompletionState.ready ? 'border-[#c8e5d4] bg-white text-[#1d5b3c]' : 'border-[#f1dfb9] bg-[#fff9ec] text-[#7d520d]'}`}>
                    <p className="font-semibold">{finalCompletionState.ready ? 'Completed everywhere' : 'Signed PDF safe — completion pending'}</p>
                    <p className="mt-1">
                      Transaction: {finalCompletionState.transactionDocumentId ? 'saved' : 'pending'}
                      {finalCompletionState.ready && finalCompletionState.deliveryReady === false ? ` · Final email delivery pending: ${finalCompletionState.deliveredRecipientCount || 0}/${finalCompletionState.recipientCount || 0}` : ''}
                      {!finalCompletionState.ready ? ` · Recipient delivery: ${finalCompletionState.deliveredRecipientCount || 0}/${finalCompletionState.recipientCount || 0}` : ''}
                    </p>
                    {!finalCompletionState.ready && finalCompletionState.retryable && legalPermissions.canFinalize ? (
                      <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => void handleRetryFinalCompletion()} disabled={finalCompletionBusy || actionBusy}>
                        {finalCompletionBusy ? 'Retrying completion…' : 'Retry completion'}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {statusState?.completionCertificate?.ready ? (
                  <div id="legal-document-completion-certificate" className="mt-4 scroll-mt-24">
                    <SigningCompletionCertificate certificate={statusState.completionCertificate} />
                  </div>
                ) : null}
              </section>
            ) : null}

            <div id="legal-document-main-workspace" className={`${mainGridClassName} scroll-mt-24`}>
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
                    onSwitchToEditor={() => {
                      centerTabPreferenceRef.current = 'editor'
                      setCenterTab('editor')
                    }}
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
                    {!isMandatePacket ? (
                      <p className="mt-1 text-sm text-[#6b7c93]">Preview stays tied to the existing packet generation and signing pipeline.</p>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {editableAllowed ? (
                    <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      draftSaveState === 'conflict' || draftSaveState === 'error'
                        ? 'border-[#f2d7d2] bg-[#fff4f2] text-[#a03a2a]'
                        : draftSaveState === 'unsaved' || draftSaveState === 'saving'
                          ? 'border-[#f4e2bf] bg-[#fff8ec] text-[#8a5b12]'
                          : 'border-[#cde8d6] bg-[#eef9f2] text-[#2e7b4f]'
                    }`}>
                      {draftSaveState === 'saving'
                        ? 'Saving…'
                        : draftSaveState === 'unsaved'
                          ? 'Unsaved changes'
                          : draftSaveState === 'conflict'
                            ? 'Reload required'
                            : draftSaveState === 'error'
                              ? 'Not saved'
                              : draftLastSavedAt
                                ? `Saved ${formatRelativeTime(draftLastSavedAt)}`
                                : 'Saved'}
                    </span>
                  ) : null}
                  {editableAllowed && !isMandatePacket ? (
                    <div className="inline-flex items-center rounded-full border border-[#dbe5f0] bg-[#f7faff] p-1">
                      <button
                        type="button"
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition ${centerTab === 'preview' ? 'bg-white text-[#102033] shadow-[0_8px_18px_rgba(16,32,51,0.08)]' : 'text-[#6f839b]'}`}
                        onClick={handleFocusPreview}
                      >
                        <Eye size={13} />
                        Preview
                      </button>
                      <button
                        type="button"
                        className={`rounded-full px-4 py-2 text-xs font-semibold transition ${centerTab === 'editor' ? 'bg-white text-[#102033] shadow-[0_8px_18px_rgba(16,32,51,0.08)]' : 'text-[#6f839b]'}`}
                        onClick={() => {
                          centerTabPreferenceRef.current = 'editor'
                          setCenterTab('editor')
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  ) : null}
                    {!isMandatePacket && generatedPreviewUrl && typeof onView === 'function' ? (
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
                      <p className="mt-3 text-base font-semibold text-[#102033]">Mandate setup is ready.</p>
                      <p className="mt-1 max-w-md text-sm text-[#6b7c93]">Generate the mandate when you are ready to create the signing copy.</p>
                      {showGeneratePdfButton ? (
                        <Button
                          type="button"
                          size="sm"
                          className="mt-5"
                          onClick={() => void handleGeneratePacketDraft()}
                          disabled={actionBusy}
                        >
                          {actionBusy ? 'Working…' : `Generate ${isOtpPacket ? 'OTP' : 'Mandate'}`}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {!loading && showInlineEditor ? (
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

                  {!loading && showPreviewUnavailable ? (
                    <div className="flex min-h-[620px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#d8e2ef] bg-white px-6 text-center">
                      <AlertCircle size={24} className="text-[#9b6b1c]" />
                      <p className="mt-3 text-base font-semibold text-[#102033]">
                        {latestVersion?.id
                          ? 'Draft exists, but preview is not available yet.'
                          : 'Arch9 could not generate this document. Check missing fields or template setup.'}
                      </p>
                      <p className="mt-1 max-w-md text-sm text-[#6b7c93]">Preview and final render controls still rely on the existing packet generation pipeline.</p>
                    </div>
                  ) : null}

                  {!loading && showInlinePreview ? (
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
                            <button
                              type="button"
                              disabled={pdfAccessBusy}
                              onClick={handleWorkspacePdfDownload}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-control border border-borderDefault bg-surface px-4 text-secondary font-semibold shadow-surface transition-all duration-200 hover:-translate-y-0.5 hover:border-borderStrong hover:bg-mutedBg disabled:cursor-wait disabled:opacity-60"
                            >
                              <Download size={14} />
                              {pdfAccessBusy ? 'Preparing PDF…' : 'Download PDF'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

            </div>

            <div className={secondaryGridClassName}>
              <aside className="h-full space-y-5">
                {isMandatePacket ? (
                  <MandateRoutePanel routing={mandateRoutingSnapshot} />
                ) : null}

                {isMandatePacket ? (
                  <SigningMethodPanel
                    method={signingMethod}
                    packetType={packetType}
                    canChange={canChangeSigningMethod}
                    lockedReason={signingMethodLockedReason}
                    onSelect={handleSelectSigningMethod}
                    onOpenSignaturePrep={() => setSignerPrepOpen(true)}
                    canResend={canResendSignatureLinks}
                    onResend={() => runReviewAction('resend_signature')}
                    resendSummary={resendSignatureSummary}
                    signaturePrepSummary={signaturePrepSummary}
                    busy={actionBusy || loading}
                    className={reviewRailPanelClassName}
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
                    canFinalize={legalPermissions.canFinalize && ['ready_to_send', 'sent', 'partially_signed'].includes(normalizedLifecycleState)}
                    onDownload={handlePhysicalDownload}
                    onFileChange={setManualSignedFile}
                    onNotesChange={setManualSignedNotes}
                    onConfirmedChange={setManualSignedConfirmed}
                    onAllPartiesSignedChange={setManualSignedAllPartiesSigned}
                    onUpload={handleManualSignedUpload}
                  />
                ) : null}

              </aside>

              <aside className="h-full space-y-5">
                <ActivityPanel
                  activeTab={activityTab}
                  onTabChange={setActivityTab}
                  versions={statusState?.versions || []}
                  events={eventHistory}
                  templateLabel={normalizeText(templateDetail?.template_label || statusState?.packet?.template_label_snapshot)}
                  templateKey={normalizeText(templateDetail?.template_key || statusState?.packet?.template_key_snapshot)}
                  templateStoragePath={normalizeText(templateDetail?.template_storage_path)}
                  currentEditableVersionId={editableVersion?.id || ''}
                  canRestoreVersions={editableAllowed && legalPermissions.canEditDraft && !editableDirty}
                  restoreBusyVersionId={restoreBusyVersionId}
                  onRestoreVersion={handleRestoreEditableVersion}
                  className={reviewRailPanelClassName}
                />
              </aside>
            </div>

            <div className="mt-5 rounded-[28px] border border-[#e5edf7] bg-white p-4 shadow-[0_16px_40px_rgba(16,32,51,0.05)] sm:p-5">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                <div className="grid min-w-0 gap-5 lg:grid-cols-[300px_minmax(320px,1fr)] lg:items-center">
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
                        <button
                          type="button"
                          onClick={() => {
                            setBottomActionMenuOpen(false)
                            handleFocusPreview()
                          }}
                          disabled={loading || !statusState?.packet?.id}
                          className={`flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-sm font-medium transition ${
                            loading || !statusState?.packet?.id
                              ? 'cursor-not-allowed text-[#a1afbf]'
                              : 'text-[#102033] hover:bg-[#f8fbff]'
                          }`}
                        >
                          Preview
                          <ChevronRight size={14} className="text-[#8a99ad]" />
                        </button>
                        {previewDownloadUrl ? (
                          <button
                            type="button"
                            disabled={pdfAccessBusy}
                            className="flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-sm font-medium text-[#102033] transition hover:bg-[#f8fbff] disabled:opacity-60"
                            onClick={() => {
                              setBottomActionMenuOpen(false)
                              handleWorkspacePdfDownload()
                            }}
                          >
                            Download PDF
                            <ChevronRight size={14} className="text-[#8a99ad]" />
                          </button>
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
        <DocumentMobileActionDock
          model={workspaceMobileAction}
          busy={loading || actionBusy || signerBusy || finalCompletionBusy}
          onAction={handleMobileAction}
        />
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
        subtitle="Confirm the agent and all required seller-side signers before sending secure links."
        widthClassName="max-w-[760px]"
      >
                <SignerPreparationPanel
                  packetType={packetType}
                  lifecycleState={normalizedLifecycleState}
                  signingStatus={statusState?.signingStatus || sourceContext.signing_status || sourceContext.signingStatus || sourceContext.mandateStatus}
                  canManageSigners={legalPermissions.canManageSigners}
                  roster={effectiveSignerRoster}
                  draftByRole={signerDraftByRole}
                  onDraftChange={handleSignerDraftChange}
                  validation={signerValidation}
                  onPrepare={handlePrepareSignerFields}
                  onResend={(role) => runReviewAction('resend_signature', { targetSignerRole: role })}
                  onRefresh={handleRefreshSignerStatus}
                  signingLayout={signingFieldLayout}
                  signingLayoutRevision={signingFieldLayoutRevision}
                  signingLayoutBusy={signingFieldLayoutBusy}
                  pdfPreviewUrl={generatedPreviewUrl}
                  onSigningPdfPageCountChange={setSigningPdfPageCount}
                  onAddSigningBlock={handleAddSigningBlock}
                  onSigningBlockChange={handleSigningBlockChange}
                  onRemoveSigningBlock={handleRemoveSigningBlock}
                  onSaveSigningLayout={handleSaveSigningLayout}
                  onApplySigningLayout={handleApplySigningLayout}
                  busy={actionBusy || signerBusy || loading}
                />
      </Drawer>

    </>
  )
}
