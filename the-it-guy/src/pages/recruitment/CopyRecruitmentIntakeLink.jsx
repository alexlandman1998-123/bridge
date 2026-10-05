import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { createRecruitmentIntakeLink } from '../../services/recruitmentIntakeService'

export default function CopyRecruitmentIntakeLink({ organisationId, disabled, className }) {
  const [link, setLink] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [manualCopy, setManualCopy] = useState(false)
  const mounted = useRef(true)
  const working = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  async function copy() {
    if (working.current || disabled) return
    working.current = true
    setBusy(true); setCopied(false); setError(''); setManualCopy(false)
    try {
      const current = link && new Date(link.expires_at) > new Date() ? link : await createRecruitmentIntakeLink(organisationId, 'public_link')
      if (!mounted.current) return
      setLink(current)
      try {
        await navigator.clipboard.writeText(current.url)
        if (mounted.current) setCopied(true)
      } catch {
        if (mounted.current) { setManualCopy(true); setError('Automatic copying is unavailable. Select and copy the intake link below.') }
      }
    } catch (failure) { if (mounted.current) setError(failure.message || 'The intake link could not be prepared. Please try again.') }
    finally { working.current = false; if (mounted.current) setBusy(false) }
  }

  return <div className="min-w-0">
    <button type="button" aria-label="Copy Intake Link" className={className} disabled={disabled || busy || !organisationId || organisationId === 'all'} onClick={copy}>
      {copied ? <Check size={16} /> : <Copy size={16} />}{busy ? 'Preparing Link…' : copied ? 'Link Copied' : 'Copy Intake Link'}
    </button>
    {copied && <span role="status" className="sr-only">Intake link copied.</span>}
    {error && <p role="alert" className="mt-2 max-w-xs text-xs text-[#9f3028]">{error}</p>}
    {manualCopy && <input aria-label="Intake link to copy" readOnly value={link.url} onFocus={(event) => event.target.select()} className="mt-2 block w-full max-w-xs rounded-lg border border-[#dbe4ee] px-3 py-2 text-xs" />}
  </div>
}
