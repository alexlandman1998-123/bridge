import { useEffect, useRef, useState } from 'react'
import { claimMobileReward, getMobileMomentum, playMobileFeedback, readMobileSound, sastProgressDay, saveMobileSound, unlockMobileAudio } from '../../services/mobileMomentumService.js'

export default function useMobileMomentum({ scope, today, leads, leadsAvailable, contactedLeadIds = [], available }) {
  const [settings, setSettings] = useState(() => readMobileSound(scope))
  const [taskChanges, setTaskChanges] = useState({})
  const [contactChanges, setContactChanges] = useState([])
  const savedTasks = useRef({})
  const savedContacts = useRef([])
  const [feedback, setFeedback] = useState(null)
  const feedbackTimer = useRef(null)
  const leadBaseline = useRef(null)
  const taskBaseline = useRef(false)
  const activeDay = sastProgressDay()
  const changesDay = useRef(activeDay)
  // Ignore yesterday's temporary overlays until the midnight snapshot reloads.
  const model = getMobileMomentum({ today, leads, contactedLeadIds,
    taskChanges: changesDay.current === activeDay ? taskChanges : {},
    contactChanges: changesDay.current === activeDay ? contactChanges : [],
  })

  function announce(kind, message, id) {
    window.clearTimeout(feedbackTimer.current)
    setFeedback({ kind, message, id })
    playMobileFeedback(kind, settings)
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 3200)
  }

  useEffect(() => () => window.clearTimeout(feedbackTimer.current), [])

  useEffect(() => {
    if (!scope || !available || taskBaseline.current) return
    taskBaseline.current = true
    const tasks = (today.taskChecklist || []).filter(task => task.dueOnToday !== false)
    tasks.filter(task => task.completed).forEach(task => claimMobileReward(scope, 'task', task.id))
    if (tasks.length && tasks.every(task => task.completed)) claimMobileReward(scope, 'clear', 'today')
  }, [scope, available, today.taskChecklist])

  useEffect(() => {
    if (!scope || !leadsAvailable) return
    const ids = leads.map(lead => lead.leadId).filter(Boolean)
    if (!leadBaseline.current) {
      leadBaseline.current = new Set(ids)
      // Existing leads are a silent baseline, including on remount/refresh.
      ids.forEach(id => claimMobileReward(scope, 'lead', id))
      return
    }
    const arrivals = ids.filter(id => !leadBaseline.current.has(id))
    arrivals.forEach(id => leadBaseline.current.add(id))
    const fresh = arrivals.filter(id => claimMobileReward(scope, 'lead', id))
    if (fresh.length && document.visibilityState !== 'hidden') announce('lead', `${fresh.length === 1 ? 'A new lead is' : `${fresh.length} new leads are`} ready for you.`, fresh.join(':'))
    // Settings changes never replay arrivals; only a changed lead snapshot does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, leads, leadsAvailable])

  function changeSettings(patch) {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveMobileSound(scope, next)
    if (next.enabled) void unlockMobileAudio()
  }

  function confirmed(kind, item, completed = true) {
    if (changesDay.current !== activeDay) {
      changesDay.current = activeDay
      setTaskChanges({})
      setContactChanges([])
      savedTasks.current = {}
      savedContacts.current = []
    }
    if (kind === 'task') {
      savedTasks.current = { ...savedTasks.current, [item.id]: { ...item, completed } }
      setTaskChanges(savedTasks.current)
      if (!completed) {
        window.clearTimeout(feedbackTimer.current)
        setFeedback(null)
        return
      }
    } else {
      savedContacts.current = [...new Set([...savedContacts.current, item.leadId])]
      setContactChanges(savedContacts.current)
    }
    const id = kind === 'task' ? item.id : item.leadId
    if (!claimMobileReward(scope, kind, id)) return
    const next = getMobileMomentum({ today, leads, contactedLeadIds, taskChanges: savedTasks.current, contactChanges: savedContacts.current })
    if (kind === 'task' && item.dueOnToday !== false && available && next.totalTasks > 0 && next.doneTasks === next.totalTasks && claimMobileReward(scope, 'clear', 'today')) {
      announce('clear', 'You’re clear for today. All due tasks are done.', id)
    } else announce(kind, kind === 'task' ? 'Task complete. Nice work.' : 'Buyer contacted. Your journey is moving forward.', id)
  }

  return { settings, changeSettings, confirmed, feedback, model, available, day: activeDay,
    preview: async () => { if (await unlockMobileAudio()) return playMobileFeedback('lead', settings); return false },
    arm: () => { if (settings.enabled) void unlockMobileAudio() },
  }
}
