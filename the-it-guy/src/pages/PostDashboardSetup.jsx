import { Link } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { APP_ROLE_LABELS } from '../lib/roles'
import { deriveOnboardingSetupState } from '../lib/onboardingRouting'

function resolveSetupActions(role = '', agencyWorkflowMode = 'agent') {
  if (role === 'developer') {
    return [
      { label: 'Create Organisation Profile', href: '/settings/organisation' },
      { label: 'Create First Development', href: '/listings/developments' },
      { label: 'Invite Team Members', href: '/settings/users' },
    ]
  }

  if (role === 'agent') {
    if (agencyWorkflowMode === 'principal') {
      return [
        { label: 'Open Principal Workflow', href: '/new-transaction' },
        { label: 'Manage Agency Pipeline', href: '/pipeline/overview' },
        { label: 'Manage Team & Invites', href: '/agents/directory' },
      ]
    }

    return [
      { label: 'Open Agent Workflow', href: '/new-transaction' },
      { label: 'Add Seller Lead', href: '/listings/agent' },
      { label: 'View Assigned Pipeline', href: '/pipeline/leads' },
    ]
  }

  if (role === 'attorney') {
    return [
      { label: 'Create or Join Attorney Firm', href: '/attorney/onboarding' },
      { label: 'Configure Firm Settings', href: '/attorney/firm-settings' },
      { label: 'Open Attorney Dashboard', href: '/attorney/dashboard' },
    ]
  }

  if (role === 'bond_originator') {
    return [
      { label: 'Create Team Workspace', href: '/settings/organisation' },
      { label: 'Set Workflow Preferences', href: '/settings/workflows' },
      { label: 'Open Dashboard', href: '/dashboard' },
    ]
  }

  return [{ label: 'Open Dashboard', href: '/dashboard' }]
}

export default function PostDashboardSetup() {
  const { profile, baseRole, agencyWorkflowMode, setAgencyWorkflowMode } = useWorkspace()
  const setupState = deriveOnboardingSetupState({ profile, baseRole })
  const actions = resolveSetupActions(setupState.appRole, agencyWorkflowMode)

  return (
    <section className="page">
      <article className="panel card-tier-standard" style={{ display: 'grid', gap: '0.9rem' }}>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">Post-Dashboard Setup</p>
        <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#142132]">
          Continue {APP_ROLE_LABELS[setupState.appRole] || 'Workspace'} Setup
        </h1>
        <p className="text-sm leading-6 text-[#60758d]">
          Signup onboarding is complete. Finish organisation and module setup here so workflow access stays isolated
          from authentication and profile creation.
        </p>
        {setupState.appRole === 'agent' ? (
          <div className="rounded-[14px] border border-[#dde4ee] bg-white px-4 py-4 text-sm text-[#1f3d59]">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">Agency workflow mode</p>
            <h2 className="mt-1 text-[1rem] font-semibold text-[#142132]">Choose your operating mode</h2>
            <p className="mt-1 text-sm leading-6 text-[#60758d]">
              This does not change auth/onboarding. It only controls which workflow modal path opens for agent accounts.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className={`rounded-[12px] border px-3 py-2 text-left text-sm font-semibold transition ${
                  agencyWorkflowMode === 'agent'
                    ? 'border-[#c8d7e6] bg-[#edf3f8] text-[#162334]'
                    : 'border-[#dbe5ef] bg-[#f8fbff] text-[#5f7288] hover:border-[#c8d7e6] hover:text-[#162334]'
                }`}
                onClick={() => setAgencyWorkflowMode('agent')}
              >
                Agent mode
              </button>
              <button
                type="button"
                className={`rounded-[12px] border px-3 py-2 text-left text-sm font-semibold transition ${
                  agencyWorkflowMode === 'principal'
                    ? 'border-[#c8d7e6] bg-[#edf3f8] text-[#162334]'
                    : 'border-[#dbe5ef] bg-[#f8fbff] text-[#5f7288] hover:border-[#c8d7e6] hover:text-[#162334]'
                }`}
                onClick={() => setAgencyWorkflowMode('principal')}
              >
                Principal mode
              </button>
            </div>
          </div>
        ) : null}
        <div className="rounded-[14px] border border-[#dde4ee] bg-[#f8fbff] px-4 py-3 text-sm text-[#1f3d59]">
          <p>
            <strong>Profile status:</strong> {setupState.profileStatus}
          </p>
          <p>
            <strong>Onboarding status:</strong> {setupState.onboardingStatus}
          </p>
          <p>
            <strong>Organisation setup status:</strong> {setupState.organisationSetupStatus}
          </p>
          <p>
            <strong>Module setup status:</strong> {setupState.moduleSetupStatus}
          </p>
        </div>
        <div className="grid gap-2">
          {actions.map((action) => (
            <Link key={action.href} to={action.href} className="header-secondary-cta">
              {action.label}
            </Link>
          ))}
        </div>
      </article>
    </section>
  )
}
