import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { registerListingNavigationGuard } from '../services/listings/listingNavigationGuard'
import { UNSAFE_NavigationContext } from 'react-router-dom'
import { hasPendingListingRecoveryPhotos, saveListingRecoveryDraft, writeListingTextRecoveryDraft } from '../services/listings/listingDraftRecovery'

function containsFile(value) {
  if (value instanceof Blob) return true
  return Boolean(value && typeof value === 'object' && Object.values(value).some(containsFile))
}

export default function useListingRecoveryProtection({ enabled, scope, form, recovery, photoField = 'listingImages', onWarning, requireSaved = false, onLeaveRequested }) {
  const leaveRequestedRef = useRef(onLeaveRequested)
  leaveRequestedRef.current = onLeaveRequested
  const navigation = useContext(UNSAFE_NavigationContext)
  const latest = useRef(null)
  const flushRef = useRef(() => {})
  const protectedRef = useRef(false)
  const confirmedForm = useRef(null)
  const unsavedRef = useRef(false)
  const [status, setStatus] = useState('idle')
  const signature = JSON.stringify({ form, recovery })

  useLayoutEffect(() => {
    if (!enabled || form === confirmedForm.current) { protectedRef.current = false; unsavedRef.current = false; latest.current = null; return }
    unsavedRef.current = requireSaved
    let snapshot
    try { snapshot = writeListingTextRecoveryDraft(scope, { form, recovery, photoField }) }
    catch {
      protectedRef.current = true
      setStatus('error')
      onWarning('Automatic recovery could not save your latest changes. Keep this tab open until the listing is saved.')
      return
    }
    const pendingPhotos = hasPendingListingRecoveryPhotos(scope, form, photoField)
    const otherFiles = Object.entries(form).some(([key, value]) => key !== photoField && containsFile(value))
    protectedRef.current = pendingPhotos || otherFiles
    setStatus(pendingPhotos ? 'photos' : otherFiles ? 'files' : 'device')
    latest.current = { scope, form, recovery, photoField, snapshot }
    const persist = () => {
      const captured = latest.current
      if (!captured) return
      void saveListingRecoveryDraft(captured.scope, captured).then(() => {
        if (latest.current === captured) { protectedRef.current = otherFiles; setStatus(otherFiles ? 'files' : 'device') }
      }).catch(() => {
        if (latest.current === captured && pendingPhotos) {
          protectedRef.current = true
          setStatus('error')
          onWarning('Photo recovery could not finish. Keep this tab open until the listing is saved, or reselect the photos when you return.')
        }
      })
    }
    flushRef.current = persist
    const timer = setTimeout(persist, 300)
    return () => clearTimeout(timer)
  }, [enabled, scope, signature, form, recovery, photoField, onWarning, requireSaved])

  useLayoutEffect(() => () => {
    if (latest.current?.scope === scope) flushRef.current()
  }, [scope])

  useEffect(() => {
    if (!enabled) return
    const beforeUnload = event => {
      if (!protectedRef.current && !unsavedRef.current) return
      event.preventDefault(); event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    const navigator = navigation?.navigator
    const leaveMessage = () => protectedRef.current
      ? 'Some changes or selected files are not yet protected by recovery. Leave this listing anyway?'
      : 'Your latest changes are kept on this device, but have not been saved to Listings. Leave without saving?'
    const editorPath = window.location.pathname
    let historyIndex = window.history.state?.idx
    let returning = false
    let approvedPop = false
    let pendingPop = null
    const popState = event => {
      if (returning) { returning = false; event.stopImmediatePropagation(); const resume = pendingPop; pendingPop = null; if (resume) leaveRequestedRef.current(resume); return true }
      const nextIndex = window.history.state?.idx
      if (approvedPop) { approvedPop = false; historyIndex = nextIndex; return }
      const needsProtection = protectedRef.current || (unsavedRef.current && window.location.pathname !== editorPath)
      if (needsProtection && Number.isInteger(historyIndex) && Number.isInteger(nextIndex) && nextIndex !== historyIndex) {
        const delta = nextIndex - historyIndex
        if (leaveRequestedRef.current) {
          event.stopImmediatePropagation()
          pendingPop = () => { approvedPop = true; window.history.go(delta) }
          returning = true
          window.history.go(-delta)
          return true
        }
        if (!window.confirm(leaveMessage())) {
          event.stopImmediatePropagation()
          returning = true
          window.history.go(-delta)
          return true
        }
      }
      historyIndex = nextIndex
    }
    const unregisterPopState = registerListingNavigationGuard(popState)
    const originals = {}
    const wrappers = {}
    for (const method of ['push', 'replace', 'go']) {
      if (!navigator?.[method]) continue
      originals[method] = navigator[method]
      wrappers[method] = function (...args) {
        const destination = args[0]
        const destinationPath = typeof destination === 'string' ? new URL(destination, window.location.href).pathname : destination?.pathname
        const leavingEditor = method === 'go' || destinationPath !== editorPath
        if (protectedRef.current || (unsavedRef.current && leavingEditor)) {
          if (leaveRequestedRef.current) {
            leaveRequestedRef.current(() => {
              if (method === 'go') approvedPop = true
              const result = originals[method].apply(this, args)
              historyIndex = window.history.state?.idx
              return result
            })
            return
          }
          if (!window.confirm(leaveMessage())) return
        }
        if (method === 'go') approvedPop = true
        const result = originals[method].apply(this, args)
        historyIndex = window.history.state?.idx
        return result
      }
      navigator[method] = wrappers[method]
    }
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      unregisterPopState()
      for (const method of Object.keys(originals)) if (navigator[method] === wrappers[method]) navigator[method] = originals[method]
    }
  }, [enabled, navigation])

  return { status, markSaved: () => { confirmedForm.current = latest.current?.form || form; protectedRef.current = false; unsavedRef.current = false; latest.current = null; setStatus('idle') } }
}
