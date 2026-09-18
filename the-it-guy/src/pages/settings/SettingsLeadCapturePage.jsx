import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Inbox,
  IdCard,
  Mail,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Search,
  UserRound,
  UsersRound,
  Wrench,
  X,
  XCircle,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchOrganisationSettings, listOrganisationUsers } from '../../lib/settingsApi'
import {
  buildAgencyAgentCardUrls,
  listAgencyAgentCardLinks,
  loadAgencyAgentCardInsights,
  saveAgencyAgentCardLink,
} from '../../services/agencyPublicIntakeLinkService'
import {
  buildAgentDigitalCardFileBaseName,
  buildAgentDigitalCardCampaignUrl,
  buildAgentDigitalCardShareKit,
  buildAgentDigitalCardShareKitCsv,
  downloadAgentDigitalCardQrPng,
  downloadAgentDigitalCardTextFile,
} from '../../services/agentDigitalCardShareService'
import { resolveAgencyPublicCardListings } from '../../services/agencyPublicIntakeService'
import {
  buildLeadCaptureDnsChecklist,
  buildLeadCaptureReviewQueueRows,
  buildLeadCaptureRepairDraft,
  buildLeadCaptureWebhookUrl,
  buildLeadCaptureStatusRows,
  ensureDefaultLeadCaptureAliases,
  ensureLeadCaptureAliasesForUsers,
  filterLeadCaptureReviewQueueRows,
  getLeadCaptureSetupStatus,
  getPrimaryLeadCaptureAliases,
  ignoreLeadCaptureReviewItem,
  isPrimaryLeadCaptureAlias,
  LEAD_CAPTURE_CONFIDENCE_FILTERS,
  LEAD_CAPTURE_PRODUCTION_CHECKLIST,
  LEAD_CAPTURE_PRODUCTION_ENV_VARS,
  LEAD_CAPTURE_REVIEW_STATUSES,
  LEAD_CAPTURE_SOURCES,
  listInboundLeadEmails,
  listLeadCaptureAliases,
  listLeadParseFailures,
  linkLeadCaptureReviewItem,
  repairLeadCaptureReviewItem,
  resolveLeadCaptureReviewItem,
} from '../../services/leadEmailCaptureService'
import {
  completeMetaLeadAdsAuthorization,
  connectMetaLeadAdsPage,
  listMetaLeadAdsConnections,
  listMetaLeadAdsForms,
  listMetaLeadAdsImports,
  previewMetaLeadAdsImport,
  processMetaLeadAdsImportBatch,
  selectMetaLeadAdsForms,
  startMetaLeadAdsAuthorization,
} from '../../services/metaLeadAdsService'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  settingsCardClass,
  settingsPageClass,
} from './settingsUi'

