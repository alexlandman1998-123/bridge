import { useState } from 'react'
import { CLIENT_TRANSFER_STAGE_DEFINITIONS } from '../../../core/clientPortal/transferJourneyPresentationModel.js'

const initial = { currentStatus: '', waitingOn: '', durationEstimate: '', registrationEstimate: '', delayStatus: '', delayReason: '', clientAction: '', message: '', buyer: true, seller: true }

export default function TransferJourneyUpdateComposer({ stageKey = '', onPublish, disabled = false, compact = false }) {
  const stage = CLIENT_TRANSFER_STAGE_DEFINITIONS.find(item => item.key === stageKey)
  const [draft, setDraft] = useState({ ...initial, durationEstimate: stage?.duration || '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (busy || disabled || !stage) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const recipients = [draft.buyer ? 'buyer' : '', draft.seller ? 'seller' : ''].filter(Boolean)
      if (!recipients.length) throw new Error('Choose the buyer, seller, or both.')
      if (!draft.currentStatus.trim() || !draft.message.trim()) throw new Error('Add the current status and an attorney update.')
      if (!draft.delayStatus) throw new Error('Choose whether this stage is delayed.')
      if (draft.delayStatus === 'delayed' && !draft.delayReason.trim()) throw new Error('Describe the delay for the client.')
      await onPublish({
        clientRecipients: recipients,
        message: draft.message.trim(),
        journeyBrief: {
          stageKey, currentStatus: draft.currentStatus.trim(), waitingOn: draft.waitingOn.trim(),
          durationEstimate: draft.durationEstimate.trim(), registrationEstimate: draft.registrationEstimate.trim(),
          delayStatus: draft.delayStatus, delayReason: draft.delayStatus === 'delayed' ? draft.delayReason.trim() : '',
          clientAction: draft.clientAction.trim(),
        },
      })
      setDraft(previous => ({ ...initial, buyer: previous.buyer, seller: previous.seller, durationEstimate: stage.duration }))
      setNotice('Update published to the selected client portal journeys.')
    } catch (saveError) {
      setError(saveError?.message || 'Unable to publish this transfer update.')
    } finally {
      setBusy(false)
    }
  }

  return <section className={compact ? 'py-1' : 'rounded-[18px] border border-emerald-200 bg-white p-5 shadow-[0_10px_22px_rgba(15,23,42,0.04)]'} aria-label="Client transfer journey update">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">Buyer & seller transfer journey</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">Publish the current-stage update</h2>
        <p className="mt-1 text-sm text-slate-600">Share progress, timing and any delay with the selected clients. Task outcomes still control the timeline.</p>
      </div>
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">{stage?.title || 'Waiting for the legal journey'}</span>
    </div>
    {!stage ? <p className="mt-4 text-sm text-slate-600">Load the current matter journey before publishing a client update.</p> : <form onSubmit={submit} className="mt-4 grid gap-4 lg:grid-cols-2">
      <label className="grid gap-1.5 text-sm font-semibold text-slate-800">Currently
        <input required maxLength={140} value={draft.currentStatus} onChange={event => setDraft(previous => ({ ...previous, currentStatus: event.target.value }))}
          placeholder="For example, waiting for municipal figures" className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-800">Waiting on
        <input maxLength={100} value={draft.waitingOn} onChange={event => setDraft(previous => ({ ...previous, waitingOn: event.target.value }))}
          placeholder="For example, municipality" className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-800">Usually takes
        <input maxLength={80} value={draft.durationEstimate} onChange={event => setDraft(previous => ({ ...previous, durationEstimate: event.target.value }))}
          placeholder="Estimated duration for this stage" className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-800">Estimated registration
        <input maxLength={80} value={draft.registrationEstimate} onChange={event => setDraft(previous => ({ ...previous, registrationEstimate: event.target.value }))}
          placeholder="Optional; timing to be confirmed if blank" className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-800">Is this stage delayed?
        <select required value={draft.delayStatus} onChange={event => setDraft(previous => ({ ...previous, delayStatus: event.target.value, delayReason: event.target.value === 'delayed' ? previous.delayReason : '' }))} className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal">
          <option value="">Choose a status</option><option value="on_track">No, on track</option><option value="delayed">Yes, delayed</option>
        </select>
      </label>
      {draft.delayStatus === 'delayed' ? <label className="grid gap-1.5 text-sm font-semibold text-slate-800">Reason for delay
        <input required maxLength={180} value={draft.delayReason} onChange={event => setDraft(previous => ({ ...previous, delayReason: event.target.value }))} placeholder="Explain what is causing the delay" className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
      </label> : null}
      <label className="grid gap-1.5 text-sm font-semibold text-slate-800 lg:col-span-2">What the recipient needs to do
        <input maxLength={180} value={draft.clientAction} onChange={event => setDraft(previous => ({ ...previous, clientAction: event.target.value }))}
          placeholder="Leave blank if no action has been confirmed" className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-800 lg:col-span-2">Latest update from the transferring attorney
        <textarea required rows={3} maxLength={2000} value={draft.message} onChange={event => setDraft(previous => ({ ...previous, message: event.target.value }))}
          placeholder="Describe the progress in client-safe language." className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
      </label>
      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-800 lg:col-span-2">
        <span className="font-semibold">Publish to</span>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.buyer} onChange={event => setDraft(previous => ({ ...previous, buyer: event.target.checked }))} />Buyer</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.seller} onChange={event => setDraft(previous => ({ ...previous, seller: event.target.checked }))} />Seller</label>
      </div>
      {error ? <p role="alert" className="text-sm text-red-700 lg:col-span-2">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-emerald-800 lg:col-span-2">{notice}</p> : null}
      <div className="flex justify-end lg:col-span-2"><button type="submit" disabled={busy || disabled} className="min-h-10 rounded-xl bg-emerald-800 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Publishing…' : 'Publish journey update'}</button></div>
    </form>}
  </section>
}
