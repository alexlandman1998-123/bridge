import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Clipboard, Sparkles, Undo2 } from 'lucide-react'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { crmFollowUpAction } from '../../services/crmFollowUpAiService'
import { crmFollowUpManualDraft } from '../../services/crmFollowUpAiModel'

const formatDate = (value) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium' }).format(new Date(value)) : 'Not recorded'

export default function CrmFollowUpAssistant({ organisationId, leadId, updatedAt, onPrepareFollowUp }) {
  const [brief, setBrief] = useState(null)
  const [draft, setDraft] = useState(crmFollowUpManualDraft())
  const [proposal, setProposal] = useState(null)
  const [undo, setUndo] = useState(null)
  const [language, setLanguage] = useState('en')
  const [tone, setTone] = useState('warm')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const current = useRef({ draft, updatedAt, language, tone })
  current.current = { draft, updatedAt, language, tone }
  const request = useRef(0), controller = useRef(null)
  useEffect(() => () => { request.current++; controller.current?.abort() }, [])
  useEffect(() => { request.current++; controller.current?.abort(); setBrief(null); setProposal(null); setUndo(null); setBusy('') }, [updatedAt])

  const sourceInput = () => ({ leadId, expectedUpdatedAt: brief.updatedAt, sourceFingerprint: brief.fingerprint })
  function begin(kind) {
    controller.current?.abort()
    controller.current = new AbortController()
    setBusy(kind); setError(''); setNotice('')
    return { sequence: ++request.current, signal: controller.current.signal }
  }
  async function loadBrief() {
    const { sequence, signal } = begin('brief')
    try {
      const result = await crmFollowUpAction(organisationId, 'brief', { leadId }, { signal })
      if (sequence !== request.current) return
      if (updatedAt && result.brief.updatedAt !== updatedAt) throw new Error('This lead changed elsewhere. Refresh the lead workspace before continuing.')
      setBrief(result.brief); setProposal(null); setUndo(null)
    } catch (failure) { if (sequence === request.current && failure.name !== 'AbortError') setError(failure.message) }
    finally { if (sequence === request.current) setBusy('') }
  }
  async function generate() {
    const original = JSON.stringify(current.current)
    const { sequence, signal } = begin('generate')
    try {
      const result = await crmFollowUpAction(organisationId, 'generate', { ...sourceInput(), requestId: crypto.randomUUID(), language, tone }, { signal })
      if (sequence !== request.current) return
      if (original !== JSON.stringify(current.current) || result.applicability !== 'current' || result.sourceFingerprint !== brief.fingerprint || result.updatedAt !== brief.updatedAt) throw new Error('Your draft or saved lead changed while AI was working. Your current wording is retained.')
      setProposal({ ...result.proposal, draftBefore: draft }); setUndo(null)
    } catch (failure) { if (sequence === request.current && failure.name !== 'AbortError') setError(failure.message) }
    finally { if (sequence === request.current) setBusy('') }
  }
  async function transferDraft(kind) {
    const original = JSON.stringify(current.current)
    const { sequence, signal } = begin(kind)
    try {
      await crmFollowUpAction(organisationId, 'check', sourceInput(), { signal })
      if (sequence !== request.current) return
      if (original !== JSON.stringify(current.current)) throw new Error('Your draft changed during the source check. Review it and try again.')
      if (kind === 'copy') {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable. Select and copy the editable outreach text manually.')
        await navigator.clipboard.writeText(draft)
        if (sequence === request.current) setNotice('Outreach copied. Check permission and your conversation before using it.')
      } else {
        onPrepareFollowUp?.({ title: 'Follow up on property enquiry', description: draft, leadId, updatedAt: brief.updatedAt })
        setNotice('Opened an editable follow-up draft. Choose the date and owner, then save it when ready.')
      }
    } catch (failure) { if (sequence === request.current && failure.name !== 'AbortError') setError(failure.message) }
    finally { if (sequence === request.current) setBusy('') }
  }
  const validProposal = proposal && proposal.draftBefore === draft
  return <section aria-label="Lead follow-up assistant" className="rounded-[22px] border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/60 p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600"><Sparkles className="h-4 w-4" /> Follow-up studio</p><h3 className="mt-1 text-lg font-semibold text-slate-900">A considered next conversation</h3><p className="mt-1 max-w-2xl text-sm text-slate-600">Review saved activity, shape an outreach draft and decide the next step.</p></div>
      <Button type="button" variant="secondary" size="sm" disabled={!!busy} onClick={loadBrief}>{brief ? 'Refresh saved brief' : 'Load saved brief'}</Button>
    </div>
    {brief && <div className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">{[[`${brief.openTaskCount} open tasks`, `${brief.overdueTaskCount} overdue`], [`${brief.activityCount} recorded activities`, `Latest: ${formatDate(brief.lastActivityAt)} (SAST)`], ['Saved lead', `${brief.facts.category} · ${brief.facts.stage}`]].map(([title, detail]) => <div key={title} className="rounded-xl border border-indigo-100 bg-white/80 p-3"><p className="text-sm font-semibold text-slate-800">{title}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>)}</div>
      <p className="text-sm font-medium text-slate-700">{brief.nextAction}</p>
      {!!brief.pendingTasks.length && <ul className="flex flex-wrap gap-2 text-xs text-slate-600">{brief.pendingTasks.map((task) => <li key={task.id} className="rounded-full border border-slate-200 bg-white px-3 py-1">{task.dueDate ? `Due ${formatDate(task.dueDate)}${task.overdue ? ' · overdue' : ''}` : 'Follow-up date not set'}</li>)}</ul>}
      <p className="text-xs text-slate-500">Area: {brief.facts.area || 'Not specified'} · Saved lead updated {formatDate(brief.updatedAt)} (SAST)</p>
      <a className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 underline" href={brief.sourcePath} target="_blank" rel="noreferrer">View saved activity and tasks <ArrowUpRight className="h-3 w-3" /></a>
      <p className="text-xs leading-relaxed text-slate-500">{brief.boundary}</p>
    </div>}
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium text-slate-600">Language<Field as="select" aria-label="Follow-up language" className="mt-1" value={language} onChange={(event) => { setLanguage(event.target.value); setProposal(null) }}><option value="en">English</option><option value="af">Afrikaans</option></Field></label>
      <label className="text-xs font-medium text-slate-600">Tone<Field as="select" aria-label="Follow-up tone" className="mt-1" value={tone} onChange={(event) => { setTone(event.target.value); setProposal(null) }}><option value="warm">Warm</option><option value="professional">Professional</option><option value="concise">Concise</option></Field></label>
      <Button type="button" variant="secondary" disabled={!brief || !!busy} onClick={generate}><Sparkles className="h-4 w-4" /> Generate outreach proposal</Button>
    </div>
    <p className="mt-2 text-xs leading-relaxed text-slate-500">AI receives category, stage, area and counts only. Names, contact details, notes and documents stay out of the model. Generation uses your agency’s configured AI budget.</p>
    {validProposal && <div className="mt-4 rounded-xl border border-indigo-200 bg-white p-4"><p className="text-sm font-semibold text-slate-800">Proposed wording</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{proposal.outreach}</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" onClick={() => { setUndo({ before: draft, applied: proposal.outreach }); setDraft(proposal.outreach); setProposal(null) }}>Apply to outreach draft</Button><Button type="button" variant="ghost" size="sm" onClick={() => setProposal(null)}>Keep my wording</Button></div></div>}
    <label className="mt-4 block text-sm font-medium text-slate-700">Editable outreach draft<Field as="textarea" aria-label="Editable outreach draft" className="mt-2 min-h-[130px] bg-white" maxLength={4000} value={draft} onChange={(event) => { setDraft(event.target.value); setProposal(null); setUndo(null) }} /></label>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" variant="secondary" disabled={!brief || !!busy || !draft.trim()} onClick={() => transferDraft('copy')}><Clipboard className="h-4 w-4" /> Copy outreach</Button>
      {onPrepareFollowUp && <Button type="button" variant="secondary" disabled={!brief || !!busy || !draft.trim()} onClick={() => transferDraft('task')}>Open follow-up task draft</Button>}
      {undo && undo.applied === draft && <Button type="button" variant="ghost" onClick={() => { setDraft(undo.before); setUndo(null) }}><Undo2 className="h-4 w-4" /> Undo AI wording</Button>}
      {busy && <Button type="button" variant="ghost" onClick={() => { request.current++; controller.current?.abort(); setBusy(''); setNotice('Stopped waiting. Check agency usage before generating again.') }}>Stop waiting</Button>}
    </div>
    <p className="mt-2 text-xs text-slate-500">Nothing is sent or saved by this assistant. The existing task editor keeps its own review and Save action.</p>
    {busy && <p role="status" className="mt-3 text-sm text-indigo-700">{busy === 'generate' ? 'Preparing your proposal…' : 'Checking saved CRM facts…'}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-indigo-700">{notice}</p>}
  </section>
}
