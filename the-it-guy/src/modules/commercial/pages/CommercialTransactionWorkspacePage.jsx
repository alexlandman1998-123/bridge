import {
  ArrowLeft,
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  HandCoins,
  Landmark,
  ListChecks,
  LockKeyhole,
  Search,
  Users,
} from 'lucide-react'
import { createElement, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import CommercialDocumentLibrary from '../components/CommercialDocumentLibrary'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialPortalControlsPanel from '../components/CommercialPortalControlsPanel'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialTransactionWorkspaceData, searchCommercialIndex } from '../services/commercialPlatformApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

const TABS = [
  { id: 'overview', label: 'Overview', icon: BriefcaseBusiness },
  { id: 'timeline', label: 'Timeline', icon: CalendarClock },
  { id: 'roleplayers', label: 'Roleplayers', icon: Users },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'financials', label: 'Financials', icon: HandCoins },
  { id: 'lease', label: 'Lease Information', icon: Landmark },
  { id: 'portal', label: 'Portal Access', icon: LockKeyhole },
]

function primaryDocumentTarget(transaction = {}) {
  if (transaction.lease?.id) return { entityType: 'commercial_lease', entityId: transaction.lease.id }
  if (transaction.hot?.id) return { entityType: 'commercial_heads_of_terms', entityId: transaction.hot.id }
  if (transaction.deal?.id) return { entityType: 'commercial_deal', entityId: transaction.deal.id }
  return { entityType: 'commercial_property', entityId: transaction.property?.id || '' }
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

function SummaryCard({ label, value, detail, icon }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-[#102236]">{value}</p>
          <p className="mt-1 text-sm text-slate-500">{detail}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
          {createElement(icon, { size: 18 })}
        </span>
      </div>
    </article>
  )
}

function EmptyPanel({ title, description }) {
  return (
    <CommercialEmptyState
      title={title}
      description={description}
    />
  )
}

function CommercialTransactionWorkspacePage() {
  const { transactionId } = useParams()
  const [activeTab, setActiveTab] = useState('overview')
  const [searchTerm, setSearchTerm] = useState('')
  const fetcher = useMemo(() => (organisationId) => getCommercialTransactionWorkspaceData(organisationId, transactionId), [transactionId])
  const { data, loading, error, organisationId } = useCommercialData(fetcher, [fetcher])
  const transaction = data?.transaction || null
  const documentTarget = primaryDocumentTarget(transaction || {})
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

  const commission = transaction.commission || {}
  const lease = transaction.lease || {}
  const daysToExpiry = data?.renewalRisk?.find((row) => row.id === transaction.id)?.daysToExpiry

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <Link to="/commercial/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[#102236]">
          <ArrowLeft size={16} />
          Commercial dashboard
        </Link>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CommercialStatusPill value={transaction.status} />
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{transaction.brokerName}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-[#102236]">{transaction.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              {transaction.property?.property_name || 'Property pending'} · {transaction.landlord?.name || 'Landlord pending'} · Updated {formatDate(transaction.updatedAt)}
            </p>
          </div>
          <div className="grid min-w-[240px] gap-2 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 text-sm">
            <span className="font-semibold text-[#102236]">{formatCurrency(transaction.value)}</span>
            <span className="text-slate-500">Pipeline value</span>
            <span className="text-slate-500">{transaction.tasks?.length || 0} tasks · {transaction.notifications?.length || 0} notifications</span>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Deal Value" value={formatCurrency(transaction.value)} detail={transaction.deal?.stage ? titleize(transaction.deal.stage) : 'Commercial workflow'} icon={BriefcaseBusiness} />
        <SummaryCard label="Commission" value={formatCurrency(commission.commissionValue)} detail={titleize(commission.status || 'expected')} icon={HandCoins} />
        <SummaryCard label="Documents" value={formatNumber(transaction.documents?.length || 0)} detail={`${formatNumber(transaction.documentRequests?.length || 0)} requests`} icon={FileText} />
        <SummaryCard label="Renewal Watch" value={daysToExpiry !== undefined ? `${formatNumber(daysToExpiry)} days` : '-'} detail={lease.lease_end_date ? formatDate(lease.lease_end_date) : 'No active lease expiry'} icon={CalendarClock} />
      </div>

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
              ['Tenant', transaction.tenant?.name],
              ['Property', transaction.property?.property_name],
              ['Vacancy', transaction.vacancy?.vacancy_name || transaction.vacancy?.unit_name],
              ['Landlord', transaction.landlord?.name],
              ['Broker Owner', transaction.brokerName],
              ['Branch', transaction.branchId || 'Unassigned'],
              ['Team', transaction.teamId || 'Unassigned'],
              ['Last Updated', formatDate(transaction.updatedAt)],
            ]} />
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
              <h3 className="text-sm font-semibold text-[#102236]">Core Links</h3>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                <span>Deal: {transaction.deal?.deal_name || 'Not created'}</span>
                <span>HOT: {transaction.hot?.premises_description || transaction.hot?.status || 'Not created'}</span>
                <span>Lease: {transaction.lease?.lease_name || (transaction.lease?.id ? `Lease ${String(transaction.lease.id).slice(0, 8)}` : 'Not created')}</span>
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
              <h3 className="text-sm font-semibold text-[#102236]">Platform Signals</h3>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                <span>{transaction.timeline?.length || 0} timeline events available to Bridge activity views</span>
                <span>{transaction.tasks?.length || 0} task candidates for the shared task centre</span>
                <span>{transaction.notifications?.length || 0} notification candidates for platform alerts</span>
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === 'timeline' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Unified Timeline</h2>
          <div className="mt-4 grid gap-3">
            {transaction.timeline?.length ? transaction.timeline.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#102236]">{titleize(item.title)}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.body || titleize(item.type)}</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-400">{formatDate(item.timestamp)}</span>
                </div>
              </article>
            )) : <EmptyPanel title="No timeline yet" description="Deal, HOT, lease, document, assignment, and workflow activity will appear here as the transaction progresses." />}
          </div>
        </section>
      ) : null}

      {activeTab === 'roleplayers' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Roleplayers</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(transaction.roleplayers || []).map((roleplayer) => (
              <article key={roleplayer.role} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{roleplayer.role}</p>
                <p className="mt-2 text-sm font-semibold text-[#102236]">{roleplayer.name}</p>
                <p className="mt-1 text-xs text-slate-500">{titleize(roleplayer.type)}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === 'documents' ? (
        <CommercialDocumentLibrary organisationId={organisationId} entityType={documentTarget.entityType} entityId={documentTarget.entityId} />
      ) : null}

      {activeTab === 'tasks' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Tasks & Notifications</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="grid gap-3">
              {(transaction.tasks || []).length ? transaction.tasks.map((task) => (
                <article key={task.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 size={18} className="mt-0.5 text-emerald-500" />
                    <div>
                      <p className="text-sm font-semibold text-[#102236]">{task.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{titleize(task.status)} · {task.owner} · {formatDate(task.dueDate)}</p>
                    </div>
                  </div>
                </article>
              )) : <EmptyPanel title="No open tasks" description="Workflow, document, and renewal prompts will appear here when this commercial transaction needs action." />}
            </div>
            <div className="grid gap-3">
              {(transaction.notifications || []).length ? transaction.notifications.map((notification) => (
                <article key={notification.id} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                  <div className="flex items-start gap-3">
                    <Bell size={18} className="mt-0.5 text-sky-500" />
                    <div>
                      <p className="text-sm font-semibold text-[#102236]">{notification.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{titleize(notification.channel)} · {titleize(notification.status)}</p>
                    </div>
                  </div>
                </article>
              )) : <EmptyPanel title="No notifications queued" description="HOT, lease, document, assignment, and expiry alerts will surface here before being routed by the shared notification engine." />}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === 'financials' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Financials</h2>
          <div className="mt-4">
            <DetailGrid rows={[
              ['Pipeline Value', formatCurrency(transaction.value)],
              ['Lease Value', formatCurrency(commission.leaseValue)],
              ['Commission %', `${formatNumber(commission.commissionPercent)}%`],
              ['Commission Value', formatCurrency(commission.commissionValue)],
              ['Commission Status', titleize(commission.status)],
            ]} />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {(commission.splits || []).map((split) => (
              <article key={split.label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <p className="text-sm font-semibold text-[#102236]">{split.label} Split</p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{formatNumber(split.percent)}%</p>
                <p className="mt-1 text-sm text-slate-500">{formatCurrency(split.value)}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === 'lease' ? (
        <section className={CARD_CLASS}>
          <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Lease Information</h2>
          <div className="mt-4">
            <DetailGrid rows={[
              ['Lease Status', titleize(lease.status)],
              ['Monthly Rental', formatCurrency(lease.monthly_rental || transaction.hot?.monthly_rental)],
              ['Escalation', lease.escalation_percent ? `${formatNumber(lease.escalation_percent)}%` : `${formatNumber(transaction.hot?.escalation_percent)}%`],
              ['Deposit', formatCurrency(lease.deposit_amount || transaction.hot?.deposit_amount)],
              ['Occupation Date', formatDate(lease.occupation_date || transaction.hot?.occupation_date)],
              ['Start Date', formatDate(lease.lease_start_date)],
              ['Expiry Date', formatDate(lease.lease_end_date)],
              ['Renewal Status', daysToExpiry !== undefined ? (daysToExpiry <= 180 ? 'Renewal review required' : 'Monitor') : 'Not tracked yet'],
            ]} />
          </div>
        </section>
      ) : null}

      {activeTab === 'portal' ? (
        <CommercialPortalControlsPanel organisationId={organisationId} transaction={transaction} />
      ) : null}

      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Commercial Search</h2>
            <p className="mt-1 text-sm text-slate-500">Search transaction, property, tenant, landlord, deal, HOT, and lease records in this workspace.</p>
          </div>
          <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-sm sm:w-80">
            <Search size={16} className="shrink-0" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[#102236] outline-none"
              placeholder="Search commercial records..."
            />
          </label>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {relatedSearch.map((item) => (
            <Link key={item.id} to={item.to} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
              <p className="text-sm font-semibold text-[#102236]">{item.title}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{item.type}</p>
              <p className="mt-1 text-sm text-slate-500">{item.detail || '-'}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

export default CommercialTransactionWorkspacePage
