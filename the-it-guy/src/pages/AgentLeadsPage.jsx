import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Home,
  Mail,
  MessageSquarePlus,
  MoreVertical,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Tag,
  UserRound,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import { useWorkspace } from '../context/WorkspaceContext'
import { createAgencyCrmLeadTask } from '../lib/agencyCrmRepository'
import {
  fetchAgentLeadWorkspace,
  filterAgentLeadRows,
  getLeadFilterOptions,
  listAgentLeadWorkspaceRows,
} from '../services/agentLeadWorkspaceService'
import {
  dismissLeadListingInterest,
  listSearchablePrivateListings,
  markLeadListingInterestSent,
  markLeadListingInterestViewed,
  scheduleViewingFromLeadListingInterest,
  updateLeadListingInterestNotes,
  updateLeadListingInterestStatus,
  upsertLeadListingInterest,
} from '../services/leadListingInterestService'
import {
  activateLeadRequirement,
  archiveLeadRequirement,
  buildRequirementFromLeadFallback,
  buildRequirementSummary,
  createLeadRequirement,
  LEAD_REQUIREMENT_FINANCE_STATUSES,
  LEAD_REQUIREMENT_INTENT_TYPES,
  LEAD_REQUIREMENT_STATUSES,
  LEAD_REQUIREMENT_TIMELINES,
  LEAD_REQUIREMENT_URGENCIES,
  pauseLeadRequirement,
  setPrimaryLeadRequirement,
  updateLeadRequirement,
} from '../services/leadRequirementService'
import {
  addMatchesToLead,
  findListingsForRequirement,
} from '../services/leadMatchingService'
import {
  assignLeadToAgent,
  assignLeadToQueue,
  autoAssignLead,
  canManageLeadAssignment,
  LEAD_ASSIGNMENT_QUEUES,
  markLeadFirstContacted,
} from '../services/leadAssignmentService'
import {
  filterCommunicationTimeline,
  LEAD_COMMUNICATION_DIRECTIONS,
  LEAD_COMMUNICATION_TYPES,
  logCall,
  logEmail,
  logMeeting,
  logNote,
  logWhatsApp,
} from '../services/leadCommunicationService'
import {
  createLeadSavedSearch,
  disableLeadSavedSearch,
  enableLeadSavedSearch,
  previewPropertyMessage,
  sendListingToLead,
  updateLeadSavedSearch,
} from '../services/leadPropertySharingService'
import {
  buildDefaultLeadCommunicationPreferences,
  normalizeLeadCommunicationPreferences,
} from '../services/communicationDeliveryService'
import { listLeadCommunicationTemplates } from '../services/leadCommunicationTemplateService'
import { buildLeadWorkspaceAnalyticsSummary } from '../services/leadAnalyticsService'
import {
  acceptRecommendation,
  completeRecommendation,
  convertRecommendationToTask,
  dismissRecommendation as dismissLeadRecommendation,
  getRecommendationMetrics,
} from '../services/leadRecommendationService'
import {
  acceptSuggestion,
  generateSuggestionsForLead,
  rejectSuggestion,
} from '../services/leadSuggestionService'

const pageShell = 'mx-auto flex w-full max-w-[1480px] flex-col gap-5'
const panelClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LEAD_CATEGORY_FILTERS = [
  { key: 'all', label: 'All Leads' },
  { key: 'buyer', label: 'Buyer Leads' },
  { key: 'seller', label: 'Seller Leads' },
  { key: 'other', label: 'Other' },
]

function normalizeText(value) {
  return String(value ?? '').trim()
}

function formatDate(value, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(value, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatRelativeTime(value, fallback = '—') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  const diffMs = Date.now() - date.getTime()
  const future = diffMs < 0
  const absMs = Math.abs(diffMs)
  const minutes = Math.round(absMs / 60_000)
  if (minutes < 1) return future ? 'Soon' : 'Just now'
  if (minutes < 60) return future ? `in ${minutes} min` : `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return future ? `in ${hours} hour${hours === 1 ? '' : 's'}` : `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 14) return future ? `in ${days} day${days === 1 ? '' : 's'}` : `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(value)
}

function formatCurrency(value) {
  const number = Number(value || 0)
  if (!number) return '—'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(number)
}

function formatDuration(seconds) {
  const total = Number(seconds || 0)
  if (!total) return ''
  const minutes = Math.round(total / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function parseListInput(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  return normalizeText(value).split(/[,;\n]/).map(normalizeText).filter(Boolean)
}

function listToInput(value) {
  return Array.isArray(value) ? value.join(', ') : normalizeText(value)
}

function formatList(value) {
  const items = parseListInput(value)
  return items.length ? items.join(', ') : '—'
}

function isEnquiryActivity(activity = {}) {
  const haystack = `${activity.activityType || activity.activity_type || ''} ${activity.activityNote || activity.activity_note || ''}`.toLowerCase()
  return haystack.includes('enquiry') || haystack.includes('inquiry')
}

function getLeadSourceInfo(row = {}) {
  const enquiryActivities = (Array.isArray(row.activities) ? row.activities : []).filter(isEnquiryActivity)
  const firstActivity = enquiryActivities[enquiryActivities.length - 1] || null
  const latestActivity = enquiryActivities[0] || null
  const sourceFromType = (activity) => normalizeText(activity?.activityType || activity?.activity_type).replace(/enquiry received/i, '').trim()
  return {
    leadSource: row.source || row.leadSource || row.lead_source || 'Unknown',
    originalSource: sourceFromType(firstActivity) || row.source || 'Unknown',
    firstSource: sourceFromType(firstActivity) || row.source || 'Unknown',
    latestSource: sourceFromType(latestActivity) || row.source || 'Unknown',
    enquiryActivities,
  }
}

function makeRequirementDraft(requirement = null, lead = null) {
  const source = requirement || buildRequirementFromLeadFallback(lead || {})
  return {
    title: source.title || '',
    intentType: source.intentType || 'buy',
    propertyCategory: source.propertyCategory || '',
    propertyTypes: listToInput(source.propertyTypes),
    areas: listToInput(source.areas),
    suburbs: listToInput(source.suburbs),
    city: source.city || '',
    province: source.province || '',
    budgetMin: source.budgetMin ?? '',
    budgetMax: source.budgetMax ?? '',
    bedroomsMin: source.bedroomsMin ?? '',
    bathroomsMin: source.bathroomsMin ?? '',
    garagesMin: source.garagesMin ?? '',
    parkingMin: source.parkingMin ?? '',
    erfSizeMin: source.erfSizeMin ?? '',
    floorSizeMin: source.floorSizeMin ?? '',
    mustHaves: listToInput(source.mustHaves),
    niceToHaves: listToInput(source.niceToHaves),
    dealBreakers: listToInput(source.dealBreakers),
    financeStatus: source.financeStatus || 'unknown',
    financeType: source.financeType || '',
    preApproved: source.preApproved === null || source.preApproved === undefined ? '' : String(Boolean(source.preApproved)),
    depositAvailable: source.depositAvailable === null || source.depositAvailable === undefined ? '' : String(Boolean(source.depositAvailable)),
    timeline: source.timeline || '',
    urgency: source.urgency || '',
    communicationPreference: source.communicationPreference || '',
    consentToReceiveMatches: Boolean(source.consentToReceiveMatches),
    notes: source.notes || '',
    status: source.status || 'active',
    isPrimary: Boolean(source.isPrimary),
  }
}

function draftToRequirementPayload(draft = {}, lead = {}, organisationId = '', actor = {}) {
  return {
    organisationId,
    lead,
    leadId: lead.leadId,
    contactId: lead.contactId,
    title: draft.title,
    intentType: draft.intentType || 'buy',
    propertyCategory: draft.propertyCategory,
    propertyTypes: parseListInput(draft.propertyTypes),
    areas: parseListInput(draft.areas),
    suburbs: parseListInput(draft.suburbs),
    city: draft.city,
    province: draft.province,
    budgetMin: draft.budgetMin,
    budgetMax: draft.budgetMax,
    bedroomsMin: draft.bedroomsMin,
    bathroomsMin: draft.bathroomsMin,
    garagesMin: draft.garagesMin,
    parkingMin: draft.parkingMin,
    erfSizeMin: draft.erfSizeMin,
    floorSizeMin: draft.floorSizeMin,
    mustHaves: parseListInput(draft.mustHaves),
    niceToHaves: parseListInput(draft.niceToHaves),
    dealBreakers: parseListInput(draft.dealBreakers),
    financeStatus: draft.financeStatus || 'unknown',
    financeType: draft.financeType,
    preApproved: draft.preApproved,
    depositAvailable: draft.depositAvailable,
    timeline: draft.timeline,
    urgency: draft.urgency,
    communicationPreference: draft.communicationPreference,
    consentToReceiveMatches: draft.consentToReceiveMatches,
    notes: draft.notes,
    status: draft.status || 'active',
    isPrimary: draft.isPrimary,
    createdBy: actor?.id,
  }
}

function makeSavedSearchDraft(savedSearch = null, requirement = null) {
  return {
    savedSearchId: savedSearch?.savedSearchId || '',
    searchName: savedSearch?.searchName || (requirement ? buildRequirementSummary(requirement) : ''),
    requirementId: savedSearch?.requirementId || requirement?.requirementId || '',
    active: savedSearch ? Boolean(savedSearch.active) : true,
    consentGiven: savedSearch ? Boolean(savedSearch.consentGiven) : Boolean(requirement?.consentToReceiveMatches),
    emailEnabled: savedSearch ? Boolean(savedSearch.emailEnabled) : true,
    whatsappEnabled: savedSearch ? Boolean(savedSearch.whatsappEnabled) : false,
    frequency: savedSearch?.frequency || 'manual_only',
  }
}

function savedSearchPayloadFromDraft(draft = {}, lead = {}, organisationId = '') {
  return {
    organisationId,
    lead,
    leadId: lead.leadId,
    requirementId: draft.requirementId,
    searchName: draft.searchName || 'Saved Search',
    active: draft.active,
    consentGiven: draft.consentGiven,
    emailEnabled: draft.emailEnabled,
    whatsappEnabled: draft.whatsappEnabled,
    frequency: draft.frequency || 'manual_only',
  }
}

function getOrganisationId(workspaceContext = {}) {
  return normalizeText(workspaceContext.currentWorkspace?.id || workspaceContext.workspace?.id)
}

function getActor(profile = {}) {
  return {
    id: normalizeText(profile?.id || profile?.user_id || profile?.email),
    userId: normalizeText(profile?.id || profile?.user_id || profile?.email),
    email: normalizeText(profile?.email).toLowerCase(),
    name: normalizeText(profile?.fullName || profile?.full_name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')),
    fullName: normalizeText(profile?.fullName || profile?.full_name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')),
    role: normalizeText(profile?.role || profile?.workspaceRole || profile?.workspace_role || profile?.organisationRole || profile?.organisation_role),
    workspaceRole: normalizeText(profile?.workspaceRole || profile?.workspace_role || profile?.organisationRole || profile?.organisation_role || profile?.role),
  }
}

function StatusPill({ children, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-rose-50 text-rose-700',
  }
  return <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold ${tones[tone] || tones.slate}`}>{children}</span>
}

function getStageTone(stage = '') {
  const normalized = stage.toLowerCase()
  if (normalized.includes('lost')) return 'red'
  if (normalized.includes('converted') || normalized.includes('accepted') || normalized.includes('registered')) return 'green'
  if (normalized.includes('offer') || normalized.includes('viewing') || normalized.includes('appointment')) return 'amber'
  if (normalized.includes('new') || normalized.includes('contacted') || normalized.includes('qualified')) return 'blue'
  return 'slate'
}

function getSlaTone(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized === 'escalated' || normalized === 'overdue') return 'red'
  if (normalized === 'due_soon') return 'amber'
  if (normalized === 'contacted' || normalized === 'on_track') return 'green'
  if (normalized === 'awaiting_assignment') return 'blue'
  return 'slate'
}

function formatSlaStatus(status = '') {
  return normalizeText(status).replace(/_/g, ' ') || 'Unknown'
}

function normalizeLeadCategory(row = {}) {
  const raw = normalizeText(row.leadCategory || row.lead_category || row.leadDirection || row.lead_direction || row.type).toLowerCase()
  if (raw.includes('seller') || raw.includes('vendor') || raw.includes('landlord')) return 'seller'
  if (raw.includes('buyer') || raw.includes('purchaser')) return 'buyer'
  return 'other'
}

function getLeadCategoryLabel(row = {}) {
  const category = normalizeLeadCategory(row)
  if (category === 'seller') return 'Seller Lead'
  if (category === 'buyer') return 'Buyer Lead'
  return 'Other Lead'
}

function getLeadCategoryTone(row = {}) {
  const category = normalizeLeadCategory(row)
  if (category === 'seller') return 'green'
  if (category === 'buyer') return 'blue'
  return 'slate'
}

function isUuidLike(value = '') {
  return UUID_PATTERN.test(normalizeText(value))
}

function getOwnerName(row = {}) {
  const owner = normalizeText(row.assignedAgentName || row.assigned_agent_name || row.assignedAgent || row.assigned_agent)
  if (!owner || isUuidLike(owner)) return 'Unassigned'
  if (owner.includes('@')) return owner.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  return owner
}

