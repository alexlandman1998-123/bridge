import { Download, Handshake, Plus, TrendingUp } from 'lucide-react'
import { cn } from '../../lib/utils'

export default function BondDashboardHeader({
  userDisplayName = 'there',
  applicationsMovedText = '',
  velocityText = '',
  focusChips = [],
  onCreate = () => {},
  onInvitePartner = () => {},
  onExportReport = () => {},
  heroKpis = [],
  className = '',
}) {
  const kpis = Array.isArray(heroKpis) ? heroKpis : []

  function sendReport() {
    if (typeof onExportReport === 'function') {
      onExportReport()
    }
  }

  return (
    <section
      className={cn(
        'rounded-[24px] border border-[#dbe5f0] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-4 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.045)] sm:px-5 sm:py-5',
        className,
      )}
    >
      <div className="grid gap-4 xl:grid-cols-[1.15fr_1.9fr_0.9fr] xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-[#6f8399]">
            Bond Originator Command Center
          </p>
          <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.03em] text-[#132130]">
            Good morning, {userDisplayName}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#5f7287]">
            {applicationsMovedText ? `${applicationsMovedText}.` : 'Operations are moving this week.'}
          </p>
          <p className="mt-1 text-sm leading-6 text-[#5f7287]">
            {velocityText ? `Approval velocity is ${velocityText}.` : 'Watch the movement before it becomes risk.'}
          </p>
          {focusChips.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {focusChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-[#dbe6f1] bg-[#f7fbff] px-3 py-1 text-xs font-semibold text-[#4f667f]"
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="col-span-full xl:col-span-1">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {kpis.slice(0, 6).map((kpi) => {
              const sparkline = Array.isArray(kpi.sparkline) ? kpi.sparkline : []
              const trend = String(kpi.trend || '')
              const comparison = String(kpi.comparison || '')

              return (
                <article
                  key={kpi.key}
                  className="rounded-[14px] border border-[#e3ebf5] bg-white px-3 py-2.5"
                >
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ea3]">
                    {kpi.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold tracking-[-0.02em] text-[#142132]">{kpi.value}</p>
                  <p className="mt-1 text-xs font-semibold text-[#60758b]">
                    {trend}
                    {trend && comparison ? ' · ' : ''}
                    {comparison}
                  </p>
                  <div className="mt-2 flex h-5 items-end gap-1">
                    {sparkline.length ? (
                      sparkline.slice(0, 9).map((point, pointIndex) => (
                        <span
                          key={`${kpi.key}-${pointIndex}`}
                          className="w-1 rounded-full bg-gradient-to-t from-[#2f5f95] to-[#80a8ce]"
                          style={{
                            height: `${Math.max(8, Math.min(100, Number(point) || 0) * 0.75)}%`,
                          }}
                        />
                      ))
                    ) : (
                      <>
                        <span className="h-1 w-1 rounded-full bg-[#8aa8c4]" />
                        <span className="h-2 w-1 rounded-full bg-[#8aa8c4]" />
                        <span className="h-3 w-1 rounded-full bg-[#8aa8c4]" />
                      </>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col justify-end gap-2">
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[13px] bg-[#143250] px-4 text-sm font-semibold text-white transition hover:bg-[#173a5e]"
          >
            <Plus size={16} />
            Create Application
          </button>
          <button
            type="button"
            onClick={onInvitePartner}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[13px] border border-[#cfddee] bg-white px-4 text-sm font-semibold text-[#17324d] transition hover:border-[#b4cbde]"
          >
            <Handshake size={16} />
            Invite Partner
          </button>
          <button
            type="button"
            onClick={sendReport}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[13px] border border-[#cfddee] bg-white px-4 text-sm font-semibold text-[#17324d] transition hover:border-[#b4cbde]"
          >
            <Download size={16} />
            Export Report
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[13px] px-1 py-1 text-xs font-semibold text-[#60758d] transition hover:text-[#22374d]"
            disabled
          >
            <TrendingUp size={13} />
            Velocity Monitor
          </button>
        </div>
      </div>
    </section>
  )
}
