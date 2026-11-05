import { ArrowLeft, LoaderCircle, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './mobile-task-create.css'

function newTaskId() {
  // getRandomValues also works on the local HTTP address used by phones.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export default function MobileTaskCreateSheet({ onClose, onCreateTask, onSaved }) {
  const dialogRef = useRef(null)
  const busy = useRef(false)
  const [taskId] = useState(newTaskId)
  const [form, setForm] = useState(() => ({ title: '', dueDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()), priority: 'Medium', description: '' }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    const viewport = window.visualViewport
    const fit = () => {
      dialog.style.setProperty('--task-height', `${viewport?.height || window.innerHeight}px`)
      dialog.style.setProperty('--task-top', `${viewport?.offsetTop || 0}px`)
    }
    fit()
    dialog.showModal()
    viewport?.addEventListener('resize', fit)
    viewport?.addEventListener('scroll', fit)
    window.addEventListener('resize', fit)
    return () => {
      viewport?.removeEventListener('resize', fit)
      viewport?.removeEventListener('scroll', fit)
      window.removeEventListener('resize', fit)
      if (dialog.open) dialog.close()
    }
  }, [])

  function close() { if (!busy.current) onClose() }
  function update(key, value) { setForm(current => ({ ...current, [key]: value })) }
  function keepFocus(event) {
    if (event.key !== 'Tab') return
    const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')]
    const first = controls[0], last = controls.at(-1)
    if (!first) { event.preventDefault(); return }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  async function save(event) {
    event.preventDefault()
    if (busy.current || !onCreateTask) return
    busy.current = true
    setSaving(true)
    setError('')
    try {
      await onCreateTask({ ...form, title: form.title.trim(), taskId })
    } catch (failure) {
      setError(failure?.message || 'The task could not be saved. Your entries are still here; please retry.')
      busy.current = false
      setSaving(false)
      return
    }
    busy.current = false
    onSaved?.()
  }

  return <dialog ref={dialogRef} className="mobile-task-create-dialog" aria-label="Add task" onKeyDown={keepFocus} onCancel={event => { event.preventDefault(); close() }}>
    <form className="mobile-task-create-form" onSubmit={save} aria-busy={saving}>
      <header className="mobile-task-create-header">
        <button type="button" className="mobile-task-create-back" onClick={close} disabled={saving}><ArrowLeft size={19} aria-hidden="true" />Back</button>
        <span>Assigned to you</span>
      </header>
      <div className="mobile-task-create-body">
        <h2>Add task</h2><p>Keep track of something you need to do.</p>
        <fieldset disabled={saving}>
          <label>Task title<input name="title" value={form.title} onChange={event => update('title', event.target.value)} required maxLength={180} placeholder="What needs to get done?" enterKeyHint="next" /></label>
          <div className="mobile-task-create-fields">
            <label>Due date<input name="dueDate" type="date" value={form.dueDate} required onChange={event => update('dueDate', event.target.value)} /></label>
            <label>Priority<select name="priority" value={form.priority} onChange={event => update('priority', event.target.value)}>{['Low', 'Medium', 'High'].map(value => <option key={value}>{value}</option>)}</select></label>
          </div>
          <label>Notes <span className="mobile-task-create-optional">(optional)</span><textarea name="description" rows={4} maxLength={4000} value={form.description} onChange={event => update('description', event.target.value)} placeholder="Add any details you’ll need." /></label>
        </fieldset>
        {error && <p className="mobile-task-create-error" role="alert">{error}</p>}
        {!onCreateTask && <p role="alert">Select your workspace before adding a task.</p>}
      </div>
      <footer className="mobile-task-create-footer"><button type="submit" disabled={saving || !onCreateTask}>{saving ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}{saving ? 'Saving task…' : 'Save task'}</button></footer>
    </form>
  </dialog>
}
