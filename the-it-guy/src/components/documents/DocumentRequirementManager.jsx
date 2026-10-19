import { useEffect, useRef, useState } from 'react'
import Modal from '../ui/Modal.jsx'
import DocumentUploadProgress from './DocumentUploadProgress.jsx'
import { createDocumentUploadProgress, withDocumentUploadDeadline } from '../../lib/documentUploadLifecycle.js'
import { readDocumentRequirementContext, watchDocumentRequirementContext } from '../../services/documents/documentRequirementReadService.js'
import { executeDocumentRequirementCommand, prepareDocumentRequirementUpload, uploadDocumentRequirementFile } from '../../services/documents/documentRequirementCommandService.js'
import { clearRequirementCommand, readRequirementCommand, requirementAddContext, requirementRecoveryKey, retainRequirementCommand } from '../../services/documents/documentRequirementCommandRecovery.js'
import { documentRequirementLabel, documentRequirementParty } from '../../core/documents/documentRequirementIdentity.js'
import { isDefiniteUploadSaveRejection } from '../../lib/documentUploadRecovery.js'
import { DOCUMENT_UPLOAD_ACCEPT, DOCUMENT_UPLOAD_HELP_TEXT } from '../../lib/documentUploadPolicy.js'

import { loadDocumentTypeSuggestions, matchDocumentTypes } from '../../services/documents/documentTypeSuggestionService.js'

import { findDuplicateRequirements, requirementSubject } from '../../services/documents/documentRequirementDuplicateService.js'

const buttonClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50'
const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm'
const labelOf = row => documentRequirementLabel(row, row.document_definitions || {})

// Remount on context changes so unfinished form state never follows navigation.
export default function DocumentRequirementManager(props) {
  if (!props.client || !props.contextId) return null
  return <RequirementControls key={`${props.contextType}:${props.contextId}:${props.party || ''}`} {...props} />
}

