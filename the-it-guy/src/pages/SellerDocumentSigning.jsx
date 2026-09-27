import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { signSellerDocumentInPortal, viewSellerDocumentForSignature } from '../services/sellerPortalDocumentSigningService'

const titles = {
  signed_disclosure_form: 'Mandatory Disclosure / Defects Form',
  signed_fica_declaration: 'Seller FICA Declaration',
  signed_mandate: 'Seller Mandate',
}

export default function SellerDocumentSigning() {
  const { token = '' } = useParams()
  const [document, setDocument] = useState(null)
  const [name, setName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    viewSellerDocumentForSignature(token)
      .then((value) => {
        if (!active) return
        setDocument(value)
        setName(value.signerName || '')
      })
      .catch((reason) => { if (active) setError(reason?.message || 'This signing link is unavailable.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])

  const submit = async (event) => {
    event.preventDefault()
    if (!document || !accepted || saving) return
    setSaving(true)
    setError('')
    try {
      await signSellerDocumentInPortal(token, {
        signedName: name.trim(),
        signatureType: 'typed',
        signatureValue: name.trim(),
        versionDigest: document.versionDigest,
      })
      setComplete(true)
      setDocument(null)
    } catch (reason) {
      setError(reason?.message || 'Your signature could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f8f6] px-4 py-10 text-[#172b3f]">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#11734d]">Arch9 seller documents</p>
          <h1 className="mt-2 text-2xl font-semibold">{complete ? 'Signature received' : document ? `Review and sign ${titles[document.documentKey] || 'your document'}` : 'Seller document signing'}</h1>
          {document ? <p className="mt-2 text-sm text-[#607387]">This private request is for {document.signerName} ({document.signerRole}). Read the entire reviewed document before signing.</p> : null}
        </header>
        {loading ? <p role="status" className="rounded-2xl bg-white p-6">Loading your reviewed document…</p> : null}
        {error ? <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">{error}</p> : null}
        {complete ? <p role="status" className="rounded-2xl border border-green-200 bg-white p-6">Your signature was saved. Your agent will review the document after every required seller has signed.</p> : null}
        {document ? (
          <>
            <section className="overflow-hidden rounded-2xl border border-[#dce6e1] bg-white shadow-sm">
              <iframe
                title={titles[document.documentKey] || 'Reviewed seller document'}
                srcDoc={document.reviewedHtml}
                sandbox=""
                referrerPolicy="no-referrer"
                className="h-[min(70vh,900px)] w-full border-0"
              />
            </section>
            <form onSubmit={submit} className="space-y-4 rounded-2xl border border-[#dce6e1] bg-white p-6 shadow-sm">
              <p className="text-sm text-[#607387]">Document version: {document.versionDigest}</p>
              <label className="flex items-start gap-3 text-sm leading-6">
                <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1" />
                <span>I have reviewed this document and sign it as the named seller or authorised representative.</span>
              </label>
              <label className="block text-sm font-semibold">
                Type your full name as your signature
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#b9cbc2] px-4 py-3 font-normal"
                />
              </label>
              <button type="submit" disabled={!accepted || name.trim().toLowerCase() !== String(document.signerName || '').trim().toLowerCase() || saving} className="rounded-xl bg-[#07583a] px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? 'Saving signature…' : 'Sign this document'}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </main>
  )
}
