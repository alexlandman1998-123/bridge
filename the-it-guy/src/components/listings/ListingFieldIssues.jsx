import { LISTING_CHANNEL_LABELS } from '../../services/listings/listingFieldRequirements'

export default function ListingFieldIssues({ issues = [], onGoToStep, step, attempted = false }) {
  const visibleIssues = attempted ? issues.filter(issue => !step || ['syndication', 'review'].includes(step) || issue.step === step) : []
  function editField(issue) {
    onGoToStep(issue.step, issue.field)
    // The selected step renders after this click. Open collapsed address/detail
    // sections before focusing the actual control, including on mobile.
    setTimeout(() => {
      const control = document.getElementsByName(issue.field)[0]
      if (!control) return
      let parent = control.parentElement
      while (parent) {
        if (parent.tagName === 'DETAILS') parent.open = true
        parent = parent.parentElement
      }
      control.focus()
      control.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    }, 0)
  }
  if (!visibleIssues.length) return null
  return <div aria-live="polite" className="rounded-lg border border-[#f1d4a6] bg-[#fffaf0] p-4 text-sm text-[#88531a]">
    <p className="font-semibold">Check these fields for your selected channels</p>
    <ul className="mt-2 grid gap-2">
      {visibleIssues.map(issue => <li key={`${issue.field}:${issue.message}`}>
        <span>{issue.message} <span className="text-xs">({issue.channels.map(key => LISTING_CHANNEL_LABELS[key]).join(', ')})</span></span>
        {onGoToStep ? <button type="button" className="ml-2 font-semibold underline" onClick={() => editField(issue)}>Edit field</button> : null}
      </li>)}
    </ul>
  </div>
}
