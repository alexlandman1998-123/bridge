import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bell, RefreshCcw, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import {
  ActivityFeedContainer,
  AlertContainer,
  ExecutiveCard,
  FocusAreasContainer,
  HQSkeletonCard,
  MiniMetricCard,
  MissionControlCarousel,
} from '../components/mission-control/MissionControlUi'
import {
  MissionControlActivityFeed,
  MissionControlBottomNav,
  MissionControlCompactBanner,
  MissionControlHeroCarousel,
  MissionControlMetricTile,
  MissionControlMobileHeader,
  MissionControlSectionHeading,
} from '../components/mission-control/MissionControlMobileUi'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchMissionControlSnapshot } from '../services/hqMissionControlApi'
import {
  getMissionControlMockSnapshot,
  normalizeMissionControlSnapshot,
  shouldUseMissionControlMockSnapshot,
} from '../services/missionControlSnapshotModel'
import { cn } from '../lib/utils'

const COUNT_FORMATTER = new Intl.NumberFormat('en-ZA')
const CURRENCY_FORMATTER = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})
const PERCENT_FORMATTER = new Intl.NumberFormat('en-ZA', {
  style: 'percent',
  maximumFractionDigits: 0,
})
const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('en-ZA', {
  numeric: 'auto',
})
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function getProfileDisplayName(profile = null) {
  const firstName = String(profile?.firstName || profile?.first_name || '').trim()
  const lastName = String(profile?.lastName || profile?.last_name || '').trim()
  const fullName = String(profile?.fullName || profile?.full_name || [firstName, lastName].filter(Boolean).join(' ') || profile?.name || '').trim()
  return fullName || String(profile?.email || '').trim() || 'Founder'
}

function getProfileInitials(profile = null) {
  const fullName = getProfileDisplayName(profile)
  const parts = fullName.split(/\s+/).filter(Boolean)
  if (!parts.length) return 'HQ'
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('')
}

function getProfileAvatarUrl(profile = null) {
  return String(
    profile?.avatarUrl ||
      profile?.avatar_url ||
      profile?.profilePhotoUrl ||
      profile?.profile_photo_url ||
      profile?.photoUrl ||
      profile?.photo_url ||
      '',
  ).trim()
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function humanizeToken(value = '') {
  return normalizeText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatCount(value) {
  return COUNT_FORMATTER.format(Number(value || 0))
}

function formatCurrency(value) {
  return CURRENCY_FORMATTER.format(Number(value || 0))
}

function formatPercent(value) {
  return PERCENT_FORMATTER.format(Number(value || 0))
}

function formatDateTime(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return DATE_TIME_FORMATTER.format(parsed)
}

function formatRelativeActivityTime(value, now = new Date()) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const diffMs = parsed.getTime() - now.getTime()
  const diffMinutes = Math.round(diffMs / (60 * 1000))
  const absMinutes = Math.abs(diffMinutes)
  if (absMinutes < 1) return 'Just now'
  if (absMinutes < 60) return RELATIVE_TIME_FORMATTER.format(diffMinutes, 'minute')
  const diffHours = Math.round(diffMs / (60 * 60 * 1000))
  const absHours = Math.abs(diffHours)
  if (absHours < 24) return RELATIVE_TIME_FORMATTER.format(diffHours, 'hour')
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000))
  const absDays = Math.abs(diffDays)
  if (absDays < 7) return RELATIVE_TIME_FORMATTER.format(diffDays, 'day')
  return formatDateTime(value)
}

function formatMetricValue(value, formatter = formatCount) {
  if (value === null || value === undefined) return 'Not available yet'
  return formatter(value)
}

function formatSignedPercentChange(value) {
  if (value === null || value === undefined) return 'Not available yet'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 'Not available yet'
  const absoluteLabel = PERCENT_FORMATTER.format(Math.abs(numeric))
  if (numeric === 0) return absoluteLabel
  return `${numeric > 0 ? '+' : '-'}${absoluteLabel}`
}

