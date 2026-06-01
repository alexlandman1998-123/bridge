import {
  Activity,
  AlertTriangle,
  AtSign,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  FileText,
  GaugeCircle,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  Send,
  Smile,
  Upload,
  UsersRound,
  Workflow,
  X,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import SharedTransactionShell from '../components/SharedTransactionShell'
import AttorneyAssignmentSection from '../components/attorney/assignments/AttorneyAssignmentSection'
import TransactionBondHybridFinanceWorkflowPanel from '../components/TransactionBondHybridFinanceWorkflowPanel'
import TransactionLifecycleProgress from '../components/TransactionLifecycleProgress'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import { getAttorneyTransferStage, stageLabelFromAttorneyKey } from '../core/transactions/attorneySelectors'
import { isBondFinanceType, normalizeFinanceType } from '../core/transactions/financeType'
import { useWorkspace } from '../context/WorkspaceContext'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import {
  addAttorneyTransactionUpdate,
  getAttorneyWorkflowOperationsForTransaction,
  requestAttorneyWorkflowLaneDocument,
  updateAttorneyWorkflowStepStatus,
} from '../services/attorneyWorkflow/attorneyWorkflowLaneService'
import {
  addTransactionDiscussionComment,
  addBondApplication,
  addBondQuote,
  approveBondQuote,
  archiveTransactionLifecycle,
  cancelTransactionLifecycle,
  archiveTransactionDocument,
  inviteStakeholder,
  fetchTransactionCoreById,
  fetchTransactionById,
  getCompletionBlockers,
  getFinalReportData,
  getTransactionFinanceWorkflow,
  getOrCreateTransactionOnboarding,
  getRegistrationBlockers,
  markFinanceInstructionSent,
  markTransactionCompleted,
  markTransactionRegistered,
  removeStakeholder,
  recordBuyerOnboardingSent,
  reviewCanonicalDocumentRequirement,
  saveTransactionRoleplayerSelections,
  undoTransactionRegistration,
  unarchiveTransactionLifecycle,
  updateTransactionAccessControl,
  updateBondApplication,
  updateBondHybridFinanceStage,
  updateTransactionStakeholderContacts,
  uploadDocument,
} from '../lib/api'
import { buildSellerClientPortalLink } from '../lib/agentListingStorage'
import { canAccessAttorneyMatter } from '../lib/attorneyPermissions'
import { parseEdgeFunctionError } from '../lib/edgeFunctions'
import { fetchPartnersSnapshot, getPartnerAssignmentOptions } from '../lib/partnersRepository'
import { MAIN_STAGE_LABELS, getMainStageFromDetailedStage } from '../lib/stages'
import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const ATTORNEY_WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'parties', label: 'Parties' },
  { id: 'stakeholders', label: 'Roleplayers' },
  { id: 'documents', label: 'Documents' },
  { id: 'finance', label: 'Finance' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'activity', label: 'Activity' },
]

const AGENT_WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Documents' },
  { id: 'finance', label: 'Finance' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'activity', label: 'Activity' },
  { id: 'stakeholders', label: 'Roleplayers' },
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

const ATTORNEY_DOCUMENT_GROUPS = [
  {
    key: 'all_documents',
    label: 'All Documents',
    description: 'All uploaded and requested documents across this matter.',
    categories: ATTORNEY_DOCUMENT_CATEGORIES,
  },
  {
    key: 'buyer_documents',
    label: 'Buyer Documents',
    description: 'Buyer FICA, finance, onboarding, and signature-ready files.',
    categories: ['Buyer FICA / Compliance'],
  },
  {
    key: 'seller_documents',
    label: 'Seller Documents',
    description: 'Seller FICA, mandate, existing bond, and seller signature files.',
    categories: ['Seller FICA / Compliance'],
  },
  {
    key: 'transfer_documents',
    label: 'Transfer Documents',
    description: 'Instruction, transfer drafting, signing, lodgement, and registration files.',
    categories: ['Instruction / OTP Documents', 'Drafting Documents', 'Signing Documents', 'Lodgement Documents'],
  },
  {
    key: 'bond_documents',
    label: 'Bond Documents',
    description: 'Guarantee, finance approval, and clearance-related files.',
    categories: ['Guarantees', 'Clearance Documents'],
  },
  {
    key: 'cancellation_documents',
    label: 'Cancellation Documents',
    description: 'Existing bond cancellation figures, cancellation packs, and bank clearances.',
    categories: ['Clearance Documents'],
  },
  {
    key: 'generated_documents',
    label: 'Generated Documents',
    description: 'Generated transfer, bond, cancellation, and reporting documents.',
    categories: ['Internal Working Documents'],
  },
  {
    key: 'signed_documents',
    label: 'Signed Documents',
    description: 'Executed documents and registration close-out files.',
    categories: ['Registration / Close-Out Documents'],
  },
]

function getAttorneyCategoryForRequiredDocument(requirement = {}) {
  const groupKey = String(requirement?.groupKey || requirement?.group || '').trim().toLowerCase()
  const key = String(requirement?.key || '').trim().toLowerCase()
  if (groupKey.includes('buyer') || key.startsWith('buyer_') || ['proof_of_funds', 'bond_approval', 'bank_statements', 'payslips', 'proof_of_income', 'grant_letter'].includes(key)) {
    return 'Buyer FICA / Compliance'
  }
  if (groupKey.includes('seller') || key.startsWith('seller_')) return 'Seller FICA / Compliance'
  if (key.includes('guarantee')) return 'Guarantees'
  if (key.includes('clearance') || key.includes('rates') || key.includes('levy')) return 'Clearance Documents'
  if (key.includes('lodgement')) return 'Lodgement Documents'
  if (key.includes('registration')) return 'Registration / Close-Out Documents'
  if (key.includes('signed') || key.includes('signature')) return 'Signing Documents'
  if (key.includes('otp') || key.includes('instruction')) return 'Instruction / OTP Documents'
  if (key.includes('transfer')) return 'Drafting Documents'
  return 'Internal Working Documents'
}

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

const SERVICE_PROVIDER_ROLE_OPTIONS = STAKEHOLDER_ROLE_OPTIONS.filter((option) =>
  ['developer', 'agent', 'attorney', 'bond_originator'].includes(option.key),
)

const ATTORNEY_LEGAL_ROLE_OPTIONS = [
  { key: 'transfer', label: 'Transfer Attorney' },
  { key: 'bond', label: 'Bond Attorney' },
  { key: 'cancellation', label: 'Cancellation Attorney' },
]

const TRANSACTION_ACCESS_LEVEL_OPTIONS = [
  { key: 'private', label: 'Private' },
  { key: 'shared', label: 'Shared' },
  { key: 'restricted', label: 'Restricted' },
]

const DISCUSSION_TYPES = [
  { key: 'operational', label: 'Operational' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'document', label: 'Document' },
  { key: 'reminder', label: 'Reminder' },
  { key: 'internal_note', label: 'Internal Note' },
  { key: 'client_update', label: 'Client Update' },
]
const DISCUSSION_VISIBILITY_OPTIONS = [
  { key: 'internal', label: 'Internal Only' },
  { key: 'shared', label: 'Shared with Matter Team' },
  { key: 'client_visible', label: 'Client Visible' },
]

const EMPTY_ARRAY = []
const LIFECYCLE_STATES = ['active', 'registered', 'completed', 'archived', 'cancelled']

function normalizeTransactionKind(transaction) {
  const normalized = String(transaction?.transaction_type || '')
    .trim()
    .toLowerCase()
  if (['development', 'developer_sale'].includes(normalized)) return 'development'
  if (['private', 'private_property'].includes(normalized)) return 'private'
  return transaction?.development_id || transaction?.unit_id ? 'development' : 'private'
}

function cleanDetailText(value = '') {
  return String(value || '').trim()
}

function cleanDetailEmail(value = '') {
  return cleanDetailText(value).toLowerCase()
}

function buildDisplayName(...parts) {
  return parts.map((value) => cleanDetailText(value)).filter(Boolean).join(' ').trim()
}

function resolveBuyerDisplayName({ buyer = null, transaction = null, onboardingFormData = null, participants = [] } = {}) {
  const buyerParticipant = Array.isArray(participants) ? participants.find((participant) => participant?.roleType === 'buyer') : null
  const candidateNames = [
    cleanDetailText(buyer?.name),
    cleanDetailText(buyer?.fullName),
    cleanDetailText(transaction?.buyer_name),
    cleanDetailText(transaction?.buyerName),
    cleanDetailText(onboardingFormData?.buyerFullName),
    cleanDetailText(onboardingFormData?.buyerName),
    cleanDetailText(onboardingFormData?.fullName),
    buildDisplayName(onboardingFormData?.buyerFirstName, onboardingFormData?.buyerLastName),
    buildDisplayName(onboardingFormData?.firstName, onboardingFormData?.lastName),
    cleanDetailText(buyerParticipant?.participantName),
  ].filter(Boolean)
  return candidateNames[0] || 'Buyer details pending'
}

function isBuyerDocumentRequirement(requirement = {}) {
  const category = getAttorneyCategoryForRequiredDocument(requirement)
  const groupKey = cleanDetailText(requirement?.groupKey || requirement?.group).toLowerCase()
  const key = cleanDetailText(requirement?.key).toLowerCase()
  if (category === 'Buyer FICA / Compliance') return true
  if (groupKey.includes('buyer')) return true
  return ['proof_of_funds', 'proof_of_income', 'bank_statements', 'bond_approval', 'grant_letter', 'payslips'].includes(key)
}

