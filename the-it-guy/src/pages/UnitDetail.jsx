import { Component, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Copy, ExternalLink, Link2, Printer, Building2, CircleDollarSign, Clock3, UserRound } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import AlterationRequestsPanel from '../components/AlterationRequestsPanel'
import AttorneyCloseoutPanel from '../components/AttorneyCloseoutPanel'
import ClientIssuesPanel from '../components/ClientIssuesPanel'
import ClientPortalAccessPanel from '../components/ClientPortalAccessPanel'
import DocumentsPanel from '../components/DocumentsPanel'
import ExternalAccessPanel from '../components/ExternalAccessPanel'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ProgressTimeline from '../components/ProgressTimeline'
import SharedTransactionShell from '../components/SharedTransactionShell'
import StageAgingChip from '../components/StageAgingChip'
import SubprocessWorkflowPanel from '../components/SubprocessWorkflowPanel'
import TransactionProgressPanel from '../components/TransactionProgressPanel'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  FINANCE_TYPES,
  OCCUPATIONAL_RENT_STATUSES,
  FINANCE_MANAGED_BY_OPTIONS,
  ONBOARDING_STATUSES,
  SUBPROCESS_TYPES,
  TRANSACTION_ROLE_LABELS,
  addTransactionDiscussionComment,
  createExternalAccessLink,
  createWorkspaceAlteration,
  fetchExternalAccessLinks,
  fetchUnitDetail,
  getOrCreateTransactionOnboarding,
  parseWorkflowStepComment,
  saveTransaction,
  saveTransactionClientInformation,
  signOffClientIssue,
  upsertTransactionOccupationalRent,
  updateDocumentClientVisibility,
  updateTransactionSubprocessStep,
  uploadDocument,
} from '../lib/api'
import { MAIN_PROCESS_STAGES, MAIN_STAGE_LABELS } from '../lib/stages'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { getPurchaserTypeOptions, getPurchaserTypeLabel } from '../lib/purchaserPersonas'
import { isBondFinanceType, normalizeFinanceType } from '../core/transactions/financeType'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const PANEL_SHELL = 'rounded-[28px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]'
const PANEL_COMPACT = 'rounded-[24px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]'
const WORKSPACE_MENU_IDS = ['overview', 'progress', 'onboarding', 'documents', 'alterations', 'snags']

function WorkspacePanel({ title, copy, actions = null, className = '', children }) {
  return (
    <section className={`${PANEL_COMPACT} ${className}`.trim()}>
      {title || copy || actions ? (
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            {title ? <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{title}</h3> : null}
            {copy ? <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">{copy}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

class TransactionWorkspaceBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null
    }

    return this.props.children
  }
}

function isActiveExternalLink(link) {
  if (!link || link.revoked || !link.access_token) {
    return false
  }

  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return false
  }

  return true
}

function formatDate(dateLike) {
  if (!dateLike) {
    return 'Not set'
  }

  const date = new Date(dateLike)
  if (Number.isNaN(date.getTime())) {
    return 'Not set'
  }

  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(dateLike) {
  if (!dateLike) {
    return 'Not set'
  }

  const date = new Date(dateLike)
  if (Number.isNaN(date.getTime())) {
    return 'Not set'
  }

  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resolveCommentAuthorName(comment, { buyer, transactionParticipants } = {}) {
  const rawName = String(comment?.authorName || '').trim()
  const normalizedRawName = rawName.toLowerCase()

  if (rawName && !normalizedRawName.includes('@theitguy.local')) {
    return rawName
  }

  const matchedParticipant = (transactionParticipants || []).find((item) => {
    const participantEmail = String(item?.participantEmail || item?.email || '').trim().toLowerCase()
    return participantEmail && participantEmail === normalizedRawName
  })

  if (matchedParticipant?.participantName) {
    return matchedParticipant.participantName
  }

  if (comment?.authorRole === 'client' && buyer?.name) {
    return buyer.name
  }

  if (buyer?.name) {
    return buyer.name
  }

  return rawName || 'Participant'
}

function sanitizeCommentBody(commentBody, comment, context = {}) {
  const rawBody = String(commentBody || '').trim()
  if (!rawBody) {
    return 'No detail provided.'
  }

  const authorName = resolveCommentAuthorName(comment, context)
  const rawAuthorName = String(comment?.authorName || '').trim()

  if (rawAuthorName && rawAuthorName.toLowerCase().includes('@theitguy.local')) {
    return rawBody.replaceAll(rawAuthorName, authorName)
  }

  return rawBody
}

function toTitleLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function formatOnboardingFieldValue(value) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => formatOnboardingFieldValue(entry))
      .filter(Boolean)
      .join(', ')
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, entryValue]) => `${toTitleLabel(key)}: ${formatOnboardingFieldValue(entryValue)}`)
      .join(' | ')
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  return String(value)
}

function isOnboardingMetaKey(key) {
  return String(key || '').startsWith('__bridge_')
}

function getOnboardingFieldGroupLabel(key) {
  const normalized = String(key || '').toLowerCase()

  if (
    normalized.includes('finance') ||
    normalized.includes('bond') ||
    normalized.includes('deposit') ||
    normalized.includes('fund') ||
    normalized.includes('bank') ||
    normalized.includes('loan') ||
    normalized.includes('reservation')
  ) {
    return 'Finance'
  }

  if (
    normalized.includes('employment') ||
    normalized.includes('employer') ||
    normalized.includes('income') ||
    normalized.includes('occupation') ||
    normalized.includes('salary') ||
    normalized.includes('commission') ||
    normalized.includes('retire') ||
    normalized.includes('contract')
  ) {
    return 'Employment & Income'
  }

  if (
    normalized.includes('spouse') ||
    normalized.includes('marriage') ||
    normalized.includes('marital') ||
    normalized.includes('trust') ||
    normalized.includes('trustee') ||
    normalized.includes('director') ||
    normalized.includes('company') ||
    normalized.includes('representative') ||
    normalized.includes('signatory')
  ) {
    return 'Purchasing Structure'
  }

  if (
    normalized.includes('address') ||
    normalized.includes('postal') ||
    normalized.includes('city') ||
    normalized.includes('province') ||
    normalized.includes('nationality') ||
    normalized.includes('residency') ||
    normalized.includes('tax') ||
    normalized.includes('identity') ||
    normalized.includes('passport')
  ) {
    return 'Identity & Address'
  }

  return 'Buyer Details'
}

function groupOnboardingFieldEntries(entries = []) {
  return entries.reduce((groups, entry) => {
    const [key] = entry
    const group = getOnboardingFieldGroupLabel(key)
    if (!groups[group]) {
      groups[group] = []
    }
    groups[group].push(entry)
    return groups
  }, {})
}

