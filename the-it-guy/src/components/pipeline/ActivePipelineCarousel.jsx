import { Building2, CalendarDays, ChevronLeft, ChevronRight, Home, User2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

const currencyCompact = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const currencyWhole = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const MODE_CONFIG = {
  residential_sales: {
    cardWidth: 'w-[272px] min-w-[272px] sm:w-[284px] sm:min-w-[284px]',
    accent: '#2f6fed',
    gradient: 'from-[#eef4ff] via-white to-[#f7faff]',
    placeholder: 'from-[#edf4ff] via-[#f8fbff] to-[#e7eefb]',
    badgeFallback: 'border-[#d7e5ff] bg-[#f3f8ff] text-[#1f5ec8]',
    iconClass: 'bg-[#edf4ff] text-[#2f6fed]',
    summaryIconClass: 'bg-[#edf4ff] text-[#2f6fed]',
    stages: [
      { key: 'new_listing', label: 'New Listing', shortLabel: 'New Listing', badgeClass: 'border-[#ddd6fe] bg-[#f5f3ff] text-[#6d49d8]' },
      { key: 'under_offer', label: 'Under Offer', shortLabel: 'Under Offer', badgeClass: 'border-[#cfe0ff] bg-[#edf5ff] text-[#1769d1]' },
      { key: 'conditional', label: 'Conditional', shortLabel: 'Conditional', badgeClass: 'border-[#c9ead6] bg-[#eef9f2] text-[#1f8f57]' },
      { key: 'unconditional', label: 'Unconditional', shortLabel: 'Uncond.', badgeClass: 'border-[#f3d3ab] bg-[#fff4e6] text-[#ca7a11]' },
      { key: 'settled_pending_registration', label: 'Settled / Pending Reg.', shortLabel: 'Settled', badgeClass: 'border-[#d6e4f0] bg-[#f8fafc] text-[#52657a]' },
    ],
  },
  residential_leasing: {
    cardWidth: 'w-[272px] min-w-[272px] sm:w-[284px] sm:min-w-[284px]',
    accent: '#249f6d',
    gradient: 'from-[#eefaf3] via-white to-[#f7fcf9]',
    placeholder: 'from-[#ecfbf3] via-[#f8fffb] to-[#e7f7ef]',
    badgeFallback: 'border-[#ccead9] bg-[#eefaf4] text-[#1d8a5e]',
    iconClass: 'bg-[#ecfbf3] text-[#249f6d]',
    summaryIconClass: 'bg-[#ecfbf3] text-[#249f6d]',
    stages: [
      { key: 'rental_mandate', label: 'Rental Mandate', shortLabel: 'Mandate', badgeClass: 'border-[#d7e6ff] bg-[#eff6ff] text-[#295fbf]' },
      { key: 'tenant_application', label: 'Tenant Application', shortLabel: 'Application', badgeClass: 'border-[#d2f0dd] bg-[#effcf4] text-[#207a51]' },
      { key: 'lease_negotiation', label: 'Lease Negotiation', shortLabel: 'Negotiation', badgeClass: 'border-[#f3dfc0] bg-[#fff5e8] text-[#b96f19]' },
      { key: 'lease_signed', label: 'Lease Signed', shortLabel: 'Signed', badgeClass: 'border-[#d9e8f5] bg-[#f7fbff] text-[#49647b]' },
      { key: 'occupied', label: 'Occupied', shortLabel: 'Occupied', badgeClass: 'border-[#cde8d6] bg-[#eef9f2] text-[#1f8f57]' },
    ],
  },
  commercial_sales: {
    cardWidth: 'w-[304px] min-w-[304px] sm:w-[320px] sm:min-w-[320px]',
    accent: '#5a63f6',
    gradient: 'from-[#f1f2ff] via-white to-[#f9faff]',
    placeholder: 'from-[#eff1ff] via-[#f8f9ff] to-[#e8ebff]',
    badgeFallback: 'border-[#d8dcff] bg-[#f3f4ff] text-[#4d56d4]',
    iconClass: 'bg-[#f1f2ff] text-[#5a63f6]',
    summaryIconClass: 'bg-[#f1f2ff] text-[#5a63f6]',
    stages: [
      { key: 'listing', label: 'Listing', shortLabel: 'Listing', badgeClass: 'border-[#d6e1ff] bg-[#edf3ff] text-[#355fc8]' },
      { key: 'offer', label: 'Offer', shortLabel: 'Offer', badgeClass: 'border-[#d7defd] bg-[#eef1ff] text-[#5b5ee5]' },
      { key: 'under_offer', label: 'Under Offer', shortLabel: 'Under Offer', badgeClass: 'border-[#d7e9ff] bg-[#f0f7ff] text-[#2f6fed]' },
      { key: 'due_diligence', label: 'Due Diligence', shortLabel: 'Due Diligence', badgeClass: 'border-[#f1ddc0] bg-[#fff6e9] text-[#b97618]' },
      { key: 'sold', label: 'Sold', shortLabel: 'Sold', badgeClass: 'border-[#ccead8] bg-[#eefaf4] text-[#21845a]' },
    ],
  },
  commercial_leasing: {
    cardWidth: 'w-[304px] min-w-[304px] sm:w-[320px] sm:min-w-[320px]',
    accent: '#1f9b88',
    gradient: 'from-[#eefaf8] via-white to-[#f8fcfb]',
    placeholder: 'from-[#ecf9f7] via-[#f8fffe] to-[#e6f5f2]',
    badgeFallback: 'border-[#cde9e3] bg-[#eef9f7] text-[#187767]',
    iconClass: 'bg-[#eefaf8] text-[#1f9b88]',
    summaryIconClass: 'bg-[#eefaf8] text-[#1f9b88]',
    stages: [
      { key: 'requirement', label: 'Requirement', shortLabel: 'Requirement', badgeClass: 'border-[#d8e9ff] bg-[#f1f7ff] text-[#2e68c5]' },
      { key: 'viewing', label: 'Viewing', shortLabel: 'Viewing', badgeClass: 'border-[#cfe7ff] bg-[#edf6ff] text-[#1d73c9]' },
      { key: 'heads_of_terms', label: 'Heads of Terms', shortLabel: 'HOT', badgeClass: 'border-[#d8e2ff] bg-[#f3f5ff] text-[#5f63da]' },
      { key: 'negotiation', label: 'Negotiation', shortLabel: 'Negotiation', badgeClass: 'border-[#f0ddbc] bg-[#fff5e7] text-[#b47318]' },
      { key: 'signed', label: 'Signed', shortLabel: 'Signed', badgeClass: 'border-[#cde8d8] bg-[#eef9f3] text-[#228458]' },
    ],
  },
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeStageKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s/]+/g, '_')
}

