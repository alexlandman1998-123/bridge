import { CalendarDays, CheckCircle2, Loader2, Send, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import Modal from '../ui/Modal'
function Feedback({ feedback = {} }) {
  if (!feedback.message) return null
  return (
    <div role={feedback.kind === 'error' ? 'alert' : 'status'} className={`rounded-[14px] border px-3 py-2 text-sm font-medium ${
      feedback.kind === 'error'
        ? 'border-[#f4d4d4] bg-[#fff5f5] text-[#b42318]'
        : 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]'
    }`}>
      {feedback.message}
    </div>
  )
}

function BuyerIdentityFields({ draft, onChange, autoFocus = false }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-[#2d445e]">Name</span>
        <Field value={draft.firstName} onChange={(event) => onChange('firstName', event.target.value)} placeholder="Buyer name" autoFocus={autoFocus} required />
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-[#2d445e]">Surname</span>
        <Field value={draft.lastName} onChange={(event) => onChange('lastName', event.target.value)} placeholder="Buyer surname" required />
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-[#2d445e]">Phone</span>
        <Field type="tel" value={draft.phone} onChange={(event) => onChange('phone', event.target.value)} placeholder="+27 ..." required />
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-[#2d445e]">Email</span>
        <Field type="email" value={draft.email} onChange={(event) => onChange('email', event.target.value)} placeholder="buyer@example.com" required />
      </label>
    </div>
  )
}

function ViewingRecipient({ title, detail }) {
  return (
    <div className="flex items-start gap-3 rounded-[14px] border border-[#dce6f2] bg-[#fbfdff] p-4">
      <span aria-hidden="true" className="mt-0.5 text-[#1f7d44]">✓</span>
      <span>
        <span className="block text-sm font-semibold text-[#243d56]">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-[#607387]">{detail}</span>
      </span>
    </div>
  )
}

export function ListingViewingRequestModal({
  open,
  draft,
  leads = [],
  seller = {},
  agent = {},
  saving = false,
  feedback,
  listingTitle = '',
  onChange,
  onLeadSelect,
  onClose,
  onSubmit,
}) {
  const isBooking = draft.mode === 'book'
  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Schedule a Viewing"
      subtitle={listingTitle ? `Arrange a viewing for ${listingTitle}.` : 'Arrange a viewing for this listing.'}
      className="max-w-3xl"
      footer={(
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="listing-viewing-request-form" disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {isBooking ? 'Book Viewing' : 'Send Viewing Request'}
          </Button>
        </div>
      )}
    >
      <form id="listing-viewing-request-form" className="grid gap-5" onSubmit={onSubmit}>
        <Feedback feedback={feedback} />
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Viewing scheduling mode">
          <button type="button" aria-pressed={!isBooking} onClick={() => onChange('mode', 'request')} className={`rounded-[15px] border p-4 text-left transition-colors ${!isBooking ? 'border-[#1c6954] bg-[#ecf7f2]' : 'border-[#dce6f2] bg-white hover:bg-[#f8fbfd]'}`}>
            <span className="block text-sm font-semibold text-[#193a31]">Request Viewing</span>
            <span className="mt-1 block text-xs leading-5 text-[#526b77]">Send the proposed time to buyer, seller and agent. The viewing books when all three accept.</span>
          </button>
          <button type="button" aria-pressed={isBooking} onClick={() => onChange('mode', 'book')} className={`rounded-[15px] border p-4 text-left transition-colors ${isBooking ? 'border-[#1c6954] bg-[#ecf7f2]' : 'border-[#dce6f2] bg-white hover:bg-[#f8fbfd]'}`}>
            <span className="block text-sm font-semibold text-[#193a31]">Book Viewing</span>
            <span className="mt-1 block text-xs leading-5 text-[#526b77]">Use only when you have already confirmed the time with all three parties. A booking email follows.</span>
          </button>
        </div>
        {leads.length ? (
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#2d445e]">Existing buyer lead (optional)</span>
            <Field as="select" value={draft.buyerLeadId} onChange={(event) => onLeadSelect(event.target.value)}>
              <option value="">Create or match a buyer from the details below</option>
              {leads.map((lead) => <option key={lead.leadId || lead.id} value={lead.leadId || lead.id}>{lead.name} · {lead.email || lead.phone || 'Contact pending'}</option>)}
            </Field>
          </label>
        ) : null}

        <section className="grid gap-3">
          <div className="flex items-center gap-2">
            <UserRound size={16} className="text-[#1f4f78]" />
            <h3 className="text-sm font-semibold text-[#142132]">Buyer details</h3>
          </div>
          <BuyerIdentityFields draft={draft} onChange={onChange} autoFocus={!leads.length} />
        </section>

        <section className="grid gap-3 border-t border-[#e6edf3] pt-4">
          <div>
            <h3 className="text-sm font-semibold text-[#142132]">Designated seller for this viewing</h3>
            <p className="mt-1 text-xs text-[#607387]">Pre-filled from the Seller tab when available. Changes here affect this viewing only.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-2"><span className="text-xs font-semibold text-[#2d445e]">Name</span><Field value={draft.sellerName || ''} onChange={(event) => onChange('sellerName', event.target.value)} placeholder="Seller name" required /></label>
            <label className="grid gap-2"><span className="text-xs font-semibold text-[#2d445e]">Email</span><Field type="email" value={draft.sellerEmail || ''} onChange={(event) => onChange('sellerEmail', event.target.value)} placeholder="seller@example.com" required /></label>
            <label className="grid gap-2"><span className="text-xs font-semibold text-[#2d445e]">Phone</span><Field type="tel" value={draft.sellerPhone || ''} onChange={(event) => onChange('sellerPhone', event.target.value)} placeholder="+27 ..." required /></label>
          </div>
        </section>

        <section className="grid gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-[#1f4f78]" />
            <h3 className="text-sm font-semibold text-[#142132]">{isBooking ? 'Agreed viewing time' : 'Proposed time'}</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Date</span>
              <Field type="date" value={draft.proposedDate} onChange={(event) => onChange('proposedDate', event.target.value)} required />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[#2d445e]">Time</span>
              <Field type="time" value={draft.proposedTime} onChange={(event) => onChange('proposedTime', event.target.value)} required />
            </label>
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[#2d445e]">Notes</span>
            <Field as="textarea" rows={3} value={draft.notes} onChange={(event) => onChange('notes', event.target.value)} placeholder="Access, parking, or viewing notes (optional)" />
          </label>
        </section>

        {isBooking ? (
          <section className="grid gap-3 rounded-[15px] border border-[#cfe6dc] bg-[#f4faf6] p-4">
            <h3 className="text-sm font-semibold text-[#193a31]">Confirm the phone booking</h3>
            <label className="flex items-start gap-3 text-sm leading-5 text-[#315244]">
              <input type="checkbox" className="mt-1" checked={draft.bookingConfirmedWithAll === true} onChange={(event) => onChange('bookingConfirmedWithAll', event.target.checked)} required />
              I have confirmed this exact date and time with the buyer, seller and agent.
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold text-[#2d445e]">How was this confirmed?</span>
              <Field as="textarea" rows={2} value={draft.bookingConfirmationNote || ''} onChange={(event) => onChange('bookingConfirmationNote', event.target.value)} placeholder="For example: Confirmed with buyer and seller by phone on Friday; I will attend." required />
            </label>
            <p className="text-xs text-[#587164]">This note is kept in the booking audit. The confirmation email does not include it.</p>
          </section>
        ) : null}

        <section className="grid gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#142132]">Required participants</h3>
            <p className="mt-1 text-xs leading-5 text-[#607387]">{isBooking ? 'All three will receive a booking confirmation.' : 'All three receive their own secure approval link.'}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <ViewingRecipient
              title="Buyer"
              detail={draft.email || 'Add the buyer email first.'}
            />
            <ViewingRecipient
              title="Seller"
              detail={draft.sellerEmail || seller.email || 'Add the designated seller email above.'}
            />
            <ViewingRecipient
              title="Agent"
              detail={agent.email || 'Add the assigned agent email first.'}
            />
          </div>
        </section>
      </form>
    </Modal>
  )
}

export function ListingViewingDetailsModal({ open, viewing, saving = false, feedback, agentEmail = '', onClose, onResponse }) {
  const [proposing, setProposing] = useState(false)
  const [proposal, setProposal] = useState({ preferredDate: '', preferredStartTime: '', message: '' })
  useEffect(() => {
    setProposing(false)
    setProposal({ preferredDate: '', preferredStartTime: '', message: '' })
  }, [viewing?.viewing_id])
  const participants = Array.isArray(viewing?.participants) ? viewing.participants : []
  const agent = participants.find((participant) => participant.role === 'agent')
  const agentCanRespond = Boolean(viewing?.managed_round_number && viewing?.status === 'viewing_requested' && agent?.response_status === 'pending' && agent?.email?.toLowerCase() === agentEmail.toLowerCase())
  return (
    <Modal open={open} onClose={saving ? undefined : onClose} title="Viewing details" subtitle="The buyer, seller and agent must agree to the same time." className="max-w-2xl">
      {viewing ? <div className="grid gap-5">
        <Feedback feedback={feedback} />
        <div className="rounded-[15px] border border-[#dce6f2] bg-[#f7fafc] p-4">
          <p className="text-sm font-semibold text-[#142132]">{viewing.proposed_date || 'Date pending'} at {viewing.proposed_time || 'time pending'}</p>
          <p className="mt-1 text-xs text-[#607387]">{viewing.location || 'Location not captured'} · {viewing.status === 'confirmed' ? 'Booked' : viewing.status === 'viewing_requested' ? 'Awaiting responses' : viewing.status === 'reschedule_requested' ? 'New time proposed' : viewing.status === 'declined' ? 'Declined' : viewing.status === 'cancelled' ? 'Cancelled' : 'Response pending'}</p>
          {viewing.booking_source === 'agent_phone_override' ? <p className="mt-2 text-xs text-[#1c6954]">Booked by the agent after confirming with all three parties.</p> : null}
        </div>
        <div className="grid gap-2">
          {['buyer', 'seller', 'agent'].map((role) => {
            const participant = participants.find((person) => person.role === role)
            const response = participant?.response_status || 'pending'
            return <div key={role} className="flex items-center justify-between gap-3 rounded-[13px] border border-[#e1e9f1] px-4 py-3">
              <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[#61758a]">{role}</p><p className="truncate text-sm font-semibold text-[#142132]">{participant?.name || 'Not recorded'}</p><p className="truncate text-xs text-[#607387]">{participant?.email || 'Email not recorded'}</p></div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${response === 'accepted' ? 'bg-[#e8f7ed] text-[#197442]' : response === 'pending' ? 'bg-[#fff5e8] text-[#9a5a0a]' : 'bg-[#edf2f8] text-[#4a5c70]'}`}>{response === 'proposed_new_time' ? 'New time proposed' : response === 'accepted' ? 'Confirmed' : response === 'declined' ? 'Declined' : 'Pending'}</span>
            </div>
          })}
        </div>
        {agentCanRespond ? <div className="grid gap-3 border-t border-[#e6edf3] pt-4">
          <p className="text-sm font-semibold text-[#142132]">Your response</p>
          {proposing ? <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); onResponse('reschedule', proposal) }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-[#2d445e]">New date<Field type="date" value={proposal.preferredDate} onChange={(event) => setProposal((previous) => ({ ...previous, preferredDate: event.target.value }))} required /></label>
              <label className="grid gap-1 text-xs font-semibold text-[#2d445e]">New time<Field type="time" value={proposal.preferredStartTime} onChange={(event) => setProposal((previous) => ({ ...previous, preferredStartTime: event.target.value }))} required /></label>
            </div>
            <label className="grid gap-1 text-xs font-semibold text-[#2d445e]">Note (optional)<Field as="textarea" rows={2} value={proposal.message} onChange={(event) => setProposal((previous) => ({ ...previous, message: event.target.value }))} /></label>
            <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Send new time</Button><Button type="button" variant="secondary" onClick={() => setProposing(false)} disabled={saving}>Cancel</Button></div>
          </form> : <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => onResponse('accept')} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Confirm this time</Button><Button type="button" variant="secondary" onClick={() => setProposing(true)} disabled={saving}>Request a new time</Button></div>}
        </div> : viewing.managed_round_number ? <p className="text-xs text-[#607387]">Responses are managed through each participant’s invitation. Your action appears here when the agent response is pending.</p> : <p className="text-xs text-[#607387]">This earlier viewing uses the legacy appointment flow; its response cannot be changed from this panel.</p>}
      </div> : null}
    </Modal>
  )
}
