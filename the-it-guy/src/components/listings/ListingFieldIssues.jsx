import { useEffect, useRef, useState } from 'react'
import { LISTING_CHANNEL_LABELS, groupListingFieldIssues } from '../../services/listings/listingFieldRequirements'
import { LISTING_CAPTURE_FIELD_LABELS } from '../../services/listings/listingCaptureModel'

export default function ListingFieldIssues({ issues = [], onGoToStep, step, attempted = false, completion = false, channels = [], draftNote = 'Save draft keeps your progress private. You can finish these details later.' }) {
  const [checklistExpanded, setChecklistExpanded] = useState(false)
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
    setChecklistExpanded(true)
    setCorrectionField(issue.field)
    setFocusRequest({ field: issue.field })
    onGoToStep(issue.step, issue.field)
  }
  const renderIssues = rows => <ul className="mt-2 grid gap-3">
    {groupListingFieldIssues(rows).map(issue => <li key={issue.field || issue.message}>
      {issue.requirements.map((requirement, index) => <p key={index}>
        {requirement.message}{requirement.channels?.length ? <span className="text-xs"> ({requirement.channels.map(key => LISTING_CHANNEL_LABELS[key]).join(', ')})</span> : null}
      </p>)}
      {onGoToStep && issue.field ? <button type="button" className="font-semibold underline" onClick={() => editField(issue)}>Edit {LISTING_CAPTURE_FIELD_LABELS[issue.field] || issue.label || issue.field.replace(/([A-Z])/g, ' $1').toLowerCase()}</button> : null}
    </li>)}
  </ul>
  if (completion) {
    const grouped = groupListingFieldIssues(issues)
    const basic = grouped.filter(issue => issue.basic).flatMap(issue => issue.requirements)
    const advertising = grouped.filter(issue => !issue.basic).flatMap(issue => issue.requirements)
    const selected = channels.filter(channel => LISTING_CHANNEL_LABELS[channel])
    return <section ref={panelRef} data-listing-checklist aria-label="Listing completion checklist" className="rounded-lg border border-[#dbe6f2] bg-[#fbfdff] p-4 text-sm text-[#2d445e]">
      <p className="font-semibold">{grouped.length ? `${grouped.length} field${grouped.length === 1 ? '' : 's'} to finish` : selected.length ? 'Details ready for selected websites' : 'Listing details ready'}</p>
      <p className="mt-1 text-xs text-[#607387]">{draftNote}</p>
      <ul aria-label="Selected website requirements" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {selected.map(channel => {
          const count = grouped.filter(issue => issue.channels.includes(channel)).length
          return <li key={channel}>{LISTING_CHANNEL_LABELS[channel]}: {count ? `${count} field${count === 1 ? '' : 's'} to fix` : 'website details ready'}</li>
        })}
      </ul>
      {!selected.length ? <p className="mt-2 text-xs">No websites selected. This listing will stay private.</p> : <p className="mt-2 text-xs">Website details are checked here. Connection and publishing confirmation are checked separately.</p>}
      {grouped.length ? <details onToggle={event => setChecklistExpanded(event.currentTarget.open)} open={checklistExpanded || attempted || ['review', 'syndication'].includes(step) || issues.some(issue => issue.field === correctionField)} className="mt-3">
        <summary className="cursor-pointer font-semibold">What needs finishing?</summary>
        {basic.length ? <div className="mt-3"><p className="font-semibold">Listing details</p>{renderIssues(basic)}</div> : null}
        {advertising.length ? <div className="mt-3"><p className="font-semibold">For your selected websites</p>{renderIssues(advertising)}</div> : null}
      </details> : null}
    </section>
  }
  if (!visibleIssues.length) return null
  return <div ref={panelRef} aria-live="polite" className="rounded-lg border border-[#f1d4a6] bg-[#fffaf0] p-4 text-sm text-[#88531a]">
    <p className="font-semibold">Check these details</p>
    {renderIssues(visibleIssues)}
  </div>
}
