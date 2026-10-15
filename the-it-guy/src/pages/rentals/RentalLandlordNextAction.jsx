import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { landlordWorkspace } from '../../services/rentals/rentalLandlordWorkspaceModel'
import { getRentalLeadMetadata } from '../../services/rentals/rentalLeadClassificationModel'

const actions = {
  new: [['review', 'Mark as reviewed']],
  contacted: [['contact', 'Mark as contacted']],
  appraisal_scheduled: [['appraisal', 'Mark as complete'], ['appointment', 'Schedule appointment']],
  appraisal_completed: [['prepare', 'Mark as complete']],
  mandate_pending: [['sent', 'Mark as sent'], ['mandate', 'Mark as completed']],
  mandate_signed: [['upload', 'Upload mandate']],
  listing_ready: [['create', 'Create draft listing']],
  listing_created: [['view', 'View listing']],
}

export default function RentalLandlordNextAction({ lead, saving, onAdvance, onMarkSent }) {
  const navigate = useNavigate()
  const [choice, setChoice] = useState('')
  const { portfolio } = landlordWorkspace(lead)
  const primary = portfolio.find(property => property.canonicalPropertyId === lead.relationships?.propertyId) || (portfolio.length === 1 ? portfolio[0] : null)
  const property = portfolio.find(item => item.id === choice) || primary
  const needsProperty = ['mandate_pending', 'mandate_signed', 'listing_ready'].includes(lead.stage) && portfolio.length > 1
  const sent = property && getRentalLeadMetadata(lead.raw).landlordMandateDispatches?.[property.id]
  const listingId = lead.relationships?.listingId || property?.listingId || (portfolio.length === 1 ? portfolio[0].listingId : '')
  const base = `/agent/rentals/pipeline/leads/${encodeURIComponent(lead.id)}`
  const openPortfolio = () => navigate(`${base}?tab=Portfolio${property ? `&property=${encodeURIComponent(property.id)}` : ''}`)
  const run = key => {
    if (key === 'appointment') return navigate(`${base}?tab=Appointments`)
    if (key === 'sent') return onMarkSent(property)
    if (key === 'mandate' && !property?.mandateId && !(property?.canonicalPropertyId && property.canonicalPropertyId === lead.relationships?.propertyId && lead.relationships?.mandateId)) return openPortfolio()
    if (key === 'upload') return navigate(`${base}?tab=Documents&upload=mandate${property ? `&uploadProperty=${encodeURIComponent(property.id)}` : ''}`)
    if (key === 'create') return navigate(`/agent/rentals/listings/new?leadId=${encodeURIComponent(lead.id)}${property ? `&portfolioPropertyId=${encodeURIComponent(property.id)}` : ''}`)
    if (key === 'view') return navigate(`/agent/rentals/listings/${encodeURIComponent(listingId)}/overview`)
    return onAdvance(key, property)
  }
  return <div className="flex flex-1 flex-col gap-4 text-white">
    {needsProperty ? <label className="form-field"><span>Portfolio property</span><select value={property?.id || ''} disabled={saving} onChange={event => setChoice(event.target.value)}><option value="">Choose a property</option>{portfolio.map(item => <option key={item.id} value={item.id}>{item.title || item.address || 'Rental property'}</option>)}</select></label> : null}
    {lead.stage === 'mandate_pending' ? <p className="text-sm leading-6 text-[#c3d3e0]">{sent?.sentAt ? `Recorded as sent on ${new Date(sent.sentAt).toLocaleDateString('en-ZA')}.` : 'Mark the mandate as sent after sharing it with the landlord. Complete this step when the signed mandate is recorded.'}</p> : null}
    {lead.stage === 'mandate_signed' ? <p className="text-sm leading-6 text-[#c3d3e0]">Upload the signed rental mandate against this property’s document requirement.</p> : null}
    {lead.stage === 'listing_created' && !listingId ? <p role="status" className="text-sm text-[#c3d3e0]">No saved rental listing is linked. Review the property portfolio.</p> : null}
    {lead.workflowIssue ? <p role="alert" className="text-sm text-[#c3d3e0]">{lead.workflowIssue}</p> : null}
    <div className="mt-auto flex flex-wrap gap-3">{(actions[lead.stage] || []).map(([key, label]) => <button key={key} type="button" data-rental-control="landlord-next-action" disabled={saving || Boolean(lead.workflowIssue) || needsProperty && !property || key === 'view' && !listingId || key === 'sent' && (!property || Boolean(sent?.sentAt))} onClick={() => void run(key)} className={`min-h-11 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-50 ${key === 'appointment' || key === 'sent' ? 'bg-white/10 hover:bg-white/15' : 'bg-[#1c6c53] hover:bg-[#247a60]'}`}>{saving ? 'Saving…' : label}</button>)}</div>
  </div>
}
