import { useLayoutEffect, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Recovery belongs to a particular visit to New listing, not to every new
// listing in the organisation. History state survives refresh but a new
// navigation receives a new entry. Replace-only URL cleanup keeps the visit.
export default function useListingCaptureSession() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const [session, setSession] = useState(() => {
    const stored = window.history.state?.listingCaptureSession
    return { key: location.key, path: location.pathname, search: location.search, id: stored?.key === location.key && stored?.path === location.pathname ? stored.id : crypto.randomUUID() }
  })
  let current = session
  if (session.key !== location.key || session.path !== location.pathname) {
    const stored = window.history.state?.listingCaptureSession
    const previous = session
    const id = previous?.path === location.pathname && previous.search !== location.search && navigationType === 'REPLACE'
      ? previous.id
      : stored?.key === location.key && stored?.path === location.pathname
        ? stored.id
        : crypto.randomUUID()
    current = { key: location.key, path: location.pathname, search: location.search, id }
    setSession(current)
  }
  useLayoutEffect(() => {
    window.history.replaceState({ ...window.history.state, listingCaptureSession: current }, '')
  }, [current])
  return current.id
}
