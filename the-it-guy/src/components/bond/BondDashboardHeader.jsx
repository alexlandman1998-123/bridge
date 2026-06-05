import { Download, Handshake, Plus } from 'lucide-react'
import { cn } from '../../lib/utils'

export default function BondDashboardHeader({
  summaryText = '',
  developmentControl = null,
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
        'rounded-[20px] border border-[#dbe5f0] bg-white px-4 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.035)] sm:px-5',
        className,
      )}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.35rem] font-semibold tracking-normal text-[#132130] sm:text-[1.55rem]">
            Bond Originator Command Center
          </h1>
          <p className="mt-1 text-sm leading-6 text-[#5f7287]">
            {summaryText || 'Operational status is loading across active bond applications.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          {developmentControl ? <div className="min-w-[220px]">{developmentControl}</div> : null}
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-[#143250] px-3.5 text-sm font-semibold text-white transition hover:bg-[#173a5e]"
          >
            <Plus size={16} />
            Create Application
          </button>
          <button
            type="button"
            onClick={onInvitePartner}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[#cfddee] bg-white px-3.5 text-sm font-semibold text-[#17324d] transition hover:border-[#b4cbde]"
          >
            <Handshake size={16} />
            Invite Partner
          </button>
          <button
            type="button"
            onClick={sendReport}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[#cfddee] bg-white px-3.5 text-sm font-semibold text-[#17324d] transition hover:border-[#b4cbde]"
          >
            <Download size={16} />
            Export Report
          </button>
        </div>
      </div>
    </section>
  )
}
