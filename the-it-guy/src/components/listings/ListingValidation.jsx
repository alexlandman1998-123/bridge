import { createContext, useContext, useEffect, useRef } from 'react'
import { listingFieldId } from './useListingIssueNavigation'

const ValidationContext = createContext([])
export function ListingValidationProvider({ value, children }) {
  return <ValidationContext.Provider value={value}>{children}</ValidationContext.Provider>
}
export function ListingValidationTarget({ field, children, className = '' }) {
  const issues = useContext(ValidationContext).filter((issue) => issue.field === field)
  const id = listingFieldId(field)
  const ref = useRef(null)
  useEffect(() => {
    const control = ref.current?.querySelector('input:not([type="hidden"]), select, textarea') || ref.current?.querySelector('button')
    if (!control || !issues.length) return
    const describedBy = control.getAttribute('aria-describedby')
    const invalid = control.getAttribute('aria-invalid')
    control.setAttribute('aria-describedby', [describedBy, `${id}-errors`].filter(Boolean).join(' '))
    control.setAttribute('aria-invalid', 'true')
    return () => {
      if (describedBy === null) control.removeAttribute('aria-describedby')
      else control.setAttribute('aria-describedby', describedBy)
      if (invalid === null) control.removeAttribute('aria-invalid')
      else control.setAttribute('aria-invalid', invalid)
    }
  }, [id, issues.length])
  return <div ref={ref} id={id} tabIndex={-1} className={`scroll-mt-24 rounded-lg ${issues.length ? 'border border-[#e9b7b7] p-3' : ''} ${className}`} aria-describedby={issues.length ? `${id}-errors` : undefined}>
    {children}
    {issues.length ? <div id={`${id}-errors`} className="mt-2 space-y-1 text-sm font-semibold text-[#9f3131]" role="status">{issues.map((issue) => <p key={issue.code}>{issue.message}</p>)}</div> : null}
  </div>
}

export function ListingValidationSummary({ issues = [], onFix, title = 'Please fix these fields before continuing' }) {
  if (!issues.length) return null
  return <div className="rounded-xl border border-[#e9b7b7] bg-[#fff7f7] p-4" role="alert">
    <p className="text-sm font-semibold text-[#9f3131]">{title}</p>
    <ul className="mt-2 space-y-2">{issues.map((issue) => <li key={issue.code}><button type="button" className="text-left text-sm font-semibold text-[#9f3131] underline underline-offset-2" onClick={() => onFix(issue)}>{issue.message} — Fix here</button></li>)}</ul>
  </div>
}
