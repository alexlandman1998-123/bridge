import { Check, ChevronDown, Loader2, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { listOrganisationUsers, listOrganisationUsersForWorkspace } from '../../lib/settingsApi'
import { reassignListingAgent } from '../../services/listingAgentReassignmentService'

const ACTIVE_STATUSES = new Set(['active', 'accepted', 'approved'])
const LISTING_AGENT_ROLES = new Set([
  'agent', 'estate_agent', 'sales_agent', 'listing_agent',
  'owner', 'agency_owner', 'principal', 'agency_principal',
])

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function agentId(agent = {}) {
  return text(agent.userId || agent.user_id)
}

function agentName(agent = {}) {
  return text(agent.fullName || agent.full_name || agent.name ||
    [agent.firstName || agent.first_name, agent.lastName || agent.last_name].filter(Boolean).join(' ') || agent.email)
}

function avatarUrl(agent = {}) {
  return text(agent.avatarUrl || agent.avatar_url || agent.profilePhotoUrl || agent.profile_photo_url ||
    agent.photoUrl || agent.photo_url || agent.picture)
}

function initials(name = '') {
  return text(name).split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'A'
}

function canOwnListing(agent = {}) {
  const role = key(agent.workspaceRole || agent.organisationRole || agent.role)
  return Boolean(agentId(agent) && ACTIVE_STATUSES.has(key(agent.membershipStatus || agent.status)) &&
    (LISTING_AGENT_ROLES.has(role) || role.endsWith('_agent')))
}

function isLiveProperty24Listing(listing = {}) {
  const reference = text(listing.property24Reference || listing.property24_reference)
  const status = key(listing.property24Status || listing.property24_status)
  return Boolean(reference && !['withdrawn', 'removed', 'cancelled', 'cancelled_sale', 'expired'].includes(status))
}

function AgentAvatar({ agent = {}, name = '', className = '' }) {
  const url = avatarUrl(agent)
  return (
    <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#dbe6f2] bg-[#eef4fa] text-xs font-semibold text-[#42617f] ${className}`}>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initials(name || agentName(agent))}
    </span>
  )
}

export default function ListingAgentReassignmentPanel({
  listingId,
  listing = {},
  agent = {},
  listingType = 'sale',
  onReassigned,
  className = '',
} = {}) {
  const [assignmentOverride, setAssignmentOverride] = useState(null)
  const currentAgentId = text(assignmentOverride?.userId || listing.assignedAgentId || listing.assigned_agent_id || listing.agentId)
  const organisationId = text(listing.organisationId || listing.organisation_id)
  const property24Live = isLiveProperty24Listing(listing)
  const currentAgentEmail = text(assignmentOverride?.email || listing.assignedAgentEmail || listing.assigned_agent_email || agent.email).toLowerCase()
  const currentAgentName = text(assignmentOverride?.name || listing.assignedAgentName || listing.assigned_agent_name || listing.assignedAgent || agentName(agent) || 'Unassigned')
  const panelRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [agents, setAgents] = useState([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    setAssignmentOverride(null)
  }, [listingId])

  useEffect(() => {
    if (!open || saving) return undefined
    function closeOnOutsideClick(event) {
      if (!panelRef.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, saving])

  const availableAgents = useMemo(() => agents.filter(canOwnListing)
    .sort((left, right) => agentName(left).localeCompare(agentName(right))), [agents])
  const currentDirectoryAgent = agents.find((row) =>
    (currentAgentId && agentId(row) === currentAgentId) ||
    (currentAgentEmail && text(row.email).toLowerCase() === currentAgentEmail)) || null
  const currentAgent = {
    avatarUrl: assignmentOverride?.avatarUrl || avatarUrl(agent) || avatarUrl(currentDirectoryAgent),
  }
  const filteredAgents = availableAgents.filter((row) =>
    `${agentName(row)} ${text(row.email)}`.toLowerCase().includes(query.toLowerCase()))

  async function openPicker() {
    if (saving) return
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    setQuery('')
    setError('')
    if (agents.length) return
    try {
      setLoadingAgents(true)
      const rows = organisationId
        ? await listOrganisationUsersForWorkspace({ organisationId })
        : await listOrganisationUsers()
      setAgents(Array.isArray(rows) ? rows : [])
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load the agency agent directory.')
    } finally {
      setLoadingAgents(false)
    }
  }

  async function assignAgent(nextAgent) {
    const nextId = agentId(nextAgent)
    if (!nextId || nextId === currentAgentId || saving) {
      setOpen(false)
      return
    }
    try {
      setSaving(true)
      setError('')
      setSuccess('')
      const result = await reassignListingAgent(listingId, nextId, { listingType })
      setAssignmentOverride({
        userId: nextId,
        name: agentName(nextAgent),
        email: text(nextAgent.email),
        avatarUrl: avatarUrl(nextAgent),
      })
      await onReassigned?.(result)
      setSuccess(`Listing assigned to ${agentName(nextAgent)}.`)
      setOpen(false)
    } catch (saveError) {
      setError(saveError?.message || 'Unable to assign this listing.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section ref={panelRef} className={`relative rounded-[16px] border border-[#dde4ee] bg-white p-5 shadow-[0_8px_20px_rgba(15,23,42,0.035)] ${className}`.trim()} data-testid="listing-agent-reassignment">
      <p className="text-xs font-semibold uppercase text-[#607891]">Listing agent</p>
      <button type="button" onClick={openPicker} disabled={saving} aria-expanded={open} aria-haspopup="listbox" aria-controls={`listing-agent-options-${listingId}`}
        className="mt-3 flex w-full items-center gap-3 rounded-[12px] border border-[#dbe6f2] bg-[#fbfdff] p-3 text-left transition hover:border-[#aac5df] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1f4f78] disabled:opacity-60">
        <AgentAvatar agent={currentAgent} name={currentAgentName} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[#18324b]">{currentAgentName}</span>
          {currentAgentEmail ? <span className="mt-0.5 block truncate text-xs text-[#607891]">{currentAgentEmail}</span> : null}
        </span>
        {saving ? <Loader2 size={17} className="shrink-0 animate-spin text-[#607891]" /> : <ChevronDown size={17} className={`shrink-0 text-[#607891] transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {success ? <p className="mt-2 text-xs font-semibold text-[#286b43]" role="status">{success}</p> : null}
      {error && !open ? <p className="mt-2 text-xs font-semibold text-[#9f3131]" role="alert">{error}</p> : null}

      {open ? (
        <div className="absolute left-5 right-5 top-full z-30 mt-2 rounded-[14px] border border-[#dbe6f2] bg-white p-2 shadow-[0_16px_36px_rgba(15,23,42,0.16)]">
          <label className="flex items-center gap-2 rounded-[10px] border border-[#dbe6f2] px-3" htmlFor={`listing-agent-search-${listingId}`}>
            <Search size={15} className="text-[#607891]" aria-hidden="true" />
            <input id={`listing-agent-search-${listingId}`} value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Search agents" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
          {loadingAgents ? <p className="flex items-center gap-2 px-3 py-4 text-sm text-[#607891]"><Loader2 size={15} className="animate-spin" />Loading agents…</p> : (
            <div id={`listing-agent-options-${listingId}`} role="listbox" aria-label="Choose listing agent" className="mt-2 max-h-64 overflow-y-auto">
              {filteredAgents.map((row) => {
                const selected = agentId(row) === currentAgentId
                return (
                  <button key={agentId(row)} type="button" role="option" aria-selected={selected} onClick={() => void assignAgent(row)}
                    className="flex w-full items-center gap-3 rounded-[9px] px-2 py-2 text-left hover:bg-[#f3f8fd] focus-visible:bg-[#f3f8fd] focus-visible:outline-none">
                    <AgentAvatar agent={row} name={agentName(row)} className="!h-8 !w-8" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#18324b]">{agentName(row)}</span>
                      <span className="block truncate text-xs text-[#607891]">{text(row.email)}</span>
                    </span>
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${selected ? 'border-[#1f4f78] bg-[#1f4f78] text-white' : 'border-[#a8b9ca] bg-white'}`} aria-hidden="true">
                      {selected ? <Check size={14} /> : null}
                    </span>
                  </button>
                )
              })}
              {!filteredAgents.length ? <p className="px-3 py-4 text-sm text-[#607891]">No active agents found.</p> : null}
            </div>
          )}
          {error ? <p className="px-3 py-2 text-xs font-semibold text-[#9f3131]" role="alert">{error}</p> : null}
          {property24Live ? <p className="px-3 py-2 text-xs text-[#607891]">A live Property24 listing also needs a mapped Property24 agent. If the mapping is missing, the assignment will stay unchanged.</p> : null}
          <p className="px-3 pb-1 pt-2 text-xs text-[#607891]">One primary agent per listing. Selecting an agent saves the assignment.</p>
        </div>
      ) : null}
    </section>
  )
}