function formatHealthStatus(value) {
  return value ? humanizeToken(value) : 'Not available yet'
}

function SectionHeading({ eyebrow, title, description, className = '' }) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`.trim()}>
      <div>
        {eyebrow ? <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#7b899a]">{eyebrow}</p> : null}
        <h2 className="mt-2 text-[1.05rem] font-semibold tracking-[-0.03em] text-[#102033] sm:text-[1.12rem]">{title}</h2>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">{description}</p> : null}
      </div>
    </div>
  )
}

function MetricSurface({
  label,
  value,
  helper = '',
  hero = false,
  warning = false,
  className = '',
}) {
  return (
    <div
      className={cn(
        'rounded-[22px] border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.03)]',
        warning
          ? 'border-[#f0d2b7] bg-[linear-gradient(180deg,#fffdf8_0%,#fff6ec_100%)]'
          : 'border-[#e4ebf3] bg-white',
        className,
      )}
    >
      <p className={cn('text-[0.7rem] font-semibold uppercase tracking-[0.18em]', warning ? 'text-[#9a5b13]' : 'text-[#7b899a]')}>{label}</p>
      <p
        className={cn(
          'mt-3 font-semibold tracking-[-0.04em] text-[#102033]',
          hero ? 'text-[2rem] leading-none sm:text-[2.4rem]' : 'text-[1.45rem]',
        )}
      >
        {value || '—'}
      </p>
      {helper ? <p className="mt-2 text-xs leading-5 text-[#60758d]">{helper}</p> : null}
    </div>
  )
}

function buildActivityItems(snapshot = null) {
  return (snapshot?.recentActivity || []).map((item) => ({
    id: item.id,
    type: item.type,
    severity: item.severity || 'info',
    title: item.label || humanizeToken(item.type || 'Activity'),
    context: [item.organisationName, item.actorName].filter(Boolean).join(' · '),
    description:
      item.description ||
      [item.entityType ? humanizeToken(item.entityType) : '', item.entityId ? `Reference ${item.entityId}` : ''].filter(Boolean).join(' · '),
    timestamp: formatRelativeActivityTime(item.time),
    absoluteTimestamp: formatDateTime(item.time),
  }))
}

function buildAlertItems(snapshot = null) {
  return (snapshot?.attention?.items || []).map((item) => {
    const ageSource = item.lastActivityAt || item.createdAt
    const ageLabel = item.lastActivityAt
      ? `Last activity ${formatRelativeActivityTime(item.lastActivityAt)}`
      : item.createdAt
        ? `Created ${formatRelativeActivityTime(item.createdAt)}`
        : ''

    return {
      id: item.id,
      severity: item.severity || 'warning',
      title: item.title || humanizeToken(item.type || 'Attention item'),
      meta: [item.organisationName, item.entityType ? humanizeToken(item.entityType) : '', ageLabel].filter(Boolean).join(' · '),
      badge: item.severity ? humanizeToken(item.severity) : '',
      body: item.description || '',
      actionLabel: item.route ? item.actionLabel || 'Open' : '',
      route: item.route || null,
      timestamp: ageSource ? formatRelativeActivityTime(ageSource) : '',
      absoluteTimestamp: ageSource ? formatDateTime(ageSource) : '',
    }
  })
}

function getSnapshotStatusLabel({ showSkeleton, refreshing, error }) {
  if (showSkeleton) return 'Loading'
  if (refreshing) return 'Refreshing'
  if (error) return 'Feed issue'
  return 'Live data'
}

function useIsMobileViewport(breakpoint = 768) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)

    const handleChange = (event) => {
      setMatches(event.matches)
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [breakpoint])

  return matches
}

export default function CommandCenterPage() {
  const { profile } = useWorkspace()
  const [snapshot, setSnapshot] = useState(null)
  const [mobileSnapshot, setMobileSnapshot] = useState(null)
  const [mobileSnapshotSource, setMobileSnapshotSource] = useState('loading')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const isMobileViewport = useIsMobileViewport()

  const displayName = getProfileDisplayName(profile)
  const initials = getProfileInitials(profile)
  const avatarUrl = getProfileAvatarUrl(profile)
  const showSkeleton = loading && !snapshot
  const refreshing = loading && Boolean(snapshot)

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function loadSnapshot() {
      setLoading(true)
      setError(null)
      try {
        const nextSnapshot = await fetchMissionControlSnapshot({ signal: controller.signal })
        if (!active) return
        setSnapshot(nextSnapshot)
        if (shouldUseMissionControlMockSnapshot({ liveSnapshot: nextSnapshot })) {
          setMobileSnapshot(getMissionControlMockSnapshot())
          setMobileSnapshotSource('mock')
        } else {
          setMobileSnapshot(normalizeMissionControlSnapshot(nextSnapshot))
          setMobileSnapshotSource('live')
        }
      } catch (nextError) {
        if (!active || nextError?.name === 'AbortError') return
        setSnapshot(null)
        if (shouldUseMissionControlMockSnapshot({ error: nextError })) {
          setMobileSnapshot(getMissionControlMockSnapshot())
          setMobileSnapshotSource('mock')
          setError(nextError)
        } else {
          setMobileSnapshot(null)
          setMobileSnapshotSource('error')
          setError(nextError)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    loadSnapshot()

    return () => {
      active = false
      controller.abort()
    }
  }, [reloadKey])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setReloadKey((current) => current + 1)
    }, 90000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  const activityItems = useMemo(() => buildActivityItems(snapshot), [snapshot])
  const alertItems = useMemo(() => buildAlertItems(snapshot), [snapshot])
  const focusAreaItems = snapshot?.executive?.focusAreas || []

  const activeTransactionsValue = formatMetricValue(snapshot?.summary?.activeTransactions)
  const scheduledRegistrationsValue = formatMetricValue(snapshot?.summary?.scheduledRegistrationsSoon)
  const registeredTodayValue = formatMetricValue(snapshot?.summary?.registeredToday)
  const healthScoreValue = formatMetricValue(snapshot?.executive?.platformHealthScore)
  const healthStatusValue = formatHealthStatus(snapshot?.executive?.healthStatus)
  const topFocusAreaTitle = snapshot?.executive?.focusAreas?.[0]?.title || ''
  const revenueThisMonthValue = formatMetricValue(snapshot?.executive?.revenue?.actualThisMonth, formatCurrency)
  const revenueForecastValue = formatMetricValue(snapshot?.executive?.revenue?.forecastThisMonth, formatCurrency)
  const subscriptionRevenueValue = formatMetricValue(snapshot?.executive?.revenue?.subscriptionRevenue, formatCurrency)
  const transactionRevenueValue = formatMetricValue(snapshot?.executive?.revenue?.transactionRevenue, formatCurrency)
  const growthCurrentMonthValue = formatMetricValue(snapshot?.executive?.growthTrend?.currentMonth)
  const growthPreviousMonthValue = formatMetricValue(snapshot?.executive?.growthTrend?.previousMonth)
  const growthChangeValue = formatSignedPercentChange(snapshot?.executive?.growthTrend?.percentageChange)
  const registrationCurrentMonthValue = formatMetricValue(snapshot?.executive?.registrationTrend?.registeredThisMonth)
  const registrationLastMonthValue = formatMetricValue(snapshot?.executive?.registrationTrend?.registeredLastMonth)
  const registrationChangeValue = formatSignedPercentChange(snapshot?.executive?.registrationTrend?.percentageChange)
  const forecastNext7Value = formatMetricValue(snapshot?.executive?.registrationForecast?.next7Days)
  const forecastNext14Value = formatMetricValue(snapshot?.executive?.registrationForecast?.next14Days)
  const forecastNext30Value = formatMetricValue(snapshot?.executive?.registrationForecast?.next30Days)
  const acceptanceRateValue = formatMetricValue(snapshot?.invites?.inviteAcceptanceRate, formatPercent)
  const attentionTotalValue = formatMetricValue(snapshot?.attention?.total)
  const attentionCriticalValue = formatMetricValue(snapshot?.attention?.critical)
  const attentionWarningValue = formatMetricValue(snapshot?.attention?.warning)
  const delayedRegistrationsValue = formatMetricValue(snapshot?.transactionHealth?.delayedRegistrations)
  const generatedAtLabel = snapshot?.generatedAt ? formatDateTime(snapshot.generatedAt) : ''
  const snapshotStatus = getSnapshotStatusLabel({ showSkeleton, refreshing, error })
  const shouldRenderMobileBanner = Boolean(isMobileViewport && error && mobileSnapshotSource !== 'mock' && !showSkeleton)

  if (isMobileViewport) {
    return (
      <section className="-mx-4 min-h-screen bg-[linear-gradient(180deg,#fbfcff_0%,#f4f7fb_100%)] px-4 pb-[108px] pt-4 md:hidden">
        <div className="mx-auto w-full max-w-[480px] space-y-7">
          <MissionControlMobileHeader
            displayName={displayName}
            initials={initials}
            avatarUrl={avatarUrl}
            alertsCount={mobileSnapshot?.alertsCount || 0}
          />

          <div className="space-y-2">
            <h1 className="text-[2rem] font-semibold tracking-[-0.07em] text-[#0f172a]">Mission Control</h1>
            <p className="max-w-[320px] text-[0.98rem] leading-6 text-[#667085]">Real-time overview of Arch9 platform performance</p>
          </div>

          {shouldRenderMobileBanner ? (
            <MissionControlCompactBanner message={error?.message || 'The live HQ snapshot is unavailable in this environment.'} />
          ) : null}

          {showSkeleton ? (
            <div className="space-y-6">
              <div className="animate-pulse rounded-[24px] border border-[#e7edf5] bg-white p-5 shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
                <div className="h-4 w-28 rounded-full bg-[#edf2f7]" />
                <div className="mt-4 h-12 w-32 rounded-[16px] bg-[#edf2f7]" />
                <div className="mt-4 h-[88px] rounded-[18px] bg-[#f5f7fb]" />
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="h-16 rounded-[18px] bg-[#f5f7fb]" />
                  <div className="h-16 rounded-[18px] bg-[#f5f7fb]" />
                  <div className="h-16 rounded-[18px] bg-[#f5f7fb]" />
                </div>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="h-[156px] min-w-[144px] animate-pulse rounded-[22px] border border-[#e7edf5] bg-white shadow-[0_14px_32px_rgba(15,23,42,0.05)]" />
                ))}
              </div>
              <div className="animate-pulse rounded-[22px] border border-[#e7edf5] bg-white p-4 shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className={cn('h-16 rounded-[18px] bg-[#f5f7fb]', item === 1 ? '' : 'mt-3')} />
                ))}
              </div>
            </div>
          ) : null}

          {!showSkeleton && mobileSnapshot ? (
            <>
              <MissionControlHeroCarousel snapshot={mobileSnapshot} />

              <section className="space-y-4">
                <MissionControlSectionHeading title="At a Glance" actionLabel="View all" actionTo="/reports" />
                <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {mobileSnapshot.atAGlance.map((item) => (
                    <MissionControlMetricTile key={item.key} item={item} />
                  ))}
                </div>
              </section>

              <section id="live-activity" className="space-y-4">
                <MissionControlSectionHeading title="Live Activity" actionLabel="View all" actionTo="/transactions" />
                <MissionControlActivityFeed items={mobileSnapshot.liveActivity} />
              </section>
            </>
          ) : null}
        </div>

        <MissionControlBottomNav alertsCount={mobileSnapshot?.alertsCount || 0} />
      </section>
    )
  }

  return (
    <section className="space-y-8 pb-8">
      <header className="sticky top-4 z-20 rounded-[28px] border border-white/70 bg-white/90 px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-[#7b899a]">ARCH9 HQ</p>
            <h1 className="mt-2 text-[1.6rem] font-semibold tracking-[-0.04em] text-[#102033] sm:text-[1.95rem]">Mission Control</h1>
            <p className="mt-2 text-sm leading-6 text-[#60758d]">Founder-only command centre</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#dce5ee] bg-white text-[#60758d] shadow-[0_10px_22px_rgba(15,23,42,0.04)]"
              aria-hidden="true"
            >
              <Bell className="h-4 w-4" />
            </span>

            <Link
              to="/settings/account"
              className="inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[#dce5ee] bg-[#f7f9fc] text-sm font-semibold text-[#102033] shadow-[0_10px_22px_rgba(15,23,42,0.04)]"
              aria-label={`Open account settings for ${displayName}`}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden="true">{initials}</span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {error ? (
        <section className="rounded-[28px] border border-[#f0d2b7] bg-[linear-gradient(180deg,#fffdfa_0%,#fff7ed_100%)] px-5 py-4 shadow-[0_14px_34px_rgba(180,114,31,0.08)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#f0d2b7] bg-white text-[#9a5b13]">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#9a5b13]">Snapshot issue</p>
                <h2 className="mt-1 text-[1.02rem] font-semibold text-[#102033]">Mission Control could not refresh right now</h2>
                <p className="mt-2 text-sm leading-6 text-[#6d583f]">{error.message || 'The live HQ snapshot is temporarily unavailable.'}</p>
              </div>
            </div>

            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#f0d2b7] bg-white px-4 py-2 text-sm font-semibold text-[#8a5415] shadow-[0_10px_22px_rgba(180,114,31,0.07)] transition hover:bg-[#fff7ed] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c78642]/40"
              onClick={() => setReloadKey((current) => current + 1)}
            >
              <RefreshCcw className="h-4 w-4" />
              Retry snapshot
            </button>
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <SectionHeading
          eyebrow="Executive overview"
          title="Platform health at a glance"
          description="Swipe through the founder cockpit. Live data flows into the cards when the platform has it, and the UI stays explicit when a metric is not available yet."
        />

        {showSkeleton ? (
          <MissionControlCarousel ariaLabel="Mission Control executive overview cards">
            <HQSkeletonCard />
            <HQSkeletonCard />
            <HQSkeletonCard />
            <HQSkeletonCard />
            <HQSkeletonCard />
          </MissionControlCarousel>
        ) : (
          <MissionControlCarousel ariaLabel="Mission Control executive overview cards">
            <ExecutiveCard
              eyebrow="Platform health"
              title="Platform Health"
              status={snapshot?.executive?.healthStatus ? humanizeToken(snapshot.executive.healthStatus) : snapshotStatus}
              description="Mission Control now turns live operational data into an explainable founder signal, while staying explicit when the platform lacks a trustworthy source."
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <div className="rounded-[26px] border border-[#e5ebf2] bg-[linear-gradient(180deg,#fbfcfe_0%,#f6f9fc_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetricSurface
                      label="Health Score"
                      value={healthScoreValue}
                      helper={topFocusAreaTitle || 'Health score not available yet'}
                      hero
                    />
                    <MetricSurface
                      label="Status"
                      value={healthStatusValue}
                      helper={snapshot?.executive?.healthStatus ? 'Derived from attention, registrations, growth, and invite acceptance.' : 'Not available until all required live inputs exist.'}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <MetricSurface label="Active Transactions" value={activeTransactionsValue} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetricSurface label="Scheduled Registrations" value={scheduledRegistrationsValue} helper="Next 7 days" />
                    <MetricSurface label="Registered Today" value={registeredTodayValue} />
                  </div>
                </div>
              </div>
            </ExecutiveCard>

            <ExecutiveCard
              eyebrow="Finance"
              title="Revenue"
              status={snapshotStatus}
              description="Only real billing sources appear here. Mission Control does not estimate collected or forecast revenue when the platform cannot prove it."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricSurface
                  label="This Month"
                  value={revenueThisMonthValue}
                  hero
                  helper={
                    snapshot?.executive?.revenue?.actualThisMonth === null
                      ? 'Revenue data not connected yet.'
                      : 'Collected platform revenue recorded this month.'
                  }
                />
                <MetricSurface label="Forecast" value={revenueForecastValue} helper="No forecast is shown until the production revenue model is trustworthy." />
                <MetricSurface
                  label="Subscription Revenue"
                  value={subscriptionRevenueValue}
                  helper={
                    snapshot?.executive?.revenue?.subscriptionRevenue === null
                      ? 'Subscription revenue is not connected yet.'
                      : 'Live subscription revenue from workspace subscriptions.'
                  }
                />
                <MetricSurface
                  label="Transaction Revenue"
                  value={transactionRevenueValue}
                  helper={
                    snapshot?.executive?.revenue?.transactionRevenue === null
                      ? 'Transaction-linked revenue remains unavailable until attribution is finalised.'
                      : 'Real transaction revenue from a connected production source.'
                  }
                />
              </div>
            </ExecutiveCard>

            <ExecutiveCard
              eyebrow="Growth"
              title="Growth"
              status={snapshotStatus}
              description="Founder growth momentum compares this month’s real organisation signups with the previous month."
              footer={
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricSurface label="Active Agencies" value={formatMetricValue(snapshot?.growth?.activeAgencies)} />
                  <MetricSurface label="Active Users" value={formatMetricValue(snapshot?.growth?.activeAgents)} />
                </div>
              }
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricSurface label="Current Month" value={growthCurrentMonthValue} hero />
                <MetricSurface label="Previous Month" value={growthPreviousMonthValue} />
                <MetricSurface label="Change" value={growthChangeValue} helper="Month-on-month organisation growth." />
              </div>
            </ExecutiveCard>

            <ExecutiveCard
              eyebrow="Network"
              title="Network"
              status={snapshotStatus}
              description="Invitation volume and acceptance are pulled from the real invite flow. No network momentum is mocked."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricSurface label="Agent Invites" value={formatMetricValue(snapshot?.invites?.agentInvitesSent)} />
                <MetricSurface label="Attorney Invites" value={formatMetricValue(snapshot?.invites?.attorneyInvitesSent)} />
                <MetricSurface label="Originator Invites" value={formatMetricValue(snapshot?.invites?.bondOriginatorInvitesSent)} />
                <MetricSurface label="Acceptance Rate" value={acceptanceRateValue} helper="Accepted invites divided by invites sent this month." />
              </div>
            </ExecutiveCard>

            <ExecutiveCard
              eyebrow="Attention"
              title="Attention Required"
              status={snapshot?.attention?.critical ? `${snapshot.attention.critical} critical` : snapshotStatus}
              warning
              description="Real operational alerts are ranked for founder intervention, with critical issues surfaced first."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricSurface label="Items Need Attention" value={attentionTotalValue} warning hero />
                <MetricSurface label="Critical" value={attentionCriticalValue} warning />
                <MetricSurface label="Warnings" value={attentionWarningValue} warning />
                <MetricSurface label="Delayed Registrations" value={delayedRegistrationsValue} warning />
              </div>
            </ExecutiveCard>
          </MissionControlCarousel>
        )}
      </section>

      <section className="space-y-4">
        <SectionHeading
          eyebrow="At a glance"
          title="Quick signals"
          description="The compact strip stays honest: live values when they exist, and no fabricated numbers when they do not."
        />

        <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <MiniMetricCard
            label="Agencies"
            value={formatMetricValue(snapshot?.growth?.activeAgencies)}
            loading={showSkeleton}
            className="w-[42vw] min-w-[168px] max-w-[220px]"
          />
          <MiniMetricCard
            label="Users"
            value={formatMetricValue(snapshot?.growth?.activeAgents)}
            loading={showSkeleton}
            className="w-[42vw] min-w-[168px] max-w-[220px]"
          />
          <MiniMetricCard
            label="New Organisations"
            value={formatMetricValue(snapshot?.growth?.newAgencySignups)}
            loading={showSkeleton}
            className="w-[42vw] min-w-[168px] max-w-[220px]"
          />
          <MiniMetricCard
            label="Website Leads"
            value={formatMetricValue(snapshot?.growth?.websiteEnquiries)}
            loading={showSkeleton}
            className="w-[42vw] min-w-[168px] max-w-[220px]"
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <FocusAreasContainer
          loading={showSkeleton}
          items={focusAreaItems}
          emptyTitle={error ? 'Snapshot unavailable' : 'No focus areas yet'}
          emptyDescription={
            error
              ? error.message || 'Executive focus areas could not be loaded.'
              : 'Mission Control will surface deterministic founder priorities here once enough live data is available.'
          }
        />

        {showSkeleton ? (
          <HQSkeletonCard compact />
        ) : (
          <ExecutiveCard
            eyebrow="Executive"
            title="Registration Outlook"
            description="Real registration movement and expected registration dates, kept honest when a production source is not yet connected."
          >
            <div className="space-y-4">
              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[#7b899a]">Registration Trend</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <MetricSurface label="This Month" value={registrationCurrentMonthValue} hero />
                  <MetricSurface label="Last Month" value={registrationLastMonthValue} />
                  <MetricSurface label="Change" value={registrationChangeValue} helper="Month-on-month registration movement." />
                </div>
              </div>

              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[#7b899a]">Registration Forecast</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <MetricSurface label="Next 7 Days" value={forecastNext7Value} />
                  <MetricSurface label="Next 14 Days" value={forecastNext14Value} />
                  <MetricSurface label="Next 30 Days" value={forecastNext30Value} />
                </div>
              </div>
            </div>
          </ExecutiveCard>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <ActivityFeedContainer
          loading={showSkeleton}
          items={activityItems}
          refreshing={refreshing}
          onRefresh={() => setReloadKey((current) => current + 1)}
          emptyTitle={error ? 'Snapshot unavailable' : 'No activity yet'}
          emptyDescription={
            error
              ? error.message || 'The activity feed could not be loaded.'
              : 'No platform activity yet. Real events will appear here as transactions, users and organisations move through Arch9.'
          }
        />
        <AlertContainer
          loading={showSkeleton}
          items={alertItems}
          summary={snapshot?.attention || null}
          emptyTitle={error ? 'Snapshot unavailable' : 'No alerts yet'}
          emptyDescription={
            error
              ? error.message || 'The alert feed could not be loaded.'
              : 'No attention items yet. Real operational blockers will appear here when transactions, organisations, invites, or delivery failures need intervention.'
          }
        />
      </section>

      <section className="rounded-[28px] border border-[#dbe5ef] bg-white px-5 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#e1e8f1] bg-[#f7f9fc] text-[#60758d]">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[#7b899a]">Phase 6 live</p>
            <p className="mt-1 text-[1.02rem] font-semibold text-[#102033]">Mission Control now turns live platform signals into founder-level executive intelligence.</p>
            <p className="mt-2 text-sm leading-6 text-[#60758d]">
              {generatedAtLabel
                ? `Snapshot generated ${generatedAtLabel}. Health, growth, and registration intelligence are derived from real platform data, while revenue and any unsupported metric remain explicitly unavailable until a trustworthy production source exists.`
                : 'Health, growth, and registration intelligence are derived from real platform data, while revenue and any unsupported metric remain explicitly unavailable until a trustworthy production source exists.'}
            </p>
          </div>
        </div>
      </section>
    </section>
  )
}
