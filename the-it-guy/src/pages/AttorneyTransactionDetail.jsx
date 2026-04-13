import { Archive, ArchiveRestore, Ban, CheckCircle2, FileText, RotateCcw, Send, UploadCloud } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import AttorneyStageWorkflowPanel from '../components/AttorneyStageWorkflowPanel'
import LoadingSkeleton from '../components/LoadingSkeleton'
import SharedTransactionShell from '../components/SharedTransactionShell'
import TransactionWorkspaceHeader from '../components/TransactionWorkspaceHeader'
import TransactionWorkspaceMenu from '../components/TransactionWorkspaceMenu'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import { getAttorneyTransferStage, stageLabelFromAttorneyKey } from '../core/transactions/attorneySelectors'
import { normalizeFinanceType } from '../core/transactions/financeType'
import { buildWorkspaceHeaderConfigForRole } from '../core/transactions/workspaceHeaderConfig'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  addStakeholder,
  addTransactionDiscussionComment,
  archiveTransactionLifecycle,
  cancelTransactionLifecycle,
  archiveTransactionDocument,
  inviteStakeholder,
  fetchTransactionById,
  getCompletionBlockers,
  getFinalReportData,
  getOrCreateTransactionOnboarding,
  getRegistrationBlockers,
  markTransactionCompleted,
  markTransactionRegistered,
  removeStakeholder,
  undoTransactionRegistration,
  unarchiveTransactionLifecycle,
  updateTransactionAccessControl,
  updateTransactionSubprocessStep,
  updateTransactionStakeholderContacts,
  uploadDocument,
} from '../lib/api'
import { MAIN_STAGE_LABELS, getMainStageFromDetailedStage } from '../lib/stages'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const ATTORNEY_WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Documents' },
  { id: 'activity', label: 'Activity' },
  { id: 'stakeholders', label: 'Stakeholders' },
  { id: 'details', label: 'Details' },
]

const ATTORNEY_STAGE_RAIL = [
  { key: 'instruction_received', label: 'Instruction Received' },
  { key: 'fica_onboarding', label: 'FICA / Onboarding' },
  { key: 'drafting', label: 'Drafting' },
  { key: 'signing', label: 'Signing' },
  { key: 'guarantees', label: 'Guarantees' },
  { key: 'clearances', label: 'Clearances' },
  { key: 'lodgement', label: 'Lodgement' },
  { key: 'registration_preparation', label: 'Registration Preparation' },
  { key: 'registered', label: 'Registered' },
]

const ATTORNEY_DOCUMENT_CATEGORIES = [
  'Instruction / OTP Documents',
  'Buyer FICA / Compliance',
  'Seller FICA / Compliance',
  'Drafting Documents',
  'Signing Documents',
  'Guarantees',
  'Clearance Documents',
  'Lodgement Documents',
  'Registration / Close-Out Documents',
  'Internal Working Documents',
]

const DOCUMENT_VISIBILITY_OPTIONS = [
  { key: 'shared', label: 'Shared' },
  { key: 'internal', label: 'Internal Only' },
]

const STAKEHOLDER_ROLE_OPTIONS = [
  { key: 'developer', label: 'Developer' },
  { key: 'agent', label: 'Agent' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'seller', label: 'Seller' },
  { key: 'attorney', label: 'Attorney' },
  { key: 'bond_originator', label: 'Bond Originator' },
]

const ATTORNEY_LEGAL_ROLE_OPTIONS = [
  { key: 'transfer', label: 'Transfer Attorney' },
  { key: 'bond', label: 'Bond Attorney' },
  { key: 'cancellation', label: 'Cancellation Attorney' },
]

const STAKEHOLDER_STATUS_OPTIONS = [
  { key: 'active', label: 'Active' },
  { key: 'draft', label: 'Draft' },
  { key: 'invited', label: 'Invited' },
]

const TRANSACTION_ACCESS_LEVEL_OPTIONS = [
  { key: 'private', label: 'Private' },
  { key: 'shared', label: 'Shared' },
  { key: 'restricted', label: 'Restricted' },
]

const DISCUSSION_TYPES = [
  { key: 'operational', label: 'Operational' },
  { key: 'blocker', label: 'Blocker' },
  { key: 'document', label: 'Document' },
  { key: 'decision', label: 'Decision' },
  { key: 'legal', label: 'Legal' },
]

const EMPTY_ARRAY = []
const LIFECYCLE_STATES = ['active', 'registered', 'completed', 'archived', 'cancelled']

function normalizeLifecycleState(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return LIFECYCLE_STATES.includes(normalized) ? normalized : 'active'
}

function getLifecycleStateLabel(value) {
  const normalized = normalizeLifecycleState(value)
  if (normalized === 'registered') return 'Registered'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'archived') return 'Archived'
  if (normalized === 'cancelled') return 'Cancelled'
  return 'Active'
}

function getLifecycleStateClasses(value) {
  const normalized = normalizeLifecycleState(value)
  if (normalized === 'registered') return 'border-info/30 bg-infoSoft text-info'
  if (normalized === 'completed') return 'border-success/30 bg-successSoft text-success'
  if (normalized === 'archived') return 'border-borderDefault bg-mutedBg text-textBody'
  if (normalized === 'cancelled') return 'border-danger/30 bg-dangerSoft text-danger'
  return 'border-borderDefault bg-surfaceAlt text-textMuted'
}

