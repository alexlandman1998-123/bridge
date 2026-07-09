import UxDiagnosticsActions from '../feedback/UxDiagnosticsActions'

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

const DEFAULT_ACTIONS = {
  denied: {
    primaryLabel: 'Back to dashboard',
    primaryHref: '/dashboard',
    secondaryLabel: 'Account settings',
    secondaryHref: '/settings/profile',
  },
  permission_required: {
    primaryLabel: 'Back to dashboard',
    primaryHref: '/dashboard',
    secondaryLabel: 'Account settings',
    secondaryHref: '/settings/profile',
  },
  pending: {
    primaryLabel: 'Back to setup',
    primaryHref: '/setup/recovery',
    secondaryLabel: 'Account settings',
    secondaryHref: '/settings/profile',
  },
  suspended: {
    primaryLabel: 'Back to dashboard',
    primaryHref: '/dashboard',
    secondaryLabel: 'Sign in again',
    secondaryHref: '/auth',
  },
  workspace_missing: {
    primaryLabel: 'Recover workspace',
    primaryHref: '/setup/recovery',
    secondaryLabel: 'Account settings',
    secondaryHref: '/settings/profile',
  },
  branch_missing: {
    primaryLabel: 'Back to setup',
    primaryHref: '/setup/recovery',
    secondaryLabel: 'Account settings',
    secondaryHref: '/settings/profile',
  },
  empty_scope: {
    primaryLabel: 'Back to dashboard',
    primaryHref: '/dashboard',
    secondaryLabel: 'Account settings',
    secondaryHref: '/settings/profile',
  },
}

function DefaultAction({ type = 'denied' }) {
  const action = DEFAULT_ACTIONS[type] || DEFAULT_ACTIONS.denied
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      <a href={action.primaryHref} className="auth-primary-cta inline-flex no-underline">
        {action.primaryLabel}
      </a>
      <a href={action.secondaryHref} className="auth-secondary-cta inline-flex no-underline">
        {action.secondaryLabel}
      </a>
    </div>
  )
}

export default function AccessState({ type = 'denied', title = '', description = '', action = null, diagnostics = null }) {
  const copy = COPY[type] || COPY.denied
  const resolvedTitle = title || copy.title
  const resolvedDescription = description || copy.description
  const diagnosticsProps = diagnostics === false
    ? null
    : {
        source: `access_state:${type}`,
        category: 'access_state',
        severity: type === 'denied' || type === 'permission_required' ? 'medium' : 'high',
        message: `${resolvedTitle}: ${resolvedDescription}`,
        metadata: { type, title: resolvedTitle },
        ...(diagnostics || {}),
      }
  return (
    <section className="auth-loading-screen">
      <div className="auth-loading-card" style={{ maxWidth: '560px' }}>
        <h2>{resolvedTitle}</h2>
        <p>{resolvedDescription}</p>
        {action || <DefaultAction type={type} />}
        {diagnosticsProps ? <UxDiagnosticsActions {...diagnosticsProps} compact /> : null}
      </div>
    </section>
  )
}