function getLeadContextSummary(row = {}) {
  const category = normalizeLeadCategory(row)
  if (category === 'seller') {
    return normalizeText(
      row.sellerPropertyAddress ||
      row.seller_property_address ||
      row.propertyAddress ||
      row.property_address ||
      row.listings?.[0]?.title ||
      row.listings?.[0]?.address,
    ) || 'Property Not Linked'
  }
  if (category === 'buyer') {
    return normalizeText(row.requirementSummary) ||
      normalizeText(row.propertyInterest || row.property_interest) ||
      normalizeText(row.areaInterest || row.area_interest) ||
      ''
  }
  return normalizeText(row.propertyInterest || row.property_interest || row.areaInterest || row.area_interest)
}

function getLatestActivityDate(activity = {}) {
  return activity?.activityDate || activity?.activity_date || activity?.occurredAt || activity?.occurred_at || activity?.createdAt || activity?.created_at || ''
}

function getLatestActivityTitle(row = {}) {
  return normalizeText(row.latestActivity?.activityType || row.latestActivity?.activity_type) || 'No activity'
}

function getNextAction(row = {}) {
  const activeRecommendation = (Array.isArray(row.recommendations) ? row.recommendations : []).find((item) => ['pending', 'accepted'].includes(String(item.status || '').toLowerCase()))
  if (activeRecommendation?.title) return activeRecommendation.title
  if (row.nextTask?.title) return row.nextTask.title
  const category = normalizeLeadCategory(row)
  const stage = normalizeText(row.stage).toLowerCase()
  if (category === 'seller') {
    if (!row.listingCount) return 'Link Property'
    if (stage.includes('mandate')) return 'Check Mandate Signature'
    if (stage.includes('listing')) return 'Activate Listing'
    return 'Contact Seller'
  }
  if (row.appointmentCount) return 'Follow Up Viewing'
  if ((row.suggestions || []).length) return 'Review Matches'
  return category === 'buyer' ? 'Contact Buyer' : 'Contact Lead'
}

function getLifecycleItems(row = {}) {
  return [
    { key: 'L', label: 'Listing', active: Number(row.listingCount || 0) > 0 },
    { key: 'V', label: 'Viewing', active: Number(row.appointmentCount || 0) > 0 },
    { key: 'O', label: 'Offer', active: Number(row.offerCount || 0) > 0 },
    { key: 'T', label: 'Transaction', active: Number(row.transactionCount || 0) > 0 || Boolean(row.convertedTransactionId) },
  ]
}

function EmptyState({ title, copy }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{copy}</p>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-slate-900">{value || '—'}</dd>
    </div>
  )
}

function deliveryTone(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized === 'delivered' || normalized === 'sent') return 'green'
  if (normalized === 'failed') return 'red'
  if (normalized === 'queued' || normalized === 'prepared' || normalized === 'pending') return 'amber'
  return 'slate'
}

function CommunicationHealthCard({ lead }) {
  const preferences = normalizeLeadCommunicationPreferences(
    lead?.communicationPreferences ||
    buildDefaultLeadCommunicationPreferences({ organisationId: lead?.organisationId || lead?.organisation_id, leadId: lead?.leadId }),
  )
  const deliveries = Array.isArray(lead?.communicationDeliveries) ? lead.communicationDeliveries : []
  const latestDelivery = deliveries[0] || null
  const latestSuccess = deliveries.find((delivery) => ['delivered', 'sent'].includes(normalizeText(delivery.status).toLowerCase())) || null
  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Communication Status</h3>
          <p className="mt-1 text-xs text-slate-500">Buyer channel preferences and latest delivery health.</p>
        </div>
        <StatusPill tone={preferences.propertyAlertsEnabled ? 'green' : 'amber'}>{preferences.propertyAlertsEnabled ? 'Alerts enabled' : 'Alerts paused'}</StatusPill>
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Preferred Channel" value={preferences.preferredChannel} />
        <Field label="Email Enabled" value={preferences.emailEnabled ? 'Yes' : 'No'} />
        <Field label="WhatsApp Enabled" value={preferences.whatsappEnabled ? 'Yes' : 'No'} />
        <Field label="Property Alerts" value={preferences.propertyAlertsEnabled ? 'Yes' : 'No'} />
        <Field label="Last Communication" value={latestDelivery ? formatDateTime(latestDelivery.createdAt || latestDelivery.preparedAt) : 'None yet'} />
        <Field label="Last Successful Delivery" value={latestSuccess ? formatDateTime(latestSuccess.deliveredAt || latestSuccess.sentAt || latestSuccess.createdAt) : 'None yet'} />
      </dl>
    </section>
  )
}

function Metric({ label, value, icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</span>
        {icon ? createElement(icon, { size: 16, className: 'text-slate-500' }) : null}
      </div>
      <strong className="mt-3 block text-2xl font-semibold tracking-[-0.04em] text-slate-950">{value}</strong>
    </div>
  )
}

function CompactMetric({ label, value, icon }) {
  return (
    <div className="flex min-h-14 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
      {icon ? createElement(icon, { size: 15, className: 'shrink-0 text-slate-400' }) : null}
      <strong className="text-lg font-semibold tracking-[-0.03em] text-slate-950">{value}</strong>
      <span className="truncate text-sm font-semibold text-slate-600">{label}</span>
    </div>
  )
}

function RecommendationSummaryCard({ pendingCount = 0, urgentCount = 0, dueTodayCount = 0, overdueCount = 0 }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50 px-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-950">Recommended Actions</p>
        <p className="mt-0.5 text-xs font-medium text-amber-800">{pendingCount} actions pending</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-amber-800">
        <span title="Urgent" className="rounded-full bg-white px-2 py-1">{urgentCount} urgent</span>
        <span title="Due today" className="hidden rounded-full bg-white px-2 py-1 sm:inline-flex">{dueTodayCount} today</span>
        <span title="Overdue" className="rounded-full bg-white px-2 py-1">{overdueCount} overdue</span>
      </div>
    </div>
  )
}

function ContactLines({ row }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
      <span className="inline-flex items-center gap-1"><Phone size={12} />{row.phone || 'No phone'}</span>
      <span className="inline-flex items-center gap-1"><Mail size={12} />{row.email || 'No email'}</span>
    </div>
  )
}

function LeadIdentityBlock({ row, onOpen }) {
  const context = getLeadContextSummary(row)
  return (
    <button type="button" onClick={onOpen} className="group min-w-0 text-left">
      <span className="block truncate text-sm font-semibold text-slate-950 group-hover:text-blue-700">{row.name}</span>
      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500">
        <span className="truncate">{row.phone || 'No phone'}</span>
        {row.email ? <span className="max-w-[180px] truncate">{row.email}</span> : null}
      </span>
      <span className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
        <StatusPill tone={getLeadCategoryTone(row)}>{getLeadCategoryLabel(row)}</StatusPill>
        <span className="max-w-[180px] truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{row.source || 'Unknown'}</span>
      </span>
      {context ? <span className="mt-2 block max-w-[260px] truncate text-xs font-semibold text-slate-500">{context}</span> : null}
    </button>
  )
}

function LifecycleIndicator({ row }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Lifecycle links">
      {getLifecycleItems(row).map((item) => (
        <span
          key={item.key}
          title={`${item.label}: ${item.active ? 'linked' : 'not linked'}`}
          className={`inline-flex h-7 min-w-7 items-center justify-center rounded-lg border px-1.5 text-xs font-bold ${item.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}
        >
          {item.key} {item.active ? '✓' : '—'}
        </span>
      ))}
    </div>
  )
}

function RowActionMenu({ row, onOpen }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={onOpen} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700">
        Open <ExternalLink size={13} />
      </button>
      <details className="relative">
        <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" aria-label={`More actions for ${row.name}`}>
          <MoreVertical size={16} />
        </summary>
        <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1 text-sm font-semibold text-slate-700 shadow-lg">
          {['Assign', 'Reassign', 'Archive', 'Convert'].map((label) => (
            <button key={label} type="button" onClick={onOpen} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">{label}</button>
          ))}
        </div>
      </details>
    </div>
  )
}

function LeadCategoryFilter({ filters, rows, onChange }) {
  const counts = rows.reduce((accumulator, row) => {
    const category = normalizeLeadCategory(row)
    accumulator.all += 1
    accumulator[category] = (accumulator[category] || 0) + 1
    return accumulator
  }, { all: 0, buyer: 0, seller: 0, other: 0 })
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Lead category quick filters">
      {LEAD_CATEGORY_FILTERS.map((option) => {
        const active = filters.category === option.key
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange((previous) => ({ ...previous, category: option.key }))}
            className={`inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-sm font-semibold ${active ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {option.label}
            <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>{counts[option.key] || 0}</span>
          </button>
        )
      })}
    </div>
  )
}

function EmptyLeadResults({ onCreate, onImport, onAdjustFilters }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
      <p className="text-sm font-semibold text-slate-900">No leads found</p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">Create a lead, review imported enquiries, or loosen the current filters.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onCreate} className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">Create Lead</button>
        <button type="button" onClick={onImport} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Import Lead</button>
        <button type="button" onClick={onAdjustFilters} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Adjust Filters</button>
      </div>
    </div>
  )
}

