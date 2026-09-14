import { ArrowRight, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'

export function RentalApplicationInvitePanel() {
  return <section className="rounded-xl border bg-white p-5 shadow-sm">
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-700"><UsersRound className="h-4 w-4" /></span>
      <div>
        <h2 className="font-semibold">Start an application from a tenant lead</h2>
        <p className="mt-1 text-sm text-slate-600">Create or open the tenant lead first, then select this marketed vacancy in the lead workspace. This preserves the enquiry, viewing, applicant link, and decision trail together.</p>
        <Link to="/agent/rentals/pipeline/leads" className="mt-3 inline-flex items-center gap-1 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white">Open tenant leads <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </div>
  </section>
}
