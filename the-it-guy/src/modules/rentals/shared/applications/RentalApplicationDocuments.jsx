import { Upload } from 'lucide-react'
import { DOCUMENT_UPLOAD_ACCEPT } from '../../../../lib/documentUploadPolicy.js'
import { rentalApplicationDocumentSlots, rentalApplicationDocumentForSlot } from '../../../../services/rentals/rentalApplicationWizardModel.js'
export default function RentalApplicationDocuments({ data, documents = [], onUpload, disabled = false }) {
  return <div className="space-y-3"><p className="text-sm text-[#60758b]">Upload evidence for the named person or entity. PDF, Word, JPG or PNG; up to 8 MB. Uploaded evidence still requires review.</p>{rentalApplicationDocumentSlots(data).map((slot) => {
    const document = rentalApplicationDocumentForSlot(slot, documents, data)
    return <div key={slot.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dce7f2] p-4"><div className="min-w-0"><p className="font-semibold text-[#29435d]">{slot.title} {slot.required ? <span className="text-xs font-normal text-[#8a641d]">Required</span> : null}</p><p className="mt-1 break-all text-xs text-[#60758b]">{document ? `${document.file_name || document.fileName || document.name} · ${document.status}` : 'Not uploaded'}</p></div>{onUpload ? <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#dce7f2] bg-white px-3 py-2 text-sm font-semibold text-[#315b7a] ${disabled ? 'opacity-50' : ''}`}><Upload size={15} />{document ? 'Replace' : 'Upload'}<input aria-label={`Upload ${slot.title}`} type="file" accept={DOCUMENT_UPLOAD_ACCEPT} disabled={disabled} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void onUpload(file, slot) }} /></label> : null}</div>
  })}</div>
}
