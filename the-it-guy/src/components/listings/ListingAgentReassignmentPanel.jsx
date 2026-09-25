import { CheckCircle2, Loader2, RefreshCw, UserRound, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { listOrganisationUsers } from '../../lib/settingsApi'
import { reassignListingAgent } from '../../services/listingAgentReassignmentService'

const ACTIVE_STATUSES = new Set(['active', 'accepted', 'approved'])
const LISTING_AGENT_ROLES = new Set([
  'agent',
  'estate_agent',
  'sales_agent',
  'listing_agent',
  'owner',
  'agency_owner',
  'principal',
  'agency_principal',
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function getAgentUserId(agent = {}) {
  return normalizeText(agent.userId || agent.user_id)
}

function getAgentRole(agent = {}) {
  return normalizeKey(agent.workspaceRole || agent.organisationRole || agent.role)
}

function canOwnListing(agent = {}) {
  const status = normalizeKey(agent.membershipStatus || agent.status)
  const role = getAgentRole(agent)
  return Boolean(
    getAgentUserId(agent) &&
    ACTIVE_STATUSES.has(status) &&
    (LISTING_AGENT_ROLES.has(role) || role.endsWith('_agent')),
  )
}

function getAgentName(agent = {}) {
  return normalizeText(
    agent.fullName ||
    agent.full_name ||
    agent.name ||
    [agent.firstName || agent.first_name, agent.lastName || agent.last_name].filter(Boolean).join(' ') ||
    agent.email,
  )
}

function getAgentAvatarUrl(agent = {}) {
  return normalizeText(
    agent.avatarUrl ||
    agent.avatar_url ||
    agent.profilePhotoUrl ||
    agent.profile_photo_url ||
    agent.photoUrl ||
    agent.photo_url ||
    agent.picture,
  )
}

function getAgentInitials(agent = {}) {
  const value = getAgentName(agent) || normalizeText(agent.email) || 'Agent'
  const parts = value.includes('@') ? value.split('@')[0].split(/[._\s-]+/) : value.split(/\s+/)
  return parts.filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'A'
}

function isLiveProperty24Listing(listing = {}) {
  const reference = normalizeText(listing.property24Reference || listing.property24_reference)
  const status = normalizeKey(listing.property24Status || listing.property24_status)
  return Boolean(reference && !['withdrawn', 'removed', 'cancelled', 'cancelled_sale', 'expired'].includes(status))
}

export default function ListingAgentReassignmentPanel({
  listingId,
  listing = {},
  agent = {},
  listingType = 'sale',
  onReassigned,
  className = '',
} = {}) {
  const currentAgentId = normalizeText(listing.assignedAgentId || listing.assigned_agent_id || listing.agentId)
  const currentAgentName = normalizeText(listing.assignedAgentName || listing.assigned_agent_name || listing.assignedAgent || getAgentName(agent) || 'Unassigned')
  const currentAgentEmail = normalizeText(listing.assignedAgentEmail || listing.assigned_agent_email || agent.email).toLowerCase()
  const currentAgentPhone = normalizeText(listing.assignedAgentPhone || listing.assigned_agent_phone || agent.phone || agent.phoneNumber || agent.mobile)
  const suppliedAgentAvatarUrl = getAgentAvatarUrl(agent) || normalizeText(listing.assignedAgentAvatarUrl || listing.assigned_agent_avatar_url)
  const property24Live = isLiveProperty24Listing(listing)
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState([])
  const [selectedAgentId, setSelectedAgentId] = useState(currentAgentId)
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (suppliedAgentAvatarUrl || (!currentAgentId && !currentAgentEmail)) return undefined
    let active = true
    listOrganisationUsers()
      .then((rows) => { if (active) setAgents(Array.isArray(rows) ? rows : []) })
      .catch(() => null)
    return () => { active = false }
  }, [currentAgentId, currentAgentEmail, suppliedAgentAvatarUrl])

  useEffect(() => {
    setSelectedAgentId(currentAgentId)
  }, [currentAgentId])

  const availableAgents = useMemo(
    () => agents
      .filter(canOwnListing)
      .sort((left, right) => getAgentName(left).localeCompare(getAgentName(right))),
    [agents],
  )
  const directoryCurrentAgent = agents.find((row) =>
    (currentAgentId && getAgentUserId(row) === currentAgentId) ||
    (currentAgentEmail && normalizeText(row.email).toLowerCase() === currentAgentEmail),
  ) || null
  const currentAgentAvatarUrl = suppliedAgentAvatarUrl || getAgentAvatarUrl(directoryCurrentAgent || {})
  const selectedAgent = availableAgents.find((agent) => getAgentUserId(agent) === selectedAgentId) || null
  const canSave = Boolean(selectedAgentId && selectedAgentId !== currentAgentId && !saving)

  async function loadAgents() {
    try {
      setLoadingAgents(true)
      setError('')
      const rows = await listOrganisationUsers()
      setAgents(Array.isArray(rows) ? rows : [])
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load the agency agent directory.')
    } finally {
      setLoadingAgents(false)
    }
  }

  function openPanel() {
    setOpen(true)
    setError('')
    setSuccess('')
    setSelectedAgentId(currentAgentId)
    if (!agents.length) void loadAgents()
  }

  function closePanel() {
    if (saving) return
    setOpen(false)
    setError('')
    setSelectedAgentId(currentAgentId)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSave) return
    try {
      setSaving(true)
      setError('')
      setSuccess('')
      const result = await reassignListingAgent(listingId, selectedAgentId, { listingType })
      const nextName = getAgentName(selectedAgent) || 'the selected agent'
      setSuccess(property24Live
        ? `Reassigned to ${nextName} and synchronised with Property24.`
        : `Reassigned to ${nextName}.`)
      await onReassigned?.(result)
      setOpen(false)
    } catch (saveError) {
      setError(saveError?.message || 'Unable to reassign this listing.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={`rounded-[12px] border border-[#dbe6f2] bg-white p-4 shadow-sm ${className}`.trim()} data-testid="listing-agent-reassignment">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#dbe6f2] bg-[#eef4fa] text-sm font-semibold text-[#42617f]">
            {currentAgentAvatarUrl ? <img src={currentAgentAvatarUrl} alt="" className="h-full w-full object-cover" /> : getAgentInitials({ name: currentAgentName, email: currentAgentEmail })}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-[#607891]">Listing agent</p>
            <p className="mt-1 truncate text-sm font-semibold text-[#18324b]">{currentAgentName}</p>
            {currentAgentEmail ? <p className="mt-1 truncate text-xs text-[#607891]">{currentAgentEmail}</p> : null}
            {currentAgentPhone ? <p className="mt-1 text-xs text-[#607891]">{currentAgentPhone}</p> : null}
            {!currentAgentEmail && !currentAgentPhone ? <p className="mt-1 text-xs leading-5 text-[#607891]">Contact details are not available on this listing.</p> : null}
          </div>
        </div>
        <button type="button" className="ui-pill-button" onClick={open ? closePanel : openPanel} disabled={saving}>
          {open ? <X size={15} aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
          {open ? 'Cancel' : 'Reassign'}
        </button>
      </div>

      {success ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#286b43]" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          {success}
        </p>
      ) : null}

      {open ? (
        <form className="mt-4 border-t border-[#edf2f7] pt-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-sm font-semibold text-[#2d445e]" htmlFor={`listing-agent-${listingId}`}>
            Assign to
            <select
              id={`listing-agent-${listingId}`}
              className="h-11 rounded-[10px] border border-[#d8e3ee] bg-white px-3 text-sm text-[#17233a] focus:border-[#0f7f4f] focus:outline-none focus:ring-2 focus:ring-[#dff2e8]"
              value={selectedAgentId}
              onChange={(event) => {
                setSelectedAgentId(event.target.value)
                setError('')
              }}
              disabled={loadingAgents || saving}
            >
              <option value="">Choose an active agent</option>
              {availableAgents.map((agent) => {
                const userId = getAgentUserId(agent)
                const name = getAgentName(agent)
                return <option key={userId} value={userId}>{name}{userId === currentAgentId ? ' (current)' : ''}</option>
              })}
            </select>
          </label>

          {loadingAgents ? (
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-[#607891]">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              Loading active agents…
            </p>
          ) : null}
          {!loadingAgents && !availableAgents.length ? (
            <p className="mt-3 text-sm font-semibold text-[#9f5f15]">No active listing agents are available in this agency.</p>
          ) : null}
          {property24Live ? (
            <p className="mt-3 rounded-[8px] border border-[#dbe6f2] bg-[#f8fbff] px-3 py-2 text-xs font-semibold leading-5 text-[#42617f]">
              This listing is live on Property24. Arch9 will require the new agent’s Property24 mapping and update the portal before completing the change.
            </p>
          ) : null}
          {error ? <p className="mt-3 text-sm font-semibold text-[#9f3131]" role="alert">{error}</p> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" className="ui-pill-button ui-pill-button-active" disabled={!canSave || loadingAgents}>
              {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <UserRound size={15} aria-hidden="true" />}
              {saving ? 'Reassigning…' : 'Confirm reassignment'}
            </button>
            <button type="button" className="ui-pill-button" onClick={loadAgents} disabled={loadingAgents || saving}>
              <RefreshCw size={15} aria-hidden="true" />
              Refresh agents
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
