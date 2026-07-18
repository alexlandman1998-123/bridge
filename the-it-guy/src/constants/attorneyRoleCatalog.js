export const ATTORNEY_PERMISSION_KEYS = Object.freeze([
  'can_view_firm_dashboard',
  'can_manage_firm_settings',
  'can_manage_branding',
  'can_invite_firm_members',
  'can_manage_members',
  'can_manage_departments',
  'can_view_all_firm_matters',
  'can_view_assigned_matters',
  'can_view_transfer_matters',
  'can_view_bond_matters',
  'can_create_attorney_assignments',
  'can_update_attorney_assignments',
  'can_remove_attorney_assignments',
  'can_edit_transfer_workflow',
  'can_edit_bond_workflow',
  'can_request_documents',
  'can_review_documents',
  'can_upload_documents',
  'can_reject_documents',
  'can_mark_documents_complete',
  'can_comment_shared',
  'can_comment_internal',
  'can_view_internal_comments',
  'can_manage_signing_appointments',
  'can_generate_otp',
  'can_export_reports',
  'can_view_client_visible_updates',
  'can_publish_client_visible_updates',
])

export const ATTORNEY_FIRM_ROLE_VALUES = Object.freeze([
  'firm_admin',
  'director_partner',
  'transfer_attorney',
  'bond_attorney',
  'conveyancing_secretary',
  'admin_staff',
  'reception_scheduling',
  'candidate_attorney',
  'viewer',
])

export const ATTORNEY_TRANSACTION_ROLES = Object.freeze([
  'transfer_attorney',
  'bond_attorney',
  'cancellation_attorney',
])

export const ATTORNEY_PRACTICE_QUALIFICATIONS = Object.freeze(['transfer', 'bond', 'cancellation'])
export const ATTORNEY_LANE_ROLES = ATTORNEY_PRACTICE_QUALIFICATIONS
export const ATTORNEY_PROFESSIONAL_ROLE_VALUES = Object.freeze([
  'firm_admin',
  'director_partner',
  'attorney_conveyancer',
  'candidate_attorney',
  'conveyancing_secretary',
  'admin_staff',
  'reception_scheduling',
  'viewer',
])
export const ATTORNEY_PROFESSIONAL_ROLE_LABELS = Object.freeze({
  firm_admin: 'Firm Administrator',
  director_partner: 'Director / Partner',
  attorney_conveyancer: 'Attorney / Conveyancer',
  candidate_attorney: 'Candidate Attorney',
  conveyancing_secretary: 'Conveyancing Secretary',
  admin_staff: 'Admin Staff',
  reception_scheduling: 'Reception / Scheduling',
  viewer: 'Viewer',
})

function buildPermissionRecord(enabledKeys = []) {
  const enabled = new Set(enabledKeys)
  return Object.freeze(Object.fromEntries(ATTORNEY_PERMISSION_KEYS.map((key) => [key, enabled.has(key)])))
}

const FULL_ACCESS = buildPermissionRecord(ATTORNEY_PERMISSION_KEYS)
const NO_ACCESS = buildPermissionRecord()

function defineRole(definition) {
  return Object.freeze({
    ...definition,
    permissions: buildPermissionRecord(definition.permissions),
    allowedDepartments: Object.freeze([...definition.allowedDepartments]),
    practiceQualifications: Object.freeze([...definition.practiceQualifications]),
  })
}