function RequirementControls({ client, contextType, contextId, party: fixedParty, onChange, presentation, open, onClose, initialRequirementId, documentLabel }) {
  const [snapshot, setSnapshot] = useState(null)
  const [actorId, setActorId] = useState('')
  const [pending, setPending] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('')
  const [typeChoice, setTypeChoice] = useState('')
  const [catalogue, setCatalogue] = useState({ rows: [], loading: true, error: false })
  const [party, setParty] = useState(fixedParty || 'seller')
  const [subjectRequirementId, setSubjectRequirementId] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [reason, setReason] = useState('')
  const [file, setFile] = useState(null)
  const [uploadStep, setUploadStep] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const lock = useRef(false)
  const fileInput = useRef(null)
  const existingControls = useRef(null)
  const refreshRef = useRef(null)
  const readGeneration = useRef(0)
  const accountRevision = useRef(0)
  const currentActor = useRef('')
  const alive = useRef(true)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (presentation !== 'dialog' || !open) return
    setUploadStep(false)
    setLabel('')
    setTypeChoice('')
    setSelectedId('')
    setReason('')
    setFile(null)
    setNotice('')
    setUploadProgress(null)
  }, [presentation, open])

  useEffect(() => {
    if (uploadStep) existingControls.current?.focus()
  }, [uploadStep])

  useEffect(() => {
    let cancelled = false
    setCatalogue({ rows: [], loading: true, error: false })
    loadDocumentTypeSuggestions(client, party).then(rows => {
      if (!cancelled) setCatalogue({ rows, loading: false, error: false })
    }).catch(() => {
      if (!cancelled) setCatalogue({ rows: [], loading: false, error: true })
    })
    return () => { cancelled = true }
  }, [client, party, actorId])

  useEffect(() => {
    let cancelled = false
    let previousVersion
    alive.current = true
    const refresh = async () => {
      const current = ++readGeneration.current
      try {
        const { data, error: authError } = await withDocumentUploadDeadline(() => client.auth.getUser())
        if (authError || !data?.user?.id) throw new Error('Sign in to manage document requirements.')
        const actor = data.user.id
        const next = await withDocumentUploadDeadline(() => readDocumentRequirementContext(client, { contextType, contextId }))
        if (cancelled || current !== readGeneration.current) return
        const recovered = readRequirementCommand(window.localStorage, requirementRecoveryKey(client, actor, contextType, contextId))
        setActorId(actor)
        currentActor.current = actor
        setPending(recovered)
        setSnapshot(next)
        setError('')
        if (previousVersion !== undefined && previousVersion !== next.version) await onChangeRef.current?.()
        previousVersion = next.version
      } catch (failure) {
        if (cancelled || current !== readGeneration.current) return
        setSnapshot(null)
        setError(failure.message || 'The document requirements could not be loaded.')
      }
    }
    refreshRef.current = refresh
    void refresh()
    const stop = watchDocumentRequirementContext(() => lock.current ? undefined : refresh())
    const subscription = client.auth.onAuthStateChange?.((_event, session) => {
      if (currentActor.current !== (session?.user?.id || '')) {
        accountRevision.current += 1
        readGeneration.current += 1
        currentActor.current = session?.user?.id || ''
        setSnapshot(null)
        setActorId('')
        setPending(null)
        setFile(null)
        setLabel(''); setTypeChoice('')
        setReason('')
        setSelectedId('')
        setSubjectRequirementId('')
        setUploadStep(false)
        setUploadProgress(null)
        setNotice('')
      }
      setTimeout(() => { if (!cancelled && !lock.current) void refresh() }, 0)
    })
    return () => { cancelled = true; alive.current = false; stop(); subscription?.data?.subscription?.unsubscribe() }
  }, [client, contextType, contextId])

  const rows = (snapshot?.requirements || []).filter(row => (!fixedParty || documentRequirementParty(row) === fixedParty)
    && (row.status !== 'not_applicable' || row.applicability_override === 'removed'))
  const removalMode = Boolean(initialRequirementId)
  const selected = rows.find(row => row.id === (removalMode ? initialRequirementId : selectedId))
  const removed = selected?.applicability_override === 'removed'
  const addContext = snapshot ? requirementAddContext(snapshot, contextType, contextId) : null
  const subjectRows = rows.filter(row => documentRequirementParty(row) === party
    && row.context_type === addContext?.contextType && row.context_id === addContext?.contextId
    && ((['person', 'entity', 'property'].includes(row.subject_kind) && row.subject_id) || row.requested_from_contact_id))
  const matches = matchDocumentTypes(catalogue.rows, label)
  const chosenType = catalogue.rows.find(row => row.key === typeChoice)
  const validChoice = typeChoice === 'custom' || Boolean(chosenType)
  const addSubject = subjectRows.find(row => row.id === subjectRequirementId)
  const addPayload = { party, ...(chosenType ? { definitionKey: chosenType.key } : { label: label.trim() }), ...requirementSubject(addSubject) }
  const duplicates = validChoice ? findDuplicateRequirements(rows, addContext, addPayload, chosenType?.display_label) : []
  const disabled = busy || !snapshot || !actorId || Boolean(pending)

  async function save(action, retry = false, intent = 'request') {
    if (lock.current) return
    lock.current = true
    readGeneration.current += 1
    setBusy(true)
    setError('')
    setNotice('')
    if (action !== 'upload') setUploadProgress(null)
    let command = retry ? pending : null
    const accountAtStart = accountRevision.current
    let key
    try {
      const { data, error: authError } = await withDocumentUploadDeadline(() => client.auth.getUser())
      if (authError || data?.user?.id !== actorId) throw new Error('Your account changed. Refresh before saving.')
      key = requirementRecoveryKey(client, actorId, contextType, contextId)
      if (!retry) {
        if (pending) throw new Error('Recover the unfinished change first.')
        if (action === 'add') {
          if (duplicates.length) throw new Error('This document is already requested. Use the existing requirement below.')
          if (!validChoice) throw new Error('Choose an existing document type or create a custom document.')
          if (!addContext || !label.trim()) throw new Error('Enter a document name and choose its transaction workspace.')
          command = { commandId: crypto.randomUUID(), action, ...addContext, payload: { party, ...(chosenType ? { definitionKey: chosenType.key } : { label: label.trim() }) } }
          if (subjectRequirementId) {
            const subject = subjectRows.find(row => row.id === subjectRequirementId)
            if (!subject) throw new Error('The selected person or entity changed. Choose who this requirement applies to again.')
            command.payload.subjectKind = subject.subject_id ? subject.subject_kind : 'person'
            command.payload.subjectId = subject.subject_id || subject.requested_from_contact_id
          }
        } else {
          if (!selected) throw new Error('Choose a requirement first.')
          command = { commandId: crypto.randomUUID(), action, contextType: selected.context_type, contextId: selected.context_id, requirementId: selected.id, expectedRevision: selected.command_revision }
          if (action === 'upload') {
            if (!file) throw new Error('Choose a file first.')
            setUploadProgress(createDocumentUploadProgress('preparing', '', { fileName: file.name }))
            command = await withDocumentUploadDeadline(() => prepareDocumentRequirementUpload(file, { ...command, actorId, replacesUploadId: selected.latest_upload_id || null }))
          } else {
            const changeReason = removalMode && action === 'remove' ? 'Not relevant to this matter' : reason.trim()
            if (!changeReason) throw new Error('Enter a reason for this change.')
            command.payload = { reason: changeReason }
          }
        }
      }
      if (accountAtStart !== accountRevision.current) throw new Error('Your account changed. Refresh before saving.')
      retainRequirementCommand(window.localStorage, key, command)
      setPending(command)
      const result = command.action === 'upload'
        ? await uploadDocumentRequirementFile(client, command, file, { onProgress: progress => { if (alive.current && accountAtStart === accountRevision.current) setUploadProgress(progress) } })
        : await executeDocumentRequirementCommand(client, command)
      clearRequirementCommand(window.localStorage, key, command)
      if (!alive.current || accountAtStart !== accountRevision.current) return
      setPending(null)
      if (command.action === 'upload') setUploadProgress(createDocumentUploadProgress('complete', 'Uploaded', { fileName: command.payload.fileName, documentId: result.uploadId }))
      setSnapshot(current => current ? {
        ...current,
        requirements: (current.requirements || []).some(row => row.id === result.requirement.id)
          ? current.requirements.map(row => row.id === result.requirement.id ? { ...row, ...result.requirement } : row)
          : [...(current.requirements || []), result.requirement],
      } : current)
      setLabel(''); setTypeChoice('')
      setReason('')
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      setSelectedId(result.requirement.id)
      if (presentation === 'dialog' && command.action === 'add') setUploadStep(intent === 'upload')
      setNotice(command.action === 'upload' ? 'Uploaded. Linked views are updating.' : 'Document change saved. Linked workspaces will refresh. Existing files and review history are retained.')
      void refreshRef.current?.()
      if (removalMode && command.action === 'remove') onClose?.()
    } catch (failure) {
      if (command?.action === 'upload' && alive.current && accountAtStart === accountRevision.current) setUploadProgress(createDocumentUploadProgress('failed', failure.message, { fileName: command.payload?.fileName }))
      if (command && key && isDefiniteUploadSaveRejection(failure)) {
        clearRequirementCommand(window.localStorage, key, command)
        if (alive.current && accountAtStart === accountRevision.current) { setPending(null); await refreshRef.current?.() }
      }
      if (alive.current && accountAtStart === accountRevision.current) setError(failure.code === '40001' ? 'This requirement changed while you were working. Review the refreshed details and try again.' : failure.message || 'The document change could not be confirmed. Retry the unfinished change.')
    } finally {
      lock.current = false
      if (alive.current) setBusy(false)
      if (alive.current && accountAtStart !== accountRevision.current) void refreshRef.current?.()
    }
  }

  const content = <div className="space-y-4" data-testid="document-requirement-manager">
      <p className="text-sm text-slate-600">{presentation === 'dialog' ? `Name the document, then request it from the ${party} or continue to upload a file. Documents stay in sync across linked workspaces.` : 'Changes apply across linked workspaces for this matter. Removing a requirement keeps its files and history. New requirements queue a secure portal email. Delivery waits for an active portal and a matching recipient.'}</p>

      {error ? <div className="space-y-2"><p role="alert" className="text-sm text-red-700">{error}</p>{!snapshot ? <button type="button" disabled={busy} className={buttonClass} onClick={() => void refreshRef.current?.()}>Refresh requirements</button> : null}</div> : null}
      {notice ? <p role="status" className="text-sm text-green-800">{notice}</p> : null}
      <DocumentUploadProgress progress={uploadProgress} />
      {busy && !uploadProgress ? <p role="status">Saving document change…</p> : null}
      {!snapshot && !error ? <p role="status">Loading requirements…</p> : null}
      {pending && !busy ? <div className="space-y-2 rounded-lg bg-amber-50 p-3" role="status">
        <p>An unfinished {pending.action === 'upload' ? 'upload' : 'document change'} needs recovery before another change can be made.</p>
        <p className="text-sm">{({ add: 'Add', remove: 'Remove', restore: 'Restore', upload: 'Upload' })[pending.action]}: {pending.payload.label || catalogue.rows.find(row => row.key === pending.payload.definitionKey)?.display_label || pending.payload.definitionKey || pending.payload.fileName || labelOf(rows.find(row => row.id === pending.requirementId) || {})}{pending.payload.reason ? ` — ${pending.payload.reason}` : ''}</p>
        {pending.action === 'upload' ? <label className="block text-sm">Original file: {pending.payload.fileName}<input type="file" accept={DOCUMENT_UPLOAD_ACCEPT} disabled={busy} onChange={event => setFile(event.target.files?.[0] || null)} className={inputClass} /></label> : null}
        <button type="button" className={buttonClass} disabled={busy || !actorId} onClick={() => void save(pending.action, true)}>Retry unfinished change</button>
      </div> : null}
      {!(presentation === 'dialog' && uploadStep) ? <form onSubmit={event => { event.preventDefault(); void save('add') }} className="space-y-3 border-t border-slate-200 pt-4">
        <label className="block text-sm font-medium">New document name<input autoFocus={presentation === 'dialog'} value={label} onChange={event => { setLabel(event.target.value); setTypeChoice('') }} maxLength={200} required disabled={disabled} placeholder="e.g. Divorce papers or SARS correspondence" className={inputClass} /></label>
        {!fixedParty ? <label className="block text-sm">Requested from<select value={party} onChange={event => { setParty(event.target.value); setSubjectRequirementId(''); setTypeChoice(''); setCatalogue({ rows: [], loading: true, error: false }) }} disabled={disabled} className={inputClass}><option value="seller">Seller</option><option value="buyer">Buyer</option></select></label> : null}
        {label.trim() ? <fieldset disabled={disabled} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <legend className="px-1 text-sm font-medium">Choose a document type</legend>
          {catalogue.loading ? <p role="status" className="text-sm">Loading existing document types…</p>
            : catalogue.error ? <p role="status" className="text-sm">Existing types could not be loaded. You can still create a custom document.</p>
              : !matches.length ? <p className="text-sm">No matching existing types.</p> : null}
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {matches.map(type => <label key={type.key} className="flex cursor-pointer gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm">
              <input type="radio" name="document-type-choice" value={type.key} checked={typeChoice === type.key} onChange={() => setTypeChoice(type.key)} />
              <span>{type.display_label}{type.description ? <span className="block text-xs text-slate-500">{type.description}</span> : null}</span>
            </label>)}
          </div>
          <label className="flex cursor-pointer gap-2 text-sm"><input type="radio" name="document-type-choice" value="custom" checked={typeChoice === 'custom'} onChange={() => setTypeChoice('custom')} />Create a custom document: “{label.trim()}”</label>
          <p className="text-xs text-slate-500">Choose a matching type to keep its standard name. Custom names apply only to this matter.</p>
        </fieldset> : null}
        {subjectRows.length ? <label className="block text-sm">Applies to<select value={subjectRequirementId} onChange={event => setSubjectRequirementId(event.target.value)} disabled={disabled} className={inputClass}>
          <option value="">{party === 'buyer' ? 'Buyer' : 'Seller'} party</option>
          {subjectRows.map((row, index) => <option key={row.id} value={row.id}>Same {row.subject_kind === 'party' || !row.subject_kind ? 'person' : row.subject_kind} as {labelOf(row)} · #{index + 1}</option>)}
        </select></label> : null}
        {!addContext && snapshot ? <p className="text-sm">This record is linked to multiple transactions. Open the relevant transaction to add a requirement.</p> : null}
        {duplicates.length ? <div role="status" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm">This document already has a requirement for the same party, person or entity in this matter.</p>
          {duplicates.map((row, index) => <div key={row.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span>{labelOf(row)} · {row.applicability_override === 'removed' ? 'Removed' : row.status?.replaceAll('_', ' ')}{duplicates.length > 1 ? ` · #${index + 1}` : ''}</span>
            <button type="button" disabled={disabled} className={buttonClass} onClick={() => {
              setSelectedId(row.id); setFile(null); setReason(''); if (presentation === 'dialog') setUploadStep(true)
              if (fileInput.current) fileInput.current.value = ''
              existingControls.current?.focus()
            }}>{row.applicability_override === 'removed' ? 'Review and restore request' : row.latest_upload_id || row.satisfied_by_document_id ? 'View or replace uploaded file' : 'Upload to this request'}</button>
          </div>)}
          <p className="text-xs">Use the existing request to keep its history. No new request email will be queued.</p>
        </div> : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={disabled || !addContext || !label.trim() || !validChoice || duplicates.length > 0} className={buttonClass}>{presentation === 'dialog' ? 'Request document' : 'Add requirement'}</button>
          {presentation === 'dialog' ? <button type="button" disabled={disabled || !addContext || !label.trim() || !validChoice || duplicates.length > 0} className="rounded-lg bg-[#176842] px-4 py-2 text-sm font-semibold text-white hover:bg-[#125535] disabled:opacity-50" onClick={() => void save('add', false, 'upload')}>Continue to upload</button> : null}
        </div>
        {presentation === 'dialog' ? <p className="text-xs leading-5 text-slate-500">Creating a document queues a secure {party} portal email. Uploading its file cancels any request email still waiting to send. Delivery requires an active portal and matching recipient.</p> : null}

      </form> : <div className="flex items-center justify-between gap-3"><h4 className="font-semibold text-slate-800">Upload {selected ? labelOf(selected) : 'document'}</h4><button type="button" disabled={disabled} className={buttonClass} onClick={() => setUploadStep(false)}>Back to new document</button></div>}
      {presentation === 'dialog' && !uploadStep ? <details className="border-t border-slate-200 pt-4"><summary className="cursor-pointer text-sm font-medium text-slate-600">Manage an existing document</summary><div className="mt-3">{existingForm()}</div></details> : existingForm()}
    </div>

  function existingForm() {
    return <div ref={existingControls} tabIndex={-1} aria-label="Manage existing requirement" className="space-y-3 border-t border-slate-200 pt-4">
        <label className="block text-sm font-medium">Existing requirement<select value={selectedId} onChange={event => { setSelectedId(event.target.value); setFile(null); setReason('') }} disabled={disabled} className={inputClass}>
          <option value="">Choose a requirement</option>
          {rows.map((row, index) => <option key={row.id} value={row.id}>{labelOf(row)} · {row.requested_from_role} · {row.applicability_override === 'removed' ? 'Removed' : row.status?.replaceAll('_', ' ')} · #{index + 1}</option>)}
        </select></label>
        {selected ? <>
          <p className="text-sm text-slate-600">{labelOf(selected)} · {removed ? 'Removed' : selected.status?.replaceAll('_', ' ')}</p>
          {selected.request_delivery ? <p className="text-sm text-slate-600">Request email: {selected.request_delivery.providerAccepted ? 'Accepted by email provider' : selected.request_delivery.status.replaceAll('_', ' ')}{selected.request_delivery.lastError ? ` · ${selected.request_delivery.lastError}` : ''}</p> : null}
          {removed && selected.override_reason ? <p className="text-sm text-slate-600">Removal reason: {selected.override_reason}</p> : null}
          {!removed && selected.status !== 'not_applicable' ? <>
            <label className="block text-sm">{selected.latest_upload_id || selected.satisfied_by_document_id ? 'Replacement file' : 'Upload file'}<input key={selected.id} ref={fileInput} type="file" accept={DOCUMENT_UPLOAD_ACCEPT} disabled={disabled} onChange={event => setFile(event.target.files?.[0] || null)} className={inputClass} /></label>
            <p className="text-xs text-slate-500">{DOCUMENT_UPLOAD_HELP_TEXT}</p>
            <button type="button" disabled={disabled || !file} className={buttonClass} onClick={() => void save('upload')}>{selected.latest_upload_id || selected.satisfied_by_document_id ? 'Replace file' : 'Upload file'}</button>
          </> : null}
          <details className="rounded-lg border border-slate-200 p-3" open={removed || presentation !== 'dialog'}><summary className="cursor-pointer text-sm font-medium text-slate-600">{removed ? 'Restore document' : 'Remove document requirement'}</summary><div className="mt-3 space-y-3">
          <label className="block text-sm">Reason for {removed ? 'restoring' : 'removing'} this requirement<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} disabled={disabled} className={inputClass} /></label>
          <button type="button" disabled={disabled || !reason.trim()} className={buttonClass} onClick={() => void save(removed ? 'restore' : 'remove')}>{removed ? 'Restore requirement' : 'Remove requirement'}</button>
          </div></details>
        </> : null}
      </div>
  }

  if (removalMode) return <Modal open={open} onClose={() => { if (!busy) onClose?.() }} title="Mark document as not relevant" subtitle={documentLabel || (selected ? labelOf(selected) : 'Listing document')} className="max-w-lg">
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">Remove this requirement from this workspace and linked workspaces for this matter. Uploaded files and review history are kept. You can restore it later from Manage an existing document.</p>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {!snapshot && !error ? <p role="status" className="text-sm text-slate-500">Loading document details…</p> : null}
      {snapshot && !selected ? <p role="alert" className="text-sm text-amber-800">This document does not have a shared checklist link yet. It needs to be linked before it can be marked as not relevant.</p> : null}
      {pending ? <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm"><p>An unfinished document change needs recovery first. Open Manage an existing document to recover it, or retry this removal below.</p>{pending.action === 'remove' && pending.requirementId === initialRequirementId ? <button type="button" className={buttonClass} disabled={busy} onClick={() => void save('remove', true)}>Retry removal</button> : null}</div> : null}
      <div className="flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={onClose} className={buttonClass}>Cancel</button>
        <button type="button" disabled={disabled || !selected || removed} onClick={() => void save('remove')} className="rounded-lg bg-[#963d35] px-4 py-2 text-sm font-semibold text-white hover:bg-[#7e302a] disabled:opacity-50">{busy ? 'Removing…' : 'Mark as not relevant'}</button>
      </div>
    </div>
  </Modal>

  if (presentation === 'dialog') return <Modal open={open} onClose={() => { if (!busy) onClose?.() }} title="Upload/Request New Document" subtitle={party === 'buyer' ? 'Buyer documents' : 'Seller documents'} className="max-w-xl">{content}</Modal>

  return <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-800">Manage document requirements{busy ? ' · Saving…' : pending ? ' · Unfinished change' : ''}</summary><div className="mt-4">{content}</div></details>
}
