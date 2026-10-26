import { useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router-dom'
import MobileAppointmentCreateProvider from './MobileAppointmentCreateProvider.jsx'
import MobileLeadCreateProvider from './MobileLeadCreateProvider.jsx'
import MobileBottomNav from './MobileBottomNav'
import MobileHeader from './MobileHeader'
import './mobile-shell.css'

function scrollPageKey(location) {
  if (location.pathname !== '/mobile/marketing') return location.pathname
  const params = new URLSearchParams(location.search)
  const view = params.get('view') || ''
  // Marketing's complete pages share one pathname. Filters keep their position;
  // opening another workspace, form or report starts at its heading. Assigning
  // an ID to a newly saved draft must not move the editor under the user's hand.
  const fields = ['section', 'page', 'view', 'tab', 'collection', 'format', 'template', 'channelTemplate', 'starter', 'source']
  if (view !== 'create') fields.push('id')
  return JSON.stringify([location.pathname, ...fields.map((field) => params.get(field))])
}

export default function MobileLayout({ onLogout = null }) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const scrollRootRef = useRef(null)
  const contentRef = useRef(null)
  const positions = useRef(new Map())
  const previousPage = useRef(null)
  const pageKey = scrollPageKey(location)

  useLayoutEffect(() => {
    const root = scrollRootRef.current
    const saved = positions.current
    const previous = previousPage.current
    // Query changes open sheets and switch tabs without leaving the page.
    const target = navigationType === 'POP'
      ? saved.get(location.key) || 0
      : previous?.pageKey === pageKey ? previous.top : 0
    let restoring = true
    const restore = () => {
      if (!restoring) return
      root.scrollTo({ top: target, left: 0, behavior: 'instant' })
      restoring = root.scrollHeight - root.clientHeight < target
    }
    restore()
    // A returning list may still be loading. Retry as its content grows, but
    // stop immediately when the user starts interacting with the page.
    const observer = new ResizeObserver(restore)
    observer.observe(contentRef.current)
    const remember = () => {
      const top = restoring ? target : root.scrollTop
      saved.set(location.key, top)
      previousPage.current = { pageKey, top }
    }
    const stopRestoring = () => { restoring = false }
    const onKeyDown = (event) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) stopRestoring()
    }
    remember()
    root.addEventListener('scroll', remember, { passive: true })
    root.addEventListener('touchstart', stopRestoring, { passive: true })
    root.addEventListener('pointerdown', stopRestoring, { passive: true })
    root.addEventListener('wheel', stopRestoring, { passive: true })
    root.addEventListener('keydown', onKeyDown)
    return () => {
      remember()
      observer.disconnect()
      root.removeEventListener('scroll', remember)
      root.removeEventListener('touchstart', stopRestoring)
      root.removeEventListener('pointerdown', stopRestoring)
      root.removeEventListener('wheel', stopRestoring)
      root.removeEventListener('keydown', onKeyDown)
      // Bound memory for long sessions; positions are local to this shell.
      if (saved.size > 100) saved.delete(saved.keys().next().value)
    }
  }, [location.key, location.pathname, navigationType, pageKey])

  return (
    <MobileLeadCreateProvider><MobileAppointmentCreateProvider><div className="mobile-shell flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-white text-[#10243a]" data-mobile-shell>
      <MobileHeader />
      <main
        ref={scrollRootRef}
        className="mx-auto min-h-0 w-full max-w-[520px] flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-0 [-webkit-overflow-scrolling:touch]"
        data-mobile-scroll-root
      >
        <div ref={contentRef} className="min-w-0 flow-root" data-mobile-page-content>
          <Outlet context={{ onLogout }} />
        </div>
      </main>
      <MobileBottomNav key={location.key} />
    </div></MobileAppointmentCreateProvider></MobileLeadCreateProvider>
  )
}
