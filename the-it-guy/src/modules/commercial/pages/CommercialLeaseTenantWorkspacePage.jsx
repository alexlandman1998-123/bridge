import { Activity, ArrowLeft, Building2, CalendarClock, DoorOpen, FileText, RefreshCcw, RotateCcw, UsersRound } from 'lucide-react'
import { createElement, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import CommercialDocumentLibrary from '../components/CommercialDocumentLibrary'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialStatusPill from '../components/CommercialStatusPill'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import { useCommercialData } from '../hooks/useCommercialData'
import {
  getCommercialLeaseWorkspaceData,
  relistCommercialLeaseVacancy,
  renewCommercialLease,
  vacateCommercialLease,
} from '../services/commercialApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

const TABS = [
  { id: 'overview', label: 'Overview', icon: UsersRound },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'activity', label: 'Activity', icon: Activity },
]

function daysUntil(value) {
  const target = value ? new Date(value) : null
  if (!target || Number.isNaN(target.getTime())) return null
  return Math.ceil((target.getTime() - Date.now()) / 86400000)
}

function leaseHealth(lease = {}) {
  const remaining = daysUntil(lease.lease_end_date)
  const status = String(lease.status || '').toLowerCase()
  if (status === 'terminated') return { label: 'Vacated', tone: 'slate', detail: 'Lease has ended and the tenant has vacated.' }
  if (remaining === null) return { label: 'Date Missing', tone: 'amber', detail: 'Capture the lease end date to track renewal risk.' }
  if (remaining < 0) return { label: 'Expired', tone: 'rose', detail: `${Math.abs(remaining)} days past lease end.` }
  if (remaining <= 90) return { label: 'Expiring Soon', tone: 'amber', detail: `${remaining} days until expiry.` }
  return { label: 'Healthy', tone: 'emerald', detail: `${remaining} days remaining.` }
}

