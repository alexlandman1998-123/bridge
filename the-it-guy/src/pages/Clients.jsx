import {
  BriefcaseBusiness,
  Building2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Grid3X3,
  Handshake,
  Home,
  KeyRound,
  List,
  MoreVertical,
  Plus,
  Search,
  SlidersHorizontal,
  User2,
  UserRoundSearch,
  Users,
} from 'lucide-react'
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
  getAgentClientOpenPath,
  loadAgentClientDirectory,
} from '../core/clients/agentClientDirectory'
import { deriveAttorneyClients } from '../core/clients/attorneyClientSelectors'
import { useWorkspace } from '../context/WorkspaceContext'
import { createClientRecord, fetchDashboardOverview, fetchTransactionsByParticipant } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const CLIENT_SEGMENTS = [
  { key: 'all', label: 'All Clients', icon: Users },
  { key: 'buyer', label: 'Buyers', icon: UserRoundSearch },
  { key: 'seller', label: 'Sellers', icon: Home },
  { key: 'investor', label: 'Investors', icon: CircleDollarSign },
  { key: 'tenant', label: 'Tenants', icon: KeyRound },
  { key: 'prospect', label: 'Prospects', icon: BriefcaseBusiness },
]

const CLIENT_ROLE_OPTIONS = [
  { key: 'all', label: 'All Roles' },
  { key: 'buyer', label: 'Buyers' },
  { key: 'seller', label: 'Sellers' },
  { key: 'investor', label: 'Investors' },
  { key: 'tenant', label: 'Tenants' },
  { key: 'prospect', label: 'Prospects' },
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
  buyers: 'buyer',
  buyer_leads: 'buyer',
  seller: 'seller',
  sellers: 'seller',
  seller_leads: 'seller',
  prospects: 'prospect',
  company: 'companies',
  company_trust: 'companies',
  'company-trust': 'companies',
  'companies-trusts': 'companies',
  trust: 'trusts',
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i
const UUID_IN_TEXT_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}\b/gi