export const ATTORNEY_FIRM_ROLE_CATALOG = Object.freeze({
  firm_admin: defineRole({
    id: 'firm_admin',
    label: 'Firm Administrator',
    shortLabel: 'Firm Admin',
    description: 'Owns firm configuration, access, reporting, and operational oversight.',
    authorityLevel: 'administrator',
    permissions: ATTORNEY_PERMISSION_KEYS,
    allowedDepartments: ['transfer', 'bond', 'admin', 'management'],
    practiceQualifications: ['transfer', 'bond', 'cancellation'],
    inviteable: false,
    settingsAssignable: false,
    isAdministrator: true,
    isManagement: true,
  }),
  director_partner: defineRole({
    id: 'director_partner',
    label: 'Director / Partner',
    shortLabel: 'Director',
    description: 'Oversees firm matters, assignments, reporting, and legal operations.',
    authorityLevel: 'management',
    permissions: [
      'can_view_firm_dashboard', 'can_view_all_firm_matters', 'can_view_transfer_matters',
      'can_view_bond_matters', 'can_create_attorney_assignments', 'can_update_attorney_assignments',
      'can_remove_attorney_assignments', 'can_request_documents', 'can_review_documents',
      'can_upload_documents', 'can_reject_documents', 'can_mark_documents_complete',
      'can_comment_shared', 'can_comment_internal', 'can_view_internal_comments',
      'can_manage_signing_appointments', 'can_generate_otp', 'can_export_reports',
      'can_view_client_visible_updates', 'can_publish_client_visible_updates',
    ],
    allowedDepartments: ['management'],
    practiceQualifications: ['transfer', 'bond', 'cancellation'],
    inviteable: true,
    settingsAssignable: true,
    isAdministrator: false,
    isManagement: true,
  }),
  transfer_attorney: defineRole({
    id: 'transfer_attorney',
    label: 'Transfer Attorney',
    shortLabel: 'Conveyancer',
    description: 'Runs transfer and cancellation matters assigned to them.',
    authorityLevel: 'practitioner',
    permissions: [
      'can_view_assigned_matters', 'can_view_transfer_matters', 'can_edit_transfer_workflow',
      'can_request_documents', 'can_review_documents', 'can_upload_documents',
      'can_reject_documents', 'can_mark_documents_complete', 'can_comment_shared',
      'can_comment_internal', 'can_view_internal_comments', 'can_manage_signing_appointments',
      'can_generate_otp', 'can_view_client_visible_updates', 'can_publish_client_visible_updates',
    ],
    allowedDepartments: ['transfer'],
    practiceQualifications: ['transfer', 'cancellation'],
    inviteable: true,
    settingsAssignable: true,
    isAdministrator: false,
    isManagement: false,
  }),
  bond_attorney: defineRole({
    id: 'bond_attorney',
    label: 'Bond Attorney',
    shortLabel: 'Bond Attorney',
    description: 'Runs bond-registration matters assigned to them.',
    authorityLevel: 'practitioner',
    permissions: [
      'can_view_assigned_matters', 'can_view_bond_matters', 'can_edit_bond_workflow',
      'can_request_documents', 'can_review_documents', 'can_upload_documents',
      'can_reject_documents', 'can_mark_documents_complete', 'can_comment_shared',
      'can_comment_internal', 'can_view_internal_comments', 'can_manage_signing_appointments',
      'can_view_client_visible_updates', 'can_publish_client_visible_updates',
    ],
    allowedDepartments: ['bond'],
    practiceQualifications: ['bond'],
    inviteable: true,
    settingsAssignable: true,
    isAdministrator: false,
    isManagement: false,
  }),
  conveyancing_secretary: defineRole({
    id: 'conveyancing_secretary',
    label: 'Conveyancing Secretary',
    shortLabel: 'Secretary',
    description: 'Supports assigned matters, documents, appointments, and updates.',
    authorityLevel: 'support',
    permissions: [
      'can_view_assigned_matters', 'can_request_documents', 'can_review_documents',
      'can_upload_documents', 'can_reject_documents', 'can_mark_documents_complete',
      'can_comment_shared', 'can_comment_internal', 'can_view_internal_comments',
      'can_manage_signing_appointments', 'can_view_client_visible_updates',
      'can_publish_client_visible_updates',
    ],
    allowedDepartments: ['transfer', 'bond', 'admin'],
    practiceQualifications: [],
    inviteable: true,
    settingsAssignable: true,
    isAdministrator: false,
    isManagement: false,
  }),
  admin_staff: defineRole({
    id: 'admin_staff',
    label: 'Admin Staff',
    shortLabel: 'Admin',
    description: 'Supports assigned document and internal administration tasks.',
    authorityLevel: 'support',
    permissions: [
      'can_view_assigned_matters', 'can_request_documents', 'can_review_documents',
      'can_upload_documents', 'can_comment_internal', 'can_view_internal_comments',
    ],
    allowedDepartments: ['admin'],
    practiceQualifications: [],
    inviteable: true,
    settingsAssignable: true,
    isAdministrator: false,
    isManagement: false,
  }),
  reception_scheduling: defineRole({
    id: 'reception_scheduling',
    label: 'Reception / Scheduling',
    shortLabel: 'Reception',
    description: 'Coordinates assigned appointments and internal scheduling notes.',
    authorityLevel: 'support',
    permissions: ['can_view_assigned_matters', 'can_comment_internal', 'can_manage_signing_appointments'],
    allowedDepartments: ['admin'],
    practiceQualifications: [],
    inviteable: true,
    settingsAssignable: true,
    isAdministrator: false,
    isManagement: false,
  }),
  candidate_attorney: defineRole({
    id: 'candidate_attorney',
    label: 'Candidate Attorney',
    shortLabel: 'Candidate',
    description: 'Assists on assigned matters under practitioner supervision.',
    authorityLevel: 'support',
    permissions: ['can_view_assigned_matters', 'can_upload_documents', 'can_comment_internal', 'can_view_internal_comments'],
    allowedDepartments: ['transfer', 'bond'],
    practiceQualifications: [],
    inviteable: true,
    settingsAssignable: true,
    isAdministrator: false,
    isManagement: false,
  }),
  viewer: defineRole({
    id: 'viewer',
    label: 'Viewer',
    shortLabel: 'Viewer',
    description: 'Read-only firm membership without operational matter authority.',
    authorityLevel: 'viewer',
    permissions: [],
    allowedDepartments: ['transfer', 'bond', 'admin', 'management'],
    practiceQualifications: [],
    inviteable: true,
    settingsAssignable: true,
    isAdministrator: false,
    isManagement: false,
  }),
})

