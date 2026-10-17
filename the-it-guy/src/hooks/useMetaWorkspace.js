import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthSession } from '../context/AuthSessionContext'
import { metaIntegrationRequest } from '../services/metaIntegrationService'

export function useMetaWorkspace() {
  const { authState } = useAuthSession()
  const organisationId = String(authState?.currentWorkspace?.id || authState?.currentMembership?.workspaceId || authState?.currentMembership?.workspace_id || '')
  const [state, setState] = useState({ org: '', loading: true, pages: [], senders: [], error: '', canManage: false })
  const generation = useRef(0)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const refresh = useCallback(async () => {
    const current = ++generation.current
    if (!organisationId) { setState({ org: '', loading: false, pages: [], senders: [], error: 'Choose an organisation workspace.', canManage: false }); return }
    setState(old => ({ ...(old.org === organisationId ? old : { pages: [], senders: [], canManage: false }), org: organisationId, loading: true, error: '' }))
    try {
      const data = await metaIntegrationRequest(organisationId, 'workspace')
      if (generation.current === current) setState({ ...data, org: organisationId, loading: false, error: '' })
    } catch (error) {
      if (generation.current === current) setState(old => ({ ...old, loading: false, error: error.message }))
    }
  }, [organisationId])
  useEffect(() => { void refresh(); return invalidate }, [refresh, invalidate])
  return { ...(state.org === organisationId ? state : { pages: [], senders: [], loading: true, error: '', canManage: false }), organisationId, refresh }
}
