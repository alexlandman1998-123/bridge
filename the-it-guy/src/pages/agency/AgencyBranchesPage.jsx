import { Building2, Gauge, MapPin, Plus, RefreshCw, Search, UserRound, Users, ArrowRightLeft, FileCheck2, Banknote } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import SectionHeader from '../../components/ui/SectionHeader'
import SummaryCards from '../../components/SummaryCards'
import { createBranch, getBranches } from '../../services/agencyBranchService'

function normalizeText(value) {
  return String(value || '').trim()
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function BranchKpiTile({ label, value }) {
  return (
    <article className="rounded-[14px] border border-[#e4ebf4] bg-[#fbfcfe] px-3 py-3">
      <span className="block text-[0.69rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{label}</span>
      <strong className="mt-1.5 block text-[1.08rem] font-semibold tracking-[-0.02em] text-[#142132]">{value}</strong>
    </article>
  )
}

function NewBranchModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    city: '',
    province: '',
    address: '',
    managerName: '',
    email: '',
    phone: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setForm({ name: '', city: '', province: '', address: '', managerName: '', email: '', phone: '' })
      setSaving(false)
      setError('')
    }
  }, [open])

  async function handleCreate() {
    setSaving(true)
    setError('')
    try {
      const created = await createBranch(form)
      if (typeof onCreated === 'function') {
        onCreated(created)
      }
      onClose?.()
    } catch (creationError) {
      setError(creationError?.message || 'Unable to create branch right now.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create New Branch"
      subtitle="Add a new office, franchise, or team branch to your agency structure."
      footer={(
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create Branch'}</Button>
        </div>
      )}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 md:col-span-2">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch Name</span>
          <Field value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} placeholder="e.g. Samlin Realty — Bartlett" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">City</span>
          <Field value={form.city} onChange={(event) => setForm((previous) => ({ ...previous, city: event.target.value }))} placeholder="e.g. Boksburg" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Province</span>
          <Field value={form.province} onChange={(event) => setForm((previous) => ({ ...previous, province: event.target.value }))} placeholder="e.g. Gauteng" />
        </label>
        <label className="grid gap-1.5 md:col-span-2">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Address</span>
          <Field value={form.address} onChange={(event) => setForm((previous) => ({ ...previous, address: event.target.value }))} placeholder="Street address" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Principal / Manager</span>
          <Field value={form.managerName} onChange={(event) => setForm((previous) => ({ ...previous, managerName: event.target.value }))} placeholder="Name" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch Email</span>
          <Field type="email" value={form.email} onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))} placeholder="branch@agency.com" />
        </label>
        <label className="grid gap-1.5 md:col-span-2">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch Phone</span>
          <Field value={form.phone} onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))} placeholder="Contact number" />
        </label>
      </div>
      {error ? <p className="mt-4 rounded-[12px] border border-[#f2d7d7] bg-[#fff6f6] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
    </Modal>
  )
}

