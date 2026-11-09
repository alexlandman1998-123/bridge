// Extracted without changing validation, persistence order or recovery behaviour.
import { normalizeTextValue, isMissingColumnError, isMissingSchemaError } from '../../lib/api/shared/readHelpers.js'
import { normalizeRoleType } from '../../core/transactions/permissions'

export const FIRM_ROLE_VALUES = [
  'firm_admin',
  'lead_attorney',
  'attorney',
  'paralegal',
  'admin_staff',
  'developer',
  'agent',
  'viewer',
  'buyer',
  'seller',
]

export function normalizeFirmRole(value, fallback = 'attorney') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return FIRM_ROLE_VALUES.includes(normalized) ? normalized : fallback
}

export async function resolveActiveProfileContext(client) {
  try {
    const { data, error } = await client.auth.getSession()
    if (error) {
      return { userId: null, role: null, email: null, fullName: null, firmId: null, firmRole: null }
    }

    let user = data?.session?.user
    if (!user?.id && typeof client.auth.getUser === 'function') {
      const userResult = await client.auth.getUser()
      if (!userResult.error && userResult.data?.user?.id) {
        user = userResult.data.user
      }
    }
    if (!user?.id) {
      return { userId: null, role: null, email: null, fullName: null, firmId: null, firmRole: null }
    }

    const userMetadata = user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {}
    const metadataName =
      normalizeTextValue(userMetadata.full_name) ||
      normalizeTextValue(userMetadata.name) ||
      [userMetadata.first_name, userMetadata.last_name].map(normalizeTextValue).filter(Boolean).join(' ')

    let profileQuery = await client
      .from('profiles')
      .select('id, role, firm_id, firm_role, full_name, first_name, last_name')
      .eq('id', user.id)
      .limit(1)
      .maybeSingle()
    if (
      profileQuery.error &&
      (isMissingColumnError(profileQuery.error, 'full_name') ||
        isMissingColumnError(profileQuery.error, 'first_name') ||
        isMissingColumnError(profileQuery.error, 'last_name'))
    ) {
      profileQuery = await client
        .from('profiles')
        .select('id, role, firm_id, firm_role')
        .eq('id', user.id)
        .limit(1)
        .maybeSingle()
    }
    if (profileQuery.error) {
      if (isMissingSchemaError(profileQuery.error)) {
        return { userId: user.id, role: null, email: user.email || null, fullName: metadataName || null, firmId: null, firmRole: null }
      }
      return { userId: user.id, role: null, email: user.email || null, fullName: metadataName || null, firmId: null, firmRole: null }
    }

    const profileName =
      normalizeTextValue(profileQuery.data?.full_name) ||
      [profileQuery.data?.first_name, profileQuery.data?.last_name].map(normalizeTextValue).filter(Boolean).join(' ') ||
      metadataName

    return {
      userId: user.id,
      role: normalizeRoleType(profileQuery.data?.role || 'developer'),
      email: user.email || null,
      fullName: profileName || null,
      firmId: profileQuery.data?.firm_id || null,
      firmRole: normalizeFirmRole(profileQuery.data?.firm_role || 'attorney'),
    }
  } catch {
    return { userId: null, role: null, email: null, fullName: null, firmId: null, firmRole: null }
  }
}