function isSellerDocumentRequirement(requirement = {}) {
  const category = getAttorneyCategoryForRequiredDocument(requirement)
  const groupKey = cleanDetailText(requirement?.groupKey || requirement?.group).toLowerCase()
  const key = cleanDetailText(requirement?.key).toLowerCase()
  if (category === 'Seller FICA / Compliance' || category === 'Clearance Documents') return true
  if (groupKey.includes('seller')) return true
  return key.startsWith('seller_') || key.includes('mandate') || key.includes('title_deed') || key.includes('clearance') || key.includes('rates') || key.includes('levy')
}

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
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(value) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeComparableContact(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeRoleplayerOptionValue(value) {
  return String(value || '').trim()
}

function normalizeRoleplayerUuidValue(value) {
  const normalized = normalizeRoleplayerOptionValue(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : ''
}

function makeRoleplayerOptionKey(option = {}) {
  const normalizedOption = option || {}
  return normalizeRoleplayerOptionValue(
    normalizedOption.id ||
      normalizedOption.relationshipId ||
      normalizedOption.organisationId ||
      normalizedOption.email ||
      normalizedOption.companyName,
  )
}

function findRoleplayerOptionInList(options = [], id = '') {
  const normalizedId = normalizeRoleplayerOptionValue(id)
  if (!normalizedId) return null
  return options.find((option) => normalizeRoleplayerOptionValue(option?.id) === normalizedId) || null
}

function getRoleplayerStatusLabel(value = '') {
  const normalized = String(value || 'selected').trim().toLowerCase()
  if (normalized === 'active') return 'Active'
  if (normalized === 'notified') return 'Notified'
  if (normalized === 'selected') return 'Selected'
  if (normalized === 'removed') return 'Removed'
  return toTitle(normalized || 'selected')
}

function getRoleplayerTriggerLabel(value = '', roleType = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'buyer_selects_bond_or_hybrid') return 'activates if buyer selects Bond/Hybrid'
  if (normalized === 'buyer_selects_bond') return 'activates if buyer selects Bond'
  if (normalized === 'buyer_selects_hybrid') return 'activates if buyer selects Hybrid'
  if (normalized === 'bond_approved') return 'activates after bond approval'
  if (normalized === 'attorney_instruction_stage') return 'activates at attorney instruction stage'
  if (normalized === 'immediate') return 'active immediately'
  if (roleType === 'bond_originator') return 'activates if buyer selects Bond/Hybrid'
  return 'pending trigger'
}

function buildPartnerRoleplayerOption(option = {}, roleType = 'transfer_attorney') {
  const normalizedOption = option || {}
  const companyName = normalizeRoleplayerOptionValue(normalizedOption.companyName)
  const scopeLabel = normalizeRoleplayerOptionValue(normalizedOption.scopeLabel)
  const preferred = Boolean(normalizedOption.preferred || normalizedOption.relationshipType === 'preferred')
  return {
    id: makeRoleplayerOptionKey(normalizedOption),
    roleType,
    group: preferred ? 'Preferred Partners' : 'Connected Partners',
    companyName,
    contactPerson: companyName,
    email: normalizeRoleplayerOptionValue(normalizedOption.email),
    organisationId: normalizeRoleplayerOptionValue(normalizedOption.organisationId),
    relationshipId: normalizeRoleplayerUuidValue(normalizedOption.relationshipId || normalizedOption.id),
    scopeType: normalizeRoleplayerOptionValue(normalizedOption.scopeType),
    scopeId: normalizeRoleplayerOptionValue(normalizedOption.scopeId),
    scopeLabel,
    preferred,
    label: `${companyName || 'Connected partner'}${scopeLabel ? ` · ${preferred ? 'Preferred for ' : ''}${scopeLabel.replace(/^Scope:\s*/i, '')}` : ''}`,
  }
}

function buildExistingRoleplayerOption(item = {}, roleType = 'transfer_attorney') {
  const normalizedItem = item || {}
  const companyName = normalizeRoleplayerOptionValue(
    normalizedItem.partnerName || normalizedItem.partner_name || normalizedItem.organisationName || normalizedItem.companyName,
  )
  const contactPerson = normalizeRoleplayerOptionValue(
    normalizedItem.contactPerson || normalizedItem.contact_person || normalizedItem.participantName || normalizedItem.name,
  )
  const email = normalizeRoleplayerOptionValue(normalizedItem.emailAddress || normalizedItem.email_address || normalizedItem.participantEmail || normalizedItem.email)
  const label = companyName || contactPerson || email
  if (!label) return null
  return {
    id: makeRoleplayerOptionKey({
      id: normalizedItem.id,
      organisationId: normalizedItem.organisationId || normalizedItem.organisation_id,
      email,
      companyName: label,
    }),
    roleType,
    group: 'Recently Used',
    companyName: companyName || contactPerson || email,
    contactPerson: contactPerson || companyName || email,
    email,
    organisationId: normalizeRoleplayerOptionValue(normalizedItem.organisationId || normalizedItem.organisation_id),
    relationshipId: normalizeRoleplayerUuidValue(normalizedItem.partnerRelationshipId || normalizedItem.partner_relationship_id || normalizedItem.relationshipId),
    scopeLabel: normalizeRoleplayerOptionValue(normalizedItem.scopeLabel || normalizedItem.scope_label || normalizedItem.snapshot?.scopeLabel),
    preferred: false,
    label,
  }
}

function dedupeRoleplayerOptions(options = []) {
  const map = new Map()
  options.filter(Boolean).forEach((option) => {
    const key = normalizeComparableContact(option.organisationId || option.email || option.companyName || option.id)
    if (!key || map.has(key)) return
    map.set(key, option)
  })
  return [...map.values()]
}

function RoleplayerSelect({ label, value, onChange, options = [], required = false, helper = '' }) {
  const groups = ['Preferred Partners', 'Connected Partners', 'Recently Used']
  const normalizedValue = normalizeRoleplayerOptionValue(value)
  const effectiveValue = options.some((option) => normalizeRoleplayerOptionValue(option.id) === normalizedValue)
    ? normalizedValue
    : ''
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-label font-semibold uppercase text-textMuted">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      <Field as="select" value={effectiveValue} onChange={(event) => onChange(event.target.value)}>
        <option value="">{required ? 'Select roleplayer' : 'No selection'}</option>
        {groups.map((group) => {
          const groupOptions = options.filter((option) => option.group === group)
          if (!groupOptions.length) return null
          return (
            <optgroup key={group} label={group}>
              {groupOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          )
        })}
        <optgroup label="Invite New Partner">
          <option value="__invite_new" disabled>
            Invite from Partners page
          </option>
        </optgroup>
      </Field>
      {helper ? <span className="text-helper leading-5 text-textMuted">{helper}</span> : null}
    </label>
  )
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

function getAttorneyDocumentGroupKey(category) {
  const normalizedCategory = ATTORNEY_DOCUMENT_CATEGORIES.includes(category) ? category : 'Internal Working Documents'
  const match = ATTORNEY_DOCUMENT_GROUPS.find((group) => group.categories.includes(normalizedCategory))
  return match?.key || 'generated_documents'
}

function toTitle(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function formatRoleFriendlyReference(transaction = {}, role = '') {
  const normalizedRole = String(role || '').trim().toLowerCase()
  const rawReference = String(
    transaction?.application_reference ||
      transaction?.bond_application_reference ||
      transaction?.matter_number ||
      transaction?.transaction_reference ||
      transaction?.reference ||
      transaction?.id ||
      '',
  ).trim()
  const fallbackId = String(transaction?.id || '').trim()
  const numericPart = rawReference.match(/\d+$/)?.[0] || fallbackId.match(/\d+$/)?.[0] || fallbackId.slice(0, 8).toUpperCase()

  if (normalizedRole === 'bond_originator') {
    return `APP-${numericPart || 'PENDING'}`
  }

  if (normalizedRole === 'attorney') {
    if (/^MAT-/i.test(rawReference)) return rawReference
    return `MAT-${numericPart || 'PENDING'}`
  }

  if (rawReference) return rawReference
  return `TRX-${numericPart || 'PENDING'}`
}

function isServiceProviderRole(roleType) {
  return ['developer', 'agent', 'attorney', 'bond_originator'].includes(String(roleType || '').trim().toLowerCase())
}

function buildInviteParticipantName(form = {}) {
  const baseName = String(form.participantName || '').trim()
  if (String(form.roleType || '') !== 'agent') {
    return baseName
  }

  const agency = String(form.agentAgencyName || '').trim()
  const phone = String(form.agentPhone || '').trim()
  const extras = [agency, phone].filter(Boolean)

  if (!extras.length) {
    return baseName
  }

  if (baseName) {
    return `${baseName} (${extras.join(' • ')})`
  }

  return extras.join(' • ')
}

function formatCurrencyValue(value, fallback = 'Not captured') {
  const amount = Number(value || 0)
  return amount ? currency.format(amount) : fallback
}

function daysBetween(startValue, endValue = Date.now()) {
  const start = new Date(startValue || 0).getTime()
  const end = new Date(endValue || Date.now()).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) return 'Not set'
  return `${Math.max(0, Math.ceil((end - start) / 86_400_000))} days`
}

const WORKFLOW_STATUS_META = {
  completed: { label: 'Completed', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  in_progress: { label: 'In Progress', dot: 'bg-blue-600', text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  waiting: { label: 'Waiting', dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  blocked: { label: 'Blocked', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  delayed: { label: 'Delayed', dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  not_started: { label: 'Not Started', dot: 'bg-slate-300', text: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
}

const WORKFLOW_STEP_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'completed', label: 'Completed' },
]

const LANE_ACCENTS = {
  transfer: {
    ring: 'border-l-blue-600',
    icon: 'bg-blue-50 text-blue-700 ring-blue-100',
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
    fill: 'bg-blue-600',
  },
  bond: {
    ring: 'border-l-violet-600',
    icon: 'bg-violet-50 text-violet-700 ring-violet-100',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    fill: 'bg-violet-600',
  },
  cancellation: {
    ring: 'border-l-orange-500',
    icon: 'bg-orange-50 text-orange-700 ring-orange-100',
    badge: 'border-orange-200 bg-orange-50 text-orange-700',
    fill: 'bg-orange-500',
  },
}

const WORKFLOW_STEP_LABEL_OVERRIDES = {
  instruction_received: 'Instruction Received',
  fica_received: 'FICA Received',
  transfer_documents_prepared: 'Transfer Docs Prepared',
  buyer_signed: 'Buyer Signed Docs',
  seller_signed: 'Seller Signed Docs',
  guarantees_received: 'Guarantees Received',
  lodgement_submitted: 'Lodgement Submitted',
  registration_confirmed: 'Registration Confirmed',
  bond_instruction_received: 'Bond Instruction Received',
  buyer_fica_received: 'Buyer FICA Received',
  bond_documents_prepared: 'Bond Docs Prepared',
  buyer_signed_bond_docs: 'Buyer Signed Bond Docs',
  guarantees_issued: 'Guarantees Issued',
  bond_lodged: 'Bond Lodged',
  bond_registered: 'Bond Registered',
  cancellation_instruction_received: 'Cancellation Instruction',
  settlement_figures_requested: 'Settlement Figures Requested',
  settlement_figures_received: 'Settlement Figures Received',
  guarantees_provided: 'Guarantees Provided',
  cancellation_docs_prepared: 'Cancellation Docs Prepared',
  cancellation_lodged: 'Cancellation Lodged',
  bond_cancelled: 'Bond Cancelled',
}

function normalizeWorkspaceStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'complete') return 'completed'
  if (normalized === 'pending' || normalized === 'requested' || normalized === 'under_review') return 'waiting'
  if (normalized === 'at_risk') return 'delayed'
  return WORKFLOW_STATUS_META[normalized] ? normalized : 'not_started'
}

function getWorkflowStepLabel(step = {}) {
  return WORKFLOW_STEP_LABEL_OVERRIDES[step.stepKey] || WORKFLOW_STEP_LABEL_OVERRIDES[step.step_key] || step.stepLabel || step.step_label || toTitle(step.stepKey || step.step_key)
}

function getWorkflowLaneTitle(lane = {}) {
  const laneKey = String(lane?.laneKey || lane?.processType || '').toLowerCase()
  if (laneKey === 'bond') return 'Bond Workflow'
  if (laneKey === 'cancellation') return 'Cancellation Workflow'
  return 'Transfer Workflow'
}

function getAssignedFirmLabel(lane = {}) {
  return (
    lane?.assignment?.firmName ||
    lane?.assignment?.attorneyFirmName ||
    lane?.assignment?.firm_name ||
    lane?.assignment?.attorney_firm_name ||
    lane?.assignment?.organisationName ||
    'Assigned firm pending'
  )
}

function getCurrentWorkflowStep(lane = {}) {
  const steps = Array.isArray(lane?.steps) ? lane.steps : []
  const currentKey = lane?.currentStage || lane?.summary?.currentStage
  return (
    steps.find((step) => step.stepKey === currentKey || step.step_key === currentKey) ||
    steps.find((step) => ['blocked', 'waiting', 'in_progress'].includes(normalizeWorkspaceStatus(step.status))) ||
    steps.find((step) => normalizeWorkspaceStatus(step.status) !== 'completed') ||
    steps.at(-1) ||
    null
  )
}

function getWorkflowHealthKey(lane = {}) {
  const status = normalizeWorkspaceStatus(lane?.laneStatus || lane?.summary?.status)
  if (status === 'completed' || status === 'blocked' || status === 'waiting') return status
  const dueDate = lane?.dueDate ? new Date(lane.dueDate).getTime() : null
  if (dueDate && Number.isFinite(dueDate) && dueDate < Date.now() && status !== 'completed') return 'delayed'
  return status === 'not_started' ? 'waiting' : 'in_progress'
}

function getWorkflowHealthLabel(lane = {}) {
  const key = getWorkflowHealthKey(lane)
  if (key === 'in_progress') return 'On Track'
  return WORKFLOW_STATUS_META[key]?.label || 'On Track'
}

function getWorkflowFocus(lane = {}) {
  const currentStep = getCurrentWorkflowStep(lane)
  const status = normalizeWorkspaceStatus(currentStep?.status || lane?.laneStatus || lane?.summary?.status)
  const label = currentStep ? getWorkflowStepLabel(currentStep) : lane?.summary?.nextAction || 'Workflow review'
  if (status === 'blocked') return `Blocked: ${label}`
  if (status === 'waiting') return `Waiting on ${label.toLowerCase()}`
  if (status === 'completed') return `${label} completed`
  if (status === 'not_started') return `Start ${label.toLowerCase()}`
  return `Current focus: ${label}`
}

function getWorkflowExplanation(lane = {}) {
  const currentStep = getCurrentWorkflowStep(lane)
  const status = normalizeWorkspaceStatus(currentStep?.status || lane?.laneStatus || lane?.summary?.status)
  if (currentStep?.comment) return currentStep.comment
  if (status === 'blocked') return 'Resolve the blocker or add a note so the team can move the matter forward.'
  if (status === 'waiting') return 'Capture who or what the workflow is waiting on, then follow up from the action drawer.'
  if (lane?.documentSummary?.missing) return `${lane.documentSummary.missing} required document item(s) still need attention.`
  return lane?.summary?.nextAction ? `Next action: ${lane.summary.nextAction}` : 'Keep the lane moving by updating the active step or adding a workflow note.'
}

function getPrimaryWorkflowAction(lane = {}) {
  const currentStep = getCurrentWorkflowStep(lane)
  const status = normalizeWorkspaceStatus(currentStep?.status || lane?.laneStatus || lane?.summary?.status)
  if (status === 'blocked') return 'Blocker Details'
  if (status === 'waiting') return 'Send Reminder'
  if (lane?.documentSummary?.missing) return 'Upload Document'
  return 'Mark Step Complete'
}

function getStepClasses(step = {}, currentStep = null) {
  const status = normalizeWorkspaceStatus(step.status)
  const meta = WORKFLOW_STATUS_META[status] || WORKFLOW_STATUS_META.not_started
  const currentKey = currentStep?.stepKey || currentStep?.step_key
  const stepKey = step.stepKey || step.step_key
  const isCurrent = currentStep && (currentStep.id === step.id || currentKey === stepKey)
  const base = isCurrent ? 'border-primary bg-primarySoft shadow-[0_8px_18px_rgba(15,70,110,0.10)]' : `${meta.border} ${meta.bg}`
  const text = isCurrent ? 'text-primary' : meta.text
  return { base, text, meta, isCurrent }
}

function getDocumentStatus(document = {}) {
  const raw = String(document.review_status || document.status || '').trim().toLowerCase()
  if (raw === 'under_review') return 'Under Review'
  if (raw === 'completed') return 'Approved'
  return toTitle(raw || 'Uploaded')
}

function getRequirementStatusLabel(status) {
  const raw = String(status || '').trim().toLowerCase()
  if (raw === 'under_review') return 'Under Review'
  if (raw === 'not_applicable') return 'Not Applicable'
  return toTitle(raw || 'Pending')
}

function getRequirementDocumentId(requirement = {}) {
  return requirement.uploadedDocumentId || requirement.uploaded_document_id || requirement.matchedDocument?.id || null
}

function getRequirementCanonicalId(requirement = {}) {
  return requirement.canonicalRequirementInstanceId || requirement.canonical_requirement_instance_id || null
}

function getDocumentCanonicalId(document = {}) {
  return document.canonicalRequirementInstanceId || document.canonical_requirement_instance_id || null
}

function canReviewDocumentRequirement(requirement = {}, document = {}) {
  const status = String(requirement.status || document.review_status || document.status || '').trim().toLowerCase()
  return Boolean(getRequirementCanonicalId(requirement) && ['uploaded', 'under_review'].includes(status))
}

function canReplaceDocumentRequirement(requirement = {}, document = {}) {
  const status = String(requirement.status || document.review_status || document.status || '').trim().toLowerCase()
  return Boolean(getRequirementCanonicalId(requirement) && status === 'rejected')
}

function uniqueDocumentsByRenderKey(items = []) {
  const seen = new Set()
  return items.filter((item) => {
    const key = String(item?.id || `${item?.name || ''}:${item?.file_path || ''}`)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getParticipantDisplayName(participant) {
  return (
    participant?.organisationName ||
    participant?.firmName ||
    participant?.participantName ||
    participant?.participantEmail ||
    'Not assigned'
  )
}

const MATTER_STAGE_MILESTONES = [
  { key: 'instruction', label: 'Instruction' },
  { key: 'fica', label: 'FICA' },
  { key: 'drafting', label: 'Drafting' },
  { key: 'signing', label: 'Signing' },
  { key: 'guarantees', label: 'Guarantees' },
  { key: 'lodgement', label: 'Lodgement' },
  { key: 'registration', label: 'Registration' },
  { key: 'complete', label: 'Complete' },
]

function getMatterStageProgressIndex({ transferStageKey = '', transferStageLabel = '', lifecycleState = '' } = {}) {
  const source = `${transferStageKey} ${transferStageLabel} ${lifecycleState}`.toLowerCase()
  if (/complete|closed|final/.test(source)) return 7
  if (/registered|registration/.test(source)) return 6
  if (/lodge|lodgement/.test(source)) return 5
  if (/guarantee|bank/.test(source)) return 4
  if (/sign/.test(source)) return 3
  if (/draft|doc|prepare/.test(source)) return 2
  if (/fica|kyc|compliance/.test(source)) return 1
  return 0
}

const ACTIVITY_FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'bond', label: 'Bond' },
  { key: 'cancellation', label: 'Cancellation' },
  { key: 'documents', label: 'Documents' },
  { key: 'notes', label: 'Notes' },
  { key: 'internal', label: 'Internal' },
]

const ACTIVITY_CATEGORY_META = {
  transfer: {
    label: 'Transfer',
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
    icon: 'bg-blue-50 text-blue-700 ring-blue-100',
    card: 'border-blue-100',
    dot: 'bg-blue-600',
    Icon: Workflow,
  },
  bond: {
    label: 'Bond',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    icon: 'bg-violet-50 text-violet-700 ring-violet-100',
    card: 'border-violet-100',
    dot: 'bg-violet-600',
    Icon: Workflow,
  },
  cancellation: {
    label: 'Cancellation',
    badge: 'border-orange-200 bg-orange-50 text-orange-700',
    icon: 'bg-orange-50 text-orange-700 ring-orange-100',
    card: 'border-orange-100',
    dot: 'bg-orange-500',
    Icon: Workflow,
  },
  documents: {
    label: 'Documents',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    card: 'border-emerald-100',
    dot: 'bg-emerald-500',
    Icon: FileText,
  },
  appointments: {
    label: 'Appointment',
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    icon: 'bg-sky-50 text-sky-700 ring-sky-100',
    card: 'border-sky-100',
    dot: 'bg-sky-500',
    Icon: CalendarDays,
  },
  notes: {
    label: 'Notes',
    badge: 'border-slate-200 bg-slate-50 text-slate-600',
    icon: 'bg-slate-50 text-slate-600 ring-slate-100',
    card: 'border-slate-100',
    dot: 'bg-slate-400',
    Icon: MessageSquarePlus,
  },
  internal: {
    label: 'Internal',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: 'bg-amber-50 text-amber-700 ring-amber-100',
    card: 'border-amber-100',
    dot: 'bg-amber-500',
    Icon: MessageSquarePlus,
  },
  system: {
    label: 'System',
    badge: 'border-borderSoft bg-mutedBg text-textMuted',
    icon: 'bg-slate-50 text-slate-500 ring-slate-100',
    card: 'border-borderSoft bg-slate-50/50',
    dot: 'bg-slate-300',
    Icon: Activity,
  },
  alert: {
    label: 'Operational Alert',
    badge: 'border-red-200 bg-red-50 text-red-700',
    icon: 'bg-red-50 text-red-700 ring-red-100',
    card: 'border-red-100',
    dot: 'bg-red-500',
    Icon: AlertTriangle,
  },
}

function getLaneCategory(laneKey) {
  const normalized = String(laneKey || '').trim().toLowerCase()
  if (normalized.includes('bond')) return 'bond'
  if (normalized.includes('cancellation')) return 'cancellation'
  if (normalized.includes('transfer')) return 'transfer'
  return ''
}

function getActivityCategoryMeta(category) {
  return ACTIVITY_CATEGORY_META[category] || ACTIVITY_CATEGORY_META.notes
}

function getActivityEventType(event = {}) {
  return String(event.eventType || event.event_type || event.type || '').trim()
}

function getActivityEventData(event = {}) {
  return event.eventData && typeof event.eventData === 'object'
    ? event.eventData
    : event.event_data && typeof event.event_data === 'object'
      ? event.event_data
      : {}
}

function buildActivityFilterKeys(category, extra = []) {
  const keys = new Set(['all', category, ...extra].filter(Boolean))
  if (['transfer', 'bond', 'cancellation'].includes(category)) keys.add(category)
  if (category === 'documents') keys.add('documents')
  if (category === 'internal' || category === 'notes') keys.add('notes')
  return [...keys]
}

function humanizeTransactionEvent(event = {}) {
  const eventType = getActivityEventType(event)
  const eventData = getActivityEventData(event)
  const laneCategory = getLaneCategory(eventData.laneKey || eventData.lane_key || eventData.workflowLane || eventData.attorneyRole)
  const lowerType = eventType.toLowerCase()
  const stepLabel = eventData.stepLabel || eventData.step_label || toTitle(eventData.stepKey || eventData.step_key || '')
  const laneLabel = laneCategory ? `${toTitle(laneCategory)} workflow` : 'Workflow'
  let category = laneCategory || 'system'
  let title = eventData.title || toTitle(eventType || 'Matter update')
  let detail = eventData.message || eventData.note || ''
  let attachmentName = eventData.fileName || eventData.documentName || eventData.title || ''

  if (lowerType.includes('document')) {
    category = 'documents'
    title = eventData.title ? `${eventData.title} requested` : 'Document activity recorded'
    detail = eventData.requestedFrom ? `Requested from ${toTitle(eventData.requestedFrom)}` : detail || 'Document workflow updated.'
  } else if (lowerType.includes('appointment') || lowerType.includes('signing')) {
    category = 'appointments'
    title = eventData.title || 'Signing appointment scheduled'
    detail = [eventData.date, eventData.time, eventData.boardroom].filter(Boolean).join(' · ') || detail || 'Appointment details updated.'
  } else if (lowerType.includes('blocked') || lowerType.includes('overdue') || lowerType.includes('alert')) {
    category = 'alert'
    title = stepLabel ? `${laneLabel} blocked at ${stepLabel}` : 'Operational alert added'
    detail = detail || 'This matter needs attention.'
  } else if (lowerType.includes('waiting')) {
    category = laneCategory || 'alert'
    title = stepLabel ? `${laneLabel} waiting at ${stepLabel}` : 'Workflow marked as waiting'
    detail = detail || 'Waiting reason captured for the workflow.'
  } else if (lowerType.includes('stepcompleted') || lowerType.includes('completed')) {
    category = laneCategory || 'transfer'
    title = stepLabel ? `${laneLabel} moved to ${stepLabel}` : 'Workflow step completed'
    detail = detail || `Step completed${eventData.status ? ` as ${toTitle(eventData.status)}` : ''}.`
  } else if (lowerType.includes('registered')) {
    category = 'system'
    title = 'Matter registered'
    detail = eventData.registrationDate ? `Registration date set to ${formatDate(eventData.registrationDate)}` : detail || 'Registration status updated.'
  } else if (lowerType.includes('note')) {
    category = 'internal'
    title = 'Internal note added'
    detail = detail || 'A matter note was added.'
  } else if (lowerType.includes('sharedupdate')) {
    category = laneCategory || 'notes'
    title = 'Matter team update added'
    detail = detail || 'An update was shared with the matter team.'
  } else if (lowerType.includes('clientvisible')) {
    category = 'notes'
    title = 'Client update published'
    detail = detail || 'A client-visible update was published.'
  } else if (lowerType.includes('roleplayerintro')) {
    category = 'notes'
    title = 'Buyer intro email sent'
    detail = eventData.recipientEmail
      ? `Roleplayer introduction sent to ${eventData.recipientEmail}.`
      : 'Roleplayer introduction sent to the buyer.'
  } else if (lowerType.includes('roleplayerhandoff')) {
    category = 'notes'
    title = 'Team handoff email sent'
    const recipients = Array.isArray(eventData.recipients) ? eventData.recipients : []
    detail = recipients.length
      ? `Handoff sent to ${recipients.map((item) => item.email).filter(Boolean).join(', ')}.`
      : 'Handoff sent to the transaction roleplayers.'
  }

  const meta = getActivityCategoryMeta(category)
  return {
    id: `event-${event.id || `${eventType}-${event.createdAt || event.created_at}`}`,
    title,
    body: normalizeRichTextToPlainText(detail) || 'Matter activity recorded.',
    createdAt: event.createdAt || event.created_at,
    kind: category === 'system' ? 'system' : 'event',
    authorName: eventData.actorName || eventData.createdByName || (category === 'system' ? 'Bridge' : 'Matter team'),
    roleLabel: toTitle(event.createdByRole || event.created_by_role || eventData.actorRole || 'system'),
    category,
    categoryLabel: meta.label,
    commentType: meta.label,
    filterKeys: buildActivityFilterKeys(category, [laneCategory]),
    attachmentName: category === 'documents' ? attachmentName : '',
    meta,
  }
}

function humanizeDiscussionActivity(comment = {}) {
  const visibility = String(comment.visibility || 'shared').trim().toLowerCase()
  const discussionType = String(comment.discussionType || comment.discussion_type || 'operational').trim().toLowerCase()
  const body = normalizeRichTextToPlainText(comment.commentBody || comment.commentText) || 'Comment added.'
  const isInternal = visibility === 'internal' || discussionType === 'internal_note'
  const isClient = visibility === 'client_safe' || visibility === 'client_visible' || discussionType === 'client_update'
  let category = isInternal ? 'internal' : 'notes'
  if (discussionType === 'document') category = 'documents'
  if (discussionType === 'workflow') category = 'transfer'
  if (discussionType === 'reminder') category = 'alert'

  const titleByType = {
    operational: 'Matter update added',
    workflow: 'Workflow update added',
    document: 'Document update added',
    reminder: 'Reminder sent',
    internal_note: 'Internal note added',
    client_update: 'Client update published',
  }
  const meta = getActivityCategoryMeta(category)
  return {
    id: `comment-${comment.id}`,
    title: isInternal ? 'Internal note added' : isClient ? 'Client update published' : titleByType[discussionType] || 'Matter update added',
    body,
    createdAt: comment.createdAt || comment.created_at,
    kind: 'comment',
    authorName: comment.authorName || 'Participant',
    roleLabel: comment.authorRoleLabel || toTitle(comment.authorRole || 'participant'),
    category,
    categoryLabel: isInternal ? 'Internal' : isClient ? 'Client Update' : meta.label,
    commentType: isInternal ? 'Internal' : isClient ? 'Client Update' : meta.label,
    filterKeys: buildActivityFilterKeys(category, [isInternal ? 'internal' : 'notes']),
    attachmentName: '',
    meta,
  }
}

function getActivityDateLabel(value) {
  const date = new Date(value || 0)
  if (!Number.isFinite(date.getTime())) return 'Earlier'
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diffDays = Math.round((startOfToday - startOfDate) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function groupActivityByDate(entries = []) {
  const groups = []
  for (const entry of entries) {
    const label = getActivityDateLabel(entry.createdAt)
    const last = groups.at(-1)
    if (last?.label === label) {
      last.items.push(entry)
    } else {
      groups.push({ label, items: [entry] })
    }
  }
  return groups
}

function buildMatterPreviewShell(matterPreview, transactionId) {
  if (!matterPreview || !transactionId || matterPreview.matterId !== transactionId) {
    return null
  }

  return {
    transaction: {
      id: matterPreview.matterId,
      matter_number: matterPreview.matterReference || `MAT-${String(transactionId).slice(0, 8).toUpperCase()}`,
      transaction_reference: matterPreview.matterReference || `Matter ${String(transactionId).slice(0, 8)}`,
      finance_type: matterPreview.financeType || 'cash',
      purchase_price: matterPreview.purchasePrice || 0,
      sales_price: matterPreview.purchasePrice || 0,
      seller_name: matterPreview.sellerName || '',
      seller_has_existing_bond: matterPreview.sellerHasExistingBond || false,
      current_bond_bank: matterPreview.currentBondBank || '',
      estimated_settlement_amount: matterPreview.estimatedSettlementAmount || 0,
      property_description: matterPreview.propertyLabel || '',
      lifecycle_state: matterPreview.lifecycleState || 'active',
      current_main_stage: matterPreview.currentStage || '',
      stage: matterPreview.currentStage || '',
      registration_date: matterPreview.registrationDate || null,
      updated_at: matterPreview.lastUpdated || new Date().toISOString(),
      created_at: matterPreview.lastUpdated || new Date().toISOString(),
      is_active: true,
    },
    buyer: matterPreview.buyerName || matterPreview.clientName
      ? {
          id: null,
          name: matterPreview.buyerName || matterPreview.clientName,
          email: '',
          phone: '',
        }
      : null,
    development: matterPreview.developmentName
      ? {
          id: null,
          name: matterPreview.developmentName,
          location: '',
        }
      : null,
    unit: null,
    documents: [],
    requiredDocumentChecklist: [],
    transactionDiscussion: [],
    transactionEvents: [],
    transactionParticipants: [],
    appointments: [],
    documentRequests: [],
    documentRequestSummary: {
      total: 0,
      pending: 0,
      uploaded: 0,
      approved: 0,
      rejected: 0,
    },
    transactionChecklistItems: [],
    checklistSummary: {
      total: 0,
      completed: 0,
      open: 0,
      blocked: 0,
    },
    stage: matterPreview.currentStage || '',
    mainStage: matterPreview.currentStage || '',
    __isNavigationPreview: true,
    __loadedAt: new Date().toISOString(),
  }
}

function MatterWorkspaceTabs({ tabs = [], activeTab = '', onChange, premium = false }) {
  const iconByTab = {
    overview: Workflow,
    transfer: Workflow,
    parties: UsersRound,
    stakeholders: UsersRound,
    documents: FileText,
    finance: CircleDollarSign,
    tasks: Clock3,
    activity: Activity,
  }

  return (
    <nav
      className={`${premium ? 'rounded-[22px] p-2 shadow-[0_14px_32px_rgba(15,23,42,0.055)]' : 'rounded-[16px] px-2 py-2 shadow-[0_10px_22px_rgba(15,23,42,0.04)]'} no-print w-full border border-borderDefault bg-white`}
      aria-label="Transaction workspace tabs"
    >
      <div className={`${premium ? 'flex min-w-0 gap-2 overflow-x-auto xl:grid xl:grid-cols-6' : 'flex min-w-0 gap-1 overflow-x-auto'}`}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          const Icon = iconByTab[tab.id] || FileText
          return (
            <button
              key={tab.id}
              type="button"
              className={`${premium ? 'min-h-[46px] flex-1 justify-center rounded-[15px] px-4' : 'min-h-[38px] shrink-0 rounded-[11px] px-3'} inline-flex items-center gap-2 border text-sm font-semibold transition ${
                active
                  ? premium
                    ? 'border-primary bg-primary text-white shadow-[0_10px_20px_rgba(15,70,110,0.16)]'
                    : 'border-primary/15 bg-primarySoft text-primary shadow-[0_4px_12px_rgba(15,70,110,0.08)]'
                  : 'border-transparent text-textMuted hover:border-borderSoft hover:bg-surfaceAlt hover:text-textStrong'
              }`}
              onClick={() => onChange?.(tab.id)}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function MatterOverviewHeader({
  title,
  statusLabel,
  statusClassName,
  propertyLabel,
  subtitle,
  clientTitle = '',
  transactionReference = '',
  transactionStageLabel = '',
  transaction = null,
  mainStage = '',
  buyerName,
  sellerName,
  agentName,
  assignedFirms = [],
  metrics = [],
  progressIndex = 0,
  matterHealthLabel = 'On Track',
  daysActiveLabel = '',
  updatedLabel = '',
  actionButtons = [],
  isAgentView = false,
}) {
  const currentStage = MATTER_STAGE_MILESTONES[Math.min(progressIndex, MATTER_STAGE_MILESTONES.length - 1)] || MATTER_STAGE_MILESTONES[0]

  if (isAgentView) {
    return (
      <div className="space-y-4">
        <section className="rounded-[26px] border border-borderDefault bg-white px-6 py-6 shadow-[0_18px_42px_rgba(15,23,42,0.065)] lg:px-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${statusClassName}`}>
                  {statusLabel}
                </span>
                <span className="inline-flex items-center rounded-full border border-success/25 bg-successSoft px-2.5 py-1 text-[0.72rem] font-semibold text-success">
                  {matterHealthLabel}
                </span>
              </div>
              <h1 className="mt-4 truncate text-[2rem] font-bold tracking-[-0.04em] text-textStrong md:text-[2.45rem]">
                {clientTitle || buyerName || 'Client'}
              </h1>
              <p className="mt-1.5 max-w-4xl text-base leading-7 text-textMuted">
                {propertyLabel || subtitle || 'Property details pending'}
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5 text-sm">
                <span className="rounded-full border border-borderSoft bg-surfaceAlt px-3 py-1.5 text-textBody">
                  <span className="font-semibold text-textStrong">Transaction:</span> {transactionReference || title}
                </span>
                <span className="rounded-full border border-borderSoft bg-surfaceAlt px-3 py-1.5 text-textBody">
                  <span className="font-semibold text-textStrong">Status:</span> {statusLabel}
                </span>
                <span className="rounded-full border border-borderSoft bg-surfaceAlt px-3 py-1.5 text-textBody">
                  <span className="font-semibold text-textStrong">Stage:</span> {transactionStageLabel || currentStage.label}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
              {actionButtons.map((action) => (
                <Button key={action.label} type="button" variant={action.variant || 'secondary'} onClick={action.onClick} disabled={action.disabled}>
                  {action.icon ? createElement(action.icon, { size: 14 }) : null}
                  {action.busy ? action.busyLabel || 'Preparing...' : action.label}
                </Button>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {metrics.map((item) => {
            const Icon = item.icon || FileText
            return (
              <article key={item.label} className="flex min-h-[118px] min-w-0 items-center gap-3 rounded-[18px] border border-borderDefault bg-white px-4 py-3.5 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-[12px] ${item.tone || 'bg-primarySoft text-primary'}`}>
                  {createElement(Icon, { size: 16 })}
                </span>
                <div className="min-w-0">
                  <span className="block text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-textMuted">{item.label}</span>
                  <strong className="mt-1.5 block truncate text-[0.98rem] font-bold text-textStrong">{item.value || 'Not captured'}</strong>
                </div>
              </article>
            )
          })}
        </section>

        <TransactionLifecycleProgress
          transaction={transaction}
          mainStage={mainStage}
          framed
          premium
          helperText={`Transfer status: ${transactionStageLabel || currentStage.label}`}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-borderDefault bg-white px-5 py-6 shadow-[0_14px_34px_rgba(15,23,42,0.06)] md:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full border border-borderDefault bg-surfaceAlt px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-textMuted">
                Transaction Command Center
              </span>
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusClassName}`}>
                {statusLabel}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-bold tracking-[-0.03em] text-textStrong md:text-3xl">{title}</h1>
              <span className="inline-flex items-center rounded-full border border-success/30 bg-successSoft px-3 py-1 text-xs font-semibold text-success">
                {matterHealthLabel}
              </span>
            </div>
            <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-textBody">
              {propertyLabel}
            </p>
            {subtitle ? <p className="mt-1 text-sm text-textMuted">{subtitle}</p> : null}

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {[
                ['Buyer', buyerName || 'Buyer pending'],
                ['Seller', sellerName || 'Seller pending'],
                ['Assigned Agent', agentName || 'Not assigned'],
                ...assignedFirms.map((item) => [item.label, item.value]),
              ].map(([label, value]) => (
                <article key={label} className="min-w-0 rounded-[14px] border border-borderSoft bg-surfaceAlt px-3 py-3">
                  <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">{label}</span>
                  <strong className="mt-1 block truncate text-sm font-semibold text-textStrong">{value || 'Not assigned'}</strong>
                </article>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <div className="min-w-[170px] rounded-[16px] border border-borderSoft bg-surfaceAlt px-4 py-3">
              <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">Health Summary</span>
              <strong className="mt-1 block text-sm text-textStrong">{matterHealthLabel}</strong>
              <span className="mt-1 block text-xs text-textMuted">{daysActiveLabel}{updatedLabel ? ` • Updated ${updatedLabel}` : ''}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => {
          const Icon = item.icon || FileText
          return (
            <article key={item.label} className="flex min-h-[104px] min-w-0 items-center gap-3 rounded-[18px] border border-borderDefault bg-white px-4 py-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
              <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-[13px] ${item.tone || 'bg-primarySoft text-primary'}`}>
                {createElement(Icon, { size: 18 })}
              </span>
              <div className="min-w-0">
                <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">{item.label}</span>
                <strong className="mt-1 block truncate text-base font-bold text-textStrong">{item.value || 'Not captured'}</strong>
              </div>
            </article>
          )
        })}
      </section>

      <TransactionLifecycleProgress
        transaction={transaction}
        mainStage={mainStage}
        framed
        compact
        helperText={`Transfer status: ${transactionStageLabel || currentStage.label}`}
      />
    </div>
  )
}
function WorkflowLaneCard({ lane, onOpenDetails, onPrimaryAction }) {
  const laneKey = String(lane?.laneKey || 'transfer').toLowerCase()
  const accent = LANE_ACCENTS[laneKey] || LANE_ACCENTS.transfer
  const statusKey = getWorkflowHealthKey(lane)
  const statusMeta = WORKFLOW_STATUS_META[statusKey] || WORKFLOW_STATUS_META.not_started
  const progress = Number(lane?.summary?.completionPercent || 0)
  const steps = Array.isArray(lane?.steps) ? lane.steps : []
  const currentStep = getCurrentWorkflowStep(lane)
  const visibleSteps = steps.slice(0, 8)
  const primaryAction = getPrimaryWorkflowAction(lane)

  return (
    <article className={`overflow-hidden rounded-[16px] border border-borderDefault border-l-4 bg-white shadow-[0_10px_22px_rgba(15,23,42,0.04)] ${accent.ring}`}>
      <div className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex size-9 items-center justify-center rounded-[12px] ring-1 ${accent.icon}`}>
                <Workflow size={17} />
              </span>
              <h3 className="text-base font-semibold text-textStrong">{getWorkflowLaneTitle(lane)}</h3>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${accent.badge}`}>
                {getAssignedFirmLabel(lane)}
              </span>
            </div>
            <p className="mt-3 text-sm font-semibold text-textStrong">{getWorkflowFocus(lane)}</p>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-textMuted">{getWorkflowExplanation(lane)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusMeta.border} ${statusMeta.bg} ${statusMeta.text}`}>
              <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
              {getWorkflowHealthLabel(lane)}
            </span>
            <span className="rounded-full border border-borderSoft bg-surfaceAlt px-2.5 py-1 text-xs font-semibold text-textStrong">
              {progress}% complete
            </span>
          </div>
        </div>

        <div className="mt-4">
          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4 xl:grid-cols-8">
            {visibleSteps.map((step) => {
              const classes = getStepClasses(step, currentStep)
              return (
                <div key={step.id || step.stepKey} className={`min-h-[76px] rounded-[12px] border px-2.5 py-2 ${classes.base}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${classes.meta.dot}`} />
                    {classes.isCurrent ? <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[0.62rem] font-bold uppercase text-primary">Now</span> : null}
                  </div>
                  <p className={`mt-2 line-clamp-2 text-[0.72rem] font-semibold leading-4 ${classes.isCurrent ? 'text-textStrong' : 'text-textMuted'}`}>
                    {getWorkflowStepLabel(step)}
                  </p>
                  <p className={`mt-1 truncate text-[0.68rem] font-medium ${classes.text}`}>
                    {step.completedAt ? formatShortDayMonth(step.completedAt) : classes.meta.label}
                  </p>
                </div>
              )
            })}
          </div>
          {steps.length > visibleSteps.length ? (
            <p className="mt-2 text-xs font-medium text-textMuted">+{steps.length - visibleSteps.length} more step(s) in details</p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-xs text-textMuted">
            Next/current step: <span className="font-semibold text-textStrong">{currentStep ? getWorkflowStepLabel(currentStep) : 'No active step'}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => onPrimaryAction?.(lane, primaryAction)}>
              {primaryAction}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => onPrimaryAction?.(lane, 'Upload Document')}>
              <Upload size={14} />
              Upload Document
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onOpenDetails}>
              View Details
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </div>
    </article>
  )
}

function OverviewSidePanel({ title, children }) {
  return (
    <section className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
      <h3 className="text-sm font-semibold text-textStrong">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function WorkflowDetailsDrawer({
  lane,
  open,
  saving = false,
  stepDraft,
  noteDraft,
  documentDraft,
  onClose,
  onSelectStepStatus,
  onStepDraftChange,
  onSubmitStep,
  onNoteDraftChange,
  onSubmitNote,
  onDocumentDraftChange,
  onSubmitDocument,
  onUploadDocument,
  onScheduleSigning,
}) {
  if (!open || !lane) return null
  const steps = Array.isArray(lane.steps) ? lane.steps : []
  const currentStep = getCurrentWorkflowStep(lane)
  const progress = Number(lane?.summary?.completionPercent || 0)
  const healthKey = getWorkflowHealthKey(lane)
  const healthMeta = WORKFLOW_STATUS_META[healthKey] || WORKFLOW_STATUS_META.not_started
  const laneActivity = lane.timeline || lane.updates || []

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/28 no-print" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <aside className="flex h-full w-full max-w-[720px] flex-col overflow-hidden border-l border-borderDefault bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
        <header className="border-b border-borderSoft px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-textStrong">Workflow Details</h2>
                <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${healthMeta.border} ${healthMeta.bg} ${healthMeta.text}`}>
                  <span className={`h-2 w-2 rounded-full ${healthMeta.dot}`} />
                  {getWorkflowHealthLabel(lane)}
                </span>
              </div>
              <p className="mt-1 text-sm text-textMuted">
                {getWorkflowLaneTitle(lane)} — {getAssignedFirmLabel(lane)}
              </p>
            </div>
            <button type="button" className="ui-icon-button h-10 w-10" onClick={onClose} aria-label="Close workflow details">
              <X size={16} />
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <article className="rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">Progress</span>
              <strong className="mt-1 block text-sm text-textStrong">{progress}%</strong>
            </article>
            <article className="rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">Current Step</span>
              <strong className="mt-1 block truncate text-sm text-textStrong">{currentStep ? getWorkflowStepLabel(currentStep) : 'Not started'}</strong>
            </article>
            <article className="rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">Documents</span>
              <strong className="mt-1 block text-sm text-textStrong">
                {lane.documentSummary?.missing || 0} missing
              </strong>
            </article>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <section className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-textStrong">Steps</h3>
                <p className="mt-1 text-xs text-textMuted">Phase 1 allows assigned matter users to update every active workflow.</p>
              </div>
              {currentStep ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => onSelectStepStatus?.(lane, currentStep, 'completed')}>
                    Mark Complete
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => onSelectStepStatus?.(lane, currentStep, 'waiting')}>
                    Set Waiting
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => onSelectStepStatus?.(lane, currentStep, 'blocked')}>
                    Block Step
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              {steps.map((step) => {
                const classes = getStepClasses(step, currentStep)
                return (
                  <article key={step.id || step.stepKey} className={`rounded-[12px] border px-3 py-3 ${classes.base}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${classes.meta.dot}`} />
                          <strong className="text-sm text-textStrong">{getWorkflowStepLabel(step)}</strong>
                          {classes.isCurrent ? <span className="rounded-full bg-white px-2 py-0.5 text-[0.65rem] font-bold uppercase text-primary">Current</span> : null}
                        </div>
                        <p className={`mt-1 text-xs font-medium ${classes.text}`}>
                          {step.completedAt ? `Completed ${formatShortDayMonth(step.completedAt)}` : classes.meta.label}
                        </p>
                        {step.comment ? <p className="mt-1 text-xs leading-5 text-textMuted">{step.comment}</p> : null}
                      </div>
                      <div className="flex max-w-full gap-1 overflow-x-auto pb-1">
                        {WORKFLOW_STEP_STATUS_OPTIONS.map((option) => {
                          const active = normalizeWorkspaceStatus(step.status) === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold transition ${
                                active ? 'border-primary bg-primary text-white' : 'border-borderSoft bg-white text-textMuted hover:border-primary/40 hover:text-textStrong'
                              }`}
                              onClick={() => onSelectStepStatus?.(lane, step, option.value)}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            {stepDraft ? (
              <form onSubmit={onSubmitStep} className="mt-4 rounded-[14px] border border-primary/20 bg-primarySoft p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm text-textStrong">
                    Set {getWorkflowStepLabel(stepDraft.step)} to {toTitle(stepDraft.status)}
                  </strong>
                  <span className="text-xs font-semibold text-primary">{getWorkflowLaneTitle(lane)}</span>
                </div>
                <label className="mt-3 grid gap-1.5 text-sm font-medium text-textStrong">
                  {stepDraft.status === 'blocked' ? 'Blocker reason' : stepDraft.status === 'waiting' ? 'Waiting reason / party' : 'Note'}
                  <Field
                    as="textarea"
                    rows={3}
                    value={stepDraft.note}
                    onChange={(event) => onStepDraftChange?.({ ...stepDraft, note: event.target.value })}
                    placeholder={stepDraft.status === 'blocked' ? 'What is blocking this step?' : stepDraft.status === 'waiting' ? 'Who or what are we waiting on?' : 'Optional context for this update'}
                  />
                </label>
                <div className="mt-3 flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => onStepDraftChange?.(null)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={saving || (['blocked', 'waiting'].includes(stepDraft.status) && !stepDraft.note.trim())}>
                    {saving ? 'Saving…' : 'Save Step'}
                  </Button>
                </div>
              </form>
            ) : null}
          </section>

          <section className="mt-4 rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-textStrong">Actions</h3>
                <p className="mt-1 text-xs text-textMuted">Notes, documents, reminders, and scheduling from the workflow context.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => onNoteDraftChange?.({ laneKey: lane.laneKey, message: '', visibility: 'internal' })}>
                  Add Note
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => onDocumentDraftChange?.({ laneKey: lane.laneKey, title: '', description: '', requestedFrom: 'client' })}>
                  Request Document
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={onUploadDocument}>
                  Upload Document
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={onScheduleSigning}>
                  Schedule Signing
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => onNoteDraftChange?.({ laneKey: lane.laneKey, message: `Reminder sent for ${currentStep ? getWorkflowStepLabel(currentStep) : getWorkflowLaneTitle(lane)}.`, visibility: 'professional_shared' })}>
                  Send Reminder
                </Button>
              </div>
            </div>

            {noteDraft ? (
              <form onSubmit={onSubmitNote} className="mt-4 rounded-[14px] border border-borderSoft bg-surfaceAlt p-4">
                <label className="grid gap-1.5 text-sm font-medium text-textStrong">
                  Note visibility
                  <Field as="select" value={noteDraft.visibility} onChange={(event) => onNoteDraftChange?.({ ...noteDraft, visibility: event.target.value })}>
                    <option value="internal">Internal</option>
                    <option value="professional_shared">Professional Shared</option>
                    <option value="client_visible">Client Visible</option>
                  </Field>
                </label>
                <label className="mt-3 grid gap-1.5 text-sm font-medium text-textStrong">
                  Note
                  <Field as="textarea" rows={4} value={noteDraft.message} onChange={(event) => onNoteDraftChange?.({ ...noteDraft, message: event.target.value })} />
                </label>
                <div className="mt-3 flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => onNoteDraftChange?.(null)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={saving || !noteDraft.message.trim()}>
                    {saving ? 'Saving…' : 'Save Note'}
                  </Button>
                </div>
              </form>
            ) : null}

            {documentDraft ? (
              <form onSubmit={onSubmitDocument} className="mt-4 rounded-[14px] border border-borderSoft bg-surfaceAlt p-4">
                <label className="grid gap-1.5 text-sm font-medium text-textStrong">
                  Document name
                  <Field value={documentDraft.title} onChange={(event) => onDocumentDraftChange?.({ ...documentDraft, title: event.target.value })} />
                </label>
                <label className="mt-3 grid gap-1.5 text-sm font-medium text-textStrong">
                  Requested from
                  <Field as="select" value={documentDraft.requestedFrom} onChange={(event) => onDocumentDraftChange?.({ ...documentDraft, requestedFrom: event.target.value })}>
                    <option value="client">Client</option>
                    <option value="buyer">Buyer</option>
                    <option value="seller">Seller</option>
                    <option value="attorney">Attorney Team</option>
                    <option value="agent">Agent</option>
                    <option value="bank">Bank</option>
                  </Field>
                </label>
                <label className="mt-3 grid gap-1.5 text-sm font-medium text-textStrong">
                  Description
                  <Field as="textarea" rows={3} value={documentDraft.description} onChange={(event) => onDocumentDraftChange?.({ ...documentDraft, description: event.target.value })} />
                </label>
                <div className="mt-3 flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => onDocumentDraftChange?.(null)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={saving || !documentDraft.title.trim()}>
                    {saving ? 'Requesting…' : 'Request Document'}
                  </Button>
                </div>
              </form>
            ) : null}
          </section>

          <section className="mt-4 rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
            <h3 className="text-sm font-semibold text-textStrong">Required Documents</h3>
            <div className="mt-3 space-y-2">
              {(lane.documentRequirements || []).slice(0, 8).map((item) => {
                const status = normalizeWorkspaceStatus(item.status)
                const meta = WORKFLOW_STATUS_META[status] || WORKFLOW_STATUS_META.not_started
                return (
                  <div key={item.id} className="flex items-start justify-between gap-3 rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm text-textStrong">{item.label}</strong>
                      <p className="mt-1 text-xs text-textMuted">{toTitle(item.category)} • {toTitle(item.requiredFrom)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${meta.border} ${meta.bg} ${meta.text}`}>
                      {toTitle(item.status || 'missing')}
                    </span>
                  </div>
                )
              })}
              {!(lane.documentRequirements || []).length ? <p className="text-sm text-textMuted">No required documents are configured for this lane.</p> : null}
            </div>
          </section>

          <section className="mt-4 rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
            <h3 className="text-sm font-semibold text-textStrong">Workflow Activity</h3>
            <div className="mt-3 space-y-2">
              {laneActivity.slice(0, 8).map((item) => (
                <article key={item.id} className="rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm text-textStrong">{item.title || toTitle(item.updateType || item.type || 'Workflow update')}</strong>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-textMuted">{item.message || item.body || 'Workflow update recorded.'}</p>
                    </div>
                    <span className="shrink-0 text-xs text-textMuted">{formatShortDayMonth(item.timestamp || item.createdAt)}</span>
                  </div>
                </article>
              ))}
              {!laneActivity.length ? <p className="text-sm text-textMuted">Workflow activity will appear here as the lane changes.</p> : null}
            </div>
          </section>
        </div>
      </aside>
    </div>
  )
}

function AttorneyTransactionDetail() {
  const { transactionId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, role: workspaceRole, workspace, workspaceType, currentMembership } = useWorkspace()
  const attorneyPermissionState = useAttorneyPermissions()
  const navigationPreviewData = useMemo(
    () => buildMatterPreviewShell(location.state?.matterPreview, transactionId),
    [location.state?.matterPreview, transactionId],
  )
  const [data, setData] = useState(() => navigationPreviewData)
  const [loading, setLoading] = useState(() => !navigationPreviewData)
  const [error, setError] = useState('')
  const [matterAccessChecked, setMatterAccessChecked] = useState(workspaceRole !== 'attorney')
  const [matterAccessAllowed, setMatterAccessAllowed] = useState(workspaceRole !== 'attorney')
  const [saving, setSaving] = useState(false)
  const [workspaceMenu, setWorkspaceMenu] = useState('overview')
  const [discussionBody, setDiscussionBody] = useState('')
  const [discussionType, setDiscussionType] = useState('operational')
  const [discussionVisibility, setDiscussionVisibility] = useState('shared')
  const [uploadDraft, setUploadDraft] = useState({
    category: ATTORNEY_DOCUMENT_CATEGORIES[0],
    visibility: 'shared',
    requiredDocumentKey: '',
    canonicalRequirementInstanceId: '',
    file: null,
  })
  const [reviewActionDraft, setReviewActionDraft] = useState({
    open: false,
    action: '',
    document: null,
    requirement: null,
    reason: '',
  })
  const [uploadInputVersion, setUploadInputVersion] = useState(0)
  const [activeDocumentGroup, setActiveDocumentGroup] = useState(ATTORNEY_DOCUMENT_GROUPS[0]?.key || 'sales_documents')
  const [stakeholderInviteForm, setStakeholderInviteForm] = useState({
    roleType: 'attorney',
    legalRole: 'transfer',
    participantName: '',
    agentPhone: '',
    agentAgencyName: '',
    email: '',
    expiresDays: '14',
  })
  const [stakeholderMessage, setStakeholderMessage] = useState('')
  const [inviteLinkResult, setInviteLinkResult] = useState('')
  const [roleplayerIntroBusy, setRoleplayerIntroBusy] = useState(false)
  const [roleplayerHandoffBusy, setRoleplayerHandoffBusy] = useState(false)
  const [roleplayerForm, setRoleplayerForm] = useState({
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
  })
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
  const [sellerPortalBusy, setSellerPortalBusy] = useState(false)
  const [roleplayerConfirmOpen, setRoleplayerConfirmOpen] = useState(false)
  const [roleplayerConfirmError, setRoleplayerConfirmError] = useState('')
  const [roleplayerConfirmDraft, setRoleplayerConfirmDraft] = useState({
    transferAttorney: '',
    bondOriginator: '',
    bondAttorney: '',
  })
  const [partnerSnapshot, setPartnerSnapshot] = useState(null)
  const [partnerOptionsLoading, setPartnerOptionsLoading] = useState(false)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [detailPanelKey, setDetailPanelKey] = useState('matter')
  const [hydratingDetail, setHydratingDetail] = useState(false)
  const [workflowOperations, setWorkflowOperations] = useState(null)
  const [workflowLoading, setWorkflowLoading] = useState(false)
  const [workflowError, setWorkflowError] = useState('')
  const [workflowDrawerLaneKey, setWorkflowDrawerLaneKey] = useState('')
  const [workflowStepDraft, setWorkflowStepDraft] = useState(null)
  const [workflowNoteDraft, setWorkflowNoteDraft] = useState(null)
  const [workflowDocumentDraft, setWorkflowDocumentDraft] = useState(null)
  const [workflowSaving, setWorkflowSaving] = useState(false)
  const [bondHybridFinanceActionLoading, setBondHybridFinanceActionLoading] = useState('')
  const [activityFilter, setActivityFilter] = useState('all')

  const loadData = useCallback(async ({ background = false } = {}) => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    const startedAt = Date.now()
    let hasCoreData = Boolean(navigationPreviewData?.transaction)
    try {
      if (!background && !hasCoreData) {
        setLoading(true)
      }
      setError('')
      const coreDetail = await fetchTransactionCoreById(transactionId)
      if (coreDetail) {
        hasCoreData = true
        setData((previous) => {
          if (!previous) {
            return coreDetail
          }
          return {
            ...previous,
            ...coreDetail,
            transaction: coreDetail.transaction || previous.transaction,
            unit: coreDetail.unit || previous.unit,
            development: coreDetail.development || previous.development,
            buyer: coreDetail.buyer || previous.buyer,
          }
        })
        console.log('[perf][transaction-workspace] core data loaded', {
          transactionId,
          durationMs: Date.now() - startedAt,
        })
        if (!background) {
          setLoading(false)
        }
      }
    } catch (coreError) {
      if (hasCoreData) {
        if (!background) {
          setLoading(false)
        }
      } else {
        console.warn('[transaction-workspace] core data load deferred to full detail', {
          transactionId,
          message: coreError?.message || 'Core transaction fetch failed.',
        })
      }
    }

    try {
      setHydratingDetail(true)
      const detail = await fetchTransactionById(transactionId)
      if (detail) {
        setData(detail)
        setError('')
        console.log('[perf][transaction-workspace] full data loaded', {
          transactionId,
          durationMs: Date.now() - startedAt,
        })
      } else if (!hasCoreData) {
        setData(null)
        setError('Transaction not found.')
      }
    } catch (loadError) {
      if (!hasCoreData) {
        setError(loadError.message || 'Unable to load transaction.')
      }
    } finally {
      setHydratingDetail(false)
      setLoading(false)
    }
  }, [navigationPreviewData?.transaction, transactionId])

  useEffect(() => {
    setData(navigationPreviewData)
    setError('')
    setHydratingDetail(false)
    setWorkflowOperations(null)
    setWorkflowError('')
    setWorkflowDrawerLaneKey('')
    setLoading(!navigationPreviewData)
  }, [navigationPreviewData, transactionId])

  useEffect(() => {
    if (workspaceRole === 'attorney') {
      if (attorneyPermissionState.loading) {
        return
      }
      if (!matterAccessAllowed) {
        setLoading(false)
        return
      }
    }
    void loadData({ background: false })
  }, [attorneyPermissionState.loading, loadData, matterAccessAllowed, workspaceRole])

  useEffect(() => {
    let active = true

    async function checkMatterAccess() {
      if (workspaceRole !== 'attorney') {
        if (!active) return
        setMatterAccessAllowed(true)
        setMatterAccessChecked(true)
        return
      }

      if (attorneyPermissionState.loading || !transactionId) {
        return
      }

      if (!attorneyPermissionState.membership?.isActive) {
        if (!active) return
        setMatterAccessAllowed(false)
        setMatterAccessChecked(true)
        return
      }

      try {
        const allowed = await canAccessAttorneyMatter(transactionId, attorneyPermissionState.firmId || null)
        if (!active) return
        setMatterAccessAllowed(Boolean(allowed))
      } catch {
        if (!active) return
        setMatterAccessAllowed(false)
      } finally {
        if (active) setMatterAccessChecked(true)
      }
    }

    setMatterAccessChecked(workspaceRole !== 'attorney')
    void checkMatterAccess()

    return () => {
      active = false
    }
  }, [attorneyPermissionState.firmId, attorneyPermissionState.loading, attorneyPermissionState.membership?.isActive, transactionId, workspaceRole])

  const transaction = data?.transaction || null
  const buyer = data?.buyer || null
  const development = data?.development || null
  const unit = data?.unit || null
  const documents = data?.documents ?? EMPTY_ARRAY
  const requiredDocumentChecklist = data?.requiredDocumentChecklist || []
  const requiredDocumentsByDocumentId = useMemo(() => {
    const map = new Map()
    for (const requirement of requiredDocumentChecklist) {
      const documentId = getRequirementDocumentId(requirement)
      if (documentId) map.set(String(documentId), requirement)
    }
    return map
  }, [requiredDocumentChecklist])
  const requiredDocumentsByCanonicalId = useMemo(() => {
    const map = new Map()
    for (const requirement of requiredDocumentChecklist) {
      const canonicalId = getRequirementCanonicalId(requirement)
      if (canonicalId) map.set(String(canonicalId), requirement)
    }
    return map
  }, [requiredDocumentChecklist])
  const getLinkedRequirementForDocument = useCallback(
    (document = {}) => {
      const canonicalId = getDocumentCanonicalId(document)
      if (canonicalId && requiredDocumentsByCanonicalId.has(String(canonicalId))) {
        return requiredDocumentsByCanonicalId.get(String(canonicalId))
      }
      if (document?.id && requiredDocumentsByDocumentId.has(String(document.id))) {
        return requiredDocumentsByDocumentId.get(String(document.id))
      }
      return null
    },
    [requiredDocumentsByCanonicalId, requiredDocumentsByDocumentId],
  )
  const transactionDiscussion = data?.transactionDiscussion ?? EMPTY_ARRAY
  const canViewInternalDiscussion =
    workspaceRole !== 'attorney' || attorneyPermissionState.hasPermission('can_view_internal_comments')
  const canPostSharedDiscussion =
    workspaceRole !== 'attorney' || attorneyPermissionState.hasPermission('can_comment_shared')
  const canPostInternalDiscussion =
    workspaceRole !== 'attorney' || attorneyPermissionState.hasPermission('can_comment_internal')
  const canPublishClientVisibleDiscussion =
    workspaceRole !== 'attorney' || attorneyPermissionState.hasPermission('can_publish_client_visible_updates')
  const visibleTransactionDiscussion = useMemo(
    () =>
      transactionDiscussion.filter((comment) => {
        const visibility = String(comment?.visibility || 'shared').trim().toLowerCase()
        if (visibility !== 'internal') return true
        return canViewInternalDiscussion
      }),
    [canViewInternalDiscussion, transactionDiscussion],
  )
  const transactionEvents = data?.transactionEvents ?? EMPTY_ARRAY
  const transactionFinanceWorkflow = data?.transactionFinanceWorkflow || null
  const transactionParticipants = data?.transactionParticipants ?? EMPTY_ARRAY
  const rawTransactionRolePlayers = data?.transactionRolePlayers || data?.rolePlayers || data?.transaction_role_players
  const transactionRolePlayers = Array.isArray(rawTransactionRolePlayers) ? rawTransactionRolePlayers.filter(Boolean) : EMPTY_ARRAY
  const isAgentTransactionView = workspaceRole === 'agent'
  const workspaceOrganisationId =
    workspace?.id ||
    currentMembership?.workspaceId ||
    currentMembership?.organisationId ||
    currentMembership?.organisation_id ||
    transaction?.organisation_id ||
    ''
  const partnerAccessContext = useMemo(
    () => ({
      organisationId: workspaceOrganisationId,
      role: workspaceRole,
      profile,
      currentMembership,
    }),
    [currentMembership, profile, workspaceOrganisationId, workspaceRole],
  )
  const canManageTransactionRoleplayers = ['agent', 'agency_admin', 'principal', 'admin', 'internal_admin', 'developer'].includes(String(workspaceRole || '').toLowerCase())
  const requestedWorkspaceMenu = useMemo(() => {
    if (workspaceMenu === 'financials' || workspaceMenu === 'bond') return 'finance'
    if (workspaceMenu === 'cancellation') return 'transfer'
    if (isAgentTransactionView && (workspaceMenu === 'parties' || workspaceMenu === 'tasks' || workspaceMenu === 'buyer' || workspaceMenu === 'seller')) {
      return 'overview'
    }
    return workspaceMenu
  }, [isAgentTransactionView, workspaceMenu])
  const availableWorkspaceTabs = isAgentTransactionView ? AGENT_WORKSPACE_TABS : ATTORNEY_WORKSPACE_TABS
  const activeWorkspaceMenu = availableWorkspaceTabs.some((tab) => tab.id === requestedWorkspaceMenu) ? requestedWorkspaceMenu : 'overview'

  useEffect(() => {
    let active = true

    async function loadWorkflowOperations() {
      if (!transaction?.id) {
        setWorkflowOperations(null)
        return
      }

      try {
        setWorkflowLoading(true)
        setWorkflowError('')
        const operations = await getAttorneyWorkflowOperationsForTransaction(transaction.id)
        if (!active) return
        setWorkflowOperations(operations)
      } catch (workflowLoadError) {
        if (!active) return
        setWorkflowOperations(null)
        setWorkflowError(workflowLoadError?.message || 'Unable to load attorney workflow lanes.')
      } finally {
        if (active) setWorkflowLoading(false)
      }
    }

    void loadWorkflowOperations()

    return () => {
      active = false
    }
  }, [transaction?.id])

  useEffect(() => {
    if (!isAgentTransactionView || !workspaceOrganisationId) {
      setPartnerSnapshot(null)
      return
    }

    let active = true
    async function loadPartnerDefaults() {
      try {
        setPartnerOptionsLoading(true)
        const snapshot = await fetchPartnersSnapshot({
          organisationId: workspaceOrganisationId,
          workspaceType: workspaceType || workspaceRole,
          accessContext: partnerAccessContext,
        })
        if (active) setPartnerSnapshot(snapshot)
      } catch (partnerLoadError) {
        console.warn('[AttorneyTransactionDetail] scoped partner defaults unavailable', partnerLoadError)
      } finally {
        if (active) setPartnerOptionsLoading(false)
      }
    }

    void loadPartnerDefaults()
    return () => {
      active = false
    }
  }, [isAgentTransactionView, partnerAccessContext, workspaceOrganisationId, workspaceRole, workspaceType])

  const mainStage = useMemo(
    () => data?.mainStage || getMainStageFromDetailedStage(transaction?.stage || 'Available'),
    [data?.mainStage, transaction?.stage],
  )
  const transactionKind = normalizeTransactionKind(transaction)
  const isPrivateMatter = transactionKind === 'private'
  const buyerDisplayName = useMemo(
    () => resolveBuyerDisplayName({
      buyer,
      transaction,
      onboardingFormData: data?.onboardingFormData || null,
      participants: transactionParticipants,
    }),
    [buyer, data?.onboardingFormData, transaction, transactionParticipants],
  )
  const buyerEmail = useMemo(() => {
    const buyerParticipant = transactionParticipants.find((participant) => participant?.roleType === 'buyer')
    return cleanDetailEmail(
      buyer?.email ||
      roleplayerForm.buyerEmail ||
      transaction?.buyer_email ||
      transaction?.client_email ||
      data?.onboardingFormData?.buyerEmail ||
      data?.onboardingFormData?.email ||
      buyerParticipant?.participantEmail ||
      '',
    )
  }, [buyer?.email, data?.onboardingFormData, roleplayerForm.buyerEmail, transaction?.buyer_email, transaction?.client_email, transactionParticipants])
  const sellerDisplayName = useMemo(() => {
    const sellerParticipant = transactionParticipants.find((participant) => participant?.roleType === 'seller')
    return (
      cleanDetailText(transaction?.seller_name) ||
      cleanDetailText(roleplayerForm.sellerName) ||
      cleanDetailText(sellerParticipant?.participantName) ||
      'Seller details pending'
    )
  }, [roleplayerForm.sellerName, transaction?.seller_name, transactionParticipants])
  const sellerEmail = useMemo(() => {
    const sellerParticipant = transactionParticipants.find((participant) => participant?.roleType === 'seller')
    return cleanDetailEmail(
      transaction?.seller_email ||
      roleplayerForm.sellerEmail ||
      sellerParticipant?.participantEmail ||
      '',
    )
  }, [roleplayerForm.sellerEmail, transaction?.seller_email, transactionParticipants])
  const mainStageLabel = MAIN_STAGE_LABELS[mainStage] || toTitle(transaction?.stage || 'Available')
  const matterTypeLabel = isPrivateMatter ? 'Private Matter' : 'Development Matter'
  const onboardingLifecycleStatus = String(transaction?.onboarding_status || '').trim().toLowerCase()
  const onboardingRecordStatus = String(data?.onboarding?.status || '').trim().toLowerCase()
  const onboardingCompleted =
    onboardingLifecycleStatus === 'client_onboarding_complete' ||
    Boolean(transaction?.onboarding_completed_at) ||
    ['submitted', 'reviewed', 'approved'].includes(onboardingRecordStatus)
  const normalizedFinanceType = normalizeFinanceType(transaction?.finance_type, { allowUnknown: true })
  const hasCapturedFinancials = onboardingCompleted
  const shouldShowDepositCard = useMemo(() => {
    const reservationAmount = Number(transaction?.reservation_amount || 0)
    const reservationRequired = Boolean(transaction?.reservation_required)
    return transactionKind === 'development' && (reservationRequired || reservationAmount > 0)
  }, [transaction?.reservation_amount, transaction?.reservation_required, transactionKind])
  const hasCapturedFinanceType = hasCapturedFinancials && normalizedFinanceType !== 'unknown'
  const financeTypeLabel = hasCapturedFinanceType ? toTitle(normalizedFinanceType) : 'Not captured'
  const isBondOrHybridFinance = hasCapturedFinanceType && isBondFinanceType(normalizedFinanceType)
  const financeRequiresBondSupport = hasCapturedFinanceType && isBondOrHybridFinance
  const isCapturedCashFinance = hasCapturedFinanceType && normalizedFinanceType === 'cash'
  const displayPurchasePriceValue = hasCapturedFinancials ? Number(transaction?.purchase_price || transaction?.sales_price || 0) : 0
  const bondAmountFallback = hasCapturedFinanceType ? (financeRequiresBondSupport ? 'Pending' : 'N/A') : 'Not captured'
  const propertyAddress = buildPropertyAddress(transaction)
  const matterHeadline = !isPrivateMatter
    ? `${development?.name || 'Development'}${unit?.unit_number ? ` • Unit ${unit.unit_number}` : ''}`
    : transaction?.property_description || transaction?.property_address_line_1 || 'Private Property Transaction'
  const workspaceReference = formatRoleFriendlyReference(transaction, workspaceRole)
  const workspaceBackPath = workspaceRole === 'bond_originator' ? '/bond/applications' : '/transactions'
  const workspaceBackLabel = workspaceRole === 'bond_originator' ? 'Back to Applications' : 'Back to Transactions'
  const transferStageKey = getAttorneyTransferStage({ transaction, stage: transaction?.stage, unit, development })
  const transferStageLabel = stageLabelFromAttorneyKey(transferStageKey)
  const lifecycleState = normalizeLifecycleState(
    transaction?.lifecycle_state || (transferStageKey === 'registered' ? 'registered' : 'active'),
  )
  const lifecycleLabel = getLifecycleStateLabel(lifecycleState)
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
  const workspaceMenuTabs = availableWorkspaceTabs.map((tab) => {
    if (tab.id === 'parties') {
      return { ...tab, meta: `${transactionParticipants.length} parties` }
    }
    if (tab.id === 'documents') {
      return { ...tab, meta: `${documents.length} files` }
    }
    if (tab.id === 'finance') {
      return { ...tab, meta: financeTypeLabel }
    }
    if (tab.id === 'tasks') {
      return { ...tab, meta: 'Action hub' }
    }
    if (tab.id === 'activity') {
      return { ...tab, meta: `${visibleTransactionDiscussion.length + transactionEvents.length} updates` }
    }
    if (tab.id === 'transfer') {
      return { ...tab, meta: transferStageLabel }
    }
    return { ...tab, meta: transferStageLabel }
  })

  const groupedDocuments = useMemo(() => {
    const groups = ATTORNEY_DOCUMENT_GROUPS.reduce((accumulator, group) => {
      accumulator[group.key] = []
      return accumulator
    }, {})
    const seenDocumentIds = new Set()

    for (const document of documents) {
      const linkedRequirement = getLinkedRequirementForDocument(document)
      const currentRequirementDocumentId = linkedRequirement ? getRequirementDocumentId(linkedRequirement) : null
      if (currentRequirementDocumentId && document?.id && String(currentRequirementDocumentId) !== String(document.id)) {
        continue
      }
      const category = ATTORNEY_DOCUMENT_CATEGORIES.includes(document?.category)
        ? document.category
        : linkedRequirement
          ? getAttorneyCategoryForRequiredDocument(linkedRequirement)
          : 'Internal Working Documents'
      const groupKey = getAttorneyDocumentGroupKey(category)
      const normalizedDocument = { ...document, normalizedCategory: category, linkedRequirement }
      const documentKey = String(document?.id || `${document?.name || ''}:${document?.file_path || ''}`)
      if (seenDocumentIds.has(documentKey)) continue
      seenDocumentIds.add(documentKey)
      groups.all_documents.push(normalizedDocument)
      groups[groupKey].push(normalizedDocument)
    }

    return groups
  }, [documents, getLinkedRequirementForDocument])
  const attorneyDocumentSections = useMemo(
    () =>
      ATTORNEY_DOCUMENT_GROUPS.map((group) => ({
        ...group,
        items: uniqueDocumentsByRenderKey(groupedDocuments[group.key] || []),
      })),
    [groupedDocuments],
  )
  const activeAttorneyDocumentSection = useMemo(
    () => attorneyDocumentSections.find((group) => group.key === activeDocumentGroup) || attorneyDocumentSections[0] || null,
    [activeDocumentGroup, attorneyDocumentSections],
  )
  const sharedAttorneyDocumentCount = useMemo(
    () => documents.filter((document) => String(document.visibility_scope || 'shared').toLowerCase() === 'shared').length,
    [documents],
  )
  const internalAttorneyDocumentCount = Math.max(0, documents.length - sharedAttorneyDocumentCount)
  const requirementDocumentLookup = useMemo(() => {
    const byCanonicalId = new Map()
    const byDocumentId = new Map()
    for (const document of documents) {
      const linkedRequirement = getLinkedRequirementForDocument(document)
      const canonicalId = getRequirementCanonicalId(linkedRequirement)
      if (canonicalId && !byCanonicalId.has(String(canonicalId))) {
        byCanonicalId.set(String(canonicalId), document)
      }
      if (document?.id && !byDocumentId.has(String(document.id))) {
        byDocumentId.set(String(document.id), document)
      }
    }
    return { byCanonicalId, byDocumentId }
  }, [documents, getLinkedRequirementForDocument])
  const buyerDocumentRows = useMemo(
    () =>
      requiredDocumentChecklist
        .filter((requirement) => isBuyerDocumentRequirement(requirement))
        .map((requirement) => {
          const canonicalId = getRequirementCanonicalId(requirement)
          const uploadedDocumentId = getRequirementDocumentId(requirement)
          const linkedDocument =
            (canonicalId ? requirementDocumentLookup.byCanonicalId.get(String(canonicalId)) : null) ||
            (uploadedDocumentId ? requirementDocumentLookup.byDocumentId.get(String(uploadedDocumentId)) : null) ||
            null
          return { requirement, linkedDocument }
        }),
    [requiredDocumentChecklist, requirementDocumentLookup],
  )
  const sellerDocumentRows = useMemo(
    () =>
      requiredDocumentChecklist
        .filter((requirement) => isSellerDocumentRequirement(requirement))
        .map((requirement) => {
          const canonicalId = getRequirementCanonicalId(requirement)
          const uploadedDocumentId = getRequirementDocumentId(requirement)
          const linkedDocument =
            (canonicalId ? requirementDocumentLookup.byCanonicalId.get(String(canonicalId)) : null) ||
            (uploadedDocumentId ? requirementDocumentLookup.byDocumentId.get(String(uploadedDocumentId)) : null) ||
            null
          return { requirement, linkedDocument }
        }),
    [requiredDocumentChecklist, requirementDocumentLookup],
  )
  const uploadedByClientCount = useMemo(
    () => documents.filter((document) => String(document.uploaded_by_role || '').toLowerCase() === 'client').length,
    [documents],
  )
  const canShowWaiverAction = ['attorney', 'developer', 'internal_admin', 'admin', 'agency_admin'].includes(String(workspaceRole || '').toLowerCase())

  useEffect(() => {
    if (!attorneyDocumentSections.length) return
    if (!attorneyDocumentSections.some((group) => group.key === activeDocumentGroup)) {
      setActiveDocumentGroup(attorneyDocumentSections[0].key)
    }
  }, [activeDocumentGroup, attorneyDocumentSections])

  const activeStakeholders = useMemo(
    () => transactionParticipants.filter((item) => item?.stakeholderStatus !== 'removed'),
    [transactionParticipants],
  )
  const serviceProviderStakeholders = useMemo(
    () =>
      activeStakeholders
        .filter((item) => isServiceProviderRole(item?.roleType))
        .sort((left, right) => {
          const leftRole = String(left?.roleLabel || left?.roleType || '')
          const rightRole = String(right?.roleLabel || right?.roleType || '')
          const roleDiff = leftRole.localeCompare(rightRole, 'en-ZA', { sensitivity: 'base' })
          if (roleDiff !== 0) return roleDiff
          const leftName = String(left?.participantName || left?.participantEmail || '')
          const rightName = String(right?.participantName || right?.participantEmail || '')
          return leftName.localeCompare(rightName, 'en-ZA', { sensitivity: 'base' })
        }),
    [activeStakeholders],
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
  const assignedAgent = useMemo(
    () => activeStakeholders.find((item) => item?.roleType === 'agent') || null,
    [activeStakeholders],
  )
  const assignedBondOriginator = useMemo(
    () => activeStakeholders.find((item) => item?.roleType === 'bond_originator') || null,
    [activeStakeholders],
  )
  const savedTransferRoleplayer = useMemo(
    () => transactionRolePlayers.find((item) => item?.roleType === 'transfer_attorney' || item?.role_type === 'transfer_attorney') || null,
    [transactionRolePlayers],
  )
  const savedBondOriginatorRoleplayer = useMemo(
    () => transactionRolePlayers.find((item) => item?.roleType === 'bond_originator' || item?.role_type === 'bond_originator') || null,
    [transactionRolePlayers],
  )
  const savedBondAttorneyRoleplayer = useMemo(
    () => transactionRolePlayers.find((item) => item?.roleType === 'bond_attorney' || item?.role_type === 'bond_attorney') || null,
    [transactionRolePlayers],
  )
  const attorneyPartnerOptions = useMemo(
    () =>
      getPartnerAssignmentOptions(partnerSnapshot || {}, 'transfer_attorney', partnerAccessContext)
        .map((option) => buildPartnerRoleplayerOption(option, 'transfer_attorney')),
    [partnerAccessContext, partnerSnapshot],
  )
  const bondOriginatorPartnerOptions = useMemo(
    () =>
      getPartnerAssignmentOptions(partnerSnapshot || {}, 'bond_originator', partnerAccessContext)
        .map((option) => buildPartnerRoleplayerOption(option, 'bond_originator')),
    [partnerAccessContext, partnerSnapshot],
  )
  const transferAttorneyOptions = useMemo(
    () =>
      dedupeRoleplayerOptions([
        buildExistingRoleplayerOption(savedTransferRoleplayer, 'transfer_attorney'),
        buildExistingRoleplayerOption(transferAttorney, 'transfer_attorney'),
        transaction?.attorney || transaction?.assigned_attorney_email
          ? buildExistingRoleplayerOption(
              {
                partnerName: transaction?.attorney,
                emailAddress: transaction?.assigned_attorney_email,
              },
              'transfer_attorney',
            )
          : null,
        ...attorneyPartnerOptions,
      ]),
    [attorneyPartnerOptions, savedTransferRoleplayer, transaction?.assigned_attorney_email, transaction?.attorney, transferAttorney],
  )
  const bondOriginatorOptions = useMemo(
    () =>
      dedupeRoleplayerOptions([
        buildExistingRoleplayerOption(savedBondOriginatorRoleplayer, 'bond_originator'),
        buildExistingRoleplayerOption(assignedBondOriginator, 'bond_originator'),
        transaction?.bond_originator || transaction?.assigned_bond_originator_email
          ? buildExistingRoleplayerOption(
              {
                partnerName: transaction?.bond_originator,
                emailAddress: transaction?.assigned_bond_originator_email,
              },
              'bond_originator',
            )
          : null,
        ...bondOriginatorPartnerOptions,
      ]),
    [assignedBondOriginator, bondOriginatorPartnerOptions, savedBondOriginatorRoleplayer, transaction?.assigned_bond_originator_email, transaction?.bond_originator],
  )
  const bondAttorneyOptions = useMemo(
    () =>
      dedupeRoleplayerOptions([
        buildExistingRoleplayerOption(savedBondAttorneyRoleplayer, 'bond_attorney'),
        buildExistingRoleplayerOption(bondAttorney, 'bond_attorney'),
        ...attorneyPartnerOptions.map((option) => ({ ...option, roleType: 'bond_attorney' })),
      ]),
    [attorneyPartnerOptions, bondAttorney, savedBondAttorneyRoleplayer],
  )
  const legalRoleAssignmentNote = useMemo(() => {
    if (transferAttorney && bondAttorney) {
      const transferIdentity = String(transferAttorney.participantEmail || transferAttorney.participantName || '').trim().toLowerCase()
      const bondIdentity = String(bondAttorney.participantEmail || bondAttorney.participantName || '').trim().toLowerCase()
      if (transferIdentity && bondIdentity && transferIdentity !== bondIdentity) {
        return 'Transfer and bond legal roles are assigned to different attorneys.'
      }
      return 'Transfer and bond legal roles are currently handled by the same attorney.'
    }

    if (transferAttorney && !bondAttorney) {
      return 'Transfer attorney is assigned. Bond attorney is optional and can be assigned separately when required.'
    }

    return 'Assign legal roles explicitly so transfer and bond responsibilities remain clear.'
  }, [bondAttorney, transferAttorney])
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
        ...transactionEvents.map((event) => humanizeTransactionEvent(event)),
        ...visibleTransactionDiscussion.map((comment) => humanizeDiscussionActivity(comment)),
      ].sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()),
    [transactionEvents, visibleTransactionDiscussion],
  )
  const roleplayerIntroEvents = useMemo(
    () =>
      [...transactionEvents]
        .filter((event) => String(event?.eventType || event?.event_type || '').toLowerCase() === 'roleplayerintroemailsent')
        .sort((left, right) => new Date(right?.createdAt || right?.created_at || 0).getTime() - new Date(left?.createdAt || left?.created_at || 0).getTime()),
    [transactionEvents],
  )
  const latestRoleplayerIntroEvent = roleplayerIntroEvents[0] || null
  const roleplayerHandoffEvents = useMemo(
    () =>
      [...transactionEvents]
        .filter((event) => String(event?.eventType || event?.event_type || '').toLowerCase() === 'roleplayerhandoffemailsent')
        .sort((left, right) => new Date(right?.createdAt || right?.created_at || 0).getTime() - new Date(left?.createdAt || left?.created_at || 0).getTime()),
    [transactionEvents],
  )
  const latestRoleplayerHandoffEvent = roleplayerHandoffEvents[0] || null
  const roleplayerReadiness = useMemo(() => {
    const hasBuyerEmail = Boolean(roleplayerForm.buyerEmail.trim())
    const hasBuyerName = Boolean(roleplayerForm.buyerName.trim())
    const hasAgentContact = Boolean(roleplayerForm.agentName.trim() || roleplayerForm.agentEmail.trim() || assignedAgent)
    const hasTransferAttorney = Boolean(roleplayerForm.attorneyName.trim() || roleplayerForm.attorneyEmail.trim() || transferAttorney)
    const hasTransferAttorneyEmail = Boolean(roleplayerForm.attorneyEmail.trim() || transferAttorney?.participantEmail)
    const hasBondOriginator = Boolean(roleplayerForm.bondOriginatorName.trim() || roleplayerForm.bondOriginatorEmail.trim() || assignedBondOriginator)
    const hasBondOriginatorEmail = Boolean(roleplayerForm.bondOriginatorEmail.trim() || assignedBondOriginator?.participantEmail)
    const hasCancellationAttorney = Boolean(cancellationAttorney)
    const currentTransferAttorneyName = roleplayerForm.attorneyName.trim() || transferAttorney?.participantName || ''
    const currentTransferAttorneyEmail = roleplayerForm.attorneyEmail.trim() || transferAttorney?.participantEmail || ''
    const currentBondOriginatorName = roleplayerForm.bondOriginatorName.trim() || assignedBondOriginator?.participantName || ''
    const currentBondOriginatorEmail = roleplayerForm.bondOriginatorEmail.trim() || assignedBondOriginator?.participantEmail || ''
    const currentAgentName = roleplayerForm.agentName.trim() || assignedAgent?.participantName || ''
    const currentAgentEmail = roleplayerForm.agentEmail.trim() || assignedAgent?.participantEmail || ''
    const latestIntroData = latestRoleplayerIntroEvent ? getActivityEventData(latestRoleplayerIntroEvent) : {}
    const latestHandoffData = latestRoleplayerHandoffEvent ? getActivityEventData(latestRoleplayerHandoffEvent) : {}
    const handoffRecipients = Array.isArray(latestHandoffData.recipients) ? latestHandoffData.recipients : []
    const handoffTransferEmail = latestHandoffData.transferAttorneyEmail ||
      handoffRecipients.find((item) => item?.role === 'transfer_attorney')?.email ||
      ''
    const handoffBondEmail = latestHandoffData.bondOriginatorEmail ||
      handoffRecipients.find((item) => item?.role === 'bond_originator')?.email ||
      ''
    const introOutdated = Boolean(
      latestRoleplayerIntroEvent &&
        [
          [latestIntroData.transferAttorneyName, currentTransferAttorneyName],
          [latestIntroData.transferAttorneyEmail, currentTransferAttorneyEmail],
          [latestIntroData.bondOriginatorName, currentBondOriginatorName],
          [latestIntroData.bondOriginatorEmail, currentBondOriginatorEmail],
          [latestIntroData.agentName, currentAgentName],
          [latestIntroData.agentEmail, currentAgentEmail],
        ].some(([previous, current]) => normalizeComparableContact(previous) !== normalizeComparableContact(current)),
    )
    const handoffOutdated = Boolean(
      latestRoleplayerHandoffEvent &&
        [
          [latestHandoffData.transferAttorneyName, currentTransferAttorneyName],
          [handoffTransferEmail, currentTransferAttorneyEmail],
          [latestHandoffData.bondOriginatorName, currentBondOriginatorName],
          [handoffBondEmail, currentBondOriginatorEmail],
          [latestHandoffData.agentName, currentAgentName],
          [latestHandoffData.agentEmail, currentAgentEmail],
        ].some(([previous, current]) => normalizeComparableContact(previous) !== normalizeComparableContact(current)),
    )
    const items = [
      {
        key: 'buyer_email',
        label: 'Buyer email captured',
        description: 'Required before Bridge can send the introduction email.',
        complete: hasBuyerEmail,
        required: true,
      },
      {
        key: 'transfer_attorney',
        label: 'Transfer attorney selected',
        description: 'Required because every sale needs a clear transfer owner.',
        complete: hasTransferAttorney,
        required: true,
      },
      financeRequiresBondSupport
        ? {
            key: 'bond_originator',
            label: 'Bond originator selected',
            description: 'Required because this buyer is using bond or hybrid finance support.',
            complete: hasBondOriginator,
            required: true,
          }
        : {
            key: 'cash_finance',
            label: 'Finance path noted',
            description: 'Cash transactions do not need a bond originator before the buyer intro.',
            complete: true,
            required: false,
          },
      transaction?.seller_has_existing_bond
        ? {
            key: 'cancellation_attorney',
            label: 'Cancellation attorney assigned',
            description: 'Required before transfer handoff because the seller has an existing bond.',
            complete: hasCancellationAttorney,
            required: true,
          }
        : {
            key: 'cancellation_not_required',
            label: 'Cancellation attorney not required yet',
            description: 'Only needed if an existing seller bond is confirmed.',
            complete: true,
            required: false,
          },
      {
        key: 'agent_contact',
        label: 'Agent contact available',
        description: 'Recommended so the buyer knows who coordinates sale-related questions.',
        complete: hasAgentContact,
        required: false,
      },
      {
        key: 'buyer_name',
        label: 'Buyer name captured',
        description: 'Recommended for a warmer email greeting and cleaner transaction record.',
        complete: hasBuyerName,
        required: false,
      },
      {
        key: 'buyer_intro_sent',
        label: introOutdated ? 'Buyer intro needs resend' : 'Buyer intro sent',
        description: introOutdated
          ? 'Roleplayer details changed after the buyer introduction was sent.'
          : 'Shows whether the transaction team has already been introduced to the buyer.',
        complete: Boolean(latestRoleplayerIntroEvent) && !introOutdated,
        required: false,
      },
      {
        key: 'team_handoff_sent',
        label: handoffOutdated ? 'Team handoff needs resend' : 'Team handoff sent',
        description: handoffOutdated
          ? 'Provider details changed after the team handoff was sent.'
          : 'Shows whether the transfer and finance roleplayers have received the transaction context.',
        complete: Boolean(latestRoleplayerHandoffEvent) && !handoffOutdated,
        required: false,
      },
    ].filter(Boolean)
    const requiredItems = items.filter((item) => item.required)
    const completedRequired = requiredItems.filter((item) => item.complete).length
    const completedAll = items.filter((item) => item.complete).length
    const percent = items.length ? Math.round((completedAll / items.length) * 100) : 100
    const blockers = requiredItems.filter((item) => !item.complete)
    const recommended = items.filter((item) => !item.required && !item.complete)
    const canSendIntro = blockers.length === 0
    const teamHandoffBlockers = [
      !hasTransferAttorneyEmail ? 'Transfer attorney email' : '',
      financeRequiresBondSupport && !hasBondOriginatorEmail ? 'Bond originator email' : '',
    ].filter(Boolean)
    const canSendTeamHandoff = teamHandoffBlockers.length === 0
    return {
      items,
      blockers,
      recommended,
      teamHandoffBlockers,
      percent,
      completedRequired,
      requiredCount: requiredItems.length,
      canSendIntro,
      canSendTeamHandoff,
      introOutdated,
      handoffOutdated,
      statusLabel: blockers.length ? 'Needs attention' : introOutdated || handoffOutdated ? 'Needs resend' : latestRoleplayerIntroEvent ? 'Intro sent' : 'Ready to send',
    }
  }, [
    assignedAgent,
    assignedBondOriginator,
    cancellationAttorney,
    financeRequiresBondSupport,
    latestRoleplayerHandoffEvent,
    latestRoleplayerIntroEvent,
    roleplayerForm.agentEmail,
    roleplayerForm.agentName,
    roleplayerForm.attorneyEmail,
    roleplayerForm.attorneyName,
    roleplayerForm.bondOriginatorEmail,
    roleplayerForm.bondOriginatorName,
    roleplayerForm.buyerEmail,
    roleplayerForm.buyerName,
    transaction?.seller_has_existing_bond,
    transferAttorney,
  ])
  const roleplayerCommunicationHistory = useMemo(() => {
    const currentSnapshot = {
      transferAttorneyName: roleplayerForm.attorneyName.trim() || transferAttorney?.participantName || '',
      transferAttorneyEmail: roleplayerForm.attorneyEmail.trim() || transferAttorney?.participantEmail || '',
      bondOriginatorName: roleplayerForm.bondOriginatorName.trim() || assignedBondOriginator?.participantName || '',
      bondOriginatorEmail: roleplayerForm.bondOriginatorEmail.trim() || assignedBondOriginator?.participantEmail || '',
      agentName: roleplayerForm.agentName.trim() || assignedAgent?.participantName || '',
      agentEmail: roleplayerForm.agentEmail.trim() || assignedAgent?.participantEmail || '',
    }
    const isSnapshotOutdated = (eventData = {}) =>
      [
        [eventData.transferAttorneyName, currentSnapshot.transferAttorneyName],
        [eventData.transferAttorneyEmail, currentSnapshot.transferAttorneyEmail],
        [eventData.bondOriginatorName, currentSnapshot.bondOriginatorName],
        [eventData.bondOriginatorEmail, currentSnapshot.bondOriginatorEmail],
        [eventData.agentName, currentSnapshot.agentName],
        [eventData.agentEmail, currentSnapshot.agentEmail],
      ].some(([previous, current]) => normalizeComparableContact(previous) !== normalizeComparableContact(current))
    const mapIntroEvent = (event) => {
      const eventData = getActivityEventData(event)
      const isLatest = event?.id && event.id === latestRoleplayerIntroEvent?.id
      const outdated = isSnapshotOutdated(eventData)
      return {
        id: `intro-${event.id || event.createdAt || event.created_at}`,
        type: 'Buyer Intro',
        sentAt: event.createdAt || event.created_at,
        recipients: [eventData.recipientEmail].filter(Boolean),
        state: isLatest ? (outdated ? 'Needs resend' : 'Current') : 'Superseded',
        summary: outdated && isLatest ? 'Roleplayer details changed after this buyer intro was sent.' : 'Buyer received the transaction team introduction.',
      }
    }
    const mapHandoffEvent = (event) => {
      const eventData = getActivityEventData(event)
      const recipients = Array.isArray(eventData.recipients)
        ? eventData.recipients.map((item) => item?.email).filter(Boolean)
        : []
      const fallbackTransferEmail = recipients[0] || ''
      const fallbackBondEmail = recipients[1] || ''
      const comparableData = {
        ...eventData,
        transferAttorneyEmail: eventData.transferAttorneyEmail || fallbackTransferEmail,
        bondOriginatorEmail: eventData.bondOriginatorEmail || fallbackBondEmail,
      }
      const isLatest = event?.id && event.id === latestRoleplayerHandoffEvent?.id
      const outdated = isSnapshotOutdated(comparableData)
      return {
        id: `handoff-${event.id || event.createdAt || event.created_at}`,
        type: 'Team Handoff',
        sentAt: event.createdAt || event.created_at,
        recipients,
        state: isLatest ? (outdated ? 'Needs resend' : 'Current') : 'Superseded',
        summary: outdated && isLatest ? 'Provider details changed after this team handoff was sent.' : 'Roleplayers received the transaction handoff context.',
      }
    }
    return [
      ...roleplayerIntroEvents.map(mapIntroEvent),
      ...roleplayerHandoffEvents.map(mapHandoffEvent),
    ].sort((left, right) => new Date(right.sentAt || 0).getTime() - new Date(left.sentAt || 0).getTime())
  }, [
    assignedAgent?.participantEmail,
    assignedAgent?.participantName,
    assignedBondOriginator?.participantEmail,
    assignedBondOriginator?.participantName,
    latestRoleplayerHandoffEvent?.id,
    latestRoleplayerIntroEvent?.id,
    roleplayerForm.agentEmail,
    roleplayerForm.agentName,
    roleplayerForm.attorneyEmail,
    roleplayerForm.attorneyName,
    roleplayerForm.bondOriginatorEmail,
    roleplayerForm.bondOriginatorName,
    roleplayerHandoffEvents,
    roleplayerIntroEvents,
    transferAttorney?.participantEmail,
    transferAttorney?.participantName,
  ])
  const workflowLanes = useMemo(
    () => (Array.isArray(workflowOperations?.lanes) ? workflowOperations.lanes : EMPTY_ARRAY),
    [workflowOperations?.lanes],
  )
  const workflowBlockedCount = workflowLanes.filter((lane) => getWorkflowHealthKey(lane) === 'blocked').length
  const workflowWaitingCount = workflowLanes.filter((lane) => getWorkflowHealthKey(lane) === 'waiting').length
  const workflowDelayedCount = workflowLanes.filter((lane) => getWorkflowHealthKey(lane) === 'delayed').length
  const matterHealthLabel = workflowBlockedCount ? 'Blocked' : workflowDelayedCount ? 'Attention' : workflowWaitingCount ? 'Waiting' : 'On Track'
  const matterHealthMeta = matterHealthLabel === 'Blocked'
    ? WORKFLOW_STATUS_META.blocked
    : matterHealthLabel === 'Attention'
      ? WORKFLOW_STATUS_META.delayed
      : matterHealthLabel === 'Waiting'
        ? WORKFLOW_STATUS_META.waiting
        : WORKFLOW_STATUS_META.in_progress
  const displayedWorkflowLanes = useMemo(() => {
    if (activeWorkspaceMenu === 'transfer') {
      return workflowLanes.filter((lane) => ['transfer', 'cancellation'].includes(lane.laneKey))
    }
    if (activeWorkspaceMenu === 'finance') {
      if (isBondOrHybridFinance) return EMPTY_ARRAY
      return workflowLanes.filter((lane) => lane.laneKey === 'bond')
    }
    return EMPTY_ARRAY
  }, [activeWorkspaceMenu, isBondOrHybridFinance, workflowLanes])
  const canEditBondHybridFinanceWorkflow = ['bond_originator', 'developer', 'internal_admin', 'admin'].includes(
    String(workspaceRole || '').toLowerCase(),
  )
  const bondHybridFinanceWorkflowPanel = isBondOrHybridFinance ? (
    <TransactionBondHybridFinanceWorkflowPanel
      workflowData={transactionFinanceWorkflow}
      canEdit={canEditBondHybridFinanceWorkflow}
      variant={workspaceRole === 'bond_originator' ? 'originator' : 'agent'}
      loadingAction={bondHybridFinanceActionLoading}
      onAdvanceStage={(stageKey) => void handleBondHybridFinanceStage(stageKey)}
      onAddApplication={(payload) => void handleAddBondHybridApplication(payload)}
      onUpdateApplication={(applicationId, payload) => void handleUpdateBondHybridApplication(applicationId, payload)}
      onAddQuote={(payload) => void handleAddBondHybridQuote(payload)}
      onApproveQuote={(quoteId) => void handleApproveBondHybridQuote(quoteId)}
      onInstructionSent={() => void handleMarkBondHybridInstructionSent()}
    />
  ) : null
  const activeWorkflowLane = useMemo(
    () => workflowLanes.find((lane) => lane.laneKey === workflowDrawerLaneKey) || null,
    [workflowDrawerLaneKey, workflowLanes],
  )

  async function refreshWorkflowAfterChange(nextOperations = null) {
    if (nextOperations) {
      setWorkflowOperations(nextOperations)
    } else if (transaction?.id) {
      const operations = await getAttorneyWorkflowOperationsForTransaction(transaction.id)
      setWorkflowOperations(operations)
    }
    await loadData({ background: true })
  }

  async function refreshBondHybridFinanceWorkflow(nextWorkflow = null) {
    if (nextWorkflow) {
      setData((previous) => previous ? { ...previous, transactionFinanceWorkflow: nextWorkflow } : previous)
      return nextWorkflow
    }
    if (!transaction?.id) return null
    const workflow = await getTransactionFinanceWorkflow(transaction.id, { createIfMissing: true })
    setData((previous) => previous ? { ...previous, transactionFinanceWorkflow: workflow } : previous)
    return workflow
  }

  async function handleBondHybridFinanceStage(stageKey) {
    if (!transaction?.id) {
      setError('Transaction data is not available for bond finance workflow updates.')
      return
    }

    try {
      setBondHybridFinanceActionLoading(stageKey)
      setError('')
      const result = await updateBondHybridFinanceStage(transaction.id, stageKey, { actorRole: workspaceRole })
      await refreshBondHybridFinanceWorkflow(result)
      await loadData({ background: true })
    } catch (workflowActionError) {
      setError(workflowActionError?.message || 'Unable to update bond finance workflow.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleAddBondHybridApplication(payload) {
    if (!transaction?.id) {
      setError('Transaction data is not available for bond applications.')
      return
    }

    try {
      setBondHybridFinanceActionLoading('add_application')
      setError('')
      const result = await addBondApplication(transaction.id, payload, { actorRole: workspaceRole })
      await refreshBondHybridFinanceWorkflow(result)
      await loadData({ background: true })
    } catch (workflowActionError) {
      setError(workflowActionError?.message || 'Unable to add bank/lender application.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleUpdateBondHybridApplication(applicationId, payload) {
    try {
      setBondHybridFinanceActionLoading(applicationId)
      setError('')
      const result = await updateBondApplication(applicationId, payload, { actorRole: workspaceRole })
      await refreshBondHybridFinanceWorkflow(result)
      await loadData({ background: true })
    } catch (workflowActionError) {
      setError(workflowActionError?.message || 'Unable to update bank/lender application.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleAddBondHybridQuote(payload) {
    if (!transaction?.id) {
      setError('Transaction data is not available for bond quotes.')
      return
    }

    try {
      setBondHybridFinanceActionLoading('add_quote')
      setError('')
      const result = await addBondQuote(transaction.id, payload, { actorRole: workspaceRole })
      await refreshBondHybridFinanceWorkflow(result)
      await loadData({ background: true })
    } catch (workflowActionError) {
      setError(workflowActionError?.message || 'Unable to add finance quote.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleApproveBondHybridQuote(quoteId) {
    try {
      setBondHybridFinanceActionLoading(quoteId)
      setError('')
      const result = await approveBondQuote(quoteId, { actorRole: workspaceRole })
      await refreshBondHybridFinanceWorkflow(result)
      await loadData({ background: true })
    } catch (workflowActionError) {
      setError(workflowActionError?.message || 'Unable to approve finance quote.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleMarkBondHybridInstructionSent() {
    if (!transaction?.id) {
      setError('Transaction data is not available for instruction updates.')
      return
    }

    try {
      setBondHybridFinanceActionLoading('instruction_sent')
      setError('')
      const result = await markFinanceInstructionSent(transaction.id, { actorRole: workspaceRole })
      await refreshBondHybridFinanceWorkflow(result)
      await loadData({ background: true })
    } catch (workflowActionError) {
      setError(workflowActionError?.message || 'Unable to mark finance instruction sent.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  function openWorkflowDrawer(lane) {
    setWorkflowDrawerLaneKey(lane?.laneKey || '')
    setWorkflowStepDraft(null)
    setWorkflowNoteDraft(null)
    setWorkflowDocumentDraft(null)
  }

  function handleWorkflowPrimaryAction(lane, action) {
    const currentStep = getCurrentWorkflowStep(lane)
    openWorkflowDrawer(lane)
    if (action === 'Mark Step Complete' && currentStep) {
      setWorkflowStepDraft({ laneKey: lane.laneKey, step: currentStep, status: 'completed', note: '' })
      return
    }
    if (action === 'Send Reminder') {
      setWorkflowNoteDraft({
        laneKey: lane.laneKey,
        visibility: 'professional_shared',
        message: `Reminder sent for ${currentStep ? getWorkflowStepLabel(currentStep) : getWorkflowLaneTitle(lane)}.`,
      })
      return
    }
    if (action === 'Upload Document') {
      setWorkspaceMenu('documents')
      setWorkflowDrawerLaneKey('')
      return
    }
    if (action === 'Blocker Details' && currentStep) {
      setWorkflowStepDraft({ laneKey: lane.laneKey, step: currentStep, status: 'blocked', note: currentStep.comment || '' })
    }
  }

  function handleSelectWorkflowStepStatus(lane, step, status) {
    setWorkflowDrawerLaneKey(lane?.laneKey || workflowDrawerLaneKey)
    setWorkflowStepDraft({ laneKey: lane?.laneKey || workflowDrawerLaneKey, step, status, note: step?.comment || '' })
  }

  async function handleWorkflowStepSubmit(event) {
    event.preventDefault()
    if (!workflowStepDraft || !transaction?.id) return
    setWorkflowSaving(true)
    setWorkflowError('')
    try {
      const next = await updateAttorneyWorkflowStepStatus({
        transactionId: transaction.id,
        laneKey: workflowStepDraft.laneKey,
        stepId: workflowStepDraft.step?.id,
        stepKey: workflowStepDraft.step?.stepKey || workflowStepDraft.step?.step_key,
        status: workflowStepDraft.status,
        note: workflowStepDraft.note,
        visibility: 'internal',
      })
      setWorkflowStepDraft(null)
      await refreshWorkflowAfterChange(next)
    } catch (stepError) {
      setWorkflowError(stepError?.message || 'Unable to update workflow step.')
    } finally {
      setWorkflowSaving(false)
    }
  }

  async function handleWorkflowNoteSubmit(event) {
    event.preventDefault()
    if (!workflowNoteDraft || !transaction?.id) return
    setWorkflowSaving(true)
    setWorkflowError('')
    try {
      const next = await addAttorneyTransactionUpdate({
        transactionId: transaction.id,
        laneKey: workflowNoteDraft.laneKey,
        updateType: 'internal_note',
        visibility: workflowNoteDraft.visibility || 'internal',
        message: workflowNoteDraft.message,
      })
      setWorkflowNoteDraft(null)
      await refreshWorkflowAfterChange(next)
    } catch (noteError) {
      setWorkflowError(noteError?.message || 'Unable to save workflow note.')
    } finally {
      setWorkflowSaving(false)
    }
  }

  async function handleWorkflowDocumentSubmit(event) {
    event.preventDefault()
    if (!workflowDocumentDraft || !transaction?.id) return
    setWorkflowSaving(true)
    setWorkflowError('')
    try {
      const next = await requestAttorneyWorkflowLaneDocument({
        transactionId: transaction.id,
        laneKey: workflowDocumentDraft.laneKey,
        title: workflowDocumentDraft.title,
        description: workflowDocumentDraft.description,
        requestedFrom: workflowDocumentDraft.requestedFrom,
      })
      setWorkflowDocumentDraft(null)
      await refreshWorkflowAfterChange(next)
    } catch (documentError) {
      setWorkflowError(documentError?.message || 'Unable to request workflow document.')
    } finally {
      setWorkflowSaving(false)
    }
  }

  function handleQuickRequestDocuments() {
    const lane = workflowLanes[0]
    if (!lane) {
      setWorkspaceMenu('documents')
      return
    }
    openWorkflowDrawer(lane)
    setWorkflowDocumentDraft({
      laneKey: lane.laneKey,
      title: '',
      description: '',
      requestedFrom: 'client',
    })
  }

  function handleQuickAddWorkflowNote() {
    const lane = workflowLanes[0]
    if (!lane) {
      setWorkspaceMenu('activity')
      return
    }
    openWorkflowDrawer(lane)
    setWorkflowNoteDraft({
      laneKey: lane.laneKey,
      visibility: 'internal',
      message: '',
    })
  }

  function handleQuickScheduleSigning() {
    const lane = workflowLanes.find((item) => item.laneKey === 'transfer') || workflowLanes[0]
    if (!lane) {
      setWorkspaceMenu('activity')
      return
    }
    openWorkflowDrawer(lane)
    setWorkflowNoteDraft({
      laneKey: lane.laneKey,
      visibility: 'internal',
      message: 'Signing appointment to be scheduled.',
    })
  }

  function openAgentSalesAgreementWorkspace() {
    if (!transaction?.id) {
      setError('Transaction data is not available for sales agreement generation.')
      return
    }

    const params = new URLSearchParams()
    params.set('mode', 'generate')
    params.set('returnTo', `${location.pathname}${location.search || ''}`)
    navigate(`/transactions/${transaction.id}/legal/otp?${params.toString()}`)
  }

  const matterHeaderMetrics = useMemo(
    () => {
      const metrics = [
        { label: 'Purchase Price', value: formatCurrencyValue(displayPurchasePriceValue, 'Not captured'), icon: CircleDollarSign, tone: 'bg-emerald-50 text-emerald-700' },
        { label: 'Finance Type', value: financeTypeLabel, icon: FileText, tone: 'bg-blue-50 text-blue-700' },
        { label: 'Bond Amount', value: formatCurrencyValue(hasCapturedFinancials ? transaction?.bond_amount : 0, bondAmountFallback), icon: Building2, tone: 'bg-violet-50 text-violet-700' },
        { label: 'Target Registration', value: formatDate(transaction?.target_registration_date || transaction?.expected_transfer_date), icon: CalendarDays, tone: 'bg-sky-50 text-sky-700' },
      ]
      if (shouldShowDepositCard) {
        metrics.splice(3, 0, {
          label: 'Deposit',
          value: formatCurrencyValue(hasCapturedFinancials ? transaction?.deposit_amount : 0, 'Not captured'),
          icon: CircleDollarSign,
          tone: 'bg-amber-50 text-amber-700',
        })
      }
      return metrics
    },
    [
      bondAmountFallback,
      displayPurchasePriceValue,
      financeTypeLabel,
      hasCapturedFinancials,
      shouldShowDepositCard,
      transaction?.bond_amount,
      transaction?.deposit_amount,
      transaction?.expected_transfer_date,
      transaction?.target_registration_date,
    ],
  )
  const matterAssignedFirms = useMemo(
    () => [
      { label: 'Transfer Attorney', value: getParticipantDisplayName(transferAttorney) },
      { label: 'Bond Attorney', value: getParticipantDisplayName(bondAttorney) },
    ],
    [bondAttorney, transferAttorney],
  )
  const matterProgressIndex = useMemo(
    () => getMatterStageProgressIndex({ transferStageKey, transferStageLabel, lifecycleState }),
    [lifecycleState, transferStageKey, transferStageLabel],
  )
  const matterSubtitle = [
    development?.name || null,
    propertyAddress || null,
  ].filter(Boolean).join(' • ')
  const overviewKeyDates = [
    { label: 'Offer accepted', value: formatDate(transaction?.offer_accepted_at || transaction?.created_at), complete: true },
    { label: 'Transfer duty paid', value: formatDate(transaction?.transfer_duty_paid_at), complete: Boolean(transaction?.transfer_duty_paid_at) },
    { label: 'Target registration', value: formatDate(transaction?.target_registration_date || transaction?.expected_transfer_date), emphasis: true },
    { label: 'Estimated registration', value: formatDate(transaction?.estimated_registration_date || transaction?.target_registration_date || transaction?.expected_transfer_date) },
  ]
  const overviewNextActions = useMemo(() => {
    const rows = []
    const blockedLane = workflowLanes.find((lane) => normalizeWorkspaceStatus(lane?.laneStatus || lane?.summary?.status) === 'blocked')
    const waitingLane = workflowLanes.find((lane) => lane?.documentSummary?.missing || lane?.documentSummary?.requested)
    if (transaction?.next_action) {
      rows.push({
        title: transaction.next_action,
        description: 'Matter-level next action',
        dueDate: transaction?.target_registration_date || transaction?.expected_transfer_date,
        workflow: 'Overview',
        action: isAgentTransactionView ? 'View transaction' : 'View matter',
      })
    }
    if (blockedLane) {
      rows.push({
        title: `${getWorkflowLaneTitle(blockedLane)} blocked`,
        description: blockedLane.summary?.blocked?.comment || 'A workflow step needs attention.',
        dueDate: blockedLane.dueDate,
        workflow: getWorkflowLaneTitle(blockedLane),
        action: 'View workflow',
      })
    }
    if (waitingLane) {
      rows.push({
        title: 'Documents outstanding',
        description: `${waitingLane.documentSummary?.missing || waitingLane.documentSummary?.requested || 0} document item(s) need follow-up.`,
        dueDate: waitingLane.dueDate,
        workflow: getWorkflowLaneTitle(waitingLane),
        action: 'Upload Document',
      })
    }
    if (!rows.length) {
      rows.push({
        title: 'Review latest activity',
        description: 'No urgent action is currently flagged.',
        dueDate: transaction?.updated_at,
        workflow: 'Activity',
        action: 'Open Activity',
      })
    }
    return rows.slice(0, 4)
  }, [isAgentTransactionView, transaction?.expected_transfer_date, transaction?.next_action, transaction?.target_registration_date, transaction?.updated_at, workflowLanes])
  const getWorkspaceMenuForTask = useCallback((item) => {
    const workflowLabel = `${item?.workflow || ''} ${item?.action || ''}`.toLowerCase()
    if (workflowLabel.includes('document') || workflowLabel.includes('upload')) return 'documents'
    if (workflowLabel.includes('bond') || workflowLabel.includes('finance') || workflowLabel.includes('guarantee')) return 'finance'
    if (workflowLabel.includes('activity') || workflowLabel.includes('note')) return 'activity'
    return 'transfer'
  }, [])
  const assignedTeamRows = useMemo(
    () => [
      { role: 'Transfer Attorney', participant: transferAttorney, lane: 'transfer' },
      { role: 'Bond Attorney', participant: bondAttorney, lane: 'bond' },
      { role: 'Cancellation Attorney', participant: cancellationAttorney, lane: 'cancellation' },
      {
        role: 'Conveyancer / Secretary',
        participant: activeStakeholders.find((item) => /secretary|conveyancer|admin/i.test(`${item?.roleLabel || ''} ${item?.participantName || ''}`)),
        lane: 'support',
      },
    ],
    [activeStakeholders, bondAttorney, cancellationAttorney, transferAttorney],
  )
  const agents = useMemo(
    () => activeStakeholders.filter((item) => item?.roleType === 'agent'),
    [activeStakeholders],
  )
  const partySections = useMemo(
    () => [
      {
        title: 'Buyer',
        subtitle: 'Buyer details, onboarding, FICA, finance position, and buyer notes.',
        items: [
          ['Name', buyer?.name || 'Not assigned'],
          ['Email', buyer?.email || 'Not captured'],
          ['Phone', buyer?.phone || 'Not captured'],
          ['Onboarding', onboardingCompleted ? 'Completed' : 'Pending'],
          ['FICA Status', transaction?.buyer_fica_status ? toTitle(transaction.buyer_fica_status) : documentReadinessText],
          ['Finance Details', financeTypeLabel],
        ],
      },
      {
        title: 'Seller',
        subtitle: 'Seller details, onboarding, FICA, existing bond, and cancellation requirements.',
        items: [
          ['Name', transaction?.seller_name || 'Not assigned'],
          ['Email', transaction?.seller_email || 'Not captured'],
          ['Phone', transaction?.seller_phone || 'Not captured'],
          ['FICA Status', transaction?.seller_fica_status ? toTitle(transaction.seller_fica_status) : 'Pending'],
          ['Existing Bond', transaction?.seller_has_existing_bond ? 'Yes' : 'Not flagged'],
          ['Cancellation Requirement', transaction?.seller_has_existing_bond ? 'Required' : 'Not required'],
        ],
      },
      {
        title: 'Property',
        subtitle: 'Property, unit, development, price, and registration details.',
        items: [
          ['Erf / Unit', unit?.unit_number ? `Unit ${unit.unit_number}` : transaction?.erf_number || 'Not captured'],
          ['Development', development?.name || 'Standalone matter'],
          ['Address', propertyAddress || transaction?.property_description || 'Not captured'],
          ['Purchase Price', formatCurrencyValue(displayPurchasePriceValue, 'Not captured')],
          ['Registration Date', formatDate(transaction?.registration_date || transaction?.registered_at)],
          ['Target Registration', formatDate(transaction?.target_registration_date || transaction?.expected_transfer_date)],
        ],
      },
      {
        title: 'Agents',
        subtitle: 'Agent and brokerage contacts linked to this matter.',
        items: agents.length
          ? agents.map((agent) => [agent.roleLabel || 'Agent', agent.participantName || agent.participantEmail || 'Agent'])
          : [['Agents', 'No agents linked']],
      },
      {
        title: 'Attorney Roles',
        subtitle: 'Firms and people assigned to each legal role.',
        items: [
          ['Transfer Attorney', transferAttorney?.organisationName || transferAttorney?.participantName || transferAttorney?.participantEmail || 'Not assigned'],
          ['Bond Attorney', bondAttorney?.organisationName || bondAttorney?.participantName || bondAttorney?.participantEmail || 'Not assigned'],
          ['Cancellation Attorney', cancellationAttorney?.organisationName || cancellationAttorney?.participantName || cancellationAttorney?.participantEmail || 'Not assigned'],
        ],
      },
    ],
    [
      agents,
      bondAttorney,
      buyer?.email,
      buyer?.name,
      buyer?.phone,
      cancellationAttorney,
      development?.name,
      documentReadinessText,
      financeTypeLabel,
      displayPurchasePriceValue,
      onboardingCompleted,
      propertyAddress,
      transaction,
      transferAttorney,
      unit?.unit_number,
    ],
  )
  const financialRows = [
    ['Purchase Price', formatCurrencyValue(displayPurchasePriceValue, 'Not captured')],
    ['Deposit', formatCurrencyValue(hasCapturedFinancials ? transaction?.deposit_amount : 0, 'Not captured')],
    ['Bond Amount', formatCurrencyValue(hasCapturedFinancials ? transaction?.bond_amount : 0, bondAmountFallback)],
    ['Cash Portion', formatCurrencyValue(hasCapturedFinancials ? transaction?.cash_portion : 0, 'Not captured')],
    ['Transfer Fees', formatCurrencyValue(transaction?.transfer_fees, 'Pending')],
    ['Bond Registration Fees', formatCurrencyValue(transaction?.bond_registration_costs, 'Pending')],
    ['Cancellation Costs', formatCurrencyValue(transaction?.cancellation_costs, transaction?.seller_has_existing_bond ? 'Pending' : 'N/A')],
    ['Guarantees', formatCurrencyValue(transaction?.guarantee_amount, 'Pending')],
    ['Commission', formatCurrencyValue(transaction?.commission_amount, 'Pending')],
    ['Trust / Disbursements', formatCurrencyValue(transaction?.trust_balance, 'Placeholder')],
  ]
  const bondHybridFinanceSummary = transactionFinanceWorkflow?.summary || null
  const bondHybridFundingSnapshotRows = isBondOrHybridFinance
    ? [
        ['Finance Type', financeTypeLabel],
        ['Finance Stage', bondHybridFinanceSummary?.currentStageLabel || 'Documents Received'],
        ['Bond Originator', getParticipantDisplayName(assignedBondOriginator) || transaction?.bond_originator || 'Not assigned'],
        ['Submitted Banks', String(bondHybridFinanceSummary?.submittedBanksCount || 0)],
        ['Quotes Received', String(bondHybridFinanceSummary?.quotesReceivedCount || 0)],
        ['Approved Bank', bondHybridFinanceSummary?.approvedQuote?.bankName || 'Not approved yet'],
        ['Instruction Sent', bondHybridFinanceSummary?.instructionSent ? 'Yes' : 'No'],
      ]
    : [
        ['Finance Type', financeTypeLabel],
        ['Bond Attorney', bondAttorney?.organisationName || bondAttorney?.participantName || bondAttorney?.participantEmail || 'Not assigned'],
        ['Expected Transfer Date', formatDate(transaction?.expected_transfer_date)],
        ['Registration Date', formatDate(transaction?.registration_date || transaction?.registered_at)],
      ]
  const filteredActivityFeed = useMemo(
    () =>
      activityFeed.filter((entry) => {
        if (activityFilter === 'all') return true
        return (entry.filterKeys || []).includes(activityFilter)
      }),
    [activityFeed, activityFilter],
  )
  const groupedActivityFeed = useMemo(() => groupActivityByDate(filteredActivityFeed), [filteredActivityFeed])
  const onboardingRecipients = useMemo(() => {
    const buyerParticipant = activeStakeholders.find((participant) => participant?.roleType === 'buyer')
    const sellerParticipant = isPrivateMatter
      ? activeStakeholders.find((participant) => participant?.roleType === 'seller')
      : null

    const rows = [
      {
        key: 'buyer',
        roleLabel: 'Buyer',
        name: buyer?.name || buyerParticipant?.participantName || 'Buyer not assigned',
        email: buyer?.email || buyerParticipant?.participantEmail || '',
        stakeholderStatus: buyerParticipant?.stakeholderStatus || '',
      },
    ]

    if (isPrivateMatter) {
      rows.push({
        key: 'seller',
        roleLabel: 'Seller',
        name: transaction?.seller_name || sellerParticipant?.participantName || 'Seller not assigned',
        email: transaction?.seller_email || sellerParticipant?.participantEmail || '',
        stakeholderStatus: sellerParticipant?.stakeholderStatus || '',
      })
    }

    return rows.map((row) => {
      const stakeholderState = row.stakeholderStatus ? toTitle(row.stakeholderStatus) : row.email ? 'Active' : 'Missing email'
      return {
        ...row,
        stateLabel: onboardingCompleted ? 'Onboarding completed' : stakeholderState,
        canSend: Boolean(row.email),
      }
    })
  }, [activeStakeholders, buyer?.email, buyer?.name, isPrivateMatter, onboardingCompleted, transaction?.seller_email, transaction?.seller_name])

  const detailPanelSections = useMemo(
    () => ({
      matter: {
        title: workspaceRole === 'bond_originator' ? 'Application Details' : 'Matter Details',
        subtitle: workspaceRole === 'bond_originator'
          ? 'Reference and application metadata relevant to bond execution.'
          : 'Reference and transaction metadata relevant to legal execution.',
        summary: `${transferStageLabel} • ${workspaceReference}`,
        items: [
          { label: workspaceRole === 'bond_originator' ? 'Application ID' : 'Matter Number', value: workspaceReference },
          { label: 'Development', value: development?.name || 'Standalone matter' },
          { label: 'Unit', value: unit?.unit_number ? `Unit ${unit.unit_number}` : 'Not linked' },
          { label: 'Property Address', value: propertyAddress || transaction?.property_description || 'Not set' },
          { label: workspaceRole === 'bond_originator' ? 'Application Type' : 'Transaction Type', value: matterTypeLabel },
          { label: 'Finance Type', value: financeTypeLabel },
          { label: 'Current Stage', value: transferStageLabel },
          { label: 'Main Process Stage', value: mainStageLabel },
          { label: 'Expected Transfer Date', value: formatDate(transaction?.expected_transfer_date) },
          { label: 'Created', value: formatDateTime(transaction?.created_at) },
          { label: 'Last Updated', value: formatDateTime(transaction?.updated_at) },
        ],
      },
      buyer: {
        title: 'Buyer Details',
        subtitle: 'Primary purchaser identity and contact details.',
        summary: `${buyer?.name || 'Buyer not assigned'}${buyer?.email ? ` • ${buyer.email}` : ''}`,
        items: [
          { label: 'Buyer Name', value: buyer?.name || 'Not assigned' },
          { label: 'Buyer Email', value: buyer?.email || 'Not set' },
          { label: 'Buyer Phone', value: buyer?.phone || 'Not set' },
          { label: 'Purchaser Type', value: toTitle(transaction?.purchaser_type || 'individual') },
          { label: 'Onboarding Status', value: onboardingCompleted ? 'Completed' : 'Pending' },
        ],
      },
      seller: {
        title: 'Seller Details',
        subtitle: 'Seller identity and contact details for this matter.',
        summary: `${transaction?.seller_name || 'Seller not assigned'}${transaction?.seller_email ? ` • ${transaction.seller_email}` : ''}`,
        items: [
          { label: 'Seller Name', value: transaction?.seller_name || 'Not assigned' },
          { label: 'Seller Email', value: transaction?.seller_email || 'Not set' },
          { label: 'Seller Phone', value: transaction?.seller_phone || 'Not set' },
          { label: 'Matter Type', value: matterTypeLabel },
        ],
      },
    }),
    [
      buyer?.email,
      buyer?.name,
      buyer?.phone,
      financeTypeLabel,
      mainStageLabel,
      matterTypeLabel,
      onboardingCompleted,
      propertyAddress,
      transaction?.created_at,
      transaction?.expected_transfer_date,
      transaction?.property_description,
      transaction?.purchaser_type,
      transaction?.seller_email,
      transaction?.seller_name,
      transaction?.seller_phone,
      transaction?.updated_at,
      transferStageLabel,
      development?.name,
      unit?.unit_number,
      workspaceReference,
      workspaceRole,
    ],
  )

  const detailRows = useMemo(
    () => [
      { key: 'matter', title: 'Matter Details' },
      { key: 'buyer', title: 'Buyer Details' },
      { key: 'seller', title: 'Seller Details' },
    ],
    [],
  )

  const activeDetailPanel = detailPanelSections[detailPanelKey] || detailPanelSections.matter

  function handleOpenDetailPanel(key) {
    setDetailPanelKey(key)
    setDetailPanelOpen(true)
  }

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

  useEffect(() => {
    if (!transaction) return
    setRoleplayerForm({
      buyerName: buyer?.name || '',
      buyerEmail: buyer?.email || '',
      buyerPhone: buyer?.phone || '',
      sellerName: transaction?.seller_name || '',
      sellerEmail: transaction?.seller_email || '',
      sellerPhone: transaction?.seller_phone || '',
      agentName: transaction?.assigned_agent || '',
      agentEmail: transaction?.assigned_agent_email || '',
      attorneyName: transaction?.attorney || transferAttorney?.participantName || '',
      attorneyEmail: transaction?.assigned_attorney_email || transferAttorney?.participantEmail || '',
      bondOriginatorName: transaction?.bond_originator || '',
      bondOriginatorEmail: transaction?.assigned_bond_originator_email || '',
      matterOwner: transaction?.matter_owner || '',
    })
  }, [
    buyer?.email,
    buyer?.name,
    buyer?.phone,
    transaction,
    transferAttorney?.participantEmail,
    transferAttorney?.participantName,
  ])

  useEffect(() => {
    if (!isAgentTransactionView || roleplayerConfirmOpen) return
    setRoleplayerConfirmDraft({
      transferAttorney: transferAttorneyOptions[0]?.id || '',
      bondOriginator: bondOriginatorOptions[0]?.id || '',
      bondAttorney: bondAttorneyOptions[0]?.id || '',
    })
  }, [bondAttorneyOptions, bondOriginatorOptions, isAgentTransactionView, roleplayerConfirmOpen, transferAttorneyOptions])

  useEffect(() => {
    if (!isAgentTransactionView || !roleplayerConfirmOpen) return
    setRoleplayerConfirmDraft((previous) => ({
      transferAttorney: findRoleplayerOptionInList(transferAttorneyOptions, previous.transferAttorney)?.id || transferAttorneyOptions[0]?.id || '',
      bondOriginator: findRoleplayerOptionInList(bondOriginatorOptions, previous.bondOriginator)?.id || bondOriginatorOptions[0]?.id || '',
      bondAttorney: findRoleplayerOptionInList(bondAttorneyOptions, previous.bondAttorney)?.id || bondAttorneyOptions[0]?.id || '',
    }))
  }, [bondAttorneyOptions, bondOriginatorOptions, isAgentTransactionView, roleplayerConfirmOpen, transferAttorneyOptions])

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

  async function resolveSellerPortalInviteContext() {
    if (!transaction?.id) {
      throw new Error('Seller portal link could not be generated.')
    }
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Seller portal link could not be generated.')
    }

    let resolvedSellerEmail = sellerEmail
    let resolvedSellerName = sellerDisplayName === 'Seller details pending' ? '' : sellerDisplayName
    let sellerWorkspaceToken = ''
    let listingId = ''

    const contextQuery = await supabase
      .from('client_portal_contexts')
      .select('seller_workspace_token, client_email, listing_id, status, updated_at')
      .eq('transaction_id', transaction.id)
      .eq('context_type', 'selling')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (contextQuery.error && String(contextQuery.error?.code || '') !== '42P01') {
      throw new Error('Seller portal link could not be generated.')
    }

    const contextRow = contextQuery.data || null
    sellerWorkspaceToken = cleanDetailText(contextRow?.seller_workspace_token)
    resolvedSellerEmail = resolvedSellerEmail || cleanDetailEmail(contextRow?.client_email)
    listingId = cleanDetailText(contextRow?.listing_id)

    if ((!sellerWorkspaceToken || !resolvedSellerEmail) && listingId) {
      const onboardingQuery = await supabase
        .from('private_listing_seller_onboarding')
        .select('token, form_data, updated_at')
        .eq('private_listing_id', listingId)
        .maybeSingle()

      if (onboardingQuery.error && String(onboardingQuery.error?.code || '') !== '42P01') {
        throw new Error('Seller portal link could not be generated.')
      }

      const onboardingRow = onboardingQuery.data || null
      const formData = onboardingRow?.form_data && typeof onboardingRow.form_data === 'object' ? onboardingRow.form_data : {}
      sellerWorkspaceToken = sellerWorkspaceToken || cleanDetailText(onboardingRow?.token)
      resolvedSellerEmail = resolvedSellerEmail || cleanDetailEmail(formData.sellerEmail || formData.email || formData.contactEmail)
      resolvedSellerName =
        resolvedSellerName ||
        cleanDetailText(
          buildDisplayName(formData.sellerFirstName || formData.firstName, formData.sellerSurname || formData.lastName) ||
          formData.sellerName ||
          formData.fullName,
        )
    }

    if (!resolvedSellerEmail) {
      throw new Error('Seller email is missing.')
    }

    const onboardingLink = buildSellerClientPortalLink(sellerWorkspaceToken)
    if (!onboardingLink) {
      throw new Error('Seller portal link could not be generated.')
    }

    return {
      sellerEmail: resolvedSellerEmail,
      sellerName: resolvedSellerName || 'Seller',
      onboardingLink,
    }
  }

  async function sendBuyerOnboardingViaResend({ resend = false, source = 'agent_transaction_workspace' } = {}) {
    if (!transaction?.id) {
      throw new Error('Transaction data is not available for buyer onboarding.')
    }
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured in this environment.')
    }

    const response = await invokeEdgeFunction('send-email', {
      body: {
        type: 'client_onboarding',
        transactionId: transaction.id,
        resend,
        source,
      },
    })
    const responseError = response?.error || response?.data?.error
    if (responseError) {
      const parsedMessage = response?.error
        ? await parseEdgeFunctionError(response.error, 'Unable to send buyer onboarding right now.')
        : typeof responseError === 'string'
          ? responseError
          : responseError?.message || 'Unable to send buyer onboarding right now.'
      throw new Error(parsedMessage)
    }
    return response?.data || {}
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
    if (recipient.key !== 'buyer') {
      setOnboardingActionMessage('Resend delivery is available for buyer onboarding. Copy the link for this recipient instead.')
      return
    }

    try {
      setOnboardingActionBusy(true)
      setError('')
      const result = await sendBuyerOnboardingViaResend({
        resend: onboardingCompleted,
        source: 'transaction_workspace_recipient_action',
      })
      setOnboardingActionMessage(`Buyer onboarding sent to ${result?.recipientEmail || recipient.email}.`)
      await loadData({ background: true })
      window.dispatchEvent(new Event('itg:transaction-updated'))
    } catch (sendError) {
      setError(sendError?.message || 'Unable to send buyer onboarding right now.')
    } finally {
      setOnboardingActionBusy(false)
    }
  }

  function findRoleplayerOption(roleType, id) {
    const options =
      roleType === 'bond_originator'
        ? bondOriginatorOptions
        : roleType === 'bond_attorney'
          ? bondAttorneyOptions
          : transferAttorneyOptions
    const normalizedId = normalizeRoleplayerOptionValue(id)
    if (!normalizedId) return null
    return options.find((option) => normalizeRoleplayerOptionValue(option.id) === normalizedId) || null
  }

  function updateRoleplayerConfirmDraft(field, value) {
    setRoleplayerConfirmError('')
    setRoleplayerConfirmDraft((previous) => ({ ...previous, [field]: value }))
  }

  function buildRoleplayerSelection(roleType, option) {
    if (!option) return null
    return {
      roleType,
      organisationId: option.organisationId,
      relationshipId: option.relationshipId,
      companyName: option.companyName,
      contactPerson: option.contactPerson || option.companyName,
      email: option.email,
      scopeType: option.scopeType,
      scopeId: option.scopeId,
      scopeLabel: option.scopeLabel,
      preferred: option.preferred,
      selectionSource: option.preferred ? 'preferred_partner' : option.group === 'Recently Used' ? 'recently_used' : 'connected_partner',
      assignmentStatus: 'selected',
      activationTrigger:
        roleType === 'bond_originator'
          ? 'buyer_selects_bond_or_hybrid'
          : roleType === 'bond_attorney'
            ? 'bond_approved'
            : 'attorney_instruction_stage',
    }
  }

  function openRoleplayerConfirmation() {
    if (!canManageTransactionRoleplayers) {
      setError('You do not have permission to manage transaction roleplayers.')
      return
    }
    setRoleplayerConfirmError('')
    setOnboardingActionMessage('')
    setRoleplayerConfirmDraft({
      transferAttorney: findRoleplayerOptionInList(transferAttorneyOptions, roleplayerConfirmDraft.transferAttorney)?.id || transferAttorneyOptions[0]?.id || '',
      bondOriginator: findRoleplayerOptionInList(bondOriginatorOptions, roleplayerConfirmDraft.bondOriginator)?.id || bondOriginatorOptions[0]?.id || '',
      bondAttorney: findRoleplayerOptionInList(bondAttorneyOptions, roleplayerConfirmDraft.bondAttorney)?.id || bondAttorneyOptions[0]?.id || '',
    })
    setRoleplayerConfirmOpen(true)
  }

  async function handleCopyBuyerOnboardingLinkFromConfirmation() {
    try {
      setOnboardingActionBusy(true)
      setRoleplayerConfirmError('')
      const linkUrl = await getOnboardingLinkUrl()
      await navigator.clipboard.writeText(linkUrl)
      setOnboardingActionMessage('Buyer onboarding link copied. The agent can paste it into WhatsApp, SMS, or a manual email.')
    } catch (copyError) {
      setRoleplayerConfirmError(copyError?.message || 'Unable to copy the buyer onboarding link right now.')
    } finally {
      setOnboardingActionBusy(false)
    }
  }

  async function handleAgentHeaderOnboardingAction() {
    const recipient = {
      roleLabel: onboardingCompleted ? 'Client portal' : 'Buyer',
      name: buyerDisplayName || 'Buyer',
      email: buyerEmail,
    }

    if (!recipient.email) {
      setOnboardingActionMessage('Buyer email is missing.')
      setOnboardingModalOpen(true)
      return
    }

    if (!onboardingCompleted) {
      openRoleplayerConfirmation()
      return
    }

    try {
      setOnboardingActionBusy(true)
      setError('')
      setOnboardingActionMessage('')
      const result = await sendBuyerOnboardingViaResend({
        resend: onboardingCompleted,
        source: onboardingCompleted ? 'agent_transaction_header_client_portal_resend' : 'agent_transaction_header_buyer_onboarding',
      })
      setOnboardingActionMessage(
        onboardingCompleted
          ? 'Buyer portal link sent.'
          : `Buyer onboarding sent to ${result?.recipientEmail || recipient.email}.`,
      )
      await loadData({ background: true })
      window.dispatchEvent(new Event('itg:transaction-updated'))
    } catch (sendError) {
      setOnboardingActionMessage(sendError?.message || 'Could not send buyer portal link. Try again.')
    } finally {
      setOnboardingActionBusy(false)
    }
  }

  async function handleSendSellerPortalLink() {
    if (!sellerEmail) {
      setOnboardingActionMessage('Seller email is missing.')
      return
    }

    try {
      setSellerPortalBusy(true)
      setError('')
      setOnboardingActionMessage('')

      const inviteContext = await resolveSellerPortalInviteContext()
      const response = await invokeEdgeFunction('send-email', {
        body: {
          type: 'seller_onboarding_link',
          to: inviteContext.sellerEmail,
          organisationId: cleanDetailText(workspaceOrganisationId),
          sellerName: inviteContext.sellerName,
          propertyTitle: cleanDetailText(propertyAddress || matterHeadline || 'your property'),
          onboardingLink: inviteContext.onboardingLink,
          agentName: cleanDetailText(transaction?.assigned_agent || profile?.fullName || profile?.name || profile?.email || 'Bridge'),
        },
      })
      const responseError = response?.error || response?.data?.error
      if (responseError) {
        const parsedMessage = response?.error
          ? await parseEdgeFunctionError(response.error, 'Could not send seller portal link. Try again.')
          : typeof responseError === 'string'
            ? responseError
            : responseError?.message || 'Could not send seller portal link. Try again.'
        throw new Error(parsedMessage)
      }

      setOnboardingActionMessage('Seller portal link sent.')
    } catch (sendError) {
      setOnboardingActionMessage(sendError?.message || 'Could not send seller portal link. Try again.')
    } finally {
      setSellerPortalBusy(false)
    }
  }

  async function handleConfirmRoleplayersAndSendOnboarding({ allowMissingBondOriginator = false } = {}) {
    const recipient = {
      roleLabel: 'Buyer',
      name: buyer?.name || 'Buyer',
      email: buyer?.email || roleplayerForm.buyerEmail || '',
    }
    const transferOption =
      findRoleplayerOption('transfer_attorney', roleplayerConfirmDraft.transferAttorney) ||
      buildExistingRoleplayerOption(savedTransferRoleplayer, 'transfer_attorney') ||
      buildExistingRoleplayerOption(transferAttorney, 'transfer_attorney') ||
      (transaction?.attorney || transaction?.assigned_attorney_email
        ? buildExistingRoleplayerOption(
            {
              partnerName: transaction?.attorney,
              emailAddress: transaction?.assigned_attorney_email,
            },
            'transfer_attorney',
          )
        : null) ||
      transferAttorneyOptions[0] ||
      null
    const bondOriginatorOption = findRoleplayerOption('bond_originator', roleplayerConfirmDraft.bondOriginator)
    const bondAttorneyOption = findRoleplayerOption('bond_attorney', roleplayerConfirmDraft.bondAttorney)

    if (!transferOption) {
      setRoleplayerConfirmError('Transfer Attorney is required before buyer onboarding can be sent.')
      return
    }
    if (!bondOriginatorOption && !allowMissingBondOriginator) {
      setRoleplayerConfirmError('No bond originator selected. If the buyer chooses bond finance, no originator will be notified automatically.')
      return
    }

    const selections = [
      buildRoleplayerSelection('transfer_attorney', transferOption),
      buildRoleplayerSelection('bond_originator', bondOriginatorOption),
      buildRoleplayerSelection('bond_attorney', bondAttorneyOption),
    ].filter(Boolean)

    try {
      setOnboardingActionBusy(true)
      setRoleplayerConfirmError('')
      setError('')
      const refreshed = await saveTransactionRoleplayerSelections({
        transactionId: transaction.id,
        roleplayers: selections,
        actorRole: workspaceRole,
      })
      if (refreshed) {
        setData(refreshed)
      }
      const sendResult = await sendBuyerOnboardingViaResend({
        resend: false,
        source: 'buyer_onboarding_roleplayer_confirmation',
      })
      await recordBuyerOnboardingSent({
        transactionId: transaction.id,
        actorRole: workspaceRole,
        recipientEmail: recipient.email,
        roleplayers: selections,
      })
      setRoleplayerConfirmOpen(false)
      setOnboardingActionMessage(`Buyer onboarding sent to ${sendResult?.recipientEmail || recipient.email} after confirming roleplayers.`)
      await loadData({ background: true })
      window.dispatchEvent(new Event('itg:transaction-updated'))
    } catch (sendError) {
      setRoleplayerConfirmError(sendError?.message || 'Unable to confirm roleplayers and prepare the buyer onboarding link.')
    } finally {
      setOnboardingActionBusy(false)
    }
  }

  function updateRoleplayerFormField(field, value) {
    setRoleplayerForm((previous) => ({
      ...previous,
      [field]: value,
    }))
  }

  async function persistRoleplayerContacts() {
    if (!transaction?.id) return

    const refreshed = await updateTransactionStakeholderContacts({
      transactionId: transaction.id,
      buyerName: roleplayerForm.buyerName,
      buyerEmail: roleplayerForm.buyerEmail,
      buyerPhone: roleplayerForm.buyerPhone,
      sellerName: roleplayerForm.sellerName,
      sellerEmail: roleplayerForm.sellerEmail,
      sellerPhone: roleplayerForm.sellerPhone,
      agentName: roleplayerForm.agentName,
      agentEmail: roleplayerForm.agentEmail,
      attorneyName: roleplayerForm.attorneyName,
      attorneyEmail: roleplayerForm.attorneyEmail,
      bondOriginatorName: roleplayerForm.bondOriginatorName,
      bondOriginatorEmail: roleplayerForm.bondOriginatorEmail,
      matterOwner: roleplayerForm.matterOwner,
      actorRole: workspaceRole,
    })
    if (refreshed) {
      setData(refreshed)
    } else {
      await loadData()
    }
    window.dispatchEvent(new Event('itg:transaction-updated'))
    return refreshed
  }

  async function handleSaveRoleplayerContacts(event) {
    event.preventDefault()
    if (!transaction?.id) return

    try {
      setSaving(true)
      setError('')
      setStakeholderMessage('')
      setInviteLinkResult('')
      await persistRoleplayerContacts()
      setStakeholderMessage('Current roleplayers updated and transaction participants synced.')
    } catch (saveRoleplayersError) {
      setError(saveRoleplayersError.message || 'Unable to update roleplayers.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSendRoleplayerIntro() {
    if (!transaction?.id) return
    if (!roleplayerForm.buyerEmail.trim()) {
      setError('Buyer email is required before sending the roleplayer introduction.')
      return
    }
    if (!roleplayerForm.attorneyName.trim() && !roleplayerForm.attorneyEmail.trim()) {
      setError('Capture the transfer attorney before sending the roleplayer introduction.')
      return
    }
    if (financeRequiresBondSupport && !roleplayerForm.bondOriginatorName.trim() && !roleplayerForm.bondOriginatorEmail.trim()) {
      setError('Capture the bond originator before sending the roleplayer introduction for this finance transaction.')
      return
    }
    if (!roleplayerReadiness.canSendIntro) {
      setError((roleplayerReadiness.blockers || []).map((item) => item.label).join(' • ') || 'Complete the required handoff items before sending the roleplayer introduction.')
      return
    }

    try {
      setRoleplayerIntroBusy(true)
      setError('')
      setStakeholderMessage('')
      setInviteLinkResult('')
      await persistRoleplayerContacts()
      const response = await invokeEdgeFunction('send-email', {
        body: {
          type: 'transaction_roleplayer_intro',
          transactionId: transaction.id,
          to: roleplayerForm.buyerEmail,
          recipientName: roleplayerForm.buyerName,
          resend: true,
        },
      })
      const responseError = response?.error || response?.data?.error
      if (responseError) {
        const parsedMessage = response?.error
          ? await parseEdgeFunctionError(response.error, 'Unable to send roleplayer introduction.')
          : typeof responseError === 'string'
            ? responseError
            : responseError?.message || 'Unable to send roleplayer introduction.'
        throw new Error(parsedMessage)
      }
      setStakeholderMessage(`Roleplayer introduction sent to ${roleplayerForm.buyerEmail}.`)
      await loadData({ background: true })
    } catch (introError) {
      setError(introError.message || 'Unable to send roleplayer introduction.')
    } finally {
      setRoleplayerIntroBusy(false)
    }
  }

  async function handleSendRoleplayerHandoff() {
    if (!transaction?.id) return
    if (!roleplayerReadiness.canSendTeamHandoff) {
      setError(`${roleplayerReadiness.teamHandoffBlockers.join(' and ')} required before sending the team handoff.`)
      return
    }

    try {
      setRoleplayerHandoffBusy(true)
      setError('')
      setStakeholderMessage('')
      setInviteLinkResult('')
      await persistRoleplayerContacts()
      const response = await invokeEdgeFunction('send-email', {
        body: {
          type: 'transaction_roleplayer_handoff',
          transactionId: transaction.id,
          resend: true,
        },
      })
      const responseError = response?.error || response?.data?.error
      if (responseError) {
        const parsedMessage = response?.error
          ? await parseEdgeFunctionError(response.error, 'Unable to send team handoff.')
          : typeof responseError === 'string'
            ? responseError
            : responseError?.message || 'Unable to send team handoff.'
        throw new Error(parsedMessage)
      }
      const sentCount = Array.isArray(response?.data?.sentRecipients) ? response.data.sentRecipients.length : 0
      setStakeholderMessage(`Team handoff sent to ${sentCount || 'the'} roleplayer${sentCount === 1 ? '' : 's'}.`)
      await loadData({ background: true })
    } catch (handoffError) {
      setError(handoffError.message || 'Unable to send team handoff.')
    } finally {
      setRoleplayerHandoffBusy(false)
    }
  }

  const refreshRegistrationValidation = useCallback(async () => {
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
  }, [
    registrationDraft.registrationConfirmationDocumentId,
    registrationDraft.registrationDate,
    registrationDraft.titleDeedNumber,
    transaction?.id,
  ])

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
  }, [refreshRegistrationValidation, registrationModalOpen])

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
        requiredDocumentKey: uploadDraft.requiredDocumentKey || null,
        documentType: uploadDraft.requiredDocumentKey || null,
        canonicalRequirementInstanceId: uploadDraft.canonicalRequirementInstanceId || null,
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

  function openReviewAction(action, document, requirement) {
    setReviewActionDraft({
      open: true,
      action,
      document,
      requirement,
      reason: '',
    })
  }

  function handleReplaceDocument(document, requirement) {
    const canonicalRequirementInstanceId = getRequirementCanonicalId(requirement) || getDocumentCanonicalId(document)
    setUploadDraft((previous) => ({
      ...previous,
      canonicalRequirementInstanceId: canonicalRequirementInstanceId || '',
      requiredDocumentKey: requirement?.key || document?.document_type || '',
      category: requirement ? getAttorneyCategoryForRequiredDocument(requirement) : previous.category,
      visibility: document?.visibility_scope === 'internal' ? 'internal' : previous.visibility,
    }))
    setWorkspaceMenu('documents')
    setActiveDocumentGroup('all_documents')
  }

  async function handleSubmitReviewAction() {
    const requirement = reviewActionDraft.requirement || null
    const document = reviewActionDraft.document || null
    const action = reviewActionDraft.action
    const requirementInstanceId = getRequirementCanonicalId(requirement) || getDocumentCanonicalId(document)
    if (!requirementInstanceId || !action) return

    try {
      setSaving(true)
      setError('')
      await reviewCanonicalDocumentRequirement({
        requirementInstanceId,
        documentId: document?.id || getRequirementDocumentId(requirement),
        action,
        reason: reviewActionDraft.reason,
      })
      setReviewActionDraft({ open: false, action: '', document: null, requirement: null, reason: '' })
      await loadData()
    } catch (reviewError) {
      setError(reviewError.message || 'Unable to update canonical document review.')
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
        participantName: buildInviteParticipantName(stakeholderInviteForm),
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
        agentPhone: '',
        agentAgencyName: '',
        email: '',
      }))
      const agentMeta =
        stakeholderInviteForm.roleType === 'agent'
          ? [stakeholderInviteForm.agentAgencyName?.trim(), stakeholderInviteForm.agentPhone?.trim()].filter(Boolean).join(' • ')
          : ''
      setStakeholderMessage(invitationUrl ? 'Invite created and link copied.' : 'Invite created.')
      if (agentMeta) {
        setStakeholderMessage((previous) => `${previous} Agent details captured: ${agentMeta}.`)
      }
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

  async function handleAddDiscussion(event) {
    event.preventDefault()
    if (!transaction?.id || !discussionBody.trim()) {
      return
    }

    try {
      setSaving(true)
      setError('')
      if (discussionVisibility === 'internal' && !canPostInternalDiscussion) {
        setError('You do not have permission to post internal attorney notes.')
        return
      }
      if (discussionVisibility === 'shared' && !canPostSharedDiscussion) {
        setError('You do not have permission to post shared updates.')
        return
      }
      if (discussionVisibility === 'client_visible' && !canPublishClientVisibleDiscussion) {
        setError('You do not have permission to publish client-visible updates.')
        return
      }
      const normalizedDiscussion = discussionBody.trim()
      const prefixedDiscussion = `[${discussionType}] [${discussionVisibility}] ${normalizedDiscussion}`

      await addTransactionDiscussionComment({
        transactionId: transaction.id,
        authorName: profile?.fullName || profile?.email || 'Bridge Conveyancing',
        authorRole: 'attorney',
        commentText: prefixedDiscussion,
        unitId: unit?.id || null,
      })
      setDiscussionBody('')
      setDiscussionType('operational')
      setDiscussionVisibility('shared')
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

  if (workspaceRole === 'attorney' && attorneyPermissionState.loading) {
    return <LoadingSkeleton lines={8} className="panel" />
  }

  if (workspaceRole === 'attorney' && attorneyPermissionState.membership && !attorneyPermissionState.membership.isActive) {
    return <p className="status-message error">You do not have access to this attorney workspace.</p>
  }

  if (workspaceRole === 'attorney' && !matterAccessChecked) {
    return <LoadingSkeleton lines={8} className="panel" />
  }

  if (workspaceRole === 'attorney' && !matterAccessAllowed) {
    return <p className="status-message error">You do not have access to this matter.</p>
  }

  if (loading) {
    return <LoadingSkeleton lines={8} className="panel" />
  }

  if (!data || !transaction) {
    return <p className="status-message error">{error || 'Transaction not found.'}</p>
  }

  return (
    <>
      <SharedTransactionShell
      printTitle="Attorney Matter Report"
      printSubtitle={matterHeadline}
      printGeneratedAt={formatDate(new Date().toISOString())}
      errorMessage={error}
      headline={(
        <div className="space-y-4">
          <Link
            to={workspaceBackPath}
            className="no-print inline-flex w-fit items-center gap-2 rounded-[12px] border border-borderDefault bg-white px-3.5 py-2 text-sm font-semibold text-textBody shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:border-borderStrong hover:bg-surfaceAlt hover:text-textStrong"
          >
            <ChevronRight size={15} className="rotate-180" />
            {workspaceBackLabel}
          </Link>
            <MatterOverviewHeader
              title={workspaceReference}
              clientTitle={buyerDisplayName}
              transactionReference={workspaceReference}
              transactionStageLabel={transferStageLabel}
              transaction={transaction}
              mainStage={mainStage}
              statusLabel={hydratingDetail ? 'Refreshing' : lifecycleLabel}
              statusClassName={getLifecycleStateClasses(lifecycleState)}
              propertyLabel={isAgentTransactionView ? (propertyAddress || matterHeadline) : matterHeadline}
              subtitle={matterSubtitle}
              buyerName={buyerDisplayName}
              sellerName={sellerDisplayName}
              agentName={transaction?.assigned_agent || getParticipantDisplayName(assignedAgent)}
              assignedFirms={matterAssignedFirms}
              metrics={matterHeaderMetrics}
              progressIndex={matterProgressIndex}
              matterHealthLabel={matterHealthLabel}
              daysActiveLabel={daysBetween(transaction?.created_at)}
              updatedLabel={formatShortDayMonth(transaction?.updated_at || transaction?.created_at)}
              actionButtons={
                isAgentTransactionView
                  ? [
                      {
                        label: 'Resend Buyer Portal Link',
                        busyLabel: 'Sending buyer link...',
                        busy: onboardingActionBusy,
                        disabled: onboardingActionBusy || !buyerEmail,
                        onClick: () => void handleAgentHeaderOnboardingAction(),
                        icon: Send,
                      },
                      {
                        label: 'Send Seller Portal Link',
                        busyLabel: 'Sending seller link...',
                        busy: sellerPortalBusy,
                        disabled: sellerPortalBusy || !sellerEmail,
                        onClick: () => void handleSendSellerPortalLink(),
                        icon: Send,
                        variant: 'secondary',
                      },
                    ]
                  : []
              }
              isAgentView={isAgentTransactionView}
            />
          <MatterWorkspaceTabs tabs={workspaceMenuTabs} activeTab={activeWorkspaceMenu} onChange={setWorkspaceMenu} premium={isAgentTransactionView} />
          {onboardingActionMessage ? (
            <p className="rounded-[14px] border border-borderDefault bg-surfaceAlt px-4 py-2.5 text-helper text-textMuted">
              {onboardingActionMessage}
            </p>
          ) : null}
        </div>
      )}
    >
      <div className="space-y-6">
        {['overview', 'transfer'].includes(activeWorkspaceMenu) ? (
          <>
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-4">
                {activeWorkspaceMenu === 'overview' ? (
                  <section className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-textMuted">Next Action</span>
                        <h2 className="mt-2 text-lg font-semibold tracking-[-0.025em] text-textStrong">
                          {overviewNextActions[0]?.title || 'Review latest activity'}
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm leading-6 text-textMuted">
                          {overviewNextActions[0]?.description || 'No urgent action is currently flagged.'}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${matterHealthMeta.border} ${matterHealthMeta.bg} ${matterHealthMeta.text}`}>
                        <span className={`h-2 w-2 rounded-full ${matterHealthMeta.dot}`} />
                        {matterHealthLabel}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {[
                        ['Due Date', formatDate(overviewNextActions[0]?.dueDate)],
                        ['Priority', matterHealthLabel === 'Blocked' ? 'High' : matterHealthLabel === 'On Track' ? 'Normal' : 'Medium'],
                        ['Status', matterHealthLabel],
                      ].map(([label, value]) => (
                        <article key={label} className="rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2.5">
                          <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-textMuted">{label}</span>
                          <strong className="mt-1 block text-sm text-textStrong">{value}</strong>
                        </article>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={() => setWorkspaceMenu('transfer')}>
                        View Action
                      </Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setWorkspaceMenu('documents')}>
                        Open Documents
                      </Button>
                    </div>
                  </section>
                ) : (
                  <>
                    <section className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold text-textStrong">Transfer Workflow</h2>
                          <p className="mt-1 text-sm text-textMuted">Transfer, lodgement, registration, and cancellation workflow details live in this operational tab.</p>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs font-medium text-textMuted">
                          {Object.entries(WORKFLOW_STATUS_META).map(([key, meta]) => (
                            <span key={key} className="inline-flex items-center gap-1.5">
                              <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                              {meta.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </section>

                    {workflowLoading ? (
                      <LoadingSkeleton lines={5} className="rounded-[16px] border border-borderDefault bg-white p-4" />
                    ) : workflowError ? (
                      <p className="rounded-[16px] border border-warning/30 bg-warningSoft px-4 py-3 text-sm font-medium text-warning">
                        {workflowError}
                      </p>
                    ) : displayedWorkflowLanes.length ? (
                      displayedWorkflowLanes.map((lane) => (
                        <WorkflowLaneCard
                          key={lane.id || lane.laneKey}
                          lane={lane}
                          onOpenDetails={() => openWorkflowDrawer(lane)}
                          onPrimaryAction={handleWorkflowPrimaryAction}
                        />
                      ))
                    ) : (
                      <p className="rounded-[16px] border border-dashed border-borderDefault bg-white px-4 py-6 text-sm text-textMuted">
                        No transfer or cancellation workflow lane is configured for this matter yet.
                      </p>
                    )}
                  </>
                )}

                <section className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-textStrong">{isAgentTransactionView ? 'Transaction Feed' : 'Matter Feed'}</h3>
                      <p className="mt-1 text-sm text-textMuted">
                        {isAgentTransactionView
                          ? 'Client, property, document, and transfer updates for this transaction.'
                          : 'Collaborative matter updates, notes, documents, and workflow movement.'}
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setWorkspaceMenu('activity')}>
                      View all activity
                    </Button>
                  </div>
                  {activeWorkspaceMenu !== 'overview' ? (
                    <form onSubmit={handleAddDiscussion} className="mb-3 rounded-[14px] border border-borderSoft bg-surfaceAlt p-3">
                      <Field
                        as="textarea"
                        rows={3}
                        value={discussionBody}
                        onChange={(event) => setDiscussionBody(event.target.value)}
                        placeholder="Post a matter update..."
                      />
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex gap-2">
                          <Field as="select" value={discussionType} onChange={(event) => setDiscussionType(event.target.value)} className="min-h-9 text-xs">
                            {DISCUSSION_TYPES.map((item) => (
                              <option key={item.key} value={item.key}>{item.label}</option>
                            ))}
                          </Field>
                          <Field as="select" value={discussionVisibility} onChange={(event) => setDiscussionVisibility(event.target.value)} className="min-h-9 text-xs">
                            {DISCUSSION_VISIBILITY_OPTIONS.map((item) => (
                              <option
                                key={item.key}
                                value={item.key}
                                disabled={
                                  (item.key === 'internal' && !canPostInternalDiscussion) ||
                                  (item.key === 'shared' && !canPostSharedDiscussion) ||
                                  (item.key === 'client_visible' && !canPublishClientVisibleDiscussion)
                                }
                              >
                                {item.label}
                              </option>
                            ))}
                          </Field>
                        </div>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={
                            saving ||
                            !discussionBody.trim() ||
                            (discussionVisibility === 'internal' && !canPostInternalDiscussion) ||
                            (discussionVisibility === 'shared' && !canPostSharedDiscussion) ||
                            (discussionVisibility === 'client_visible' && !canPublishClientVisibleDiscussion)
                          }
                        >
                          <Send size={14} />
                          {saving ? 'Posting...' : 'Post'}
                        </Button>
                      </div>
                    </form>
                  ) : null}
                  <div className="divide-y divide-borderSoft">
                    {activityFeed.slice(0, 4).map((entry) => (
                      <article key={entry.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-start gap-3">
                          <span className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] ${entry.kind === 'comment' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {entry.kind === 'comment' ? <MessageSquarePlus size={15} /> : <Activity size={15} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className="truncate text-sm text-textStrong">{entry.title}</strong>
                              <span className="rounded-full bg-surfaceAlt px-2 py-0.5 text-[0.65rem] font-semibold text-textMuted">{entry.commentType}</span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-textMuted">{entry.body}</p>
                            <p className="mt-1 text-[0.68rem] font-medium text-textMuted">
                              {entry.authorName} • {entry.roleLabel}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs text-textMuted">{formatShortDayMonth(entry.createdAt)}</span>
                        </div>
                      </article>
                    ))}
                    {!activityFeed.length ? (
                      <p className="py-3 text-sm text-textMuted">Activity will appear here as the matter progresses.</p>
                    ) : null}
                  </div>
                </section>
              </div>

              <aside className="space-y-4 xl:sticky xl:top-4">
                <OverviewSidePanel title="Next Actions">
                  <div className="space-y-3">
                    {overviewNextActions.map((item) => (
                      <article key={`${item.title}-${item.workflow}`} className="rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-3">
                        <div className="flex items-start gap-2">
                          <Clock3 size={15} className="mt-0.5 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <strong className="block text-sm text-textStrong">{item.title}</strong>
                            <p className="mt-1 text-xs leading-5 text-textMuted">{item.description}</p>
                            <p className="mt-1 text-xs font-semibold text-warning">{formatDate(item.dueDate)}</p>
                          </div>
                        </div>
                        <Button type="button" variant="secondary" size="sm" className="mt-2 w-full justify-center" onClick={() => setWorkspaceMenu(getWorkspaceMenuForTask(item))}>
                          {item.action}
                        </Button>
                      </article>
                    ))}
                  </div>
                </OverviewSidePanel>

                <OverviewSidePanel title="Quick Actions">
                  <div className="grid gap-2">
                    {[
                      ['Request Documents', FileText, handleQuickRequestDocuments],
                      ['Upload Document', Upload, () => setWorkspaceMenu('documents')],
                      ['Add Note', MessageSquarePlus, handleQuickAddWorkflowNote],
                      ['Schedule Signing', CalendarDays, handleQuickScheduleSigning],
                      ['Generate Sales Agreement', FileText, openAgentSalesAgreementWorkspace],
                    ].map(([label, Icon, action]) => (
                      <Button key={label} type="button" variant="secondary" size="sm" className="justify-start" onClick={action}>
                        {createElement(Icon, { size: 14 })}
                        {label}
                      </Button>
                    ))}
                  </div>
                </OverviewSidePanel>

                <OverviewSidePanel title={isAgentTransactionView ? 'Health Summary' : 'Matter Health'}>
                  <div className="space-y-3">
                    {[
                      ['Workflow Health', matterHealthLabel, GaugeCircle],
                      ['Documents Missing', `${workflowLanes.reduce((total, lane) => total + Number(lane.documentSummary?.missing || 0), 0)}`, FileText],
                      ['Active Blockers', `${workflowBlockedCount}`, AlertTriangle],
                    ].map(([label, value, Icon]) => (
                      <div key={label} className="flex items-center justify-between gap-3 rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2">
                        <span className="inline-flex items-center gap-2 text-sm text-textMuted">
                          {createElement(Icon, { size: 14 })}
                          {label}
                        </span>
                        <strong className="text-sm text-textStrong">{value}</strong>
                      </div>
                    ))}
                  </div>
                </OverviewSidePanel>

                <OverviewSidePanel title="Key Dates">
                  <div className="space-y-2">
                    {overviewKeyDates.map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-3 rounded-[10px] px-1 py-1.5">
                        <span className="text-sm text-textMuted">{item.label}</span>
                        <span className={`text-right text-sm font-semibold ${item.emphasis ? 'text-primary' : 'text-textStrong'}`}>
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </OverviewSidePanel>

                <OverviewSidePanel title="Assigned Team">
                  <div className="space-y-3">
                    {assignedTeamRows.map((row) => {
                      const isCurrentUser = row.participant?.userId && row.participant.userId === profile?.id
                      return (
                        <article key={row.role} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-textMuted">{row.role}</span>
                            <strong className="mt-1 block truncate text-sm text-textStrong">
                              {row.participant?.participantName || row.participant?.organisationName || row.participant?.participantEmail || 'Not assigned'}
                            </strong>
                          </div>
                          {isCurrentUser ? (
                            <span className="rounded-full border border-primary/20 bg-primarySoft px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
                              You
                            </span>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                </OverviewSidePanel>
              </aside>
            </section>
          </>
        ) : null}

        {activeWorkspaceMenu === 'buyer' ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Buyer Workspace</h3>
                  <p className="mt-1 text-secondary text-textMuted">Buyer identity, FICA, finance position, signatures, and communication notes.</p>
                </div>
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-helper font-semibold ${onboardingCompleted ? 'border-success/30 bg-successSoft text-success' : 'border-warning/30 bg-warningSoft text-warning'}`}>
                  {onboardingCompleted ? 'Onboarding complete' : 'Onboarding pending'}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {detailPanelSections.buyer.items.map((item) => (
                  <article key={item.label} className="min-w-0 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <span className="text-label font-semibold uppercase text-textMuted">{item.label}</span>
                    <strong className="mt-1 block truncate text-body font-semibold text-textStrong">{item.value}</strong>
                  </article>
                ))}
                <article className="min-w-0 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                  <span className="text-label font-semibold uppercase text-textMuted">Finance Type</span>
                  <strong className="mt-1 block text-body font-semibold text-textStrong">{financeTypeLabel}</strong>
                </article>
                <article className="min-w-0 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                  <span className="text-label font-semibold uppercase text-textMuted">Signature Status</span>
                  <strong className="mt-1 block text-body font-semibold text-textStrong">
                    {requiredDocumentChecklist.length ? documentReadinessText : 'No signature pack configured'}
                  </strong>
                </article>
              </div>
            </section>

            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <h3 className="text-section-title font-semibold text-textStrong">Buyer Documents</h3>
              <p className="mt-1 text-secondary text-textMuted">Buyer-facing files remain separated from seller and internal legal documents.</p>
              <div className="mt-4 grid gap-3">
                {(groupedDocuments.buyer_documents || []).slice(0, 6).map((document) => (
                  <article key={document.id} className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <strong className="block truncate text-sm text-textStrong">{document.name || 'Buyer document'}</strong>
                    <p className="mt-1 text-xs text-textMuted">{document.normalizedCategory || document.category || 'Buyer document'} • {toTitle(document.status || 'uploaded')}</p>
                  </article>
                ))}
                {!(groupedDocuments.buyer_documents || []).length ? (
                  <p className="rounded-control border border-dashed border-borderSoft bg-surfaceAlt px-4 py-4 text-sm text-textMuted">
                    No buyer documents have been uploaded yet.
                  </p>
                ) : null}
              </div>
            </section>
          </section>
        ) : null}

        {activeWorkspaceMenu === 'seller' ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Seller Workspace</h3>
                  <p className="mt-1 text-secondary text-textMuted">Seller identity, FICA, existing bond information, cancellation triggers, and seller documents.</p>
                </div>
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-helper font-semibold ${
                  transaction?.seller_has_existing_bond ? 'border-warning/30 bg-warningSoft text-warning' : 'border-borderDefault bg-mutedBg text-textMuted'
                }`}>
                  {transaction?.seller_has_existing_bond ? 'Cancellation required' : 'No seller bond flagged'}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {detailPanelSections.seller.items.map((item) => (
                  <article key={item.label} className="min-w-0 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <span className="text-label font-semibold uppercase text-textMuted">{item.label}</span>
                    <strong className="mt-1 block truncate text-body font-semibold text-textStrong">{item.value}</strong>
                  </article>
                ))}
                {[
                  ['Existing Bond', transaction?.seller_has_existing_bond ? 'Yes' : 'Not flagged'],
                  ['Current Bond Bank', transaction?.current_bond_bank || 'Not captured'],
                  ['Bond Account', transaction?.current_bond_account_number || 'Not captured'],
                  ['Estimated Settlement', transaction?.estimated_settlement_amount ? currency.format(Number(transaction.estimated_settlement_amount || 0)) : 'Not captured'],
                ].map(([label, value]) => (
                  <article key={label} className="min-w-0 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <span className="text-label font-semibold uppercase text-textMuted">{label}</span>
                    <strong className="mt-1 block truncate text-body font-semibold text-textStrong">{value}</strong>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <h3 className="text-section-title font-semibold text-textStrong">Seller & Cancellation Documents</h3>
              <p className="mt-1 text-secondary text-textMuted">Seller files and cancellation-specific documents stay visible together.</p>
              <div className="mt-4 grid gap-3">
                {[...(groupedDocuments.seller_documents || []), ...(groupedDocuments.cancellation_documents || [])].slice(0, 6).map((document) => (
                  <article key={document.id} className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <strong className="block truncate text-sm text-textStrong">{document.name || 'Seller document'}</strong>
                    <p className="mt-1 text-xs text-textMuted">{document.normalizedCategory || document.category || 'Seller document'} • {toTitle(document.status || 'uploaded')}</p>
                  </article>
                ))}
                {![...(groupedDocuments.seller_documents || []), ...(groupedDocuments.cancellation_documents || [])].length ? (
                  <p className="rounded-control border border-dashed border-borderSoft bg-surfaceAlt px-4 py-4 text-sm text-textMuted">
                    No seller or cancellation documents have been uploaded yet.
                  </p>
                ) : null}
              </div>
            </section>
          </section>
        ) : null}

        {activeWorkspaceMenu === 'parties' ? (
          <section className="space-y-5">
            <section className="grid gap-4 lg:grid-cols-2">
              {partySections.map((section) => (
                <article key={section.title} className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primarySoft text-primary">
                      {section.title === 'Property' ? <Building2 size={17} /> : section.title === 'Attorney Roles' ? <Workflow size={17} /> : <UsersRound size={17} />}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-textStrong">{section.title}</h3>
                      <p className="mt-1 text-sm leading-5 text-textMuted">{section.subtitle}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {section.items.map(([label, value]) => (
                      <div key={`${section.title}-${label}`} className="min-w-0 rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2.5">
                        <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">{label}</span>
                        <strong className="mt-1 block truncate text-sm text-textStrong">{value || 'Not captured'}</strong>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>

            <AttorneyAssignmentSection
              transactionId={transaction?.id}
              financeType={transaction?.finance_type || 'cash'}
              transaction={transaction}
            />
          </section>
        ) : null}

        {activeWorkspaceMenu === 'documents' ? (
          <section className="space-y-5">
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-[1.25rem] font-semibold tracking-[-0.03em] text-[#142132]">Documents</h3>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                    Upload shared or internal legal documents and keep each file in the correct workflow group.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  {[
                    ['Shared', sharedAttorneyDocumentCount],
                    ['Internal', internalAttorneyDocumentCount],
                    ['Required', requiredDocumentChecklist.length],
                    ['Client Uploads', uploadedByClientCount],
                  ].map(([label, value]) => (
                    <article key={label} className="rounded-[16px] border border-[#dde4ee] bg-[#fbfdff] px-4 py-3">
                      <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                      <strong className="mt-2 block text-sm font-semibold text-[#142132]">{value}</strong>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="grid gap-4 xl:grid-cols-2">
                {[
                  {
                    title: 'Buyer Documents',
                    subtitle: 'Buyer-side compliance, finance, and onboarding requirements.',
                    rows: buyerDocumentRows,
                    emptyLabel: 'No buyer document requirements are configured yet.',
                  },
                  {
                    title: 'Seller Documents',
                    subtitle: 'Seller-side compliance, mandate, and clearance requirements.',
                    rows: sellerDocumentRows,
                    emptyLabel: 'No seller document requirements are configured yet.',
                  },
                ].map((section) => (
                  <article key={section.title} className="rounded-[18px] border border-[#dde4ee] bg-[#fbfdff] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">{section.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{section.subtitle}</p>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-[#d7e2ee] bg-white px-3 py-1 text-[0.68rem] font-semibold text-[#66758b]">
                        {section.rows.length} item{section.rows.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {section.rows.length ? (
                        section.rows.map(({ requirement, linkedDocument }) => (
                          <article key={getRequirementCanonicalId(requirement) || `${section.title}-${requirement.key}`} className="rounded-[14px] border border-[#dde4ee] bg-white px-4 py-3.5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <strong className="block truncate text-sm font-semibold text-[#142132]">
                                  {requirement.label || requirement.key || 'Document requirement'}
                                </strong>
                                <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                                  {linkedDocument?.name || 'No uploaded file yet'}
                                </p>
                              </div>
                              <span className="inline-flex items-center rounded-full border border-[#d7e2ee] bg-[#f8fafc] px-3 py-1 text-[0.68rem] font-semibold text-[#66758b]">
                                {getRequirementStatusLabel(requirement.status || linkedDocument?.status || 'missing')}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#60758d]">
                              <span>Last updated: {formatDateTime(linkedDocument?.updated_at || linkedDocument?.created_at || requirement?.updated_at || requirement?.created_at)}</span>
                              <div className="flex flex-wrap gap-2">
                                {linkedDocument?.url ? (
                                  <a
                                    href={linkedDocument.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c]"
                                  >
                                    <FileText size={13} />
                                    View
                                  </a>
                                ) : null}
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setUploadDraft((previous) => ({
                                      ...previous,
                                      canonicalRequirementInstanceId: String(getRequirementCanonicalId(requirement) || ''),
                                      requiredDocumentKey: requirement?.key || '',
                                      category: getAttorneyCategoryForRequiredDocument(requirement),
                                      file: null,
                                    }))
                                  }}
                                >
                                  {linkedDocument ? 'Replace' : 'Upload'}
                                </Button>
                              </div>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="rounded-[14px] border border-dashed border-[#d8e2ee] bg-white px-4 py-4 text-sm text-[#6b7d93]">
                          {section.emptyLabel}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">Upload Document</h3>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Select a category, set visibility, and upload your latest legal file.</p>
                </div>
                {uploadDraft.file ? (
                  <span className="inline-flex max-w-full items-center rounded-full border border-[#dde4ee] bg-[#f8fafc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">
                    {uploadDraft.file.name}
                  </span>
                ) : null}
              </div>
              <form onSubmit={handleUploadDocument} className="mt-4 grid gap-3 lg:grid-cols-12 lg:items-end">
                <label className="flex flex-col gap-1.5 lg:col-span-12">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Required document</span>
                  <Field
                    as="select"
                    value={uploadDraft.canonicalRequirementInstanceId || ''}
                    onChange={(event) => {
                      const canonicalRequirementInstanceId = event.target.value
                      const requirement = requiredDocumentChecklist.find((item) =>
                        String(item?.canonicalRequirementInstanceId || item?.canonical_requirement_instance_id || '') === canonicalRequirementInstanceId
                      )
                      setUploadDraft((previous) => ({
                        ...previous,
                        canonicalRequirementInstanceId,
                        requiredDocumentKey: requirement?.key || '',
                        category: requirement ? getAttorneyCategoryForRequiredDocument(requirement) : previous.category,
                      }))
                    }}
                  >
                    <option value="">General upload - do not satisfy a requirement</option>
                    {requiredDocumentChecklist
                      .filter((item) => item?.canonicalRequirementInstanceId || item?.canonical_requirement_instance_id)
                      .map((item) => {
                        const canonicalId = item.canonicalRequirementInstanceId || item.canonical_requirement_instance_id
                        return (
                          <option key={`${item.key}:${canonicalId}`} value={canonicalId}>
                            {item.label || item.key} · {item.status || 'pending'}
                          </option>
                        )
                      })}
                  </Field>
                </label>
                <label className="flex flex-col gap-1.5 lg:col-span-4">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Category</span>
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
                <label className="flex flex-col gap-1.5 lg:col-span-3">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Visibility</span>
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
                <label className="flex flex-col gap-1.5 lg:col-span-5">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">File</span>
                  <Field
                    key={`upload-input-${uploadInputVersion}`}
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null
                      setUploadDraft((previous) => ({ ...previous, file }))
                    }}
                  />
                </label>
                <div className="lg:col-span-12">
                  <Button type="submit" disabled={saving || !uploadDraft.file} className="min-w-[176px] justify-center">
                    {saving ? 'Uploading…' : 'Upload Document'}
                  </Button>
                </div>
              </form>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="rounded-[18px] border border-[#dde4ee] bg-[#f8fafc] p-3">
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                  {attorneyDocumentSections.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      className={`flex w-full items-center justify-between gap-3 rounded-[14px] border px-4 py-3 text-left transition ${
                        activeDocumentGroup === group.key
                          ? 'border-[#bfd3ea] bg-white text-[#1f3247] shadow-[0_8px_20px_rgba(15,23,42,0.06)]'
                          : 'border-transparent bg-transparent text-[#5c7088] hover:border-[#d5e0ed] hover:bg-white/70'
                      }`}
                      onClick={() => setActiveDocumentGroup(group.key)}
                    >
                      <span className="text-sm font-semibold">{group.label}</span>
                      <span className="inline-flex items-center rounded-full border border-[#d7e2ee] bg-[#f7fafd] px-2.5 py-1 text-[0.68rem] font-semibold text-[#6d8098]">
                        {group.items.length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {activeAttorneyDocumentSection ? (
                <section className="mt-4 rounded-[20px] border border-[#dde4ee] bg-white p-6">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[1.1rem] font-semibold tracking-[-0.03em] text-[#142132]">{activeAttorneyDocumentSection.label}</h3>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{activeAttorneyDocumentSection.description}</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f8fafc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">
                      {activeAttorneyDocumentSection.items.length} file{activeAttorneyDocumentSection.items.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {activeAttorneyDocumentSection.items.length ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {activeAttorneyDocumentSection.items.map((document) => {
                        const visibility = String(document.visibility_scope || 'shared').toLowerCase()
                        const isShared = visibility === 'shared'
                        const isArchived = Boolean(document.archived_at)
                        const linkedRequirement = document.linkedRequirement || getLinkedRequirementForDocument(document)
                        const linkedRequirementLabel = linkedRequirement?.label || linkedRequirement?.key || ''
                        const requirementStatus = linkedRequirement?.status || document.review_status || document.status || ''
                        const isRejectedRequirement = String(requirementStatus || '').trim().toLowerCase() === 'rejected'
                        const showReviewActions = canReviewDocumentRequirement(linkedRequirement, document)
                        const showReplaceAction = canReplaceDocumentRequirement(linkedRequirement, document)
                        return (
                          <article key={document.id} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-5 py-5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <strong className="block break-words text-sm font-semibold leading-7 text-[#142132]">
                                  {document.name || 'Untitled document'}
                                </strong>
                                <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                                  {document.normalizedCategory || document.category || 'Document'}
                                </p>
                              </div>
                              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${
                                isShared
                                  ? 'border-[#d6e5f4] bg-[#eef5fb] text-[#35546c]'
                                  : 'border-[#dde4ee] bg-[#f8fafc] text-[#66758b]'
                              }`}>
                                {isShared ? 'Client-visible' : 'Internal'}
                              </span>
                            </div>
                            <div className="mt-4 grid gap-2 text-xs text-[#60758d]">
                              {[
                                ['Status', getDocumentStatus(document)],
                                ['Linked requirement', linkedRequirementLabel || 'General upload'],
                                ['Requirement status', linkedRequirementLabel ? getRequirementStatusLabel(requirementStatus) : 'Not linked'],
                                ['Uploaded by', document.uploaded_by_role || document.uploadedByRole || 'Internal user'],
                                ['Requested by', document.requested_by_role || document.requestedByRole || document.requested_by || 'Not recorded'],
                                ['Reviewed by', document.reviewed_by_name || document.reviewedByName || document.reviewed_by || 'Not reviewed'],
                                ['Last updated', formatDateTime(document.updated_at || document.created_at)],
                              ].map(([label, value]) => (
                                <div key={label} className="flex justify-between gap-3">
                                  <span>{label}</span>
                                  <strong className="min-w-0 truncate text-right text-[#142132]">{value}</strong>
                                </div>
                              ))}
                            </div>
                            {isRejectedRequirement && (document.rejection_reason || document.rejected_reason || linkedRequirement?.rejectionReason || linkedRequirement?.rejection_reason) ? (
                              <p className="mt-3 rounded-[12px] border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                                {document.rejection_reason || document.rejected_reason || linkedRequirement?.rejectionReason || linkedRequirement?.rejection_reason}
                              </p>
                            ) : null}
                            {isArchived ? <p className="mt-1 text-xs font-semibold text-[#b42318]">Archived</p> : null}
                            <div className="mt-4 flex flex-wrap gap-2">
                              {document.url ? (
                                <a
                                  href={document.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-white px-4 py-2 text-sm font-semibold text-[#35546c]"
                                >
                                  <FileText size={14} />
                                  View
                                </a>
                              ) : null}
                              {document.url ? (
                                <a
                                  href={document.url}
                                  download
                                  className="inline-flex items-center rounded-full border border-[#dde4ee] bg-white px-4 py-2 text-sm font-semibold text-[#35546c]"
                                >
                                  Download
                                </a>
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleArchiveDocument(document.id)}
                                disabled={saving || isArchived}
                              >
                                Archive
                              </Button>
                              {showReviewActions ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => openReviewAction('approve', document, linkedRequirement)}
                                    disabled={saving}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => openReviewAction('reject', document, linkedRequirement)}
                                    disabled={saving}
                                  >
                                    Reject
                                  </Button>
                                </>
                              ) : null}
                              {showReplaceAction ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleReplaceDocument(document, linkedRequirement)}
                                  disabled={saving}
                                >
                                  Replace
                                </Button>
                              ) : null}
                              {canShowWaiverAction && linkedRequirementLabel ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openReviewAction('waive', document, linkedRequirement)}
                                  disabled={saving}
                                >
                                  Waive
                                </Button>
                              ) : null}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-5 py-6 text-sm text-[#6b7d93]">
                      No documents in {activeAttorneyDocumentSection.label.toLowerCase()} yet.
                    </div>
                  )}
                </section>
              ) : null}
            </section>
          </section>
        ) : null}

        {activeWorkspaceMenu === 'finance' ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Finance</h3>
                  <p className="mt-1 text-secondary text-textMuted">Money, funding status, bond exposure, guarantees, proof of funds, and finance-related tasks.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
                  {financeTypeLabel}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {financialRows.map(([label, value]) => (
                  <article key={label} className="min-w-0 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <span className="text-label font-semibold uppercase text-textMuted">{label}</span>
                    <strong className="mt-1 block truncate text-body font-semibold text-textStrong">{value}</strong>
                  </article>
                ))}
              </div>
            </section>

            <section className="space-y-5">
              <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
                <h3 className="text-section-title font-semibold text-textStrong">Funding Snapshot</h3>
                <p className="mt-1 text-secondary text-textMuted">Compact view of finance type, guarantees, and registration timing.</p>
                <div className="mt-4 grid gap-3">
                  {bondHybridFundingSnapshotRows.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                      <span className="text-sm text-textMuted">{label}</span>
                      <strong className="truncate text-right text-sm text-textStrong">{value}</strong>
                    </div>
                  ))}
                </div>
              </section>

              {isBondOrHybridFinance ? (
                bondHybridFinanceWorkflowPanel
              ) : (
                <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-section-title font-semibold text-textStrong">Funding Workflow</h3>
                      <p className="mt-1 text-secondary text-textMuted">Proof of funds, deposits, guarantees, and finance-related workflow movement.</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-helper font-semibold ${
                      isCapturedCashFinance
                        ? 'border-success/30 bg-successSoft text-success'
                        : 'border-primary/20 bg-primarySoft text-primary'
                    }`}>
                      {hasCapturedFinanceType ? (isCapturedCashFinance ? 'Cash transaction' : 'Finance workflow') : 'Awaiting onboarding'}
                    </span>
                  </div>
                </section>
              )}

              {!isBondOrHybridFinance && workflowLoading ? (
                <LoadingSkeleton lines={4} className="rounded-[16px] border border-borderDefault bg-white p-4" />
              ) : !isBondOrHybridFinance && workflowError ? (
                <p className="rounded-[16px] border border-warning/30 bg-warningSoft px-4 py-3 text-sm font-medium text-warning">
                  {workflowError}
                </p>
              ) : !isBondOrHybridFinance && displayedWorkflowLanes.length ? (
                displayedWorkflowLanes.map((lane) => (
                  <WorkflowLaneCard
                    key={lane.id || lane.laneKey}
                    lane={lane}
                    onOpenDetails={() => openWorkflowDrawer(lane)}
                    onPrimaryAction={handleWorkflowPrimaryAction}
                  />
                ))
              ) : !isBondOrHybridFinance ? (
                <section className="rounded-[18px] border border-dashed border-borderDefault bg-surface px-5 py-5 shadow-surface">
                  <h4 className="text-sm font-semibold text-textStrong">
                    {hasCapturedFinanceType
                      ? (isCapturedCashFinance ? 'No bond workflow required' : 'No funding workflow configured yet')
                      : 'Finance details not captured yet'}
                  </h4>
                  <p className="mt-1 text-sm leading-6 text-textMuted">
                    {hasCapturedFinanceType && isCapturedCashFinance
                      ? 'This transaction is marked as cash, so funding checks can stay focused on proof of funds, deposit, and guarantees.'
                      : 'Bond or guarantee workflow steps will appear here once the buyer onboarding captures the finance route.'}
                  </p>
                </section>
              ) : null}
            </section>
          </section>
        ) : null}

        {activeWorkspaceMenu === 'tasks' ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Tasks</h3>
                  <p className="mt-1 text-secondary text-textMuted">Outstanding actions, due dates, responsible parties, priority, and linked workflow areas.</p>
                </div>
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-helper font-semibold ${matterHealthMeta.border} ${matterHealthMeta.bg} ${matterHealthMeta.text}`}>
                  <span className={`h-2 w-2 rounded-full ${matterHealthMeta.dot}`} />
                  {matterHealthLabel}
                </span>
              </div>

              <div className="mt-5 divide-y divide-borderSoft overflow-hidden rounded-[16px] border border-borderDefault bg-white">
                {overviewNextActions.map((item) => {
                  const targetMenu = getWorkspaceMenuForTask(item)
                  const priority = matterHealthLabel === 'Blocked' ? 'High' : matterHealthLabel === 'On Track' ? 'Normal' : 'Medium'
                  const responsibleParty = targetMenu === 'finance'
                    ? getParticipantDisplayName(bondAttorney) || 'Finance team'
                    : targetMenu === 'documents'
                      ? buyer?.name || transaction?.seller_name || 'Matter team'
                      : targetMenu === 'activity'
                        ? profile?.fullName || profile?.email || 'Matter team'
                        : getParticipantDisplayName(transferAttorney) || getParticipantDisplayName(assignedAgent) || 'Matter team'

                  return (
                    <article key={`${item.title}-${item.workflow}`} className="px-4 py-4 transition hover:bg-primarySoft/40">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm font-semibold text-textStrong">{item.title}</strong>
                            <span className="rounded-full border border-borderSoft bg-surfaceAlt px-2 py-0.5 text-[0.68rem] font-semibold text-textMuted">
                              {item.workflow}
                            </span>
                          </div>
                          <p className="mt-1 max-w-3xl text-sm leading-6 text-textMuted">{item.description}</p>
                        </div>
                        <Button type="button" size="sm" variant="secondary" className="shrink-0 justify-center" onClick={() => setWorkspaceMenu(targetMenu)}>
                          {item.action}
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                        {[
                          ['Due', formatDate(item.dueDate)],
                          ['Responsible', responsibleParty],
                          ['Priority', priority],
                          ['Area', toTitle(targetMenu)],
                        ].map(([label, value]) => (
                          <div key={label} className="min-w-0 rounded-[10px] border border-borderSoft bg-surfaceAlt px-3 py-2">
                            <span className="block font-semibold uppercase tracking-[0.08em] text-textMuted">{label}</span>
                            <strong className="mt-1 block truncate text-textStrong">{value}</strong>
                          </div>
                        ))}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>

            <aside className="space-y-4 xl:sticky xl:top-4">
              <OverviewSidePanel title="Quick Actions">
                <div className="grid gap-2">
                  {[
                    ['Upload Document', Upload, () => setWorkspaceMenu('documents')],
                    ['Request Document', FileText, handleQuickRequestDocuments],
                    ['Add Note', MessageSquarePlus, handleQuickAddWorkflowNote],
                    ['Schedule Signing', CalendarDays, handleQuickScheduleSigning],
                    ['Message Parties', Send, () => setWorkspaceMenu('activity')],
                  ].map(([label, Icon, action]) => (
                    <Button key={label} type="button" variant="secondary" size="sm" className="justify-start" onClick={action}>
                      {createElement(Icon, { size: 14 })}
                      {label}
                    </Button>
                  ))}
                </div>
              </OverviewSidePanel>

              <OverviewSidePanel title="Linked Areas">
                <div className="space-y-2">
                  {[
                    ['Documents', documents.length, 'documents'],
                    ['Finance', financeTypeLabel, 'finance'],
                    ['Transfer', transferStageLabel, 'transfer'],
                    ['Activity', `${activityFeed.length} updates`, 'activity'],
                  ].map(([label, value, target]) => (
                    <button
                      key={label}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2 text-left transition hover:border-primary/30 hover:bg-primarySoft"
                      onClick={() => setWorkspaceMenu(target)}
                    >
                      <span className="text-sm font-semibold text-textStrong">{label}</span>
                      <span className="truncate text-right text-xs font-medium text-textMuted">{value}</span>
                    </button>
                  ))}
                </div>
              </OverviewSidePanel>
            </aside>
          </section>
        ) : null}

        {activeWorkspaceMenu === 'activity' ? (
          <section className="space-y-5">
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="rounded-[16px] border border-borderDefault bg-white shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                <div className="border-b border-borderSoft px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-textStrong">Matter Conversation</h3>
                      <p className="mt-1 text-sm text-textMuted">Human updates, workflow movement, documents, and operational alerts in one place.</p>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {ACTIVITY_FILTER_OPTIONS.map((filter) => (
                        <button
                          key={filter.key}
                          type="button"
                          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                            activityFilter === filter.key
                              ? 'bg-primary text-white shadow-[0_5px_14px_rgba(15,70,110,0.18)]'
                              : 'bg-surfaceAlt text-textMuted hover:bg-primarySoft hover:text-primary'
                          }`}
                          onClick={() => setActivityFilter(filter.key)}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="px-4 py-5">
                  {groupedActivityFeed.map((group) => (
                    <div key={group.label} className="mb-6 last:mb-0">
                      <div className="mb-4 flex items-center gap-3">
                        <span className="h-px flex-1 bg-borderSoft" />
                        <span className="rounded-full border border-borderSoft bg-surfaceAlt px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">
                          {group.label}
                        </span>
                        <span className="h-px flex-1 bg-borderSoft" />
                      </div>

                      <div className="relative space-y-4 before:absolute before:left-[18px] before:top-0 before:h-full before:w-px before:bg-borderSoft">
                        {group.items.map((entry) => {
                          const meta = entry.meta || getActivityCategoryMeta(entry.category)
                          return (
                            <article key={entry.id} className="relative pl-11">
                              <span className={`absolute left-[13px] top-5 z-10 h-2.5 w-2.5 rounded-full ring-4 ring-white ${meta.dot}`} />
                              <div className={`rounded-[15px] border bg-white px-4 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.035)] ${meta.card}`}>
                                <div className="flex items-start gap-3">
                                  <span className={`mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[12px] ring-1 ${meta.icon}`}>
                                    {createElement(meta.Icon, { size: 16 })}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <h4 className="text-sm font-semibold text-textStrong">{entry.title}</h4>
                                        <p className="mt-1 text-xs text-textMuted">
                                          {entry.kind === 'system' ? 'Recorded by' : 'Posted by'} {entry.authorName}
                                          {entry.roleLabel ? ` · ${entry.roleLabel}` : ''}
                                        </p>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-2">
                                        <span className="text-xs text-textMuted">{formatDateTime(entry.createdAt)}</span>
                                        <button type="button" className="ui-icon-button h-7 w-7" aria-label="Activity actions">
                                          <MoreHorizontal size={14} />
                                        </button>
                                      </div>
                                    </div>
                                    <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${entry.kind === 'system' ? 'text-textMuted' : 'text-textBody'}`}>
                                      {entry.body}
                                    </p>
                                    {entry.attachmentName ? (
                                      <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-[10px] border border-borderSoft bg-surfaceAlt px-3 py-2 text-xs font-semibold text-textStrong">
                                        <Paperclip size={13} className="shrink-0 text-textMuted" />
                                        <span className="truncate">{entry.attachmentName}</span>
                                      </div>
                                    ) : null}
                                    <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${meta.badge}`}>
                                      {entry.categoryLabel || meta.label}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  {!filteredActivityFeed.length ? (
                    <div className="rounded-[14px] border border-dashed border-borderDefault bg-surfaceAlt px-4 py-8 text-center">
                      <MessageSquarePlus size={22} className="mx-auto text-textMuted" />
                      <h4 className="mt-3 text-sm font-semibold text-textStrong">No activity matches this filter</h4>
                      <p className="mt-1 text-sm text-textMuted">Updates will appear here as the matter team collaborates.</p>
                    </div>
                  ) : null}
                </div>
              </section>

              <aside className="space-y-4">
                <form onSubmit={handleAddDiscussion} className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                  <h3 className="text-sm font-semibold text-textStrong">Add Update</h3>
                  <div className="mt-4 grid gap-3">
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
                    <label className="grid gap-1.5 text-sm font-medium text-[#35546c]">
                      <span>Visibility</span>
                      <Field as="select" value={discussionVisibility} onChange={(event) => setDiscussionVisibility(event.target.value)}>
                        {DISCUSSION_VISIBILITY_OPTIONS.map((item) => (
                          <option
                            key={item.key}
                            value={item.key}
                            disabled={
                              (item.key === 'internal' && !canPostInternalDiscussion) ||
                              (item.key === 'shared' && !canPostSharedDiscussion) ||
                              (item.key === 'client_visible' && !canPublishClientVisibleDiscussion)
                            }
                          >
                            {item.label}
                          </option>
                        ))}
                      </Field>
                    </label>
                    <Field
                      as="textarea"
                      rows={5}
                      value={discussionBody}
                      onChange={(event) => setDiscussionBody(event.target.value)}
                      placeholder="Share a matter update..."
                    />
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex gap-1">
                        {[
                          ['Attach file', Paperclip],
                          ['Mention person', AtSign],
                          ['Add reaction', Smile],
                        ].map(([label, Icon]) => (
                          <button key={label} type="button" className="ui-icon-button h-8 w-8" aria-label={label} title={label}>
                            {createElement(Icon, { size: 14 })}
                          </button>
                        ))}
                      </div>
                      <Button
                        type="submit"
                        disabled={
                          saving ||
                          !discussionBody.trim() ||
                          (discussionVisibility === 'internal' && !canPostInternalDiscussion) ||
                          (discussionVisibility === 'shared' && !canPostSharedDiscussion) ||
                          (discussionVisibility === 'client_visible' && !canPublishClientVisibleDiscussion)
                        }
                      >
                        <Send size={14} />
                        {saving ? 'Posting...' : 'Post Update'}
                      </Button>
                    </div>
                  </div>
                </form>

                <OverviewSidePanel title="Quick Actions">
                  <div className="grid gap-2">
                    {[
                      ['Request Documents', FileText, handleQuickRequestDocuments],
                      ['Upload Document', Upload, () => setWorkspaceMenu('documents')],
                      ['Schedule Appointment', CalendarDays, handleQuickScheduleSigning],
                      ['Generate Sales Agreement', FileText, openAgentSalesAgreementWorkspace],
                      ['Add Internal Note', MessageSquarePlus, () => {
                        setDiscussionType('internal_note')
                        setDiscussionVisibility('internal')
                      }],
                    ].map(([label, Icon, action]) => (
                      <button
                        key={label}
                        type="button"
                        className="flex items-center justify-between gap-3 rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2 text-left text-sm font-semibold text-textStrong transition hover:border-primary/30 hover:bg-primarySoft hover:text-primary"
                        onClick={action}
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          {createElement(Icon, { size: 14 })}
                          <span className="truncate">{label}</span>
                        </span>
                        <ChevronRight size={14} className="shrink-0" />
                      </button>
                    ))}
                  </div>
                </OverviewSidePanel>

                <OverviewSidePanel title="Matter Health">
                  {(() => {
                    const blockedCount = workflowLanes.filter((lane) => getWorkflowHealthKey(lane) === 'blocked').length
                    const waitingCount = workflowLanes.filter((lane) => getWorkflowHealthKey(lane) === 'waiting').length
                    const delayedCount = workflowLanes.filter((lane) => getWorkflowHealthKey(lane) === 'delayed').length
                    const healthLabel = blockedCount ? 'Blocked' : delayedCount ? 'Delayed' : waitingCount ? 'At Risk' : 'On Track'
                    const healthMeta = healthLabel === 'Blocked'
                      ? WORKFLOW_STATUS_META.blocked
                      : healthLabel === 'Delayed'
                        ? WORKFLOW_STATUS_META.delayed
                        : healthLabel === 'At Risk'
                          ? WORKFLOW_STATUS_META.waiting
                          : WORKFLOW_STATUS_META.in_progress
                    return (
                      <div className="space-y-3">
                        <div className={`rounded-[14px] border px-3 py-3 ${healthMeta.border} ${healthMeta.bg}`}>
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${healthMeta.dot}`} />
                            <strong className={`text-sm ${healthMeta.text}`}>{healthLabel}</strong>
                          </div>
                          <p className="mt-2 text-sm leading-5 text-textMuted">
                            {blockedCount
                              ? `${blockedCount} workflow lane(s) have active blockers.`
                              : delayedCount
                                ? `${delayedCount} workflow lane(s) appear delayed.`
                                : waitingCount
                                  ? `${waitingCount} workflow lane(s) are waiting on a party or document.`
                                  : 'No active workflow blockers are visible right now.'}
                          </p>
                        </div>
                        <Button type="button" variant="secondary" size="sm" className="w-full justify-center" onClick={() => setWorkspaceMenu('overview')}>
                          View Workflows
                        </Button>
                      </div>
                    )
                  })()}
                </OverviewSidePanel>
              </aside>
            </section>
          </section>
        ) : null}

        {activeWorkspaceMenu === 'stakeholders' ? (
          <section className="space-y-5">
            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Roleplayer Handoff</h3>
                  <p className="mt-1 text-secondary text-textMuted">
                    Capture the current transaction team before the buyer onboarding and transfer handoff starts.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-helper font-semibold ${
                    roleplayerForm.attorneyName || roleplayerForm.attorneyEmail || transferAttorney
                      ? 'border-success/30 bg-successSoft text-success'
                      : 'border-warning/30 bg-warningSoft text-warning'
                  }`}>
                    Transfer attorney {roleplayerForm.attorneyName || roleplayerForm.attorneyEmail || transferAttorney ? 'set' : 'missing'}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-helper font-semibold ${
                    !financeRequiresBondSupport
                      ? 'border-borderDefault bg-mutedBg text-textMuted'
                      : roleplayerForm.bondOriginatorName || roleplayerForm.bondOriginatorEmail || assignedBondOriginator
                        ? 'border-success/30 bg-successSoft text-success'
                        : 'border-warning/30 bg-warningSoft text-warning'
                  }`}>
                    {financeRequiresBondSupport ? 'Bond originator' : hasCapturedFinanceType ? 'Cash finance' : 'Finance pending'} {financeRequiresBondSupport ? (roleplayerForm.bondOriginatorName || roleplayerForm.bondOriginatorEmail || assignedBondOriginator ? 'set' : 'missing') : ''}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                {[
                  {
                    title: 'Transfer Attorney',
                    body: 'Selected by the agent or agency before the transfer instruction goes out.',
                    state: roleplayerForm.attorneyName || roleplayerForm.attorneyEmail || transferAttorney ? 'Ready' : 'Needs selection',
                  },
                  {
                    title: 'Bond Originator',
                    body: financeRequiresBondSupport
                      ? 'Capture the originator if the buyer opted into finance support.'
                      : hasCapturedFinanceType
                        ? 'Not required for a cash transaction unless finance support is added later.'
                        : 'Captured after buyer onboarding confirms the finance route.',
                    state: financeRequiresBondSupport
                      ? roleplayerForm.bondOriginatorName || roleplayerForm.bondOriginatorEmail || assignedBondOriginator
                        ? 'Ready'
                        : 'Needs selection'
                      : 'Optional',
                  },
                  {
                    title: 'Bond Attorney',
                    body: 'Usually confirmed by the bank after bond approval or instruction. Invite them once known.',
                    state: bondAttorney ? 'Assigned' : 'Later',
                  },
                  {
                    title: 'Cancellation Attorney',
                    body: transaction?.seller_has_existing_bond ? 'Required because the seller has an existing bond flagged.' : 'Only required when the seller has an existing bond.',
                    state: cancellationAttorney ? 'Assigned' : transaction?.seller_has_existing_bond ? 'Needs selection' : 'Optional',
                  },
                  {
                    title: 'Buyer Intro',
                    body: roleplayerReadiness.introOutdated
                      ? 'Roleplayer details changed after the last buyer intro. Resend the updated introduction.'
                      : latestRoleplayerIntroEvent
                      ? `Last sent ${formatDateTime(latestRoleplayerIntroEvent.createdAt || latestRoleplayerIntroEvent.created_at)}${
                          getActivityEventData(latestRoleplayerIntroEvent).recipientEmail ? ` to ${getActivityEventData(latestRoleplayerIntroEvent).recipientEmail}` : ''
                        }.`
                      : 'Send once roleplayers are confirmed so the buyer knows who will contact them.',
                    state: roleplayerReadiness.introOutdated ? 'Needs resend' : latestRoleplayerIntroEvent ? 'Sent' : 'Not sent',
                  },
                  {
                    title: 'Team Handoff',
                    body: roleplayerReadiness.handoffOutdated
                      ? 'Provider details changed after the last team handoff. Resend the updated context.'
                      : latestRoleplayerHandoffEvent
                      ? `Last sent ${formatDateTime(latestRoleplayerHandoffEvent.createdAt || latestRoleplayerHandoffEvent.created_at)}.`
                      : roleplayerReadiness.teamHandoffBlockers.length
                        ? `${roleplayerReadiness.teamHandoffBlockers.join(' and ')} required before sending.`
                        : 'Send transaction context to the transfer and finance roleplayers.',
                    state: roleplayerReadiness.handoffOutdated ? 'Needs resend' : latestRoleplayerHandoffEvent ? 'Sent' : roleplayerReadiness.canSendTeamHandoff ? 'Ready' : 'Blocked',
                  },
                ].map((item) => (
                  <article key={item.title} className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <strong className="text-body font-semibold text-textStrong">{item.title}</strong>
                      <span className="rounded-full border border-borderDefault bg-surface px-2 py-0.5 text-[0.68rem] font-semibold text-textMuted">
                        {item.state}
                      </span>
                    </div>
                    <p className="mt-2 text-helper leading-5 text-textMuted">{item.body}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Selected Roleplayers</h3>
                  <p className="mt-1 text-secondary text-textMuted">
                    These selections control which partners are activated as the buyer finance and transfer workflow progresses.
                  </p>
                </div>
                {isAgentTransactionView ? (
                  <Button type="button" variant="secondary" onClick={openRoleplayerConfirmation} disabled={!canManageTransactionRoleplayers}>
                    Confirm Roleplayers
                  </Button>
                ) : null}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  { roleType: 'transfer_attorney', label: 'Transfer Attorney', fallback: transferAttorney },
                  { roleType: 'bond_originator', label: 'Bond Originator', fallback: assignedBondOriginator },
                  { roleType: 'bond_attorney', label: 'Bond Attorney', fallback: bondAttorney },
                ].map((entry) => {
                  const saved = transactionRolePlayers.find((item) => item?.roleType === entry.roleType || item?.role_type === entry.roleType)
                  const name =
                    saved?.partnerName ||
                    saved?.partner_name ||
                    saved?.contactPerson ||
                    saved?.contact_person ||
                    entry.fallback?.participantName ||
                    entry.fallback?.participantEmail ||
                    'Not selected'
                  const email = saved?.emailAddress || saved?.email_address || entry.fallback?.participantEmail || ''
                  const status = getRoleplayerStatusLabel(saved?.assignmentStatus || saved?.assignment_status || saved?.status || (entry.fallback ? 'active' : 'selected'))
                  const trigger = getRoleplayerTriggerLabel(saved?.activationTrigger || saved?.activation_trigger, entry.roleType)
                  return (
                    <article key={entry.roleType} className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                      <span className="text-label font-semibold uppercase text-textMuted">{entry.label}</span>
                      <strong className="mt-2 block text-body font-semibold text-textStrong">{name}</strong>
                      {email ? <span className="mt-1 block text-helper text-textMuted">{email}</span> : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full border border-primary/20 bg-primarySoft px-2.5 py-1 text-[0.68rem] font-semibold text-primary">
                          {status}
                        </span>
                        <span className="rounded-full border border-borderDefault bg-surface px-2.5 py-1 text-[0.68rem] font-semibold text-textMuted">
                          {trigger}
                        </span>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>

            <form onSubmit={handleSaveRoleplayerContacts} className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Current Roleplayers</h3>
                  <p className="mt-1 text-secondary text-textMuted">
                    These details update the transaction record and sync into transaction participants for workflow visibility.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={saving || roleplayerIntroBusy || roleplayerHandoffBusy || hydratingDetail}>
                    {saving ? 'Saving…' : hydratingDetail ? 'Refreshing…' : 'Save Roleplayers'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      saving ||
                      roleplayerIntroBusy ||
                      roleplayerHandoffBusy ||
                      hydratingDetail ||
                      !roleplayerReadiness.canSendIntro
                    }
                    onClick={() => void handleSendRoleplayerIntro()}
                  >
                    <Send size={14} />
                    {roleplayerIntroBusy ? 'Sending…' : roleplayerReadiness.introOutdated ? 'Resend Updated Buyer Intro' : latestRoleplayerIntroEvent ? 'Resend Buyer Intro' : 'Send Buyer Intro'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      saving ||
                      roleplayerIntroBusy ||
                      roleplayerHandoffBusy ||
                      hydratingDetail ||
                      !roleplayerReadiness.canSendTeamHandoff
                    }
                    onClick={() => void handleSendRoleplayerHandoff()}
                  >
                    <Send size={14} />
                    {roleplayerHandoffBusy ? 'Sending…' : roleplayerReadiness.handoffOutdated ? 'Resend Updated Team Handoff' : latestRoleplayerHandoffEvent ? 'Resend Team Handoff' : 'Send Team Handoff'}
                  </Button>
                </div>
              </div>

              <section className="mb-5 rounded-control border border-borderSoft bg-surfaceAlt p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-base font-semibold text-textStrong">Handoff Readiness</h4>
                      <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase ${
                        roleplayerReadiness.blockers.length
                          ? 'border-warning/30 bg-warningSoft text-warning'
                          : roleplayerReadiness.introOutdated || roleplayerReadiness.handoffOutdated
                            ? 'border-warning/30 bg-warningSoft text-warning'
                            : latestRoleplayerIntroEvent
                            ? 'border-success/30 bg-successSoft text-success'
                            : 'border-primary/20 bg-primarySoft text-primary'
                      }`}>
                        {roleplayerReadiness.statusLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-helper leading-5 text-textMuted">
                      {roleplayerReadiness.blockers.length
                        ? `${roleplayerReadiness.blockers.length} required item${roleplayerReadiness.blockers.length === 1 ? '' : 's'} still block the buyer intro.`
                        : roleplayerReadiness.introOutdated || roleplayerReadiness.handoffOutdated
                          ? 'Roleplayer details changed after a previous send. Resend the updated handoff emails.'
                        : latestRoleplayerIntroEvent
                          ? 'The buyer has already received the transaction team introduction. Resend it if roleplayers changed.'
                          : 'All required roleplayers are ready for the buyer introduction.'}
                    </p>
                  </div>
                  <div className="min-w-[160px] rounded-[14px] border border-borderDefault bg-surface px-4 py-3">
                    <span className="block text-label font-semibold uppercase text-textMuted">Completion</span>
                    <strong className="mt-1 block text-2xl font-semibold text-textStrong">{roleplayerReadiness.percent}%</strong>
                    <span className="mt-1 block text-helper text-textMuted">
                      {roleplayerReadiness.completedRequired}/{roleplayerReadiness.requiredCount} required ready
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {roleplayerReadiness.items.map((item) => (
                    <article key={item.key} className="rounded-[14px] border border-borderDefault bg-surface px-3 py-3">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.complete ? 'bg-success' : item.required ? 'bg-warning' : 'bg-slate-300'}`} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm font-semibold text-textStrong">{item.label}</strong>
                            <span className="rounded-full border border-borderSoft bg-mutedBg px-2 py-0.5 text-[0.64rem] font-semibold uppercase text-textMuted">
                              {item.required ? 'Required' : 'Recommended'}
                            </span>
                          </div>
                          <p className="mt-1 text-helper leading-5 text-textMuted">{item.description}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {roleplayerReadiness.blockers.length || roleplayerReadiness.teamHandoffBlockers.length || roleplayerReadiness.recommended.length ? (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {roleplayerReadiness.blockers.length ? (
                      <div className="rounded-[14px] border border-warning/30 bg-warningSoft px-3 py-3">
                        <span className="block text-label font-semibold uppercase text-warning">Blocking before send</span>
                        <ul className="mt-2 space-y-1 text-helper leading-5 text-warning">
                          {roleplayerReadiness.blockers.map((item) => (
                            <li key={item.key}>{item.label}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {roleplayerReadiness.teamHandoffBlockers.length ? (
                      <div className="rounded-[14px] border border-warning/30 bg-warningSoft px-3 py-3">
                        <span className="block text-label font-semibold uppercase text-warning">Blocking team handoff</span>
                        <ul className="mt-2 space-y-1 text-helper leading-5 text-warning">
                          {roleplayerReadiness.teamHandoffBlockers.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {roleplayerReadiness.recommended.length ? (
                      <div className="rounded-[14px] border border-borderDefault bg-surface px-3 py-3">
                        <span className="block text-label font-semibold uppercase text-textMuted">Nice to complete</span>
                        <ul className="mt-2 space-y-1 text-helper leading-5 text-textMuted">
                          {roleplayerReadiness.recommended.map((item) => (
                            <li key={item.key}>{item.label}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="rounded-control border border-borderSoft bg-surfaceAlt p-4">
                  <h4 className="text-base font-semibold text-textStrong">Client & Agent Context</h4>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-label font-semibold uppercase text-textMuted">Buyer Name</span>
                      <Field value={roleplayerForm.buyerName} onChange={(event) => updateRoleplayerFormField('buyerName', event.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-label font-semibold uppercase text-textMuted">Buyer Email</span>
                      <Field type="email" value={roleplayerForm.buyerEmail} onChange={(event) => updateRoleplayerFormField('buyerEmail', event.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-label font-semibold uppercase text-textMuted">Seller Name</span>
                      <Field value={roleplayerForm.sellerName} onChange={(event) => updateRoleplayerFormField('sellerName', event.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-label font-semibold uppercase text-textMuted">Seller Email</span>
                      <Field type="email" value={roleplayerForm.sellerEmail} onChange={(event) => updateRoleplayerFormField('sellerEmail', event.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-label font-semibold uppercase text-textMuted">Agent Name</span>
                      <Field value={roleplayerForm.agentName} onChange={(event) => updateRoleplayerFormField('agentName', event.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-label font-semibold uppercase text-textMuted">Agent Email</span>
                      <Field type="email" value={roleplayerForm.agentEmail} onChange={(event) => updateRoleplayerFormField('agentEmail', event.target.value)} />
                    </label>
                  </div>
                </section>

                <section className="rounded-control border border-borderSoft bg-surfaceAlt p-4">
                  <h4 className="text-base font-semibold text-textStrong">Transfer & Finance Team</h4>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-label font-semibold uppercase text-textMuted">Transfer Attorney</span>
                      <Field value={roleplayerForm.attorneyName} onChange={(event) => updateRoleplayerFormField('attorneyName', event.target.value)} placeholder="Firm or contact name" />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-label font-semibold uppercase text-textMuted">Transfer Attorney Email</span>
                      <Field type="email" value={roleplayerForm.attorneyEmail} onChange={(event) => updateRoleplayerFormField('attorneyEmail', event.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-label font-semibold uppercase text-textMuted">Bond Originator</span>
                      <Field value={roleplayerForm.bondOriginatorName} onChange={(event) => updateRoleplayerFormField('bondOriginatorName', event.target.value)} placeholder="Originator or company" />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-label font-semibold uppercase text-textMuted">Bond Originator Email</span>
                      <Field type="email" value={roleplayerForm.bondOriginatorEmail} onChange={(event) => updateRoleplayerFormField('bondOriginatorEmail', event.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1.5 md:col-span-2">
                      <span className="text-label font-semibold uppercase text-textMuted">Matter Owner</span>
                      <Field value={roleplayerForm.matterOwner} onChange={(event) => updateRoleplayerFormField('matterOwner', event.target.value)} placeholder="Primary internal owner or coordinator" />
                    </label>
                  </div>
                </section>
              </div>
            </form>

            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Handoff History</h3>
                  <p className="mt-1 text-secondary text-textMuted">
                    A focused audit trail for buyer introductions and roleplayer handoff emails.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
                  {roleplayerCommunicationHistory.length} send{roleplayerCommunicationHistory.length === 1 ? '' : 's'}
                </span>
              </div>

              {roleplayerCommunicationHistory.length ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {roleplayerCommunicationHistory.map((entry) => (
                    <article key={entry.id} className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <span className="text-label font-semibold uppercase text-textMuted">{entry.type}</span>
                          <strong className="mt-1 block text-body font-semibold text-textStrong">{formatDateTime(entry.sentAt)}</strong>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase ${
                          entry.state === 'Current'
                            ? 'border-success/30 bg-successSoft text-success'
                            : entry.state === 'Needs resend'
                              ? 'border-warning/30 bg-warningSoft text-warning'
                              : 'border-borderDefault bg-mutedBg text-textMuted'
                        }`}>
                          {entry.state}
                        </span>
                      </div>
                      <p className="mt-2 text-helper leading-5 text-textMuted">{entry.summary}</p>
                      {entry.recipients.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {entry.recipients.map((recipient) => (
                            <span key={`${entry.id}-${recipient}`} className="rounded-full border border-borderDefault bg-surface px-2.5 py-1 text-[0.7rem] font-semibold text-textMuted">
                              {recipient}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-control border border-dashed border-borderDefault bg-surfaceAlt px-4 py-4 text-sm text-textMuted">
                  No buyer introductions or team handoffs have been sent yet.
                </div>
              )}
            </section>

            <AttorneyAssignmentSection
              transactionId={transaction?.id}
              financeType={transaction?.finance_type || 'cash'}
              transaction={transaction}
            />

            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <h3 className="text-section-title font-semibold text-textStrong">Legal Role Assignments</h3>
              <p className="mt-1 text-secondary text-textMuted">Transfer attorney is mandatory. Bond and cancellation attorneys are optional and may be different firms.</p>
              <p className="mt-2 rounded-control border border-borderSoft bg-surfaceAlt px-3 py-2 text-helper text-textMuted">
                {legalRoleAssignmentNote}
              </p>
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
                    {entry.item?.participantEmail ? (
                      <small className="mt-1 block text-helper text-textMuted">{entry.item.participantEmail}</small>
                    ) : null}
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

            <section className="grid items-stretch gap-5 xl:grid-cols-2">
              <form onSubmit={handleInviteStakeholder} className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
                <h3 className="text-section-title font-semibold text-textStrong">Invite Stakeholder</h3>
                <p className="mt-1 text-secondary text-textMuted">
                  Invite service providers only. Buyer and seller onboarding is managed separately.
                </p>
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
                          agentPhone: event.target.value === 'agent' ? previous.agentPhone : '',
                          agentAgencyName: event.target.value === 'agent' ? previous.agentAgencyName : '',
                        }))
                      }
                    >
                      {SERVICE_PROVIDER_ROLE_OPTIONS.map((option) => (
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
                  {stakeholderInviteForm.roleType === 'agent' ? (
                    <>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-label font-semibold uppercase text-textMuted">Agent Phone</span>
                        <Field
                          value={stakeholderInviteForm.agentPhone}
                          onChange={(event) =>
                            setStakeholderInviteForm((previous) => ({
                              ...previous,
                              agentPhone: event.target.value,
                            }))
                          }
                          placeholder="+27 82 000 0000"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-label font-semibold uppercase text-textMuted">Agency Name</span>
                        <Field
                          value={stakeholderInviteForm.agentAgencyName}
                          onChange={(event) =>
                            setStakeholderInviteForm((previous) => ({
                              ...previous,
                              agentAgencyName: event.target.value,
                            }))
                          }
                          placeholder="Agency / Brokerage"
                        />
                      </label>
                    </>
                  ) : null}
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

              <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-section-title font-semibold text-textStrong">Stakeholder Contacts</h3>
                    <p className="mt-1 text-secondary text-textMuted">Current invited and linked service providers on this transaction.</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
                    {serviceProviderStakeholders.length} service provider{serviceProviderStakeholders.length === 1 ? '' : 's'}
                  </span>
                </div>

                {serviceProviderStakeholders.length ? (
                  <div className="space-y-2.5">
                    {serviceProviderStakeholders.map((participant) => (
                      <article key={participant.id} className="grid gap-3 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_auto] md:items-center">
                        <div className="min-w-0">
                          <strong className="block truncate text-body font-semibold text-textStrong">
                            {participant.participantName || participant.participantEmail || 'Unassigned'}
                          </strong>
                          <small className="mt-1 block truncate text-helper text-textMuted">
                            {participant.participantEmail || 'No contact email captured'}
                          </small>
                        </div>
                        <div className="min-w-0">
                          <small className="block text-helper text-textMuted">
                            {participant.roleLabel}
                            {participant.roleType === 'attorney' && participant.legalRole ? ` • ${toTitle(participant.legalRole)} role` : ''}
                          </small>
                          <small className="block text-helper text-textMuted">
                            {toTitle(participant.stakeholderStatus || 'active')} • {participant.userId ? 'Linked User' : 'Invitation'}
                            {participant.accessInherited ? ' • Inherited from development' : ''}
                          </small>
                        </div>
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
                    No service providers are currently linked to this transaction.
                  </p>
                )}
              </section>
            </section>

            {stakeholderMessage ? (
              <p className="rounded-control border border-borderDefault bg-surfaceAlt px-4 py-3 text-secondary text-textMuted">
                {stakeholderMessage}
              </p>
            ) : null}
          </section>
        ) : null}

        {activeWorkspaceMenu === 'details' ? (
          <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-section-title font-semibold text-textStrong">Details</h3>
                <p className="mt-1 text-secondary text-textMuted">Open Matter, Buyer, or Seller details in a focused panel.</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => void handlePrintFinalReport()} disabled={saving}>
                <FileText size={14} />
                Export
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {detailRows.map((row) => {
                const section = detailPanelSections[row.key]
                return (
                  <button
                    key={row.key}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3 text-left transition hover:border-borderDefault hover:bg-surface"
                    onClick={() => handleOpenDetailPanel(row.key)}
                  >
                    <div className="min-w-0">
                      <strong className="block text-body font-semibold text-textStrong">{row.title}</strong>
                      <span className="mt-1 block truncate text-helper text-textMuted">{section?.summary || 'Open for details'}</span>
                    </div>
                    <ChevronRight size={16} className="text-textMuted" />
                  </button>
                )
              })}
            </div>
          </section>
        ) : null}
      </div>
      </SharedTransactionShell>

      <WorkflowDetailsDrawer
        lane={activeWorkflowLane}
        open={Boolean(activeWorkflowLane)}
        saving={workflowSaving}
        stepDraft={workflowStepDraft}
        noteDraft={workflowNoteDraft}
        documentDraft={workflowDocumentDraft}
        onClose={() => {
          setWorkflowDrawerLaneKey('')
          setWorkflowStepDraft(null)
          setWorkflowNoteDraft(null)
          setWorkflowDocumentDraft(null)
        }}
        onSelectStepStatus={handleSelectWorkflowStepStatus}
        onStepDraftChange={setWorkflowStepDraft}
        onSubmitStep={handleWorkflowStepSubmit}
        onNoteDraftChange={setWorkflowNoteDraft}
        onSubmitNote={handleWorkflowNoteSubmit}
        onDocumentDraftChange={setWorkflowDocumentDraft}
        onSubmitDocument={handleWorkflowDocumentSubmit}
        onUploadDocument={() => {
          setWorkspaceMenu('documents')
          setWorkflowDrawerLaneKey('')
        }}
        onScheduleSigning={handleQuickScheduleSigning}
      />

      <Modal
        open={detailPanelOpen}
        onClose={() => setDetailPanelOpen(false)}
        title={activeDetailPanel?.title || 'Details'}
        subtitle={activeDetailPanel?.subtitle || ''}
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setDetailPanelOpen(false)}>
              Close
            </Button>
            <Button type="button" onClick={() => void handlePrintFinalReport()} disabled={saving}>
              <FileText size={14} />
              Export
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={() => void handlePrintFinalReport()} disabled={saving}>
              <FileText size={14} />
              Export
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(activeDetailPanel?.items || []).map((item) => (
              <article key={item.label} className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                <span className="text-label font-semibold uppercase text-textMuted">{item.label}</span>
                <strong className="mt-1 block text-body font-semibold text-textStrong">{item.value || 'Not set'}</strong>
              </article>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        open={roleplayerConfirmOpen}
        onClose={onboardingActionBusy ? undefined : () => setRoleplayerConfirmOpen(false)}
        title="Confirm Roleplayers"
        subtitle="Select the trusted roleplayers for this transaction before sending buyer onboarding."
        footer={(
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {!roleplayerConfirmDraft.bondOriginator ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-textMuted underline-offset-4 hover:text-textStrong hover:underline"
                  onClick={() => void handleConfirmRoleplayersAndSendOnboarding({ allowMissingBondOriginator: true })}
                  disabled={onboardingActionBusy}
                >
                  Send without bond originator
                </button>
              ) : null}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setRoleplayerConfirmOpen(false)} disabled={onboardingActionBusy}>
                Cancel
              </Button>
              <Button type="button" variant="secondary" onClick={() => void handleCopyBuyerOnboardingLinkFromConfirmation()} disabled={onboardingActionBusy}>
                <Copy size={14} />
                Copy Link
              </Button>
              <Button type="button" onClick={() => void handleConfirmRoleplayersAndSendOnboarding()} disabled={onboardingActionBusy || partnerOptionsLoading}>
                <Send size={14} />
                {onboardingActionBusy ? 'Preparing...' : 'Confirm & Send Onboarding'}
              </Button>
            </div>
          </div>
        )}
      >
        <div className="space-y-4">
          <p className="rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3 text-secondary text-textMuted">
            The bond originator will only be notified if the buyer selects Bond or Hybrid finance.
          </p>
          {partnerOptionsLoading ? (
            <p className="rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3 text-sm font-semibold text-textMuted">
              Loading scoped partner defaults...
            </p>
          ) : null}
          <div className="grid gap-4">
            <RoleplayerSelect
              label="Transfer Attorney"
              required
              value={roleplayerConfirmDraft.transferAttorney}
              onChange={(value) => updateRoleplayerConfirmDraft('transferAttorney', value)}
              options={transferAttorneyOptions}
              helper="Required. Defaults follow branch, region, organisation, then existing transaction context."
            />
            <RoleplayerSelect
              label="Bond Originator"
              value={roleplayerConfirmDraft.bondOriginator}
              onChange={(value) => updateRoleplayerConfirmDraft('bondOriginator', value)}
              options={bondOriginatorOptions}
              helper="Optional. Activation waits until the buyer chooses Bond or Hybrid finance."
            />
            {!roleplayerConfirmDraft.bondOriginator ? (
              <p className="rounded-[14px] border border-warning/30 bg-warningSoft px-4 py-3 text-sm font-semibold text-warning">
                No bond originator selected. If the buyer chooses bond finance, no originator will be notified automatically.
              </p>
            ) : null}
            <RoleplayerSelect
              label="Bond Attorney"
              value={roleplayerConfirmDraft.bondAttorney}
              onChange={(value) => updateRoleplayerConfirmDraft('bondAttorney', value)}
              options={bondAttorneyOptions}
              helper="Optional. Usually activated after bond approval or bank instruction."
            />
          </div>
          <div className="rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3 text-helper leading-5 text-textMuted">
            Need someone else? Add or invite a partner from <Link to="/partners" className="font-semibold text-primary hover:underline">Partners</Link>, then reopen this confirmation.
          </div>
          {roleplayerConfirmError ? (
            <p className="rounded-[14px] border border-danger/30 bg-dangerSoft px-4 py-3 text-sm font-semibold text-danger">
              {roleplayerConfirmError}
            </p>
          ) : null}
          {onboardingActionMessage ? (
            <p className="rounded-[14px] border border-borderDefault bg-surfaceAlt px-4 py-2.5 text-helper text-textMuted">{onboardingActionMessage}</p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={onboardingModalOpen}
        onClose={onboardingActionBusy ? undefined : () => setOnboardingModalOpen(false)}
        title="Onboarding Links"
        subtitle={
          isPrivateMatter
            ? 'Share onboarding links for both buyer and seller on this private matter.'
            : 'Share the buyer onboarding link for this development matter.'
        }
        footer={(
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => setOnboardingModalOpen(false)} disabled={onboardingActionBusy}>
              Close
            </Button>
          </div>
        )}
      >
        <div className="space-y-5">
          <p className="rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3 text-secondary text-textMuted">
            Choose a recipient below and either copy the onboarding link or send buyer onboarding through Resend.
          </p>
          {onboardingRecipients.map((recipient) => (
            <article key={recipient.key} className="rounded-[16px] border border-borderSoft bg-surfaceAlt px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <strong className="block text-body font-semibold text-textStrong">{recipient.roleLabel}</strong>
                <p className="mt-1 text-secondary text-textBody">{recipient.name}</p>
                <small className="mt-1.5 block text-helper text-textMuted">
                  {recipient.email || 'No contact email captured'} • {recipient.stateLabel}
                </small>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
              </div>
            </article>
          ))}
          {onboardingActionMessage ? (
            <p className="rounded-[14px] border border-borderDefault bg-surfaceAlt px-4 py-2.5 text-helper text-textMuted">{onboardingActionMessage}</p>
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
        open={reviewActionDraft.open}
        onClose={saving ? undefined : () => setReviewActionDraft({ open: false, action: '', document: null, requirement: null, reason: '' })}
        title={
          reviewActionDraft.action === 'approve'
            ? 'Approve Document'
            : reviewActionDraft.action === 'waive'
              ? 'Waive Requirement'
              : 'Reject Document'
        }
        subtitle={reviewActionDraft.requirement?.label || reviewActionDraft.requirement?.key || reviewActionDraft.document?.name || ''}
        footer={(
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReviewActionDraft({ open: false, action: '', document: null, requirement: null, reason: '' })}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={reviewActionDraft.action === 'reject' ? 'bg-danger text-textInverse hover:brightness-95' : ''}
              onClick={() => void handleSubmitReviewAction()}
              disabled={saving || (['reject', 'waive'].includes(reviewActionDraft.action) && !reviewActionDraft.reason.trim())}
            >
              {saving
                ? 'Saving…'
                : reviewActionDraft.action === 'approve'
                  ? 'Approve'
                  : reviewActionDraft.action === 'waive'
                    ? 'Waive'
                    : 'Reject'}
            </Button>
          </div>
        )}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-label font-semibold uppercase text-textMuted">
            {reviewActionDraft.action === 'approve' ? 'Review note (optional)' : 'Reason (required)'}
          </span>
          <Field
            as="textarea"
            rows={4}
            value={reviewActionDraft.reason}
            onChange={(event) => setReviewActionDraft((previous) => ({ ...previous, reason: event.target.value }))}
            placeholder={
              reviewActionDraft.action === 'approve'
                ? 'Add an optional note for the approval event...'
                : 'Add the reason that should appear on the document card...'
            }
          />
        </label>
      </Modal>

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
