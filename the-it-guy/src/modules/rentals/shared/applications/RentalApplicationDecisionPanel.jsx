import { useEffect, useMemo, useState } from 'react'
import { decideRentalApplication, listRentalApplicationDecisions, listRentalApplicationNotifications, listRentalApplicationScreeningChecks, retryRentalApplicationNotification } from '../../../../services/rentals/rentalApplicationRepository.js'

const FINAL = new Set(['approved', 'declined', 'withdrawn'])
const REQUIRED_DOCUMENT_TYPES = ['identity', 'proof_of_income']
const REQUIRED_CONSENT_TYPES = ['privacy', 'credit_check', 'identity_verification']
const REQUIRED_SCREENING_CHECKS = ['identity', 'fica', 'affordability', 'employment', 'reference']
const title = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export default function RentalApplicationDecisionPanel({ application, onDecision }) {
  const [decision, setDecision] = useState('approved')
  const [reason, setReason] = useState('')
  const [decisions, setDecisions] = useState([])
  const [notifications, setNotifications] = useState([])
  const [screeningChecks, setScreeningChecks] = useState([])
  const [readinessLoaded, setReadinessLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    if (!application?.id) return
    try {
      setReadinessLoaded(false)
      const [nextDecisions, nextNotifications, nextChecks] = await Promise.all([listRentalApplicationDecisions(application.id), listRentalApplicationNotifications(application.id), listRentalApplicationScreeningChecks(application.id)])
      setDecisions(nextDecisions)
      setNotifications(nextNotifications)
      setScreeningChecks(nextChecks)
      setReadinessLoaded(true)
    } catch (cause) { setError(cause.message) }
  }

  useEffect(() => { setReason(''); setError(''); void load() }, [application?.id])

  const readiness = useMemo(() => {
    const documentsByType = new Map((application?.documents || []).map((item) => [item.type, item]))
    const consentTypes = new Set((application?.consents || []).map((item) => item.type))
    const checksByType = new Map(screeningChecks.map((item) => [item.checkType, item]))
    const missingDocuments = REQUIRED_DOCUMENT_TYPES.filter((type) => !['uploaded', 'accepted'].includes(documentsByType.get(type)?.status))
    const missingConsents = REQUIRED_CONSENT_TYPES.filter((type) => !consentTypes.has(type))
    const incompleteChecks = REQUIRED_SCREENING_CHECKS.filter((type) => checksByType.get(type)?.status !== 'passed')
    return { missingDocuments, missingConsents, incompleteChecks }
  }, [application?.consents, application?.documents, screeningChecks])
  const approvalBlockers = [
    !readinessLoaded ? 'Review readiness is still loading.' : '',
    readiness.missingDocuments.length ? `Required documents: ${readiness.missingDocuments.map(title).join(', ')}.` : '',
    readiness.missingConsents.length ? `Required consents: ${readiness.missingConsents.map(title).join(', ')}.` : '',
    readiness.incompleteChecks.length ? `Screening checks not passed: ${readiness.incompleteChecks.map(title).join(', ')}.` : '',
  ].filter(Boolean)
  const approvalBlocked = decision === 'approved' && approvalBlockers.length > 0

  const decide = async (event) => {
    event.preventDefault()
    if (approvalBlocked || !window.confirm(`Confirm ${decision} decision? This is final and cannot be changed.`)) return
    try {
      setSaving(true); setError('')
      await decideRentalApplication({ applicationId: application.id, expectedVersion: application.version, decision, reason, evidence: { source: 'rental_application_review', reviewed_documents: REQUIRED_DOCUMENT_TYPES.filter((type) => !readiness.missingDocuments.includes(type)), reviewed_consents: REQUIRED_CONSENT_TYPES.filter((type) => !readiness.missingConsents.includes(type)), passed_screening_checks: REQUIRED_SCREENING_CHECKS.filter((type) => !readiness.incompleteChecks.includes(type)) } })
      await onDecision?.(); await load()
    } catch (cause) { setError(cause.message) } finally { setSaving(false) }
  }
  const retry = async (outboxId) => { try { setSaving(true); setError(''); await retryRentalApplicationNotification(outboxId); await load() } catch (cause) { setError(cause.message) } finally { setSaving(false) } }
  const final = FINAL.has(application?.status)

  return <section className="mt-5 border-t pt-5"><h3 className="font-semibold">Final decision</h3>{final ? <p className="mt-2 rounded-lg bg-slate-100 p-3 text-sm">This application is <b>{title(application.status)}</b>. Final decisions are locked.</p> : <form onSubmit={decide} className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-3"><p className="text-sm text-slate-600">A human reviewer must confirm the outcome. Screening results cannot make this decision automatically.</p><label className="text-sm font-medium">Outcome<select value={decision} onChange={(event) => setDecision(event.target.value)} className="mt-1 block w-full rounded border p-2"><option value="approved">Approve</option><option value="declined">Decline</option><option value="withdrawn">Withdraw</option></select></label>{decision === 'approved' ? <div className={`rounded-lg border p-3 text-sm ${approvalBlockers.length ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}><p className="font-semibold">Approval readiness</p>{approvalBlockers.length ? <ul className="mt-1 list-disc space-y-1 pl-5">{approvalBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p className="mt-1">Required documents, consents, and screening checks are complete.</p>}</div> : <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">A decline or withdrawal can be recorded when the application is incomplete; record the reason below.</p>}<label className="text-sm font-medium">Reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 block min-h-20 w-full rounded border p-2" placeholder="Record the reviewed basis for this decision." /></label><button disabled={saving || !reason.trim() || approvalBlocked} className="w-fit rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : `Confirm ${title(decision)}`}</button></form>} {decisions.length ? <div className="mt-4"><h4 className="text-sm font-semibold">Decision audit</h4>{decisions.map((item) => <p key={item.id} className="mt-1 text-sm"><b>{title(item.decision)}</b> · {item.reason} · {new Date(item.decided_at).toLocaleString()}</p>)}</div> : null}{notifications.length ? <div className="mt-4"><h4 className="text-sm font-semibold">Outcome notification</h4>{notifications.map((item) => <div key={item.id} className="mt-1 flex items-center gap-2 text-sm"><span>{title(item.delivery_status)} · retry {item.retry_count}</span>{item.delivery_status === 'failed' ? <button type="button" disabled={saving} onClick={() => void retry(item.id)} className="rounded border px-2 py-1">Queue retry</button> : null}</div>)}</div> : null}{error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}</section>
}
