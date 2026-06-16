import { ArrowRight, BriefcaseBusiness, CalendarClock, UserRound, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import CommercialDocumentLibrary from './CommercialDocumentLibrary'
import CommercialHeadsOfTermsPanel from './CommercialHeadsOfTermsPanel'
import CommercialStatusPill from './CommercialStatusPill'
import { formatDate } from '../commercialFormatters'
import {
  buildCommercialSummaryCards,
  getCommercialBroker,
  getCommercialNextAction,
  getCommercialRecordTitle,
  getCommercialUpdatedDate,
} from '../commercialPresentation'
import { buildRequirementVacancyMatches, buildVacancyRiskSummary } from '../services/commercialIntelligenceApi'

function MatchMiniCard({ match, mode }) {
  const title = mode === 'requirements' ? match.requirementName : match.vacancyName
  return (
    <article className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#102236]">{title}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{match.propertyName} · {match.area}</p>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{match.matchPercentage}%</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{match.availableGla ? `${new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(match.availableGla)} m²` : '-'}</span>
        <span>{match.rental ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(match.rental) : '-'}</span>
        <span>{match.brokerName}</span>
        <Link to="/commercial/deals/leasing" className="font-semibold text-blue-600">Create Deal</Link>
      </div>
    </article>
  )
}

function MatchingPanel({ kind, record, rawLookups = {} }) {
  const requirements = kind === 'requirements' ? [record] : (rawLookups.requirements || [])
  const vacancies = kind === 'vacancies' ? [record] : (rawLookups.vacancies || [])
  if (!['requirements', 'vacancies'].includes(kind)) return null

  const matches = buildRequirementVacancyMatches({
    requirements,
    vacancies,
    properties: rawLookups.properties || [],
    listings: rawLookups.listings || [],
    brokers: rawLookups.brokers || [],
    limit: 5,
  })
  const title = kind === 'requirements' ? 'Suggested Vacancies' : 'Matching Requirements'

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold tracking-[-0.02em] text-[#102236]">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">Simple weighted fit using area, type, GLA, budget, and availability.</p>
      </div>
      <div className="mt-4 grid gap-3">
        {matches.length ? matches.map((match) => (
          <MatchMiniCard key={match.id} match={match} mode={kind === 'vacancies' ? 'requirements' : 'vacancies'} />
        )) : (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No scored matches available yet.</p>
        )}
      </div>
    </section>
  )
}

function RiskPanel({ kind, record, rawLookups = {} }) {
  if (!['properties', 'landlords'].includes(kind)) return null
  const leases = (rawLookups.leases || []).filter((lease) => {
    if (kind === 'properties') return lease.property_id === record.id
    return lease.landlord_id === record.id || (rawLookups.properties || []).some((property) => property.id === lease.property_id && property.landlord_id === record.id)
  })
  const risk = buildVacancyRiskSummary({
    leases,
    properties: rawLookups.properties || [],
    tenants: rawLookups.tenants || [],
    landlords: rawLookups.landlords || [],
  })

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold tracking-[-0.02em] text-[#102236]">Vacancy Risk Watch</h3>
        <p className="mt-1 text-sm text-slate-500">Lease expiry exposure inside the next 180 days.</p>
      </div>
      <div className="mt-4 grid gap-3">
        {risk.records.length ? risk.records.slice(0, 5).map((item) => (
          <article key={item.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#102236]">{item.propertyName}</p>
                <p className="mt-1 text-xs text-slate-500">{item.tenantName} · expires {item.leaseEndDate || '-'}</p>
              </div>
              <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">{item.riskLevel}</span>
            </div>
          </article>
        )) : (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No lease expiry exposure inside 180 days.</p>
        )}
      </div>
    </section>
  )
}

function ViewingsPanel({ kind, record, rawLookups = {} }) {
  if (!['vacancies', 'properties'].includes(kind)) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const companiesById = new Map((rawLookups.companies || []).map((company) => [company.id, company]))
  const tenantsById = new Map((rawLookups.tenants || []).map((tenant) => [tenant.id, tenant]))
  const propertiesById = new Map((rawLookups.properties || []).map((property) => [property.id, property]))
  const rows = (rawLookups.viewings || []).filter((viewing) => {
    if (kind === 'vacancies') return viewing.vacancy_id === record.id
    return viewing.property_id === record.id
  }).sort((left, right) => {
    const leftDate = left.viewing_date ? new Date(`${left.viewing_date}T${String(left.viewing_time || '00:00').slice(0, 8)}`) : null
    const rightDate = right.viewing_date ? new Date(`${right.viewing_date}T${String(right.viewing_time || '00:00').slice(0, 8)}`) : null
    return (leftDate?.getTime() || 0) - (rightDate?.getTime() || 0)
  })
  const upcoming = rows.filter((row) => {
    const date = row.viewing_date ? new Date(`${row.viewing_date}T${String(row.viewing_time || '00:00').slice(0, 8)}`) : null
    return !['completed', 'cancelled', 'no_show'].includes(String(row.status || '').toLowerCase()) && (!date || date >= now)
  })
  const past = rows.filter((row) => !upcoming.some((item) => item.id === row.id))

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.02em] text-[#102236]">Viewing Activity</h3>
          <p className="mt-1 text-sm text-slate-500">Upcoming and historic inspections linked to this {kind === 'vacancies' ? 'vacancy' : 'property'}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/commercial/viewings"
            state={{
              openCommercialViewing: true,
              viewingDraft: {
                property_id: kind === 'properties' ? record.id : record.property_id || '',
                vacancy_id: kind === 'vacancies' ? record.id : '',
                broker_id: record.broker_id || record.broker_assignment || '',
              },
            }}
            className="inline-flex min-h-9 items-center justify-center rounded-xl bg-[#102b46] px-3 text-xs font-semibold text-white transition hover:bg-[#163a5b]"
          >
            Schedule Viewing
          </Link>
          <Link to="/commercial/viewings" className="inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-[#102236] transition hover:bg-slate-50">Viewings</Link>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ['Upcoming', upcoming.length],
          ['Past', past.length],
          ['Total', rows.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-[#fbfcfe] px-3 py-2">
            <strong className="block text-base text-[#102236]">{value}</strong>
            <span className="text-xs font-semibold text-slate-500">{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-2">
        {upcoming.slice(0, 3).map((viewing) => (
          <article key={viewing.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3">
            <p className="text-sm font-semibold text-[#102236]">{formatDate(viewing.viewing_date)} · {String(viewing.viewing_time || '').slice(0, 5) || '-'}</p>
            <p className="mt-1 text-xs text-slate-500">{companiesById.get(viewing.company_id)?.company_name || companiesById.get(viewing.company_id)?.name || tenantsById.get(viewing.company_id)?.name || 'Company pending'} · {propertiesById.get(viewing.property_id)?.property_name || 'Property pending'}</p>
          </article>
        ))}
        {!upcoming.length ? <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No upcoming viewings linked yet.</p> : null}
      </div>
    </section>
  )
}

function TransactionsPanel({ kind, record, rawLookups = {}, onCreateTransaction }) {
  if (!['deals', 'vacancies', 'properties'].includes(kind)) return null
  const entityLabel = kind === 'properties' ? 'property' : kind === 'vacancies' ? 'vacancy' : 'deal'
  const rows = (rawLookups.transactions || []).filter((transaction) => {
    if (kind === 'deals') return transaction.deal_id === record.id
    if (kind === 'vacancies') return transaction.vacancy_id === record.id
    return transaction.property_id === record.id
  })
  const active = rows.filter((row) => !['completed', 'lost', 'cancelled'].includes(String(row.status || '').toLowerCase()))
  const completed = rows.filter((row) => String(row.status || '').toLowerCase() === 'completed')

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.02em] text-[#102236]">Transactions</h3>
          <p className="mt-1 text-sm text-slate-500">Persisted commercial transactions linked to this {entityLabel} record.</p>
        </div>
        {['deals', 'vacancies'].includes(kind) ? (
          <button
            type="button"
            onClick={() => onCreateTransaction?.(record)}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-[#102b46] px-3 text-xs font-semibold text-white transition hover:bg-[#163a5b]"
          >
            <BriefcaseBusiness size={14} />
            Create Transaction
          </button>
        ) : null}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Current</p>
          <div className="mt-2 grid gap-2">
            {active.length ? active.map((transaction) => (
              <Link key={transaction.id} to={`/commercial/transactions/${transaction.id}`} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3 transition hover:border-blue-200 hover:bg-white">
                <p className="text-sm font-semibold text-[#102236]">{transaction.transaction_name || transaction.transactionName || 'Commercial transaction'}</p>
                <p className="mt-1 text-xs text-slate-500">{transaction.status} · {transaction.transaction_type || '-'}</p>
              </Link>
            )) : (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No active transactions linked yet.</p>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Historical</p>
          <div className="mt-2 grid gap-2">
            {completed.length ? completed.map((transaction) => (
              <Link key={transaction.id} to={`/commercial/transactions/${transaction.id}`} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-3 transition hover:border-blue-200 hover:bg-white">
                <p className="text-sm font-semibold text-[#102236]">{transaction.transaction_name || transaction.transactionName || 'Commercial transaction'}</p>
                <p className="mt-1 text-xs text-slate-500">Completed {formatDate(transaction.actual_close_date || transaction.actualCloseDate)}</p>
              </Link>
            )) : (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No historical transactions yet.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function CommercialRecordDrawer({
  open,
  record,
  kind = '',
  title,
  fields = [],
  lookups = {},
  rawLookups = {},
  documentsEntityType = '',
  showHeadsOfTerms = false,
  organisationId = '',
  primaryActionLabel = '',
  onPrimaryAction,
  secondaryActionLabel = '',
  onSecondaryAction,
  onClose,
  onEdit,
  onArchive,
  onCreateTransaction,
}) {
  if (!open || !record) return null

  const recordTitle = getCommercialRecordTitle(kind, record)
  const nextAction = getCommercialNextAction(kind, record)
  const summaryCards = buildCommercialSummaryCards(kind, record, lookups)
  const owner = getCommercialBroker(record)
  const updatedAt = getCommercialUpdatedDate(record)
  const resolvedPrimaryActionLabel = typeof primaryActionLabel === 'function' ? primaryActionLabel(record) : primaryActionLabel

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-sm">
      <aside className="flex h-full w-full max-w-3xl flex-col bg-white shadow-[-24px_0_60px_rgba(15,23,42,0.18)]">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-[#102236]">{recordTitle}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CommercialStatusPill value={record.status} />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <UserRound size={13} />
                {owner}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                <CalendarClock size={13} />
                Updated {updatedAt}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Next Action</p>
                <p className="mt-1 text-base font-semibold text-[#102236]">{nextAction}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {secondaryActionLabel && onSecondaryAction ? (
                  <button type="button" onClick={() => onSecondaryAction(record)} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] shadow-sm transition hover:bg-slate-50">
                    {secondaryActionLabel}
                    <ArrowRight size={15} />
                  </button>
                ) : null}
                {resolvedPrimaryActionLabel && onPrimaryAction ? (
                  <button type="button" onClick={() => onPrimaryAction(record)} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#163a5b]">
                    {resolvedPrimaryActionLabel}
                    <ArrowRight size={15} />
                  </button>
                ) : null}
                <button type="button" onClick={onEdit} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-[#1267a3] shadow-sm transition hover:bg-blue-50">
                  Update Record
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </section>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {summaryCards.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</dt>
                <dd className="mt-1 text-sm font-semibold text-[#102236]">{value || '-'}</dd>
              </div>
            ))}
          </dl>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <h3 className="text-sm font-semibold tracking-[-0.02em] text-[#102236]">Overview</h3>
              <p className="mt-1 text-sm text-slate-500">Broker-facing record details and linked commercial context.</p>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{field.label}</dt>
                <dd className="mt-1 text-sm font-semibold text-[#102236]">{field.render ? field.render(record) : record[field.key] || '-'}</dd>
              </div>
            ))}
            </dl>
          </section>

          <MatchingPanel kind={kind} record={record} rawLookups={rawLookups} />
          <RiskPanel kind={kind} record={record} rawLookups={rawLookups} />
          <ViewingsPanel kind={kind} record={record} rawLookups={rawLookups} />
          <TransactionsPanel kind={kind} record={record} rawLookups={rawLookups} onCreateTransaction={onCreateTransaction} />

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
          {secondaryActionLabel && onSecondaryAction ? (
            <button type="button" onClick={() => onSecondaryAction(record)} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
              {secondaryActionLabel}
            </button>
          ) : null}
          <button type="button" onClick={onEdit} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#102236] transition hover:bg-slate-50">
            Edit
          </button>
        </footer>
      </aside>
    </div>
  )
}

export default CommercialRecordDrawer
