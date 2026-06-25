const COPY = {
  denied: {
    title: 'Access denied',
    description: 'You do not have permission to open this area.',
  },
  permission_required: {
    title: 'Permission required',
    description: 'Ask your workspace owner or administrator to update your access.',
  },
  pending: {
    title: 'Pending approval',
    description: 'Your workspace access is waiting for approval.',
  },
  suspended: {
    title: 'Access suspended',
    description: 'Your workspace access is suspended or unavailable.',
  },
  workspace_missing: {
    title: 'Workspace missing',
    description: 'Arch9 could not find an active workspace for your account.',
  },
  branch_missing: {
    title: 'Branch assignment missing',
    description: 'Ask your principal or administrator to assign you to a branch.',
  },
  empty_scope: {
    title: 'No records in your scope',
    description: 'There are no records available for your current access level.',
  },
}

export default function AccessState({ type = 'denied', title = '', description = '', action = null }) {
  const copy = COPY[type] || COPY.denied
  return (
    <section className="auth-loading-screen">
      <div className="auth-loading-card" style={{ maxWidth: '560px' }}>
        <h2>{title || copy.title}</h2>
        <p>{description || copy.description}</p>
        {action}
      </div>
    </section>
  )
}

