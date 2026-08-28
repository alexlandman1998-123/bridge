import { useCallback, useEffect, useRef } from 'react'

export function isRouteQueryAbortError(error) {
  return error?.name === 'AbortError' || /aborted|aborterror/i.test(String(error?.message || ''))
}

export function useRouteQueryOwner(ownerKey = '') {
  const controllersRef = useRef(new Map())

  useEffect(() => {
    const controllers = controllersRef.current
    return () => {
      for (const controller of controllers.values()) controller.abort()
      controllers.clear()
    }
  }, [])

  return useCallback(async (queryKey, loader) => {
    const key = `${String(ownerKey || 'route')}:${String(queryKey || 'query')}`
    controllersRef.current.get(key)?.abort()
    const controller = new AbortController()
    controllersRef.current.set(key, controller)
    try {
      return await loader(controller.signal)
    } finally {
      if (controllersRef.current.get(key) === controller) controllersRef.current.delete(key)
    }
  }, [ownerKey])
}
