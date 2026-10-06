import { ArrowLeft, ArrowUpRight, ChevronDown, LockKeyhole, Mail, Phone, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { maskDeveloperLeadForDeveloper } from '../../core/developerLeads/developerLeadContract.js'
import './mobile-lead-workspace.css'

const text = (value) => String(value ?? '').trim()
const labels = { otp: 'OTP', property24: 'Property24', private_property: 'Private Property', developer_direct: 'Developer direct', agency_introduced: 'Agency introduced', developer_led: 'Developer led', agent_led: 'Agent led' }
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

export default function MobileDeveloperLeadWorkspace({ lead: input }) {
  const lead = maskDeveloperLeadForDeveloper(input)
  const protectedContact = lead.accessProfile.requiresHandoverBeforePrivateDetails
  const reference = text(lead.publicReference)
  const readableReference = reference.length <= 32 && !/^[0-9a-f]{24,}$/i.test(reference)
  const name = text(lead.buyerFullName) || (readableReference ? reference : '') || 'Buyer lead'
  const phone = text(lead.buyerPhone)
  const email = text(lead.buyerEmail)
  const phoneTarget = phone.replace(/[^\d+]/g, '')
  const canCall = /^\+?\d{6,15}$/.test(phoneTarget)
  const canEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const initials = text(lead.buyerFullName).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const budget = budgetLabel(lead)
  const interest = text(lead.unitTypeInterest) || text(lead.protectedSummary)
  const facts = [
    ['Reference', reference],
    ['Source', label(lead.leadSource)],
    ['Managed by', label(lead.leadOwner)],
    ['Added', dateLabel(lead.createdAt)],
    ['Last updated', dateLabel(lead.updatedAt)],
  ].filter(([, value]) => value)

  return <div className="mobile-lead-workspace">
    <Link className="mobile-lead-back" to="/mobile/developer/leads"><ArrowLeft size={17} aria-hidden="true" />All leads</Link>
    <section className="mobile-lead-profile" aria-label="Lead profile">
      <div className="mobile-lead-profile-top"><span className="mobile-lead-avatar" aria-hidden="true">{protectedContact ? <LockKeyhole size={22} strokeWidth={1.6} /> : initials || <UserRound size={22} strokeWidth={1.6} />}</span><span className={`mobile-lead-workspace-status${lead.leadStatus === 'lost' ? ' is-lost' : ''}`}>{label(lead.leadStatus) || 'Status not recorded'}</span></div>
      <p className="mobile-lead-eyebrow">Buyer lead</p><h1>{name}</h1>
      {protectedContact ? <p className="mobile-lead-contact-empty">Buyer contact details are protected until the agency completes handover.</p> : <>
        <dl className="mobile-lead-contact-details">
          {phone && <div><dt><Phone size={15} aria-hidden="true" /><span className="sr-only">Phone</span></dt><dd>{phone}</dd></div>}
          {email && <div><dt><Mail size={15} aria-hidden="true" /><span className="sr-only">Email</span></dt><dd>{email}</dd></div>}
        </dl>
        {!phone && !email && <p className="mobile-lead-contact-empty">Contact details not recorded.</p>}
        {(canCall || canEmail) && <div className="mobile-lead-contact-actions">
          {canCall && <a href={`tel:${phoneTarget}`} aria-label={`Call ${name}`}><Phone size={17} aria-hidden="true" />Call</a>}
          {canEmail && <a href={`mailto:${email}`} aria-label={`Email ${name}`}><Mail size={17} aria-hidden="true" />Email</a>}
        </div>}
      </>}
    </section>

    <section className={`mobile-lead-next-action${text(lead.nextActionNote) ? ' has-action' : ''}`} aria-labelledby="mobile-lead-next-action-title"><h2 id="mobile-lead-next-action-title">Next action</h2><p>{text(lead.nextActionNote) || 'No next action recorded.'}</p></section>

    <section className="mobile-lead-section" aria-labelledby="mobile-lead-interest-title"><h2 id="mobile-lead-interest-title">Buyer interest</h2><p>{interest || 'Property interest not recorded.'}</p>{budget && <dl className="mobile-lead-budget"><dt>Budget</dt><dd>{budget}</dd></dl>}{lead.reservationState && lead.reservationState !== 'none' && <dl className="mobile-lead-facts"><div><dt>Reservation</dt><dd>{label(lead.reservationState)}</dd></div>{dateLabel(lead.reservationExpiresAt) && <div><dt>Expires</dt><dd>{dateLabel(lead.reservationExpiresAt)}</dd></div>}</dl>}{lead.primaryDevelopmentId && <Link className="mobile-lead-section-link" to={`/mobile/development/${encodeURIComponent(lead.primaryDevelopmentId)}`}>View development<ArrowUpRight size={17} aria-hidden="true" /></Link>}</section>

    {(text(lead.qualificationNote) || text(lead.privateNotes)) && <details className="mobile-lead-section mobile-lead-extra-details"><summary>Notes<ChevronDown size={18} aria-hidden="true" /></summary><div className="mobile-lead-notes-body">{text(lead.qualificationNote) && <div className="mobile-lead-note"><h3>Qualification</h3><p>{lead.qualificationNote}</p></div>}{text(lead.privateNotes) && <div className="mobile-lead-note"><h3>Private notes</h3><p>{lead.privateNotes}</p></div>}</div></details>}

    {lead.convertedTransactionId && <Link className="mobile-lead-linked-transaction" to={`/mobile/transaction/${encodeURIComponent(lead.convertedTransactionId)}`}><span><small>Linked transaction</small><strong>Open transaction</strong></span><ArrowUpRight size={20} aria-hidden="true" /></Link>}
    {facts.length > 0 && <details className="mobile-lead-section mobile-lead-extra-details"><summary>Lead details<ChevronDown size={18} aria-hidden="true" /></summary><dl className="mobile-lead-facts">{facts.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></details>}
  </div>
}