function toInputDate(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildAttorneyFinalReportHtml(report) {
  const timelineRows = (report?.timeline || [])
    .slice(0, 60)
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
          <td>${escapeHtml(item.type || 'Update')}</td>
          <td>${escapeHtml(typeof item.payload === 'object' ? JSON.stringify(item.payload) : String(item.payload || ''))}</td>
        </tr>
      `,
    )
    .join('')

  const documentRows = (report?.documents || [])
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name || 'Untitled')}</td>
          <td>${escapeHtml(item.category || 'Uncategorized')}</td>
          <td>${escapeHtml(toTitle(item.visibility || 'internal'))}</td>
          <td>${escapeHtml(item.uploadedByRole || 'Unknown')}</td>
          <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
        </tr>
      `,
    )
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Bridge Final Transaction Report</title>
  <style>
    body { margin: 0; padding: 24px; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; background: #fff; }
    h1, h2, h3 { margin: 0; }
    .meta { margin-top: 8px; color: #475569; font-size: 12px; }
    .section { margin-top: 18px; border: 1px solid #d7e0ea; border-radius: 8px; padding: 14px; page-break-inside: avoid; }
    .section h2 { font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; color: #334155; margin-bottom: 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
    .kv strong { display: block; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; margin-bottom: 3px; }
    .kv span { font-size: 13px; color: #111827; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
    th, td { text-align: left; border-bottom: 1px solid #e5e7eb; padding: 7px 4px; vertical-align: top; word-break: break-word; }
    th { color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    @media print {
      body { padding: 14px; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Bridge Final Transaction Report</h1>
  <p class="meta">Generated ${escapeHtml(formatDateTime(report.generatedAt))}</p>
  <p class="meta">Reference ${escapeHtml(report.transaction?.reference || '-')} • Lifecycle ${escapeHtml(toTitle(report.lifecycleState || 'active'))}</p>

  <section class="section">
    <h2>Transaction Summary</h2>
    <div class="grid">
      <div class="kv"><strong>Current Stage</strong><span>${escapeHtml(report.transaction?.stage || '-')}</span></div>
      <div class="kv"><strong>Main Stage</strong><span>${escapeHtml(report.transaction?.currentMainStage || '-')}</span></div>
      <div class="kv"><strong>Next Action</strong><span>${escapeHtml(report.transaction?.nextAction || 'Not set')}</span></div>
      <div class="kv"><strong>Risk Status</strong><span>${escapeHtml(report.transaction?.riskStatus || 'On track')}</span></div>
      <div class="kv"><strong>Registration Date</strong><span>${escapeHtml(formatDate(report.registration?.registrationDate))}</span></div>
      <div class="kv"><strong>Title Deed</strong><span>${escapeHtml(report.registration?.titleDeedNumber || 'Not captured')}</span></div>
    </div>
  </section>

  <section class="section">
    <h2>Stakeholders</h2>
    <div class="grid">
      <div class="kv"><strong>Buyer</strong><span>${escapeHtml(report.stakeholders?.buyer?.name || 'Not assigned')}</span></div>
      <div class="kv"><strong>Seller</strong><span>${escapeHtml(report.stakeholders?.seller?.name || 'Not assigned')}</span></div>
      <div class="kv"><strong>Attorney</strong><span>${escapeHtml(report.stakeholders?.attorney || 'Not assigned')}</span></div>
      <div class="kv"><strong>Agent</strong><span>${escapeHtml(report.stakeholders?.agent || 'Not assigned')}</span></div>
    </div>
  </section>

  <section class="section">
    <h2>Documents</h2>
    <table>
      <thead>
        <tr><th>Document</th><th>Category</th><th>Visibility</th><th>Uploaded By</th><th>Uploaded</th></tr>
      </thead>
      <tbody>${documentRows || '<tr><td colspan="5">No documents recorded.</td></tr>'}</tbody>
    </table>
  </section>

  <section class="section">
    <h2>Timeline</h2>
    <table>
      <thead>
        <tr><th>Timestamp</th><th>Event</th><th>Detail</th></tr>
      </thead>
      <tbody>${timelineRows || '<tr><td colspan="3">No timeline events recorded.</td></tr>'}</tbody>
    </table>
  </section>
</body>
</html>`
}

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function formatDate(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatShortDayMonth(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
  })
}

function normalizeRichTextToPlainText(value) {
  const input = String(value || '').trim()
  if (!input) {
    return ''
  }

  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function getCommentRoleTone(role) {
  const normalized = String(role || '').trim().toLowerCase()
  if (normalized === 'developer') {
    return {
      badge: 'border border-info/30 bg-infoSoft text-info',
      card: 'border-[#d9e7f5] bg-[#f8fbff]',
    }
  }
  if (normalized === 'attorney' || normalized === 'conveyancer') {
    return {
      badge: 'border border-primary/30 bg-primarySoft text-primary',
      card: 'border-[#d9e7f5] bg-white',
    }
  }
  if (normalized === 'agent') {
    return {
      badge: 'border border-warning/30 bg-warningSoft text-warning',
      card: 'border-[#efe3cf] bg-white',
    }
  }
  if (normalized === 'bond_originator' || normalized === 'bond') {
    return {
      badge: 'border border-indigo-200 bg-indigo-50 text-indigo-700',
      card: 'border-[#e2e7f7] bg-white',
    }
  }
  if (normalized === 'client' || normalized === 'buyer' || normalized === 'seller') {
    return {
      badge: 'border border-success/30 bg-successSoft text-success',
      card: 'border-[#d8eadf] bg-white',
    }
  }
  return {
    badge: 'border border-borderDefault bg-mutedBg text-textMuted',
    card: 'border-[#e1e9f2] bg-white',
  }
}

function buildPropertyAddress(transaction) {
  return [
    transaction?.property_address_line_1,
    transaction?.property_address_line_2,
    transaction?.suburb,
    transaction?.city,
    transaction?.province,
    transaction?.postal_code,
  ]
    .filter(Boolean)
    .join(', ')
}

function toTitle(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function resolveAttorneyStageIndex(stageKey, signalText) {
  const signal = String(signalText || '').toLowerCase()
  if (stageKey === 'registered' || /registered|registration confirmed|deed registered/.test(signal)) return 8
  if (stageKey === 'lodged_at_deeds_office' || /lodged|lodgement|deeds office|examination/.test(signal)) return 6
  if (stageKey === 'ready_for_lodgement' || /registration preparation|ready for registration|ready to register/.test(signal)) return 7
  if (/clearance|municipal|levy|duty|body corporate|consent/.test(signal)) return 5
  if (/guarantee|bond approved|bank guarantee/.test(signal)) return 4
  if (/sign|signature|signed/.test(signal)) return 3
  if (/draft|preparation|prepare transfer|drafting/.test(signal)) return 2
  if (stageKey === 'documents_pending' || /fica|onboarding|document/.test(signal)) return 1
  return 0
}

function buildStageNodeState(index, currentIndex) {
  if (index < currentIndex) return 'completed'
  if (index === currentIndex) return 'current'
  return 'upcoming'
}

function emptyStakeholderForm() {
  return {
    buyerName: '',
    buyerEmail: '',
    buyerPhone: '',
    sellerName: '',
    sellerEmail: '',
    sellerPhone: '',
    agentName: '',
    agentEmail: '',
    attorneyName: '',
    attorneyEmail: '',
    bondOriginatorName: '',
    bondOriginatorEmail: '',
    matterOwner: '',
  }
}

function AttorneyTransactionDetail() {
  const { transactionId } = useParams()
  const { profile, role: workspaceRole } = useWorkspace()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [workspaceMenu, setWorkspaceMenu] = useState('overview')
  const [discussionBody, setDiscussionBody] = useState('')
  const [discussionType, setDiscussionType] = useState('operational')
  const [uploadDraft, setUploadDraft] = useState({
    category: ATTORNEY_DOCUMENT_CATEGORIES[0],
    visibility: 'shared',
    file: null,
  })
  const [uploadInputVersion, setUploadInputVersion] = useState(0)
  const [stakeholderForm, setStakeholderForm] = useState(() => emptyStakeholderForm())
  const [stakeholderDirectForm, setStakeholderDirectForm] = useState({
    roleType: 'attorney',
    legalRole: 'transfer',
    participantName: '',
    participantEmail: '',
    status: 'active',
    visibilityScope: 'shared',
  })
  const [stakeholderInviteForm, setStakeholderInviteForm] = useState({
    roleType: 'attorney',
    legalRole: 'transfer',
    participantName: '',
    email: '',
    expiresDays: '14',
  })
  const [stakeholderMessage, setStakeholderMessage] = useState('')
  const [inviteLinkResult, setInviteLinkResult] = useState('')
  const [accessControlForm, setAccessControlForm] = useState({
    ownerUserId: '',
    accessLevel: 'shared',
  })
  const [removeDialog, setRemoveDialog] = useState({
    open: false,
    stakeholderId: null,
    title: '',
    description: '',
  })
  const [registrationModalOpen, setRegistrationModalOpen] = useState(false)
  const [registrationDraft, setRegistrationDraft] = useState({
    registrationDate: '',
    titleDeedNumber: '',
    registrationConfirmationDocumentId: '',
  })
  const [registrationValidation, setRegistrationValidation] = useState({
    loading: false,
    canMarkRegistered: false,
    blockers: [],
  })
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    description: '',
    action: '',
  })
  const [reasonDialog, setReasonDialog] = useState({
    open: false,
    action: '',
    title: '',
    subtitle: '',
    confirmLabel: 'Save',
    reasonRequired: true,
  })
  const [reasonDraft, setReasonDraft] = useState('')
  const [onboardingModalOpen, setOnboardingModalOpen] = useState(false)
  const [onboardingActionMessage, setOnboardingActionMessage] = useState('')
  const [onboardingActionBusy, setOnboardingActionBusy] = useState(false)

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      const detail = await fetchTransactionById(transactionId)
      setData(detail)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load transaction.')
    } finally {
      setLoading(false)
    }
  }, [transactionId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const transaction = data?.transaction || null
  const buyer = data?.buyer || null
  const development = data?.development || null
  const unit = data?.unit || null
  const documents = data?.documents ?? EMPTY_ARRAY
  const requiredDocumentChecklist = data?.requiredDocumentChecklist || []
  const transactionDiscussion = data?.transactionDiscussion ?? EMPTY_ARRAY
  const transactionEvents = data?.transactionEvents ?? EMPTY_ARRAY
  const transactionParticipants = data?.transactionParticipants ?? EMPTY_ARRAY
  const transactionSubprocesses = data?.transactionSubprocesses || data?.subprocesses || []
  const attorneyWorkflowSubprocesses = transactionSubprocesses.filter((process) => process?.process_type === 'attorney')
  const activeWorkspaceMenu = ATTORNEY_WORKSPACE_TABS.some((tab) => tab.id === workspaceMenu) ? workspaceMenu : 'overview'

  const mainStage = useMemo(
    () => data?.mainStage || getMainStageFromDetailedStage(transaction?.stage || 'Available'),
    [data?.mainStage, transaction?.stage],
  )
  const mainStageLabel = MAIN_STAGE_LABELS[mainStage] || toTitle(transaction?.stage || 'Available')
  const matterTypeLabel = String(transaction?.transaction_type || '').toLowerCase() === 'development' ? 'Development Matter' : 'Private Matter'
  const financeTypeLabel = toTitle(normalizeFinanceType(transaction?.finance_type || 'cash'))
  const purchasePriceValue = Number(transaction?.purchase_price || transaction?.sales_price || unit?.price || 0)
  const propertyAddress = buildPropertyAddress(transaction)
  const matterHeadline =
    String(transaction?.transaction_type || '').toLowerCase() === 'development'
      ? `${development?.name || 'Development'}${unit?.unit_number ? ` • Unit ${unit.unit_number}` : ''}`
      : transaction?.property_description || transaction?.property_address_line_1 || 'Private Property Transaction'
  const matterReference = transaction?.transaction_reference || `TRX-${String(transaction?.id || '').slice(0, 8).toUpperCase()}`
  const stageSignal = `${transaction?.next_action || ''} ${transaction?.comment || ''}`
  const transferStageKey = getAttorneyTransferStage({ transaction, stage: transaction?.stage, unit, development })
  const transferStageLabel = stageLabelFromAttorneyKey(transferStageKey)
  const stageIndex = resolveAttorneyStageIndex(transferStageKey, stageSignal)
  const railProgressPercent = Math.round((stageIndex / Math.max(ATTORNEY_STAGE_RAIL.length - 1, 1)) * 100)
  const lifecycleState = normalizeLifecycleState(
    transaction?.lifecycle_state || (transferStageKey === 'registered' ? 'registered' : 'active'),
  )
  const lifecycleLabel = getLifecycleStateLabel(lifecycleState)
  const operationalStateLabel = transaction?.operational_state ? toTitle(transaction.operational_state) : lifecycleLabel
  const onboardingLifecycleStatus = String(transaction?.onboarding_status || '').trim().toLowerCase()
  const onboardingRecordStatus = String(data?.onboarding?.status || '').trim().toLowerCase()
  const onboardingCompleted =
    onboardingLifecycleStatus === 'client_onboarding_complete' ||
    Boolean(transaction?.onboarding_completed_at) ||
    ['submitted', 'reviewed', 'approved'].includes(onboardingRecordStatus)
  const timeInStageShortDate = formatShortDayMonth(transaction?.updated_at || transaction?.created_at)
  const canRunRegistration = lifecycleState === 'active'
  const canUndoRegistration = ['registered', 'completed'].includes(lifecycleState)
  const canMarkCompleted = lifecycleState === 'registered'
  const canArchive = ['registered', 'completed'].includes(lifecycleState)
  const canUnarchive = lifecycleState === 'archived'
  const canCancel = !['archived', 'cancelled'].includes(lifecycleState)
  const registrationDocumentOptions = useMemo(
    () =>
      documents.filter((document) => {
        const status = String(document?.status || '').trim().toLowerCase()
        return status !== 'archived'
      }),
    [documents],
  )
  const documentReadinessText = requiredDocumentChecklist.length
    ? `${documents.length}/${requiredDocumentChecklist.length} uploaded`
    : documents.length
      ? `${documents.length} files uploaded`
      : 'No requirements configured'
  const workspaceHeaderRole = ['developer', 'attorney', 'agent', 'bond_originator'].includes(workspaceRole)
    ? workspaceRole
    : 'attorney'
  const workspaceHeaderConfig = buildWorkspaceHeaderConfigForRole({
    role: workspaceHeaderRole,
    title: development?.name || transaction?.property_description || 'Transaction Workspace',
    unitLabel: unit?.unit_number ? `Unit ${unit.unit_number}` : '',
    subtitle: 'Direct transaction control for onboarding, finance, transfer workflow, and the live purchase record.',
    buyerLabel: buyer?.name || '',
    currentStageLabel: transferStageLabel,
    mainStageLabel,
    operationalStateLabel,
    financeTypeLabel,
    purchasePriceLabel: currency.format(purchasePriceValue || 0),
    timeInStageValue: timeInStageShortDate ? `Updated ${timeInStageShortDate}` : 'Updated —',
    timeInStageMeta: '',
    onboardingLabel: onboardingCompleted ? 'Onboarding Completed' : 'Onboarding Required',
  })
  const workspaceHeaderActions = [
    {
      id: 'onboarding',
      label: onboardingCompleted ? 'Onboarding Completed' : 'Client Onboarding Link',
      icon: onboardingCompleted ? null : 'onboarding_link',
      as: onboardingCompleted ? 'badge' : 'button',
      tone: onboardingCompleted ? 'success' : 'neutral',
      variant: onboardingCompleted ? undefined : 'secondary',
      onClick: onboardingCompleted ? undefined : () => void handleOpenOnboardingModal(),
      disabled: onboardingCompleted ? false : saving,
      className: onboardingCompleted
        ? 'inline-flex min-h-[44px] items-center rounded-full border border-success/35 bg-successSoft px-4 text-sm font-semibold text-success'
        : 'min-w-[230px]',
    },
    {
      id: 'refresh',
      label: 'Refresh',
      icon: 'refresh',
      variant: 'secondary',
      onClick: loadData,
      disabled: loading || saving,
      className: 'min-w-[132px]',
    },
    {
      id: 'print-report',
      label: 'Print Report',
      icon: 'report',
      variant: 'primary',
      onClick: () => void handlePrintFinalReport(),
      disabled: saving,
      className: 'min-w-[152px]',
    },
  ]
  const workspaceMenuTabs = ATTORNEY_WORKSPACE_TABS.map((tab) => {
    if (tab.id === 'documents') {
      return { ...tab, meta: `${documents.length} files` }
    }
    if (tab.id === 'activity') {
      return { ...tab, meta: `${transactionDiscussion.length + transactionEvents.length} updates` }
    }
    if (tab.id === 'stakeholders') {
      return { ...tab, meta: `${transactionParticipants.filter((item) => item?.stakeholderStatus !== 'removed').length} active` }
    }
    if (tab.id === 'details') {
      return { ...tab, meta: lifecycleLabel }
    }
    return { ...tab, meta: transferStageLabel }
  })

  const groupedDocuments = useMemo(() => {
    const groups = ATTORNEY_DOCUMENT_CATEGORIES.reduce((accumulator, category) => {
      accumulator[category] = []
      return accumulator
    }, {})

    for (const document of documents) {
      const category = ATTORNEY_DOCUMENT_CATEGORIES.includes(document?.category) ? document.category : 'Internal Working Documents'
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(document)
    }

    return groups
  }, [documents])

  const activeStakeholders = useMemo(
    () => transactionParticipants.filter((item) => item?.stakeholderStatus !== 'removed'),
    [transactionParticipants],
  )
  const transferAttorney = useMemo(
    () => activeStakeholders.find((item) => item?.roleType === 'attorney' && item?.legalRole === 'transfer') || null,
    [activeStakeholders],
  )
  const bondAttorney = useMemo(
    () => activeStakeholders.find((item) => item?.roleType === 'attorney' && item?.legalRole === 'bond') || null,
    [activeStakeholders],
  )
  const cancellationAttorney = useMemo(
    () => activeStakeholders.find((item) => item?.roleType === 'attorney' && item?.legalRole === 'cancellation') || null,
    [activeStakeholders],
  )
  const ownerCandidateOptions = useMemo(() => {
    const map = new Map()
    for (const participant of activeStakeholders) {
      if (!participant?.userId) continue
      const labelBase = participant.participantName || participant.participantEmail || participant.roleLabel || participant.roleType || 'Stakeholder'
      const roleLabel = participant.roleLabel || toTitle(participant.roleType || '')
      map.set(participant.userId, `${labelBase} (${roleLabel})`)
    }
    if (profile?.id) {
      const fallbackLabel = profile?.fullName || profile?.email || 'Current User'
      if (!map.has(profile.id)) {
        map.set(profile.id, `${fallbackLabel} (Current user)`)
      }
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }))
  }, [activeStakeholders, profile?.email, profile?.fullName, profile?.id])

  const activityFeed = useMemo(
    () =>
      [
        ...transactionEvents.map((event) => ({
          id: `event-${event.id}`,
          title: event.title || toTitle(event.event_type || 'Update'),
          body: event.body || 'Transaction event recorded.',
          createdAt: event.created_at,
          kind: 'event',
        })),
        ...transactionDiscussion.map((comment) => ({
          id: `comment-${comment.id}`,
          title: `${comment.authorName || 'Participant'} • ${comment.authorRoleLabel || toTitle(comment.authorRole || 'Participant')}`,
          body: comment.commentBody || comment.commentText || 'Comment added.',
          createdAt: comment.createdAt || comment.created_at,
          kind: 'comment',
        })),
      ].sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()),
    [transactionDiscussion, transactionEvents],
  )
  const overviewDiscussionItems = useMemo(
    () =>
      [...transactionDiscussion]
        .sort((left, right) => new Date(right.createdAt || right.created_at || 0).getTime() - new Date(left.createdAt || left.created_at || 0).getTime())
        .map((comment) => {
          const authorName = comment.authorName || 'Participant'
          const roleLabel = comment.authorRoleLabel || toTitle(comment.authorRole || 'participant')
          const commentType = toTitle(comment.discussionType || comment.discussion_type || 'operational')
          const roleTone = getCommentRoleTone(comment.authorRole)
          const rawBody = comment.commentBody || comment.commentText || ''
          return {
            id: comment.id,
            authorName,
            authorRole: comment.authorRole || '',
            roleLabel,
            commentType,
            body: normalizeRichTextToPlainText(rawBody) || 'No detail provided.',
            createdAt: comment.createdAt || comment.created_at,
            roleTone,
          }
        }),
    [transactionDiscussion],
  )
  const onboardingRecipients = useMemo(() => {
    const buyerParticipant = activeStakeholders.find((participant) => participant?.roleType === 'buyer')
    const sellerParticipant = activeStakeholders.find((participant) => participant?.roleType === 'seller')

    const rows = [
      {
        key: 'buyer',
        roleLabel: 'Buyer',
        name: buyer?.name || buyerParticipant?.participantName || 'Buyer not assigned',
        email: buyer?.email || buyerParticipant?.participantEmail || '',
        stakeholderStatus: buyerParticipant?.stakeholderStatus || '',
      },
      {
        key: 'seller',
        roleLabel: 'Seller',
        name: transaction?.seller_name || sellerParticipant?.participantName || 'Seller not assigned',
        email: transaction?.seller_email || sellerParticipant?.participantEmail || '',
        stakeholderStatus: sellerParticipant?.stakeholderStatus || '',
      },
    ]

    return rows.map((row) => {
      const stakeholderState = row.stakeholderStatus ? toTitle(row.stakeholderStatus) : row.email ? 'Active' : 'Missing email'
      return {
        ...row,
        stateLabel: onboardingCompleted ? 'Onboarding completed' : stakeholderState,
        canSend: Boolean(row.email) && !onboardingCompleted,
      }
    })
  }, [activeStakeholders, buyer?.email, buyer?.name, onboardingCompleted, transaction?.seller_email, transaction?.seller_name])

  useEffect(() => {
    if (!transaction) {
      return
    }
    const onboarding = data?.onboardingFormData?.formData || {}
    setStakeholderForm({
      buyerName: buyer?.name || '',
      buyerEmail: buyer?.email || '',
      buyerPhone: buyer?.phone || '',
      sellerName: transaction?.seller_name || onboarding?.seller_name || '',
      sellerEmail: transaction?.seller_email || onboarding?.seller_email || '',
      sellerPhone: transaction?.seller_phone || onboarding?.seller_phone || '',
      agentName: transaction?.assigned_agent || '',
      agentEmail: transaction?.assigned_agent_email || '',
      attorneyName: transaction?.attorney || '',
      attorneyEmail: transaction?.assigned_attorney_email || '',
      bondOriginatorName: transaction?.bond_originator || '',
      bondOriginatorEmail: transaction?.assigned_bond_originator_email || '',
      matterOwner: transaction?.matter_owner || '',
    })
  }, [buyer?.email, buyer?.name, buyer?.phone, data?.onboardingFormData?.formData, transaction])

  useEffect(() => {
    if (!transaction) {
      return
    }
    const preferredRegistrationDoc =
      transaction.registration_confirmation_document_id ||
      registrationDocumentOptions.find((item) => item.category === 'Registration / Close-Out Documents')?.id ||
      registrationDocumentOptions[0]?.id ||
      ''
    setRegistrationDraft({
      registrationDate: toInputDate(transaction.registration_date || transaction.registered_at || new Date().toISOString()),
      titleDeedNumber: transaction.title_deed_number || '',
      registrationConfirmationDocumentId: preferredRegistrationDoc,
    })
  }, [registrationDocumentOptions, transaction])

  useEffect(() => {
    if (!transaction) return
    setAccessControlForm({
      ownerUserId: transaction.owner_user_id || profile?.id || '',
      accessLevel: transaction.access_level || 'shared',
    })
  }, [profile?.id, transaction])

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

  async function ensureOnboardingToken() {
    if (!transaction?.id) {
      throw new Error('Transaction data is missing.')
    }

    const record = data?.onboarding?.token
      ? data.onboarding
      : await getOrCreateTransactionOnboarding({
          transactionId: transaction.id,
          purchaserType: transaction?.purchaser_type || 'individual',
        })

    if (!record?.token) {
      throw new Error('Unable to generate onboarding link right now.')
    }

    setData((previous) => (previous ? { ...previous, onboarding: record } : previous))
    return record
  }

  async function getOnboardingLinkUrl() {
    const record = await ensureOnboardingToken()
    return `${window.location.origin}/client/onboarding/${record.token}`
  }

  async function handleOpenOnboardingModal() {
    setOnboardingActionMessage('')
    setOnboardingModalOpen(true)
  }

  async function handleCopyOnboardingLinkForRecipient(recipient) {
    if (!recipient?.canSend) {
      return
    }

    try {
      setOnboardingActionBusy(true)
      setError('')
      const linkUrl = await getOnboardingLinkUrl()
      await navigator.clipboard.writeText(linkUrl)
      setOnboardingActionMessage(`Onboarding link copied for ${recipient.roleLabel.toLowerCase()}.`)
    } catch (copyError) {
      setError(copyError?.message || 'Unable to copy onboarding link right now.')
    } finally {
      setOnboardingActionBusy(false)
    }
  }

  async function handleSendOnboardingLinkForRecipient(recipient) {
    if (!recipient?.canSend) {
      return
    }

    try {
      setOnboardingActionBusy(true)
      setError('')
      const linkUrl = await getOnboardingLinkUrl()
      const subject = encodeURIComponent('Bridge Onboarding Link')
      const body = encodeURIComponent(
        `Hello ${recipient.name || ''},\n\nPlease complete your onboarding here:\n${linkUrl}\n\nBridge`,
      )
      window.open(`mailto:${recipient.email}?subject=${subject}&body=${body}`, '_blank', 'noopener,noreferrer')
      setOnboardingActionMessage(`Mail draft opened for ${recipient.roleLabel.toLowerCase()}.`)
    } catch (sendError) {
      setError(sendError?.message || 'Unable to prepare onboarding send action right now.')
    } finally {
      setOnboardingActionBusy(false)
    }
  }

  async function refreshRegistrationValidation() {
    if (!transaction?.id) {
      return
    }

    try {
      setRegistrationValidation((previous) => ({ ...previous, loading: true }))
      const validation = await getRegistrationBlockers({
        transactionId: transaction.id,
        registrationDate: registrationDraft.registrationDate || null,
        titleDeedNumber: registrationDraft.titleDeedNumber,
        registrationConfirmationDocumentId: registrationDraft.registrationConfirmationDocumentId || null,
      })
      setRegistrationValidation({
        loading: false,
        canMarkRegistered: Boolean(validation?.canMarkRegistered),
        blockers: validation?.blockers || [],
      })
    } catch (validationError) {
      setRegistrationValidation({
        loading: false,
        canMarkRegistered: false,
        blockers: [
          {
            key: 'validation_failed',
            label: validationError.message || 'Unable to validate registration prerequisites.',
          },
        ],
      })
    }
  }

  async function handleOpenRegistrationFlow() {
    setRegistrationModalOpen(true)
    await refreshRegistrationValidation()
  }

  async function handleRunRegistration() {
    if (!transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await markTransactionRegistered({
        transactionId: transaction.id,
        registrationDate: registrationDraft.registrationDate || null,
        titleDeedNumber: registrationDraft.titleDeedNumber,
        registrationConfirmationDocumentId: registrationDraft.registrationConfirmationDocumentId || null,
      })
      setRegistrationModalOpen(false)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadData()
    } catch (registrationError) {
      setError(registrationError.message || 'Unable to mark this transaction as Registered.')
      await refreshRegistrationValidation()
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmAction(action) {
    if (!transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')

      if (action === 'complete') {
        const completion = await getCompletionBlockers(transaction.id)
        if (!completion?.canMarkCompleted) {
          throw new Error((completion?.blockers || []).map((item) => item.label).join(' • ') || 'Completion requirements are not met.')
        }
        await markTransactionCompleted(transaction.id)
      } else if (action === 'unarchive') {
        await unarchiveTransactionLifecycle(transaction.id)
      } else {
        throw new Error('Unsupported action.')
      }

      setConfirmDialog({ open: false, title: '', description: '', action: '' })
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadData()
    } catch (actionError) {
      setError(actionError.message || 'Unable to complete lifecycle action.')
    } finally {
      setSaving(false)
    }
  }

  function openReasonDialog({
    action,
    title,
    subtitle,
    confirmLabel,
    reasonRequired = true,
  }) {
    setReasonDraft('')
    setReasonDialog({
      open: true,
      action,
      title,
      subtitle,
      confirmLabel,
      reasonRequired,
    })
  }

  async function handleSubmitReasonAction() {
    if (!transaction?.id) {
      return
    }

    const reasonValue = reasonDraft.trim()
    if (reasonDialog.reasonRequired && !reasonValue) {
      setError('Reason is required for this action.')
      return
    }

    try {
      setSaving(true)
      setError('')
      if (reasonDialog.action === 'undo_registration') {
        await undoTransactionRegistration({
          transactionId: transaction.id,
          reason: reasonValue,
        })
      } else if (reasonDialog.action === 'archive') {
        await archiveTransactionLifecycle({
          transactionId: transaction.id,
          reason: reasonValue,
        })
      } else if (reasonDialog.action === 'cancel') {
        await cancelTransactionLifecycle({
          transactionId: transaction.id,
          reason: reasonValue,
        })
      } else {
        throw new Error('Unsupported action.')
      }

      setReasonDialog((previous) => ({ ...previous, open: false }))
      setReasonDraft('')
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadData()
    } catch (actionError) {
      setError(actionError.message || 'Unable to apply lifecycle action.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePrintFinalReport() {
    if (!transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const report = await getFinalReportData(transaction.id)
      if (!report) {
        throw new Error('No report data found for this transaction.')
      }
      const html = buildAttorneyFinalReportHtml(report)
      openPrintDocument(html, 'Unable to open final report. Please allow pop-ups and try again.')
    } catch (reportError) {
      setError(reportError.message || 'Unable to generate final report.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!registrationModalOpen) {
      return
    }
    void refreshRegistrationValidation()
  }, [
    registrationDraft.registrationConfirmationDocumentId,
    registrationDraft.registrationDate,
    registrationDraft.titleDeedNumber,
    registrationModalOpen,
  ])

  async function handleSaveStep(payload) {
    if (!transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')

      await updateTransactionSubprocessStep({
        ...payload,
        actorRole: 'attorney',
      })

      if (payload.shareToDiscussion && payload.userComment?.trim()) {
        await addTransactionDiscussionComment({
          transactionId: transaction.id,
          authorName: 'Bridge Conveyancing',
          authorRole: 'attorney',
          commentText: `[operational][shared] ${payload.stepLabel || 'Workflow step'}: ${payload.userComment.trim()}`,
          unitId: unit?.id || null,
        })
      }

      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Unable to update workflow step.')
    } finally {
      setSaving(false)
    }
  }

  async function handleUploadDocument(event) {
    event.preventDefault()
    if (!transaction?.id || !uploadDraft.file) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await uploadDocument({
        transactionId: transaction.id,
        file: uploadDraft.file,
        category: uploadDraft.category,
        isClientVisible: uploadDraft.visibility === 'shared',
        stageKey: transferStageKey,
      })
      setUploadDraft((previous) => ({ ...previous, file: null }))
      setUploadInputVersion((previous) => previous + 1)
      await loadData()
    } catch (uploadError) {
      setError(uploadError.message || 'Unable to upload document.')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchiveDocument(documentId) {
    if (!documentId) return
    try {
      setSaving(true)
      setError('')
      await archiveTransactionDocument(documentId)
      await loadData()
    } catch (archiveError) {
      setError(archiveError.message || 'Unable to archive document.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAccessControl(event) {
    event.preventDefault()
    if (!transaction?.id) return
    try {
      setSaving(true)
      setError('')
      setStakeholderMessage('')
      setInviteLinkResult('')
      const refreshed = await updateTransactionAccessControl({
        transactionId: transaction.id,
        ownerUserId: accessControlForm.ownerUserId || null,
        accessLevel: accessControlForm.accessLevel || 'shared',
      })
      if (refreshed) {
        setData(refreshed)
      } else {
        await loadData()
      }
      setStakeholderMessage('Access control updated.')
      window.dispatchEvent(new Event('itg:transaction-updated'))
    } catch (saveAccessError) {
      setError(saveAccessError.message || 'Unable to update transaction access control.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddStakeholder(event) {
    event.preventDefault()
    if (!transaction?.id) return
    try {
      setSaving(true)
      setError('')
      setStakeholderMessage('')
      setInviteLinkResult('')
      await addStakeholder({
        transactionId: transaction.id,
        roleType: stakeholderDirectForm.roleType,
        legalRole: stakeholderDirectForm.roleType === 'attorney' ? stakeholderDirectForm.legalRole : null,
        participantName: stakeholderDirectForm.participantName,
        participantEmail: stakeholderDirectForm.participantEmail,
        visibilityScope: stakeholderDirectForm.visibilityScope,
        status: stakeholderDirectForm.status,
      })
      setStakeholderDirectForm((previous) => ({
        ...previous,
        participantName: '',
        participantEmail: '',
      }))
      setStakeholderMessage('Stakeholder added.')
      await loadData()
      window.dispatchEvent(new Event('itg:transaction-updated'))
    } catch (addError) {
      setError(addError.message || 'Unable to add stakeholder.')
    } finally {
      setSaving(false)
    }
  }

  async function handleInviteStakeholder(event) {
    event.preventDefault()
    if (!transaction?.id) return
    try {
      setSaving(true)
      setError('')
      setStakeholderMessage('')
      const response = await inviteStakeholder({
        transactionId: transaction.id,
        roleType: stakeholderInviteForm.roleType,
        legalRole: stakeholderInviteForm.roleType === 'attorney' ? stakeholderInviteForm.legalRole : null,
        email: stakeholderInviteForm.email,
        participantName: stakeholderInviteForm.participantName,
        expiresDays: Number(stakeholderInviteForm.expiresDays) || 14,
      })
      const invitationUrl = response?.invitationUrl
        ? `${window.location.origin}${response.invitationUrl}`
        : ''
      if (invitationUrl) {
        try {
          await navigator.clipboard.writeText(invitationUrl)
        } catch {
          // Clipboard can fail in embedded browsers; keep url visible in UI.
        }
      }
      setInviteLinkResult(invitationUrl)
      setStakeholderInviteForm((previous) => ({
        ...previous,
        participantName: '',
        email: '',
      }))
      setStakeholderMessage(invitationUrl ? 'Invite created and link copied.' : 'Invite created.')
      await loadData()
      window.dispatchEvent(new Event('itg:transaction-updated'))
    } catch (inviteError) {
      setError(inviteError.message || 'Unable to create stakeholder invitation.')
    } finally {
      setSaving(false)
    }
  }

  function requestStakeholderRemoval(participant) {
    if (!participant?.id) return
    const participantLabel = participant.participantName || participant.participantEmail || participant.roleLabel || 'this stakeholder'
    setRemoveDialog({
      open: true,
      stakeholderId: participant.id,
      title: 'Remove Stakeholder',
      description: `Remove ${participantLabel} from this transaction? Access will be revoked immediately, and history will be retained.`,
    })
  }

  async function confirmRemoveStakeholder() {
    if (!transaction?.id || !removeDialog.stakeholderId) return
    try {
      setSaving(true)
      setError('')
      setStakeholderMessage('')
      setInviteLinkResult('')
      await removeStakeholder({
        transactionId: transaction.id,
        stakeholderId: removeDialog.stakeholderId,
      })
      setRemoveDialog({ open: false, stakeholderId: null, title: '', description: '' })
      setStakeholderMessage('Stakeholder removed.')
      await loadData()
      window.dispatchEvent(new Event('itg:transaction-updated'))
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove stakeholder.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveStakeholders(event) {
    event.preventDefault()
    if (!transaction?.id) return

    try {
      setSaving(true)
      setError('')
      const refreshed = await updateTransactionStakeholderContacts({
        transactionId: transaction.id,
        buyerName: stakeholderForm.buyerName,
        buyerEmail: stakeholderForm.buyerEmail,
        buyerPhone: stakeholderForm.buyerPhone,
        sellerName: stakeholderForm.sellerName,
        sellerEmail: stakeholderForm.sellerEmail,
        sellerPhone: stakeholderForm.sellerPhone,
        agentName: stakeholderForm.agentName,
        agentEmail: stakeholderForm.agentEmail,
        attorneyName: stakeholderForm.attorneyName,
        attorneyEmail: stakeholderForm.attorneyEmail,
        bondOriginatorName: stakeholderForm.bondOriginatorName,
        bondOriginatorEmail: stakeholderForm.bondOriginatorEmail,
        matterOwner: stakeholderForm.matterOwner,
        actorRole: 'attorney',
      })
      if (refreshed) {
        setData(refreshed)
      } else {
        await loadData()
      }
      window.dispatchEvent(new Event('itg:transaction-updated'))
    } catch (saveError) {
      setError(saveError.message || 'Unable to save stakeholder details.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddDiscussion(event) {
    event.preventDefault()
    if (!transaction?.id || !discussionBody.trim()) {
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
        transactionId: transaction.id,
        authorName: 'Bridge Conveyancing',
        authorRole: 'attorney',
        commentText: prefixedDiscussion,
        unitId: unit?.id || null,
      })
      setDiscussionBody('')
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Unable to post update.')
    } finally {
      setSaving(false)
    }
  }

  if (!isSupabaseConfigured) {
    return <p className="status-message error">Supabase is not configured for this workspace.</p>
  }

  if (loading) {
    return <LoadingSkeleton lines={8} className="panel" />
  }

  if (!data || !transaction) {
    return <p className="status-message error">{error || 'Transaction not found.'}</p>
  }

  const workspaceNavigationSection = (
    <TransactionWorkspaceMenu
      tabs={workspaceMenuTabs}
      activeTab={activeWorkspaceMenu}
      onChange={setWorkspaceMenu}
      ariaLabel="Attorney workspace tabs"
      sectionLabel="Transaction Workspace"
    />
  )

  return (
    <>
      <SharedTransactionShell
      printTitle="Attorney Matter Report"
      printSubtitle={matterHeadline}
      printGeneratedAt={formatDate(new Date().toISOString())}
      errorMessage={error}
      toolbar={workspaceNavigationSection}
      headline={
        activeWorkspaceMenu === 'overview' ? (
          <TransactionWorkspaceHeader
            contextLabel={null}
            title={workspaceHeaderConfig.title}
            unitLabel={workspaceHeaderConfig.unitLabel}
            subtitle={workspaceHeaderConfig.subtitle}
            pills={workspaceHeaderConfig.pills}
            stats={workspaceHeaderConfig.stats}
            actions={workspaceHeaderActions}
          />
        ) : null
      }
    >
      <div className="space-y-6">
        {activeWorkspaceMenu === 'overview' ? (
          <>
            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Attorney Stage Rail</h3>
                  <p className="mt-1 text-secondary text-textMuted">
                    You are currently in <strong className="text-textStrong">{ATTORNEY_STAGE_RAIL[stageIndex]?.label || transferStageLabel}</strong>.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
                  {railProgressPercent}% complete
                </span>
              </div>

              <div className="relative">
                <div className="absolute left-0 right-0 top-4 h-2 rounded-full bg-mutedBg" aria-hidden />
                <div className="absolute left-0 top-4 h-2 rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${railProgressPercent}%` }} aria-hidden />
                <div className="relative grid gap-2 md:grid-cols-9">
                  {ATTORNEY_STAGE_RAIL.map((stage, index) => {
                    const state = buildStageNodeState(index, stageIndex)
                    return (
                      <div key={stage.key} className="flex flex-col items-center text-center">
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-helper font-semibold ${
                            state === 'completed'
                              ? 'border-textStrong bg-textStrong text-textInverse'
                              : state === 'current'
                                ? 'border-textStrong bg-surface text-textStrong ring-2 ring-borderDefault'
                                : 'border-borderDefault bg-surfaceAlt text-textMuted'
                          }`}
                        >
                          {state === 'completed' ? '✓' : index + 1}
                        </span>
                        <span className={`mt-2 text-helper ${state === 'current' ? 'font-semibold text-textStrong' : state === 'completed' ? 'font-medium text-textBody' : 'text-textMuted'}`}>
                          {stage.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>

            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                  <span className="text-label font-semibold uppercase text-textMuted">Matter Reference</span>
                  <strong className="mt-1 block text-body font-semibold text-textStrong">{matterReference}</strong>
                </article>
                <article className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                  <span className="text-label font-semibold uppercase text-textMuted">Property / Unit</span>
                  <strong className="mt-1 block text-body font-semibold text-textStrong">{propertyAddress || matterHeadline}</strong>
                </article>
                <article className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                  <span className="text-label font-semibold uppercase text-textMuted">Finance Type</span>
                  <strong className="mt-1 block text-body font-semibold text-textStrong">{financeTypeLabel}</strong>
                </article>
                <article className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                  <span className="text-label font-semibold uppercase text-textMuted">Document Readiness</span>
                  <strong className="mt-1 block text-body font-semibold text-textStrong">{documentReadinessText}</strong>
                </article>
              </div>
            </section>

            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Lifecycle & Close-Out Control</h3>
                  <p className="mt-1 text-secondary text-textMuted">Manage registration, completion, archive, cancellation, and final reporting.</p>
                </div>
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-helper font-semibold ${getLifecycleStateClasses(lifecycleState)}`}>
                  {lifecycleLabel}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                  <span className="text-label font-semibold uppercase text-textMuted">Registration Date</span>
                  <strong className="mt-1 block text-body font-semibold text-textStrong">{formatDate(transaction.registration_date || transaction.registered_at)}</strong>
                </article>
                <article className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                  <span className="text-label font-semibold uppercase text-textMuted">Title Deed Number</span>
                  <strong className="mt-1 block text-body font-semibold text-textStrong">{transaction.title_deed_number || 'Not captured'}</strong>
                </article>
                <article className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                  <span className="text-label font-semibold uppercase text-textMuted">Completed At</span>
                  <strong className="mt-1 block text-body font-semibold text-textStrong">{formatDateTime(transaction.completed_at)}</strong>
                </article>
                <article className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                  <span className="text-label font-semibold uppercase text-textMuted">Archive / Cancel</span>
                  <strong className="mt-1 block text-body font-semibold text-textStrong">
                    {transaction.archived_at
                      ? `Archived ${formatDate(transaction.archived_at)}`
                      : transaction.cancelled_at
                        ? `Cancelled ${formatDate(transaction.cancelled_at)}`
                        : 'Active'}
                  </strong>
                </article>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => void handleOpenRegistrationFlow()} disabled={saving || !canRunRegistration}>
                  <CheckCircle2 size={14} />
                  Register Transaction
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setConfirmDialog({
                      open: true,
                      action: 'complete',
                      title: 'Mark Transaction Completed',
                      description:
                        'This will close out the file after validating required post-registration checklist and close-out documents.',
                    })
                  }
                  disabled={saving || !canMarkCompleted}
                >
                  <CheckCircle2 size={14} />
                  Mark Completed
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    openReasonDialog({
                      action: 'undo_registration',
                      title: 'Undo Registration',
                      subtitle: 'Admin-only action. Add a clear reason for reversing this registration event.',
                      confirmLabel: 'Undo Registration',
                      reasonRequired: true,
                    })
                  }
                  disabled={saving || !canUndoRegistration}
                >
                  <RotateCcw size={14} />
                  Undo Registration
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    canUnarchive
                      ? setConfirmDialog({
                          open: true,
                          action: 'unarchive',
                          title: 'Unarchive Transaction',
                          description: 'This file will be moved back into active operational lists.',
                        })
                      : openReasonDialog({
                          action: 'archive',
                          title: 'Archive Transaction',
                          subtitle: 'Optional: add context for archival.',
                          confirmLabel: 'Archive',
                          reasonRequired: false,
                        })
                  }
                  disabled={saving || (!canArchive && !canUnarchive)}
                >
                  {canUnarchive ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  {canUnarchive ? 'Unarchive' : 'Archive'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    openReasonDialog({
                      action: 'cancel',
                      title: 'Cancel Transaction',
                      subtitle: 'This removes the file from active operational flow. A cancellation reason is required.',
                      confirmLabel: 'Cancel Transaction',
                      reasonRequired: true,
                    })
                  }
                  disabled={saving || !canCancel}
                >
                  <Ban size={14} />
                  Cancel
                </Button>
                <Button type="button" variant="ghost" onClick={() => void handlePrintFinalReport()} disabled={saving}>
                  <FileText size={14} />
                  Final Report
                </Button>
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-section-title font-semibold text-textStrong">Recent Comments</h3>
                    <p className="mt-1 text-secondary text-textMuted">Latest stakeholder and workflow updates on this file.</p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setWorkspaceMenu('activity')}>
                    Open full activity
                  </Button>
                </div>
                <div className="flex h-[640px] min-h-[540px] flex-col gap-4 overflow-hidden">
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    {overviewDiscussionItems.length ? (
                      <div className="space-y-3 pb-1">
                        {overviewDiscussionItems.map((comment) => (
                          <article
                            key={comment.id}
                            className={`rounded-[20px] border px-5 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] ${comment.roleTone.card}`}
                          >
                            <header className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h4 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">{comment.authorName}</h4>
                                <p className="mt-1 text-xs text-[#7c8ea4]">{comment.roleLabel}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] ${comment.roleTone.badge}`}>
                                  {comment.commentType}
                                </span>
                                <em className="text-xs not-italic text-[#7c8ea4]">{formatDateTime(comment.createdAt)}</em>
                              </div>
                            </header>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#2a3f53]">{comment.body}</p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-5 py-6 text-sm text-[#6b7d93]">
                        No recent comments yet. New updates will appear here as the file progresses.
                      </p>
                    )}
                  </div>

                  <form onSubmit={handleAddDiscussion} className="shrink-0 rounded-[20px] border border-[#dce6f1] bg-white px-5 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_auto] md:items-end">
                      <label className="grid gap-1.5 text-sm font-medium text-[#35546c]">
                        <span>Update Type</span>
                        <Field as="select" value={discussionType} onChange={(event) => setDiscussionType(event.target.value)}>
                          {DISCUSSION_TYPES.map((item) => (
                            <option key={item.key} value={item.key}>
                              {item.label}
                            </option>
                          ))}
                        </Field>
                      </label>
                      <div className="md:justify-self-end">
                        <Button type="submit" disabled={saving || !discussionBody.trim()}>
                          {saving ? 'Posting…' : 'Post Update'}
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 rounded-[16px] border border-[#e3ebf4] bg-[#f9fbff] p-3">
                      <Field
                        as="textarea"
                        rows={3}
                        value={discussionBody}
                        onChange={(event) => setDiscussionBody(event.target.value)}
                        placeholder="Write a concise update for this file..."
                      />
                    </div>
                  </form>
                </div>
              </section>

              <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
                <div className="mb-4">
                  <h3 className="text-section-title font-semibold text-textStrong">Attorney Workflow</h3>
                  <p className="mt-1 text-secondary text-textMuted">Update legal steps and capture checklist progress within this file.</p>
                </div>
                <AttorneyStageWorkflowPanel
                  subprocesses={attorneyWorkflowSubprocesses}
                  documents={documents}
                  saving={saving}
                  disabled={!transaction?.id}
                  onSaveStep={handleSaveStep}
                  onDocumentUploaded={loadData}
                  onOpenDocuments={() => setWorkspaceMenu('documents')}
                />
              </section>
            </section>
          </>
        ) : null}

        {activeWorkspaceMenu === 'documents' ? (
          <section className="space-y-5">
            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <h3 className="text-section-title font-semibold text-textStrong">Upload Document</h3>
              <p className="mt-1 text-secondary text-textMuted">Upload shared or internal legal documents and place them in the correct category.</p>
              <form onSubmit={handleUploadDocument} className="mt-4 grid gap-3 md:grid-cols-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-label font-semibold uppercase text-textMuted">Category</span>
                  <Field
                    as="select"
                    value={uploadDraft.category}
                    onChange={(event) => setUploadDraft((previous) => ({ ...previous, category: event.target.value }))}
                  >
                    {ATTORNEY_DOCUMENT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Field>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-label font-semibold uppercase text-textMuted">Visibility</span>
                  <Field
                    as="select"
                    value={uploadDraft.visibility}
                    onChange={(event) => setUploadDraft((previous) => ({ ...previous, visibility: event.target.value }))}
                  >
                    {DOCUMENT_VISIBILITY_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </label>
                <label className="flex flex-col gap-1.5 md:col-span-2">
                  <span className="text-label font-semibold uppercase text-textMuted">File</span>
                  <Field
                    key={`upload-input-${uploadInputVersion}`}
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null
                      setUploadDraft((previous) => ({ ...previous, file }))
                    }}
                  />
                </label>
                <div className="md:col-span-4">
                  <Button type="submit" disabled={saving || !uploadDraft.file} className="inline-flex items-center gap-2">
                    <UploadCloud size={14} />
                    {saving ? 'Uploading…' : 'Upload Document'}
                  </Button>
                </div>
              </form>
            </section>

            {ATTORNEY_DOCUMENT_CATEGORIES.map((category) => {
              const items = groupedDocuments[category] || []
              return (
                <section key={category} className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-section-title font-semibold text-textStrong">{category}</h3>
                    <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
                      {items.length} file{items.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {items.length ? (
                    <div className="space-y-2">
                      {items.map((document) => (
                        <article key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <strong className="block truncate text-body font-semibold text-textStrong">{document.name || 'Untitled document'}</strong>
                            <small className="mt-1 block text-helper text-textMuted">
                              {toTitle(document.visibility_scope || 'shared')} • {document.uploaded_by_role || 'Internal user'} • {formatDateTime(document.created_at)}
                            </small>
                          </div>
                          <div className="flex items-center gap-2">
                            {document.url ? (
                              <a
                                href={document.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center rounded-control border border-borderDefault bg-surface px-3 py-1.5 text-helper font-semibold text-textStrong hover:border-borderStrong"
                              >
                                Open
                              </a>
                            ) : null}
                            <Button type="button" variant="ghost" size="sm" onClick={() => handleArchiveDocument(document.id)} disabled={saving}>
                              Archive
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-control border border-dashed border-borderDefault bg-surfaceAlt px-4 py-4 text-secondary text-textMuted">
                      No documents in this category yet.
                    </p>
                  )}
                </section>
              )
            })}
          </section>
        ) : null}

        {activeWorkspaceMenu === 'activity' ? (
          <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
            <h3 className="text-section-title font-semibold text-textStrong">Activity Timeline</h3>
            <p className="mt-1 text-secondary text-textMuted">Combined comments, document uploads, and stage events for this file.</p>

            <div className="mt-4 space-y-3">
              {activityFeed.length ? (
                activityFeed.map((entry) => (
                  <article key={entry.id} className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-secondary font-semibold text-textStrong">{entry.title}</strong>
                      <small className="text-helper text-textMuted">{formatDateTime(entry.createdAt)}</small>
                    </div>
                    <p className="mt-1.5 text-secondary text-textBody">{entry.body}</p>
                  </article>
                ))
              ) : (
                <p className="rounded-control border border-dashed border-borderDefault bg-surfaceAlt px-4 py-4 text-secondary text-textMuted">
                  No activity logged for this matter yet.
                </p>
              )}
            </div>

            <form onSubmit={handleAddDiscussion} className="mt-5 grid gap-3 rounded-control border border-borderSoft bg-surfaceAlt p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,240px)_auto] md:items-end">
                <label className="flex flex-col gap-1.5">
                  <span className="text-label font-semibold uppercase text-textMuted">Update Type</span>
                  <Field as="select" value={discussionType} onChange={(event) => setDiscussionType(event.target.value)}>
                    {DISCUSSION_TYPES.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </Field>
                </label>
                <div className="md:justify-self-end">
                  <Button type="submit" disabled={saving || !discussionBody.trim()}>
                    {saving ? 'Posting…' : 'Post Update'}
                  </Button>
                </div>
              </div>
              <Field
                as="textarea"
                rows={4}
                value={discussionBody}
                onChange={(event) => setDiscussionBody(event.target.value)}
                placeholder="Add a concise operational update for this file..."
              />
            </form>
          </section>
        ) : null}

        {activeWorkspaceMenu === 'stakeholders' ? (
          <section className="space-y-5">
            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <h3 className="text-section-title font-semibold text-textStrong">Legal Role Assignments</h3>
              <p className="mt-1 text-secondary text-textMuted">Transfer attorney is mandatory. Bond and cancellation attorneys are optional.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  { label: 'Transfer Attorney', item: transferAttorney, required: true },
                  { label: 'Bond Attorney', item: bondAttorney, required: false },
                  { label: 'Cancellation Attorney', item: cancellationAttorney, required: false },
                ].map((entry) => (
                  <article key={entry.label} className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <span className="text-label font-semibold uppercase text-textMuted">{entry.label}</span>
                    <strong className="mt-1 block text-body font-semibold text-textStrong">
                      {entry.item?.participantName || entry.item?.participantEmail || (entry.required ? 'Required' : 'Not assigned')}
                    </strong>
                    <small className="mt-1 block text-helper text-textMuted">
                      {entry.item?.stakeholderStatus ? toTitle(entry.item.stakeholderStatus) : entry.required ? 'Must be configured' : 'Optional'}
                    </small>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Ownership & Access</h3>
                  <p className="mt-1 text-secondary text-textMuted">Control transaction owner and collaboration visibility (Private / Shared / Restricted).</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
                  Current: {toTitle(accessControlForm.accessLevel || transaction?.access_level || 'shared')}
                </span>
              </div>
              <form onSubmit={handleSaveAccessControl} className="grid gap-3 md:grid-cols-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-label font-semibold uppercase text-textMuted">Owner</span>
                  <Field
                    as="select"
                    value={accessControlForm.ownerUserId}
                    onChange={(event) =>
                      setAccessControlForm((previous) => ({
                        ...previous,
                        ownerUserId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Unassigned</option>
                    {ownerCandidateOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-label font-semibold uppercase text-textMuted">Access Level</span>
                  <Field
                    as="select"
                    value={accessControlForm.accessLevel}
                    onChange={(event) =>
                      setAccessControlForm((previous) => ({
                        ...previous,
                        accessLevel: event.target.value,
                      }))
                    }
                  >
                    {TRANSACTION_ACCESS_LEVEL_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </label>
                <div className="flex items-end">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save Access'}
                  </Button>
                </div>
              </form>
            </section>

            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-section-title font-semibold text-textStrong">Stakeholder Roster</h3>
                <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
                  {activeStakeholders.length} active
                </span>
              </div>
              {activeStakeholders.length ? (
                <div className="space-y-2">
                  {activeStakeholders.map((participant) => (
                    <article key={participant.id} className="grid gap-3 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_auto_auto] md:items-center">
                      <div className="min-w-0">
                        <strong className="block truncate text-body font-semibold text-textStrong">
                          {participant.participantName || participant.participantEmail || 'Unassigned'}
                        </strong>
                        <small className="block truncate text-helper text-textMuted">{participant.participantEmail || 'No email linked'}</small>
                      </div>
                      <div className="min-w-0">
                        <small className="block text-helper text-textMuted">
                          {participant.roleLabel}
                          {participant.legalRole && participant.roleType === 'attorney' ? ` • ${toTitle(participant.legalRole)}` : ''}
                        </small>
                        <small className="block text-helper text-textMuted">
                          {toTitle(participant.stakeholderStatus)} • {toTitle(participant.visibilityScope || 'shared')}
                          {participant.accessInherited ? ' • Inherited from development' : ''}
                        </small>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-borderDefault bg-surface px-2.5 py-1 text-helper font-semibold text-textMuted">
                        {participant.userId ? 'Linked User' : 'Email Stakeholder'}
                      </span>
                      <div className="flex justify-start md:justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={saving || participant.accessInherited}
                          onClick={() => requestStakeholderRemoval(participant)}
                        >
                          Remove
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-control border border-dashed border-borderDefault bg-surfaceAlt px-4 py-4 text-secondary text-textMuted">
                  No active stakeholders attached yet.
                </p>
              )}
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
              <form onSubmit={handleAddStakeholder} className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
                <h3 className="text-section-title font-semibold text-textStrong">Add Stakeholder</h3>
                <p className="mt-1 text-secondary text-textMuted">Direct assignment for internal or already-known stakeholders.</p>
                <div className="mt-4 grid gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Role</span>
                    <Field
                      as="select"
                      value={stakeholderDirectForm.roleType}
                      onChange={(event) =>
                        setStakeholderDirectForm((previous) => ({
                          ...previous,
                          roleType: event.target.value,
                          legalRole: event.target.value === 'attorney' ? previous.legalRole : 'transfer',
                          visibilityScope: event.target.value === 'attorney' || event.target.value === 'developer' || event.target.value === 'agent' || event.target.value === 'bond_originator' ? 'internal' : 'shared',
                        }))
                      }
                    >
                      {STAKEHOLDER_ROLE_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </Field>
                  </label>
                  {stakeholderDirectForm.roleType === 'attorney' ? (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-label font-semibold uppercase text-textMuted">Legal Role</span>
                      <Field
                        as="select"
                        value={stakeholderDirectForm.legalRole}
                        onChange={(event) =>
                          setStakeholderDirectForm((previous) => ({
                            ...previous,
                            legalRole: event.target.value,
                          }))
                        }
                      >
                        {ATTORNEY_LEGAL_ROLE_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </Field>
                    </label>
                  ) : null}
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Name</span>
                    <Field
                      value={stakeholderDirectForm.participantName}
                      onChange={(event) =>
                        setStakeholderDirectForm((previous) => ({
                          ...previous,
                          participantName: event.target.value,
                        }))
                      }
                      placeholder="Stakeholder name"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Email</span>
                    <Field
                      type="email"
                      value={stakeholderDirectForm.participantEmail}
                      onChange={(event) =>
                        setStakeholderDirectForm((previous) => ({
                          ...previous,
                          participantEmail: event.target.value,
                        }))
                      }
                      placeholder="person@example.com"
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-label font-semibold uppercase text-textMuted">Status</span>
                      <Field
                        as="select"
                        value={stakeholderDirectForm.status}
                        onChange={(event) =>
                          setStakeholderDirectForm((previous) => ({
                            ...previous,
                            status: event.target.value,
                          }))
                        }
                      >
                        {STAKEHOLDER_STATUS_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </Field>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-label font-semibold uppercase text-textMuted">Visibility</span>
                      <Field
                        as="select"
                        value={stakeholderDirectForm.visibilityScope}
                        onChange={(event) =>
                          setStakeholderDirectForm((previous) => ({
                            ...previous,
                            visibilityScope: event.target.value,
                          }))
                        }
                      >
                        {DOCUMENT_VISIBILITY_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </Field>
                    </label>
                  </div>
                  <div>
                    <Button type="submit" disabled={saving}>
                      {saving ? 'Saving…' : 'Add Stakeholder'}
                    </Button>
                  </div>
                </div>
              </form>

              <form onSubmit={handleInviteStakeholder} className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
                <h3 className="text-section-title font-semibold text-textStrong">Invite Stakeholder</h3>
                <p className="mt-1 text-secondary text-textMuted">Email invite must be accepted before access is granted.</p>
                <div className="mt-4 grid gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Role</span>
                    <Field
                      as="select"
                      value={stakeholderInviteForm.roleType}
                      onChange={(event) =>
                        setStakeholderInviteForm((previous) => ({
                          ...previous,
                          roleType: event.target.value,
                          legalRole: event.target.value === 'attorney' ? previous.legalRole : 'transfer',
                        }))
                      }
                    >
                      {STAKEHOLDER_ROLE_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </Field>
                  </label>
                  {stakeholderInviteForm.roleType === 'attorney' ? (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-label font-semibold uppercase text-textMuted">Legal Role</span>
                      <Field
                        as="select"
                        value={stakeholderInviteForm.legalRole}
                        onChange={(event) =>
                          setStakeholderInviteForm((previous) => ({
                            ...previous,
                            legalRole: event.target.value,
                          }))
                        }
                      >
                        {ATTORNEY_LEGAL_ROLE_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </Field>
                    </label>
                  ) : null}
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Name (optional)</span>
                    <Field
                      value={stakeholderInviteForm.participantName}
                      onChange={(event) =>
                        setStakeholderInviteForm((previous) => ({
                          ...previous,
                          participantName: event.target.value,
                        }))
                      }
                      placeholder="Stakeholder name"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Email</span>
                    <Field
                      type="email"
                      required
                      value={stakeholderInviteForm.email}
                      onChange={(event) =>
                        setStakeholderInviteForm((previous) => ({
                          ...previous,
                          email: event.target.value,
                        }))
                      }
                      placeholder="person@example.com"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 md:max-w-[220px]">
                    <span className="text-label font-semibold uppercase text-textMuted">Expires (days)</span>
                    <Field
                      type="number"
                      min="1"
                      max="90"
                      value={stakeholderInviteForm.expiresDays}
                      onChange={(event) =>
                        setStakeholderInviteForm((previous) => ({
                          ...previous,
                          expiresDays: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div>
                    <Button type="submit" disabled={saving || !stakeholderInviteForm.email.trim()}>
                      {saving ? 'Creating…' : 'Create Invite'}
                    </Button>
                  </div>
                  {inviteLinkResult ? (
                    <p className="rounded-control border border-borderDefault bg-surfaceAlt px-3 py-2 text-helper text-textMuted">
                      Invite URL: <a href={inviteLinkResult} target="_blank" rel="noreferrer" className="font-semibold text-primary">{inviteLinkResult}</a>
                    </p>
                  ) : null}
                </div>
              </form>
            </section>

            <form onSubmit={handleSaveStakeholders} className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="mb-4">
                <h3 className="text-section-title font-semibold text-textStrong">Stakeholder Contacts</h3>
                <p className="mt-1 text-secondary text-textMuted">Maintain buyer, seller, and execution contacts required for legal progression.</p>
              </div>

              <div className="grid gap-5">
                <section className="grid gap-3 md:grid-cols-3">
                  <h4 className="md:col-span-3 text-body font-semibold text-textStrong">Buyer</h4>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Name</span>
                    <Field value={stakeholderForm.buyerName} onChange={(event) => setStakeholderForm((previous) => ({ ...previous, buyerName: event.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Email</span>
                    <Field type="email" value={stakeholderForm.buyerEmail} onChange={(event) => setStakeholderForm((previous) => ({ ...previous, buyerEmail: event.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Phone</span>
                    <Field value={stakeholderForm.buyerPhone} onChange={(event) => setStakeholderForm((previous) => ({ ...previous, buyerPhone: event.target.value }))} />
                  </label>
                </section>

                <section className="grid gap-3 md:grid-cols-3">
                  <h4 className="md:col-span-3 text-body font-semibold text-textStrong">Seller</h4>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Name</span>
                    <Field value={stakeholderForm.sellerName} onChange={(event) => setStakeholderForm((previous) => ({ ...previous, sellerName: event.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Email</span>
                    <Field type="email" value={stakeholderForm.sellerEmail} onChange={(event) => setStakeholderForm((previous) => ({ ...previous, sellerEmail: event.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Phone</span>
                    <Field value={stakeholderForm.sellerPhone} onChange={(event) => setStakeholderForm((previous) => ({ ...previous, sellerPhone: event.target.value }))} />
                  </label>
                </section>

                <section className="grid gap-3 md:grid-cols-2">
                  <h4 className="md:col-span-2 text-body font-semibold text-textStrong">Execution Team</h4>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Assigned Agent</span>
                    <Field value={stakeholderForm.agentName} onChange={(event) => setStakeholderForm((previous) => ({ ...previous, agentName: event.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Agent Email</span>
                    <Field type="email" value={stakeholderForm.agentEmail} onChange={(event) => setStakeholderForm((previous) => ({ ...previous, agentEmail: event.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Assigned Attorney</span>
                    <Field value={stakeholderForm.attorneyName} onChange={(event) => setStakeholderForm((previous) => ({ ...previous, attorneyName: event.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Attorney Email</span>
                    <Field type="email" value={stakeholderForm.attorneyEmail} onChange={(event) => setStakeholderForm((previous) => ({ ...previous, attorneyEmail: event.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Bond Originator</span>
                    <Field value={stakeholderForm.bondOriginatorName} onChange={(event) => setStakeholderForm((previous) => ({ ...previous, bondOriginatorName: event.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Bond Originator Email</span>
                    <Field type="email" value={stakeholderForm.bondOriginatorEmail} onChange={(event) => setStakeholderForm((previous) => ({ ...previous, bondOriginatorEmail: event.target.value }))} />
                  </label>
                </section>

                <section className="grid gap-3 md:grid-cols-2">
                  <h4 className="md:col-span-2 text-body font-semibold text-textStrong">File Ownership</h4>
                  <label className="flex flex-col gap-1.5 md:max-w-[320px]">
                    <span className="text-label font-semibold uppercase text-textMuted">Matter Owner</span>
                    <Field value={stakeholderForm.matterOwner} onChange={(event) => setStakeholderForm((previous) => ({ ...previous, matterOwner: event.target.value }))} />
                  </label>
                </section>
              </div>

              <div className="mt-5">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save Stakeholder Contacts'}
                </Button>
              </div>
            </form>

            {stakeholderMessage ? (
              <p className="rounded-control border border-borderDefault bg-surfaceAlt px-4 py-3 text-secondary text-textMuted">
                {stakeholderMessage}
              </p>
            ) : null}
          </section>
        ) : null}

        {activeWorkspaceMenu === 'details' ? (
          <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
            <h3 className="text-section-title font-semibold text-textStrong">Matter Details</h3>
            <p className="mt-1 text-secondary text-textMuted">Reference and transaction metadata relevant to legal execution.</p>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[
                { label: 'Transaction Reference', value: matterReference },
                { label: 'Development', value: development?.name || 'Standalone matter' },
                { label: 'Unit', value: unit?.unit_number ? `Unit ${unit.unit_number}` : 'Not linked' },
                { label: 'Property Address', value: propertyAddress || transaction?.property_description || 'Not set' },
                { label: 'Transaction Type', value: matterTypeLabel },
                { label: 'Finance Type', value: financeTypeLabel },
                { label: 'Current Stage', value: transferStageLabel },
                { label: 'Main Process Stage', value: mainStageLabel },
                { label: 'Expected Transfer Date', value: formatDate(transaction?.expected_transfer_date) },
                { label: 'Created', value: formatDateTime(transaction?.created_at) },
                { label: 'Last Updated', value: formatDateTime(transaction?.updated_at) },
              ].map((item) => (
                <article key={item.label} className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                  <span className="text-label font-semibold uppercase text-textMuted">{item.label}</span>
                  <strong className="mt-1 block text-body font-semibold text-textStrong">{item.value}</strong>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      </SharedTransactionShell>

      <Modal
        open={onboardingModalOpen}
        onClose={onboardingActionBusy ? undefined : () => setOnboardingModalOpen(false)}
        title="Send Client Onboarding Link"
        subtitle="Choose a stakeholder and copy or send the onboarding link."
        footer={(
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => setOnboardingModalOpen(false)} disabled={onboardingActionBusy}>
              Close
            </Button>
          </div>
        )}
      >
        <div className="space-y-3">
          {onboardingRecipients.map((recipient) => (
            <article key={recipient.key} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
              <div className="min-w-0">
                <strong className="block text-body font-semibold text-textStrong">{recipient.roleLabel}</strong>
                <p className="mt-1 text-secondary text-textBody">{recipient.name}</p>
                <small className="mt-1 block text-helper text-textMuted">
                  {recipient.email || 'No contact email captured'} • {recipient.stateLabel}
                </small>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCopyOnboardingLinkForRecipient(recipient)}
                  disabled={onboardingActionBusy || !recipient.canSend}
                >
                  Copy Link
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleSendOnboardingLinkForRecipient(recipient)}
                  disabled={onboardingActionBusy || !recipient.canSend}
                >
                  <Send size={14} />
                  Send Link
                </Button>
              </div>
            </article>
          ))}
          {onboardingActionMessage ? (
            <p className="rounded-control border border-borderDefault bg-surfaceAlt px-3 py-2 text-helper text-textMuted">{onboardingActionMessage}</p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={registrationModalOpen}
        onClose={saving ? undefined : () => setRegistrationModalOpen(false)}
        title="Guided Registration"
        subtitle="Capture registration details, validate blockers, and confirm legal registration."
        footer={(
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setRegistrationModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void refreshRegistrationValidation()}
              disabled={saving || registrationValidation.loading}
            >
              {registrationValidation.loading ? 'Validating…' : 'Recheck Requirements'}
            </Button>
            <Button
              type="button"
              onClick={() => void handleRunRegistration()}
              disabled={saving || !registrationValidation.canMarkRegistered}
            >
              {saving ? 'Saving…' : 'Mark Registered'}
            </Button>
          </div>
        )}
      >
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-semibold uppercase text-textMuted">Registration Date</span>
              <Field
                type="date"
                value={registrationDraft.registrationDate}
                onChange={(event) =>
                  setRegistrationDraft((previous) => ({
                    ...previous,
                    registrationDate: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-semibold uppercase text-textMuted">Title Deed Number</span>
              <Field
                value={registrationDraft.titleDeedNumber}
                onChange={(event) =>
                  setRegistrationDraft((previous) => ({
                    ...previous,
                    titleDeedNumber: event.target.value,
                  }))
                }
                placeholder="TD-2026-000123"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-label font-semibold uppercase text-textMuted">Registration Confirmation Document</span>
            <Field
              as="select"
              value={registrationDraft.registrationConfirmationDocumentId}
              onChange={(event) =>
                setRegistrationDraft((previous) => ({
                  ...previous,
                  registrationConfirmationDocumentId: event.target.value,
                }))
              }
            >
              <option value="">Select document</option>
              {registrationDocumentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || `Document ${item.id}`}
                </option>
              ))}
            </Field>
          </label>

          <section className="rounded-control border border-borderSoft bg-surfaceAlt p-4">
            <h4 className="text-body font-semibold text-textStrong">Validation</h4>
            {registrationValidation.blockers.length ? (
              <ul className="mt-2 space-y-1 text-secondary text-danger">
                {registrationValidation.blockers.map((blocker) => (
                  <li key={blocker.key || blocker.label}>• {blocker.label}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-secondary text-success">All required registration checks are satisfied.</p>
            )}
          </section>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.action === 'unarchive' ? 'Unarchive' : 'Mark Completed'}
        variant={confirmDialog.action === 'unarchive' ? 'default' : 'destructive'}
        confirming={saving}
        onCancel={() => setConfirmDialog({ open: false, title: '', description: '', action: '' })}
        onConfirm={() => void handleConfirmAction(confirmDialog.action)}
      />

      <ConfirmDialog
        open={removeDialog.open}
        title={removeDialog.title}
        description={removeDialog.description}
        confirmLabel="Remove Stakeholder"
        variant="destructive"
        confirming={saving}
        onCancel={() => setRemoveDialog({ open: false, stakeholderId: null, title: '', description: '' })}
        onConfirm={() => void confirmRemoveStakeholder()}
      />

      <Modal
        open={reasonDialog.open}
        onClose={saving ? undefined : () => setReasonDialog((previous) => ({ ...previous, open: false }))}
        title={reasonDialog.title}
        subtitle={reasonDialog.subtitle}
        footer={(
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReasonDialog((previous) => ({ ...previous, open: false }))}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={reasonDialog.action === 'cancel' || reasonDialog.action === 'undo_registration' ? 'bg-danger text-textInverse hover:brightness-95' : ''}
              onClick={() => void handleSubmitReasonAction()}
              disabled={saving || (reasonDialog.reasonRequired && !reasonDraft.trim())}
            >
              {saving ? 'Processing…' : reasonDialog.confirmLabel}
            </Button>
          </div>
        )}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-label font-semibold uppercase text-textMuted">
            {reasonDialog.reasonRequired ? 'Reason (required)' : 'Reason (optional)'}
          </span>
          <Field
            as="textarea"
            rows={4}
            value={reasonDraft}
            onChange={(event) => setReasonDraft(event.target.value)}
            placeholder="Add context for this lifecycle action..."
          />
        </label>
      </Modal>
    </>
  )
}

export default AttorneyTransactionDetail
