import {
  CalendarDays,
  AlertTriangle,
  Download,
  FileSignature,
  FileText,
  KeyRound,
  LayoutDashboard,
  Settings,
  Star,
  Users,
  Wrench,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import '../App.css'
import ProgressTimeline from '../components/ProgressTimeline'
import TransactionProgressPanel from '../components/TransactionProgressPanel'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet'
import {
  fetchClientPortalByToken,
  saveClientHandoverDraft,
  submitClientPortalComment,
  uploadClientPortalDocument,
  uploadOnboardingRequiredDocument,
  saveTrustInvestmentFormDraft,
  submitAlterationRequest,
  submitClientHandover,
  submitClientIssue,
  submitServiceReview,
  submitTrustInvestmentForm,
} from '../lib/api'
import {
  MAIN_PROCESS_STAGES,
  MAIN_STAGE_LABELS,
  getClientStageExplainer,
  getMainStageFromDetailedStage,
  getMainStageIndex,
} from '../lib/stages'

const ISSUE_CATEGORIES = [
  'Paint / Finishes',
  'Plumbing',
  'Electrical',
  'Doors / Windows',
  'Flooring',
  'Kitchen / Cupboards',
  'Bathroom',
  'Other',
]

const SALES_PORTAL_STEPS = [
  { key: 'avail', label: 'Unit Available' },
  { key: 'dep', label: 'Deposit Secured' },
  { key: 'otp', label: 'OTP Signed' },
]

const HANDOVER_PHOTO_FIELDS = [
  { key: 'electricity', label: 'Electricity meter photo', category: 'Handover / Electricity Meter' },
  { key: 'water', label: 'Water meter photo', category: 'Handover / Water Meter' },
  { key: 'gas', label: 'Gas meter photo', category: 'Handover / Gas Meter' },
]

function formatPortalStepStatus(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'in_progress') return 'In Progress'
  if (normalized === 'blocked') return 'Blocked'
  return 'Pending'
}

