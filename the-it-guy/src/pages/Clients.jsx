import { Archive, ExternalLink, Grid3X3, List, Mail, MessageCircle, MoreVertical, Phone, Plus, User2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import { ViewToggle } from '../components/ui/FilterBar'
import Modal from '../components/ui/Modal'
import SearchInput from '../components/ui/SearchInput'
import DataTable, { DataTableInner } from '../components/ui/DataTable'
import {
  filterAgentClientDirectory,
  getAgentClientOpenPath,
  loadAgentClientDirectory,
} from '../core/clients/agentClientDirectory'
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

const AGENT_TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'buyer_leads', label: 'Buyer Leads' },
  { key: 'seller_leads', label: 'Seller Leads' },
  { key: 'prospects', label: 'Prospects' },
  { key: 'buyers', label: 'Buyers' },
  { key: 'sellers', label: 'Sellers' },
  { key: 'companies', label: 'Companies' },
  { key: 'trusts', label: 'Trusts' },
]

const AGENT_STATUS_FILTERS = [
  { key: 'all', label: 'All Statuses' },
  { key: 'new', label: 'New' },
  { key: 'active', label: 'Active' },
  { key: 'follow_up_due', label: 'Follow-up Due' },
  { key: 'transaction_linked', label: 'Transaction Linked' },
  { key: 'archived', label: 'Archived' },
]

const ARCHIVED_CLIENTS_STORAGE_KEY = 'itg:agent-clients-archived:v1'
const NO_DEVELOPMENT_ID = 'no-development-assigned'
const CLIENT_FILTER_ALIASES = {
  buyer: 'buyers',
  company: 'companies',
  company_trust: 'companies',
  'company-trust': 'companies',
  'companies-trusts': 'companies',
  trust: 'trusts',
}

function normalizeClientFilterParam(value = '', allowedKeys = []) {
  const key = String(value || '').trim().toLowerCase().replace(/\s+/g, '-')
  if (!key) return ''
  const normalized = CLIENT_FILTER_ALIASES[key] || key
  return allowedKeys.includes(normalized) ? normalized : ''
}

function getRowDevelopmentId(row = {}) {
  return String(row?.development?.id || row?.transaction?.development_id || row?.transaction?.developmentId || row?.unit?.development_id || '').trim()
}

function getDevelopmentOptionsFromRows(rows = []) {
  const options = new Map()
  for (const row of rows) {
    const id = getRowDevelopmentId(row)
    if (!id) {
      continue
    }
    if (!options.has(id)) {
      options.set(id, {
        id,
        name: row?.development?.name || row?.transaction?.development_name || 'Unnamed Development',
      })
    }
  }
  return [
    { id: 'all', name: 'All Developments' },
    { id: NO_DEVELOPMENT_ID, name: 'No Development Assigned' },
    ...[...options.values()].sort((left, right) => left.name.localeCompare(right.name)),
  ]
}

function filterRowsByDevelopment(rows = [], developmentId = 'all') {
  if (!developmentId || developmentId === 'all') return rows
  if (developmentId === NO_DEVELOPMENT_ID) return rows.filter((row) => !getRowDevelopmentId(row))
  return rows.filter((row) => getRowDevelopmentId(row) === developmentId)
}

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
  if (role === 'agent') {
    return {
      subtitle: 'Buyer leads, seller leads, prospects and transaction clients in one contact layer',
      emptyCopy: 'No contacts found yet.',
      emptyDetail: 'Buyer leads, seller leads, prospects and transaction clients will appear here as soon as they are captured.',
    }
  }

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
      emptyCopy: 'Clients will appear here once finance-linked applications are assigned to you.',
      emptyDetail: 'This becomes the client identity layer across your application book as buyers and purchaser entities are linked into bond applications.',
    }
  }

  return {
    subtitle: 'People and entities across your transactions',
    emptyCopy: 'Clients will appear here once transactions are created.',
    emptyDetail: 'This page becomes the calm identity layer across your matters as buyers and entities get linked.',
  }
}

