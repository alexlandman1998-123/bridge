import { Download, FileCheck2 } from 'lucide-react'
import { useRef, useState } from 'react'
import Button from '../ui/Button'

function formatDate(value) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-ZA')
}

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function SigningCompletionCertificate({ certificate = null }) {
  const exportRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!certificate?.ready) return null

  async function downloadCertificate() {
    if (!exportRef.current || busy) return
    setBusy(true)
    setError('')
    let clone = null
    try {
      const module = await import('html2pdf.js')
      const html2pdf = module.default || module
      clone = exportRef.current.cloneNode(true)
      clone.querySelectorAll('[data-no-certificate-export]').forEach((node) => node.remove())
      clone.style.width = '760px'
      clone.style.margin = '0'
      clone.style.background = '#ffffff'
      clone.style.position = 'fixed'
      clone.style.left = '-10000px'
      clone.style.top = '0'
      document.body.appendChild(clone)
      await html2pdf().set({
        margin: 10,
        filename: `${certificate.certificateId}-completion-certificate.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      }).from(clone).save()
    } catch (exportError) {
      setError(exportError?.message || 'The completion certificate could not be downloaded.')
    } finally {
      clone?.remove()
      setBusy(false)
    }
  }

  return (
    <section ref={exportRef} data-testid="signing-completion-certificate" className="rounded-[20px] border border-[#cfe3d7] bg-white p-5 text-[#142132]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#dce8e1] pb-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e4f5eb] text-[#237047]"><FileCheck2 size={20} /></span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#4a7a60]">Completion certificate</p>
            <h3 className="mt-1 text-lg font-semibold">{certificate.documentTitle}</h3>
            <p className="mt-1 text-xs text-[#607387]">Certificate {certificate.certificateId}</p>
          </div>
        </div>
        <div data-no-certificate-export>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void downloadCertificate()}>
            <Download size={15} /> {busy ? 'Preparing…' : 'Download certificate'}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-[#607387]">Completed</p><p className="mt-1 font-semibold">{formatDate(certificate.completedAt)}</p></div>
        <div><p className="text-xs text-[#607387]">Document version</p><p className="mt-1 font-semibold">{certificate.versionNumber || '—'}</p></div>
        <div><p className="text-xs text-[#607387]">Delivery</p><p className="mt-1 font-semibold">{certificate.delivery.deliveredRecipientCount}/{certificate.delivery.recipientCount} recipients</p></div>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#607387]">Signing parties</p>
        <div className="mt-2 space-y-2">
          {certificate.signers.map((signer) => (
            <div key={`${signer.role}:${signer.email || signer.name}`} className="rounded-[12px] border border-[#e1e9f2] bg-[#f9fbfd] px-3 py-2.5 text-sm">
              <p className="font-semibold">{signer.name} · {signer.roleLabel}</p>
              <p className="mt-0.5 text-xs text-[#607387]">{signer.email || 'Email not recorded'} · Signed {formatDate(signer.signedAt)}{signer.viewedAt ? ` · Opened ${formatDate(signer.viewedAt)}` : ''}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-[12px] border border-[#dce8e1] bg-[#f5faf7] p-3 text-xs">
        <p className="font-semibold text-[#315f47]">Final PDF integrity</p>
        <p className="mt-1">SHA-256</p>
        <p className="mt-1 break-all font-mono leading-5">{certificate.artifact.sha256}</p>
        <p className="mt-1 text-[#607387]">{certificate.artifact.fileName || 'Final signed PDF'} · {formatBytes(certificate.artifact.byteLength)} · {certificate.evidenceEventCount} audit event{certificate.evidenceEventCount === 1 ? '' : 's'}</p>
      </div>
      <p className="mt-4 text-[0.68rem] leading-5 text-[#607387]">{certificate.statement}</p>
      {error ? <p data-no-certificate-export className="mt-3 text-xs font-semibold text-[#9a3125]">{error}</p> : null}
    </section>
  )
}
