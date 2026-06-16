import { ArrowLeft, BriefcaseBusiness, CalendarClock, FileText, Search, ShieldCheck, Users } from 'lucide-react'
import { createElement, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AppointmentDashboardSection from '../../../components/appointments/dashboard/AppointmentDashboardSection'
import { formatCurrency, formatDate, titleize } from '../commercialFormatters'
import CommercialDocumentLibrary from '../components/CommercialDocumentLibrary'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialLandlordOnboardingAction from '../components/CommercialLandlordOnboardingAction'
import CommercialOnboardingSendAction from '../components/CommercialOnboardingSendAction'
import CommercialStatusPill from '../components/CommercialStatusPill'
import CommercialPortalControlsPanel from '../components/CommercialPortalControlsPanel'
import { useCommercialData } from '../hooks/useCommercialData'
import { buildCommercialDocumentGeneratorPath } from '../../../services/documents/commercialDocumentAdapterService'
import { updateCommercialTransactionStatus } from '../services/commercialApi'
import { getCommercialTransactionWorkspaceData, searchCommercialIndex } from '../services/commercialPlatformApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

const TABS = [
  { id: 'overview', label: 'Overview', icon: BriefcaseBusiness },
  { id: 'parties', label: 'Parties', icon: Users },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'portal', label: 'Portal', icon: ShieldCheck },
  { id: 'activity', label: 'Activity', icon: CalendarClock },
  { id: 'timeline', label: 'Timeline', icon: CalendarClock },
]

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

function EmptyPanel({ title, description }) {
  return <CommercialEmptyState title={title} description={description} />
}

function transactionStatusOptions(transaction = {}) {
  const type = String(transaction.transactionType || transaction.transaction_type || '').toLowerCase()
  if (type === 'sale') {
    return ['draft', 'negotiating', 'hot_in_progress', 'hot_signed', 'sale_pending', 'completed', 'lost', 'cancelled']
  }
  return ['draft', 'negotiating', 'hot_in_progress', 'hot_signed', 'lease_pending', 'completed', 'lost', 'cancelled']
}

function resolvePropertyAssetCategory(propertyType = '') {
  const normalized = String(propertyType || '').toLowerCase()
  if (normalized.includes('industrial')) return 'industrial'
  if (normalized.includes('retail') || normalized.includes('centre') || normalized.includes('mall')) return 'retail'
  if (normalized.includes('agricultural') || normalized.includes('farm')) return 'agricultural'
  return 'office'
}

function ActivityList({ rows = [], emptyTitle, emptyDescription }) {
  if (!rows.length) return <EmptyPanel title={emptyTitle} description={emptyDescription} />
  return (
    <div className="grid gap-3">
      {rows.map((item) => (
        <article key={item.id || `${item.title}-${item.created_at || item.timestamp}`} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#102236]">{item.title || titleize(item.activity_type || item.type)}</p>
              <p className="mt-1 text-sm text-slate-500">{item.body || '-'}</p>
            </div>
            <span className="text-xs font-semibold text-slate-400">{formatDate(item.created_at || item.timestamp)}</span>
          </div>
        </article>
      ))}
    </div>
  )
}

