import {
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { createElement } from 'react'

const PORTAL_THEMES = {
  buyer: {
    accent: 'bg-[#0f5f58]',
    accentText: 'text-[#0f5f58]',
    accentBorder: 'border-[#b9ddd4]',
    accentSoft: 'bg-[#e6f3ef]',
    accentRing: 'ring-[#b9ddd4]',
    hero: 'bg-[#0f5f58]',
    heroPattern: 'from-white/14 via-white/0 to-black/14',
    page: 'bg-[#f2f4ef]',
    chip: 'bg-[#0f5f58] text-white shadow-[0_8px_18px_rgba(15,95,88,0.18)]',
    progress: 'bg-[#a8e4c8]',
  },
  seller: {
    accent: 'bg-[#145ea8]',
    accentText: 'text-[#145ea8]',
    accentBorder: 'border-[#bfd6ef]',
    accentSoft: 'bg-[#e8f1fb]',
    accentRing: 'ring-[#bfd6ef]',
    hero: 'bg-[#145ea8]',
    heroPattern: 'from-white/16 via-white/0 to-black/14',
    page: 'bg-[#f2f4f7]',
    chip: 'bg-[#145ea8] text-white shadow-[0_8px_18px_rgba(20,94,168,0.18)]',
    progress: 'bg-[#b9dcff]',
  },
}

const SURFACE = 'border border-white/80 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.045)]'
const SURFACE_STRONG = 'border border-white/80 bg-white shadow-[0_12px_26px_rgba(15,23,42,0.07)]'
const CONTROL_SURFACE = 'border border-[#e8ecef] bg-white shadow-[0_6px_14px_rgba(15,23,42,0.04)]'

function getTheme(portalType) {
  return PORTAL_THEMES[portalType] || PORTAL_THEMES.buyer
}

export function MobilePortalScreen({ portalType = 'buyer', children, stickyAction = null }) {
  const theme = getTheme(portalType)
  return (
    <div className={`-mx-4 -my-4 min-h-[100dvh] ${theme.page} px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 text-[#101820]`}>
      <div className="pointer-events-none fixed inset-x-0 top-0 h-40 bg-gradient-to-b from-white/70 to-transparent" />
      <div className="relative mx-auto w-full max-w-[520px] space-y-3.5">
        {children}
      </div>
      {stickyAction}
    </div>
  )
}

export function MobilePortalHeader({
  portalType = 'buyer',
  title,
  subtitle,
  eyebrow = 'Mobile Portal',
  avatarLabel = '',
  completion = 0,
}) {
  const theme = getTheme(portalType)
  const initials = String(avatarLabel || title || 'A')
    .trim()
    .slice(0, 1)
    .toUpperCase()

  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${theme.accent} text-[14px] font-bold text-white shadow-[0_10px_20px_rgba(15,23,42,0.12)]`}>
          {initials}
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#7b8794]">{eyebrow}</p>
          <h1 className="truncate text-[18px] font-semibold leading-6 text-[#101820]">{title}</h1>
          <p className="truncate text-[12px] font-medium leading-5 text-[#7b8794]">{subtitle}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`hidden min-h-8 items-center rounded-full border px-3 text-[12px] font-bold sm:inline-flex ${theme.accentBorder} ${theme.accentSoft} ${theme.accentText}`}>
          {completion}% done
        </span>
        <button type="button" className={`flex h-10 w-10 items-center justify-center rounded-full text-[#101820] ${CONTROL_SURFACE}`} aria-label="Portal notifications">
          <Bell className="h-5 w-5" />
        </button>
        <button type="button" className={`flex h-10 w-10 items-center justify-center rounded-full text-[#101820] ${CONTROL_SURFACE}`} aria-label="Portal help">
          <CircleHelp className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}

export function MobilePortalSearch({ portalType = 'buyer', placeholder = 'Search onboarding tasks' }) {
  const theme = getTheme(portalType)
  return (
    <div className="flex items-center gap-2">
      <label className={`flex min-h-[48px] min-w-0 flex-1 items-center gap-3 rounded-2xl px-3.5 text-sm text-[#7b8794] ${CONTROL_SURFACE}`}>
        <Search className="h-4 w-4 shrink-0" />
        <input
          className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-[#101820] outline-none placeholder:text-[#9aa4af]"
          placeholder={placeholder}
          readOnly
        />
      </label>
      <button type="button" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${theme.accent} text-white shadow-[0_8px_18px_rgba(15,23,42,0.14)]`} aria-label="Open onboarding filters">
        <SlidersHorizontal className="h-5 w-5" />
      </button>
    </div>
  )
}

export function MobilePortalHero({
  portalType = 'buyer',
  eyebrow,
  title,
  body,
  completion = 0,
  ctaLabel,
  onCta,
  Icon: HeroIcon = ShieldCheck,
}) {
  const theme = getTheme(portalType)
  return (
    <section className={`relative overflow-hidden rounded-[22px] ${theme.hero} p-4 text-white shadow-[0_14px_30px_rgba(15,23,42,0.16)]`}>
      <span className={`pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_84%_14%,rgba(255,255,255,0.22),transparent_26%),linear-gradient(135deg,var(--tw-gradient-stops))] ${theme.heroPattern}`} />
      <div className="relative flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#d7ece9]">{eyebrow}</p>
          <h2 className="mt-2 max-w-[13.25rem] text-[22px] font-bold leading-[1.05] text-white">{title}</h2>
          <p className="mt-2 max-w-[16.5rem] text-[12px] font-medium leading-5 text-[#dce8f2]">{body}</p>
          <div className="mt-3.5 flex items-center gap-3">
            <button type="button" className="min-h-10 max-w-[9.5rem] truncate rounded-full bg-white px-4 text-[13px] font-bold text-[#101820] shadow-[0_8px_18px_rgba(15,23,42,0.14)]" onClick={onCta}>
              {ctaLabel}
            </button>
            <span className="shrink-0 text-[12px] font-bold text-[#eef7f4]">{completion}%</span>
          </div>
        </div>
        <div className="flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-[24px] bg-white/14 ring-1 ring-white/20">
          <div className="flex h-[68px] w-[68px] items-center justify-center rounded-[20px] bg-white text-[#101820] shadow-[0_12px_26px_rgba(15,23,42,0.14)]">
            {createElement(HeroIcon, { className: `h-9 w-9 ${theme.accentText}` })}
          </div>
        </div>
      </div>
      <div className="relative mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/18">
        <span className={`block h-full rounded-full ${theme.progress}`} style={{ width: `${Math.max(Math.min(completion, 100), 6)}%` }} />
      </div>
    </section>
  )
}

export function MobilePortalIconRail({ portalType = 'buyer', items = [] }) {
  const theme = getTheme(portalType)
  return (
    <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
      {items.map((item) => {
        const Icon = item.icon || ShieldCheck
        return (
          <button key={item.key} type="button" className={`flex min-w-[74px] shrink-0 flex-col items-center gap-2 rounded-2xl px-2 py-2.5 ${SURFACE}`} aria-pressed={item.active}>
            <span className={`flex h-10 w-10 items-center justify-center rounded-full ${item.active ? `${theme.accent} text-white shadow-[0_8px_16px_rgba(15,23,42,0.14)]` : `bg-[#f4f6f7] ${theme.accentText}`} ring-1 ring-black/5`}>
              {createElement(Icon, { className: 'h-5 w-5' })}
            </span>
            <span className="max-w-full truncate text-[10px] font-bold text-[#4d5965]">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function MobilePortalTabs({ portalType = 'buyer', items = [], active, onChange }) {
  const theme = getTheme(portalType)
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {items.map((item) => {
        const selected = active === item.key
        return (
          <button
            key={item.key}
            type="button"
            className={`min-h-9 shrink-0 rounded-full border px-4 text-[12px] font-bold transition ${selected ? `${theme.chip} border-transparent` : 'border-[#e8ecef] bg-white text-[#5f6b76] shadow-[0_6px_14px_rgba(15,23,42,0.035)]'}`}
            onClick={() => onChange?.(item.key)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export function MobilePortalSectionHeader({ title, actionLabel = '', onAction = null }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[17px] font-bold text-[#101820]">{title}</h2>
      {actionLabel ? (
        <button type="button" className="min-h-8 rounded-full px-2 text-[12px] font-bold text-[#5f6b76]" onClick={onAction || undefined}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

export function MobilePortalMetricStrip({ portalType = 'buyer', items = [] }) {
  const theme = getTheme(portalType)
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className={`rounded-2xl p-3 ${SURFACE}`}>
          <p className={`text-[19px] font-bold leading-none ${theme.accentText}`}>{item.value}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.06em] text-[#6d7884]">{item.label}</p>
        </div>
      ))}
    </div>
  )
}

export function MobilePortalNextActionCard({
  portalType = 'buyer',
  eyebrow = 'Up next',
  title,
  body,
  actionLabel,
  onAction,
  Icon = ShieldCheck,
}) {
  const theme = getTheme(portalType)
  return (
    <section className={`rounded-[20px] p-4 ${SURFACE_STRONG}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${theme.accentSoft} ${theme.accentText}`}>
          {createElement(Icon, { className: 'h-5 w-5' })}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-bold uppercase tracking-[0.08em] ${theme.accentText}`}>{eyebrow}</p>
          <h2 className="mt-1 text-[16px] font-bold leading-5 text-[#101820]">{title}</h2>
          <p className="mt-1 text-[13px] leading-5 text-[#6d7884]">{body}</p>
        </div>
      </div>
      {actionLabel ? (
        <button type="button" className={`mt-4 min-h-11 w-full rounded-2xl px-4 text-[14px] font-bold text-white ${theme.accent}`} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  )
}

export function MobilePortalTaskRow({
  portalType = 'buyer',
  title,
  subtitle,
  meta,
  completed = false,
  onAction,
  Icon: RowIcon = ShieldCheck,
}) {
  const theme = getTheme(portalType)
  return (
    <button type="button" className={`flex w-full items-center gap-3 rounded-[18px] p-3 text-left ${SURFACE}`} onClick={onAction}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${completed ? theme.accentSoft : 'bg-[#f4f6f7]'} ${completed ? theme.accentText : 'text-[#7b8794]'}`}>
        {completed ? <Check className="h-5 w-5" /> : createElement(RowIcon, { className: 'h-5 w-5' })}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-[#101820]">{title}</span>
        <span className="mt-0.5 block truncate text-[12px] font-medium text-[#7b8794]">{subtitle}</span>
      </span>
      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.04em] ${completed ? `${theme.accentBorder} ${theme.accentSoft} ${theme.accentText}` : 'border-[#eadfb8] bg-[#f5f0df] text-[#8b6f22]'}`}>
        {meta}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#a3adb7]" />
    </button>
  )
}

export function MobilePortalDocumentRow({
  portalType = 'buyer',
  title,
  subtitle,
  uploaded = false,
  onUpload,
}) {
  const theme = getTheme(portalType)
  return (
    <div className={`flex items-center gap-3 rounded-[18px] p-3 ${SURFACE}`}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${uploaded ? theme.accentSoft : 'bg-[#f4f6f7]'} ${uploaded ? theme.accentText : 'text-[#7b8794]'}`}>
        {uploaded ? <Check className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-[#101820]">{title}</p>
        <p className="mt-0.5 truncate text-[12px] font-medium text-[#7b8794]">{subtitle}</p>
      </div>
      <button type="button" className={`min-h-9 rounded-full border px-3 text-[12px] font-bold ${uploaded ? 'border-[#e1e6ea] bg-[#f4f6f7] text-[#5f6b76]' : `border-transparent ${theme.accent} text-white`}`} onClick={onUpload}>
        {uploaded ? 'Replace' : 'Upload'}
      </button>
    </div>
  )
}

export function MobilePortalReviewCard({ portalType = 'buyer', title, body, rows = [] }) {
  const theme = getTheme(portalType)
  return (
    <section className={`rounded-[20px] p-4 ${SURFACE_STRONG}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${theme.accentSoft} ${theme.accentText}`}>
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold leading-5 text-[#101820]">{title}</h2>
          <p className="mt-1 text-[13px] leading-5 text-[#6d7884]">{body}</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 rounded-xl border border-[#edf0ec] bg-[#f7f8f5] px-3 py-2">
            <span className="text-[12px] font-semibold text-[#6d7884]">{row.label}</span>
            <span className="text-[12px] font-bold text-[#101820]">{row.value}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function MobilePortalStickyActionBar({
  portalType = 'buyer',
  primaryLabel,
  secondaryLabel = 'Upload',
  onPrimary,
  onSecondary,
}) {
  const theme = getTheme(portalType)
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-1.5">
      <div className="mx-auto flex max-w-[520px] items-center gap-2 rounded-[19px] border border-white/80 bg-white/95 p-1.5 shadow-[0_-10px_28px_rgba(15,23,42,0.13)] backdrop-blur-xl">
        <button type="button" className="min-h-11 min-w-0 flex-1 truncate rounded-[15px] bg-[#101820] px-3 text-[13px] font-bold text-white" onClick={onSecondary}>
          {secondaryLabel}
        </button>
        <button type="button" className={`min-h-11 min-w-0 flex-[1.35] truncate rounded-[15px] px-3 text-[13px] font-bold text-white ${theme.accent}`} onClick={onPrimary}>
          {primaryLabel}
        </button>
      </div>
    </div>
  )
}
