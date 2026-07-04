import {
  Bell,
  Check,
  Circle,
  Clock3,
  FileText,
  FolderOpen,
  HelpCircle,
  Home,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  Zap,
} from 'lucide-react'
import { createElement, useEffect, useState } from 'react'

const THEMES = {
  buyer: {
    primary: '#0f5f58',
    primaryDark: '#083c38',
    primarySoft: '#e6f3ef',
    page: '#eef2f0',
    ringTrack: '#dce8e3',
    shadow: '0 20px 48px rgba(15, 95, 88, 0.20)',
  },
  seller: {
    primary: '#145ea8',
    primaryDark: '#0d3f72',
    primarySoft: '#e8f1fb',
    page: '#eef2f6',
    ringTrack: '#dce7f4',
    shadow: '0 20px 48px rgba(20, 94, 168, 0.20)',
  },
}

const STATUS_STYLES = {
  completed: 'border-[#b7dfd3] bg-[#e8f6ef] text-[#0f6a51]',
  active: 'border-[#bfd6ef] bg-[#e8f1fb] text-[#145ea8]',
  waiting: 'border-[#e8ddbb] bg-[#f8f2df] text-[#8a6818]',
  blocked: 'border-[#f2c4c4] bg-[#fff0f0] text-[#a73434]',
  upcoming: 'border-[#dce2e7] bg-[#f3f5f6] text-[#6f7b86]',
}

const SURFACE = 'border border-white/85 bg-white shadow-[0_16px_38px_rgba(15,23,42,0.075)]'
const QUIET_SURFACE = 'border border-[#edf1f3] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]'

function MobileMotionStyles() {
  return (
    <style>
      {`
        @property --ring-progress {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }

        @keyframes mobile-section-enter {
          from { opacity: 0; transform: translate3d(0, 14px, 0) scale(0.985); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }

        @keyframes mobile-progress-ring {
          from { --ring-progress: 0deg; }
          to { --ring-progress: var(--ring-target); }
        }

        @keyframes mobile-ring-pop {
          0% { transform: scale(0.94); filter: saturate(0.92); }
          100% { transform: scale(1); filter: saturate(1); }
        }

        @keyframes mobile-segment-fill {
          from { transform: scaleX(0); opacity: 0.45; }
          to { transform: scaleX(1); opacity: 1; }
        }

        @keyframes mobile-hero-sheen {
          0%, 100% { transform: translate3d(-12%, -8%, 0) rotate(8deg); opacity: 0.38; }
          50% { transform: translate3d(8%, 5%, 0) rotate(8deg); opacity: 0.56; }
        }

        @keyframes mobile-live-pulse {
          0%, 100% { opacity: 0.45; transform: scale(0.88); }
          50% { opacity: 1; transform: scale(1); }
        }

        @keyframes mobile-sheet-enter {
          from { opacity: 0; transform: translate3d(0, 22px, 0) scale(0.98); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }

        @keyframes mobile-action-complete {
          0% { transform: scale(0.96); box-shadow: 0 16px 38px rgba(15,23,42,0.075); }
          55% { transform: scale(1.015); box-shadow: 0 24px 54px rgba(15,95,88,0.16); }
          100% { transform: scale(1); box-shadow: 0 16px 38px rgba(15,23,42,0.075); }
        }

        @keyframes mobile-chip-enter {
          from { opacity: 0; transform: translate3d(0, 8px, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }

        @media (prefers-reduced-motion: no-preference) {
          .mobile-transaction-stack > * {
            animation: mobile-section-enter 520ms cubic-bezier(0.22, 0.72, 0.22, 1) both;
          }

          .mobile-transaction-stack > *:nth-child(1) { animation-delay: 0ms; }
          .mobile-transaction-stack > *:nth-child(2) { animation-delay: 70ms; }
          .mobile-transaction-stack > *:nth-child(3) { animation-delay: 130ms; }
          .mobile-transaction-stack > *:nth-child(4) { animation-delay: 190ms; }
          .mobile-transaction-stack > *:nth-child(5) { animation-delay: 250ms; }
          .mobile-transaction-stack > *:nth-child(6) { animation-delay: 310ms; }
          .mobile-transaction-stack > *:nth-child(7) { animation-delay: 370ms; }

          .mobile-pressable {
            transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease, border-color 160ms ease;
          }

          .mobile-pressable:active {
            transform: translateY(1px) scale(0.985);
          }

          .mobile-ring {
            animation: mobile-ring-pop 640ms cubic-bezier(0.22, 0.72, 0.22, 1) both;
          }

          .mobile-ring-arc {
            animation: mobile-progress-ring 950ms cubic-bezier(0.2, 0.74, 0.18, 1) 180ms both;
          }

          .mobile-stage-segment-filled {
            animation-name: mobile-segment-fill;
            animation-duration: 520ms;
            animation-timing-function: cubic-bezier(0.22, 0.72, 0.22, 1);
            animation-fill-mode: both;
            transform-origin: left center;
          }

          .mobile-hero-sheen {
            animation: mobile-hero-sheen 7s ease-in-out infinite;
          }

          .mobile-live-dot {
            animation: mobile-live-pulse 1.7s ease-in-out infinite;
          }

          .mobile-sheet-panel {
            animation: mobile-sheet-enter 280ms cubic-bezier(0.22, 0.72, 0.22, 1) both;
          }

          .mobile-action-complete {
            animation: mobile-action-complete 620ms cubic-bezier(0.22, 0.72, 0.22, 1) both;
          }

          .mobile-action-chip {
            animation: mobile-chip-enter 360ms cubic-bezier(0.22, 0.72, 0.22, 1) both;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .mobile-ring-arc {
            --ring-progress: var(--ring-target);
          }
        }
      `}
    </style>
  )
}