function formatCompactCurrency(value, empty = 'R0') {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return empty
  return currencyCompact.format(amount).replace('ZAR', 'R')
}

function formatWholeCurrency(value, empty = 'R0') {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return empty
  return currencyWhole.format(amount).replace('ZAR', 'R')
}

function formatValueLabel(record, mode) {
  if (normalizeText(record.valueLabel)) return record.valueLabel
  const amount = Number(record.value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'Value pending'
  if (mode === 'residential_leasing' || mode === 'commercial_leasing') {
    return `${formatWholeCurrency(amount)} pm`
  }
  return formatCompactCurrency(amount)
}

function formatDaysInStage(record) {
  if (normalizeText(record.daysInStageLabel)) return record.daysInStageLabel
  const days = Number(record.daysInStage)
  if (!Number.isFinite(days) || days < 0) return '0 days in stage'
  if (days === 0) return 'Today'
  if (days === 1) return '1 day in stage'
  return `${days} days in stage`
}

function getInitials(value) {
  const tokens = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!tokens.length) return 'NA'
  return tokens.slice(0, 2).map((token) => token.charAt(0).toUpperCase()).join('')
}

function extractImageUrl(candidate) {
  if (!candidate) return ''
  if (typeof candidate === 'string') return normalizeText(candidate)
  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      const url = extractImageUrl(item)
      if (url) return url
    }
    return ''
  }
  if (typeof candidate === 'object') {
    return normalizeText(
      candidate.url ||
      candidate.src ||
      candidate.image_url ||
      candidate.imageUrl ||
      candidate.photo_url ||
      candidate.photoUrl ||
      candidate.cover_image_url ||
      candidate.coverImageUrl,
    )
  }
  return ''
}

function resolveRecordImage(record = {}) {
  return (
    extractImageUrl(record.imageUrl) ||
    extractImageUrl(record.image) ||
    extractImageUrl(record.primaryImage) ||
    extractImageUrl(record.images) ||
    extractImageUrl(record.galleryImages) ||
    ''
  )
}

function useModeConfig(mode) {
  return MODE_CONFIG[mode] || MODE_CONFIG.residential_sales
}

