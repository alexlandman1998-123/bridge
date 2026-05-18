import { ArrowRight, BarChart3, BriefcaseBusiness, Building2, CalendarClock, Gauge, Users } from 'lucide-react'
import CommercialEmptyState from '../components/CommercialEmptyState'

const REPORTS = [
  { label: 'Occupancy Report', description: 'Track occupancy and leased area movement.', icon: Gauge },
  { label: 'Vacancy Report', description: 'Review available space and vacancy exposure.', icon: Building2 },
  { label: 'Lease Expiry Report', description: 'Monitor renewals and upcoming expiries.', icon: CalendarClock },
  { label: 'Broker Performance', description: 'Compare broker activity and outcomes.', icon: Users },
  { label: 'Portfolio Performance', description: 'Summarise landlord portfolio performance.', icon: BriefcaseBusiness },
  { label: 'Deal Pipeline Report', description: 'Analyse commercial deal movement.', icon: BarChart3 },
]

function CommercialReportsPage() {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Reports</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Future reporting area for commercial performance, portfolio visibility, and pipeline intelligence.</p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
          Reporting shell
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((report) => {
          const Icon = report.icon
          return (
            <article key={report.label} className="group rounded-2xl border border-slate-200 bg-[#fbfcfe] p-5 transition hover:border-[#cfe0ef] hover:bg-white hover:shadow-[0_16px_30px_rgba(15,23,42,0.06)]">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef5fb] text-[#1f5a80]">
                <Icon size={19} />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-[#102236]">{report.label}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">{report.description}</p>
              <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#1b6f55]">
                Prepare report
                <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
              </span>
            </article>
          )
        })}
      </div>

      <div className="mt-5">
        <CommercialEmptyState
          title="No commercial reporting data yet"
          description="Report cards are ready for future commercial records, deal activity, lease data, and portfolio metrics."
        />
      </div>
    </section>
  )
}

export default CommercialReportsPage