function getTheme(portalType) {
  return THEMES[portalType] || THEMES.buyer
}

function statusLabel(status = '') {
  return String(status || 'upcoming')
    .replace(/_/g, ' ')
    .replace(/^\w/, (char) => char.toUpperCase())
}

function renderStageIcon(status, className = 'h-5 w-5') {
  if (status === 'completed') return <Check className={className} />
  if (status === 'active') return <Zap className={className} />
  if (status === 'waiting') return <Clock3 className={className} />
  if (status === 'blocked') return <X className={className} />
  return <Circle className={className} />
}

function getStageInsight(item = {}) {
  if (item.insight) return item.insight
  if (item.status === 'completed') return `${item.title} is complete and logged on the transaction timeline.`
  if (item.status === 'active') return `${item.owner || 'The team'} is working this stage now.`
  if (item.status === 'waiting') return `${item.title} is waiting for the previous dependency to clear.`
  if (item.status === 'blocked') return item.blocker || `${item.title} needs attention before the transaction can continue.`
  return `${item.title} is queued for a later step in the transaction.`
}

function getStageNextStep(item = {}) {
  if (item.next_step) return item.next_step
  if (item.status === 'completed') return 'No action needed. This stage is complete.'
  if (item.status === 'active') return 'Complete the highlighted action so the next stage can begin.'
  if (item.status === 'waiting') return 'Your team will notify you when this stage becomes active.'
  if (item.status === 'blocked') return 'Resolve the blocker or ask the owner for help.'
  return 'This stage will unlock when earlier stages are complete.'
}

function getStageActionLabel(item = {}) {
  if (item.cta_text) return item.cta_text
  if (item.status === 'completed') return 'View activity'
  if (item.status === 'active') return `Review ${item.title}`
  if (item.status === 'waiting') return 'Ask for update'
  if (item.status === 'blocked') return 'Resolve blocker'
  return 'Got it'
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
  ))

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    function handleChange(event) {
      setPrefersReducedMotion(event.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return prefersReducedMotion
}

function useAnimatedNumber(value, duration = 950) {
  const target = Math.max(0, Math.min(100, Number(value) || 0))
  const prefersReducedMotion = usePrefersReducedMotion()
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    if (prefersReducedMotion) {
      return undefined
    }

    let frameId
    const start = performance.now()

    function tick(now) {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - progress) ** 3
      setDisplayValue(Math.round(target * eased))

      if (progress < 1) {
        frameId = requestAnimationFrame(tick)
      }
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [duration, prefersReducedMotion, target])

  return prefersReducedMotion ? target : displayValue
}

export function MobileTransactionScreen({ portalType = 'buyer', children, bottomNav = null, support = null }) {
  const theme = getTheme(portalType)
  return (
    <div className="-mx-4 -my-4 min-h-[100dvh] px-4 pb-[calc(6.3rem+env(safe-area-inset-bottom))] pt-6 text-[#101820]" style={{ background: theme.page }}>
      <MobileMotionStyles />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-44 bg-gradient-to-b from-white/80 to-transparent" />
      <div className="mobile-transaction-stack relative mx-auto w-full max-w-[520px] space-y-6">
        {children}
      </div>
      {support}
      {bottomNav}
    </div>
  )
}

