import { useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { recruitmentSignupRequest } from '../../services/recruitmentSignupService'

export default function RecruitmentApplicantPhoto({ applicant, endpoint, disabled, onSaved, onBusy, onSessionExpired }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const attempt = useRef(null), working = useRef(false)
  async function upload(file) {
    if (working.current || disabled || applicant.documentsEditable === false) return
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size < 1 || file.size > 2097152) { setError('Choose a JPG or PNG up to 2 MB.'); return }
    if (attempt.current?.file !== file) attempt.current = { id: crypto.randomUUID(), file, uploaded: false }
    const pending = attempt.current
    working.current = true; setBusy(true); onBusy(true); setError(''); setNotice('')
    try {
      const prepared = await recruitmentSignupRequest('prepare_photo', { requestId: pending.id, photo: { name: file.name, size: file.size, mimeType: file.type } }, { endpoint })
      if (!prepared.committed && !pending.uploaded) {
        if (!prepared.uploadUrl) throw new Error('The upload could not be prepared. Retry this picture.')
        const response = await fetch(prepared.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!response.ok) {
          const result = await response.json().catch(() => ({}))
          if (![400, 409].includes(response.status) || !/already exists|duplicate/i.test(String(result.message || result.error || ''))) throw new Error('The picture did not finish uploading. Retry this picture.')
        }
        pending.uploaded = true
      }
      const result = await recruitmentSignupRequest('commit_photo', { requestId: pending.id }, { endpoint })
      if (!result.saved || !result.applicant) throw new Error('The picture could not be confirmed. Retry this picture.')
      onSaved(result.applicant); attempt.current = null; setNotice('Profile picture saved.')
    } catch (failure) { setError(failure.message); if (failure.status === 401) onSessionExpired() }
    finally { working.current = false; setBusy(false); onBusy(false) }
  }
  const locked = busy || disabled || applicant.documentsEditable === false
  const initials = [applicant.contact?.firstName, applicant.contact?.lastName].map(name => name?.trim().charAt(0) || '').join('')
  return <section className="applicant-setup__photo applicant-setup__card" aria-labelledby="applicant-photo-title">
    <div className="applicant-setup__avatar">{applicant.photo?.url ? <img src={applicant.photo.url} alt="Your profile" /> : <span aria-hidden="true">{initials || <ImagePlus size={32} />}</span>}</div>
    <div><h2 id="applicant-photo-title">Profile picture</h2><p>A face to put to your name.<br />JPG or PNG, up to 2 MB.</p>
      <label className={`applicant-setup__file-control${locked ? ' applicant-setup__file-control--disabled' : ''}`}><ImagePlus size={16} aria-hidden="true" />{busy ? 'Saving picture…' : applicant.photo?.url ? 'Change picture' : 'Add a picture'}<input aria-label="Upload profile picture" type="file" accept="image/jpeg,image/png" disabled={locked} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) upload(file) }} /></label>
      {applicant.photo?.name && <span className="applicant-setup__photo-name">{applicant.photo.name}</span>}
      {error && <p role="alert" className="applicant-setup__notice applicant-setup__notice--error">{error}</p>}{notice && <p role="status" className="applicant-setup__notice">{notice}</p>}
      {attempt.current && !busy && <button type="button" disabled={disabled} className="recruitment-signup__secondary" onClick={() => upload(attempt.current.file)}>Retry profile picture upload</button>}
    </div>
  </section>
}
