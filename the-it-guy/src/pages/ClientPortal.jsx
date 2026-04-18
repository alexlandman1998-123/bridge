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

const CLIENT_DOCUMENT_TABS = [
  { key: 'sales', label: 'Sales Documents' },
  { key: 'fica', label: 'FICA Documents' },
  { key: 'additional', label: 'Additional Requests' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'property', label: 'Property Documents' },
]

const FICA_REQUIREMENT_CONFIG = {
  base: [
    { key: 'buyer_identity_document', label: 'Identity document', description: 'Valid ID or passport copy.', required: true },
    { key: 'buyer_proof_of_address', label: 'Proof of address', description: 'Recent proof of residential address.', required: true },
  ],
  byPurchaserType: {
    individual: [],
    company: [
      { key: 'company_registration_documents', label: 'Company registration documents', description: 'CIPC registration documents for the purchasing company.', required: true },
      { key: 'director_identity_documents', label: 'Director identity documents', description: 'ID copies for authorised directors/signatories.', required: true },
      { key: 'company_authority_resolution', label: 'Company authority resolution', description: 'Signed authority resolution permitting the transaction.', required: true },
    ],
    trust: [
      { key: 'trust_deed', label: 'Trust deed', description: 'Signed trust deed and supporting registration details.', required: true },
      { key: 'trustee_identity_documents', label: 'Trustee identity documents', description: 'ID copies for authorised trustees.', required: true },
      { key: 'trust_resolution', label: 'Trust resolution', description: 'Signed trustee resolution authorising the purchase.', required: true },
    ],
  },
  byMaritalRegime: {
    cop: [
      { key: 'spouse_identity_document', label: 'Spouse identity document', description: 'ID copy for spouse in community of property.', required: true },
      { key: 'marriage_certificate', label: 'Marriage certificate', description: 'Marriage certificate for compliance records.', required: true },
    ],
    anc: [
      { key: 'marriage_certificate', label: 'Marriage certificate', description: 'Marriage certificate for legal verification.', required: true },
      { key: 'anc_contract', label: 'ANC contract', description: 'Ante-nuptial contract where applicable.', required: false },
    ],
    married: [
      { key: 'marriage_certificate', label: 'Marriage certificate', description: 'Marriage certificate for legal verification.', required: true },
    ],
  },
  byTransactionType: {
    private_property: [
      { key: 'seller_legal_pack_confirmation', label: 'Private property legal pack confirmation', description: 'Additional legal confirmation may be required for private property transactions.', required: false },
    ],
    developer_sale: [],
  },
}

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

function getRequestedByLabel(role) {
  const normalized = String(role || '').trim().toLowerCase()
  if (normalized === 'attorney') return 'Conveyancer'
  if (normalized === 'bond_originator') return 'Bond Originator'
  if (normalized === 'developer') return 'Developer Team'
  if (normalized === 'agent') return 'Agent'
  if (!normalized) return 'Team'
  return toTitleLabel(normalized)
}

function getPortalDocumentWorkspaceCategory(document = {}) {
  const combined = `${document?.category || ''} ${document?.name || ''}`.toLowerCase()

  if (
    combined.includes('bond offer') ||
    combined.includes('approval') ||
    combined.includes('bank offer') ||
    combined.includes('grant') ||
    combined.includes('lender')
  ) {
    return 'approvals'
  }

  if (
    combined.includes('title deed') ||
    combined.includes('transfer') ||
    combined.includes('warranty') ||
    combined.includes('certificate') ||
    combined.includes('compliance') ||
    combined.includes('coc')
  ) {
    return 'property'
  }

  if (
    combined.includes('sale') ||
    combined.includes('otp') ||
    combined.includes('offer to purchase') ||
    combined.includes('instruction') ||
    combined.includes('code of conduct') ||
    combined.includes('fibre')
  ) {
    return 'sales'
  }

  return 'sales'
}

function detectApprovalBankName(value = '') {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('fnb')) return 'FNB'
  if (normalized.includes('absa')) return 'ABSA'
  if (normalized.includes('nedbank')) return 'Nedbank'
  if (normalized.includes('standard bank')) return 'Standard Bank'
  if (normalized.includes('sa home loans')) return 'SA Home Loans'
  return 'Funding Partner'
}

function resolveClientMaritalRegime(formData = {}) {
  const maritalStatus = normalizePortalStatus(formData?.marital_status || formData?.purchaser?.marital_status)
  const maritalRegime = normalizePortalStatus(formData?.marital_regime || formData?.purchaser?.marital_regime)

  if (maritalRegime.includes('cop') || maritalRegime.includes('community')) return 'cop'
  if (maritalRegime.includes('anc') || maritalRegime.includes('ante')) return 'anc'
  if (maritalStatus === 'married') return 'married'
  return 'single'
}

function resolvePurchaserTypeForDocuments(portal) {
  const formData = portal?.onboardingFormData?.formData || {}
  return normalizePortalStatus(
    formData?.purchaser_entity_type ||
      formData?.purchaser_type ||
      portal?.purchaserType ||
      portal?.transaction?.purchaser_type ||
      'individual',
  )
}

function resolveTransactionTypeForDocuments(portal) {
  return normalizePortalStatus(portal?.transaction?.transaction_type || 'developer_sale')
}

