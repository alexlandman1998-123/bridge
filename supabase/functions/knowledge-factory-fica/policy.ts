const REVIEW_ROLES = new Set([
  "principal", "owner", "director", "admin", "super_admin", "agency_admin",
  "compliance_officer", "compliance_reviewer",
]);

function role(value: unknown): string {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "administrator") return "admin";
  if (normalized === "superadmin") return "super_admin";
  if (normalized === "principal / owner") return "principal";
  return normalized;
}

export function mayAccessFicaHandoff({
  userId, ficaCase, membership, organisationAccess, userPermission,
}: {
  userId: string;
  ficaCase: Record<string, unknown> | null;
  membership: Record<string, unknown> | null;
  organisationAccess: Record<string, unknown> | null;
  userPermission: Record<string, unknown> | null;
}): boolean {
  if (!userId || !ficaCase || !membership) return false;
  if (ficaCase.organisation_id !== membership.organisation_id) return false;
  if (membership.user_id !== userId) return false;
  if (String(membership.membership_status || membership.status || "").toLowerCase() !== "active") return false;
  if (organisationAccess?.enabled !== true || organisationAccess.suspended_at) return false;
  if (!Array.isArray(organisationAccess.allowed_operations) ||
    !organisationAccess.allowed_operations.includes("fica_kyc")) return false;
  if (userPermission?.revoked_at || !Array.isArray(userPermission?.allowed_operations) ||
    !userPermission.allowed_operations.includes("fica_kyc")) return false;
  const staffRole = role(
    membership.workspace_role || membership.organization_role ||
      membership.organisation_role || membership.role,
  );
  return ficaCase.created_by === userId || REVIEW_ROLES.has(staffRole);
}
