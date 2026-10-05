import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createBondOnlineSigningClient } from '../../../../services/bondOnlineSigningClient.js'
import BondOnlineSigningPanel from '../guided/BondOnlineSigningPanel.jsx'
import { buildBondApplicationDocumentPresentation } from '../exports/bondApplicationDocumentPresentation.js'
import GuidedBondApplication, { DocumentsChecklistScreen } from '../guided/GuidedBondApplication.jsx'
import { fetchBuyerBondApplicationRuntime, saveBuyerBondApplicationRuntimeDraft, reconcileBuyerBondApplicationRuntimeDocuments, uploadBuyerBondApplicationRuntimeDocument, submitBuyerBondApplicationRuntime, refreshBuyerBondApplicationRuntimeSubmission, cancelBuyerBondApplicationRuntimeSubmission, fetchBuyerBondWetInkSigning, prepareBuyerBondWetInkSigning } from '../../../../lib/clientPortalApi.js'
import BondWetInkSigningPanel, { JointWetInkSigningChoice } from '../guided/BondWetInkSigningPanel.jsx'
import { resolveBondApplicationDeclarations } from '../submission/index.js'
import { buildBuyerBondApplicationRuntimeState } from './bondApplicationRuntimeService.js'
import { resolveBondApplicationDocumentRequirements } from '../documents/index.js'
import { useBondApplicationDocuments } from '../guided/hooks/useBondApplicationDocuments.js'


function SubmittedApplicationDocuments({ context, credentials, refresh, onOpenDocument, onOpenDocuments }) {
  const applicationState = useMemo(() => buildBuyerBondApplicationRuntimeState(context), [context])
  const controller = useBondApplicationDocuments({
    applicationState,
    requiredDocuments: context.requiredDocuments,
    documents: context.documents,
    additionalRequirements: context.additionalRequirements,
    onUploadRequiredDocument: (key, file) => uploadBuyerBondApplicationRuntimeDocument({ ...credentials, requirementKey: key, file }),
    onRefreshDocuments: refresh,
  })
  return <div className="mt-6 border-t border-[#dbe5ef] pt-6"><DocumentsChecklistScreen documentsController={controller} onOpenDocument={onOpenDocument} onOpenDocuments={onOpenDocuments} /></div>
}

