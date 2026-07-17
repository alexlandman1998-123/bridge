/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions.js'
import {
  resolveAttorneyModulesFirmId,
  resolveAttorneyUserModuleCapabilities,
} from '../services/attorneyModuleCapabilities.js'
import {
  getAttorneyFirmModuleCapabilities,
  resolveAttorneyFirmModuleCapabilities,
} from '../services/attorneyFirmModulesService.js'
import { useWorkspace } from './WorkspaceContext.jsx'

const ATTORNEY_MODULES_CONTEXT_GLOBAL_KEY = '__arch9AttorneyModulesContextV1'
const AttorneyModulesContext =
  typeof globalThis !== 'undefined'
    ? (globalThis[ATTORNEY_MODULES_CONTEXT_GLOBAL_KEY] ||= createContext(null))
    : createContext(null)

function buildUnavailableFirmCapabilities(firmId = '') {
  return resolveAttorneyFirmModuleCapabilities([
    { firm_id: firmId, module_key: 'transfer', status: 'inactive' },
    { firm_id: firmId, module_key: 'bond', status: 'inactive' },
    { firm_id: firmId, module_key: 'cancellation', status: 'inactive' },
  ], { firmId })
}

export function AttorneyModulesProvider({ children }) {
  const workspaceContext = useWorkspace()
  const firmId = useMemo(
    () => resolveAttorneyModulesFirmId(workspaceContext),
    [workspaceContext],
  )
  const permissionState = useAttorneyPermissions({ firmId: firmId || null })
  const requestIdRef = useRef(0)
  const [moduleState, setModuleState] = useState(() => ({
    firmId: '',
    capabilities: buildUnavailableFirmCapabilities(''),
    loading: false,
    error: '',
  }))

  const loadModules = useCallback(async ({ silent = false } = {}) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (workspaceContext.role !== 'attorney') {
      const capabilities = buildUnavailableFirmCapabilities('')
      setModuleState({ firmId: '', capabilities, loading: false, error: '' })
      return capabilities
    }

    if (!workspaceContext.workspaceReady || workspaceContext.profileLoading || permissionState.loading) {
      setModuleState((previous) => ({ ...previous, loading: true, error: '' }))
      return null
    }

    if (permissionState.error) {
      const capabilities = buildUnavailableFirmCapabilities(firmId)
      setModuleState({
        firmId,
        capabilities,
        loading: false,
        error: permissionState.error,
      })
      return capabilities
    }

    if (!firmId) {
      const capabilities = buildUnavailableFirmCapabilities('')
      setModuleState({ firmId: '', capabilities, loading: false, error: '' })
      return capabilities
    }

    if (!silent) {
      setModuleState((previous) => ({
        ...previous,
        firmId,
        loading: true,
        error: '',
      }))
    }

    try {
      const capabilities = await getAttorneyFirmModuleCapabilities(firmId)
      if (requestIdRef.current === requestId) {
        setModuleState({ firmId, capabilities, loading: false, error: '' })
      }
      return capabilities
    } catch (loadError) {
      const capabilities = buildUnavailableFirmCapabilities(firmId)
      if (requestIdRef.current === requestId) {
        setModuleState({
          firmId,
          capabilities,
          loading: false,
          error: loadError?.message || 'Unable to load attorney firm modules.',
        })
      }
      return capabilities
    }
  }, [firmId, permissionState.error, permissionState.loading, workspaceContext.profileLoading, workspaceContext.role, workspaceContext.workspaceReady])

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      void loadModules()
    }, 0)
    return () => {
      window.clearTimeout(hydrationTimer)
      requestIdRef.current += 1
    }
  }, [loadModules])

  const userCapabilities = useMemo(() => resolveAttorneyUserModuleCapabilities({
    firmCapabilities: moduleState.capabilities,
    membershipActive: Boolean(permissionState.membership?.isActive),
    hasAttorneyPermission: permissionState.hasPermission,
    hasWorkspacePermission: (permission) => workspaceContext.can(permission),
  }), [moduleState.capabilities, permissionState.hasPermission, permissionState.membership?.isActive, workspaceContext])

  const refreshModules = useCallback(
    (options = {}) => loadModules({ silent: options.silent === true }),
    [loadModules],
  )

  const value = useMemo(() => ({
    firmId: moduleState.firmId || firmId || null,
    modules: moduleState.capabilities.modules,
    modulesByKey: moduleState.capabilities.byKey,
    activeModules: moduleState.capabilities.activeModules,
    operationalModules: moduleState.capabilities.operationalModules,
    enabledModules: moduleState.capabilities.enabledModules,
    inactiveModules: moduleState.capabilities.inactiveModules,
    acceptsNewWork: moduleState.capabilities.acceptsNewWork,
    isOperational: moduleState.capabilities.isOperational,
    firmCapabilities: moduleState.capabilities,
    userCapabilities,
    membership: permissionState.membership,
    attorneyRole: permissionState.role,
    permissions: permissionState.permissions,
    hasPermission: permissionState.hasPermission,
    canManageFirmModules: userCapabilities.canManageFirmModules,
    canViewHistoricalModule: userCapabilities.canViewHistoricalModule,
    canViewModule: userCapabilities.canViewModule,
    canCreateMatter: userCapabilities.canCreateMatter,
    canReceiveInstruction: userCapabilities.canReceiveInstruction,
    canEditWorkflow: userCapabilities.canEditWorkflow,
    loading: moduleState.loading || permissionState.loading,
    error: moduleState.error || permissionState.error || '',
    refreshModules,
  }), [firmId, moduleState, permissionState.error, permissionState.hasPermission, permissionState.loading, permissionState.membership, permissionState.permissions, permissionState.role, refreshModules, userCapabilities])

  return <AttorneyModulesContext.Provider value={value}>{children}</AttorneyModulesContext.Provider>
}

export function useAttorneyModules() {
  const context = useContext(AttorneyModulesContext)
  if (!context) {
    throw new Error('useAttorneyModules must be used within AttorneyModulesProvider')
  }
  return context
}

export function useOptionalAttorneyModules() {
  return useContext(AttorneyModulesContext)
}
