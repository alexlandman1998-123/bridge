import { ArrowRight, BriefcaseBusiness, CheckCircle2, FileText, Plus, X, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatBudgetRange, formatCommercialDate, formatCommercialList, formatSizeRange, labelFromValue, lookupLabel } from '../commercialPipelineHelpers'
import { getCommercialNextAction } from '../commercialPresentation'
import { buildRequirementVacancyMatches } from '../services/commercialIntelligenceApi'
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

function viewingDateValue(row = {}) {
  const date = row.viewing_date ? new Date(`${row.viewing_date}T${String(row.viewing_time || '00:00').slice(0, 8)}`) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function RequirementViewingsPanel({ viewings = [], lookups = {}, onScheduleViewing, onViewingStatusChange }) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const sorted = viewings.slice().sort((left, right) => (viewingDateValue(left)?.getTime() || 0) - (viewingDateValue(right)?.getTime() || 0))
  const upcoming = sorted.filter((row) => !['completed', 'cancelled', 'no_show'].includes(String(row.status || '').toLowerCase()) && (!viewingDateValue(row) || viewingDateValue(row) >= now))

  return (
    <DetailBlock title="Upcoming Viewings">
      <div className="flex justify-end">
        <button type="button" onClick={() => onScheduleViewing?.()} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-[#102b46] px-3 text-xs font-semibold text-white transition hover:bg-[#163a5b]">
          <Plus size={14} />
          Schedule Viewing
        </button>
      </div>
      {upcoming.length ? upcoming.map((viewing) => (
        <div key={viewing.id} className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#102236]">{formatCommercialDate(viewing.viewing_date)} · {String(viewing.viewing_time || '').slice(0, 5) || '-'}</p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {lookupLabel(lookups, 'properties', viewing.property_id, 'Property pending')} · {lookupLabel(lookups, 'vacancies', viewing.vacancy_id, 'Vacancy pending')}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{labelFromValue(viewing.status)}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => onViewingStatusChange?.(viewing, 'completed')} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100">
              <CheckCircle2 size={13} />
              Mark Complete
            </button>
            <button type="button" onClick={() => onViewingStatusChange?.(viewing, 'cancelled')} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
              <XCircle size={13} />
              Cancel
            </button>
          </div>
        </div>
      )) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
          No upcoming viewings scheduled for this requirement.
        </div>
      )}
    </DetailBlock>
  )
}

function RequirementTransactionsPanel({ transactions = [], onCreateTransaction }) {
  const activeTransactions = transactions.filter((row) => !['completed', 'lost', 'cancelled'].includes(String(row.status || '').toLowerCase()))
  const completedTransactions = transactions.filter((row) => String(row.status || '').toLowerCase() === 'completed')

  return (
    <DetailBlock title="Transactions">
      <div className="flex justify-end">
        <button type="button" onClick={() => onCreateTransaction?.()} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-[#102b46] px-3 text-xs font-semibold text-white transition hover:bg-[#163a5b]">
          <BriefcaseBusiness size={14} />
          Create Transaction
        </button>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Active Transactions</p>
          <div className="mt-2 grid gap-2">
            {activeTransactions.length ? activeTransactions.map((transaction) => (
              <Link key={transaction.id} to={`/commercial/transactions/${transaction.id}`} className="rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-blue-200 hover:bg-slate-50">
                <p className="text-sm font-semibold text-[#102236]">{transaction.transaction_name || transaction.transactionName || transaction.title || 'Commercial transaction'}</p>
                <p className="mt-1 text-xs text-slate-500">{labelFromValue(transaction.status)} · {labelFromValue(transaction.transaction_type || transaction.transactionType)}</p>
              </Link>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                No active transactions linked yet.
              </div>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Completed Transactions</p>
          <div className="mt-2 grid gap-2">
            {completedTransactions.length ? completedTransactions.map((transaction) => (
              <Link key={transaction.id} to={`/commercial/transactions/${transaction.id}`} className="rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-blue-200 hover:bg-slate-50">
                <p className="text-sm font-semibold text-[#102236]">{transaction.transaction_name || transaction.transactionName || transaction.title || 'Commercial transaction'}</p>
                <p className="mt-1 text-xs text-slate-500">{labelFromValue(transaction.status)} · Closed {formatCommercialDate(transaction.actual_close_date || transaction.actualCloseDate)}</p>
              </Link>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                No completed transactions yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </DetailBlock>
  )
}

function CommercialRequirementDetailDrawer({
  open,
  record,
  organisationId = '',
  lookups = {},
  relatedDeals = [],
  relatedViewings = [],
  relatedTransactions = [],
  activity = [],
  activityLoading = false,
  noteError = '',
  onClose,
  onCreateDeal,
  onCreateTransaction,
  onScheduleViewing,
  onViewingStatusChange,
  onAddNote,
  onActivityChange,
}) {
  const [note, setNote] = useState('')

  if (!open || !record) return null
  const suggestedVacancies = buildRequirementVacancyMatches({
    requirements: [record],
    vacancies: lookups.vacancies || [],
    properties: lookups.properties || [],
    listings: lookups.listings || [],
    brokers: lookups.brokers || [],
    limit: 5,
  })

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
              <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Next: {getCommercialNextAction('requirements', record)}</span>
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
              <DetailRow label="Next action" value={getCommercialNextAction('requirements', record)} />
              <DetailRow label="Last updated" value={formatCommercialDate(record.updated_at)} />
            </DetailBlock>

            <DetailBlock title="Company / Contact">
              <DetailRow label="Company" value={lookupLabel(lookups, 'companies', record.company_id, lookupLabel(lookups, 'tenants', record.tenant_id, labelFromValue(record.client_type)))} />
              <DetailRow label="Contact" value={lookupLabel(lookups, 'contacts', record.contact_id, '-')} />
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

            <DetailBlock title="Potential Matches">
              {suggestedVacancies.length ? suggestedVacancies.map((match) => (
                <div key={match.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#102236]">{match.vacancyName}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{match.propertyName} · {match.area}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{match.matchPercentage}% Match</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{match.availableGla ? `${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(match.availableGla)} m²` : '-'}</span>
                    <span>{match.rental ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(match.rental) : '-'}</span>
                    <span>{match.brokerName}</span>
                    <button type="button" onClick={() => onScheduleViewing?.({ vacancy_id: match.vacancyId })} className="font-semibold text-blue-600">Schedule Viewing</button>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                  No suggested vacancies available yet.
                </div>
              )}
            </DetailBlock>

            <RequirementViewingsPanel
              viewings={relatedViewings}
              lookups={lookups}
              onScheduleViewing={onScheduleViewing}
              onViewingStatusChange={onViewingStatusChange}
            />

            <RequirementTransactionsPanel
              transactions={relatedTransactions}
              onCreateTransaction={onCreateTransaction}
            />

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
