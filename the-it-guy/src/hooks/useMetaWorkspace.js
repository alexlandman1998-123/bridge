import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthSession } from '../context/AuthSessionContext'
import { metaIntegrationRequest } from '../services/metaIntegrationService'

const empty = { pages: [], senders: [], assignees: [], canManage: false, canConnectOwn: false, currentUserId: null }
export function useMetaWorkspace() {
  const { authState } = useAuthSession()
  const organisationId = String(authState?.currentWorkspace?.id || authState?.currentMembership?.workspaceId || authState?.currentMembership?.workspace_id || '')
  const viewerId = String(authState?.user?.id || '')
  const member = authState?.currentMembership || {}
  const membershipScope = [member.role, member.workspaceRole, member.workspace_role, member.organisationRole, member.organisation_role, member.status, member.membershipStatus].filter(Boolean).join('|')
  const accessScope = `${organisationId}:${viewerId}${membershipScope ? `:${membershipScope}` : ''}`
  const [state, setState] = useState({ ...empty, scope: '', loading: true, error: '' })
  const generation = useRef(0)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const refresh = useCallback(async () => {
    const current = ++generation.current
    if (!organisationId || !viewerId) { setState({ ...empty, scope: accessScope, loading: false, error: 'Sign in and choose an organisation workspace.' }); return }
    setState(old => ({ ...(old.scope === accessScope ? old : empty), scope: accessScope, loading: true, error: '' }))
    try {
      const data = await metaIntegrationRequest(organisationId, 'workspace')
      if (generation.current === current) setState({ ...data, scope: accessScope, loading: false, error: '' })
    } catch (error) {
      if (generation.current === current) setState({ ...empty, scope: accessScope, loading: false, error: error.message })
    }
  }, [organisationId, viewerId, accessScope])
  useEffect(() => { const timer = window.setTimeout(() => { void refresh() }, 0); return () => { window.clearTimeout(timer); invalidate() } }, [refresh, invalidate])
  return { ...(state.scope === accessScope ? state : { ...empty, loading: true, error: '' }), organisationId, accessScope, refresh }
}
