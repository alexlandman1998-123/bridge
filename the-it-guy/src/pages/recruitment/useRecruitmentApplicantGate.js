import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { checkRecruitmentApplicantGate } from './recruitmentApplicantGateCheck'

const CHECK_TIMEOUT_MS = 10_000
const FOCUS_CHECK_INTERVAL_MS = 60_000
const RETRY_BASE_MS = 15_000
const RETRY_MAX_MS = 120_000

export default function useRecruitmentApplicantGate(session) {
  const id = session?.user?.id || null
  const [state, setState] = useState({ id: null, required: false, error: false, pending: false, retryAt: 0 })
  const [now, setNow] = useState(Date.now)
  const retryRef = useRef(null)
  useEffect(() => {
    if (!id) {
      setState({ id: null, required: false, error: false, pending: false, retryAt: 0 })
      return undefined
    }
    let active = true
    let pending = false
    let failures = 0
    let nextCheckAt = 0
    let controller
    let deadlineTimer
    let stopWaiting

    async function check() {
      if (!active || pending || Date.now() < nextCheckAt) return
      pending = true
      controller = new AbortController()
      setState(previous => ({ ...previous, pending: true }))
      let result
      try {
        const deadline = new Promise(resolve => {
          stopWaiting = () => resolve({ required: false, error: true })
          deadlineTimer = setTimeout(() => {
            controller.abort()
            stopWaiting()
          }, CHECK_TIMEOUT_MS)
        })
        result = await Promise.race([
          checkRecruitmentApplicantGate(supabase, id, {
            development: import.meta.env.DEV,
            listingPreview: import.meta.env.VITE_LOCAL_LISTING_PREVIEW === 'true',
            signal: controller.signal,
          }),
          deadline,
        ])
      } catch {
        result = { required: false, error: true }
      } finally {
        clearTimeout(deadlineTimer)
        pending = false
      }
      if (!active) return
      const completedAt = Date.now()
      failures = result.error ? failures + 1 : 0
      nextCheckAt = completedAt + (result.error
        ? Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** (failures - 1)))
        : FOCUS_CHECK_INTERVAL_MS)
      setNow(completedAt)
      setState({ id, ...result, pending: false, retryAt: result.error ? nextCheckAt : 0 })
    }
    const onFocus = () => { void check() }
    retryRef.current = onFocus
    void check()
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      controller?.abort()
      stopWaiting?.()
      clearTimeout(deadlineTimer)
      retryRef.current = null
      window.removeEventListener('focus', onFocus)
    }
  }, [id])

  useEffect(() => {
    if (!id || state.id !== id || !state.error || !state.retryAt) return undefined
    const timer = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= state.retryAt) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [id, state.id, state.error, state.retryAt])

  const retry = useCallback(() => retryRef.current?.(), [])
  return {
    checking: !!id && state.id !== id,
    required: !!id && state.id === id && state.required,
    error: !!id && state.id === id && state.error,
    retrying: !!id && state.id === id && state.pending,
    retryAfterSeconds: id && state.id === id ? Math.max(0, Math.ceil((state.retryAt - now) / 1000)) : 0,
    retry,
  }
}