function CommercialTransactionWorkspacePage() {
  const { transactionId } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [searchTerm, setSearchTerm] = useState('')
  const [transaction, setTransaction] = useState(null)
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState('')
  const fetcher = useMemo(() => (organisationId) => getCommercialTransactionWorkspaceData(organisationId, transactionId), [transactionId])
  const { data, loading, error, organisationId } = useCommercialData(fetcher, [fetcher])

  useEffect(() => {
    setTransaction(data?.transaction || null)
  }, [data?.transaction])

  const relatedSearch = searchCommercialIndex(data?.searchIndex || [], searchTerm)

  if (error) return <CommercialEmptyState title="Commercial transaction could not be loaded" description={error} />
  if (loading) return <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
  if (!transaction) {
    return (
      <CommercialEmptyState
        title="Commercial transaction not found"
        description="This transaction may have been archived or sits outside your current commercial workspace scope."
      />
    )
  }

  async function handleStatusChange(nextStatus) {
    if (!transaction?.id || nextStatus === transaction.status) return
    setStatusSaving(true)
    setStatusError('')
    try {
      const updated = await updateCommercialTransactionStatus(transaction.id, nextStatus, transaction.status || '')
      setTransaction((previous) => previous ? {
        ...previous,
        status: updated?.status || nextStatus,
        currentStage: updated?.status || nextStatus,
        actualCloseDate: updated?.actual_close_date || previous.actualCloseDate,
        updatedAt: updated?.updated_at || previous.updatedAt,
      } : previous)
    } catch (saveError) {
      setStatusError(saveError?.message || 'Transaction status could not be updated.')
    } finally {
      setStatusSaving(false)
    }
  }

  const companyLabel = transaction.company?.company_name || transaction.company?.name || transaction.tenant?.name || 'Company pending'
  const propertyLabel = transaction.property?.property_name || 'Property pending'
  const vacancyLabel = transaction.vacancy?.vacancy_name || transaction.vacancy?.unit_name || 'Vacancy pending'
  const buyerTenantLabel = String(transaction.transactionType || '').toLowerCase() === 'sale' ? 'Buyer' : 'Tenant'
  const sellerLandlordLabel = String(transaction.transactionType || '').toLowerCase() === 'sale' ? 'Seller' : 'Landlord'

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <Link to="/commercial/dashboard#transactions" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[#102236]">
          <ArrowLeft size={16} />
          Commercial dashboard
        </Link>
        <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CommercialStatusPill value={transaction.status} />
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{transaction.brokerName || 'Broker pending'}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{titleize(transaction.transactionType || 'lease')}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-[#102236]">{transaction.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{companyLabel} · {propertyLabel} · {vacancyLabel}</p>
          </div>
          <div className="grid min-w-[280px] gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <Link
              to={buildCommercialDocumentGeneratorPath({
                packetType: String(transaction.transactionType || '').toLowerCase() === 'sale' ? 'commercial_sale' : 'commercial_lease',
                assetCategory: resolvePropertyAssetCategory(transaction.property?.property_type),
                transactionId: transaction.id,
                dealId: transaction.deal_id || '',
                propertyId: transaction.property_id || '',
                vacancyId: transaction.vacancy_id || '',
              })}
              className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] transition hover:bg-slate-50"
            >
              <FileText size={16} />
              Generate document
            </Link>
            <CommercialLandlordOnboardingAction
              organisationId={organisationId}
              landlord={transaction.landlord || null}
            />
            <CommercialOnboardingSendAction
              organisationId={organisationId}
              kind="transaction"
              record={transaction}
              lookups={data?.lookups || {}}
              label={String(transaction.transactionType || '').toLowerCase() === 'sale' ? 'Send Seller Onboarding' : 'Send Tenant Onboarding'}
            />
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Value</p>
              <p className="mt-1 text-lg font-semibold text-[#102236]">{formatCurrency(transaction.value)}</p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Expected Close</p>
              <p className="mt-1 text-sm font-semibold text-[#102236]">{formatDate(transaction.expectedCloseDate)}</p>
            </div>
            <label className="grid gap-1">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Stage</span>
              <select
                value={transaction.status || 'draft'}
                disabled={statusSaving}
                onChange={(event) => void handleStatusChange(event.target.value)}
                className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] outline-none transition focus:border-[#9fb9d1] focus:ring-4 focus:ring-[#dbeafe]"
              >
                {transactionStatusOptions(transaction).map((option) => (
                  <option key={option} value={option}>{titleize(option)}</option>
                ))}
              </select>
            </label>
            {statusError ? <p className="text-xs font-semibold text-rose-600">{statusError}</p> : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className={CARD_CLASS}>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Company</p>
          <p className="mt-2 text-lg font-semibold tracking-[-0.04em] text-[#102236]">{companyLabel}</p>
        </article>
        <article className={CARD_CLASS}>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Property</p>
          <p className="mt-2 text-lg font-semibold tracking-[-0.04em] text-[#102236]">{propertyLabel}</p>
        </article>
        <article className={CARD_CLASS}>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Documents</p>
          <p className="mt-2 text-lg font-semibold tracking-[-0.04em] text-[#102236]">{transaction.documents?.length || 0}</p>
          <p className="mt-1 text-sm text-slate-500">{transaction.documentRequests?.length || 0} requests</p>
        </article>
        <article className={CARD_CLASS}>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Last Updated</p>
          <p className="mt-2 text-lg font-semibold tracking-[-0.04em] text-[#102236]">{formatDate(transaction.updatedAt)}</p>
        </article>
      </div>

      <AppointmentDashboardSection
        module="transaction"
        organisationId={organisationId}
        transactionId={transactionId}
        includeAll
        onViewCalendar={() => navigate('/commercial/viewings')}
        onOpenCalendar={() => navigate('/commercial/viewings')}
        onManageAppointment={() => navigate('/commercial/viewings')}
        onOpenAppointment={() => navigate('/commercial/viewings')}
        onScheduleAppointment={() => navigate('/commercial/viewings')}
      />

      <nav className="flex gap-2 overflow-x-auto rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-semibold transition ${activeTab === tab.id ? 'bg-[#102b46] text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {createElement(tab.icon, { size: 15 })}
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Overview</h2>
          <div className="mt-4">
            <DetailGrid rows={[
              ['Transaction', transaction.title],
              ['Company', companyLabel],
              ['Contact', transaction.contact?.name || transaction.contact?.contact_person || transaction.company?.contact_person || 'Not captured yet'],
              ['Property', propertyLabel],
              ['Vacancy', vacancyLabel],
              ['Listing', transaction.listing?.title || 'Not linked'],
              ['Broker', transaction.brokerName || 'Broker pending'],
              ['Deal', transaction.deal?.deal_name || 'Not linked'],
              ['Current Stage', titleize(transaction.status)],
              ['Expected Close', formatDate(transaction.expectedCloseDate)],
              ['Actual Close', formatDate(transaction.actualCloseDate)],
              ['Value', formatCurrency(transaction.value)],
            ]} />
          </div>
          <section className="mt-5 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <h3 className="text-sm font-semibold text-[#102236]">Notes</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{transaction.notes || 'No transaction notes captured yet.'}</p>
          </section>
        </section>
      ) : null}

      {activeTab === 'parties' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Parties</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              [buyerTenantLabel, companyLabel, transaction.contact?.name || transaction.contact?.email || transaction.company?.email || transaction.tenant?.contact_person || transaction.tenant?.email || 'Not captured yet'],
              [sellerLandlordLabel, transaction.landlord?.name || 'Landlord pending', transaction.landlord?.contact_person || transaction.landlord?.email || 'Not captured yet'],
              ['Broker', transaction.brokerName || 'Broker pending', transaction.deal?.assigned_broker || transaction.brokerId || 'Assigned commercial broker'],
            ].map(([label, name, detail]) => (
              <article key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
                <p className="mt-2 text-sm font-semibold text-[#102236]">{name}</p>
                <p className="mt-1 text-sm text-slate-500">{detail}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === 'documents' ? (
        <CommercialDocumentLibrary organisationId={organisationId} entityType="commercial_transaction" entityId={transaction.id} />
      ) : null}

      {activeTab === 'portal' ? (
        <CommercialPortalControlsPanel organisationId={organisationId} transaction={transaction} />
      ) : null}

      {activeTab === 'activity' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Activity</h2>
          <div className="mt-4">
            <ActivityList
              rows={transaction.activity || []}
              emptyTitle="No transaction activity yet"
              emptyDescription="Stage changes, Heads of Terms actions, lease events, and document updates will appear here."
            />
          </div>
        </section>
      ) : null}

      {activeTab === 'timeline' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Timeline</h2>
          <div className="mt-4">
            <ActivityList
              rows={transaction.timeline || []}
              emptyTitle="No timeline yet"
              emptyDescription="Transaction created, viewing completed, Heads of Terms, lease, and completion milestones will appear here as the transaction progresses."
            />
          </div>
        </section>
      ) : null}

      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Commercial Search</h2>
            <p className="mt-1 text-sm text-slate-500">Search transactions, companies, properties, vacancies, brokers, deals, Heads of Terms, and leases in this workspace.</p>
          </div>
          <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-sm sm:w-80">
            <Search size={16} className="shrink-0" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search commercial records..."
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-[#102236] outline-none"
            />
          </label>
        </div>
        <div className="mt-4 grid gap-3">
          {relatedSearch.length ? relatedSearch.map((row) => (
            <Link key={row.id} to={row.to} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#102236]">{row.title}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{row.type} · {row.detail || '-'}</p>
                </div>
              </div>
            </Link>
          )) : (
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No matching commercial records found.</p>
          )}
        </div>
      </section>
    </div>
  )
}

export default CommercialTransactionWorkspacePage
