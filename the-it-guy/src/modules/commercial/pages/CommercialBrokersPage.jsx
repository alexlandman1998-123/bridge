import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, Mail, MoreVertical, Plus, Search, Users } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import Button from '../../../components/ui/Button'
import Field from '../../../components/ui/Field'
import Modal from '../../../components/ui/Modal'
import { createWorkspaceUserInvite, listWorkspaceUserInvites } from '../../../services/workspaceUserInviteService'
import { formatCurrency, formatDate, formatNumber, titleize } from '../commercialFormatters'
import CommercialEmptyState from '../components/CommercialEmptyState'
import { useCommercialData } from '../hooks/useCommercialData'
import { getCommercialBrokerageData } from '../services/commercialBrokerageApi'

const CARD_CLASS = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.045)]'

function Metric({ label, value }) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[#102236]">{value}</p>
    </article>
  )
}

function initialsForName(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) || 'BR').toUpperCase()
}

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase()
}

function statusTone(status = '') {
  const normalized = normalizeText(status)
  if (normalized.includes('pending')) return 'border-amber-200 bg-amber-50 text-amber-700'
  if (normalized.includes('inactive') || normalized.includes('disabled')) return 'border-slate-200 bg-slate-50 text-slate-500'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function BrokerDirectoryRow({ broker }) {
  const isPending = normalizeText(broker.status).includes('pending')
  return (
    <article className="grid gap-4 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] transition hover:border-[#cfe0ef] lg:grid-cols-[minmax(260px,1.35fr)_minmax(220px,1fr)_minmax(150px,0.7fr)_minmax(130px,0.6fr)_minmax(150px,0.7fr)_minmax(150px,0.7fr)_auto] lg:items-center">
      <div className="flex min-w-0 items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#eef5fb] text-sm font-bold text-[#123b61]">
          {initialsForName(broker.name)}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-[#102236]">{broker.name}</h2>
          <p className="mt-1 truncate text-sm text-slate-500">{broker.email || 'No email captured'}</p>
          <span className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{titleize(broker.role || 'commercial broker')}</span>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 lg:hidden">Branch</p>
        <p className="text-sm font-semibold text-[#102236]">{broker.branchName || 'HQ / Unassigned'}</p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 lg:hidden">Status</p>
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(broker.status)}`}>
          {isPending ? 'Pending invite' : titleize(broker.status || 'active')}
        </span>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 lg:hidden">Listings</p>
        <p className="text-sm font-semibold text-[#102236]">{broker.activeListings || 0}</p>
        <p className="text-xs text-slate-500">{broker.activeVacancies || broker.vacanciesManaged || 0} vacancies</p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 lg:hidden">Deals</p>
        <p className="text-sm font-semibold text-[#102236]">{broker.activeDeals || 0} active</p>
        <p className="text-xs text-slate-500">{formatCurrency(broker.pipelineValue || 0)} pipeline</p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 lg:hidden">Last active</p>
        <p className="text-sm font-semibold text-[#102236]">{broker.lastActivityAt ? formatDate(broker.lastActivityAt) : isPending ? 'Invite sent' : 'No activity yet'}</p>
      </div>

      <div className="flex items-center gap-2">
        {!isPending ? (
          <Link to={`/commercial/agency/brokers/${encodeURIComponent(broker.id)}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-[#071126] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(7,17,38,0.16)]">
            View <ExternalLink size={14} />
          </Link>
        ) : (
          <span className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-500">Awaiting accept</span>
        )}
        <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500" aria-label={`More actions for ${broker.name}`}>
          <MoreVertical size={16} />
        </button>
      </div>
    </article>
  )
}

function RecordList({ title, rows = [], getTitle, getMeta }) {
  return (
    <section className={CARD_CLASS}>
      <h2 className="text-base font-semibold text-[#102236]">{title}</h2>
      <div className="mt-4 grid gap-2">
        {rows.length ? rows.slice(0, 6).map((row) => (
          <article key={row.id} className="rounded-2xl border border-slate-100 bg-[#fbfcfe] px-4 py-3">
            <p className="text-sm font-semibold text-[#102236]">{getTitle(row)}</p>
            <p className="mt-1 text-xs text-slate-500">{getMeta(row)}</p>
          </article>
        )) : (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No assigned records.</p>
        )}
      </div>
    </section>
  )
}

