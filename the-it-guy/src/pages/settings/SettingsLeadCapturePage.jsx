import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Inbox,
  IdCard,
  Mail,
  Plus,
  QrCode,
  RefreshCw,
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
  buildAgentDigitalCardShareKit,
  buildAgentDigitalCardShareKitCsv,
  downloadAgentDigitalCardQrPng,
  downloadAgentDigitalCardTextFile,
} from '../../services/agentDigitalCardShareService'
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
    shareUrl: normalizeText(urls.cardUrl || urls.intakeUrl),
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
}) {
  const status = card?.status || 'not_created'
  const active = status === 'active'
  const disabled = ['disabled', 'archived'].includes(status)
  const summary = insights?.summary || {}
  const rowDisabled = saving || Boolean(assetBusy)
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
              {urls.cardUrl}
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
              <IconButton label={`Copy card link for ${getUserDisplayName(user)}`} icon={Copy} onClick={() => onCopy(urls.cardUrl)} disabled={saving} />
              <IconButton label={`Open card for ${getUserDisplayName(user)}`} icon={ExternalLink} onClick={() => onOpen(urls.cardUrl)} disabled={saving} />
              <IconButton label={`Copy share message for ${getUserDisplayName(user)}`} icon={Mail} onClick={() => onCopyShareText(user, card, urls)} disabled={rowDisabled} />
              <IconButton label={`Download QR code for ${getUserDisplayName(user)}`} icon={QrCode} onClick={() => onDownloadQr(user, card, urls)} disabled={rowDisabled} />
              <IconButton label={`Download contact file for ${getUserDisplayName(user)}`} icon={Download} onClick={() => onDownloadVcard(user, card, urls)} disabled={rowDisabled} />
            </>
          ) : null}
          {!card ? (
            <SecondaryButton icon={Plus} onClick={() => onCreate(user)} disabled={saving}>Generate</SecondaryButton>
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

export default function SettingsLeadCapturePage() {
  const { profile, role, currentWorkspace, workspaceType } = useWorkspace()
  const [context, setContext] = useState(null)
  const [users, setUsers] = useState([])
  const [aliases, setAliases] = useState([])
  const [agentCardLinks, setAgentCardLinks] = useState([])
  const [agentCardInsights, setAgentCardInsights] = useState(null)
  const [agentCardAssetBusy, setAgentCardAssetBusy] = useState('')
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
    const shareKit = buildShareKitForAgentCard(user, card, urls)
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
        shareUrl: urls.cardUrl,
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

  async function saveAgentCardForUser(user, card = null, status = 'active') {
    const userId = getUserId(user)
    if (!userId) return
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
        enabledIntents: card?.enabledIntents || ['buy', 'sell'],
        defaultBranchId: card?.defaultBranchId || user.branchId || user.branch_id,
        agentUserId: userId,
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
    } catch (cardError) {
      setError(cardError?.message || 'Agent digital card could not be saved.')
    } finally {
      setSaving(false)
    }
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
      cardUrl: urls.cardUrl,
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
    return <SettingsLoadingState label="Loading lead capture settings..." />
  }

  const myAliases = canManage ? aliases.filter((alias) => alias.agentUserId === profileId) : currentUserAliases
  const visibleMyAliases = getPrimaryLeadCaptureAliases(myAliases.length ? myAliases : aliases.filter((alias) => !alias.agentUserId))

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Settings"
        title="Lead Capture"
        description="Forwarding addresses, agent activation status, and inbound lead email health."
        actions={
          <>
            <SecondaryButton icon={RefreshCw} onClick={load} disabled={saving}>Refresh</SecondaryButton>
            {canManage ? (
              <PrimaryButton icon={Mail} onClick={generateAgencyAddresses} disabled={saving || !organisationId}>Generate Agency Addresses</PrimaryButton>
            ) : (
              <PrimaryButton icon={Mail} onClick={generateMyAddresses} disabled={saving || !organisationId || !profileId}>Generate My Addresses</PrimaryButton>
            )}
          </>
        }
      />

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {notice ? <SettingsBanner tone="success">{notice}</SettingsBanner> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Active Addresses" value={generatedCount} icon={Mail} />
        <MetricCard label="Active Agents" value={activeAgentCount} icon={UsersRound} />
        <MetricCard label="Digital Cards" value={activeCardCount} icon={IdCard} />
        <MetricCard label="Card Views" value={cardViewCount} icon={QrCode} />
        <MetricCard label="Emails Received" value={receivedCount} icon={Inbox} />
        <MetricCard label="Needs Review" value={failureCount} icon={AlertCircle} />
      </section>

      <SettingsSectionCard
        title="My Capture Addresses"
        description={`Status: ${STATUS_META[currentUserStatus]?.label || STATUS_META.not_started.label}`}
        actions={!visibleMyAliases.length ? <SecondaryButton icon={Mail} onClick={generateMyAddresses} disabled={saving || !organisationId || !profileId}>Generate My Addresses</SecondaryButton> : null}
      >
        {visibleMyAliases.length ? (
          <div className="grid gap-3">
            {visibleMyAliases.map((alias) => (
              <AliasAddressRow key={alias.aliasId || alias.emailAddress} alias={alias} onCopy={copyAddress} />
            ))}
          </div>
        ) : (
          <SettingsEmptyState
            title="No lead capture addresses yet"
            description="Generate an address before routing portal enquiries into Arch9."
          />
        )}
      </SettingsSectionCard>

      {canManage ? (
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
                      onCreate={(targetUser) => saveAgentCardForUser(targetUser, null, 'active')}
                      onActivate={(targetUser, targetCard) => saveAgentCardForUser(targetUser, targetCard, 'active')}
                      onDisable={(targetUser, targetCard) => saveAgentCardForUser(targetUser, targetCard, 'disabled')}
                      onCopy={copyAddress}
                      onOpen={openExternalUrl}
                      onCopyShareText={copyAgentCardShareText}
                      onDownloadQr={downloadAgentCardQrAsset}
                      onDownloadVcard={downloadAgentCardVcardAsset}
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

      {canManage ? (
        <SettingsSectionCard title="Agency Activation" description="Agent-level lead capture status across the organisation.">
          {rows.length ? (
            <div className="overflow-hidden rounded-[18px] border border-[#e3eaf2] bg-white">
              <table className="min-w-full divide-y divide-[#e8eef5] text-left">
                <thead className="bg-[#f8fbfe]">
                  <tr className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8da6]">
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Primary Address</th>
                    <th className="px-4 py-3">Last Email</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <AgentStatusRow key={row.userId || 'agency'} row={row} onCopy={copyAddress} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <SettingsEmptyState
              title="No agents found"
              description="Invite users before generating agent capture addresses."
            />
          )}
        </SettingsSectionCard>
      ) : null}

      {canManage ? (
        <ProductionSetupSection
          domain={leadCaptureDomain}
          webhookUrl={webhookUrl}
          dnsRows={dnsRows}
          onCopy={copyAddress}
        />
      ) : null}

      <SettingsSectionCard title="Recent Inbound Emails" description="Latest raw email events received through capture addresses.">
        {inboundEmails.length ? (
          <div className="grid gap-3">
            {inboundEmails.slice(0, 8).map((email) => (
              <div key={email.emailId} className="grid gap-3 rounded-[14px] border border-[#e3ebf3] bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={email.status === 'processed' ? 'active' : email.status === 'failed' ? 'not_started' : 'test_received'} />
                    <span className="text-sm font-semibold text-[#162334]">{email.subject || 'Inbound lead email'}</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-[#6b7d93]">{email.fromEmail || 'Unknown sender'} · {formatDateTime(email.receivedAt)}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#8a9aab]">
                    {email.parserName || 'parser pending'} · {formatConfidence(email.parseConfidence)}
                  </p>
                  {email.parseWarnings?.length ? (
                    <p className="mt-1 text-xs text-[#9a6408]">{email.parseWarnings.join(', ')}</p>
                  ) : null}
                </div>
                {email.leadId ? (
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#1f7a45]">
                    <CheckCircle2 size={16} /> Lead Created
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-[#6b7d93]">{email.status}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <SettingsEmptyState
            title="No inbound email yet"
            description="Received lead emails will appear here after the inbound provider is connected."
          />
        )}
      </SettingsSectionCard>

      <SettingsSectionCard title="Lead Capture Review Queue" description="Open parse failures and low-confidence inbound lead emails.">
        <ReviewQueueFilters
          filters={reviewFilters}
          setFilters={setReviewFilters}
          sources={LEAD_CAPTURE_SOURCES}
          users={users}
          total={reviewItemsWithAssignment.length}
          visible={filteredReviewItems.length}
        />
        {filteredReviewItems.length ? (
          <div className="grid gap-3">
            {filteredReviewItems.slice(0, 24).map((item) => (
              <ReviewQueueItem
                key={item.id}
                item={item}
                saving={saving}
                onRepair={openRepairItem}
                onResolve={(reviewItem) => updateReviewItem(reviewItem, 'resolve')}
                onIgnore={(reviewItem) => updateReviewItem(reviewItem, 'ignore')}
              />
            ))}
          </div>
        ) : (
          <SettingsEmptyState
            title="No lead capture reviews open"
            description="Try a broader source, status, confidence, agent, or text search."
          />
        )}
      </SettingsSectionCard>

      <RepairDrawer
        item={selectedRepairItem}
        draft={repairDraft}
        users={users}
        onChange={setRepairDraft}
        onClose={() => {
          setSelectedRepairItem(null)
          setRepairDraft({})
        }}
        onCreateLead={createLeadFromRepair}
        onLinkLead={linkExistingLeadFromRepair}
        saving={saving}
      />
    </div>
  )
}
