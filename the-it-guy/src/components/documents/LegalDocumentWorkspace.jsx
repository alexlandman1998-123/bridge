import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, FileText, ShieldCheck, UsersRound, X } from 'lucide-react'
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
} from '../../lib/documentPacketsApi'
import {
  generateFinalSignedPacketDocument,
  generateSigningLinks,
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

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
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
  if (code === 'SIGNERS_INCOMPLETE' || code === 'FIELDS_INCOMPLETE') {
    return 'Required signatures are still incomplete. Wait for all required signers to finish.'
  }
  if (message.includes('cors') || message.includes('network') || message.includes('failed to fetch')) {
    return 'Network or signing service connection failed. Please retry.'
  }
  if (message.includes('invalid input syntax for type uuid')) {
    return 'A related record reference is invalid. Refresh this workspace and retry.'
  }
  return raw || fallback
}

function resolveLegalPermissions(appRole = 'viewer') {
  const role = normalizeAppRole(appRole)
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

function extractUsedMergeTokens(content = '') {
  const text = String(content || '')
  const found = new Set()
  let match
  while ((match = MERGE_TOKEN_REGEX.exec(text)) !== null) {
    const key = normalizeText(match[1])
    if (key) found.add(key)
  }
  MERGE_TOKEN_REGEX.lastIndex = 0
  return Array.from(found)
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
  const shouldInsertMandateIntro =
    normalizeKey(packetType) === 'mandate' &&
    !sourceRows.some((section) => normalizeKey(section?.key) === 'introduction_purpose') &&
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

  return sourceRows.map((section, index) => {
    const key = normalizeText(section?.key || `section_${index + 1}`)
    const snapshot = snapshotByKey.get(key)
    const tokenRows = normalizePlaceholderTokens(snapshot?.tokens || extractTemplateTokens(section)).map((token) => ({
      ...token,
      required: token.required || Boolean(section?.required),
    }))
    const content = normalizeText(snapshot?.content) || normalizeText(section?.content) || buildDefaultSectionContent(section, placeholders)
    return {
      key,
      label: normalizeText(section?.label || snapshot?.label || `Section ${index + 1}`),
      required: Boolean(section?.required || snapshot?.required),
      content,
      tokens: tokenRows,
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
  const agencyLogo = normalizeText(branding?.organisationLogoUrl)
  const bridgeLogo = normalizeText(branding?.bridgeLogoLightUrl) || BRIDGE_LOGO_LIGHT_URL
  const bridgeLabel = normalizeText(branding?.bridgeLogoLabel) || 'Powered by Bridge 9'
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
          .agency-brand, .bridge-brand { display: inline-flex; align-items: center; min-width: 0; color: #333; font-size: 12px; font-weight: 700; }
          .agency-brand img { max-width: 34mm; max-height: 13mm; object-fit: contain; }
          .bridge-brand { flex-direction: column; align-items: flex-end; gap: 3px; color: #68727d; font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; }
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
            <span class="bridge-brand">${bridgeLogo ? `<img src="${escapeHtml(bridgeLogo)}" alt="Bridge 9" />` : ''}<span>${escapeHtml(bridgeLabel)}</span></span>
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
            <span class="footer-bridge">${bridgeLogo ? `<img src="${escapeHtml(bridgeLogo)}" alt="Bridge 9" />` : escapeHtml(bridgeLabel)}</span>
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
  if (normalized === 'in_review') return 'border-[#ddd9f6] bg-[#f4f1ff] text-[#5a43a8]'
  if (normalized === 'approved') return 'border-[#dbe8fa] bg-[#edf4ff] text-[#215fba]'
  if (normalized === 'draft') return 'border-[#f0e2c2] bg-[#fff9ed] text-[#8a5b12]'
  if (normalized === 'no_packet') return 'border-[#e5e9f0] bg-[#f7f9fc] text-[#5e7289]'
  return 'border-[#f2d7d2] bg-[#fff4f2] text-[#a03a2a]'
}

function resolveWorkspaceStatusLabel(state) {
  const normalized = normalizeKey(state)
  if (normalized === 'no_packet') return 'No Draft'
  if (normalized === 'draft') return 'Draft'
  if (normalized === 'in_review') return 'In Review'
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
    organisationLogoUrl:
      normalizeText(merged.logoLightUrl) ||
      normalizeText(merged.organisationLogoUrl) ||
      normalizeText(merged.organisation_logo_url) ||
      normalizeText(merged.logo_url),
    organisationLogoDarkUrl:
      normalizeText(merged.logoDarkUrl) ||
      normalizeText(merged.organisationLogoDarkUrl) ||
      normalizeText(merged.organisation_logo_dark_url),
    bridgeLegalName: normalizeText(merged.bridgeLegalName) || normalizeText(merged.bridge_legal_name) || 'Bridge Legal',
    bridgeLogoLabel: normalizeText(merged.bridgeLogoLabel) || 'Powered by Bridge 9',
    bridgeLogoLightUrl: normalizeText(merged.bridgeLogoLightUrl) || normalizeText(merged.bridge_legal_logo_light_url) || BRIDGE_LOGO_LIGHT_URL,
    bridgeLogoDarkUrl: normalizeText(merged.bridgeLogoDarkUrl) || normalizeText(merged.bridge_legal_logo_dark_url) || BRIDGE_LOGO_DARK_URL,
    transactionReference: normalizeText(transactionReference),
  }
}

function resolvePrimaryActionLabel(mode, statusState, packetType) {
  const typeLabel = normalizeKey(packetType) === 'otp' ? 'OTP' : 'Mandate'
  const modeKey = normalizeKey(mode)
  if (modeKey === 'generate') return 'Generate Draft'
  if (modeKey === 'edit') return 'Save Draft'
  if (modeKey === 'send') return 'Send for Signature'
  if (modeKey === 'signed') return 'View Signed PDF'
  if (modeKey === 'view') {
    if (normalizeKey(statusState) === 'signed') return 'View Signed PDF'
    return `View ${typeLabel}`
  }
  if (normalizeKey(statusState) === 'in_review') return 'Save Draft'
  if (normalizeKey(statusState) === 'approved') return 'Send for Signature'
  if (normalizeKey(statusState) === 'draft') return 'Save Draft'
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

const NORMALIZED_LIFECYCLE_STEPS = ['draft', 'in_review', 'approved', 'locked', 'sent', 'partially_signed', 'signed', 'archived']

function normalizeLifecycleState(rawState = '') {
  const state = normalizeKey(rawState)
  if (state === 'no_packet' || !state) return 'draft'
  if (state === 'voided') return 'archived'
  return NORMALIZED_LIFECYCLE_STEPS.includes(state) ? state : 'draft'
}

function resolveLifecycleCopy(state = 'draft') {
  const key = normalizeLifecycleState(state)
  const map = {
    draft: {
      current: 'Document is still editable.',
      next: 'Next step: submit this draft for legal review.',
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
  return map[key] || map.draft
}

function resolveLifecycleProgress(state = 'draft') {
  const key = normalizeLifecycleState(state)
  const index = NORMALIZED_LIFECYCLE_STEPS.indexOf(key)
  if (index < 0) return 0
  return Math.round(((index + 1) / NORMALIZED_LIFECYCLE_STEPS.length) * 100)
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
    signing_fields_prepared: 'Prepared signer fields',
    packet_regenerated: 'Regenerated draft',
    packet_archived: 'Archived packet',
    final_signed_generated: 'Final signed generated',
  }
  return labels[key] || normalizeText(eventType).replace(/_/g, ' ')
}

function DocumentOutlinePanel({ sections = [] }) {
  const fallbackSections = ['Parties', 'Property Details', 'Purchase Terms', 'Suspensive Conditions', 'Special Conditions', 'Signatures']
  const outlineSections = Array.isArray(sections) && sections.length
    ? sections.map((item) => normalizeText(item?.label || item?.key)).filter(Boolean)
    : fallbackSections
  return (
    <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4">
      <h4 className="text-sm font-semibold text-[#1a2f45]">Document Outline</h4>
      <ul className="mt-3 space-y-2 text-sm text-[#4f657d]">
        {outlineSections.map((item) => (
          <li key={item} className="flex items-center gap-2 rounded-[10px] bg-[#f8fbff] px-3 py-2">
            <FileText size={14} className="text-[#6f86a0]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function AgencyBrandMark({ branding }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-[#dbe5f0] bg-[#f8fbff]">
        {branding.organisationLogoUrl ? (
          <img
            src={branding.organisationLogoUrl}
            alt={`${branding.organisationName} logo`}
            className="max-h-8 max-w-9 object-contain"
          />
        ) : (
          <span className="text-sm font-semibold text-[#35546c]">{branding.organisationInitials}</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[#152437]">{branding.organisationName}</p>
        <p className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7187a0]">Agency Legal Workspace</p>
      </div>
    </div>
  )
}

function BridgeLegalBrand({ branding }) {
  return (
    <div className="hidden min-w-0 items-center gap-3 rounded-[14px] border border-[#dfe8f2] bg-[#fbfdff] px-3 py-2 md:flex">
      <div className="min-w-0 text-right">
        <p className="text-xs font-semibold text-[#1a2f45]">{branding.bridgeLegalName}</p>
        <p className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ea4]">{branding.bridgeLogoLabel}</p>
      </div>
      <img
        src={branding.bridgeLogoLightUrl}
        alt="Bridge 9"
        className="h-7 w-auto max-w-[132px] object-contain"
      />
    </div>
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
    <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-[#1a2f45]">Merge Field Checklist</h4>
          <p className="mt-1 text-xs text-[#7187a0]">Canonical values resolved from onboarding, transaction, and packet context.</p>
        </div>
        <span className="shrink-0 rounded-full border border-[#dbe6f2] bg-[#f7fafd] px-2 py-1 text-[0.65rem] font-semibold text-[#60758d]">
          {rows.filter((row) => row.value).length}/{rows.length}
        </span>
      </div>
      <div className="mt-3 space-y-2">
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
}) {
  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const validation = validationByKey?.[section.key] || { blockers: [], warnings: [] }
        const tokenRows = Array.isArray(section.tokens) ? section.tokens : []
        return (
          <article key={section.key} className="rounded-[16px] border border-[#dce6f2] bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-[#1a2f45]">{section.label}</h4>
              <div className="flex items-center gap-1.5">
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
                    Valid
                  </span>
                )}
              </div>
            </div>

            <textarea
              value={section.content}
              onChange={(event) => onChangeSection?.(section.key, event.target.value)}
              rows={Math.max(6, Math.min(14, String(section.content || '').split('\n').length + 2))}
              className="w-full resize-y rounded-[12px] border border-[#d8e2ef] bg-[#fbfdff] px-3 py-2 text-sm leading-6 text-[#142132] outline-none transition focus:border-[#84a8cc] focus:ring-2 focus:ring-[#84a8cc]/20"
              placeholder="Capture legal clause wording for this section..."
            />

            {tokenRows.length ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7187a0]">Merge Fields</p>
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
                <p className="text-xs text-[#768ba3]">Click a token to insert it into this clause.</p>
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
          </article>
        )
      })}
    </div>
  )
}

function SignerPreparationPanel({
  packetType = 'mandate',
  lifecycleState = 'draft',
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
  const canSend = canManageSigners && ['approved', 'locked'].includes(normalizeLifecycleState(lifecycleState))
  const canResend = canManageSigners && ['sent', 'partially_signed'].includes(normalizeLifecycleState(lifecycleState))

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
  const [draftReviewState, setDraftReviewState] = useState('draft')
  const [centerTab, setCenterTab] = useState('preview')
  const autoFinalizeGuardRef = useRef(new Set())

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
      const usedTokens = extractUsedMergeTokens(content)
      const tokenRows = Array.isArray(section?.tokens) ? section.tokens : []

      if (section?.required && normalizeText(content).length < 8) {
        blockers.push('Required clause is empty.')
      }
      if (detectMalformedMergeTokens(content)) {
        blockers.push('Malformed merge token syntax detected. Use {{token_name}} format.')
      }
      for (const token of tokenRows.filter((item) => item.required)) {
        if (!usedTokens.includes(token.token)) {
          blockers.push(`Missing required merge field {{${token.token}}}.`)
        }
      }
      for (const token of tokenRows.filter((item) => !item.required)) {
        if (!usedTokens.includes(token.token)) {
          warnings.push(`Optional merge field {{${token.token}}} is not referenced in this clause.`)
        }
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

  const validationRows = useMemo(() => {
    const warnings = Array.isArray(statusState?.warnings) ? statusState.warnings : []
    const rows = []
    if (!statusState?.packet?.id) rows.push({ key: 'packet', label: 'No packet found yet', tone: 'warning' })
    if (!statusState?.packet?.template_id) rows.push({ key: 'template', label: 'Template not linked to packet', tone: 'warning' })
    if (statusState?.packet?.id && !latestVersion?.id) rows.push({ key: 'version', label: 'No generated version yet', tone: 'warning' })
    if (latestVersion?.id && !generatedPreviewUrl && !signedPreviewUrl) rows.push({ key: 'storage', label: 'Document preview URL is unavailable', tone: 'warning' })
    warnings.forEach((warning, index) => {
      rows.push({ key: `warning-${index}`, label: warning, tone: 'error' })
    })
    draftValidationSummary.blockers.forEach((warning, index) => {
      rows.push({ key: `draft-blocker-${index}`, label: warning, tone: 'error' })
    })
    draftValidationSummary.warnings.forEach((warning, index) => {
      rows.push({ key: `draft-warning-${index}`, label: warning, tone: 'warning' })
    })
    signerValidation.blockers.forEach((warning, index) => {
      rows.push({ key: `signer-blocker-${index}`, label: warning, tone: 'error' })
    })
    signerValidation.warnings.forEach((warning, index) => {
      rows.push({ key: `signer-warning-${index}`, label: warning, tone: 'warning' })
    })
    if (!rows.length) rows.push({ key: 'ok', label: 'No blocking validation issues detected.', tone: 'ok' })
    return rows
  }, [
    draftValidationSummary.blockers,
    draftValidationSummary.warnings,
    generatedPreviewUrl,
    latestVersion?.id,
    signedPreviewUrl,
    statusState?.packet?.id,
    statusState?.packet?.template_id,
    statusState?.warnings,
    signerValidation.blockers,
    signerValidation.warnings,
  ])

  const eventHistory = useMemo(() => {
    const rows = Array.isArray(packetDetail?.events) ? packetDetail.events : []
    return rows.slice(0, 8)
  }, [packetDetail?.events])

  const headerStatusLabel = resolveWorkspaceStatusLabel(statusState?.state || 'NO_PACKET')
  const lifecycleCopy = resolveLifecycleCopy(normalizedLifecycleState)
  const lifecycleProgress = resolveLifecycleProgress(normalizedLifecycleState)
  const primaryLabel = useMemo(() => {
    if (normalizedLifecycleState === 'approved') return 'Lock Document'
    if (normalizedLifecycleState === 'locked') return 'Send for Signature'
    return resolvePrimaryActionLabel(effectiveMode, statusState?.state, packetType)
  }, [effectiveMode, normalizedLifecycleState, packetType, statusState?.state])

  const assertWorkspacePermission = useCallback((permissionKey, actionLabel) => {
    if (legalPermissions?.[permissionKey]) return
    throw new Error(`Your role cannot ${actionLabel} in this legal workspace.`)
  }, [legalPermissions])

  const refreshWorkspaceData = useCallback(async () => {
    const resolved = await resolveDocumentPacketStatus({
      packetType,
      packetId,
      transactionId,
      organisationId,
    })
    setStatusState(resolved)

    const resolvedPacketId = normalizeText(resolved?.packet?.id || packetId)
    if (resolvedPacketId) {
      try {
        const detail = await fetchDocumentPacket(resolvedPacketId, { includeVersions: true, includeEvents: true })
        setPacketDetail(detail || null)
        return {
          resolved,
          detail: detail || null,
        }
      } catch {
        setPacketDetail(null)
        return {
          resolved,
          detail: null,
        }
      }
    } else {
      setPacketDetail(null)
      return {
        resolved,
        detail: null,
      }
    }
  }, [organisationId, packetId, packetType, transactionId])

  useEffect(() => {
    let active = true
    if (!open) return () => { active = false }

    const load = async () => {
      setLoading(true)
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
  }, [open, refreshWorkspaceData])

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
        await updateDocumentPacket(resolvedPacketId, {
          status: 'completed',
          expectedUpdatedAt: statusState?.packet?.updated_at || null,
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
    const resolvedPacketId = normalizeText(statusState?.packet?.id || packetId)
    if (!resolvedPacketId) throw new Error('Generate a packet first before assigning signers.')
    if (!latestVersion?.id) throw new Error('Generate a packet version before assigning signers.')

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

    await createDocumentPacketSigners({
      packetId: resolvedPacketId,
      packetVersionId: latestVersion.id,
      packetDocumentId: latestVersion?.rendered_document_id || null,
      signers: payload,
      organisationId: statusState?.packet?.organisation_id || organisationId || null,
      markSigningPrep: true,
    })
    return payload.length
  }

  async function handlePrepareSignerFields() {
    assertWorkspacePermission('canManageSigners', 'prepare signer fields')
    const resolvedPacketId = normalizeText(statusState?.packet?.id || packetId)
    if (!resolvedPacketId) {
      setLoadError('Generate a document packet before preparing signer fields.')
      return
    }
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
    let workingStatus = statusState
    if (!statusState?.signingSummary?.signerCount || !statusState?.signingSummary?.fieldCount) {
      await prepareSigningFields({
        packetId: normalizeText(statusState?.packet?.id || packetId),
        packetType,
        organisationId: statusState?.packet?.organisation_id || organisationId || null,
        placeholders: latestVersion?.placeholders_resolved_json || {},
        context: statusState?.packet?.source_context_json || {},
      })
      const refreshed = await refreshWorkspaceData()
      workingStatus = refreshed?.resolved || statusState
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

    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://app.bridgenine.co.za'
    const linkResult = await generateSigningLinks({
      packetId: resolvedPacketId,
      packetVersionId: versionId,
      expiresInHours: 168,
      baseUrl: origin,
      organisationId: statusState?.packet?.organisation_id || organisationId || null,
      regenerate: Boolean(isResend),
    })

    if (isResend) {
      await appendDocumentPacketEvent({
        packetId: resolvedPacketId,
        organisationId: statusState?.packet?.organisation_id || organisationId || null,
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
      await updateDocumentPacket(resolvedPacketId, {
        status: 'completed',
        expectedUpdatedAt: statusState?.packet?.updated_at || null,
        completedAt: nowIso,
        sourceContextJson: {
          ...(statusState?.packet?.source_context_json || {}),
          lifecycle_state: 'signed',
          finalizedAt: nowIso,
          finalSignedVersionId: versionId,
          finalArtifactPath: normalizeText(result?.finalArtifact?.path || latestVersion?.final_signed_file_path || ''),
        },
      })
      await onRefreshContext?.()
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

    await updateDocumentPacket(resolvedPacketId, {
      status: 'draft',
      expectedUpdatedAt: statusState?.packet?.updated_at || null,
      sourceContextJson: {
        ...(statusState?.packet?.source_context_json || {}),
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
      draft: ['in_review'],
      in_review: ['draft', 'approved'],
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

  function getApprovalAndSendBlockers({ requireSendState = false } = {}) {
    const blockers = []
    if (!statusState?.packet?.id) blockers.push('Packet record is missing.')
    if (!latestVersion?.id) blockers.push('Generate a packet version before this action.')
    if (!statusState?.packet?.template_id) blockers.push('Template reference is missing.')
    if (!draftValidationSummary.isValid) blockers.push('Resolve merge field blockers before continuing.')
    if (requireSendState && !['approved', 'locked'].includes(normalizedLifecycleState)) {
      blockers.push('Document must be approved or locked before sending.')
    }
    if (requireSendState && signerValidation.blockers.length) {
      blockers.push(signerValidation.blockers[0])
    }
    return blockers
  }

  async function transitionLifecycleState(nextState, { requireApprovalValidation = false } = {}) {
    const target = normalizeLifecycleState(nextState)
    const packet = statusState?.packet
    if (!packet?.id) throw new Error('Document packet is required before lifecycle transitions.')
    assertLifecycleTransitionAllowed(target)

    if (requireApprovalValidation) {
      const blockers = getApprovalAndSendBlockers({ requireSendState: false })
      if (blockers.length) {
        throw new Error(`Cannot continue: ${blockers[0]}`)
      }
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

    const updatedPacket = await updateDocumentPacket(packet.id, {
      status: nextPacketStatus,
      expectedUpdatedAt: packet?.updated_at || null,
      sentAt: target === 'sent' ? nowIso : packet.sent_at,
      sourceContextJson: nextSourceContext,
    })

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

  async function handleSendForSignatureFromWorkspace({ resend = false } = {}) {
    const blockers = getApprovalAndSendBlockers({ requireSendState: !resend })
    if (blockers.length) {
      throw new Error(`Cannot send: ${blockers[0]}`)
    }
    if (resend && !['sent', 'partially_signed'].includes(normalizedLifecycleState)) {
      throw new Error('Resend is only available after the document has been sent for signature.')
    }

    setActionProgressMessage(resend ? 'Refreshing secure signer links…' : 'Preparing signer links…')
    const { linkResult } = await ensureSignerReadinessBeforeSend({ isResend: resend })

    setActionProgressMessage(resend ? 'Sending resend notifications…' : 'Sending signer notifications…')
    await onSend?.({
      resend,
      signerLinks: Array.isArray(linkResult?.signers) ? linkResult.signers : [],
      packetId: normalizeText(statusState?.packet?.id || packetId),
    })

    const refreshed = await resolveDocumentPacketStatus({
      packetType,
      packetId: statusState?.packet?.id || packetId,
      transactionId,
      organisationId,
    })
    const current = normalizeLifecycleState(refreshed?.state)
    if (!resend && current !== 'sent' && current !== 'partially_signed' && current !== 'signed') {
      await transitionLifecycleState('sent')
    }
  }

  async function runPrimaryAction() {
    const action = resolveDocumentPacketActionState({
      packetType,
      state: statusState?.state || 'NO_PACKET',
      isBusy: actionBusy,
    })
    if (actionBusy) return
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
        await onGenerate?.({
          onProgress: (message) => setActionProgressMessage(normalizeText(message)),
        })
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
      await onRefreshContext?.()
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
      setLoadError(toFriendlyWorkspaceError(error, 'Action failed. Please retry.'))
    } finally {
      setActionProgressMessage('')
      setActionBusy(false)
    }
  }

  async function runReviewAction(actionKey) {
    if (actionBusy) return
    setActionBusy(true)
    setLoadError('')
    setActionFeedback('')
    try {
      if (actionKey === 'submit_review') {
        assertWorkspacePermission('canApprove', 'submit drafts for review')
        await transitionLifecycleState('in_review')
        setActionFeedback('Draft submitted for legal review.')
      } else if (actionKey === 'return_draft') {
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
        const link = signedPreviewUrl || generatedPreviewUrl
        if (!link) throw new Error('Preview file is not available for download yet.')
        window.open(link, '_blank', 'noopener,noreferrer')
      } else if (actionKey === 'view_draft') {
        await onView?.()
      }

      await onRefreshContext?.()
      await refreshWorkspaceData()
    } catch (error) {
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to complete this action right now.'))
    } finally {
      setActionBusy(false)
    }
  }

  async function handleSaveSignerDetails() {
    if (signerBusy) return
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
      setSignerBusy(false)
    }
  }

  async function handleRefreshSignerStatus() {
    if (signerBusy) return
    setSignerBusy(true)
    setLoadError('')
    try {
      await refreshWorkspaceData()
      setActionFeedback('Signer status refreshed.')
    } catch (error) {
      setLoadError(toFriendlyWorkspaceError(error, 'Unable to refresh signer status right now.'))
    } finally {
      setSignerBusy(false)
    }
  }

  const lifecycleActions = (() => {
    const state = normalizedLifecycleState
    const canUseAction = (actionKey) => {
      const key = normalizeKey(actionKey)
      if (['save_draft', 'open_document'].includes(key)) return legalPermissions.canEditDraft
      if (['submit_review', 'return_draft', 'approve_draft'].includes(key)) return legalPermissions.canApprove
      if (key === 'lock_document') return legalPermissions.canLock
      if (key === 'send_signature') return legalPermissions.canSend
      if (key === 'resend_signature') return legalPermissions.canResend
      if (key === 'finalize_signed') return legalPermissions.canFinalize
      return legalPermissions.canView
    }
    const filtered = (rows) => rows.filter((row) => canUseAction(row.key))
    if (state === 'draft') {
      return filtered([
        { key: 'save_draft', label: 'Save Draft', kind: 'primary', run: () => runPrimaryAction() },
        { key: 'submit_review', label: 'Submit for Review', kind: 'secondary', run: () => runReviewAction('submit_review') },
      ])
    }
    if (state === 'in_review') {
      return filtered([
        { key: 'return_draft', label: 'Return to Draft', kind: 'secondary', run: () => runReviewAction('return_draft') },
        { key: 'approve_draft', label: 'Approve Draft', kind: 'primary', run: () => runReviewAction('approve_draft') },
      ])
    }
    if (state === 'approved') {
      return filtered([
        { key: 'lock_document', label: 'Lock Document', kind: 'primary', run: () => runReviewAction('lock_document') },
        { key: 'send_signature', label: 'Send for Signature', kind: 'secondary', run: () => runReviewAction('send_signature') },
      ])
    }
    if (state === 'locked') {
      return filtered([
        { key: 'send_signature', label: 'Send for Signature', kind: 'primary', run: () => runReviewAction('send_signature') },
        { key: 'view_draft', label: 'View Preview', kind: 'secondary', run: () => runReviewAction('view_draft') },
        { key: 'download_preview', label: 'Download PDF', kind: 'secondary', run: () => runReviewAction('download_preview') },
      ])
    }
    if (state === 'sent' || state === 'partially_signed') {
      const rows = [
        { key: 'view_signing_status', label: 'View Signing Status', kind: 'primary', run: () => runReviewAction('view_signing_status') },
        { key: 'resend_signature', label: 'Resend Signing Links', kind: 'secondary', run: () => runReviewAction('resend_signature') },
        { key: 'view_draft', label: 'View Draft', kind: 'secondary', run: () => runReviewAction('view_draft') },
      ]
      if (canFinalizeSignedRecord && !hasFinalArtifact) {
        rows.unshift({
          key: 'finalize_signed',
          label: 'Finalize Signed Record',
          kind: 'primary',
          run: () => runReviewAction('finalize_signed'),
        })
      }
      return filtered(rows)
    }
    if (state === 'signed') {
      const rows = [
        { key: 'view_signed', label: 'View Signed PDF', kind: 'primary', run: () => onViewSigned?.() },
        { key: 'download_signed', label: 'Download Signed Copy', kind: 'secondary', run: () => runReviewAction('download_signed') },
        { key: 'view_signing_history', label: 'View Signing History', kind: 'secondary', run: () => runReviewAction('view_signing_history') },
      ]
      if (!hasFinalArtifact && canFinalizeSignedRecord) {
        rows.unshift({
          key: 'finalize_signed',
          label: 'Finalize Signed Record',
          kind: 'primary',
          run: () => runReviewAction('finalize_signed'),
        })
      }
      return filtered(rows)
    }
    return filtered([
      { key: 'open_document', label: primaryLabel, kind: 'primary', run: () => runPrimaryAction() },
    ])
  })()

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
    ? 'grid min-h-full gap-4 lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_360px]'
    : 'grid min-h-full gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]'
  const sidePanelClassName = isPageMode
    ? 'space-y-4 lg:order-none'
    : 'space-y-4'
  const actionAsideClassName = isPageMode
    ? 'space-y-4 lg:col-span-2 2xl:col-span-1'
    : 'space-y-4'

  return (
    <div className={rootClassName}>
      <div className={shellClassName}>
        <header className="border-b border-[#d7e1ed] bg-white px-4 py-3 sm:px-6">
          <div className="grid gap-4 xl:grid-cols-[minmax(220px,0.72fr)_minmax(280px,1.25fr)_minmax(260px,0.9fr)] xl:items-center">
            <div className="space-y-3">
              {isPageMode ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-[#d7e1ed] bg-white px-3 py-1 text-xs font-semibold text-[#51677f] transition hover:bg-[#f7faff]"
                  onClick={onBack || onClose}
                >
                  <ArrowLeft size={14} />
                  {backLabel}
                </button>
              ) : null}
              <AgencyBrandMark branding={workspaceBranding} />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#60778f]">Legal Document Workspace</p>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold ${resolveWorkspaceStatusTone(statusState?.state || 'unknown')}`}>
                  {headerStatusLabel}
                </span>
              </div>
              <h2 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.02em] text-[#142132]">
                {resolveDocumentLabel(packetType)}
              </h2>
              <p className="mt-1 text-sm text-[#5f748c]">
                {transactionReference || 'Transaction reference unavailable'}
                {normalizeText(transactionId) ? ` · ${String(transactionId).slice(0, 8).toUpperCase()}` : ''}
              </p>
              <p className="mt-1 text-xs text-[#7388a1]">
                Last updated: {formatDateTime(statusState?.packet?.updated_at || statusState?.packet?.sent_at || statusState?.packet?.completed_at)}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
              <BridgeLegalBrand branding={workspaceBranding} />
              <Button
                type="button"
                size="sm"
                onClick={() => void runPrimaryAction()}
                disabled={loading || actionBusy}
              >
                {actionBusy ? 'Working…' : primaryLabel}
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{loadError}</span>
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
            <div className="mt-3 grid grid-cols-4 gap-1 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-[#7388a1] sm:grid-cols-8">
              {NORMALIZED_LIFECYCLE_STEPS.map((step) => (
                <span
                  key={step}
                  className={`rounded-full border px-1.5 py-0.5 text-center ${
                    NORMALIZED_LIFECYCLE_STEPS.indexOf(step) <= NORMALIZED_LIFECYCLE_STEPS.indexOf(normalizedLifecycleState)
                      ? 'border-[#d4e2ee] bg-[#f3f8fd] text-[#35546c]'
                      : 'border-[#e6edf5] bg-[#fafcff] text-[#8aa0b8]'
                  }`}
                >
                  {step.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </section>

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
              <DocumentOutlinePanel sections={editableSections} />
              <MergeChecklistPanel
                packetType={packetType}
                placeholders={latestVersion?.placeholders_resolved_json || {}}
              />
              <SignerChecklistPanel packetType={packetType} signers={statusState?.signingSummary?.signers} statusState={statusState?.state} />
            </div>

            <section className="rounded-[20px] border border-[#dce6f2] bg-white p-4 sm:p-5">
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
                    className="min-h-[520px] w-full rounded-[14px] border border-[#e0e8f3] bg-white"
                  />
                  <div className="rounded-[12px] border border-dashed border-[#dbe5f0] bg-[#f9fbff] px-3 py-2 text-xs text-[#6c8198]">
                    Preview syncs with saved draft content. Final DOCX/PDF rendering remains controlled by packet generation/signing flow.
                  </div>
                </div>
              ) : null}
            </section>

            <aside className={actionAsideClassName}>
              <SignerPreparationPanel
                packetType={packetType}
                lifecycleState={normalizedLifecycleState}
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

              <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4">
                <h4 className="text-sm font-semibold text-[#1a2f45]">Document Actions</h4>
                {lifecycleActions.length ? (
                  <div className="mt-3 grid gap-2">
                    {lifecycleActions.map((actionItem) => (
                      <Button
                        key={actionItem.key}
                        type="button"
                        size="sm"
                        variant={actionItem.kind === 'primary' ? 'primary' : 'secondary'}
                        onClick={() => void actionItem.run?.()}
                        disabled={loading || actionBusy}
                      >
                        {actionBusy ? 'Working…' : actionItem.label}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-[10px] border border-[#dfe6ef] bg-[#f5f8fb] px-3 py-2 text-xs text-[#60758d]">
                    No mutation actions are available for your role in this legal workspace state.
                  </p>
                )}
              </section>

              {['approved', 'locked'].includes(normalizedLifecycleState) ? (
                <section className="rounded-[18px] border border-[#dbe8fa] bg-[#edf4ff] p-4">
                  <h4 className="text-sm font-semibold text-[#1f4f93]">Ready for Signature</h4>
                  <p className="mt-2 text-xs text-[#315f9b]">
                    Editing controls are now restricted. Confirm signer readiness, then send this document for signature.
                  </p>
                  <div className="mt-3 rounded-[10px] border border-[#d1e2f8] bg-white px-3 py-2 text-xs text-[#2d527f]">
                    Signers configured: {Number(statusState?.signingSummary?.signerCount || 0)} • Required signatures: {Number(statusState?.signingSummary?.requiredSignatures || 0)}
                  </div>
                </section>
              ) : null}

              <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4">
                <h4 className="text-sm font-semibold text-[#1a2f45]">Validation</h4>
                <div className="mt-3 space-y-2">
                  {validationRows.map((item) => {
                    const tone =
                      item.tone === 'ok'
                        ? 'border-[#cde8d6] bg-[#eef9f2] text-[#2e7b4f]'
                        : item.tone === 'error'
                          ? 'border-[#f2d7d2] bg-[#fff4f2] text-[#a03a2a]'
                          : 'border-[#f3e0b9] bg-[#fff8ea] text-[#8a5b12]'
                    const Icon = item.tone === 'ok' ? CheckCircle2 : item.tone === 'error' ? AlertCircle : Clock3
                    return (
                      <article key={item.key} className={`rounded-[10px] border px-3 py-2 text-xs ${tone}`}>
                        <p className="flex items-center gap-2"><Icon size={14} /> {item.label}</p>
                      </article>
                    )
                  })}
                </div>
              </section>

              <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4">
                <h4 className="text-sm font-semibold text-[#1a2f45]">Version History</h4>
                <div className="mt-3 space-y-2">
                  {Array.isArray(statusState?.versions) && statusState.versions.length ? (
                    statusState.versions.slice(0, 6).map((version) => (
                      <article key={version.id} className="rounded-[10px] border border-[#e4ebf4] bg-[#fbfdff] px-3 py-2 text-xs">
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
                <div className="mt-3 border-t border-[#e4ebf4] pt-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7187a0]">Lifecycle Events</p>
                  <div className="mt-2 space-y-2">
                    {eventHistory.length ? (
                      eventHistory.slice(0, 6).map((event) => (
                        <article key={`vh-${event.id}`} className="rounded-[10px] border border-[#e4ebf4] bg-[#fbfdff] px-3 py-2 text-xs">
                          <p className="font-semibold text-[#20344b]">{humanizeLifecycleEvent(event?.event_type)}</p>
                          <p className="mt-0.5 text-[#60758d]">{normalizeText(event?.created_by) ? `Actor ${normalizeText(event.created_by).slice(0, 8)}…` : 'System action'}</p>
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

              <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4">
                <h4 className="text-sm font-semibold text-[#1a2f45]">Audit Events</h4>
                <div className="mt-3 space-y-2">
                  {eventHistory.length ? (
                    eventHistory.map((event) => (
                      <article key={event.id} className="rounded-[10px] border border-[#e4ebf4] bg-[#fbfdff] px-3 py-2 text-xs">
                        <p className="font-semibold capitalize text-[#20344b]">{String(event?.event_type || 'event').replace(/_/g, ' ')}</p>
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