export const ATTORNEY_ROLE_PERMISSION_MAP = Object.freeze(Object.fromEntries(
  ATTORNEY_FIRM_ROLE_VALUES.map((role) => [role, ATTORNEY_FIRM_ROLE_CATALOG[role].permissions]),
))

export const ATTORNEY_FIRM_ADMIN_ROLES = new Set(
  ATTORNEY_FIRM_ROLE_VALUES.filter((role) => ATTORNEY_FIRM_ROLE_CATALOG[role].isAdministrator),
)
export const ATTORNEY_FIRM_MANAGER_ROLES = new Set(
  ATTORNEY_FIRM_ROLE_VALUES.filter((role) => ATTORNEY_FIRM_ROLE_CATALOG[role].isManagement),
)

export function normalizeAttorneyFirmRole(value, fallback = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return ATTORNEY_FIRM_ROLE_VALUES.includes(normalized) ? normalized : fallback
}

export function normalizeAttorneyProfessionalRole(value, fallback = 'viewer') {
  const normalized = String(value || '').trim().toLowerCase()
  if (ATTORNEY_PROFESSIONAL_ROLE_VALUES.includes(normalized)) return normalized
  if (normalized === 'transfer_attorney' || normalized === 'bond_attorney') return 'attorney_conveyancer'
  return fallback
}

export function normalizeAttorneyPracticeQualifications(values = []) {
  const candidates = Array.isArray(values)
    ? values
    : String(values || '').split(',')
  return [...new Set(candidates
    .map((value) => String(value || '').trim().toLowerCase().replace(/_attorney$/, ''))
    .filter((value) => ATTORNEY_PRACTICE_QUALIFICATIONS.includes(value)))]
}

export function deriveAttorneyProfessionalProfile({ role = '', professionalRole = '', practiceQualifications = [] } = {}) {
  const legacyRole = normalizeAttorneyFirmRole(role, 'viewer')
  const normalizedProfessionalRole = normalizeAttorneyProfessionalRole(
    professionalRole || legacyRole,
    'viewer',
  )
  const explicitQualifications = normalizeAttorneyPracticeQualifications(practiceQualifications)
  const inferredQualifications = legacyRole === 'transfer_attorney'
    ? ['transfer']
    : legacyRole === 'bond_attorney'
      ? ['bond']
      : []

  return Object.freeze({
    professionalRole: normalizedProfessionalRole,
    practiceQualifications: Object.freeze(explicitQualifications.length ? explicitQualifications : inferredQualifications),
  })
}

export function resolveAttorneyCompatibilityRole({ professionalRole = '', practiceQualifications = [] } = {}, fallback = 'viewer') {
  const normalizedRole = normalizeAttorneyProfessionalRole(professionalRole, 'viewer')
  if (normalizedRole !== 'attorney_conveyancer') return normalizeAttorneyFirmRole(normalizedRole, fallback)
  const qualifications = normalizeAttorneyPracticeQualifications(practiceQualifications)
  if (qualifications.includes('transfer')) return 'transfer_attorney'
  if (qualifications.includes('cancellation')) return 'transfer_attorney'
  if (qualifications.includes('bond')) return 'bond_attorney'
  return fallback
}

export function normalizeAttorneyTransactionRole(value, fallback = 'transfer_attorney') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'transfer') return 'transfer_attorney'
  if (normalized === 'bond') return 'bond_attorney'
  if (normalized === 'cancellation') return 'cancellation_attorney'
  return ATTORNEY_TRANSACTION_ROLES.includes(normalized) ? normalized : fallback
}

