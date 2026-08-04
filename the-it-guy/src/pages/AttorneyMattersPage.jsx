import {
  AlertTriangle,
  ArrowRight,
  Building2,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Flag,
  Home,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  UserPlus,
  UserRound,
  UsersRound,
  X,
  XCircle,
} from 'lucide-react'
import { createElement, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import {
  ATTORNEY_MATTER_PAGE_SIZES,
  buildAttorneyMatterWorkspace,
  getAttorneyMatterWorkspace,
} from '../services/attorneyMatterWorkspace'
import {
  acceptAttorneyIncomingMatterInstruction,
  declineAttorneyIncomingMatterInstruction,
  fetchTransactionEvents,
} from '../lib/api'
import {
  fetchDocumentPacket,
  requestPersistedPdfAccess,
} from '../lib/documentPacketsApi'
import { getAssignableAttorneyFirmMembers } from '../services/transactionAttorneyAssignments'
import { assignAttorneyIncomingMatterPrimary } from '../services/transferFirmAllocationService'
import {
  resolvePortalBuyerName,
  resolvePortalPropertyLabel,
  resolvePortalSellerName,
} from '../services/portalCanonicalFieldFallbacks'

const DEFAULT_FILTERS = {
  status: 'all',
  matterType: 'all',
  attorney: 'all',
  assistant: 'all',
  branch: 'all',
  partner: 'all',
  development: 'all',
  municipality: 'all',
  bank: 'all',
  dateInstructed: 'all',
  expectedRegistration: 'all',
  expectedLodgement: 'all',
  priority: 'all',
  matterValue: 'all',
}

const KPI_ICONS = {
  active_matters: BriefcaseBusiness,
  awaiting_client: UsersRound,
  lodgement_today: CalendarDays,
  registration_this_week: Flag,
  delayed: AlertTriangle,
}

const KPI_TONES = {
  emerald: {
    icon: 'bg-emerald-50 text-emerald-700',
    line: '#0f8a6a',
    helper: 'text-emerald-700',
  },
  amber: {
    icon: 'bg-orange-50 text-orange-700',
    line: '#f97316',
    helper: 'text-orange-700',
  },
  blue: {
    icon: 'bg-blue-50 text-blue-700',
    line: '#477cff',
    helper: 'text-blue-700',
  },
  violet: {
    icon: 'bg-violet-50 text-violet-700',
    line: '#8b5cf6',
    helper: 'text-violet-700',
  },
  red: {
    icon: 'bg-red-50 text-red-700',
    line: '#ef4444',
    helper: 'text-red-700',
  },
}

const STATUS_STYLES = {
  Active: 'bg-emerald-50 text-emerald-700',
  Attention: 'bg-orange-50 text-orange-700',
  Delayed: 'bg-red-50 text-red-700',
  Registered: 'bg-blue-50 text-blue-700',
  Archived: 'bg-slate-100 text-slate-600',
  'Buyer Onboarding': 'bg-slate-100 text-slate-700',
  'Awaiting Signed OTP': 'bg-orange-50 text-orange-700',
  'Awaiting Documents': 'bg-blue-50 text-blue-700',
  'Ready For Acceptance': 'bg-violet-50 text-violet-700',
  'Awaiting Buyer': 'bg-amber-50 text-amber-700',
}

const WAITING_ON_STYLES = {
  Buyer: 'border-amber-200 bg-amber-50 text-amber-700',
  'Buyer onboarding': 'border-slate-200 bg-slate-50 text-slate-700',
  'Signed OTP': 'border-orange-200 bg-orange-50 text-orange-700',
  Documents: 'border-blue-200 bg-blue-50 text-blue-700',
  'Attorney acceptance': 'border-violet-200 bg-violet-50 text-violet-700',
  'Instruction review': 'border-emerald-200 bg-emerald-50 text-[#00614f]',
}

function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA').format(Number(value || 0))
}

function normalize(value = '') {
  return String(value || '').trim().toLowerCase()
}

