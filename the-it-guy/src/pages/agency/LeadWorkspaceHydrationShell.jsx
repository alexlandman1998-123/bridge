import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContextBase'
import { readAgencyLeadCoreCache } from './agencyLeadCoreCache'
import { readAgencyLeadWorkspaceSnapshot } from './agencyLeadWorkspaceSnapshotCache'
import LeadWorkspaceLoadingShell from './LeadWorkspaceLoadingShell'
import {
  LEAD_WORKSPACE_LOAD_STAGES,
  recordLeadWorkspaceLoadStage,
} from '../../services/observability/leadWorkspaceLoadingTrace'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function resolveOrganisationId({ currentWorkspace, currentMembership, workspace } = {}) {
  return normalizeText(
    currentWorkspace?.organisationId ||
    currentWorkspace?.organisation_id ||
    currentWorkspace?.raw?.organisation_id ||
    currentMembership?.organisationId ||
    currentMembership?.organisation_id ||
    currentWorkspace?.id ||
    workspace?.id,
  )
}

export default function LeadWorkspaceHydrationShell({ search = '' }) {
  const { leadId = '' } = useParams()
  const workspaceContext = useWorkspace()
  const organisationId = resolveOrganisationId(workspaceContext)
  const [core, setCore] = useState(() => {
    const cachedCore = readAgencyLeadCoreCache(organisationId, leadId)
    if (cachedCore) return cachedCore
    const snapshot = readAgencyLeadWorkspaceSnapshot(organisationId, leadId)
    return snapshot?.leads?.length
      ? { lead: snapshot.leads[0], contact: snapshot.contacts?.[0] || null, source: 'workspace-snapshot' }
      : null
  })

  useEffect(() => {
    recordLeadWorkspaceLoadStage(LEAD_WORKSPACE_LOAD_STAGES.workspaceChunkLoading, { leadId })
  }, [leadId])

  useEffect(() => {
    if (core?.lead) recordLeadWorkspaceLoadStage(LEAD_WORKSPACE_LOAD_STAGES.coreLeadReady, { leadId, metadata: { source: 'route_shell_cache' } })
  }, [core?.lead, leadId])

  useEffect(() => {
    let cancelled = false
    if (!organisationId || !leadId || core) return undefined
    void import('./agencyLeadListReadRepository')
      .then((repository) => repository.preloadAgencyLeadCoreRecord(organisationId, leadId))
      .then((result) => {
        if (!cancelled && result) setCore(result)
      })
      .catch(() => null)
    return () => { cancelled = true }
  }, [core, leadId, organisationId])

  return (
    <LeadWorkspaceLoadingShell
      lead={core?.lead}
      contact={core?.contact}
      search={search}
      loadStage={LEAD_WORKSPACE_LOAD_STAGES.workspaceChunkLoading}
      testId="lead-workspace-hydration-shell"
    />
  )
}