function getFicaRequirementTemplate({ transactionType, purchaserType, maritalRegime }) {
  return [
    ...FICA_REQUIREMENT_CONFIG.base,
    ...(FICA_REQUIREMENT_CONFIG.byPurchaserType[purchaserType] || []),
    ...(FICA_REQUIREMENT_CONFIG.byMaritalRegime[maritalRegime] || []),
    ...(FICA_REQUIREMENT_CONFIG.byTransactionType[transactionType] || []),
  ]
}

function resolveFicaRequirementStatus(requirement, requirementDocs = [], uploadedDocsById = new Map()) {
  const keyNeedle = String(requirement.key || '').toLowerCase()
  const labelNeedle = String(requirement.label || '').toLowerCase()
  const matchedRequirementDoc = requirementDocs.find((doc) => {
    const keyHaystack = String(doc.key || '').toLowerCase()
    const labelHaystack = String(doc.label || '').toLowerCase()
    return keyHaystack.includes(keyNeedle) || keyNeedle.includes(keyHaystack) || labelHaystack.includes(labelNeedle)
  }) || null

  const uploadedDocument =
    matchedRequirementDoc?.uploadedDocumentId ? uploadedDocsById.get(String(matchedRequirementDoc.uploadedDocumentId)) : null

  const isUploaded = Boolean(matchedRequirementDoc?.complete || matchedRequirementDoc?.isUploaded || uploadedDocument?.url)
  return {
    matchedRequirementDoc,
    uploadedDocument,
    statusLabel: requirement.required ? (isUploaded ? 'Uploaded' : 'Missing') : (isUploaded ? 'Uploaded' : 'Not Required'),
    isUploaded,
  }
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

function resolveChecklistProgressState({ complete = false, inProgress = false }) {
  if (complete) return 'complete'
  if (inProgress) return 'in_progress'
  return 'not_started'
}

function getChecklistProgressMeta(status) {
  if (status === 'complete') {
    return {
      label: 'Complete',
      className: 'border-[#c6dfcf] bg-[#eef8f1] text-[#2b7a53]',
    }
  }
  if (status === 'in_progress') {
    return {
      label: 'In progress',
      className: 'border-[#d8e4ef] bg-[#f4f8fc] text-[#3b5873]',
    }
  }
  return {
    label: 'Not started',
    className: 'border-[#dde7f1] bg-white text-[#64748b]',
  }
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
  const [activeDocumentsTab, setActiveDocumentsTab] = useState('sales')
  const [approvalCompletionByKey, setApprovalCompletionByKey] = useState({})
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
  const sharedPortalDocuments = (portal?.documents || []).filter((document) => String(document.uploaded_by_role || '').toLowerCase() !== 'client')
  const portalDocumentsById = new Map((portal?.documents || []).map((document) => [String(document.id), document]))
  const documentPurchaserType = resolvePurchaserTypeForDocuments(portal)
  const documentTransactionType = resolveTransactionTypeForDocuments(portal)
  const documentMaritalRegime = resolveClientMaritalRegime(portal?.onboardingFormData?.formData || {})
  const ficaRequirementsTemplate = getFicaRequirementTemplate({
    transactionType: documentTransactionType,
    purchaserType: documentPurchaserType,
    maritalRegime: documentMaritalRegime,
  })
  const salesRequiredDocuments = groupedPortalRequiredDocuments.sales
  const ficaRequiredDocuments = groupedPortalRequiredDocuments.fica
  const additionalRequestDocuments = groupedPortalRequiredDocuments.additional
  const salesSharedDocuments = sharedPortalDocuments.filter((document) => getPortalDocumentWorkspaceCategory(document) === 'sales')
  const approvalSharedDocuments = sharedPortalDocuments.filter((document) => getPortalDocumentWorkspaceCategory(document) === 'approvals')
  const propertySharedDocuments = sharedPortalDocuments.filter((document) => getPortalDocumentWorkspaceCategory(document) === 'property')
  const approvalRequiredDocuments = portalRequiredDocuments.filter((document) => {
    const combined = `${document.key || ''} ${document.label || ''} ${document.description || ''}`.toLowerCase()
    return /bond|bank|approval|offer|grant|lender/.test(combined)
  })
  const resolvedFicaRequirements = ficaRequirementsTemplate.map((requirement) => ({
    ...requirement,
    ...resolveFicaRequirementStatus(requirement, ficaRequiredDocuments, portalDocumentsById),
  }))
  const hasDocumentsTab = CLIENT_DOCUMENT_TABS.some((tab) => tab.key === activeDocumentsTab)
  const activeDocumentsTabKey = hasDocumentsTab ? activeDocumentsTab : 'sales'
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
  const totalRequiredDocuments = Number(portal.requiredDocumentSummary?.totalRequired || 0)
  const uploadedRequiredDocuments = Number(portal.requiredDocumentSummary?.uploadedCount || 0)
  const onboardingComplete = isClientOnboardingComplete(onboardingStatus)
  const occupationalRentProofPending =
    occupationalRent?.enabled &&
    occupationalRent?.status &&
    normalizePortalStatus(occupationalRent.status) !== 'settled' &&
    !occupationalRentProofDocument
  const financeSteps = financeProcess?.steps || []
  const attorneySteps = attorneyProcess?.steps || []
  const hasStepWithStatus = (steps = [], matcher, allowedStatuses = []) =>
    steps.some((step) => {
      const label = `${step?.step_label || ''} ${step?.step_key || ''}`
      if (!matcher.test(label)) return false
      const status = normalizePortalStatus(step?.status)
      return allowedStatuses.includes(status)
    })
  const hasStartedStep = (steps = [], matcher) =>
    steps.some((step) => {
      const label = `${step?.step_label || ''} ${step?.step_key || ''}`
      if (!matcher.test(label)) return false
      const status = normalizePortalStatus(step?.status)
      return !['', 'pending', 'not_started'].includes(status)
    })
  const atOrBeyondFinance = stageIndex > getMainStageIndex('FIN')
  const atOrBeyondTransfer = stageIndex >= getMainStageIndex('ATTY')
  const atOrBeyondRegistration = stageIndex >= getMainStageIndex('REG')
  const hasComplianceCertificates = propertySharedDocuments.some((document) =>
    /certificate|coc|compliance|warranty|title deed/i.test(`${document?.category || ''} ${document?.name || ''}`),
  )
  const hasWelcomePack = propertySharedDocuments.some((document) =>
    /welcome pack|handover pack|manual/i.test(`${document?.category || ''} ${document?.name || ''}`),
  )
  const handoverScheduled = Boolean(handoverForm.handoverDate || portal?.handover?.handoverDate)
  const clientChecklistItems = [
    {
      key: 'upload_documents',
      title: 'Upload outstanding documents',
      description:
        missingRequired > 0
          ? `${missingRequired} required document${missingRequired === 1 ? '' : 's'} still need to be uploaded.`
          : 'All required documents have been uploaded.',
      status: resolveChecklistProgressState({
        complete: missingRequired === 0 && !occupationalRentProofPending,
        inProgress: uploadedRequiredDocuments > 0 || Boolean(occupationalRentProofDocument),
      }),
      responsible: 'You',
      actionTo: 'documents',
      actionLabel: 'Open Documents',
    },
    {
      key: 'sign_agreements',
      title: 'Sign agreements',
      description: otpSignaturePending
        ? 'One or more agreement signatures are still outstanding.'
        : 'All required signatures currently on record.',
      status: resolveChecklistProgressState({
        complete: !otpSignaturePending,
        inProgress: portalRequiredDocuments.some((item) => /otp|agreement|signature/i.test(`${item?.key || ''} ${item?.label || ''}`)),
      }),
      responsible: 'You',
      actionTo: 'documents',
      actionLabel: 'Review Documents',
    },
    {
      key: 'confirm_personal_details',
      title: 'Confirm personal details',
      description: onboardingComplete
        ? 'Your onboarding information has been completed.'
        : 'Complete your personal and transaction information sheet.',
      status: resolveChecklistProgressState({
        complete: onboardingComplete,
        inProgress: onboardingFieldEntries.length > 0,
      }),
      responsible: 'You',
      actionTo: 'onboarding',
      actionLabel: 'Continue Onboarding',
    },
  ]
  const financialChecklistItems = [
    {
      key: 'bond_approved',
      title: 'Bond approved',
      description: 'Finance approval from the lending side is required before handover.',
      status: resolveChecklistProgressState({
        complete: atOrBeyondFinance || hasStepWithStatus(financeSteps, /approval|approved|bond/i, ['completed', 'approved']),
        inProgress: mainStage === 'FIN' || hasStartedStep(financeSteps, /approval|bond/i),
      }),
      responsible: 'Agent',
    },
    {
      key: 'guarantees_issued',
      title: 'Guarantees issued',
      description: 'Guarantees must be in place to progress legal transfer confidently.',
      status: resolveChecklistProgressState({
        complete:
          atOrBeyondTransfer ||
          hasStepWithStatus(financeSteps, /guarantee/i, ['completed']) ||
          hasStepWithStatus(attorneySteps, /guarantee/i, ['completed']),
        inProgress: hasStartedStep(financeSteps, /guarantee/i) || hasStartedStep(attorneySteps, /guarantee/i),
      }),
      responsible: 'Agent',
    },
    {
      key: 'final_payments',
      title: 'Final payments settled',
      description: occupationalRent?.enabled
        ? 'Occupational rent or final settlement proof needs to be on file.'
        : 'Final payment clearances are being tracked by your team.',
      status: resolveChecklistProgressState({
        complete: !occupationalRent?.enabled || normalizePortalStatus(occupationalRent?.status) === 'settled',
        inProgress: Boolean(occupationalRentProofDocument) || normalizePortalStatus(occupationalRent?.status) === 'in_progress',
      }),
      responsible: 'You',
      actionTo: occupationalRent?.enabled ? 'documents' : null,
      actionLabel: occupationalRent?.enabled ? 'Upload Proof' : null,
      dueDate: occupationalRent?.nextDueDate ? formatClientPortalDate(occupationalRent.nextDueDate) : null,
    },
  ]
  const legalChecklistItems = [
    {
      key: 'transfer_documents_prepared',
      title: 'Transfer documents prepared',
      description: 'Attorney transfer packs and legal records must be prepared.',
      status: resolveChecklistProgressState({
        complete:
          atOrBeyondTransfer ||
          hasStepWithStatus(attorneySteps, /draft|transfer preparation|documents prepared/i, ['completed']),
        inProgress: hasStartedStep(attorneySteps, /draft|transfer preparation|document/i),
      }),
      responsible: 'Attorney',
    },
    {
      key: 'lodgement_complete',
      title: 'Lodgement complete',
      description: 'The transfer must move through lodgement before final registration.',
      status: resolveChecklistProgressState({
        complete: atOrBeyondRegistration || hasStepWithStatus(attorneySteps, /lodg/i, ['completed']),
        inProgress: hasStartedStep(attorneySteps, /lodg/i),
      }),
      responsible: 'Attorney',
    },
    {
      key: 'registration_confirmed',
      title: 'Registration confirmed',
      description: 'Registration confirmation marks legal completion of transfer.',
      status: resolveChecklistProgressState({
        complete: atOrBeyondRegistration || normalizePortalStatus(portal?.transaction?.status).includes('registered'),
        inProgress: hasStartedStep(attorneySteps, /register/i),
      }),
      responsible: 'Attorney',
    },
  ]
  const propertyChecklistItems = [
    {
      key: 'snag_list_complete',
      title: 'Snag list complete',
      description: portal?.settings?.snag_reporting_enabled
        ? snagOpenCount === 0
          ? 'No open snag items are currently blocking handover.'
          : `${snagOpenCount} snag item${snagOpenCount === 1 ? '' : 's'} still open.`
        : 'Snag reporting is not required for this transaction.',
      status: resolveChecklistProgressState({
        complete: !portal?.settings?.snag_reporting_enabled || snagOpenCount === 0,
        inProgress: portal?.settings?.snag_reporting_enabled && portal?.issues?.length > 0 && snagOpenCount > 0,
      }),
      responsible: 'Developer',
      actionTo: portal?.settings?.snag_reporting_enabled ? 'snags' : null,
      actionLabel: portal?.settings?.snag_reporting_enabled ? 'View Snags' : null,
    },
    {
      key: 'final_inspection_done',
      title: 'Final inspection done',
      description: 'The final property walk-through must be completed before key release.',
      status: resolveChecklistProgressState({
        complete: Boolean(handoverForm.inspectionCompleted),
        inProgress: handoverScheduled,
      }),
      responsible: 'Developer',
    },
    {
      key: 'utilities_connected',
      title: 'Utilities connected and recorded',
      description: 'Electricity and water readings should be captured for handover records.',
      status: resolveChecklistProgressState({
        complete: Boolean(handoverForm.electricityMeterReading) && Boolean(handoverForm.waterMeterReading),
        inProgress: Boolean(handoverForm.electricityMeterReading) || Boolean(handoverForm.waterMeterReading),
      }),
      responsible: 'Developer',
    },
    {
      key: 'certificates_issued',
      title: 'Certificates issued',
      description: 'Compliance and warranty certificates should be available for reference.',
      status: resolveChecklistProgressState({
        complete: hasComplianceCertificates,
        inProgress: propertySharedDocuments.length > 0,
      }),
      responsible: 'Developer',
      actionTo: 'documents',
      actionLabel: 'View Property Docs',
    },
  ]
  const handoverPreparationItems = [
    {
      key: 'handover_scheduled',
      title: 'Handover date scheduled',
      description: handoverScheduled
        ? `Handover is currently scheduled for ${formatClientPortalDate(handoverForm.handoverDate || portal?.handover?.handoverDate)}.`
        : 'A confirmed handover date is still pending.',
      status: resolveChecklistProgressState({
        complete: handoverScheduled,
        inProgress: normalizePortalStatus(handoverStatus) === 'in_progress',
      }),
      responsible: 'Agent',
    },
    {
      key: 'key_collection_arranged',
      title: 'Key collection arranged',
      description: 'Key collection details should be confirmed before handover day.',
      status: resolveChecklistProgressState({
        complete: Boolean(handoverForm.keysHandedOver) || normalizePortalStatus(handoverStatus) === 'completed',
        inProgress: handoverScheduled,
      }),
      responsible: 'Agent',
    },
    {
      key: 'welcome_pack_ready',
      title: 'Welcome pack ready',
      description: 'Final manuals and welcome pack should be prepared for handover.',
      status: resolveChecklistProgressState({
        complete: Boolean(handoverForm.manualsHandedOver) || hasWelcomePack,
        inProgress: Boolean(handoverForm.remoteHandedOver),
      }),
      responsible: 'Developer',
    },
  ]
  const handoverChecklistSections = [
    {
      key: 'client_requirements',
      title: 'Client requirements',
      description: 'Items you need to complete before handover can be finalized.',
      items: clientChecklistItems,
    },
    {
      key: 'financial_completion',
      title: 'Financial completion',
      description: 'Finance-side conditions that need to be cleared before possession.',
      items: financialChecklistItems,
    },
    {
      key: 'legal_transfer',
      title: 'Legal & transfer',
      description: 'Attorney-led milestones that drive legal readiness.',
      items: legalChecklistItems,
    },
    {
      key: 'property_readiness',
      title: 'Property readiness',
      description: 'Physical unit readiness and supporting certification.',
      items: propertyChecklistItems,
    },
    {
      key: 'handover_preparation',
      title: 'Handover preparation',
      description: 'Final readiness checks before key collection.',
      items: handoverPreparationItems,
    },
  ].map((section) => {
    const completedCount = section.items.filter((item) => item.status === 'complete').length
    return {
      ...section,
      completedCount,
      totalCount: section.items.length,
    }
  })
  const handoverChecklistTotalCount = handoverChecklistSections.reduce((total, section) => total + section.totalCount, 0)
  const handoverChecklistCompletedCount = handoverChecklistSections.reduce((total, section) => total + section.completedCount, 0)
  const handoverChecklistProgressPercent = handoverChecklistTotalCount
    ? Math.round((handoverChecklistCompletedCount / handoverChecklistTotalCount) * 100)
    : 0
  const clientRequirementsSection = handoverChecklistSections.find((section) => section.key === 'client_requirements')
  const clientRequirementsComplete = clientRequirementsSection
    ? clientRequirementsSection.completedCount === clientRequirementsSection.totalCount
    : true
  const handoverReadinessStatus = handoverCompleted
    ? 'Completed'
    : handoverChecklistCompletedCount === handoverChecklistTotalCount && handoverChecklistTotalCount > 0
      ? 'Ready'
      : clientRequirementsComplete && handoverChecklistProgressPercent >= 70
        ? 'Ready'
        : handoverChecklistCompletedCount > 0
          ? 'In Progress'
          : 'Not Ready'
  const handoverReadinessStatusClasses =
    handoverReadinessStatus === 'Completed' || handoverReadinessStatus === 'Ready'
      ? 'border-[#c6dfcf] bg-[#eef8f1] text-[#2b7a53]'
      : handoverReadinessStatus === 'In Progress'
        ? 'border-[#d8e4ef] bg-[#f4f8fc] text-[#3b5873]'
        : 'border-[#f1ddd0] bg-[#fff6f0] text-[#a15b31]'
  const handoverReadinessSummary =
    handoverReadinessStatus === 'Completed'
      ? 'Your handover is complete and all readiness items are closed.'
      : handoverReadinessStatus === 'Ready'
        ? 'Your file is close to handover completion. Final scheduling and key collection can proceed.'
        : handoverReadinessStatus === 'In Progress'
          ? 'Handover preparation is underway. Complete the remaining items to stay on track.'
          : 'Handover is not ready yet. Start with your client requirements to move forward.'
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
  const workspaceHeaderStatusLabel = isHandover ? (handoverCompleted ? 'Handover Completed' : 'Preparing for Handover') : overviewStatusLabel
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
  const primaryOverviewAction = {
    to: nextStepState.ctaTo || 'documents',
    label: nextStepState.ctaLabel || 'Open Documents',
  }
  const secondaryOverviewActions = [
    { to: 'documents', label: 'Documents', icon: FileText },
    { to: 'handover', label: 'Handover', icon: KeyRound },
    { to: 'team', label: 'Team Contacts', icon: Users },
  ].filter((action) => action.to !== primaryOverviewAction.to)
  const primaryOverviewActionClasses =
    nextStepState.tone === 'action'
      ? 'bg-[#d97706] text-white hover:bg-[#b15f07]'
      : 'bg-[#35546c] text-white hover:bg-[#2d475d]'
  const openSharedDocumentPanel = (document, section, fallbackDescription) => {
    if (!document) return
    setDocumentPanel({
      open: true,
      item: {
        kind: 'sales',
        title: document.name || 'Untitled document',
        section,
        description: document.category || fallbackDescription,
        statusLabel: 'Uploaded',
        dateLabel: document.created_at ? new Date(document.created_at).toLocaleDateString() : 'Recently',
        downloadUrl: document.url || '',
        downloadLabel: getDocumentDownloadLabel(document),
      },
    })
  }
  const openRequiredDocumentPanel = (document, section, statusLabel = 'Required') => {
    if (!document) return
    const uploadedDocument = document.uploadedDocumentId ? portalDocumentsById.get(String(document.uploadedDocumentId)) : null
    setDocumentPanel({
      open: true,
      item: {
        kind: 'required',
        documentKey: document.key,
        title: document.label || 'Requested document',
        section,
        description: document.description || 'Upload the requested supporting document.',
        statusLabel,
        uploadLabel: 'Upload document',
        uploadedDocument,
        downloadUrl: uploadedDocument?.url || '',
        downloadLabel: uploadedDocument?.url ? 'View latest upload' : null,
      },
    })
  }
  const getStatusToneClasses = (statusLabel) => {
    const normalizedStatus = normalizePortalStatus(statusLabel)
    if (normalizedStatus === 'missing' || normalizedStatus === 'pending' || normalizedStatus === 'awaiting_signature') {
      return 'border-[#f3d6ce] bg-[#fff5f2] text-[#b5472d]'
    }
    if (normalizedStatus === 'uploaded' || normalizedStatus === 'awaiting_review') {
      return 'border-[#d8e4ef] bg-[#f4f8fc] text-[#3b5873]'
    }
    if (normalizedStatus === 'completed' || normalizedStatus === 'submitted') {
      return 'border-[#c6dfcf] bg-[#eef8f1] text-[#2b7a53]'
    }
    return 'border-[#dde7f1] bg-white text-[#64748b]'
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
                <div className="space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <span className="inline-flex items-center rounded-full border border-[#d8e4ef] bg-[#f8fbff] px-3.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#62798f]">
                        Transaction workspace
                      </span>
                      <h1 className="mt-3 flex flex-wrap items-center gap-2.5 text-[2.2rem] font-semibold leading-tight tracking-[-0.05em] text-[#142132] sm:text-[2.35rem]">
                        <span>{developmentName}</span>
                        <span className="hidden text-[#90a2b6] sm:inline">|</span>
                        <span className="inline-flex items-center rounded-full border border-[#d1deeb] bg-[#f4f8fc] px-3.5 py-1.5 text-[1.22rem] font-semibold tracking-[-0.02em] text-[#35546c]">
                          {unitLabel}
                        </span>
                      </h1>
                      <p className="mt-2 text-sm leading-6 text-[#6b7d93]">
                        {buyerName}
                        {transactionReference ? ` • Ref ${String(transactionReference).slice(0, 12)}` : ''}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#fbfdff] px-3.5 py-1.5 text-xs font-semibold text-[#4a5f77]">
                      {workspaceHeaderStatusLabel}
                    </span>
                  </div>

                  <section className={`rounded-[24px] border p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)] ${nextStepToneClasses.container}`}>
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="inline-flex items-center rounded-full border border-[#d6e3f1] bg-[#eef5fb] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#35546c]">
                            Current Stage: {MAIN_STAGE_LABELS[mainStage]}
                          </span>
                          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${nextStepToneClasses.pill}`}>
                            {nextStepState.tone === 'action' ? <AlertTriangle size={13} /> : nextStepState.tone === 'in_progress' ? <CalendarDays size={13} /> : <Star size={13} />}
                            {nextStepState.label}
                          </span>
                        </div>
                        <h2 className="mt-3 text-[1.34rem] font-semibold tracking-[-0.03em] text-[#142132]">
                          Next: {nextStepState.title}
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm leading-7 text-[#566b82]">{nextStepState.description}</p>
                        {nextStepState.helperText ? <p className="mt-1.5 text-sm font-medium text-[#64748b]">{nextStepState.helperText}</p> : null}
                      </div>
                      <Link
                        to={getClientPortalPath(token, primaryOverviewAction.to)}
                        className={`inline-flex min-h-[46px] w-full items-center justify-center rounded-[14px] px-5 py-2.5 text-sm font-semibold transition sm:w-auto ${primaryOverviewActionClasses}`}
                      >
                        {primaryOverviewAction.label}
                      </Link>
                    </div>
                  </section>

                  <div className="grid gap-3 md:grid-cols-3">
                    <article className="rounded-[18px] border border-[#dbe5ef] bg-[#fbfdff] px-4 py-4">
                      <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Current Stage</span>
                      <strong className="mt-2 block text-[1.18rem] font-semibold tracking-[-0.02em] text-[#142132]">{MAIN_STAGE_LABELS[mainStage]}</strong>
                    </article>
                    <article className="rounded-[18px] border border-[#dbe5ef] bg-[#fbfdff] px-4 py-4">
                      <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Purchase Price</span>
                      <strong className="mt-2 block text-[1.18rem] font-semibold tracking-[-0.02em] text-[#142132]">{purchasePriceLabel}</strong>
                    </article>
                    <article className="rounded-[18px] border border-[#dbe5ef] bg-[#fbfdff] px-4 py-4">
                      <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Time in Stage</span>
                      <strong className="mt-2 block text-[1.18rem] font-semibold tracking-[-0.02em] text-[#142132]">{timeInStageLabel}</strong>
                      <span className="mt-1 block text-xs font-medium text-[#6b7d93]">Updated {stageUpdatedDateLabel}</span>
                    </article>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {secondaryOverviewActions.map((action) => {
                      const Icon = action.icon
                      return (
                        <Link
                          key={action.to}
                          to={getClientPortalPath(token, action.to)}
                          className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#d1deeb] bg-white px-3.5 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                        >
                          <Icon size={15} />
                          {action.label}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ) : isDocuments || isHandover ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#4a5f77]">
                      {workspaceHeaderStatusLabel}
                    </span>
                    <div className="flex flex-wrap gap-2.5">
                      <Link
                        to={getClientPortalPath(token, 'documents')}
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#d1deeb] bg-white px-3.5 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                      >
                        <FileText size={15} />
                        Documents
                      </Link>
                      {isHandover ? (
                        <Link
                          to={getClientPortalPath(token, 'overview')}
                          className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#d1deeb] bg-white px-3.5 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                        >
                          <LayoutDashboard size={15} />
                          Overview
                        </Link>
                      ) : (
                        <Link
                          to={getClientPortalPath(token, 'handover')}
                          className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[#d1deeb] bg-white px-3.5 py-2 text-sm font-semibold text-[#21384d] transition hover:border-[#b9cbde] hover:bg-[#f8fbff]"
                        >
                          <KeyRound size={15} />
                          Handover
                        </Link>
                      )}
                      <Link
                        to={getClientPortalPath(token, 'team')}
                        className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] bg-[#2f5478] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#254664]"
                      >
                        <Users size={15} />
                        Team Contacts
                      </Link>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h1 className="flex flex-wrap items-center gap-3 text-[2.1rem] font-semibold leading-tight tracking-[-0.05em] text-[#142132] sm:text-[2.25rem]">
                      <span>{developmentName}</span>
                      <span className="hidden text-[#90a2b6] sm:inline">|</span>
                      <span className="inline-flex items-center rounded-full border border-[#d1deeb] bg-[#f4f8fc] px-4 py-2 text-[1.25rem] tracking-[-0.03em] text-[#35546c]">
                        {unitLabel}
                      </span>
                    </h1>
                    <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                      {buyerName}
                      {transactionReference ? ` • Ref ${String(transactionReference).slice(0, 12)}` : ''}
                    </p>
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
                      <h3 className="text-[1.28rem] font-semibold tracking-[-0.03em] text-[#142132]">Purchase journey</h3>
                      <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                        You are currently in <strong>{MAIN_STAGE_LABELS[mainStage]}</strong>. {stageExplainer.shortExplainer}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                      {progressPercent}% complete
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#35546c]">
                      Current: {MAIN_STAGE_LABELS[mainStage]}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#5e7490]">
                      Next milestone: {nextStage}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#5e7490]">
                      {journeyStatusLabel}
                    </span>
                  </div>

                  <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#e6edf4]">
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
        <section className="space-y-5 rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <div className="overflow-x-auto">
            <nav className="inline-flex min-w-full gap-2 rounded-[18px] border border-[#e2eaf3] bg-[#f8fbff] p-2">
              {CLIENT_DOCUMENT_TABS.map((tab) => {
                const isActive = activeDocumentsTabKey === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveDocumentsTab(tab.key)}
                    className={`inline-flex min-h-[44px] min-w-[170px] items-center justify-center rounded-[14px] px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'border border-[#d1deeb] bg-white text-[#142132] shadow-[0_10px_22px_rgba(15,23,42,0.08)]'
                        : 'border border-transparent text-[#5f7086] hover:border-[#d8e4ef] hover:bg-white hover:text-[#142132]'
                    }`}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </nav>
          </div>

          {activeDocumentsTabKey === 'sales' ? (
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Sales documents</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Download, sign, and return these core sale documents.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {salesRequiredDocuments.length} required • {salesSharedDocuments.length} shared
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {salesRequiredDocuments.map((document) => {
                  const uploadedDocument = document.uploadedDocumentId ? portalDocumentsById.get(String(document.uploadedDocumentId)) : null
                  const statusLabel = document.complete ? 'Uploaded' : 'Not uploaded'
                  return (
                    <article
                      key={document.key}
                      className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="block text-sm font-semibold text-[#142132]">{document.label || 'Sales document'}</strong>
                          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.description || 'Complete this document to proceed with the transaction.'}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(statusLabel)}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openRequiredDocumentPanel(document, 'Sales Documents', statusLabel)}
                          className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <FileSignature size={14} />
                          Upload signed version
                        </button>
                        {uploadedDocument?.url ? (
                          <a
                            href={uploadedDocument.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                          >
                            <Download size={14} />
                            View upload
                          </a>
                        ) : null}
                      </div>
                    </article>
                  )
                })}
                {salesSharedDocuments.map((document) => (
                  <button
                    type="button"
                    key={document.id}
                    onClick={() => openSharedDocumentPanel(document, 'Sales Documents', 'Document shared by your team for review and signature.')}
                    className="w-full rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4 text-left transition hover:border-[#cad8e7] hover:bg-[#fbfdff]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Shared sales document'}</strong>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.category || 'Shared by your deal team.'}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses('Uploaded')}`}>
                        Uploaded
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              {!salesRequiredDocuments.length && !salesSharedDocuments.length ? (
                <div className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                  No sales documents are available yet.
                </div>
              ) : null}
            </section>
          ) : null}

          {activeDocumentsTabKey === 'fica' ? (
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">FICA documents</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                    Required documents are generated from your purchaser profile and transaction setup.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {resolvedFicaRequirements.length} requirements
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {resolvedFicaRequirements.map((requirement) => {
                  const statusLabel = requirement.statusLabel || 'Missing'
                  const uploadDocument = requirement.matchedRequirementDoc || null
                  return (
                    <article
                      key={requirement.key}
                      className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="block text-sm font-semibold text-[#142132]">{requirement.label}</strong>
                          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{requirement.description}</p>
                          <span className="mt-2 inline-flex items-center rounded-full border border-[#dde7f1] bg-[#f8fbff] px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#6d8197]">
                            {requirement.required ? 'Required' : 'Optional'}
                          </span>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(statusLabel)}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => uploadDocument && openRequiredDocumentPanel(uploadDocument, 'FICA Documents', statusLabel)}
                          disabled={!uploadDocument}
                          className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white"
                        >
                          <FileSignature size={14} />
                          {uploadDocument ? 'Upload' : 'Awaiting request'}
                        </button>
                        {requirement.uploadedDocument?.url ? (
                          <a
                            href={requirement.uploadedDocument.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                          >
                            <Download size={14} />
                            View upload
                          </a>
                        ) : null}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}

          {activeDocumentsTabKey === 'additional' ? (
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Additional requests</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Ad hoc documents requested by attorneys, bond originators, or your team.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {additionalRequestDocuments.length} requests
                </span>
              </div>
              {additionalRequestDocuments.length ? (
                <div className="mt-4 space-y-3">
                  {additionalRequestDocuments.map((document) => {
                    const uploadedDocument = document.uploadedDocumentId ? portalDocumentsById.get(String(document.uploadedDocumentId)) : null
                    const statusLabel = document.complete ? 'Uploaded' : 'Pending'
                    const requestedByLabel = getRequestedByLabel(
                      document.requested_by_role || document.requestedByRole || document.assigned_to_role,
                    )
                    return (
                      <article key={document.key} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">{document.label || 'Additional request'}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.description || 'Your team requested an additional supporting document.'}</p>
                            <p className="mt-2 text-xs font-medium text-[#7b8ca2]">Requested by: {document.requested_by_name || requestedByLabel}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(statusLabel)}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openRequiredDocumentPanel(document, 'Additional Requests', statusLabel)}
                            className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white"
                          >
                            <FileSignature size={14} />
                            Upload
                          </button>
                          {uploadedDocument?.url ? (
                            <a
                              href={uploadedDocument.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                            >
                              <Download size={14} />
                              View upload
                            </a>
                          ) : null}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                  No additional document requests are active right now.
                </div>
              )}
            </section>
          ) : null}

          {activeDocumentsTabKey === 'approvals' ? (
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Approvals</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Review uploaded bond/bank offers and submit signed approval documents.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {approvalRequiredDocuments.length} approval items
                </span>
              </div>
              {approvalRequiredDocuments.length ? (
                <div className="mt-4 space-y-3">
                  {approvalRequiredDocuments.map((document) => {
                    const uploadedDocument = document.uploadedDocumentId ? portalDocumentsById.get(String(document.uploadedDocumentId)) : null
                    const completionKey = `approval_${document.key}`
                    const completed = Boolean(approvalCompletionByKey[completionKey])
                    const statusLabel = completed ? 'Submitted' : uploadedDocument?.url || document.complete ? 'Awaiting review' : 'Awaiting signature'
                    return (
                      <article key={document.key} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">{document.label || 'Approval item'}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.description || 'Review, sign, and submit this approval item.'}</p>
                            <p className="mt-2 text-xs font-medium text-[#7b8ca2]">
                              Source: {detectApprovalBankName(`${document.label || ''} ${document.description || ''}`)}
                            </p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusToneClasses(statusLabel)}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openRequiredDocumentPanel(document, 'Approvals', statusLabel)}
                            className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white"
                          >
                            <FileSignature size={14} />
                            Upload signed version
                          </button>
                          {uploadedDocument?.url ? (
                            <a
                              href={uploadedDocument.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                            >
                              <Download size={14} />
                              View current file
                            </a>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setApprovalCompletionByKey((previous) => ({ ...previous, [completionKey]: true }))}
                            disabled={completed}
                            className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Mark as complete
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                  No approval items have been assigned yet.
                </div>
              )}
              {approvalSharedDocuments.length ? (
                <div className="mt-5 rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Reference documents</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {approvalSharedDocuments.map((document) => (
                      <button
                        key={document.id}
                        type="button"
                        onClick={() => openSharedDocumentPanel(document, 'Approvals', 'Approval document shared by your finance team.')}
                        className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3 py-2 text-left text-sm font-medium text-[#324559] transition hover:border-[#cad8e7] hover:bg-white"
                      >
                        {document.name || 'Approval document'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {activeDocumentsTabKey === 'property' ? (
            <section className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Property documents</h4>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Reference documents for the property and supporting transfer records.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                  {propertySharedDocuments.length} documents
                </span>
              </div>
              {propertySharedDocuments.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {propertySharedDocuments.map((document) => (
                    <button
                      type="button"
                      key={document.id}
                      onClick={() => openSharedDocumentPanel(document, 'Property Documents', 'Supporting property document for your records.')}
                      className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4 text-left transition hover:border-[#cad8e7] hover:bg-[#fbfdff]"
                    >
                      <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{document.category || 'Property'}</span>
                      <strong className="mt-2 block text-sm font-semibold leading-7 text-[#142132]">{document.name || 'Property document'}</strong>
                      <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#35546c]">
                        <Download size={14} />
                        Open document actions
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                  No property documents have been shared yet.
                </div>
              )}
            </section>
          ) : null}
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
        <section className="space-y-5 rounded-[28px] border border-[#dbe5ef] bg-white p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
          <article className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">About handover</span>
            <h3 className="mt-3 text-[1.2rem] font-semibold tracking-[-0.03em] text-[#142132]">Final readiness before key collection</h3>
            <p className="mt-2 text-sm leading-7 text-[#5f7288]">
              Handover is the final step where the property is officially ready for you to take possession. This checklist shows
              what still needs to be completed, who is responsible, and how close your file is to completion.
            </p>
          </article>

          <article className="rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8ba0b8]">Handover status</span>
                <strong className="mt-3 block text-[1.35rem] font-semibold tracking-[-0.03em] text-[#142132]">{handoverReadinessStatus}</strong>
                <p className="mt-2 text-sm leading-7 text-[#5f7288]">{handoverReadinessSummary}</p>
              </div>
              <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold ${handoverReadinessStatusClasses}`}>
                {handoverReadinessStatus}
              </span>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#e6edf4]">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${handoverChecklistProgressPercent}%`, backgroundImage: 'linear-gradient(90deg,#3d78b0_0%,#2f8a64_100%)' }}
              />
            </div>
            <p className="mt-3 text-sm font-medium text-[#5f7288]">
              {handoverChecklistCompletedCount} of {handoverChecklistTotalCount} items completed
            </p>
          </article>

          <div className="space-y-4">
            {handoverChecklistSections.map((section) => (
              <section key={section.key} className="rounded-[22px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#142132]">{section.title}</h4>
                    <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{section.description}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                    {section.completedCount} / {section.totalCount} complete
                  </span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#edf3f8]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#3d78b0_0%,#2f8a64_100%)]"
                    style={{ width: `${section.totalCount ? Math.round((section.completedCount / section.totalCount) * 100) : 0}%` }}
                  />
                </div>

                <div className="mt-4 space-y-3">
                  {section.items.map((item) => {
                    const statusMeta = getChecklistProgressMeta(item.status)
                    return (
                      <article key={item.key} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">{item.title}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{item.description}</p>
                          </div>
                          <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                            Responsible: {item.responsible}
                          </span>
                          {item.dueDate ? (
                            <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                              Due: {item.dueDate}
                            </span>
                          ) : null}
                          <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                            Updated {stageUpdatedDateLabel}
                          </span>
                        </div>
                        {item.actionTo && item.status !== 'complete' ? (
                          <div className="mt-4">
                            <Link
                              to={getClientPortalPath(token, item.actionTo)}
                              className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                            >
                              {item.actionLabel || 'Open'}
                            </Link>
                          </div>
                        ) : null}
                      </article>
                    )
                  })}
                </div>
              </section>
            ))}
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