export function StageProgressTracker({ mode, currentStageKey }) {
  const config = useModeConfig(mode)
  const stages = config.stages
  const normalizedCurrentStage = normalizeStageKey(currentStageKey) || stages[0].key
  const currentIndex = Math.max(0, stages.findIndex((stage) => stage.key === normalizedCurrentStage))
  const progressPercent = stages.length > 1 ? (currentIndex / (stages.length - 1)) * 100 : 0

  return (
    <div className="space-y-2.5">
      <div className="relative px-1">
        <div className="absolute left-3 right-3 top-[7px] h-[2px] rounded-full bg-[#dbe4ee]" />
        <div
          className="absolute left-3 top-[7px] h-[2px] rounded-full"
          style={{
            width: `calc((100% - 24px) * ${progressPercent / 100})`,
            backgroundColor: config.accent,
          }}
        />
        <div className="relative grid grid-cols-5 gap-2">
          {stages.map((stage, index) => {
            const complete = index < currentIndex
            const current = index === currentIndex
            return (
              <div key={stage.key} className="min-w-0 text-center">
                <span
                  className="mx-auto block h-4 w-4 rounded-full border-2 bg-white"
                  style={{
                    borderColor: complete || current ? config.accent : '#d0d7e2',
                    backgroundColor: complete ? config.accent : '#ffffff',
                    boxShadow: current ? `0 0 0 4px ${config.accent}22` : 'none',
                  }}
                />
                <p className="mt-2 text-[10px] font-medium leading-[1.25] text-[#66768a]">{stage.shortLabel}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function PipelineImage({ mode, record }) {
  const config = useModeConfig(mode)
  const [broken, setBroken] = useState(false)
  const imageUrl = broken ? '' : resolveRecordImage(record)
  const PlaceholderIcon = mode.startsWith('commercial') ? Building2 : Home

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={normalizeText(record.imageAlt) || normalizeText(record.title) || 'Property image'}
        className="h-full w-full object-cover"
        onError={() => setBroken(true)}
      />
    )
  }

  return (
    <div className={`grid h-full w-full place-items-center bg-gradient-to-br ${config.placeholder}`}>
      <div className={`grid h-12 w-12 place-items-center rounded-2xl ${config.iconClass}`}>
        <PlaceholderIcon size={22} />
      </div>
    </div>
  )
}

export function ActivePipelineCard({ mode, record, onOpenRecord }) {
  const config = useModeConfig(mode)
  const normalizedStageKey = normalizeStageKey(record.stageKey)
  const currentStage = config.stages.find((stage) => stage.key === normalizedStageKey) || config.stages[0]
  const badgeClass = currentStage.badgeClass || config.badgeFallback
  const ownerName = normalizeText(record.ownerName) || 'Unassigned'
  const ownerRole = normalizeText(record.ownerRoleLabel) || (mode.startsWith('commercial') ? 'Broker' : 'Agent')
  const clientLabel = normalizeText(record.clientLabel) || 'Client'
  const clientName = normalizeText(record.clientName) || 'Client pending'

  return (
    <button
      type="button"
      onClick={() => onOpenRecord?.(record.id)}
      className={`${config.cardWidth} group shrink-0 snap-start overflow-hidden rounded-[24px] border border-[#dde5ef] bg-white text-left shadow-[0_14px_30px_rgba(15,23,42,0.06)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[#ccd8e6] hover:shadow-[0_18px_38px_rgba(15,23,42,0.08)]`}
    >
      <div className={`relative h-[164px] overflow-hidden bg-gradient-to-br ${config.gradient}`}>
        <PipelineImage mode={mode} record={record} />
        <span className={`absolute right-3 top-3 inline-flex max-w-[70%] items-center rounded-full border px-3 py-1 text-[11px] font-semibold shadow-sm backdrop-blur ${badgeClass}`}>
          <span className="truncate">{normalizeText(record.statusLabel) || currentStage.label}</span>
        </span>
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-1.5">
          <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-[#10243a]" title={record.title}>{record.title || 'Property pending'}</p>
          <p className="truncate text-[12px] text-[#66768a]" title={record.subtitle}>{record.subtitle || 'Area pending'}</p>
          <p className="pt-1 text-[16px] font-semibold tracking-[-0.02em] text-[#0f2748]">{formatValueLabel(record, mode)}</p>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${config.iconClass}`}>
              {getInitials(ownerName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-[#203247]" title={ownerName}>{ownerName}</p>
              <p className="truncate text-[11px] text-[#7b8ca2]">{ownerRole}</p>
            </div>
          </div>
          <p className="shrink-0 text-right text-[11px] font-medium leading-4 text-[#52657a]">{formatDaysInStage(record)}</p>
        </div>

        <StageProgressTracker mode={mode} currentStageKey={currentStage.key} />

        <div className="flex items-center gap-2 text-[12px] text-[#4a5f78]">
          <User2 size={14} className="shrink-0 text-[#70839a]" />
          <p className="truncate" title={`${clientLabel}: ${clientName}`}>
            <span className="font-medium text-[#5d7288]">{clientLabel}:</span> <span className="text-[#203247]">{clientName}</span>
          </p>
        </div>
      </div>
    </button>
  )
}

function DefaultEmptyState({ onViewAll }) {
  return (
    <div className="rounded-[24px] border border-dashed border-[#d8e1ec] bg-[#fbfdff] px-6 py-10 text-center">
      <p className="text-[16px] font-semibold tracking-[-0.02em] text-[#10243a]">No active transactions yet.</p>
      <p className="mt-2 text-[13px] leading-6 text-[#66768a]">
        Active transactions will appear here once deals begin moving through the pipeline.
      </p>
      {onViewAll ? (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-4 inline-flex items-center justify-center rounded-[14px] border border-[#d9e3ef] bg-white px-4 py-2 text-sm font-semibold text-[#1f5ec8] shadow-sm transition hover:border-[#c8d6e6] hover:bg-[#f8fbff]"
        >
          View pipeline
        </button>
      ) : null}
    </div>
  )
}

export default function ActivePipelineCarousel({
  title,
  subtitle,
  mode,
  records = [],
  emptyState = null,
  onViewAll,
  onOpenRecord,
  summary = null,
  viewAllLabel = 'View all transactions',
}) {
  const config = useModeConfig(mode)
  const scrollRef = useRef(null)
  const safeRecords = useMemo(() => (Array.isArray(records) ? records.filter(Boolean) : []), [records])
  const [scrollState, setScrollState] = useState({ canScrollLeft: false, canScrollRight: false })

  useEffect(() => {
    const scrollNode = scrollRef.current
    if (!scrollNode) return undefined

    const updateScrollState = () => {
      const maxScrollLeft = Math.max(0, scrollNode.scrollWidth - scrollNode.clientWidth)
      setScrollState({
        canScrollLeft: scrollNode.scrollLeft > 4,
        canScrollRight: scrollNode.scrollLeft < maxScrollLeft - 4,
      })
    }

    updateScrollState()
    scrollNode.addEventListener('scroll', updateScrollState, { passive: true })
    window.addEventListener('resize', updateScrollState)

    return () => {
      scrollNode.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('resize', updateScrollState)
    }
  }, [safeRecords.length])

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[1.08rem] font-semibold tracking-[-0.02em] text-[#10243a]">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-[#66768a]">{subtitle}</p> : null}
        </div>
        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex items-center gap-1 self-start text-sm font-semibold text-[#1f6dd5]"
          >
            {viewAllLabel}
            <ChevronRight size={16} />
          </button>
        ) : null}
      </div>

      {safeRecords.length ? (
        <>
          <div className="relative">
            <div
              ref={scrollRef}
              className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {safeRecords.map((record) => (
                <ActivePipelineCard
                  key={record.id}
                  mode={mode}
                  record={record}
                  onOpenRecord={onOpenRecord}
                />
              ))}
            </div>
            {safeRecords.length > 1 && scrollState.canScrollLeft ? (
              <button
                type="button"
                aria-label={`Scroll ${title} left`}
                onClick={() => scrollRef.current?.scrollBy({ left: scrollRef.current.clientWidth * -0.82, behavior: 'smooth' })}
                className="absolute left-2 top-[calc(50%-28px)] z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#dde5ef] bg-white/96 text-[#10243a] shadow-[0_12px_24px_rgba(15,23,42,0.12)] backdrop-blur md:inline-flex"
              >
                <ChevronLeft size={20} />
              </button>
            ) : null}
            {safeRecords.length > 1 && scrollState.canScrollRight ? (
              <button
                type="button"
                aria-label={`Scroll ${title} right`}
                onClick={() => scrollRef.current?.scrollBy({ left: scrollRef.current.clientWidth * 0.82, behavior: 'smooth' })}
                className="absolute right-2 top-[calc(50%-28px)] z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[#dde5ef] bg-white/96 text-[#10243a] shadow-[0_12px_24px_rgba(15,23,42,0.12)] backdrop-blur md:inline-flex"
              >
                <ChevronRight size={20} />
              </button>
            ) : null}
          </div>

          {summary ? (
            <div className="flex flex-col gap-3 rounded-[22px] border border-[#e3ebf4] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] ${config.summaryIconClass}`}>
                  <CalendarDays size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[#10243a]">{summary.primary}</p>
                  {summary.secondary ? <p className="mt-0.5 truncate text-[13px] text-[#66768a]">{summary.secondary}</p> : null}
                </div>
              </div>
              {summary.actionLabel && summary.onAction ? (
                <button
                  type="button"
                  onClick={summary.onAction}
                  className="inline-flex items-center gap-1 self-start text-sm font-semibold text-[#1f6dd5] sm:self-center"
                >
                  {summary.actionLabel}
                  <ChevronRight size={16} />
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        emptyState || <DefaultEmptyState onViewAll={onViewAll} />
      )}
    </section>
  )
}