function formatPortalStepDate(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleDateString()
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

function getClientPortalDocumentGroup(document = {}) {
  const group = String(document.group || '').toLowerCase()
  const label = String(document.label || '').toLowerCase()
  const description = String(document.description || '').toLowerCase()
  const combined = `${group} ${label} ${description}`

  if (
    combined.includes('sale') ||
    combined.includes('otp') ||
    combined.includes('offer') ||
    combined.includes('reservation') ||
    combined.includes('mandate') ||
    combined.includes('instruction') ||
    combined.includes('information sheet')
  ) {
    return 'sales'
  }

  if (
    combined.includes('fica') ||
    combined.includes('identity') ||
    combined.includes('passport') ||
    combined.includes('address') ||
    combined.includes('fund') ||
    combined.includes('income') ||
    combined.includes('bank') ||
    combined.includes('tax')
  ) {
    return 'fica'
  }

  return 'additional'
}

function groupPortalRequiredDocuments(items = []) {
  return items.reduce(
    (groups, item) => {
      const bucket = getClientPortalDocumentGroup(item)
      groups[bucket].push(item)
      return groups
    },
    { sales: [], fica: [], additional: [] },
  )
}

function getDocumentDownloadLabel(document) {
  if (!document) return 'Download'
  if (String(document.uploaded_by_role || '').toLowerCase() === 'client') return 'View upload'
  return 'Download'
}

function escapePortalHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildOnboardingDocumentMarkup({
  portal,
  groupedOnboardingFields,
  purchasePriceLabel,
  onboardingStatus,
}) {
  const generatedAt = new Date().toLocaleString()
  const sectionMarkup = Object.entries(groupedOnboardingFields)
    .map(
      ([sectionLabel, entries]) => `
        <section class="section-card">
          <div class="section-head">
            <h3>${escapePortalHtml(sectionLabel)}</h3>
            <span>${entries.length} fields</span>
          </div>
          <div class="field-grid">
            ${entries
              .map(
                ([key, value]) => `
                  <article class="field-card">
                    <span>${escapePortalHtml(toTitleLabel(key))}</span>
                    <strong>${escapePortalHtml(formatOnboardingFieldValue(value))}</strong>
                  </article>
                `,
              )
              .join('')}
          </div>
        </section>
      `,
    )
    .join('')

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Bridge Onboarding Information</title>
      <style>
        :root {
          color-scheme: light;
          --ink: #142132;
          --muted: #6b7d93;
          --line: #dbe5ef;
          --soft: #f6f9fc;
          --panel: #fbfdff;
          --brand: #35546c;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #eef3f9;
          color: var(--ink);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .page {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background: white;
          padding: 18mm 16mm;
        }
        .brand {
          margin: 0;
          font-size: 12px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #6f8298;
          font-weight: 700;
        }
        .topbar {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: flex-start;
        }
        h1 {
          margin: 10px 0 6px;
          font-size: 32px;
          line-height: 1.05;
          letter-spacing: -0.04em;
        }
        .subtext {
          margin: 0;
          font-size: 15px;
          line-height: 1.6;
          color: var(--muted);
        }
        .meta {
          text-align: right;
          min-width: 180px;
        }
        .meta span {
          display: block;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #7b8ca2;
          font-weight: 700;
        }
        .meta strong {
          display: block;
          margin-top: 8px;
          font-size: 18px;
          line-height: 1.4;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-top: 24px;
        }
        .summary-card,
        .field-card,
        .section-card {
          border: 1px solid var(--line);
          border-radius: 18px;
          background: var(--panel);
        }
        .summary-card {
          padding: 14px 16px;
        }
        .summary-card span,
        .field-card span {
          display: block;
          font-size: 11px;
          line-height: 1.4;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #7b8ca2;
          font-weight: 700;
        }
        .summary-card strong {
          display: block;
          margin-top: 10px;
          font-size: 22px;
          line-height: 1.2;
          letter-spacing: -0.03em;
        }
        .content {
          display: grid;
          gap: 16px;
          margin-top: 18px;
        }
        .section-card {
          padding: 16px;
        }
        .section-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
        }
        .section-head h3 {
          margin: 0;
          font-size: 18px;
          line-height: 1.2;
          letter-spacing: -0.03em;
        }
        .section-head span {
          display: inline-flex;
          align-items: center;
          border: 1px solid var(--line);
          border-radius: 999px;
          padding: 7px 12px;
          font-size: 12px;
          color: var(--muted);
          background: white;
          font-weight: 600;
        }
        .field-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .field-card {
          padding: 14px 16px;
          background: white;
        }
        .field-card strong {
          display: block;
          margin-top: 8px;
          font-size: 14px;
          line-height: 1.7;
          word-break: break-word;
        }
        @media print {
          body { background: white; }
          .page { margin: 0; width: auto; min-height: auto; padding: 14mm 12mm; }
        }
      </style>
    </head>
    <body>
      <main class="page">
        <header class="topbar">
          <div>
            <p class="brand">Bridge</p>
            <h1>Onboarding Information</h1>
            <p class="subtext">${escapePortalHtml(portal?.unit?.development?.name || 'Development')} • Unit ${escapePortalHtml(
              portal?.unit?.unit_number || '—',
            )}</p>
            <p class="subtext">${escapePortalHtml(portal?.buyer?.name || 'Client')} • ${escapePortalHtml(onboardingStatus)}</p>
          </div>
          <div class="meta">
            <span>Generated</span>
            <strong>${escapePortalHtml(generatedAt)}</strong>
          </div>
        </header>
        <section class="summary-grid">
          <article class="summary-card">
            <span>Purchaser</span>
            <strong>${escapePortalHtml(portal?.buyer?.name || 'Client')}</strong>
          </article>
          <article class="summary-card">
            <span>Purchaser Type</span>
            <strong>${escapePortalHtml(
              toTitleLabel(portal?.transaction?.purchaser_type || portal?.onboardingFormData?.purchaserType || '—'),
            )}</strong>
          </article>
          <article class="summary-card">
            <span>Finance Type</span>
            <strong>${escapePortalHtml(
              toTitleLabel(portal?.transaction?.finance_type || portal?.onboardingFormData?.formData?.purchase_finance_type || '—'),
            )}</strong>
          </article>
          <article class="summary-card">
            <span>Purchase Price</span>
            <strong>${escapePortalHtml(purchasePriceLabel)}</strong>
          </article>
        </section>
        <section class="content">
          ${sectionMarkup || '<section class="section-card"><div class="field-card"><strong>No onboarding information has been submitted yet.</strong></div></section>'}
        </section>
      </main>
    </body>
  </html>`
}

const CLIENT_PORTAL_MENU = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'handover', label: 'Handover', icon: KeyRound },
  { key: 'snags', label: 'Snags', icon: Wrench },
  { key: 'settings', label: 'Settings', icon: Settings },
  { key: 'team', label: 'Team', icon: Users },
]

const CLIENT_WORKFLOW_EDUCATION_CONTENT = {
  sales: {
    title: 'Sales workflow',
    summary: 'This is the deal setup phase before the transaction moves into deeper finance and legal processing.',
    whatHappens: [
      'The team confirms reservation and offer details.',
      'Key commercial records are aligned and prepared for handover to specialist teams.',
      'Milestones are checked so finance and legal teams can start without delays.',
    ],
    timeframe: 'Usually a few working days, depending on how quickly supporting records are finalised.',
    defaultClientGuidance: 'You may be asked for document confirmations or signatures during this stage.',
  },
  finance: {
    title: 'Finance',
    summary: 'This stage focuses on bond and funding progression with the relevant finance parties.',
    whatHappens: [
      'The finance team reviews affordability and supporting records.',
      'Submissions are coordinated with lenders where required.',
      'The team tracks lender feedback and moves the file toward approval.',
    ],
    timeframe: 'Commonly 5-15 working days, depending on lender and documentation turnaround.',
    defaultClientGuidance: 'You may be asked for additional finance documents or confirmations.',
  },
  transfer: {
    title: 'Transfer',
    summary: 'This is the legal transfer phase where attorneys progress the transaction toward registration.',
    whatHappens: [
      'Transfer documents are prepared and reviewed.',
      'Legal clearances and supporting requirements are coordinated.',
      'The file progresses through transfer milestones and final registration.',
    ],
    timeframe: 'Often a few weeks, depending on legal processing and external turnaround times.',
    defaultClientGuidance: 'Client action is usually limited unless signatures or specific documents are requested.',
  },
  handover: {
    title: 'Handover',
    summary: 'This stage prepares final possession and practical handover of the property.',
    whatHappens: [
      'Handover scheduling and readiness checks are coordinated.',
      'Final inspections and meter readings are captured.',
      'Key collection and sign-off are prepared.',
    ],
    timeframe: 'Usually near the end of the transaction and scheduled as soon as readiness is confirmed.',
    defaultClientGuidance: 'You may need to confirm timing and complete final handover checks.',
  },
  snags: {
    title: 'Snags & aftercare',
    summary: 'This post-handover phase tracks defects and close-out items for the property.',
    whatHappens: [
      'Snag items are logged and assigned to the relevant team.',
      'Progress is tracked until each item is resolved.',
      'Completion updates are shared as issues are closed.',
    ],
    timeframe: 'Timeframes vary by issue type and contractor availability.',
    defaultClientGuidance: 'Action is usually limited to logging issues and confirming completion.',
  },
}

function getClientWorkflowGroupForMainStage(mainStage) {
  const normalized = String(mainStage || '').toUpperCase()
  if (['AVAIL', 'DEP', 'OTP'].includes(normalized)) return 'sales'
  if (normalized === 'FIN') return 'finance'
  if (['ATTY', 'XFER', 'REG'].includes(normalized)) return 'transfer'
  return 'sales'
}

function getClientPortalPath(token, sectionKey) {
  if (sectionKey === 'overview') return `/client/${token}`
  return `/client/${token}/${sectionKey}`
}

function formatClientPortalDate(value, fallback = 'Not set') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString()
}

function normalizePortalStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function getDaysInStageLabel(value) {
  if (!value) return 'In progress'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'In progress'
  const elapsedDays = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)))
  if (elapsedDays === 0) return 'Today'
  if (elapsedDays === 1) return '1 day'
  return `${elapsedDays} days`
}

function formatShortPortalDate(value, fallback = 'Recently') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

const CLIENT_ONBOARDING_COMPLETED_STATUSES = new Set([
  'submitted',
  'reviewed',
  'approved',
  'complete',
  'completed',
  'client_onboarding_complete',
])

function isClientOnboardingComplete(status) {
  return CLIENT_ONBOARDING_COMPLETED_STATUSES.has(normalizePortalStatus(status))
}

function resolveClientNextStepState({
  missingRequired,
  otpSignaturePending,
  onboardingStatus,
  occupationalRent,
  occupationalRentProofDocument,
  handoverStatus,
  mainStage,
  nextStage,
}) {
  const normalizedMainStage = String(mainStage || '').toUpperCase()
  const normalizedHandoverStatus = normalizePortalStatus(handoverStatus)
  const onboardingComplete = isClientOnboardingComplete(onboardingStatus)
  const occupationalRentProofPending =
    occupationalRent?.enabled &&
    occupationalRent?.status &&
    normalizePortalStatus(occupationalRent.status) !== 'settled' &&
    !occupationalRentProofDocument
  const documentUploadPending = missingRequired > 0 || occupationalRentProofPending
  const handoverPending =
    ['REG', 'XFER'].includes(normalizedMainStage) &&
    !['completed', 'closed'].includes(normalizedHandoverStatus)

  // 1. Awaiting Signature / Approval
  if (otpSignaturePending) {
    return {
      type: 'awaiting_signature_approval',
      label: 'Next Step',
      title: 'Signature or approval required',
      description: 'Please review and sign the pending document so your transaction can keep moving.',
      helperText: 'Your team is waiting for your sign-off before the next milestone can proceed.',
      ctaLabel: 'Review Document',
      ctaTo: 'documents',
      tone: 'action',
      requiresAction: true,
      clientActionCount: 1,
    }
  }

  // 2. Upload Documents
  if (missingRequired > 0) {
    return {
      type: 'upload_documents',
      label: 'Next Step',
      title: 'Upload required documents',
      description: `You still have ${missingRequired} required document${missingRequired === 1 ? '' : 's'} outstanding before the next stage can proceed.`,
      helperText: 'Please upload the outstanding items listed in your Documents section.',
      ctaLabel: 'Open Documents',
      ctaTo: 'documents',
      tone: 'action',
      requiresAction: true,
      clientActionCount: missingRequired,
    }
  }

  if (occupationalRentProofPending) {
    return {
      type: 'upload_documents',
      label: 'Next Step',
      title: 'Upload required documents',
      description: occupationalRent.nextDueDate
        ? `Please upload your latest occupational rent proof by ${formatClientPortalDate(occupationalRent.nextDueDate)}.`
        : 'Please upload your latest occupational rent proof so your team can continue.',
      helperText: 'We are waiting for your upload before moving this part of the transaction forward.',
      ctaLabel: 'Upload Proof',
      ctaTo: 'documents',
      tone: 'action',
      requiresAction: true,
      clientActionCount: 1,
    }
  }

  // 3. Complete Information / Onboarding
  if (!onboardingComplete) {
    return {
      type: 'complete_information',
      label: 'Next Step',
      title: 'Complete your information',
      description: 'We still need a few onboarding details from you before the team can continue.',
      helperText: 'Please complete your information sheet so the transaction can move to the next stage.',
      ctaLabel: 'Continue Information Sheet',
      ctaTo: 'onboarding',
      tone: 'action',
      requiresAction: true,
      clientActionCount: 1,
    }
  }

  // 4. Book / Confirm Handover
  if (handoverPending) {
    return {
      type: 'book_confirm_handover',
      label: 'Next Step',
      title: 'Prepare for handover',
      description: 'Your transaction is nearing completion. Please review handover details and confirm readiness.',
      helperText: 'Your team will finalize key timing and handover coordination with you here.',
      ctaLabel: 'View Handover',
      ctaTo: 'handover',
      tone: 'action',
      requiresAction: true,
      clientActionCount: 1,
    }
  }

  // 5. Awaiting Finance Outcome
  if (normalizedMainStage === 'FIN') {
    return {
      type: 'awaiting_finance_outcome',
      label: 'Next Step',
      title: 'Your finance application is in progress',
      description: 'The finance team is currently progressing your application and lender workflow.',
      helperText: 'No immediate action is required unless your team contacts you for a specific item.',
      ctaLabel: 'View Progress',
      ctaTo: 'overview',
      tone: 'in_progress',
      requiresAction: false,
      clientActionCount: 0,
    }
  }

  // 6. Awaiting Transfer / Legal Progress
  if (['ATTY', 'XFER', 'REG'].includes(normalizedMainStage)) {
    return {
      type: 'awaiting_transfer_legal_progress',
      label: 'Next Step',
      title: 'Your transfer is currently in progress',
      description: 'Your legal team is actively progressing the transfer process on your behalf.',
      helperText: 'No client action is required right now. We will let you know as soon as anything is needed.',
      ctaLabel: 'View Workflow',
      ctaTo: 'overview',
      tone: 'in_progress',
      requiresAction: false,
      clientActionCount: 0,
    }
  }

  // 7. No Action Required (fallback)
  return {
    type: 'no_action_required',
    label: 'Next Step',
    title: 'No action required from you right now',
    description: 'Your team is currently progressing the next steps in your transaction.',
    helperText: `Everything is on track. Next milestone: ${nextStage}.`,
    ctaLabel: 'View Progress',
    ctaTo: 'overview',
    tone: 'calm',
    requiresAction: false,
    clientActionCount: 0,
  }
}

function getJourneyProgressGradient(progressPercent) {
  if (progressPercent < 30) {
    return 'linear-gradient(90deg,#7d92a8_0%,#5c748d_100%)'
  }
  if (progressPercent < 60) {
    return 'linear-gradient(90deg,#4f82b7_0%,#376898_100%)'
  }
  if (progressPercent < 80) {
    return 'linear-gradient(90deg,#2f8c97_0%,#267681_100%)'
  }
  return 'linear-gradient(90deg,#2f8a64_0%,#23724f_100%)'
}

function normalizeHumanUpdateSummary(value) {
  const compact = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!compact) {
    return 'Your team posted a progress update.'
  }

  const firstSentence = compact.match(/^[^.?!]+[.?!]?/)
  const trimmed = String(firstSentence?.[0] || compact).trim()
  return trimmed.length > 170 ? `${trimmed.slice(0, 167).trimEnd()}...` : trimmed
}

function buildClientFacingUpdate(item) {
  const rawBody = String(item?.commentBody || item?.commentText || '')
    .replace(/\s+/g, ' ')
    .trim()
  const actorName = item?.authorName || 'Bridge Team'
  const actorRole = item?.authorRoleLabel || 'Bridge Team'
  const createdLabel = item?.createdAt ? new Date(item.createdAt).toLocaleString() : 'Recently'
  const contextLabel = `Updated by ${actorName} • ${actorRole} • ${createdLabel}`

  const stagePair = rawBody.match(/transaction stage updated:\s*(.+?)\s*changed to\s*(.+?)(?: by | at |$)/i)
  if (stagePair) {
    return {
      title: `Your transaction moved to ${stagePair[2]}`,
      summary: `Your team has completed ${stagePair[1]} and moved your purchase into the next milestone.`,
      contextLabel,
    }
  }

  const financeChange = rawBody.match(/finance workflow updated:\s*(.+?)(?: by | at |$)/i)
  if (financeChange) {
    return {
      title: 'Finance progress updated',
      summary: normalizeHumanUpdateSummary(financeChange[1]),
      contextLabel,
    }
  }

  const attorneyChange = rawBody.match(/attorney workflow updated:\s*(.+?)(?: by | at |$)/i)
  if (attorneyChange) {
    return {
      title: 'Transfer progress updated',
      summary: normalizeHumanUpdateSummary(attorneyChange[1]),
      contextLabel,
    }
  }

  if (String(item?.discussionType || '').toLowerCase() === 'system') {
    return {
      title: 'System progress update',
      summary: normalizeHumanUpdateSummary(rawBody),
      contextLabel,
    }
  }

  return {
    title: 'Update from your team',
    summary: normalizeHumanUpdateSummary(rawBody),
    contextLabel,
  }
}

function buildClientWhatsHappeningSummary({
  mainStage,
  nextStage,
  latestJourneyUpdates = [],
  nextStepState,
}) {
  const normalizedMainStage = String(mainStage || '').toUpperCase()

  const stageSummaryMap = {
    AVAIL: 'Your transaction is currently in the early sales preparation stage.',
    DEP: 'Your reservation and deposit phase is currently active.',
    OTP: 'Your transaction has moved into the offer-to-purchase stage.',
    FIN: 'Your file is currently moving through finance progression.',
    ATTY: 'Your file is now in legal transfer preparation.',
    XFER: 'Your transfer is actively progressing toward registration.',
    REG: 'Your transaction has reached registration and close-out progression.',
  }

  const teamFocusMap = {
    AVAIL: 'Your team is aligning the initial transaction setup so the process can move smoothly.',
    DEP: 'Your team is confirming reservation records and preparing the next deal milestones.',
    OTP: 'Your team is finalising signed deal records and preparing finance and legal handover.',
    FIN: 'The finance team is handling lender-side workflow and approvals.',
    ATTY: 'The legal team is preparing transfer documents and required legal milestones.',
    XFER: 'The attorney and transfer teams are coordinating final legal progression and registration readiness.',
    REG: 'Your team is finalising registration confirmations and close-out tasks.',
  }

  const latestSummary = latestJourneyUpdates[0]?.summary || null
  const fallbackSummary = nextStepState?.requiresAction
    ? `Once your current step is completed, your transaction can move to ${nextStage}.`
    : 'No immediate action is required from you right now. Your team is progressing the next steps.'

  return [
    stageSummaryMap[normalizedMainStage] || 'Your transaction is progressing through the current stage.',
    teamFocusMap[normalizedMainStage] || 'Your team is actively progressing this part of your transaction.',
    latestSummary ? `Latest update: ${latestSummary}` : fallbackSummary,
  ]
}

function ClientPortal() {
  const { token = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [portal, setPortal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [uploadingDocumentKey, setUploadingDocumentKey] = useState('')
  const [documentPanel, setDocumentPanel] = useState({ open: false, item: null })
  const [workflowEducationPanel, setWorkflowEducationPanel] = useState({ open: false, group: null })

  const [issueForm, setIssueForm] = useState({
    category: ISSUE_CATEGORIES[0],
    description: '',
    location: '',
    priority: '',
  })
  const [alterationForm, setAlterationForm] = useState({
    title: '',
    category: '',
    description: '',
    budgetRange: '',
    preferredTiming: '',
  })
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    reviewText: '',
    positives: '',
    improvements: '',
    allowMarketingUse: false,
  })
  const [trustForm, setTrustForm] = useState({
    attorneyFirmName: '',
    purchaserFullName: '',
    purchaserIdentityOrRegistrationNumber: '',
    fullName: '',
    identityOrRegistrationNumber: '',
    incomeTaxNumber: '',
    southAfricanResident: null,
    physicalAddress: '',
    postalAddress: '',
    telephoneNumber: '',
    faxNumber: '',
    balanceTo: '',
    bankName: '',
    accountNumber: '',
    branchNumber: '',
    sourceOfFunds: '',
    declarationAccepted: false,
    signatureName: '',
    signedDate: '',
  })
  const [handoverForm, setHandoverForm] = useState({
    handoverDate: '',
    electricityMeterReading: '',
    waterMeterReading: '',
    gasMeterReading: '',
    inspectionCompleted: false,
    keysHandedOver: false,
    remoteHandedOver: false,
    manualsHandedOver: false,
    notes: '',
    signatureName: '',
  })
  const [handoverPhotoFiles, setHandoverPhotoFiles] = useState({
    electricity: null,
    water: null,
    gas: null,
  })

  const requestedSection = useMemo(() => {
    if (location.pathname.endsWith('/progress')) return 'progress'
    if (location.pathname.endsWith('/documents') || location.pathname.endsWith('/forms/trust-investment')) return 'documents'
    if (location.pathname.endsWith('/onboarding')) return 'onboarding'
    if (location.pathname.endsWith('/handover')) return 'handover'
    if (location.pathname.endsWith('/homeowner')) return 'handover'
    if (location.pathname.endsWith('/snags') || location.pathname.endsWith('/issues')) return 'snags'
    if (location.pathname.endsWith('/settings')) return 'settings'
    if (location.pathname.endsWith('/team')) return 'team'
    if (location.pathname.endsWith('/alterations')) return 'alterations'
    if (location.pathname.endsWith('/review')) return 'review'
    return 'overview'
  }, [location.pathname])

  const loadPortal = useCallback(async () => {
    if (!token) {
      setError('Missing client portal token.')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      const data = await fetchClientPortalByToken(token)
      setPortal(data)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadPortal()
  }, [loadPortal])

  function handleDownloadOnboardingSummary() {
    try {
      setError('')
      const markup = buildOnboardingDocumentMarkup({
        portal,
        groupedOnboardingFields,
        purchasePriceLabel,
        onboardingStatus,
      })
      const blob = new Blob([markup], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const printWindow = window.open(url, '_blank', 'noopener,noreferrer')

      if (!printWindow) {
        setError('Unable to open the onboarding document. Please allow pop-ups and try again.')
        URL.revokeObjectURL(url)
        return
      }

      const cleanup = () => {
        window.setTimeout(() => URL.revokeObjectURL(url), 4000)
      }

      printWindow.addEventListener?.('load', () => {
        printWindow.focus()
        cleanup()
      })
    } catch (downloadError) {
      setError(downloadError.message || 'Unable to download onboarding information right now.')
    }
  }

  async function handleSubmitIssue(event) {
    event.preventDefault()
    const file = event.currentTarget.photo?.files?.[0] || null

    try {
      setSaving(true)
      setError('')
      await submitClientIssue({ token, ...issueForm, photoFile: file })
      setIssueForm({ category: ISSUE_CATEGORIES[0], description: '', location: '', priority: '' })
      event.currentTarget.reset()
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitAlteration(event) {
    event.preventDefault()
    const file = event.currentTarget.referenceImage?.files?.[0] || null

    try {
      setSaving(true)
      setError('')
      await submitAlterationRequest({ token, ...alterationForm, referenceImageFile: file })
      setAlterationForm({ title: '', category: '', description: '', budgetRange: '', preferredTiming: '' })
      event.currentTarget.reset()
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitReview(event) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')
      await submitServiceReview({ token, ...reviewForm })
      setReviewForm({
        rating: 5,
        reviewText: '',
        positives: '',
        improvements: '',
        allowMarketingUse: false,
      })
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitPortalComment(event) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')
      await submitClientPortalComment({
        token,
        commentText: commentDraft,
      })
      setCommentDraft('')
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUploadRequiredDocument(documentKey, file) {
    if (!file) {
      return
    }

    try {
      setUploadingDocumentKey(documentKey)
      setError('')
      await uploadOnboardingRequiredDocument({
        token,
        documentKey,
        file,
      })
      await loadPortal()
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setUploadingDocumentKey('')
    }
  }

  async function handleUploadOccupationalRentProof(file) {
    if (!file) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await uploadClientPortalDocument({
        token,
        file,
        category: 'Occupational Rent / Proof of Payment',
      })
      await submitClientPortalComment({
        token,
        commentText: 'Uploaded occupational rent proof of payment.',
      })
      await loadPortal()
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!portal?.trustInvestmentForm) {
      return
    }

    setTrustForm({
      attorneyFirmName: portal.trustInvestmentForm.attorneyFirmName || '',
      purchaserFullName: portal.trustInvestmentForm.purchaserFullName || portal.buyer?.name || '',
      purchaserIdentityOrRegistrationNumber: portal.trustInvestmentForm.purchaserIdentityOrRegistrationNumber || '',
      fullName: portal.trustInvestmentForm.fullName || portal.buyer?.name || '',
      identityOrRegistrationNumber: portal.trustInvestmentForm.identityOrRegistrationNumber || '',
      incomeTaxNumber: portal.trustInvestmentForm.incomeTaxNumber || '',
      southAfricanResident:
        portal.trustInvestmentForm.southAfricanResident === true || portal.trustInvestmentForm.southAfricanResident === false
          ? portal.trustInvestmentForm.southAfricanResident
          : null,
      physicalAddress: portal.trustInvestmentForm.physicalAddress || '',
      postalAddress: portal.trustInvestmentForm.postalAddress || '',
      telephoneNumber: portal.trustInvestmentForm.telephoneNumber || portal.buyer?.phone || '',
      faxNumber: portal.trustInvestmentForm.faxNumber || '',
      balanceTo: portal.trustInvestmentForm.balanceTo || '',
      bankName: portal.trustInvestmentForm.bankName || '',
      accountNumber: portal.trustInvestmentForm.accountNumber || '',
      branchNumber: portal.trustInvestmentForm.branchNumber || '',
      sourceOfFunds: portal.trustInvestmentForm.sourceOfFunds || '',
      declarationAccepted: Boolean(portal.trustInvestmentForm.declarationAccepted),
      signatureName: portal.trustInvestmentForm.signatureName || portal.buyer?.name || '',
      signedDate: portal.trustInvestmentForm.signedDate || '',
    })
  }, [portal])

  useEffect(() => {
    if (!portal?.handover) {
      return
    }

    setHandoverForm({
      handoverDate: portal.handover.handoverDate || '',
      electricityMeterReading: portal.handover.electricityMeterReading || '',
      waterMeterReading: portal.handover.waterMeterReading || '',
      gasMeterReading: portal.handover.gasMeterReading || '',
      inspectionCompleted: Boolean(portal.handover.inspectionCompleted),
      keysHandedOver: Boolean(portal.handover.keysHandedOver),
      remoteHandedOver: Boolean(portal.handover.remoteHandedOver),
      manualsHandedOver: Boolean(portal.handover.manualsHandedOver),
      notes: portal.handover.notes || '',
      signatureName: portal.handover.signatureName || portal.buyer?.name || '',
    })
  }, [portal])

  function updateTrustField(field, value) {
    setTrustForm((previous) => ({ ...previous, [field]: value }))
  }

  async function handleTrustFormSave() {
    try {
      setSaving(true)
      setError('')
      await saveTrustInvestmentFormDraft({
        token,
        form: trustForm,
      })
      await loadPortal()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleTrustFormSubmit() {
    try {
      setSaving(true)
      setError('')
      await submitTrustInvestmentForm({
        token,
        form: trustForm,
      })
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  function updateHandoverField(field, value) {
    setHandoverForm((previous) => ({ ...previous, [field]: value }))
  }

  async function handleHandoverSave() {
    try {
      setSaving(true)
      setError('')
      await saveClientHandoverDraft({
        token,
        handover: handoverForm,
      })
      for (const field of HANDOVER_PHOTO_FIELDS) {
        const file = handoverPhotoFiles[field.key]
        if (!file) continue
        await uploadClientPortalDocument({
          token,
          file,
          category: field.category,
        })
      }
      setHandoverPhotoFiles({
        electricity: null,
        water: null,
        gas: null,
      })
      await loadPortal()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleHandoverComplete() {
    try {
      setSaving(true)
      setError('')
      await submitClientHandover({
        token,
        handover: handoverForm,
      })
      for (const field of HANDOVER_PHOTO_FIELDS) {
        const file = handoverPhotoFiles[field.key]
        if (!file) continue
        await uploadClientPortalDocument({
          token,
          file,
          category: field.category,
        })
      }
      setHandoverPhotoFiles({
        electricity: null,
        water: null,
        gas: null,
      })
      await loadPortal()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  const sectionEnabled = {
    overview: true,
    progress: false,
    onboarding: true,
    documents: true,
    handover: true,
    snags: Boolean(portal?.settings?.snag_reporting_enabled),
    settings: true,
    team: true,
    alterations: Boolean(portal?.settings?.alteration_requests_enabled),
    review: Boolean(portal?.settings?.service_reviews_enabled),
  }

  const activeSection = sectionEnabled[requestedSection] ? requestedSection : 'overview'

  useEffect(() => {
    if (portal && requestedSection !== activeSection) {
      navigate(`/client/${token}`, { replace: true })
    }
  }, [activeSection, navigate, portal, requestedSection, token])

  if (loading) {
    return <p className="status-message portal-shell">Loading client portal...</p>
  }

  if (error || !portal) {
    return (
      <main className="client-portal-shell">
        <section className="client-portal-card">
          <h1>Client Property Portal</h1>
          <p className="status-message error">{error || 'Unable to load portal data.'}</p>
        </section>
      </main>
    )
  }

  const mainStage = portal.mainStage || getMainStageFromDetailedStage(portal.stage)
  const stageExplainer = getClientStageExplainer(mainStage)

  const stageIndex = getMainStageIndex(mainStage)
  const progressPercent = Math.round(((stageIndex + 1) / MAIN_PROCESS_STAGES.length) * 100)
  const nextStageKey = stageIndex < MAIN_PROCESS_STAGES.length - 1 ? MAIN_PROCESS_STAGES[stageIndex + 1] : 'Completed'
  const nextStage = nextStageKey === 'Completed' ? 'Completed' : MAIN_STAGE_LABELS[nextStageKey]
  const missingRequired = Math.max(
    Number(portal.requiredDocumentSummary?.totalRequired || 0) - Number(portal.requiredDocumentSummary?.uploadedCount || 0),
    0,
  )
  const financeProcess = portal?.subprocesses?.find((item) => item.process_type === 'finance') || null
  const attorneyProcess = portal?.subprocesses?.find((item) => item.process_type === 'attorney') || null
  const activeProcess =
    mainStage === 'FIN'
      ? financeProcess
      : ['ATTY', 'XFER', 'REG'].includes(mainStage)
        ? attorneyProcess
        : null
  const currentLane =
    mainStage === 'FIN'
      ? {
          title: 'Finance Workflow',
          owner: 'Bond Originator',
          currentStep: financeProcess?.summary?.waitingStep?.step_label || 'Finance review in progress',
          summary: financeProcess?.summary?.summaryText || 'Your bond or funding checks are currently being managed.',
          progressLabel: financeProcess?.summary
            ? `${financeProcess.summary.completedSteps}/${financeProcess.summary.totalSteps} completed`
            : 'In progress',
          activeLabel: financeProcess?.steps?.filter((step) => ['in_progress', 'blocked'].includes(step.status)).length || 0,
        }
      : ['ATTY', 'XFER', 'REG'].includes(mainStage)
        ? {
            title: 'Transfer Workflow',
            owner: 'Attorney / Conveyancer',
            currentStep: attorneyProcess?.summary?.waitingStep?.step_label || 'Transfer preparation in progress',
            summary: attorneyProcess?.summary?.summaryText || 'Your attorneys are progressing the legal transfer workflow.',
            progressLabel: attorneyProcess?.summary
              ? `${attorneyProcess.summary.completedSteps}/${attorneyProcess.summary.totalSteps} completed`
              : 'In progress',
            activeLabel: attorneyProcess?.steps?.filter((step) => ['in_progress', 'blocked'].includes(step.status)).length || 0,
          }
        : {
            title: 'Sales Workflow',
            owner: 'Sales Team',
            currentStep: stageExplainer.clientLabel,
            summary:
              'Your sales team is still guiding the deal through reservation and OTP milestones before it moves deeper into the process.',
            progressLabel: `Stage ${stageIndex + 1} of ${MAIN_PROCESS_STAGES.length}`,
            activeLabel: 1,
          }
  const workflowSteps =
    activeProcess?.steps?.length
      ? activeProcess.steps.map((step) => ({
          key: step.id || step.step_key,
          label: step.step_label,
          status: step.status,
          date: step.completed_at || step.updated_at || null,
        }))
      : SALES_PORTAL_STEPS.map((step, index) => {
          const completedThreshold = Math.min(stageIndex, SALES_PORTAL_STEPS.length - 1)
          const status = index < completedThreshold ? 'completed' : index === completedThreshold ? 'in_progress' : 'pending'
          return {
            key: step.key,
            label: step.label,
            status,
            date: null,
          }
        })

  const isOverview = activeSection === 'overview'
  const isOnboarding = activeSection === 'onboarding'
  const isDocuments = activeSection === 'documents'
  const isHandover = activeSection === 'handover'
  const isSnags = activeSection === 'snags'
  const isSettings = activeSection === 'settings'
  const isTeam = activeSection === 'team'
  const isAlterations = activeSection === 'alterations'
  const isReview = activeSection === 'review'

  const trustFormStatus = portal?.trustInvestmentForm?.status || 'Not Started'
  const trustFormSubmittedAt = portal?.trustInvestmentForm?.submittedAt || null
  const trustFormActionLabel =
    trustFormStatus === 'Not Started'
      ? 'Complete Form'
      : trustFormStatus === 'In Progress'
        ? 'Continue Form'
        : 'View Submitted Form'
  const trustFormLocked = trustFormStatus === 'Approved'
  const handoverStatus = portal?.handover?.status || 'not_started'
  const handoverCompleted = handoverStatus === 'completed'
  const onboardingFieldEntries = Object.entries(portal?.onboardingFormData?.formData || {})
    .filter(([key]) => !isOnboardingMetaKey(key))
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
  const groupedOnboardingFields = groupOnboardingFieldEntries(onboardingFieldEntries)
  const onboardingStatus = portal?.onboardingFormData?.status || 'In Progress'
  const purchasePriceValue = Number(portal?.transaction?.purchase_price || portal?.transaction?.sales_price || portal?.unit?.price || 0)
  const purchasePriceLabel = purchasePriceValue
    ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(purchasePriceValue)
    : '—'
  const portalRequiredDocuments = portal?.requiredDocuments || []
  const groupedPortalRequiredDocuments = groupPortalRequiredDocuments(portalRequiredDocuments)
  const uploadRequestDocuments = [...groupedPortalRequiredDocuments.fica, ...groupedPortalRequiredDocuments.additional]
  const sharedSalesDocuments = (portal?.documents || []).filter((document) => String(document.uploaded_by_role || '').toLowerCase() !== 'client')
  const clientUploadedDocuments = (portal?.documents || []).filter((document) => String(document.uploaded_by_role || '').toLowerCase() === 'client')
  const portalDocumentsById = new Map((portal?.documents || []).map((document) => [String(document.id), document]))
  const handoverMeterDocuments = HANDOVER_PHOTO_FIELDS.map((field) => ({
    ...field,
    document:
      (portal?.documents || []).find((item) => String(item.category || '').toLowerCase() === field.category.toLowerCase()) || null,
  }))
  const occupationalRent = portal?.occupationalRent || null
  const occupationalRentProofDocument =
    (portal?.documents || []).find((item) =>
      /occupational rent|occupation rent/i.test(`${item?.category || ''} ${item?.name || ''}`) &&
      /proof of payment/i.test(`${item?.category || ''} ${item?.name || ''}`),
    ) || null
  const snagOpenCount = (portal?.issues || []).filter((item) => !['resolved', 'closed', 'completed'].includes(String(item.status || '').toLowerCase()))
    .length
  const snagResolvedCount = Math.max((portal?.issues || []).length - snagOpenCount, 0)
  const activeDocumentPanel = documentPanel.item
  const latestUpdates = (portal?.discussion || []).slice(0, 4)
  const latestJourneyUpdates = latestUpdates.map((item) => buildClientFacingUpdate(item))
  const otpSignaturePending = portalRequiredDocuments.some((item) => {
    if (item.complete) return false
    const haystack = `${item.key || ''} ${item.label || ''} ${item.description || ''}`.toLowerCase()
    return /otp|offer to purchase/.test(haystack) && /sign|signature|signed/.test(haystack)
  })
  const nextStepState = resolveClientNextStepState({
    missingRequired,
    otpSignaturePending,
    onboardingStatus,
    occupationalRent,
    occupationalRentProofDocument,
    handoverStatus,
    mainStage,
    nextStage,
  })
  const whatsHappeningSummary = buildClientWhatsHappeningSummary({
    mainStage,
    nextStage,
    latestJourneyUpdates,
    nextStepState,
  })
  const totalCommentsCount = (portal?.discussion || []).length
  const outstandingActionCount = Number(nextStepState?.clientActionCount || 0)
  const journeyStatusLabel = outstandingActionCount > 0
    ? `${outstandingActionCount} item${outstandingActionCount === 1 ? '' : 's'} waiting on you`
    : 'Everything is on track'
  const journeyStatusCopy = outstandingActionCount > 0
    ? 'Complete the outstanding item(s) to keep your purchase moving without delay.'
    : 'No client action is needed right now. Your team is currently handling the next steps.'
  const journeyProgressGradient = getJourneyProgressGradient(progressPercent)
  const teamMembers = [
    {
      title: 'Sales Team',
      name: portal?.transaction?.assigned_agent || portal?.unit?.development?.developer_company || 'Bridge Sales',
      detail: portal?.transaction?.assigned_agent_email || 'Handles deal updates and coordination.',
    },
    {
      title: 'Attorney / Conveyancer',
      name: portal?.transaction?.attorney || 'Attorney / Conveyancer',
      detail: portal?.transaction?.assigned_attorney_email || 'Manages transfer preparation and lodgement.',
    },
    {
      title: 'Bond Originator',
      name: portal?.transaction?.bond_originator || 'Bond Originator',
      detail: portal?.transaction?.assigned_bond_originator_email || 'Supports finance approvals and lender feedback.',
    },
    {
      title: 'Bridge Support',
      name: portal?.unit?.development?.developer_company || 'Bridge Operations',
      detail: 'Keeps the transaction workspace, documents, and handover records aligned.',
    },
  ]
  const visibleMenuItems = CLIENT_PORTAL_MENU.filter((item) => item.key !== 'snags' || portal?.settings?.snag_reporting_enabled)
  const sidebarStatusByKey = {
    documents: missingRequired > 0 ? `${missingRequired} required` : 'Ready',
    snags: portal?.settings?.snag_reporting_enabled ? `${snagOpenCount} open` : null,
  }
  const activeMenuItem = visibleMenuItems.find((item) => item.key === activeSection) || CLIENT_PORTAL_MENU[0]
  const activeSectionLabel =
    activeSection === 'onboarding'
      ? 'Onboarding'
      : activeSection === 'alterations'
        ? 'Alterations'
        : activeSection === 'review'
          ? 'Review'
          : activeMenuItem.label
  const developmentName = portal?.unit?.development?.name || 'Development'
  const unitLabel = portal?.unit?.unit_number ? `Unit ${portal.unit.unit_number}` : 'Unit'
  const buyerName = portal?.buyer?.name || 'Client'
  const transactionReference = portal?.transaction?.property_reference || portal?.transaction?.reference || portal?.transaction?.id
  const overviewStatusLabel = ['REGISTERED', 'REG'].includes(mainStage) ? 'Registered' : 'In Progress'
  const stageUpdatedAt = portal?.transaction?.stage_updated_at || portal?.lastUpdated || portal?.transaction?.updated_at || null
  const timeInStageLabel = getDaysInStageLabel(stageUpdatedAt)
  const stageUpdatedDateLabel = formatShortPortalDate(stageUpdatedAt)
  const activeWorkflowEducationGroup = workflowEducationPanel.group
  const currentWorkflowGroupId = getClientWorkflowGroupForMainStage(mainStage)
  const activeWorkflowEducationContent = activeWorkflowEducationGroup
    ? CLIENT_WORKFLOW_EDUCATION_CONTENT[activeWorkflowEducationGroup.id] || {
        title: activeWorkflowEducationGroup.label || 'Workflow stage',
        summary: 'This stage is currently part of your transaction workflow.',
        whatHappens: ['Your team is progressing this section based on the current file status.'],
        timeframe: 'Timing can vary depending on dependencies and external turnaround.',
        defaultClientGuidance: 'Your team will notify you if action is needed from you.',
      }
    : null
  const activeWorkflowClientGuidance =
    activeWorkflowEducationGroup && activeWorkflowEducationGroup.id === currentWorkflowGroupId && nextStepState.requiresAction
      ? `Action may be required from you in this stage: ${nextStepState.title}.`
      : activeWorkflowEducationContent?.defaultClientGuidance || 'No action is usually required from you right now.'
  const nextStepToneClasses =
    nextStepState.tone === 'action'
      ? {
          container: 'border-[#eed8b5] bg-[linear-gradient(180deg,#fffaf2_0%,#fffdf8_100%)]',
          pill: 'border-[#f0d8ae] bg-[#fff6e7] text-[#9a5b0f]',
          button: 'bg-[#d97706] text-white hover:bg-[#b15f07]',
        }
      : nextStepState.tone === 'in_progress'
        ? {
            container: 'border-[#dbe5ef] bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_100%)]',
            pill: 'border-[#d6e3f1] bg-[#eef5fb] text-[#35546c]',
            button: 'border border-[#d1deeb] bg-white text-[#35546c] hover:border-[#b7c8da] hover:text-[#24384a]',
          }
        : {
            container: 'border-[#d4e8dc] bg-[linear-gradient(180deg,#f6fcf8_0%,#ffffff_100%)]',
            pill: 'border-[#cfe4d8] bg-[#eef9f2] text-[#2f7a51]',
            button: 'border border-[#d1deeb] bg-white text-[#35546c] hover:border-[#b7c8da] hover:text-[#24384a]',
          }

  return (
    <main className="min-h-screen bg-[#f3f6fb] text-[#142132]">
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col overflow-y-auto bg-[#152432] px-5 py-4 text-slate-100 [background-image:radial-gradient(circle_at_18%_-6%,rgba(108,152,193,0.18)_0%,transparent_34%),linear-gradient(180deg,#243c4f_0%,#152432_100%)] lg:flex">
          <div className="border-b border-white/10 pb-3 pt-[1.2rem]">
            <h1 className="text-[3rem] font-bold leading-none tracking-[-0.05em] text-[#f8fbff]">bridge.</h1>
            <p className="mt-2.5 text-[0.82rem] tracking-[0.02em] text-[#c8d5e3]">Client Transaction Workspace</p>
          </div>

          <nav className="mt-4 grid gap-1 pb-4">
            {visibleMenuItems.map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.key
              const navStatus = sidebarStatusByKey[item.key]

              return (
                <Link
                  key={item.key}
                  to={getClientPortalPath(token, item.key)}
                  className={[
                    'relative flex min-h-[46px] items-center gap-3 rounded-[14px] border px-3 py-2 text-[0.92rem] font-medium transition duration-150 ease-out',
                    isActive
                      ? 'border-[rgba(52,211,153,0.42)] bg-[rgba(2,6,23,0.25)] text-white shadow-[inset_3px_0_0_#2fd18a]'
                      : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white',
                  ].join(' ')}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                  {navStatus ? (
                    <span
                      className={`ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[0.66rem] font-semibold ${
                        isActive
                          ? 'border-white/40 bg-white/15 text-white'
                          : 'border-white/15 bg-[rgba(2,6,23,0.24)] text-[#c0cfde]'
                      }`}
                    >
                      {navStatus}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 lg:pl-[280px]">
          <div className="border-b border-[#dbe5ef] bg-white/80 px-5 py-4 backdrop-blur lg:hidden">
            <div className="overflow-x-auto">
              <nav className="flex min-w-[760px] items-center gap-2 rounded-[22px] border border-[#e2eaf3] bg-[#f8fbff] p-2">
                {visibleMenuItems.map((item) => {
                  const Icon = item.icon
                  const isActive = activeSection === item.key
                  return (
                    <Link
                      key={item.key}
                      to={getClientPortalPath(token, item.key)}
                      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-[18px] px-5 py-3 text-sm font-semibold transition ${
                        isActive
                          ? 'bg-[#35546c] text-white shadow-[0_12px_24px_rgba(53,84,108,0.18)]'
                          : 'text-[#5f7086] hover:bg-white hover:text-[#142132]'
                      }`}
                    >
                      <Icon size={16} />
                      {item.label}
                    </Link>
                  )
                })}
              </nav>
            </div>
          </div>

          <div className="space-y-6 px-5 py-5 md:px-8 md:py-8 xl:px-10">
            <section className="rounded-[28px] border border-[#dbe5ef] bg-white px-6 py-5 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
              {isOverview ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="inline-flex items-center rounded-full border border-[#d8e4ef] bg-[#f8fbff] px-4 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#62798f]">
                      Transaction Workspace
                    </span>
                    <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#4a5f77]">
                      {overviewStatusLabel}
                    </span>
                  </div>

                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <h1 className="flex flex-wrap items-center gap-3 text-[2.35rem] font-semibold leading-tight tracking-[-0.05em] text-[#142132]">
                        <span>{developmentName}</span>
                        <span className="hidden text-[#90a2b6] sm:inline">|</span>
                        <span className="inline-flex items-center rounded-full border border-[#d1deeb] bg-[#f4f8fc] px-4 py-2 text-[1.8rem] tracking-[-0.04em] text-[#35546c]">
                          {unitLabel}
                        </span>
                      </h1>
                      <p className="mt-3 text-[1.08rem] leading-7 text-[#5f7288]">
                        Direct transaction control for onboarding, finance, transfer workflow, and the live purchase record.
                      </p>
                      <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                        {buyerName}
                        {transactionReference ? ` • Ref ${String(transactionReference).slice(0, 12)}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3 xl:justify-end">
                      <Link
                        to={getClientPortalPath(token, 'documents')}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-[14px] border border-[#d1deeb] bg-white px-4 py-2.5 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                      >
                        <FileText size={15} />
                        Open Documents
                      </Link>
                      <Link
                        to={getClientPortalPath(token, 'handover')}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-[14px] border border-[#d1deeb] bg-white px-4 py-2.5 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                      >
                        <KeyRound size={15} />
                        Handover
                      </Link>
                      <Link
                        to={getClientPortalPath(token, 'team')}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-[14px] bg-[#2f5478] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#254664]"
                      >
                        <Users size={15} />
                        Team Contacts
                      </Link>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#eef4fb] px-3.5 py-1.5 text-sm font-semibold text-[#35546c]">
                      {buyerName}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3.5 py-1.5 text-sm font-semibold text-[#35546c]">
                      {MAIN_STAGE_LABELS[mainStage]}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3.5 py-1.5 text-sm font-semibold text-[#5e7490]">
                      Next: {nextStage}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3.5 py-1.5 text-sm font-semibold text-[#5e7490]">
                      Onboarding {onboardingStatus}
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <article className="rounded-[20px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5">
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8ca2]">Current Stage</span>
                      <strong className="mt-3 block text-[1.9rem] font-semibold tracking-[-0.04em] text-[#142132]">{MAIN_STAGE_LABELS[mainStage]}</strong>
                    </article>
                    <article className="rounded-[20px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5">
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8ca2]">Purchase Price</span>
                      <strong className="mt-3 block text-[1.9rem] font-semibold tracking-[-0.04em] text-[#142132]">{purchasePriceLabel}</strong>
                    </article>
                    <article className="rounded-[20px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5">
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8ca2]">Main Stage</span>
                      <strong className="mt-3 block text-[1.9rem] font-semibold tracking-[-0.04em] text-[#142132]">{stageExplainer.clientLabel}</strong>
                    </article>
                    <article className="rounded-[20px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5">
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8ca2]">Time In Stage</span>
                      <strong className="mt-3 block text-[1.9rem] font-semibold tracking-[-0.04em] text-[#142132]">{timeInStageLabel}</strong>
                      <span className="mt-1 block text-sm font-medium text-[#6b7d93]">Updated {stageUpdatedDateLabel}</span>
                    </article>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
                    {activeSectionLabel}
                  </span>
                  <h1 className="mt-3 text-[1.75rem] font-semibold tracking-[-0.04em] text-[#142132]">{developmentName} | {unitLabel}</h1>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                    {buyerName} • Last updated {new Date(portal.lastUpdated).toLocaleString()}
                  </p>
                </div>
              )}
            </section>

            {error ? <p className="rounded-[18px] border border-[#f1cbc7] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">{error}</p> : null}

            {isOverview ? (
              <>
                <section className="rounded-[26px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Purchase journey</h3>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                        You are currently in <strong>{MAIN_STAGE_LABELS[mainStage]}</strong>. {stageExplainer.shortExplainer}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                      {progressPercent}% complete
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                      <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Current Stage</span>
                      <strong className="mt-3 block text-sm font-semibold text-[#142132]">{MAIN_STAGE_LABELS[mainStage]}</strong>
                    </article>
                    <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                      <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Next Milestone</span>
                      <strong className="mt-3 block text-sm font-semibold text-[#142132]">{nextStage}</strong>
                    </article>
                    <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                      <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Journey Health</span>
                      <strong className="mt-3 block text-sm font-semibold text-[#142132]">{journeyStatusLabel}</strong>
                    </article>
                  </div>

                  <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-[#e6edf4]">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progressPercent}%`, backgroundImage: journeyProgressGradient }}
                    />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#5f7288]">{stageExplainer.nextStepText}</p>

                  <div className="mt-5 rounded-[20px] border border-[#e1e9f2] bg-[#fbfdff] p-4">
                    <ProgressTimeline
                      currentStage={mainStage}
                      stages={MAIN_PROCESS_STAGES}
                      compact
                      progressPercent={progressPercent}
                      helperText={journeyStatusCopy}
                    />
                  </div>
                </section>

                <section className={`rounded-[26px] border p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)] ${nextStepToneClasses.container}`}>
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <span className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] ${nextStepToneClasses.pill}`}>
                        {nextStepState.tone === 'action' ? <AlertTriangle size={13} /> : nextStepState.tone === 'in_progress' ? <CalendarDays size={13} /> : <Star size={13} />}
                        {nextStepState.label}
                      </span>
                      <h3 className="mt-4 text-[1.35rem] font-semibold tracking-[-0.04em] text-[#142132]">{nextStepState.title}</h3>
                      <p className="mt-2 max-w-3xl text-sm leading-7 text-[#566b82]">{nextStepState.description}</p>
                      {nextStepState.helperText ? (
                        <p className="mt-2 text-sm font-medium text-[#64748b]">{nextStepState.helperText}</p>
                      ) : null}
                    </div>
                    {nextStepState.ctaLabel ? (
                      <Link
                        to={getClientPortalPath(token, nextStepState.ctaTo)}
                        className={`inline-flex w-full items-center justify-center rounded-[16px] px-5 py-3 text-sm font-semibold transition lg:w-auto ${nextStepToneClasses.button}`}
                      >
                        {nextStepState.ctaLabel}
                      </Link>
                    ) : null}
                  </div>
                </section>

                <TransactionProgressPanel
                  variant="external"
                  title="Workflow groups"
                  subtitle="Track grouped workflow progress and review the latest comments side-by-side."
                  mainStage={mainStage}
                  stages={MAIN_PROCESS_STAGES}
                  stageLabelMap={MAIN_STAGE_LABELS}
                  subprocesses={portal.subprocesses || []}
                  comments={portal.discussion || []}
                  commentLimit={5}
                  commentsFooter={
                    <form onSubmit={handleSubmitPortalComment} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">
                          Showing latest {Math.min(5, totalCommentsCount)} of {totalCommentsCount}
                        </span>
                        <span className="text-xs font-medium text-[#6b7d93]">View all comments in the full feed soon</span>
                      </div>
                      <textarea
                        value={commentDraft}
                        onChange={(event) => setCommentDraft(event.target.value)}
                        rows={3}
                        placeholder="Ask a question or share an update..."
                        className="w-full rounded-[14px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm leading-7 text-[#142132] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                      />
                      <div className="mt-3 flex justify-end">
                        <button
                          type="submit"
                          disabled={saving || !commentDraft.trim()}
                          className="inline-flex items-center justify-center rounded-[14px] bg-[#35546c] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]"
                        >
                          {saving ? 'Posting...' : 'Post Comment'}
                        </button>
                      </div>
                    </form>
                  }
                  onOpenWorkflowGroup={(group) => setWorkflowEducationPanel({ open: true, group })}
                />

                <section className="rounded-[26px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">What&apos;s happening</h3>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                        A simple summary of what your team is currently doing on the transaction.
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                      Live summary
                    </span>
                  </div>
                  <div className="mt-5 rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                    <ul className="space-y-3 text-sm leading-6 text-[#324559]">
                      {whatsHappeningSummary.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#8ba0b8]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>

                <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <article className="rounded-[24px] border border-[#dbe5ef] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Quick links</h3>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Jump to the areas you are most likely to use next.</p>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {[
                        { label: 'Upload documents', to: `/client/${token}/documents`, copy: 'Open the document workspace and upload what is still required.' },
                        { label: 'View progress', to: `/client/${token}`, copy: 'See the main timeline and current workflow progress on Overview.' },
                        { label: 'Handover status', to: `/client/${token}/handover`, copy: 'Check key collection, handover readiness, and meter readings.' },
                        portal?.settings?.snag_reporting_enabled
                          ? { label: 'Snag register', to: `/client/${token}/snags`, copy: 'Log defects and track progress on any open snag items.' }
                          : null,
                      ]
                        .filter(Boolean)
                        .map((item) => (
                        <Link key={item.label} to={item.to} className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4 transition hover:border-[#cad8e7] hover:bg-white">
                          <strong className="block text-sm font-semibold text-[#142132]">{item.label}</strong>
                          <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{item.copy}</p>
                        </Link>
                        ))}
                    </div>
                  </article>

                  <div className="grid gap-5">
                    <article className="rounded-[24px] border border-[#dbe5ef] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                      <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Handover status</h3>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                          <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Estimated handover</span>
                          <strong className="mt-3 block text-sm font-semibold text-[#142132]">
                            {formatClientPortalDate(portal?.handover?.handoverDate, 'Awaiting schedule')}
                          </strong>
                        </article>
                        <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                          <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Status</span>
                          <strong className="mt-3 block text-sm font-semibold text-[#142132]">{toTitleLabel(handoverStatus)}</strong>
                        </article>
                      </div>
                    </article>

                    {portal?.settings?.snag_reporting_enabled ? (
                      <article className="rounded-[24px] border border-[#dbe5ef] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                        <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Snag summary</h3>
                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                            <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Open snags</span>
                            <strong className="mt-3 block text-sm font-semibold text-[#142132]">{snagOpenCount}</strong>
                          </article>
                          <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                            <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Resolved</span>
                            <strong className="mt-3 block text-sm font-semibold text-[#142132]">{snagResolvedCount}</strong>
                          </article>
                        </div>
                      </article>
                    ) : null}
                  </div>
                </section>
              </>
            ) : null}

      {isOnboarding ? (
        <section className="client-portal-card">
          <div className="section-header">
            <div className="section-header-copy">
              <h3>Onboarding Information</h3>
              <p>A clean summary of the information submitted through your onboarding form.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="status-pill">{onboardingStatus}</span>
              <button
                type="button"
                onClick={handleDownloadOnboardingSummary}
                className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white"
              >
                <Download size={14} />
                Download Onboarding
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Purchaser', portal.buyer?.name || 'Client'],
              ['Purchaser Type', toTitleLabel(portal?.transaction?.purchaser_type || portal?.onboardingFormData?.purchaserType || '—')],
              ['Finance Type', toTitleLabel(portal?.transaction?.finance_type || portal?.onboardingFormData?.formData?.purchase_finance_type || '—')],
              ['Purchase Price', purchasePriceLabel],
            ].map(([label, value]) => (
              <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                <span className="block text-[0.74rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                <strong className="mt-2 block text-base font-semibold text-[#142132]">{value}</strong>
              </article>
            ))}
          </div>

          {onboardingFieldEntries.length ? (
            <div className="mt-5 space-y-4">
              {Object.entries(groupedOnboardingFields).map(([groupLabel, entries]) => (
                <section key={groupLabel} className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-[1.02rem] font-semibold tracking-[-0.03em] text-[#142132]">{groupLabel}</h4>
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                      {entries.length} fields
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {entries.map(([key, value]) => (
                      <article key={key} className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{toTitleLabel(key)}</span>
                        <strong className="mt-2 block text-sm font-semibold leading-7 text-[#142132]">
                          {formatOnboardingFieldValue(value)}
                        </strong>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-[20px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
              No onboarding information has been submitted yet.
            </div>
          )}
        </section>
      ) : null}

      {isDocuments ? (
        <section className="rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-[1.28rem] font-semibold tracking-[-0.03em] text-[#142132]">Documents</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                Review the documents your team shared with you, and upload all requested compliance files in one place.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ['Sales documents', sharedSalesDocuments.length],
              ['Required uploads', uploadRequestDocuments.length],
              ['Your uploaded files', clientUploadedDocuments.length],
            ].map(([label, value]) => (
              <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                <span className="block text-[0.74rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                <strong className="mt-2 block text-base font-semibold text-[#142132]">{value}</strong>
              </article>
            ))}
          </div>

          <div className="mt-6 space-y-5">
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Sales Documents</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Documents to download, review, sign, or return to your team.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {sharedSalesDocuments.length} files
                </span>
              </div>

              {sharedSalesDocuments.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {sharedSalesDocuments.map((document) => (
                    <button
                      type="button"
                      key={document.id}
                      onClick={() =>
                        setDocumentPanel({
                          open: true,
                          item: {
                            kind: 'sales',
                            title: document.name || 'Untitled document',
                            section: 'Sales Documents',
                            description: document.category || 'Document shared by your team for review or completion.',
                            statusLabel: 'Published',
                            dateLabel: document.created_at ? new Date(document.created_at).toLocaleDateString() : 'Recently',
                            downloadUrl: document.url || '',
                            downloadLabel: getDocumentDownloadLabel(document),
                          },
                        })
                      }
                      className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4 text-left transition hover:border-[#cad8e7] hover:bg-[#fbfdff]"
                    >
                      <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{document.category || 'General'}</span>
                      <strong className="mt-2 block text-sm font-semibold leading-7 text-[#142132]">{document.name || 'Untitled document'}</strong>
                      <p className="mt-2 text-sm text-[#6b7d93]">Uploaded {document.created_at ? new Date(document.created_at).toLocaleDateString() : 'recently'}</p>
                      <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c]">
                        <Download size={14} />
                        Open document actions
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                  No sales documents have been shared yet.
                </div>
              )}
            </section>

            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">FICA & Required Uploads</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Upload documents requested from you for compliance, verification, and transaction processing.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {uploadRequestDocuments.length} requested
                </span>
              </div>

              {uploadRequestDocuments.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {uploadRequestDocuments.map((document) => {
                    const uploadedDocument = document.uploadedDocumentId ? portalDocumentsById.get(String(document.uploadedDocumentId)) : null
                    const sectionLabel = String(document.groupLabel || '').toLowerCase().includes('fica') ? 'FICA Documents' : 'Required Uploads'

                    return (
                      <button
                        type="button"
                        key={document.key}
                        onClick={() =>
                          setDocumentPanel({
                            open: true,
                            item: {
                              kind: 'required',
                              documentKey: document.key,
                              title: document.label,
                              section: sectionLabel,
                              description: document.description || 'Upload the requested supporting document.',
                              statusLabel: document.complete ? 'Uploaded' : 'Required',
                              uploadLabel: 'Upload document',
                              uploadedDocument,
                            },
                          })
                        }
                        className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4 text-left transition hover:border-[#cad8e7] hover:bg-[#fbfdff]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold leading-7 text-[#142132]">{document.label}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.description || 'Upload the requested supporting document.'}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${document.complete ? 'border-[#b8dfc7] bg-[#effaf3] text-[#22824d]' : 'border-[#dde7f1] bg-[#fbfdff] text-[#64748b]'}`}>
                            {document.complete ? 'Uploaded' : 'Required'}
                          </span>
                        </div>

                        {uploadedDocument?.url ? (
                          <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#35546c]">
                            <Download size={14} />
                            View latest upload
                          </span>
                        ) : null}

                        <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c]">
                          Open document actions
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                  No required uploads have been requested yet.
                </div>
              )}
            </section>
          </div>
        </section>
      ) : null}

      <Sheet
        open={workflowEducationPanel.open}
        onOpenChange={(open) => setWorkflowEducationPanel((previous) => ({ ...previous, open, group: open ? previous.group : null }))}
      >
        <SheetContent side="right" className="overflow-y-auto border-[#dbe5ef] bg-white p-0">
          {activeWorkflowEducationGroup && activeWorkflowEducationContent ? (
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-[#e5edf5] px-6 pb-4 pt-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                    Workflow Guide
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                    {activeWorkflowEducationGroup.statusLabel || 'In progress'}
                  </span>
                </div>
                <SheetTitle className="text-[1.5rem] tracking-[-0.04em] text-[#142132]">{activeWorkflowEducationContent.title}</SheetTitle>
                <SheetDescription className="text-sm leading-7 text-[#6b7d93]">{activeWorkflowEducationContent.summary}</SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-5 px-6 py-6">
                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                  <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">What happens in this stage</span>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-[#324559]">
                    {(activeWorkflowEducationContent.whatHappens || []).map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-[#8ba0b8]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                  <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Typical timeframe</span>
                  <p className="mt-2 text-sm leading-6 text-[#324559]">{activeWorkflowEducationContent.timeframe}</p>
                </section>

                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                  <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Client action</span>
                  <p className="mt-2 text-sm leading-6 text-[#324559]">{activeWorkflowClientGuidance}</p>
                </section>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={documentPanel.open} onOpenChange={(open) => setDocumentPanel((previous) => ({ ...previous, open, item: open ? previous.item : null }))}>
        <SheetContent side="right" className="overflow-y-auto border-[#dbe5ef] bg-white p-0">
          {activeDocumentPanel ? (
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-[#e5edf5] px-6 pb-4 pt-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                    {activeDocumentPanel.section}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                    {activeDocumentPanel.statusLabel}
                  </span>
                </div>
                <SheetTitle className="text-[1.5rem] tracking-[-0.04em] text-[#142132]">{activeDocumentPanel.title}</SheetTitle>
                <SheetDescription className="text-sm leading-7 text-[#6b7d93]">{activeDocumentPanel.description}</SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-5 px-6 py-6">
                {activeDocumentPanel.dateLabel ? (
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                    <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Uploaded</span>
                    <strong className="mt-2 block text-sm font-semibold text-[#142132]">{activeDocumentPanel.dateLabel}</strong>
                  </div>
                ) : null}

                {activeDocumentPanel.downloadUrl ? (
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                    <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Download</span>
                    <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Open or download the latest document shared on this transaction.</p>
                    <a
                      href={activeDocumentPanel.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                    >
                      <Download size={14} />
                      {activeDocumentPanel.downloadLabel || 'Download document'}
                    </a>
                  </div>
                ) : null}

                {activeDocumentPanel.kind === 'required' ? (
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                    <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Upload</span>
                    <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Upload the latest version of this requested document for your team to review.</p>
                    {activeDocumentPanel.uploadedDocument?.url ? (
                      <a
                        href={activeDocumentPanel.uploadedDocument.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                      >
                        <Download size={14} />
                        View latest upload
                      </a>
                    ) : null}
                    <label className="mt-4 block">
                      <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#8ba0b8]">{activeDocumentPanel.uploadLabel || 'Upload document'}</span>
                      <input
                        type="file"
                        disabled={saving || uploadingDocumentKey === activeDocumentPanel.documentKey}
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (file && activeDocumentPanel.documentKey) {
                            void handleUploadRequiredDocument(activeDocumentPanel.documentKey, file)
                          }
                          event.target.value = ''
                        }}
                        className="mt-2 block w-full text-sm text-[#64748b] file:mr-3 file:rounded-full file:border-0 file:bg-[#e9f1f8] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#35546c]"
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {isHandover ? (
        <section className="rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <div className="section-header">
            <div className="section-header-copy">
              <h3>Handover</h3>
              <p>Use your phone to walk through the final handover, capture readings, and complete the sign-off checklist.</p>
            </div>
            <span className="status-pill">{handoverStatus.replaceAll('_', ' ')}</span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
            <div className="space-y-4">
              <article className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Scheduled handover</span>
                    <strong className="mt-2 block text-[1.1rem] font-semibold tracking-[-0.03em] text-[#142132]">
                      {handoverForm.handoverDate ? new Date(handoverForm.handoverDate).toLocaleDateString() : 'Awaiting confirmation from your team'}
                    </strong>
                    <p className="mt-2 text-sm leading-6 text-[#6b7d93]">
                      Your agent or developer can schedule the handover on their side. Once confirmed, it appears here automatically.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#dde7f1] bg-white px-3 py-2 text-sm font-semibold text-[#64748b]">
                    <CalendarDays size={16} />
                    {handoverCompleted ? 'Completed' : 'Upcoming'}
                  </span>
                </div>
              </article>

              <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
                <section className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">Walk-through checklist</h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Tick each item off as you move through the unit during handover.</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                      Mobile friendly
                    </span>
                  </div>

                  <section className="mt-5 grid gap-3 sm:grid-cols-2">
                    {[
                      ['inspectionCompleted', 'Site inspection completed'],
                      ['keysHandedOver', 'Keys handed over'],
                      ['remoteHandedOver', 'Remote controls handed over'],
                      ['manualsHandedOver', 'Manuals and packs handed over'],
                    ].map(([field, label]) => (
                      <label
                        key={field}
                        className="flex items-center gap-3 rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4 text-sm font-medium text-[#324559]"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(handoverForm[field])}
                          onChange={(event) => updateHandoverField(field, event.target.checked)}
                          disabled={handoverCompleted}
                          className="h-4 w-4 rounded border-[#c9d7e6] text-[#35546c] focus:ring-[#c7d7e6]"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </section>
                </section>

                <section className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
                  <div>
                    <h4 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">Meter readings</h4>
                    <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Capture each reading and add a photo for the final handover record.</p>
                  </div>

                  <div className="mt-5 space-y-4">
                    {[
                      ['electricityMeterReading', 'Electricity meter', 'e.g. 002341', 'electricity'],
                      ['waterMeterReading', 'Water meter', 'e.g. 000987', 'water'],
                      ['gasMeterReading', 'Gas meter (optional)', 'e.g. 000112', 'gas'],
                    ].map(([field, label, placeholder, photoKey]) => {
                      const uploaded = handoverMeterDocuments.find((item) => item.key === photoKey)?.document || null
                      return (
                        <article key={field} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end">
                            <label className="block">
                              <span className="block text-sm font-semibold text-[#142132]">{label}</span>
                              <input
                                type="text"
                                value={handoverForm[field]}
                                onChange={(event) => updateHandoverField(field, event.target.value)}
                                placeholder={placeholder}
                                readOnly={handoverCompleted}
                                className="mt-3 w-full rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm text-[#142132] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                              />
                            </label>
                            <div className="space-y-3">
                              <label className="block">
                                <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#8ba0b8]">Upload photo</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={handoverCompleted}
                                  onChange={(event) =>
                                    setHandoverPhotoFiles((previous) => ({
                                      ...previous,
                                      [photoKey]: event.target.files?.[0] || null,
                                    }))
                                  }
                                  className="mt-2 block w-full text-sm text-[#64748b] file:mr-3 file:rounded-full file:border-0 file:bg-[#e9f1f8] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#35546c]"
                                />
                              </label>
                              {uploaded?.url ? (
                                <a
                                  href={uploaded.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#35546c] hover:text-[#2d475d]"
                                >
                                  <Download size={14} />
                                  View latest upload
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>

                <section className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="block text-sm font-semibold text-[#142132]">Sign-off name</span>
                      <input
                        type="text"
                        value={handoverForm.signatureName}
                        onChange={(event) => updateHandoverField('signatureName', event.target.value)}
                        placeholder="Type your full name"
                        readOnly={handoverCompleted}
                        className="mt-3 w-full rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm text-[#142132] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                      />
                    </label>

                    <label className="block">
                      <span className="block text-sm font-semibold text-[#142132]">Notes</span>
                      <textarea
                        rows={4}
                        value={handoverForm.notes}
                        onChange={(event) => updateHandoverField('notes', event.target.value)}
                        placeholder="Capture any final handover notes..."
                        readOnly={handoverCompleted}
                        className="mt-3 w-full rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm leading-7 text-[#142132] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                      />
                    </label>
                  </div>

                  <div className="mt-5 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => void handleHandoverSave()}
                      disabled={saving || handoverCompleted}
                    >
                      Save Draft
                    </button>
                    <button type="button" onClick={() => void handleHandoverComplete()} disabled={saving || handoverCompleted}>
                      Mark Handover Complete
                    </button>
                  </div>
                </section>
              </form>
            </div>

            <article className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
              <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">What happens on the day</span>
              <h4 className="mt-3 text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">Digital handover flow</h4>
              <div className="mt-5 space-y-4">
                {[
                  ['1', 'Walk the unit', 'Move room by room, tick off the practical completion checklist, and note anything that still needs follow-up.'],
                  ['2', 'Capture evidence', 'Take meter readings and upload photos so both sides have a clean signed-off record of the handover state.'],
                  ['3', 'Confirm sign-off', 'Type your name to confirm the handover draft, then your team can close the loop and move you into homeowner support.'],
                ].map(([step, title, copy]) => (
                  <article key={step} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d9e5f0] bg-white text-sm font-semibold text-[#35546c]">
                        {step}
                      </span>
                      <div>
                        <strong className="block text-sm font-semibold text-[#142132]">{title}</strong>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{copy}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-5 rounded-[18px] border border-[#e3ebf4] bg-[#f8fbfe] px-4 py-4 text-sm leading-6 text-[#64748b]">
                A true phone signature pad is very achievable next. The clean implementation would be a signature canvas plus image storage in the same handover record, which is a contained medium-sized enhancement rather than a platform rewrite.
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {isSnags ? (
        <section className="rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <div className="section-header">
            <div className="section-header-copy">
              <h3>Snags</h3>
              <p>Log practical completion items, attach supporting photos, and track how your team is progressing each fix.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Logged snags', portal.issues.length],
              ['Open items', snagOpenCount],
              ['Resolved', snagResolvedCount],
            ].map(([label, value]) => (
              <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                <span className="block text-[0.74rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                <strong className="mt-2 block text-base font-semibold text-[#142132]">{value}</strong>
              </article>
            ))}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <section className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">Log a new snag</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Add the room, explain the issue clearly, and upload a supporting image if you have one.</p>
                </div>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#dde7f1] bg-[#f8fbff] text-[#35546c]">
                  <AlertTriangle size={18} />
                </span>
              </div>

              <form className="mt-5 space-y-4" onSubmit={handleSubmitIssue}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="block text-sm font-semibold text-[#142132]">Category</span>
                    <select
                      value={issueForm.category}
                      onChange={(event) => setIssueForm((prev) => ({ ...prev, category: event.target.value }))}
                      className="mt-3 w-full rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm text-[#142132] outline-none transition focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                    >
                      {ISSUE_CATEGORIES.map((category) => (
                        <option value={category} key={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="block text-sm font-semibold text-[#142132]">Priority</span>
                    <select
                      value={issueForm.priority}
                      onChange={(event) => setIssueForm((prev) => ({ ...prev, priority: event.target.value }))}
                      className="mt-3 w-full rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm text-[#142132] outline-none transition focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                    >
                      <option value="">Select priority</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="block text-sm font-semibold text-[#142132]">Location / Area</span>
                  <input
                    type="text"
                    value={issueForm.location}
                    onChange={(event) => setIssueForm((prev) => ({ ...prev, location: event.target.value }))}
                    placeholder="Kitchen, Bedroom 2, Balcony..."
                    className="mt-3 w-full rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm text-[#142132] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                  />
                </label>

                <label className="block">
                  <span className="block text-sm font-semibold text-[#142132]">Description</span>
                  <textarea
                    value={issueForm.description}
                    onChange={(event) => setIssueForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Describe the issue clearly"
                    required
                    rows={5}
                    className="mt-3 w-full rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3 text-sm leading-7 text-[#142132] outline-none transition placeholder:text-[#8ca0b8] focus:border-[#b9cade] focus:ring-2 focus:ring-[#dce7f3]"
                  />
                </label>

                <label className="block">
                  <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#8ba0b8]">Upload photo (optional)</span>
                  <input
                    type="file"
                    name="photo"
                    accept="image/*"
                    className="mt-2 block w-full text-sm text-[#64748b] file:mr-3 file:rounded-full file:border-0 file:bg-[#e9f1f8] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#35546c]"
                  />
                </label>

                <div className="flex justify-end">
                  <button type="submit" disabled={saving || !issueForm.description.trim()}>
                    Submit Snag
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">Snag register</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Every snag raised on this unit, with the latest internal status against each item.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {portal.issues.length} items
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {portal.issues.map((item) => (
                  <article key={item.id} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-base font-semibold text-[#142132]">{item.category}</strong>
                          <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                            {item.priority || 'Normal priority'}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-[#324559]">{item.description}</p>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                        {toTitleLabel(item.status || 'Open')}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3">
                        <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Location</span>
                        <strong className="mt-2 block text-sm font-semibold text-[#142132]">{item.location || 'Location not provided'}</strong>
                      </div>
                      <div className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3">
                        <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Logged</span>
                        <strong className="mt-2 block text-sm font-semibold text-[#142132]">
                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Recently'}
                        </strong>
                      </div>
                    </div>

                    {item.photo_url ? (
                      <a
                        href={item.photo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                      >
                        <Download size={14} />
                        View uploaded photo
                      </a>
                    ) : null}
                  </article>
                ))}

                {!portal.issues.length ? (
                  <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-4 py-5 text-sm text-[#6b7d93]">
                    No snags have been submitted yet.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {isSettings ? (
        <section className="rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-[1.3rem] font-semibold tracking-[-0.03em] text-[#142132]">Settings</h3>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#6b7d93]">
                The client workspace stays intentionally light. These settings show which support features are active on your transaction and how the team will communicate with you.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#dde7f1] bg-[#fbfdff] px-4 py-2 text-sm font-semibold text-[#64748b]">
              <Settings size={16} />
              Client preferences
            </span>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <h4 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">Workspace configuration</h4>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ['Snag reporting', portal?.settings?.snag_reporting_enabled ? 'Enabled' : 'Not active'],
                  ['Alteration requests', portal?.settings?.alteration_requests_enabled ? 'Enabled' : 'Not active'],
                  ['Service reviews', portal?.settings?.service_reviews_enabled ? 'Enabled' : 'Not active'],
                  ['Document uploads', 'Always available when requested'],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">{label}</span>
                    <strong className="mt-3 block text-sm font-semibold text-[#142132]">{value}</strong>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <h4 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">Support notes</h4>
              <div className="mt-4 space-y-3">
                {[
                  'Use Comments & Updates on the progress page when you want your team to respond inside the shared transaction record.',
                  'Document upload requests will appear automatically in your document workspace as different role players ask for additional items.',
                  'Handover scheduling and warranty information will only appear once your transaction is close enough to occupation or transfer.',
                ].map((note) => (
                  <article key={note} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4 text-sm leading-6 text-[#5a6b80]">
                    {note}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {isTeam ? (
        <section className="rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-[1.3rem] font-semibold tracking-[-0.03em] text-[#142132]">Team</h3>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#6b7d93]">
                The people and firms currently supporting your transaction across sales, legal transfer, finance, and operational coordination.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#dde7f1] bg-[#fbfdff] px-4 py-2 text-sm font-semibold text-[#64748b]">
              <Users size={16} />
              {teamMembers.length} team contacts
            </span>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {teamMembers.map((member) => (
              <article key={member.title} className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">{member.title}</span>
                    <h4 className="mt-3 text-[1.05rem] font-semibold tracking-[-0.03em] text-[#142132]">{member.name}</h4>
                    <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{member.detail}</p>
                  </div>
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#dde7f1] bg-white text-[#35546c]">
                    <Users size={18} />
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {isAlterations ? (
        <section className="client-portal-card">
          <div className="section-header">
            <div className="section-header-copy">
              <h3>Alteration Requests</h3>
              <p>Submit controlled changes for developer review and formal response.</p>
            </div>
          </div>

          <form className="stack-form client-form" onSubmit={handleSubmitAlteration}>
            <label>
              Request Title
              <input
                type="text"
                value={alterationForm.title}
                onChange={(event) => setAlterationForm((prev) => ({ ...prev, title: event.target.value }))}
                required
              />
            </label>

            <label>
              Category
              <input
                type="text"
                value={alterationForm.category}
                onChange={(event) => setAlterationForm((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="Kitchen, Lighting, Flooring..."
              />
            </label>

            <label>
              Description
              <textarea
                value={alterationForm.description}
                onChange={(event) => setAlterationForm((prev) => ({ ...prev, description: event.target.value }))}
                required
              />
            </label>

            <div className="client-two-col">
              <label>
                Budget Range (optional)
                <input
                  type="text"
                  value={alterationForm.budgetRange}
                  onChange={(event) => setAlterationForm((prev) => ({ ...prev, budgetRange: event.target.value }))}
                  placeholder="R 10,000 - R 15,000"
                />
              </label>

              <label>
                Preferred Timing (optional)
                <input
                  type="text"
                  value={alterationForm.preferredTiming}
                  onChange={(event) => setAlterationForm((prev) => ({ ...prev, preferredTiming: event.target.value }))}
                  placeholder="Before occupancy"
                />
              </label>
            </div>

            <label>
              Reference image (optional)
              <input type="file" name="referenceImage" accept="image/*" />
            </label>

            <button className="client-primary-btn" type="submit" disabled={saving || !alterationForm.title.trim() || !alterationForm.description.trim()}>
              Submit Request
            </button>
          </form>

          <ul className="request-list">
            {portal.alterations.map((item) => (
              <li key={item.id} className="request-row">
                <div className="request-main">
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  <span>
                    {item.category || 'General'} • {item.budget_range || 'No budget supplied'} •{' '}
                    {item.preferred_timing || 'No timing supplied'}
                  </span>
                  {item.reference_image_url ? (
                    <a href={item.reference_image_url} target="_blank" rel="noreferrer" className="inline-link">
                      View reference image
                    </a>
                  ) : null}
                </div>
                <span className="status-pill">{item.status}</span>
              </li>
            ))}
            {!portal.alterations.length ? <li className="empty-text">No alteration requests submitted yet.</li> : null}
          </ul>
        </section>
      ) : null}

      {isReview ? (
        <section className="client-portal-card">
          <div className="section-header">
            <div className="section-header-copy">
              <h3>Service Review</h3>
              <p>Share your experience once your transaction reaches final completion stages.</p>
            </div>
          </div>

          {portal.featureAvailability.review ? (
            <form className="stack-form client-form" onSubmit={handleSubmitReview}>
              <label>
                Rating
                <select value={reviewForm.rating} onChange={(event) => setReviewForm((prev) => ({ ...prev, rating: Number(event.target.value) }))}>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option value={rating} key={rating}>
                      {rating} Star{rating > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Review
                <textarea
                  value={reviewForm.reviewText}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, reviewText: event.target.value }))}
                  placeholder="How was your overall experience?"
                />
              </label>

              <label>
                What went well
                <textarea
                  value={reviewForm.positives}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, positives: event.target.value }))}
                />
              </label>

              <label>
                What could be improved
                <textarea
                  value={reviewForm.improvements}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, improvements: event.target.value }))}
                />
              </label>

              <label className="upload-client-visible-toggle">
                <input
                  type="checkbox"
                  checked={reviewForm.allowMarketingUse}
                  onChange={(event) => setReviewForm((prev) => ({ ...prev, allowMarketingUse: event.target.checked }))}
                />
                Allow testimonial/marketing use of this review
              </label>

              <button className="client-primary-btn" type="submit" disabled={saving}>
                Submit Review
              </button>
            </form>
          ) : (
            <p className="status-message">Reviews open once your transaction reaches registration/handover stage.</p>
          )}

          <ul className="request-list">
            {portal.reviews.map((item) => (
              <li key={item.id} className="review-row">
                <div className="review-rating">{'★'.repeat(item.rating)}{'☆'.repeat(Math.max(0, 5 - item.rating))}</div>
                <p>{item.review_text || 'No review text submitted.'}</p>
                <span>
                  Positives: {item.positives || '-'}
                  <br />
                  Improvements: {item.improvements || '-'}
                </span>
                <small>{new Date(item.created_at).toLocaleDateString()}</small>
              </li>
            ))}
            {!portal.reviews.length ? <li className="empty-text">No reviews submitted yet.</li> : null}
          </ul>
        </section>
      ) : null}

          </div>

        </div>
      </div>
    </main>
  )
}

export default ClientPortal
