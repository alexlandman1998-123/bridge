import { FileSignature } from 'lucide-react'
import { useState } from 'react'
import { formatCurrency, formatDate, titleize } from '../commercialFormatters'
import { getCommercialNextAction } from '../commercialPresentation'
import CommercialDocumentLibrary from '../components/CommercialDocumentLibrary'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialAllHeadsOfTerms, getCommercialLookupData } from '../services/commercialApi'

async function fetchHeadsOfTermsPageData(organisationId) {
  const [headsOfTerms, lookups] = await Promise.all([
    getCommercialAllHeadsOfTerms(organisationId),
    getCommercialLookupData(organisationId),
  ])
  return { headsOfTerms, lookups, organisationId }
}

function lookupLabel(lookups, kind, id, fallback = '-') {
  if (!id) return fallback
  const match = (lookups?.[kind] || []).find((row) => row.id === id)
  return match?.name || match?.property_name || match?.deal_name || fallback
}

function CommercialHeadsOfTermsPage() {
  const [expandedHotId, setExpandedHotId] = useState('')
  const { data, loading, error } = useCommercialData(fetchHeadsOfTermsPageData, [])
  const headsOfTerms = Array.isArray(data?.headsOfTerms) ? data.headsOfTerms : []
  const lookups = data?.lookups || {}

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
          <article key={hot.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_140px_150px_120px] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[#102236]">{hot.premises_description || 'Heads of Terms'}</p>
                  <CommercialStatusPill value={hot.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Deal: {lookupLabel(lookups, 'deals', hot.deal_id, 'Unlinked deal')} · Updated {formatDate(hot.updated_at || hot.created_at)}
                </p>
              </div>
              <div className="grid gap-1 text-sm">
                <p className="font-semibold text-[#102236]">{lookupLabel(lookups, 'tenants', hot.tenant_id, 'Tenant unlinked')}</p>
                <p className="text-slate-500">{lookupLabel(lookups, 'properties', hot.property_id, 'Property unlinked')}</p>
                <p className="text-xs font-semibold text-amber-700">Next: {getCommercialNextAction('headsOfTerms', hot)}</p>
              </div>
              <div className="grid gap-1 text-sm">
                <p className="font-semibold text-[#102236]">{formatCurrency(hot.monthly_rental)}</p>
                <p className="text-slate-500">{formatCurrency(hot.rental_per_m2)} / m²</p>
              </div>
              <div className="grid gap-1 text-sm text-slate-600">
                <p>{hot.lease_term_months || 0} months</p>
                <p>Start {formatDate(hot.lease_commencement_date)}</p>
                <p>{titleize(hot.status)}</p>
              </div>
              <button
                type="button"
                onClick={() => setExpandedHotId((current) => current === hot.id ? '' : hot.id)}
                className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] transition hover:bg-slate-50"
              >
                Documents
              </button>
            </div>
            {expandedHotId === hot.id ? (
              <div className="mt-4">
                <CommercialDocumentLibrary organisationId={data?.organisationId} entityType="commercial_heads_of_terms" entityId={hot.id} compact />
              </div>
            ) : null}
          </article>
        )) : (
          <CommercialEmptyState
            title="No Heads of Terms yet"
            description="Heads of Terms will appear here once commercial deal terms are being prepared."
          />
        )}
      </div>
    </section>
  )
}

export default CommercialHeadsOfTermsPage
