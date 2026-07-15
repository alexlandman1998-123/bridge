export function getAllowedDepartmentsForRole(role, departmentTypes = []) {
  const available = [...departmentTypes]
  if (!role) return available
  if (role === 'transfer_attorney') return available.filter((type) => type === 'transfer')
  if (role === 'bond_attorney') return available.filter((type) => type === 'bond')
  if (role === 'cancellation_attorney') return available.filter((type) => type === 'cancellation')
  if (role === 'conveyancing_secretary') return available.filter((type) => ['transfer', 'bond', 'cancellation', 'admin'].includes(type))
  if (role === 'admin_staff' || role === 'reception_scheduling') return available.filter((type) => type === 'admin')
  if (role === 'director_partner') return available.filter((type) => type === 'management')
  if (role === 'candidate_attorney') return available.filter((type) => ['transfer', 'bond', 'cancellation'].includes(type))
  return available
}

function resolveDefaultDepartmentByRole(role, availableDepartmentTypes = []) {
  if (!role) return ''
  if (role === 'director_partner' && availableDepartmentTypes.includes('management')) return 'management'
  if (role === 'transfer_attorney' && availableDepartmentTypes.includes('transfer')) return 'transfer'
  if (role === 'bond_attorney' && availableDepartmentTypes.includes('bond')) return 'bond'
  if (role === 'cancellation_attorney' && availableDepartmentTypes.includes('cancellation')) return 'cancellation'
  if (role === 'admin_staff' && availableDepartmentTypes.includes('admin')) return 'admin'
  if (role === 'reception_scheduling' && availableDepartmentTypes.includes('admin')) return 'admin'
  if (role === 'candidate_attorney' && availableDepartmentTypes.includes('transfer')) return 'transfer'
  return availableDepartmentTypes[0] || ''
}

export function normalizeInviteForRole(invite, availableDepartmentTypes) {
  const nextRole = invite.role || ''
  const allowedDepartments = getAllowedDepartmentsForRole(nextRole, availableDepartmentTypes)
  const departmentType = allowedDepartments.includes(invite.departmentType)
    ? invite.departmentType
    : resolveDefaultDepartmentByRole(nextRole, allowedDepartments)

  return {
    ...invite,
    departmentType,
  }
}
