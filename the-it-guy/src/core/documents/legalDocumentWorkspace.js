export function resolveLegalDocumentOrganisationId(currentWorkspace = {}, currentMembership = {}) {
  return String(
    currentWorkspace?.id ||
      currentWorkspace?.organisationId ||
      currentWorkspace?.organisation_id ||
      currentMembership?.workspaceId ||
      currentMembership?.workspace_id ||
      currentMembership?.organisationId ||
      currentMembership?.organisation_id ||
      '',
  ).trim()
}
