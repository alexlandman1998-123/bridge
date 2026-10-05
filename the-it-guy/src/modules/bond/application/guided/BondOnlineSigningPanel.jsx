import { useState } from 'react'
import BondApplicationDocumentPreview from './BondApplicationDocumentPreview.jsx'
import { downloadBondSigningBytes } from '../../../../services/bondWetInkSigningService.js'
const button = 'min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50'
export default function BondOnlineSigningPanel({ availability, client, envelope, presentation, declarations = [], onPrepare, onStateChanged }) {
  const [consent, setConsent] = useState({})
  const [intent, setIntent] = useState(false)
  const [session, setSession] = useState(null)
  const [code, setCode] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(action) { setBusy(true); setError(''); try { await action() } catch (failure) { setError(failure.message || 'Signing could not be completed. Please retry.') } finally { setBusy(false) } }
  if (!availability?.available) return <div className="rounded-2xl border border-[#dbe5ef] p-4"><h3 className="font-semibold">Verified online signing</h3><p className="mt-2 text-sm leading-6 text-[#61748a]">{availability?.message || 'Verified online signing is not enabled yet. You can download, sign and upload your application here.'}</p></div>
  if (!envelope) return <div className="rounded-2xl border p-4"><h3 className="font-semibold">Sign online</h3><p className="mt-2 text-sm leading-6">Prepare the fixed application for individual review, identity verification and signing. Every joint applicant signs separately using their own secure link.</p><button type="button" className={`${button} mt-3`} disabled={busy} onClick={() => void run(onPrepare)}>Prepare verified online signing</button>{error ? <p role="alert">{error}</p> : null}</div>
  const complete = envelope.status === 'completed'
  return <section className="space-y-4 rounded-2xl border bg-white p-5">
    <h2 className="text-xl font-semibold">{complete ? 'Your signed application' : 'Review and sign online'}</h2>
    <p className="text-sm">{envelope.reference} · {envelope.completedSigners} of {envelope.requiredSigners} applicants signed</p>
    {presentation ? <BondApplicationDocumentPreview presentation={presentation} versionStatus={complete ? 'signed' : 'fixed'} /> : null}
    {!complete && envelope.signerStatus !== 'signed' ? <>
      {declarations.map((item) => <label key={item.key} className="flex items-start gap-3 text-sm"><input type="checkbox" checked={Boolean(consent[item.key])} disabled={busy || Boolean(session)} onChange={(event) => setConsent((current) => ({ ...current, [item.key]: event.target.checked }))} /><span>{item.text} ({item.required ? 'Required' : 'Optional'})</span></label>)}
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={intent} disabled={busy || Boolean(session)} onChange={(event) => setIntent(event.target.checked)} /><span>I have reviewed this version and intend to sign my own application details and permissions.</span></label>
      <button type="button" disabled={busy || !intent || declarations.some((item) => item.required && !consent[item.key])} className={button} onClick={() => void run(async () => { setSession(await client.start({ envelopeId: envelope.id, consent, intentToSign: intent })); setCode(''); setLink('') })}>{session ? 'Start a new verification session' : 'Verify my identity'}</button>
      {session && !link ? <div className="space-y-3 rounded-xl border p-4"><label className="block text-sm">Verification code<input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} className="mt-2 block rounded border p-2" /></label><p className="text-xs">The signing service verifies your code. If it expires, start a new verification session.</p><button type="button" className={button} disabled={busy || !code} onClick={() => void run(async () => { const result = await client.verify({ envelopeId: envelope.id, sessionId: session.sessionId, code }); setCode(''); setLink(result.signingUrl || '') })}>Verify code</button></div> : null}
      {link ? <a className={`${button} inline-block bg-[#35546c] text-white`} href={link} target="_blank" rel="noopener noreferrer">Continue to secure signing</a> : null}
    </> : !complete ? <p role="status">You have signed. The other applicants must finish signing this same version.</p> : <p role="status">All required applicants have signed. Bank submission readiness is checked separately.</p>}
    <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} className={button} onClick={() => void run(async () => onStateChanged?.(await client.status({ envelopeId: envelope.id })))}>Refresh signing status</button>{complete && envelope.documentAvailable ? <button type="button" disabled={busy} className={button} onClick={() => void run(async () => downloadBondSigningBytes(await client.download({ envelopeId: envelope.id }), `signed-${envelope.reference}.pdf`))}>Download signed application</button> : null}</div>
    {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
  </section>
}
