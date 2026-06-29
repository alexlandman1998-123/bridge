import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Inbox,
  Mail,
  RefreshCw,
  Search,
  UserRound,
  UsersRound,
  Wrench,
  X,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchOrganisationSettings, listOrganisationUsers } from '../../lib/settingsApi'
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
  ignoreLeadCaptureReviewItem,
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
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#d7e2ee] bg-white text-[#35546c] transition hover:border-[#bfccdb] hover:bg-[#f7fafd] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Icon size={15} />
    </button>
  )
}

function PrimaryButton({ children, onClick, disabled = false, icon: Icon = null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-[#244b76] bg-[#274e7a] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f4167] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  )
}

function SecondaryButton({ children, onClick, disabled = false, icon: Icon = null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-[#d7e2ee] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#bfccdb] hover:bg-[#f7fafd] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {Icon ? <Icon size={16} /> : null}
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
  const primaryAlias = row.aliases.find((alias) => alias.source === 'General') || row.aliases[0] || null
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
  return (
    <div className={settingsCardClass}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8da6]">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-[#162334]">{value}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#d9e4ef] bg-white text-[#35546c]">
          <Icon size={19} />
        </span>
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

export default function SettingsLeadCapturePage() {
  const { profile, role, currentWorkspace, workspaceType } = useWorkspace()
  const [context, setContext] = useState(null)
  const [users, setUsers] = useState([])
  const [aliases, setAliases] = useState([])
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
        setInboundEmails([])
        setReviewItems([])
        return
      }
      const [nextUsers, nextAliases, nextInboundEmails, nextFailures] = await Promise.all([
        listOrganisationUsers().catch(() => []),
        listLeadCaptureAliases(organisationId).catch((aliasError) => {
          if (String(aliasError?.message || '').toLowerCase().includes('lead_capture_aliases')) return []
          throw aliasError
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

  const generatedCount = aliases.filter((alias) => alias.status === 'active').length
  const activeAgentCount = rows.filter((row) => row.status === 'active').length
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
      setNotice('Lead capture addresses generated.')
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
  const visibleMyAliases = myAliases.length ? myAliases : aliases.filter((alias) => !alias.agentUserId).slice(0, 1)

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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active Addresses" value={generatedCount} icon={Mail} />
        <MetricCard label="Active Agents" value={activeAgentCount} icon={UsersRound} />
        <MetricCard label="Emails Received" value={receivedCount} icon={Inbox} />
        <MetricCard label="Needs Review" value={failureCount} icon={AlertCircle} />
      </section>

      <SettingsSectionCard
        title="My Capture Addresses"
        description={`Status: ${STATUS_META[currentUserStatus]?.label || STATUS_META.not_started.label}`}
        actions={!visibleMyAliases.length ? <SecondaryButton icon={Mail} onClick={generateMyAddresses} disabled={saving || !organisationId || !profileId}>Generate</SecondaryButton> : null}
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
            description="Generate addresses before routing portal enquiries into Arch9."
          />
        )}
      </SettingsSectionCard>

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
