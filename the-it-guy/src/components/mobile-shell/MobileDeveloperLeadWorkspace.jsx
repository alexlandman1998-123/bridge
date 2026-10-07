import { ArrowLeft, ArrowUpRight, ChevronDown, Mail, MessageCircle, Phone } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { maskDeveloperLeadForDeveloper } from '../../core/developerLeads/developerLeadContract.js'
import { buildDeveloperLeadJourneyStages, getDeveloperLeadNextAction, getDeveloperLeadPrimaryAction } from '../../core/developerLeads/developerLeadWorkspaceModel.js'
import { buildDeveloperLeadTransactionHandoff } from '../../core/developerLeads/developerLeadTransactionHandoff.js'
import MobileLeadJourney from './MobileLeadJourney.jsx'
import MobileLeadUnitPicker from './MobileLeadUnitPicker.jsx'
import LeadSourceLogo from './LeadSourceLogo.jsx'
import { getMobileBrandStyle } from './mobileBrandStyle.js'
import DeveloperLeadDocuments from '../documents/DeveloperLeadDocuments.jsx'
import './mobile-lead-workspace.css'

const text = (value) => String(value ?? '').trim()
const labels = { otp: 'OTP', property24: 'Property24', private_property: 'Private Property', developer_direct: 'Developer direct', agency_introduced: 'Agency introduced', developer_led: 'Developer led', agent_led: 'Agent led' }
const onboardingStepLabels = { lead_not_qualified: 'Qualify the buyer', buyer_name_missing: 'Buyer full name is required', buyer_contact_missing: 'Add buyer email or phone', development_missing: 'Link a development', unit_missing: 'Select a preferred unit', lead_missing: 'Save the lead' }
const statusActionTitles = { contacted: 'Contact the buyer', qualified: 'Qualify the buyer', viewing: 'Arrange a viewing', onboarding_submitted: 'Confirm onboarding submission', otp: 'Upload signed OTP' }
function label(value) {
  const saved = text(value)
  const words = saved.replaceAll('_', ' ')
  return labels[saved.toLowerCase()] || (words ? words[0].toUpperCase() + words.slice(1) : '')
}
function dateLabel(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return ''
  return new Date(value).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', year: 'numeric' })
}
function budgetLabel(lead) {
  const min = Number(lead.budgetMin)
  const max = Number(lead.budgetMax)
  const hasMin = Number.isFinite(min) && min > 0
  const hasMax = Number.isFinite(max) && max > 0
  const money = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value)
  if (hasMin && hasMax) return min === max ? money(min) : `${money(min)} – ${money(max)}`
  if (hasMin) return `From ${money(min)}`
  if (hasMax) return `Up to ${money(max)}`
  return ''
}

