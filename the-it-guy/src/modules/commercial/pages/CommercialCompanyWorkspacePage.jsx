import { Building2, BriefcaseBusiness, ClipboardList, FileText, Handshake, Link2, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import CommercialDocumentLibrary from '../components/CommercialDocumentLibrary'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { formatDate, titleize } from '../commercialFormatters'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialActivity, getCommercialLookupData } from '../services/commercialApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

const TABS = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'contacts', label: 'Contacts', icon: UserRound },
  { id: 'requirements', label: 'Requirements', icon: ClipboardList },
  { id: 'deals', label: 'Deals', icon: Handshake },
  { id: 'transactions', label: 'Transactions', icon: BriefcaseBusiness },
  { id: 'activity', label: 'Activity', icon: Link2 },
  { id: 'documents', label: 'Documents', icon: FileText },
]

async function getCompanyWorkspaceData(organisationId, companyId) {
  const lookups = await getCommercialLookupData(organisationId)
  const company = (lookups.companies || []).find((row) => row.id === companyId) || null
  const contacts = (lookups.contacts || []).filter((row) => row.company_id === companyId)
  const requirements = (lookups.requirements || []).filter((row) => row.company_id === companyId)
  const deals = (lookups.deals || []).filter((row) => row.company_id === companyId)
  const transactions = (lookups.transactions || []).filter((row) => row.company_id === companyId)
  const viewings = (lookups.viewings || []).filter((row) => row.company_id === companyId)
  const activityGroups = await Promise.all([
    getCommercialActivity({ organisationId, entityType: 'commercial_company', entityId: companyId }),
    ...contacts.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_contact', entityId: row.id })),
    ...requirements.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_requirement', entityId: row.id })),
    ...deals.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_deal', entityId: row.id })),
    ...transactions.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_transaction', entityId: row.id })),
    ...viewings.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_viewing', entityId: row.id })),
  ])
  const activity = activityGroups.flat().filter(Boolean).sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
  return { company, contacts, requirements, deals, transactions, activity, lookups }
}

function RowGrid({ rows = [] }) {
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

function LinkedList({ rows = [], empty, renderTitle, renderDetail, to }) {
  if (!rows.length) return <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{empty}</p>
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <Link key={row.id} to={typeof to === 'function' ? to(row) : to} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4 transition hover:border-blue-200 hover:bg-white">
          <p className="text-sm font-semibold text-[#102236]">{renderTitle(row)}</p>
          <p className="mt-1 text-sm text-slate-500">{renderDetail(row)}</p>
        </Link>
      ))}
    </div>
  )
}

function ActivityList({ rows = [] }) {
  if (!rows.length) return <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No company activity has been recorded yet.</p>
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

function CommercialCompanyWorkspacePage() {
  const { companyId } = useParams()
  const [activeTab, setActiveTab] = useState('overview')
  const fetcher = useMemo(() => (organisationId) => getCompanyWorkspaceData(organisationId, companyId), [companyId])
  const { data, loading, error, organisationId } = useCommercialData(fetcher, [fetcher])
  const company = data?.company || null
  const brokerLabel = (data?.lookups?.brokers || []).find((row) => String(row.userId || row.id) === String(company?.broker_id || ''))?.fullName
    || (data?.lookups?.brokers || []).find((row) => String(row.userId || row.id) === String(company?.broker_id || ''))?.email
    || company?.broker_id
    || 'Unassigned'
  const primaryContact = (data?.contacts || []).find((row) => row.id === company?.primary_contact_id) || data?.contacts?.find((row) => row.is_primary)

  if (error) return <CommercialEmptyState title="Commercial company could not be loaded" description={error} />
  if (loading) return <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
  if (!company) return <CommercialEmptyState title="Company not found" description="This commercial company may have been archived or sits outside your current scope." />

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <Link to="/commercial/companies" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[#102236]">
          <Building2 size={16} />
          Companies
        </Link>
        <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{titleize(company.company_type)}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{titleize(company.status)}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-[#102236]">{company.company_name}</h1>
            <p className="mt-2 text-sm text-slate-500">{company.industry || 'Commercial CRM account'} · {brokerLabel}</p>
          </div>
          <div className="grid min-w-[260px] gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Primary Contact</p>
              <p className="mt-1 text-sm font-semibold text-[#102236]">{primaryContact?.name || 'Not set'}</p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">Open Opportunities</p>
              <p className="mt-1 text-sm font-semibold text-[#102236]">{(data?.requirements || []).length + (data?.deals || []).length + (data?.transactions || []).length}</p>
            </div>
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
        <section className={CARD_CLASS}>
          <RowGrid rows={[
            ['Company Name', company.company_name],
            ['Type', titleize(company.company_type)],
            ['Industry', company.industry || '-'],
            ['Website', company.website || '-'],
            ['Phone', company.phone || '-'],
            ['Email', company.email || '-'],
            ['Address', [company.address, company.city, company.province, company.country].filter(Boolean).join(', ') || '-'],
            ['Broker Owner', brokerLabel],
          ]} />
          <section className="mt-5 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <h2 className="text-sm font-semibold text-[#102236]">Notes</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{company.notes || 'No company notes captured yet.'}</p>
          </section>
        </section>
      ) : null}

      {activeTab === 'contacts' ? (
        <section className={CARD_CLASS}>
          <LinkedList
            rows={data?.contacts || []}
            empty="No contacts linked to this company yet."
            renderTitle={(row) => row.name}
            renderDetail={(row) => [row.job_title, row.email || row.mobile || row.phone].filter(Boolean).join(' · ')}
            to={(row) => `/commercial/contacts/${row.id}`}
          />
        </section>
      ) : null}

      {activeTab === 'requirements' ? (
        <section className={CARD_CLASS}>
          <LinkedList
            rows={data?.requirements || []}
            empty="No requirements linked to this company yet."
            renderTitle={(row) => row.requirement_name || 'Commercial requirement'}
            renderDetail={(row) => [titleize(row.requirement_type), titleize(row.stage)].filter(Boolean).join(' · ')}
            to="/commercial/requirements"
          />
        </section>
      ) : null}

      {activeTab === 'deals' ? (
        <section className={CARD_CLASS}>
          <LinkedList
            rows={data?.deals || []}
            empty="No deals linked to this company yet."
            renderTitle={(row) => row.deal_name || 'Commercial deal'}
            renderDetail={(row) => [titleize(row.deal_type), titleize(row.stage)].filter(Boolean).join(' · ')}
            to="/commercial/deals"
          />
        </section>
      ) : null}

      {activeTab === 'transactions' ? (
        <section className={CARD_CLASS}>
          <LinkedList
            rows={data?.transactions || []}
            empty="No transactions linked to this company yet."
            renderTitle={(row) => row.transaction_name || 'Commercial transaction'}
            renderDetail={(row) => [titleize(row.transaction_type), titleize(row.status)].filter(Boolean).join(' · ')}
            to={(row) => `/commercial/transactions/${row.id}`}
          />
        </section>
      ) : null}

      {activeTab === 'activity' ? (
        <section className={CARD_CLASS}>
          <ActivityList rows={data?.activity || []} />
        </section>
      ) : null}

      {activeTab === 'documents' ? (
        <CommercialDocumentLibrary organisationId={organisationId} entityType="commercial_company" entityId={company.id} />
      ) : null}
    </div>
  )
}

export default CommercialCompanyWorkspacePage
