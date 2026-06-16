import { Activity, ArrowLeft, CalendarClock, DoorOpen, FileText, Handshake, LayoutList, Radar, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialLandlordOnboardingAction from '../components/CommercialLandlordOnboardingAction'
import CommercialOnboardingSendAction from '../components/CommercialOnboardingSendAction'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import { buildCommercialCanvassingPath } from '../commercialCanvassingLinks'
import { buildCommercialDocumentGeneratorPath } from '../../../services/documents/commercialDocumentAdapterService'
import { useCommercialData } from '../hooks/useCommercialData'
import { buildRequirementVacancyMatches } from '../services/commercialIntelligenceApi'
import { getCommercialActivity, getCommercialLookupData } from '../services/commercialApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

const TABS = [
  { id: 'overview', label: 'Overview', icon: DoorOpen },
  { id: 'listings', label: 'Listings', icon: LayoutList },
  { id: 'viewings', label: 'Viewings', icon: CalendarClock },
  { id: 'deals', label: 'Deals', icon: Handshake },
  { id: 'transactions', label: 'Transactions', icon: Handshake },
  { id: 'activity', label: 'Activity', icon: Activity },
]

function daysBetween(startValue, endValue = new Date()) {
  const start = startValue ? new Date(startValue) : null
  const end = endValue ? new Date(endValue) : null
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000))
}

function resolvePropertyAssetCategory(propertyType = '') {
  const normalized = String(propertyType || '').toLowerCase()
  if (normalized.includes('industrial')) return 'industrial'
  if (normalized.includes('retail') || normalized.includes('centre') || normalized.includes('mall')) return 'retail'
  if (normalized.includes('agricultural') || normalized.includes('farm')) return 'agricultural'
  return 'office'
}

async function getVacancyWorkspaceData(organisationId, vacancyId) {
  const lookups = await getCommercialLookupData(organisationId)
  const vacancy = (lookups.vacancies || []).find((row) => row.id === vacancyId) || null
  const listings = (lookups.listings || []).filter((row) => row.vacancy_id === vacancyId)
  const viewings = (lookups.viewings || []).filter((row) => row.vacancy_id === vacancyId)
  const deals = (lookups.deals || []).filter((row) => row.vacancy_id === vacancyId)
  const transactions = (lookups.transactions || []).filter((row) => row.vacancy_id === vacancyId)
  const activityGroups = await Promise.all([
    getCommercialActivity({ organisationId, entityType: 'commercial_vacancy', entityId: vacancyId }),
    ...listings.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_listing', entityId: row.id })),
    ...transactions.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_transaction', entityId: row.id })),
  ])
  const activity = activityGroups.flat().filter(Boolean).sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
  return { vacancy, listings, viewings, deals, transactions, activity, lookups }
}

function DetailGrid({ rows = [] }) {
  return (
    <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
          <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</dt>
          <dd className="mt-1 text-sm font-semibold text-[#102236]">{value || '-'}</dd>
        </div>
      ))}
    </dl>
  )
}

function KpiCard({ label, value, detail }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  )
}

function LinkedList({ rows = [], empty, to, renderTitle, renderDetail, renderMeta }) {
  if (!rows.length) return <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{empty}</p>
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <Link key={row.id} to={typeof to === 'function' ? to(row) : to} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#102236]">{renderTitle(row)}</p>
              <p className="mt-1 truncate text-sm text-slate-500">{renderDetail(row)}</p>
            </div>
            {renderMeta ? <span className="shrink-0 text-xs font-semibold text-slate-400">{renderMeta(row)}</span> : null}
          </div>
        </Link>
      ))}
    </div>
  )
}