function formatDue(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return '-'

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)

  if (target.getTime() === today.getTime()) return 'Today'
  if (target.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatShortDate(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatIncomingAge(value) {
  const days = Number(value || 0)
  if (!days) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return '-'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDateTime(value) {
  const date = new Date(value || '')
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function humanizeKey(value = '') {
  const text = String(value || '').trim()
  if (!text) return ''
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function dueTone(value, status) {
  const date = new Date(value || '')
  if (status === 'Delayed') return 'text-red-600'
  if (Number.isNaN(date.getTime())) return 'text-slate-500'

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)

  if (target < today) return 'text-red-600'
  if (target.getTime() <= tomorrow.getTime()) return 'text-orange-600'
  return 'text-slate-700'
}

function LoadingState({ copy = 'Loading attorney matters...' }) {
  return (
    <section className="w-full px-3 py-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-500">{copy}</p>
      </div>
    </section>
  )
}

function ErrorState({ children }) {
  return (
    <section className="w-full px-3 py-4">
      <div className="rounded-xl border border-red-200 bg-white p-5 text-sm font-medium text-red-700 shadow-sm">
        {children}
      </div>
    </section>
  )
}

function MiniSparkline({ values = [], color = '#0f8a6a' }) {
  const points = values.length ? values : [1, 2, 1, 3, 2, 4]
  const max = Math.max(...points, 1)
  const coordinates = points.map((value, index) => {
    const x = (index / Math.max(points.length - 1, 1)) * 54
    const y = 24 - (Number(value || 0) / max) * 20
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox="0 0 56 28" className="h-8 w-14" aria-hidden="true">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={coordinates} />
    </svg>
  )
}

function KpiCard({ item }) {
  const Icon = KPI_ICONS[item.key] || BriefcaseBusiness
  const tone = KPI_TONES[item.tone] || KPI_TONES.emerald

  return (
    <article className="grid min-h-[116px] grid-cols-[1fr_auto] gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <span className={classNames('inline-flex h-11 w-11 items-center justify-center rounded-[14px]', tone.icon)}>
          <Icon size={19} />
        </span>
        <p className="mt-3 truncate text-sm font-semibold text-slate-700">{item.label}</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{formatNumber(item.value)}</p>
        <p className={classNames('mt-1 truncate text-xs font-semibold', tone.helper)}>{item.helper}</p>
      </div>
      <div className="flex items-end">
        <MiniSparkline values={item.sparkline} color={tone.line} />
      </div>
    </article>
  )
}

function StageProgress({ stage }) {
  return (
    <div className="min-w-[150px]">
      <div className="flex items-center gap-1.5" aria-label={`Stage ${stage.label}`}>
        {stage.steps.map((step, index) => {
          const complete = index < stage.index
          const current = index === stage.index
          return (
            <span key={step} className="flex items-center gap-1.5">
              <span
                className={classNames(
                  'h-2.5 w-2.5 rounded-full border',
                  current
                    ? 'border-[#00614f] bg-white ring-2 ring-[#00614f]'
                    : complete
                      ? 'border-[#00614f] bg-[#00614f]'
                      : 'border-slate-300 bg-slate-200',
                )}
              />
              {index < stage.steps.length - 1 ? (
                <span className={classNames('h-px w-5', complete ? 'bg-[#00614f]' : 'bg-slate-200')} />
              ) : null}
            </span>
          )
        })}
      </div>
      <p className="mt-2 text-xs font-medium text-slate-500">{stage.label}</p>
    </div>
  )
}

function StatusPill({ status }) {
  return (
    <span className={classNames('inline-flex rounded-lg px-3 py-1 text-xs font-semibold', STATUS_STYLES[status] || STATUS_STYLES.Active)}>
      {status}
    </span>
  )
}

function Assignee({ person }) {
  return (
    <div className="flex min-w-[150px] items-center gap-2">
      <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#00463d] text-xs font-semibold text-white">
        {person.initials}
      </span>
      <span className="truncate text-sm font-medium text-slate-700">{person.name}</span>
    </div>
  )
}

function AssignedBySource({ source = {}, compact = false }) {
  const label = source.label || 'Private'
  const key = source.key || 'private'
  const isProduktive = key === 'produktive'
  const isPrivate = source.kind === 'private' || key === 'private'

  return (
    <div className={classNames('flex items-center gap-2', compact ? 'min-w-0' : 'min-w-[130px]')}>
      <span
        className={classNames(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border text-[0.68rem] font-bold uppercase',
          isPrivate
            ? 'border-slate-200 bg-slate-100 text-slate-600'
            : isProduktive
              ? 'border-[#00463d] bg-[#00463d] text-white'
              : 'border-slate-200 bg-white text-slate-700',
        )}
        title={label}
      >
        {source.logoUrl ? (
          <img src={source.logoUrl} alt={label} className="max-h-7 max-w-8 object-contain" />
        ) : (
          label.slice(0, 2)
        )}
      </span>
      {compact ? null : <span className="truncate text-sm font-semibold text-slate-700">{label}</span>}
    </div>
  )
}

function PropertyThumbnail({ row = {}, size = 'md' }) {
  const imageUrl = firstText(row.propertyThumbnailUrl, row.raw?.allocation?.property_image_url, row.raw?.transaction?.property_image_url)
  const label = firstText(row.propertyAddress, row.property, row.reference, 'Property')
  const sizeClass = size === 'lg' ? 'h-20 w-28 rounded-xl' : 'h-14 w-16 rounded-lg'

  return (
    <div className={classNames('shrink-0 overflow-hidden border border-slate-200 bg-slate-100', sizeClass)}>
      {imageUrl ? (
        <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-emerald-50 via-white to-slate-100 text-[#00614f]">
          <Home size={size === 'lg' ? 24 : 20} />
        </div>
      )}
    </div>
  )
}

function ContactCard({ icon: Icon, label, name, email, phone, meta }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#00614f]">
          {createElement(Icon, { size: 18 })}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-950">{name || '-'}</p>
          {meta ? <p className="mt-1 truncate text-xs font-medium text-slate-500">{meta}</p> : null}
          {email ? (
            <p className="mt-3 flex items-center gap-1.5 truncate text-xs font-medium text-slate-600">
              <Mail size={13} className="shrink-0 text-slate-400" />
              {email}
            </p>
          ) : null}
          {phone ? (
            <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs font-medium text-slate-600">
              <Phone size={13} className="shrink-0 text-slate-400" />
              {phone}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function DrawerMetric({ icon: Icon, label, value, helper }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
          {createElement(Icon, { size: 16 })}
        </span>
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-950">{value || '-'}</p>
          {helper ? <p className="mt-1 truncate text-xs font-medium text-slate-500">{helper}</p> : null}
        </div>
      </div>
    </article>
  )
}

function buildIncomingMatterTimeline(row = {}, events = [], packet = null) {
  const packetEvents = (packet?.events || []).map((event) => ({
    id: event.id || `packet-${event.event_type}-${event.created_at}`,
    label: humanizeKey(event.event_type || 'Mandate activity'),
    at: event.created_at,
    tone: 'emerald',
  }))
  const transactionEvents = (events || []).slice(0, 4).map((event) => ({
    id: event.id || `event-${event.eventType}-${event.createdAt}`,
    label: humanizeKey(event.eventData?.message || event.eventType || 'Matter activity'),
    at: event.createdAt,
    tone: 'slate',
  }))
  const baseEvents = [
    row.incomingSince ? {
      id: 'incoming-since',
      label: row.isPreInstruction ? 'Mandate received' : 'Instruction received',
      at: row.incomingSince,
      tone: 'emerald',
    } : null,
    row.assignedBySource?.label ? {
      id: 'assigned-by',
      label: `Assigned by ${row.assignedBySource.label}`,
      at: row.createdAt || row.incomingSince,
      tone: 'amber',
    } : null,
    row.waitingOnLabels?.length ? {
      id: 'waiting-on',
      label: `Waiting for ${row.waitingOnLabels.join(', ')}`,
      at: row.lastActivity || row.createdAt || row.incomingSince,
      tone: 'slate',
    } : null,
  ].filter(Boolean)

  return [...baseEvents, ...packetEvents, ...transactionEvents]
    .filter((item) => item.label)
    .sort((left, right) => new Date(right.at || 0) - new Date(left.at || 0))
    .slice(0, 6)
}

function getLatestPacketVersion(packet = null) {
  return Array.isArray(packet?.versions) && packet.versions.length ? packet.versions[0] : null
}

function getMandateDocument(row = {}, packet = null) {
  const version = getLatestPacketVersion(packet)
  const packetTitle = firstText(packet?.title, row.raw?.allocation?.mandate_title, 'Mandate Agreement')
  return {
    packetId: firstText(packet?.id, row.mandatePacketId),
    versionId: version?.id || '',
    name: firstText(version?.final_signed_file_name, version?.rendered_file_name, packetTitle, 'Mandate Agreement.pdf'),
    uploadedAt: firstText(version?.finalised_at, version?.generated_at, packet?.completed_at, packet?.updated_at, packet?.created_at, row.incomingSince),
    fallbackHref: row.mandatePacketId ? `/legal-documents/${encodeURIComponent(row.mandatePacketId)}` : row.actionHref,
  }
}

function IncomingMatterDrawer({
  row,
  events = [],
  packet = null,
  packetLoading = false,
  packetError = '',
  downloadingMandate = false,
  onClose,
  onOpenFullMatter,
  onDownloadMandate,
}) {
  if (!row) return null

  const document = getMandateDocument(row, packet)
  const timeline = buildIncomingMatterTimeline(row, events, packet)
  const propertyArea = firstText(row.propertyArea, [row.development, row.unit ? `Unit ${row.unit}` : ''].filter(Boolean).join(' / '))
  const assignedTo = row.assignedAttorney?.name || 'Young Law inc.'

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-[1px]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close incoming matter overview" onClick={onClose} />
      <section className="relative flex h-full w-full max-w-[880px] flex-col overflow-hidden bg-white shadow-2xl sm:my-4 sm:mr-4 sm:h-[calc(100%-2rem)] sm:rounded-2xl">
        <header className="border-b border-slate-100 px-5 py-5 md:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Incoming Matter</span>
              <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-slate-950">{row.propertyAddress || row.property}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-slate-500">
                <span>Matter No. {row.reference}</span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 size={14} />
                  Received {formatDateTime(row.incomingSince || row.createdAt)}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={!document.packetId || downloadingMandate}
                onClick={() => onDownloadMandate?.(document)}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#00614f] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#00463d] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={16} />
                {downloadingMandate ? 'Preparing' : 'Download Mandate'}
              </button>
              <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" aria-label="Close">
                <X size={19} />
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 md:px-7">
          <section className="grid gap-3 md:grid-cols-4">
            <DrawerMetric icon={Flag} label="Stage" value={row.status} helper={row.nextAction} />
            <DrawerMetric icon={CalendarDays} label="Assigned On" value={formatShortDate(row.createdAt || row.incomingSince)} helper={`${formatIncomingAge(row.incomingAgeDays)} in queue`} />
            <DrawerMetric icon={Building2} label="Assigned By" value={row.assignedBySource?.label || 'Private'} helper={row.assignedBySource?.kind === 'private' ? 'Private instruction' : 'Network partner'} />
            <DrawerMetric icon={UserRound} label="Assigned To" value={assignedTo} helper={row.assignedAttorney?.email || row.matterType} />
          </section>

          <section className="mt-6">
            <h3 className="text-sm font-semibold text-slate-950">Parties Involved</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <ContactCard icon={UserRound} label="Seller" name={row.seller} email={row.sellerEmail} phone={row.sellerPhone} />
              <ContactCard icon={UsersRound} label="Agent" name={row.agentName || row.agent || 'Agent pending'} email={row.agentEmail} phone={row.agentPhone} meta={row.assignedBySource?.label} />
            </div>
          </section>

          <section className="mt-6">
            <h3 className="text-sm font-semibold text-slate-950">Property</h3>
            <article className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <PropertyThumbnail row={row} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-slate-950">{row.propertyAddress || row.property}</p>
                  {propertyArea ? (
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-slate-500">
                      <MapPin size={14} className="shrink-0" />
                      {propertyArea}
                    </p>
                  ) : null}
                  {row.erf ? <p className="mt-2 text-xs font-semibold text-slate-500">ERF {row.erf}</p> : null}
                </div>
                <div className="grid min-w-[220px] grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Asking Price</p>
                    <p className="mt-1 font-semibold text-slate-950">{formatCurrency(row.purchasePrice || row.matterValue)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Property Type</p>
                    <p className="mt-1 font-semibold text-slate-950">{row.propertyType || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Listing Ref</p>
                    <p className="mt-1 font-semibold text-slate-950">{row.listingReference || row.privateListingId || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Matter Type</p>
                    <p className="mt-1 font-semibold text-slate-950">{row.matterType}</p>
                  </div>
                </div>
              </div>
            </article>
          </section>

          <section className="mt-6">
            <h3 className="text-sm font-semibold text-slate-950">Mandate Document</h3>
            <article className="mt-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <FileText size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-950">{document.name}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {packetLoading ? 'Loading mandate details...' : `Uploaded ${formatDateTime(document.uploadedAt)}`}
                </p>
                {packetError ? <p className="mt-1 text-xs font-semibold text-amber-700">{packetError}</p> : null}
              </div>
              <button
                type="button"
                disabled={!document.packetId || downloadingMandate}
                onClick={() => onDownloadMandate?.(document)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#00614f] px-4 text-sm font-semibold text-white transition hover:bg-[#00463d] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={15} />
                Download
              </button>
            </article>
          </section>

          <section className="mt-6">
            <h3 className="text-sm font-semibold text-slate-950">Timeline</h3>
            <div className="mt-3 space-y-0">
              {timeline.map((item, index) => (
                <div key={item.id || `${item.label}-${index}`} className="grid grid-cols-[28px_1fr] gap-3">
                  <div className="flex flex-col items-center">
                    <span className={classNames('mt-1 h-3 w-3 rounded-full', item.tone === 'emerald' ? 'bg-[#00614f]' : item.tone === 'amber' ? 'bg-amber-400' : 'bg-slate-300')} />
                    {index < timeline.length - 1 ? <span className="h-9 w-px bg-slate-200" /> : null}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">{formatDateTime(item.at)}</p>
                  </div>
                </div>
              ))}
              {!timeline.length ? <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">No intake activity has been recorded yet.</p> : null}
            </div>
          </section>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-5 py-4 md:px-7">
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <CheckCircle2 size={16} />
            Mark as Actioned
          </button>
          <button type="button" onClick={() => onOpenFullMatter?.(row)} className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-[#00614f] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#00463d]">
            Open Full Matter
            <ArrowRight size={16} />
          </button>
        </footer>
      </section>
    </div>
  )
}

function getMatterPreview(row = {}) {
  const buyerName = resolvePortalBuyerName(row)
  const sellerName = resolvePortalSellerName(row, { fallback: 'Seller pending' })
  const propertyLabel = resolvePortalPropertyLabel(row)
  return {
    matterId: row.matterId,
    matterReference: row.matterReference || row.reference,
    financeType: row.financeType || '',
    purchasePrice: row.purchasePrice || row.matterValue || 0,
    sellerName,
    sellerHasExistingBond: row.sellerHasExistingBond || false,
    currentBondBank: row.currentBondBank || row.bank || '',
    estimatedSettlementAmount: row.estimatedSettlementAmount || 0,
    propertyLabel,
    lifecycleState: row.lifecycleState || 'active',
    currentStage: row.currentStage || row.stage?.label || '',
    registrationDate: row.registrationDate || null,
    lastUpdated: row.lastUpdated || row.lastActivity || row.createdAt || null,
    buyerName,
    clientName: row.clientName || buyerName,
    developmentName: row.developmentName || row.development || '',
  }
}

function RowActions({ row }) {
  const preview = getMatterPreview(row)
  return (
    <details className="relative" onClick={(event) => event.stopPropagation()}>
      <summary className="inline-flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
        <MoreHorizontal size={17} />
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-2 text-sm font-semibold text-slate-700 shadow-xl">
        <Link className="block rounded-lg px-3 py-2 hover:bg-slate-50" to={row.actionHref} state={{ matterPreview: preview }}>Open Matter</Link>
      </div>
    </details>
  )
}

function canAcceptIncomingMatter(row = {}) {
  if (row.firmAcceptanceStatus === 'accepted' || row.allocationState === 'awaiting_staff_assignment' || row.allocationState === 'staff_assigned') {
    return false
  }
  return row.statusKey === 'ready_for_acceptance' || row.status === 'Ready For Acceptance'
}

function canDeclineIncomingMatter(row = {}) {
  if (row.isPreInstruction) return false
  return !['accepted', 'declined', 'removed', 'completed'].includes(normalize(row.statusKey || row.status))
}

function canAssignIncomingMatter(row = {}, canManageAssignments = false) {
  if (!canManageAssignments || row.isPreInstruction || !row.assignmentId) return false
  return ['awaiting_staff_assignment', 'staff_assigned'].includes(normalize(row.allocationState))
}

function getIncomingMatterActionLabel(row = {}) {
  return row.matterType || 'Attorney Instruction'
}

function IncomingRowActions({
  row,
  onAcceptMatter,
  onDeclineMatter,
  onAssignMatter,
  accepting = false,
  declining = false,
  assigning = false,
  canManageAssignments = false,
}) {
  const href = row.actionHref || '#'
  const preview = getMatterPreview(row)
  const readyForAcceptance = canAcceptIncomingMatter(row)
  const canDecline = canDeclineIncomingMatter(row)
  const canAssign = canAssignIncomingMatter(row, canManageAssignments)
  const matterLabel = getIncomingMatterActionLabel(row)

  return (
    <details className="relative" onClick={(event) => event.stopPropagation()}>
      <summary className="inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900">
        <MoreHorizontal size={17} />
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 text-sm font-semibold text-slate-700 shadow-xl">
        {row.actionHref ? (
          <Link className="block rounded-lg px-3 py-2 hover:bg-slate-50" to={href} state={{ matterPreview: preview }}>
            {row.isPreInstruction ? 'Open Signed Mandate' : `Open ${matterLabel}`}
          </Link>
        ) : null}
        {readyForAcceptance ? (
          <button
            type="button"
            disabled={accepting}
            onClick={() => onAcceptMatter?.(row)}
            className="block w-full rounded-lg px-3 py-2 text-left text-[#00614f] hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
          >
            {accepting ? `Accepting ${matterLabel}` : `Accept ${matterLabel}`}
          </button>
        ) : null}
        {canAssign ? (
          <button
            type="button"
            disabled={assigning}
            onClick={() => onAssignMatter?.(row)}
            className="block w-full rounded-lg px-3 py-2 text-left text-[#00614f] hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
          >
            {assigning ? 'Assigning Primary' : row.allocationState === 'staff_assigned' ? 'Reassign Primary' : 'Assign Primary'}
          </button>
        ) : null}
        {canDecline ? (
          <button
            type="button"
            disabled={declining}
            onClick={() => onDeclineMatter?.(row)}
            className="block w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
          >
            {declining ? `Declining ${matterLabel}` : `Decline ${matterLabel}`}
          </button>
        ) : null}
        {row.isPreInstruction ? (
          <p className="px-3 py-2 text-xs font-medium leading-5 text-slate-500">Formal instruction actions unlock after an accepted OTP.</p>
        ) : null}
      </div>
    </details>
  )
}

function WaitingOnChips({ labels = [] }) {
  const nextLabels = labels.length ? labels : ['Instruction review']

  return (
    <div className="flex min-w-[170px] flex-wrap gap-1.5">
      {nextLabels.map((label) => (
        <span
          key={label}
          className={classNames(
            'inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold',
            WAITING_ON_STYLES[label] || WAITING_ON_STYLES['Instruction review'],
          )}
        >
          {label}
        </span>
      ))}
    </div>
  )
}

function IncomingMattersTable({
  rows = [],
  selectedRows = [],
  onToggleRow,
  onToggleAll,
  onOpenMatter,
  onAcceptMatter,
  onDeclineMatter,
  onAssignMatter,
  acceptingMatterId = '',
  decliningMatterId = '',
  assigningMatterId = '',
  canManageAssignments = false,
}) {
  const allSelected = rows.length > 0 && rows.every((row) => selectedRows.includes(row.matterId))

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
          <thead className="bg-white text-[0.68rem] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="w-10 border-b border-slate-200 px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} aria-label="Select all incoming matters" />
              </th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Property / Matter</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Seller</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Current Stage</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Assigned By</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Assigned On</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const selected = selectedRows.includes(row.matterId)
              const readyForAcceptance = canAcceptIncomingMatter(row)
              const canAssign = canAssignIncomingMatter(row, canManageAssignments)
              const accepting = acceptingMatterId === row.assignmentId
              const declining = decliningMatterId === row.assignmentId
              const assigning = assigningMatterId === row.assignmentId
              const matterLabel = getIncomingMatterActionLabel(row)
              const propertyArea = firstText(row.propertyArea, [row.development, row.unit ? `Unit ${row.unit}` : ''].filter(Boolean).join(' / '))
              return (
                <tr
                  key={row.assignmentId || row.matterId}
                  className="group cursor-pointer align-middle transition hover:bg-slate-50/70 focus-within:bg-slate-50/70"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenMatter?.(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpenMatter?.(row)
                    }
                  }}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => onToggleRow(row.matterId)}
                      aria-label={`Select ${row.reference}`}
                    />
                  </td>
                  <td className="min-w-[310px] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <PropertyThumbnail row={row} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-950">{row.propertyAddress || row.property}</p>
                        {propertyArea ? <p className="mt-1 truncate text-xs font-medium text-slate-500">{propertyArea}</p> : null}
                        <p className="mt-1 truncate text-xs font-medium text-slate-500">{row.reference}</p>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[210px] px-4 py-3">
                    <p className="truncate font-semibold text-slate-800">{row.seller}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">Seller</p>
                  </td>
                  <td className="min-w-[190px] px-4 py-3">
                    <StatusPill status={row.status} />
                    <div className="mt-2"><WaitingOnChips labels={row.waitingOnLabels} /></div>
                  </td>
                  <td className="px-4 py-3"><AssignedBySource source={row.assignedBySource} compact /></td>
                  <td className="min-w-[150px] px-4 py-3">
                    <p className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                      <Clock3 size={15} className="text-slate-400" />
                      {formatShortDate(row.createdAt || row.lastActivity)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-500">{formatIncomingAge(row.incomingAgeDays)} in queue</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {readyForAcceptance ? (
                        <button
                          type="button"
                          disabled={accepting}
                          onClick={(event) => {
                            event.stopPropagation()
                            onAcceptMatter?.(row)
                          }}
                          className="inline-flex h-9 min-w-[118px] items-center justify-center gap-1.5 rounded-lg bg-[#00463d] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00614f] disabled:cursor-wait disabled:opacity-70"
                        >
                          <CheckCircle2 size={14} />
                          {accepting ? 'Accepting' : `Accept ${matterLabel}`}
                        </button>
                      ) : row.actionHref ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onOpenMatter?.(row)
                          }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#00463d] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00614f]"
                        >
                          Open Matter
                          <ArrowRight size={14} />
                        </button>
                      ) : null}
                      {canAssign ? (
                        <button
                          type="button"
                          disabled={assigning}
                          onClick={(event) => {
                            event.stopPropagation()
                            onAssignMatter?.(row)
                          }}
                          className="inline-flex h-9 min-w-[104px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
                        >
                          <UserPlus size={14} />
                          {assigning ? 'Assigning' : row.allocationState === 'staff_assigned' ? 'Reassign' : 'Assign'}
                        </button>
                      ) : null}
                      {readyForAcceptance ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onOpenMatter?.(row)
                          }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          Open
                          <ArrowRight size={14} />
                        </button>
                      ) : null}
                      <IncomingRowActions
                        row={row}
                        onAcceptMatter={onAcceptMatter}
                        onDeclineMatter={onDeclineMatter}
                        onAssignMatter={onAssignMatter}
                        accepting={accepting}
                        declining={declining}
                        assigning={assigning}
                        canManageAssignments={canManageAssignments}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function BulkActionBar({ selectedCount, onClear }) {
  if (!selectedCount) return null
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-xl border border-[#00614f]/20 bg-emerald-50 p-3 text-sm shadow-sm">
      <strong className="mr-2 text-[#00463d]">{selectedCount} selected</strong>
      <span className="text-slate-600">Bulk actions are unavailable until a supported operation is selected.</span>
      <button type="button" onClick={onClear} className="ml-auto rounded-lg px-3 py-2 font-semibold text-slate-500 hover:bg-white">
        Clear
      </button>
    </section>
  )
}

function MattersTable({ rows = [], selectedRows = [], onToggleRow, onToggleAll, onOpenMatter }) {
  const showDevelopmentColumns = rows.some((row) => row.matterTypeKeys.includes('development'))
  const allSelected = rows.length > 0 && rows.every((row) => selectedRows.includes(row.matterId))

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1260px] border-collapse text-left text-sm">
          <thead className="bg-white text-[0.68rem] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="w-10 border-b border-slate-200 px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} aria-label="Select all matters" />
              </th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Matter Reference</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Property</th>
              {showDevelopmentColumns ? <th className="border-b border-slate-200 px-4 py-3 font-semibold">Development</th> : null}
              {showDevelopmentColumns ? <th className="border-b border-slate-200 px-4 py-3 font-semibold">Unit</th> : null}
              {showDevelopmentColumns ? <th className="border-b border-slate-200 px-4 py-3 font-semibold">Phase</th> : null}
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Buyer / Seller</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Stage</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Next Action</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Due</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Assigned To</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Status</th>
              <th className="border-b border-slate-200 px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const selected = selectedRows.includes(row.matterId)
              const preview = getMatterPreview(row)
              return (
                <tr
                  key={row.assignmentId || row.matterId}
                  className="group cursor-pointer align-middle transition hover:bg-slate-50/70 focus-within:bg-slate-50/70"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenMatter?.(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpenMatter?.(row)
                    }
                  }}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => onToggleRow(row.matterId)}
                      aria-label={`Select ${row.reference}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-950">
                    <Link
                      to={row.actionHref}
                      state={{ matterPreview: preview }}
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center gap-1 text-slate-950 hover:text-[#00614f]"
                    >
                      {row.reference}
                      <ArrowRight size={13} className="opacity-0 transition group-hover:opacity-100" />
                    </Link>
                  </td>
                  <td className="max-w-[250px] px-4 py-3">
                    <p className="truncate font-medium text-slate-800">{row.property}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{row.matterType}</p>
                  </td>
                  {showDevelopmentColumns ? <td className="max-w-[190px] px-4 py-3 text-slate-700"><span className="block truncate">{row.development || '-'}</span></td> : null}
                  {showDevelopmentColumns ? <td className="px-4 py-3 text-slate-700">{row.unit || '-'}</td> : null}
                  {showDevelopmentColumns ? <td className="px-4 py-3 text-slate-700">{row.phase || '-'}</td> : null}
                  <td className="max-w-[210px] px-4 py-3">
                    <p className="truncate font-medium text-slate-800">{row.buyer}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{row.seller}</p>
                  </td>
                  <td className="px-4 py-3"><StageProgress stage={row.stage} /></td>
                  <td className="min-w-[220px] px-4 py-3">
                    <p className={classNames('font-semibold', row.status === 'Delayed' ? 'text-red-600' : row.status === 'Attention' ? 'text-orange-600' : 'text-slate-800')}>
                      {row.nextAction}
                    </p>
                    <div className="mt-2 hidden flex-wrap gap-2 group-hover:flex">
                      <Link
                        to={row.actionHref}
                        state={{ matterPreview: preview }}
                        onClick={(event) => event.stopPropagation()}
                        className="text-xs font-semibold text-[#00614f]"
                      >
                        Open
                      </Link>
                    </div>
                  </td>
                  <td className={classNames('px-4 py-3 font-semibold', dueTone(row.expectedDue, row.status))}>{formatDue(row.expectedDue)}</td>
                  <td className="px-4 py-3"><Assignee person={row.assignedAttorney} /></td>
                  <td className="px-4 py-3"><StatusPill status={row.status} /></td>
                  <td className="px-4 py-3"><RowActions row={row} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function IncomingAssignmentDialog({
  row,
  firmId = '',
  pending = false,
  onCancel,
  onConfirm,
}) {
  const [members, setMembers] = useState([])
  const [attorneyUserId, setAttorneyUserId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!row) return undefined

    const resolvedFirmId = row.firmId || row.attorneyFirmId || firmId
    if (!resolvedFirmId) {
      queueMicrotask(() => {
        if (active) setError('Attorney firm context is missing for this assignment.')
      })
      return undefined
    }

    queueMicrotask(() => {
      if (active) setLoading(true)
    })
    getAssignableAttorneyFirmMembers(resolvedFirmId, row.laneKey || 'transfer')
      .then((result) => {
        if (!active) return
        const options = result.primaryAttorneys || []
        const preferredId = row.preferredAttorney?.id || ''
        const assignedId = row.assignedAttorney?.preferred ? '' : row.assignedAttorney?.id || ''
        const defaultId = [preferredId, assignedId].find((candidate) =>
          candidate && options.some((option) => (option.userId || option.id) === candidate),
        )
        setMembers(options)
        setAttorneyUserId(defaultId || '')
      })
      .catch((loadError) => {
        if (active) setError(loadError?.message || 'Unable to load eligible firm members.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [firmId, row])

  if (!row) return null

  const isReassign = row.allocationState === 'staff_assigned'
  const selectedMember = members.find((member) => (member.userId || member.id) === attorneyUserId) || null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4 backdrop-blur-[1px]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close assignment dialog" onClick={pending ? undefined : onCancel} />
      <section className="relative w-full max-w-[500px] rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[#00614f]">
            <UserPlus size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-950">{isReassign ? 'Reassign Primary Attorney' : 'Assign Primary Attorney'}</h2>
            <p className="mt-1 truncate text-sm font-medium text-slate-500">{row.reference}</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">{resolvePortalBuyerName(row)}</p>
          <p className="mt-1 truncate">{resolvePortalPropertyLabel(row)}</p>
          {row.preferredAttorney?.name || row.preferredAttorney?.email ? (
            <p className="mt-2 text-xs font-semibold text-[#00614f]">
              Agent preference: {[row.preferredAttorney.name, row.preferredAttorney.email].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Primary {row.matterType || 'Attorney'}</span>
          <select
            value={attorneyUserId}
            onChange={(event) => setAttorneyUserId(event.target.value)}
            disabled={pending || loading}
            className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[#00614f] disabled:cursor-wait disabled:bg-slate-50"
          >
            <option value="">{loading ? 'Loading firm members...' : 'Select an active firm member'}</option>
            {members.map((member) => (
              <option key={member.userId || member.id} value={member.userId || member.id}>
                {member.name || member.email || 'Firm member'}
              </option>
            ))}
          </select>
        </label>

        {selectedMember?.email ? <p className="mt-2 text-xs font-medium text-slate-500">{selectedMember.email}</p> : null}
        {error ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={pending} className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-60">
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || loading || !attorneyUserId}
            onClick={() => onConfirm({ row, attorneyUserId })}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#00463d] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#00614f] disabled:cursor-not-allowed disabled:opacity-65"
          >
            {pending ? 'Assigning...' : isReassign ? 'Reassign Primary' : 'Assign Primary'}
          </button>
        </div>
      </section>
    </div>
  )
}

function EmptyState({ view }) {
  const itemLabel = view?.itemLabel || 'matters'

  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-[#00614f]">
        <CheckCircle2 size={20} />
      </div>
      <h2 className="mt-4 text-base font-semibold text-slate-950">No {itemLabel} match this view</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
        Adjust the filters or clear the quick view to return to this queue.
      </p>
    </section>
  )
}

function IncomingDeclineDialog({
  row,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
  pending = false,
}) {
  if (!row) return null
  const reasonText = String(reason || '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4 backdrop-blur-[1px]" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close decline transfer dialog" onClick={pending ? undefined : onCancel} />
      <section className="relative w-full max-w-[460px] rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <XCircle size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-950">Decline Transfer</h2>
            <p className="mt-1 truncate text-sm font-medium text-slate-500">{row.reference}</p>
          </div>
        </div>

        <label className="mt-5 grid gap-2">
          <span className="text-xs font-semibold text-slate-600">Reason</span>
          <textarea
            value={reasonText}
            onChange={(event) => onReasonChange(event.target.value)}
            rows={4}
            disabled={pending}
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-red-200 focus:ring-4 focus:ring-red-50 disabled:cursor-wait disabled:opacity-70"
          />
        </label>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !reasonText.trim()}
            onClick={onConfirm}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <XCircle size={16} />
            {pending ? 'Declining' : 'Decline Transfer'}
          </button>
        </div>
      </section>
    </div>
  )
}

function Pagination({ pagination, itemLabel = 'matters', onPageChange, pageSize, onPageSizeChange }) {
  const pages = Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, index) => index + 1)
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm md:flex-row md:items-center md:justify-between">
      <p>
        Showing {formatNumber(pagination.showingFrom)} to {formatNumber(pagination.showingTo)} of {formatNumber(pagination.totalRows)} {itemLabel}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700"
        >
          {ATTORNEY_MATTER_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>{size} rows</option>
          ))}
        </select>
        {pages.map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => onPageChange(page)}
            className={classNames(
              'h-9 min-w-9 rounded-lg px-3 font-semibold transition',
              pagination.page === page ? 'bg-[#00614f] text-white' : 'text-slate-700 hover:bg-slate-50',
            )}
          >
            {page}
          </button>
        ))}
        {pagination.totalPages > 5 ? <span className="px-2 font-semibold">...</span> : null}
        <button
          type="button"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
          className="h-9 rounded-lg px-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>
  )
}

function AttorneyMattersPage() {
  const { matterType = 'all' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const permissionsState = useAttorneyPermissions()
  const [source, setSource] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedRows, setSelectedRows] = useState([])
  const [selectedIncomingRow, setSelectedIncomingRow] = useState(null)
  const [drawerEvents, setDrawerEvents] = useState([])
  const [drawerPacket, setDrawerPacket] = useState(null)
  const [drawerPacketLoading, setDrawerPacketLoading] = useState(false)
  const [drawerPacketError, setDrawerPacketError] = useState('')
  const [downloadingMandateId, setDownloadingMandateId] = useState('')
  const [incomingAction, setIncomingAction] = useState({ pendingId: '', error: '' })
  const [declineDialog, setDeclineDialog] = useState({ row: null, reason: '' })
  const [assignmentDialog, setAssignmentDialog] = useState({ row: null })

  const viewKey = normalize(matterType || 'all')

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')
      try {
        const workspace = await getAttorneyMatterWorkspace({ view: viewKey })
        if (!active) return
        setSource(workspace.source)
      } catch (loadError) {
        if (!active) return
        setError(loadError?.message || 'Unable to load attorney matters.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [viewKey])

  useEffect(() => {
    function handleHeaderSearch(event) {
      setSearchTerm(String(event.detail?.value || ''))
      setPage(1)
    }
    window.addEventListener('itg:attorney-matters-search', handleHeaderSearch)
    return () => window.removeEventListener('itg:attorney-matters-search', handleHeaderSearch)
  }, [])

  useEffect(() => {
    setPage(1)
    setSelectedRows([])
    setSelectedIncomingRow(null)
    setIncomingAction({ pendingId: '', error: '' })
    setDeclineDialog({ row: null, reason: '' })
    setAssignmentDialog({ row: null })
  }, [filters, searchTerm, viewKey])

  useEffect(() => {
    setFilters((previous) => (
      previous.matterType === 'all'
        ? previous
        : { ...previous, matterType: 'all' }
    ))
  }, [viewKey])

  const workspace = useMemo(() => {
    if (!source) return null
    return buildAttorneyMatterWorkspace(source, {
      view: viewKey,
      search: searchTerm,
      filters,
      quickFilter: '',
      page,
      pageSize,
    })
  }, [filters, page, pageSize, searchTerm, source, viewKey])

  useEffect(() => {
    if (!workspace?.view?.key || workspace.view.key === viewKey) return
    const basePath = location.pathname.startsWith('/attorney/transactions') ? '/attorney/transactions' : '/attorney/matters'
    navigate(`${basePath}/${workspace.view.key}${location.search || ''}`, { replace: true })
  }, [location.pathname, location.search, navigate, viewKey, workspace?.view?.key])

  const usesIncomingQueue = Boolean(workspace?.view?.usesIncomingQueue)
  const canManageIncomingAssignments = Boolean(
    permissionsState.hasPermission('can_view_all_firm_matters') &&
    permissionsState.hasPermission('can_update_attorney_assignments'),
  )

  useEffect(() => {
    let active = true
    setDrawerEvents([])
    setDrawerPacket(null)
    setDrawerPacketError('')

    if (!selectedIncomingRow) return undefined

    async function loadDrawerContext() {
      setDrawerPacketLoading(true)
      const transactionId = selectedIncomingRow.isPreInstruction ? '' : selectedIncomingRow.matterId || selectedIncomingRow.transactionId || ''
      const packetId = selectedIncomingRow.mandatePacketId || ''

      const [eventsResult, packetResult] = await Promise.allSettled([
        transactionId ? fetchTransactionEvents(transactionId, { limit: 8 }) : Promise.resolve([]),
        packetId ? fetchDocumentPacket(packetId, { includeVersions: true, includeEvents: true }) : Promise.resolve(null),
      ])

      if (!active) return
      setDrawerEvents(eventsResult.status === 'fulfilled' ? eventsResult.value || [] : [])
      if (packetResult.status === 'fulfilled') {
        setDrawerPacket(packetResult.value || null)
      } else {
        setDrawerPacket(null)
        setDrawerPacketError(packetResult.reason?.message || 'Mandate details could not be loaded.')
      }
      setDrawerPacketLoading(false)
    }

    void loadDrawerContext()

    return () => {
      active = false
    }
  }, [selectedIncomingRow])

  function handleToggleRow(matterId) {
    setSelectedRows((previous) =>
      previous.includes(matterId)
        ? previous.filter((id) => id !== matterId)
        : [...previous, matterId],
    )
  }

  function handleToggleAll(checked) {
    setSelectedRows(checked ? (workspace?.tableRows || []).map((row) => row.matterId) : [])
  }

  function handleOpenMatter(row = {}) {
    if (usesIncomingQueue) {
      setSelectedIncomingRow(row)
      return
    }
    if (!row.actionHref) return
    navigate(row.actionHref, { state: { matterPreview: getMatterPreview(row) } })
  }

  function handleOpenFullMatter(row = {}) {
    if (!row.actionHref) return
    navigate(row.actionHref, { state: { matterPreview: getMatterPreview(row) } })
  }

  async function handleDownloadMandate(document = {}) {
    const key = document.versionId || document.packetId || document.fallbackHref
    if (!key) return
    setDownloadingMandateId(key)
    const pendingWindow = typeof window !== 'undefined' ? window.open('', '_blank') : null
    if (pendingWindow) pendingWindow.opener = null
    try {
      let downloadUrl = ''
      if (document.packetId && document.versionId) {
        try {
          const access = await requestPersistedPdfAccess({
            packetId: document.packetId,
            versionId: document.versionId,
            purpose: 'download',
          })
          downloadUrl = access?.signedUrl || ''
        } catch {
          downloadUrl = ''
        }
      }
      downloadUrl = downloadUrl || document.fallbackHref || ''
      if (!downloadUrl) throw new Error('No mandate document is linked to this incoming matter yet.')
      if (pendingWindow) {
        pendingWindow.location.href = downloadUrl
      } else if (typeof window !== 'undefined') {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (downloadError) {
      if (pendingWindow) pendingWindow.close()
      setIncomingAction({
        pendingId: '',
        error: downloadError?.message || 'Unable to download the mandate.',
      })
    } finally {
      setDownloadingMandateId('')
    }
  }

  async function refreshIncomingWorkspaceAfterDecision(row = {}) {
    const refreshedWorkspace = await getAttorneyMatterWorkspace({ view: viewKey })
    setSource(refreshedWorkspace.source)
    setSelectedRows((previous) => previous.filter((id) => id !== row.matterId))
  }

  async function handleAcceptIncomingMatter(row = {}) {
    const assignmentId = row.assignmentId || row.id
    const transactionId = row.matterId || row.transactionId
    if (!assignmentId && !transactionId) return

    setIncomingAction({ pendingId: assignmentId || transactionId, kind: 'accept', error: '' })
    try {
      const result = await acceptAttorneyIncomingMatterInstruction({
        assignmentId,
        transactionId,
      })
      await refreshIncomingWorkspaceAfterDecision(row)
      setIncomingAction({ pendingId: '', error: '' })
      if (result?.actionHref && selectedIncomingRow?.assignmentId === row.assignmentId) {
        setSelectedIncomingRow((previous) => previous ? { ...previous, actionHref: result.actionHref } : previous)
      }
    } catch (actionError) {
      setIncomingAction({
        pendingId: '',
        error: actionError?.message || 'Unable to accept this incoming matter.',
      })
    }
  }

  function handleRequestDeclineIncomingMatter(row = {}) {
    setIncomingAction({ pendingId: '', error: '' })
    setDeclineDialog({ row, reason: '' })
  }

  function handleRequestAssignIncomingMatter(row = {}) {
    setIncomingAction({ pendingId: '', error: '' })
    setAssignmentDialog({ row })
  }

  async function handleDeclineIncomingMatter() {
    const row = declineDialog.row || {}
    const reason = String(declineDialog.reason || '').trim()
    if (!reason) return

    const assignmentId = row.assignmentId || row.id
    const transactionId = row.matterId || row.transactionId
    if (!assignmentId && !transactionId) return

    setIncomingAction({ pendingId: assignmentId || transactionId, kind: 'decline', error: '' })
    try {
      await declineAttorneyIncomingMatterInstruction({
        assignmentId,
        transactionId,
        reason,
      })
      await refreshIncomingWorkspaceAfterDecision(row)
      setDeclineDialog({ row: null, reason: '' })
      setIncomingAction({ pendingId: '', error: '' })
    } catch (actionError) {
      setIncomingAction({
        pendingId: '',
        error: actionError?.message || 'Unable to decline this incoming matter.',
      })
    }
  }

  async function handleAssignIncomingMatter({ row = {}, attorneyUserId = '' } = {}) {
    const assignmentId = row.assignmentId || row.id
    if (!assignmentId || !attorneyUserId) return

    setIncomingAction({ pendingId: assignmentId, kind: 'assign', error: '' })
    try {
      await assignAttorneyIncomingMatterPrimary({
        assignmentId,
        attorneyUserId,
        transactionId: row.transactionId || row.matterId || '',
        laneKey: row.laneKey || 'transfer',
      })
      await refreshIncomingWorkspaceAfterDecision(row)
      setAssignmentDialog({ row: null })
      setIncomingAction({ pendingId: '', error: '' })
    } catch (actionError) {
      setIncomingAction({
        pendingId: '',
        error: actionError?.message || 'Unable to assign this incoming matter.',
      })
    }
  }

  if (permissionsState.loading) return <LoadingState copy="Loading attorney permissions..." />
  if (loading) return <LoadingState />

  if (error || permissionsState.error) {
    return <ErrorState>{error || permissionsState.error}</ErrorState>
  }

  if (!workspace?.firm?.id) {
    return (
      <section className="w-full px-3 py-4">
        <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-950">Firm workspace unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            We could not load an active firm matter queue just now. Please refresh or open Firm Settings to repair the attorney firm context.
          </p>
        </div>
      </section>
    )
  }

  return (
    <main className="w-full max-w-none bg-[#f7f9fb] px-0 py-3">
      <div className="w-full max-w-none space-y-4 px-2 md:px-3 xl:px-4">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {workspace.kpis.map((item) => <KpiCard key={item.key} item={item} />)}
        </section>

        {incomingAction.error ? (
          <section className="flex items-start gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 shadow-sm">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <span>{incomingAction.error}</span>
          </section>
        ) : null}

        <BulkActionBar selectedCount={selectedRows.length} onClear={() => setSelectedRows([])} />

        {workspace.tableRows.length ? (
          usesIncomingQueue ? (
            <IncomingMattersTable
              rows={workspace.tableRows}
              selectedRows={selectedRows}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
              onOpenMatter={handleOpenMatter}
              onAcceptMatter={handleAcceptIncomingMatter}
              onDeclineMatter={handleRequestDeclineIncomingMatter}
              onAssignMatter={handleRequestAssignIncomingMatter}
              acceptingMatterId={incomingAction.kind === 'accept' ? incomingAction.pendingId : ''}
              decliningMatterId={incomingAction.kind === 'decline' ? incomingAction.pendingId : ''}
              assigningMatterId={incomingAction.kind === 'assign' ? incomingAction.pendingId : ''}
              canManageAssignments={canManageIncomingAssignments}
            />
          ) : (
            <MattersTable
              rows={workspace.tableRows}
              selectedRows={selectedRows}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
              onOpenMatter={handleOpenMatter}
            />
          )
        ) : (
          <EmptyState view={workspace.view} />
        )}

        <Pagination
          pagination={workspace.pagination}
          itemLabel={workspace.view?.itemLabel || 'matters'}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize)
            setPage(1)
          }}
        />
      </div>

      <IncomingDeclineDialog
        row={declineDialog.row}
        reason={declineDialog.reason}
        pending={incomingAction.kind === 'decline' && Boolean(incomingAction.pendingId)}
        onReasonChange={(reason) => setDeclineDialog((previous) => ({ ...previous, reason }))}
        onCancel={() => setDeclineDialog({ row: null, reason: '' })}
        onConfirm={handleDeclineIncomingMatter}
      />
      <IncomingAssignmentDialog
        key={assignmentDialog.row?.assignmentId || assignmentDialog.row?.id || 'incoming-assignment-dialog'}
        row={assignmentDialog.row}
        firmId={workspace?.firm?.id || permissionsState.firmId || ''}
        pending={incomingAction.kind === 'assign' && Boolean(incomingAction.pendingId)}
        onCancel={() => setAssignmentDialog({ row: null })}
        onConfirm={handleAssignIncomingMatter}
      />
      <IncomingMatterDrawer
        row={selectedIncomingRow}
        events={drawerEvents}
        packet={drawerPacket}
        packetLoading={drawerPacketLoading}
        packetError={drawerPacketError}
        downloadingMandate={Boolean(downloadingMandateId)}
        onClose={() => setSelectedIncomingRow(null)}
        onOpenFullMatter={handleOpenFullMatter}
        onDownloadMandate={handleDownloadMandate}
      />
    </main>
  )
}

export default AttorneyMattersPage
