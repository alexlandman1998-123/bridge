import { AlertCircle, ArrowLeft, CheckCircle2, FileText, LockKeyhole, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchBondApplicationPortalDocumentContinuity, fetchBondApplicationPortalDraft, fetchBondApplicationPortalProjection, fetchClientPortalNormalizedBondApplication, saveBondApplicationPortalDraft } from '../lib/clientPortalApi'
import { getGuidedBondApplicationMetadataFromState, buildGuidedBondApplicationProgress } from '../modules/bond/application/guided/phase2GuidedFlow'
import GuidedBondApplication from '../modules/bond/application/guided/GuidedBondApplication'

function text(value = '') {
  return String(value || '').trim()
}

function applicantName(applicationState = {}) {
  const applicant = applicationState?.participants?.primaryApplicant || {}
  return [applicant?.personal?.first_name, applicant?.personal?.surname].map(text).filter(Boolean).join(' ') || 'Your application'
}

function propertyLabel(applicationState = {}) {
  const property = applicationState?.application?.property || {}
  return text(property?.developmentName || property?.propertyReference || property?.unitLabel || 'Property details are being prepared')
}

function statusLabel(applicationState = {}) {
  return text(applicationState?.meta?.status || applicationState?.legacySubmission?.status || 'In progress')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function StepList({ progress }) {
  const activeOrder = progress.currentStep?.order || 1
  return (
    <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Application progress">
      {(progress.steps || []).map((step) => {
        const complete = step.order < activeOrder
        const current = step.order === activeOrder
        return (
          <li key={step.key} className={`rounded-2xl border p-4 ${current ? 'border-slate-900 bg-slate-900 text-white' : complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em]">{step.order}</span>
              {complete ? <CheckCircle2 size={17} /> : null}
            </div>
            <strong className="mt-3 block text-sm">{step.label}</strong>
          </li>
        )
      })}
    </ol>
  )
}

export default function BondApplicationPortal() {
  const { token = '', accessToken = '' } = useParams()
  const usesApplicationAccessToken = Boolean(accessToken)
  const activeToken = accessToken || token
  const [state, setState] = useState({ status: 'loading', result: null, error: '' })

  async function load() {
    try {
      setState({ status: 'loading', result: null, error: '' })
      const result = usesApplicationAccessToken
        ? (() => Promise.all([fetchBondApplicationPortalProjection({ accessToken }), fetchBondApplicationPortalDraft({ accessToken }), fetchBondApplicationPortalDocumentContinuity({ accessToken })]).then(([projection, draftContext, documentContinuity]) => ({ ...projection, draftContext, documentContinuity })))()
        : await fetchClientPortalNormalizedBondApplication({ token })
      setState({ status: 'ready', result, error: '' })
    } catch (error) {
      setState({ status: 'error', result: null, error: error?.message || 'We could not load this bond application.' })
    }
  }

  useEffect(() => { void load() }, [accessToken, token])

  const applicationState = state.result?.participantContext || (usesApplicationAccessToken ? {
    meta: { status: state.result?.application?.status },
    application: { property: { propertyReference: 'Your property details are protected in this application.' } },
  } : {})
  const metadata = useMemo(() => getGuidedBondApplicationMetadataFromState(applicationState), [applicationState])
  const progress = useMemo(() => {
    return buildGuidedBondApplicationProgress(metadata?.current_screen_key, metadata?.completed_screen_keys || [])
  }, [metadata])

  // The standalone route owns guided draft editing. Document actions,
  // submissions, and reminders move in later phases.
  const steps = ['Your application', 'Your finances', 'Your documents', 'Review & sign'].map((label, index) => ({ key: label, label, order: index + 1 }))
  const visibleProgress = { ...progress, steps }
  const returnPath = `/client/${encodeURIComponent(token)}`
  const hasApplication = Boolean(state.result?.normalizedApplication || state.result?.application)
  const phase3Portal = useMemo(() => ({ onboardingFormData: { formData: { bond_application: state.result?.draftContext?.draft || {} } } }), [state.result?.draftContext?.draft])
  const savePhase3Draft = async ({ formData = {} } = {}) => {
    const saved = await saveBondApplicationPortalDraft({
      accessToken,
      draft: formData.bond_application || {},
      expectedRevision: state.result?.draftContext?.revision,
    })
    setState((previous) => previous.result ? { ...previous, result: { ...previous.result, draftContext: { ...previous.result.draftContext, revision: saved.revision, draft: formData.bond_application || {} } } } : previous)
    return saved
  }

  return (
    <main data-bond-application-portal="phase1-shell" className="min-h-screen bg-slate-50 px-4 py-7 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          {usesApplicationAccessToken ? <span className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700"><ArrowLeft size={17} /> Bond application</span> : <Link to={returnPath} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-700 hover:bg-white"><ArrowLeft size={17} /> Buyer portal</Link>}
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"><LockKeyhole size={14} /> Secure application access</span>
        </header>

        {state.status === 'loading' ? <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"><RefreshCw className="animate-spin text-slate-500" size={22} /><p className="mt-4 text-sm text-slate-600">Loading your bond application…</p></section> : null}

        {state.status === 'error' ? <section role="alert" className="mt-10 rounded-3xl border border-red-200 bg-white p-8 shadow-sm"><AlertCircle className="text-red-600" size={24} /><h1 className="mt-4 text-xl font-semibold">We could not open this application</h1><p className="mt-2 text-sm leading-6 text-slate-600">{state.error}</p><button type="button" onClick={() => void load()} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"><RefreshCw size={16} /> Try again</button></section> : null}

        {state.status === 'ready' ? (
          <>
            <section className="mt-8 rounded-3xl bg-slate-900 p-7 text-white shadow-xl sm:p-10">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Bond application</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{applicantName(applicationState)}</h1>
              <p className="mt-3 text-sm text-slate-300">{propertyLabel(applicationState)}</p>
              <div className="mt-7 flex flex-wrap items-center gap-3"><span className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold">{statusLabel(applicationState)}</span><span className="text-sm text-slate-300">Phase 1: secure application overview</span></div>
            </section>

            {hasApplication ? (
              <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="flex items-start gap-3"><FileText className="mt-0.5 text-slate-700" size={21} /><div><h2 className="text-xl font-semibold">Application progress</h2><p className="mt-1 text-sm leading-6 text-slate-600">This dedicated space will become the place to complete your application. Editing and document actions are being moved here safely.</p></div></div>
                <StepList progress={visibleProgress} />
                {usesApplicationAccessToken && state.result?.progress ? <p className="mt-5 text-sm text-slate-600">{state.result.progress.documents?.outstanding || 0} document item(s) outstanding · {state.result.progress.participants?.pending || 0} participant action(s) pending</p> : null}
                {usesApplicationAccessToken && state.result?.documentContinuity?.summary ? <p className="mt-2 text-sm text-slate-600">{state.result.documentContinuity.summary.linked || 0} document item(s) securely linked across your application and transaction file.</p> : null}
              </section>
            ) : (
              <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6"><h2 className="text-lg font-semibold text-amber-950">Your application is being prepared</h2><p className="mt-2 text-sm leading-6 text-amber-900">Your finance team will let you know as soon as the guided application is ready to complete here.</p></section>
            )}
            {usesApplicationAccessToken && hasApplication ? <section className="mt-6"><GuidedBondApplication portal={phase3Portal} token={activeToken} saveClientPortalOnboardingDraft={savePhase3Draft} onBackToPortal={() => window.scrollTo({ top: 0, behavior: 'smooth' })} onSaveAndExit={() => window.scrollTo({ top: 0, behavior: 'smooth' })} /></section> : null}
          </>
        ) : null}
      </div>
    </main>
  )
}
