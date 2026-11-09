import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { markRouteMilestone } from '../../lib/performanceTrace'
import { fetchDevelopmentOverview, fetchDevelopmentOverviewPage } from './overviewReadApi.js'
import { fetchDevelopmentDetailSection } from './detailSectionReadApi.js'

const definedFields = payload => Object.fromEntries(Object.entries(payload || {}).filter(([, value]) => value !== undefined))

// Each mounted scope owns its data and pending requests. The mutable request
// bookkeeping stays outside React's render; subscribers receive new snapshots.
function createDetailLoader({ developmentId, scopeKey, enabled }) {
  const context = { owner: `${scopeKey}:${developmentId}`, version: 0, data: null, loading: true, error: '', sections: {}, requested: new Set(), pending: new Map() }
  const listeners = new Set()
  let snapshot = { ...context }
  const publish = () => {
    if (context.disposed) return
    snapshot = { ...context }
    listeners.forEach(listener => listener())
  }

  const loadSections = async sections => {
    sections.forEach(section => context.requested.add(section))
    if (!context.data || context.loading || context.disposed) return
    const version = context.version
    const tasks = sections.map(section => {
      if (context.sections[section]?.status === 'ready') return undefined
      if (context.pending.has(section)) return context.pending.get(section)
      context.sections = { ...context.sections, [section]: { status: 'loading' } }
      const task = fetchDevelopmentDetailSection(developmentId, section).then(payload => {
        if (context.disposed || context.version !== version) return
        context.data = { ...context.data, ...definedFields(payload) }
        context.sections = { ...context.sections, [section]: { status: 'ready' } }
      }).catch(cause => {
        if (context.disposed || context.version !== version) return
        context.sections = { ...context.sections, [section]: { status: 'error', error: cause.message || 'This section could not be loaded.' } }
      }).finally(() => {
        if (context.version !== version) return
        context.pending.delete(section)
        publish()
      })
      context.pending.set(section, task)
      return task
    })
    publish()
    await Promise.all(tasks)
  }

  const loadData = async () => {
    const version = ++context.version
    context.pending.clear()
    context.sections = {}
    context.error = ''
    context.loading = true
    publish()
    if (!enabled) {
      context.loading = false
      publish()
      return
    }
    try {
      const response = await fetchDevelopmentOverview(developmentId)
      if (context.disposed || context.version !== version) return
      context.data = response ? { ...context.data, ...definedFields(response) } : null
      context.loading = false
      publish()
      markRouteMilestone('core_ready')
      // Refresh only sections that have been requested in this workspace.
      if (context.data) await loadSections([...context.requested])
    } catch (cause) {
      if (context.disposed || context.version !== version) return
      context.loading = false
      context.error = cause.message || 'The development could not be loaded.'
      context.sections = Object.fromEntries([...context.requested].map(section => [section, { status: 'error', error: context.error }]))
      publish()
    }
  }

  const setData = value => {
    if (context.disposed) return
    context.data = typeof value === 'function' ? value(context.data) : value
    publish()
  }
  const setError = error => { context.error = error; publish() }
  const setActiveSections = sections => {
    context.requested = new Set(sections)
    return loadSections(sections)
  }
  const refreshOverviewSummary = async () => {
    const version = context.version
    const sequence = context.summarySequence = (context.summarySequence || 0) + 1
    const response = await fetchDevelopmentOverviewPage(developmentId)
    if (context.disposed || context.version !== version || context.summarySequence !== sequence) return
    if (!response) throw new Error('Development access could not be confirmed. Please refresh.')
    context.data = { ...context.data, overviewSummary: response.overviewSummary,
      overviewAttentionRows: response.overviewAttentionRows, overviewRecentRows: response.overviewRecentRows }
    publish()
  }
  return {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => snapshot,
    start: () => { context.disposed = false; void loadData() },
    dispose: () => { context.disposed = true; context.version += 1 },
    loadData, loadSections, setActiveSections, refreshOverviewSummary, setData, setError,
  }
}

export function useDevelopmentDetailData({ developmentId, scopeKey, enabled }) {
  const loader = useMemo(() => createDetailLoader({ developmentId, scopeKey, enabled }), [developmentId, scopeKey, enabled])
  const current = useSyncExternalStore(loader.subscribe, loader.getSnapshot, loader.getSnapshot)
  useEffect(() => {
    loader.start()
    return loader.dispose
  }, [loader])
  return {
    data: current.data, loading: current.loading && !current.data, error: current.error,
    sections: current.sections,
    loadData: loader.loadData, loadSections: loader.loadSections, setActiveSections: loader.setActiveSections, refreshOverviewSummary: loader.refreshOverviewSummary, setData: loader.setData, setError: loader.setError,
  }
}