function ActivityList({ rows = [] }) {
  if (!rows.length) return <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No vacancy activity has been recorded yet.</p>
  return (
    <div className="grid gap-3">
      {rows.map((item) => (
        <article key={item.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
          <p className="text-sm font-semibold text-[#102236]">{item.title || titleize(item.activity_type)}</p>
          <p className="mt-1 text-sm text-slate-500">{item.body || '-'}</p>
          <p className="mt-2 text-xs font-semibold text-slate-400">{formatDate(item.created_at)}</p>
        </article>
      ))}
    </div>
  )
}

function MatchPanel({ matches = [] }) {
  return (
    <section className={CARD_CLASS}>
      <div className="flex items-start gap-3">
        <Sparkles size={18} className="mt-0.5 text-blue-600" />
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Matching Requirements</h2>
          <p className="mt-1 text-sm text-slate-500">Basic matching by property type, area, budget, and location.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {matches.length ? matches.map((match) => (
          <Link key={match.id} to="/commercial/requirements/pipeline" className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#102236]">{match.requirementName}</p>
                <p className="mt-1 truncate text-sm text-slate-500">{match.propertyName} · {match.area}</p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{match.matchPercentage}%</span>
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-500">{match.availableGla ? `${formatNumber(match.availableGla, 'm²')}` : '-'} · {match.rental ? formatCurrency(match.rental) : '-'} · {match.brokerName}</p>
          </Link>
        )) : (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No strong requirement matches are available yet.</p>
        )}
      </div>
    </section>
  )
}

function CommercialVacancyWorkspacePage() {
  const { vacancyId } = useParams()
  const [activeTab, setActiveTab] = useState('overview')
  const fetcher = useMemo(() => (organisationId) => getVacancyWorkspaceData(organisationId, vacancyId), [vacancyId])
  const { data, loading, error, organisationId } = useCommercialData(fetcher, [fetcher])
  const vacancy = data?.vacancy || null

  if (error) return <CommercialEmptyState title="Commercial vacancy could not be loaded" description={error} />
  if (loading) return <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
  if (!vacancy) return <CommercialEmptyState title="Vacancy not found" description="This commercial vacancy may have been archived or sits outside your current scope." />

  const property = (data?.lookups?.properties || []).find((row) => row.id === vacancy.property_id) || null
  const landlord = (data?.lookups?.landlords || []).find((row) => row.id === vacancy.landlord_id || row.id === property?.landlord_id) || null
  const activeDeals = (data?.deals || []).filter((row) => !['converted', 'lost'].includes(String(row.stage || '').toLowerCase()))
  const activeTransactions = (data?.transactions || []).filter((row) => !['completed', 'lost', 'cancelled'].includes(String(row.status || '').toLowerCase()))
  const completedViewings = (data?.viewings || []).filter((row) => String(row.status || '').toLowerCase() === 'completed')
  const daysVacant = daysBetween(vacancy.availability_date || vacancy.created_at)
  const viewingsToDeals = completedViewings.length ? Math.round((activeDeals.length / completedViewings.length) * 100) : 0
  const dealsToTransactions = activeDeals.length ? Math.round((activeTransactions.length / activeDeals.length) * 100) : 0
  const completedTransactions = (data?.transactions || []).filter((row) => String(row.status || '').toLowerCase() === 'completed').length
  const transactionsToCompleted = (data?.transactions || []).length ? Math.round((completedTransactions / (data?.transactions || []).length) * 100) : 0
  const canvassingPath = buildCommercialCanvassingPath({
    companyName: property?.property_name || vacancy.vacancy_name,
    area: [property?.suburb, property?.city].filter(Boolean).join(', ') || property?.address || vacancy.vacancy_name,
    propertyType: property?.property_type,
    propertyId: property?.id,
    vacancyId: vacancy.id,
    linkedEntityType: 'commercial_vacancy',
    linkedEntityId: vacancy.id,
    followUpNote: `Follow up from ${vacancy.vacancy_name}`,
  })
  const matches = buildRequirementVacancyMatches({
    requirements: data?.lookups?.requirements || [],
    vacancies: [vacancy],
    properties: data?.lookups?.properties || [],
    listings: data?.lookups?.listings || [],
    brokers: data?.lookups?.brokers || [],
    limit: 5,
  })
  const overviewRows = [
    ['Unit Number', vacancy.unit_or_floor || vacancy.vacancy_name],
    ['Floor / Suite', vacancy.unit_or_floor || '-'],
    ['Available Area', formatNumber(vacancy.available_area_m2, 'm²')],
    ['Rental', formatCurrency(vacancy.asking_rental)],
    ['Availability Date', formatDate(vacancy.availability_date)],
    ['Status', titleize(vacancy.status)],
    ['Broker', vacancy.broker_assignment || vacancy.broker_id || 'Unassigned'],
    ['Property', property?.property_name || 'Property pending'],
  ]

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <Link to="/commercial/vacancies" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[#102236]">
          <ArrowLeft size={16} />
          Vacancies
        </Link>
        <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CommercialStatusPill value={vacancy.status} />
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{property?.property_name || 'Property pending'}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-[#102236]">{vacancy.vacancy_name}</h1>
            <p className="mt-2 text-sm text-slate-500">{property?.property_name || 'Property pending'} · {vacancy.unit_or_floor || 'Unit pending'}</p>
          </div>
          <div className="grid gap-3">
            <Link
              to={buildCommercialDocumentGeneratorPath({
                packetType: 'commercial_lease',
                assetCategory: resolvePropertyAssetCategory(property?.property_type),
                propertyId: property?.id || '',
                vacancyId: vacancy.id,
                landlordId: property?.landlord_id || '',
              })}
              className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#102236] transition hover:bg-slate-50"
            >
              <FileText size={16} />
              Generate document
            </Link>
            <CommercialLandlordOnboardingAction
              organisationId={organisationId}
              landlord={landlord}
            />
            <CommercialOnboardingSendAction
              organisationId={organisationId}
              kind="vacancy"
              record={vacancy}
              lookups={data?.lookups || {}}
              label="Send Tenant Onboarding"
            />
            <Link to={canvassingPath} className="inline-flex w-fit items-center gap-2 rounded-2xl bg-[#102b46] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
              <Radar size={16} />
              Canvass follow-up
            </Link>
          </div>
        </div>
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition ${activeTab === tab.id ? 'bg-[#102b46] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <section className="grid gap-5">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Viewings" value={formatNumber((data?.viewings || []).length)} detail={`${formatNumber(completedViewings.length)} completed`} />
            <KpiCard label="Deals" value={formatNumber((data?.deals || []).length)} detail={`${formatNumber(activeDeals.length)} active negotiations`} />
            <KpiCard label="Transactions" value={formatNumber((data?.transactions || []).length)} detail={`${formatNumber(activeTransactions.length)} still open`} />
            <KpiCard label="Days Vacant" value={daysVacant !== null ? formatNumber(daysVacant) : '-'} detail="Measured from availability date." />
          </section>

          <section className={CARD_CLASS}>
            <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Overview</h2>
            <div className="mt-4">
              <DetailGrid rows={overviewRows} />
            </div>
          </section>

          <section className={CARD_CLASS}>
            <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Vacancy Health</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Days On Market" value={daysVacant !== null ? `${formatNumber(daysVacant)} days` : '-'} detail="Availability age." />
              <KpiCard label="Viewings -> Deals" value={`${formatNumber(viewingsToDeals)}%`} detail="Completed viewings converting to deals." />
              <KpiCard label="Deals -> Transactions" value={`${formatNumber(dealsToTransactions)}%`} detail="Deals progressing into execution." />
              <KpiCard label="Transactions -> Completed" value={`${formatNumber(transactionsToCompleted)}%`} detail="Transaction completion rate." />
            </div>
          </section>

          <MatchPanel matches={matches} />
        </section>
      ) : null}

      {activeTab === 'listings' ? (
        <section className={CARD_CLASS}>
          <LinkedList
            rows={data?.listings || []}
            empty="No listings linked to this vacancy yet."
            to={(row) => `/commercial/listings/${row.id}`}
            renderTitle={(row) => row.title || 'Commercial listing'}
            renderDetail={(row) => [titleize(row.listing_status), titleize(row.listing_category), formatCurrency(row.pricing)].filter(Boolean).join(' · ')}
            renderMeta={(row) => formatDate(row.updated_at || row.created_at)}
          />
        </section>
      ) : null}

      {activeTab === 'viewings' ? (
        <section className={CARD_CLASS}>
          <LinkedList
            rows={data?.viewings || []}
            empty="No viewings linked to this vacancy yet."
            to="/commercial/viewings"
            renderTitle={(row) => `${formatDate(row.viewing_date)} · ${String(row.viewing_time || '').slice(0, 5) || '-'}`}
            renderDetail={(row) => [titleize(row.status), row.feedback || row.notes || 'No feedback yet'].filter(Boolean).join(' · ')}
            renderMeta={(row) => row.company_id || row.contact_id || ''}
          />
        </section>
      ) : null}

      {activeTab === 'deals' ? (
        <section className={CARD_CLASS}>
          <LinkedList
            rows={data?.deals || []}
            empty="No deals linked to this vacancy yet."
            to="/commercial/deals"
            renderTitle={(row) => row.deal_name || 'Commercial deal'}
            renderDetail={(row) => [titleize(row.deal_type), titleize(row.stage), formatCurrency(row.deal_value)].filter(Boolean).join(' · ')}
            renderMeta={(row) => formatDate(row.expected_close_date)}
          />
        </section>
      ) : null}

      {activeTab === 'transactions' ? (
        <section className={CARD_CLASS}>
          <LinkedList
            rows={data?.transactions || []}
            empty="No transactions linked to this vacancy yet."
            to={(row) => `/commercial/transactions/${row.id}`}
            renderTitle={(row) => row.transaction_name || row.title || 'Commercial transaction'}
            renderDetail={(row) => [titleize(row.transaction_type), titleize(row.status), formatCurrency(row.target_value || row.value)].filter(Boolean).join(' · ')}
            renderMeta={(row) => formatDate(row.expected_close_date || row.expectedCloseDate)}
          />
        </section>
      ) : null}

      {activeTab === 'activity' ? (
        <section className={CARD_CLASS}>
          <ActivityList rows={data?.activity || []} />
        </section>
      ) : null}
    </div>
  )
}

export default CommercialVacancyWorkspacePage