function groupRequiredDocuments(requiredDocuments = []) {
  return requiredDocuments.reduce((groups, document) => {
    const group = document?.groupLabel || 'Required Documents'
    if (!groups[group]) {
      groups[group] = []
    }
    groups[group].push(document)
    return groups
  }, {})
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getProgressStageState(stageKey, currentStage) {
  const currentIndex = MAIN_PROCESS_STAGES.indexOf(currentStage)
  const stageIndex = MAIN_PROCESS_STAGES.indexOf(stageKey)

  if (stageIndex < currentIndex) {
    return 'complete'
  }

  if (stageIndex === currentIndex) {
    return 'current'
  }

  return 'upcoming'
}

function buildPrintProgressMarkup(currentStage) {
  return MAIN_PROCESS_STAGES.map((stageKey, index) => {
    const state = getProgressStageState(stageKey, currentStage)
    const stageName = MAIN_STAGE_LABELS[stageKey] || stageKey
    return `
      <div class="onboarding-print-progress-node ${state}">
        <div class="onboarding-print-progress-top">
          <span class="dot"></span>
          ${index < MAIN_PROCESS_STAGES.length - 1 ? '<span class="line"></span>' : ''}
        </div>
        <div class="onboarding-print-progress-copy">
          <strong>${escapeHtml(stageName)}</strong>
          <span>${escapeHtml(state === 'complete' ? 'Complete' : state === 'current' ? 'Current' : 'Upcoming')}</span>
        </div>
      </div>
    `
  }).join('')
}

function buildPrintCommentsMarkup(comments, { buyer, transactionParticipants } = {}) {
  if (!(comments || []).length) {
    return '<div class="onboarding-print-empty">No shared comments or updates have been posted yet.</div>'
  }

  return comments
    .map((comment) => {
      const author = resolveCommentAuthorName(comment, { buyer, transactionParticipants })
      const body = sanitizeCommentBody(comment.commentBody || comment.commentText, comment, {
        buyer,
        transactionParticipants,
      })
      return `
        <article class="onboarding-print-comment">
          <div class="onboarding-print-comment-head">
            <div>
              <strong>${escapeHtml(author)}</strong>
              <span>${escapeHtml(comment.authorRoleLabel || TRANSACTION_ROLE_LABELS[comment.authorRole] || 'Participant')}</span>
            </div>
            <time>${escapeHtml(formatDateTime(comment.createdAt))}</time>
          </div>
          <p>${escapeHtml(body)}</p>
        </article>
      `
    })
    .join('')
}

function buildPrintOverviewMarkup(items) {
  return items
    .map(
      ([label, value]) => `
        <div class="onboarding-print-overview-item">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `,
    )
    .join('')
}

function buildPrintDocumentHtml({
  title,
  subtitle,
  statusLabel,
  generatedAt,
  sections,
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page {
        size: A4;
        margin: 14mm;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        background: #eef3f9;
        color: #142132;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        padding: 20px;
      }

      .onboarding-print-page {
        width: 100%;
        max-width: 794px;
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid #dbe5ef;
        border-radius: 26px;
        overflow: hidden;
      }

      .onboarding-print-hero {
        padding: 28px 30px 26px;
        background:
          radial-gradient(circle at top left, rgba(255,255,255,0.26), transparent 42%),
          linear-gradient(135deg, #365774 0%, #466a89 55%, #5a7d9b 100%);
        color: #ffffff;
      }

      .onboarding-print-eyebrow {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        opacity: 0.82;
      }

      .onboarding-print-hero h1 {
        margin: 14px 0 8px;
        font-size: 36px;
        line-height: 1.05;
        letter-spacing: -0.04em;
      }

      .onboarding-print-hero p {
        margin: 0;
        font-size: 18px;
        line-height: 1.4;
        color: rgba(255,255,255,0.86);
      }

      .onboarding-print-hero-meta {
        margin-top: 20px;
        display: flex;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }

      .onboarding-print-hero-meta div {
        min-width: 0;
      }

      .onboarding-print-hero-meta span {
        display: block;
        font-size: 11px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        opacity: 0.7;
      }

      .onboarding-print-hero-meta strong {
        display: block;
        margin-top: 6px;
        font-size: 15px;
        font-weight: 600;
      }

      .onboarding-print-body {
        padding: 24px 30px 30px;
      }

      .onboarding-print-section + .onboarding-print-section {
        margin-top: 20px;
      }

      .onboarding-print-section-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        margin-bottom: 14px;
      }

      .onboarding-print-section-header h2 {
        margin: 0;
        font-size: 18px;
        letter-spacing: -0.02em;
      }

      .onboarding-print-section-header span {
        color: #6b7d93;
        font-size: 12px;
      }

      .onboarding-print-panel {
        border: 1px solid #e1e9f2;
        background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
        border-radius: 22px;
        padding: 18px;
      }

      .onboarding-print-progress {
        display: flex;
        gap: 0;
      }

      .onboarding-print-progress-node {
        flex: 1 1 0;
        min-width: 0;
      }

      .onboarding-print-progress-top {
        display: flex;
        align-items: center;
      }

      .onboarding-print-progress-node .dot {
        width: 15px;
        height: 15px;
        border-radius: 999px;
        border: 3px solid #d4deea;
        background: #ffffff;
        flex: 0 0 auto;
      }

      .onboarding-print-progress-node .line {
        height: 4px;
        flex: 1 1 auto;
        margin-left: 8px;
        border-radius: 999px;
        background: #e3ebf4;
      }

      .onboarding-print-progress-copy {
        padding-top: 10px;
        padding-right: 10px;
      }

      .onboarding-print-progress-copy strong {
        display: block;
        font-size: 12px;
        line-height: 1.35;
      }

      .onboarding-print-progress-copy span {
        display: block;
        margin-top: 4px;
        color: #7b8ca2;
        font-size: 11px;
      }

      .onboarding-print-progress-node.complete .dot,
      .onboarding-print-progress-node.current .dot {
        border-color: #3f6584;
        background: #3f6584;
      }

      .onboarding-print-progress-node.complete .line {
        background: #3f6584;
      }

      .onboarding-print-progress-node.current .dot {
        box-shadow: 0 0 0 4px rgba(63, 101, 132, 0.16);
      }

      .onboarding-print-overview {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .onboarding-print-fields {
        display: grid;
        gap: 12px;
      }

      .onboarding-print-field-group {
        border: 1px solid #e1e9f2;
        border-radius: 20px;
        background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
        padding: 16px;
        break-inside: avoid;
      }

      .onboarding-print-field-group h3 {
        margin: 0 0 12px;
        font-size: 15px;
        letter-spacing: -0.02em;
      }

      .onboarding-print-field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .onboarding-print-field-item {
        border: 1px solid #e8eef5;
        border-radius: 14px;
        background: #fbfcfe;
        padding: 11px 12px;
      }

      .onboarding-print-field-item span {
        display: block;
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #7b8ca2;
      }

      .onboarding-print-field-item strong {
        display: block;
        margin-top: 6px;
        font-size: 13px;
        line-height: 1.55;
        font-weight: 600;
        color: #142132;
        word-break: break-word;
      }

      .onboarding-print-overview-item {
        border: 1px solid #e3ebf4;
        border-radius: 18px;
        background: #fbfcfe;
        padding: 14px 15px;
      }

      .onboarding-print-overview-item span {
        display: block;
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #7b8ca2;
      }

      .onboarding-print-overview-item strong {
        display: block;
        margin-top: 8px;
        font-size: 17px;
        line-height: 1.3;
        letter-spacing: -0.02em;
      }

      .onboarding-print-comments {
        display: grid;
        gap: 12px;
      }

      .onboarding-print-comment {
        border: 1px solid #e3ebf4;
        border-radius: 18px;
        padding: 14px 15px;
        background: #fbfcfe;
      }

      .onboarding-print-comment-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }

      .onboarding-print-comment-head strong {
        display: block;
        font-size: 14px;
      }

      .onboarding-print-comment-head span,
      .onboarding-print-comment-head time {
        color: #7b8ca2;
        font-size: 11px;
      }

      .onboarding-print-comment p {
        margin: 10px 0 0;
        font-size: 13px;
        line-height: 1.65;
        color: #23384c;
      }

      .onboarding-print-empty {
        border: 1px dashed #d8e2ee;
        border-radius: 18px;
        padding: 18px;
        color: #6b7d93;
        font-size: 13px;
        background: #fbfcfe;
      }

      @media print {
        body {
          padding: 0;
          background: #ffffff;
        }

        .onboarding-print-page {
          border: 0;
          border-radius: 0;
          max-width: none;
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="onboarding-print-page">
      <section class="onboarding-print-hero">
        <p class="onboarding-print-eyebrow">bridge.</p>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
        <div class="onboarding-print-hero-meta">
          <div>
            <span>Status</span>
            <strong>${escapeHtml(statusLabel)}</strong>
          </div>
          <div>
            <span>Generated</span>
            <strong>${escapeHtml(generatedAt)}</strong>
          </div>
        </div>
      </section>

      <section class="onboarding-print-body">${sections.join('')}</section>
    </main>
  </body>
</html>`
}

function buildOnboardingPrintHtml({
  buyer,
  unit,
  mainStage,
  onboardingStatus,
  resolvedPurchaserTypeLabel,
  financeLabel,
  purchasePriceLabel,
  groupedOnboardingFields,
}) {
  const buyerName = buyer?.name || 'Buyer pending'
  const developmentName = unit?.development?.name || 'Development'
  const unitLabel = unit?.unit_number || 'Unit'
  const stageLabel = MAIN_STAGE_LABELS[mainStage] || mainStage || 'Available'
  const overviewItems = [
    ['Purchaser', buyerName],
    ['Purchaser Type', resolvedPurchaserTypeLabel || 'Not set'],
    ['Finance Type', financeLabel || 'Not set'],
    ['Purchase Price', purchasePriceLabel || 'R0'],
    ['Current Stage', stageLabel],
    ['Onboarding', onboardingStatus || 'Not Started'],
  ]

  const fieldGroupsMarkup = Object.keys(groupedOnboardingFields || {}).length
    ? Object.entries(groupedOnboardingFields)
        .map(([groupLabel, items]) => {
          const fieldsMarkup = items
            .map(
              ([key, value]) => `
                <div class="onboarding-print-field-item">
                  <span>${escapeHtml(toTitleLabel(key))}</span>
                  <strong>${escapeHtml(formatOnboardingFieldValue(value))}</strong>
                </div>
              `,
            )
            .join('')

          return `
            <section class="onboarding-print-field-group">
              <h3>${escapeHtml(groupLabel)}</h3>
              <div class="onboarding-print-field-grid">${fieldsMarkup}</div>
            </section>
          `
        })
        .join('')
    : '<div class="onboarding-print-empty">No onboarding fields have been submitted yet.</div>'

  return buildPrintDocumentHtml({
    title: `${buyerName} | Information Sheet`,
    subtitle: `${developmentName} | ${unitLabel}`,
    statusLabel: onboardingStatus || 'Not Started',
    generatedAt: formatDateTime(new Date().toISOString()),
    sections: [
      `
        <section class="onboarding-print-section">
          <div class="onboarding-print-section-header">
            <h2>Progress</h2>
            <span>${escapeHtml(stageLabel)}</span>
          </div>
          <div class="onboarding-print-panel">
            <div class="onboarding-print-progress">${buildPrintProgressMarkup(mainStage)}</div>
          </div>
        </section>
      `,
      `
        <section class="onboarding-print-section">
          <div class="onboarding-print-section-header">
            <h2>Unit Overview</h2>
            <span>Transaction snapshot</span>
          </div>
          <div class="onboarding-print-overview">${buildPrintOverviewMarkup(overviewItems)}</div>
        </section>
      `,
      `
        <section class="onboarding-print-section">
          <div class="onboarding-print-section-header">
            <h2>Submitted Onboarding Information</h2>
            <span>Full captured form data</span>
          </div>
          <div class="onboarding-print-fields">${fieldGroupsMarkup}</div>
        </section>
      `,
    ],
  })
}

function buildTransactionReportPrintHtml({
  buyer,
  unit,
  mainStage,
  onboardingStatus,
  resolvedPurchaserTypeLabel,
  financeLabel,
  purchasePriceLabel,
  transactionDiscussion,
  transactionParticipants,
}) {
  const buyerName = buyer?.name || 'Buyer pending'
  const developmentName = unit?.development?.name || 'Development'
  const unitLabel = unit?.unit_number || 'Unit'
  const stageLabel = MAIN_STAGE_LABELS[mainStage] || mainStage || 'Available'
  const overviewItems = [
    ['Purchaser', buyerName],
    ['Purchaser Type', resolvedPurchaserTypeLabel || 'Not set'],
    ['Finance Type', financeLabel || 'Not set'],
    ['Purchase Price', purchasePriceLabel || 'R0'],
    ['Current Stage', stageLabel],
    ['Onboarding', onboardingStatus || 'Not Started'],
  ]

  return buildPrintDocumentHtml({
    title: `${developmentName} | ${unitLabel}`,
    subtitle: 'Transaction workspace report',
    statusLabel: stageLabel,
    generatedAt: formatDateTime(new Date().toISOString()),
    sections: [
      `
        <section class="onboarding-print-section">
          <div class="onboarding-print-section-header">
            <h2>Progress</h2>
            <span>${escapeHtml(stageLabel)}</span>
          </div>
          <div class="onboarding-print-panel">
            <div class="onboarding-print-progress">${buildPrintProgressMarkup(mainStage)}</div>
          </div>
        </section>
      `,
      `
        <section class="onboarding-print-section">
          <div class="onboarding-print-section-header">
            <h2>Unit Overview</h2>
            <span>Current transaction snapshot</span>
          </div>
          <div class="onboarding-print-overview">${buildPrintOverviewMarkup(overviewItems)}</div>
        </section>
      `,
      `
        <section class="onboarding-print-section">
          <div class="onboarding-print-section-header">
            <h2>Comments & Updates</h2>
            <span>Latest shared notes</span>
          </div>
          <div class="onboarding-print-comments">${buildPrintCommentsMarkup((transactionDiscussion || []).slice(0, 8), {
            buyer,
            transactionParticipants,
          })}</div>
        </section>
      `,
    ],
  })
}

const WORKFLOW_PROCESS_LABELS = {
  finance: 'Finance Workflow',
  attorney: 'Attorney Workflow',
}

const WORKFLOW_STATUS_LABELS = {
  completed: 'Completed',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  not_started: 'Pending',
}

function getWorkflowDiscussionComment(payload = {}) {
  const processLabel = WORKFLOW_PROCESS_LABELS[payload.processType] || 'Workflow'
  const statusLabel = WORKFLOW_STATUS_LABELS[payload.status] || 'Pending'
  const stepLabel = payload.stepLabel || 'Workflow step'
  const baseMessage = `${processLabel}: ${stepLabel} marked ${statusLabel.toLowerCase()}.`
  const note = String(payload.userComment || '').trim()

  return note ? `[operational][shared] ${baseMessage} Note: ${note}` : `[operational][shared] ${baseMessage}`
}

function getNextWorkflowStep(subprocesses = []) {
  if (!subprocesses.length) {
    return null
  }

  const ordered = [...subprocesses].sort(
    (a, b) => (SUBPROCESS_TYPES.indexOf(a.process_type) || 0) - (SUBPROCESS_TYPES.indexOf(b.process_type) || 0),
  )

  for (const subprocess of ordered) {
    const steps = [...(subprocess.steps || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    const nextStep = steps.find((step) => step.status !== 'completed')
    if (!nextStep) {
      continue
    }

    return {
      ...nextStep,
      processType: subprocess.process_type,
      note: parseWorkflowStepComment(nextStep.comment).note,
    }
  }

  return null
}

function UnitDetail() {
  const { unitId } = useParams()
  const [searchParams] = useSearchParams()
  const { role: workspaceRole } = useWorkspace()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [creatingAlteration, setCreatingAlteration] = useState(false)
  const [alterationCreationError, setAlterationCreationError] = useState('')
  const [externalAccessLinks, setExternalAccessLinks] = useState([])
  const [workspaceMenu, setWorkspaceMenu] = useState(() => {
    const requestedMenu = searchParams.get('tab') || searchParams.get('menu') || 'overview'
    return WORKSPACE_MENU_IDS.includes(requestedMenu) ? requestedMenu : 'overview'
  })
  const [discussionBody, setDiscussionBody] = useState('')
  const [discussionType, setDiscussionType] = useState('operational')
  const [actingRole, setActingRole] = useState('developer')
  const [clientPortalLink, setClientPortalLink] = useState(null)
  const [showTransactionEditor, setShowTransactionEditor] = useState(false)
  const workspaceLandingMode = 'full_workspace'
  const [documentCategory, setDocumentCategory] = useState('General')
  const [clientVisibleByDefault, setClientVisibleByDefault] = useState(false)
  const [handoverForm, setHandoverForm] = useState({
    status: 'not_started',
    handoverDate: '',
    electricityMeterReading: '',
    waterMeterReading: '',
    gasMeterReading: '',
    keysHandedOver: false,
    remoteHandedOver: false,
    manualsHandedOver: false,
    inspectionCompleted: false,
    notes: '',
    signatureName: '',
    signatureSignedAt: null,
  })
  const [occupationalRentForm, setOccupationalRentForm] = useState({
    enabled: false,
    status: 'not_applicable',
    occupationDate: '',
    rentStartDate: '',
    monthlyAmount: '',
    proRataAmount: '',
    nextDueDate: '',
    waived: false,
    waiverReason: '',
    notes: '',
  })
  const [stageForm, setStageForm] = useState({
    main_stage: 'AVAIL',
    finance_type: 'cash',
    purchaser_type: 'individual',
    finance_managed_by: 'bond_originator',
    assigned_agent: '',
    assigned_agent_email: '',
    attorney: '',
    assigned_attorney_email: '',
    bond_originator: '',
    assigned_bond_originator_email: '',
    next_action: '',
  })
  const [clientInfoForm, setClientInfoForm] = useState({
    buyer_name: '',
    buyer_email: '',
    buyer_phone: '',
    onboarding_status: 'Not Started',
  })
  const [workflowFocusLaneOverride, setWorkflowFocusLaneOverride] = useState(null)
  const purchaserTypeOptions = getPurchaserTypeOptions()
  const discussionPanelRef = useRef(null)
  const workspaceMenuRef = useRef(null)
  const workflowPanelRef = useRef(null)

  const loadDetail = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setError('')
      setLoading(true)
      const data = await fetchUnitDetail(unitId)
      setDetail(data)
      if (data?.transaction?.id) {
        try {
          let links = await fetchExternalAccessLinks(data.transaction.id)
          if (!links.some(isActiveExternalLink)) {
            const fallbackEmail =
              String(data?.buyer?.email || '').trim().toLowerCase() ||
              `external+${String(data.transaction.id).replaceAll('-', '')}@theitguy.local`

            await createExternalAccessLink({
              transactionId: data.transaction.id,
              buyerId: data?.buyer?.id || null,
              role: 'attorney',
              email: fallbackEmail,
              expiresDays: 0,
            })

            links = await fetchExternalAccessLinks(data.transaction.id)
          }

          setExternalAccessLinks(links || [])
        } catch (accessError) {
          setExternalAccessLinks([])
          setError(accessError?.message || 'Unable to initialize external access links for this unit.')
        }
      } else {
        setExternalAccessLinks([])
      }

      if (data?.transaction) {
        setStageForm({
          main_stage: data.mainStage || 'AVAIL',
          finance_type: normalizeFinanceType(data.transaction.finance_type || 'cash'),
          purchaser_type: data.transaction.purchaser_type || data.purchaserType || 'individual',
          finance_managed_by: data.transaction.finance_managed_by || 'bond_originator',
          assigned_agent: data.transaction.assigned_agent || '',
          assigned_agent_email: data.transaction.assigned_agent_email || '',
          attorney: data.transaction.attorney || '',
          assigned_attorney_email: data.transaction.assigned_attorney_email || '',
          bond_originator: data.transaction.bond_originator || '',
          assigned_bond_originator_email: data.transaction.assigned_bond_originator_email || '',
          next_action: data.transaction.next_action || '',
        })
        setActingRole(data.activeViewerRole || 'developer')
      } else if (data) {
        setStageForm((previous) => ({
          ...previous,
          main_stage: data.mainStage || 'AVAIL',
          purchaser_type: data.purchaserType || 'individual',
        }))
        setActingRole(data.activeViewerRole || 'developer')
      }
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [unitId])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  useEffect(() => {
    const requestedMenu = searchParams.get('tab') || searchParams.get('menu')
    if (!requestedMenu || !WORKSPACE_MENU_IDS.includes(requestedMenu)) {
      return
    }

    setWorkspaceMenu(requestedMenu)
  }, [searchParams])

  useEffect(() => {
    if (!detail?.handover) {
      return
    }

    setHandoverForm({
      status: detail.handover.status || 'not_started',
      handoverDate: detail.handover.handoverDate || '',
      electricityMeterReading: detail.handover.electricityMeterReading || '',
      waterMeterReading: detail.handover.waterMeterReading || '',
      gasMeterReading: detail.handover.gasMeterReading || '',
      keysHandedOver: Boolean(detail.handover.keysHandedOver),
      remoteHandedOver: Boolean(detail.handover.remoteHandedOver),
      manualsHandedOver: Boolean(detail.handover.manualsHandedOver),
      inspectionCompleted: Boolean(detail.handover.inspectionCompleted),
      notes: detail.handover.notes || '',
      signatureName: detail.handover.signatureName || detail.buyer?.name || '',
      signatureSignedAt: detail.handover.signatureSignedAt || null,
    })
  }, [detail])

  useEffect(() => {
    if (!detail?.occupationalRent) {
      return
    }

    setOccupationalRentForm({
      enabled: Boolean(detail.occupationalRent.enabled),
      status: detail.occupationalRent.status || 'not_applicable',
      occupationDate: detail.occupationalRent.occupationDate || '',
      rentStartDate: detail.occupationalRent.rentStartDate || '',
      monthlyAmount:
        detail.occupationalRent.monthlyAmount === null || detail.occupationalRent.monthlyAmount === undefined
          ? ''
          : String(detail.occupationalRent.monthlyAmount),
      proRataAmount:
        detail.occupationalRent.proRataAmount === null || detail.occupationalRent.proRataAmount === undefined
          ? ''
          : String(detail.occupationalRent.proRataAmount),
      nextDueDate: detail.occupationalRent.nextDueDate || '',
      waived: Boolean(detail.occupationalRent.waived),
      waiverReason: detail.occupationalRent.waiverReason || '',
      notes: detail.occupationalRent.notes || '',
    })
  }, [detail])

  useEffect(() => {
    setClientInfoForm({
      buyer_name: detail?.buyer?.name || '',
      buyer_email: detail?.buyer?.email || '',
      buyer_phone: detail?.buyer?.phone || '',
      onboarding_status: detail?.onboarding?.status || 'Not Started',
    })
  }, [detail])

  useEffect(() => {
    function onTransactionCreated(event) {
      const createdUnitId = event?.detail?.unitId
      if (!createdUnitId || createdUnitId === unitId) {
        void loadDetail()
      }
    }

    function onDocumentRequirementsChanged() {
      void loadDetail()
    }

    window.addEventListener('itg:transaction-created', onTransactionCreated)
    window.addEventListener('itg:document-requirements-changed', onDocumentRequirementsChanged)
    return () => {
      window.removeEventListener('itg:transaction-created', onTransactionCreated)
      window.removeEventListener('itg:document-requirements-changed', onDocumentRequirementsChanged)
    }
  }, [loadDetail, unitId])

  useEffect(() => {
    function scrollToSection(ref) {
      ref?.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }

    function setUploadCategoryForRoleFromQuickAction() {
      if (actingRole === 'attorney') {
        setDocumentCategory('Transfer Documents')
        return
      }

      if (actingRole === 'bond_originator') {
        setDocumentCategory('Bond Approval')
        return
      }

      if (actingRole === 'client') {
        setDocumentCategory('Supporting Document')
        return
      }

      const firstMissing = (detail?.requiredDocumentChecklist || []).find((item) => !item.complete)
      setDocumentCategory(firstMissing?.label || 'General')
    }

    function onQuickAction(event) {
      const action = event?.detail?.action
      if (!action) {
        return
      }

      if (action === 'upload-required-doc') {
        setUploadCategoryForRoleFromQuickAction()
        setWorkspaceMenu('documents')
        scrollToSection(workspaceMenuRef)
      }

      if (action === 'post-update') {
        setDiscussionType(actingRole === 'client' ? 'client' : 'operational')
        setWorkspaceMenu('overview')
        scrollToSection(discussionPanelRef)
      }

      if (action === 'invite-next-party') {
        setWorkspaceMenu('overview')
        scrollToSection(workspaceMenuRef)
      }
    }

    window.addEventListener('itg:quick-action', onQuickAction)
    return () => window.removeEventListener('itg:quick-action', onQuickAction)
  }, [actingRole, detail])

  async function handleTransactionSave(event) {
    event.preventDefault()

    if (!detail) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await saveTransaction({
        unitId: detail.unit.id,
        transactionId: detail.transaction?.id,
        buyerId: detail.transaction?.buyer_id || null,
        financeType: stageForm.finance_type,
        purchaserType: stageForm.purchaser_type,
        financeManagedBy: stageForm.finance_managed_by,
        mainStage: stageForm.main_stage,
        assignedAgent: stageForm.assigned_agent,
        assignedAgentEmail: stageForm.assigned_agent_email,
        attorney: stageForm.attorney,
        assignedAttorneyEmail: stageForm.assigned_attorney_email,
        bondOriginator: stageForm.bond_originator,
        assignedBondOriginatorEmail: stageForm.assigned_bond_originator_email,
        nextAction: stageForm.next_action,
        actorRole: actingRole,
      })
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleClientInformationSave(event) {
    event.preventDefault()

    if (!detail?.transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')

      await saveTransaction({
        unitId: detail.unit.id,
        transactionId: detail.transaction.id,
        buyerId: detail.transaction.buyer_id || detail.buyer?.id || null,
        financeType: stageForm.finance_type,
        purchaserType: stageForm.purchaser_type,
        financeManagedBy: stageForm.finance_managed_by,
        mainStage: stageForm.main_stage,
        assignedAgent: stageForm.assigned_agent,
        assignedAgentEmail: stageForm.assigned_agent_email,
        attorney: stageForm.attorney,
        assignedAttorneyEmail: stageForm.assigned_attorney_email,
        bondOriginator: stageForm.bond_originator,
        assignedBondOriginatorEmail: stageForm.assigned_bond_originator_email,
        nextAction: stageForm.next_action,
        actorRole: actingRole,
      })

      await saveTransactionClientInformation({
        transactionId: detail.transaction.id,
        buyerId: detail.transaction.buyer_id || detail.buyer?.id || null,
        buyerName: clientInfoForm.buyer_name,
        buyerEmail: clientInfoForm.buyer_email,
        buyerPhone: clientInfoForm.buyer_phone,
        purchaserType: stageForm.purchaser_type,
        onboardingStatus: clientInfoForm.onboarding_status,
        actorRole: actingRole,
      })

      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddDiscussion(event) {
    event.preventDefault()

    if (!discussionBody.trim() || !detail?.transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const normalizedDiscussion = discussionBody.trim()
      const prefixedDiscussion = normalizedDiscussion.match(/^\[[a-z_ ]+\]/i)
        ? normalizedDiscussion
        : `[${discussionType}] ${normalizedDiscussion}`
      await addTransactionDiscussionComment({
        transactionId: detail.transaction.id,
        authorName:
          detail.transactionParticipants?.find((item) => item.roleType === actingRole)?.participantName ||
          TRANSACTION_ROLE_LABELS[actingRole],
        authorRole: actingRole,
        commentText: prefixedDiscussion,
        unitId: detail.unit.id,
      })
      setDiscussionBody('')
      await loadDetail()
    } catch (discussionError) {
      setError(discussionError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpload(event) {
    event.preventDefault()

    const file = event.currentTarget.file.files?.[0]
    if (!file || !detail?.transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await uploadDocument({
        transactionId: detail.transaction.id,
        file,
        category: documentCategory,
        isClientVisible: clientVisibleByDefault,
      })
      event.currentTarget.reset()
      await loadDetail()
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleDocumentVisibility(documentId, isClientVisible) {
    try {
      setSaving(true)
      setError('')
      await updateDocumentClientVisibility(documentId, isClientVisible)
      await loadDetail()
    } catch (visibilityError) {
      setError(visibilityError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubprocessStepSave(payload) {
    try {
      setSaving(true)
      setError('')
      await updateTransactionSubprocessStep({
        ...payload,
        actorRole: actingRole,
      })
      if (detail?.transaction?.id) {
        await addTransactionDiscussionComment({
          transactionId: detail.transaction.id,
          authorName:
            detail.transactionParticipants?.find((item) => item.roleType === actingRole)?.participantName ||
            TRANSACTION_ROLE_LABELS[actingRole],
          authorRole: actingRole,
          commentText: getWorkflowDiscussionComment(payload),
          unitId: detail.unit.id,
        })
      }
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  function updateHandoverField(field, value) {
    setHandoverForm((previous) => ({ ...previous, [field]: value }))
  }

  async function handleHandoverSave() {
    if (!detail?.transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await upsertTransactionHandover({
        transactionId: detail.transaction.id,
        handover: handoverForm,
      })
      await loadDetail()
    } catch (handoverError) {
      setError(handoverError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleHandoverComplete() {
    if (!detail?.transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await upsertTransactionHandover({
        transactionId: detail.transaction.id,
        handover: {
          ...handoverForm,
          status: 'completed',
          signatureSignedAt: handoverForm.signatureSignedAt || new Date().toISOString(),
        },
      })
      await loadDetail()
    } catch (handoverError) {
      setError(handoverError.message)
    } finally {
      setSaving(false)
    }
  }

  function updateOccupationalRentField(field, value) {
    setOccupationalRentForm((previous) => ({ ...previous, [field]: value }))
  }

  async function handleOccupationalRentSave(event) {
    event?.preventDefault?.()

    if (!detail?.transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const payload = {
        enabled: Boolean(occupationalRentForm.enabled),
        status: occupationalRentForm.enabled
          ? occupationalRentForm.status || 'pending_setup'
          : 'not_applicable',
        occupationDate: occupationalRentForm.occupationDate || null,
        rentStartDate: occupationalRentForm.rentStartDate || null,
        monthlyAmount: occupationalRentForm.monthlyAmount === '' ? null : Number(occupationalRentForm.monthlyAmount),
        proRataAmount: occupationalRentForm.proRataAmount === '' ? null : Number(occupationalRentForm.proRataAmount),
        nextDueDate: occupationalRentForm.nextDueDate || null,
        waived: Boolean(occupationalRentForm.waived),
        waiverReason: occupationalRentForm.waiverReason || '',
        notes: occupationalRentForm.notes || '',
      }

      await upsertTransactionOccupationalRent({
        transactionId: detail.transaction.id,
        occupationalRent: payload,
        actorRole: actingRole,
      })

      await addTransactionDiscussionComment({
        transactionId: detail.transaction.id,
        authorName:
          detail.transactionParticipants?.find((item) => item.roleType === actingRole)?.participantName ||
          TRANSACTION_ROLE_LABELS[actingRole],
        authorRole: actingRole,
        commentText: payload.enabled
          ? `Occupational rent updated: ${toTitleLabel(payload.status)}${payload.monthlyAmount ? ` • ${currency.format(payload.monthlyAmount)} per month` : ''}${payload.rentStartDate ? ` from ${formatDate(payload.rentStartDate)}` : ''}.`
          : 'Occupational rent marked as not applicable.',
        unitId: detail.unit.id,
      })

      await loadDetail()
    } catch (occupationalRentError) {
      setError(occupationalRentError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyStatusLink() {
    if (!detail?.transactionStatusLink?.token) {
      setError('Status link is not available yet for this transaction.')
      return
    }

    const url = `${window.location.origin}/status/${detail.transactionStatusLink.token}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      setError('Unable to copy status link. Please copy it manually from your browser.')
    }
  }

  async function ensureOnboardingToken() {
    if (!detail?.transaction?.id) {
      throw new Error('Transaction data is missing.')
    }

    const record = await getOrCreateTransactionOnboarding({
      transactionId: detail.transaction.id,
      purchaserType: detail.transaction?.purchaser_type || detail.purchaserType || 'individual',
    })

    if (record?.token) {
      setDetail((previous) => (previous ? { ...previous, onboarding: record } : previous))
      return record
    }

    throw new Error('Unable to generate onboarding link right now.')
  }

  async function handleCopyOnboardingLink() {
    try {
      const record = detail?.onboarding?.token ? detail.onboarding : await ensureOnboardingToken()
      const url = `${window.location.origin}/client/onboarding/${record.token}`
      await navigator.clipboard.writeText(url)
    } catch (copyError) {
      setError(copyError?.message || 'Unable to copy onboarding link. Please copy it manually from your browser.')
    }
  }

  function openPrintDocument(content, popupErrorMessage) {
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const printWindow = window.open(url, '_blank', 'width=980,height=1320')

    if (!printWindow) {
      URL.revokeObjectURL(url)
      setError(popupErrorMessage)
      return
    }

    const cleanup = () => {
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }

    printWindow.onload = () => {
      window.setTimeout(() => {
        try {
          printWindow.focus()
          printWindow.print()
        } finally {
          cleanup()
        }
      }, 250)
    }
  }

  function handleDownloadOnboardingDocument() {
    if (!detail?.onboardingFormData?.formData) {
      setError('No onboarding information has been submitted yet.')
      return
    }

    setError('')

    const content = buildOnboardingPrintHtml({
      buyer: detail.buyer,
      unit: detail.unit,
      transaction: detail.transaction,
      mainStage: detail.mainStage || stageForm.main_stage,
      onboardingStatus: detail.onboarding?.status || 'Not Started',
      resolvedPurchaserTypeLabel: getPurchaserTypeLabel(detail.transaction?.purchaser_type || detail.purchaserType || 'individual'),
      financeLabel: normalizeFinanceType(detail.transaction?.finance_type || 'cash').replace(/\b\w/g, (match) => match.toUpperCase()),
      purchasePriceLabel: currency.format(Number(detail.transaction?.purchase_price || detail.transaction?.sales_price || detail.unit?.price || 0)),
      groupedOnboardingFields,
    })
    openPrintDocument(content, 'Unable to open the onboarding document. Please allow pop-ups and try again.')
  }

  function handlePrintTransactionReport() {
    if (!detail?.transaction?.id) {
      setError('Transaction data is not available yet.')
      return
    }

    setError('')

    const content = buildTransactionReportPrintHtml({
      buyer: detail.buyer,
      unit: detail.unit,
      mainStage: detail.mainStage || stageForm.main_stage,
      onboardingStatus: detail.onboarding?.status || 'Not Started',
      resolvedPurchaserTypeLabel: resolvedPurchaserTypeLabel || 'Not set',
      financeLabel,
      purchasePriceLabel: currency.format(purchasePriceValue || 0),
      transactionDiscussion: detail.transactionDiscussion || [],
      transactionParticipants: detail.transactionParticipants || [],
    })

    openPrintDocument(content, 'Unable to open the transaction report. Please allow pop-ups and try again.')
  }

  async function handleOpenOnboardingLink() {
    try {
      const record = detail?.onboarding?.token ? detail.onboarding : await ensureOnboardingToken()
      window.open(`/client/onboarding/${record.token}`, '_blank', 'noopener,noreferrer')
    } catch (openError) {
      setError(openError?.message || 'Onboarding link is not available yet for this transaction.')
    }
  }

  function handleOpenStatusLink() {
    if (!detail?.transactionStatusLink?.token) {
      setError('Status link is not available yet for this transaction.')
      return
    }

    window.open(`/status/${detail.transactionStatusLink.token}`, '_blank', 'noopener,noreferrer')
  }

  function handleHeadlineExternalAccessClick() {
    const activeLink = (externalAccessLinks || []).find(isActiveExternalLink)

    if (activeLink?.access_token) {
      window.open(`/external/${activeLink.access_token}`, '_blank', 'noopener,noreferrer')
      return
    }

    setError('No active external access link exists for this unit yet. Generate one in External Access first.')
  }

  function handleOpenClientPortalLink() {
    if (!clientPortalLink?.token) {
      setError('Client portal link is not available yet for this transaction.')
      return
    }

    window.open(`/client/${clientPortalLink.token}`, '_blank', 'noopener,noreferrer')
  }

  async function handleSignOffIssue(issueId) {
    if (!transaction?.id) {
      throw new Error('Save the transaction before signing off on snags.')
    }

    await signOffClientIssue(issueId, actingRole || 'developer')
  }

  if (!isSupabaseConfigured) {
    return <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">Supabase is not configured for this workspace.</p>
  }

  if (loading) {
    return <LoadingSkeleton lines={12} className={PANEL_SHELL} />
  }

  if (!detail) {
    return <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">Unit not found.</p>
  }

  const {
    unit,
    buyer,
    transaction,
    documents,
    requiredDocumentChecklist,
    stage,
    clientIssues,
    alterationRequests,
    handover,
    developmentSettings,
    transactionSubprocesses,
    mainStage,
    onboarding,
    onboardingDerivedConfiguration,
    purchaserTypeLabel,
    transactionParticipants,
    activeViewerPermissions,
    transactionDiscussion,
    transactionStatusLink,
    onboardingFormData,
    occupationalRent,
  } = detail

  const isRegisteredUnit = mainStage === 'REG' || /registered/i.test(String(stage || ''))

  const isAttorneyLens = workspaceRole === 'attorney' || actingRole === 'attorney'
  const isBondLens = workspaceRole === 'bond_originator' || actingRole === 'bond_originator'
  const canSeeAttorneyCloseout = ['developer', 'internal_admin', 'attorney'].includes(actingRole)
  const purchasePriceValue = Number(transaction?.purchase_price || transaction?.sales_price || unit?.price || 0)
  const financeLabel = transaction?.finance_type ? normalizeFinanceType(transaction.finance_type) : 'n/a'
  const mainStageLabel = MAIN_STAGE_LABELS[mainStage] || mainStage
  const resolvedPurchaserTypeLabel = purchaserTypeLabel || getPurchaserTypeLabel(transaction?.purchaser_type)
  const onboardingStatus = onboarding?.status || 'Not Started'
  const onboardingComplete = ['Submitted', 'Reviewed', 'Approved'].includes(onboardingStatus)
  const alterationTotalAmount = (alterationRequests || []).reduce((sum, request) => sum + (Number(request.amount_inc_vat) || 0), 0)
  const nextWorkflowStep = getNextWorkflowStep(transactionSubprocesses || [])
  const nextWorkflowTitle =
    nextWorkflowStep?.step_label || nextWorkflowStep?.step_key || 'Awaiting workflow updates'
  const nextWorkflowProcessLabel = WORKFLOW_PROCESS_LABELS[nextWorkflowStep?.processType] || 'Workflow'
  const nextWorkflowStatusLabel = WORKFLOW_STATUS_LABELS[nextWorkflowStep?.status] || 'Pending'
  const nextWorkflowMeta = nextWorkflowStep
    ? `${nextWorkflowProcessLabel} • ${nextWorkflowStatusLabel}`
    : 'Workflow updates pending'
  const nextWorkflowDescription = nextWorkflowStep?.note
    ? nextWorkflowStep.note
    : nextWorkflowStep
    ? `Continue with ${nextWorkflowTitle.toLowerCase()} in the ${nextWorkflowProcessLabel}.`
    : 'Awaiting workflow assignments to surface the next action.'

  async function handleCreateAlteration(payload) {
    if (!transaction?.id || !unit) {
      throw new Error('Save the transaction before recording an alteration.')
    }

    try {
      setCreatingAlteration(true)
      setAlterationCreationError('')
      await createWorkspaceAlteration({
        developmentId: unit.development_id,
        unitId: unit.id,
        transactionId: transaction.id,
        buyerId: buyer?.id || null,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        amountIncVat: payload.amountIncVat,
        invoiceFile: payload.invoiceFile,
        proofFile: payload.proofFile,
      })
      return true
    } catch (creationError) {
      const message = creationError?.message || 'Unable to record alteration.'
      setAlterationCreationError(message)
      throw creationError
    } finally {
      setCreatingAlteration(false)
    }
  }
  const handoverStatus = handover?.status ? String(handover.status).replaceAll('_', ' ') : 'not started'
  const actingParticipant = (transactionParticipants || []).find((item) => item.roleType === actingRole) || null
  const actingPermissions = actingParticipant
    ? {
        canView: actingParticipant.canView,
        canComment: actingParticipant.canComment,
        canUploadDocuments: actingParticipant.canUploadDocuments,
        canEditFinanceWorkflow: actingParticipant.canEditFinanceWorkflow,
        canEditAttorneyWorkflow: actingParticipant.canEditAttorneyWorkflow,
        canEditCoreTransaction: actingParticipant.canEditCoreTransaction,
      }
    : activeViewerPermissions || {
        canView: true,
        canComment: true,
        canUploadDocuments: true,
        canEditFinanceWorkflow: true,
        canEditAttorneyWorkflow: true,
        canEditCoreTransaction: true,
      }
  const canCommentInWorkspace = Boolean(actingPermissions.canComment)
  const canUploadDocuments = Boolean(actingPermissions.canUploadDocuments)
  const canEditCoreTransaction = Boolean(actingPermissions.canEditCoreTransaction)
  const uploadedDocs = Number(detail.documentSummary?.uploadedCount || 0)
  const requiredDocs = Number(detail.documentSummary?.totalRequired || 0)
  const documentReadinessText = requiredDocs > 0 ? `${uploadedDocs}/${requiredDocs} uploaded` : 'Not configured'
  const occupationalRentStatusLabel = occupationalRent?.enabled
    ? toTitleLabel(occupationalRent?.status || 'pending_setup')
    : 'Not applicable'
  const occupationalRentMonthlyLabel = occupationalRent?.monthlyAmount
    ? currency.format(Number(occupationalRent.monthlyAmount) || 0)
    : 'Not set'
  const occupationalRentNextDueLabel = occupationalRent?.nextDueDate ? formatDate(occupationalRent.nextDueDate) : 'Not set'
  const occupationalRentStartLabel = occupationalRent?.rentStartDate ? formatDate(occupationalRent.rentStartDate) : 'Not set'

  const reportGeneratedAt = formatDateTime(new Date())
  const workflowFocusLane =
    workflowFocusLaneOverride ||
    (workspaceLandingMode === 'my_lane'
      ? actingRole === 'attorney'
        ? 'attorney'
        : actingRole === 'bond_originator' && String(transaction?.finance_managed_by || 'bond_originator') === 'bond_originator'
          ? 'finance'
          : actingRole === 'developer' || actingRole === 'internal_admin'
            ? 'all'
            : null
      : null)
  const financeStatusLabel = (() => {
    if (financeLabel === 'cash') {
      return 'Cash Purchase'
    }
    if (['ATTY', 'XFER', 'REG'].includes(mainStage) || stage === 'Bond Approved / Proof of Funds') {
      return 'Bond Approved'
    }
    if (mainStage === 'FIN') {
      return 'Awaiting Bond Approval'
    }
    return 'Finance Pending'
  })()
  const registeredAt = transaction?.updated_at || transaction?.created_at || null
  const ownerDisplayName = buyer?.name || 'Owner not assigned'
  const handoverCompleted = String(handover?.status || '').toLowerCase() === 'completed'
  const handoverChecklistRows = [
    { id: 'inspection', label: 'Inspection completed', complete: Boolean(handoverForm.inspectionCompleted) },
    { id: 'keys', label: 'Keys handed over', complete: Boolean(handoverForm.keysHandedOver) },
    { id: 'remote', label: 'Remote controls handed over', complete: Boolean(handoverForm.remoteHandedOver) },
    { id: 'manuals', label: 'Manuals and packs handed over', complete: Boolean(handoverForm.manualsHandedOver) },
  ]
  const onboardingFieldEntries = Object.entries(onboardingFormData?.formData || {})
    .filter(([key]) => !isOnboardingMetaKey(key))
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
  const groupedOnboardingFields = groupOnboardingFieldEntries(onboardingFieldEntries)
  const requiredDocumentGroups = groupRequiredDocuments(onboardingDerivedConfiguration?.requiredDocuments || [])
  const purchaseRecordDocuments = (documents || []).filter((item) => !/(handover|snag|warranty|occupation|alteration)/i.test(`${item?.name || ''} ${item?.category || ''}`))
  const unitLifecycleDocuments = (documents || []).filter((item) => /(handover|snag|warranty|occupation|alteration)/i.test(`${item?.name || ''} ${item?.category || ''}`))
  const developmentModuleState = developmentSettings?.enabledModules || {}
  const developmentTeams = developmentSettings?.stakeholderTeams || {}
  const agentOptions = developmentTeams.agents || []
  const conveyancerOptions = developmentTeams.conveyancers || []
  const bondOriginatorOptions = developmentTeams.bondOriginators || []

  function scrollToSection(ref) {
    ref?.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  function handleOpenWorkflowLaneFromProgress(lane) {
    setWorkflowFocusLaneOverride(lane)
    setWorkspaceMenu('overview')
    window.setTimeout(() => {
      scrollToSection(workflowPanelRef)
    }, 0)
  }

  function handleOpenDocumentsFromProgress() {
    setWorkspaceMenu('documents')
    window.setTimeout(() => {
      scrollToSection(workspaceMenuRef)
    }, 0)
  }

  function handleAgentSelection(value) {
    const selected = agentOptions.find((item) => String(item.email || item.name) === value)
    if (!selected) {
      return
    }

    setStageForm((previous) => ({
      ...previous,
      assigned_agent: selected.name || previous.assigned_agent,
      assigned_agent_email: selected.email || previous.assigned_agent_email,
    }))
  }

  function handleConveyancerSelection(value) {
    const selected = conveyancerOptions.find((item) => String(item.email || item.firmName) === value)
    if (!selected) {
      return
    }

    setStageForm((previous) => ({
      ...previous,
      attorney: selected.firmName || selected.contactName || previous.attorney,
      assigned_attorney_email: selected.email || previous.assigned_attorney_email,
    }))
  }

  function handleBondOriginatorSelection(value) {
    const selected = bondOriginatorOptions.find((item) => String(item.email || item.name) === value)
    if (!selected) {
      return
    }

    setStageForm((previous) => ({
      ...previous,
      bond_originator: selected.name || previous.bond_originator,
      assigned_bond_originator_email: selected.email || previous.assigned_bond_originator_email,
    }))
  }

  const activityEvents = [
    ...(transactionDiscussion || []).map((item) => ({
      id: `discussion-${item.id}`,
      type: 'discussion',
      title: `${resolveCommentAuthorName(item, { buyer, transactionParticipants })} posted an update`,
      body: sanitizeCommentBody(item.commentBody || item.commentText, item, { buyer, transactionParticipants }),
      createdAt: item.createdAt || null,
    })),
    ...(documents || []).map((item) => ({
      id: `document-${item.id}`,
      type: 'document',
      title: `${item.name || 'Document'} uploaded`,
      body: `${item.category || 'General'}${item.uploaded_by_role ? ` • ${String(item.uploaded_by_role).replaceAll('_', ' ')}` : ''}`,
      createdAt: item.created_at || null,
    })),
    ...(transactionSubprocesses || [])
      .flatMap((process) =>
        (process.steps || [])
          .filter((step) => step.status === 'completed' && step.completed_at)
          .map((step) => ({
            id: `workflow-${step.id || step.step_key}`,
            type: 'workflow',
            title: `${step.step_label} completed`,
            body: `${process.process_type === 'finance' ? 'Finance Workflow' : 'Attorney Workflow'}`,
            createdAt: step.completed_at,
          })),
      ),
  ]
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
    .slice(0, 18)

  const workspaceMenus = [
    { id: 'overview', label: 'Overview', meta: isRegisteredUnit ? 'Unit summary' : 'Transaction summary' },
    { id: 'progress', label: 'Progress', meta: `${mainStageLabel} journey` },
    { id: 'onboarding', label: 'Client Information', meta: onboardingStatus },
    { id: 'documents', label: 'Documents', meta: `${documents?.length || 0} files` },
    { id: 'alterations', label: 'Alterations', meta: developmentSettings?.alteration_requests_enabled ? `${alterationRequests?.length || 0} requests` : 'Module off' },
    { id: 'snags', label: 'Snags', meta: developmentSettings?.snag_reporting_enabled ? `${clientIssues?.length || 0} logged` : 'Module off' },
  ]
  const activeWorkspaceMenu = workspaceMenus.some((tab) => tab.id === workspaceMenu) ? workspaceMenu : 'overview'
  const workflowOverviewSection = (
    <div ref={workflowPanelRef} className="no-print">
      <SubprocessWorkflowPanel
        subprocesses={transactionSubprocesses || []}
        documents={documents || []}
        saving={saving}
        disabled={!transaction?.id}
        roleLabel={TRANSACTION_ROLE_LABELS[actingRole] || actingRole}
        canEditFinanceWorkflow={Boolean(actingPermissions.canEditFinanceWorkflow)}
        canEditAttorneyWorkflow={Boolean(actingPermissions.canEditAttorneyWorkflow)}
        focusMode={workspaceLandingMode}
        focusLane={workflowFocusLane}
        allowCollapse={false}
        embedded
        hideSectionHeader
        onSaveStep={handleSubprocessStepSave}
        onDocumentUploaded={loadDetail}
      />
    </div>
  )

  const workspaceFallback = (
    <section className="space-y-4">
      <section className={PANEL_SHELL}>
        <div className="flex flex-col gap-5">
          <div className="min-w-0">
            <span className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Transaction Workspace</span>
            <h1 className="mt-3 text-[2rem] font-semibold tracking-[-0.04em] text-[#142132]">
              {unit.development?.name || 'Property Transaction'} • Unit {unit.unit_number}
            </h1>
            <p className="mt-3 text-[1rem] text-[#6b7d93]">{buyer?.name || 'Buyer not assigned yet'}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Current Stage', mainStageLabel],
              ['Purchase Price', currency.format(purchasePriceValue || 0)],
              ['Onboarding', onboardingStatus],
              [
                'Time In Stage',
                <StageAgingChip key="fallback-stage-age" stage={stage} updatedAt={transaction?.updated_at || transaction?.created_at} />,
              ],
            ].map(([label, value]) => (
              <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                <strong className="mt-2 block text-base font-semibold text-[#142132]">{value}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <WorkspacePanel
        title="Workspace Summary"
        copy="The full transaction workspace hit a render issue, so this safe fallback is shown instead."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ['Development', unit.development?.name || 'Not set'],
            ['Unit', unit.unit_number || 'Not set'],
            ['Buyer', buyer?.name || 'Buyer not assigned yet'],
            ['Finance Type', financeLabel],
            ['Documents', documentReadinessText],
          ].map(([label, value]) => (
            <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
              <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
              <strong className="mt-2 block text-base font-semibold text-[#142132]">{value}</strong>
            </article>
          ))}
        </div>
      </WorkspacePanel>
    </section>
  )

  let workspaceContent

  try {
    workspaceContent = (
      <SharedTransactionShell
      printTitle="Unit Transaction Report"
      printSubtitle={`${unit.development?.name || '-'} • Unit ${unit.unit_number}`}
      printGeneratedAt={reportGeneratedAt}
      errorMessage={error}
      headline={(
        <section className={`${PANEL_SHELL} relative overflow-hidden`}>
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgba(53,84,108,0.08)_0%,rgba(53,84,108,0)_100%)]" />
          <div className="relative flex flex-col gap-5">
            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-start">
              <div className="min-w-0">
                <span className="inline-flex items-center rounded-full border border-[#d9e4ef] bg-white/90 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#61758d] shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  Transaction Workspace
                </span>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <h1 className="text-[2.4rem] font-semibold leading-none tracking-[-0.06em] text-[#142132]">
                    {unit.development?.name || 'Property Transaction'}
                  </h1>
                  <span className="text-[1.8rem] font-medium leading-none text-[#a8b6c6]">|</span>
                  <span className="inline-flex items-center rounded-full border border-[#d7e2ee] bg-[#f8fbfe] px-4 py-2 text-[1rem] font-semibold text-[#35546c] shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                    Unit {unit.unit_number}
                  </span>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#6b7d93]">
                  Direct transaction control for onboarding, finance, transfer workflow, and the live purchase record.
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {[
                    {
                      label: buyer?.name ? buyer.name : 'Buyer pending',
                      icon: <UserRound size={14} className="text-current" />,
                      className: buyer?.name
                        ? 'border-[#d8e7f6] bg-[#f6fbff] text-[#35546c]'
                        : 'border-[#f3d6a4] bg-[#fff9ef] text-[#a56a16]',
                    },
                    {
                      label: mainStageLabel,
                      icon: <Building2 size={14} className="text-current" />,
                      className: 'border-[#d8e7f6] bg-[#f6fbff] text-[#35546c]',
                    },
                    {
                      label: unit?.status ? toTitleLabel(unit.status) : 'Unit active',
                      icon: <Building2 size={14} className="text-current" />,
                      className: 'border-[#dbe5ef] bg-white text-[#5a6f86]',
                    },
                    {
                      label: `Onboarding ${onboardingStatus}`,
                      icon: <Link2 size={14} className="text-current" />,
                      className: onboardingComplete
                        ? 'border-[#cfe8da] bg-[#effaf3] text-[#22824d]'
                        : 'border-[#d8e7f6] bg-[#f6fbff] text-[#35546c]',
                    },
                  ].map((chip) => (
                    <span
                      key={chip.label}
                      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[0.82rem] font-semibold shadow-[0_8px_20px_rgba(15,23,42,0.04)] ${chip.className}`}
                    >
                      {chip.icon}
                      {chip.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="no-print flex flex-wrap items-center gap-3 2xl:justify-end">
              <Button variant="secondary" className="min-w-[158px]" onClick={handlePrintTransactionReport}>
                <Printer size={14} />
                Print Report
              </Button>
              <Button variant="secondary" className="min-w-[198px]" onClick={handleOpenClientPortalLink} disabled={!clientPortalLink?.token}>
                <ExternalLink size={14} />
                Client Portal
              </Button>
              <Button className="min-w-[232px]" onClick={handleCopyOnboardingLink} disabled={!onboarding?.token}>
                <Link2 size={14} />
                Generate Onboarding Link
              </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {[
                [
                  'Current Stage',
                  mainStageLabel,
                  financeLabel === 'n/a' ? 'Finance not assigned yet' : `Finance: ${financeLabel}`,
                  <Building2 key="stage-icon" size={16} className="text-[#35546c]" />,
                ],
                [
                  'Purchase Price',
                  currency.format(purchasePriceValue || 0),
                  financeStatusLabel,
                  <CircleDollarSign key="price-icon" size={16} className="text-[#35546c]" />,
                ],
                [
                  'Onboarding',
                  onboardingStatus,
                  onboarding?.token ? 'Link ready to share' : 'Link not available yet',
                  <UserRound key="onboarding-icon" size={16} className="text-[#35546c]" />,
                ],
                [
                  'Time In Stage',
                  <StageAgingChip key="stage-age" stage={stage} updatedAt={transaction?.updated_at || transaction?.created_at} />,
                  `Updated ${formatDate(transaction?.updated_at || transaction?.created_at)}`,
                  <Clock3 key="time-icon" size={16} className="text-[#35546c]" />,
                ],
              ].map(([label, value, meta, icon]) => (
                <article key={label} className="rounded-[22px] border border-[#e0e8f1] bg-white/90 px-4 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{label}</span>
                      <strong className="mt-2 block text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">{value}</strong>
                      <span className="mt-1.5 block text-sm text-[#71839a]">{meta}</span>
                    </div>
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#edf4fb]">
                      {icon}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    >
      <div className="space-y-4">
        <section className="relative overflow-hidden rounded-[28px] border border-[#d8e3ef] bg-[linear-gradient(135deg,#edf4fb_0%,#e3edf8_48%,#f4f8fc_100%)] p-6 shadow-[0_20px_42px_rgba(15,23,42,0.08)]">
          <div className="pointer-events-none absolute -right-10 top-0 h-36 w-36 rounded-full bg-[rgba(53,84,108,0.08)] blur-3xl" />
          <div className="pointer-events-none absolute -left-8 bottom-0 h-32 w-32 rounded-full bg-[rgba(125,158,196,0.12)] blur-3xl" />

          <div className="relative z-[1]">
            <div className="rounded-[24px] border border-white/75 bg-white/72 px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-sm md:px-5">
              <ProgressTimeline currentStage={mainStage} stages={MAIN_PROCESS_STAGES} stageLabelMap={MAIN_STAGE_LABELS} framed={false} />
            </div>
          </div>
        </section>

        <section ref={workspaceMenuRef} className={`${PANEL_COMPACT} no-print`}>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
            <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Unit Workspace</h3>
            <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Post-registration workspace for handover, support activity, documents, and the completed purchase record.</p>
            </div>
            <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.74rem] font-semibold text-[#66758b]">
              {workspaceMenus.length} sections
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6" role="tablist" aria-label="Unit workspace tabs">
            {workspaceMenus.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeWorkspaceMenu === tab.id}
                className={[
                  'inline-flex min-h-[58px] flex-col items-center justify-center rounded-[18px] border px-4 py-3 text-sm font-semibold transition duration-150 ease-out',
                  activeWorkspaceMenu === tab.id
                    ? 'border-[#cfe1f7] bg-[#35546c] text-white shadow-[0_12px_28px_rgba(15,23,42,0.12)]'
                    : 'border-[#edf2f7] bg-[#f8fafc] text-[#4f647a] hover:border-[#dde4ee] hover:bg-white',
                ].join(' ')}
                onClick={() => setWorkspaceMenu(tab.id)}
              >
                <span>{tab.label}</span>
                {tab.meta ? <em className={`mt-1 text-[0.72rem] not-italic ${activeWorkspaceMenu === tab.id ? 'text-white/80' : 'text-[#8aa0b8]'}`}>{tab.meta}</em> : null}
              </button>
            ))}
          </div>
        </section>

        {activeWorkspaceMenu === 'overview' ? (
          <>
            <WorkspacePanel
              title="Unit Overview"
              copy="Post-registration summary, handover readiness, and the next operational move in one workspace."
              actions={
                <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                  {isRegisteredUnit ? 'Unit Active' : mainStage}
                </span>
              }
            >
              <div className="grid gap-3 lg:grid-cols-2">
                <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                  <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Current Unit Status</span>
                  <strong className="mt-2 block text-lg font-semibold text-[#142132]">{toTitleLabel(unit?.status || 'active')}</strong>
                  <p className="mt-2 text-sm leading-6 text-[#6b7d93]">
                    {isRegisteredUnit ? 'The purchase transaction is complete and the unit lifecycle is now active.' : `Detailed stage: ${stage}.`}
                  </p>
                </article>
                <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                  <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Next Step</span>
                  <strong className="mt-2 block text-lg font-semibold text-[#142132]">{nextWorkflowTitle}</strong>
                  <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{nextWorkflowDescription}</p>
                  <em className="mt-3 block text-[0.72rem] uppercase tracking-[0.12em] text-[#7b8ca2]">{nextWorkflowMeta}</em>
                </article>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Owner', ownerDisplayName],
                  ['Registered On', formatDate(registeredAt)],
                  ['Handover Status', toTitleLabel(handover?.status || 'not_started')],
                  ['Purchase Record', mainStageLabel],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                    <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                    <strong className="mt-2 block text-base font-semibold text-[#142132]">{value}</strong>
                  </article>
                ))}
              </div>
            </WorkspacePanel>

            {isBondLens ? workflowOverviewSection : null}

            {!isBondLens ? (
              <WorkspacePanel
                title="Occupational Rent"
                copy="Track early-occupation rent, due dates, and whether the client still needs to settle or upload proof of payment."
                actions={
                  <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                    {occupationalRentStatusLabel}
                  </span>
                }
                className="no-print"
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Monthly Rent', occupationalRentMonthlyLabel],
                    ['Rent Start', occupationalRentStartLabel],
                    ['Next Due', occupationalRentNextDueLabel],
                    ['Waived', occupationalRent?.waived ? 'Yes' : 'No'],
                  ].map(([label, value]) => (
                    <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                      <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                      <strong className="mt-2 block text-base font-semibold text-[#142132]">{value}</strong>
                    </article>
                  ))}
                </div>

                <form onSubmit={handleOccupationalRentSave} className="mt-4 grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Occupational Rent Applies</span>
                      <Field
                        as="select"
                        value={occupationalRentForm.enabled ? 'yes' : 'no'}
                        onChange={(event) => {
                          const enabled = event.target.value === 'yes'
                          setOccupationalRentForm((previous) => ({
                            ...previous,
                            enabled,
                            status: enabled ? previous.status || 'pending_setup' : 'not_applicable',
                          }))
                        }}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </Field>
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Status</span>
                      <Field
                        as="select"
                        value={occupationalRentForm.status}
                        onChange={(event) => updateOccupationalRentField('status', event.target.value)}
                        disabled={!occupationalRentForm.enabled}
                      >
                        {OCCUPATIONAL_RENT_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {toTitleLabel(status)}
                          </option>
                        ))}
                      </Field>
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Occupation Date</span>
                      <Field
                        type="date"
                        value={occupationalRentForm.occupationDate}
                        onChange={(event) => updateOccupationalRentField('occupationDate', event.target.value)}
                        disabled={!occupationalRentForm.enabled}
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Rent Start Date</span>
                      <Field
                        type="date"
                        value={occupationalRentForm.rentStartDate}
                        onChange={(event) => updateOccupationalRentField('rentStartDate', event.target.value)}
                        disabled={!occupationalRentForm.enabled}
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Monthly Amount</span>
                      <Field
                        type="number"
                        min="0"
                        step="0.01"
                        value={occupationalRentForm.monthlyAmount}
                        onChange={(event) => updateOccupationalRentField('monthlyAmount', event.target.value)}
                        placeholder="e.g. 12000"
                        disabled={!occupationalRentForm.enabled}
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Pro-rata Amount</span>
                      <Field
                        type="number"
                        min="0"
                        step="0.01"
                        value={occupationalRentForm.proRataAmount}
                        onChange={(event) => updateOccupationalRentField('proRataAmount', event.target.value)}
                        placeholder="Optional"
                        disabled={!occupationalRentForm.enabled}
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Next Due Date</span>
                      <Field
                        type="date"
                        value={occupationalRentForm.nextDueDate}
                        onChange={(event) => updateOccupationalRentField('nextDueDate', event.target.value)}
                        disabled={!occupationalRentForm.enabled}
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Waived</span>
                      <Field
                        as="select"
                        value={occupationalRentForm.waived ? 'yes' : 'no'}
                        onChange={(event) => updateOccupationalRentField('waived', event.target.value === 'yes')}
                        disabled={!occupationalRentForm.enabled}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </Field>
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Waiver Reason</span>
                      <Field
                        type="text"
                        value={occupationalRentForm.waiverReason}
                        onChange={(event) => updateOccupationalRentField('waiverReason', event.target.value)}
                        placeholder="Explain why rent was waived"
                        disabled={!occupationalRentForm.enabled || !occupationalRentForm.waived}
                      />
                    </label>

                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Notes</span>
                      <Field
                        as="textarea"
                        rows={3}
                        value={occupationalRentForm.notes}
                        onChange={(event) => updateOccupationalRentField('notes', event.target.value)}
                        placeholder="Add operational notes for rent collection or reconciliation..."
                        disabled={!occupationalRentForm.enabled}
                      />
                    </label>
                  </div>

                  <div className="flex justify-end border-t border-[#e6edf5] pt-4">
                    <Button type="submit" disabled={saving || !transaction?.id}>
                      Save Occupational Rent
                    </Button>
                  </div>
                </form>
              </WorkspacePanel>
            ) : null}

            <div className={`grid gap-4 ${!isAttorneyLens ? 'xl:grid-cols-2 xl:items-start' : ''}`}>
              <WorkspacePanel
                title="Comments & Updates"
                copy="Shared transaction updates visible to all participating roles with access to this workspace."
                className="no-print"
              >
                <div ref={discussionPanelRef}>
                  <div className="space-y-3">
                    {(transactionDiscussion || []).slice(0, 4).map((comment) => {
                      const commentBody = sanitizeCommentBody(comment.commentBody || comment.commentText, comment, {
                        buyer,
                        transactionParticipants,
                      })
                      const commentType = comment.discussionType || 'operational'
                      const commentAuthorName = resolveCommentAuthorName(comment, { buyer, transactionParticipants })
                      return (
                        <article key={comment.id} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                          <div>
                            <header className="mb-3 flex flex-wrap items-start gap-3">
                              <div className="min-w-0">
                                <strong className="block text-sm font-semibold text-[#142132]">{commentAuthorName}</strong>
                                <span className="text-xs text-[#7c8ea4]">{comment.authorRoleLabel || TRANSACTION_ROLE_LABELS[comment.authorRole] || 'Participant'}</span>
                              </div>
                              <small className="inline-flex items-center rounded-full border border-[#dde4ee] bg-white px-2.5 py-1 text-[0.72rem] font-semibold text-[#66758b]">
                                {toTitleLabel(commentType)}
                              </small>
                              <em className="ml-auto text-xs not-italic text-[#7c8ea4]">{formatDateTime(comment.createdAt)}</em>
                            </header>
                            <p className="text-sm leading-6 text-[#22384c]">{commentBody}</p>
                          </div>
                        </article>
                      )
                    })}
                    {!(transactionDiscussion || []).length ? (
                      <p className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                        No comments or updates posted yet.
                      </p>
                    ) : null}
                  </div>

                  <form onSubmit={handleAddDiscussion} className="mt-4 grid gap-4">
                    <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-end">
                      <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                        <span>Update Type</span>
                        <Field as="select" value={discussionType} onChange={(event) => setDiscussionType(event.target.value)}>
                          <option value="operational">Operational</option>
                          <option value="blocker">Blocker</option>
                          <option value="document">Document</option>
                          <option value="decision">Decision</option>
                          <option value="client">Client</option>
                        </Field>
                      </label>
                      <div className="flex justify-start md:justify-end">
                        <Button type="submit" disabled={saving || !discussionBody.trim() || !canCommentInWorkspace}>
                          Post Update
                        </Button>
                      </div>
                    </div>
                    <Field
                      as="textarea"
                      rows={4}
                      value={discussionBody}
                      onChange={(event) => setDiscussionBody(event.target.value)}
                      placeholder="Add a concise update for the shared transaction workspace..."
                    />
                    {!canCommentInWorkspace ? <p className="text-sm text-[#6b7d93]">Your current role can view updates but cannot post comments.</p> : null}
                  </form>
                </div>
              </WorkspacePanel>

              {!isAttorneyLens ? (
                <aside className="no-print">
                  <WorkspacePanel title="Role Assignments" copy="Keep sales, conveyancing, and finance ownership clean so the live transaction always points to the right people.">
                    {canEditCoreTransaction ? (
                      <form onSubmit={handleTransactionSave} className="grid gap-4">
                        <div className="flex flex-wrap gap-2">
                          {developmentModuleState.agent && agentOptions.length ? <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">{agentOptions.length} agents</span> : null}
                          {developmentModuleState.conveyancing && conveyancerOptions.length ? <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">{conveyancerOptions.length} conveyancers</span> : null}
                          {developmentModuleState.bond_originator && bondOriginatorOptions.length ? <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">{bondOriginatorOptions.length} bond originators</span> : null}
                        </div>

                        <div className="grid gap-3">
                          <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                            <div className="mb-4">
                              <h4 className="text-sm font-semibold text-[#142132]">Sales ownership</h4>
                              <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Assign the commercial owner for the deal.</p>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                          {developmentModuleState.agent && agentOptions.length ? (
                            <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                              <span>Development Agent</span>
                              <Field as="select" value={stageForm.assigned_agent_email || ''} onChange={(event) => handleAgentSelection(event.target.value)}>
                                <option value="">Select agent</option>
                                {agentOptions.map((item, index) => (
                                  <option key={`${item.email || item.name || 'agent'}-${index}`} value={item.email || item.name}>
                                    {item.name}{item.company ? ` • ${item.company}` : ''}
                                  </option>
                                ))}
                              </Field>
                            </label>
                          ) : null}

                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Assigned Agent</span>
                            <Field
                              type="text"
                              value={stageForm.assigned_agent}
                              onChange={(event) => setStageForm((previous) => ({ ...previous, assigned_agent: event.target.value }))}
                            />
                          </label>

                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Agent Email</span>
                            <Field
                              type="email"
                              value={stageForm.assigned_agent_email}
                              onChange={(event) => setStageForm((previous) => ({ ...previous, assigned_agent_email: event.target.value }))}
                            />
                          </label>
                            </div>
                          </section>

                          <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                            <div className="mb-4">
                              <h4 className="text-sm font-semibold text-[#142132]">Conveyancing ownership</h4>
                              <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Set the transfer team and its primary contact.</p>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                          {developmentModuleState.conveyancing && conveyancerOptions.length ? (
                            <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                              <span>Development Conveyancer</span>
                              <Field as="select" value={stageForm.assigned_attorney_email || ''} onChange={(event) => handleConveyancerSelection(event.target.value)}>
                                <option value="">Select conveyancer</option>
                                {conveyancerOptions.map((item, index) => (
                                  <option key={`${item.email || item.firmName || 'conveyancer'}-${index}`} value={item.email || item.firmName}>
                                    {item.firmName}{item.contactName ? ` • ${item.contactName}` : ''}
                                  </option>
                                ))}
                              </Field>
                            </label>
                          ) : null}

                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Attorney / Conveyancer</span>
                            <Field
                              type="text"
                              value={stageForm.attorney}
                              onChange={(event) => setStageForm((previous) => ({ ...previous, attorney: event.target.value }))}
                            />
                          </label>

                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Attorney Email</span>
                            <Field
                              type="email"
                              value={stageForm.assigned_attorney_email}
                              onChange={(event) => setStageForm((previous) => ({ ...previous, assigned_attorney_email: event.target.value }))}
                            />
                          </label>
                            </div>
                          </section>

                          <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                            <div className="mb-4">
                              <h4 className="text-sm font-semibold text-[#142132]">Finance ownership</h4>
                              <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Control the bond lane owner and who manages finance follow-through.</p>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                          {developmentModuleState.bond_originator && bondOriginatorOptions.length ? (
                            <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                              <span>Development Bond Originator</span>
                              <Field as="select" value={stageForm.assigned_bond_originator_email || ''} onChange={(event) => handleBondOriginatorSelection(event.target.value)}>
                                <option value="">Select bond originator</option>
                                {bondOriginatorOptions.map((item, index) => (
                                  <option key={`${item.email || item.name || 'originator'}-${index}`} value={item.email || item.name}>
                                    {item.name}{item.contactName ? ` • ${item.contactName}` : ''}
                                  </option>
                                ))}
                              </Field>
                            </label>
                          ) : null}

                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Bond Originator</span>
                            <Field
                              type="text"
                              value={stageForm.bond_originator}
                              onChange={(event) => setStageForm((previous) => ({ ...previous, bond_originator: event.target.value }))}
                            />
                          </label>

                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Bond Originator Email</span>
                            <Field
                              type="email"
                              value={stageForm.assigned_bond_originator_email}
                              onChange={(event) =>
                                setStageForm((previous) => ({
                                  ...previous,
                                  assigned_bond_originator_email: event.target.value,
                                }))
                              }
                            />
                          </label>

                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Finance Managed By</span>
                            <Field
                              as="select"
                              value={stageForm.finance_managed_by}
                              onChange={(event) => setStageForm((previous) => ({ ...previous, finance_managed_by: event.target.value }))}
                            >
                              {FINANCE_MANAGED_BY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option.replaceAll('_', ' ')}
                                </option>
                              ))}
                            </Field>
                          </label>
                            </div>
                          </section>
                        </div>

                        <div className="flex justify-end border-t border-[#e6edf5] pt-4">
                          <Button type="submit" disabled={saving || !canEditCoreTransaction}>
                            Save Role Assignments
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                        This role can view transaction ownership, but only internal users with core transaction permissions can change assignments.
                      </div>
                    )}
                  </WorkspacePanel>
                </aside>
              ) : null}
            </div>

            {!isBondLens ? workflowOverviewSection : null}

            <AttorneyCloseoutPanel
              transaction={transaction}
              unit={unit}
              buyer={buyer}
              visible={Boolean(isRegisteredUnit && canSeeAttorneyCloseout)}
            />

          </>
        ) : null}

        {activeWorkspaceMenu === 'progress' ? (
          <TransactionProgressPanel
            title="Transaction Progress"
            subtitle="A combined view of every workflow step and the latest workspace updates."
            mainStage={mainStage}
            subprocesses={transactionSubprocesses || []}
            comments={transactionDiscussion || []}
          />
        ) : null}

        {activeWorkspaceMenu === 'onboarding' ? (
          <div className="space-y-4">
            <WorkspacePanel
              title="Client Information"
              copy="Manage the buyer record, manual onboarding status, and the onboarding snapshot that drives routing and document requirements."
              actions={
                <div className="no-print flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    onClick={handleDownloadOnboardingDocument}
                    disabled={!onboardingFormData?.formData}
                  >
                    Download Onboarding
                  </Button>
                  {!onboardingComplete ? (
                    <Button variant="secondary" onClick={handleOpenOnboardingLink} disabled={!onboarding?.token}>
                      Open Onboarding
                    </Button>
                  ) : null}
                  <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                    {onboardingStatus}
                  </span>
                </div>
              }
            >
              {canEditCoreTransaction ? (
                <form onSubmit={handleClientInformationSave} className="mb-5 rounded-[18px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <div className="mb-4">
                    <h4 className="text-base font-semibold text-[#142132]">Manual Client Update</h4>
                    <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                      Use this when the client was onboarded outside the portal, or when a bulk stage edit needs the transaction and buyer record aligned manually.
                    </p>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                      <div className="mb-4">
                        <h5 className="text-sm font-semibold text-[#142132]">Buyer Record</h5>
                        <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Keep the core contact details current even if onboarding was handled manually.</p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="grid gap-2 text-sm font-medium text-[#35546c] md:col-span-2">
                          <span>Buyer Full Name</span>
                          <Field
                            type="text"
                            value={clientInfoForm.buyer_name}
                            onChange={(event) => setClientInfoForm((previous) => ({ ...previous, buyer_name: event.target.value }))}
                          />
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                          <span>Email Address</span>
                          <Field
                            type="email"
                            value={clientInfoForm.buyer_email}
                            onChange={(event) => setClientInfoForm((previous) => ({ ...previous, buyer_email: event.target.value }))}
                          />
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                          <span>Phone Number</span>
                          <Field
                            type="text"
                            value={clientInfoForm.buyer_phone}
                            onChange={(event) => setClientInfoForm((previous) => ({ ...previous, buyer_phone: event.target.value }))}
                          />
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                          <span>Purchaser Type</span>
                          <Field
                            as="select"
                            value={stageForm.purchaser_type}
                            onChange={(event) => setStageForm((previous) => ({ ...previous, purchaser_type: event.target.value }))}
                          >
                            {purchaserTypeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Field>
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                          <span>Onboarding Status</span>
                          <Field
                            as="select"
                            value={clientInfoForm.onboarding_status}
                            onChange={(event) => setClientInfoForm((previous) => ({ ...previous, onboarding_status: event.target.value }))}
                          >
                            {ONBOARDING_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </Field>
                        </label>
                      </div>
                    </section>

                    <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                      <div className="mb-4">
                        <h5 className="text-sm font-semibold text-[#142132]">Transaction Alignment</h5>
                        <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Realign the transaction when stage or finance values were changed in bulk elsewhere.</p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                          <span>Main Stage</span>
                          <Field
                            as="select"
                            value={stageForm.main_stage}
                            onChange={(event) => setStageForm((previous) => ({ ...previous, main_stage: event.target.value }))}
                          >
                            {MAIN_PROCESS_STAGES.map((stageOption) => (
                              <option key={stageOption} value={stageOption}>
                                {MAIN_STAGE_LABELS[stageOption] || stageOption}
                              </option>
                            ))}
                          </Field>
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                          <span>Finance Type</span>
                          <Field
                            as="select"
                            value={stageForm.finance_type}
                            onChange={(event) => setStageForm((previous) => ({ ...previous, finance_type: event.target.value }))}
                          >
                            {FINANCE_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type.replace(/\b\w/g, (match) => match.toUpperCase())}
                              </option>
                            ))}
                          </Field>
                        </label>

                        <label className="grid gap-2 text-sm font-medium text-[#35546c] md:col-span-2">
                          <span>Next Action</span>
                          <Field
                            type="text"
                            value={stageForm.next_action}
                            onChange={(event) => setStageForm((previous) => ({ ...previous, next_action: event.target.value }))}
                            placeholder="Capture the next move required on this transaction"
                          />
                        </label>
                      </div>
                    </section>
                  </div>

                  <div className="mt-4 flex justify-end border-t border-[#e6edf5] pt-4">
                    <Button type="submit" disabled={saving || !detail?.transaction?.id}>
                      Save Client Information
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="mb-5 rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                  This role can view client information, but only internal users with core transaction permissions can update it manually.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ['Purchaser', ownerDisplayName],
                  ['Purchaser Type', resolvedPurchaserTypeLabel],
                  ['Finance Type', financeLabel],
                  ['Purchase Price', currency.format(purchasePriceValue || 0)],
                  ['Registration Date', formatDate(registeredAt)],
                  ['Status', onboardingStatus],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                    <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                    <strong className="mt-2 block text-base font-semibold text-[#142132]">{value}</strong>
                  </article>
                ))}
              </div>

              {onboardingDerivedConfiguration?.summary?.headlineItems?.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {onboardingDerivedConfiguration.summary.headlineItems.map((item) => (
                    <article key={item.label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                      <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{item.label}</span>
                      <strong className="mt-2 block text-base font-semibold text-[#142132]">{item.value}</strong>
                    </article>
                  ))}
                </div>
              ) : null}
            </WorkspacePanel>

            <WorkspacePanel
              title="Conditional Logic Snapshot"
              copy="The routing decisions generated from the buyer type, purchasing structure, finance path, and employment answers."
            >
              {onboardingDerivedConfiguration?.derivedFields ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {Object.entries(onboardingDerivedConfiguration.derivedFields).map(([key, value]) => (
                    <article key={key} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                      <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{toTitleLabel(key)}</span>
                      <strong className="mt-2 block text-base font-semibold text-[#142132]">{formatOnboardingFieldValue(value)}</strong>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                  No conditional logic has been derived yet.
                </div>
              )}
            </WorkspacePanel>

            <WorkspacePanel
              title="Parties & Signatories"
              copy="Every person or entity captured through the onboarding logic and how they participate in the purchase."
            >
              {onboardingDerivedConfiguration?.parties?.length ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {onboardingDerivedConfiguration.parties.map((party, index) => (
                    <article key={`${party.name || party.role || 'party'}-${index}`} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                      <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{party.roleLabel || party.role || `Party ${index + 1}`}</span>
                      <strong className="mt-2 block text-base font-semibold text-[#142132]">{party.name || 'Not captured'}</strong>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {party.purchaser ? <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">Purchaser</span> : null}
                        {party.signatory ? <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">Signatory</span> : null}
                        {party.ficaRequired ? <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">FICA Required</span> : null}
                      </div>
                      {party.email || party.phone ? (
                        <p className="mt-3 text-sm leading-6 text-[#6b7d93]">
                          {[party.email, party.phone].filter(Boolean).join(' • ')}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                  No party structure has been derived yet.
                </div>
              )}
            </WorkspacePanel>

            <WorkspacePanel
              title="Workflow Routing"
              copy="The onboarding choices determine which workflow lanes are enabled and which documents are expected next."
            >
              {onboardingDerivedConfiguration?.workflows ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.entries(onboardingDerivedConfiguration.workflows).map(([key, workflow]) => (
                    <article key={key} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{toTitleLabel(key)}</span>
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-[0.72rem] font-semibold ${workflow?.enabled ? 'border border-[#d7ebdf] bg-[#ecfbf1] text-[#1c7d45]' : 'border border-[#e3ebf4] bg-[#f7f9fc] text-[#66758b]'}`}>
                          {workflow?.enabled ? 'Enabled' : 'Skipped'}
                        </span>
                      </div>
                      {workflow?.reason ? <p className="mt-3 text-sm leading-6 text-[#6b7d93]">{workflow.reason}</p> : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                  No workflow routing has been derived yet.
                </div>
              )}
            </WorkspacePanel>

            <WorkspacePanel
              title="Required Documents"
              copy="Document sets generated from the onboarding path so the team can see exactly what the client should be providing."
            >
              {Object.keys(requiredDocumentGroups).length ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {Object.entries(requiredDocumentGroups).map(([groupLabel, items]) => (
                    <article key={groupLabel} className="rounded-[18px] border border-[#e3ebf4] bg-white px-5 py-5">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-base font-semibold text-[#142132]">{groupLabel}</h4>
                        <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">
                          {items.length} items
                        </span>
                      </div>
                      <ul className="mt-4 grid gap-2">
                        {items.map((item, index) => (
                          <li key={`${groupLabel}-${item.documentKey || item.label || index}`} className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-3 text-sm text-[#22384c]">
                            <strong className="font-semibold text-[#142132]">{item.label || item.documentKey || 'Document'}</strong>
                            {item.description ? <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{item.description}</p> : null}
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                  No required document checklist has been derived yet.
                </div>
              )}
            </WorkspacePanel>

            <WorkspacePanel
              title="Submitted Fields"
              copy="Every answer captured from the onboarding form, grouped by the area it belongs to."
            >
              {onboardingFieldEntries.length ? (
                <div className="space-y-4">
                  {Object.entries(groupedOnboardingFields).map(([groupLabel, entries]) => (
                    <section key={groupLabel} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-5 py-5">
                      <h4 className="text-base font-semibold text-[#142132]">{groupLabel}</h4>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {entries.map(([key, value]) => (
                          <article key={key} className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-4">
                            <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{toTitleLabel(key)}</span>
                            <strong className="mt-2 block text-base font-semibold text-[#142132]">
                              {formatOnboardingFieldValue(value)}
                            </strong>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                  No onboarding information has been submitted yet.
                </div>
              )}
            </WorkspacePanel>

            <WorkspacePanel
              title="Logic Summary"
              copy="A plain-English summary of the onboarding path and the decisions it triggered."
            >
              {onboardingDerivedConfiguration?.summary?.lines?.length ? (
                <ul className="grid gap-2 text-sm text-[#22384c]">
                  {onboardingDerivedConfiguration.summary.lines.map((line) => (
                    <li key={line} className="rounded-[14px] border border-[#e3ebf4] bg-white px-4 py-3">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                  No onboarding summary is available yet.
                </div>
              )}
            </WorkspacePanel>
          </div>
        ) : null}

        {activeWorkspaceMenu === 'snags' ? (
          <WorkspacePanel
            title="Snags"
            copy="Track post-registration defects, snag items, and resolution status for this unit."
            className="no-print"
          >
            {developmentSettings?.snag_reporting_enabled ? (
              <ClientIssuesPanel
                embedded
                showHeader={false}
                issues={clientIssues || []}
                onUpdated={loadDetail}
                saving={saving}
                onSignOff={handleSignOffIssue}
              />
            ) : (
              <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                Snag reporting is not enabled for this development.
              </div>
            )}
          </WorkspacePanel>
        ) : null}

        {activeWorkspaceMenu === 'alterations' ? (
          <WorkspacePanel
            title="Alterations"
            copy="Manage owner change requests, review decisions, and supporting documents."
            className="no-print"
          >
            {developmentSettings?.alteration_requests_enabled ? (
              <AlterationRequestsPanel
                embedded
                showHeader={false}
                requests={alterationRequests || []}
                onUpdated={loadDetail}
                saving={saving}
                onCreate={handleCreateAlteration}
                creating={creatingAlteration}
                creationError={alterationCreationError}
                createDisabled={!transaction?.id}
                totalAmount={alterationTotalAmount}
              />
            ) : (
              <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                Alteration requests are not enabled for this development.
              </div>
            )}
          </WorkspacePanel>
        ) : null}

        {activeWorkspaceMenu === 'documents' ? (
          <>
            <WorkspacePanel
              title="Document Groups"
              copy="Live unit and handover documents remain editable, while purchase documents stay available as read-only acquisition history."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Purchase Record Documents', purchaseRecordDocuments.length],
                  ['Unit / Handover Documents', unitLifecycleDocuments.length],
                  ['Document Readiness', documentReadinessText],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                    <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                    <strong className="mt-2 block text-base font-semibold text-[#142132]">{value}</strong>
                  </article>
                ))}
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-5 py-5">
                  <h4 className="text-base font-semibold text-[#142132]">Unit &amp; Handover</h4>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Editable records and owner-facing handover material.</p>
                  {unitLifecycleDocuments.length ? (
                    <ul className="mt-4 grid gap-3">
                      {unitLifecycleDocuments.slice(0, 6).map((document) => (
                        <li key={document.id} className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3">
                          <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Untitled document'}</strong>
                          <span className="mt-1 block text-xs text-[#7c8ea4]">{document.category || 'General'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-4 rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                      No unit or handover documents uploaded yet.
                    </div>
                  )}
                </article>

                <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-5 py-5">
                  <h4 className="text-base font-semibold text-[#142132]">Purchase Record</h4>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Read-only documents retained from the completed acquisition.</p>
                  {purchaseRecordDocuments.length ? (
                    <ul className="mt-4 grid gap-3">
                      {purchaseRecordDocuments.slice(0, 6).map((document) => (
                        <li key={document.id} className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3">
                          <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Untitled document'}</strong>
                          <span className="mt-1 block text-xs text-[#7c8ea4]">{document.category || 'General'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-4 rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                      No completed purchase documents available yet.
                    </div>
                  )}
                </article>
              </div>
            </WorkspacePanel>

            <DocumentsPanel
              checklist={requiredDocumentChecklist || []}
              documents={documents}
              onSubmit={handleUpload}
              saving={saving}
              canUpload={Boolean(transaction?.id) && canUploadDocuments}
              documentCategory={documentCategory}
              setDocumentCategory={setDocumentCategory}
              markClientVisible={true}
              clientVisibleByDefault={clientVisibleByDefault}
              setClientVisibleByDefault={setClientVisibleByDefault}
              onToggleClientVisibility={handleToggleDocumentVisibility}
            />
          </>
        ) : null}

        {activeWorkspaceMenu === 'overview' && !isBondLens ? (
          <WorkspacePanel
            title="Workspace Access"
            copy="Keep buyer-facing links and external workspace access available without crowding the main transaction controls."
            className="no-print"
          >
            <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {!onboardingComplete ? (
                <>
                  <button
                    type="button"
                    onClick={handleCopyOnboardingLink}
                    disabled={!onboarding?.token}
                    className="group flex min-h-[78px] items-start gap-3 rounded-[18px] border border-[#dde4ee] bg-[#fbfcfe] px-4 py-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-white disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#eef4f9] text-[#35546c]">
                      <Copy size={16} />
                    </span>
                    <span className="block min-w-0">
                      <strong className="block text-sm font-semibold text-[#142132]">Copy Onboarding Link</strong>
                      <span className="mt-1 block text-sm leading-5 text-[#6b7d93]">Send the buyer onboarding form directly from here.</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenOnboardingLink}
                    disabled={!onboarding?.token}
                    className="group flex min-h-[78px] items-start gap-3 rounded-[18px] border border-[#dde4ee] bg-[#fbfcfe] px-4 py-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-white disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#eef4f9] text-[#35546c]">
                      <ExternalLink size={16} />
                    </span>
                    <span className="block min-w-0">
                      <strong className="block text-sm font-semibold text-[#142132]">Open Onboarding</strong>
                      <span className="mt-1 block text-sm leading-5 text-[#6b7d93]">Preview the onboarding flow exactly as the buyer sees it.</span>
                    </span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCopyStatusLink}
                    disabled={!transactionStatusLink?.token}
                    className="group flex min-h-[78px] items-start gap-3 rounded-[18px] border border-[#dde4ee] bg-[#fbfcfe] px-4 py-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-white disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#eef4f9] text-[#35546c]">
                      <Copy size={16} />
                    </span>
                    <span className="block min-w-0">
                      <strong className="block text-sm font-semibold text-[#142132]">Copy Status Link</strong>
                      <span className="mt-1 block text-sm leading-5 text-[#6b7d93]">Share the live buyer status page for this transaction.</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenStatusLink}
                    disabled={!transactionStatusLink?.token}
                    className="group flex min-h-[78px] items-start gap-3 rounded-[18px] border border-[#dde4ee] bg-[#fbfcfe] px-4 py-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-white disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#eef4f9] text-[#35546c]">
                      <ExternalLink size={16} />
                    </span>
                    <span className="block min-w-0">
                      <strong className="block text-sm font-semibold text-[#142132]">Open Status Page</strong>
                      <span className="mt-1 block text-sm leading-5 text-[#6b7d93]">Open the current buyer-facing status view in a new tab.</span>
                    </span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleHeadlineExternalAccessClick}
                className="group flex min-h-[78px] items-start gap-3 rounded-[18px] border border-[#d6e4f5] bg-[linear-gradient(180deg,#fafdff_0%,#f4f8fc_100%)] px-4 py-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.05)] transition duration-150 ease-out hover:border-[#bfd3ea] hover:bg-[linear-gradient(180deg,#ffffff_0%,#f3f8fd_100%)]"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#35546c] text-white shadow-[0_10px_24px_rgba(15,23,42,0.12)]">
                  <Link2 size={16} />
                </span>
                <span className="block min-w-0">
                  <strong className="block text-sm font-semibold text-[#142132]">Open Active External Link</strong>
                  <span className="mt-1 block text-sm leading-5 text-[#6b7d93]">Jump straight into the latest live external workspace.</span>
                </span>
              </button>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <ClientPortalAccessPanel
                developmentId={unit.development_id}
                unitId={unit.id}
                transactionId={transaction?.id}
                buyerId={buyer?.id || null}
                purchaserType={stageForm.purchaser_type || transaction?.purchaser_type || 'individual'}
                disabled={saving || !developmentSettings?.client_portal_enabled}
                onActiveLinkChange={setClientPortalLink}
              />

              <div className="space-y-4">
                {!developmentSettings?.client_portal_enabled ? (
                  <div className="rounded-[18px] border border-[#f6d4d4] bg-[#fff5f5] px-5 py-4 text-sm text-[#b42318]">
                    Client portal is currently disabled for this development.
                  </div>
                ) : null}

                <div id="external-access-panel">
                  <ExternalAccessPanel
                    transactionId={transaction?.id}
                    buyerId={buyer?.id || null}
                    buyerEmail={buyer?.email || ''}
                    disabled={saving}
                    onLinksChange={setExternalAccessLinks}
                  />
                </div>
              </div>
            </div>
          </WorkspacePanel>
        ) : null}
      </div>
    </SharedTransactionShell>
    )
  } catch {
    return workspaceFallback
  }

  return (
    <TransactionWorkspaceBoundary resetKey={unitId} fallback={workspaceFallback}>
      {workspaceContent}
    </TransactionWorkspaceBoundary>
  )
}

export default UnitDetail