function BuyerBondApplicationRuntime({ token, accessToken, onOpenDocuments, onOpenDocument, onBackToPortal, onSaveAndExit, onLegacyHandoff, onInviteCoApplicant, participantModeEnabled = false }) {
  const [context, setContext] = useState(null)
  const [seed, setSeed] = useState(null)
  const [error, setError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const onlineClient = useMemo(() => createBondOnlineSigningClient({ token, accessToken }), [token, accessToken])
  const [onlineAvailability, setOnlineAvailability] = useState({ available: false })
  const [onlineEnvelope, setOnlineEnvelope] = useState(null)
  const [wetInk, setWetInk] = useState(null)
  const [editorGeneration, setEditorGeneration] = useState(0)
  const revision = useRef(null)
  const saveQueue = useRef(Promise.resolve())
  const credentials = { token, accessToken }
  const requestGeneration = useRef(0)
  const refresh = useCallback(async () => {
    const generation = requestGeneration.current
    const pending = saveQueue.current.catch(() => {}).then(async () => {
      const result = await fetchBuyerBondApplicationRuntime({ token, accessToken })
      if (generation !== requestGeneration.current) throw new Error('The application link changed. Reload the application.')
      revision.current = result.application.revision
      setContext(result)
      try { const signing = await fetchBuyerBondWetInkSigning({ token, accessToken }); if (generation === requestGeneration.current) setWetInk(signing) } catch { /* Existing online signing remains available before the migration is released. */ }
      setRefreshError('')
      return result
    })
    saveQueue.current = pending
    return pending
  }, [token, accessToken])

  useEffect(() => {
    const generation = ++requestGeneration.current
    fetchBuyerBondApplicationRuntime({ token, accessToken }).then((result) => {
      if (generation !== requestGeneration.current) return
      revision.current = result.application.revision
      setContext(result)
      // Keep a stable initial portal so document refreshes and saves cannot
      // reset the guided controller's in-flight edits or navigation.
      setSeed({ transaction: result.transaction, onboardingFormData: { formData: { bond_application: result.draft } } })
    }).catch((failure) => {
      if (generation === requestGeneration.current) setError(failure.message)
    })
    fetchBuyerBondWetInkSigning({ token, accessToken }).then((result) => { if (generation === requestGeneration.current) setWetInk(result) }).catch(() => {})
    return () => { requestGeneration.current = generation + 1 }
  }, [token, accessToken])

  useEffect(() => {
    let active = true
    onlineClient.availability().then(async (available) => {
      if (!active) return
      setOnlineAvailability(available)
      if (available.available) { const resumed = await onlineClient.resume(); if (active) setOnlineEnvelope(resumed) }
    }).catch(() => { if (active) setOnlineAvailability({ available: false }) })
    return () => { active = false }
  }, [onlineClient])

  // Only receipts auto-refresh: refreshing an editable draft must not discard
  // unsaved answers. Receipt refresh errors retain the last loaded documents.
  useEffect(() => {
    if (!['submitted', 'awaiting_signatures'].includes(context?.application.status)) return undefined
    const update = () => {
      if (document.visibilityState === 'hidden') return
      void refresh().catch((failure) => setRefreshError(failure.message))
    }
    const timer = window.setInterval(update, 30000)
    window.addEventListener('focus', update)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update) }
  }, [context?.application.status, refresh])

  function save({ formData }) {
    const generation = requestGeneration.current
    const pending = saveQueue.current.catch(() => {}).then(async () => {
      if (revision.current === null) throw new Error('Wait for the application to load before saving.')
      const result = await saveBuyerBondApplicationRuntimeDraft({ ...credentials, draft: formData.bond_application, expectedRevision: revision.current })
      if (generation !== requestGeneration.current) throw new Error('The application link changed. Reload the application.')
      revision.current = result.revision
      return result
    })
    saveQueue.current = pending
    return pending
  }
  async function reconcile({ requirements }) {
    const result = await reconcileBuyerBondApplicationRuntimeDocuments({ ...credentials, requirements })
    setContext(result)
    return result
  }
  async function prepare(values) {
    const latest = await refresh()
    await reconcile({ requirements: resolveBondApplicationDocumentRequirements({ applicationState: buildBuyerBondApplicationRuntimeState(latest) }).activeRequirements })
    const result = await submitBuyerBondApplicationRuntime({ ...credentials, ...values, expectedRevision: revision.current })
    await refresh()
    return result
  }
  async function prepareOnline() {
    await refresh()
    const result = await onlineClient.prepare({ expectedRevision: revision.current })
    setOnlineEnvelope(result)
    await refresh()
    return result
  }
  async function prepareWetInk(values) {
    const latest = await refresh()
    await reconcile({ requirements: resolveBondApplicationDocumentRequirements({ applicationState: buildBuyerBondApplicationRuntimeState(latest) }).activeRequirements })
    const result = await prepareBuyerBondWetInkSigning({ ...credentials, ...values, expectedRevision: revision.current })
    setWetInk(result)
    await refresh()
    return result
  }
  async function returnToEditor() {
    const latest = await refresh()
    setSeed({ transaction: latest.transaction, onboardingFormData: { formData: { bond_application: latest.draft } } })
    setEditorGeneration((current) => current + 1)
  }
  async function cancel(values) {
    const result = await cancelBuyerBondApplicationRuntimeSubmission({ ...credentials, ...values })
    await refresh()
    return result
  }

  if (error) return <section role="alert" className="rounded-2xl border border-red-200 bg-white p-5 text-sm text-red-800"><p>{error}</p><button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-11 rounded-xl border px-4 font-semibold">Reload application</button></section>
  if (!context || !seed) return <p role="status" className="rounded-2xl bg-white p-5 text-sm text-[#61748a]">Loading your application…</p>
  if (context.application.status === 'cancelled') return <section className="rounded-2xl border border-[#dbe5ef] bg-white p-5"><h2 className="text-lg font-semibold">This application has been cancelled</h2><p className="mt-2 text-sm leading-6 text-[#61748a]">Contact your finance team if you need to start a new application.</p></section>
  if (onlineEnvelope) return <BondOnlineSigningPanel availability={onlineAvailability} client={onlineClient} envelope={onlineEnvelope} presentation={buildBondApplicationDocumentPresentation(onlineEnvelope.review)} declarations={onlineEnvelope.declarations} onStateChanged={setOnlineEnvelope} />
  if (wetInk?.version && wetInk.version.status !== 'cancelled') return <>
    <BondWetInkSigningPanel key={wetInk.version.id} data={wetInk} credentials={credentials} onRefresh={refresh} onCancelled={returnToEditor} />
    {context.application.status === 'submitted' ? <SubmittedApplicationDocuments context={context} credentials={credentials} refresh={refresh} onOpenDocument={onOpenDocument} onOpenDocuments={onOpenDocuments} /> : null}
    {refreshError ? <p role="alert">{refreshError}</p> : null}
  </>
  if (['submitted', 'preparing_submission', 'awaiting_signatures'].includes(context.application.status)) {
    return <section className="rounded-2xl border border-[#dbe5ef] bg-white p-5"><h2 className="text-lg font-semibold">{context.application.status === 'submitted' ? 'Your application has been submitted' : 'Your application is with the finance team'}</h2><p className="mt-2 text-sm leading-6 text-[#61748a]">Your signed answers are protected from further editing. You can still provide supporting documents before your finance team submits to the banks.</p><button type="button" onClick={() => void refresh().catch((failure) => setRefreshError(failure.message))} className="mt-4 min-h-11 rounded-xl border px-4 text-sm font-semibold">Refresh status</button>{refreshError ? <p role="alert" className="mt-3 text-sm text-red-800">The latest status could not be loaded. {refreshError}</p> : null}{context.application.status === 'submitted' ? <SubmittedApplicationDocuments context={context} credentials={credentials} refresh={refresh} onOpenDocument={onOpenDocument} onOpenDocuments={onOpenDocuments} /> : null}</section>
  }
  // Joint and surety flows retain the existing participant workflow; a primary
  // applicant must never sign on behalf of another participant through this adapter.
  const state = buildBuyerBondApplicationRuntimeState(context)
  if (['joint', 'surety'].includes(state.application.applicantStructure)) return <section className="rounded-2xl border bg-white p-5 text-sm leading-6">This application requires a participant signing workflow. Continue through the buyer portal link supplied by your finance team.{token ? <button type="button" className="mt-4 block min-h-11 rounded-xl border px-4 font-semibold" onClick={onLegacyHandoff}>Continue participant application</button> : null}{state.application.applicantStructure === 'joint' ? <JointWetInkSigningChoice declarations={resolveBondApplicationDeclarations({ applicationState: state })} onPrepare={prepareWetInk} /> : null}{state.application.applicantStructure === 'joint' ? <BondOnlineSigningPanel availability={onlineAvailability} client={onlineClient} onPrepare={prepareOnline} /> : null}</section>
  return <GuidedBondApplication key={editorGeneration}
    onOpenDocuments={onOpenDocuments}
    onOpenDocument={onOpenDocument}
    portal={seed} token={accessToken || token} showHandoffNotices={false}
    saveClientPortalOnboardingDraft={save}
    requiredDocuments={context.requiredDocuments} documents={context.documents} additionalRequirements={context.additionalRequirements}
    onReconcileDocumentRequirements={reconcile}
    onUploadRequiredDocument={async (key, file) => {
      const latest = await refresh()
      await reconcile({ requirements: resolveBondApplicationDocumentRequirements({ applicationState: buildBuyerBondApplicationRuntimeState(latest) }).activeRequirements })
      return uploadBuyerBondApplicationRuntimeDocument({ ...credentials, requirementKey: key, file })
    }}
    onRefreshDocuments={refresh}
    onPrepareSubmission={prepare}
    onPrepareWetInk={prepareWetInk}
    onlineSigning={{ availability: onlineAvailability, client: onlineClient }}
    onPrepareOnlineSigning={prepareOnline}
    onRefreshSubmission={() => refreshBuyerBondApplicationRuntimeSubmission(credentials)}
    onCancelPendingSubmission={cancel}
    participantModeEnabled={participantModeEnabled} onInviteCoApplicant={onInviteCoApplicant}
    onBackToPortal={onBackToPortal} onSaveAndExit={onSaveAndExit} onLegacyHandoff={onLegacyHandoff}
  />
}

// A different secure link starts a fresh workspace and save queue. No answers
// or receipt from the previous application may flash in the new workspace.
export default function ConnectedBuyerBondApplication(props) {
  return <BuyerBondApplicationRuntime key={`${props.token || ''}:${props.accessToken || ''}`} {...props} />
}
