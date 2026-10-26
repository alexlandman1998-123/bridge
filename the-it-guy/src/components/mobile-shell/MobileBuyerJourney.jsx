import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, RefreshCw } from 'lucide-react'
import { loadMobileBuyerJourney } from '../../services/mobileBuyerJourneyService.js'
import './mobile-buyer-journey.css'
import { isRentalCrmLead } from '../../services/rentals/rentalCrmLeadModel.js'
import { useMobileLeadActions } from './mobileLeadActionContext.js'

export default function MobileBuyerJourney({ organisationId, lead, contact, activities, actor, includeAll }) {
  const actions = useMobileLeadActions()
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const leadId = lead.leadId || lead.lead_id
  const key = `${organisationId}:${leadId}:${lead.updatedAt || ''}`
  const actorId = actor?.id || actor?.userId || ''
  const actorEmail = actor?.email || ''
  useEffect(() => {
    let active = true
    loadMobileBuyerJourney({ organisationId, lead, contact, activities, actor: { id: actorId, email: actorEmail }, includeAll, refreshLead: attempt > 0 })
      .then(model => { if (active) setResult({ key, model }) })
      .catch(() => { if (active) setResult({ key, error: true }) })
    return () => { active = false }
  }, [organisationId, lead, contact, activities, actorId, actorEmail, includeAll, key, attempt])
  const current = result?.key === key ? result : null
  const model = current?.model
  function refresh() { setResult(null); setAttempt(value => value + 1) }
  const title = isRentalCrmLead(lead) ? 'Tenant Journey' : 'Buyer Journey'
  function openAction(stageKey = '') { actions?.openLeadAction({ leadId, rental: model?.kind === 'tenant', stageKey }) }
  return <section className="mobile-live-buyer-journey" aria-label={title} aria-busy={!current}>
    <div className="mobile-live-journey-heading"><h2>{title}</h2>{model && <div className="mobile-live-journey-heading-actions"><span>{model.readiness.completed}/{model.readiness.total}</span><button type="button" onClick={refresh} aria-label={model?.kind === 'tenant' ? 'Refresh tenant progress' : 'Refresh buyer progress'}><RefreshCw size={15} aria-hidden="true" /></button></div>}</div>
    {!current ? <p role="status">Checking lead progress…</p> : current.error ? <div role="alert"><p>We couldn’t verify this lead’s progress.</p><button type="button" onClick={refresh}>Retry progress</button></div> : <>
      <p className="mobile-live-journey-summary">{model.readiness.percent === 100 ? 'All steps complete' : model.kind === 'tenant' ? `Next: ${model.nextAction.title}.` : `${model.currentStage.label} is the next step.`}</p>
      <div className="mobile-live-journey-progress" role="progressbar" aria-label={model?.kind === 'tenant' ? 'Tenant journey progress' : 'Buyer journey progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={model.readiness.percent}><span style={{ width: `${model.readiness.percent}%` }} /></div>
      <ol>{model.stages.map((stage, index) => {
        const done = stage.done || stage.state === 'completed'
        return <li key={stage.key} className={done ? 'is-complete' : stage.state === 'current' ? 'is-current' : ''} aria-current={!done && stage.state === 'current' ? 'step' : undefined}>
          <span className="mobile-live-journey-marker" aria-hidden="true">{done ? <Check size={16} /> : index + 1}</span>
          {actions ? <button type="button" className="mobile-live-journey-stage mobile-live-journey-stage-button" onClick={() => openAction(stage.state === 'current' ? '' : stage.key)} aria-label={`Open ${stage.label}`}><span><span className="mobile-live-journey-stage-title">{stage.label}</span><span className="mobile-live-journey-stage-detail">{done ? 'Completed' : stage.detail || (stage.state === 'current' ? 'Next step' : 'Upcoming')}</span></span><ArrowUpRight size={15} aria-hidden="true" /></button> : <div className="mobile-live-journey-stage"><h3>{stage.label}</h3><p>{done ? 'Completed' : stage.detail || (stage.state === 'current' ? 'Next step' : 'Upcoming')}</p>{done && stage.overridden && stage.detail && <small>{stage.detail}</small>}</div>}
        </li>
      })}</ol>
      {actions && <button type="button" className="mobile-live-journey-action" onClick={() => openAction()}>{model.nextAction?.title || 'Open next action'}<ArrowUpRight size={15} aria-hidden="true" /></button>}
    </>}
  </section>
}
