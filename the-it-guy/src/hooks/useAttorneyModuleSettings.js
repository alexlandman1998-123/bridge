import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_ATTORNEY_MODULE_SETTINGS } from '../lib/attorneyModuleSettings'
import {
  ATTORNEY_MODULE_SETTINGS_UPDATED_EVENT,
  fetchCurrentAttorneyModuleSettings,
  updateCurrentAttorneyModuleSettings,
} from '../services/attorneyModuleSettingsService'

const DEFAULT_STATE = {
  loading: false,
  saving: false,
  error: '',
  firm: null,
  organisationId: '',
  modules: { ...DEFAULT_ATTORNEY_MODULE_SETTINGS },
  persisted: false,
}

export default function useAttorneyModuleSettings({ enabled = true } = {}) {
  const [state, setState] = useState(() => ({ ...DEFAULT_STATE }))

  const refresh = useCallback(async () => {
    if (!enabled) return null
    setState((previous) => ({ ...previous, loading: true, error: '' }))
    try {
      const result = await fetchCurrentAttorneyModuleSettings()
      setState((previous) => ({
        ...previous,
        loading: false,
        error: '',
        firm: result.firm,
        organisationId: result.organisationId,
        modules: result.modules,
        persisted: result.persisted,
      }))
      return result
    } catch (error) {
      setState((previous) => ({
        ...previous,
        loading: false,
        error: error?.message || 'Unable to load attorney module settings.',
      }))
      return null
    }
  }, [enabled])

  const updateModules = useCallback(async (modules = {}) => {
    if (!enabled) return null
    setState((previous) => ({
      ...previous,
      saving: true,
      error: '',
      modules: {
        ...previous.modules,
        ...modules,
      },
    }))
    try {
      const result = await updateCurrentAttorneyModuleSettings(modules)
      setState((previous) => ({
        ...previous,
        saving: false,
        error: '',
        firm: result.firm,
        organisationId: result.organisationId,
        modules: result.modules,
        persisted: result.persisted,
      }))
      return result
    } catch (error) {
      setState((previous) => ({
        ...previous,
        saving: false,
        error: error?.message || 'Unable to update attorney module settings.',
      }))
      throw error
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return undefined
    let active = true
    void refresh().then((result) => {
      if (!active || !result) return
      setState((previous) => ({ ...previous, modules: result.modules }))
    })
    return () => {
      active = false
    }
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined
    function handleUpdate(event) {
      const result = event.detail || {}
      setState((previous) => ({
        ...previous,
        firm: result.firm || previous.firm,
        organisationId: result.organisationId || previous.organisationId,
        modules: result.modules || previous.modules,
        persisted: result.persisted ?? previous.persisted,
      }))
    }
    window.addEventListener(ATTORNEY_MODULE_SETTINGS_UPDATED_EVENT, handleUpdate)
    return () => window.removeEventListener(ATTORNEY_MODULE_SETTINGS_UPDATED_EVENT, handleUpdate)
  }, [enabled])

  return useMemo(() => ({
    ...state,
    refresh,
    updateModules,
  }), [refresh, state, updateModules])
}
