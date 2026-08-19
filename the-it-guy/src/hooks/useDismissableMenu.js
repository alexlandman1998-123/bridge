import { useEffect } from 'react'

function eventTargetIsInsideRefs(event, refs = []) {
  const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : []

  return refs.some((ref) => {
    const element = ref?.current
    if (!element) return false
    if (eventPath.includes(element)) return true
    return event.target instanceof Node && element.contains(event.target)
  })
}

export default function useDismissableMenu({ open, refs = [], onDismiss }) {
  useEffect(() => {
    if (!open) return undefined

    function dismiss() {
      onDismiss?.()
    }

    function handlePointerDown(event) {
      if (!eventTargetIsInsideRefs(event, refs)) {
        dismiss()
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        dismiss()
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        dismiss()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('mousedown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', dismiss)
    window.addEventListener('pagehide', dismiss)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('mousedown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', dismiss)
      window.removeEventListener('pagehide', dismiss)
    }
  }, [onDismiss, open, refs])
}
