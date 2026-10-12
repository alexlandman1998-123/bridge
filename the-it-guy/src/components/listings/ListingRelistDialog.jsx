import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Field from '../ui/Field'

export default function ListingRelistDialog({ channels, initialChannel = '', expiryDate, minExpiryDate, onRelist, onClose, onEdit }) {
  const [selected, setSelected] = useState(initialChannel ? [initialChannel] : channels)
  const [expiry, setExpiry] = useState(expiryDate)
  const [sameProperty, setSameProperty] = useState(false)
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const finished = results.length > 0 && results.every(row => row.status === 'completed')
  const canContinue = results.some(row => ['failed', 'blocked', 'pending'].includes(row.status))
  async function run() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const targets = results.length ? results.filter(row => ['failed', 'blocked', 'pending'].includes(row.status)).map(row => row.channel) : selected
      const next = await onRelist({ channels: targets, expiryDate: expiry, previousResults: results, onProgress: setResults })
      setResults(next)
    } catch (failure) { setError(failure.message || 'The listing could not be relisted.') }
    finally { setBusy(false) }
  }
  return <Modal open title="Relist listing" className="!max-w-xl" onClose={busy ? undefined : onClose}
    footer={<div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{finished ? 'Done' : 'Close'}</Button>
      {!finished && (!results.length || canContinue) ? <Button type="button" disabled={busy || !sameProperty || !selected.length} onClick={() => void run()}>{busy ? <Loader2 size={15} className="animate-spin" /> : null}{busy ? 'Relisting…' : results.length ? 'Check and continue' : 'Relist selected channels'}</Button> : null}
    </div>}>
    <div className="grid gap-4 text-sm leading-6 text-[#607387]">
      <p>Save your edited details, restore the existing adverts, and send the updated price, description and photos. Each portal is checked separately.</p>
      <p>Private Property retains the original address. Relisting does not create a new advert or guarantee a new listing date.</p>
      <fieldset disabled={busy || results.length > 0} className="grid gap-2"><legend className="mb-2 font-semibold text-[#243d56]">Relist on</legend>{channels.map(channel => <label key={channel} className="flex items-center gap-2"><input type="checkbox" checked={selected.includes(channel)} onChange={event => setSelected(previous => event.target.checked ? [...previous, channel] : previous.filter(value => value !== channel))} />{channel}</label>)}</fieldset>
      {selected.includes('Property24') ? <label className="grid gap-2 font-semibold text-[#243d56]">Property24 expiry date<Field type="date" min={minExpiryDate} value={expiry} disabled={busy || results.length > 0} onChange={event => setExpiry(event.target.value)} /></label> : null}
      <label className="flex items-start gap-2"><input type="checkbox" checked={sameProperty} disabled={busy || results.length > 0} onChange={event => setSameProperty(event.target.checked)} />This is the same property as the original advert.</label>
      <div role="status" aria-live="polite" className="grid gap-3">{results.map(row => <div key={row.channel} className="rounded-xl border border-[#dbe6f2] p-3"><p className="font-semibold text-[#243d56]">{row.channel} · {row.status === 'completed' ? 'Relisted' : row.status === 'pending' ? 'Waiting for portal' : row.status === 'uncertain' ? 'Check advert' : row.status === 'running' ? 'Relisting…' : 'Needs attention'}</p><p>{row.detail}</p></div>)}</div>
      {error ? <p role="alert" className="text-[#a43d35]">{error}</p> : null}
      {results.some(row => row.status === 'blocked') ? <Button type="button" variant="secondary" disabled={busy} onClick={() => onEdit(results.find(row => row.status === 'blocked')?.channel || selected[0])}>Edit listing details</Button> : null}
    </div>
  </Modal>
}
