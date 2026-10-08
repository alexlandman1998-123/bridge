import { useEffect, useState } from 'react'

export const listingFieldId = (field) => `listing-field-${field}`

export function focusListingField(field) {
  const container = document.getElementById(listingFieldId(field))
  if (!container) return false
  for (let parent = container.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') parent.open = true
  }
  container.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  const control = container.querySelector('input:not([type="hidden"]):not(.hidden), select, textarea') || container.querySelector('button')
  ;(control || container).focus({ preventScroll: true })
  return true
}

export function useListingIssueNavigation(step, openStep, { ready = true, search = '' } = {}) {
  const [request, setRequest] = useState(() => {
    const params = new URLSearchParams(search)
    return params.get('field') ? { step: params.get('step') || step, field: params.get('field'), message: params.get('issue') || '', code: 'portal-readiness' } : null
  })
  useEffect(() => {
    if (ready && request?.step === step) focusListingField(request.field)
  }, [request, step, ready])
  return {
    focusRequest: request,
    clearIssueForChange: (event) => {
      if (!request?.message) return
      const target = document.getElementById(listingFieldId(request.field))
      if (target?.contains(event.target)) setRequest({ ...request, message: '' })
    },
    openIssue: (issue) => {
      openStep(issue.step)
      setRequest({ ...issue })
    },
  }
}
