import { Grid3X3, List, Plus, User2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import { ViewToggle } from '../components/ui/FilterBar'
import Modal from '../components/ui/Modal'
import SearchInput from '../components/ui/SearchInput'
import DataTable, { DataTableInner } from '../components/ui/DataTable'
import { deriveAttorneyClients, filterAttorneyClients } from '../core/clients/attorneyClientSelectors'
import { useWorkspace } from '../context/WorkspaceContext'
import { createClientRecord, fetchDashboardOverview, fetchTransactionsByParticipant } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const CLIENT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'buyers', label: 'Buyers' },
  { key: 'sellers', label: 'Sellers' },
  { key: 'trusts', label: 'Trusts' },
  { key: 'companies', label: 'Companies' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
]

function formatRelativeTime(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'No recent activity'
  const diffMs = Date.now() - date.getTime()
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Just now'
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  if (diffMs < hour) return `${Math.floor(diffMs / (60 * 1000))}m ago`
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`
  if (diffMs < day * 7) return `${Math.floor(diffMs / day)}d ago`
  return date.toLocaleDateString('en-ZA')
}

function getInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
  return parts.map((item) => item[0]?.toUpperCase() || '').join('') || 'CL'
}

function getAvatarTone(name = '') {
  const tones = [
    'from-[#35546c] to-[#5e7f98]',
    'from-[#31506a] to-[#537390]',
    'from-[#40647d] to-[#718ea3]',
    'from-[#2f4f68] to-[#4f7698]',
  ]
  const index = Math.abs(String(name).split('').reduce((total, char) => total + char.charCodeAt(0), 0)) % tones.length
  return tones[index]
}

function getClientsPageCopy(role) {
  if (role === 'developer' || role === 'attorney') {
    return {
      subtitle: 'People and entities across your developments and transactions',
      emptyCopy: 'Clients will appear here once transactions are created across your developments.',
      emptyDetail: 'This becomes the client identity layer across your portfolio as buyers and purchaser entities are linked.',
    }
  }

  if (role === 'agent') {
    return {
      subtitle: 'People and entities across your active deals',
      emptyCopy: 'Clients will appear here once transactions are created.',
      emptyDetail: 'This becomes the calm contact layer across your deals as buyers and entities are linked into transactions.',
    }
  }

  if (role === 'bond_originator') {
    return {
      subtitle: 'People and entities across your finance applications',
      emptyCopy: 'Clients will appear here once finance-linked transactions are assigned to you.',
      emptyDetail: 'This becomes the client identity layer across your application book as buyers and purchaser entities are linked into bond matters.',
    }
  }

  return {
    subtitle: 'People and entities across your transactions',
    emptyCopy: 'Clients will appear here once transactions are created.',
    emptyDetail: 'This page becomes the calm identity layer across your matters as buyers and entities get linked.',
  }
}

function getMatterPath({ role, transactionId, unitId, fallbackSearch = '' }) {
  if (unitId) {
    return `/units/${unitId}`
  }

  if (role === 'attorney' && transactionId) {
    return `/transactions/${transactionId}`
  }

  return fallbackSearch ? `/units?search=${encodeURIComponent(fallbackSearch)}` : '/units'
}

function AddClientModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setForm({ name: '', email: '', phone: '' })
      setSaving(false)
      setError('')
    }
  }, [open])

  async function handleSave() {
    try {
      setSaving(true)
      setError('')
      const created = await createClientRecord(form)
      onSaved?.(created)
      onClose()
    } catch (saveError) {
      setError(saveError.message || 'Unable to create client.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Client"
      subtitle="Create a client record that can later be linked into transactions."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Client'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 sm:col-span-2">
          <span className="text-sm font-medium text-slate-600">Full Name / Entity Name</span>
          <Field value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-600">Email</span>
          <Field
            type="email"
            value={form.email}
            onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-600">Phone</span>
          <Field value={form.phone} onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))} />
        </label>
        {error ? (
          <p className="sm:col-span-2 rounded-[16px] border border-[#f6d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

function Clients() {
  const navigate = useNavigate()
  const { profile, role, workspace } = useWorkspace()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [viewMode, setViewMode] = useState('grid')
  const [showAddModal, setShowAddModal] = useState(false)

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      let transactionRows = []

      if (role === 'developer') {
        const overview = await fetchDashboardOverview({
          developmentId: workspace.id === 'all' ? null : workspace.id,
        })
        transactionRows = overview?.rows || []
      } else if ((role === 'agent' || role === 'attorney' || role === 'bond_originator') && profile?.id) {
        transactionRows = await fetchTransactionsByParticipant({ userId: profile.id, roleType: role })
        if (workspace.id !== 'all') {
          transactionRows = (transactionRows || []).filter((row) =>
            (row?.development?.id || row?.unit?.development_id) === workspace.id,
          )
        }
      } else {
        transactionRows = []
      }

      setRows(transactionRows || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load clients.')
    } finally {
      setLoading(false)
    }
  }, [profile?.id, role, workspace.id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const clients = useMemo(() => deriveAttorneyClients(rows), [rows])
  const filteredClients = useMemo(() => filterAttorneyClients(clients, { search, filter: activeFilter }), [clients, search, activeFilter])
  const pageCopy = useMemo(() => getClientsPageCopy(role), [role])

  return (
    <section className="space-y-5">
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)] no-print">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[280px] flex-1 md:min-w-[360px]">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, phone, property or matter"
            />
          </div>
          <div className="w-full sm:w-[220px] lg:w-[240px]">
            <Field as="select" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}>
              {CLIENT_FILTERS.map((filter) => (
                <option key={filter.key} value={filter.key}>
                  {filter.label}
                </option>
              ))}
            </Field>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <ViewToggle
              items={[
                { key: 'grid', label: 'Grid View', icon: Grid3X3 },
                { key: 'list', label: 'List View', icon: List },
              ]}
              value={viewMode}
              onChange={setViewMode}
            />
            <Button onClick={() => setShowAddModal(true)}>
              <Plus size={16} />
              Add Client
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-[22px] border border-[#f6d4d4] bg-[#fff5f5] px-5 py-4 text-sm text-[#b42318]">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <LoadingSkeleton lines={8} />
        </div>
      ) : null}

      {!loading && !filteredClients.length ? (
        <section className="flex flex-col items-center rounded-[28px] border border-[#dde4ee] bg-white px-6 py-12 text-center shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full border border-[#dbe4ef] bg-[#f6f9fc] text-[#5d7690]">
            <User2 size={28} />
          </div>
          <h3 className="text-[1.18rem] font-semibold tracking-[-0.025em] text-[#142132]">{pageCopy.emptyCopy}</h3>
          <p className="mt-3 max-w-[560px] text-sm leading-7 text-[#6b7d93]">{pageCopy.emptyDetail}</p>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus size={16} />
            Add Client
          </Button>
        </section>
      ) : null}

      {!loading && filteredClients.length && viewMode === 'grid' ? (
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filteredClients.map((client) => {
            const latestRow = (client.transactions || []).find(
              (row) => String(row?.transaction?.id || '') === String(client.latestTransactionId || ''),
            )

            return (
              <article
                key={client.id}
                className="group flex h-full cursor-pointer flex-col rounded-[28px] border border-[#dde4ee] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(15,23,42,0.09)]"
                onClick={() => navigate(`/clients/${client.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    navigate(`/clients/${client.id}`)
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-start gap-4">
                  <div className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarTone(client.name)} text-lg font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)]`}>
                    {getInitials(client.name)}
                  </div>
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-[1.15rem] font-semibold tracking-[-0.03em] text-[#142132]">{client.name}</h3>
                      <p className="mt-1 truncate text-sm text-[#6b7d93]">{client.entityName || client.email || client.phone || 'No contact details yet'}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center rounded-full border border-[#d9e3ef] bg-[#f7f9fc] px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#5c738d]">
                        {client.typeLabel}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-3.5">
                    <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Role</span>
                    <strong className="mt-2 block text-base font-semibold text-[#142132]">{client.roleLabel}</strong>
                  </div>
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-3.5">
                    <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Contact</span>
                    <strong className="mt-2 block truncate text-base font-semibold text-[#142132]">{client.email || client.phone || 'No contact details'}</strong>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                    <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Last Activity</span>
                    <strong className="mt-2 block text-base font-semibold text-[#142132]">{formatRelativeTime(client.lastActivityAt)}</strong>
                  </div>
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                    <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Transactions</span>
                    <strong className="mt-2 block text-base font-semibold text-[#142132]">{client.activeTransactions}</strong>
                  </div>
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                    <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Status</span>
                    <span
                      className={`mt-2 inline-flex items-center justify-center rounded-full px-3 py-1.5 text-[0.78rem] font-semibold ${
                        client.status === 'active'
                          ? 'border border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
                          : 'border border-[#dde4ee] bg-[#f7f9fc] text-[#66758b]'
                      }`}
                    >
                      {client.statusLabel}
                    </span>
                  </div>
                </div>

                <footer className="mt-4 flex flex-1 flex-col justify-end border-t border-[#edf2f7] pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm text-[#6b7d93]">Linked deal profile and recent matter access.</span>
                    <div className="flex flex-wrap gap-2">
                      {client.latestTransactionId ? (
                        <Button
                          variant="secondary"
                          className="min-h-[38px] px-3 py-2"
                          onClick={(event) => {
                            event.stopPropagation()
                            navigate(
                              getMatterPath({
                                role,
                                transactionId: latestRow?.transaction?.id || null,
                                unitId: latestRow?.unit?.id || null,
                                fallbackSearch: client.name,
                              }),
                            )
                          }}
                        >
                          Open Latest Matter
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        className="min-h-[38px] px-3 py-2 text-[#244b72] hover:bg-[#eff4f8] hover:text-[#1d3d5f]"
                        onClick={(event) => {
                          event.stopPropagation()
                          navigate(`/clients/${client.id}`)
                        }}
                      >
                        View Profile
                      </Button>
                    </div>
                  </div>
                </footer>
              </article>
            )
          })}
        </section>
      ) : null}

      {!loading && filteredClients.length && viewMode === 'list' ? (
        <DataTable className="rounded-[24px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <DataTableInner className="rounded-[24px]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Role</th>
                  <th>Active Transactions</th>
                  <th>Last Activity</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    className="ui-data-row-clickable"
                    onClick={() => navigate(`/clients/${client.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigate(`/clients/${client.id}`)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td>{client.name}</td>
                    <td>{client.typeLabel}</td>
                    <td>{client.roleLabel}</td>
                    <td>{client.activeTransactions}</td>
                    <td>{formatRelativeTime(client.lastActivityAt)}</td>
                    <td>{client.email || client.phone || '-'}</td>
                  </tr>
                ))}
              </tbody>
          </DataTableInner>
        </DataTable>
      ) : null}

      <AddClientModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSaved={() => {
          void loadData()
        }}
      />
    </section>
  )
}

export default Clients
