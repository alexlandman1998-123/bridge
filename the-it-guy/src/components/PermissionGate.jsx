import { useWorkspace } from '../context/WorkspaceContext'
import { canUser, resolveCapabilityDenialMessage } from '../lib/permissionGate'

export default function PermissionGate({
  capability = '',
  organisationRole = '',
  transactionRole = '',
  assignedUserIds = [],
  isSuperAdmin = false,
  fallback = null,
  children,
}) {
  const { role, profile } = useWorkspace()

  const allowed = canUser({
    capability,
    appRole: role,
    organisationRole,
    transactionRole,
    assignedUserIds,
    userId: profile?.id || '',
    isSuperAdmin,
  })

  if (allowed) {
    return children
  }

  if (fallback) {
    return fallback
  }

  return (
    <section className="auth-loading-screen">
      <div className="auth-loading-card">
        <h2>Access restricted</h2>
        <p>{resolveCapabilityDenialMessage(capability)}</p>
      </div>
    </section>
  )
}
