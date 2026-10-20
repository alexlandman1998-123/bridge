export const DEFAULT_MOBILE_SOUND = Object.freeze({ enabled: false, quietHours: true, start: '20:00', end: '08:00' })
const memory = new Map()

export function sastProgressDay(now = new Date()) {
  return new Date(new Date(now).getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function read(key, fallback) {
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) : memory.get(key) || fallback
  } catch { return memory.get(key) || fallback }
}

function write(key, value) {
  memory.set(key, value)
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* Session memory remains usable. */ }
}

export function readMobileSound(scope) {
  const saved = read(`arch9:mobile-sound:${scope}`, {})
  return {
    enabled: saved?.enabled === true,
    quietHours: saved?.quietHours !== false,
    start: /^([01]\d|2[0-3]):[0-5]\d$/.test(saved?.start) ? saved.start : DEFAULT_MOBILE_SOUND.start,
    end: /^([01]\d|2[0-3]):[0-5]\d$/.test(saved?.end) ? saved.end : DEFAULT_MOBILE_SOUND.end,
  }
}

export function saveMobileSound(scope, settings) { write(`arch9:mobile-sound:${scope}`, settings) }

export function mobileSoundAllowed(settings, now = new Date()) {
  if (!settings.enabled) return false
  if (!settings.quietHours) return true
  const minute = (Date.parse(now) + 2 * 3600000) % 86400000 / 60000
  const parse = time => { const [h, m] = time.split(':').map(Number); return h * 60 + m }
  const start = parse(settings.start)
  const end = parse(settings.end)
  // Matching boundaries mean all-day quiet, rather than silently disabling it.
  const quiet = start === end || (start < end ? minute >= start && minute < end : minute >= start || minute < end)
  return !quiet
}

export function claimMobileReward(scope, kind, id, now = new Date()) {
  if (!scope || !id) return false
  const key = `arch9:mobile-rewards:${scope}`
  const day = sastProgressDay(now)
  const previous = read(key, {})
  const events = previous?.day === day && Array.isArray(previous.events) ? previous.events : []
  const event = `${kind}:${id}`
  if (events.includes(event)) return false
  write(key, { day, events: [...events, event] })
  return true
}

export function getMobileMomentum({ today, contactedLeadIds = [], leads = [], taskChanges = {}, contactChanges = [] }) {
  const tasks = new Map((today.taskChecklist || []).map(task => [task.id, task]))
  Object.values(taskChanges).forEach(task => tasks.set(task.id, task))
  const contacts = new Set([...contactedLeadIds, ...contactChanges])
  const pending = new Set(leads.filter(lead => lead.leadCategory === 'buyer' && !contacts.has(lead.leadId)).map(lead => lead.leadId))
  const dueToday = [...tasks.values()].filter(task => task.dueOnToday !== false)
  const overdueTasks = [...tasks.values()].filter(task => task.dueOnToday === false && !task.completed).length
  const totalTasks = dueToday.length
  const doneTasks = dueToday.filter(task => task.completed).length
  const total = totalTasks + contacts.size + pending.size
  return { totalTasks, doneTasks, overdueTasks, contacted: contacts.size, total, percent: total ? Math.round((doneTasks + contacts.size) / total * 100) : 0 }
}

let audio
// Only call from a direct user gesture (sound toggle, Preview or checkbox).
export async function unlockMobileAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext
    if (!Audio) return false
    if (!audio || audio.state === 'closed') audio = new Audio()
    if (audio.state === 'suspended') await audio.resume()
    return audio.state === 'running'
  } catch { return false }
}

export function playMobileFeedback(kind, settings, now = new Date()) {
  if (!mobileSoundAllowed(settings, now) || !audio || audio.state !== 'running' || document.visibilityState === 'hidden') return false
  try {
    // An original, short Arch9 motif. No external audio downloads or tracking.
    const notes = kind === 'task' ? [1174.66] : kind === 'clear' ? [659.25, 880, 1108.73, 1318.51] : [659.25, 880, 1108.73]
    notes.forEach((frequency, index) => {
      const start = audio.currentTime + index * .09
      const duration = kind === 'task' ? .065 : .24
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(.0001, start)
      gain.gain.exponentialRampToValueAtTime(.055, start + .008)
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration)
      oscillator.connect(gain)
      gain.connect(audio.destination)
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
      oscillator.start(start)
      oscillator.stop(start + duration + .02)
    })
    return true
  } catch { return false }
}
