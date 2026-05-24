import { useWorkspace } from '../context/WorkspaceContext'
import { canUser, resolveCapabilityDenialMessage } from '../lib/permissionGate'
import AccessState from './access/AccessState'

export default function PermissionGate({
  capability = '',
  organisationRole = '',
  transactionRole = '',
  assignedUserIds = [],
  isSuperAdmin = false,
  fallback = null,
  children,
}) {
  const { role, profile, currentMembership, currentWorkspace, workspaceType } = useWorkspace()

  const allowed = canUser({
    capability,
    appRole: role,
    organisationRole: organisationRole || currentMembership?.role || currentMembership?.rawRole || '',
    transactionRole,
    assignedUserIds,
    userId: profile?.id || '',
    isSuperAdmin,
    currentMembership,
    currentWorkspace,
    workspaceType,
  })

  if (allowed) {
    return children
  }

  if (fallback) {
    return fallback
  }

  return <AccessState type="permission_required" description={resolveCapabilityDenialMessage(capability)} />
}
