import BondDashboard from '../../components/bond/BondDashboard'
import { useWorkspace } from '../../context/WorkspaceContext'

function normalizeText(value) {
  return String(value || '').trim()
}

function resolveWorkspaceId(workspaceContext = {}) {
  return normalizeText(
    workspaceContext.workspaceId ||
      workspaceContext.currentWorkspace?.id ||
      workspaceContext.workspace?.id ||
      workspaceContext.currentMembership?.workspaceId ||
      workspaceContext.currentMembership?.organisation_id ||
      workspaceContext.currentMembership?.organisationId,
  )
}

export default function BondDashboardPage() {
  const workspaceContext = useWorkspace()
  const workspaceId = resolveWorkspaceId(workspaceContext)

  return (
    <BondDashboard
      user={workspaceContext}
      workspaceId={workspaceId}
    />
  )
}
