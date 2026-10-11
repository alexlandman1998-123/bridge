import { useEffect, useRef, useState } from 'react'
import { LISTING_CHANNEL_LABELS } from '../../services/listings/listingFieldRequirements'
import { LISTING_CAPTURE_FIELD_LABELS } from '../../services/listings/listingCaptureModel'

export default function ListingFieldIssues({ issues = [], onGoToStep, step, attempted = false }) {
  const [correctionField, setCorrectionField] = useState('')
  const [focusRequest, setFocusRequest] = useState(null)
  const panelRef = useRef(null)
  const visibleIssues = issues.filter(issue => (issue.field && issue.field === correctionField) || (attempted && (!step || ['syndication', 'review'].includes(step) || issue.step === step)))
  useEffect(() => {
    if (!focusRequest) return undefined
    let frame
    let attempts = 0
    const focus = () => {
      const scope = panelRef.current?.closest('form, main, .page-content') || document
      const findControl = root => [...root.querySelectorAll('[name]')].find(node => node.name === focusRequest.field && node.type !== 'hidden') ||
        [...root.querySelectorAll('[data-listing-field]')].find(node => node.dataset.listingField === focusRequest.field)?.querySelector('input, select, textarea, button')
      const control = findControl(scope) || (scope !== document ? findControl(document) : null)
      if (!control) {
        if (++attempts < 30) frame = requestAnimationFrame(focus)
        return
      }
      let parent = control.parentElement
      while (parent) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement }
      control.focus()
      control.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      setFocusRequest(null)
    }
    frame = requestAnimationFrame(focus)
    return () => cancelAnimationFrame(frame)
  }, [step, focusRequest])
  function editField(issue) {
    setCorrectionField(issue.field)
    setFocusRequest({ field: issue.field })
    onGoToStep(issue.step, issue.field)
  }
  if (!visibleIssues.length) return null
  return <div ref={panelRef} aria-live="polite" className="rounded-lg border border-[#f1d4a6] bg-[#fffaf0] p-4 text-sm text-[#88531a]">
    <p className="font-semibold">Check these details</p>
    <ul className="mt-2 grid gap-2">
      {visibleIssues.map(issue => <li key={`${issue.field}:${issue.message}`}>
        <span>{issue.message}{issue.channels?.length ? <span className="text-xs"> ({issue.channels.map(key => LISTING_CHANNEL_LABELS[key]).join(', ')})</span> : null}</span>
        {onGoToStep && issue.field ? <button type="button" className="ml-2 font-semibold underline" onClick={() => editField(issue)}>Edit {LISTING_CAPTURE_FIELD_LABELS[issue.field] || issue.label || issue.field.replace(/([A-Z])/g, ' $1').toLowerCase()}</button> : null}
      </li>)}
    </ul>
  </div>
}