function readArchivedClientIds() {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ARCHIVED_CLIENTS_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeArchivedClientIds(ids = []) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ARCHIVED_CLIENTS_STORAGE_KEY, JSON.stringify([...new Set(ids)]))
}

function normalizePhoneForHref(value = '') {
  return String(value || '').replace(/\D/g, '')
}

function getStatusBadgeClass(status = '') {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('transaction')) return 'border-[#cfe1f7] bg-[#f0f6ff] text-[#275f9a]'
  if (normalized.includes('follow')) return 'border-[#f1d49a] bg-[#fff7e8] text-[#8a5a12]'
  if (normalized.includes('archived')) return 'border-[#e2d7cd] bg-[#faf7f3] text-[#735744]'
  if (normalized.includes('new')) return 'border-[#dde4ee] bg-[#f7fafd] text-[#39546d]'
  return 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
}

function TypeBadges({ client }) {
  const labels = String(client?.roleLabel || client?.typeLabel || 'Client')
    .split('+')
    .map((item) => item.trim())
    .filter(Boolean)
  return (
    <div className="flex flex-wrap gap-1.5">
      {(labels.length ? labels : ['Client']).slice(0, 3).map((label) => (
        <span
          key={label}
          className="inline-flex items-center rounded-full border border-[#dbe4ef] bg-[#f7fafd] px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#4d6680]"
        >
          {label}
        </span>
      ))}
    </div>
  )
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
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { profile, role, workspace } = useWorkspace()
  const [rows, setRows] = useState([])
  const [agentFilters, setAgentFilters] = useState({ sources: [], assignedAgents: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [assignedAgentFilter, setAssignedAgentFilter] = useState('all')
  const [viewMode, setViewMode] = useState('grid')
  const [viewModeTouched, setViewModeTouched] = useState(false)
  const [archivedClientIds, setArchivedClientIds] = useState(() => readArchivedClientIds())
  const [openActionMenuId, setOpenActionMenuId] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const isAgentClientDirectory = role === 'agent'
  const isBondClientsRoute = role === 'bond_originator' || location.pathname.startsWith('/bond/clients')
  const selectedDevelopmentId = searchParams.get('developmentId') || 'all'
  const typeFilters = useMemo(
    () => (isAgentClientDirectory ? AGENT_TYPE_FILTERS : CLIENT_FILTERS),
    [isAgentClientDirectory],
  )

  useEffect(() => {
    const nextFilter = normalizeClientFilterParam(
      searchParams.get('view') || searchParams.get('type'),
      typeFilters.map((filter) => filter.key),
    )
    if (nextFilter && nextFilter !== activeFilter) {
      setActiveFilter(nextFilter)
    }
  }, [activeFilter, searchParams, typeFilters])

  const loadData = useCallback(async () => {
    if (isAgentClientDirectory) {
      try {
        setLoading(true)
        setError('')
        const directory = await loadAgentClientDirectory({ profile, role, workspace })
        setRows(directory.clients || [])
        setAgentFilters(directory.filters || { sources: [], assignedAgents: [] })
      } catch (loadError) {
        setError(loadError.message || 'Unable to load contacts.')
      } finally {
        setLoading(false)
      }
      return
    }

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
  }, [isAgentClientDirectory, profile, role, workspace])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const developmentOptions = useMemo(() => getDevelopmentOptionsFromRows(rows), [rows])
  const sourceRows = useMemo(
    () => (isAgentClientDirectory ? rows : filterRowsByDevelopment(rows, selectedDevelopmentId)),
    [isAgentClientDirectory, rows, selectedDevelopmentId],
  )
  const clients = useMemo(() => (isAgentClientDirectory ? sourceRows : deriveAttorneyClients(sourceRows)), [isAgentClientDirectory, sourceRows])
  const filteredClients = useMemo(
    () =>
      isAgentClientDirectory
        ? filterAgentClientDirectory(clients, {
            search,
            type: activeFilter,
            status: statusFilter,
            source: sourceFilter,
            assignedAgent: assignedAgentFilter,
            archivedIds: archivedClientIds,
          })
        : filterAttorneyClients(clients, { search, filter: activeFilter }),
    [activeFilter, archivedClientIds, assignedAgentFilter, clients, isAgentClientDirectory, search, sourceFilter, statusFilter],
  )
  const pageCopy = useMemo(() => getClientsPageCopy(role), [role])

  useEffect(() => {
    if (loading || viewModeTouched) return
    setViewMode((clients || []).length > 10 ? 'list' : 'grid')
  }, [clients, loading, viewModeTouched])

  function handleViewModeChange(nextMode) {
    setViewModeTouched(true)
    setViewMode(nextMode)
  }

  function handleTypeFilterChange(event) {
    const nextFilter = event.target.value
    setActiveFilter(nextFilter)
    const nextParams = new URLSearchParams(searchParams)
    if (nextFilter === 'all') {
      nextParams.delete('view')
      nextParams.delete('type')
    } else {
      nextParams.set('view', nextFilter)
      nextParams.delete('type')
    }
    setSearchParams(nextParams, { replace: true })
  }

  function handleDevelopmentFilterChange(event) {
    const nextDevelopmentId = event.target.value
    const nextParams = new URLSearchParams(searchParams)
    if (nextDevelopmentId === 'all') nextParams.delete('developmentId')
    else nextParams.set('developmentId', nextDevelopmentId)
    setSearchParams(nextParams, { replace: true })
  }

  function handleOpenClient(client) {
    if (isAgentClientDirectory) {
      navigate(getAgentClientOpenPath(client, role))
      return
    }
    navigate(`${isBondClientsRoute ? '/bond/clients' : '/clients'}/${client.id}`)
  }

  function handleArchiveClient(client) {
    const next = [...new Set([...archivedClientIds, client.id])]
    setArchivedClientIds(next)
    writeArchivedClientIds(next)
    setOpenActionMenuId('')
  }

  function handleQuickAction(event, client, action) {
    event.stopPropagation()
    const phoneDigits = normalizePhoneForHref(client.phone)
    if (action === 'call' && phoneDigits) {
      window.location.href = `tel:${phoneDigits}`
    } else if (action === 'email' && client.email) {
      window.location.href = `mailto:${client.email}`
    } else if (action === 'whatsapp' && phoneDigits) {
      window.open(`https://wa.me/${phoneDigits}`, '_blank', 'noopener,noreferrer')
    } else if (action === 'archive') {
      handleArchiveClient(client)
    } else if (action === 'open') {
      handleOpenClient(client)
    }
  }

  return (
    <section className="space-y-5">
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)] no-print">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[280px] flex-1 md:min-w-[360px]">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, phone, property, listing or matter"
            />
          </div>
          <div className="w-full sm:w-[220px] lg:w-[240px]">
            <Field as="select" value={activeFilter} onChange={handleTypeFilterChange}>
              {typeFilters.map((filter) => (
                <option key={filter.key} value={filter.key}>
                  {filter.label}
                </option>
              ))}
            </Field>
          </div>
          {!isAgentClientDirectory ? (
            <div className="w-full sm:w-[220px] lg:w-[240px]">
              <Field as="select" value={selectedDevelopmentId} onChange={handleDevelopmentFilterChange}>
                {developmentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Field>
            </div>
          ) : null}
          {isAgentClientDirectory ? (
            <>
              <div className="w-full sm:w-[200px]">
                <Field as="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  {AGENT_STATUS_FILTERS.map((filter) => (
                    <option key={filter.key} value={filter.key}>
                      {filter.label}
                    </option>
                  ))}
                </Field>
              </div>
              <div className="w-full sm:w-[200px]">
                <Field as="select" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                  <option value="all">All Sources</option>
                  {(agentFilters.sources || []).map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </Field>
              </div>
              <div className="w-full sm:w-[220px]">
                <Field as="select" value={assignedAgentFilter} onChange={(event) => setAssignedAgentFilter(event.target.value)}>
                  <option value="all">All Agents</option>
                  {(agentFilters.assignedAgents || []).map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.label}
                    </option>
                  ))}
                </Field>
              </div>
            </>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <ViewToggle
              items={[
                { key: 'grid', label: 'Grid View', icon: Grid3X3 },
                { key: 'list', label: 'List View', icon: List },
              ]}
              value={viewMode}
              onChange={handleViewModeChange}
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
          <Button className="mt-5" onClick={() => setShowAddModal(true)}>
            <Plus size={16} />
            Add Client
          </Button>
        </section>
      ) : null}

      {!loading && filteredClients.length > 0 && viewMode === 'grid' ? (
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filteredClients.map((client) => {
            return (
              <article
                key={client.id}
                className="group flex h-full cursor-pointer flex-col rounded-[28px] border border-[#dde4ee] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(15,23,42,0.09)]"
                onClick={() => handleOpenClient(client)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleOpenClient(client)
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
                    <TypeBadges client={client} />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-3.5">
                    <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Role</span>
                    <strong className="mt-2 block text-base font-semibold text-[#142132]">{client.roleLabel}</strong>
                  </div>
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-3.5">
                    <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Contact</span>
                    <strong className="mt-2 block truncate text-base font-semibold text-[#142132]">{client.phone || 'No phone'}</strong>
                    <span className="mt-1 block truncate text-xs text-[#6b7d93]">{client.email || 'No email'}</span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                    <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Last Activity</span>
                    <strong className="mt-2 block text-base font-semibold text-[#142132]">{formatRelativeTime(client.lastActivityAt)}</strong>
                  </div>
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                    <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Source</span>
                    <strong className="mt-2 block truncate text-base font-semibold text-[#142132]">{client.sourceLabel || 'Manual'}</strong>
                  </div>
                  <div className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                    <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Status</span>
                    <span
                      className={`mt-2 inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-[0.78rem] font-semibold ${getStatusBadgeClass(client.statusLabel)}`}
                    >
                      {client.statusLabel}
                    </span>
                  </div>
                </div>

                <div className="mt-4 rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-3.5">
                  <span className="block text-[0.73rem] uppercase tracking-[0.1em] text-[#7b8ca2]">Linked Record</span>
                  <strong className="mt-2 block truncate text-base font-semibold text-[#142132]">{client.linkedRecordLabel || client.latestPropertyLabel || 'No linked record'}</strong>
                  <span className="mt-1 block truncate text-xs text-[#6b7d93]">{client.assignedAgentName || client.assignedAgentEmail || 'No assigned agent'}</span>
                </div>

                <footer className="mt-4 flex flex-1 flex-col justify-end border-t border-[#edf2f7] pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-sm text-[#6b7d93]">{client.assignedAgentName || client.assignedAgentEmail || 'Workspace contact'}</span>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" className="min-h-[38px] px-3 py-2" onClick={(event) => handleQuickAction(event, client, 'open')}>
                        <ExternalLink size={15} />
                        Open
                      </Button>
                      <Button variant="ghost" className="min-h-[38px] px-3 py-2" disabled={!client.phone} onClick={(event) => handleQuickAction(event, client, 'call')} title="Call">
                        <Phone size={15} />
                      </Button>
                      <Button variant="ghost" className="min-h-[38px] px-3 py-2" disabled={!client.email} onClick={(event) => handleQuickAction(event, client, 'email')} title="Email">
                        <Mail size={15} />
                      </Button>
                      <Button variant="ghost" className="min-h-[38px] px-3 py-2" disabled={!client.phone} onClick={(event) => handleQuickAction(event, client, 'whatsapp')} title="WhatsApp">
                        <MessageCircle size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-h-[38px] px-3 py-2 text-[#244b72] hover:bg-[#eff4f8] hover:text-[#1d3d5f]"
                        onClick={(event) => handleQuickAction(event, client, 'archive')}
                      >
                        <Archive size={15} />
                      </Button>
                    </div>
                  </div>
                </footer>
              </article>
            )
          })}
        </section>
      ) : null}

      {!loading && filteredClients.length > 0 && viewMode === 'list' ? (
        <DataTable className="rounded-[24px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <DataTableInner className="rounded-[24px]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Contact</th>
                  <th>Source</th>
                  <th>Linked Record</th>
                  <th>Status</th>
                  <th>Assigned Agent</th>
                  <th>Last Activity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    className="ui-data-row-clickable"
                    onClick={() => handleOpenClient(client)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        handleOpenClient(client)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td>
                      <div className="flex min-w-[190px] items-center gap-3">
                        <div className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarTone(client.name)} text-sm font-semibold text-white`}>
                          {getInitials(client.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#142132]">{client.name}</p>
                          <p className="truncate text-xs text-[#6b7d93]">{client.latestPropertyLabel || client.linkedRecordLabel || 'Contact record'}</p>
                        </div>
                      </div>
                    </td>
                    <td><TypeBadges client={client} /></td>
                    <td>
                      <div className="min-w-[180px]">
                        <p className="truncate text-sm font-semibold text-[#142132]">{client.phone || 'No phone'}</p>
                        <p className="truncate text-xs text-[#6b7d93]">{client.email || 'No email'}</p>
                      </div>
                    </td>
                    <td>{client.sourceLabel || 'Manual'}</td>
                    <td>
                      <div className="min-w-[180px]">
                        <p className="truncate text-sm font-semibold text-[#142132]">{client.linkedRecordLabel || 'No linked record'}</p>
                        <p className="truncate text-xs text-[#6b7d93]">{client.linkedLeadIds?.[0] || client.linkedTransactionIds?.[0] || client.linkedListingIds?.[0] || ''}</p>
                      </div>
                    </td>
                    <td>
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.78rem] font-semibold ${getStatusBadgeClass(client.statusLabel)}`}>
                        {client.statusLabel}
                      </span>
                    </td>
                    <td>{client.assignedAgentName || client.assignedAgentEmail || '-'}</td>
                    <td>{formatRelativeTime(client.lastActivityAt)}</td>
                    <td>
                      <div className="relative flex justify-end">
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dbe4ef] bg-white text-[#526a82] hover:bg-[#f6f9fc]"
                          onClick={(event) => {
                            event.stopPropagation()
                            setOpenActionMenuId((previous) => (previous === client.id ? '' : client.id))
                          }}
                          aria-label={`Actions for ${client.name}`}
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openActionMenuId === client.id ? (
                          <div className="absolute right-0 top-10 z-20 grid min-w-[160px] gap-1 rounded-[16px] border border-[#dbe4ef] bg-white p-2 text-sm shadow-[0_18px_44px_rgba(15,23,42,0.12)]">
                            <button type="button" className="rounded-[12px] px-3 py-2 text-left hover:bg-[#f6f9fc]" onClick={(event) => handleQuickAction(event, client, 'open')}>Open</button>
                            <button type="button" className="rounded-[12px] px-3 py-2 text-left hover:bg-[#f6f9fc] disabled:text-[#a8b4c0]" disabled={!client.phone} onClick={(event) => handleQuickAction(event, client, 'call')}>Call</button>
                            <button type="button" className="rounded-[12px] px-3 py-2 text-left hover:bg-[#f6f9fc] disabled:text-[#a8b4c0]" disabled={!client.email} onClick={(event) => handleQuickAction(event, client, 'email')}>Email</button>
                            <button type="button" className="rounded-[12px] px-3 py-2 text-left hover:bg-[#f6f9fc] disabled:text-[#a8b4c0]" disabled={!client.phone} onClick={(event) => handleQuickAction(event, client, 'whatsapp')}>WhatsApp</button>
                            <button type="button" className="rounded-[12px] px-3 py-2 text-left text-[#8a4b35] hover:bg-[#faf7f3]" onClick={(event) => handleQuickAction(event, client, 'archive')}>Archive</button>
                          </div>
                        ) : null}
                      </div>
                    </td>
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
