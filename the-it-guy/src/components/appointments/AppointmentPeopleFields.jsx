import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import { isOrganiser, samePerson, toggleAppointmentClient, updateAppointmentOrganisers } from './appointmentPeopleModel'

function Avatar({ person }) {
  const [failed, setFailed] = useState(false)
  return <span className="ae-person-avatar">{person.avatarUrl && !failed
    ? <img src={person.avatarUrl} alt="" onError={() => setFailed(true)} />
    : (person.name || '?').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</span>
}

function PeoplePicker({ label, placeholder, options, selected, onToggle, disabled, children, primaryId, onPrimary, panelOnly = false }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const root = useRef(null)
  useEffect(() => {
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])
  const matches = options.filter(person => `${person.name} ${person.email || ''} ${person.phone || ''}`.toLowerCase().includes(search.toLowerCase().trim()))
  return <div className="ae-people-field" ref={root} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); root.current.querySelector('button')?.focus() }
  }}>
    <span className="ae-field-label">{label}</span>
    <button type="button" className="ae-people-trigger" aria-label={label} aria-expanded={open} disabled={disabled} onClick={() => setOpen(value => !value)}>
      {selected.length ? <><span className="ae-avatar-stack">{selected.slice(0, 3).map(person => <Avatar key={person.id} person={person} />)}</span><span className="ae-trigger-label">{selected.length === 1 ? selected[0].name : `${selected[0].name} +${selected.length - 1}`}</span></> : <span className="ae-placeholder">{placeholder}</span>}
      <ChevronDown size={16} />
    </button>
    {open ? <div className={`ae-people-menu${panelOnly ? ' ae-people-menu-inline' : ''}`}>
      {!panelOnly ? <><label className="ae-people-search"><Search size={16} /><input autoFocus type="search" aria-label={`Search ${label.toLowerCase()}`} placeholder="Search by name or email" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="ae-people-results" role="group" aria-label={`${label} choices`}>
        {matches.map(person => {
          const checked = selected.some(item => item.id === person.id)
          return <button type="button" className="ae-person-option" aria-pressed={checked} key={person.id} onClick={() => onToggle(person)}>
            <Avatar person={person} /><span><strong>{person.name}</strong><small>{person.email || person.phone || person.role || 'No contact details'}</small></span><span className="ae-person-check">{checked ? <Check size={15} /> : null}</span>
          </button>
        })}
        {!matches.length ? <p className="ae-picker-empty">No matches. Try another name.</p> : null}
      </div></> : null}
      {primaryId ? <p className="ae-picker-hint">The first organiser manages this booking. Select more people to include your team.</p> : null}
      {children}
      {!panelOnly ? <button type="button" className="ae-picker-done" onClick={() => setOpen(false)}>Done</button> : null}
    </div> : null}
    {selected.length > 1 ? <div className="ae-selected-people">{selected.map(person => <span className="ae-person-tag" key={person.id}>
      <Avatar person={person} /><span>{person.name}</span>
      {primaryId === person.id ? <small>Primary</small> : onPrimary ? <button type="button" disabled={disabled} onClick={() => onPrimary(person)} aria-label={`Make ${person.name} primary organiser`}>Make primary</button> : null}
      {primaryId !== person.id ? <button type="button" disabled={disabled} aria-label={`Remove ${person.name}`} onClick={() => onToggle(person)}><X size={12} /></button> : null}
    </span>)}</div> : null}
  </div>
}

export function AppointmentOrganisers({ form, agents, currentAgentId, canChangePrimary, disabled, onChange }) {
  const primaryId = form.assignedAgentId || currentAgentId
  const primary = agents.find(agent => agent.id === primaryId)
  const selected = [primary, ...agents.filter(agent => agent.id !== primaryId && (form.participants || []).some(person => isOrganiser(person) && samePerson(person, agent)))].filter(Boolean)
  return <PeoplePicker label="Organiser" placeholder="Choose organisers" options={agents} selected={selected} primaryId={primaryId} disabled={disabled}
    onPrimary={canChangePrimary ? agent => onChange(previous => updateAppointmentOrganisers(previous, [agent, ...selected.filter(item => item.id !== agent.id)])) : null}
    onToggle={agent => {
      if (agent.id === primaryId) return
      const next = selected.some(item => item.id === agent.id) ? selected.filter(item => item.id !== agent.id) : [...selected, agent]
      onChange(previous => updateAppointmentOrganisers(previous, next))
    }} />
}

const emptyClient = { firstName: '', lastName: '', email: '', phone: '', leadCategory: 'buyer' }
export function AppointmentClients({ form, clients, loading = false, loadError = '', onRetry, onChange, onCreate, onCreatingChange }) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(emptyClient)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selected = clients.filter(client => (client.contactId && client.contactId === form.contactId) || (form.participants || []).some(person => !isOrganiser(person) && samePerson(person, client)))
  async function create() {
    if (busy) return
    if (![draft.firstName, draft.lastName, draft.email, draft.phone].every(value => value.trim())) { setError('Enter a first name, surname, email and phone number.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) { setError('Enter a valid email address.'); return }
    setBusy(true); onCreatingChange?.(true); setError('')
    try { await onCreate(draft); setCreating(false); setDraft(emptyClient) }
    catch (failure) { setError(failure.message || 'Unable to save this client. Your details are still here; please try again.') }
    finally { setBusy(false); onCreatingChange?.(false) }
  }
  return <PeoplePicker label="Clients" placeholder="Choose clients or leads" options={clients} selected={selected} disabled={busy} panelOnly={creating} onToggle={client => onChange(previous => toggleAppointmentClient(previous, client))}>
    {loading ? <p className="ae-picker-hint" role="status">Loading saved clients…</p> : null}
    {loadError ? <p className="ae-picker-hint" role="alert">{loadError} <button type="button" onClick={onRetry}>Retry clients</button></p> : null}
    {creating ? <div className="ae-client-create" aria-label="New client">
      <strong>New client</strong><p>Save a lead and add them to this appointment.</p>
      <div className="ae-client-create-grid">{[['firstName', 'First name'], ['lastName', 'Surname'], ['email', 'Email'], ['phone', 'Phone']].map(([key, label]) => <label key={key}>{label}<input autoFocus={key === 'firstName'} type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} disabled={busy} value={draft[key]} onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))} /></label>)}</div>
      <label>Client type<select value={draft.leadCategory} disabled={busy} onChange={event => setDraft(previous => ({ ...previous, leadCategory: event.target.value }))}><option value="buyer">Buyer</option><option value="seller">Seller</option><option value="other">Other</option></select></label>
      {error ? <p role="alert">{error}</p> : null}
      <div className="ae-create-actions"><button type="button" disabled={busy} onClick={() => setCreating(false)}>Cancel</button><button type="button" disabled={busy} onClick={create}>{busy ? 'Saving…' : 'Create client & add'}</button></div>
    </div> : <button type="button" className="ae-create-client" onClick={() => setCreating(true)}><Plus size={15} />Create new client</button>}
  </PeoplePicker>
}