export function TransactionHeader({ portalType = 'buyer', eyebrow, address, stage }) {
  const theme = getTheme(portalType)
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[14px] font-bold leading-5" style={{ color: theme.primary }}>{eyebrow}</p>
        <h1 className="mt-2 text-[36px] font-bold leading-[1.02] text-[#101820]">{address}</h1>
        <p className="mt-3 text-[17px] font-semibold leading-6 text-[#758391]">{stage}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {[
          { label: 'Notifications', Icon: Bell },
          { label: 'Messages', Icon: MessageCircle },
          { label: 'Help', Icon: HelpCircle },
        ].map(({ label, Icon }) => (
          <button key={label} type="button" className="mobile-pressable flex h-11 w-11 items-center justify-center rounded-full border border-[#e8edf1] bg-white text-[#101820] shadow-[0_10px_22px_rgba(15,23,42,0.06)]" aria-label={label}>
            {createElement(Icon, { className: 'h-5 w-5' })}
          </button>
        ))}
      </div>
    </header>
  )
}

export function ProgressRing({ portalType = 'buyer', value = 0, Icon = Home }) {
  const theme = getTheme(portalType)
  const percent = Math.max(0, Math.min(100, Number(value) || 0))
  const displayPercent = useAnimatedNumber(percent)
  const ringTarget = `${percent * 3.6}deg`
  return (
    <div
      className="mobile-ring mobile-ring-arc flex h-[132px] w-[132px] shrink-0 items-center justify-center rounded-full p-2"
      style={{
        '--ring-target': ringTarget,
        '--ring-progress': ringTarget,
        background: `conic-gradient(${theme.primary} var(--ring-progress), ${theme.ringTrack} 0deg)`,
      }}
      aria-label={`${percent}% complete`}
    >
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white shadow-inner">
        {createElement(Icon, { className: 'h-7 w-7', style: { color: theme.primary } })}
        <span className="mt-1 text-[24px] font-bold leading-6 text-[#101820]">{displayPercent}%</span>
        <span className="text-[14px] font-semibold leading-4 text-[#7d8994]">complete</span>
      </div>
    </div>
  )
}

