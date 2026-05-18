import { FileSignature } from 'lucide-react'
import { formatCurrency, formatDate, titleize } from '../commercialFormatters'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialAllHeadsOfTerms } from '../services/commercialApi'

function CommercialHeadsOfTermsPage() {
  const { data, loading, error } = useCommercialData(getCommercialAllHeadsOfTerms, [])
  const headsOfTerms = Array.isArray(data) ? data : []

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Heads of Terms</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Review commercial Heads of Terms drafts, approvals, and records ready for lease drafting.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
          <FileSignature size={14} /> HOT control
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        {loading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        ) : error ? (
          <CommercialEmptyState title="Heads of Terms could not be loaded" description={error} />
        ) : headsOfTerms.length ? headsOfTerms.map((hot) => (
          <article key={hot.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 md:grid-cols-[minmax(0,1fr)_160px_160px_150px] md:items-center">
            <div>
              <p className="text-sm font-semibold text-[#102236]">{hot.premises_description || 'Heads of Terms'}</p>
              <p className="mt-1 text-xs text-slate-500">{titleize(hot.status)} · {formatDate(hot.updated_at || hot.created_at)}</p>
            </div>
            <p className="text-sm font-semibold text-[#102236]">{formatCurrency(hot.monthly_rental)}</p>
            <p className="text-sm text-slate-600">{hot.lease_term_months || 0} months</p>
            <p className="text-sm text-slate-600">{formatDate(hot.lease_commencement_date)}</p>
          </article>
        )) : (
          <CommercialEmptyState
            title="No Heads of Terms yet"
            description="HOT records created from commercial deal detail views will appear here for portfolio-level oversight."
          />
        )}
      </div>
    </section>
  )
}

export default CommercialHeadsOfTermsPage
