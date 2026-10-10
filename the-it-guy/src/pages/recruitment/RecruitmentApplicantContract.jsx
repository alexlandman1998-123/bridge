import { useRef, useState } from 'react'
import { Check, Download, FileCheck2, FileText, Upload } from 'lucide-react'
import { recruitmentSignupRequest } from '../../services/recruitmentSignupService'
import { validateDocumentUploadFile } from '../../lib/documentUploadPolicy'

export default function RecruitmentApplicantContract({ contract, endpoint, disabled, onBusy, onSaved, onSessionExpired }) {
  const [file, setFile] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const attempt = useRef(null), inFlight = useRef(false)
  if (!contract) return null
  const options = { endpoint, codeOnly: true }, locked = busy || disabled
  function activity(value) { inFlight.current = value; setBusy(value); onBusy?.(value) }
  function failed(failure) { setError(failure.message); if (failure.status === 401) onSessionExpired?.() }
  async function download(returnId) {
    if (inFlight.current || disabled) return
    activity(true); setError('')
    try {
      const result = await recruitmentSignupRequest('download_contract', { returnId }, options)
      if (!result.downloadUrl) throw new Error('Contract unavailable. Please refresh My Profile.')
      const link = document.createElement('a'); link.href = result.downloadUrl; link.rel = 'noreferrer'; link.click()
    } catch (failure) { failed(failure) } finally { activity(false) }
  }
  async function upload(event) {
    event.preventDefault()
    if (inFlight.current || disabled || !contract.canUpload || !file) return
    activity(true); setError('')
    try {
      validateDocumentUploadFile(file, { surface: 'recruitment_signed_contract' })
      if (new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== '%PDF-') throw new Error('Choose a valid PDF containing all signed pages.')
      if (!attempt.current || attempt.current.file !== file) attempt.current = { id: crypto.randomUUID(), file, uploaded: false }
      const pending = attempt.current, document = { name: file.name, size: file.size, mimeType: 'application/pdf' }
      const args = { requestId: pending.id, document }
      const prepared = await recruitmentSignupRequest('prepare_contract_return', args, options)
      if (!prepared.committed && !pending.uploaded) {
        if (!prepared.uploadUrl) throw new Error('The upload could not be prepared. Retry this file.')
        const response = await fetch(prepared.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file })
        if (!response.ok) {
          const result = await response.json().catch(() => ({}))
          if (![400, 409].includes(response.status) || !/already exists|duplicate/i.test(String(result.message || result.error || ''))) throw new Error('The upload did not finish. Retry this file.')
        }
        pending.uploaded = true
      }
      const saved = await recruitmentSignupRequest('commit_contract_return', args, options)
      if (!saved.saved || !saved.applicant) throw new Error('Your signed contract could not be confirmed. Retry this file.')
      onSaved(saved.applicant); setFile(null); attempt.current = null
    } catch (failure) { failed(failure) } finally { activity(false) }
  }
  const returned = contract.returns?.at(-1)
  return <section className="applicant-setup__card applicant-contract" aria-label="Your recruitment contract">
    <header className="applicant-setup__documents-head"><div><p className="applicant-setup__eyebrow">{contract.verified ? 'Contract complete' : returned ? 'With the recruitment team' : 'Your next step'}</p><h2>Your contract</h2><p>{contract.verified ? 'Our team has verified your signed contract.' : returned ? 'Your signed copy is saved. Our team will check it and guide you through the next step.' : 'Download your contract, sign it and upload all signed pages as one PDF.'}</p></div><FileCheck2 size={28} aria-hidden="true" /></header>
    <ol className="applicant-contract__steps" aria-label="Contract steps"><li><span>1</span>Download</li><li><span>2</span>Sign every required page</li><li><span>{returned ? <Check size={14} aria-hidden="true" /> : '3'}</span>Upload signed copy</li></ol>
    <div className="applicant-contract__file"><FileText size={24} aria-hidden="true" /><div><strong>{contract.name}</strong><span>Contract · Version {contract.version}</span></div><button type="button" className="applicant-setup__primary" disabled={locked} onClick={() => download()}><Download size={16} aria-hidden="true" />Download contract</button></div>
    {returned && <div className="applicant-contract__file applicant-contract__file--returned"><Check size={20} aria-hidden="true" /><div><strong>{returned.name}</strong><span>{contract.verified ? 'Verified by the agency' : 'Signed copy returned · Awaiting agency review'}</span></div><button type="button" className="recruitment-signup__secondary" disabled={locked} onClick={() => download(returned.id)}><Download size={15} aria-hidden="true" />Download your signed copy</button></div>}
    {contract.canUpload && <form onSubmit={upload} className="applicant-contract__upload"><label className={`applicant-setup__file-control${locked ? ' applicant-setup__file-control--disabled' : ''}`}><Upload size={16} aria-hidden="true" />{returned ? 'Choose a corrected signed PDF' : 'Choose signed PDF'}<input type="file" accept="application/pdf,.pdf" aria-label="Choose signed contract PDF" disabled={locked} onChange={event => { setFile(event.target.files?.[0] || null); event.target.value = ''; setError('') }} /></label><span>{file ? file.name : 'PDF · all signed pages · up to 10 MB'}</span><button type="submit" className="applicant-setup__primary" disabled={locked || !file}>{busy ? 'Saving…' : error && attempt.current ? 'Retry signed copy' : 'Upload signed copy'}</button><p>The agency is notified when your signed copy is saved.</p></form>}
    {error && <p role="alert" className="applicant-setup__notice applicant-setup__notice--error">{error}</p>}
  </section>
}
