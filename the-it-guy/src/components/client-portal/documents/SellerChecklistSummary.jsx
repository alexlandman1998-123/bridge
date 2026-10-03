import { buildSellerPortalDocumentSummary } from '../../../core/clientPortal/sellerPortalDocumentSummary.js'

export default function SellerChecklistSummary({ documentCenter = {} }) {
  if (documentCenter.loadError || documentCenter.error) return <p role="status" className="mt-4 rounded-2xl border border-[#dbe5ef] bg-white p-4 text-sm text-[#52657b]">Your checklist status is unavailable. Please try again.</p>
  const summary = buildSellerPortalDocumentSummary(documentCenter)
  return <section aria-label="Required document checklist" className="mt-4 rounded-[18px] border border-[#dbe5ef] bg-white p-4 sm:p-5">
    <h2 className="text-base font-semibold text-[#142132]">Required checklist</h2>
    <dl className="mt-4 grid grid-cols-3 gap-3">{[['Action needed', summary.actionRequired], ['Awaiting review', summary.reviewRequired], ['Approved', summary.approved]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs leading-5 text-[#64748b]">{label}</dt><dd className="mt-1 text-xl font-semibold text-[#123f3a]">{value}</dd></div>)}</dl>
    <p className="mt-4 text-xs leading-5 text-[#64748b]">These counts cover your required checklist. Agent-managed sales documents and signed copies are listed separately.</p>
  </section>
}
