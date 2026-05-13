import { AlertCircle, ArrowLeft, ChevronDown, ChevronRight, FileCheck2, FileText, Link2, Plus, Printer, ShieldCheck, UploadCloud, UsersRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '../ui/Button'
import { useWorkspace } from '../../context/WorkspaceContext'
import { normalizeAppRole } from '../../lib/roles'
import {
  appendDocumentPacketEvent,
  createDocumentPacketSigners,
  createDocumentPacketVersion,
  fetchDocumentPacket,
  fetchDocumentPacketTemplate,
  updateDocumentPacket,
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

function toFriendlyWorkspaceError(error = null, fallback = 'Unable to complete this legal action right now.') {
  const code = normalizeText(error?.code).toUpperCase()
  const raw = normalizeText(error?.message || error)
  const message = raw.toLowerCase()
  if (code === 'STALE_PACKET_STATE') {
    return 'This document was updated by another user. Refresh and try again.'
  }
  if (code === 'PACKETS_RLS_DENIED' || message.includes('row-level security') || message.includes('permission denied')) {
    return 'Your role cannot complete this action in the current organisation context.'
  }
  if (code === 'NO_GENERATED_VERSION') return 'Generate a draft version before continuing.'
  if (code === 'MISSING_TEMPLATE_FILE') return 'A valid template file is missing. Upload or configure the template path first.'
  if (code === 'VALIDATION_BLOCKED') return 'Required legal fields are missing. Resolve validation blockers first.'
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
  if (message.includes('cannot read') || message.includes('undefined') || message.includes('templatedata null')) {
    return 'Some seller onboarding information is still missing. Review the missing information panel and try again.'
  }
  if (message.includes('invalid uuid')) {
    return 'The mandate could not be linked correctly. Please refresh and try again.'
  }
  if (message.includes('template') && (message.includes('render') || message.includes('failed'))) {
    return 'The mandate template could not be generated because required information is missing.'
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
    { role: 'seller', label: 'Seller', required: true },
    { role: 'agent', label: 'Agent', required: false },
    { role: 'witness_1', label: 'Witness', required: false },
    { role: 'purchaser_2', label: 'Spouse', required: false },
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

function resolveSignerRoster({ packetType = 'mandate', signers = [] } = {}) {
  const rows = Array.isArray(signers) ? signers : []
  const byRole = new Map()
  for (const row of rows) {
    const role = normalizeKey(row?.signer_role || row?.role)
    if (!role || byRole.has(role)) continue
    byRole.set(role, row)
  }

  const roster = resolveSignerBlueprint(packetType).map((item) => {
    const existing = byRole.get(item.role) || null
    return {
      role: item.role,
      label: item.label,
      required: Boolean(item.required),
      signer: existing,
      signerName: normalizeText(existing?.signer_name || ''),
      signerEmail: normalizeText(existing?.signer_email || '').toLowerCase(),
      status: resolveSignerStatusLabel(existing?.status, ''),
      statusRaw: existing?.status || '',
      seenAt: normalizeText(existing?.viewed_at || existing?.updated_at || ''),
      signedAt: normalizeText(existing?.signed_at || ''),
    }
  })

  const configured = new Set(roster.map((row) => row.role))
  for (const row of rows) {
    const role = normalizeKey(row?.signer_role || row?.role)
    if (!role || configured.has(role)) continue
    roster.push({
      role,
      label: role.replace(/_/g, ' '),
      required: false,
      signer: row,
      signerName: normalizeText(row?.signer_name || ''),
      signerEmail: normalizeText(row?.signer_email || '').toLowerCase(),
      status: resolveSignerStatusLabel(row?.status, ''),
      statusRaw: row?.status || '',
      seenAt: normalizeText(row?.viewed_at || row?.updated_at || ''),
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
  const agencyLogo = normalizeText(branding?.organisationLogoDarkUrl) || normalizeText(branding?.organisationLogoUrl)
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

function resolveWorkspaceStatusTone(state) {
  const normalized = normalizeKey(state)
  if (normalized === 'signed') return 'border-[#cde8d6] bg-[#eef9f2] text-[#2e7b4f]'
  if (['sent', 'partially_signed'].includes(normalized)) return 'border-[#d6e2ef] bg-[#f4f8fc] text-[#35546c]'
  if (normalized === 'in_review') return 'border-[#f0e2c2] bg-[#fff9ed] text-[#8a5b12]'
  if (normalized === 'approved') return 'border-[#dbe8fa] bg-[#edf4ff] text-[#215fba]'
  if (normalized === 'draft') return 'border-[#f0e2c2] bg-[#fff9ed] text-[#8a5b12]'
  if (normalized === 'no_packet') return 'border-[#e5e9f0] bg-[#f7f9fc] text-[#5e7289]'
  return 'border-[#f2d7d2] bg-[#fff4f2] text-[#a03a2a]'
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

function formatLifecycleStepLabel(step = '') {
  const labels = {
    draft: 'Draft',
    approved: 'Approved',
    locked: 'Locked',
    sent: 'Sent',
    partially_signed: 'Partially Signed',
    printed: 'Printed',
    uploaded: 'Uploaded',
    signed: 'Signed',
    archived: 'Archived',
  }
  return labels[normalizeKey(step)] || normalizeText(step).replace(/_/g, ' ')
}

const MANDATE_STATUS_BADGES = {
  draft: { label: 'Draft', className: 'border-[#dbe5f0] bg-[#f7fbff] text-[#526b84]' },
  generated: { label: 'Generated', className: 'border-[#cddded] bg-[#f1f7fd] text-[#2f5f89]' },
  generated_for_physical_signature: { label: 'Physical Signature Pending', className: 'border-[#f1dfb8] bg-[#fff8eb] text-[#8a5b12]' },
  uploaded_signed: { label: 'Signed PDF Uploaded', className: 'border-[#cde8d6] bg-[#eef9f2] text-[#2e7b4f]' },
  sent_for_signature: { label: 'Sent for Digital Signing', className: 'border-[#cddded] bg-[#f1f7fd] text-[#2f5f89]' },
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

function getMandateNextAction(status = 'draft', signingMethod = 'not_selected', onboardingStatus = '') {
  const normalized = normalizeKey(status)
  const method = normalizeSigningMethod(signingMethod)
  if (!['completed', 'submitted'].includes(normalizeKey(onboardingStatus))) {
    return 'Complete seller onboarding before generating the mandate.'
  }
  if (normalized === 'draft') return 'Generate the mandate PDF.'
  if (normalized === 'generated' && method === 'not_selected') return 'Choose digital signing or physical signature.'
  if (normalized === 'generated' && method === 'digital') return 'Send the mandate to the seller for digital signing.'
  if (normalized === 'generated' && method === 'physical') return 'Download the mandate for physical signature.'
  if (normalized === 'generated_for_physical_signature') return 'Upload the signed PDF once the seller has signed the printed document.'
  if (normalized === 'sent_for_signature') return 'Monitor signing progress or resend the signing link if needed.'
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
  canAddCustomSection = false,
  customSectionLabel = '',
  onCustomSectionLabelChange = null,
  onAddCustomSection = null,
  onRemoveSection = null,
}) {
  const fallbackSections = ['Parties', 'Property Details', 'Purchase Terms', 'Suspensive Conditions', 'Special Conditions', 'Signatures']
  const outlineSections = Array.isArray(sections) && sections.length
    ? sections
      .map((item) => ({
        key: normalizeText(item?.key || item?.label),
        label: normalizeText(item?.label || item?.key),
        custom: Boolean(item?.custom),
        required: Boolean(item?.required),
      }))
      .filter((item) => item.label)
    : fallbackSections
      .map((label) => ({ key: label, label, custom: false, required: true }))
  return (
    <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4">
      <h4 className="text-sm font-semibold text-[#1a2f45]">Document Outline</h4>
      <ul className="mt-3 space-y-2 text-sm text-[#4f657d]">
        {outlineSections.map((item) => (
          <li key={item.key || item.label} className="flex items-center gap-2 rounded-[10px] bg-[#f8fbff] px-3 py-2">
            <FileText size={14} className="text-[#6f86a0]" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.custom ? (
              <span className="rounded-full border border-[#d9e5f1] bg-white px-2 py-0.5 text-[0.62rem] font-semibold text-[#60758d]">
                Custom
              </span>
            ) : null}
            {canAddCustomSection && !item.required ? (
              <button
                type="button"
                onClick={() => onRemoveSection?.(item.key)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e7d4cf] bg-white text-[#9d4437] transition hover:bg-[#fff4f2]"
                aria-label={`Remove ${item.label}`}
                title={`Remove ${item.label}`}
              >
                <X size={13} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canAddCustomSection ? (
        <div className="mt-4 rounded-[12px] border border-dashed border-[#cfdceb] bg-[#fbfdff] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#61758c]">Add Custom Section</p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={customSectionLabel}
              onChange={(event) => onCustomSectionLabelChange?.(event.target.value)}
              placeholder="Section name"
              className="min-w-0 flex-1 rounded-[10px] border border-[#d7e1ed] bg-white px-3 py-2 text-xs text-[#20344b] outline-none focus:border-[#8ca8c4]"
            />
            <button
              type="button"
              onClick={onAddCustomSection}
              disabled={!normalizeText(customSectionLabel)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#d7e1ed] bg-white text-[#35546c] transition hover:bg-[#f2f7fb] disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="Add custom document section"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function MergeChecklistPanel({ packetType = 'mandate', placeholders = {} }) {
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

  const badgeByStatus = {
    complete: 'border-[#cde8d6] bg-[#eef9f2] text-[#2e7b4f]',
    missing: 'border-[#f2d7d2] bg-[#fff4f2] text-[#a03a2a]',
    warning: 'border-[#f3e0b9] bg-[#fff8ea] text-[#8a5b12]',
    deprecated: 'border-[#ddd9f6] bg-[#f5f2ff] text-[#5a43a8]',
  }

  const labelByStatus = {
    complete: 'Resolved',
    missing: 'Missing',
    warning: 'Optional',
    deprecated: 'Alias',
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-[18px] border border-[#dce6f2] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-[#1a2f45]">Merge Field Checklist</h4>
          <p className="mt-1 text-xs text-[#7187a0]">Canonical values resolved from onboarding, transaction, and packet context.</p>
        </div>
        <span className="shrink-0 rounded-full border border-[#dbe6f2] bg-[#f7fafd] px-2 py-1 text-[0.65rem] font-semibold text-[#60758d]">
          {rows.filter((row) => row.value).length}/{rows.length}
        </span>
      </div>
      <div className="mt-3 max-h-[520px] min-h-[280px] flex-1 space-y-2 overflow-y-auto pr-1">
        {rows.map((row) => (
          <article key={row.key} className="rounded-[12px] border border-[#e5edf5] bg-[#f8fbff] px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[0.72rem] font-semibold text-[#1c334b]">{row.key}</p>
                <p className="mt-0.5 text-xs text-[#5f748c]">{row.value || 'Missing'}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[0.64rem] font-semibold ${badgeByStatus[row.status]}`}>
                {labelByStatus[row.status]}
              </span>
            </div>
            <p className="mt-1 text-[0.66rem] text-[#7b8ea4]">Source: {row.source}</p>
            {row.alias ? (
              <p className="mt-1 text-[0.66rem] font-semibold text-[#5a43a8]">
                Deprecated alias resolved: {row.alias} {'->'} {row.key}
              </p>
            ) : null}
            {!row.value && row.required ? (
              <p className="mt-1 text-[0.66rem] font-semibold text-[#a03a2a]">
                Required before generation.
              </p>
            ) : null}
          </article>
        ))}
      </div>
      {normalized.unknownKeys?.length ? (
        <div className="mt-3 rounded-[12px] border border-[#f3e0b9] bg-[#fff8ea] px-3 py-2 text-xs text-[#7d520d]">
          {normalized.unknownKeys.length} unmapped field{normalized.unknownKeys.length === 1 ? '' : 's'} detected. Review template placeholders before finalizing.
        </div>
      ) : null}
    </section>
  )
}

function SignerChecklistPanel({ packetType = 'mandate', signers = [], statusState }) {
  const signerRows = resolveSignerRoster({ packetType, signers })
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
          <article key={section.key} className="rounded-[16px] border border-[#dce6f2] bg-white p-3 sm:p-4">
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
    ['sent_for_signature', 'viewed', 'failed'].includes(normalizeKey(signingStatus))
  )

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
          const editableRow = canEditRoster && (!row.signer || !isValidEmail(row.signerEmail) || row.signerEmail.endsWith('@bridge.local'))
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
              ) : row.seenAt ? (
                <p className="mt-1 text-[0.68rem] text-[#60758d]">Last viewed {formatDateTime(row.seenAt)}</p>
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
        <Button type="button" size="sm" variant="secondary" onClick={() => void onResend?.()} disabled={busy || !canResend}>
          {busy ? 'Working…' : 'Resend Signing Links'}
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

function SigningMethodPanel({
  method = 'not_selected',
  canChange = false,
  lockedReason = '',
  onSelect = null,
  busy = false,
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
    <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-[#1a2f45]">How would you like to sign this mandate?</h4>
          <p className="mt-1 text-xs text-[#6f839b]">Choose the signing path before sending or downloading.</p>
        </div>
        <span className="rounded-full border border-[#dce6f2] bg-[#f7fbff] px-2.5 py-0.5 text-[0.68rem] font-semibold text-[#526b84]">
          {resolveSigningMethodLabel(method)}
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        {options.map(({ key, title, description, Icon, next }) => {
          const selected = normalizeSigningMethod(method) === key
          const OptionIcon = Icon
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect?.(key)}
              disabled={busy || (!canChange && !selected)}
              className={`rounded-[14px] border p-3 text-left transition ${
                selected
                  ? 'border-[#2f5f89] bg-[#f1f7fd] shadow-[0_10px_26px_rgba(32,73,110,0.12)]'
                  : 'border-[#e0e8f2] bg-[#fbfdff] hover:border-[#b9cce0] hover:bg-white'
              } ${busy || (!canChange && !selected) ? 'cursor-not-allowed opacity-70' : ''}`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border ${
                  selected ? 'border-[#bad1e8] bg-white text-[#264f77]' : 'border-[#dce6f2] bg-white text-[#6d8299]'
                }`}>
                  <OptionIcon size={17} />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[#20344b]">{title}</span>
                    {selected ? (
                      <span className="rounded-full border border-[#b9d3ea] bg-white px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-[#2f5f89]">
                        Selected
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[#667c94]">{description}</span>
                  {selected ? <span className="mt-2 block text-[0.7rem] font-semibold text-[#2f5f89]">{next}</span> : null}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {lockedReason ? (
        <p className="mt-3 rounded-[10px] border border-[#f4e2bf] bg-[#fff8ec] px-3 py-2 text-xs text-[#8a5b12]">
          {lockedReason}
        </p>
      ) : !canChange ? (
        <p className="mt-3 text-[0.7rem] text-[#6f839b]">Generate the mandate before choosing a signing method.</p>
      ) : null}
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
  const autoFinalizeGuardRef = useRef(new Set())
  const autoGenerateGuardRef = useRef('')
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
    return versions[0] || null
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

  const signerRoster = useMemo(() => {
    return resolveSignerRoster({
      packetType,
      signers: statusState?.signingSummary?.signers || [],
    })
  }, [packetType, statusState?.signingSummary?.signers])

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
  const signerSummary = statusState?.signingSummary || null
  const canFinalizeSignedRecord = useMemo(() => canFinalizeSigningSummary(signerSummary), [signerSummary])
  const isFullySignedLifecycle = normalizedLifecycleState === 'signed'
  const hasFinalArtifact = Boolean(signedPreviewUrl)
  const isMandatePacket = normalizeKey(packetType) === 'mandate'
  const sourceContext = useMemo(() => (
    statusState?.packet?.source_context_json && typeof statusState.packet.source_context_json === 'object'
      ? statusState.packet.source_context_json
      : {}
  ), [statusState?.packet?.source_context_json])
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
  const lastMandateEvent = useMemo(() => {
    const rows = Array.isArray(packetDetail?.events) ? packetDetail.events : []
    return rows.find((event) => normalizeText(event?.event_payload_json?.activity_type || event?.event_type).toLowerCase().includes('mandate') || normalizeText(event?.event_type).toLowerCase().includes('generation') || normalizeText(event?.event_type).toLowerCase().includes('sign')) || rows[0] || null
  }, [packetDetail?.events])
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
  const lifecycleSteps = resolveLifecycleSteps(signingMethod)
  const displayLifecycleState = resolveDisplayLifecycleState(normalizedLifecycleState, signingMethod)
  const lifecycleCopy = resolveLifecycleCopy(normalizedLifecycleState, signingMethod)
  const lifecycleProgress = resolveLifecycleProgress(normalizedLifecycleState, signingMethod)
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
    const currentLatestVersion = (Array.isArray(currentStatus?.versions) ? currentStatus.versions[0] : null) || latestVersion
    if (!currentLatestVersion?.id) throw new Error('Generate a packet version before assigning signers.')

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
        if (existingEmail && existingEmail === signerEmail && normalizeText(row.signerName) === signerName) return null
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
        packetVersionId: currentLatestVersion.id,
        packetDocumentId: currentLatestVersion?.rendered_document_id || null,
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
      await prepareSigningFields({
        packetId: resolvedPacketId,
        packetType,
        organisationId: statusState?.packet?.organisation_id || organisationId || null,
        placeholders: latestVersion?.placeholders_resolved_json || {},
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

  async function ensureSignerReadinessBeforeSend({ isResend = false } = {}) {
    assertWorkspacePermission(isResend ? 'canResend' : 'canSend', isResend ? 'resend signing links' : 'send documents for signature')
    let workingStatus = statusStateRef.current || statusState
    if (!workingStatus?.signingSummary?.signerCount || !workingStatus?.signingSummary?.fieldCount) {
      await prepareSigningFields({
        packetId: normalizeText(workingStatus?.packet?.id || packetId),
        packetType,
        organisationId: workingStatus?.packet?.organisation_id || organisationId || null,
        placeholders: latestVersion?.placeholders_resolved_json || {},
        context: workingStatus?.packet?.source_context_json || {},
      })
      const refreshed = await refreshWorkspaceData()
      workingStatus = refreshed?.resolved || statusStateRef.current || statusState
    }

    const latestRoster = resolveSignerRoster({
      packetType,
      signers: workingStatus?.signingSummary?.signers || [],
    }).map((row) => {
      const draft = signerDraftByRole[row.role] || null
      if (!draft) return row
      return {
        ...row,
        signerName: normalizeText(draft.signerName || row.signerName),
        signerEmail: normalizeText(draft.signerEmail || row.signerEmail).toLowerCase(),
      }
    })

    const check = validateSignerRoster({
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
    if (hasDraftOverrides) {
      await saveSignerDetails({ includeOptional: true })
      const refreshed = await refreshWorkspaceData()
      workingStatus = refreshed?.resolved || workingStatus
    }

    const resolvedPacketId = normalizeText(workingStatus?.packet?.id || packetId)
    if (!resolvedPacketId) throw new Error('Packet record missing before signing send.')
    const versionId = normalizeText((workingStatus?.versions || [])[0]?.id || latestVersion?.id)
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
    })

    if (isResend) {
      await appendDocumentPacketEvent({
        packetId: resolvedPacketId,
        organisationId: workingStatus?.packet?.organisation_id || organisationId || null,
        versionId,
        eventType: 'signer_links_resent',
        eventPayload: {
          signerCount: Array.isArray(linkResult?.signers) ? linkResult.signers.length : 0,
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

  function getApprovalAndSendBlockers({ requireSendState = false, packetOverride = null } = {}) {
    const packet = packetOverride || statusState?.packet || null
    const blockers = []
    if (!packet?.id) blockers.push('Packet record is missing.')
    if (!latestVersion?.id) blockers.push('Generate a packet version before this action.')
    if (!packet?.template_id && !hasUsablePacketVersionForSigning(latestVersion)) {
      blockers.push('Template reference is missing.')
    }
    if (!draftValidationSummary.isValid) blockers.push('Resolve merge field blockers before continuing.')
    if (requireSendState && signerValidation.blockers.length) {
      blockers.push(signerValidation.blockers[0])
    }
    return blockers
  }

  async function ensureTemplateReferenceBeforeSend() {
    const packet = (statusStateRef.current || statusState)?.packet || null
    if (packet?.template_id || !isUuidLike(packet?.id)) return packet

    const templates = await listPacketTemplates({
      packetType,
      moduleType: 'agency',
      includeInactive: false,
      organisationId: packet.organisation_id || organisationId || null,
    })
    const template = Array.isArray(templates) ? templates.find((item) => normalizeText(item?.id)) : null
    if (!template?.id) return packet

    const updatedPacket = await updateWorkspacePacket(packet.id, {
      templateId: template.id,
      templateKeySnapshot: normalizeText(template.template_key || template.key),
      templateLabelSnapshot: normalizeText(template.template_label || template.label || template.name),
      allowTemplateReferenceBackfill: true,
    })
    const refreshed = await refreshWorkspaceData()
    return refreshed?.resolved?.packet || updatedPacket
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
    } else if (target === 'locked') {
      nextPacketStatus = 'signing_prep'
      nextSourceContext.lockedAt = nowIso
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
        versionId: latestVersion?.id || null,
        eventType,
        eventPayload: {
          fromState: normalizedLifecycleState,
          toState: target,
        },
      })
    }
  }

  async function ensurePersistedPacketBeforeSend() {
    const currentStatus = statusStateRef.current || statusState
    if (!isRuntimePacketId(currentStatus?.packet?.id || packetId)) {
      return currentStatus
    }
    if (typeof onGenerate !== 'function') {
      throw new Error('Save this mandate as a packet before sending for signature.')
    }

    setActionProgressMessage('Saving mandate packet before sending…')
    const generationResult = await onGenerate({
      persistForSend: true,
      onProgress: (message) => setActionProgressMessage(normalizeText(message)),
    })
    const nextStatus = generationResult?.status || statusStateRef.current || statusState
    if (!nextStatus?.packet?.id || isRuntimePacketId(nextStatus.packet.id)) {
      throw new Error('Mandate packet could not be saved before sending. Please retry Generate Mandate, then Send for Signature.')
    }
    statusStateRef.current = nextStatus
    setStatusState(nextStatus)
    return nextStatus
  }

  async function handleSendForSignatureFromWorkspace({ resend = false } = {}) {
    if (isMandatePacket && signingMethod !== 'digital') {
      throw new Error(signingMethod === 'physical'
        ? 'This mandate is set for physical signing. Use the manual upload workflow instead of digital signature sending.'
        : 'Select Digital Mandate before sending secure signing links.')
    }
    const persistedStatus = await ensurePersistedPacketBeforeSend()
    const packetForSend = persistedStatus?.packet?.template_id
      ? persistedStatus.packet
      : await ensureTemplateReferenceBeforeSend()
    const blockers = getApprovalAndSendBlockers({ requireSendState: !resend, packetOverride: packetForSend })
    if (blockers.length) {
      throw new Error(`Cannot send: ${blockers[0]}`)
    }
    const currentSigningStatus = normalizeKey((statusStateRef.current || statusState)?.signingStatus || sourceContext.signing_status || sourceContext.signingStatus || sourceContext.mandateStatus)
    if (
      resend &&
      !['sent', 'partially_signed'].includes(normalizedLifecycleState) &&
      !['sent_for_signature', 'viewed', 'failed'].includes(currentSigningStatus)
    ) {
      throw new Error('Resend is only available after the document has been sent for signature.')
    }

    setActionProgressMessage(resend ? 'Refreshing secure signer links…' : 'Preparing signer links…')
    const { linkResult } = await ensureSignerReadinessBeforeSend({ isResend: resend })
    if (!Array.isArray(linkResult?.signers) || !linkResult.signers.some((signer) => normalizeText(signer?.signing_link))) {
      throw createWorkspaceError('SIGNING_LINK_FAILED', 'The signing link could not be created. Please try again.')
    }

    const currentStatus = statusStateRef.current || statusState
    const currentPacketId = normalizeText(linkResult?.packetId || currentStatus?.packet?.id || packetId)
    const currentPacket = currentStatus?.packet || {}
    const versionId = normalizeText(linkResult?.packetVersionId || latestVersion?.id)
    const nowIso = new Date().toISOString()
    const signerEmails = Array.isArray(linkResult?.signers)
      ? linkResult.signers.map((signer) => normalizeText(signer?.signer_email).toLowerCase()).filter(Boolean)
      : []

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
        signing_status: resend ? 'sent_for_signature' : 'sent_for_signature',
        signingStatus: 'sent_for_signature',
        mandateStatus: 'sent_for_signature',
        lifecycle_state: 'sent',
        sentAt: currentPacket?.sent_at || nowIso,
        sentBy: normalizeText(currentPacket?.assigned_agent_id || currentPacket?.created_by) || null,
        signerEmails,
        signerCount: signerEmails.length,
        signingLinkPreparedAt: nowIso,
        signingLinkLastSentAt: nowIso,
        signingLinkResentAt: resend ? nowIso : null,
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
        signingStatus: 'sent_for_signature',
        preparedAt: nowIso,
      },
    })

    setActionProgressMessage(resend ? 'Sending resend notifications…' : 'Sending signer notifications…')
    try {
      await onSend?.({
        resend,
        signerLinks: Array.isArray(linkResult?.signers) ? linkResult.signers : [],
        packetId: currentPacketId,
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
        signingStatus: 'sent_for_signature',
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
        setActionProgressMessage('Preparing preview…')
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

  useEffect(() => {
    if (!open || !isMandatePacket || effectiveMode !== 'generate' || statusState?.packet?.id || actionBusy || loading) return
    if (!legalPermissions.canGenerate || typeof onGenerate !== 'function') return
    const autoGenerateKey = [
      packetType,
      normalizeText(packetId),
      normalizeText(transactionId),
      normalizeText(statusState?.state || 'NO_PACKET'),
    ].join(':')
    if (autoGenerateGuardRef.current === autoGenerateKey) return
    autoGenerateGuardRef.current = autoGenerateKey

    let active = true
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
        if (!active) return
        if (generationResult?.status) {
          statusStateRef.current = generationResult.status
          setStatusState(generationResult.status)
        }
        setActionFeedback('Draft generated successfully.')
      } catch (error) {
        await logMandateFailure('auto_generate', error)
        if (active) setLoadError(toFriendlyWorkspaceError(error, 'Unable to generate this mandate draft right now.'))
      } finally {
        if (active) {
          setActionProgressMessage('')
          actionBusyRef.current = false
          setActionBusy(false)
        }
      }
    }

    void generateInitialDraft()
    return () => {
      active = false
    }
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
    statusState?.packet?.id,
    statusState?.state,
    transactionId,
  ])

  async function runReviewAction(actionKey) {
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
        await handleSendForSignatureFromWorkspace({ resend: true })
        setActionFeedback('Signing links resent to outstanding signers.')
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
      void runReviewAction('send_signature')
      return
    }
    void runPrimaryAction()
  }

  if (!open) return null

  const shellClassName = isPageMode
    ? 'legal-document-workspace-page flex min-h-[calc(100vh-132px)] w-full flex-col overflow-hidden rounded-[18px] border border-[#cfdae8] bg-[#f2f6fb]'
    : 'mx-auto flex h-full w-full max-w-[1720px] flex-col overflow-hidden rounded-[26px] border border-[#cfdae8] bg-[#f2f6fb] shadow-[0_28px_70px_rgba(10,24,42,0.32)]'
  const rootClassName = isPageMode
    ? 'w-full'
    : 'fixed inset-0 z-[95] bg-[#0b1422]/55 px-2 py-2 sm:px-4 sm:py-4'
  const contentClassName = isPageMode
    ? 'min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-4 sm:px-5 sm:pb-6'
    : 'min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3 sm:px-5 sm:pb-5 sm:pt-4'
  const mainGridClassName = isPageMode
    ? 'grid min-h-full items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_360px]'
    : 'grid min-h-full gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]'
  const sidePanelClassName = isPageMode
    ? 'flex min-h-[640px] flex-col gap-4 lg:order-none'
    : 'space-y-4'
  const actionAsideClassName = isPageMode
    ? 'space-y-4 lg:col-span-2 2xl:col-span-1'
    : 'space-y-4'

  return (
    <div className={rootClassName}>
      <div className={shellClassName}>
        <header className="border-b border-[#d7e1ed] bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {isPageMode ? (
                <button
                  type="button"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d7e1ed] bg-white text-[#51677f] transition hover:bg-[#f7faff]"
                  onClick={onBack || onClose}
                  aria-label={backLabel}
                  title={backLabel}
                >
                  <ArrowLeft size={16} />
                </button>
              ) : null}
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="truncate text-[1.08rem] font-semibold text-[#142132] sm:text-[1.2rem]">
                    {resolveDocumentLabel(packetType)}
                  </h2>
                  <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold ${resolveWorkspaceStatusTone(statusState?.state || 'unknown')}`}>
                    {headerStatusLabel}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-[#6c8198]">
                  {transactionReference || 'Transaction reference unavailable'}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleWorkspacePrimaryAction}
                disabled={loading || actionBusy}
              >
                {actionBusy ? 'Working…' : workspacePrimaryLabel}
              </Button>
              {!isPageMode ? (
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d7e1ed] bg-white text-[#51677f] transition hover:bg-[#f7faff]"
                  onClick={onClose}
                  aria-label="Close workspace"
                >
                  <X size={16} />
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <div className={contentClassName}>
          {actionProgressMessage ? (
            <article className="mb-4 rounded-[14px] border border-[#d8e4ef] bg-[#f4f8fc] px-4 py-2 text-xs font-semibold text-[#35546c]">
              {actionProgressMessage}
            </article>
          ) : null}
          {actionFeedback ? (
            <article className="mb-4 rounded-[14px] border border-[#cde8d6] bg-[#eef9f2] px-4 py-2 text-xs font-semibold text-[#2e7b4f]">
              {actionFeedback}
            </article>
          ) : null}
          {loadError ? (
            <article className="mb-4 rounded-[16px] border border-[#f1d8d0] bg-[#fff5f3] px-4 py-3 text-sm text-[#973824]">
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
                  onClick={() => void refreshWorkspaceData()}
                  disabled={loading || actionBusy}
                >
                  Retry
                </Button>
              </div>
            </article>
          ) : null}
          {!legalPermissions.canEditDraft ? (
            <article className="mb-4 rounded-[14px] border border-[#e4ebf4] bg-[#f8fbff] px-4 py-2 text-xs font-semibold text-[#55708d]">
              Read-only mode: your role can view lifecycle progress and signer status, but cannot modify legal drafts.
            </article>
          ) : null}

          <section className="mb-4 rounded-[16px] border border-[#dbe5f0] bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#6f839b]">Lifecycle Progress</p>
                <p className="text-sm font-semibold text-[#1d3248]">Current: {headerStatusLabel}</p>
                <p className="mt-0.5 text-xs text-[#6c8198]">{lifecycleCopy.current}</p>
                <p className="mt-0.5 text-xs text-[#6c8198]">{lifecycleCopy.next}</p>
              </div>
              <span className="inline-flex rounded-full border border-[#dbe6f2] bg-[#f5f9fd] px-3 py-1 text-xs font-semibold text-[#35546c]">
                {lifecycleProgress}% complete
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#e8eff6]">
              <div className="h-full rounded-full bg-[#35546c] transition-all duration-500" style={{ width: `${Math.max(6, lifecycleProgress)}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-[#7388a1] sm:grid-cols-7">
              {lifecycleSteps.map((step) => (
                <span
                  key={step}
                  className={`rounded-full border px-1.5 py-0.5 text-center ${
                    lifecycleSteps.indexOf(step) <= lifecycleSteps.indexOf(displayLifecycleState)
                      ? 'border-[#d4e2ee] bg-[#f3f8fd] text-[#35546c]'
                      : 'border-[#e6edf5] bg-[#fafcff] text-[#8aa0b8]'
                  }`}
                >
                  {formatLifecycleStepLabel(step)}
                </span>
              ))}
            </div>
          </section>

          {isMandatePacket ? (
            <section className="mb-4 rounded-[16px] border border-[#dbe5f0] bg-white px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#6f839b]">Mandate Status</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${mandateStatusMeta.className}`}>
                      {mandateStatusMeta.label}
                    </span>
                    <span className="text-xs text-[#6c8198]">{resolveSigningMethodLabel(signingMethod)}</span>
                  </div>
                </div>
                <div className="min-w-[220px] rounded-[12px] border border-[#e1e9f2] bg-[#f8fbff] px-3 py-2 text-xs text-[#536b83]">
                  <p><span className="font-semibold text-[#243a51]">Seller onboarding:</span> {normalizeText(sourceContext.sellerOnboardingStatus || sourceContext.seller_onboarding_status || mandateDataSnapshot?.sourceContext?.onboardingStatus) || 'Unknown'}</p>
                  <p><span className="font-semibold text-[#243a51]">Generated PDF:</span> {generatedPreviewUrl ? 'Available' : 'Not ready'}</p>
                  <p><span className="font-semibold text-[#243a51]">Signed PDF:</span> {signedPreviewUrl ? 'Stored' : 'Not uploaded yet'}</p>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <article className="rounded-[12px] border border-[#e1e9f2] bg-[#fbfdff] px-3 py-2 text-xs text-[#536b83]">
                  <p className="font-semibold text-[#243a51]">Last Action</p>
                  <p className="mt-1">{lastMandateEvent ? resolveEventMessage(lastMandateEvent) : 'No mandate activity has been captured yet.'}</p>
                  <p className="mt-1 text-[#7187a0]">{lastMandateEvent ? formatDateTime(lastMandateEvent.created_at) : '—'}</p>
                </article>
                <article className="rounded-[12px] border border-[#e1e9f2] bg-[#fbfdff] px-3 py-2 text-xs text-[#536b83]">
                  <p className="font-semibold text-[#243a51]">Next Recommended Action</p>
                  <p className="mt-1">{mandateNextAction}</p>
                </article>
              </div>
            </section>
          ) : null}

          {isFullySignedLifecycle ? (
            <section className="mb-4 rounded-[16px] border border-[#cde8d6] bg-[#eef9f2] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#2e7b4f]">Finalized Legal Record</p>
                  <p className="mt-1 text-sm font-semibold text-[#20563b]">
                    All required signers completed this document.
                  </p>
                  <p className="mt-1 text-xs text-[#2c6b4a]">
                    Editing is permanently disabled. This signed version is immutable and archived.
                  </p>
                </div>
                <div className="rounded-[12px] border border-[#bfe0cb] bg-white px-3 py-2 text-xs text-[#2c6b4a]">
                  <p>Signer completion: {signerProgressMeta.signedRequired}/{signerProgressMeta.totalRequired || 0}</p>
                  <p>Finalized: {formatDateTime(statusState?.packet?.completed_at || latestVersion?.finalised_at)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {signedPreviewUrl ? (
                  <a
                    href={signedPreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full border border-[#bfe0cb] bg-white px-3 py-1 text-xs font-semibold text-[#1f5c3f]"
                  >
                    View Final Signed PDF
                  </a>
                ) : null}
                {signedPreviewUrl ? (
                  <a
                    href={signedPreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full border border-[#bfe0cb] bg-white px-3 py-1 text-xs font-semibold text-[#1f5c3f]"
                  >
                    Download Signed Copy
                  </a>
                ) : null}
              </div>
            </section>
          ) : null}

          <div className={mainGridClassName}>
            <div className={sidePanelClassName}>
              <DocumentOutlinePanel
                sections={editableSections}
                canAddCustomSection={editableAllowed && legalPermissions.canEditDraft}
                customSectionLabel={customSectionLabel}
                onCustomSectionLabelChange={setCustomSectionLabel}
                onAddCustomSection={handleAddCustomSection}
                onRemoveSection={handleRemoveSection}
              />
              <MergeChecklistPanel
                packetType={packetType}
                placeholders={latestVersion?.placeholders_resolved_json || {}}
              />
              {(!isMandatePacket || signingMethod === 'digital') ? (
                <SignerChecklistPanel packetType={packetType} signers={statusState?.signingSummary?.signers} statusState={statusState?.state} />
              ) : null}
            </div>

            <section className="min-h-[640px] rounded-[20px] border border-[#dce6f2] bg-white p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-[#1a2f45]">
                  {editableAllowed ? 'Document Editing + Preview' : 'Document Preview'}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#7a8ea5]">Mode: {effectiveMode}</span>
                  {editableAllowed ? (
                    <div className="inline-flex items-center rounded-full border border-[#dbe5f0] bg-[#f7faff] p-1">
                      <button
                        type="button"
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${centerTab === 'editor' ? 'bg-white text-[#1e3349]' : 'text-[#6f839b]'}`}
                        onClick={() => setCenterTab('editor')}
                      >
                        Editor
                      </button>
                      <button
                        type="button"
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${centerTab === 'preview' ? 'bg-white text-[#1e3349]' : 'text-[#6f839b]'}`}
                        onClick={() => setCenterTab('preview')}
                      >
                        Preview
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {loading ? (
                <div className="flex min-h-[380px] items-center justify-center rounded-[16px] border border-dashed border-[#d8e2ef] bg-[#f9fbff] text-sm text-[#6f839b]">
                  Loading packet preview...
                </div>
              ) : null}

              {!loading && !statusState?.packet?.id ? (
                <div className="flex min-h-[380px] flex-col items-center justify-center rounded-[16px] border border-dashed border-[#d8e2ef] bg-[#f9fbff] px-6 text-center">
                  <FileText size={22} className="text-[#7287a0]" />
                  <p className="mt-3 text-sm font-semibold text-[#1f3349]">Generate the first draft to preview this document.</p>
                  <p className="mt-1 text-sm text-[#6a8098]">Bridge will create a packet draft and load the document lifecycle here.</p>
                </div>
              ) : null}

              {!loading && editableAllowed && centerTab === 'editor' && statusState?.packet?.id ? (
                <>
                  {!editableSections.length ? (
                    <div className="flex min-h-[380px] flex-col items-center justify-center rounded-[16px] border border-dashed border-[#d8e2ef] bg-[#f9fbff] px-6 text-center">
                      <AlertCircle size={22} className="text-[#9b6b1c]" />
                      <p className="mt-3 text-sm font-semibold text-[#1f3349]">No editable draft sections are available yet.</p>
                      <p className="mt-1 text-sm text-[#6a8098]">Generate a draft first, then reopen this workspace to edit clauses.</p>
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
                  )}
                </>
              ) : null}

              {!loading && (!editableAllowed || centerTab === 'preview') && statusState?.packet?.id && !generatedPreviewUrl && !signedPreviewUrl && !editablePreviewHtml ? (
                <div className="flex min-h-[380px] flex-col items-center justify-center rounded-[16px] border border-dashed border-[#d8e2ef] bg-[#f9fbff] px-6 text-center">
                  <AlertCircle size={22} className="text-[#9b6b1c]" />
                  <p className="mt-3 text-sm font-semibold text-[#1f3349]">
                    {latestVersion?.id
                      ? 'Draft exists, but preview is not available yet.'
                      : 'Bridge could not generate this document. Check missing fields or template setup.'}
                  </p>
                  <p className="mt-1 text-sm text-[#6a8098]">Preview and online editing controls will attach to this surface in upcoming phases.</p>
                </div>
              ) : null}

              {!loading && (!editableAllowed || centerTab === 'preview') && (generatedPreviewUrl || signedPreviewUrl || editablePreviewHtml) ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {generatedPreviewUrl ? (
                      <a href={generatedPreviewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full border border-[#d8e3ef] bg-white px-3 py-1 text-xs font-semibold text-[#264b74]">
                        Open Draft Preview
                      </a>
                    ) : null}
                    {signedPreviewUrl ? (
                      <a href={signedPreviewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full border border-[#d8e3ef] bg-white px-3 py-1 text-xs font-semibold text-[#264b74]">
                        Open Signed Copy
                      </a>
                    ) : null}
                    {editablePreviewHtml ? (
                      <span className="inline-flex items-center rounded-full border border-[#d8e3ef] bg-[#f5f9ff] px-3 py-1 text-xs font-semibold text-[#35546c]">
                        Live draft preview
                      </span>
                    ) : null}
                  </div>
                  <iframe
                    title={`${resolveDocumentLabel(packetType)} preview`}
                    src={signedPreviewUrl || generatedPreviewUrl || undefined}
                    srcDoc={!signedPreviewUrl && !generatedPreviewUrl ? editablePreviewHtml : undefined}
                    className="min-h-[560px] w-full rounded-[14px] border border-[#e0e8f3] bg-white"
                  />
                  <div className="rounded-[12px] border border-dashed border-[#dbe5f0] bg-[#f9fbff] px-3 py-2 text-xs text-[#6c8198]">
                    Preview syncs with saved draft content. Final DOCX/PDF rendering remains controlled by packet generation/signing flow.
                  </div>
                </div>
              ) : null}
            </section>

            <aside className={actionAsideClassName}>
              {isMandatePacket ? (
                <SigningMethodPanel
                  method={signingMethod}
                  canChange={canChangeSigningMethod}
                  lockedReason={signingMethodLockedReason}
                  onSelect={handleSelectSigningMethod}
                  busy={actionBusy || loading}
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

              {(!isMandatePacket || signingMethod === 'digital') ? (
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
                  onResend={() => runReviewAction('resend_signature')}
                  onRefresh={handleRefreshSignerStatus}
                  busy={actionBusy || signerBusy || loading}
                />
              ) : null}

              <section className="rounded-[14px] border border-[#dce6f2] bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-[#1a2f45]">Version History</h4>
                  <span className="rounded-full border border-[#e1e9f2] bg-[#f8fbff] px-2 py-0.5 text-[0.65rem] font-semibold text-[#6c8198]">
                    {Array.isArray(statusState?.versions) ? statusState.versions.length : 0}
                  </span>
                </div>
                <div className="mt-2 max-h-[132px] space-y-1.5 overflow-y-auto pr-1">
                  {Array.isArray(statusState?.versions) && statusState.versions.length ? (
                    statusState.versions.map((version) => (
                      <article key={version.id} className="rounded-[9px] border border-[#e4ebf4] bg-[#fbfdff] px-2.5 py-1.5 text-xs">
                        <p className="font-semibold text-[#20344b]">Draft v{version.version_number || '—'}</p>
                        <p className="mt-0.5 text-[#60758d]">
                          {(normalizeText(version?.validation_summary_json?.review_state) || normalizeText(version.render_status) || 'draft').replace(/_/g, ' ')}
                          {normalizeText(version?.generated_by) ? ` • ${normalizeText(version.generated_by).slice(0, 8)}…` : ''}
                        </p>
                        <p className="mt-0.5 text-[#7388a1]">{formatDateTime(version.updated_at || version.created_at)}</p>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-[10px] border border-dashed border-[#dbe5f0] bg-[#f9fbff] px-3 py-2 text-xs text-[#6c8198]">
                      No versions yet.
                    </p>
                  )}
                </div>
                <div className="mt-2 border-t border-[#e4ebf4] pt-2">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7187a0]">Lifecycle Events</p>
                  <div className="mt-2 max-h-[116px] space-y-1.5 overflow-y-auto pr-1">
                    {eventHistory.length ? (
                      eventHistory.map((event) => (
                        <article key={`vh-${event.id}`} className="rounded-[9px] border border-[#e4ebf4] bg-[#fbfdff] px-2.5 py-1.5 text-xs">
                          <p className="font-semibold text-[#20344b]">{resolveEventMessage(event)}</p>
                          <p className="mt-0.5 text-[#60758d]">{resolveEventActor(event)}</p>
                          <p className="mt-0.5 text-[#7388a1]">{formatDateTime(event?.created_at)}</p>
                        </article>
                      ))
                    ) : (
                      <p className="rounded-[10px] border border-dashed border-[#dbe5f0] bg-[#f9fbff] px-3 py-2 text-xs text-[#6c8198]">
                        No lifecycle events captured yet.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-[14px] border border-[#dce6f2] bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-[#1a2f45]">Audit Events</h4>
                  <span className="rounded-full border border-[#e1e9f2] bg-[#f8fbff] px-2 py-0.5 text-[0.65rem] font-semibold text-[#6c8198]">
                    {eventHistory.length}
                  </span>
                </div>
                <div className="mt-2 max-h-[148px] space-y-1.5 overflow-y-auto pr-1">
                  {eventHistory.length ? (
                    eventHistory.map((event) => (
                      <article key={event.id} className="rounded-[9px] border border-[#e4ebf4] bg-[#fbfdff] px-2.5 py-1.5 text-xs">
                        <p className="font-semibold text-[#20344b]">{resolveEventMessage(event)}</p>
                        <p className="mt-0.5 text-[#60758d]">{resolveEventActor(event)}</p>
                        <p className="mt-0.5 text-[#7388a1]">{formatDateTime(event?.created_at)}</p>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-[10px] border border-dashed border-[#dbe5f0] bg-[#f9fbff] px-3 py-2 text-xs text-[#6c8198]">
                      No audit events recorded yet.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4">
                <h4 className="text-sm font-semibold text-[#1a2f45]">Template</h4>
                <div className="mt-3 space-y-1 text-xs text-[#5f748c]">
                  <p>Template: {normalizeText(templateDetail?.template_label || statusState?.packet?.template_label_snapshot) || 'Not linked'}</p>
                  <p>Key: {normalizeText(templateDetail?.template_key || statusState?.packet?.template_key_snapshot) || '—'}</p>
                  <p>Storage path: {normalizeText(templateDetail?.template_storage_path) || 'Missing'}</p>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