const ROLE_META = {
  buyer: {
    label: 'Buyer',
    pluralLabel: 'Buyers',
    accent: '#1273d8',
    chip: 'border-[#cfe5ff] bg-[#eef7ff] text-[#095fae]',
    soft: 'bg-[#eef7ff] text-[#0d63b8]',
    icon: UserRoundSearch,
    cardAccent: 'border-l-[#1273d8]',
  },
  seller: {
    label: 'Seller',
    pluralLabel: 'Sellers',
    accent: '#15a35d',
    chip: 'border-[#ccefdc] bg-[#ecfbf2] text-[#08723b]',
    soft: 'bg-[#ecfbf2] text-[#08723b]',
    icon: Home,
    cardAccent: 'border-l-[#15a35d]',
  },
  investor: {
    label: 'Investor',
    pluralLabel: 'Investors',
    accent: '#7c3fd3',
    chip: 'border-[#e4d6fb] bg-[#f6f0ff] text-[#6630b2]',
    soft: 'bg-[#f6f0ff] text-[#6630b2]',
    icon: CircleDollarSign,
    cardAccent: 'border-l-[#7c3fd3]',
  },
  tenant: {
    label: 'Tenant',
    pluralLabel: 'Tenants',
    accent: '#ea6a1a',
    chip: 'border-[#ffd9bf] bg-[#fff2e8] text-[#b54c0d]',
    soft: 'bg-[#fff2e8] text-[#b54c0d]',
    icon: KeyRound,
    cardAccent: 'border-l-[#ea6a1a]',
  },
  prospect: {
    label: 'Prospect',
    pluralLabel: 'Prospects',
    accent: '#60758d',
    chip: 'border-[#dce5ef] bg-[#f6f9fc] text-[#455d76]',
    soft: 'bg-[#f6f9fc] text-[#455d76]',
    icon: BriefcaseBusiness,
    cardAccent: 'border-l-[#60758d]',
  },
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

function isUuidLike(value = '') {
  return UUID_PATTERN.test(String(value || '').trim())
}

function sanitizeUiLabel(value = '', fallback = 'Linked record') {
  const label = String(value || '').trim()
  if (!label || isUuidLike(label)) return fallback
  const withoutUuid = label.replace(UUID_IN_TEXT_PATTERN, '').replace(/\s{2,}/g, ' ').replace(/\s+[-–—]\s*$/, '').trim()
  if (!withoutUuid || /^(listing|lead|transaction|client|record)$/i.test(withoutUuid)) return fallback
  return withoutUuid
}

function getRoleLabels(client = {}) {
  const labels = [
    ...(Array.isArray(client.typeLabels) ? client.typeLabels : []),
    ...String(client.roleLabel || client.typeLabel || '')
      .split('+')
      .map((item) => item.trim()),
  ]
  return [...new Set(labels.filter(Boolean))]
}

function getClientRoleKeys(client = {}) {
  const keys = new Set()
  const labels = getRoleLabels(client).map((label) => label.toLowerCase())
  const typeKeys = Array.isArray(client.typeKeys) ? client.typeKeys : []
  if (typeKeys.some((key) => ['buyer_leads', 'buyers'].includes(key)) || labels.some((label) => label.includes('buyer'))) keys.add('buyer')
  if (typeKeys.some((key) => ['seller_leads', 'sellers'].includes(key)) || labels.some((label) => label.includes('seller'))) keys.add('seller')
  if (typeKeys.includes('prospects') || labels.some((label) => label.includes('prospect'))) keys.add('prospect')
  if (labels.some((label) => label.includes('investor') || label.includes('investment'))) keys.add('investor')
  if (labels.some((label) => label.includes('tenant') || label.includes('rental') || label.includes('rent'))) keys.add('tenant')
  if (!keys.size) keys.add('prospect')
  return [...keys]
}

function getPrimaryRoleKey(client = {}) {
  const roles = getClientRoleKeys(client)
  const priority = Number(client.activeTransactions || 0) > 0
    ? ['seller', 'buyer', 'investor', 'tenant', 'prospect']
    : ['seller', 'buyer', 'investor', 'tenant', 'prospect']
  return priority.find((roleKey) => roles.includes(roleKey)) || roles[0] || 'prospect'
}

function clientHasRole(client, roleKey) {
  if (!roleKey || roleKey === 'all') return true
  return getClientRoleKeys(client).includes(roleKey)
}

function getClientStatusLabel(client = {}) {
  const normalized = String(client.statusLabel || '').trim()
  const primaryRole = getPrimaryRoleKey(client)
  if (Number(client.activeTransactions || 0) > 0 || normalized.toLowerCase().includes('transaction')) return 'Active Transaction'
  if (normalized.toLowerCase().includes('follow')) return 'Needs Attention'
  if (normalized.toLowerCase().includes('archived')) return 'Archived'
  if (primaryRole === 'seller') {
    if ((client.linkedListingIds || []).length) return 'Listing Active'
    return normalized && normalized !== 'Active' ? normalized : 'Seller Lead'
  }
  if (primaryRole === 'buyer') return normalized && normalized !== 'Active' ? normalized : 'Looking'
  if (primaryRole === 'investor') return normalized && normalized !== 'Active' ? normalized : 'Active Investor'
  if (primaryRole === 'tenant') return normalized && normalized !== 'Active' ? normalized : 'Tenant Lead'
  return normalized || 'Prospect'
}

function getStatusBadgeClass(status = '') {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('transaction') || normalized.includes('pre-approved')) return 'border-[#cfe1f7] bg-[#f0f6ff] text-[#275f9a]'
  if (normalized.includes('attention') || normalized.includes('follow')) return 'border-[#f1d49a] bg-[#fff7e8] text-[#8a5a12]'
  if (normalized.includes('archived')) return 'border-[#e2d7cd] bg-[#faf7f3] text-[#735744]'
  if (normalized.includes('seller') || normalized.includes('listing') || normalized.includes('mandate')) return 'border-[#ccefdc] bg-[#ecfbf2] text-[#08723b]'
  if (normalized.includes('tenant')) return 'border-[#ffd9bf] bg-[#fff2e8] text-[#b54c0d]'
  if (normalized.includes('investor')) return 'border-[#e4d6fb] bg-[#f6f0ff] text-[#6630b2]'
  if (normalized.includes('new') || normalized.includes('prospect')) return 'border-[#dde4ee] bg-[#f7fafd] text-[#39546d]'
  return 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]'
}

