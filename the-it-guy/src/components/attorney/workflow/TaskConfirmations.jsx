import { useEffect, useRef, useState } from 'react'
import Button from '../../ui/Button.jsx'
import Field from '../../ui/Field.jsx'

export default function TaskConfirmations({ taskKey, items, saved = {}, disabled, onSave }) {
  const [draft, setDraft] = useState(saved)
  const [notes, setNotes] = useState({})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const snapshot = JSON.stringify(saved)
  useEffect(() => { setDraft(JSON.parse(snapshot)); setDirty(false); setNotes({}) }, [taskKey])
  useEffect(() => { if (!dirty) setDraft(JSON.parse(snapshot)) }, [snapshot])
  function change(id, patch) {
    setDirty(true)
    setDraft(previous => ({ ...previous, [id]: { ...previous[id], ...patch } }))
  }
  async function save() {
    if (disabled || pending.current) return
    if (Object.values(draft).some(response => response.note && !response.answer)) {
      setError('Choose Yes, No or Not applicable for each note before saving.'); return
    }
    pending.current = true; setBusy(true); setError('')
    try { if (await onSave(draft)) setDirty(false) }
    catch (error) { setError(error.message || 'Confirmations could not be saved.') }
    finally { pending.current = false; setBusy(false) }
  }
  if (!items.length) return null
  return <section className="mt-4 rounded-xl border border-slate-200 p-4">
    <h3 className="mb-3 text-lg font-semibold">Confirmations</h3>
    <div className="divide-y divide-slate-200">{items.map(item => <div key={item.id} className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><strong className="text-sm">{item.label}</strong>
        <div role="group" aria-label={item.label} className="flex flex-wrap gap-2">
          {[['yes', 'Yes'], ['no', 'No'], ['not_applicable', 'Not applicable']].map(([value, label]) => <Button key={value} type="button" size="sm" variant={draft[item.id]?.answer === value ? 'primary' : 'secondary'} aria-pressed={draft[item.id]?.answer === value} disabled={disabled} onClick={() => change(item.id, { answer: value })}>{label}</Button>)}
          <Button type="button" variant="ghost" size="sm" onClick={() => setNotes(previous => ({ ...previous, [item.id]: !previous[item.id] }))}>Add note</Button>
        </div>
      </div>
      {notes[item.id] || draft[item.id]?.note ? <label className="grid gap-1 text-sm">Note for {item.label}<Field as="textarea" rows={2} disabled={disabled} value={draft[item.id]?.note || ''} onChange={event => change(item.id, { note: event.target.value })} /></label> : null}
    </div>)}</div>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <Button type="button" variant="secondary" disabled={disabled || busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save confirmations'}</Button>
  </section>
}