function BrokerProfile({ data, brokerId }) {
  const broker = (data?.brokers || []).find((row) => String(row.id) === String(brokerId))
  if (!broker) {
    return <CommercialEmptyState title="Broker not found" description="This broker is not available in the current commercial workspace scope." />
  }

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <Link to="/commercial/agency/brokers" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600"><ArrowLeft size={15} /> Brokers</Link>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.045em] text-[#102236]">{broker.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{titleize(broker.role)} · {broker.branchName}</p>
            <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-500"><Mail size={15} /> {broker.email || 'No email captured'}</p>
          </div>
          <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{titleize(broker.status)}</span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-8">
        <Metric label="Requirements" value={broker.activeRequirements} />
        <Metric label="Listings" value={broker.activeListings} />
        <Metric label="Deals" value={broker.activeDeals} />
        <Metric label="Transactions" value={broker.activeTransactions || 0} />
        <Metric label="Vacancies" value={broker.vacanciesManaged} />
        <Metric label="Viewings" value={broker.viewingsCompleted || 0} />
        <Metric label="Expected Comm." value={formatCurrency(broker.projectedCommission || 0)} />
        <Metric label="Capacity" value={broker.capacityLabel} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <RecordList title="Assigned Requirements" rows={broker.requirements} getTitle={(row) => row.requirement_name || 'Requirement'} getMeta={(row) => `${titleize(row.stage)} · ${formatNumber(row.min_size_m2, 'm²')} - ${formatNumber(row.max_size_m2, 'm²')}`} />
        <RecordList title="Assigned Listings" rows={broker.listings} getTitle={(row) => row.title || 'Listing'} getMeta={(row) => `${titleize(row.listing_status)} · ${titleize(row.listing_category)} · ${formatCurrency(row.pricing)}`} />
        <RecordList title="Assigned Deals" rows={broker.deals} getTitle={(row) => row.deal_name || 'Deal'} getMeta={(row) => `${titleize(row.stage)} · ${formatCurrency(row.deal_value)}`} />
        <RecordList title="Transactions & Viewings" rows={[...broker.transactions, ...broker.viewings]} getTitle={(row) => row.transaction_name || row.viewing_date || row.id || 'Commercial workflow'} getMeta={(row) => `${titleize(row.status)} · ${formatDate(row.updated_at || row.created_at || row.viewing_date)}`} />
        <RecordList title="Assigned Properties / Vacancies" rows={[...broker.properties, ...broker.vacancies]} getTitle={(row) => row.property_name || row.vacancy_name || 'Commercial stock'} getMeta={(row) => row.available_area_m2 ? `${formatNumber(row.available_area_m2, 'm²')} available` : titleize(row.status)} />
        <RecordList title="Heads of Terms and Leases" rows={[...broker.headsOfTerms, ...broker.leases]} getTitle={(row) => row.premises_description || row.id || 'Commercial record'} getMeta={(row) => `${titleize(row.status)} · ${formatDate(row.updated_at || row.created_at || row.lease_end_date)}`} />
      </section>
    </div>
  )
}

