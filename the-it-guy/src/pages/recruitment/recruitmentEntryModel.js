const returnPath = /^\/agency\/branches\/[a-z\d-]+\/staff$/i

export function recruitmentReturnTo(value) {
  return ['/agency/agents','/settings/users','/commercial/brokers','/commercial','/setup'].includes(value) || returnPath.test(value || '') ? value : '/agency/recruitment'
}

export function recruitmentStartLocation({ entryPoint, organisationId, branchId = '', returnTo, joiningRole, businessWorkspaces, contact, commissionStructureId }) {
  return { pathname: '/agency/recruitment/new', state: { recruitmentEntry: { entryPoint, organisationId, branchId, ...(joiningRole ? {joiningRole} : {}), ...(businessWorkspaces ? {businessWorkspaces} : {}), ...(contact ? {contact} : {}), ...(commissionStructureId !== undefined ? {commissionStructureId} : {}), returnTo: recruitmentReturnTo(returnTo) } } }
}

export function navigateToRecruitment(navigate, context, options = {}) {
  const route = recruitmentStartLocation(context)
  navigate(route.pathname, { ...options, state: route.state })
}

export function recruitmentEntryContext(state, organisationId) {
  const entry = state?.recruitmentEntry
  if (!entry || !['agents', 'branch', 'settings_users', 'agency_setup', 'commercial_brokers'].includes(entry.entryPoint)) return { entryPoint: 'recruitment', returnTo: '/agency/recruitment' }
  return { entryPoint: entry.entryPoint, branchId: String(entry.branchId || ''), ...(entry.joiningRole ? {joiningRole:['agent','senior_agent','commercial_broker'].includes(entry.joiningRole) ? entry.joiningRole : 'agent'} : {}), ...(Array.isArray(entry.businessWorkspaces) ? {businessWorkspaces:entry.businessWorkspaces.filter((id) => ['sales','rentals','short_term_rentals','commercial'].includes(id))} : {}), ...(entry.contact ? {contact:entry.contact} : {}), ...(typeof entry.commissionStructureId === 'string' ? {commissionStructureId:entry.commissionStructureId} : {}), returnTo: recruitmentReturnTo(entry.returnTo),
    error: entry.organisationId !== organisationId ? 'Switch to the agency where this invitation was started before continuing.' : '' }
}

export function recruitmentNextAction(lead) {
  if(lead.invitation_state==='access_accepted')return 'Confirm verified activation'
  if(['access_expired','access_revoked'].includes(lead.invitation_state))return 'Review access invitation'
  if(['email_failed','email_uncertain'].includes(lead.invitation_state))return 'Review invitation sending'
  if (lead.activation_state === 'awaiting_acceptance') return 'Await access acceptance'
  return { lead_received: 'Invite to apply', application_submitted: 'Start application review', under_review: 'Complete application review',
    application_approved: 'Prepare contract', contract_sent: 'Verify signed contract', contract_signed: 'Complete onboarding',
    onboarding_complete: 'Review agent access' }[lead.status] || 'Open recruitment record'
}