const STATUS_META = {
  active: { label: 'Active', tone: 'success' },
  test_received: { label: 'Test Received', tone: 'blue' },
  addresses_generated: { label: 'Ready', tone: 'warning' },
  not_started: { label: 'Not Started', tone: 'slate' },
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function formatDateTime(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never'
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatConfidence(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'Not scored'
  return `${Math.round(Number(value) * 100)}%`
}

function getUserId(user = {}) {
  return normalizeText(user.userId || user.user_id || user.id)
}

function getUserDisplayName(user = {}) {
  return normalizeText(user.fullName || user.full_name || user.name || [user.firstName || user.first_name, user.lastName || user.last_name].filter(Boolean).join(' ')) || normalizeText(user.email) || getUserId(user) || 'Agent'
}

function getUserEmail(user = {}) {
  return normalizeText(user.email || user.emailAddress || user.email_address).toLowerCase()
}

function getUserPhone(user = {}) {
  return normalizeText(user.phone || user.phoneNumber || user.phone_number || user.mobile || user.mobileNumber || user.mobile_number)
}

function getUserJobTitle(user = {}) {
  return normalizeText(user.jobTitle || user.job_title || user.role || user.workspaceRole || user.workspace_role)
}

function getUserAvatarUrl(user = {}) {
  return normalizeText(user.avatarUrl || user.avatar_url || user.profile?.avatarUrl || user.profile?.avatar_url)
}

function buildAgentCardShareProfile({ user = {}, card = null, urls = {}, organisationName = '' } = {}) {
  const cardAgent = card?.agentDigitalCard?.agent || {}
  return {
    agentName: normalizeText(cardAgent.name) || getUserDisplayName(user),
    agentEmail: normalizeText(cardAgent.email) || getUserEmail(user),
    agentPhone: normalizeText(cardAgent.phone || cardAgent.whatsapp) || getUserPhone(user),
    agentJobTitle: normalizeText(cardAgent.jobTitle) || getUserJobTitle(user),
    organisationName: normalizeText(organisationName) || 'Agency',
    shareUrl: normalizeText(urls.shareUrl || urls.cardUrl || urls.intakeUrl),
  }
}

function isActiveAgentUser(user = {}) {
  const userId = getUserId(user)
  if (!userId) return false
  const status = normalizeText(user.status || user.membershipStatus || user.membership_status || 'active').toLowerCase()
  return !['disabled', 'archived', 'revoked', 'inactive'].includes(status)
}

function getPublicShareHost() {
  if (typeof window === 'undefined') return 'https://app.arch9.co.za'
  return window.location.origin || 'https://app.arch9.co.za'
}

function statusToneClass(tone = 'slate') {
  if (tone === 'success') return 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]'
  if (tone === 'blue') return 'border-[#c9ddf3] bg-[#f3f8fe] text-[#255e96]'
  if (tone === 'warning') return 'border-[#f4dfa8] bg-[#fff9ed] text-[#9a6408]'
  return 'border-[#dce5ef] bg-[#f7f9fc] text-[#5f7288]'
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.not_started
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusToneClass(meta.tone)}`}>
      {meta.label}
    </span>
  )
}

function IconButton({ label, icon: Icon, onClick, disabled = false }) {
  const icon = Icon ? createElement(Icon, { size: 15 }) : null
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#d7e2ee] bg-white text-[#35546c] transition hover:border-[#bfccdb] hover:bg-[#f7fafd] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {icon}
    </button>
  )
}

function PrimaryButton({ children, onClick, disabled = false, icon: Icon = null }) {
  const icon = Icon ? createElement(Icon, { size: 16 }) : null
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-[#244b76] bg-[#274e7a] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f4167] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {icon}
      {children}
    </button>
  )
}

function SecondaryButton({ children, onClick, disabled = false, icon: Icon = null }) {
  const icon = Icon ? createElement(Icon, { size: 16 }) : null
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-[#d7e2ee] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#bfccdb] hover:bg-[#f7fafd] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {icon}
      {children}
    </button>
  )
}

function AliasAddressRow({ alias, onCopy }) {
  return (
    <div className="grid gap-3 rounded-[14px] border border-[#e3ebf3] bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-[#162334]">{alias.source || 'General'}</span>
          <span className="rounded-full border border-[#dfe7f0] bg-[#f8fbfe] px-2 py-0.5 text-xs font-semibold text-[#6a7b90]">{alias.routingLevel}</span>
        </div>
        <p className="mt-1 break-all font-mono text-sm text-[#35546c]">{alias.emailAddress}</p>
      </div>
      <IconButton label={`Copy ${alias.source || 'lead'} address`} icon={Copy} onClick={() => onCopy(alias.emailAddress)} />
    </div>
  )
}

function AgentStatusRow({ row, onCopy }) {
  const primaryAlias = getPrimaryLeadCaptureAliases(row.aliases)[0] || row.aliases[0] || null
  return (
    <tr className="border-t border-[#e8eef5] align-top">
      <td className="px-4 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-[#d9e4ef] bg-[#f8fbff] text-[#35546c]">
            {row.role === 'agency' ? <UsersRound size={16} /> : <UserRound size={16} />}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-[#162334]">{row.name}</p>
            {row.email ? <p className="truncate text-sm text-[#6b7d93]">{row.email}</p> : null}
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <StatusPill status={row.status} />
      </td>
      <td className="px-4 py-4">
        {primaryAlias ? (
          <div className="flex max-w-[340px] items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[10px] border border-[#e0e8f1] bg-[#fbfdff] px-3 py-2 text-xs text-[#35546c]">
              {primaryAlias.emailAddress}
            </code>
            <IconButton label={`Copy address for ${row.name}`} icon={Copy} onClick={() => onCopy(primaryAlias.emailAddress)} />
          </div>
        ) : (
          <span className="text-sm text-[#8a9aab]">No address</span>
        )}
      </td>
      <td className="px-4 py-4 text-sm text-[#526981]">
        {formatDateTime(row.lastInboundEmail?.receivedAt)}
      </td>
    </tr>
  )
}

function MetricCard({ label, value, icon: Icon }) {
  const icon = Icon ? createElement(Icon, { size: 19 }) : null
  return (
    <div className={settingsCardClass}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8da6]">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-[#162334]">{value}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#d9e4ef] bg-white text-[#35546c]">
          {icon}
        </span>
      </div>
    </div>
  )
}

function formatPercentage(value = 0, total = 0) {
  if (!total) return '0%'
  return `${Math.round((Number(value || 0) / Number(total || 1)) * 100)}%`
}

function AgentDigitalCardPerformanceOverview({ insights = null }) {
  const summary = insights?.summary || {}
  const sourceRows = Object.entries(summary.bySourceChannel || {})
    .map(([source, metrics]) => ({ source, ...metrics }))
    .sort((left, right) => (right.totalLeads - left.totalLeads) || (right.contactClicks - left.contactClicks) || (right.views - left.views))
    .slice(0, 6)
  const campaignRows = Object.entries(summary.byCampaignCode || {})
    .filter(([campaign]) => campaign !== 'unattributed')
    .map(([campaign, metrics]) => ({ campaign, ...metrics }))
    .sort((left, right) => (right.totalLeads - left.totalLeads) || (right.views - left.views))
    .slice(0, 3)

  return (
    <div className="mb-5 rounded-[18px] border border-[#dbe7f1] bg-[#f8fbfe] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#54728f]"><BarChart3 size={14} /> Digital-card funnel</p>
          <h3 className="mt-1 text-lg font-semibold text-[#162334]">What turns card views into enquiries</h3>
          <p className="mt-1 text-sm text-[#60758d]">Last {insights?.windowDays || 30} days across all agent cards.</p>
        </div>
        <span className="rounded-full border border-[#d7e5f1] bg-white px-3 py-1 text-xs font-semibold text-[#54728f]">{summary.views || 0} visits tracked</span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {[
          ['Views', summary.views || 0, 'Reach'],
          ['Contact actions', summary.contactClicks || 0, formatPercentage(summary.contactClicks, summary.views)],
          ['Property interest', summary.listingClicks || 0, formatPercentage(summary.listingClicks, summary.views)],
          ['Enquiries', summary.totalLeads || 0, formatPercentage(summary.totalLeads, summary.views)],
        ].map(([label, value, detail]) => (
          <div key={label} className="rounded-[12px] border border-[#dce7f1] bg-white px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#71849a]">{label}</p>
            <p className="mt-1 text-xl font-semibold text-[#162334]">{value}</p>
            <p className="mt-1 text-xs text-[#71849a]">{detail}</p>
          </div>
        ))}
      </div>

      {sourceRows.length ? (
        <div className="mt-4 overflow-hidden rounded-[12px] border border-[#dce7f1] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f4f8fc] text-xs font-semibold uppercase tracking-[0.1em] text-[#71849a]">
              <tr><th className="px-3 py-2">Source</th><th className="px-3 py-2">Views</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Enquiries</th><th className="px-3 py-2">Conversion</th></tr>
            </thead>
            <tbody>
              {sourceRows.map((row) => (
                <tr key={row.source} className="border-t border-[#e8eef5] text-[#526981]">
                  <td className="px-3 py-2.5 font-semibold capitalize text-[#263c52]">{row.source}</td><td className="px-3 py-2.5">{row.views || 0}</td><td className="px-3 py-2.5">{row.contactClicks || 0}</td><td className="px-3 py-2.5">{row.totalLeads || 0}</td><td className="px-3 py-2.5 font-semibold">{formatPercentage(row.totalLeads, row.views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-4 rounded-[12px] border border-dashed border-[#cfdeeb] bg-white px-3 py-4 text-sm text-[#71849a]">Source performance will appear after visitors use a card link or submit an enquiry.</p>}

      {campaignRows.length ? <p className="mt-3 text-xs text-[#60758d]">Top campaigns: {campaignRows.map((row) => `${row.campaign} (${row.totalLeads || 0} enquiries)`).join(' · ')}</p> : null}
    </div>
  )
}

function addCardMetrics(total, summary = {}) {
  for (const key of ['views', 'contactClicks', 'listingClicks', 'totalLeads']) total[key] += Number(summary[key] || 0)
  total.cards += 1
  return total
}

function AgentCardRolloutOverview({ rows = [] }) {
  const cohorts = rows.reduce((result, row) => {
    if (!row.card || row.card.status !== 'active') return result
    const stage = row.card.agentDigitalCard?.rollout?.stage === 'pilot' ? 'pilot' : 'standard'
    addCardMetrics(result[stage], row.insights?.summary || {})
    return result
  }, {
    pilot: { cards: 0, views: 0, contactClicks: 0, listingClicks: 0, totalLeads: 0 },
    standard: { cards: 0, views: 0, contactClicks: 0, listingClicks: 0, totalLeads: 0 },
  })
  const pilotReady = cohorts.pilot.cards > 0 && cohorts.pilot.views >= 20 && cohorts.pilot.totalLeads > 0

  return (
    <div className="mb-5 rounded-[18px] border border-[#dbe7f1] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#54728f]">Controlled rollout</p><h3 className="mt-1 text-lg font-semibold text-[#162334]">Pilot before broad distribution</h3><p className="mt-1 text-sm text-[#60758d]">Keep a small cohort tagged as Pilot, review its real engagement, then move cards to Standard when ready.</p></div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${pilotReady ? statusToneClass('success') : statusToneClass('warning')}`}>{pilotReady ? 'Pilot has lead evidence' : 'Collect pilot evidence'}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {['pilot', 'standard'].map((stage) => {
          const cohort = cohorts[stage]
          return <div key={stage} className="rounded-[12px] border border-[#e0e8f1] bg-[#f8fbfe] p-3"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#71849a]">{stage === 'pilot' ? 'Pilot cohort' : 'Standard rollout'}</p><p className="mt-1 text-xl font-semibold capitalize text-[#162334]">{cohort.cards} {cohort.cards === 1 ? 'card' : 'cards'}</p><p className="mt-2 text-sm text-[#526981]">{cohort.views} views · {cohort.contactClicks} contact actions · {cohort.totalLeads} enquiries</p></div>
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-[#71849a]">Recommended gate: review at least 20 pilot visits and one genuine enquiry before expanding QR, WhatsApp, email-signature, and social distribution.</p>
    </div>
  )
}

function AgentCardManagementRow({
  user,
  card,
  urls,
  insights = null,
  saving = false,
  assetBusy = '',
  onCreate,
  onActivate,
  onDisable,
  onCopy,
  onOpen,
  onCopyShareText,
  onDownloadQr,
  onDownloadVcard,
  onEdit,
}) {
  const status = card?.status || 'not_created'
  const active = status === 'active'
  const disabled = ['disabled', 'archived'].includes(status)
  const summary = insights?.summary || {}
  const rowDisabled = saving || Boolean(assetBusy)
  const features = card?.agentDigitalCard?.features || {}
  const rolloutStage = card?.agentDigitalCard?.rollout?.stage === 'pilot' ? 'pilot' : 'standard'
  return (
    <tr className="border-t border-[#e8eef5] align-top">
      <td className="px-4 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-[#d9e4ef] bg-[#f8fbff] text-[#35546c]">
            <UserRound size={16} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-[#162334]">{getUserDisplayName(user)}</p>
            {getUserEmail(user) ? <p className="truncate text-sm text-[#6b7d93]">{getUserEmail(user)}</p> : null}
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        {card ? (
          <div className="grid gap-2">
            <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${active ? statusToneClass('success') : disabled ? statusToneClass('slate') : statusToneClass('warning')}`}>
              {active ? 'Active' : disabled ? 'Disabled' : 'Draft'}
            </span>
            {active && insights ? (
              <span className="text-xs font-medium text-[#7b8da6]">
                30d: {summary.views || 0} views · {summary.totalLeads || 0} leads
              </span>
            ) : null}
            {card ? <span className={`inline-flex w-fit items-center rounded-full border px-2 py-1 text-xs font-semibold ${rolloutStage === 'pilot' ? statusToneClass('warning') : statusToneClass('blue')}`}>{rolloutStage === 'pilot' ? 'Pilot cohort' : 'Standard rollout'}</span> : null}
          </div>
        ) : (
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusToneClass('slate')}`}>
            Not Created
          </span>
        )}
      </td>
      <td className="px-4 py-4">
        {card?.slug ? (
          <div className="grid max-w-[420px] gap-2">
            <code className="min-w-0 truncate rounded-[10px] border border-[#e0e8f1] bg-[#fbfdff] px-3 py-2 text-xs text-[#35546c]">
              {urls.shareUrl || urls.cardUrl}
            </code>
          </div>
        ) : (
          <span className="text-sm text-[#8a9aab]">Generate to create URLs</span>
        )}
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-wrap gap-2">
          {card?.slug ? (
            <>
              <IconButton label={`Copy share-ready card link for ${getUserDisplayName(user)}`} icon={Copy} onClick={() => onCopy(urls.shareUrl || urls.cardUrl)} disabled={saving} />
              <IconButton label={`Open card for ${getUserDisplayName(user)}`} icon={ExternalLink} onClick={() => onOpen(urls.cardUrl)} disabled={saving} />
              <IconButton label={`Copy share message for ${getUserDisplayName(user)}`} icon={Mail} onClick={() => onCopyShareText(user, card, urls)} disabled={rowDisabled} />
              <IconButton label={`Download QR code for ${getUserDisplayName(user)}`} icon={QrCode} onClick={() => onDownloadQr(user, card, urls)} disabled={rowDisabled || features.qr === false} />
              <IconButton label={`Download contact file for ${getUserDisplayName(user)}`} icon={Download} onClick={() => onDownloadVcard(user, card, urls)} disabled={rowDisabled || features.vcf === false} />
              <IconButton label={`Edit digital card for ${getUserDisplayName(user)}`} icon={Pencil} onClick={() => onEdit(user, card)} disabled={saving} />
            </>
          ) : null}
          {!card ? (
            <SecondaryButton icon={Plus} onClick={() => onCreate(user)} disabled={saving}>Create card</SecondaryButton>
          ) : active ? (
            <SecondaryButton icon={XCircle} onClick={() => onDisable(user, card)} disabled={saving}>Disable</SecondaryButton>
          ) : (
            <SecondaryButton icon={CheckCircle2} onClick={() => onActivate(user, card)} disabled={saving}>Activate</SecondaryButton>
          )}
        </div>
      </td>
    </tr>
  )
}

function CardEditorField({ label, value, onChange, placeholder = '', type = 'text', multiline = false, hint = '' }) {
  const className = "min-h-10 w-full rounded-[12px] border border-[#d7e2ee] bg-white px-3 py-2 text-sm text-[#162334] outline-none transition focus:border-[#274e7a] focus:ring-2 focus:ring-[#d9e8f6]"
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">{label}</span>
      {multiline ? (
        <textarea value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} className={className} />
      ) : (
        <input type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={className} />
      )}
      {hint ? <span className="text-xs text-[#7b8da6]">{hint}</span> : null}
    </label>
  )
}

