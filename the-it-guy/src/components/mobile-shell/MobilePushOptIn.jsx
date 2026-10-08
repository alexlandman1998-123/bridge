import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useAuthSession } from '../../context/AuthSessionContext.jsx'
import { mobileWebPushService } from '../../services/mobileWebPushService.js'
import { setNotificationPreference } from '../../services/mobileProductivityService.js'
import { MobileCard } from './MobileShellStates.jsx'

export function MobilePushOptIn() {
  const { user } = useAuthSession()
  const userId = user?.id
  const [state, setState] = useState({})
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const activeUser = useRef(userId)
  const current = state.userId === userId ? state : {}
  const enabled = Boolean(current.subscriptionId)

  useEffect(() => {
    let cancelled = false
    activeUser.current = userId
    setNotificationPreference(false)
    if (!userId) return
    mobileWebPushService.load(userId).then((result) => {
      if (cancelled) return
      setState({ ...result, userId })
      setNotificationPreference(Boolean(result.subscriptionId))
    }).catch((error) => {
      if (!cancelled) setState({ userId, message: error.message, unavailable: true })
    })
    return () => { cancelled = true }
  }, [userId, reload])

  async function run(action) {
    if (busy) return
    setBusy(true)
    try {
      if (action === 'enable') {
        const result = await mobileWebPushService.enable(userId, current.publicKey)
        if (activeUser.current !== userId) return
        setState({ ...result, userId, message: 'Notifications enabled on this device. You can now send yourself a test.' })
        setNotificationPreference(true)
      } else if (action === 'test') {
        const result = await mobileWebPushService.test(userId, current.subscriptionId)
        if (activeUser.current !== userId) return
        setState({ ...current, message: result.message })
      } else {
        const result = await mobileWebPushService.disable(userId, current.subscriptionId)
        if (activeUser.current !== userId) return
        setState({ ...current, subscriptionId: null, message: result?.message || 'Notifications disabled on this device.' })
        setNotificationPreference(false)
      }
    } catch (error) {
      if (activeUser.current !== userId) return
      const expired = [404, 410].includes(error.status)
      setState({ ...current, ...(expired ? { subscriptionId: null } : {}), message: error.message })
      if (expired) setNotificationPreference(false)
      if (expired || error.status === 409) setReload((value) => value + 1)
    } finally { setBusy(false) }
  }

  return (
    <MobileCard surface="dark">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-white"><Bell className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-white">Push Notifications</h2>
          <p className="mt-1 text-sm leading-6 text-[#dce8f2]">Enable notifications on this device and send yourself a test.</p>
        </div>
      </div>
      {!userId ? <p className="mt-3 text-sm text-[#dce8f2]">Sign in to enable notifications.</p> : (
        <div className="mt-4 flex flex-wrap gap-2">
          {enabled ? <>
            <button type="button" disabled={busy} className="min-h-11 rounded-2xl bg-white px-4 text-sm font-semibold text-[#10243a] disabled:opacity-60" onClick={() => run('test')}>{busy ? 'Please wait…' : 'Send me a test'}</button>
            <button type="button" disabled={busy} className="min-h-11 rounded-2xl border border-white/40 px-4 text-sm font-semibold text-white disabled:opacity-60" onClick={() => run('disable')}>Disable notifications</button>
          </> : current.unavailable ? (
            <button type="button" disabled={busy} className="min-h-11 rounded-2xl bg-white px-4 text-sm font-semibold text-[#10243a]" onClick={() => setReload((value) => value + 1)}>Check again</button>
          ) : (
            <button type="button" disabled={busy || !current.publicKey} className="min-h-11 rounded-2xl bg-white px-4 text-sm font-semibold text-[#10243a] disabled:opacity-60" onClick={() => run('enable')}>{busy ? 'Enabling…' : current.publicKey ? 'Enable Notifications' : 'Checking notifications…'}</button>
          )}
        </div>
      )}
      {current.message ? <p role="status" className="mt-3 text-sm text-[#dce8f2]">{current.message}</p> : null}
    </MobileCard>
  )
}
