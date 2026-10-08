import { getDocumentUploadPolicy } from '../../../../lib/documentUploadPolicy.js'
import { useState } from 'react'
import { cancelBuyerBondWetInkSigning, uploadBuyerBondWetInkSignedCopy, renderBuyerBondWetInkSigningPdf, readBuyerBondWetInkOriginal } from '../../../../lib/clientPortalApi.js'
import { downloadBondSigningBytes } from '../../../../services/bondWetInkSigningService.js'
const documentUploadPolicy = getDocumentUploadPolicy({ surface: 'bond_signed_application' })


const button = 'min-h-11 rounded-xl border border-[#dbe5ef] px-4 py-2 text-sm font-semibold disabled:opacity-50'
export default function BondWetInkSigningPanel({ data, credentials, onRefresh, onCancelled }) {
  const [file, setFile] = useState(null)
  const [attempt, setAttempt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { version, uploads = [] } = data
  const latest = uploads.at(-1)
  const accepted = version.status === 'accepted'
  const awaiting = version.status === 'awaiting_review'
  async function run(action) {
    setBusy(true); setError('')
    try { await action() } catch (failure) { setError(failure.message || 'Please retry.'); if (failure.retryAttempt) setAttempt(failure.retryAttempt) }
    finally { setBusy(false) }
  }
  return <section className="space-y-5 rounded-2xl border border-[#dbe5ef] bg-white p-6">
    <div><h2 className="text-xl font-semibold text-[#142132]">{accepted ? 'Signed application accepted' : awaiting ? 'Signed copy awaiting review' : 'Sign and upload your application'}</h2>
      <p className="mt-2 text-sm leading-6 text-[#61748a]">Application {version.snapshot_json.reviewedVersion.reference} · Version {version.version}</p></div>
    <p className="text-sm leading-6 text-[#40566d]">Download the application below. Every applicant must review, sign and date their own signature space. Mark each optional permission separately. Scan all pages into one PDF and upload it here. Do not change the answers on the printed copy.</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" className={button} disabled={busy} onClick={() => void run(async () => downloadBondSigningBytes(await renderBuyerBondWetInkSigningPdf({ ...credentials, version }), `application-v${version.version}-to-sign.pdf`))}>Download application to sign</button>
      <button type="button" className={button} disabled={busy} onClick={() => void run(onRefresh)}>Refresh status</button>
      {!accepted ? <button type="button" className={button} disabled={busy} onClick={() => void run(async () => { await cancelBuyerBondWetInkSigning({ ...credentials, versionId: version.id }); await onCancelled() })}>Edit details and create a new version</button> : null}
    </div>
    {awaiting ? <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm">Your upload is awaiting your consultant’s review. It has not yet been accepted as the signed application.</p> : null}
    {accepted ? <p role="status" className="rounded-xl bg-green-50 p-4 text-sm">Your consultant accepted the signed original. Supporting documents and bank submission readiness are checked separately.</p> : null}
    {latest?.status === 'rejected' ? <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm"><p className="font-semibold">A replacement copy is needed</p><p className="mt-2">{latest.feedback}</p></div> : null}
    {!accepted && !awaiting ? <div className="space-y-3 rounded-xl border p-4">
      <label className="block text-sm font-semibold" htmlFor="bond-signed-copy">Upload the complete signed application</label>
      <input id="bond-signed-copy" type="file" title={documentUploadPolicy.helpText} accept={documentUploadPolicy.accept} disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] || null); setAttempt(null); setError('') }} className="block w-full text-sm" />
      <span className="block text-xs font-normal text-slate-500">{documentUploadPolicy.helpText}</span>
      <p className="text-xs leading-5 text-[#61748a]">PDF only, up to 25 MB. This signed application is stored privately for your assigned bond consultant to review. Each uploaded original is preserved unchanged.</p>
      <button type="button" disabled={busy || !file} className={`${button} bg-[#35546c] text-white`} onClick={() => void run(async () => { await uploadBuyerBondWetInkSignedCopy({ ...credentials, version, file, attempt }); setAttempt(null); setFile(null); await onRefresh() })}>{busy ? 'Working…' : 'Upload signed copy'}</button>
    </div> : null}
    {uploads.length ? <div className="space-y-3"><h3 className="font-semibold">Uploaded originals</h3>{uploads.map((upload) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm" key={upload.id}><div><p>{upload.file_name}</p><p className="mt-1 text-[#61748a]">{upload.status === 'awaiting_review' ? 'Awaiting review' : upload.status === 'accepted' ? 'Accepted' : 'Replacement requested'}{upload.feedback ? ` · ${upload.feedback}` : ''}</p></div><button type="button" className={button} disabled={busy} onClick={() => void run(async () => downloadBondSigningBytes(await readBuyerBondWetInkOriginal({ ...credentials, upload }), upload.file_name))}>Download original</button></div>)}</div> : null}
    {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
  </section>
}

export function JointWetInkSigningChoice({ declarations, onPrepare }) {
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <div className="mt-5 space-y-3 rounded-xl border p-4">
    <h3 className="font-semibold">Sign a joint application by hand</h3>
    <p>Once each applicant has completed and reviewed their details, download one fixed application for everyone to sign. Review the permissions below for yourself. Each co-applicant confirms their own permissions on paper.</p>
    {declarations.map((declaration) => <label key={declaration.key} className="flex items-start gap-3"><input type="checkbox" checked={Boolean(values[declaration.key])} onChange={(event) => setValues((current) => ({ ...current, [declaration.key]: event.target.checked }))} className="mt-1" /><span>{declaration.text}{declaration.required ? ' (Required)' : ' (Optional)'}</span></label>)}
    <button type="button" className={button} disabled={busy || declarations.some((item) => item.required && !values[item.key])} onClick={async () => { setBusy(true); setError(''); try { await onPrepare({ declarationValues: values }) } catch (failure) { setError(failure.message) } finally { setBusy(false) } }}>{busy ? 'Preparing…' : 'Download, sign and upload'}</button>
    {error ? <p role="alert" className="text-red-800">{error}</p> : null}
  </div>
}
