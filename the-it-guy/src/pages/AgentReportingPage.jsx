import { BarChart3, BriefcaseBusiness, CalendarDays, TrendingUp, Users } from 'lucide-react'
import { Link } from 'react-router-dom'

function ReportingMetric({ label, value, icon: Icon }) {
  return (
    <article className="rounded-[16px] border border-[#dce5f0] bg-white px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-[#7488a0]">{label}</p>
        <Icon size={14} className="text-[#5f7894]" />
      </div>
      <p className="mt-2 text-[1.25rem] font-semibold tracking-[-0.02em] text-[#142132]">{value}</p>
    </article>
  )
}

function AgentReportingPage() {
  return (
    <section className="space-y-5">
      <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7890aa]">Agents</p>
        <h2 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.02em] text-[#162233]">Agent Reporting</h2>
        <p className="mt-2 text-sm text-[#5f7690]">
          Organisation-level visibility for agent conversion, activity, appointments, and production trends.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ReportingMetric label="Lead Conversion" value="—" icon={TrendingUp} />
          <ReportingMetric label="Appointments Logged" value="—" icon={CalendarDays} />
          <ReportingMetric label="Active Listings" value="—" icon={BriefcaseBusiness} />
          <ReportingMetric label="Agent Coverage" value="—" icon={Users} />
        </div>
      </article>

      <article className="rounded-[22px] border border-[#dde4ee] bg-white p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d5e1ef] bg-[#f5f9ff] text-[#2f5578]">
            <BarChart3 size={16} />
          </span>
          <div>
            <h3 className="text-base font-semibold text-[#20344b]">Reporting Workspace Ready</h3>
            <p className="mt-1 text-sm text-[#617891]">
              This route is now in place for principal navigation. Next iteration can wire live charts and filters for
              lead conversion, commission, canvassing activity, and appointment outcomes.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/agents/directory"
                className="inline-flex items-center rounded-full border border-[#d5e0ec] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#b9cadf]"
              >
                Open Agent Directory
              </Link>
              <Link
                to="/pipeline/overview"
                className="inline-flex items-center rounded-full border border-[#d5e0ec] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#b9cadf]"
              >
                Open Pipeline Overview
              </Link>
            </div>
          </div>
        </div>
      </article>
    </section>
  )
}

export default AgentReportingPage
