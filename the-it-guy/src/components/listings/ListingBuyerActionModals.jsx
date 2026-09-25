import { CalendarDays, Loader2, Send, UserRound } from 'lucide-react'
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

function RecipientToggle({ checked, disabled = false, title, detail, onChange }) {
  return (
    <label className={`flex items-start gap-3 rounded-[14px] border p-4 ${disabled ? 'cursor-not-allowed border-[#e7edf4] bg-[#f7f9fb] opacity-70' : 'cursor-pointer border-[#dce6f2] bg-[#fbfdff]'}`}>
      <input type="checkbox" className="mt-1" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <span className="block text-sm font-semibold text-[#243d56]">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-[#607387]">{detail}</span>
      </span>
    </label>
  )
}

export function ListingViewingRequestModal({
  open,
  draft,
  leads = [],
  seller = {},
  saving = false,
  feedback,
  listingTitle = '',
  onChange,
  onLeadSelect,
  onClose,
  onSubmit,
}) {
  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Request a Viewing"
      subtitle={listingTitle ? `Propose a time for ${listingTitle}.` : 'Propose a viewing time for this listing.'}
      className="max-w-3xl"
      footer={(
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" form="listing-viewing-request-form" disabled={saving}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Send Viewing Request
          </Button>
        </div>
      )}
    >
      <form id="listing-viewing-request-form" className="grid gap-5" onSubmit={onSubmit}>
        <Feedback feedback={feedback} />
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

        <section className="grid gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-[#1f4f78]" />
            <h3 className="text-sm font-semibold text-[#142132]">Proposed time</h3>
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

        <section className="grid gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#142132]">Send RSVP request to</h3>
            <p className="mt-1 text-xs leading-5 text-[#607387]">Each selected recipient receives their own secure link to accept, decline, or propose another time.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <RecipientToggle
              checked={Boolean(draft.sendToBuyer)}
              disabled={!draft.email}
              title="Buyer"
              detail={draft.email || 'Add the buyer email first.'}
              onChange={(checked) => onChange('sendToBuyer', checked)}
            />
            <RecipientToggle
              checked={Boolean(draft.sendToSeller)}
              disabled={!seller.email}
              title="Seller"
              detail={seller.email || 'Add the seller email on the Seller tab first.'}
              onChange={(checked) => onChange('sendToSeller', checked)}
            />
          </div>
        </section>
      </form>
    </Modal>
  )
}
