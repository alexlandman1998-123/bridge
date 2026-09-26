import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import Button from '../../ui/Button.jsx'
import Field from '../../ui/Field.jsx'

export default function TaskConfirmations({ taskKey, items, saved = {}, disabled, onSave }) {
  const [draft, setDraft] = useState(saved)
  const [notes, setNotes] = useState({})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState(false)
  const pending = useRef(false)
  const snapshot = JSON.stringify(saved)
  useEffect(() => { setDraft(JSON.parse(snapshot)); setDirty(false); setNotes({}) }, [taskKey])
  useEffect(() => { if (!dirty) setDraft(JSON.parse(snapshot)) }, [snapshot])
  function change(id, patch) {
    setDirty(true)
    setSavedMessage(false)
    setDraft(previous => ({ ...previous, [id]: { ...previous[id], ...patch } }))
  }
  async function save() {
    if (disabled || pending.current) return
    if (Object.values(draft).some(response => response.note && !response.answer)) {
      setError('Choose Yes, No or Not applicable for each note before saving.'); return
    }
    pending.current = true; setBusy(true); setError('')
    try { if (await onSave(draft)) { setDirty(false); setSavedMessage(true) } }
    catch (error) { setError(error.message || 'Confirmations could not be saved.') }
    finally { pending.current = false; setBusy(false) }
  }
  if (!items.length) return null
  const answeredCount = items.filter(item => draft[item.id]?.answer).length
  return <section className="mt-4 rounded-xl border border-slate-200 px-4 py-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-lg font-semibold text-slate-950">Confirmations</h3><p className="mt-0.5 text-sm text-slate-500">Record the current status of each confirmation.</p></div><span className="text-xs font-medium text-slate-500">{answeredCount} of {items.length} complete</span></div>
    <div className="mt-3 divide-y divide-slate-200">{items.map(item => <div key={item.id} className="space-y-2 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="flex min-w-0 flex-1 items-center gap-3">{draft[item.id]?.answer ? <CheckCircle2 size={20} className="shrink-0 text-emerald-700" /> : <Circle size={20} className="shrink-0 text-slate-400" />}<strong className="text-sm font-medium text-slate-800">{item.label}</strong></span>
        <div role="group" aria-label={item.label} className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(item.answers || ['yes', 'no', 'not_applicable']).map((value) => {
            const label = value === 'not_applicable' ? 'Not applicable' : value === 'yes' ? 'Yes' : 'No'
            return <button key={value} type="button" className={`min-h-8 rounded-md px-3 text-xs font-semibold transition ${draft[item.id]?.answer === value ? 'bg-emerald-100 text-emerald-900 shadow-sm' : 'text-slate-600 hover:bg-white'} disabled:cursor-not-allowed disabled:opacity-60`} aria-pressed={draft[item.id]?.answer === value} disabled={disabled || busy} onClick={() => change(item.id, { answer: value })}>{label}</button>
          })}
        </div>
      </div>
      {item.allowNote !== false ? <button type="button" disabled={disabled || busy} className="ml-8 text-xs font-medium text-slate-500 hover:text-emerald-800 disabled:opacity-50" onClick={() => setNotes(previous => ({ ...previous, [item.id]: !previous[item.id] }))}>Add note</button> : null}
      {notes[item.id] || draft[item.id]?.note ? <label className="grid gap-1 text-sm">Note for {item.label}<Field as="textarea" rows={2} disabled={disabled} value={draft[item.id]?.note || ''} onChange={event => change(item.id, { note: event.target.value })} /></label> : null}
    </div>)}</div>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <div className="mt-3 flex items-center justify-between gap-3">{dirty ? <span role="status" className="text-xs font-medium text-amber-800">Unsaved changes</span> : savedMessage ? <span role="status" className="text-xs font-medium text-emerald-800">Saved</span> : <span />}<Button type="button" variant="secondary" size="sm" disabled={disabled || busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save confirmations'}</Button></div>
  </section>
}
