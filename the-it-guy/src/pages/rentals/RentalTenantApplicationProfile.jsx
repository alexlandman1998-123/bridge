import { useEffect, useRef, useState } from 'react'
import Button from '../../components/ui/Button'
import { getRentalApplicationReview, savePersistedRentalApplication } from '../../services/rentals/rentalApplicationRepository.js'
import { uploadRentalApplicationEvidence } from '../../services/rentals/rentalApplicationEvidenceService.js'
import { rentalApplicationSavedDocumentSlots, initialiseRentalApplicationWizard, reuseRentalTenantIdentity } from '../../services/rentals/rentalApplicationWizardModel.js'
import RentalApplicationWizard from '../../modules/rentals/shared/applications/RentalApplicationWizard.jsx'
import RentalApplicationDocuments from '../../modules/rentals/shared/applications/RentalApplicationDocuments.jsx'
const EMPTY = []
export default function RentalTenantApplicationProfile({ applications = EMPTY, lead, onReload, onSetup, documentsContent, requirementsContent, draftsRef }) {
  const ownDrafts = useRef(new Map()); const drafts = draftsRef || ownDrafts
  const [applicationId, setApplicationId] = useState(applications[0]?.id || '')
  const [draft, setDraft] = useState(() => { const cached = drafts.current.get(applications[0]?.id); return cached?.persisted ? null : cached || null })
  const [saved, setSaved] = useState(() => drafts.current.get(applications[0]?.id)?.base || null); const [documents, setDocuments] = useState([])
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('')
  const [checklist, setChecklist] = useState(null)
  const [reuseId, setReuseId] = useState(''); const [requirements, setRequirements] = useState(false)
  const guard = useRef(false)
  const remote = applications.find((item) => item.id === applicationId)
  const snapshot = saved
  const application = snapshot && remote && snapshot.id === remote.id && snapshot.version >= remote.version ? snapshot : remote
  const readOnly = application?.status !== 'draft'
  const data = initialiseRentalApplicationWizard((readOnly ? application?.data : draft?.data || application?.data) || {})
  useEffect(() => { if (!applications.some((item) => item.id === applicationId)) setApplicationId(applications[0]?.id || '') }, [applications, applicationId])
  useEffect(() => { setDraft(drafts.current.get(applicationId)?.persisted ? null : drafts.current.get(applicationId) || null); setSaved(drafts.current.get(applicationId)?.base || null); setDocuments([]); setChecklist(null); setError(''); setNotice('') }, [applicationId, drafts])
  useEffect(() => {
    if (!applicationId) return
    let cancelled = false
    setChecklist(null)
    getRentalApplicationReview(applicationId).then((review) => { if (!cancelled) { setDocuments(review?.documents || []); setChecklist(review?.requirements ?? null) } }).catch((cause) => { if (!cancelled) setError(cause.message || 'Unable to load supporting documents.') })
    return () => { cancelled = true }
  }, [applicationId, application?.version])
  function update(nextData) { const next = { version: draft?.version ?? application.version, data: nextData, base: application }; drafts.current.set(applicationId, next); setDraft(next); setNotice('') }
  async function persist() {
    if (draft && draft.version !== application.version) throw new Error('Application changed elsewhere. Your edits are retained; refresh and reconcile them before saving.')
    const result = await savePersistedRentalApplication(application, data)
    setSaved(result); drafts.current.set(applicationId, { version: result.version, data: result.data, base: result, persisted: true }); setDraft(null)
    setChecklist(null)
    const review = await getRentalApplicationReview(result.id)
    if (review?.version !== result.version) throw new Error('Application changed elsewhere. Reopen it before uploading.')
    setChecklist(review.requirements ?? null)
    return { ...result, requirements: review.requirements ?? null }
  }
  async function save() {
    if (!application || readOnly || guard.current) return false
    guard.current = true; setSaving(true); setError(''); setNotice('')
    try { await persist(); await onReload?.(); if (onReload) drafts.current.delete(applicationId); setNotice('Application profile saved.'); return true }
    catch (cause) { setError(cause.message || 'Unable to save application profile.'); return false }
    finally { guard.current = false; setSaving(false) }
  }
  async function upload(file, slot) {
    if (guard.current || readOnly) return
    guard.current = true; setSaving(true); setError(''); setNotice('')
    try {
      const current = await persist()
      const savedSlot = rentalApplicationSavedDocumentSlots(current.data, current.requirements ?? null).find((item) => item.key === slot.key)
      if (!savedSlot?.requirementId) throw new Error('The saved checklist is unavailable. Reopen the application and retry.')
      const result = await uploadRentalApplicationEvidence(current, file, savedSlot)
      setChecklist(result.application.requirements ?? null)
      setSaved(result.application); drafts.current.set(applicationId, { version: result.application.version, data: result.application.data, base: result.application, persisted: true }); setDocuments((items) => [result.document, ...items]); await onReload?.(); if (onReload) drafts.current.delete(applicationId); setNotice(`${file.name} uploaded.`)
    } catch (cause) { setError(cause.message || 'Unable to upload evidence.') }
    finally { guard.current = false; setSaving(false) }
  }
  return <section className="tenant-card"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf3f8] pb-5"><div><p className="tenant-eyebrow">Tenant profile</p><h2 className="mt-1 text-xl font-semibold text-[#102033]">Application setup</h2><p className="mt-1 text-sm text-[#60758b]">{lead?.name}</p></div><Button type="button" onClick={onSetup} disabled={saving}>{applications.length ? 'Manage onboarding' : 'Set up application'}</Button></header>
    {error ? <p role="alert" className="mt-4 rounded-xl bg-[#fff5f4] p-3 text-sm text-[#9f3028]">{error}</p> : null}{notice ? <p role="status" className="mt-4 rounded-xl bg-[#effaf3] p-3 text-sm text-[#26724c]">{notice}</p> : null}
    <div className="my-5 flex flex-wrap items-end gap-3">{applications.length ? <label className="form-field min-w-0 flex-1"><span>Linked application</span><select value={applicationId} disabled={saving || Boolean(draft)} onChange={(event) => setApplicationId(event.target.value)}>{applications.map((item) => <option key={item.id} value={item.id}>{item.data?.property?.title || item.data?.property?.address || item.vacancyId || item.id} · {item.status}</option>)}</select></label> : null}{requirementsContent ? <Button type="button" variant="secondary" onClick={() => setRequirements((current) => !current)}>{requirements ? 'Application details' : 'Rental requirements'}</Button> : null}{draft ? <Button type="button" variant="secondary" disabled={saving} onClick={() => { drafts.current.delete(applicationId); setDraft(null) }}>Reset changes</Button> : null}</div>
    {requirements ? requirementsContent : !application ? <div className="rounded-xl border border-dashed border-[#dce7f2] p-6"><h3 className="font-semibold text-[#203a54]">Start the tenant’s application</h3><p className="mt-2 text-sm text-[#60758b]">Choose a property to create a draft, then complete it here or share the online form.</p><Button type="button" className="mt-4" onClick={onSetup}>Choose property</Button>{documentsContent}</div> : <>
      {readOnly ? <p className="mb-4 text-sm text-[#60758b]">Submitted application details are read-only. Review the application before requesting changes.</p> : applications.length > 1 ? <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl bg-[#f8fbfe] p-4"><label className="form-field min-w-0 flex-1"><span>Reuse this tenant’s contact details</span><select value={reuseId} disabled={saving} onChange={(event) => setReuseId(event.target.value)}><option value="">Choose a previous application</option>{applications.filter((item) => item.id !== applicationId).map((item) => <option key={item.id} value={item.id}>{item.data?.property?.title || item.id.slice(0, 8)}</option>)}</select></label><Button type="button" variant="secondary" disabled={saving || !reuseId} onClick={() => update(reuseRentalTenantIdentity(applications.find((item) => item.id === reuseId)?.data || {}, data))}>Use contact details</Button><p className="w-full text-xs text-[#60758b]">Financial answers, other applicants, documents and consent stay specific to this application.</p></div> : null}
      <RentalApplicationWizard key={applicationId} agent data={data} onChange={update} onSave={save} busy={saving} readOnly={readOnly} documentsContent={<><RentalApplicationDocuments data={data} documents={documents} requirements={checklist} preview={Boolean(draft)} disabled={saving || readOnly} onUpload={readOnly ? undefined : upload} />{documentsContent}</>} declarationsContent={!readOnly ? <Button type="button" onClick={onSetup}>Manage tenant onboarding</Button> : null} />
    </>}
  </section>
}