function getLinkedRecordLabel(client = {}) {
  const primaryRecord = (client.linkedRecords || []).find((record) => record?.kind === 'transaction') ||
    (client.linkedRecords || []).find((record) => record?.kind === 'lead') ||
    (client.linkedRecords || [])[0]
  const label = primaryRecord?.label || client.linkedRecordLabel || client.latestPropertyLabel || ''
  return sanitizeUiLabel(label, 'No linked transaction')
}

function getClientContext(client = {}) {
  const roleKey = getPrimaryRoleKey(client)
  const linkedLabel = getLinkedRecordLabel(client)
  const sourceLabels = Array.isArray(client.sourceLabels) ? client.sourceLabels : []
  const latestProperty = sanitizeUiLabel(client.latestPropertyLabel || client.linkedRecordLabel, linkedLabel)
  if (roleKey === 'seller') {
    return {
      primary: `Property: ${latestProperty || linkedLabel}`,
      secondary: client.latestStage ? `Stage: ${client.latestStage}` : '',
    }
  }
  if (roleKey === 'buyer') {
    return {
      primary: `Looking in: ${latestProperty && latestProperty !== 'No linked transaction' ? latestProperty : 'Area pending'}`,
      secondary: 'Budget: Not captured yet',
    }
  }
  if (roleKey === 'investor') {
    return {
      primary: `Focus: ${sourceLabels.includes('Canvassing') ? 'Canvassing opportunity' : 'Investment profile'}`,
      secondary: latestProperty && latestProperty !== 'No linked transaction' ? latestProperty : '',
    }
  }
  if (roleKey === 'tenant') {
    return {
      primary: `Looking to rent in: ${latestProperty && latestProperty !== 'No linked transaction' ? latestProperty : 'Area pending'}`,
      secondary: 'Budget: Not captured yet',
    }
  }
  return {
    primary: latestProperty && latestProperty !== 'No linked transaction' ? `Interest: ${latestProperty}` : 'Prospect profile',
    secondary: sourceLabels.join(', ') || '',
  }
}

function getAssignedAgentLabel(client = {}) {
  return String(client.assignedAgentName || client.assignedAgentEmail || 'Unassigned').trim()
}

