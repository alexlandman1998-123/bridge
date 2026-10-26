import { createElement, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Mail, PenLine, UserRound } from 'lucide-react'
import Button from '../ui/Button.jsx'
import TransactionSellerCapturePanel from './TransactionSellerCapturePanel.jsx'
import { loadTransactionSellerWorkspace, saveTransactionSellerWorkspace } from '../../services/transactionSellerWorkspaceService.js'

export default function TransactionSellerOnboardingPanel({ transactionId, canEdit = false, onSaved, onSendLink, onEditBond }) {
  const [mode, setMode] = useState('choice')
  const [context, setContext] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const generation = useRef(0)
  const inFlight = useRef(false)
  const pending = useRef(null)
  useEffect(() => {
    generation.current += 1; inFlight.current = false; pending.current = null
    setMode('choice'); setBusy(false); setContext(null); setError(''); setMessage('')
    return () => { generation.current += 1 }
  }, [transactionId])
  async function review() {
    if (inFlight.current) return
    const current = generation.current
    inFlight.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const saved = await loadTransactionSellerWorkspace({ transactionId })
      if (current !== generation.current) return
      if (!saved.details?.email?.trim()) throw new Error('Capture the primary seller email manually before sending their onboarding link.')
      setContext(saved); setMode('review'); pending.current = {mutationId: crypto.randomUUID()}
    } catch (failure) { if (current === generation.current) setError(failure.message) }
    finally { if (current === generation.current) { inFlight.current = false; setBusy(false) } }
  }
  async function send() {
    if (inFlight.current || !context || !onSendLink) return
    const current = generation.current
    inFlight.current = true; setBusy(true); setError('')
    try {
      const latest = await loadTransactionSellerWorkspace({transactionId})
      if (current !== generation.current) return
      if (JSON.stringify(latest.revision) !== JSON.stringify(context.revision)) throw new Error('Seller details changed. Review the latest recipient before sending.')
      await onSendLink({context,mutationId:pending.current.mutationId})
      if (current !== generation.current) return
      setMode('choice'); setContext(null); pending.current = null; setMessage(`Seller onboarding link sent to ${context.details.email}.`)
    } catch (failure) { if (current === generation.current) setError(failure.message) }
    finally { if (current === generation.current) { inFlight.current = false; setBusy(false) } }
  }
  return <section className="space-y-5">
    {mode === 'choice' ? <>
      <header className="flex items-start gap-3"><span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-800"><UserRound size={21} aria-hidden="true" /></span><div><h3 className="text-section-title font-semibold text-textStrong">Seller onboarding</h3><p className="mt-1 text-sm text-textMuted">Capture seller details manually, or ask the seller to complete them.</p></div></header>
      <div className="grid gap-3 sm:grid-cols-2">{[
        ['manual',PenLine,'Capture manually','Capture ownership, people and contact details.'],
        ['link',Mail,'Send onboarding link','Let the seller complete their details securely.'],
      ].map(([key,icon,title,description])=><button key={key} type="button" disabled={!canEdit || busy || (key==='link' && !onSendLink)} onClick={()=>key==='manual'?(setMode('manual'),setError(''),setMessage('')):void review()} className="group flex items-start gap-3 rounded-xl border border-borderDefault bg-surface p-5 text-left transition hover:border-emerald-700 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><span className="rounded-xl bg-surfaceAlt p-2.5 text-emerald-800 group-hover:bg-white">{createElement(icon,{size:21,'aria-hidden':true})}</span><span><span className="block font-semibold text-textStrong">{title}</span><span className="mt-1 block text-sm leading-5 text-textMuted">{description}</span></span></button>)}</div>
    </> : null}
    {mode === 'manual' ? <TransactionSellerCapturePanel key={transactionId} transactionId={transactionId} canEdit={canEdit} loadCapture={loadTransactionSellerWorkspace} saveCapture={saveTransactionSellerWorkspace} onEditBond={onEditBond} onSaved={onSaved} onBack={()=>setMode('choice')} /> : null}
    {mode === 'review' && context ? <div className="space-y-4"><h3 className="text-section-title font-semibold text-textStrong">Confirm seller recipient</h3><div className="rounded-xl border border-borderSoft bg-surfaceAlt p-5"><p className="font-semibold text-textStrong">{context.details.name || 'Seller'}</p><p className="mt-1 break-all text-sm text-textMuted">{context.details.email}</p><p className="mt-3 text-sm text-textMuted">{context.authority==='listing'?'The link uses the same seller profile as the linked listing.':'The link uses the seller details saved on this transaction.'}</p></div><div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={()=>void send()}><Mail size={15} aria-hidden="true" />{busy?'Sending…':'Send link'}</Button><Button type="button" variant="secondary" disabled={busy} onClick={()=>{setMode('choice');setContext(null);setError('')}}><ArrowLeft size={14} aria-hidden="true" />Back</Button></div></div> : null}
    {error ? <p role="alert" className="rounded-control bg-dangerSoft px-4 py-3 text-sm text-danger">{error}</p> : null}
    {message ? <p role="status" className="text-sm text-success">{message}</p> : null}
  </section>
}
