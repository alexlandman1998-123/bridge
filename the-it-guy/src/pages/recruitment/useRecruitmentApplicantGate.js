import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { checkRecruitmentApplicantGate } from './recruitmentApplicantGateCheck'

// The observed production stall was 16 seconds. Keep one bounded request alive
// long enough to accept its verified result instead of discarding it at 10s.
const CHECK_TIMEOUT_MS = 20_000
const SLOW_CHECK_MS = 8_000
const RECOVERY_DELAYS_MS = [2_000, 5_000]
const FOCUS_CHECK_INTERVAL_MS = 60_000
const RETRY_BASE_MS = 15_000
const RETRY_MAX_MS = 120_000

export default function useRecruitmentApplicantGate(session) {
  const id = session?.user?.id || null
  const [state, setState] = useState({ id: null, required: false, error: false, pending: false, retryAt: 0, recovering: false, slow: false })
  const [now, setNow] = useState(Date.now)
  const retryRef = useRef(null)
  useEffect(() => {
    if (!id) {
      setState({ id: null, required: false, error: false, pending: false, retryAt: 0, recovering: false, slow: false })
      return undefined
    }
    let active = true
    let pending = false
    let failures = 0
    let automaticRetries = 0
    let recovering = false
    let lastFailureRetryable = false
    let nextCheckAt = 0
    let controller
    let deadlineTimer
    let slowTimer
    let recoveryTimer
    let stopWaiting

    async function check({ resetBudget = false } = {}) {
      if (!active || pending || Date.now() < nextCheckAt) return
      clearTimeout(recoveryTimer)
      recoveryTimer = undefined
      if (resetBudget) automaticRetries = 0
      pending = true
      controller = new AbortController()
      setState(previous => ({ ...previous, pending: true, slow: false }))
      slowTimer = setTimeout(() => {
        if (active && pending) setState(previous => ({ ...previous, slow: true }))
      }, SLOW_CHECK_MS)
      let result
      try {
        const deadline = new Promise(resolve => {
          stopWaiting = () => resolve({ required: false, error: true, retryable: true })
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
        result = { required: false, error: true, retryable: true }
      } finally {
        clearTimeout(deadlineTimer)
        clearTimeout(slowTimer)
        pending = false
      }
      if (!active) return
      if (!result || typeof result.required !== 'boolean' || typeof result.error !== 'boolean') {
        result = { required: false, error: true, retryable: false }
      }
      const completedAt = Date.now()
      lastFailureRetryable = result.error && result.retryable === true
      if (lastFailureRetryable && automaticRetries < RECOVERY_DELAYS_MS.length) {
        const delay = RECOVERY_DELAYS_MS[automaticRetries++]
        recovering = true
        nextCheckAt = completedAt + delay
        setNow(completedAt)
        setState({ id, required: false, error: true, pending: false, retryAt: nextCheckAt, recovering: true, slow: false })
        recoveryTimer = setTimeout(() => { void check() }, delay)
        return
      }
      recovering = false
      failures = result.error ? failures + 1 : 0
      nextCheckAt = completedAt + (result.error
        ? Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** (failures - 1)))
        : FOCUS_CHECK_INTERVAL_MS)
      setNow(completedAt)
      setState({ id, required: result.error ? false : result.required, error: result.error, pending: false, retryAt: result.error ? nextCheckAt : 0, recovering: false, slow: false })
    }
    const onFocus = () => { if (!recovering) void check({ resetBudget: true }) }
    const onOnline = () => {
      if (!lastFailureRetryable || pending || recovering) return
      recovering = true
      setState(previous => ({ ...previous, recovering: true }))
      recoveryTimer = setTimeout(() => { void check({ resetBudget: true }) }, Math.max(0, nextCheckAt - Date.now()))
    }
    retryRef.current = onFocus
    void check()
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    return () => {
      active = false
      controller?.abort()
      stopWaiting?.()
      clearTimeout(deadlineTimer)
      clearTimeout(slowTimer)
      clearTimeout(recoveryTimer)
      retryRef.current = null
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
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
    checking: !!id && (state.id !== id || state.recovering),
    recovering: !!id && state.id === id && state.recovering,
    slow: !!id && state.slow,
    required: !!id && state.id === id && state.required,
    error: !!id && state.id === id && state.error,
    retrying: !!id && state.id === id && state.pending,
    retryAfterSeconds: id && state.id === id ? Math.max(0, Math.ceil((state.retryAt - now) / 1000)) : 0,
    retry,
  }
}
