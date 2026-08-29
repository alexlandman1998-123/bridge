import { createContext, useContext } from 'react'

const WORKSPACE_CONTEXT_GLOBAL_KEY = '__arch9WorkspaceContextV1'

export const WorkspaceContext =
  typeof globalThis !== 'undefined'
    ? (globalThis[WORKSPACE_CONTEXT_GLOBAL_KEY] ||= createContext(null))
    : createContext(null)

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return context
}
