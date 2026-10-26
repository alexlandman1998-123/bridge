import { FileText, Upload } from 'lucide-react'
import Button from '../../components/ui/Button'

export default function BuyerSignedOtpDocuments({ documents = [], busy = false, onUpload, onOpen }) {
  return (
    <section className="rounded-[24px] border border-[#dbe7f2] bg-white p-5 sm:p-6" data-testid="buyer-signed-otp-documents">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[#102033]">Signed offer to purchase</h3>
          <p className="mt-1 text-sm text-[#60758b]">Upload the OTP signed by all required parties, or open a saved copy.</p>
        </div>
        <Button type="button" onClick={onUpload} disabled={busy}>
          <Upload className="h-4 w-4" />{busy ? 'Uploading OTP…' : 'Upload signed OTP'}
        </Button>
      </div>
      {documents.length ? <ul className="mt-4 divide-y divide-[#edf3f8] border-t border-[#edf3f8]">
        {documents.map(document => <li key={document.id} className="flex items-center justify-between gap-4 py-3">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[#20364c]"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{document.fileName}</span></span>
          <Button type="button" size="sm" variant="secondary" onClick={() => void onOpen(document)}>View signed OTP</Button>
        </li>)}
      </ul> : <p className="mt-4 text-sm text-[#8aa0b7]">No signed OTP uploaded yet.</p>}
    </section>
  )
}
