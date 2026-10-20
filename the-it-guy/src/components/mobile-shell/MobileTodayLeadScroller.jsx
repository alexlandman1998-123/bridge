import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, MessageCircle, Phone, Plus, UserRound } from 'lucide-react'
import { useMobileLeadCreate } from './mobileLeadCreateContext.js'
import LeadSourceLogo from './LeadSourceLogo.jsx'
import { getMobileBuyerQualification } from '../../services/mobileLeadContextModel.js'

function contactNumber(value) {
  const text = String(value || '').trim()
  if (!/^[+\d\s().-]+$/.test(text)) return ''
  let digits = text.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  else if (digits.length === 10 && digits.startsWith('0')) digits = `27${digits.slice(1)}`
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : ''
}

export default function MobileTodayLeadScroller({ today, leads = [], leadsAvailable, onUpdateTask, onContactLead, onOpen, onRefresh, onProgress, onBeginAction, rewardedTaskId }) {
  const leadCreate = useMobileLeadCreate()
  const busy = useRef(new Set())
  const [saved, setSaved] = useState({})
  const [pending, setPending] = useState({})
  const [errors, setErrors] = useState({})
  const [contacted, setContacted] = useState({})
  const [moving, setMoving] = useState({})
  const moveTimers = useRef(new Map())
  useEffect(() => {
    const timers = moveTimers.current
    return () => timers.forEach(timer => window.clearTimeout(timer))
  }, [])
  const tasks = new Map((today.taskChecklist || today.items.followUps.filter(task => task.dueToday)).map(task => [task.id, task]))
  Object.values(saved).forEach(task => tasks.set(task.id, task))
  const sortedTasks = [...tasks.values()].sort((a, b) => Number(Boolean(a.completed && !moving[a.id])) - Number(Boolean(b.completed && !moving[b.id])))

  async function markContacted(lead) {
    const key = `lead:${lead.leadId}`
    if (!onContactLead || busy.current.has(key)) return
    onBeginAction?.()
    busy.current.add(key)
    setPending(current => ({ ...current, [key]: true }))
    setErrors(current => ({ ...current, [key]: '' }))
    try {
      await onContactLead(lead)
      setContacted(current => ({ ...current, [lead.leadId]: true }))
      onProgress?.('contact', lead)
    } catch {
      setErrors(current => ({ ...current, [key]: 'Couldn’t save contact status. Please retry or refresh the lead.' }))
    } finally {
      busy.current.delete(key)
      setPending(current => ({ ...current, [key]: false }))
    }
  }

  async function toggle(task) {
    if (busy.current.has(task.id) || !onUpdateTask) return
    onBeginAction?.()
    busy.current.add(task.id)
    setPending(current => ({ ...current, [task.id]: true }))
    setErrors(current => ({ ...current, [task.id]: '' }))
    try {
      await onUpdateTask(task, !task.completed)
      window.clearTimeout(moveTimers.current.get(task.id))
      setMoving(current => ({ ...current, [task.id]: !task.completed }))
      if (!task.completed) moveTimers.current.set(task.id, window.setTimeout(() => {
        setMoving(current => ({ ...current, [task.id]: false }))
        moveTimers.current.delete(task.id)
      }, 400))
      setSaved(current => ({ ...current, [task.id]: { ...task, completed: !task.completed } }))
      onProgress?.('task', task, !task.completed)
    } catch {
      setErrors(current => ({ ...current, [task.id]: 'Couldn’t save. Please try again.' }))
    } finally {
      busy.current.delete(task.id)
      setPending(current => ({ ...current, [task.id]: false }))
    }
  }

  return <section className="mobile-day-leads" aria-label="Tasks and new leads">
    <div className="mobile-day-leads-track" tabIndex={0} role="region" aria-label="Swipe between tasks and new leads">
      <section className="mobile-task-panel" aria-label="Today’s tasks">
        <div className="mobile-task-panel-heading"><h2>Tasks for today</h2><button type="button" aria-label="Add task" onClick={() => onOpen('/mobile/tasks?create=follow-up')}><Plus size={19} aria-hidden="true" /></button></div>
        {!today.available.followUps ? <div className="mobile-panel-empty"><p>We couldn’t load your tasks.</p><button type="button" onClick={onRefresh}>Retry tasks</button></div> : tasks.size ? <div className="mobile-task-list">{sortedTasks.map(task => <div className={`mobile-checklist-task${task.completed ? ' is-completed' : ''}${rewardedTaskId === task.id ? ' is-rewarded' : ''}`} key={task.id}>
          <label><input type="checkbox" checked={Boolean(task.completed)} disabled={pending[task.id] || !onUpdateTask} onChange={() => void toggle(task)} aria-label={`${task.completed ? 'Reopen' : 'Complete'} ${task.title}${task.body ? ` for ${task.body}` : ''}`} /><span className="mobile-task-check" aria-hidden="true">{task.completed && <Check size={15} />}</span><span className="mobile-task-copy"><strong>{task.title}</strong>{task.body && <span>{task.body}</span>}<small>{pending[task.id] ? 'Saving…' : task.completed ? 'Completed · uncheck to reopen' : task.meta}</small></span></label>
          {errors[task.id] && <p role="alert">{errors[task.id]}</p>}
        </div>)}</div> : <div className="mobile-panel-empty"><Check size={24} /><p>You’re all caught up.</p><span>No tasks due today or overdue.</span></div>}
      </section>
      <section className="mobile-new-leads-panel" aria-label="New leads">
        <div className="mobile-leads-title"><h2>New leads</h2><div className="mobile-lead-panel-controls">{leadsAvailable && <span className="mobile-lead-panel-count">{leads.length}</span>}<button type="button" aria-label="Add lead" onClick={() => leadCreate ? leadCreate.openLeadCreate() : onOpen('/mobile/leads?create=lead')}><Plus size={19} aria-hidden="true" /></button></div></div>
        {!leadsAvailable ? <div className="mobile-panel-empty"><p>We couldn’t load new leads.</p><button type="button" onClick={onRefresh}>Retry leads</button></div> : leads.length ? <div className="mobile-home-lead-list">{leads.filter(lead => lead.leadId).map(lead => {
          const name = lead.contactName || lead.fullName || lead.name || 'New enquiry'
          const number = contactNumber(lead.contactPhone)
          const qualification = lead.leadCategory === 'buyer' ? getMobileBuyerQualification(lead) : null
          const qualificationSubmitted = qualification?.status === 'Submitted'
          return <article className="mobile-home-lead" key={lead.leadId}>
            <div className="mobile-home-lead-top">
              <button type="button" className="mobile-home-lead-open" onClick={() => onOpen(`/mobile/lead/${encodeURIComponent(lead.leadId)}`)}><strong>{name}</strong><ArrowUpRight size={15} aria-hidden="true" /></button>
              <div className="mobile-home-lead-origin"><span>Enquiry via</span><LeadSourceLogo source={lead.leadSource || 'Other'} className="agent-home-lead-source" /></div>
            </div>
            <p>{lead.propertyAddress || lead.listingTitle || lead.propertyInterest || 'Property enquiry'}</p>
            {lead.leadCategory === 'buyer' && <dl className="mobile-home-lead-qualification"><dt>{qualification?.kind === 'tenant' ? 'Tenant qualification submitted' : 'Buyer qualification submitted'}</dt><dd className={qualificationSubmitted ? 'is-submitted' : ''}>{qualificationSubmitted ? 'Yes' : 'No'}</dd></dl>}
            {number && <div className="mobile-home-lead-actions" role="group" aria-label={`Actions for ${name}`}>
              {number && <><a href={`tel:+${number}`} aria-label={`Call ${name}`}><Phone size={20} strokeWidth={1.75} /><span>Call</span></a><a href={`https://wa.me/${number}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${name}`}><MessageCircle size={20} strokeWidth={1.75} /><span>WhatsApp</span></a></>}
            </div>}
            {lead.leadCategory === 'buyer' && <button type="button" className="mobile-lead-contacted" aria-pressed={Boolean(contacted[lead.leadId])} disabled={!onContactLead || pending[`lead:${lead.leadId}`] || contacted[lead.leadId]} onClick={() => void markContacted(lead)} aria-label={`Mark ${name} as contacted`}><Check size={18} strokeWidth={1.75} /><span>{pending[`lead:${lead.leadId}`] ? 'Saving…' : 'Contacted'}</span></button>}
            {errors[`lead:${lead.leadId}`] && <p role="alert">{errors[`lead:${lead.leadId}`]}</p>}
          </article>
        })}</div> : <div className="mobile-panel-empty"><UserRound size={24} /><p>No new leads yet.</p><span>Your next enquiry will appear here.</span></div>}
      </section>
    </div>
  </section>
}