function getEmptyCopy(segmentKey = 'all') {
  const meta = ROLE_META[segmentKey]
  if (!meta) {
    return {
      title: 'No clients found',
      detail: 'Buyers, sellers, prospects and active transaction contacts will appear here once added.',
    }
  }
  return {
    title: `No ${meta.pluralLabel.toLowerCase()} found`,
    detail: `${meta.pluralLabel} will appear here once they are added, captured from pipeline activity, or linked to a transaction.`,
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

function TypeBadges({ client }) {
  const roleKeys = getClientRoleKeys(client)
  return (
    <div className="flex flex-wrap gap-1.5">
      {roleKeys.slice(0, 4).map((roleKey) => {
        const meta = ROLE_META[roleKey] || ROLE_META.prospect
        return (
        <span
          key={roleKey}
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] ${meta.chip}`}
        >
          {meta.label}
        </span>
        )
      })}
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
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [assignedAgentFilter, setAssignedAgentFilter] = useState('all')
  const [viewMode, setViewMode] = useState('grid')
  const [archivedClientIds, setArchivedClientIds] = useState(() => readArchivedClientIds())
  const [openActionMenuId, setOpenActionMenuId] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const isAgentClientDirectory = role === 'agent'
  const isBondClientsRoute = role === 'bond_originator' || location.pathname.startsWith('/bond/clients')
  const selectedDevelopmentId = searchParams.get('developmentId') || 'all'

  useEffect(() => {
    const nextFilter = normalizeClientFilterParam(
      searchParams.get('view') || searchParams.get('type'),
      CLIENT_SEGMENTS.map((filter) => filter.key),
    )
    if (nextFilter && nextFilter !== activeFilter) {
      setActiveFilter(nextFilter)
    }
  }, [activeFilter, searchParams])

  useEffect(() => {
    if (!location.state?.openAddClient) return
    setShowAddModal(true)
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [location.pathname, location.search, location.state, navigate])

  useEffect(() => {
    function handleOpenAddClient() {
      setShowAddModal(true)
    }

    window.addEventListener('itg:open-add-client', handleOpenAddClient)
    return () => {
      window.removeEventListener('itg:open-add-client', handleOpenAddClient)
    }
  }, [])

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
    () => {
      const normalizedSearch = String(search || '').trim().toLowerCase()
      const archivedSet = new Set((archivedClientIds || []).map((id) => String(id || '').trim()))
      return (clients || [])
        .map((client) => {
          if (!archivedSet.has(String(client.id || '').trim())) return client
          return {
            ...client,
            status: 'archived',
            statusLabel: 'Archived',
            statusKeys: [...new Set([...(client.statusKeys || []), 'archived'])],
          }
        })
        .filter((client) => {
          if (!clientHasRole(client, activeFilter)) return false
          if (!clientHasRole(client, roleFilter)) return false
          if (statusFilter !== 'all' && !(client.statusKeys || []).includes(statusFilter)) return false
          if (assignedAgentFilter !== 'all') {
            const agentKeys = [client.assignedAgentId, client.assignedAgentEmail].map((value) => String(value || '').trim()).filter(Boolean)
            if (!agentKeys.includes(assignedAgentFilter)) return false
          }
          if (!normalizedSearch) return true
          const searchHaystack = [
            client.searchText,
            client.name,
            client.email,
            client.phone,
            getLinkedRecordLabel(client),
            client.latestPropertyLabel,
            getAssignedAgentLabel(client),
          ].join(' ').toLowerCase()
          return searchHaystack.includes(normalizedSearch)
        })
    },
    [activeFilter, archivedClientIds, assignedAgentFilter, clients, roleFilter, search, statusFilter],
  )
  const summaryStats = useMemo(() => {
    const visibleClients = (clients || []).filter((client) => !archivedClientIds.includes(client.id))
    const activeTransactionIds = new Set()
    for (const client of visibleClients) {
      if (Number(client.activeTransactions || 0) <= 0) continue
      for (const id of client.linkedTransactionIds || []) {
        if (id) activeTransactionIds.add(id)
      }
    }
    return {
      total: visibleClients.length,
      buyers: visibleClients.filter((client) => clientHasRole(client, 'buyer')).length,
      sellers: visibleClients.filter((client) => clientHasRole(client, 'seller')).length,
      activeTransactions: activeTransactionIds.size || visibleClients.reduce((total, client) => total + Number(client.activeTransactions || 0), 0),
    }
  }, [archivedClientIds, clients])
  const emptyCopy = useMemo(() => getEmptyCopy(activeFilter), [activeFilter])
  const assignedAgentOptions = useMemo(() => {
    if ((agentFilters.assignedAgents || []).length) return agentFilters.assignedAgents
    const options = new Map()
    for (const client of clients || []) {
      const id = String(client.assignedAgentId || client.assignedAgentEmail || '').trim()
      if (!id || options.has(id)) continue
      options.set(id, {
        id,
        label: getAssignedAgentLabel(client),
      })
    }
    return [...options.values()].sort((left, right) => left.label.localeCompare(right.label))
  }, [agentFilters.assignedAgents, clients])
  const segmentCounts = useMemo(() => {
    const counts = { all: clients.length }
    for (const segment of CLIENT_SEGMENTS) {
      if (segment.key === 'all') continue
      counts[segment.key] = clients.filter((client) => clientHasRole(client, segment.key)).length
    }
    return counts
  }, [clients])

  function handleViewModeChange(nextMode) {
    setViewMode(nextMode)
  }

  function handleSegmentChange(nextFilter) {
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
      <section className="grid gap-4 xl:grid-cols-4">
        {[
          { label: 'Total Clients', value: summaryStats.total, icon: Users, tint: 'from-[#f4f8ff] to-white', iconClass: 'bg-[#eaf3ff] text-[#0f64b8]', helper: filteredClients.length === summaryStats.total ? 'Complete CRM view' : `${filteredClients.length} currently shown` },
          { label: 'Buyers', value: summaryStats.buyers, icon: UserRoundSearch, tint: 'from-[#eff7ff] to-white', iconClass: 'bg-[#e4f1ff] text-[#116fc8]', helper: 'Buyer leads and active buyers' },
          { label: 'Sellers', value: summaryStats.sellers, icon: Home, tint: 'from-[#effbf4] to-white', iconClass: 'bg-[#def8e9] text-[#0b8548]', helper: 'Seller leads and mandates' },
          { label: 'Active Transactions', value: summaryStats.activeTransactions, icon: Handshake, tint: 'from-[#f7f1ff] to-white', iconClass: 'bg-[#efe2ff] text-[#7438bf]', helper: 'Linked active deal records' },
        ].map((item) => {
          const Icon = item.icon
          return (
            <article key={item.label} className={`rounded-[22px] border border-[#dfe8f2] bg-gradient-to-br ${item.tint} p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]`}>
              <div className="flex items-center gap-4">
                <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${item.iconClass}`}>
                  <Icon size={22} />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#71849b]">{item.label}</p>
                  <strong className="mt-1 block text-[1.75rem] leading-none tracking-[-0.04em] text-[#112238]">{item.value}</strong>
                  <span className="mt-2 block truncate text-xs font-medium text-[#61758c]">{item.helper}</span>
                </div>
              </div>
            </article>
          )
        })}
      </section>

      <section className="overflow-hidden rounded-[26px] border border-[#dde6f0] bg-white shadow-[0_16px_38px_rgba(15,23,42,0.06)]">
        <div className="flex overflow-x-auto border-b border-[#e6edf5] bg-[#fbfdff] px-3">
          {CLIENT_SEGMENTS.map((segment) => {
            const Icon = segment.icon
            const active = activeFilter === segment.key
            return (
              <button
                key={segment.key}
                type="button"
                className={`relative inline-flex min-h-[62px] shrink-0 items-center gap-2.5 px-4 text-sm font-semibold transition ${
                  active ? 'text-[#0f63c7]' : 'text-[#4f647d] hover:text-[#10243a]'
                }`}
                onClick={() => handleSegmentChange(segment.key)}
              >
                <Icon size={17} />
                <span>{segment.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[0.68rem] ${active ? 'bg-[#e8f2ff] text-[#0f63c7]' : 'bg-[#eef3f8] text-[#6b7d93]'}`}>
                  {segmentCounts[segment.key] || 0}
                </span>
                {active ? <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-[#1673df]" /> : null}
              </button>
            )
          })}
          <button
            type="button"
            className="ml-auto hidden min-h-[62px] shrink-0 items-center gap-2 px-4 text-sm font-semibold text-[#4f647d] lg:inline-flex"
          >
            <SlidersHorizontal size={16} />
            Custom View
          </button>
        </div>

        <div className="grid gap-3 border-b border-[#edf2f7] p-4 xl:grid-cols-[minmax(280px,1fr)_180px_190px_190px_auto]">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search clients by name, email, phone or property..."
          />
          <Field as="select" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            {CLIENT_ROLE_OPTIONS.map((filter) => (
              <option key={filter.key} value={filter.key}>
                {filter.label}
              </option>
            ))}
          </Field>
          <Field as="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {AGENT_STATUS_FILTERS.map((filter) => (
              <option key={filter.key} value={filter.key}>
                {filter.label}
              </option>
            ))}
          </Field>
          <Field as="select" value={assignedAgentFilter} onChange={(event) => setAssignedAgentFilter(event.target.value)}>
            <option value="all">All Agents</option>
            {assignedAgentOptions.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.label}
              </option>
            ))}
          </Field>
          <ViewToggle
            className="justify-self-start xl:justify-self-end"
            items={[
              { key: 'grid', label: 'Grid', icon: Grid3X3 },
              { key: 'list', label: 'List', icon: List },
            ]}
            value={viewMode}
            onChange={handleViewModeChange}
          />
          {!isAgentClientDirectory ? (
            <div className="xl:col-span-2">
              <Field as="select" value={selectedDevelopmentId} onChange={handleDevelopmentFilterChange}>
                {developmentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Field>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="m-4 rounded-[18px] border border-[#f6d4d4] bg-[#fff5f5] px-5 py-4 text-sm text-[#b42318]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="p-6">
            <LoadingSkeleton lines={8} />
          </div>
        ) : null}

        {!loading && !filteredClients.length ? (
          <section className="flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full border border-[#dbe4ef] bg-[#f6f9fc] text-[#5d7690]">
              <User2 size={28} />
            </div>
            <h3 className="text-[1.18rem] font-semibold tracking-[-0.025em] text-[#142132]">{emptyCopy.title}</h3>
            <p className="mt-3 max-w-[560px] text-sm leading-7 text-[#6b7d93]">{emptyCopy.detail}</p>
            <Button className="mt-5" onClick={() => setShowAddModal(true)}>
              <Plus size={16} />
              Add Client
            </Button>
          </section>
        ) : null}

        {!loading && filteredClients.length > 0 && viewMode === 'grid' ? (
          <section className="grid gap-4 p-4 lg:grid-cols-2 2xl:grid-cols-3">
            {filteredClients.map((client) => {
              const roleKey = getPrimaryRoleKey(client)
              const meta = ROLE_META[roleKey] || ROLE_META.prospect
              const RoleIcon = meta.icon
              const context = getClientContext(client)
              const statusLabel = getClientStatusLabel(client)
              const linkedLabel = getLinkedRecordLabel(client)
              const assignedAgent = getAssignedAgentLabel(client)
              return (
                <article
                  key={client.id}
                  className={`group relative flex min-h-[290px] cursor-pointer flex-col overflow-visible rounded-[18px] border border-[#dfe7f1] border-l-4 ${meta.cardAccent} bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.055)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(15,23,42,0.09)]`}
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
                  <div className="flex items-start justify-between gap-3">
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.1em] ${meta.chip}`}>
                      <RoleIcon size={15} />
                      {meta.label}
                    </span>
                    <div className="relative">
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#506985] hover:bg-[#f3f7fb]"
                        onClick={(event) => {
                          event.stopPropagation()
                          setOpenActionMenuId((previous) => (previous === client.id ? '' : client.id))
                        }}
                        aria-label={`Actions for ${client.name}`}
                      >
                        <MoreVertical size={17} />
                      </button>
                      {openActionMenuId === client.id ? (
                        <div className="absolute right-0 top-10 z-30 grid min-w-[170px] gap-1 rounded-[16px] border border-[#dbe4ef] bg-white p-2 text-sm shadow-[0_18px_44px_rgba(15,23,42,0.14)]">
                          <button type="button" className="rounded-[12px] px-3 py-2 text-left hover:bg-[#f6f9fc]" onClick={(event) => handleQuickAction(event, client, 'open')}>Open profile</button>
                          <button type="button" className="rounded-[12px] px-3 py-2 text-left hover:bg-[#f6f9fc] disabled:text-[#a8b4c0]" disabled={!client.phone} onClick={(event) => handleQuickAction(event, client, 'call')}>Call</button>
                          <button type="button" className="rounded-[12px] px-3 py-2 text-left hover:bg-[#f6f9fc] disabled:text-[#a8b4c0]" disabled={!client.email} onClick={(event) => handleQuickAction(event, client, 'email')}>Email</button>
                          <button type="button" className="rounded-[12px] px-3 py-2 text-left text-[#8a4b35] hover:bg-[#faf7f3]" onClick={(event) => handleQuickAction(event, client, 'archive')}>Archive</button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-5 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-[1.25rem] font-semibold tracking-[-0.035em] text-[#10243a]">{client.name}</h3>
                      <div className="mt-2">
                        <TypeBadges client={client} />
                      </div>
                    </div>
                    <div className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${meta.soft} text-sm font-bold`}>
                      {getInitials(client.name)}
                    </div>
                  </div>

                  <div className="mt-4 min-h-[58px] space-y-1.5 text-sm text-[#61758c]">
                    <p className="truncate font-medium text-[#435b75]">{context.primary}</p>
                    {context.secondary ? <p className="truncate">{context.secondary}</p> : null}
                  </div>

                  <span className={`mt-3 inline-flex w-fit items-center rounded-full border px-3 py-1.5 text-[0.78rem] font-semibold ${getStatusBadgeClass(statusLabel)}`}>
                    {statusLabel}
                  </span>

                  <footer className="mt-auto grid gap-3 border-t border-[#edf2f7] pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="min-w-0">
                        <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Agent</span>
                        <p className="mt-1 truncate text-sm font-semibold text-[#15283d]">{assignedAgent}</p>
                      </div>
                      <div className="min-w-0 text-right">
                        <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Last Activity</span>
                        <p className="mt-1 truncate text-sm font-semibold text-[#15283d]">{formatRelativeTime(client.lastActivityAt)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="flex min-h-11 items-center justify-between gap-3 rounded-[14px] border border-[#e3ebf4] bg-[#f8fbfe] px-3 text-left text-sm font-semibold text-[#24435f] hover:border-[#cbd9e8]"
                      onClick={(event) => handleQuickAction(event, client, 'open')}
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <Building2 size={15} className="shrink-0 text-[#55708c]" />
                        <span className="truncate">{linkedLabel}</span>
                      </span>
                      <ExternalLink size={15} className="shrink-0 text-[#55708c]" />
                    </button>
                  </footer>
                </article>
              )
            })}
          </section>
        ) : null}

        {!loading && filteredClients.length > 0 && viewMode === 'list' ? (
          <DataTable className="border-0 shadow-none">
            <DataTableInner>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Agent</th>
                  <th>Last Activity</th>
                  <th>Linked Transaction</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => {
                  const statusLabel = getClientStatusLabel(client)
                  return (
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
                        <div className="flex min-w-[220px] items-center gap-3">
                          <div className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarTone(client.name)} text-sm font-semibold text-white`}>
                            {getInitials(client.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[#142132]">{client.name}</p>
                            <p className="truncate text-xs text-[#6b7d93]">Client profile</p>
                          </div>
                        </div>
                      </td>
                      <td><TypeBadges client={client} /></td>
                      <td>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.78rem] font-semibold ${getStatusBadgeClass(statusLabel)}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td>{getAssignedAgentLabel(client)}</td>
                      <td>{formatRelativeTime(client.lastActivityAt)}</td>
                      <td>
                        <p className="max-w-[260px] truncate text-sm font-semibold text-[#142132]">{getLinkedRecordLabel(client)}</p>
                      </td>
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
                              <button type="button" className="rounded-[12px] px-3 py-2 text-left hover:bg-[#f6f9fc]" onClick={(event) => handleQuickAction(event, client, 'open')}>Open profile</button>
                              <button type="button" className="rounded-[12px] px-3 py-2 text-left hover:bg-[#f6f9fc] disabled:text-[#a8b4c0]" disabled={!client.phone} onClick={(event) => handleQuickAction(event, client, 'call')}>Call</button>
                              <button type="button" className="rounded-[12px] px-3 py-2 text-left hover:bg-[#f6f9fc] disabled:text-[#a8b4c0]" disabled={!client.email} onClick={(event) => handleQuickAction(event, client, 'email')}>Email</button>
                              <button type="button" className="rounded-[12px] px-3 py-2 text-left text-[#8a4b35] hover:bg-[#faf7f3]" onClick={(event) => handleQuickAction(event, client, 'archive')}>Archive</button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </DataTableInner>
          </DataTable>
        ) : null}
      </section>

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