export default function MobileDeveloperLeadWorkspace({ lead: input, brandStyle = getMobileBrandStyle(), journeyOverrides = [], journeyLoading = false, journeyError = '', onRetryJourney, development = null, actionState = {}, onAction }) {
  const [unitPickerOpen, setUnitPickerOpen] = useState(false)
  const [detailTab, setDetailTab] = useState('interest')
  const tabId = useId()
  const lead = maskDeveloperLeadForDeveloper(input)
  const protectedContact = lead.accessProfile.requiresHandoverBeforePrivateDetails
  const reference = text(lead.publicReference)
  const readableReference = reference.length <= 32 && !/^[0-9a-f]{24,}$/i.test(reference)
  const name = text(lead.buyerFullName) || (readableReference ? reference : '') || 'Buyer lead'
  const phone = text(lead.buyerPhone)
  const email = text(lead.buyerEmail)
  const phoneTarget = phone.replace(/[^\d+]/g, '')
  const canCall = /^[+\d\s().-]+$/.test(phone) && /^\+?\d{6,15}$/.test(phoneTarget)
  const phoneDigits = phoneTarget.replace(/^\+/, '').replace(/^00/, '')
  const whatsappNumber = /^0\d{9}$/.test(phoneDigits) ? `27${phoneDigits.slice(1)}` : phoneDigits
  const canWhatsapp = canCall && /^[1-9]\d{7,14}$/.test(whatsappNumber)
  const canEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const budget = budgetLabel(lead)
  const interest = text(lead.unitTypeInterest) || text(lead.protectedSummary)
  const journeyStages = buildDeveloperLeadJourneyStages(lead, journeyOverrides)
  const nextAction = getDeveloperLeadNextAction(lead)
  const primaryAction = getDeveloperLeadPrimaryAction(lead)
  const savedNextAction = text(lead.nextActionNote)
  const onboardingStarted = ['onboarding_sent', 'onboarding_submitted', 'otp', 'converted'].includes(lead.leadStatus)
  const onboardingSteps = protectedContact || onboardingStarted ? [] : buildDeveloperLeadTransactionHandoff(lead).blockers.map((step) => ({ ...step, title: onboardingStepLabels[step.code] || step.message }))
  const actionTitle = primaryAction.key === 'update_status' ? statusActionTitles[primaryAction.status] || nextAction.label
    : primaryAction.key === 'select_unit' ? 'Choose a preferred unit'
      : primaryAction.key === 'complete_setup' ? 'Prepare buyer onboarding'
        : lead.leadStatus === 'onboarding_sent' ? 'Awaiting buyer onboarding' : nextAction.label
  const actionHint = lead.leadStatus === 'onboarding_sent' ? 'The buyer has the onboarding link.'
    : lead.leadStatus === 'onboarding_submitted' ? 'Continue in the onboarding context.'
      : ['otp', 'converted'].includes(lead.leadStatus) ? 'Continue with finance, transfer and registration.'
        : protectedContact ? 'Buyer details unlock after agency handover.'
          : primaryAction.key === 'send_onboarding' ? 'Buyer details and unit are ready.' : ''
  const facts = [
    ['Reference', reference],
    ['Source', label(lead.leadSource)],
    ['Managed by', label(lead.leadOwner)],
    ['Added', dateLabel(lead.createdAt)],
    ['Last updated', dateLabel(lead.updatedAt)],
  ].filter(([, value]) => value)

  return <div className="mobile-lead-workspace" style={brandStyle}>
    <Link className="mobile-lead-back" to="/mobile/developer/leads"><ArrowLeft size={17} aria-hidden="true" />All leads</Link>
    <section className="mobile-lead-profile mobile-lead-branded-profile" aria-label="Lead profile">
      <div className="mobile-lead-profile-top"><LeadSourceLogo source={lead.leadSource} className="mobile-lead-source" /><span className={`mobile-lead-workspace-status${lead.leadStatus === 'lost' ? ' is-lost' : ''}`}>{label(lead.leadStatus) || 'Status not recorded'}</span></div>
      <h1>{name}</h1>
      {protectedContact ? <p className="mobile-lead-contact-empty">Buyer contact details are protected until the agency completes handover.</p> : <>
        <dl className="mobile-lead-contact-details">
          {phone && <div><dt><Phone size={15} aria-hidden="true" /><span className="sr-only">Phone</span></dt><dd>{phone}</dd></div>}
          {email && <div><dt><Mail size={15} aria-hidden="true" /><span className="sr-only">Email</span></dt><dd>{email}</dd></div>}
        </dl>
        {!phone && !email && <p className="mobile-lead-contact-empty">Contact details not recorded.</p>}
      </>}
      <span className="mobile-lead-type-pill">Buyer lead</span>
      {lead.primaryDevelopmentId && <Link className="mobile-lead-linked-property" to={`/mobile/development/${encodeURIComponent(lead.primaryDevelopmentId)}`} aria-label="View development"><span><small>Linked development</small><strong>{text(development?.name || development?.title) || 'View development'}</strong></span><ArrowUpRight size={18} aria-hidden="true" /></Link>}
    </section>

    {!protectedContact && (canCall || canEmail) && <section className="mobile-lead-contact-row" aria-label="Contact lead">
      <div className="mobile-lead-contact-actions">
        {canCall ? <a href={`tel:${phoneTarget}`} aria-label={`Call ${name}`}><Phone size={17} aria-hidden="true" />Call</a> : <button type="button" disabled title="A phone number is needed"><Phone size={17} aria-hidden="true" />Call</button>}
        {canWhatsapp ? <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${name}`}><MessageCircle size={17} aria-hidden="true" />WhatsApp</a> : <button type="button" disabled title="An international or South African phone number is needed"><MessageCircle size={17} aria-hidden="true" />WhatsApp</button>}
        {canEmail && <a href={`mailto:${email}`} aria-label={`Email ${name}`}><Mail size={17} aria-hidden="true" />Email</a>}
      </div>
    </section>}

    <MobileLeadJourney stages={journeyStages} loading={journeyLoading} error={journeyError} onRetry={onRetryJourney} />

    <section className="mobile-lead-next-action mobile-glass-surface" aria-labelledby="mobile-lead-next-action-title">
      <h2 id="mobile-lead-next-action-title">Next best action</h2>
      <h3 className="mobile-lead-next-action-main">{actionTitle}</h3>
      {actionHint && <p className="mobile-lead-next-action-hint">{actionHint}</p>}
      {savedNextAction && <div className="mobile-lead-saved-follow-up"><span>Follow-up</span><p>{savedNextAction}</p></div>}
      {onboardingSteps.length > 0 && <div className="mobile-lead-onboarding-steps"><div className="mobile-lead-onboarding-heading"><span>Before onboarding</span><span>{onboardingSteps.length} remaining</span></div><ul aria-label="Before onboarding">{onboardingSteps.map((step) => <li key={step.code}><span aria-hidden="true" className="mobile-lead-onboarding-dot" /><span>{step.title}</span></li>)}</ul></div>}
      <div className="mobile-lead-workflow-actions">
        {primaryAction.key === 'open_transaction' && primaryAction.transactionId ? <Link className="mobile-lead-primary-action" to={`/mobile/transaction/${encodeURIComponent(primaryAction.transactionId)}`}>{primaryAction.label}</Link>
          : primaryAction.key === 'complete_setup' ? null
            : <button type="button" className="mobile-lead-primary-action" disabled={primaryAction.disabled || Boolean(actionState.pending) || actionState.refreshRequired || !onAction} onClick={() => primaryAction.key === 'select_unit' ? setUnitPickerOpen(true) : onAction(primaryAction)}>{actionState.pending && actionState.pending !== 'copy_onboarding' ? 'Updating…' : primaryAction.label}</button>}
        {!protectedContact && <button type="button" disabled={Boolean(actionState.pending) || actionState.refreshRequired || !onAction} onClick={() => onAction({ key: 'copy_onboarding' })}>{actionState.pending === 'copy_onboarding' ? 'Copying…' : 'Copy Buyer Onboarding Link'}</button>}
      </div>
      {unitPickerOpen && !protectedContact && <MobileLeadUnitPicker key={lead.primaryDevelopmentId} developmentId={lead.primaryDevelopmentId} preferredUnitId={lead.preferredUnitId} pending={Boolean(actionState.pending)} refreshRequired={actionState.refreshRequired} onSave={(preferredUnitId) => onAction({ key: 'save_unit', preferredUnitId })} onClose={() => setUnitPickerOpen(false)} />}
      {actionState.error && <p className="mobile-lead-action-error" role="alert">{actionState.error}</p>}
      {actionState.message && <p className="mobile-lead-action-message" role="status">{actionState.message}</p>}
      {actionState.onboardingUrl && <a className="mobile-lead-section-link" href={actionState.onboardingUrl} target="_blank" rel="noopener noreferrer">Open Buyer Onboarding<ArrowUpRight size={17} aria-hidden="true" /></a>}
    </section>

    <div className="mobile-lead-detail-tabs" role="tablist" aria-label="Lead information">
      {[['interest', 'Buyer interest'], ['documents', 'Documents']].map(([key, title]) => <button key={key} type="button" role="tab" id={`${tabId}-${key}-tab`} aria-selected={detailTab === key} aria-controls={`${tabId}-${key}-panel`} tabIndex={detailTab === key ? 0 : -1} onClick={() => setDetailTab(key)} onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? 'interest' : event.key === 'End' ? 'documents' : key === 'interest' ? 'documents' : 'interest'
        setDetailTab(next)
        event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next === 'interest' ? 0 : 1].focus()
      }}>{title}</button>)}
    </div>
    {detailTab === 'interest' ? <section className="mobile-lead-section" role="tabpanel" id={`${tabId}-interest-panel`} aria-labelledby={`${tabId}-interest-tab`} tabIndex={0}><h2 id="mobile-lead-interest-title">Buyer interest</h2><p>{interest || 'Property interest not recorded.'}</p>{budget && <dl className="mobile-lead-budget"><dt>Budget</dt><dd>{budget}</dd></dl>}{lead.reservationState && lead.reservationState !== 'none' && <dl className="mobile-lead-facts"><div><dt>Reservation</dt><dd>{label(lead.reservationState)}</dd></div>{dateLabel(lead.reservationExpiresAt) && <div><dt>Expires</dt><dd>{dateLabel(lead.reservationExpiresAt)}</dd></div>}</dl>}</section>
      : <section className="mobile-lead-section" role="tabpanel" id={`${tabId}-documents-panel`} aria-labelledby={`${tabId}-documents-tab`} tabIndex={0}>
        {protectedContact ? <><h2>Documents</h2><p>Awaiting agency handover. Buyer documents become available when the agency releases this lead.</p></> : <DeveloperLeadDocuments key={`${lead.developerOrgId}:${lead.developerLeadId}:${lead.convertedTransactionId || ''}`} developerOrgId={lead.developerOrgId} developerLeadId={lead.developerLeadId} />}
      </section>}

    {(text(lead.qualificationNote) || text(lead.privateNotes)) && <details className="mobile-lead-section mobile-lead-extra-details"><summary>Notes<ChevronDown size={18} aria-hidden="true" /></summary><div className="mobile-lead-notes-body">{text(lead.qualificationNote) && <div className="mobile-lead-note"><h3>Qualification</h3><p>{lead.qualificationNote}</p></div>}{text(lead.privateNotes) && <div className="mobile-lead-note"><h3>Private notes</h3><p>{lead.privateNotes}</p></div>}</div></details>}

    {lead.convertedTransactionId && <Link className="mobile-lead-linked-transaction" to={`/mobile/transaction/${encodeURIComponent(lead.convertedTransactionId)}`}><span><small>Linked transaction</small><strong>Open transaction</strong></span><ArrowUpRight size={20} aria-hidden="true" /></Link>}
    {facts.length > 0 && <details className="mobile-lead-section mobile-lead-extra-details"><summary>Lead details<ChevronDown size={18} aria-hidden="true" /></summary><dl className="mobile-lead-facts">{facts.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></details>}
  </div>
}
