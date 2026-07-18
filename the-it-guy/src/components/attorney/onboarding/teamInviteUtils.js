import {
  getAllowedAttorneyDepartmentsForRole,
  getDefaultAttorneyDepartmentForRole,
} from '../../../constants/attorneyRoleCatalog.js'

export function getAllowedDepartmentsForRole(role, departmentTypes = []) {
  return getAllowedAttorneyDepartmentsForRole(role, departmentTypes)
}

export function normalizeInviteForRole(invite, availableDepartmentTypes) {
  const nextRole = invite.role || ''
  const allowedDepartments = getAllowedDepartmentsForRole(nextRole, availableDepartmentTypes)
  const departmentType = allowedDepartments.includes(invite.departmentType)
    ? invite.departmentType
    : getDefaultAttorneyDepartmentForRole(nextRole, allowedDepartments)

  return {
    ...invite,
    departmentType,
  }
}
