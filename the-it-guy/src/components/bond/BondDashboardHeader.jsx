import { Download, Handshake, Plus } from 'lucide-react'
import { cn } from '../../lib/utils'

export default function BondDashboardHeader({
  userDisplayName = 'there',
  applicationsMovedText = '',
  velocityText = '',
  focusChips = [],
  onCreate = () => {},
  onInvitePartner = () => {},
  onExportReport = () => {},
  className = '',
}) {
  function sendReport() {
    if (typeof onExportReport === 'function') {
      onExportReport()
    }
  }

  return (
    <section
      className={cn(
        'rounded-[24px] border border-[#dbe5f0] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-5 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.045)] sm:px-7 sm:py-6',
        className,
      )}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_240px] xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-[0.78rem] font-semibold uppercase tracking-[0.22em] text-[#6f8399]">
            Bond Originator Command Center
          </p>
          <h1 className="mt-3 text-[2.15rem] font-semibold text-[#132130]">
            Good morning, {userDisplayName}
          </h1>
          <p className="mt-3 text-base leading-7 text-[#5f7287]">
            {applicationsMovedText ? `${applicationsMovedText}.` : 'Operations are moving this week.'}
          </p>
          <p className="mt-1 text-base leading-7 text-[#5f7287]">
            {velocityText ? `Approval velocity is ${velocityText}.` : 'Watch the movement before it becomes risk.'}
          </p>
          {focusChips.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
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

        <div className="flex flex-col justify-center gap-2">
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
        </div>
      </div>
    </section>
  )
}