function healthClasses(tone) {
  if (tone === 'rose') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (tone === 'emerald') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
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

function LinkedCard({ icon: Icon, label, title, detail, to }) {
  const body = (
    <article className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-white p-2 text-[#1267a3] shadow-sm">
          {createElement(Icon, { size: 18 })}
        </div>
        <div className="min-w-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-[#102236]">{title || '-'}</p>
          <p className="mt-1 truncate text-sm text-slate-500">{detail || '-'}</p>
        </div>
      </div>
    </article>
  )

  return to ? <Link to={to}>{body}</Link> : body
}

function ActivityList({ rows = [] }) {
  if (!rows.length) return <CommercialEmptyState title="No tenant activity yet" description="Renewals, vacancy actions, document changes, and linked deal updates will appear here." />
  return (
    <div className="grid gap-3">
      {rows.map((item) => (
        <article key={item.id || `${item.title}-${item.created_at}`} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#102236]">{item.title || titleize(item.activity_type)}</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">{item.body || '-'}</p>
            </div>
            <span className="text-xs font-semibold text-slate-400">{formatDate(item.created_at)}</span>
          </div>
        </article>
      ))}
    </div>
  )
}

function RenewPanel({ lease, saving, onSubmit, onCancel }) {
  const [termMonths, setTermMonths] = useState(String(lease.lease_term_months || 36))
  const [leaseStartDate, setLeaseStartDate] = useState(lease.lease_end_date || new Date().toISOString().slice(0, 10))
  const [leaseEndDate, setLeaseEndDate] = useState('')
  const [monthlyRental, setMonthlyRental] = useState(String(lease.monthly_rental || ''))

  return (
    <section className={CARD_CLASS}>
      <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Renew Lease</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-500">New start date</span>
          <input type="date" value={leaseStartDate} onChange={(event) => setLeaseStartDate(event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 px-3 text-sm font-semibold text-[#102236] outline-none" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-500">Term months</span>
          <input type="number" min="1" value={termMonths} onChange={(event) => setTermMonths(event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 px-3 text-sm font-semibold text-[#102236] outline-none" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-500">End date override</span>
          <input type="date" value={leaseEndDate} onChange={(event) => setLeaseEndDate(event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 px-3 text-sm font-semibold text-[#102236] outline-none" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-500">Monthly rental</span>
          <input type="number" min="0" value={monthlyRental} onChange={(event) => setMonthlyRental(event.target.value)} className="min-h-11 rounded-2xl border border-slate-200 px-3 text-sm font-semibold text-[#102236] outline-none" />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => onSubmit({
            lease_start_date: leaseStartDate,
            lease_end_date: leaseEndDate || null,
            lease_term_months: Number(termMonths),
            monthly_rental: monthlyRental ? Number(monthlyRental) : null,
          })}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#102b46] px-4 text-sm font-semibold text-white transition hover:bg-[#163a5b] disabled:opacity-60"
        >
          <RefreshCcw size={16} />
          Save Renewal
        </button>
        <button type="button" disabled={saving} onClick={onCancel} className="inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#102236] transition hover:bg-slate-50 disabled:opacity-60">
          Cancel
        </button>
      </div>
    </section>
  )
}

function CommercialLeaseTenantWorkspacePage() {
  const { leaseId } = useParams()
  const [activeTab, setActiveTab] = useState('overview')
  const [reloadKey, setReloadKey] = useState(0)
  const [renewOpen, setRenewOpen] = useState(false)
  const [savingAction, setSavingAction] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const fetcher = useMemo(() => (organisationId) => getCommercialLeaseWorkspaceData(organisationId, leaseId), [leaseId])
  const { data, loading, error, organisationId } = useCommercialData(fetcher, [fetcher, reloadKey])

  const lease = data?.lease || null
  const tenant = data?.tenant || null
  const property = data?.property || null
  const vacancy = data?.vacancy || null
  const landlord = data?.landlord || null
  const deal = data?.deal || null
  const health = leaseHealth(lease || {})

  async function runAction(key, callback) {
    if (!lease?.id) return
    setSavingAction(key)
    setActionError('')
    setActionMessage('')
    try {
      await callback()
      setReloadKey((value) => value + 1)
      setRenewOpen(false)
    } catch (actionFailure) {
      setActionError(actionFailure?.message || 'Tenant action could not be completed.')
    } finally {
      setSavingAction('')
    }
  }

  if (error) return <CommercialEmptyState title="Tenant workspace could not be loaded" description={error} />
  if (loading) return <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
  if (!lease) return <CommercialEmptyState title="Tenant lease not found" description="This tenant lease may have been archived or sits outside your current commercial workspace scope." />

  const tenantName = tenant?.name || deal?.deal_name || 'Tenant pending'
  const propertyName = property?.property_name || 'Property pending'
  const vacancyName = vacancy?.vacancy_name || vacancy?.unit_or_floor || 'Vacancy pending'

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <Link to="/commercial/leasing/tenants" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[#102236]">
          <ArrowLeft size={16} />
          Tenants
        </Link>
        <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CommercialStatusPill value={lease.status} />
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${healthClasses(health.tone)}`}>{health.label}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{propertyName}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-[#102236]">{tenantName}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{vacancyName} · {formatDate(lease.lease_start_date)} to {formatDate(lease.lease_end_date)} · {health.detail}</p>
          </div>
          <div className="grid min-w-[280px] gap-2 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <button type="button" onClick={() => setRenewOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-[#102b46] px-3 text-sm font-semibold text-white transition hover:bg-[#163a5b]">
              <RefreshCcw size={16} />
              Renew Lease
            </button>
            <button
              type="button"
              disabled={Boolean(savingAction)}
              onClick={() => void runAction('relist', async () => {
                await relistCommercialLeaseVacancy(lease.id, { organisation_id: organisationId })
                setActionMessage('Linked vacancy moved back into marketing.')
              })}
              className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#102236] transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RotateCcw size={16} />
              Re-list Vacancy
            </button>
            <button
              type="button"
              disabled={Boolean(savingAction)}
              onClick={() => {
                const confirmed = window.confirm('Mark this tenant as vacated and return the vacancy to available stock?')
                if (confirmed) {
                  void runAction('vacate', async () => {
                    await vacateCommercialLease(lease.id, { organisation_id: organisationId })
                    setActionMessage('Tenant marked vacated and linked vacancy returned to available stock.')
                  })
                }
              }}
              className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
            >
              <DoorOpen size={16} />
              Mark Vacated
            </button>
          </div>
        </div>
      </section>

      {actionError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{actionError}</div> : null}
      {actionMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{actionMessage}</div> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className={CARD_CLASS}>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Monthly Rental</p>
          <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{formatCurrency(lease.monthly_rental)}</p>
          <p className="mt-1 text-sm text-slate-500">{lease.rental_per_m2 ? `${formatCurrency(lease.rental_per_m2)} / m2` : 'Rental per m2 not captured'}</p>
        </article>
        <article className={CARD_CLASS}>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Lease Expiry</p>
          <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{formatDate(lease.lease_end_date)}</p>
          <p className="mt-1 text-sm text-slate-500">{health.detail}</p>
        </article>
        <article className={CARD_CLASS}>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Term</p>
          <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{lease.lease_term_months ? `${formatNumber(lease.lease_term_months)} months` : '-'}</p>
          <p className="mt-1 text-sm text-slate-500">{lease.escalation_percentage ? `${formatNumber(lease.escalation_percentage)}% escalation` : 'Escalation not captured'}</p>
        </article>
        <article className={CARD_CLASS}>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Deposit</p>
          <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#102236]">{formatCurrency(lease.deposit_amount)}</p>
          <p className="mt-1 text-sm text-slate-500">{lease.renewal_option ? 'Renewal option captured' : 'No renewal option'}</p>
        </article>
      </section>

      {renewOpen ? (
        <RenewPanel
          lease={lease}
          saving={savingAction === 'renew'}
          onCancel={() => setRenewOpen(false)}
          onSubmit={(payload) => void runAction('renew', async () => {
            await renewCommercialLease(lease.id, { ...payload, organisation_id: organisationId })
            setActionMessage('Lease renewal saved.')
          })}
        />
      ) : null}

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
          <section className={CARD_CLASS}>
            <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Lease Details</h2>
            <div className="mt-4">
              <DetailGrid rows={[
                ['Tenant', tenantName],
                ['Contact', tenant?.contact_person || tenant?.email || '-'],
                ['Property', propertyName],
                ['Vacancy / Unit', vacancyName],
                ['Landlord', landlord?.name || '-'],
                ['Deal', deal?.deal_name || '-'],
                ['Start Date', formatDate(lease.lease_start_date)],
                ['End Date', formatDate(lease.lease_end_date)],
                ['Occupation Date', formatDate(lease.occupation_date)],
                ['Renewal Notice', formatDate(lease.renewal_notice_date)],
                ['Tenant Installation', formatCurrency(lease.tenant_installation_allowance)],
                ['Rent Free Period', lease.rent_free_period_months ? `${formatNumber(lease.rent_free_period_months)} months` : '-'],
              ]} />
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <LinkedCard icon={Building2} label="Property" title={propertyName} detail={[property?.suburb, property?.city].filter(Boolean).join(', ')} to={property?.id ? `/commercial/properties/${property.id}` : ''} />
            <LinkedCard icon={DoorOpen} label="Vacancy" title={vacancyName} detail={titleize(vacancy?.status || '')} to={vacancy?.id ? `/commercial/vacancies/${vacancy.id}` : ''} />
            <LinkedCard icon={UsersRound} label="Tenant Contact" title={tenant?.contact_person || tenantName} detail={tenant?.email || tenant?.phone || '-'} />
            <LinkedCard icon={CalendarClock} label="Renewal Watch" title={health.label} detail={health.detail} />
          </section>

          <section className={CARD_CLASS}>
            <h2 className="text-lg font-semibold tracking-[-0.035em] text-[#102236]">Notes</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{lease.notes || 'No lease notes captured yet.'}</p>
          </section>
        </section>
      ) : null}

      {activeTab === 'documents' ? (
        <CommercialDocumentLibrary
          organisationId={organisationId}
          entityType="commercial_lease"
          entityId={lease.id}
          onActivityChange={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      {activeTab === 'activity' ? (
        <section className={CARD_CLASS}>
          <ActivityList rows={data?.activity || []} />
        </section>
      ) : null}
    </div>
  )
}

export default CommercialLeaseTenantWorkspacePage
