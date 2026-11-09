import { useRef, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, Home, Link2, Loader2, Search, ShieldCheck, UserPlus, Users } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { getDevelopmentLeadBoardStage } from '../../core/developments/developmentLeadBoard.js'
import { getDevelopmentReservationReadiness, getReservationStageChoices } from '../../core/developments/developmentReservationReadiness.js'
import './development-reservation-dialog.css'

const nameOf = lead => lead.buyerFullName || lead.publicReference || lead.protectedSummary || 'Buyer lead'
const EMPTY_FORM = { firstName: '', lastName: '', email: '', phone: '', notes: '' }

function LeadProgress({ lead, busy, canEdit, onChangeStage, onOpenLead }) {
  const current = getDevelopmentLeadBoardStage(lead)
  const [targetKey, setTargetKey] = useState(current.key)
  const [working, setWorking] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const choices = getReservationStageChoices(lead)
  const choice = choices.find(stage => stage.key === targetKey)
  async function saveStage() {
    if (!choice?.editable || busy || working || !canEdit) return
    setWorking(true)
    setError('')
    try {
      await onChangeStage(lead.developerLeadId, targetKey)
      setFeedback(`Saved: ${choice.label}`)
    } catch (saveError) { setError(saveError.message || 'The lead stage could not be saved.') }
    finally { setWorking(false) }
  }
  return <section className="reservation-progress" aria-label="Buyer lead progress">
    <div className="reservation-section-label"><ArrowRight size={15} aria-hidden="true" />Development lead process</div>
    <h4>{current.label}</h4>
    <p>Current saved stage for this buyer.</p>
    <label htmlFor="reservation-lead-stage">Lead stage</label>
    <Field as="select" id="reservation-lead-stage" value={targetKey} disabled={busy || working || !canEdit} onChange={event => { setTargetKey(event.target.value); setFeedback(''); setError('') }}>
      {choices.map(stage => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
    </Field>
    {choice?.reason ? <p className="reservation-stage-note">{choice.reason}</p> : null}
    <div className="reservation-stage-actions">
      {targetKey !== current.key && choice?.editable && onChangeStage ? <Button type="button" size="sm" disabled={busy || working || !canEdit} onClick={() => void saveStage()}>{working ? 'Saving…' : 'Save lead stage'}</Button> : null}
      {onOpenLead ? <Button type="button" variant="ghost" size="sm" disabled={busy || working} onClick={() => onOpenLead(lead.developerLeadId, targetKey)}>Open buyer workflow<ArrowRight size={14} /></Button> : null}
    </div>
    {feedback ? <p role="status" className="reservation-success">{feedback}</p> : null}
    {error ? <p role="alert" className="reservation-error">{error}</p> : null}
  </section>
}

export default function DevelopmentLeadReservationDialog({ leads = [], units = [], developmentId = '', developmentName = '', initialLeadId = '', initialUnitId = '', saving = false, leadsLoading = false, leadsError = '', error = '', captureReadOnly = false, initialCreateDraft = EMPTY_FORM, canCreateLead = true, canEditLead = () => true, onClose, onReserve, onCreateLead, onChangeStage, onOpenLead }) {
  const [leadId, setLeadId] = useState(initialLeadId)
  const [unitId, setUnitId] = useState(initialUnitId)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(captureReadOnly)
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, ...initialCreateDraft }))
  const [working, setWorking] = useState(false)
  const [localError, setLocalError] = useState('')
  const lock = useRef(false)
  const busy = saving || working
  const lead = creating ? null : leads.find(item => item.developerLeadId === leadId)
  const unit = units.find(item => item.id === unitId)
  const readiness = getDevelopmentReservationReadiness({ lead, unit, leads, developmentId })
  const blockers = [...(leadsLoading ? ['Checking the latest buyer leads…'] : []), ...(leadsError ? ['Buyer leads could not be loaded. Refresh before confirming a reservation.'] : []), ...readiness.blockers]
  const filtered = leads.filter(item => [nameOf(item), item.buyerEmail, item.buyerPhone].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase()))
  const canRelease = readiness.heldByBuyer && !unit?.currentTransactionId && !lead?.convertedTransactionId && String(unit?.status).toLowerCase() === 'reserved'
  const selectedStage = lead ? getDevelopmentLeadBoardStage(lead) : null
  const unitName = unit?.unitNumber || unit?.unit_number || ''
  async function run(command) {
    if (busy || lock.current) return
    lock.current = true
    setWorking(true)
    setLocalError('')
    try { await command() } catch (saveError) { setLocalError(saveError.message || 'The change could not be saved. Please try again.') }
    finally { lock.current = false; setWorking(false) }
  }
  function submit(event) {
    event.preventDefault()
    if (creating) {
      if (!canCreateLead || !onCreateLead) return
      void run(async () => {
        const created = await onCreateLead({ ...form, preferredUnitId: unitId })
        if (!created?.developerLeadId) throw new Error('The saved buyer link could not be verified. Retry to finish linking the same buyer.')
        setLeadId(created.developerLeadId)
        setCreating(false)
        setQuery('')
      })
    } else if (!blockers.length && readiness.canReserve) {
      void run(() => onReserve({ developerLeadId: leadId, unitId }))
    }
  }
  return <Modal open title={readiness.heldByBuyer ? 'Unit reservation' : 'Reserve a unit'} subtitle="One buyer. One shared reservation." onClose={busy ? undefined : onClose} className="development-reservation-dialog" footer={<div className="reservation-footer">
    <p><ShieldCheck size={16} aria-hidden="true" />Saved to the shared buyer and unit records.</p>
    <div><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{readiness.heldByBuyer ? 'Done' : 'Cancel'}</Button>
      {readiness.heldByBuyer ? <Button type="button" variant="secondary" disabled={busy || Boolean(leadsError) || leadsLoading || !canRelease} onClick={() => void run(() => onReserve({ developerLeadId: leadId, unitId, reserved: false }))}>Release reservation</Button>
        : <Button type="submit" form="development-reservation-form" disabled={busy || leadsLoading || Boolean(leadsError) || (creating ? !unit || String(unit.status).toLowerCase() !== 'available' || !canCreateLead : !readiness.canReserve)}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{busy ? 'Saving…' : creating ? 'Create buyer & continue' : 'Confirm reservation'}</Button>}
    </div>
  </div>}>
    <form id="development-reservation-form" onSubmit={submit} className="reservation-layout">
      <div className="reservation-unit-banner">
        <span className="reservation-unit-icon"><Home size={24} aria-hidden="true" /></span>
        <div><span className="reservation-eyebrow">{developmentName || 'Development availability'}</span><h4>{unitName ? `Unit ${unitName}` : 'Choose a unit'}</h4><p>{unit?.unitType || unit?.unit_type || 'Confirm the buyer and review their progress.'}</p></div>
        <span className="reservation-unit-status">{unit?.status || 'Unit selection'}</span>
      </div>
      {!initialUnitId ? <label className="reservation-unit-picker">Unit<Field as="select" value={unitId} onChange={event => setUnitId(event.target.value)} disabled={busy} required><option value="">Select a unit</option>{units.filter(item => !item.currentTransactionId && (String(item.status).toLowerCase() === 'available' || item.id === unitId)).map(item => <option key={item.id} value={item.id}>{item.unitNumber || item.unit_number}</option>)}</Field></label> : null}
      <section className="reservation-buyer-panel" aria-label="Link a buyer">
        <div className="reservation-section-label"><Users size={15} aria-hidden="true" />{creating ? 'Create a shared buyer lead' : 'Link an existing buyer'}</div>
        <div className="reservation-buyer-tabs"><button type="button" aria-pressed={!creating} disabled={busy || captureReadOnly} onClick={() => setCreating(false)}><Link2 size={15} />Existing lead</button>{canCreateLead && onCreateLead ? <button type="button" aria-pressed={creating} disabled={busy || readiness.heldByBuyer} onClick={() => { setCreating(true); setLocalError('') }}><UserPlus size={15} />New buyer</button> : null}</div>
        {creating ? <div className="reservation-create-fields">
          <p className="reservation-help">Create the buyer once, then confirm the reservation. The same lead appears in Development Leads and the buyer workspace.</p>
          {captureReadOnly ? <p role="status" className="reservation-stage-note">Buyer details are saved. Continue to finish the development link without creating a duplicate.</p> : null}
          {['firstName', 'lastName', 'email', 'phone'].map(field => <label key={field}>{({ firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone' })[field]}<Field value={form[field]} type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'} required={['firstName', 'lastName'].includes(field) || (!form.email && !form.phone && field === 'email')} disabled={busy || captureReadOnly} onChange={event => setForm(previous => ({ ...previous, [field]: event.target.value }))} /></label>)}
          <label className="reservation-create-notes">Notes<Field as="textarea" value={form.notes} disabled={busy || captureReadOnly} onChange={event => setForm(previous => ({ ...previous, notes: event.target.value }))} /></label>
        </div> : <>
          <label className="reservation-search"><Search size={17} aria-hidden="true" /><input aria-label="Search buyer leads" value={query} placeholder="Search by name, email or phone" disabled={busy} onChange={event => setQuery(event.target.value)} /></label>
          <div className="reservation-buyer-list" role="group" aria-label="Buyer leads">
            {filtered.map(item => <button key={item.developerLeadId} type="button" aria-pressed={item.developerLeadId === leadId} aria-label={`Link ${nameOf(item)}`} disabled={busy} className="reservation-buyer-option" onClick={() => { setLeadId(item.developerLeadId); setLocalError('') }}><span className="reservation-avatar">{nameOf(item).split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</span><span><strong>{nameOf(item)}</strong><small>{getDevelopmentLeadBoardStage(item).label}</small></span>{item.developerLeadId === leadId ? <CheckCircle2 size={19} aria-label="Selected" /> : <Link2 size={16} aria-hidden="true" />}</button>)}
            {!filtered.length ? <p className="reservation-empty">{leadsLoading ? 'Loading buyer leads…' : query ? 'No buyers match this search.' : 'No buyer leads yet. Create a buyer to continue.'}</p> : null}
          </div>
        </>}
      </section>
      <aside className="reservation-review" aria-label="Reservation review">
        {lead && !creating ? <LeadProgress key={`${leadId}:${selectedStage.key}`} lead={lead} busy={busy} canEdit={canEditLead(lead)} onChangeStage={async (...args) => { setWorking(true); try { return await onChangeStage?.(...args) } finally { setWorking(false) } }} onOpenLead={onOpenLead} /> : <section className="reservation-progress"><div className="reservation-section-label"><ArrowRight size={15} />Buyer progress</div><h4>Start with the buyer</h4><p>Link or create a lead to see their saved development stage and available actions.</p></section>}
        <section className={`reservation-checks ${blockers.length ? '' : 'is-ready'}`} aria-label="Reservation checks"><div className="reservation-section-label"><ShieldCheck size={16} />Reservation checks</div>{blockers.length ? <ul>{blockers.map(message => <li key={message}>{message}</li>)}</ul> : <p><CheckCircle2 size={17} />{readiness.heldByBuyer ? 'This buyer holds the unit reservation.' : 'Ready to reserve this unit for the selected buyer.'}</p>}<small>Availability and permissions are checked again when you save. Confirming a new hold records Unit Selection & Reservation. Onboarding and signed-offer requirements still apply.</small></section>
      </aside>
      {localError || error ? <p role="alert" className="reservation-error reservation-form-error">{localError || error}</p> : null}
    </form>
  </Modal>
}
