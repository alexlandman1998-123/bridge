import { FileArchive } from 'lucide-react'
import { formatDate, titleize } from '../commercialFormatters'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialAllDocuments } from '../services/commercialApi'

function CommercialDocumentsPage() {
  const { data, loading, error } = useCommercialData(getCommercialAllDocuments, [])
  const documents = Array.isArray(data) ? data : []

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Documents</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Commercial document library across requirements, deals, leases, landlords, clients, properties, and vacancies.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
          <FileArchive size={14} /> Commercial docs
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        {loading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        ) : error ? (
          <CommercialEmptyState title="Documents could not be loaded" description={error} />
        ) : documents.length ? documents.map((document) => (
          <article key={document.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 md:grid-cols-[minmax(0,1fr)_160px_160px] md:items-center">
            <div>
              <p className="text-sm font-semibold text-[#102236]">{document.document_name}</p>
              <p className="mt-1 text-xs text-slate-500">{titleize(document.entity_type)} · {document.category || 'Commercial document'}</p>
            </div>
            <p className="text-sm font-semibold text-slate-600">{titleize(document.status)}</p>
            <p className="text-sm text-slate-500">{formatDate(document.uploaded_at || document.created_at)}</p>
          </article>
        )) : (
          <CommercialEmptyState
            title="No commercial documents yet"
            description="Documents uploaded from commercial record detail views will appear here."
          />
        )}
      </div>
    </section>
  )
}

export default CommercialDocumentsPage