export default function AgencyBranchesPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [organisationFilter, setOrganisationFilter] = useState('all')
  const [provinceFilter, setProvinceFilter] = useState('all')
  const [showCreateModal, setShowCreateModal] = useState(false)

  const loadBranches = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const branchRows = await getBranches()
      setRows(branchRows)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load branches right now.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBranches()
  }, [loadBranches])

  const organisationOptions = useMemo(() => {
    const map = new Map()
    for (const row of rows) {
      const id = normalizeText(row?.organisationId)
      if (!id) continue
      if (!map.has(id)) {
        map.set(id, id)
      }
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }))
  }, [rows])

  const provinceOptions = useMemo(() => {
    const values = [...new Set(rows.map((row) => normalizeText(row?.province)).filter(Boolean))]
    return values.sort((left, right) => left.localeCompare(right))
  }, [rows])

  const filteredRows = useMemo(() => {
    const query = normalizeText(searchTerm).toLowerCase()
    return rows.filter((row) => {
      const organisationMatch = organisationFilter === 'all' ? true : normalizeText(row?.organisationId) === organisationFilter
      const provinceMatch = provinceFilter === 'all' ? true : normalizeText(row?.province).toLowerCase() === provinceFilter.toLowerCase()
      const searchMatch = !query
        ? true
        : `${row?.name || ''} ${row?.city || ''} ${row?.province || ''} ${row?.principalName || ''}`.toLowerCase().includes(query)
      return organisationMatch && provinceMatch && searchMatch
    })
  }, [rows, organisationFilter, provinceFilter, searchTerm])

  const summaryItems = useMemo(() => {
    const activeBranches = rows.filter((row) => row?.isActive !== false).length
    const activeAgents = rows.reduce((sum, row) => sum + Number(row?.kpis?.activeAgents || 0), 0)
    const activeTransactions = rows.reduce((sum, row) => sum + Number(row?.kpis?.activeTransactions || 0), 0)
    const pipelineValue = rows.reduce((sum, row) => sum + Number(row?.kpis?.pipelineValue || 0), 0)
    return [
      { label: 'Active Branches', value: activeBranches, icon: Building2 },
      { label: 'Active Agents', value: activeAgents, icon: Users },
      { label: 'Active Transactions', value: activeTransactions, icon: ArrowRightLeft },
      { label: 'Pipeline Value', value: formatCurrency(pipelineValue), icon: Banknote },
    ]
  }, [rows])

  return (
    <section className="flex flex-col">
      {error ? <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p> : null}
      {loading ? <p className="rounded-[16px] border border-[#dde4ee] bg-white px-5 py-4 text-sm text-[#6b7d93]">Loading branches...</p> : null}

      {!loading ? (
        <>
          <section className="mt-6">
            <SummaryCards items={summaryItems} />
          </section>

          <section className="mt-4 rounded-[22px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid min-w-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,180px))]">
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Search</span>
                  <div className="flex h-[44px] min-w-0 items-center gap-3 rounded-[14px] border border-[#dde4ee] bg-white px-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]">
                    <Search size={16} className="shrink-0 text-[#8ca0b6]" />
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search branch, city, principal..."
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[#162334] outline-none placeholder:text-[#96a6b8]"
                    />
                  </div>
                </label>

                <label className="flex min-w-0 flex-col gap-2">
                  <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Organisation</span>
                  <Field as="select" value={organisationFilter} onChange={(event) => setOrganisationFilter(event.target.value)} className="h-[44px]">
                    <option value="all">All Organisations</option>
                    {organisationOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </Field>
                </label>

                <label className="flex min-w-0 flex-col gap-2">
                  <span className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Province</span>
                  <Field as="select" value={provinceFilter} onChange={(event) => setProvinceFilter(event.target.value)} className="h-[44px]">
                    <option value="all">All Provinces</option>
                    {provinceOptions.map((province) => (
                      <option key={province} value={province}>{province}</option>
                    ))}
                  </Field>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 xl:justify-end">
                <Button variant="ghost" onClick={loadBranches} disabled={loading}><RefreshCw size={16} />Refresh</Button>
                <Button variant="secondary" onClick={() => navigate('/settings/users', { state: { openInvite: true } })}>Invite Principal / Manager</Button>
                <Button onClick={() => setShowCreateModal(true)}><Plus size={16} />New Branch</Button>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-[22px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <SectionHeader
              title="Branches"
              copy="Manage offices, teams, agents, and branch performance."
              actions={<span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">{filteredRows.length} branches</span>}
            />

            {!filteredRows.length ? (
              <div className="mt-6 rounded-[18px] border border-dashed border-[#d7e1ec] bg-[#fbfdff] p-10 text-center">
                <h3 className="text-[1.04rem] font-semibold text-[#1a2a3d]">No branches yet</h3>
                <p className="mt-2 text-sm text-[#66758b]">Create your first branch to start structuring office performance and agent ownership.</p>
                <div className="mt-4">
                  <Button onClick={() => setShowCreateModal(true)}><Plus size={16} />New Branch</Button>
                </div>
              </div>
            ) : (
              <div className="mt-8 grid gap-5 xl:grid-cols-2">
                {filteredRows.map((branch) => (
                  <article key={branch.id} className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition duration-150 ease-out hover:-translate-y-[1px] hover:shadow-[0_16px_30px_rgba(15,23,42,0.08)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-[1.15rem] font-semibold tracking-[-0.03em] text-[#142132]">{branch.name}</h3>
                        <p className="mt-1 inline-flex items-center gap-2 text-[0.9rem] text-[#60758d]"><MapPin size={14} />{branch.location}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[#7b8ca2]">Principal: {branch.principalName}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.75rem] font-semibold ${branch.isActive ? 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]' : 'border-[#f4d7d4] bg-[#fff4f3] text-[#b42318]'}`}>{branch.isActive ? 'Active' : 'Suspended'}</span>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
                      <BranchKpiTile label="Active Agents" value={branch.kpis.activeAgents} />
                      <BranchKpiTile label="Active Listings" value={branch.kpis.activeListings} />
                      <BranchKpiTile label="Active Transactions" value={branch.kpis.activeTransactions} />
                      <BranchKpiTile label="Pipeline Value" value={formatCurrency(branch.kpis.pipelineValue)} />
                      <BranchKpiTile label="Registered" value={branch.kpis.registeredDeals} />
                      <BranchKpiTile label="Conversion Rate" value={`${branch.kpis.conversionRate}%`} />
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#e5ebf4] pt-4">
                      <Button size="sm" onClick={() => navigate(`/agency/branches/${branch.id}`)}><Gauge size={15} />View Branch</Button>
                      <Button size="sm" variant="secondary" onClick={() => navigate('/agency/agents', { state: { branchId: branch.id } })}><UserRound size={15} />Manage Agents</Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      <NewBranchModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          void loadBranches()
        }}
      />
    </section>
  )
}
