import { useCallback, useEffect, useMemo, useState } from 'react'
import { canPersistMarketingEvents, createMarketingEvent, listMarketingEvents, updateMarketingEvent, updateMarketingEventChecklist } from '../services/marketingEventRepository'
import { assertMarketingEventPublicationReadiness } from '../services/marketingEventReadinessService'

const STORAGE_KEY = 'arch9.marketing-events.v1'

const clone = (value) => JSON.parse(JSON.stringify(value))

function loadEvents(kind, seed) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return Array.isArray(stored[kind]) ? stored[kind] : clone(seed)
  } catch {
    return clone(seed)
  }
}

function saveEvents(kind, events) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, [kind]: events }))
  } catch {
    // Local event planning remains usable for this session when storage is unavailable.
  }
}

export function useMarketingEvents(kind, seed, { organisationId = '' } = {}) {
  const [events, setEvents] = useState(() => loadEvents(kind, seed))
  const [persistenceError, setPersistenceError] = useState('')
  const persisted = canPersistMarketingEvents(organisationId)

  useEffect(() => { saveEvents(kind, events) }, [events, kind])

  useEffect(() => {
    if (!persisted) return
    let cancelled = false
    listMarketingEvents(organisationId, kind)
      .then((records) => { if (!cancelled) setEvents(records) })
      .catch((error) => { if (!cancelled) setPersistenceError(error?.message || 'Could not load shared events.') })
    return () => { cancelled = true }
  }, [kind, organisationId, persisted])

  const createEvent = useCallback(async (values) => {
    assertMarketingEventPublicationReadiness(values, kind)
    if (persisted) {
      try {
        const event = await createMarketingEvent(organisationId, kind, values)
        setEvents((current) => [event, ...current])
        return event
      } catch (error) {
        setPersistenceError(error?.message || 'Could not save shared event.')
        throw error
      }
    }
    const event = {
      id: `${kind}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...values,
    }
    setEvents((current) => [event, ...current])
    return event
  }, [kind, organisationId, persisted])

  const updateEvent = useCallback((id, values) => {
    assertMarketingEventPublicationReadiness(values, kind)
    if (!persisted) {
      setEvents((current) => current.map((event) => event.id === id ? { ...event, ...values, updatedAt: new Date().toISOString() } : event))
      return Promise.resolve(null)
    }
    return updateMarketingEvent(id, values).then((event) => {
      setEvents((current) => current.map((currentEvent) => currentEvent.id === id ? event : currentEvent))
      return event
    }).catch((error) => {
      setPersistenceError(error?.message || 'Could not update shared event.')
      throw error
    })
  }, [kind, persisted])

  const refreshEvents = useCallback(async () => {
    if (!persisted) return events
    try {
      const nextEvents = await listMarketingEvents(organisationId, kind)
      setEvents(nextEvents)
      return nextEvents
    } catch (error) {
      setPersistenceError(error?.message || 'Could not refresh shared events.')
      throw error
    }
  }, [events, kind, organisationId, persisted])

  const updateEventChecklist = useCallback((id, checklist) => {
    if (!persisted) {
      setEvents((current) => current.map((event) => event.id === id ? { ...event, checklist, updatedAt: new Date().toISOString() } : event))
      return Promise.resolve(null)
    }
    return updateMarketingEventChecklist(id, checklist).then((event) => {
      setEvents((current) => current.map((currentEvent) => currentEvent.id === id ? event : currentEvent))
      return event
    }).catch((error) => {
      setPersistenceError(error?.message || 'Could not save the event checklist.')
      throw error
    })
  }, [persisted])

  return useMemo(() => ({ events, createEvent, updateEvent, updateEventChecklist, refreshEvents, persisted, persistenceError }), [createEvent, events, persisted, persistenceError, refreshEvents, updateEvent, updateEventChecklist])
}

export function formatEventDate(value) {
  if (!value) return 'Date to be confirmed'
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

export function eventDateInput(event) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(event?.date || '')) return event.date
  return ''
}