function CardEditorToggle({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-[#e0e8f1] bg-[#fbfdff] p-3">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#274e7a]" />
      <span>
        <span className="block text-sm font-semibold text-[#263c52]">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-[#71849a]">{description}</span>
      </span>
    </label>
  )
}

function AgentCardEditorDialog({ editor, listingOptions = [], listingLoading = false, onChange, onClose, onSave, saving = false }) {
  if (!editor) return null
  const { user, draft } = editor
  const update = (field, value) => onChange((current) => ({ ...current, draft: { ...current.draft, [field]: value } }))
  const featuredListingIds = Array.isArray(draft.featuredListingIds) ? draft.featuredListingIds : []
  const updateFeaturedListing = (index, value) => {
    const next = [...featuredListingIds]
    next[index] = value
    update('featuredListingIds', [...new Set(next.filter(Boolean))].slice(0, 3))
  }
  const initials = (draft.name || getUserDisplayName(user)).slice(0, 1).toUpperCase()

  return (
    <div className="fixed inset-0 z-[140] overflow-y-auto bg-[#12233a]/50 p-4 sm:p-6" role="dialog" aria-modal="true" aria-label={`Edit digital card for ${getUserDisplayName(user)}`}>
      <div className="mx-auto grid w-full max-w-6xl gap-5 rounded-[22px] bg-[#f7fafc] p-4 shadow-2xl lg:grid-cols-[minmax(0,1fr)_320px] lg:p-6">
        <section className="min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#71849a]">Digital card editor</p>
              <h2 className="mt-1 text-xl font-semibold text-[#162334]">{getUserDisplayName(user)}</h2>
              <p className="mt-1 text-sm text-[#60758d]">Changes are saved directly to this agent’s public card.</p>
            </div>
            <IconButton label="Close card editor" icon={X} onClick={onClose} disabled={saving} />
          </div>

          <div className="mt-6 grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <CardEditorField label="Display name" value={draft.name} onChange={(value) => update('name', value)} />
              <CardEditorField label="Job title" value={draft.jobTitle} onChange={(value) => update('jobTitle', value)} placeholder="Property Practitioner" />
              <CardEditorField label="Email" type="email" value={draft.email} onChange={(value) => update('email', value)} />
              <CardEditorField label="Phone" type="tel" value={draft.phone} onChange={(value) => update('phone', value)} />
              <CardEditorField label="WhatsApp" type="tel" value={draft.whatsapp} onChange={(value) => update('whatsapp', value)} hint="Use the full international number for the most reliable WhatsApp link." />
              <CardEditorField label="Profile photo URL" type="url" value={draft.avatarUrl} onChange={(value) => update('avatarUrl', value)} placeholder="https://…" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <CardEditorField label="Card heading" value={draft.heading} onChange={(value) => update('heading', value)} placeholder="Your local property expert" />
              <CardEditorField label="Buyer button" value={draft.buyerCtaLabel} onChange={(value) => update('buyerCtaLabel', value)} />
              <div className="sm:col-span-2">
                <CardEditorField label="Personal introduction" value={draft.introduction} onChange={(value) => update('introduction', value)} multiline placeholder="Tell visitors how you can help them." />
              </div>
              <CardEditorField label="Seller button" value={draft.sellerCtaLabel} onChange={(value) => update('sellerCtaLabel', value)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <CardEditorField label="Specialties" value={draft.specialties} onChange={(value) => update('specialties', value)} placeholder="Luxury homes, first-time buyers" hint="Separate each item with a comma." />
              <CardEditorField label="Areas served" value={draft.serviceAreas} onChange={(value) => update('serviceAreas', value)} placeholder="Sea Point, Green Point" hint="Separate each item with a comma." />
              <CardEditorField label="Languages" value={draft.languages} onChange={(value) => update('languages', value)} placeholder="English, Afrikaans" hint="Separate each item with a comma." />
              <CardEditorField label="Credentials and recognition" value={draft.credentials} onChange={(value) => update('credentials', value)} placeholder="PPRA registered, Top performer 2025" hint="Separate each item with a comma." />
              <div className="grid gap-2 sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">Featured properties</span>
                {editor.card?.slug ? [0, 1, 2].map((index) => (
                  <select key={index} value={featuredListingIds[index] || ''} onChange={(event) => updateFeaturedListing(index, event.target.value)} className="min-h-10 rounded-[12px] border border-[#d7e2ee] bg-white px-3 text-sm text-[#162334] outline-none transition focus:border-[#274e7a] focus:ring-2 focus:ring-[#d9e8f6]" disabled={listingLoading}>
                    <option value="">{index === 0 ? 'Use the newest public listings' : `Featured property ${index + 1} (optional)`}</option>
                    {listingOptions.map((listing) => <option key={listing.id} value={listing.id}>{listing.title || listing.slug || 'Property listing'}{listing.suburb ? ` · ${listing.suburb}` : ''}</option>)}
                  </select>
                )) : <p className="rounded-[12px] border border-dashed border-[#d7e2ee] bg-white px-3 py-3 text-sm text-[#71849a]">Save this card first, then choose up to three public properties to feature.</p>}
                {listingLoading ? <span className="text-xs text-[#71849a]">Loading this agent’s public listings…</span> : null}
              </div>
            </div>

            <label className="grid gap-1.5"><span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">Rollout cohort</span><select value={draft.rolloutStage} onChange={(event) => update('rolloutStage', event.target.value)} className="min-h-10 rounded-[12px] border border-[#d7e2ee] bg-white px-3 text-sm text-[#162334] outline-none transition focus:border-[#274e7a] focus:ring-2 focus:ring-[#d9e8f6]"><option value="pilot">Pilot — limited distribution and measured review</option><option value="standard">Standard — ready for broad distribution</option></select></label>

            <div className="grid gap-3 sm:grid-cols-2">
              <CardEditorToggle label="Buyer enquiries" description="Show the buyer enquiry action." checked={draft.buyEnabled} onChange={(value) => update('buyEnabled', value)} />
              <CardEditorToggle label="Seller enquiries" description="Show the valuation and seller action." checked={draft.sellEnabled} onChange={(value) => update('sellEnabled', value)} />
              <CardEditorToggle label="Show listings" description="Show this agent’s public listings on the card." checked={draft.listingsEnabled} onChange={(value) => update('listingsEnabled', value)} />
              <CardEditorToggle label="Save contact" description="Allow visitors to download the contact card." checked={draft.vcfEnabled} onChange={(value) => update('vcfEnabled', value)} />
              <CardEditorToggle label="Share controls" description="Show the share and copy-link actions." checked={draft.shareEnabled} onChange={(value) => update('shareEnabled', value)} />
              <CardEditorToggle label="QR distribution" description="Allow the team to download a QR asset for this card." checked={draft.qrEnabled} onChange={(value) => update('qrEnabled', value)} />
            </div>
          </div>

          <p className="mt-5 text-xs leading-5 text-[#71849a]">Website and social links use the agency’s existing public identity settings, so every agent card stays on-brand.</p>
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-[#e0e8f1] pt-4">
            <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
            <SecondaryButton icon={Save} onClick={() => onSave('draft')} disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</SecondaryButton>
            <PrimaryButton icon={CheckCircle2} onClick={() => onSave('active')} disabled={saving}>{saving ? 'Saving…' : 'Publish card'}</PrimaryButton>
          </div>
        </section>

        <aside className="rounded-[20px] bg-[#18354f] p-4 text-white shadow-[0_16px_36px_rgba(17,40,61,0.2)]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/55">Live mobile preview</p>
          <div className="mt-4 overflow-hidden rounded-[20px] bg-white text-[#162334] shadow-xl">
            <div className="h-20 bg-[linear-gradient(135deg,#18354f,#315f7c)]" />
            <div className="px-4 pb-5">
              <div className="-mt-10 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#e9f0f6] text-2xl font-semibold text-[#274e7a]">
                {draft.avatarUrl ? <img src={draft.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
              </div>
              <h3 className="mt-3 text-xl font-semibold">{draft.name || getUserDisplayName(user)}</h3>
              <p className="mt-1 text-sm font-semibold text-[#9a6408]">{draft.jobTitle || 'Property Practitioner'}</p>
              {draft.heading ? <p className="mt-4 font-semibold">{draft.heading}</p> : null}
              {draft.introduction ? <p className="mt-1 text-sm leading-5 text-[#60758d]">{draft.introduction}</p> : null}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-[#35546c]"><span>Call</span><span>WhatsApp</span><span>Email</span></div>
              {draft.buyEnabled ? <div className="mt-4 rounded-[12px] bg-[#18354f] px-3 py-3 text-sm font-semibold text-white">{draft.buyerCtaLabel || 'I am looking to buy'}</div> : null}
              {draft.sellEnabled ? <div className="mt-2 rounded-[12px] bg-[#d8a83b] px-3 py-3 text-sm font-semibold text-[#162334]">{draft.sellerCtaLabel || 'I am looking to sell'}</div> : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function formatMatchedFields(fields = {}) {
  return Object.entries(fields || {})
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
    .slice(0, 6)
}

function ReviewQueueItem({ item, onRepair, onResolve, onIgnore, saving = false }) {
  const matchedFields = formatMatchedFields(item.matchedFields)
  return (
    <div className="rounded-[14px] border border-[#f3d9a8] bg-[#fffaf1] p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#f0d492] bg-white px-2.5 py-1 text-xs font-semibold text-[#7a5a1b]">{item.source || 'Unknown source'}</span>
            <span className="rounded-full border border-[#f0d492] bg-white px-2.5 py-1 text-xs font-semibold text-[#7a5a1b]">{formatConfidence(item.parseConfidence)}</span>
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a35]">{item.kind === 'failure' ? 'Parse Failure' : 'Low Confidence'}</span>
          </div>
          <p className="mt-3 font-semibold text-[#162334]">{item.reason || 'Parser review required'}</p>
          <p className="mt-1 text-sm text-[#7a5a1b]">
            {item.subject || item.fromEmail || 'Inbound lead email'} · {item.parserName || 'parser pending'} · {formatDateTime(item.receivedAt)}
          </p>
          {item.parseWarnings?.length ? <p className="mt-2 text-xs text-[#9a6408]">{item.parseWarnings.join(', ')}</p> : null}
          {matchedFields.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {matchedFields.map(([field, value]) => (
                <div key={field} className="min-w-0 rounded-[10px] border border-[#f0dfb5] bg-white px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9a7a35]">{field}</p>
                  <p className="mt-1 truncate text-sm text-[#35546c]">{String(value)}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <SecondaryButton icon={Wrench} onClick={() => onRepair(item)} disabled={saving}>Repair</SecondaryButton>
          <SecondaryButton icon={CheckCircle2} onClick={() => onResolve(item)} disabled={saving}>Resolve</SecondaryButton>
          <SecondaryButton icon={XCircle} onClick={() => onIgnore(item)} disabled={saving}>Ignore</SecondaryButton>
        </div>
      </div>
    </div>
  )
}

function RepairField({ label, value, onChange, placeholder = '', type = 'text' }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">{label}</span>
      <input
        type={type}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-10 rounded-[12px] border border-[#d7e2ee] bg-white px-3 text-sm text-[#162334] outline-none transition focus:border-[#274e7a] focus:ring-2 focus:ring-[#d9e8f6]"
      />
    </label>
  )
}

function RepairSelect({ label, value, onChange, options = [] }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">{label}</span>
      <select
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 rounded-[12px] border border-[#d7e2ee] bg-white px-3 text-sm text-[#162334] outline-none transition focus:border-[#274e7a] focus:ring-2 focus:ring-[#d9e8f6]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function RepairDrawer({ item, draft, users = [], onChange, onClose, onCreateLead, onLinkLead, saving = false }) {
  if (!item) return null
  const matchedFields = formatMatchedFields(item.matchedFields)
  const rawPreview = JSON.stringify(item.raw?.payload || item.raw || {}, null, 2)
  const update = (field) => (value) => onChange({ ...draft, [field]: value })
  const agentOptions = [
    { value: '', label: 'No assigned agent' },
    ...users.map((user) => {
      const userId = normalizeText(user.userId || user.id)
      return {
        value: userId,
        label: normalizeText(user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' ')) || user.email || userId,
      }
    }).filter((option) => option.value),
  ]
  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l border-[#d7e2ee] bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-[#e3ebf3] p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8da6]">Lead Capture Repair</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#162334]">{item.source || 'Inbound'} review</h2>
          <p className="mt-2 text-sm text-[#6b7d93]">{item.reason || 'Review required'} · {formatConfidence(item.parseConfidence)}</p>
        </div>
        <IconButton label="Close repair drawer" icon={X} onClick={onClose} disabled={saving} />
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <section className="grid gap-3 rounded-[14px] border border-[#e3ebf3] bg-[#f8fbfe] p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">Parser</p>
            <p className="mt-1 text-sm text-[#35546c]">{item.parserName || 'parser pending'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">Received</p>
            <p className="mt-1 text-sm text-[#35546c]">{formatDateTime(item.receivedAt)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">Original Email</p>
            <p className="mt-1 break-words text-sm text-[#35546c]">{item.subject || item.fromEmail || 'No subject captured'}</p>
          </div>
        </section>

        {matchedFields.length ? (
          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {matchedFields.map(([field, value]) => (
              <div key={field} className="min-w-0 rounded-[10px] border border-[#e3ebf3] bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">{field}</p>
                <p className="mt-1 truncate text-sm text-[#35546c]">{String(value)}</p>
              </div>
            ))}
          </section>
        ) : null}

        <section className="space-y-3 rounded-[14px] border border-[#e3ebf3] p-4">
          <h3 className="text-sm font-semibold text-[#162334]">Create Lead From Repaired Fields</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <RepairField label="Name" value={draft.name} onChange={update('name')} placeholder="Lead name" />
            <RepairField label="Email" value={draft.email} onChange={update('email')} placeholder="lead@example.com" />
            <RepairField label="Phone" value={draft.phone} onChange={update('phone')} placeholder="+27..." />
            <RepairField label="Source" value={draft.source} onChange={update('source')} placeholder="Property24" />
            <RepairField label="Listing Id" value={draft.listingId} onChange={update('listingId')} placeholder="Optional listing UUID" />
            <RepairField label="Listing Reference" value={draft.listingReference} onChange={update('listingReference')} placeholder="Portal reference" />
            <RepairField label="Budget" value={draft.budget} onChange={update('budget')} type="number" placeholder="0" />
            <RepairField label="Area" value={draft.areaInterest} onChange={update('areaInterest')} placeholder="Suburb or area" />
            <RepairField label="Property Type" value={draft.propertyType} onChange={update('propertyType')} placeholder="Apartment, house..." />
            <RepairSelect label="Assigned Agent" value={draft.assignedAgentId} onChange={update('assignedAgentId')} options={agentOptions} />
            <RepairField label="External Reference" value={draft.externalReference} onChange={update('externalReference')} placeholder="Provider message/reference" />
            <RepairField label="Review Note" value={draft.reviewNote} onChange={update('reviewNote')} placeholder="What was repaired" />
          </div>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">Message</span>
            <textarea
              value={draft.message || ''}
              onChange={(event) => update('message')(event.target.value)}
              className="min-h-28 rounded-[12px] border border-[#d7e2ee] bg-white px-3 py-2 text-sm text-[#162334] outline-none transition focus:border-[#274e7a] focus:ring-2 focus:ring-[#d9e8f6]"
              placeholder="Lead message"
            />
          </label>
          <PrimaryButton icon={ExternalLink} onClick={onCreateLead} disabled={saving || (!draft.email && !draft.phone && !draft.name)}>
            Create Lead
          </PrimaryButton>
        </section>

        <section className="space-y-3 rounded-[14px] border border-[#e3ebf3] p-4">
          <h3 className="text-sm font-semibold text-[#162334]">Link Existing Lead</h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <RepairField label="Lead Id" value={draft.leadId} onChange={update('leadId')} placeholder="Existing lead UUID" />
            <RepairField label="Contact Id" value={draft.contactId} onChange={update('contactId')} placeholder="Optional contact UUID" />
            <SecondaryButton icon={ExternalLink} onClick={onLinkLead} disabled={saving || !draft.leadId}>Link Lead</SecondaryButton>
          </div>
        </section>

        <details className="rounded-[14px] border border-[#e3ebf3] bg-[#f8fbfe] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#162334]">Raw review payload</summary>
          <pre className="mt-3 max-h-72 overflow-auto rounded-[12px] bg-[#162334] p-3 text-xs text-white">{rawPreview}</pre>
        </details>
      </div>
    </aside>
  )
}

function ReviewQueueFilters({ filters, setFilters, sources = [], users = [], total = 0, visible = 0 }) {
  const sourceOptions = ['all', ...new Set([...sources, 'Other'].filter(Boolean))]
  const agentOptions = [
    { value: 'all', label: 'All agents' },
    { value: 'unassigned', label: 'Unassigned' },
    ...users.map((user) => {
      const userId = normalizeText(user.userId || user.id)
      return {
        value: userId,
        label: normalizeText(user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' ')) || user.email || userId,
      }
    }).filter((option) => option.value),
  ]
  const update = (field) => (value) => setFilters((previous) => ({ ...previous, [field]: value }))
  return (
    <div className="grid gap-3 rounded-[14px] border border-[#e3ebf3] bg-[#f8fbfe] p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_repeat(4,minmax(150px,1fr))]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7b8da6]" size={15} />
          <input
            value={filters.search}
            onChange={(event) => update('search')(event.target.value)}
            className="min-h-10 w-full rounded-[12px] border border-[#d7e2ee] bg-white pl-9 pr-3 text-sm text-[#162334] outline-none transition focus:border-[#274e7a] focus:ring-2 focus:ring-[#d9e8f6]"
            placeholder="Search review queue"
          />
        </label>
        <select value={filters.status} onChange={(event) => update('status')(event.target.value)} className="min-h-10 rounded-[12px] border border-[#d7e2ee] bg-white px-3 text-sm text-[#162334]">
          <option value="all">All statuses</option>
          {LEAD_CAPTURE_REVIEW_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <select value={filters.source} onChange={(event) => update('source')(event.target.value)} className="min-h-10 rounded-[12px] border border-[#d7e2ee] bg-white px-3 text-sm text-[#162334]">
          {sourceOptions.map((source) => <option key={source} value={source}>{source === 'all' ? 'All sources' : source}</option>)}
        </select>
        <select value={filters.confidence} onChange={(event) => update('confidence')(event.target.value)} className="min-h-10 rounded-[12px] border border-[#d7e2ee] bg-white px-3 text-sm text-[#162334]">
          {LEAD_CAPTURE_CONFIDENCE_FILTERS.map((confidence) => <option key={confidence} value={confidence}>{confidence === 'all' ? 'All confidence' : confidence}</option>)}
        </select>
        <select value={filters.assignedAgentId} onChange={(event) => update('assignedAgentId')(event.target.value)} className="min-h-10 rounded-[12px] border border-[#d7e2ee] bg-white px-3 text-sm text-[#162334]">
          {agentOptions.map((option) => <option key={option.value || 'unassigned'} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">{visible} of {total} reviews shown</p>
    </div>
  )
}

function ProductionSetupSection({ domain, webhookUrl, dnsRows, onCopy }) {
  return (
    <SettingsSectionCard title="Production Email Setup" description="Provider, MX, webhook, and monitoring readiness for the capture domain.">
      <div className="grid gap-4">
        <div className="grid gap-3 rounded-[14px] border border-[#e3ebf3] bg-white p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">Inbound Webhook</p>
            <p className="mt-1 break-all font-mono text-sm text-[#35546c]">{webhookUrl}</p>
          </div>
          <IconButton label="Copy inbound webhook" icon={Copy} onClick={() => onCopy(webhookUrl)} />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {LEAD_CAPTURE_PRODUCTION_CHECKLIST.map((item) => (
            <div key={item.id} className="rounded-[14px] border border-[#e3ebf3] bg-white p-4">
              <p className="font-semibold text-[#162334]">{item.label}</p>
              <p className="mt-2 text-sm text-[#6b7d93]">{item.description}</p>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-[14px] border border-[#e3ebf3] bg-white">
          <table className="min-w-full text-left">
            <thead className="bg-[#f8fbfe] text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">
              <tr>
                <th className="px-4 py-3">Environment Variable</th>
                <th className="px-4 py-3">Required</th>
                <th className="px-4 py-3">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {LEAD_CAPTURE_PRODUCTION_ENV_VARS.map((row) => (
                <tr key={row.name} className="border-t border-[#e8eef5] align-top">
                  <td className="px-4 py-3 font-mono text-xs text-[#35546c]">{row.name}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-[#162334]">{row.required ? 'Yes' : 'Optional'}</td>
                  <td className="px-4 py-3 text-sm text-[#6b7d93]">{row.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-hidden rounded-[14px] border border-[#e3ebf3] bg-white">
          <table className="min-w-full text-left">
            <thead className="bg-[#f8fbfe] text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Host</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {dnsRows.map((row) => (
                <tr key={`${row.type}-${row.host}`} className="border-t border-[#e8eef5] align-top">
                  <td className="px-4 py-3 font-semibold text-[#162334]">{row.type}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#35546c]">{row.host || domain}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#35546c]">{row.priority ? `${row.priority} ${row.value}` : row.value}</td>
                  <td className="px-4 py-3 text-sm text-[#6b7d93]">{row.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SettingsSectionCard>
  )
}

export default function SettingsLeadCapturePage({ section = 'meta' }) {
  const { profile, role, currentWorkspace, workspaceType } = useWorkspace()
  const [context, setContext] = useState(null)
  const [users, setUsers] = useState([])
  const [aliases, setAliases] = useState([])
  const [agentCardLinks, setAgentCardLinks] = useState([])
  const [agentCardInsights, setAgentCardInsights] = useState(null)
  const [agentCardAssetBusy, setAgentCardAssetBusy] = useState('')
  const [agentCardEditor, setAgentCardEditor] = useState(null)
  const [agentCardListingOptions, setAgentCardListingOptions] = useState([])
  const [agentCardListingsLoading, setAgentCardListingsLoading] = useState(false)
  const [inboundEmails, setInboundEmails] = useState([])
  const [reviewItems, setReviewItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedRepairItem, setSelectedRepairItem] = useState(null)
  const [repairDraft, setRepairDraft] = useState({})
  const [reviewFilters, setReviewFilters] = useState({
    search: '',
    status: 'open',
    source: 'all',
    confidence: 'all',
    assignedAgentId: 'all',
  })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [metaConnections, setMetaConnections] = useState([])
  const [metaPages, setMetaPages] = useState([])
  const [metaForms, setMetaForms] = useState([])
  const [metaConnectionId, setMetaConnectionId] = useState('')
  const [metaImports, setMetaImports] = useState([])
  const [metaImportFormId, setMetaImportFormId] = useState('')
  const [metaImportFrom, setMetaImportFrom] = useState('')
  const [metaImportTo, setMetaImportTo] = useState('')
  const [metaImportPreview, setMetaImportPreview] = useState(null)
  const showMeta = section === 'meta'
  const showDigitalCards = section === 'digital-cards'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const nextContext = await fetchOrganisationSettings({ forceRefresh: true })
      const organisationId = normalizeText(nextContext?.organisation?.id || currentWorkspace?.id)
      if (!organisationId) {
        setContext(nextContext)
        setUsers([])
        setAliases([])
        setAgentCardLinks([])
        setAgentCardInsights(null)
        setInboundEmails([])
        setReviewItems([])
        return
      }
      const [nextUsers, nextAliases, nextAgentCardLinksResult, nextAgentCardInsightsResult, nextInboundEmails, nextFailures] = await Promise.all([
        listOrganisationUsers().catch(() => []),
        listLeadCaptureAliases(organisationId).catch((aliasError) => {
          if (String(aliasError?.message || '').toLowerCase().includes('lead_capture_aliases')) return []
          throw aliasError
        }),
        listAgencyAgentCardLinks({ organisationId, status: 'all' }).catch((cardError) => {
          if (String(cardError?.message || '').toLowerCase().includes('agency_public_intake_links')) return { links: [] }
          throw cardError
        }),
        loadAgencyAgentCardInsights({ organisationId, windowDays: 30 }).catch((insightError) => {
          if (String(insightError?.message || '').toLowerCase().includes('agency_agent_card_events')) return null
          throw insightError
        }),
        listInboundLeadEmails(organisationId, { limit: 200 }).catch((emailError) => {
          if (String(emailError?.message || '').toLowerCase().includes('inbound_lead_emails')) return []
          throw emailError
        }),
        listLeadParseFailures(organisationId, { limit: 200, status: '' }).catch((failureError) => {
          if (String(failureError?.message || '').toLowerCase().includes('lead_parse_failures')) return []
          if (String(failureError?.message || '').toLowerCase().includes('review_status')) return []
          throw failureError
        }),
      ])
      setContext(nextContext)
      setUsers(nextUsers)
      setAliases(nextAliases)
      setAgentCardLinks(nextAgentCardLinksResult?.links || [])
      setAgentCardInsights(nextAgentCardInsightsResult)
      setInboundEmails(nextInboundEmails)
      setReviewItems(buildLeadCaptureReviewQueueRows({
        failures: nextFailures,
        inboundEmails: nextInboundEmails,
        status: 'all',
      }))
      const meta = await listMetaLeadAdsConnections(organisationId).catch(() => ({ connections: [] }))
      const connections = meta.connections || []
      setMetaConnections(connections)
      const activeConnection = connections.find((connection) => connection.connection_status === 'connected')
      if (activeConnection?.id) {
        setMetaConnectionId(activeConnection.id)
        const forms = await listMetaLeadAdsForms(organisationId, activeConnection.id)
        setMetaForms(forms.forms || [])
        setMetaImportFormId((current) => current || forms.forms?.find((form) => form.selected)?.id || '')
        const imports = await listMetaLeadAdsImports(organisationId, activeConnection.id)
        setMetaImports(imports.imports || [])
      } else {
        setMetaConnectionId('')
        setMetaForms([])
        setMetaImports([])
        setMetaImportPreview(null)
      }
    } catch (loadError) {
      setError(loadError?.message || 'Lead capture settings could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace?.id])

  useEffect(() => {
    void load()
  }, [load])

  const resolvedWorkspaceType = context?.organisation?.type || currentWorkspace?.type || workspaceType || ''
  const membershipRole = normalizeOrganisationMembershipRole(context?.membershipRole || 'viewer', {
    appRole: role,
    workspaceType: resolvedWorkspaceType,
  })
  const canManage = canManageOrganisationSettings({
    appRole: role,
    membershipRole,
    workspaceType: resolvedWorkspaceType,
  })
  const organisationId = normalizeText(context?.organisation?.id || currentWorkspace?.id)

  useEffect(() => {
    if (!organisationId || typeof window === 'undefined') return
    const query = new URLSearchParams(window.location.search)
    if (query.get('meta_authorized') !== '1') return
    const state = query.get('state') || sessionStorage.getItem(`arch9:meta-lead-ads:${organisationId}`) || ''
    if (!state) return
    setSaving(true)
    completeMetaLeadAdsAuthorization(organisationId, state).then((result) => {
      setMetaPages(result.pages || [])
      setError('')
    }).catch((metaError) => setError(metaError.message)).finally(() => setSaving(false))
  }, [organisationId])

  async function authorizeMeta() {
    setSaving(true); setError('')
    try { window.location.assign(await startMetaLeadAdsAuthorization(organisationId, window.location.href.split('?')[0])) }
    catch (metaError) { setError(metaError.message || 'Meta authorisation could not start.'); setSaving(false) }
  }
  async function chooseMetaPage(pageId) {
    setSaving(true); setError('')
    try {
      const state=sessionStorage.getItem(`arch9:meta-lead-ads:${organisationId}`)||''
      const result=await connectMetaLeadAdsPage(organisationId,state,pageId)
      const connection=result.connection; setMetaConnectionId(connection.id)
      const forms=await listMetaLeadAdsForms(organisationId,connection.id); setMetaForms(forms.forms||[]); setMetaImportFormId(forms.forms?.find((form)=>form.selected)?.id||'')
    } catch(metaError) { setError(metaError.message||'Meta Page could not be connected.') } finally { setSaving(false) }
  }
  async function enableMetaForms() {
    setSaving(true); setError('')
    try {
      await selectMetaLeadAdsForms(organisationId,metaConnectionId,metaForms.filter((form)=>form.selected).map((form)=>({id:form.id,name:form.name,branchId:form.branchId||null,assignedAgentId:form.assignedAgentId||null,leadType:form.leadType||'buyer'})))
      setNotice('Facebook Lead Ads forms connected and subscribed to leadgen.'); await load()
    } catch(metaError) { setError(metaError.message||'Meta forms could not be enabled.') } finally { setSaving(false) }
  }
  async function refreshMetaImports() {
    if (!organisationId || !metaConnectionId) return
    const result = await listMetaLeadAdsImports(organisationId, metaConnectionId)
    setMetaImports(result.imports || [])
  }
  async function previewHistoricalMetaLeads() {
    if (!metaImportFormId) { setError('Choose an enabled Meta form before previewing historical leads.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      const result = await previewMetaLeadAdsImport(organisationId, metaConnectionId, metaImportFormId, metaImportFrom, metaImportTo)
      setMetaImportPreview(result.import || null)
      await refreshMetaImports()
      setNotice('Historical lead preview is ready. Confirm before any CRM leads are created.')
    } catch (metaError) { setError(metaError.message || 'Historical lead preview could not be created.') } finally { setSaving(false) }
  }
  async function processHistoricalMetaImport(importId) {
    setSaving(true); setError(''); setNotice('')
    try {
      let result = null
      for (let batch = 0; batch < 20; batch += 1) {
        result = await processMetaLeadAdsImportBatch(organisationId, metaConnectionId, importId)
        setMetaImportPreview(result.import || null)
        if (!result.import?.hasMore) break
      }
      await refreshMetaImports()
      setNotice(result?.import?.complete ? 'Historical lead import completed.' : 'Import paused after 500 leads. Continue it when you are ready.')
    } catch (metaError) { setError(metaError.message || 'Historical lead import could not continue.'); await refreshMetaImports().catch(() => {}) } finally { setSaving(false) }
  }
  const profileId = normalizeText(profile?.id)
  const currentUser = users.find((user) => normalizeText(user.userId || user.id) === profileId) || {
    userId: profileId,
    firstName: profile?.firstName,
    lastName: profile?.lastName,
    fullName: profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' '),
    email: profile?.email,
    role: membershipRole,
  }

  const rows = useMemo(
    () => buildLeadCaptureStatusRows({ aliases, inboundEmails, users }),
    [aliases, inboundEmails, users],
  )
  const agentCardRows = useMemo(() => {
    const cardsByAgentId = new Map()
    for (const card of agentCardLinks) {
      const agentId = normalizeText(card.defaultAssignedAgentId || card.agentDigitalCard?.agent?.userId)
      if (!agentId) continue
      const existing = cardsByAgentId.get(agentId)
      if (!existing || card.status === 'active' || (existing.status !== 'active' && String(card.updatedAt || '') > String(existing.updatedAt || ''))) {
        cardsByAgentId.set(agentId, card)
      }
    }
    return users
      .filter(isActiveAgentUser)
      .map((user) => {
        const userId = getUserId(user)
        const card = cardsByAgentId.get(userId) || null
        return {
          user,
          card,
          urls: buildAgencyAgentCardUrls({ slug: card?.slug || '', host: getPublicShareHost() }),
          insights: card?.id ? {
            summary: agentCardInsights?.summary?.byIntakeLink?.[card.id] || null,
            windowDays: agentCardInsights?.windowDays || 30,
          } : null,
        }
      })
  }, [agentCardInsights, agentCardLinks, users])
  const reviewItemsWithAssignment = useMemo(() => {
    const aliasesById = new Map(aliases.map((alias) => [alias.aliasId, alias]))
    return reviewItems.map((item) => {
      const alias = aliasesById.get(item.captureAliasId)
      return {
        ...item,
        assignedAgentId: item.assignedAgentId || alias?.agentUserId || '',
      }
    })
  }, [aliases, reviewItems])
  const filteredReviewItems = useMemo(
    () => filterLeadCaptureReviewQueueRows(reviewItemsWithAssignment, reviewFilters),
    [reviewFilters, reviewItemsWithAssignment],
  )
  const currentUserAliases = aliases.filter((alias) => alias.agentUserId === profileId || (!alias.agentUserId && !canManage))
  const currentUserLatestEmail = inboundEmails.find((email) => currentUserAliases.some((alias) => alias.aliasId === email.captureAliasId)) || null
  const currentUserStatus = getLeadCaptureSetupStatus({ aliases: currentUserAliases, lastInboundEmail: currentUserLatestEmail })

  const generatedCount = aliases.filter((alias) => alias.status === 'active' && isPrimaryLeadCaptureAlias(alias)).length
  const activeAgentCount = rows.filter((row) => row.status === 'active').length
  const activeCardCount = agentCardLinks.filter((card) => card.status === 'active').length
  const cardViewCount = agentCardInsights?.summary?.views || 0
  const missingAgentCardRows = agentCardRows.filter(({ card }) => !card)
  const exportableAgentCardRows = agentCardRows.filter(({ card, urls }) => card?.status === 'active' && urls?.cardUrl)
  const receivedCount = inboundEmails.length
  const failureCount = reviewItemsWithAssignment.filter((item) => item.status === 'open').length
  const leadCaptureDomain = aliases[0]?.aliasDomain || 'leads.arch9.co.za'
  const webhookUrl = buildLeadCaptureWebhookUrl({
    supabaseFunctionsUrl: import.meta.env.VITE_SUPABASE_FUNCTIONS_URL,
    supabaseProjectRef: import.meta.env.VITE_SUPABASE_PROJECT_REF,
  })
  const dnsRows = buildLeadCaptureDnsChecklist({ domain: leadCaptureDomain })

  async function copyAddress(value) {
    try {
      await navigator.clipboard.writeText(value)
      setNotice('Address copied.')
    } catch {
      setNotice(value)
    }
  }

  function openExternalUrl(value) {
    const url = normalizeText(value)
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function getOrganisationDisplayName() {
    return normalizeText(
      context?.organisation?.displayName ||
        context?.organisation?.display_name ||
        context?.organisation?.name ||
        currentWorkspace?.name,
    )
  }

  function buildShareKitForAgentCard(user, card, urls) {
    return buildAgentDigitalCardShareKit(buildAgentCardShareProfile({
      user,
      card,
      urls,
      organisationName: getOrganisationDisplayName(),
    }))
  }

  async function copyAgentCardShareText(user, card, urls) {
    const shareKit = buildShareKitForAgentCard(user, card, {
      ...urls,
      shareUrl: buildAgentDigitalCardCampaignUrl({ cardUrl: urls.shareUrl || urls.cardUrl, source: 'whatsapp' }),
    })
    if (!shareKit.shareText) return
    try {
      await navigator.clipboard.writeText(shareKit.shareText)
      setNotice(`Share message copied for ${getUserDisplayName(user)}.`)
    } catch {
      setNotice(shareKit.shareText)
    }
  }

  async function downloadAgentCardQrAsset(user, card, urls) {
    const shareKit = buildShareKitForAgentCard(user, card, urls)
    if (!shareKit.shareText || !urls.cardUrl) return
    setAgentCardAssetBusy(`qr:${card?.id || getUserId(user)}`)
    setError('')
    setNotice('')
    try {
      const downloaded = await downloadAgentDigitalCardQrPng({
        shareUrl: buildAgentDigitalCardCampaignUrl({ cardUrl: urls.shareUrl || urls.cardUrl, source: 'qr' }),
        fileName: shareKit.qrFileName,
      })
      setNotice(downloaded ? `QR downloaded for ${getUserDisplayName(user)}.` : 'QR download is not available in this browser.')
    } catch (downloadError) {
      setError(downloadError?.message || 'Agent digital card QR could not be downloaded.')
    } finally {
      setAgentCardAssetBusy('')
    }
  }

  function downloadAgentCardVcardAsset(user, card, urls) {
    const shareKit = buildShareKitForAgentCard(user, card, urls)
    if (!shareKit.vcard) return
    setError('')
    setNotice('')
    const downloaded = downloadAgentDigitalCardTextFile({
      fileName: shareKit.vcardFileName,
      text: shareKit.vcard,
      mimeType: 'text/vcard;charset=utf-8',
    })
    setNotice(downloaded ? `.vcf downloaded for ${getUserDisplayName(user)}.` : '.vcf download is not available in this browser.')
  }

  function buildAgentCardEditorDraft(user, card = null) {
    const cardAgent = card?.agentDigitalCard?.agent || {}
    const features = card?.agentDigitalCard?.features || {}
    const profile = card?.agentDigitalCard?.profile || {}
    const rollout = card?.agentDigitalCard?.rollout || {}
    const enabledIntents = card?.enabledIntents || ['buy', 'sell']
    return {
      name: normalizeText(cardAgent.name) || getUserDisplayName(user),
      email: normalizeText(cardAgent.email) || getUserEmail(user),
      phone: normalizeText(cardAgent.phone) || getUserPhone(user),
      whatsapp: normalizeText(cardAgent.whatsapp || cardAgent.phone) || getUserPhone(user),
      jobTitle: normalizeText(cardAgent.jobTitle) || getUserJobTitle(user),
      avatarUrl: normalizeText(cardAgent.avatarUrl) || getUserAvatarUrl(user),
      heading: normalizeText(card?.heading),
      introduction: normalizeText(card?.introduction),
      buyerCtaLabel: normalizeText(card?.buyerCtaLabel) || 'I am looking to buy',
      sellerCtaLabel: normalizeText(card?.sellerCtaLabel) || 'I am looking to sell',
      buyEnabled: enabledIntents.includes('buy'),
      sellEnabled: enabledIntents.includes('sell'),
      listingsEnabled: features.listings !== false,
      vcfEnabled: features.vcf !== false,
      shareEnabled: features.share !== false,
      qrEnabled: features.qr !== false,
      specialties: Array.isArray(profile.specialties) ? profile.specialties.join(', ') : '',
      serviceAreas: Array.isArray(profile.serviceAreas) ? profile.serviceAreas.join(', ') : '',
      languages: Array.isArray(profile.languages) ? profile.languages.join(', ') : '',
      credentials: Array.isArray(profile.credentials) ? profile.credentials.join(', ') : '',
      featuredListingIds: Array.isArray(profile.featuredListingIds) ? profile.featuredListingIds : [],
      rolloutStage: rollout.stage === 'pilot' ? 'pilot' : 'standard',
    }
  }

  function openAgentCardEditor(user, card) {
    setAgentCardEditor({ user, card, draft: buildAgentCardEditorDraft(user, card) })
    setAgentCardListingOptions([])
    if (!card?.slug) return
    setAgentCardListingsLoading(true)
    resolveAgencyPublicCardListings(card.slug, { limit: 24 })
      .then((items) => setAgentCardListingOptions(items))
      .catch(() => setAgentCardListingOptions([]))
      .finally(() => setAgentCardListingsLoading(false))
  }

  async function saveAgentCardForUser(user, card = null, status = 'active', overrides = {}) {
    const userId = getUserId(user)
    if (!userId) return
    const cardAgent = card?.agentDigitalCard?.agent || {}
    const features = card?.agentDigitalCard?.features || {}
    const profile = card?.agentDigitalCard?.profile || {}
    const value = (key, existing, fallback = '') => overrides[key] ?? (normalizeText(existing) || fallback)
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await saveAgencyAgentCardLink({
        id: card?.id,
        organisationId,
        organisationName: getOrganisationDisplayName(),
        slug: card?.slug,
        status,
        heading: overrides.heading ?? card?.heading ?? '',
        introduction: overrides.introduction ?? card?.introduction ?? '',
        buyerCtaLabel: overrides.buyerCtaLabel ?? card?.buyerCtaLabel ?? 'I am looking to buy',
        sellerCtaLabel: overrides.sellerCtaLabel ?? card?.sellerCtaLabel ?? 'I am looking to sell',
        enabledIntents: overrides.enabledIntents ?? card?.enabledIntents ?? ['buy', 'sell'],
        defaultBranchId: card?.defaultBranchId || user.branchId || user.branch_id,
        agentUserId: userId,
        agentName: value('agentName', cardAgent.name, getUserDisplayName(user)),
        agentEmail: value('agentEmail', cardAgent.email, getUserEmail(user)),
        agentPhone: value('agentPhone', cardAgent.phone, getUserPhone(user)),
        agentWhatsApp: value('agentWhatsApp', cardAgent.whatsapp || cardAgent.phone, getUserPhone(user)),
        agentJobTitle: value('agentJobTitle', cardAgent.jobTitle, getUserJobTitle(user)),
        agentAvatarUrl: value('agentAvatarUrl', cardAgent.avatarUrl, getUserAvatarUrl(user)),
        vcfEnabled: overrides.vcfEnabled ?? features.vcf ?? true,
        qrEnabled: overrides.qrEnabled ?? features.qr ?? true,
        shareEnabled: overrides.shareEnabled ?? features.share ?? true,
        listingsEnabled: overrides.listingsEnabled ?? features.listings ?? true,
        leadCaptureEnabled: overrides.leadCaptureEnabled ?? features.leadCapture ?? true,
        specialties: overrides.specialties ?? profile.specialties ?? [],
        serviceAreas: overrides.serviceAreas ?? profile.serviceAreas ?? [],
        languages: overrides.languages ?? profile.languages ?? [],
        credentials: overrides.credentials ?? profile.credentials ?? [],
        featuredListingIds: overrides.featuredListingIds ?? profile.featuredListingIds ?? [],
        rolloutStage: overrides.rolloutStage ?? card?.agentDigitalCard?.rollout?.stage ?? 'standard',
      }, {
        organisationName: getOrganisationDisplayName(),
      })
      const action = status === 'active' ? (card ? 'activated' : 'generated') : 'disabled'
      setNotice(`Agent digital card ${action} for ${getUserDisplayName(user)}.`)
      if (result?.link) {
        setAgentCardLinks((previous) => {
          const withoutCurrent = previous.filter((item) => item.id !== result.link.id)
          return [result.link, ...withoutCurrent]
        })
      }
      await load()
      return true
    } catch (cardError) {
      setError(cardError?.message || 'Agent digital card could not be saved.')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function saveAgentCardEditor(status = agentCardEditor?.card?.status || 'draft') {
    if (!agentCardEditor) return
    const { user, card, draft } = agentCardEditor
    const enabledIntents = [draft.buyEnabled ? 'buy' : '', draft.sellEnabled ? 'sell' : ''].filter(Boolean)
    if (!enabledIntents.length) {
      setError('Enable at least one enquiry action before saving this digital card.')
      return
    }
    const saved = await saveAgentCardForUser(user, card, status, {
      agentName: draft.name,
      agentEmail: draft.email,
      agentPhone: draft.phone,
      agentWhatsApp: draft.whatsapp,
      agentJobTitle: draft.jobTitle,
      agentAvatarUrl: draft.avatarUrl,
      heading: draft.heading,
      introduction: draft.introduction,
      buyerCtaLabel: draft.buyerCtaLabel,
      sellerCtaLabel: draft.sellerCtaLabel,
      enabledIntents,
      vcfEnabled: draft.vcfEnabled,
      qrEnabled: draft.qrEnabled,
      shareEnabled: draft.shareEnabled,
      listingsEnabled: draft.listingsEnabled,
      leadCaptureEnabled: true,
      specialties: draft.specialties,
      serviceAreas: draft.serviceAreas,
      languages: draft.languages,
      credentials: draft.credentials,
      featuredListingIds: draft.featuredListingIds,
      rolloutStage: draft.rolloutStage,
    })
    if (saved) setAgentCardEditor(null)
  }

  async function generateMissingAgentCards() {
    const targets = missingAgentCardRows.map(({ user }) => user).filter(Boolean)
    if (!targets.length) {
      setNotice('All active agents already have digital cards.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')
    try {
      const organisationName = getOrganisationDisplayName()
      for (const user of targets) {
        await saveAgencyAgentCardLink({
          organisationId,
          organisationName,
          status: 'active',
          enabledIntents: ['buy', 'sell'],
          defaultBranchId: user.branchId || user.branch_id,
          agentUserId: getUserId(user),
          agentName: getUserDisplayName(user),
          agentEmail: getUserEmail(user),
          agentPhone: getUserPhone(user),
          agentWhatsApp: getUserPhone(user),
          agentJobTitle: getUserJobTitle(user),
          agentAvatarUrl: getUserAvatarUrl(user),
          vcfEnabled: true,
          qrEnabled: true,
          listingsEnabled: true,
          leadCaptureEnabled: true,
        }, {
          organisationName,
        })
      }
      setNotice(`Generated ${targets.length} missing agent digital ${targets.length === 1 ? 'card' : 'cards'}.`)
      await load()
    } catch (bulkError) {
      setError(bulkError?.message || 'Missing agent digital cards could not be generated.')
    } finally {
      setSaving(false)
    }
  }

  function exportAgentCardRolloutCsv() {
    if (!exportableAgentCardRows.length) {
      setNotice('No active agent digital cards are ready to export yet.')
      return
    }

    const organisationName = getOrganisationDisplayName()
    const csv = buildAgentDigitalCardShareKitCsv(exportableAgentCardRows.map(({ user, card, urls }) => ({
      ...buildAgentCardShareProfile({ user, card, urls, organisationName }),
      cardUrl: urls.shareUrl || urls.cardUrl,
      intakeUrl: urls.intakeUrl,
      buyerUrl: urls.buyerUrl,
      sellerUrl: urls.sellerUrl,
    })))
    const fileBaseName = buildAgentDigitalCardFileBaseName({
      organisationName,
      agentName: 'agent-card-rollout',
    })
    const downloaded = downloadAgentDigitalCardTextFile({
      fileName: `${fileBaseName}.csv`,
      text: csv,
      mimeType: 'text/csv;charset=utf-8',
    })
    setNotice(downloaded ? `Exported ${exportableAgentCardRows.length} agent card ${exportableAgentCardRows.length === 1 ? 'row' : 'rows'}.` : 'CSV export is not available in this browser.')
  }

  async function generateMyAddresses() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await ensureDefaultLeadCaptureAliases({
        organisationId,
        agentUserId: profileId,
        branchId: currentUser.branchId,
        sources: LEAD_CAPTURE_SOURCES,
      })
      setNotice('Lead capture address generated.')
      await load()
    } catch (generateError) {
      setError(generateError?.message || 'Lead capture addresses could not be generated.')
    } finally {
      setSaving(false)
    }
  }

  async function generateAgencyAddresses() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await ensureDefaultLeadCaptureAliases({
        organisationId,
        sources: LEAD_CAPTURE_SOURCES,
      })
      await ensureLeadCaptureAliasesForUsers({
        organisationId,
        users,
        sources: LEAD_CAPTURE_SOURCES,
      })
      setNotice('Agency lead capture addresses generated.')
      await load()
    } catch (generateError) {
      setError(generateError?.message || 'Agency lead capture addresses could not be generated.')
    } finally {
      setSaving(false)
    }
  }

  async function updateReviewItem(item, action) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (action === 'ignore') {
        await ignoreLeadCaptureReviewItem(item, { actor: profile })
        setNotice('Lead capture review ignored.')
      } else {
        await resolveLeadCaptureReviewItem(item, { actor: profile })
        setNotice('Lead capture review resolved.')
      }
      await load()
    } catch (reviewError) {
      setError(reviewError?.message || 'Lead capture review could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  function openRepairItem(item) {
    setError('')
    setNotice('')
    setSelectedRepairItem(item)
    setRepairDraft(buildLeadCaptureRepairDraft(item))
  }

  async function createLeadFromRepair() {
    if (!selectedRepairItem) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await repairLeadCaptureReviewItem(selectedRepairItem, repairDraft, { actor: profile })
      setSelectedRepairItem(null)
      setRepairDraft({})
      setNotice(result?.result?.reusedLead ? 'Existing lead updated from repaired capture.' : 'Lead created from repaired capture.')
      await load()
    } catch (repairError) {
      setError(repairError?.message || 'Lead capture repair could not create a lead.')
    } finally {
      setSaving(false)
    }
  }

  async function linkExistingLeadFromRepair() {
    if (!selectedRepairItem) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await linkLeadCaptureReviewItem(selectedRepairItem, repairDraft, { actor: profile })
      setSelectedRepairItem(null)
      setRepairDraft({})
      setNotice('Lead capture review linked to existing lead.')
      await load()
    } catch (repairError) {
      setError(repairError?.message || 'Lead capture review could not be linked.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <SettingsLoadingState label={showMeta ? 'Loading Meta Lead Ads...' : 'Loading digital cards...'} />
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Integrations"
        title={showMeta ? 'Meta Lead Ads' : 'Digital Cards'}
        description={showMeta
          ? 'Connect Facebook and Instagram forms, then route enquiries to the right team or agent.'
          : 'Create shareable agent cards, QR codes, and enquiry links for your team.'}
        actions={
          <SecondaryButton icon={RefreshCw} onClick={load} disabled={saving}>Refresh</SecondaryButton>
        }
      />

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {notice ? <SettingsBanner tone="success">{notice}</SettingsBanner> : null}

      {showDigitalCards ? (
        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Active Agents" value={activeAgentCount} icon={UsersRound} />
          <MetricCard label="Digital Cards" value={activeCardCount} icon={IdCard} />
          <MetricCard label="Card Views" value={cardViewCount} icon={QrCode} />
        </section>
      ) : null}

      {showMeta && canManage ? (
        <SettingsSectionCard title="Facebook & Instagram Lead Ads" description="Authorise a Meta Page, choose the forms you want to receive, and set their routing.">
          <div className="grid gap-3">
            <div className="flex flex-col gap-4 rounded-[18px] border border-[#c9ddf3] bg-[linear-gradient(135deg,#f7fbff_0%,#edf7ff_100%)] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-white text-[#1877f2] shadow-sm"><Radio size={22} /></span>
                <div>
                  <p className="text-sm font-semibold text-[#162334]">{metaConnections.length ? 'Meta Page connected' : 'Connect a Meta Page'}</p>
                  <p className="mt-1 text-sm text-[#5f7288]">{metaConnections.length ? 'Choose forms and routing below.' : 'Authorise Facebook and Instagram to receive lead forms.'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <PrimaryButton onClick={authorizeMeta} disabled={saving || !organisationId}>{metaConnections.length ? 'Manage connection' : 'Connect Meta'}</PrimaryButton>
                <a href="https://developers.facebook.com/tools/lead-ads-testing/" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-[#d7e2ee] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#bfccdb] hover:bg-[#f7fafd]"><ExternalLink size={16} /> Test a form</a>
              </div>
            </div>
            {metaConnections.map((connection) => <div key={connection.id} className="rounded-[14px] border border-[#e3ebf3] bg-white p-4"><strong>{connection.page_name}</strong><p className="text-sm text-[#6b7d93]">{connection.connection_status}{connection.last_error_message ? ` · ${connection.last_error_message}` : ''}</p></div>)}
            {metaPages.length ? <div className="grid gap-2">{metaPages.map((page) => <SecondaryButton key={page.id} onClick={() => chooseMetaPage(page.id)} disabled={saving}>Use {page.name}</SecondaryButton>)}</div> : null}
            {metaForms.length ? <div className="grid gap-2">{metaForms.map((form,index) => <div key={form.id} className="rounded-[14px] border border-[#e3ebf3] bg-white p-4"><label><input type="checkbox" checked={Boolean(form.selected)} onChange={(event)=>setMetaForms((current)=>current.map((item,i)=>i===index?{...item,selected:event.target.checked}:item))} /> <span className="ml-2 font-semibold">{form.name}</span></label><div className="mt-3 flex flex-wrap gap-3"><label className="text-sm font-medium text-[#52677e]">Lead type <select className="ml-2 rounded border p-1" value={form.leadType||'buyer'} onChange={(event)=>setMetaForms((current)=>current.map((item,i)=>i===index?{...item,leadType:event.target.value}:item))}><option value="buyer">Buyer</option><option value="seller">Seller</option></select></label><label className="text-sm font-medium text-[#52677e]">Route to <select className="ml-2 rounded border p-1" value={form.assignedAgentId||''} onChange={(event)=>setMetaForms((current)=>current.map((item,i)=>i===index?{...item,assignedAgentId:event.target.value}:item))}><option value="">Agency queue</option>{users.filter(isActiveAgentUser).map((user)=><option key={getUserId(user)} value={getUserId(user)}>{getUserDisplayName(user)}</option>)}</select></label></div></div>)}<PrimaryButton onClick={enableMetaForms} disabled={saving || !metaForms.some((form)=>form.selected)}>Enable selected forms</PrimaryButton></div> : null}
            {metaForms.some((form) => form.selected) ? (
              <div className="mt-2 grid gap-4 rounded-[16px] border border-[#c9ddf3] bg-[#f7fbff] p-4">
                <div>
                  <h3 className="font-semibold text-[#162334]">Historical Meta leads</h3>
                  <p className="mt-1 text-sm text-[#5f7288]">Preview a form before importing. Historical leads keep their original Meta submission date and do not trigger new-lead notifications or SLA timers.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="grid gap-1 text-sm font-medium text-[#52677e]">Form<select className="min-h-10 rounded-[10px] border border-[#d7e2ee] bg-white px-3 text-sm text-[#162334]" value={metaImportFormId} onChange={(event) => { setMetaImportFormId(event.target.value); setMetaImportPreview(null) }}><option value="">Choose form</option>{metaForms.filter((form) => form.selected).map((form) => <option key={form.id} value={form.id}>{form.name} · {form.leadType === 'seller' ? 'Seller' : 'Buyer'}</option>)}</select></label>
                  <label className="grid gap-1 text-sm font-medium text-[#52677e]">From (optional)<input type="date" className="min-h-10 rounded-[10px] border border-[#d7e2ee] bg-white px-3 text-sm text-[#162334]" value={metaImportFrom} onChange={(event) => { setMetaImportFrom(event.target.value); setMetaImportPreview(null) }} /></label>
                  <label className="grid gap-1 text-sm font-medium text-[#52677e]">To (optional)<input type="date" className="min-h-10 rounded-[10px] border border-[#d7e2ee] bg-white px-3 text-sm text-[#162334]" value={metaImportTo} onChange={(event) => { setMetaImportTo(event.target.value); setMetaImportPreview(null) }} /></label>
                </div>
                <div className="flex flex-wrap gap-2"><SecondaryButton icon={Search} onClick={previewHistoricalMetaLeads} disabled={saving || !metaImportFormId}>Preview historical leads</SecondaryButton>{metaImportPreview?.id ? <PrimaryButton icon={Download} onClick={() => processHistoricalMetaImport(metaImportPreview.id)} disabled={saving}>Confirm and import</PrimaryButton> : null}</div>
                {metaImportPreview ? <div className="grid gap-2 rounded-[12px] border border-[#d7e7f7] bg-white p-3 text-sm text-[#35546c]"><p className="font-semibold text-[#162334]">Preview: {metaImportPreview.newLeads ?? metaImportPreview.imported_count ?? 0} new, {metaImportPreview.duplicates ?? metaImportPreview.duplicate_count ?? 0} already known.</p><p>{metaImportPreview.complete ? 'This preview reached the end of the form.' : 'Preview samples the first 100 available records; the import will continue safely in batches.'}</p></div> : null}
                {metaImports.length ? <div className="overflow-hidden rounded-[12px] border border-[#dbe5ef] bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-[#f8fbfe] text-xs font-semibold uppercase tracking-[0.1em] text-[#7b8da6]"><tr><th className="px-3 py-2">Form</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Results</th><th className="px-3 py-2">Action</th></tr></thead><tbody>{metaImports.map((item) => <tr key={item.id} className="border-t border-[#e8eef5]"><td className="px-3 py-3">{metaForms.find((form) => form.id === item.form_id)?.name || item.form_id}<p className="mt-1 text-xs text-[#7b8da6]">{formatDateTime(item.created_at)}</p></td><td className="px-3 py-3"><span className="font-semibold capitalize text-[#35546c]">{String(item.status || '').replace('_', ' ')}</span>{item.last_error_message ? <p className="mt-1 max-w-xs text-xs text-[#b54747]">{item.last_error_message}</p> : null}</td><td className="px-3 py-3 text-xs text-[#5f7288]">{item.imported_count || 0} imported · {item.duplicate_count || 0} known · {item.failed_count || 0} failed</td><td className="px-3 py-3">{['ready', 'paused'].includes(item.status) ? <SecondaryButton icon={RefreshCw} onClick={() => processHistoricalMetaImport(item.id)} disabled={saving}>{item.status === 'paused' ? 'Continue' : 'Start import'}</SecondaryButton> : <span className="text-xs text-[#7b8da6]">{item.status === 'completed' ? 'Complete' : 'Working'}</span>}</td></tr>)}</tbody></table></div> : null}
              </div>
            ) : null}
          </div>
        </SettingsSectionCard>
      ) : null}

      {showDigitalCards && canManage ? (
        <SettingsSectionCard
          title="Agent Digital Cards"
          description="Create and manage public agent card links. Leads from these links route to the selected agent through the existing public intake flow."
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#dce6f0] bg-[#f8fbfe] px-3 py-1 text-xs font-semibold text-[#60758d]"><QrCode size={14} /> QR-ready links</span>
              <SecondaryButton icon={Download} onClick={exportAgentCardRolloutCsv} disabled={saving || !exportableAgentCardRows.length}>Export CSV</SecondaryButton>
              <PrimaryButton icon={Plus} onClick={generateMissingAgentCards} disabled={saving || !missingAgentCardRows.length || !organisationId}>Generate Missing</PrimaryButton>
            </div>
          )}
        >
          <AgentCardRolloutOverview rows={agentCardRows} />
          <AgentDigitalCardPerformanceOverview insights={agentCardInsights} />
          {agentCardRows.length ? (
            <div className="overflow-hidden rounded-[18px] border border-[#e3eaf2] bg-white">
              <table className="min-w-full divide-y divide-[#e8eef5] text-left">
                <thead className="bg-[#f8fbfe]">
                  <tr className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Card</th>
                    <th className="px-4 py-3">Links</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agentCardRows.map(({ user, card, urls, insights }) => (
                    <AgentCardManagementRow
                      key={getUserId(user)}
                      user={user}
                      card={card}
                      urls={urls}
                      insights={insights}
                      saving={saving}
                      assetBusy={agentCardAssetBusy}
                      onCreate={(targetUser) => openAgentCardEditor(targetUser, null)}
                      onActivate={(targetUser, targetCard) => saveAgentCardForUser(targetUser, targetCard, 'active')}
                      onDisable={(targetUser, targetCard) => saveAgentCardForUser(targetUser, targetCard, 'disabled')}
                      onCopy={copyAddress}
                      onOpen={openExternalUrl}
                      onCopyShareText={copyAgentCardShareText}
                      onDownloadQr={downloadAgentCardQrAsset}
                      onDownloadVcard={downloadAgentCardVcardAsset}
                      onEdit={openAgentCardEditor}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <SettingsEmptyState
              title="No active agents found"
              description="Invite or activate agents before generating digital card links."
            />
          )}
        </SettingsSectionCard>
      ) : null}

      <AgentCardEditorDialog
        editor={agentCardEditor}
        listingOptions={agentCardListingOptions}
        listingLoading={agentCardListingsLoading}
        onChange={setAgentCardEditor}
        onClose={() => setAgentCardEditor(null)}
        onSave={saveAgentCardEditor}
        saving={saving}
      />

    </div>
  )
}
