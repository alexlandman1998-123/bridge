import {
  Building2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  FileText,
  Link2,
  Printer,
  RefreshCw,
  Trash2,
  UserRound,
} from 'lucide-react'
import Button from './ui/Button'

const PILL_TONE_CLASS = {
  neutral: 'border-borderDefault bg-surface text-textBody',
  blue: 'border-info/30 bg-infoSoft text-info',
  green: 'border-success/30 bg-successSoft text-success',
  amber: 'border-warning/30 bg-warningSoft text-warning',
  red: 'border-danger/30 bg-dangerSoft text-danger',
  indigo: 'border-primary/30 bg-primarySoft text-primary',
  slate: 'border-borderDefault bg-mutedBg text-textMuted',
}

const ICON_BY_KEY = {
  user: UserRound,
  stage: Building2,
  status: Building2,
  onboarding: Link2,
  finance: CircleDollarSign,
  time: Clock3,
  price: CircleDollarSign,
  print: Printer,
  portal: ExternalLink,
  onboarding_link: Link2,
  refresh: RefreshCw,
  report: FileText,
  delete: Trash2,
}

const ACTION_BADGE_TONE_CLASS = {
  neutral: 'border-borderDefault bg-surfaceAlt text-textBody',
  success: 'border-success/35 bg-successSoft text-success',
  warning: 'border-warning/35 bg-warningSoft text-warning',
  danger: 'border-danger/35 bg-dangerSoft text-danger',
}

function renderWithOptionalIcon({
  icon,
  iconClassName = 'text-current',
  label,
}) {
  const Icon = icon ? ICON_BY_KEY[icon] : null
  if (!Icon) {
    return label
  }

  return (
    <>
      <Icon size={14} className={iconClassName} />
      {label}
    </>
  )
}

function TransactionWorkspaceHeader({
  contextLabel = 'TRANSACTION WORKSPACE',
  title,
  unitLabel = '',
  subtitle = '',
  pills = [],
  stats = [],
  actions = [],
}) {
  const visibleActions = (actions || []).filter((item) => item && !item.hidden)
  const visiblePills = (pills || []).filter((item) => item?.label)
  const visibleStats = (stats || []).filter((item) => item?.label)

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-28 rounded-t-[28px] bg-[linear-gradient(180deg,rgba(53,84,108,0.08)_0%,rgba(53,84,108,0)_100%)]" />

      <div className="relative flex flex-col gap-5">
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-start">
          <div className="min-w-0">
            {contextLabel ? (
              <span className="inline-flex items-center rounded-full border border-[#d9e4ef] bg-white/90 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#61758d] shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                {contextLabel}
              </span>
            ) : null}

            <div className={`${contextLabel ? 'mt-4' : ''} flex flex-wrap items-center gap-3`}>
              <h1 className="text-[2.4rem] font-semibold leading-none tracking-[-0.06em] text-[#142132]">
                {title || 'Transaction Workspace'}
              </h1>
              {unitLabel ? (
                <>
                  <span className="text-[1.8rem] font-medium leading-none text-[#a8b6c6]">|</span>
                  <span className="inline-flex items-center rounded-full border border-[#d7e2ee] bg-[#f8fbfe] px-4 py-2 text-[1rem] font-semibold text-[#35546c] shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                    {unitLabel}
                  </span>
                </>
              ) : null}
            </div>

            {subtitle ? (
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#6b7d93]">
                {subtitle}
              </p>
            ) : null}
          </div>

          {visibleActions.length ? (
            <div className="no-print flex flex-wrap items-center gap-3 2xl:justify-end">
              {visibleActions.map((action) => {
                if (action.as === 'badge') {
                  return (
                    <span
                      key={action.id || action.label}
                      className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-semibold ${
                        action.className || ACTION_BADGE_TONE_CLASS[action.tone] || ACTION_BADGE_TONE_CLASS.neutral
                      }`}
                    >
                      {renderWithOptionalIcon({ icon: action.icon, label: action.label })}
                    </span>
                  )
                }

                const variant = action.variant || 'secondary'
                const className = action.className || ''
                return (
                  <Button
                    key={action.id || action.label}
                    variant={variant}
                    className={className}
                    onClick={action.onClick}
                    disabled={Boolean(action.disabled)}
                    type="button"
                  >
                    {renderWithOptionalIcon({ icon: action.icon, label: action.label })}
                  </Button>
                )
              })}
            </div>
          ) : null}
        </div>

        {visiblePills.length ? (
          <div className="mt-1 flex flex-wrap gap-2.5">
            {visiblePills.map((pill) => (
              <span
                key={`${pill.label}-${pill.icon || 'iconless'}`}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[0.82rem] font-semibold shadow-[0_8px_20px_rgba(15,23,42,0.04)] ${
                  PILL_TONE_CLASS[pill.tone] || PILL_TONE_CLASS.neutral
                }`}
              >
                {pill.icon ? renderWithOptionalIcon({ icon: pill.icon, label: pill.label }) : pill.label}
              </span>
            ))}
          </div>
        ) : null}

        {visibleStats.length ? (
          <div className="grid gap-3 md:grid-cols-4">
            {visibleStats.map((stat) => {
              const Icon = stat.icon ? ICON_BY_KEY[stat.icon] : null
              return (
                <article
                  key={stat.label}
                  className="rounded-[22px] border border-[#e0e8f1] bg-white/90 px-4 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">
                        {stat.label}
                      </span>
                      <strong className="mt-2 block text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">
                        {stat.value}
                      </strong>
                      {stat.helperText ? (
                        <span className="mt-1.5 block text-sm text-[#71839a]">{stat.helperText}</span>
                      ) : null}
                    </div>
                    {Icon ? (
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#edf4fb]">
                        <Icon size={16} className="text-[#35546c]" />
                      </span>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default TransactionWorkspaceHeader
