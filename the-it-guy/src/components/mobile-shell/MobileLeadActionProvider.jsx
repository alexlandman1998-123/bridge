import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Modal from '../ui/Modal.jsx'
import AppErrorBoundary from '../AppErrorBoundary.jsx'
import './mobile-lead-action-module.css'

import { MobileLeadActionContext } from './mobileLeadActionContext.js'

const BUYER_TABS = { contacted: 'activity', qualified: 'overview', viewing: 'appointments', buyer_onboarding_sent: 'buyer_profile', buyer_onboarding_submitted: 'buyer_profile', offer: 'documents', buyer_documents_uploaded: 'documents', transaction: 'overview' }
const TENANT_TABS = { contacted: 'Activity', qualified: 'Overview', viewing: 'Appointments', application_pending: 'Application', application_submitted: 'Application', lease: 'Application', tenancy: 'Application' }

export default function MobileLeadActionProvider({ children, renderWorkspace }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [active, setActive] = useState(null)
  const [revision, setRevision] = useState(0)
  const bodyRef = useRef(null)
  const openLeadAction = useCallback(({ leadId, rental = false, stageKey = '' }) => {
    const tab = (rental ? TENANT_TABS : BUYER_TABS)[stageKey] || (rental ? 'Overview' : 'overview')
    setActive({ leadId, rental, pathname: location.pathname, previousSearch: location.search, focusNextAction: !stageKey })
    const query = new URLSearchParams(location.search)
    query.set('tab', tab)
    navigate({ pathname: location.pathname, search: `?${query}` }, { replace: true })
  }, [location.pathname, location.search, navigate])
  const close = useCallback(() => {
    if (!active || document.querySelectorAll('[role="dialog"][aria-modal="true"]').length > 1) return
    setActive(null)
    setRevision(value => value + 1)
    if (location.pathname === active.pathname) navigate({ pathname: active.pathname, search: active.previousSearch }, { replace: true })
  }, [active, location.pathname, navigate])
  useEffect(() => {
    if (!active?.focusNextAction || !bodyRef.current) return undefined
    const body = bodyRef.current
    let focused = false
    const showNextAction = () => {
      const target = body.querySelector('[data-mobile-next-best-action]')
      if (!target || focused) return
      focused = true
      target.scrollIntoView?.({ block: 'start' })
    }
    const observer = new MutationObserver(showNextAction)
    observer.observe(body, { childList: true, subtree: true })
    showNextAction()
    return () => observer.disconnect()
  }, [active])
  const value = useMemo(() => ({ openLeadAction, revision }), [openLeadAction, revision])
  return <MobileLeadActionContext.Provider value={value}>
    {children}
    <Modal open={Boolean(active)} onClose={close} title={active?.rental ? 'Tenant next action' : 'Buyer next action'} className={`mobile-lead-action-module${active?.rental ? ' mobile-tenant-action-module' : ''}`}>
      {active && <div ref={bodyRef} className="mobile-lead-action-workspace"><AppErrorBoundary key={`${active.leadId}:${active.rental}`} scope="mobile-lead-actions" title="Lead actions could not be opened"><Suspense fallback={<p role="status">Loading lead actions…</p>}>{renderWorkspace(active)}</Suspense></AppErrorBoundary></div>}
    </Modal>
  </MobileLeadActionContext.Provider>
}