function RequirementForm({ organisationId, lead, actor, requirement = null, onCancel, onSaved }) {
  const [draft, setDraft] = useState(() => makeRequirementDraft(requirement, lead))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateField(field, value) {
    setDraft((previous) => ({ ...previous, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    try {
      setSaving(true)
      setError('')
      const payload = draftToRequirementPayload(draft, lead, organisationId, actor)
      if (requirement?.requirementId) {
        await updateLeadRequirement({ requirementId: requirement.requirementId, updates: payload }, { actor })
      } else {
        await createLeadRequirement(payload, { actor })
      }
      await onSaved()
      onCancel()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save requirement.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input value={draft.title} onChange={(event) => updateField('title', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Title" />
        <select value={draft.intentType} onChange={(event) => updateField('intentType', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          {LEAD_REQUIREMENT_INTENT_TYPES.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
        </select>
        <input value={draft.propertyCategory} onChange={(event) => updateField('propertyCategory', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Property category" />
        <input value={draft.propertyTypes} onChange={(event) => updateField('propertyTypes', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Property types" />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input value={draft.areas} onChange={(event) => updateField('areas', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Areas" />
        <input value={draft.suburbs} onChange={(event) => updateField('suburbs', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Suburbs" />
        <input value={draft.city} onChange={(event) => updateField('city', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="City" />
        <input value={draft.province} onChange={(event) => updateField('province', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Province" />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input value={draft.budgetMin} onChange={(event) => updateField('budgetMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Budget min" />
        <input value={draft.budgetMax} onChange={(event) => updateField('budgetMax', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Budget max" />
        <input value={draft.bedroomsMin} onChange={(event) => updateField('bedroomsMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Bedrooms min" />
        <input value={draft.bathroomsMin} onChange={(event) => updateField('bathroomsMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Bathrooms min" />
        <input value={draft.garagesMin} onChange={(event) => updateField('garagesMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Garages min" />
        <input value={draft.parkingMin} onChange={(event) => updateField('parkingMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Parking min" />
        <input value={draft.erfSizeMin} onChange={(event) => updateField('erfSizeMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Erf size min" />
        <input value={draft.floorSizeMin} onChange={(event) => updateField('floorSizeMin', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Floor size min" />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <input value={draft.mustHaves} onChange={(event) => updateField('mustHaves', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Must-haves" />
        <input value={draft.niceToHaves} onChange={(event) => updateField('niceToHaves', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Nice-to-haves" />
        <input value={draft.dealBreakers} onChange={(event) => updateField('dealBreakers', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Deal-breakers" />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <select value={draft.financeStatus} onChange={(event) => updateField('financeStatus', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          {LEAD_REQUIREMENT_FINANCE_STATUSES.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
        </select>
        <input value={draft.financeType} onChange={(event) => updateField('financeType', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Finance type" />
        <select value={draft.preApproved} onChange={(event) => updateField('preApproved', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="">Pre-approved unknown</option>
          <option value="true">Pre-approved</option>
          <option value="false">Not pre-approved</option>
        </select>
        <select value={draft.depositAvailable} onChange={(event) => updateField('depositAvailable', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="">Deposit unknown</option>
          <option value="true">Deposit available</option>
          <option value="false">No deposit captured</option>
        </select>
        <select value={draft.timeline} onChange={(event) => updateField('timeline', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="">Timeline unknown</option>
          {LEAD_REQUIREMENT_TIMELINES.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={draft.urgency} onChange={(event) => updateField('urgency', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="">Urgency unknown</option>
          {LEAD_REQUIREMENT_URGENCIES.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <input value={draft.communicationPreference} onChange={(event) => updateField('communicationPreference', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Communication preference" />
        <select value={draft.status} onChange={(event) => updateField('status', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          {LEAD_REQUIREMENT_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
        <textarea value={draft.notes} onChange={(event) => updateField('notes', event.target.value)} className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Notes" />
        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={draft.consentToReceiveMatches} onChange={(event) => updateField('consentToReceiveMatches', event.target.checked)} />
          Consent to matches
        </label>
        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={draft.isPrimary} onChange={(event) => updateField('isPrimary', event.target.checked)} />
          Primary
        </label>
      </div>

      {error ? <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Cancel</button>
        <button type="submit" disabled={saving} className="min-h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">{saving ? 'Saving...' : 'Save Requirement'}</button>
      </div>
    </form>
  )
}

function MatchReasonList({ reasons = [] }) {
  const visibleReasons = Array.isArray(reasons) ? reasons.slice(0, 5) : []
  if (!visibleReasons.length) return <p className="text-xs text-slate-500">No scoring reasons available.</p>
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {visibleReasons.map((reason, index) => {
        const type = reason?.type || 'match'
        const text = typeof reason === 'string' ? reason : reason?.text
        const tone = type === 'match'
          ? 'bg-emerald-50 text-emerald-700'
          : type === 'missing'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-rose-50 text-rose-700'
        return <span key={`match-reason-${index}`} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{text}</span>
      })}
    </div>
  )
}

function RequirementMatchPanel({ organisationId, lead, requirement, actor, onSaved }) {
  const [loading, setLoading] = useState(true)
  const [matches, setMatches] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadMatches = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const result = await findListingsForRequirement({ organisationId, requirementId: requirement.requirementId })
      setMatches(result.matches || [])
    } catch (loadError) {
      setMatches([])
      setError(loadError?.message || 'Unable to find matches.')
    } finally {
      setLoading(false)
    }
  }, [organisationId, requirement.requirementId])

  useEffect(() => {
    void loadMatches()
  }, [loadMatches])

  function toggleListing(listingId) {
    setSelectedIds((previous) => previous.includes(listingId)
      ? previous.filter((id) => id !== listingId)
      : [...previous, listingId])
  }

  async function addSelected() {
    try {
      setSaving(true)
      setError('')
      const saved = await addMatchesToLead(
        {
          organisationId,
          leadId: lead.leadId,
          requirementId: requirement.requirementId,
          listingIds: selectedIds,
        },
        { actor },
      )
      setMessage(`${saved.length} listing${saved.length === 1 ? '' : 's'} added to Interested Listings.`)
      setSelectedIds([])
      await onSaved()
      await loadMatches()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to add selected matches.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-950">Matching Listings</h4>
          <p className="mt-1 text-sm text-slate-500">Deterministic scoring from existing private listings. Agents choose what gets linked.</p>
        </div>
        <button type="button" onClick={addSelected} disabled={saving || !selectedIds.length} className="min-h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
          {saving ? 'Adding...' : `Add Selected (${selectedIds.length})`}
        </button>
      </div>
      {message ? <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {loading ? <LoadingSkeleton lines={5} className="mt-4 rounded-2xl border border-slate-200 bg-white" /> : null}
      {!loading ? (
        <div className="mt-4 grid gap-3">
          {matches.length ? matches.map((match) => {
            const selected = selectedIds.includes(match.id)
            const hasMissingData = match.matchReasons?.some((reason) => reason?.type === 'missing')
            return (
              <article key={match.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${selected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`}>
                <div className="grid gap-4 lg:grid-cols-[auto_120px_1fr_auto] lg:items-start">
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={selected} onChange={() => toggleListing(match.id)} />
                    Select
                  </label>
                  <div className="flex h-24 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-slate-400">
                    {match.imageUrl ? <img src={match.imageUrl} alt="" className="h-full w-full object-cover" /> : <Home size={22} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h5 className="truncate text-sm font-semibold text-slate-950">{match.title || 'Untitled listing'}</h5>
                      {match.alreadyLinked ? <StatusPill tone="amber">Already linked</StatusPill> : null}
                      {hasMissingData ? <StatusPill tone="amber">Missing data</StatusPill> : null}
                      <StatusPill>{match.status || 'Status unknown'}</StatusPill>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{[match.address, match.suburb, match.city].filter(Boolean).join(', ') || 'Address pending'}</p>
                    <p className="mt-2 text-sm font-semibold text-blue-700">{formatCurrency(match.price)}</p>
                    <ListingSpecs listing={match} />
                    <MatchReasonList reasons={match.matchReasons} />
                    {match.id ? <Link to={`/agent/listings/${match.id}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">Open listing <ExternalLink size={13} /></Link> : null}
                  </div>
                  <div className="rounded-2xl bg-slate-900 px-4 py-3 text-center text-white">
                    <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-300">Score</span>
                    <strong className="mt-1 block text-2xl font-semibold">{match.matchScore}</strong>
                  </div>
                </div>
              </article>
            )
          }) : <EmptyState title="No listing matches found" copy="Create or activate listings with price, location, and property details before matching this requirement." />}
        </div>
      ) : null}
    </section>
  )
}

function RequirementCard({ requirement, lead, organisationId, actor, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [showMatches, setShowMatches] = useState(false)
  const [working, setWorking] = useState('')
  const summary = buildRequirementSummary(requirement)

  async function runAction(action) {
    try {
      setWorking(action)
      if (action === 'primary') await setPrimaryLeadRequirement({ leadId: lead.leadId, requirementId: requirement.requirementId }, { actor })
      if (action === 'pause') await pauseLeadRequirement({ requirementId: requirement.requirementId }, { actor })
      if (action === 'archive') await archiveLeadRequirement({ requirementId: requirement.requirementId }, { actor })
      if (action === 'activate') await activateLeadRequirement({ requirementId: requirement.requirementId }, { actor })
      await onSaved()
    } finally {
      setWorking('')
    }
  }

  if (editing) {
    return <RequirementForm organisationId={organisationId} lead={lead} actor={actor} requirement={requirement} onCancel={() => setEditing(false)} onSaved={onSaved} />
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">{requirement.title || summary}</h3>
            {requirement.isPrimary ? <StatusPill tone="green">Primary</StatusPill> : null}
            <StatusPill tone={requirement.status === 'active' ? 'blue' : 'slate'}>{requirement.status}</StatusPill>
            <StatusPill>{requirement.intentType}</StatusPill>
          </div>
          <p className="mt-2 text-sm font-semibold text-blue-700">{summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!requirement.isPrimary && requirement.status !== 'archived' ? <button type="button" onClick={() => runAction('primary')} disabled={Boolean(working)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Set Primary</button> : null}
          {requirement.status === 'active' ? <button type="button" onClick={() => runAction('pause')} disabled={Boolean(working)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Pause</button> : <button type="button" onClick={() => runAction('activate')} disabled={Boolean(working)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Activate</button>}
          {requirement.status !== 'archived' ? <button type="button" onClick={() => runAction('archive')} disabled={Boolean(working)} className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-700">Archive</button> : null}
          {requirement.status === 'active' ? <button type="button" onClick={() => setShowMatches((value) => !value)} className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">Find Matches</button> : null}
          <button type="button" onClick={() => setEditing(true)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Edit</button>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Property Types" value={formatList(requirement.propertyTypes)} />
        <Field label="Areas" value={formatList(requirement.areas)} />
        <Field label="Suburbs" value={formatList(requirement.suburbs)} />
        <Field label="Budget" value={requirement.budgetMin || requirement.budgetMax ? `${requirement.budgetMin ? formatCurrency(requirement.budgetMin) : 'No min'} - ${requirement.budgetMax ? formatCurrency(requirement.budgetMax) : 'No max'}` : '—'} />
        <Field label="Bedrooms Min" value={requirement.bedroomsMin} />
        <Field label="Bathrooms Min" value={requirement.bathroomsMin} />
        <Field label="Must-Haves" value={formatList(requirement.mustHaves)} />
        <Field label="Finance" value={requirement.financeStatus} />
        <Field label="Timeline" value={requirement.timeline} />
        <Field label="Urgency" value={requirement.urgency} />
        <Field label="Consent" value={requirement.consentToReceiveMatches ? 'Yes' : 'No'} />
        <Field label="Updated" value={formatDateTime(requirement.updatedAt)} />
      </dl>
      {requirement.notes ? <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{requirement.notes}</p> : null}
      {showMatches ? (
        <RequirementMatchPanel
          organisationId={organisationId}
          lead={lead}
          requirement={requirement}
          actor={actor}
          onSaved={onSaved}
        />
      ) : null}
    </article>
  )
}

function LeadRequirementsPanel({ organisationId, lead, requirements = [], actor, onSaved }) {
  const [showForm, setShowForm] = useState(false)
  const [creatingFromLegacy, setCreatingFromLegacy] = useState(false)
  const hasLegacy = Boolean(lead.budget || lead.areaInterest || lead.area_interest || lead.propertyInterest || lead.property_interest)

  async function createFromLegacy() {
    try {
      setCreatingFromLegacy(true)
      await createLeadRequirement(buildRequirementFromLeadFallback({ ...lead, organisationId }), { actor })
      await onSaved()
    } finally {
      setCreatingFromLegacy(false)
    }
  }

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Requirements</h2>
          <p className="mt-1 text-sm text-slate-500">Structured lead intent for manual matching later. Existing loose lead fields are preserved as fallback context.</p>
        </div>
        <button type="button" onClick={() => setShowForm((value) => !value)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">
          <Plus size={15} />
          {showForm ? 'Close' : 'Add Requirement'}
        </button>
      </div>

      {showForm ? (
        <div className="mt-5">
          <RequirementForm organisationId={organisationId} lead={lead} actor={actor} onCancel={() => setShowForm(false)} onSaved={onSaved} />
        </div>
      ) : null}

      {!requirements.length && hasLegacy ? (
        <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-amber-950">Legacy lead details</h3>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Budget" value={lead.budget ? formatCurrency(lead.budget) : '—'} />
                <Field label="Area Interest" value={lead.areaInterest || lead.area_interest} />
                <Field label="Property Interest" value={lead.propertyInterest || lead.property_interest} />
              </dl>
            </div>
            <button type="button" onClick={createFromLegacy} disabled={creatingFromLegacy} className="min-h-10 rounded-xl bg-amber-900 px-4 text-sm font-semibold text-white disabled:bg-amber-300">
              {creatingFromLegacy ? 'Creating...' : 'Create structured requirement from existing lead details'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4">
        {requirements.length ? requirements.map((requirement) => (
          <RequirementCard
            key={requirement.requirementId}
            requirement={requirement}
            lead={lead}
            organisationId={organisationId}
            actor={actor}
            onSaved={onSaved}
          />
        )) : <EmptyState title="No structured requirements yet" copy="Capture what this lead is looking for before manual matching is introduced." />}
      </div>
    </section>
  )
}

function ListingSpecs({ listing }) {
  const specs = [
    listing?.bedrooms ? `${listing.bedrooms} bed` : '',
    listing?.bathrooms ? `${listing.bathrooms} bath` : '',
    listing?.garages ? `${listing.garages} garage` : '',
    listing?.coveredParking || listing?.openParking ? `${Number(listing.coveredParking || 0) + Number(listing.openParking || 0)} parking` : '',
  ].filter(Boolean)
  return specs.length ? <p className="mt-1 text-xs text-slate-500">{specs.join(' • ')}</p> : null
}

function InterestStatusActions({ interest, onAction }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onAction('sent', interest)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Mark Sent</button>
      <button type="button" onClick={() => onAction('viewed', interest)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Mark Viewed</button>
      <button type="button" onClick={() => onAction('viewing_scheduled', interest)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Viewing Scheduled</button>
      <button type="button" onClick={() => onAction('dismissed', interest)} className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">Dismiss</button>
    </div>
  )
}

function AddListingToLeadPanel({ organisationId, lead, requirements = [], actor, onSaved }) {
  const [open, setOpen] = useState(false)
  const primaryRequirement = requirements.find((requirement) => requirement.isPrimary) || requirements[0] || null
  const [filters, setFilters] = useState({ search: '', status: 'all', minPrice: '', maxPrice: '', requirementId: primaryRequirement?.requirementId || '' })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState('')

  const searchListings = useCallback(async () => {
    if (!open) return
    try {
      setLoading(true)
      setError('')
      const result = await listSearchablePrivateListings({ organisationId, ...filters })
      setRows(result.slice(0, 30))
    } catch (loadError) {
      setRows([])
      setError(loadError?.message || 'Unable to search listings.')
    } finally {
      setLoading(false)
    }
  }, [filters, open, organisationId])

  useEffect(() => {
    void searchListings()
  }, [searchListings])

  async function addListing(listing) {
    try {
      setSavingId(listing.id)
      await upsertLeadListingInterest(
        {
          organisationId,
          lead,
          contactId: lead.contactId,
          listing,
          requirementId: filters.requirementId,
          source: 'manual',
          status: 'interested',
          isAgentSelected: true,
          createdBy: actor?.id,
        },
        { actor },
      )
      await onSaved()
      setOpen(false)
    } finally {
      setSavingId('')
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Add Listing</h3>
          <p className="mt-1 text-sm text-slate-500">Search current private listings and link one to this lead.</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">
          <Plus size={15} />
          {open ? 'Close' : 'Add Listing'}
        </button>
      </div>
      {open ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 md:grid-cols-[1fr_150px_140px_140px]">
            <input value={filters.search} onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="Search address, title, suburb" />
            <select value={filters.status} onChange={(event) => setFilters((previous) => ({ ...previous, status: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="seller_lead">Seller lead</option>
              <option value="under_offer">Under offer</option>
              <option value="sold">Sold</option>
            </select>
            <input value={filters.minPrice} onChange={(event) => setFilters((previous) => ({ ...previous, minPrice: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Min price" />
            <input value={filters.maxPrice} onChange={(event) => setFilters((previous) => ({ ...previous, maxPrice: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Max price" />
          </div>
          {requirements.length ? (
            <select value={filters.requirementId} onChange={(event) => setFilters((previous) => ({ ...previous, requirementId: event.target.value }))} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="">No requirement link</option>
              {requirements.map((requirement) => <option key={requirement.requirementId} value={requirement.requirementId}>{buildRequirementSummary(requirement)}</option>)}
            </select>
          ) : null}
          {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
          <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {loading ? <LoadingSkeleton lines={4} className="rounded-2xl border border-slate-200 bg-white" /> : null}
            {!loading && rows.length ? rows.map((listing) => (
              <article key={listing.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 gap-3">
                  <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">
                    {listing.imageUrl ? <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" /> : <Home size={20} />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{listing.title}</p>
                    <p className="mt-1 truncate text-sm text-slate-500">{[listing.address, listing.suburb, listing.city].filter(Boolean).join(', ') || 'Address pending'}</p>
                    <p className="mt-1 text-sm font-semibold text-blue-700">{formatCurrency(listing.price)}</p>
                    <ListingSpecs listing={listing} />
                  </div>
                </div>
                <button type="button" onClick={() => addListing(listing)} disabled={savingId === listing.id} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">
                  {savingId === listing.id ? 'Adding...' : 'Link'}
                </button>
              </article>
            )) : null}
            {!loading && !rows.length ? <EmptyState title="No listings found" copy="Try a broader address, suburb, price, or status filter." /> : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function SavedSearchesPanel({ organisationId, lead, requirements = [], savedSearches = [], propertyShares = [], actor, onSaved }) {
  const primaryRequirement = requirements.find((requirement) => requirement.isPrimary) || requirements[0] || null
  const [draft, setDraft] = useState(() => makeSavedSearchDraft(null, primaryRequirement))
  const [editingId, setEditingId] = useState('')
  const [workingId, setWorkingId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const requirementById = useMemo(() => new Map(requirements.map((requirement) => [requirement.requirementId, requirement])), [requirements])

  useEffect(() => {
    if (!editingId) setDraft(makeSavedSearchDraft(null, primaryRequirement))
  }, [editingId, primaryRequirement])

  function updateDraft(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  async function saveDraft(event) {
    event.preventDefault()
    try {
      setWorkingId(editingId || 'create')
      setError('')
      setMessage('')
      if (editingId) {
        await updateLeadSavedSearch({ savedSearchId: editingId, updates: draft }, { actor })
        setMessage('Saved search updated.')
      } else {
        await createLeadSavedSearch(savedSearchPayloadFromDraft(draft, lead, organisationId), { actor })
        setMessage('Saved search created.')
      }
      setEditingId('')
      await onSaved()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save this saved search.')
    } finally {
      setWorkingId('')
    }
  }

  async function toggleSavedSearch(savedSearch, active) {
    try {
      setWorkingId(savedSearch.savedSearchId)
      setError('')
      if (active) await enableLeadSavedSearch({ savedSearchId: savedSearch.savedSearchId }, { actor })
      else await disableLeadSavedSearch({ savedSearchId: savedSearch.savedSearchId }, { actor })
      await onSaved()
    } catch (toggleError) {
      setError(toggleError?.message || 'Unable to update saved search.')
    } finally {
      setWorkingId('')
    }
  }

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Saved Searches</h2>
          <p className="mt-1 text-sm text-slate-500">Buyer opt-in preferences for ongoing property updates. Agents still approve every send.</p>
        </div>
        <StatusPill tone="blue">{savedSearches.length} saved</StatusPill>
      </div>
      {message ? <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <form className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4" onSubmit={saveDraft}>
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1.2fr_150px]">
          <input value={draft.searchName} onChange={(event) => updateDraft('searchName', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Search name" />
          <select value={draft.requirementId} onChange={(event) => {
            const requirement = requirementById.get(event.target.value)
            setDraft((previous) => ({
              ...previous,
              requirementId: event.target.value,
              searchName: previous.searchName || (requirement ? buildRequirementSummary(requirement) : ''),
              consentGiven: previous.consentGiven || Boolean(requirement?.consentToReceiveMatches),
            }))
          }} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option value="">No requirement link</option>
            {requirements.map((requirement) => <option key={requirement.requirementId} value={requirement.requirementId}>{buildRequirementSummary(requirement)}</option>)}
          </select>
          <select value={draft.frequency} onChange={(event) => updateDraft('frequency', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option value="manual_only">Manual only</option>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-slate-600">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.active} onChange={(event) => updateDraft('active', event.target.checked)} /> Active</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.consentGiven} onChange={(event) => updateDraft('consentGiven', event.target.checked)} /> Consent recorded</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.emailEnabled} onChange={(event) => updateDraft('emailEnabled', event.target.checked)} /> Email</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.whatsappEnabled} onChange={(event) => updateDraft('whatsappEnabled', event.target.checked)} /> WhatsApp</label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={Boolean(workingId)} className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">{editingId ? 'Update Search' : 'Add Saved Search'}</button>
          {editingId ? <button type="button" onClick={() => { setEditingId(''); setDraft(makeSavedSearchDraft(null, primaryRequirement)) }} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Cancel</button> : null}
        </div>
      </form>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {savedSearches.length ? savedSearches.map((savedSearch) => {
          const channelLabel = savedSearch.whatsappEnabled ? 'WhatsApp' : 'Email'
          return (
          <article key={savedSearch.savedSearchId} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{savedSearch.searchName}</p>
                <p className="mt-1 text-xs text-slate-500">Frequency: {savedSearch.frequency.replace(/_/g, ' ')} · Channel: {channelLabel} · Consent Status: {savedSearch.consentGiven ? 'Recorded' : 'Missing'}</p>
                <p className="mt-1 text-xs text-slate-500">Last sent {formatDateTime(savedSearch.lastSentAt)}</p>
                {savedSearch.requirementId ? <p className="mt-1 text-xs text-slate-500">Requirement: {buildRequirementSummary(requirementById.get(savedSearch.requirementId))}</p> : null}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <StatusPill tone={savedSearch.active ? 'green' : 'slate'}>{savedSearch.active ? 'Active' : 'Paused'}</StatusPill>
                <StatusPill tone={savedSearch.consentGiven ? 'green' : 'amber'}>{savedSearch.consentGiven ? 'Consent' : 'No consent'}</StatusPill>
                <StatusPill tone={savedSearch.emailEnabled || savedSearch.whatsappEnabled ? 'blue' : 'red'}>{channelLabel}</StatusPill>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setEditingId(savedSearch.savedSearchId); setDraft(makeSavedSearchDraft(savedSearch, requirementById.get(savedSearch.requirementId))) }} className="inline-flex min-h-9 items-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700">Edit</button>
              <button type="button" onClick={() => toggleSavedSearch(savedSearch, !savedSearch.active)} disabled={workingId === savedSearch.savedSearchId} className="inline-flex min-h-9 items-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700">{savedSearch.active ? 'Pause' : 'Enable'}</button>
            </div>
          </article>
          )
        }) : <EmptyState title="No saved searches yet" copy="Create a saved search when the buyer has opted into property updates." />}
      </div>

      <section className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-950">Sent Properties</h3>
          <StatusPill>{propertyShares.length} sent</StatusPill>
        </div>
        <div className="mt-3 grid gap-3">
          {propertyShares.length ? propertyShares.map((share) => (
            <article key={share.shareId || share.communicationId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{share.subject || 'Property update'}</p>
                  <p className="mt-1 text-xs text-slate-500">{share.listings?.map((listing) => listing.title).filter(Boolean).join(', ') || 'Listing details pending'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill>{share.channel || share.communicationType}</StatusPill>
                  <StatusPill tone={deliveryTone(share.deliveryStatus || share.status)}>{share.deliveryStatus || share.status || 'pending'}</StatusPill>
                  <StatusPill>{formatDateTime(share.sentAt || share.occurredAt)}</StatusPill>
                </div>
              </div>
            </article>
          )) : <EmptyState title="No properties sent yet" copy="Agent-approved property shares will appear here and in the communication timeline." />}
        </div>
      </section>
    </section>
  )
}

function PropertyShareDialog({ draft, organisationId = '', lead, requirements = [], savedSearches = [], actor, onClose, onSaved }) {
  const [channel, setChannel] = useState(draft?.channel || 'email')
  const [templateType, setTemplateType] = useState('property_match')
  const [note, setNote] = useState('')
  const [savedSearchId, setSavedSearchId] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const templates = useMemo(() => listLeadCommunicationTemplates(), [])
  const listing = draft?.listing || null
  const requirement = useMemo(() => {
    const id = draft?.requirementId || draft?.suggestion?.requirementId || ''
    return requirements.find((item) => item.requirementId === id) || requirements.find((item) => item.isPrimary) || requirements[0] || null
  }, [draft, requirements])
  const savedSearch = useMemo(() => savedSearches.find((item) => item.savedSearchId === savedSearchId) || savedSearches.find((item) => item.requirementId && item.requirementId === requirement?.requirementId) || null, [requirement?.requirementId, savedSearchId, savedSearches])
  const preview = useMemo(() => previewPropertyMessage({
    lead,
    listing,
    requirement,
    savedSearch,
    channel,
    templateType,
    note,
  }), [channel, lead, listing, note, requirement, savedSearch, templateType])

  if (!draft || !listing) return null

  async function sendShare() {
    try {
      setWorking(true)
      setError('')
      setMessage('')
      const result = await sendListingToLead({
        organisationId: organisationId || lead.organisationId || lead.organisation_id,
        lead,
        leadId: lead.leadId,
        contactId: lead.contactId,
        listing,
        requirement,
        requirementId: requirement?.requirementId,
        savedSearch,
        savedSearchId: savedSearch?.savedSearchId,
        interestId: draft.interestId,
        suggestionId: draft.suggestionId,
        recommendationId: draft.recommendationId,
        channel,
        templateType,
        note,
      }, { actor })
      if (!result.ok) {
        setError(result.warning || 'Unable to send this property update.')
        return
      }
      if (draft.recommendationId) await completeRecommendation({ recommendationId: draft.recommendationId }, { actor }).catch(() => null)
      setMessage(result.status === 'sent' ? 'Property update sent and logged.' : 'Property update prepared and logged as pending.')
      await onSaved()
    } catch (sendError) {
      setError(sendError?.message || 'Unable to send this property update.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <section className="max-h-[calc(100dvh-32px)] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Send To Buyer</h2>
            <p className="mt-1 text-sm text-slate-500">Preview the property update before Bridge sends or prepares the outbound payload.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">Close</button>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-950">{listing.title || 'Listing details unavailable'}</p>
          <p className="mt-1 text-sm text-slate-500">{[listing.address, listing.suburb, listing.city].filter(Boolean).join(', ') || 'Address pending'} · {formatCurrency(listing.price)}</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold text-slate-600">
            Channel
            <select value={channel} onChange={(event) => setChannel(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-600">
            Template
            <select value={templateType} onChange={(event) => setTemplateType(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              {templates.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-600 sm:col-span-2">
            Saved Search
            <select value={savedSearchId} onChange={(event) => setSavedSearchId(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
              <option value="">Use requirement consent</option>
              {savedSearches.map((item) => <option key={item.savedSearchId} value={item.savedSearchId}>{item.searchName}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-600 sm:col-span-2">
            Optional note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Add a short agent note." />
          </label>
        </div>
        {!preview.consent.ok ? <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">{preview.consent.warning}</p> : null}
        {!preview.recipient ? <p className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">No {channel === 'whatsapp' ? 'phone number' : 'email address'} is available for this lead.</p> : null}
        {message ? <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Message Preview</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">{preview.subject}</p>
          <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{preview.message}</pre>
        </section>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700">Cancel</button>
          <button type="button" onClick={sendShare} disabled={working || !preview.consent.ok || !preview.recipient} className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
            {working ? 'Sending...' : 'Send'}
          </button>
        </div>
      </section>
    </div>
  )
}

function LeadListingInterestsPanel({ organisationId, lead, interests = [], requirements = [], actor, onSaved, onShare }) {
  const [noteDrafts, setNoteDrafts] = useState({})
  const [scheduleDrafts, setScheduleDrafts] = useState({})
  const [workingId, setWorkingId] = useState('')
  const [error, setError] = useState('')
  const requirementById = useMemo(() => new Map(requirements.map((requirement) => [requirement.requirementId, requirement])), [requirements])
  const originalInterests = useMemo(() => interests.filter((interest) => interest.isOriginalEnquiry), [interests])

  async function handleAction(action, interest) {
    try {
      setWorkingId(interest.interestId)
      setError('')
      if (action === 'sent') await markLeadListingInterestSent({ interestId: interest.interestId }, { actor })
      else if (action === 'viewed') await markLeadListingInterestViewed({ interestId: interest.interestId }, { actor })
      else if (action === 'dismissed') await dismissLeadListingInterest({ interestId: interest.interestId, reason: noteDrafts[interest.interestId] || 'Dismissed by agent.' }, { actor })
      else await updateLeadListingInterestStatus({ interestId: interest.interestId, status: action }, { actor })
      await onSaved()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update listing interest.')
    } finally {
      setWorkingId('')
    }
  }

  async function saveNote(interest) {
    try {
      setWorkingId(interest.interestId)
      setError('')
      await updateLeadListingInterestNotes({ interestId: interest.interestId, notes: noteDrafts[interest.interestId] ?? interest.notes ?? '' }, { actor })
      await onSaved()
    } catch (noteError) {
      setError(noteError?.message || 'Unable to save note.')
    } finally {
      setWorkingId('')
    }
  }

  async function scheduleViewing(interest) {
    const draft = scheduleDrafts[interest.interestId] || {}
    if (!draft.date || !draft.time) {
      setError('Choose a viewing date and time first.')
      return
    }
    try {
      setWorkingId(interest.interestId)
      setError('')
      await scheduleViewingFromLeadListingInterest({
        organisationId,
        interest,
        date: draft.date,
        time: draft.time,
        notes: draft.notes || interest.notes || '',
        actor,
      })
      await onSaved()
    } catch (scheduleError) {
      setError(scheduleError?.message || 'Unable to schedule viewing.')
    } finally {
      setWorkingId('')
    }
  }

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Interested Listings</h2>
          <p className="mt-1 text-sm text-slate-500">Canonical lead-to-listing relationships. No matching or transaction creation happens here.</p>
        </div>
        <StatusPill>{interests.length} linked</StatusPill>
      </div>
      <div className="mt-5">
        <AddListingToLeadPanel organisationId={organisationId} lead={lead} requirements={requirements} actor={actor} onSaved={onSaved} />
      </div>
      {error ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {originalInterests.length ? (
        <section className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Original Enquiry Listing</h3>
              <p className="mt-1 text-sm text-slate-500">Listings the lead enquired about before any manual matching.</p>
            </div>
            <StatusPill tone="blue">{originalInterests.length} original</StatusPill>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {originalInterests.map((interest) => {
              const listing = interest.listing || {}
              return (
                <article key={`original-${interest.interestId}`} className="rounded-2xl border border-blue-100 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{listing.title || 'Listing details unavailable'}</p>
                      <p className="mt-1 text-xs text-slate-500">{[listing.address, listing.suburb, listing.city].filter(Boolean).join(', ') || 'Address pending'}</p>
                      <p className="mt-1 text-xs font-semibold text-blue-700">{interest.source}</p>
                    </div>
                    <StatusPill tone="blue">Original Enquiry</StatusPill>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}
      <div className="mt-5 grid gap-4">
        {interests.length ? interests.map((interest) => {
          const listing = interest.listing || {}
          const draft = scheduleDrafts[interest.interestId] || {}
          const requirement = requirementById.get(interest.requirementId) || null
          return (
            <article key={interest.interestId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[160px_1fr]">
                <div className="flex h-36 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-slate-400">
                  {listing.imageUrl ? <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" /> : <Home size={24} />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-950">{listing.title || 'Listing details unavailable'}</h3>
                      <p className="mt-1 text-sm text-slate-500">{[listing.address, listing.suburb, listing.city].filter(Boolean).join(', ') || 'Address pending'}</p>
                      <p className="mt-2 text-sm font-semibold text-blue-700">{formatCurrency(listing.price)}</p>
                      <ListingSpecs listing={listing} />
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <StatusPill tone={getStageTone(interest.status)}>{interest.status.replace(/_/g, ' ')}</StatusPill>
                      <StatusPill>{interest.source}</StatusPill>
                      {interest.isOriginalEnquiry ? <StatusPill tone="blue">Original enquiry</StatusPill> : null}
                      {interest.isAgentSelected ? <StatusPill tone="blue">Agent selected</StatusPill> : null}
                      {requirement ? <StatusPill tone="blue">Requirement linked</StatusPill> : null}
                      {interest.matchScore !== null && interest.matchScore !== undefined ? <StatusPill tone="green">{interest.matchScore}% match</StatusPill> : null}
                    </div>
                  </div>
                  {requirement ? <p className="mt-2 text-xs font-semibold text-slate-500">Requirement: {buildRequirementSummary(requirement)}</p> : null}
                  {interest.matchReasons?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {interest.matchReasons.map((reason, index) => (
                        <span key={`${interest.interestId}-reason-${index}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{typeof reason === 'string' ? reason : reason?.text || JSON.stringify(reason)}</span>
                      ))}
                    </div>
                  ) : null}
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Created" value={formatDate(interest.createdAt)} />
                    <Field label="Updated" value={formatDateTime(interest.updatedAt)} />
                    <Field label="Sent" value={formatDateTime(interest.sentAt)} />
                    <Field label="Viewed" value={formatDateTime(interest.viewedAt)} />
                  </dl>
                  <div className="mt-4">
                    <InterestStatusActions interest={interest} onAction={handleAction} />
                  </div>
                  <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_auto]">
                    <input
                      value={noteDrafts[interest.interestId] ?? interest.notes ?? ''}
                      onChange={(event) => setNoteDrafts((previous) => ({ ...previous, [interest.interestId]: event.target.value }))}
                      className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300"
                      placeholder="Add note"
                    />
                    <button type="button" onClick={() => saveNote(interest)} disabled={workingId === interest.interestId} className="rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Save Note</button>
                  </div>
                  <div className="mt-3 grid gap-2 lg:grid-cols-[150px_130px_1fr_auto]">
                    <input type="date" value={draft.date || ''} onChange={(event) => setScheduleDrafts((previous) => ({ ...previous, [interest.interestId]: { ...draft, date: event.target.value } }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" />
                    <input type="time" value={draft.time || ''} onChange={(event) => setScheduleDrafts((previous) => ({ ...previous, [interest.interestId]: { ...draft, time: event.target.value } }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" />
                    <input value={draft.notes || ''} onChange={(event) => setScheduleDrafts((previous) => ({ ...previous, [interest.interestId]: { ...draft, notes: event.target.value } }))} className="min-h-10 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Viewing notes" />
                    <button type="button" onClick={() => scheduleViewing(interest)} disabled={workingId === interest.interestId} className="rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">Schedule</button>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => onShare?.({ listing, requirementId: interest.requirementId, interestId: interest.interestId })} className="inline-flex min-h-10 items-center rounded-xl border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700">
                      Send To Buyer
                    </button>
                    {listing.id ? <Link to={`/agent/listings/${listing.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700">Open listing <ExternalLink size={13} /></Link> : null}
                    {interest.offers?.length ? <span className="text-sm font-semibold text-slate-600">{interest.offers.length} existing offer{interest.offers.length === 1 ? '' : 's'} linked</span> : <span className="text-sm text-slate-500">No existing offer linked</span>}
                  </div>
                </div>
              </div>
            </article>
          )
        }) : <EmptyState title="No interested listings yet" copy="Use Add Listing to create the first canonical lead-listing relationship." />}
      </div>
    </section>
  )
}

function SuggestionReasonList({ reasons = [] }) {
  const visibleReasons = Array.isArray(reasons) ? reasons.slice(0, 5) : []
  if (!visibleReasons.length) return <p className="text-xs text-slate-500">No suggestion reasons stored.</p>
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {visibleReasons.map((reason, index) => {
        const text = typeof reason === 'string' ? reason : reason?.text || JSON.stringify(reason)
        const type = typeof reason === 'string' ? 'match' : reason?.type || 'match'
        const tone = type === 'match'
          ? 'bg-emerald-50 text-emerald-700'
          : type === 'missing'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-rose-50 text-rose-700'
        return <span key={`suggestion-reason-${index}`} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{text}</span>
      })}
    </div>
  )
}

function LeadSuggestionsPanel({ organisationId, lead, suggestions = [], actor, onSaved, onShare }) {
  const [workingId, setWorkingId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const pendingSuggestions = suggestions.filter((suggestion) => suggestion.status === 'pending')

  async function runAction(action, suggestion) {
    try {
      setWorkingId(suggestion.suggestionId)
      setError('')
      setMessage('')
      if (action === 'accept') {
        await acceptSuggestion({ suggestionId: suggestion.suggestionId }, { actor })
        setMessage('Suggestion accepted and added to Interested Listings.')
      } else {
        await rejectSuggestion({ suggestionId: suggestion.suggestionId, reason: 'Rejected by agent from Lead Workspace.' }, { actor })
        setMessage('Suggestion rejected.')
      }
      await onSaved()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update suggestion.')
    } finally {
      setWorkingId('')
    }
  }

  async function regenerate() {
    try {
      setWorkingId('generate')
      setError('')
      setMessage('')
      const generated = await generateSuggestionsForLead({ organisationId, leadId: lead.leadId, force: true })
      setMessage(`${generated.length} suggestion${generated.length === 1 ? '' : 's'} generated.`)
      await onSaved()
    } catch (generationError) {
      setError(generationError?.message || 'Unable to generate suggestions.')
    } finally {
      setWorkingId('')
    }
  }

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Suggestions</h2>
          <p className="mt-1 text-sm text-slate-500">Automated listing recommendations. Agents must accept before a relationship becomes an interested listing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="blue">{pendingSuggestions.length} pending</StatusPill>
          <button type="button" onClick={regenerate} disabled={workingId === 'generate'} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
            {workingId === 'generate' ? 'Generating...' : 'Regenerate'}
          </button>
        </div>
      </div>
      {message ? <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-5 grid gap-4">
        {suggestions.length ? suggestions.map((suggestion) => {
          const listing = suggestion.listing || {}
          const isPending = suggestion.status === 'pending'
          return (
            <article key={suggestion.suggestionId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[120px_1fr_auto]">
                <div className="flex h-24 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-slate-400">
                  {listing.imageUrl ? <img src={listing.imageUrl} alt="" className="h-full w-full object-cover" /> : <Home size={22} />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-slate-950">{listing.title || 'Listing details unavailable'}</h3>
                    <StatusPill tone={suggestion.status === 'accepted' ? 'green' : suggestion.status === 'rejected' ? 'red' : 'blue'}>{suggestion.status}</StatusPill>
                    <StatusPill tone="green">{suggestion.score ?? 0}% score</StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{[listing.address, listing.suburb, listing.city].filter(Boolean).join(', ') || 'Address pending'}</p>
                  <p className="mt-2 text-sm font-semibold text-blue-700">{formatCurrency(listing.price)}</p>
                  <ListingSpecs listing={listing} />
                  <p className="mt-2 text-xs font-semibold text-slate-500">Requirement: {suggestion.requirementSummary || 'Requirement summary unavailable'}</p>
                  <SuggestionReasonList reasons={suggestion.reasons} />
                  <p className="mt-3 text-xs font-semibold text-slate-500">Generated {formatDateTime(suggestion.generatedAt)}</p>
                </div>
                <div className="flex flex-col gap-2 lg:items-end">
                  {listing.id ? <Link to={`/agent/listings/${listing.id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700">Open Listing <ExternalLink size={13} /></Link> : null}
                  {isPending ? (
                    <>
                      <button type="button" onClick={() => runAction('accept', suggestion)} disabled={workingId === suggestion.suggestionId} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">Accept</button>
                      <button type="button" onClick={() => runAction('reject', suggestion)} disabled={workingId === suggestion.suggestionId} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 px-3 text-sm font-semibold text-rose-700 disabled:opacity-60">Reject</button>
                    </>
                  ) : null}
                  {listing.id ? (
                    <button type="button" onClick={() => onShare?.({ listing, requirementId: suggestion.requirementId, suggestionId: suggestion.suggestionId })} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700">
                      Send To Buyer
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          )
        }) : (
          <EmptyState title="No suggestions yet" copy="Suggestions are generated automatically when requirements or listings are created or updated. You can regenerate them manually here." />
        )}
      </div>
    </section>
  )
}

function AgentLeadList() {
  const workspaceContext = useWorkspace()
  const navigate = useNavigate()
  const organisationId = getOrganisationId(workspaceContext)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [assignmentMetrics, setAssignmentMetrics] = useState({ unassigned: 0, assigned: 0, overdue: 0, escalated: 0, byAgent: [] })
  const [filters, setFilters] = useState({ search: '', category: 'all', stage: 'all', source: 'all', agent: 'all', createdFrom: '', createdTo: '' })

  const loadRows = useCallback(async () => {
    if (!organisationId) {
      setRows([])
      setAssignmentMetrics({ unassigned: 0, assigned: 0, overdue: 0, escalated: 0, byAgent: [] })
      setLoading(false)
      setError('Select an agency workspace before loading leads.')
      return
    }
    try {
      setLoading(true)
      setError('')
      const result = await listAgentLeadWorkspaceRows({ organisationId })
      setRows(result.rows)
      setAssignmentMetrics(result.assignmentMetrics || { unassigned: 0, assigned: 0, overdue: 0, escalated: 0, byAgent: [] })
    } catch (loadError) {
      setRows([])
      setAssignmentMetrics({ unassigned: 0, assigned: 0, overdue: 0, escalated: 0, byAgent: [] })
      setError(loadError?.message || 'Unable to load leads right now.')
    } finally {
      setLoading(false)
    }
  }, [organisationId])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const options = useMemo(() => getLeadFilterOptions(rows), [rows])
  const visibleRows = useMemo(() => {
    const filtered = filterAgentLeadRows(rows, filters)
    if (!filters.category || filters.category === 'all') return filtered
    return filtered.filter((row) => normalizeLeadCategory(row) === filters.category)
  }, [rows, filters])
  const recommendationRows = useMemo(() => rows.flatMap((row) => Array.isArray(row.recommendations) ? row.recommendations : []), [rows])
  const recommendationMetrics = useMemo(() => getRecommendationMetrics(recommendationRows), [recommendationRows])
  const pendingRecommendations = recommendationMetrics.pending + recommendationMetrics.accepted
  const dueTodayRecommendations = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return recommendationRows.filter((item) => ['pending', 'accepted'].includes(String(item.status || '').toLowerCase()) && String(item.dueDate || item.due_date || '').slice(0, 10) === today).length
  }, [recommendationRows])

  return (
    <main className={pageShell}>
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Agent Workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Leads</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">Scan ownership, stage, activity, next action, and lifecycle links from one operational view.</p>
        </div>
        <button type="button" onClick={loadRows} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
          <RefreshCw size={15} />
          Refresh
        </button>
      </header>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[repeat(4,minmax(120px,1fr))_minmax(320px,1.4fr)]">
        <span className="sr-only">Unassigned Leads Assigned Leads Overdue Leads Escalated Leads My Recommendations Recommended Next Actions</span>
        <CompactMetric label="Unassigned" value={assignmentMetrics.unassigned || 0} icon={UserRound} />
        <CompactMetric label="Assigned" value={assignmentMetrics.assigned || 0} icon={Tag} />
        <CompactMetric label="Overdue" value={assignmentMetrics.overdue || 0} icon={Clock3} />
        <CompactMetric label="Escalated" value={assignmentMetrics.escalated || 0} icon={CheckCircle2} />
        <div className="sm:col-span-2 lg:col-span-4 2xl:col-span-1">
          <RecommendationSummaryCard
            pendingCount={pendingRecommendations}
            urgentCount={recommendationMetrics.urgent || 0}
            dueTodayCount={dueTodayRecommendations}
            overdueCount={recommendationMetrics.overdue || 0}
          />
        </div>
      </section>

      <section className={`${panelClass} p-4`}>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <LeadCategoryFilter filters={filters} rows={rows} onChange={setFilters} />
          <span className="text-sm font-semibold text-slate-500">{visibleRows.length} visible</span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.2fr)_repeat(4,minmax(130px,1fr))]">
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))}
              className="min-h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300"
              placeholder="Search name, phone, email"
            />
          </label>
          <select value={filters.stage} onChange={(event) => setFilters((previous) => ({ ...previous, stage: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
            <option value="all">All stages</option>
            {options.stages.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={filters.source} onChange={(event) => setFilters((previous) => ({ ...previous, source: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
            <option value="all">All sources</option>
            {options.sources.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <select value={filters.agent} onChange={(event) => setFilters((previous) => ({ ...previous, agent: event.target.value }))} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
            <option value="all">All agents</option>
            {options.agents.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={filters.createdFrom} onChange={(event) => setFilters((previous) => ({ ...previous, createdFrom: event.target.value }))} className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700" aria-label="Created from" />
            <input type="date" value={filters.createdTo} onChange={(event) => setFilters((previous) => ({ ...previous, createdTo: event.target.value }))} className="min-h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700" aria-label="Created to" />
          </div>
        </div>
      </section>

      {loading ? <LoadingSkeleton lines={10} className={panelClass} /> : null}
      {error && !loading ? <EmptyState title="Leads could not be loaded" copy={error} /> : null}
      {!loading && !error ? (
        <section className={`${panelClass} relative`}>
          <div className="hidden lg:block">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[11%]" />
                <col className="w-[13%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[9%]" />
                <col className="w-[11%]" />
              </colgroup>
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-400">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Lead</th>
                  <th className="px-3 py-2.5 font-semibold">Stage</th>
                  <th className="px-3 py-2.5 font-semibold">Owner</th>
                  <th className="px-3 py-2.5 font-semibold">Latest Activity</th>
                  <th className="px-3 py-2.5 font-semibold">Next Action</th>
                  <th className="px-3 py-2.5 font-semibold">Lifecycle</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => {
                  const latestDate = getLatestActivityDate(row.latestActivity)
                  const nextDate = row.nextTask?.dueDate || row.nextTask?.due_date
                  const openRow = () => navigate(`/pipeline/leads/${row.leadId}`)
                  return (
                    <tr key={row.leadId} className="align-middle hover:bg-slate-50/80">
                      <td className="px-3 py-3">
                        <LeadIdentityBlock row={row} onOpen={openRow} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill tone={getStageTone(row.stage)}>{row.stage}</StatusPill>
                      </td>
                      <td className="px-3 py-3">
                        <span className="block truncate font-semibold text-slate-800">{getOwnerName(row)}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{row.assignedQueue && row.assignedQueue !== '—' ? row.assignedQueue.replace(/_/g, ' ') : 'No queue'}</span>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getSlaTone(row.slaStatus) === 'red' ? 'bg-rose-50 text-rose-700' : getSlaTone(row.slaStatus) === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{formatSlaStatus(row.slaStatus)}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="block truncate font-medium text-slate-800">{getLatestActivityTitle(row)}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{formatRelativeTime(latestDate, 'No activity yet')}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="block truncate font-semibold text-slate-800">{getNextAction(row)}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{nextDate ? formatDate(nextDate) : 'Recommended next step'}</span>
                      </td>
                      <td className="px-3 py-3">
                        <LifecycleIndicator row={row} />
                      </td>
                      <td className="px-3 py-3">
                        <RowActionMenu row={row} onOpen={openRow} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 p-3 lg:hidden">
            {visibleRows.map((row) => {
              const latestDate = getLatestActivityDate(row.latestActivity)
              const nextDate = row.nextTask?.dueDate || row.nextTask?.due_date
              const openRow = () => navigate(`/pipeline/leads/${row.leadId}`)
              return (
                <article key={`card-${row.leadId}`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <LeadIdentityBlock row={row} onOpen={openRow} />
                    <StatusPill tone={getStageTone(row.stage)}>{row.stage}</StatusPill>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Owner</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-800">{getOwnerName(row)}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatSlaStatus(row.slaStatus)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Latest Activity</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-800">{getLatestActivityTitle(row)}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatRelativeTime(latestDate, 'No activity yet')}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Next Action</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-800">{getNextAction(row)}</p>
                      <p className="mt-1 text-xs text-slate-500">{nextDate ? formatDate(nextDate) : 'Recommended next step'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Lifecycle</p>
                      <div className="mt-1"><LifecycleIndicator row={row} /></div>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <RowActionMenu row={row} onOpen={openRow} />
                  </div>
                </article>
              )
            })}
          </div>
          {!visibleRows.length ? (
            <div className="p-5">
              <EmptyLeadResults
                onCreate={() => navigate('/pipeline')}
                onImport={() => navigate('/pipeline/enquiries')}
                onAdjustFilters={() => setFilters({ search: '', category: 'all', stage: 'all', source: 'all', agent: 'all', createdFrom: '', createdTo: '' })}
              />
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}

function TaskForm({ organisationId, leadId, actor, onSaved }) {
  const [draft, setDraft] = useState({ title: '', dueDate: '' })
  const [saving, setSaving] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (!normalizeText(draft.title)) return
    try {
      setSaving(true)
      await createAgencyCrmLeadTask(organisationId, leadId, { title: draft.title, dueDate: draft.dueDate || null, status: 'Pending', priority: 'Medium' }, { actor })
      setDraft({ title: '', dueDate: '' })
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-2 sm:grid-cols-[1fr_170px_auto]">
      <input value={draft.title} onChange={(event) => setDraft((previous) => ({ ...previous, title: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300" placeholder="New follow-up task" />
      <input type="date" value={draft.dueDate} onChange={(event) => setDraft((previous) => ({ ...previous, dueDate: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-300" />
      <button type="submit" disabled={saving || !normalizeText(draft.title)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
        <Plus size={15} />
        Add Task
      </button>
    </form>
  )
}

function TimelineList({ items = [] }) {
  if (!items.length) return <EmptyState title="No activity yet" copy="Calls, notes, WhatsApps, emails, and system lead events will appear here when they are logged." />
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article key={item.activityId || item.activity_id || `${item.activityType}-${item.activityDate}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <strong className="text-sm text-slate-950">{item.activityType || item.activity_type || 'Activity'}</strong>
            <span className="text-xs font-semibold text-slate-500">{formatDateTime(item.activityDate || item.activity_date || item.createdAt || item.created_at)}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.activityNote || item.activity_note || item.outcome || 'No note captured.'}</p>
        </article>
      ))}
    </div>
  )
}

function CommunicationQuickLogForm({ organisationId, lead, actor, onSaved }) {
  const [type, setType] = useState('call')
  const [draft, setDraft] = useState({
    direction: 'outbound',
    subject: '',
    summary: '',
    message: '',
    durationMinutes: '',
    outcome: '',
    followUpRequired: false,
    nextAction: '',
    occurredAt: '',
    hasAttachments: false,
    isPrivate: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDraft((previous) => ({
      ...previous,
      direction: type === 'note' ? 'internal' : type === 'system' ? 'system' : previous.direction === 'internal' ? 'outbound' : previous.direction,
      subject: type === 'call' || type === 'whatsapp' || type === 'note' ? '' : previous.subject,
    }))
  }, [type])

  function update(field, value) {
    setDraft((previous) => ({ ...previous, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    if (!normalizeText(draft.summary) && !normalizeText(draft.message) && !normalizeText(draft.subject)) return
    const payload = {
      organisationId,
      leadId: lead.leadId,
      contactId: lead.contactId,
      agentId: actor?.id,
      direction: draft.direction,
      subject: draft.subject,
      summary: draft.summary,
      message: draft.message,
      durationMinutes: draft.durationMinutes,
      outcome: draft.outcome,
      followUpRequired: draft.followUpRequired,
      nextAction: draft.nextAction,
      occurredAt: draft.occurredAt || new Date().toISOString(),
      hasAttachments: draft.hasAttachments,
      isPrivate: draft.isPrivate,
      source: 'manual',
    }
    const handlers = {
      call: logCall,
      email: logEmail,
      whatsapp: logWhatsApp,
      meeting: logMeeting,
      note: logNote,
    }
    try {
      setSaving(true)
      setError('')
      await (handlers[type] || logNote)(payload, { actor })
      setDraft({
        direction: type === 'note' ? 'internal' : 'outbound',
        subject: '',
        summary: '',
        message: '',
        durationMinutes: '',
        outcome: '',
        followUpRequired: false,
        nextAction: '',
        occurredAt: '',
        hasAttachments: false,
        isPrivate: false,
      })
      await onSaved()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to log communication.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Quick Logging</h3>
          <p className="mt-1 text-sm text-slate-500">Manual logs only. This does not send emails, WhatsApps, SMSes, or alerts.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ['call', 'Log Call'],
            ['email', 'Log Email'],
            ['whatsapp', 'Log WhatsApp'],
            ['note', 'Add Note'],
            ['meeting', 'Log Meeting'],
          ].map(([key, label]) => (
            <button key={key} type="button" onClick={() => setType(key)} className={`min-h-9 rounded-xl px-3 text-xs font-semibold ${type === key ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <select value={draft.direction} onChange={(event) => update('direction', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" disabled={type === 'note'}>
          {LEAD_COMMUNICATION_DIRECTIONS.filter((option) => type === 'note' ? option === 'internal' : option !== 'system').map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <input type="datetime-local" value={draft.occurredAt} onChange={(event) => update('occurredAt', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" aria-label="Occurred at" />
        {type === 'call' ? <input value={draft.durationMinutes} onChange={(event) => update('durationMinutes', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Duration minutes" /> : null}
        {type === 'call' ? (
          <select value={draft.outcome} onChange={(event) => update('outcome', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option value="">Outcome</option>
            {['No Answer', 'Interested', 'Not Interested', 'Call Back Later', 'Viewing Booked', 'Offer Discussed'].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : null}
        {(type === 'email' || type === 'meeting') ? <input value={draft.subject} onChange={(event) => update('subject', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Subject" /> : null}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <textarea value={draft.summary} onChange={(event) => update('summary', event.target.value)} className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Summary" />
        <textarea value={draft.message} onChange={(event) => update('message', event.target.value)} className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder={type === 'whatsapp' ? 'Message snippet' : 'Detail or notes'} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
        <input value={draft.nextAction} onChange={(event) => update('nextAction', event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Next action" />
        <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={draft.followUpRequired} onChange={(event) => update('followUpRequired', event.target.checked)} />
          Follow-up required
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={draft.hasAttachments} onChange={(event) => update('hasAttachments', event.target.checked)} />
          Attachment
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={draft.isPrivate} onChange={(event) => update('isPrivate', event.target.checked)} />
          Private note
        </label>
      </div>

      {error ? <p className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={saving || (!normalizeText(draft.summary) && !normalizeText(draft.message) && !normalizeText(draft.subject))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:bg-slate-300">
          <MessageSquarePlus size={15} />
          {saving ? 'Logging...' : `Save ${type === 'note' ? 'Note' : type.replace(/^\w/, (letter) => letter.toUpperCase())}`}
        </button>
      </div>
    </form>
  )
}

function CommunicationTimelineCard({ item }) {
  const duration = formatDuration(item.metadata?.durationSeconds)
  const detailLines = [
    item.subject ? `Subject: ${item.subject}` : '',
    item.summary || item.message,
    item.metadata?.outcome ? `Outcome: ${item.metadata.outcome}` : '',
    item.metadata?.nextAction ? `Next action: ${item.metadata.nextAction}` : '',
  ].filter(Boolean)

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm text-slate-950">{item.title}</strong>
            <StatusPill>{item.communicationType}</StatusPill>
            <StatusPill tone={item.direction === 'inbound' ? 'blue' : item.direction === 'outbound' ? 'green' : 'slate'}>{item.direction}</StatusPill>
            {item.metadata?.isPrivate ? <StatusPill tone="amber">Private</StatusPill> : null}
            {duration ? <StatusPill tone="blue">{duration}</StatusPill> : null}
          </div>
          {detailLines.length ? (
            <div className="mt-3 space-y-1">
              {detailLines.map((line, index) => <p key={`${item.id}-line-${index}`} className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{line}</p>)}
            </div>
          ) : <p className="mt-3 text-sm text-slate-500">No detail captured.</p>}
        </div>
        <span className="shrink-0 text-xs font-semibold text-slate-500">{formatDateTime(item.occurredAt)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
        {item.status ? <span>Status: {item.status}</span> : null}
        {item.source ? <span>Source: {item.source}</span> : null}
        {item.agentId ? <span>Agent: {item.agentId}</span> : null}
        {item.kind !== 'communication' ? <span>From {item.kind}</span> : null}
      </div>
    </article>
  )
}

function CommunicationTimelinePanel({ organisationId, lead, actor, timeline = [], onSaved }) {
  const [filters, setFilters] = useState({ search: '', type: 'all', direction: 'all', agentId: '', dateFrom: '', dateTo: '' })
  const visibleItems = useMemo(() => filterCommunicationTimeline(timeline, filters), [filters, timeline])

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Timeline</h2>
          <p className="mt-1 text-sm text-slate-500">Calls, emails, WhatsApps, notes, tasks, assignment history, enquiries, appointments, offers, and transaction links in date order.</p>
        </div>
        <StatusPill>{visibleItems.length} visible</StatusPill>
      </div>

      <div className="mt-5">
        <CommunicationQuickLogForm organisationId={organisationId} lead={lead} actor={actor} onSaved={onSaved} />
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(220px,1.3fr)_repeat(5,minmax(130px,1fr))]">
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={filters.search} onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-300" placeholder="Search timeline" />
        </label>
        <select value={filters.type} onChange={(event) => setFilters((previous) => ({ ...previous, type: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="all">All types</option>
          {LEAD_COMMUNICATION_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
          {['activity', 'assignment', 'task', 'appointment', 'offer', 'transaction'].map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <select value={filters.direction} onChange={(event) => setFilters((previous) => ({ ...previous, direction: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="all">All directions</option>
          {LEAD_COMMUNICATION_DIRECTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <input value={filters.agentId} onChange={(event) => setFilters((previous) => ({ ...previous, agentId: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Agent id" />
        <input type="date" value={filters.dateFrom} onChange={(event) => setFilters((previous) => ({ ...previous, dateFrom: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" aria-label="Timeline from" />
        <input type="date" value={filters.dateTo} onChange={(event) => setFilters((previous) => ({ ...previous, dateTo: event.target.value }))} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" aria-label="Timeline to" />
      </div>

      <div className="mt-5 space-y-3">
        {visibleItems.length ? visibleItems.map((item) => <CommunicationTimelineCard key={item.id} item={item} />) : (
          <EmptyState title="No timeline events match these filters" copy="Clear the search or log the first call, email, WhatsApp, meeting, or note." />
        )}
      </div>
    </section>
  )
}

function TaskList({ items = [] }) {
  if (!items.length) return <EmptyState title="No tasks linked" copy="Open and completed follow-ups linked to this lead will appear here." />
  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => (
        <div key={item.taskId || item.task_id || item.title} className="grid gap-3 py-3 sm:grid-cols-[1fr_130px_120px]">
          <div>
            <p className="text-sm font-semibold text-slate-950">{item.title || 'Follow-up'}</p>
            <p className="mt-1 text-xs text-slate-500">{item.description || 'No description'}</p>
          </div>
          <span className="text-sm font-medium text-slate-600">{formatDate(item.dueDate || item.due_date)}</span>
          <StatusPill tone={String(item.status || '').toLowerCase() === 'completed' ? 'green' : 'amber'}>{item.status || 'Pending'}</StatusPill>
        </div>
      ))}
    </div>
  )
}

function getRecommendationTone(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'urgent' || normalized === 'overdue') return 'red'
  if (normalized === 'high' || normalized === 'pending') return 'amber'
  if (normalized === 'completed' || normalized === 'accepted') return 'green'
  if (normalized === 'dismissed' || normalized === 'expired') return 'slate'
  return 'blue'
}

function getRecommendationAgeLabel(recommendation = {}) {
  const createdAt = recommendation.createdAt || recommendation.created_at
  if (!createdAt) return 'Age unknown'
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return 'Age unknown'
  const days = Math.floor((Date.now() - created.getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return '1 day old'
  return `${days} days old`
}

function LeadRecommendationsPanel({ recommendations = [], actor, onSaved, onShare }) {
  const [workingId, setWorkingId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function runRecommendationAction(action, recommendation) {
    try {
      setWorkingId(`${recommendation.recommendationId}:${action}`)
      setMessage('')
      setError('')
      if (action === 'accept') {
        await acceptRecommendation({ recommendationId: recommendation.recommendationId }, { actor })
        setMessage('Recommendation accepted.')
      } else if (action === 'dismiss') {
        await dismissLeadRecommendation({ recommendationId: recommendation.recommendationId, reason: 'Dismissed from Lead Workspace.' }, { actor })
        setMessage('Recommendation dismissed.')
      } else if (action === 'complete') {
        await completeRecommendation({ recommendationId: recommendation.recommendationId }, { actor })
        setMessage('Recommendation completed.')
      } else if (action === 'task') {
        await convertRecommendationToTask({ recommendationId: recommendation.recommendationId }, { actor })
        setMessage('Recommendation converted to a task.')
      }
      await onSaved()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update recommendation.')
    } finally {
      setWorkingId('')
    }
  }

  const pendingCount = recommendations.filter((item) => ['pending', 'accepted'].includes(String(item.status || '').toLowerCase())).length

  return (
    <section className={`${panelClass} p-5`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Recommendations</h2>
          <p className="mt-1 text-sm text-slate-500">Recommended next actions generated from lead events, inactivity, suggestions, viewings, offers, and communication history.</p>
        </div>
        <StatusPill tone="amber">{pendingCount} active</StatusPill>
      </div>
      {message ? <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-5 grid gap-3">
        {recommendations.length ? recommendations.map((recommendation) => {
          const active = ['pending', 'accepted'].includes(String(recommendation.status || '').toLowerCase())
          return (
            <article key={recommendation.recommendationId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-950">{recommendation.title || 'Recommended action'}</h3>
                    <StatusPill tone={getRecommendationTone(recommendation.priority)}>{recommendation.priority || 'medium'}</StatusPill>
                    <StatusPill tone={getRecommendationTone(recommendation.status)}>{recommendation.status || 'pending'}</StatusPill>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{recommendation.description || 'No description captured.'}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">Due {formatDate(recommendation.dueDate || recommendation.due_date)}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">{recommendation.sourceEvent || recommendation.source_event || 'manual'}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1">{getRecommendationAgeLabel(recommendation)}</span>
                    {recommendation.taskId ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Task linked</span> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  {active ? (
                    <>
                      {recommendation.status === 'pending' ? (
                        <button type="button" onClick={() => runRecommendationAction('accept', recommendation)} disabled={workingId.startsWith(recommendation.recommendationId)} className="inline-flex min-h-10 items-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">Accept</button>
                      ) : null}
                      <button type="button" onClick={() => runRecommendationAction('task', recommendation)} disabled={workingId.startsWith(recommendation.recommendationId) || Boolean(recommendation.taskId)} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 disabled:opacity-60">Convert To Task</button>
                      {String(recommendation.recommendationType || recommendation.recommendation_type) === 'send_property' ? (
                        <button type="button" onClick={() => onShare?.(recommendation)} disabled={workingId.startsWith(recommendation.recommendationId)} className="inline-flex min-h-10 items-center rounded-xl border border-blue-100 bg-blue-50 px-3 text-sm font-semibold text-blue-700 disabled:opacity-60">Send Property</button>
                      ) : null}
                      <button type="button" onClick={() => runRecommendationAction('complete', recommendation)} disabled={workingId.startsWith(recommendation.recommendationId)} className="inline-flex min-h-10 items-center rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 disabled:opacity-60">Complete</button>
                      <button type="button" onClick={() => runRecommendationAction('dismiss', recommendation)} disabled={workingId.startsWith(recommendation.recommendationId)} className="inline-flex min-h-10 items-center rounded-xl border border-rose-100 bg-rose-50 px-3 text-sm font-semibold text-rose-700 disabled:opacity-60">Dismiss</button>
                    </>
                  ) : null}
                </div>
              </div>
            </article>
          )
        }) : (
          <EmptyState title="No recommendations yet" copy="Bridge will create recommended actions from lead events, suggestions, viewings, offers, communication logs, and inactivity checks." />
        )}
      </div>
    </section>
  )
}

function AppointmentList({ items = [] }) {
  if (!items.length) return <EmptyState title="No appointments linked" copy="Lead, contact, listing, and converted transaction appointments will appear here when related by existing ids." />
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {items.map((item) => (
        <article key={item.appointmentId || item.appointment_id || item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">{item.title || item.appointmentType || item.appointment_type || 'Appointment'}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDateTime(item.startTime || item.start_time || item.date)}</p>
            </div>
            <StatusPill>{item.status || 'scheduled'}</StatusPill>
          </div>
          <p className="mt-3 text-sm text-slate-600">{item.location || item.locationAddress || item.location_address || 'No location captured'}</p>
        </article>
      ))}
    </div>
  )
}

function OfferTransactionList({ offers = [], transactions = [], convertedTransactionId = '' }) {
  if (!offers.length && !transactions.length && !convertedTransactionId) {
    return <EmptyState title="No offers or transaction link" copy="Submitted offers and converted transactions will appear here from the existing offer and transaction fields." />
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-950">Offers</h3>
        <div className="space-y-3">
          {offers.length ? offers.map((offer) => (
            <article key={offer.id || offer.offerId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm text-slate-950">{formatCurrency(offer.amount || offer.offerAmount || offer.offer_amount)}</strong>
                <StatusPill tone={String(offer.status || '').includes('accepted') ? 'green' : 'amber'}>{offer.status || 'draft'}</StatusPill>
              </div>
              <p className="mt-2 text-xs text-slate-500">Updated {formatDateTime(offer.updatedAt || offer.updated_at || offer.createdAt || offer.created_at)}</p>
            </article>
          )) : <p className="text-sm text-slate-500">No offers linked.</p>}
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-950">Transactions</h3>
        <div className="space-y-3">
          {transactions.length ? transactions.map((transaction) => (
            <article key={transaction.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm text-slate-950">Transaction</strong>
                <StatusPill tone="green">{transaction.status || 'Linked'}</StatusPill>
              </div>
              <Link to={`/transactions/${transaction.id}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
                Open transaction <ExternalLink size={13} />
              </Link>
            </article>
          )) : convertedTransactionId ? (
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <strong className="text-sm text-slate-950">Converted transaction</strong>
              <Link to={`/transactions/${convertedTransactionId}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
                Open transaction <ExternalLink size={13} />
              </Link>
            </article>
          ) : <p className="text-sm text-slate-500">No transaction linked.</p>}
        </div>
      </section>
    </div>
  )
}

function OwnershipCard({ organisationId, lead, actor, onSaved }) {
  const [agentId, setAgentId] = useState(lead.assignedAgentId || '')
  const [queueId, setQueueId] = useState(lead.assignedQueueId || 'unassigned')
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const canManage = canManageLeadAssignment(actor, lead)

  useEffect(() => {
    setAgentId(lead.assignedAgentId || '')
    setQueueId(lead.assignedQueueId || 'unassigned')
  }, [lead.assignedAgentId, lead.assignedQueueId])

  async function run(label, action) {
    try {
      setSaving(label)
      setError('')
      await action()
      await onSaved()
    } catch (actionError) {
      setError(actionError?.message || 'Unable to update assignment.')
    } finally {
      setSaving('')
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Ownership</h3>
          <p className="mt-1 text-sm text-slate-500">Responsible owner, queue, and first-contact SLA for this lead.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={getSlaTone(lead.slaStatus)}>{formatSlaStatus(lead.slaStatus)}</StatusPill>
          <StatusPill>{formatSlaStatus(lead.ownershipStatus)}</StatusPill>
        </div>
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Assigned Agent" value={lead.assignedAgent || 'Unassigned'} />
        <Field label="Assigned Team" value={lead.assignedQueue || '—'} />
        <Field label="Assigned Date" value={formatDateTime(lead.assignedAt)} />
        <Field label="Response SLA" value={formatDateTime(lead.slaDueAt)} />
        <Field label="First Contacted" value={formatDateTime(lead.firstContactedAt)} />
        <Field label="Response Time" value={lead.responseTimeHours !== null ? `${lead.responseTimeHours}h` : '—'} />
        <Field label="Agent Id" value={lead.assignedAgentId || '—'} />
        <Field label="Queue Id" value={lead.assignedQueueId || '—'} />
      </dl>

      {error ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {canManage ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_180px_auto_auto_auto]">
          <input value={agentId} onChange={(event) => setAgentId(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="Agent user id" />
          <select value={queueId} onChange={(event) => setQueueId(event.target.value)} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            {LEAD_ASSIGNMENT_QUEUES.map((queue) => <option key={queue} value={queue}>{queue.replace(/_/g, ' ')}</option>)}
          </select>
          <button type="button" disabled={Boolean(saving) || !agentId} onClick={() => run('agent', () => assignLeadToAgent({ organisationId, leadId: lead.leadId, agentId, reason: 'Assigned from Lead Workspace' }, { actor }))} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white disabled:bg-slate-300">
            Assign
          </button>
          <button type="button" disabled={Boolean(saving)} onClick={() => run('queue', () => assignLeadToQueue({ organisationId, leadId: lead.leadId, queueId, reason: 'Assigned to queue from Lead Workspace' }, { actor }))} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-60">
            Assign Queue
          </button>
          <button type="button" disabled={Boolean(saving)} onClick={() => run('auto', () => autoAssignLead({ organisationId, leadId: lead.leadId }, { actor }))} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 disabled:opacity-60">
            Auto-Assign
          </button>
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-3">
          <button type="button" disabled={Boolean(saving) || Boolean(lead.firstContactedAt)} onClick={() => run('contacted', () => markLeadFirstContacted({ organisationId, leadId: lead.leadId }, { actor }))} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 disabled:opacity-60">
            Mark First Contacted
          </button>
        </div>
      ) : null}

      <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-950">View History</summary>
        <div className="mt-3 divide-y divide-slate-100">
          {lead.assignmentHistory?.length ? lead.assignmentHistory.map((item) => (
            <div key={item.assignmentId || `${item.createdAt}-${item.reason}`} className="grid gap-2 py-3 text-sm sm:grid-cols-[150px_1fr]">
              <span className="font-semibold text-slate-500">{formatDateTime(item.createdAt)}</span>
              <span className="text-slate-700">
                {item.reason || 'Assignment updated'} · {item.previousAgentId || item.previousQueueId || 'none'} → {item.newAgentId || item.newQueueId || 'none'}
              </span>
            </div>
          )) : <p className="py-3 text-sm text-slate-500">No assignment history yet.</p>}
        </div>
      </details>
    </section>
  )
}

function AgentLeadWorkspace() {
  const { leadId } = useParams()
  const navigate = useNavigate()
  const workspaceContext = useWorkspace()
  const organisationId = getOrganisationId(workspaceContext)
  const actor = useMemo(() => getActor({
    ...(workspaceContext.profile || {}),
    workspaceRole: workspaceContext.currentMembership?.workspace_role || workspaceContext.currentMembership?.organisation_role || workspaceContext.currentMembership?.role || workspaceContext.profile?.role,
  }), [workspaceContext.currentMembership, workspaceContext.profile])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [activeTab, setActiveTab] = useState('timeline')
  const [shareDraft, setShareDraft] = useState(null)

  const loadWorkspace = useCallback(async () => {
    if (!organisationId || !leadId) return
    try {
      setLoading(true)
      setError('')
      const result = await fetchAgentLeadWorkspace({ organisationId, leadId })
      setData(result)
    } catch (loadError) {
      setData(null)
      setError(loadError?.message || 'Unable to load this lead.')
    } finally {
      setLoading(false)
    }
  }, [leadId, organisationId])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const row = data?.row || null
  const sourceInfo = row ? getLeadSourceInfo(row) : null
  const workspaceAnalytics = row ? buildLeadWorkspaceAnalyticsSummary(row) : null
  const openShareFromRecommendation = useCallback((recommendation) => {
    const metadata = recommendation?.metadata || {}
    const targetListingId = metadata.listingId || metadata.listing_id || metadata.listingIds?.[0] || metadata.listing_ids?.[0]
    const interest = (row?.listingInterests || data?.listingInterests || []).find((item) => item.listingId === targetListingId)
    const suggestion = (row?.suggestions || data?.suggestions || []).find((item) => item.listingId === targetListingId)
    const listing = interest?.listing || suggestion?.listing || null
    if (!listing) {
      setActiveTab('listings')
      return
    }
    setShareDraft({
      listing,
      requirementId: metadata.requirementId || metadata.requirement_id || interest?.requirementId || suggestion?.requirementId,
      interestId: interest?.interestId,
      suggestionId: suggestion?.suggestionId,
      recommendationId: recommendation.recommendationId,
    })
  }, [data?.listingInterests, data?.suggestions, row?.listingInterests, row?.suggestions])
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'requirements', label: 'Requirements' },
    { key: 'saved_searches', label: 'Saved Searches' },
    { key: 'suggestions', label: 'Suggestions' },
    { key: 'listings', label: 'Listings' },
    { key: 'recommendations', label: 'Recommendations' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'appointments', label: 'Appointments' },
    { key: 'offers', label: 'Offers' },
  ]

  return (
    <main className={pageShell}>
      <button type="button" onClick={() => navigate('/pipeline/leads')} className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950">
        <ArrowLeft size={15} />
        Back to leads
      </button>
      {loading ? <LoadingSkeleton lines={10} className={panelClass} /> : null}
      {error && !loading ? <EmptyState title="Lead workspace could not be loaded" copy={error} /> : null}
      {!loading && !error && !row ? <EmptyState title="Lead not found" copy="This lead was not returned by the existing lead repository for the selected workspace." /> : null}
      {row ? (
        <>
          <header className={`${panelClass} p-5`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Lead Workspace</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-[-0.045em] text-slate-950">{row.name}</h1>
                <ContactLines row={row} />
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill tone={getStageTone(row.stage)}>{row.stage}</StatusPill>
                <StatusPill>{row.source}</StatusPill>
                {row.transactionCount || row.convertedTransactionId ? <StatusPill tone="green">Converted</StatusPill> : null}
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Metric label="Response Time" value={workspaceAnalytics?.responseTimeLabel || 'Pending'} icon={Clock3} />
              <Metric label="Touchpoints" value={workspaceAnalytics?.touchpoints || 0} icon={MessageSquarePlus} />
              <Metric label="Matches" value={workspaceAnalytics?.matches || 0} icon={Home} />
              <Metric label="Viewings" value={workspaceAnalytics?.viewings || 0} icon={CalendarDays} />
              <Metric label="Offers" value={workspaceAnalytics?.offers || 0} icon={FileText} />
              <Metric label="Transactions" value={row.transactionCount || (row.convertedTransactionId ? 1 : 0)} icon={CheckCircle2} />
            </div>
          </header>

          <nav className={`${panelClass} flex gap-2 overflow-x-auto p-2`} aria-label="Lead workspace tabs">
            {tabs.map((tab) => (
              <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`min-h-10 shrink-0 rounded-xl px-3 text-sm font-semibold ${activeTab === tab.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {tab.label}
              </button>
            ))}
          </nav>

          {activeTab === 'overview' ? (
            <section className={`${panelClass} p-5`}>
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Overview</h2>
              <OwnershipCard organisationId={organisationId} lead={row} actor={actor} onSaved={loadWorkspace} />
              <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Phone" value={row.phone || 'No phone'} />
                <Field label="Email" value={row.email || 'No email'} />
                <Field label="Lead Source" value={sourceInfo?.leadSource || row.source} />
                <Field label="Original Source" value={sourceInfo?.originalSource} />
                <Field label="First Source" value={sourceInfo?.firstSource} />
                <Field label="Latest Source" value={sourceInfo?.latestSource} />
                <Field label="Status" value={row.status} />
                <Field label="Assigned Agent" value={row.assignedAgent} />
                <Field label="Created" value={formatDate(row.createdAt)} />
                <Field label="Last Updated" value={formatDateTime(row.updatedAt)} />
                <Field label="Contact Id" value={row.contactId || 'No contact link'} />
                <Field label="Listing Id" value={row.listingId || 'No listing link'} />
                <Field label="Converted Transaction" value={row.convertedTransactionId || 'Not converted'} />
                <Field label="Legacy Budget" value={row.budget ? formatCurrency(row.budget) : '—'} />
                <Field label="Area Interest" value={row.areaInterest || row.area_interest} />
                <Field label="Property Interest" value={row.propertyInterest || row.property_interest} />
              </dl>
              <CommunicationHealthCard lead={row} />
              {row.notes ? <p className="mt-5 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{row.notes}</p> : null}
              <section className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-950">Enquiry History</h3>
                  <StatusPill>{sourceInfo?.enquiryActivities?.length || 0} enquiries</StatusPill>
                </div>
                <div className="mt-3">
                  {sourceInfo?.enquiryActivities?.length ? (
                    <TimelineList items={sourceInfo.enquiryActivities} />
                  ) : (
                    <EmptyState title="No enquiry history yet" copy="External Property24, Private Property, website, WhatsApp, referral, and import enquiries will appear here once ingested." />
                  )}
                </div>
              </section>
            </section>
          ) : null}

          {activeTab === 'requirements' ? (
            <LeadRequirementsPanel
              organisationId={organisationId}
              lead={row}
              requirements={data?.requirements || row.requirements || []}
              actor={actor}
              onSaved={loadWorkspace}
            />
          ) : null}

          {activeTab === 'suggestions' ? (
            <LeadSuggestionsPanel
              organisationId={organisationId}
              lead={row}
              suggestions={data?.suggestions || row.suggestions || []}
              actor={actor}
              onSaved={loadWorkspace}
              onShare={setShareDraft}
            />
          ) : null}

          {activeTab === 'saved_searches' ? (
            <SavedSearchesPanel
              organisationId={organisationId}
              lead={row}
              requirements={data?.requirements || row.requirements || []}
              savedSearches={data?.savedSearches || row.savedSearches || []}
              propertyShares={data?.propertyShares || row.propertyShares || []}
              actor={actor}
              onSaved={loadWorkspace}
            />
          ) : null}

          {activeTab === 'timeline' ? (
            <CommunicationTimelinePanel
              organisationId={organisationId}
              lead={row}
              actor={actor}
              timeline={data?.timeline || row.communicationTimeline || []}
              onSaved={loadWorkspace}
            />
          ) : null}

          {activeTab === 'recommendations' ? (
            <LeadRecommendationsPanel
              recommendations={data?.recommendations || row.recommendations || []}
              actor={actor}
              onSaved={loadWorkspace}
              onShare={openShareFromRecommendation}
            />
          ) : null}

          {activeTab === 'tasks' ? (
            <section className={`${panelClass} p-5`}>
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Tasks</h2>
              <TaskForm organisationId={organisationId} leadId={row.leadId} actor={actor} onSaved={loadWorkspace} />
              <div className="mt-5"><TaskList items={row.tasks} /></div>
            </section>
          ) : null}

          {activeTab === 'listings' ? (
            <LeadListingInterestsPanel
              organisationId={organisationId}
              lead={row}
              interests={data?.listingInterests || row.listingInterests || []}
              requirements={data?.requirements || row.requirements || []}
              actor={actor}
              onSaved={loadWorkspace}
              onShare={setShareDraft}
            />
          ) : null}

          {activeTab === 'appointments' ? (
            <section className={`${panelClass} p-5`}>
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Appointments</h2>
              <div className="mt-5"><AppointmentList items={row.appointments} /></div>
            </section>
          ) : null}

          {activeTab === 'offers' ? (
            <section className={`${panelClass} p-5`}>
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Offers / Transactions</h2>
              <div className="mt-5"><OfferTransactionList offers={row.offers} transactions={row.transactions} convertedTransactionId={row.convertedTransactionId} /></div>
            </section>
          ) : null}
        </>
      ) : null}
      {shareDraft && row ? (
        <PropertyShareDialog
          draft={shareDraft}
          organisationId={organisationId}
          lead={row}
          requirements={data?.requirements || row.requirements || []}
          savedSearches={data?.savedSearches || row.savedSearches || []}
          actor={actor}
          onClose={() => setShareDraft(null)}
          onSaved={async () => {
            setShareDraft(null)
            await loadWorkspace()
          }}
        />
      ) : null}
    </main>
  )
}

export default function AgentLeadsPage() {
  const { leadId } = useParams()
  return leadId ? <AgentLeadWorkspace /> : <AgentLeadList />
}