export function TransactionHero({ portalType = 'buyer', progress = {} }) {
  const theme = getTheme(portalType)
  const percent = Number(progress.progress_percentage) || 0
  const totalStages = Math.max(1, Number(progress.total_stages) || 1)
  const stageNumber = Math.max(1, Math.min(totalStages, Number(progress.stage_number) || 1))
  const segments = Array.from({ length: totalStages }, (_, index) => index + 1)
  return (
    <section className="relative min-h-[292px] overflow-hidden rounded-[34px] p-6 text-white" style={{ background: `linear-gradient(145deg, ${theme.primary}, ${theme.primaryDark})`, boxShadow: theme.shadow }}>
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.28),transparent_28%),radial-gradient(circle_at_88%_6%,rgba(255,255,255,0.20),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_42%,rgba(0,0,0,0.10))]" />
      <span className="mobile-hero-sheen pointer-events-none absolute -right-16 -top-20 h-56 w-36 rotate-12 rounded-full bg-white/20 blur-3xl" />
      <div className="relative flex items-center gap-5">
        <ProgressRing portalType={portalType} value={percent} Icon={progress.stage_icon || Home} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[14px] font-bold leading-5 text-[#d9e8f4]">
            <span className="mobile-live-dot h-2 w-2 rounded-full bg-white" />
            {progress.last_updated || 'Live transaction status'}
          </p>
          <h2 className="mt-2 text-[28px] font-bold leading-[1.06] text-white">{progress.current_stage}</h2>
          <p className="mt-3 text-[16px] font-semibold leading-6 text-[#d9e8f4]">Step {stageNumber} of {totalStages}</p>
          <div className="mt-5 flex gap-1.5" aria-label="Stage progress">
            {segments.map((segment) => (
              <span
                key={segment}
                className={`h-2 flex-1 rounded-full ${segment <= stageNumber ? 'mobile-stage-segment-filled' : ''}`}
                style={{
                  animationDelay: `${220 + segment * 95}ms`,
                  background: segment <= stageNumber ? '#ffffff' : 'rgba(255,255,255,0.25)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="relative mt-8 grid grid-cols-2 gap-6">
        <HeroInfo label="Estimated completion" value={progress.estimated_completion} />
        <HeroInfo label="Remaining" value={`${progress.days_remaining} Days`} />
      </div>
    </section>
  )
}

function HeroInfo({ label, value }) {
  return (
    <div>
      <p className="text-[15px] font-semibold leading-5 text-[#c7d8e8]">{label}</p>
      <p className="mt-2 text-[20px] font-bold leading-6 text-white">{value}</p>
    </div>
  )
}

export function OwnerPanel({ portalType = 'buyer', owner = {}, waitingOn = {} }) {
  const theme = getTheme(portalType)
  const initials = String(owner.name || '?')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <section className={`grid grid-cols-2 gap-4 rounded-[28px] p-5 ${SURFACE}`}>
      <div>
        <p className="text-[14px] font-bold leading-5 text-[#7d8994]">Current owner</p>
        <div className="mt-4 flex items-center gap-3">
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white" style={{ background: theme.primary }}>
            {initials}
            <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#21b36b]" />
          </span>
          <div className="min-w-0">
            <p className="text-[16px] font-bold leading-5 text-[#101820]">{owner.name}</p>
            <p className="mt-1 text-[14px] font-semibold leading-5 text-[#7d8994]">{owner.role}</p>
          </div>
        </div>
      </div>
      <div className="border-l border-[#e8edf1] pl-4">
        <p className="text-[14px] font-bold leading-5 text-[#7d8994]">Waiting on</p>
        <h3 className="mt-4 text-[17px] font-bold leading-5 text-[#101820]">{waitingOn.title}</h3>
        <p className="mt-1 text-[15px] font-semibold leading-5 text-[#7d8994]">{waitingOn.description}</p>
        <p className="mt-3 text-[15px] font-bold leading-5" style={{ color: theme.primary }}>{waitingOn.due_date}</p>
      </div>
    </section>
  )
}

export function JourneyTracker({ portalType = 'buyer', items = [], onSelect }) {
  return (
    <section className="space-y-4">
      <SectionTitle title="Journey tracker" />
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {items.map((item) => (
          <JourneyStageCard key={item.id} portalType={portalType} stage={item} onSelect={() => onSelect?.(item)} />
        ))}
      </div>
    </section>
  )
}

export function JourneyStageCard({ portalType = 'buyer', stage, onSelect }) {
  const theme = getTheme(portalType)
  const active = stage.status === 'active'
  const completed = stage.status === 'completed'
  return (
    <button
      type="button"
      className={`mobile-pressable flex min-w-[108px] shrink-0 flex-col items-start rounded-[24px] p-4 text-left ${QUIET_SURFACE}`}
      data-stage-id={stage.id}
      onClick={onSelect}
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-full border"
        style={active || completed ? { background: theme.primary, borderColor: theme.primary, color: '#fff' } : { background: '#f3f5f6', borderColor: '#dce2e7', color: '#8995a0' }}
      >
        {stage.icon ? createElement(stage.icon, { className: 'h-5 w-5' }) : renderStageIcon(stage.status)}
      </span>
      <span className="mt-4 line-clamp-2 min-h-[40px] text-[16px] font-bold leading-5 text-[#101820]">{stage.title}</span>
      <span className={`mt-3 rounded-full border px-2.5 py-1 text-[14px] font-bold leading-4 ${STATUS_STYLES[stage.status] || STATUS_STYLES.upcoming}`}>
        {statusLabel(stage.status)}
      </span>
      {stage.owner ? <span className="mt-3 truncate text-[14px] font-semibold leading-5 text-[#7d8994]">{stage.owner}</span> : null}
      <span className="mt-1 text-[14px] font-semibold leading-5 text-[#8b96a1]">{stage.expected_date || stage.completed_date}</span>
    </button>
  )
}

export function NextActionCard({ portalType = 'buyer', action = {}, onAction, onSecondary }) {
  const theme = getTheme(portalType)
  const completed = action.priority === 'completed'
  const requirements = action.requirements || []
  const secondaryLabel = action.secondary_text || (completed ? 'View journey' : 'Ask agent')
  return (
    <section
      className={`relative overflow-hidden rounded-[30px] p-6 ${SURFACE} ${completed ? 'mobile-action-complete' : ''}`}
      data-next-action-card={action.priority || 'active'}
    >
      {completed ? (
        <span className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full opacity-70 blur-2xl" style={{ background: theme.primarySoft }} />
      ) : null}
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-bold leading-5" style={{ color: theme.primary }}>{completed ? 'Action complete' : 'Next action'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[14px] font-bold ${completed ? STATUS_STYLES.completed : STATUS_STYLES.waiting}`}>
              {completed ? <Check className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
              {action.priority_label || (completed ? 'Completed' : 'Required today')}
            </span>
            {action.due_label ? (
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[#e8edf1] bg-[#f7f9fa] px-3 text-[14px] font-bold text-[#687684]">
                <Clock3 className="h-4 w-4" />
                {action.due_label}
              </span>
            ) : null}
          </div>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-[0_12px_24px_rgba(15,23,42,0.14)]" style={{ background: theme.primary }}>
          {completed ? <Check className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
        </span>
      </div>

      <h2 className="relative mt-4 text-[28px] font-bold leading-[1.05] text-[#101820]">{action.title}</h2>
      <p className="relative mt-4 text-[16px] leading-6 text-[#687684]">{action.description}</p>

      {action.completion_note ? (
        <div className="relative mt-5 rounded-[22px] border border-[#b7dfd3] bg-[#e8f6ef] p-4">
          <p className="text-[16px] font-bold leading-5 text-[#0f6a51]">{action.completion_note}</p>
        </div>
      ) : null}

      {requirements.length ? (
        <div className="relative mt-5 space-y-2">
          <p className="text-[14px] font-bold leading-5 text-[#7d8994]">Required for this step</p>
          <div className="flex flex-wrap gap-2">
            {requirements.map((requirement, index) => (
              <span
                key={requirement.label}
                className={`mobile-action-chip inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[14px] font-bold ${STATUS_STYLES[requirement.status] || STATUS_STYLES.upcoming}`}
                style={{ animationDelay: `${index * 70}ms` }}
              >
                {requirement.status === 'completed' ? <Check className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                {requirement.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="mobile-pressable mt-6 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[22px] px-5 text-[17px] font-bold text-white"
        data-next-action-primary
        style={{ background: theme.primary, boxShadow: theme.shadow }}
        onClick={onAction}
      >
        {completed ? <Check className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        {action.button_text}
      </button>
      <button
        type="button"
        className="mobile-pressable mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[20px] border border-[#e8edf1] bg-white px-5 text-[16px] font-bold text-[#101820]"
        data-next-action-secondary
        onClick={() => onSecondary?.(action)}
      >
        <MessageCircle className="h-5 w-5" style={{ color: theme.primary }} />
        {secondaryLabel}
      </button>
    </section>
  )
}

export function TeamSection({ portalType = 'buyer', people = [] }) {
  return (
    <section className="space-y-4">
      <SectionTitle title="Team" />
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {people.map((member) => <ParticipantCard key={member.id} portalType={portalType} member={member} />)}
      </div>
    </section>
  )
}

export function ParticipantCard({ portalType = 'buyer', member }) {
  const theme = getTheme(portalType)
  const initials = String(member.name || '?')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <article className={`mobile-pressable min-w-[190px] rounded-[24px] p-4 ${QUIET_SURFACE}`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full text-[15px] font-bold text-white" style={{ background: theme.primary }}>{initials}</span>
      <h3 className="mt-4 truncate text-[17px] font-bold leading-5 text-[#101820]">{member.name}</h3>
      <p className="mt-1 text-[15px] font-semibold leading-5 text-[#7d8994]">{member.role}</p>
      <p className="mt-3 truncate text-[15px] font-bold leading-5" style={{ color: theme.primary }}>{member.status}</p>
    </article>
  )
}

export function ActivityTimeline({ items = [] }) {
  return (
    <section className="space-y-4">
      <SectionTitle title="Recent activity" />
      <div className={`rounded-[28px] p-2 ${QUIET_SURFACE}`}>
        {items.map((item) => <ActivityItem key={item.id} item={item} />)}
      </div>
    </section>
  )
}

export function ActivityItem({ item }) {
  return (
    <article className="grid grid-cols-[64px_1fr] gap-3 rounded-[22px] p-3">
      <p className="text-[14px] font-bold leading-5 text-[#8a96a2]">{item.timestamp}</p>
      <div className="min-w-0">
        <h3 className="truncate text-[16px] font-bold leading-5 text-[#101820]">{item.title}</h3>
        <p className="mt-1 truncate text-[15px] font-semibold leading-5 text-[#7d8994]">{item.actor || item.subtitle}</p>
      </div>
    </article>
  )
}

export function PropertyCard({ portalType = 'buyer', property = {} }) {
  const theme = getTheme(portalType)
  return (
    <section className={`overflow-hidden rounded-[30px] ${SURFACE}`}>
      <div className="h-36" style={{ background: `linear-gradient(135deg, ${theme.primarySoft}, #ffffff)` }}>
        <div className="flex h-full items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-white shadow-[0_16px_34px_rgba(15,23,42,0.12)]">
            <Home className="h-10 w-10" style={{ color: theme.primary }} />
          </div>
        </div>
      </div>
      <div className="p-6">
        <p className="text-[14px] font-bold leading-5 text-[#7d8994]">Property</p>
        <h2 className="mt-2 text-[28px] font-bold leading-[1.05] text-[#101820]">{property.address}</h2>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <PropertyMeta label="Price" value={property.price} />
          <PropertyMeta label="Reference" value={property.reference} />
          <PropertyMeta label="Agent" value={property.agent} />
          <PropertyMeta label="Stage" value={property.current_stage} />
        </div>
      </div>
    </section>
  )
}

function PropertyMeta({ label, value }) {
  return (
    <div className="rounded-[18px] bg-[#f6f8f9] p-3">
      <p className="text-[14px] font-bold leading-5 text-[#8a96a2]">{label}</p>
      <p className="mt-1 truncate text-[15px] font-bold leading-5 text-[#101820]">{value}</p>
    </div>
  )
}

export function FloatingSupportButton({ portalType = 'buyer', open = false, onToggle }) {
  const theme = getTheme(portalType)
  const actions = [
    { label: 'Agent', Icon: UserRound },
    { label: 'Attorney', Icon: ShieldCheck },
    { label: 'Support', Icon: HelpCircle },
    { label: 'WhatsApp', Icon: MessageCircle },
  ]
  return (
    <div className="fixed bottom-[5.25rem] right-4 z-50 flex flex-col items-end gap-2">
      {open ? (
        <div className="space-y-2 rounded-[24px] border border-white/80 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.16)]">
          {actions.map(({ label, Icon }) => (
            <button key={label} type="button" className="flex min-h-11 w-40 items-center gap-2 rounded-[18px] px-3 text-left text-[15px] font-bold text-[#101820] hover:bg-[#f5f7f8]">
              {createElement(Icon, { className: 'h-5 w-5', style: { color: theme.primary } })}
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <button type="button" className="flex h-12 w-12 items-center justify-center rounded-full text-white shadow-[0_14px_28px_rgba(15,23,42,0.20)]" style={{ background: theme.primary }} onClick={onToggle} aria-label="Need help">
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>
    </div>
  )
}

export function BottomNavigation({ portalType = 'buyer', items = [], active, onChange }) {
  const theme = getTheme(portalType)
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-0 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-1">
      <div className="mx-auto grid max-w-[520px] grid-cols-5 gap-0 rounded-t-[22px] border border-white/80 bg-white p-1 shadow-[0_-12px_34px_rgba(15,23,42,0.12)]">
        {items.map((item) => {
          const selected = active === item.key
          const Icon = item.icon || Circle
          return (
            <button key={item.key} type="button" className="mobile-pressable flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[16px] px-0 text-[14px] font-normal leading-4" style={selected ? { background: theme.primarySoft, color: theme.primary } : { color: '#7d8994' }} onClick={() => onChange?.(item.key)}>
              {createElement(Icon, { className: 'h-5 w-5' })}
              <span className="max-w-full text-center">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export function JourneyDetailSheet({ portalType = 'buyer', item = null, onClose, onAction }) {
  if (!item) return null
  const theme = getTheme(portalType)
  const Icon = item.icon || Circle
  const insight = getStageInsight(item)
  const nextStep = getStageNextStep(item)
  const actionLabel = getStageActionLabel(item)
  const documents = item.documents || []
  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-[#101820]/35 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={onClose}>
      <section className="mobile-sheet-panel mx-auto max-h-[92dvh] w-full max-w-[520px] overflow-y-auto rounded-[32px] bg-white p-6 shadow-[0_24px_64px_rgba(15,23,42,0.26)]" data-journey-sheet={item.id} onClick={(event) => event.stopPropagation()}>
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-[#d9e0e6]" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className={`inline-flex rounded-full border px-3 py-1 text-[14px] font-bold ${STATUS_STYLES[item.status] || STATUS_STYLES.upcoming}`}>{statusLabel(item.status)}</span>
            <div className="mt-4 flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white" style={{ background: theme.primary }}>
                {createElement(Icon, { className: 'h-6 w-6' })}
              </span>
              <div className="min-w-0">
                <h2 className="text-[30px] font-bold leading-[1.02] text-[#101820]">{item.title}</h2>
                <p className="mt-1 text-[15px] font-bold leading-5" style={{ color: theme.primary }}>{item.owner || 'Team owned'}</p>
              </div>
            </div>
          </div>
          <button type="button" className="mobile-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f1f4f5]" onClick={onClose} aria-label="Close journey details">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-5 text-[16px] leading-6 text-[#667482]">{item.description}</p>

        <div className="mt-5 rounded-[24px] border border-[#e8edf1] bg-[#f7f9fa] p-4">
          <p className="text-[14px] font-bold leading-5 text-[#7d8994]">Current signal</p>
          <p className="mt-2 text-[16px] font-semibold leading-6 text-[#101820]">{insight}</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <PropertyMeta label="Owner" value={item.owner || 'Pending'} />
          <PropertyMeta label="Due" value={item.expected_date || 'To confirm'} />
          <PropertyMeta label="Completed" value={item.completed_date || 'Not yet'} />
          <PropertyMeta label="Status" value={statusLabel(item.status)} />
        </div>

        <div className="mt-4 rounded-[24px] border border-[#e8edf1] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.045)]">
          <p className="text-[14px] font-bold leading-5 text-[#7d8994]">What happens next</p>
          <p className="mt-2 text-[16px] font-semibold leading-6 text-[#101820]">{nextStep}</p>
          {item.blocker ? (
            <div className="mt-4 rounded-[18px] border border-[#f2c4c4] bg-[#fff0f0] p-3">
              <p className="text-[14px] font-bold leading-5 text-[#a73434]">Blocker</p>
              <p className="mt-1 text-[15px] font-semibold leading-5 text-[#6b3a3a]">{item.blocker}</p>
            </div>
          ) : null}
        </div>

        {documents.length ? (
          <div className="mt-4">
            <p className="text-[16px] font-bold leading-5 text-[#101820]">Related documents</p>
            <div className="mt-3 space-y-2">
              {documents.map((document) => (
                <div key={document.label} className="flex min-h-12 items-center justify-between gap-3 rounded-[18px] border border-[#edf1f3] bg-[#f7f9fa] px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <FolderOpen className="h-5 w-5 shrink-0" style={{ color: theme.primary }} />
                    <span className="truncate text-[15px] font-bold leading-5 text-[#101820]">{document.label}</span>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[14px] font-bold leading-4 ${STATUS_STYLES[document.status] || STATUS_STYLES.upcoming}`}>
                    {statusLabel(document.status)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" className="mobile-pressable flex min-h-[52px] items-center justify-center gap-2 rounded-[20px] border border-[#e8edf1] bg-white text-[16px] font-bold text-[#101820]">
            <Phone className="h-5 w-5" style={{ color: theme.primary }} />
            Call owner
          </button>
          <button type="button" className="mobile-pressable flex min-h-[52px] items-center justify-center gap-2 rounded-[20px] border border-[#e8edf1] bg-white text-[16px] font-bold text-[#101820]">
            <MessageCircle className="h-5 w-5" style={{ color: theme.primary }} />
            Message
          </button>
        </div>

        <button
          type="button"
          className="mobile-pressable mt-4 min-h-[54px] w-full rounded-[20px] text-[16px] font-bold text-white"
          data-journey-primary-action={item.id}
          style={{ background: theme.primary }}
          onClick={() => onAction?.(item) || onClose?.()}
        >
          {actionLabel}
        </button>
      </section>
    </div>
  )
}

export function SectionTitle({ title }) {
  return <h2 className="text-[22px] font-bold text-[#101820]">{title}</h2>
}
