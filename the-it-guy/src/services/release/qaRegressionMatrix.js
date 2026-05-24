export const QA_REGRESSION_MATRIX = Object.freeze([
  {
    category: 'auth',
    title: 'Auth',
    checks: ['login', 'logout', 'timeout logout', 'refresh persistence', 'onboarding resume', 'invite acceptance'],
  },
  {
    category: 'onboarding',
    title: 'Onboarding',
    checks: ['agency owner', 'agency operational', 'developer owner', 'developer operational', 'attorney owner', 'attorney operational', 'bond owner', 'bond operational', 'client onboarding'],
  },
  {
    category: 'workspaces',
    title: 'Workspaces',
    checks: ['workspace creation', 'branch creation', 'invite flows', 'approval flows', 'membership activation'],
  },
  {
    category: 'permissions',
    title: 'Permissions',
    checks: ['route access', 'action permissions', 'exports', 'branch scoping', 'assigned-only scoping'],
  },
  {
    category: 'transactions',
    title: 'Transactions',
    checks: ['workflow progression', 'document uploads', 'stage transitions', 'comments/activity', 'assignments'],
  },
  {
    category: 'client_portal',
    title: 'Client Portal',
    checks: ['client visibility', 'uploads', 'progress tracking', 'client comments'],
  },
  {
    category: 'recovery',
    title: 'Recovery',
    checks: ['missing membership', 'invalid onboarding', 'invalid assignment', 'orphan detection'],
  },
  {
    category: 'observability',
    title: 'Observability',
    checks: ['logs recorded', 'audit logs visible', 'permission denials tracked', 'deployment checks tracked'],
  },
])

export const ROLE_QA_SUITES = Object.freeze([
  { key: 'agency', title: 'Agency QA', checks: ['principal workflows', 'branch manager workflows', 'lead management', 'listings', 'transactions', 'appointments'] },
  { key: 'developer', title: 'Developer QA', checks: ['development management', 'reporting', 'transactions', 'permissions'] },
  { key: 'attorney', title: 'Attorney QA', checks: ['matter workflows', 'transfer workflows', 'document approvals', 'attorney departments'] },
  { key: 'bond', title: 'Bond QA', checks: ['applications', 'bank workflows', 'consultant assignments'] },
  { key: 'client', title: 'Client QA', checks: ['portal access', 'uploads', 'visibility restrictions'] },
])

export const RELEASE_STEPS = Object.freeze([
  'Local development complete',
  'Deploy to staging/demo',
  'Run QA checklist',
  'Run regression tests',
  'Verify migrations',
  'Verify production flags',
  'Approve release',
  'Deploy production',
  'Run post-deploy checks',
])

export const POST_DEPLOY_CHECKS = Object.freeze([
  'login works',
  'onboarding works',
  'route guards work',
  'memberships load',
  'workspace switching works',
  'route permissions work',
  'action permissions work',
  'transaction pages load',
  'workflows function',
  'client links work',
  'uploads work',
  'logs working',
  'monitoring working',
  'audit events working',
])
