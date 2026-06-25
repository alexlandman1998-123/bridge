import {
  Activity,
  Building2,
  CheckCircle2,
  Clock3,
  ClipboardList,
  GitBranch,
  Handshake,
  Link as LinkIcon,
  MapPinned,
  Network,
  PlayCircle,
  Route,
  Search,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import {
  ORGANIZATION_SUBTYPE_OPTIONS,
  ORGANIZATION_TYPES,
  createOrganization,
  findMatchingProspectsForOrganization,
  getOrganizationProfile,
  getOrganizationTypeLabel,
  listMyOrganizations,
  removeOrganizationMember,
  requestOrganizationMembership,
  reviewOrganizationMembership,
  searchOrganizations,
  updateOrganizationMemberRole,
} from '../services/organizationService'
import {
  BRANCH_ROLE_OPTIONS,
  assignBranchMember,
  assignRegionManager,
  createOrganizationBranch,
  createOrganizationRegion,
  getBranchRoleLabel,
  getOrganizationHierarchy,
} from '../services/organizationHierarchyService'
import {
  ASSIGNMENT_RULE_OPTIONS,
  QUEUE_TYPE_OPTIONS,
  assignQueueItem,
  completeQueueItem,
  createWorkQueue,
  getQueueDashboard,
  upsertAssignmentRule,
} from '../services/assignmentEngineService'
import {
  listPartnerConnections,
  removePartnerConnection,
  requestPartnerConnection,
  reviewPartnerConnection,
  searchPartnerConnectionCandidates,
  setPartnerConnectionPreferred,
} from '../services/partnerNetworkService'
import {
  formatCurrency as formatNetworkCurrency,
  formatDuration as formatNetworkDuration,
  getNetworkIntelligence,
} from '../services/networkIntelligenceService'

const ORGANIZATION_TYPE_OPTIONS = [
  { value: ORGANIZATION_TYPES.agency, label: 'Agency' },
  { value: ORGANIZATION_TYPES.attorneyFirm, label: 'Attorney Firm' },
  { value: ORGANIZATION_TYPES.bondOriginator, label: 'Bond Originator' },
  { value: ORGANIZATION_TYPES.developer, label: 'Developer' },
  { value: ORGANIZATION_TYPES.serviceProvider, label: 'Service Provider' },
]

function formatDate(value) {
  if (!value) return 'Not yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not yet'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function normalizeText(value) {
  return String(value || '').trim()
}

function formatPercent(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return '0%'
  return `${Math.round(parsed * 100)}%`
}

function Pill({ tone = 'slate', children }) {
  const classes = {
    green: 'border-[#ccead8] bg-[#f2fbf5] text-[#1f7a45]',
    amber: 'border-[#f3d9a8] bg-[#fff8ec] text-[#a16207]',
    red: 'border-[#f1c9c5] bg-[#fff5f4] text-[#b42318]',
    slate: 'border-[#dbe4ef] bg-[#f8fbff] text-[#35546c]',
  }
  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${classes[tone] || classes.slate}`}>
      {children}
    </span>
  )
}

function Field({ label, children, hint }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#233247]">
      <span>{label}</span>
      {hint ? <small className="text-xs leading-5 text-[#6b7d93]">{hint}</small> : null}
      {children}
    </label>
  )
}

function inputClassName() {
  return 'w-full rounded-[14px] border border-[#dbe4ef] bg-white px-4 py-3 text-sm font-medium text-[#162334] outline-none transition focus:border-[#9eb7d4] focus:ring-4 focus:ring-[#eaf1f8]'
}

function OrganizationCard({ organization }) {
  const statusTone = organization.membershipStatus === 'active' ? 'green' : 'amber'
  return (
    <Link
      to={`/organizations/${organization.id}`}
      className="group rounded-[20px] border border-[#e3ebf4] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-[#cbd8e6]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-[#162334]">{organization.displayName || organization.name}</h3>
          <p className="mt-1 text-sm text-[#60758d]">{organization.typeLabel}</p>
        </div>
        <Pill tone={statusTone}>{organization.membershipStatus}</Pill>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric label="Members" value={organization.memberCount} />
        <Metric label="Transactions" value={organization.transactionCount} />
        <Metric label="Pending" value={organization.pendingRequests} />
      </div>
    </Link>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-[14px] border border-[#e6edf5] bg-[#fbfdff] px-3 py-2.5">
      <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#8ba0b8]">{label}</span>
      <strong className="mt-1 block text-lg font-semibold text-[#162334]">{value}</strong>
    </div>
  )
}

function CreateOrganizationPanel({ onCreated }) {
  const [draft, setDraft] = useState({
    name: '',
    organizationType: ORGANIZATION_TYPES.attorneyFirm,
    organizationSubtype: 'transfer_attorney',
    phone: '',
    email: '',
    website: '',
    description: '',
  })
  const [matches, setMatches] = useState([])
  const [selectedProspectId, setSelectedProspectId] = useState('')
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const subtypeOptions = ORGANIZATION_SUBTYPE_OPTIONS[draft.organizationType] || []

  async function loadMatches() {
    if (!normalizeText(draft.name)) return
    try {
      setLoadingMatches(true)
      setError('')
      const rows = await findMatchingProspectsForOrganization({
        name: draft.name,
        organizationType: draft.organizationType,
      })
      setMatches(rows)
      if (rows.length === 1) setSelectedProspectId(rows[0].id)
    } catch (matchError) {
      setError(matchError.message || 'Could not check matching prospects.')
    } finally {
      setLoadingMatches(false)
    }
  }

  async function handleCreate(event) {
    event.preventDefault()
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const created = await createOrganization({
        ...draft,
        partnerProspectId: selectedProspectId || null,
      })
      setMessage('Organization created successfully.')
      onCreated?.(created.organization)
    } catch (createError) {
      setError(createError.message || 'Organization could not be created.')
    } finally {
      setSaving(false)
    }
  }

  function updateDraft(field, value) {
    setError('')
    setMessage('')
    if (field === 'organizationType') {
      setMatches([])
      setSelectedProspectId('')
    }
    setDraft((previous) => {
      const next = { ...previous, [field]: value }
      if (field === 'organizationType') {
        next.organizationSubtype = ORGANIZATION_SUBTYPE_OPTIONS[value]?.[0]?.value || ''
      }
      return next
    })
  }

  return (
    <form className="space-y-4 rounded-[24px] border border-[#e3ebf4] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]" onSubmit={handleCreate}>
      <div>
        <h2 className="text-lg font-semibold text-[#162334]">Create Organization</h2>
        <p className="mt-1 text-sm leading-6 text-[#60758d]">Create a firm workspace without regions, branches, teams, or routing rules.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Organization Name">
          <input className={inputClassName()} value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="Tucker Attorneys" />
        </Field>
        <Field label="Organization Type">
          <select className={inputClassName()} value={draft.organizationType} onChange={(event) => updateDraft('organizationType', event.target.value)}>
            {ORGANIZATION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        {subtypeOptions.length ? (
          <Field label="Organization Subtype">
            <select className={inputClassName()} value={draft.organizationSubtype} onChange={(event) => updateDraft('organizationSubtype', event.target.value)}>
              {subtypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Email">
          <input className={inputClassName()} type="email" value={draft.email} onChange={(event) => updateDraft('email', event.target.value)} />
        </Field>
        <Field label="Phone">
          <input className={inputClassName()} type="tel" value={draft.phone} onChange={(event) => updateDraft('phone', event.target.value)} />
        </Field>
        <Field label="Website">
          <input className={inputClassName()} value={draft.website} onChange={(event) => updateDraft('website', event.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Description">
            <textarea className={`${inputClassName()} min-h-[96px]`} value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} />
          </Field>
        </div>
      </div>

      <section className="rounded-[18px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#162334]">Link Existing Prospect</h3>
            <p className="mt-1 text-xs leading-5 text-[#60758d]">If this firm already appeared in invitations, link it so historical references stay intact.</p>
          </div>
          <Button type="button" variant="secondary" onClick={loadMatches} disabled={!normalizeText(draft.name) || loadingMatches}>
            <LinkIcon size={14} />
            {loadingMatches ? 'Checking...' : 'Check Matches'}
          </Button>
        </div>
        {matches.length ? (
          <div className="mt-3 grid gap-2">
            {matches.map((prospect) => (
              <label key={prospect.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-[14px] border border-[#dbe4ef] bg-white px-3 py-2.5 text-sm">
                <span>
                  <strong className="block text-[#162334]">{prospect.companyName}</strong>
                  <small className="text-[#60758d]">Used on {prospect.transactionCount} transaction{prospect.transactionCount === 1 ? '' : 's'}</small>
                </span>
                <input type="radio" checked={selectedProspectId === prospect.id} onChange={() => setSelectedProspectId(prospect.id)} />
              </label>
            ))}
          </div>
        ) : null}
      </section>

      {error ? <p className="rounded-[14px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">{error}</p> : null}
      {message ? <p className="rounded-[14px] border border-[#ccead8] bg-[#f2fbf5] px-4 py-3 text-sm text-[#1f7a45]">{message}</p> : null}

      <Button type="submit" disabled={saving}>
        <Building2 size={15} />
        {saving ? 'Creating...' : 'Create Organization'}
      </Button>
    </form>
  )
}

function JoinOrganizationPanel({ onRequested }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [requestingId, setRequestingId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSearch(event) {
    event.preventDefault()
    try {
      setError('')
      setMessage('')
      const rows = await searchOrganizations({ query })
      setResults(rows)
    } catch (searchError) {
      setError(searchError.message || 'Organization search failed.')
    }
  }

  async function handleRequest(organization) {
    try {
      setRequestingId(organization.id)
      setError('')
      await requestOrganizationMembership({ organizationId: organization.id })
      setMessage(`Membership request sent to ${organization.name}.`)
      onRequested?.()
    } catch (requestError) {
      setError(requestError.message || 'Membership request could not be sent.')
    } finally {
      setRequestingId('')
    }
  }

  return (
    <section className="space-y-4 rounded-[24px] border border-[#e3ebf4] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
      <div>
        <h2 className="text-lg font-semibold text-[#162334]">Join Existing</h2>
        <p className="mt-1 text-sm leading-6 text-[#60758d]">Request membership in an organization. Approval does not broaden transaction access.</p>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
        <label className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8ba0b8]" />
          <input className={`${inputClassName()} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Tucker, BetterBond, ABC..." />
        </label>
        <Button type="submit">Search</Button>
      </form>
      {results.length ? (
        <div className="space-y-2">
          {results.map((organization) => (
            <div key={organization.id} className="flex flex-col gap-3 rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <strong className="block text-sm text-[#162334]">{organization.name}</strong>
                <span className="mt-1 block text-xs text-[#60758d]">{getOrganizationTypeLabel(organization.type)}</span>
              </div>
              <Button type="button" variant="secondary" onClick={() => handleRequest(organization)} disabled={requestingId === organization.id}>
                <UserPlus size={14} />
                {requestingId === organization.id ? 'Requesting...' : 'Request Membership'}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="rounded-[14px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">{error}</p> : null}
      {message ? <p className="rounded-[14px] border border-[#ccead8] bg-[#f2fbf5] px-4 py-3 text-sm text-[#1f7a45]">{message}</p> : null}
    </section>
  )
}

function groupConnections(connections = []) {
  return {
    attorneys: connections.filter((connection) => connection.partnerRoleType === 'transfer_attorney'),
    originators: connections.filter((connection) => connection.partnerRoleType === 'bond_originator'),
    developers: connections.filter((connection) => connection.partnerRoleType === 'developer'),
    other: connections.filter((connection) => !['transfer_attorney', 'bond_originator', 'developer'].includes(connection.partnerRoleType)),
  }
}

function PartnerConnectionCard({ connection, canManage, busy, onReview, onTogglePreferred, onRemove }) {
  const statusTone = connection.status === 'connected' ? 'green' : connection.status === 'declined' ? 'red' : 'amber'
  return (
    <div className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm text-[#162334]">{connection.partnerName}</strong>
            {connection.isPreferred ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#f3d9a8] bg-[#fff8ec] px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#a16207]">
                <Star size={11} fill="currentColor" />
                Preferred
              </span>
            ) : null}
          </div>
          <span className="mt-1 block text-xs text-[#60758d]">
            {connection.partnerTypeLabel} • {connection.relationshipTypeLabel} • {connection.direction}
          </span>
        </div>
        <Pill tone={statusTone}>{connection.status}</Pill>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Metric label="Transactions" value={connection.transactionCount} />
        <Metric label="Active" value={connection.activeTransactionCount} />
        <Metric label="Completed" value={connection.completedTransactionCount} />
      </div>

      {canManage ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {connection.status === 'pending' && connection.direction === 'incoming' ? (
            <>
              <Button type="button" onClick={() => onReview(connection, 'accept')} disabled={busy}>
                <CheckCircle2 size={14} />
                Accept
              </Button>
              <Button type="button" variant="secondary" onClick={() => onReview(connection, 'decline')} disabled={busy}>
                <XCircle size={14} />
                Decline
              </Button>
            </>
          ) : null}
          {connection.status === 'connected' ? (
            <Button type="button" variant="secondary" onClick={() => onTogglePreferred(connection)} disabled={busy}>
              <Star size={14} fill={connection.isPreferred ? 'currentColor' : 'none'} />
              {connection.isPreferred ? 'Unmark Preferred' : 'Mark Preferred'}
            </Button>
          ) : null}
          {connection.status !== 'removed' ? (
            <Button type="button" variant="secondary" onClick={() => onRemove(connection)} disabled={busy}>
              <Trash2 size={14} />
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function PartnerConnectionsPanel({ organizationId, canManage }) {
  const [network, setNetwork] = useState({ connections: [], recommendations: [], canManage: false })
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadNetwork = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const next = await listPartnerConnections(organizationId)
      setNetwork(next)
    } catch (loadError) {
      setError(loadError.message || 'Partner network could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    void loadNetwork()
  }, [loadNetwork])

  const effectiveCanManage = Boolean(canManage && network.canManage)
  const connected = network.connections.filter((connection) => connection.status === 'connected')
  const pendingIncoming = network.connections.filter((connection) => connection.status === 'pending' && connection.direction === 'incoming')
  const pendingOutgoing = network.connections.filter((connection) => connection.status === 'pending' && connection.direction === 'outgoing')
  const grouped = groupConnections(connected)

  async function handleSearch(event) {
    event.preventDefault()
    try {
      setError('')
      setMessage('')
      const rows = await searchPartnerConnectionCandidates({ organizationId, query })
      setSearchResults(rows)
    } catch (searchError) {
      setError(searchError.message || 'Partner search failed.')
    }
  }

  async function handleRequest(targetOrganizationId, name) {
    try {
      setBusyId(targetOrganizationId)
      setError('')
      setMessage('')
      await requestPartnerConnection({ sourceOrganizationId: organizationId, targetOrganizationId })
      setMessage(`Connection request sent to ${name}.`)
      setSearchResults([])
      setQuery('')
      await loadNetwork()
    } catch (requestError) {
      setError(requestError.message || 'Connection request could not be sent.')
    } finally {
      setBusyId('')
    }
  }

  async function handleReview(connection, action) {
    try {
      setBusyId(connection.id)
      setError('')
      await reviewPartnerConnection({ connectionId: connection.id, action })
      await loadNetwork()
    } catch (reviewError) {
      setError(reviewError.message || 'Connection could not be updated.')
    } finally {
      setBusyId('')
    }
  }

  async function handleTogglePreferred(connection) {
    try {
      setBusyId(connection.id)
      setError('')
      await setPartnerConnectionPreferred({
        organizationId,
        connectionId: connection.id,
        preferred: !connection.isPreferred,
      })
      await loadNetwork()
    } catch (preferredError) {
      setError(preferredError.message || 'Preferred partner could not be updated.')
    } finally {
      setBusyId('')
    }
  }

  async function handleRemove(connection) {
    try {
      setBusyId(connection.id)
      setError('')
      await removePartnerConnection({ organizationId, connectionId: connection.id })
      await loadNetwork()
    } catch (removeError) {
      setError(removeError.message || 'Connection could not be removed.')
    } finally {
      setBusyId('')
    }
  }

  function renderConnectionGroup(title, rows) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-[#162334]">{title}</h3>
        {rows.length ? (
          rows.map((connection) => (
            <PartnerConnectionCard
              key={connection.id}
              connection={connection}
              canManage={effectiveCanManage}
              busy={busyId === connection.id}
              onReview={handleReview}
              onTogglePreferred={handleTogglePreferred}
              onRemove={handleRemove}
            />
          ))
        ) : (
          <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#fbfdff] px-4 py-5 text-sm text-[#60758d]">No partners in this category yet.</p>
        )}
      </section>
    )
  }

  return (
    <section className="space-y-4 rounded-[24px] border border-[#e3ebf4] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Handshake size={18} className="text-[#35546c]" />
            <h2 className="text-lg font-semibold text-[#162334]">Partners</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#60758d]">
            Connections only support partner selection and transaction collaboration. They do not grant CRM, dashboard, branch, or financial visibility.
          </p>
        </div>
        {loading ? <span className="text-xs font-semibold text-[#60758d]">Loading network...</span> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Connected" value={connected.length} />
        <Metric label="Pending In" value={pendingIncoming.length} />
        <Metric label="Pending Out" value={pendingOutgoing.length} />
        <Metric label="Preferred" value={connected.filter((connection) => connection.isPreferred).length} />
      </div>

      {error ? <p className="rounded-[14px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">{error}</p> : null}
      {message ? <p className="rounded-[14px] border border-[#ccead8] bg-[#f2fbf5] px-4 py-3 text-sm text-[#1f7a45]">{message}</p> : null}

      {effectiveCanManage ? (
        <section className="rounded-[18px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
          <div>
            <h3 className="text-sm font-semibold text-[#162334]">Find Partner Organizations</h3>
            <p className="mt-1 text-xs leading-5 text-[#60758d]">Search active organizations and request a directional partner connection.</p>
          </div>
          <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
            <label className="relative min-w-0 flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8ba0b8]" />
              <input className={`${inputClassName()} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search attorneys, originators, agencies..." />
            </label>
            <Button type="submit">Search</Button>
          </form>
          {searchResults.length ? (
            <div className="mt-3 space-y-2">
              {searchResults.map((candidate) => (
                <div key={candidate.id} className="flex flex-col gap-3 rounded-[14px] border border-[#dbe4ef] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <strong className="block text-sm text-[#162334]">{candidate.name}</strong>
                    <span className="mt-1 block text-xs text-[#60758d]">
                      {candidate.typeLabel}
                      {candidate.connectionStatus ? ` • ${candidate.connectionStatus}` : ''}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => handleRequest(candidate.id, candidate.name)}
                    disabled={busyId === candidate.id || ['pending', 'connected', 'blocked'].includes(candidate.connectionStatus)}
                  >
                    <Send size={14} />
                    {candidate.connectionStatus === 'connected' ? 'Connected' : candidate.connectionStatus === 'pending' ? 'Pending' : 'Request Connection'}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {pendingIncoming.length ? (
        <section className="space-y-2 rounded-[18px] border border-[#f3d9a8] bg-[#fff8ec] p-3">
          <h3 className="text-sm font-semibold text-[#8a5a12]">Pending Requests</h3>
          {pendingIncoming.map((connection) => (
            <PartnerConnectionCard
              key={connection.id}
              connection={connection}
              canManage={effectiveCanManage}
              busy={busyId === connection.id}
              onReview={handleReview}
              onTogglePreferred={handleTogglePreferred}
              onRemove={handleRemove}
            />
          ))}
        </section>
      ) : null}

      {pendingOutgoing.length ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-[#162334]">Requests Sent</h3>
          {pendingOutgoing.map((connection) => (
            <PartnerConnectionCard
              key={connection.id}
              connection={connection}
              canManage={effectiveCanManage}
              busy={busyId === connection.id}
              onReview={handleReview}
              onTogglePreferred={handleTogglePreferred}
              onRemove={handleRemove}
            />
          ))}
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {renderConnectionGroup('Transfer Attorneys', grouped.attorneys)}
        {renderConnectionGroup('Bond Originators', grouped.originators)}
        {renderConnectionGroup('Developers', grouped.developers)}
        {renderConnectionGroup('Other Partners', grouped.other)}
      </div>

      {network.recommendations.length && effectiveCanManage ? (
        <section className="space-y-2 rounded-[18px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
          <div className="flex items-center gap-2">
            <Network size={17} className="text-[#35546c]" />
            <h3 className="text-sm font-semibold text-[#162334]">Suggested Partners</h3>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {network.recommendations.map((candidate) => (
              <div key={candidate.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-[#dbe4ef] bg-white p-3">
                <div>
                  <strong className="block text-sm text-[#162334]">{candidate.name}</strong>
                  <span className="block text-xs text-[#60758d]">{candidate.typeLabel} • {candidate.connectionCount} network connection{candidate.connectionCount === 1 ? '' : 's'}</span>
                </div>
                <Button type="button" variant="secondary" onClick={() => handleRequest(candidate.id, candidate.name)} disabled={busyId === candidate.id}>
                  <Send size={14} />
                  Request
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  )
}

function ScoreBadge({ score }) {
  const tone = score >= 80 ? 'green' : score >= 55 ? 'amber' : 'slate'
  return <Pill tone={tone}>{score ? `${score} score` : 'No score'}</Pill>
}

function NetworkIntelligencePanel({ organizationId }) {
  const [network, setNetwork] = useState({
    summary: {},
    relationships: [],
    topReferrers: [],
    mostUsedPartners: [],
    suggestions: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadNetwork = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const next = await getNetworkIntelligence(organizationId)
      setNetwork(next)
    } catch (loadError) {
      setError(loadError.message || 'Network intelligence could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    void loadNetwork()
  }, [loadNetwork])

  const summary = network.summary || {}
  const topRelationships = network.relationships.slice(0, 6)

  return (
    <section className="space-y-5 rounded-[24px] border border-[#e3ebf4] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Network size={18} className="text-[#35546c]" />
            <h2 className="text-lg font-semibold text-[#162334]">Network Intelligence</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#60758d]">
            Relationship, referral, and partner performance metrics generated from transaction collaboration. This does not expose competitor networks or broaden transaction access.
          </p>
        </div>
        {loading ? <span className="text-xs font-semibold text-[#60758d]">Refreshing graph...</span> : null}
      </div>

      {error ? <p className="rounded-[14px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">{error}</p> : null}

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Metric label="Network Size" value={summary.networkSize || 0} />
        <Metric label="Transactions" value={summary.transactionCount || 0} />
        <Metric label="Active" value={summary.activeTransactionCount || 0} />
        <Metric label="Completed" value={summary.completedTransactionCount || 0} />
        <Metric label="Referral Volume" value={formatNetworkCurrency(summary.referralVolume || 0)} />
        <Metric label="Avg Score" value={summary.averageRelationshipScore || 0} />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Agencies" value={summary.connectedAgencies || 0} />
        <Metric label="Attorneys" value={summary.connectedAttorneys || 0} />
        <Metric label="Originators" value={summary.connectedOriginators || 0} />
        <Metric label="Developers" value={summary.connectedDevelopers || 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[#162334]">Partner Scorecards</h3>
          {topRelationships.length ? (
            <div className="grid gap-3">
              {topRelationships.map((relationship) => (
                <div key={relationship.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <strong className="block text-sm text-[#162334]">{relationship.partnerName}</strong>
                      <span className="mt-1 block text-xs text-[#60758d]">
                        {relationship.partnerTypeLabel} • {relationship.relationshipTypeLabel} • {relationship.milestone}
                      </span>
                    </div>
                    <ScoreBadge score={relationship.relationshipHealthScore} />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-5">
                    <Metric label="Transactions" value={relationship.transactionCount} />
                    <Metric label="Active" value={relationship.activeTransactionCount} />
                    <Metric label="Complete" value={formatPercent(relationship.completionRate)} />
                    <Metric label="Cycle" value={formatNetworkDuration(relationship.averageCycleTime)} />
                    <Metric label="Response" value={formatNetworkDuration(relationship.averageResponseTime, 'hours')} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#fbfdff] px-4 py-8 text-center text-sm text-[#60758d]">No relationship history yet. Transactions with partner organizations will build this graph automatically.</p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[#162334]">Performance Signals</h3>
          <div className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-3">
            <Metric label="Avg Cycle Time" value={formatNetworkDuration(summary.averageCycleTime)} />
          </div>
          <div className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-3">
            <Metric label="Avg Response" value={formatNetworkDuration(summary.averageResponseTime, 'hours')} />
          </div>
          <p className="rounded-[14px] border border-[#dbe4ef] bg-[#f8fbff] px-4 py-3 text-xs leading-5 text-[#60758d]">
            Relationship scores combine transaction volume, completion rate, active collaboration, response time, cycle time, and recent activity.
          </p>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[#162334]">Top Referring Organizations</h3>
          {network.topReferrers.length ? (
            network.topReferrers.map((referrer) => (
              <div key={referrer.organizationId} className="flex items-center justify-between gap-3 rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-3">
                <div>
                  <strong className="block text-sm text-[#162334]">{referrer.organizationName}</strong>
                  <span className="mt-1 block text-xs text-[#60758d]">{referrer.organizationTypeLabel} • {formatNetworkCurrency(referrer.referralVolume)}</span>
                </div>
                <Metric label="Referrals" value={referrer.transactionCount} />
              </div>
            ))
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#fbfdff] px-4 py-6 text-sm text-[#60758d]">No inbound referral history yet.</p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[#162334]">Most Used Partners</h3>
          {network.mostUsedPartners.length ? (
            network.mostUsedPartners.map((partner) => (
              <div key={partner.organizationId} className="flex items-center justify-between gap-3 rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-3">
                <div>
                  <strong className="block text-sm text-[#162334]">{partner.organizationName}</strong>
                  <span className="mt-1 block text-xs text-[#60758d]">{partner.organizationTypeLabel} • {partner.activeTransactionCount} active</span>
                </div>
                <ScoreBadge score={partner.relationshipHealthScore} />
              </div>
            ))
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#fbfdff] px-4 py-6 text-sm text-[#60758d]">No outbound partner usage yet.</p>
          )}
        </section>
      </div>

      <section className="space-y-3 rounded-[18px] border border-[#dbe4ef] bg-[#f8fbff] p-4">
        <div className="flex items-center gap-2">
          <Star size={17} className="text-[#35546c]" />
          <h3 className="text-sm font-semibold text-[#162334]">Suggested Partners</h3>
        </div>
        {network.suggestions.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {network.suggestions.map((suggestion) => (
              <div key={suggestion.id} className="rounded-[14px] border border-[#dbe4ef] bg-white p-3">
                <strong className="block text-sm text-[#162334]">{suggestion.name}</strong>
                <span className="mt-1 block text-xs text-[#60758d]">{suggestion.organizationTypeLabel}</span>
                <p className="mt-2 text-xs leading-5 text-[#60758d]">{suggestion.reason}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-white px-4 py-6 text-sm text-[#60758d]">No partner suggestions yet. Suggestions appear once the network has enough relationship history.</p>
        )}
      </section>
    </section>
  )
}

function OrganizationHierarchyPanel({ organizationId, canManage }) {
  const [hierarchy, setHierarchy] = useState({
    regions: [],
    branches: [],
    members: [],
    canManageHierarchy: false,
    canManageRegion: false,
    canManageBranch: false,
  })
  const [loading, setLoading] = useState(true)
  const [regionDraft, setRegionDraft] = useState({ name: '', code: '', managerUserId: '' })
  const [branchDraft, setBranchDraft] = useState({ name: '', code: '', regionId: '', email: '', phone: '', managerUserId: '' })
  const [assignmentDrafts, setAssignmentDrafts] = useState({})
  const [busyKey, setBusyKey] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadHierarchy = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const next = await getOrganizationHierarchy(organizationId)
      setHierarchy(next)
    } catch (loadError) {
      setError(loadError.message || 'Organization structure could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    void loadHierarchy()
  }, [loadHierarchy])

  const activeMembers = hierarchy.members.filter((member) => member.membershipStatus === 'active')
  const canCreateStructure = Boolean(canManage && hierarchy.canManageHierarchy)
  const canAssignStructure = Boolean(canManage && (hierarchy.canManageHierarchy || hierarchy.canManageRegion || hierarchy.canManageBranch))
  const totalBranchMembers = hierarchy.members.filter((member) => member.branchId).length
  const activeTransactions = hierarchy.branches.reduce((total, branch) => total + branch.activeTransactionCount, 0)

  async function handleCreateRegion(event) {
    event.preventDefault()
    try {
      setBusyKey('region:create')
      setError('')
      setMessage('')
      await createOrganizationRegion({ organizationId, region: regionDraft })
      setRegionDraft({ name: '', code: '', managerUserId: '' })
      setMessage('Region created.')
      await loadHierarchy()
    } catch (createError) {
      setError(createError.message || 'Region could not be created.')
    } finally {
      setBusyKey('')
    }
  }

  async function handleCreateBranch(event) {
    event.preventDefault()
    try {
      setBusyKey('branch:create')
      setError('')
      setMessage('')
      await createOrganizationBranch({ organizationId, branch: branchDraft })
      setBranchDraft({ name: '', code: '', regionId: '', email: '', phone: '', managerUserId: '' })
      setMessage('Branch created.')
      await loadHierarchy()
    } catch (createError) {
      setError(createError.message || 'Branch could not be created.')
    } finally {
      setBusyKey('')
    }
  }

  async function handleAssignRegionManager(regionId, userId) {
    if (!userId) return
    try {
      setBusyKey(`region:${regionId}`)
      setError('')
      setMessage('')
      await assignRegionManager({ organizationId, regionId, userId })
      setMessage('Regional manager assigned.')
      await loadHierarchy()
    } catch (assignError) {
      setError(assignError.message || 'Regional manager could not be assigned.')
    } finally {
      setBusyKey('')
    }
  }

  async function handleAssignBranchMember(branchId) {
    const draft = assignmentDrafts[branchId] || {}
    if (!draft.userId) return
    try {
      setBusyKey(`branch:${branchId}`)
      setError('')
      setMessage('')
      await assignBranchMember({
        organizationId,
        branchId,
        userId: draft.userId,
        role: draft.role || 'consultant',
      })
      setAssignmentDrafts((previous) => ({ ...previous, [branchId]: { userId: '', role: 'consultant' } }))
      setMessage('Branch member assigned.')
      await loadHierarchy()
    } catch (assignError) {
      setError(assignError.message || 'Branch member could not be assigned.')
    } finally {
      setBusyKey('')
    }
  }

  function updateAssignmentDraft(branchId, field, value) {
    setAssignmentDrafts((previous) => ({
      ...previous,
      [branchId]: {
        userId: previous[branchId]?.userId || '',
        role: previous[branchId]?.role || 'consultant',
        [field]: value,
      },
    }))
  }

  return (
    <section className="space-y-5 rounded-[24px] border border-[#e3ebf4] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch size={18} className="text-[#35546c]" />
            <h2 className="text-lg font-semibold text-[#162334]">Structure</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#60758d]">
            Regions and branches are optional. Small firms can stay flat, while national organizations can add structure as they grow.
          </p>
        </div>
        {loading ? <span className="text-xs font-semibold text-[#60758d]">Loading structure...</span> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Regions" value={hierarchy.regions.length} />
        <Metric label="Branches" value={hierarchy.branches.length} />
        <Metric label="Branch Members" value={totalBranchMembers} />
        <Metric label="Active Transactions" value={activeTransactions} />
      </div>

      <p className="flex items-start gap-2 rounded-[16px] border border-[#dbe4ef] bg-[#f8fbff] px-4 py-3 text-sm leading-6 text-[#60758d]">
        <ShieldCheck className="mt-0.5 shrink-0 text-[#247857]" size={17} />
        Branch and region membership controls management scope only. Transaction access is still granted through transaction-specific access records.
      </p>

      {error ? <p className="rounded-[14px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">{error}</p> : null}
      {message ? <p className="rounded-[14px] border border-[#ccead8] bg-[#f2fbf5] px-4 py-3 text-sm text-[#1f7a45]">{message}</p> : null}

      {canCreateStructure ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <form className="space-y-3 rounded-[18px] border border-[#dbe4ef] bg-[#fbfdff] p-4" onSubmit={handleCreateRegion}>
            <div className="flex items-center gap-2">
              <MapPinned size={17} className="text-[#35546c]" />
              <h3 className="text-sm font-semibold text-[#162334]">Create Region</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Region Name">
                <input className={inputClassName()} value={regionDraft.name} onChange={(event) => setRegionDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Gauteng" />
              </Field>
              <Field label="Code">
                <input className={inputClassName()} value={regionDraft.code} onChange={(event) => setRegionDraft((draft) => ({ ...draft, code: event.target.value }))} placeholder="GP" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Regional Manager">
                  <select className={inputClassName()} value={regionDraft.managerUserId} onChange={(event) => setRegionDraft((draft) => ({ ...draft, managerUserId: event.target.value }))}>
                    <option value="">No manager yet</option>
                    {activeMembers.map((member) => (
                      <option key={member.userId} value={member.userId}>{member.fullName}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
            <Button type="submit" disabled={busyKey === 'region:create' || !normalizeText(regionDraft.name)}>
              <MapPinned size={14} />
              {busyKey === 'region:create' ? 'Creating...' : 'Create Region'}
            </Button>
          </form>

          <form className="space-y-3 rounded-[18px] border border-[#dbe4ef] bg-[#fbfdff] p-4" onSubmit={handleCreateBranch}>
            <div className="flex items-center gap-2">
              <Building2 size={17} className="text-[#35546c]" />
              <h3 className="text-sm font-semibold text-[#162334]">Create Branch</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Branch Name">
                <input className={inputClassName()} value={branchDraft.name} onChange={(event) => setBranchDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="Sandton" />
              </Field>
              <Field label="Code">
                <input className={inputClassName()} value={branchDraft.code} onChange={(event) => setBranchDraft((draft) => ({ ...draft, code: event.target.value }))} placeholder="SAN" />
              </Field>
              <Field label="Region">
                <select className={inputClassName()} value={branchDraft.regionId} onChange={(event) => setBranchDraft((draft) => ({ ...draft, regionId: event.target.value }))}>
                  <option value="">No region</option>
                  {hierarchy.regions.map((region) => (
                    <option key={region.id} value={region.id}>{region.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Manager">
                <select className={inputClassName()} value={branchDraft.managerUserId} onChange={(event) => setBranchDraft((draft) => ({ ...draft, managerUserId: event.target.value }))}>
                  <option value="">No manager yet</option>
                  {activeMembers.map((member) => (
                    <option key={member.userId} value={member.userId}>{member.fullName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Email">
                <input className={inputClassName()} type="email" value={branchDraft.email} onChange={(event) => setBranchDraft((draft) => ({ ...draft, email: event.target.value }))} />
              </Field>
              <Field label="Phone">
                <input className={inputClassName()} value={branchDraft.phone} onChange={(event) => setBranchDraft((draft) => ({ ...draft, phone: event.target.value }))} />
              </Field>
            </div>
            <Button type="submit" disabled={busyKey === 'branch:create' || !normalizeText(branchDraft.name)}>
              <Building2 size={14} />
              {busyKey === 'branch:create' ? 'Creating...' : 'Create Branch'}
            </Button>
          </form>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[#162334]">Regions</h3>
          {hierarchy.regions.length ? (
            hierarchy.regions.map((region) => (
              <div key={region.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <strong className="block text-sm text-[#162334]">{region.name}</strong>
                    <span className="mt-1 block text-xs text-[#60758d]">{region.code || 'No code'} • {region.branchCount} branch{region.branchCount === 1 ? '' : 'es'}</span>
                  </div>
                  <Pill tone={region.status === 'active' ? 'green' : 'slate'}>{region.status}</Pill>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Metric label="Users" value={region.userCount} />
                  <Metric label="Transactions" value={region.transactionCount} />
                </div>
                {canCreateStructure ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <select
                      className={inputClassName()}
                      defaultValue=""
                      onChange={(event) => handleAssignRegionManager(region.id, event.target.value)}
                      disabled={busyKey === `region:${region.id}`}
                    >
                      <option value="">Assign regional manager</option>
                      {activeMembers.map((member) => (
                        <option key={member.userId} value={member.userId}>{member.fullName}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#fbfdff] px-4 py-6 text-sm text-[#60758d]">No regions yet. Branches can still be created without a region.</p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[#162334]">Branches</h3>
          {hierarchy.branches.length ? (
            hierarchy.branches.map((branch) => {
              const draft = assignmentDrafts[branch.id] || { userId: '', role: 'consultant' }
              const branchMembers = hierarchy.members.filter((member) => member.branchId === branch.id)
              return (
                <div key={branch.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <strong className="block text-sm text-[#162334]">{branch.name}</strong>
                      <span className="mt-1 block text-xs text-[#60758d]">{branch.regionName || 'No region'} • {branch.code || 'No code'}</span>
                    </div>
                    <Pill tone={branch.status === 'active' ? 'green' : 'slate'}>{branch.status}</Pill>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <Metric label="Users" value={branch.userCount || branchMembers.length} />
                    <Metric label="Active" value={branch.activeTransactionCount} />
                    <Metric label="Transactions" value={branch.transactionCount} />
                  </div>
                  {branchMembers.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {branchMembers.slice(0, 6).map((member) => (
                        <span key={member.membershipId} className="rounded-full border border-[#dbe4ef] bg-white px-2.5 py-1 text-xs font-semibold text-[#35546c]">
                          {member.fullName} · {getBranchRoleLabel(member.workspaceRole)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {canAssignStructure ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                      <select
                        className={inputClassName()}
                        value={draft.userId}
                        onChange={(event) => updateAssignmentDraft(branch.id, 'userId', event.target.value)}
                        disabled={busyKey === `branch:${branch.id}`}
                      >
                        <option value="">Assign member</option>
                        {activeMembers.map((member) => (
                          <option key={member.userId} value={member.userId}>{member.fullName}</option>
                        ))}
                      </select>
                      <select
                        className={inputClassName()}
                        value={draft.role}
                        onChange={(event) => updateAssignmentDraft(branch.id, 'role', event.target.value)}
                        disabled={busyKey === `branch:${branch.id}`}
                      >
                        {BRANCH_ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <Button type="button" variant="secondary" onClick={() => handleAssignBranchMember(branch.id)} disabled={busyKey === `branch:${branch.id}` || !draft.userId}>
                        <UserPlus size={14} />
                        Assign
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            })
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#fbfdff] px-4 py-6 text-sm text-[#60758d]">No branches yet. Flat organizations remain fully supported.</p>
          )}
        </section>
      </div>
    </section>
  )
}

function QueueManagementPanel({ organizationId, canManage }) {
  const [dashboard, setDashboard] = useState({ queues: [], items: [], rules: [], users: [], canManageQueues: false })
  const [hierarchy, setHierarchy] = useState({ branches: [] })
  const [loading, setLoading] = useState(true)
  const [queueDraft, setQueueDraft] = useState({
    queueName: '',
    queueType: 'transfer_matters',
    branchId: '',
    slaHours: 24,
  })
  const [ruleDraft, setRuleDraft] = useState({
    queueId: '',
    ruleName: '',
    ruleType: 'capacity_based',
    priority: 50,
  })
  const [assignmentDrafts, setAssignmentDrafts] = useState({})
  const [busyKey, setBusyKey] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadQueues = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const [queueDashboard, hierarchyData] = await Promise.all([
        getQueueDashboard(organizationId),
        getOrganizationHierarchy(organizationId),
      ])
      setDashboard(queueDashboard)
      setHierarchy(hierarchyData)
    } catch (loadError) {
      setError(loadError.message || 'Queues could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    void loadQueues()
  }, [loadQueues])

  const effectiveCanManage = Boolean(canManage && dashboard.canManageQueues)
  const waitingItems = dashboard.items.filter((item) => item.status === 'waiting')
  const assignedItems = dashboard.items.filter((item) => item.status === 'assigned')
  const completedCount = dashboard.queues.reduce((total, queue) => total + queue.completedCount, 0)
  const slaWarningCount = dashboard.queues.reduce((total, queue) => total + queue.slaWarningCount, 0)
  const averageAssignmentMinutes = dashboard.queues.length
    ? Math.round(dashboard.queues.reduce((total, queue) => total + queue.averageAssignmentMinutes, 0) / dashboard.queues.length)
    : 0

  async function handleCreateQueue(event) {
    event.preventDefault()
    try {
      setBusyKey('queue:create')
      setError('')
      setMessage('')
      await createWorkQueue({ organizationId, queue: queueDraft })
      setQueueDraft({ queueName: '', queueType: 'transfer_matters', branchId: '', slaHours: 24 })
      setMessage('Queue created.')
      await loadQueues()
    } catch (createError) {
      setError(createError.message || 'Queue could not be created.')
    } finally {
      setBusyKey('')
    }
  }

  async function handleCreateRule(event) {
    event.preventDefault()
    try {
      setBusyKey('rule:create')
      setError('')
      setMessage('')
      await upsertAssignmentRule({ organizationId, rule: ruleDraft })
      setRuleDraft({ queueId: '', ruleName: '', ruleType: 'capacity_based', priority: 50 })
      setMessage('Assignment rule saved.')
      await loadQueues()
    } catch (ruleError) {
      setError(ruleError.message || 'Assignment rule could not be saved.')
    } finally {
      setBusyKey('')
    }
  }

  async function handleAssign(item, automatic = false) {
    const draft = assignmentDrafts[item.id] || {}
    try {
      setBusyKey(`assign:${item.id}`)
      setError('')
      setMessage('')
      await assignQueueItem({
        queueItemId: item.id,
        assignedUserId: automatic ? null : draft.userId || null,
        assignmentMethod: automatic ? 'automatic' : 'manual',
      })
      setAssignmentDrafts((previous) => ({ ...previous, [item.id]: { userId: '' } }))
      setMessage(automatic ? 'Auto assignment completed.' : 'Work assigned.')
      await loadQueues()
    } catch (assignError) {
      setError(assignError.message || 'Work could not be assigned.')
    } finally {
      setBusyKey('')
    }
  }

  async function handleComplete(item) {
    try {
      setBusyKey(`complete:${item.id}`)
      setError('')
      setMessage('')
      await completeQueueItem(item.id)
      setMessage('Work completed.')
      await loadQueues()
    } catch (completeError) {
      setError(completeError.message || 'Work could not be completed.')
    } finally {
      setBusyKey('')
    }
  }

  function setAssignmentUser(itemId, userId) {
    setAssignmentDrafts((previous) => ({
      ...previous,
      [itemId]: { userId },
    }))
  }

  function usersForItem(item) {
    if (!item.branchId) return dashboard.users
    const branchUsers = dashboard.users.filter((user) => user.branchId === item.branchId)
    return branchUsers.length ? branchUsers : dashboard.users
  }

  return (
    <section className="space-y-5 rounded-[24px] border border-[#e3ebf4] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-[#35546c]" />
            <h2 className="text-lg font-semibold text-[#162334]">Queue Management</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#60758d]">
            Work enters an organization queue first, then managers or assignment rules route it to the right user.
          </p>
        </div>
        {loading ? <span className="text-xs font-semibold text-[#60758d]">Loading queues...</span> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Waiting" value={waitingItems.length} />
        <Metric label="Assigned" value={assignedItems.length} />
        <Metric label="Completed" value={completedCount} />
        <Metric label="SLA Warnings" value={slaWarningCount} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Queues" value={dashboard.queues.length} />
        <Metric label="Rules" value={dashboard.rules.filter((rule) => rule.active).length} />
        <Metric label="Avg Assignment" value={averageAssignmentMinutes ? `${averageAssignmentMinutes}m` : 'Not yet'} />
      </div>

      {error ? <p className="rounded-[14px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">{error}</p> : null}
      {message ? <p className="rounded-[14px] border border-[#ccead8] bg-[#f2fbf5] px-4 py-3 text-sm text-[#1f7a45]">{message}</p> : null}

      {effectiveCanManage ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <form className="space-y-3 rounded-[18px] border border-[#dbe4ef] bg-[#fbfdff] p-4" onSubmit={handleCreateQueue}>
            <div className="flex items-center gap-2">
              <ClipboardList size={17} className="text-[#35546c]" />
              <h3 className="text-sm font-semibold text-[#162334]">Create Queue</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Queue Name">
                <input className={inputClassName()} value={queueDraft.queueName} onChange={(event) => setQueueDraft((draft) => ({ ...draft, queueName: event.target.value }))} placeholder="Bond Applications" />
              </Field>
              <Field label="Queue Type">
                <select className={inputClassName()} value={queueDraft.queueType} onChange={(event) => setQueueDraft((draft) => ({ ...draft, queueType: event.target.value }))}>
                  {QUEUE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Branch">
                <select className={inputClassName()} value={queueDraft.branchId} onChange={(event) => setQueueDraft((draft) => ({ ...draft, branchId: event.target.value }))}>
                  <option value="">Organization queue</option>
                  {hierarchy.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="SLA Hours">
                <input className={inputClassName()} type="number" min="1" value={queueDraft.slaHours} onChange={(event) => setQueueDraft((draft) => ({ ...draft, slaHours: event.target.value }))} />
              </Field>
            </div>
            <Button type="submit" disabled={busyKey === 'queue:create'}>
              <ClipboardList size={14} />
              {busyKey === 'queue:create' ? 'Creating...' : 'Create Queue'}
            </Button>
          </form>

          <form className="space-y-3 rounded-[18px] border border-[#dbe4ef] bg-[#fbfdff] p-4" onSubmit={handleCreateRule}>
            <div className="flex items-center gap-2">
              <Route size={17} className="text-[#35546c]" />
              <h3 className="text-sm font-semibold text-[#162334]">Assignment Rule</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Queue">
                <select className={inputClassName()} value={ruleDraft.queueId} onChange={(event) => setRuleDraft((draft) => ({ ...draft, queueId: event.target.value }))}>
                  <option value="">Select queue</option>
                  {dashboard.queues.map((queue) => (
                    <option key={queue.id} value={queue.id}>{queue.queueName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Rule Type">
                <select className={inputClassName()} value={ruleDraft.ruleType} onChange={(event) => setRuleDraft((draft) => ({ ...draft, ruleType: event.target.value }))}>
                  {ASSIGNMENT_RULE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Rule Name">
                <input className={inputClassName()} value={ruleDraft.ruleName} onChange={(event) => setRuleDraft((draft) => ({ ...draft, ruleName: event.target.value }))} placeholder="Capacity balancing" />
              </Field>
              <Field label="Priority">
                <input className={inputClassName()} type="number" min="0" value={ruleDraft.priority} onChange={(event) => setRuleDraft((draft) => ({ ...draft, priority: event.target.value }))} />
              </Field>
            </div>
            <Button type="submit" disabled={busyKey === 'rule:create' || !ruleDraft.queueId}>
              <Route size={14} />
              {busyKey === 'rule:create' ? 'Saving...' : 'Save Rule'}
            </Button>
          </form>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[#162334]">Queues</h3>
          {dashboard.queues.length ? (
            dashboard.queues.map((queue) => (
              <div key={queue.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <strong className="block text-sm text-[#162334]">{queue.queueName}</strong>
                    <span className="mt-1 block text-xs text-[#60758d]">{queue.queueTypeLabel} • {queue.branchName || 'Organization queue'}</span>
                  </div>
                  <Pill tone={queue.slaWarningCount ? 'amber' : 'green'}>{queue.slaWarningCount ? 'SLA Watch' : queue.status}</Pill>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Metric label="Waiting" value={queue.waitingCount} />
                  <Metric label="Assigned" value={queue.assignedCount} />
                  <Metric label="SLA" value={queue.slaWarningCount} />
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#fbfdff] px-4 py-6 text-sm text-[#60758d]">No queues yet. Work will create default queues as transactions arrive.</p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[#162334]">Workload</h3>
          {dashboard.users.length ? (
            dashboard.users.map((user) => (
              <div key={user.userId} className="flex items-center justify-between gap-3 rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-3">
                <div>
                  <strong className="block text-sm text-[#162334]">{user.fullName}</strong>
                  <span className="mt-1 block text-xs text-[#60758d]">{user.branchName || 'No branch'} • {user.email}</span>
                </div>
                <Metric label="Assigned" value={user.activeWorkCount} />
              </div>
            ))
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#fbfdff] px-4 py-6 text-sm text-[#60758d]">No assignable users found yet.</p>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[#162334]">Operational Queue</h3>
        {dashboard.items.length ? (
          dashboard.items.map((item) => {
            const draft = assignmentDrafts[item.id] || { userId: '' }
            const candidateUsers = usersForItem(item)
            return (
              <div key={item.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-[#162334]">{item.reference || 'Transaction'}</strong>
                      <Pill tone={item.status === 'assigned' ? 'green' : 'amber'}>{item.status}</Pill>
                    </div>
                    <span className="mt-1 block text-xs text-[#60758d]">{item.queueName || 'Queue'} • {item.propertyLabel || item.sourceRoleType || 'No property label'}</span>
                    {item.assignedUserName ? <span className="mt-1 block text-xs font-semibold text-[#35546c]">Assigned to {item.assignedUserName}</span> : null}
                  </div>
                  {effectiveCanManage ? (
                    <div className="grid min-w-[280px] gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <select
                        className={inputClassName()}
                        value={draft.userId}
                        onChange={(event) => setAssignmentUser(item.id, event.target.value)}
                        disabled={busyKey === `assign:${item.id}`}
                      >
                        <option value="">Assign manually</option>
                        {candidateUsers.map((user) => (
                          <option key={user.userId} value={user.userId}>{user.fullName} ({user.activeWorkCount})</option>
                        ))}
                      </select>
                      <Button type="button" variant="secondary" onClick={() => handleAssign(item, false)} disabled={busyKey === `assign:${item.id}` || !draft.userId}>
                        <UserPlus size={14} />
                        Assign
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => handleAssign(item, true)} disabled={busyKey === `assign:${item.id}`}>
                        <PlayCircle size={14} />
                        Auto
                      </Button>
                    </div>
                  ) : null}
                </div>
                {item.status === 'assigned' ? (
                  <div className="mt-3">
                    <Button type="button" variant="secondary" onClick={() => handleComplete(item)} disabled={busyKey === `complete:${item.id}`}>
                      <CheckCircle2 size={14} />
                      Complete
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })
        ) : (
          <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#fbfdff] px-4 py-6 text-sm text-[#60758d]">No work waiting in queues.</p>
        )}
      </section>
    </section>
  )
}

function OrganizationListPage() {
  const [searchParams] = useSearchParams()
  const [organizations, setOrganizations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const initialIntent = searchParams.get('intent') === 'join' ? 'join' : searchParams.get('intent') === 'create' ? 'create' : 'overview'
  const [activePanel, setActivePanel] = useState(initialIntent)

  const loadOrganizations = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const rows = await listMyOrganizations()
      setOrganizations(rows)
    } catch (loadError) {
      setError(loadError.message || 'Organizations could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOrganizations()
  }, [loadOrganizations])

  return (
    <main className="min-h-screen bg-[#f5f8fb] px-4 py-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[28px] border border-[#dbe4ef] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8395aa]">Arch9 Organizations</span>
          <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.04em] text-[#142132]">Organizations, members, and firm ownership</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">
            Create a firm, request membership, and manage organization profiles without introducing branches, teams, or routing rules.
          </p>
        </header>

        <nav className="grid gap-2 sm:grid-cols-3">
          {[
            { key: 'overview', label: 'My Organizations', icon: Building2 },
            { key: 'create', label: 'Create Organization', icon: CheckCircle2 },
            { key: 'join', label: 'Join Existing', icon: UserPlus },
          ].map((item) => {
            const Icon = item.icon
            const active = activePanel === item.key
            return (
              <button
                key={item.key}
                type="button"
                className={`inline-flex items-center justify-center gap-2 rounded-[16px] border px-4 py-3 text-sm font-semibold transition ${
                  active ? 'border-[#142132] bg-[#142132] text-white' : 'border-[#dbe4ef] bg-white text-[#60758d] hover:text-[#162334]'
                }`}
                onClick={() => setActivePanel(item.key)}
              >
                <Icon size={16} />
                {item.label}
              </button>
            )
          })}
        </nav>

        {error ? <p className="rounded-[16px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">{error}</p> : null}

        {activePanel === 'overview' ? (
          <section className="space-y-4">
            {loading ? <p className="rounded-[20px] border border-[#dbe4ef] bg-white p-5 text-sm font-semibold text-[#60758d]">Loading organizations...</p> : null}
            {!loading && organizations.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {organizations.map((organization) => (
                  <OrganizationCard key={organization.id} organization={organization} />
                ))}
              </div>
            ) : null}
            {!loading && !organizations.length ? (
              <div className="rounded-[24px] border border-dashed border-[#d7e2ee] bg-white px-6 py-10 text-center">
                <h2 className="text-lg font-semibold text-[#162334]">No organizations yet</h2>
                <p className="mt-2 text-sm leading-6 text-[#60758d]">Create one, request membership, or skip until you are ready. Transaction access remains unchanged.</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {activePanel === 'create' ? <CreateOrganizationPanel onCreated={loadOrganizations} /> : null}
        {activePanel === 'join' ? <JoinOrganizationPanel onRequested={loadOrganizations} /> : null}
      </section>
    </main>
  )
}

function OrganizationProfilePage({ organizationId }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyMemberId, setBusyMemberId] = useState('')
  const [activeTab, setActiveTab] = useState('partners')

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const next = await getOrganizationProfile(organizationId)
      setProfile(next)
    } catch (loadError) {
      setError(loadError.message || 'Organization profile could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  async function handleReview(member, action, organizationRole = 'member') {
    try {
      setBusyMemberId(member.id)
      await reviewOrganizationMembership({ membershipId: member.id, action, organizationRole })
      await loadProfile()
    } catch (reviewError) {
      setError(reviewError.message || 'Membership could not be updated.')
    } finally {
      setBusyMemberId('')
    }
  }

  async function handleRoleChange(member, organizationRole) {
    try {
      setBusyMemberId(member.id)
      await updateOrganizationMemberRole({ membershipId: member.id, organizationRole })
      await loadProfile()
    } catch (roleError) {
      setError(roleError.message || 'Member role could not be updated.')
    } finally {
      setBusyMemberId('')
    }
  }

  async function handleRemove(member) {
    try {
      setBusyMemberId(member.id)
      await removeOrganizationMember(member.id)
      await loadProfile()
    } catch (removeError) {
      setError(removeError.message || 'Member could not be removed.')
    } finally {
      setBusyMemberId('')
    }
  }

  const organization = profile?.organization || null
  const pendingMembers = useMemo(() => (profile?.members || []).filter((member) => member.membershipStatus === 'pending'), [profile?.members])
  const activeMembers = useMemo(() => (profile?.members || []).filter((member) => member.membershipStatus === 'active'), [profile?.members])

  return (
    <main className="min-h-screen bg-[#f5f8fb] px-4 py-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <Link to="/organizations" className="inline-flex text-sm font-semibold text-[#35546c]">Back to organizations</Link>
        {loading ? <p className="rounded-[20px] border border-[#dbe4ef] bg-white p-5 text-sm font-semibold text-[#60758d]">Loading organization profile...</p> : null}
        {error ? <p className="rounded-[16px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm text-[#b42318]">{error}</p> : null}
        {organization ? (
          <>
            <header className="rounded-[28px] border border-[#dbe4ef] bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#8395aa]">{organization.typeLabel}</span>
                  <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.04em] text-[#142132]">{organization.name}</h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">{organization.description || 'Organization profile and membership management.'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Pill tone={organization.status === 'active' ? 'green' : 'slate'}>{organization.status}</Pill>
                  {profile.canManage ? <Pill tone="slate">Admin</Pill> : null}
                </div>
              </div>
              <div className="mt-6 grid gap-3 md:grid-cols-4">
                <Metric label="Members" value={organization.memberCount} />
                <Metric label="Transactions" value={organization.transactionCount} />
                <Metric label="Pending Requests" value={organization.pendingRequests} />
                <Metric label="Subtype" value={organization.subtype || 'None'} />
              </div>
              <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-[#60758d]">
                <ShieldCheck className="mt-0.5 shrink-0 text-[#247857]" size={18} />
                Membership does not grant transaction access. Transaction visibility still comes only from transaction-specific access records.
              </p>
            </header>

            <nav className="grid gap-2 sm:grid-cols-6">
              {[
                { key: 'partners', label: 'Partners', icon: Handshake },
                { key: 'network', label: 'Network', icon: Network },
                { key: 'structure', label: 'Structure', icon: GitBranch },
                { key: 'queues', label: 'Queues', icon: ClipboardList },
                { key: 'members', label: 'Members', icon: Users },
                { key: 'activity', label: 'Activity', icon: Activity },
              ].map((item) => {
                const Icon = item.icon
                const active = activeTab === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`inline-flex items-center justify-center gap-2 rounded-[16px] border px-4 py-3 text-sm font-semibold transition ${
                      active ? 'border-[#142132] bg-[#142132] text-white' : 'border-[#dbe4ef] bg-white text-[#60758d] hover:text-[#162334]'
                    }`}
                    onClick={() => setActiveTab(item.key)}
                  >
                    <Icon size={16} />
                    {item.label}
                  </button>
                )
              })}
            </nav>

            {activeTab === 'partners' ? <PartnerConnectionsPanel organizationId={organization.id} canManage={profile.canManage} /> : null}

            {activeTab === 'network' ? <NetworkIntelligencePanel organizationId={organization.id} /> : null}

            {activeTab === 'structure' ? <OrganizationHierarchyPanel organizationId={organization.id} canManage={profile.canManage} /> : null}

            {activeTab === 'queues' ? <QueueManagementPanel organizationId={organization.id} canManage={profile.canManage} /> : null}

            {activeTab === 'members' ? (
              <section className="space-y-4 rounded-[24px] border border-[#e3ebf4] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center gap-2">
                    <Users size={18} className="text-[#35546c]" />
                    <h2 className="text-lg font-semibold text-[#162334]">Members</h2>
                  </div>
                  {pendingMembers.length && profile.canManage ? (
                    <div className="space-y-2 rounded-[18px] border border-[#f3d9a8] bg-[#fff8ec] p-3">
                      <h3 className="text-sm font-semibold text-[#8a5a12]">Pending Requests</h3>
                      {pendingMembers.map((member) => (
                        <div key={member.id} className="rounded-[14px] border border-[#f3d9a8] bg-white p-3">
                          <strong className="block text-sm text-[#162334]">{member.fullName}</strong>
                          <span className="block text-xs text-[#60758d]">{member.email}</span>
                          {member.requestMessage ? <p className="mt-2 text-xs leading-5 text-[#60758d]">{member.requestMessage}</p> : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button type="button" onClick={() => handleReview(member, 'approve', 'member')} disabled={busyMemberId === member.id}>
                              <CheckCircle2 size={14} />
                              Approve
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => handleReview(member, 'decline')} disabled={busyMemberId === member.id}>
                              <XCircle size={14} />
                              Decline
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    {activeMembers.map((member) => (
                      <div key={member.id} className="flex flex-col gap-3 rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <strong className="block text-sm text-[#162334]">{member.fullName}</strong>
                          <span className="mt-1 block text-xs text-[#60758d]">{member.email} • Joined {formatDate(member.joinedAt)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone="green">{member.organizationRoleLabel}</Pill>
                          {profile.canManage ? (
                            <>
                              <select
                                className="rounded-[12px] border border-[#dbe4ef] bg-white px-3 py-2 text-xs font-semibold text-[#35546c]"
                                value={member.organizationRole}
                                onChange={(event) => handleRoleChange(member, event.target.value)}
                                disabled={busyMemberId === member.id}
                              >
                                <option value="owner">Owner</option>
                                <option value="admin">Admin</option>
                                <option value="member">Member</option>
                              </select>
                              <button
                                type="button"
                                className="rounded-[12px] border border-[#f1c9c5] bg-white px-3 py-2 text-xs font-semibold text-[#b42318]"
                                onClick={() => handleRemove(member)}
                                disabled={busyMemberId === member.id}
                              >
                                Remove
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
            ) : null}

            {activeTab === 'activity' ? (
              <section className="space-y-4 rounded-[24px] border border-[#e3ebf4] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center gap-2">
                    <Activity size={18} className="text-[#35546c]" />
                    <h2 className="text-lg font-semibold text-[#162334]">Activity</h2>
                  </div>
                  {profile.events.length ? (
                    <div className="space-y-2">
                      {profile.events.map((event) => (
                        <div key={event.id} className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-3 py-2.5">
                          <strong className="block text-sm text-[#162334]">{event.eventType}</strong>
                          <span className="mt-1 flex items-center gap-1 text-xs text-[#60758d]">
                            <Clock3 size={13} />
                            {formatDate(event.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-[14px] border border-dashed border-[#d7e2ee] bg-[#fbfdff] px-4 py-8 text-center text-sm text-[#60758d]">No organization activity yet.</p>
                  )}
                </section>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  )
}

export default function OrganizationWorkspacePage() {
  const { organizationId } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (organizationId === 'new') {
      navigate('/organizations?intent=create', { replace: true })
    }
  }, [navigate, organizationId])

  if (organizationId && organizationId !== 'new') {
    return <OrganizationProfilePage organizationId={organizationId} />
  }

  return <OrganizationListPage />
}
