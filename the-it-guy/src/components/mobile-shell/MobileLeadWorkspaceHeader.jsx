import { ArrowLeft, MessageCircle, Phone } from 'lucide-react'
import { Link } from 'react-router-dom'
import LeadSourceLogo from './LeadSourceLogo.jsx'
import './mobile-lead-workspace-header.css'

function text(...values) {
  return values.map(value => String(value ?? '').trim()).find(Boolean) || ''
}

function phoneNumber(value) {
  const raw = text(value)
  if (!/^[+\d\s().-]+$/.test(raw)) return ''
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  else if (digits.length === 10 && digits.startsWith('0')) digits = `27${digits.slice(1)}`
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : ''
}

export default function MobileLeadWorkspaceHeader({ current, organisationId, onRetry, onContactAction }) {
  const lead = current?.lead
  const contact = current?.contact || {}
  const name = text(contact.fullName, [contact.firstName, contact.lastName].filter(Boolean).join(' '), lead?.name, 'Unnamed lead')
  const phone = phoneNumber(contact.phone || lead?.phone)
  const property = text(lead?.enquiredPropertyAddress, lead?.enquiredPropertyTitle, lead?.sellerPropertyAddress, lead?.formattedAddress, lead?.streetAddress, lead?.propertyInterest, lead?.areaInterest)
  const participant = { ...contact, name, role: lead?.leadCategory || 'Lead' }

  return <div className="mobile-lead-header-group">
    <Link to="/mobile/leads" className="mobile-lead-header-back"><ArrowLeft size={16} aria-hidden="true" />Leads</Link>
    <header className="mobile-lead-header" aria-label="Lead overview" aria-busy={!current && Boolean(organisationId)}>
    {!current ? <p className="mobile-lead-header-message" role="status">{organisationId ? 'Loading lead…' : 'Select an organisation to view this lead.'}</p> : current.error ? <div className="mobile-lead-header-message" role="alert"><p>We couldn’t load this lead.</p><button type="button" onClick={onRetry}>Retry</button></div> : <>
      <div className="mobile-lead-header-identity">
        <h1>{name}</h1>
        <div className="mobile-lead-header-meta"><LeadSourceLogo source={text(lead.leadSource, lead.source)} className="mobile-lead-header-source" /></div>
      </div>
      {lead.assignedAgentName && <p className="mobile-lead-header-details">{lead.assignedAgentName}</p>}
      <p className="mobile-lead-header-property">{property || 'Property interest not captured'}</p>
      <div className="mobile-lead-header-actions" aria-label={`Contact ${name}`}>
        {[
          { label: 'Call', icon: <Phone size={17} aria-hidden="true" />, href: phone ? `tel:+${phone}` : '', type: 'call' },
          { label: 'WhatsApp', icon: <MessageCircle size={17} aria-hidden="true" />, href: phone ? `https://wa.me/${phone}` : '', type: 'whatsapp' },
        ].map(({ label, icon, href, type }) => href ? <a key={type} href={href} onClick={() => onContactAction?.(type, participant)}>{icon}{label}</a> : <button key={type} type="button" disabled>{icon}{label}</button>)}
      </div>
      {!phone && <p className="mobile-lead-header-missing">No phone number captured</p>}
    </>}
    </header>
  </div>
}
