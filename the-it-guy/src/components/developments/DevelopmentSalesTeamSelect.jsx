import { Check, ChevronDown, Search, Users, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { getAgentDisplayName, getAgentOptionKey, getAgentProfileAvatarUrl } from '../agentAssignmentSelectModel'
import './development-sales-team.css'

function sameAgent(left, right) {
  const leftId = left.userId || left.id
  const rightId = right.userId || right.id
  if (leftId && rightId && leftId === rightId) return true
  return Boolean(left.email && right.email && left.email.toLowerCase() === right.email.toLowerCase())
}

function TeamAvatar({ agent }) {
  const url = getAgentProfileAvatarUrl(agent)
  const [failedUrl, setFailedUrl] = useState('')
  const initials = getAgentDisplayName(agent).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  return <span className="development-team-avatar">
    {url && failedUrl !== url ? <img src={url} alt="" onError={() => setFailedUrl(url)} /> : initials}
  </span>
}

function TeamIdentity({ agent }) {
  return <>
    <TeamAvatar agent={agent} />
    <span className="development-team-identity">
      <strong>{getAgentDisplayName(agent)}{agent.isCurrentUser ? <small>You</small> : null}</strong>
      <span title={agent.email}>{agent.email || 'No email on profile'}</span>
    </span>
  </>
}

export default function DevelopmentSalesTeamSelect({ agents = [], value = [], loading = false, error = '', onRetry, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const searchRef = useRef(null)
  const panelId = useId()
  const selected = value.filter((agent) => agent.name || agent.email || agent.company)
  const visibleAgents = agents.filter((agent) => `${getAgentDisplayName(agent)} ${agent.email || ''}`.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])

  const close = () => { setOpen(false); triggerRef.current?.focus() }
  const toggle = (agent) => {
    const exists = selected.some((member) => sameAgent(member, agent))
    onChange(exists ? selected.filter((member) => !sameAgent(member, agent)) : [...selected, agent])
  }

  return <div ref={rootRef} className="development-team-select" onBlur={(event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }} onKeyDown={(event) => {
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
  }}>
    <button ref={triggerRef} type="button" className="development-team-trigger" aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog" onClick={() => { setOpen(!open); setQuery('') }}>
      <span className="development-team-trigger-icon"><Users size={18} aria-hidden="true" /></span>
      <span><strong>Choose sales team</strong><span>{selected.length ? `${selected.length} ${selected.length === 1 ? 'agent' : 'agents'} selected` : 'Select agents from your organisation'}</span></span>
      <ChevronDown size={17} aria-hidden="true" className={open ? 'is-open' : ''} />
    </button>
    {open ? <div id={panelId} role="dialog" aria-label="Choose sales team" className="development-team-dropdown">
      <div className="development-team-search"><Search size={16} aria-hidden="true" /><input ref={searchRef} type="search" aria-label="Search sales agents" placeholder="Search name or email" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      {loading ? <p role="status" className="development-team-message">Loading agents…</p> : null}
      {error ? <div role="alert" className="development-team-message development-team-error">{error} <button type="button" onClick={onRetry}>Try again</button></div> : null}
      {visibleAgents.length ? <button type="button" className="development-team-select-all" onClick={() => onChange([...selected, ...visibleAgents.filter((agent) => !selected.some((member) => sameAgent(member, agent)))])}>{query.trim() ? 'Select matching agents' : 'Select all agents'}</button> : null}
      <div className="development-team-options" role="group" aria-label="Sales agents">
        {visibleAgents.map((agent) => {
          const checked = selected.some((member) => sameAgent(member, agent))
          return <label key={getAgentOptionKey(agent)} className={`development-team-option${checked ? ' is-selected' : ''}`}>
            <TeamIdentity agent={agent} />
            <input type="checkbox" aria-label={`Select ${getAgentDisplayName(agent)}`} checked={checked} onChange={() => toggle(agent)} />
            <span className="development-team-checkbox" aria-hidden="true">{checked ? <Check size={13} /> : null}</span>
          </label>
        })}
        {!visibleAgents.length && !loading ? <p className="development-team-message">{query.trim() ? 'No agents match your search.' : 'No sales agents available.'}</p> : null}
      </div>
      <div className="development-team-dropdown-footer"><span>{selected.length} selected</span><button type="button" onClick={close}>Done</button></div>
    </div> : null}
    {selected.length ? <ul className="development-team-cards" aria-label="Selected sales team">
      {selected.map((member, index) => {
        const agent = { ...member, ...agents.find((option) => sameAgent(member, option)) }
        return <li key={`${getAgentOptionKey(member)}-${index}`} className="development-team-card">
          <TeamIdentity agent={agent} />
          <button type="button" aria-label={`Remove ${getAgentDisplayName(agent)} from sales team`} onClick={() => onChange(selected.filter((_, memberIndex) => memberIndex !== index))}><X size={14} aria-hidden="true" /></button>
        </li>
      })}
    </ul> : <p className="development-team-empty">Select the agents who will work on this development.</p>}
  </div>
}