export function normalizeAttorneyLaneRole(value, fallback = 'transfer') {
  const normalized = String(value || '').trim().toLowerCase().replace(/_attorney$/, '')
  if (normalized === 'transfer_and_bond') return 'transfer'
  return ATTORNEY_LANE_ROLES.includes(normalized) ? normalized : fallback
}

export function getAttorneyFirmRoleDefinition(role) {
  return ATTORNEY_FIRM_ROLE_CATALOG[normalizeAttorneyFirmRole(role)] || null
}

export function getAttorneyRoleLabel(role, { short = false, fallback = '' } = {}) {
  const definition = getAttorneyFirmRoleDefinition(role)
  if (definition) return short ? definition.shortLabel : definition.label
  const transactionRole = normalizeAttorneyTransactionRole(role, '')
  if (transactionRole === 'cancellation_attorney') return short ? 'Cancellation' : 'Cancellation Attorney'
  return fallback || String(role || '').trim()
}

export function getAttorneyProfessionalRoleLabel(role, fallback = '') {
  const normalized = normalizeAttorneyProfessionalRole(role, '')
  return ATTORNEY_PROFESSIONAL_ROLE_LABELS[normalized] || fallback || String(role || '').trim()
}

export function getAttorneyRolePermissions(role) {
  return getAttorneyFirmRoleDefinition(role)?.permissions || NO_ACCESS
}

export function getAttorneyProfessionalProfilePermissions(profile = {}) {
  const professionalProfile = deriveAttorneyProfessionalProfile(profile)
  if (professionalProfile.professionalRole !== 'attorney_conveyancer') {
    return getAttorneyRolePermissions(professionalProfile.professionalRole)
  }

  const compatibilityRoles = new Set()
  if (professionalProfile.practiceQualifications.includes('transfer')) compatibilityRoles.add('transfer_attorney')
  if (professionalProfile.practiceQualifications.includes('cancellation')) compatibilityRoles.add('transfer_attorney')
  if (professionalProfile.practiceQualifications.includes('bond')) compatibilityRoles.add('bond_attorney')
  if (!compatibilityRoles.size) return NO_ACCESS

  return Object.freeze(Object.fromEntries(ATTORNEY_PERMISSION_KEYS.map((permissionKey) => [
    permissionKey,
    [...compatibilityRoles].some((role) => Boolean(getAttorneyRolePermissions(role)[permissionKey])),
  ])))
}

export function hasAttorneyProfessionalPermission(profile, permissionKey) {
  return ATTORNEY_PERMISSION_KEYS.includes(permissionKey) && Boolean(
    getAttorneyProfessionalProfilePermissions(profile)[permissionKey],
  )
}

export function isAttorneyProfessionalManagementRole(profile = {}) {
  return ['firm_admin', 'director_partner'].includes(deriveAttorneyProfessionalProfile(profile).professionalRole)
}

export function isAttorneyProfessionalAdministrator(profile = {}) {
  return deriveAttorneyProfessionalProfile(profile).professionalRole === 'firm_admin'
}

export function hasAttorneyPermission(role, permissionKey) {
  return ATTORNEY_PERMISSION_KEYS.includes(permissionKey) && Boolean(getAttorneyRolePermissions(role)[permissionKey])
}

export const attorneyRoleHasPermission = hasAttorneyPermission

export function getInviteableAttorneyFirmRoles() {
  return ATTORNEY_FIRM_ROLE_VALUES.filter((role) => ATTORNEY_FIRM_ROLE_CATALOG[role].inviteable)
}

export function getAllowedAttorneyDepartmentsForRole(role, departmentTypes = []) {
  const definition = getAttorneyFirmRoleDefinition(role)
  if (!definition) return [...departmentTypes]
  return departmentTypes.filter((department) => definition.allowedDepartments.includes(department))
}

export function getDefaultAttorneyDepartmentForRole(role, departmentTypes = []) {
  const allowed = getAllowedAttorneyDepartmentsForRole(role, departmentTypes)
  if (!allowed.length) return ''
  const preferences = {
    director_partner: ['management'],
    transfer_attorney: ['transfer'],
    bond_attorney: ['bond'],
    admin_staff: ['admin'],
    reception_scheduling: ['admin'],
    candidate_attorney: ['transfer', 'bond'],
  }
  return (preferences[normalizeAttorneyFirmRole(role)] || []).find((type) => allowed.includes(type)) || allowed[0]
}