function CommercialBrokersPage() {
  const { brokerId } = useParams()
  const [refreshKey, setRefreshKey] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [pendingInvites, setPendingInvites] = useState([])
  const [form, setForm] = useState({ name: '', email: '', branchId: '', role: 'commercial_broker' })
  const { data, loading, error, organisationId } = useCommercialData(getCommercialBrokerageData, [refreshKey])
  const brokers = data?.brokers || []
  const branches = data?.branchRows || []

  useEffect(() => {
    let active = true
    async function loadInvites() {
      if (!organisationId) {
        setPendingInvites([])
        return
      }
      try {
        const invites = await listWorkspaceUserInvites({ workspaceId: organisationId })
        if (!active) return
        setPendingInvites(invites.filter((invite) => normalizeText(invite.role).includes('commercial')))
      } catch {
        if (active) setPendingInvites([])
      }
    }
    void loadInvites()
    return () => {
      active = false
    }
  }, [organisationId, refreshKey])

  const pendingBrokerRows = useMemo(() => pendingInvites.map((invite) => ({
    id: invite.id,
    name: invite.name || invite.email || 'Invited Broker',
    email: invite.email,
    role: invite.role || 'commercial_broker',
    status: 'pending_invite',
    branchId: invite.branchId,
    branchName: invite.branchName || (invite.branchId ? 'Assigned branch' : 'HQ / Unassigned'),
    activeListings: 0,
    activeVacancies: 0,
    vacanciesManaged: 0,
    activeDeals: 0,
    pipelineValue: 0,
    lastActivityAt: invite.invitedAt,
  })), [pendingInvites])

  const directoryRows = useMemo(() => [...brokers, ...pendingBrokerRows], [brokers, pendingBrokerRows])
  const filteredRows = useMemo(() => {
    const query = normalizeText(searchTerm)
    return directoryRows.filter((broker) => {
      const matchesSearch = !query || [broker.name, broker.email, broker.branchName, broker.role].some((value) => normalizeText(value).includes(query))
      const matchesBranch = branchFilter === 'all' || String(broker.branchId || '') === branchFilter
      const matchesStatus = statusFilter === 'all' || normalizeText(broker.status) === statusFilter
      return matchesSearch && matchesBranch && matchesStatus
    })
  }, [branchFilter, directoryRows, searchTerm, statusFilter])

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleInviteBroker(event) {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    setNotice('')
    try {
      const branch = branches.find((row) => String(row.id) === String(form.branchId))
      await createWorkspaceUserInvite({
        name: form.name,
        email: form.email,
        role: form.role,
        roleLabel: 'Commercial Broker',
        branchId: form.branchId || '',
        branchName: branch?.name || '',
        source: 'commercial_agency_broker_invite',
        metadata: {
          module: 'commercial',
          module_context: 'commercial',
          commercial_role: form.role,
        },
      })
      setForm({ name: '', email: '', branchId: '', role: 'commercial_broker' })
      setModalOpen(false)
      setNotice('Broker invite sent. The broker will appear as active after accepting the email invite.')
      setRefreshKey((value) => value + 1)
    } catch (inviteError) {
      setFormError(inviteError?.message || 'Broker invite could not be sent.')
    } finally {
      setSaving(false)
    }
  }

  if (brokerId) return <BrokerProfile data={data} brokerId={brokerId} />

  return (
    <div className="grid gap-5">
      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Commercial Agency</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-[#102236]">Brokers</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Invite, search, and manage commercial brokers by branch, role, workload, pipeline, and activity.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setModalOpen(true)}><Plus size={16} /> Add Broker</Button>
            <Link to="/settings/users" className="inline-flex min-h-10 w-fit items-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-[#102236]">
              <Users size={16} /> User directory
            </Link>
          </div>
        </div>
      </section>

      {error ? <CommercialEmptyState title="Brokers could not be loaded" description={error} /> : null}
      {notice ? <p className="rounded-3xl border border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700">{notice}</p> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total Brokers" value={loading ? '...' : directoryRows.length} />
        <Metric label="Active Deals" value={loading ? '...' : brokers.reduce((sum, row) => sum + row.activeDeals, 0)} />
        <Metric label="Active Vacancies" value={loading ? '...' : brokers.reduce((sum, row) => sum + (row.activeVacancies || row.vacanciesManaged || 0), 0)} />
        <Metric label="Active Listings" value={loading ? '...' : brokers.reduce((sum, row) => sum + row.activeListings, 0)} />
        <Metric label="Pipeline Value" value={loading ? '...' : formatCurrency(brokers.reduce((sum, row) => sum + row.pipelineValue, 0))} />
        <Metric label="Projected Comm." value={loading ? '...' : formatCurrency(brokers.reduce((sum, row) => sum + (row.projectedCommission || 0), 0))} />
      </section>

      <section className={CARD_CLASS}>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <Field value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search brokers..." className="pl-11" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:w-[520px]">
            <Field as="select" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
              <option value="all">All branches</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Field>
            <Field as="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="pending_invite">Pending invite</option>
              <option value="inactive">Inactive</option>
            </Field>
          </div>
        </div>

        <div className="mt-5 hidden grid-cols-[minmax(260px,1.35fr)_minmax(220px,1fr)_minmax(150px,0.7fr)_minmax(130px,0.6fr)_minmax(150px,0.7fr)_minmax(150px,0.7fr)_auto] gap-4 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 lg:grid">
          <span>Broker</span>
          <span>Branch</span>
          <span>Status</span>
          <span>Listings</span>
          <span>Deals</span>
          <span>Last active</span>
          <span>Actions</span>
        </div>
        <div className="mt-3 grid gap-3">
          {loading ? <div className="h-32 animate-pulse rounded-3xl bg-slate-100" /> : filteredRows.map((broker) => <BrokerDirectoryRow key={`${broker.status}-${broker.id}`} broker={broker} />)}
        </div>
      </section>

      {!loading && !filteredRows.length ? <CommercialEmptyState title="No commercial brokers found" description="Invite brokers by email, then assign them to commercial branches, requirements, deals, vacancies, and listings." primaryActionLabel="Add Broker" onPrimaryAction={() => setModalOpen(true)} /> : null}

      <Modal
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title="Invite Broker"
        subtitle="Send an email invite that links this user to the commercial organisation as a broker."
        footer={(
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="commercial-broker-invite-form" disabled={saving}>{saving ? 'Sending...' : 'Send Invite'}</Button>
          </div>
        )}
      >
        <form id="commercial-broker-invite-form" className="grid gap-4" onSubmit={handleInviteBroker}>
          {formError ? <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{formError}</p> : null}
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Broker name
            <Field value={form.name} onChange={(event) => updateField('name', event.target.value)} placeholder="Alex Broker" required />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Email address
            <Field type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} placeholder="broker@example.com" required />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Branch
              <Field as="select" value={form.branchId} onChange={(event) => updateField('branchId', event.target.value)}>
                <option value="">HQ / Unassigned</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </Field>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Access level
              <Field as="select" value={form.role} onChange={(event) => updateField('role', event.target.value)}>
                <option value="commercial_broker">Commercial Broker</option>
              </Field>
            </label>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default CommercialBrokersPage
