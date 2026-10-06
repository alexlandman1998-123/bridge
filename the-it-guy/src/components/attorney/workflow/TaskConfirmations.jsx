import { legalTaskRecordIssues } from '../../../core/transactions/legalTaskContent.js'
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Circle, FileText, MessageSquarePlus, Download } from 'lucide-react'
import Button from '../../ui/Button.jsx'
import Field from '../../ui/Field.jsx'
import { getLegalTaskChecklistProgress } from '../../../core/transactions/legalTaskWorkbenchModel.js'

function ReviewRegister({ spec, items = [], disabled, onChange }) {
  // A single task record is immediately editable; repeated registers retain
  // their existing add/remove behaviour and all saved/unknown fields.
  const multiple = spec.multiple !== false
  const rows = !multiple && !items.length ? [{}] : items
  const update = (index, field, value) => onChange(rows.map((row, i) => i === index ? { ...row, [field]: value } : row))
  return <div className="ml-8 space-y-3" aria-label={spec.label} data-task-record={spec.label}>
    <p className="text-xs text-slate-600">{spec.help}</p>
    {rows.map((row, index) => <fieldset key={row.id || index} disabled={disabled} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <legend className="px-1 text-xs font-semibold">{spec.itemLabel || 'Item'}{multiple || rows.length > 1 ? ` ${index + 1}` : ''}</legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {spec.fields.map(field => <label key={field.key} className="grid min-w-0 gap-1 text-xs text-slate-700">{field.label}
          {field.type === 'select' ? <Field as="select" value={row[field.key] || ''} onChange={event => update(index, field.key, event.target.value)}>
            <option value="">Select position</option>{field.options.map(option => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}
          </Field> : <Field type={field.type} min={field.type === 'number' ? '0' : undefined} step={field.type === 'number' ? '0.01' : undefined} maxLength={4000} value={row[field.key] || ''} onChange={event => update(index, field.key, event.target.value)} />}
        </label>)}
      </div>
      {multiple ? <button type="button" className="mt-3 text-xs font-semibold text-red-700 disabled:opacity-50" onClick={() => onChange(items.filter((_, i) => i !== index))}>Remove {spec.itemLabel?.toLowerCase() || 'item'} {index + 1}</button> : null}
    </fieldset>)}
    {multiple ? <Button type="button" variant="secondary" size="sm" disabled={disabled || items.length >= 100} onClick={() => onChange([...items, { id: crypto.randomUUID() }])}>{spec.addLabel || 'Add item'}</Button> : null}
  </div>
}

function ConfirmationRow({ item, response, noteOpen, disabled, busy, error, onChange, onToggleNote, onRunAction, details }) {
  const answer = item.authoritative ? item.authoritativeAnswer || '' : response?.answer || ''
  const documentStatus = item.documentStatus
  const linkedFiles = (item.documents || []).filter(document => document.fileUrl || document.file_url || document.signedUrl || document.signed_url || document.url)
  return <div className={`legal-task-confirmation space-y-3 ${details ? 'has-details' : ''} ${answer === 'yes' ? 'is-confirmed' : ''}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <span className="flex min-w-0 flex-1 items-start gap-3">
        {answer === 'yes' ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-700" /> : <Circle size={20} className={`mt-0.5 shrink-0 ${answer ? 'text-amber-600' : 'text-slate-400'}`} />}
        <span className="min-w-0"><strong className="block text-sm font-medium text-slate-800">{item.label}</strong>
          {item.requirement?.description && !/^[a-z\d]+(?:_[a-z\d]+)+$/i.test(item.requirement.description) && item.requirement.description.trim().toLowerCase() !== item.label.trim().toLowerCase() ? <details className="mt-1 text-xs text-slate-500"><summary className="w-fit cursor-pointer">Details</summary><p className="mt-1">{item.requirement.description}</p></details> : null}
          {answer === 'no' ? <span className="mt-0.5 block text-xs text-amber-800">Answered No · work may still be needed</span> : null}
          {answer === 'not_applicable' ? <span className="mt-0.5 block text-xs text-slate-500">Answered Not applicable</span> : null}
          {item.requirement?.staleApproval ? <span role="alert" className="mt-1 block text-xs font-semibold text-amber-800">Prior approval is stale. Recheck the changed party or signatory in the party profile.</span> : null}
          {item.requirement?.specialistHold ? <span className="mt-1 block text-xs font-semibold text-amber-800">Specialist capacity hold: an attorney must review the route.</span> : null}
          {item.authoritative ? <span className="mt-1 block text-xs text-slate-500">{item.requirement?.partyFact ? 'Party facts are edited in the party profile.' : 'Capacity decisions are recorded in the party profile.'}</span> : null}
        </span>
      </span>
      <div role="group" aria-label={item.label} className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {(item.answers || ['yes', 'no', 'not_applicable']).map((value) => {
          const label = value === 'not_applicable' ? 'Not applicable' : value === 'yes' ? 'Yes' : 'No'
          return <button key={value} type="button" className={`min-h-8 rounded-md px-3 text-xs font-semibold transition ${answer === value ? value === 'yes' ? 'bg-emerald-100 text-emerald-900 shadow-sm' : 'bg-amber-100 text-amber-900 shadow-sm' : 'text-slate-600 hover:bg-white'} disabled:cursor-not-allowed disabled:opacity-60`} aria-pressed={answer === value} disabled={disabled || busy || item.authoritative} onClick={() => onChange({ answer: value })}>{label}</button>
        })}
      </div>
    </div>
    {documentStatus ? <div className="ml-8 flex flex-wrap items-center gap-2 text-xs text-slate-600">
      <FileText size={14} aria-hidden="true" />
      <span>{documentStatus.correctionRequested ? 'Document correction requested'
        : documentStatus.attached && documentStatus.approved === documentStatus.attached ? `${documentStatus.attached} document${documentStatus.attached === 1 ? '' : 's'} approved`
          : documentStatus.attached ? `${documentStatus.attached} linked document${documentStatus.attached === 1 ? '' : 's'} available for review`
            : item.requirement?.partyId ? `No document linked to ${item.requirement.partyName}` : 'Document outstanding'}</span>
      {item.action ? <button type="button" disabled={busy || item.action.disabled} className="font-semibold text-emerald-800 hover:underline disabled:opacity-50" onClick={() => onRunAction?.(item.action)}>{item.action.label}</button> : null}
    </div> : item.action ? <div className="ml-8"><button type="button" disabled={busy || item.action.disabled} className="text-xs font-semibold text-emerald-800 hover:underline disabled:opacity-50" onClick={() => onRunAction?.(item.action)}>{item.action.label}</button></div> : null}
    {linkedFiles.length ? <div className="legal-task-linked-files" aria-label={`Files for ${item.label}`}>{linkedFiles.map((document, index) => <a key={document.id || document.key || index} href={document.fileUrl || document.file_url || document.signedUrl || document.signed_url || document.url} target="_blank" rel="noreferrer" className="legal-task-file-link"><FileText size={18} aria-hidden="true" /><span><strong>{document.displayName || document.label || document.name || 'Supporting document'}</strong><span>Open / download</span></span><Download size={17} aria-hidden="true" /></a>)}</div> : null}
    {item.additionalAction ? <div className="ml-8"><button type="button" disabled={busy || item.additionalAction.disabled} className="text-xs font-semibold text-emerald-800 hover:underline disabled:opacity-50" onClick={() => onRunAction?.(item.additionalAction)}>{item.additionalAction.label}</button></div> : null}
    {item.requirement && !documentStatus ? <p className={`ml-8 text-xs ${item.requirement.complete ? 'text-emerald-800' : 'text-amber-800'}`}>{item.requirement.complete ? 'Requirement present' : 'Requirement still outstanding'}{item.requirement.type === 'data' && item.requirement.value !== null && item.requirement.value !== undefined ? `: ${String(item.requirement.value)}` : ''}</p> : null}
    {details ? <div className="ml-8 rounded-lg border border-slate-200 bg-slate-50/60 p-3">{details}</div> : null}
    {item.register ? <ReviewRegister spec={item.register} items={response?.items || []} disabled={disabled || busy} onChange={items => onChange({ items })} /> : null}
    {!item.authoritative ? <button type="button" disabled={disabled || busy} className="ml-8 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-emerald-800 disabled:opacity-50" onClick={onToggleNote}><MessageSquarePlus size={13} />{response?.note ? 'Edit note' : 'Add note'}</button> : null}
    {!item.authoritative && (noteOpen || response?.note) ? <label className="ml-8 grid gap-1 text-sm">Note for {item.label}<Field as="textarea" rows={2} maxLength={4000} disabled={disabled || busy} value={response?.note || ''} onChange={event => onChange({ note: event.target.value })} /></label> : null}
    {error ? <p role="alert" className="ml-8 text-xs text-red-700">{error}</p> : null}
  </div>
}

function confirmationDraft(saved, items) {
  const draft = { ...saved }
  for (const item of items) if (!Object.hasOwn(draft, item.id) && item.register?.initialItems?.length) {
    draft[item.id] = { items: item.register.initialItems.map(row => ({ ...row })) }
  }
  return draft
}

export default function TaskConfirmations({ taskKey, items, saved = {}, disabled, compact = false, title = 'Task checklist', onSave, onBusyChange, onDirtyChange, onRunAction, renderRowDetails }) {
  const [draft, setDraft] = useState(() => confirmationDraft(saved, items))
  const [notes, setNotes] = useState({})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rowErrors, setRowErrors] = useState({})
  const [savedMessage, setSavedMessage] = useState(false)
  const pending = useRef(false)
  const saveAttempt = useRef(0)
  const onDirtyChangeRef = useRef(onDirtyChange)
  const busyCallbackRef = useRef(onBusyChange)
  busyCallbackRef.current = onBusyChange
  useEffect(() => {
    busyCallbackRef.current?.(busy)
    return () => busyCallbackRef.current?.(false)
  }, [busy])
  const currentTaskKey = useRef(taskKey)
  currentTaskKey.current = taskKey
  const snapshot = JSON.stringify(confirmationDraft(saved, items))
  const savedSnapshotRef = useRef(snapshot)
  savedSnapshotRef.current = snapshot
  useEffect(() => { onDirtyChangeRef.current = onDirtyChange }, [onDirtyChange])
  useEffect(() => () => { saveAttempt.current += 1; pending.current = false }, [])
  useEffect(() => {
    saveAttempt.current += 1
    pending.current = false
    setBusy(false)
    setError('')
    setSavedMessage(false)
    setDraft(JSON.parse(savedSnapshotRef.current)); setDirty(false); setNotes({}); setRowErrors({}); onDirtyChangeRef.current?.(taskKey, false)
  }, [taskKey])
  useEffect(() => { if (!dirty) setDraft(JSON.parse(snapshot)) }, [snapshot])
  useEffect(() => {
    if (!dirty) return undefined
    const warnBeforeUnload = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [dirty])
  function change(id, patch) {
    setDirty(true)
    onDirtyChangeRef.current?.(taskKey, true)
    setSavedMessage(false)
    setError('')
    setRowErrors(previous => ({ ...previous, [id]: '' }))
    setDraft(previous => ({ ...previous, [id]: { ...previous[id], ...patch } }))
  }
  async function save() {
    if (disabled || pending.current) return
    const invalidRows = Object.fromEntries(items.flatMap(item => {
      const response = draft[item.id]
      const issues = item.register ? legalTaskRecordIssues(item.register, response?.items) : []
      if ((response?.note?.trim() || response?.items?.length) && !response?.answer) issues.unshift(response?.items?.length ? 'Choose Yes, No or Not applicable before saving the record.' : 'Choose an answer before saving this note.')
      return issues.length ? [[item.id, issues.join(' ')]] : []
    }))
    if (Object.keys(invalidRows).length) { setRowErrors(invalidRows); setError('Check the highlighted record before saving.'); return }
    const savingTaskKey = taskKey
    const attempt = ++saveAttempt.current
    pending.current = true; setBusy(true); setError('')
    try {
      if (await onSave(draft)) {
        if (attempt !== saveAttempt.current || savingTaskKey !== currentTaskKey.current) return
        setDirty(false); onDirtyChangeRef.current?.(savingTaskKey, false); setSavedMessage(true)
      } else {
        if (attempt !== saveAttempt.current || savingTaskKey !== currentTaskKey.current) return
        setError('Answers were not saved. Review the task error below and try again.')
      }
    }
    catch (error) {
      if (attempt === saveAttempt.current && savingTaskKey === currentTaskKey.current) {
        setError(error.message || 'Confirmations could not be saved.')
      }
    }
    finally {
      if (attempt === saveAttempt.current && savingTaskKey === currentTaskKey.current) {
        pending.current = false; setBusy(false)
      }
    }
  }
  if (!items.length) return null
  const { answered: answeredCount, completed: completedCount } = getLegalTaskChecklistProgress(items, draft)
  return <section className={`legal-task-confirmations ${compact ? '' : 'mt-5'}`}>
    <div className="legal-task-checklist-heading"><div><h3 className="text-base font-semibold text-slate-950">{title}</h3><p className="mt-1 text-sm text-slate-500">Review the evidence and record your findings for this task.</p></div><div className="legal-task-checklist-progress"><span className="text-xs font-medium text-slate-600">Checklist · {compact ? completedCount : answeredCount} of {items.length} items {compact ? 'confirmed' : 'answered'}</span><div className="legal-task-progress-track" role="progressbar" aria-label="Task checklist progress" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={compact ? completedCount : answeredCount}><span style={{ width: `${((compact ? completedCount : answeredCount) / items.length) * 100}%` }} /></div></div></div>
    <div className="legal-task-confirmation-list">{items.map(item => <ConfirmationRow key={item.id} item={item} response={draft[item.id]} noteOpen={notes[item.id]} disabled={disabled} busy={busy} error={rowErrors[item.id]} onChange={patch => change(item.id, patch)} onToggleNote={() => setNotes(previous => ({ ...previous, [item.id]: !previous[item.id] }))} onRunAction={onRunAction} details={renderRowDetails?.(item)} />)}</div>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <div className="legal-task-save-row flex flex-wrap items-center justify-between gap-3">{dirty ? <span role="status" className="text-xs font-medium text-amber-800">Unsaved answers</span> : savedMessage ? <span role="status" className="text-xs font-medium text-emerald-800">Answers saved</span> : <span className="text-xs text-slate-500">{disabled ? 'Saved confirmations' : 'Save your answers when you’re ready.'}</span>}<Button type="button" variant={dirty ? 'primary' : 'secondary'} size="sm" disabled={disabled || busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save answers'}</Button></div>
  </section>
}
