import { X } from 'lucide-react'
import { titleize } from '../commercialFormatters'
import CommercialDocumentLibrary from './CommercialDocumentLibrary'
import CommercialHeadsOfTermsPanel from './CommercialHeadsOfTermsPanel'
import CommercialStatusPill from './CommercialStatusPill'

function CommercialRecordDrawer({ open, record, title, fields = [], documentsEntityType = '', showHeadsOfTerms = false, organisationId = '', onClose, onEdit, onArchive }) {
  if (!open || !record) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-sm">
      <aside className="flex h-full w-full max-w-xl flex-col bg-white shadow-[-24px_0_60px_rgba(15,23,42,0.18)]">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-[#102236]">{record.displayName || record.name || record.property_name || record.requirement_name || record.deal_name || titleize(record.id)}</h2>
            <div className="mt-3">
              <CommercialStatusPill value={record.status} />
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <dl className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{field.label}</dt>
                <dd className="mt-1 text-sm font-semibold text-[#102236]">{field.render ? field.render(record) : record[field.key] || '-'}</dd>
              </div>
            ))}
          </dl>

          {showHeadsOfTerms ? (
            <div className="mt-4">
              <CommercialHeadsOfTermsPanel organisationId={organisationId} deal={record} />
            </div>
          ) : null}

          {documentsEntityType ? (
            <div className="mt-4">
              <CommercialDocumentLibrary
                organisationId={organisationId}
                entityType={documentsEntityType}
                entityId={record.id}
                compact
              />
            </div>
          ) : null}
        </div>

        <footer className="flex flex-wrap justify-end gap-3 border-t border-slate-200 p-5">
          <button type="button" onClick={onArchive} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100">
            Archive
          </button>
          <button type="button" onClick={onEdit} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
            Edit
          </button>
        </footer>
      </aside>
    </div>
  )
}

export default CommercialRecordDrawer
