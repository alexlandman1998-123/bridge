import { FileText, X } from 'lucide-react'
import { useState } from 'react'
import { formatCommercialDate, labelFromValue, lookupLabel } from '../commercialPipelineHelpers'
import { formatCurrency, formatNumber } from '../commercialFormatters'
import { getCommercialNextAction } from '../commercialPresentation'
import CommercialDocumentLibrary from './CommercialDocumentLibrary'
import CommercialHeadsOfTermsPanel from './CommercialHeadsOfTermsPanel'
import CommercialStatusPill from './CommercialStatusPill'

function DetailBlock({ title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
      <h3 className="text-sm font-semibold tracking-[-0.02em] text-[#102236]">{title}</h3>
      <div className="mt-3 grid gap-3 text-sm">{children}</div>
    </section>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[62%] text-right font-semibold text-[#102236]">{value || '-'}</span>
    </div>
  )
}

function ActivityFeed({ activity = [], loading = false }) {
  if (loading) return <p className="text-sm font-semibold text-slate-500">Loading activity...</p>
  if (!activity.length) return <p className="text-sm text-slate-500">No commercial activity recorded yet.</p>

  return (
    <div className="grid gap-3">
      {activity.map((item) => (
        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-[#102236]">{item.title || labelFromValue(item.activity_type)}</p>
          {item.body ? <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p> : null}
          <p className="mt-2 text-xs font-semibold text-slate-400">{formatCommercialDate(item.created_at)}</p>
        </div>
      ))}
    </div>
  )
}

function CommercialDealDetailDrawer({
  open,
  record,
  organisationId = '',
  lookups = {},
  activity = [],
  activityLoading = false,
  noteError = '',
  onClose,
  onAddNote,
  onActivityChange,
}) {
  const [note, setNote] = useState('')

  if (!open || !record) return null

  async function handleAddNote(event) {
    event.preventDefault()
    const text = note.trim()
    if (!text) return
    await onAddNote?.(text)
    setNote('')
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-sm">
      <aside className="flex h-full w-full max-w-3xl flex-col bg-white shadow-[-24px_0_60px_rgba(15,23,42,0.18)]">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Deal detail</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-[#102236]">{record.deal_name || 'Commercial deal'}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <CommercialStatusPill value={record.status} />
              <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{labelFromValue(record.stage)}</span>
              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{labelFromValue(record.deal_type)}</span>
              <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Next: {getCommercialNextAction('deals', record)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailBlock title="Deal Summary">
              <DetailRow label="Deal type" value={labelFromValue(record.deal_type)} />
              <DetailRow label="Stage" value={labelFromValue(record.stage)} />
              <DetailRow label="Probability" value={record.probability_percentage ? `${formatNumber(record.probability_percentage)}%` : '-'} />
              <DetailRow label="Expected close" value={formatCommercialDate(record.expected_close_date)} />
              <DetailRow label="Next action" value={getCommercialNextAction('deals', record)} />
            </DetailBlock>

            <DetailBlock title="Parties">
              <DetailRow label="Tenant/client" value={lookupLabel(lookups, 'tenants', record.tenant_id)} />
              <DetailRow label="Landlord/seller" value={lookupLabel(lookups, 'landlords', record.landlord_id)} />
              <DetailRow label="Property" value={lookupLabel(lookups, 'properties', record.property_id)} />
              <DetailRow label="Vacancy / unit" value={lookupLabel(lookups, 'vacancies', record.vacancy_id)} />
              <DetailRow label="Assigned broker" value={record.assigned_broker || 'Unassigned'} />
            </DetailBlock>

            <DetailBlock title="Commercial Value">
              <DetailRow label="Deal value" value={formatCurrency(record.deal_value)} />
              <DetailRow label="Estimated commission" value={formatCurrency(record.estimated_commission)} />
              <DetailRow label="Status" value={labelFromValue(record.status)} />
            </DetailBlock>

            <DetailBlock title={record.deal_type === 'sale' ? 'Sales Awareness' : 'Leasing Awareness'}>
              {record.deal_type === 'sale' ? (
                <>
                  <DetailRow label="Broker focus" value="Confirm offer, due diligence, and closing conditions" />
                  <DetailRow label="Next action" value={getCommercialNextAction('deals', record)} />
                </>
              ) : (
                <>
                  <DetailRow label="Broker focus" value="Heads of Terms, lease draft, fit-out, occupation" />
                  <DetailRow label="Next action" value={getCommercialNextAction('deals', record)} />
                </>
              )}
            </DetailBlock>
          </div>

          <div className="mt-4">
            <CommercialHeadsOfTermsPanel
              organisationId={organisationId}
              deal={record}
              onActivityChange={onActivityChange}
            />
          </div>

          <div className="mt-4">
            <CommercialDocumentLibrary
              organisationId={organisationId}
              entityType="commercial_deal"
              entityId={record.id}
              onActivityChange={onActivityChange}
            />
          </div>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <h3 className="text-sm font-semibold tracking-[-0.02em] text-[#102236]">Activity / Notes</h3>
            <p className="mt-1 text-sm text-slate-500">Commercial-only updates for this deal.</p>

            <form onSubmit={handleAddNote} className="mt-4 grid gap-3">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Add a commercial deal note..."
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
              />
              {noteError ? <p className="text-sm font-semibold text-rose-600">{noteError}</p> : null}
              <button type="submit" className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
                <FileText size={16} />
                Add note
              </button>
            </form>

            <div className="mt-4">
              <ActivityFeed activity={activity} loading={activityLoading} />
            </div>
          </section>
        </div>
      </aside>
    </div>
  )
}

export default CommercialDealDetailDrawer
