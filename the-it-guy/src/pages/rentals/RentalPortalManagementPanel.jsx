import { useState } from 'react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { RENTAL_PORTAL_STATUSES } from '../../services/rentals/rentalListingChannelModel'

export default function RentalPortalManagementPanel({ channel, busy, onClose, onRefresh, onChangeStatus, onVerifyLink, onEdit, historyError, actionError = '', notice = '' }) {
  const [status, setStatus] = useState(RENTAL_PORTAL_STATUSES[channel.key][0])
  const [url, setUrl] = useState(channel.publicUrl || '')
  const [confirmed, setConfirmed] = useState(false)
  return <Modal open onClose={onClose} title={`Manage ${channel.label}`} subtitle="Manage this saved rental's portal record." className="max-w-2xl">
    <div className="space-y-5 text-sm">
      <dl className="grid gap-2"><div><dt>Reference</dt><dd>{channel.reference || 'Not assigned by the portal yet'}</dd></div><div><dt>Status</dt><dd>{channel.statusLabel || channel.status.replaceAll('_',' ')}</dd></div></dl>
      {channel.error ? <p role="alert" className="text-[#9f3131]">{channel.error}</p> : null}
      {actionError ? <p role="alert" className="text-[#9f3131]">{actionError}</p> : null}
      {notice ? <p role="status" className="text-[#286b43]">{notice}</p> : null}
      {channel.statusDetail ? <p className="text-[#8a5b13]">{channel.statusDetail}</p> : null}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={onRefresh} disabled={busy || !channel.reference}>Refresh portal status</Button><Button type="button" variant="secondary" onClick={onEdit} disabled={busy}>Edit saved listing</Button></div>
      <section className="space-y-3"><h3 className="font-semibold">Portal settings</h3>
        <label className="form-field"><span>Rental portal status</span><select value={status} onChange={event => setStatus(event.target.value)} disabled={busy || !channel.reference}>{RENTAL_PORTAL_STATUSES[channel.key].map(option => <option key={option}>{option}</option>)}</select></label>
        <Button type="button" onClick={() => onChangeStatus(status)} disabled={busy || !channel.reference}>Send status change</Button>
        {!channel.reference ? <p>A portal reference is required before changing or refreshing its status.</p> : null}
        <p>To send saved content or photos, run Check listing requirements, then select Update listing in the channel menu.</p>
      </section>
      <section className="space-y-3"><h3 className="font-semibold">Confirmed public listing link</h3>
        <label className="form-field"><span>Public listing URL</span><input type="url" value={url} onChange={event => { setUrl(event.target.value); setConfirmed(false) }} placeholder={`https://${channel.key === 'property24' ? 'www.property24.com' : 'www.privateproperty.co.za'}/...`} disabled={busy} /></label>
        <label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} /><span>I have opened this URL and checked it matches the saved rental details.</span></label>
        <Button type="button" variant="secondary" disabled={busy || !confirmed || !url || !channel.reference} onClick={() => onVerifyLink(url)}>Save confirmed public link</Button>
      </section>
      <section><h3 className="font-semibold">Publication history</h3>{historyError ? <p role="alert">{historyError}</p> : channel.activity.length ? <ul className="mt-2 space-y-1">{channel.activity.map(item => <li key={item.label}>{item.label} · {new Date(item.time).toLocaleString('en-ZA')}</li>)}</ul> : <p>No recorded submissions or confirmations yet.</p>}</section>
      <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
    </div>
  </Modal>
}
