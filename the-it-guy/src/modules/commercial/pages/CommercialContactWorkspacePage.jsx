import { BriefcaseBusiness, ClipboardList, Handshake, Link2, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import CommercialEmptyState from '../components/CommercialEmptyState'
import CommercialOnboardingSendAction from '../components/CommercialOnboardingSendAction'
import { formatDate, titleize } from '../commercialFormatters'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialActivity, getCommercialLookupData } from '../services/commercialApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

const TABS = [
  { id: 'overview', label: 'Overview', icon: UserRound },
  { id: 'requirements', label: 'Requirements', icon: ClipboardList },
  { id: 'deals', label: 'Deals', icon: Handshake },
  { id: 'transactions', label: 'Transactions', icon: BriefcaseBusiness },
  { id: 'activity', label: 'Activity', icon: Link2 },
]

async function getContactWorkspaceData(organisationId, contactId) {
  const lookups = await getCommercialLookupData(organisationId)
  const contact = (lookups.contacts || []).find((row) => row.id === contactId) || null
  const requirements = (lookups.requirements || []).filter((row) => row.contact_id === contactId)
  const deals = (lookups.deals || []).filter((row) => row.contact_id === contactId)
  const transactions = (lookups.transactions || []).filter((row) => row.contact_id === contactId)
  const viewings = (lookups.viewings || []).filter((row) => row.contact_id === contactId)
  const activityGroups = await Promise.all([
    getCommercialActivity({ organisationId, entityType: 'commercial_contact', entityId: contactId }),
    ...requirements.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_requirement', entityId: row.id })),
    ...deals.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_deal', entityId: row.id })),
    ...transactions.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_transaction', entityId: row.id })),
    ...viewings.map((row) => getCommercialActivity({ organisationId, entityType: 'commercial_viewing', entityId: row.id })),
  ])
  const activity = activityGroups.flat().filter(Boolean).sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
  return { contact, requirements, deals, transactions, activity, lookups }
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
  if (!rows.length) return <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No contact activity has been recorded yet.</p>
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

function CommercialContactWorkspacePage() {
  const { contactId } = useParams()
  const [activeTab, setActiveTab] = useState('overview')
  const fetcher = useMemo(() => (organisationId) => getContactWorkspaceData(organisationId, contactId), [contactId])
  const { data, loading, error, organisationId } = useCommercialData(fetcher, [fetcher])
  const contact = data?.contact || null
  const company = (data?.lookups?.companies || []).find((row) => row.id === contact?.company_id) || null

  if (error) return <CommercialEmptyState title="Commercial contact could not be loaded" description={error} />
  if (loading) return <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
  if (!contact) return <CommercialEmptyState title="Contact not found" description="This commercial contact may have been archived or sits outside your current scope." />

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <Link to="/commercial/contacts" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[#102236]">
          <UserRound size={16} />
          Contacts
        </Link>
        <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">{titleize(contact.status)}</span>
              {contact.decision_maker ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Decision Maker</span> : null}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-[#102236]">{contact.name}</h1>
            <p className="mt-2 text-sm text-slate-500">{contact.job_title || 'Commercial contact'} · {company?.company_name || 'Company pending'}</p>
          </div>
          <div className="grid min-w-[260px] gap-3 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <CommercialOnboardingSendAction
              organisationId={organisationId}
              kind="contact"
              record={contact}
              lookups={data?.lookups || {}}
              label="Send Tenant Onboarding"
            />
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
          <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Name', contact.name],
              ['Company', company?.company_name || '-'],
              ['Role', contact.job_title || '-'],
              ['Email', contact.email || '-'],
              ['Phone', contact.phone || '-'],
              ['Mobile', contact.mobile || '-'],
              ['Preferred Contact', titleize(contact.preferred_contact_method)],
              ['Decision Maker', contact.decision_maker ? 'Yes' : 'No'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
                <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</dt>
                <dd className="mt-1 text-sm font-semibold text-[#102236]">{value || '-'}</dd>
              </div>
            ))}
          </dl>
          <section className="mt-5 rounded-2xl border border-slate-200 bg-[#fbfcfe] p-4">
            <h2 className="text-sm font-semibold text-[#102236]">Notes</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{contact.notes || 'No contact notes captured yet.'}</p>
          </section>
        </section>
      ) : null}

      {activeTab === 'requirements' ? (
        <section className={CARD_CLASS}>
          <LinkedList
            rows={data?.requirements || []}
            empty="No requirements linked to this contact yet."
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
            empty="No deals linked to this contact yet."
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
            empty="No transactions linked to this contact yet."
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
    </div>
  )
}

export default CommercialContactWorkspacePage
