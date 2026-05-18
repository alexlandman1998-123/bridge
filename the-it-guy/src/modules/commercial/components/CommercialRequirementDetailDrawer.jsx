import { ArrowRight, FileText, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { formatBudgetRange, formatCommercialDate, formatCommercialList, formatSizeRange, labelFromValue, lookupLabel } from '../commercialPipelineHelpers'
import CommercialDocumentLibrary from './CommercialDocumentLibrary'
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

function CommercialRequirementDetailDrawer({
  open,
  record,
  organisationId = '',
  lookups = {},
  relatedDeals = [],
  activity = [],
  activityLoading = false,
  noteError = '',
  onClose,
  onCreateDeal,
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
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Requirement detail</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-[#102236]">{record.requirement_name || 'Commercial requirement'}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <CommercialStatusPill value={record.status} />
              <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{labelFromValue(record.stage)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 xl:grid-cols-2">
            <DetailBlock title="Requirement Summary">
              <DetailRow label="Type" value={labelFromValue(record.requirement_type)} />
              <DetailRow label="Client type" value={labelFromValue(record.client_type)} />
              <DetailRow label="Assigned broker" value={record.assigned_broker || 'Unassigned'} />
              <DetailRow label="Last updated" value={formatCommercialDate(record.updated_at)} />
            </DetailBlock>

            <DetailBlock title="Client / Tenant Details">
              <DetailRow label="Tenant/client" value={lookupLabel(lookups, 'tenants', record.tenant_id, labelFromValue(record.client_type))} />
              <DetailRow label="Current stage" value={labelFromValue(record.stage)} />
              <DetailRow label="Status" value={labelFromValue(record.status)} />
            </DetailBlock>

            <DetailBlock title="Property Criteria">
              <DetailRow label="Property type" value={labelFromValue(record.property_type)} />
              <DetailRow label="Size range" value={formatSizeRange(record)} />
              <DetailRow label="Locations" value={formatCommercialList(record.preferred_locations)} />
              <DetailRow label="Special requirements" value={record.special_requirements || '-'} />
            </DetailBlock>

            <DetailBlock title="Budget & Timing">
              <DetailRow label="Budget" value={formatBudgetRange(record)} />
              <DetailRow label="Target occupation" value={formatCommercialDate(record.target_occupation_date)} />
              <DetailRow label="Lease term" value={record.lease_term_months ? `${record.lease_term_months} months` : '-'} />
            </DetailBlock>

            <DetailBlock title="Shortlisted Properties">
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                Property shortlisting relationships will appear here once matching is connected.
              </div>
            </DetailBlock>

            <DetailBlock title="Related Deals">
              {relatedDeals.length ? relatedDeals.map((deal) => (
                <div key={deal.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <div>
                    <p className="text-sm font-semibold text-[#102236]">{deal.deal_name}</p>
                    <p className="text-xs text-slate-500">{labelFromValue(deal.stage)} · {labelFromValue(deal.deal_type)}</p>
                  </div>
                  <ArrowRight size={16} className="text-slate-400" />
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                  No related deals yet.
                </div>
              )}
            </DetailBlock>
          </div>

          <div className="mt-4">
            <CommercialDocumentLibrary
              organisationId={organisationId}
              entityType="commercial_requirement"
              entityId={record.id}
              onActivityChange={onActivityChange}
            />
          </div>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold tracking-[-0.02em] text-[#102236]">Activity / Notes</h3>
                <p className="mt-1 text-sm text-slate-500">Commercial-only updates for this requirement.</p>
              </div>
              <button
                type="button"
                onClick={onCreateDeal}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b]"
              >
                <Plus size={16} />
                Create Deal from Requirement
              </button>
            </div>

            <form onSubmit={handleAddNote} className="mt-4 grid gap-3">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Add a commercial note..."
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

export default CommercialRequirementDetailDrawer
