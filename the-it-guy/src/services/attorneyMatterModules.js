export const ATTORNEY_MATTER_MODULE_TYPES = Object.freeze(['transfer', 'bond', 'cancellation'])

export const ATTORNEY_REQUIRED_DEPARTMENT_TYPES = Object.freeze(['management'])

export const ATTORNEY_OPERATIONAL_DEPARTMENT_TYPES = Object.freeze([
  ...ATTORNEY_MATTER_MODULE_TYPES,
  'admin',
  ...ATTORNEY_REQUIRED_DEPARTMENT_TYPES,
])

export const ATTORNEY_MATTER_MODULE_LABELS = Object.freeze({
  transfer: 'Transfer Matters',
  bond: 'Bond Matters',
  cancellation: 'Cancellation Matters',
})

export const ATTORNEY_DEPARTMENT_LABELS = Object.freeze({
  transfer: 'Transfer Department',
  bond: 'Bond Department',
  cancellation: 'Cancellation Department',
  admin: 'Admin Department',
  management: 'Management',
})

export const ATTORNEY_NAV_MODULE_BY_KEY = Object.freeze({
  attorney_matters_transfer: 'transfer',
  attorney_matters_bond: 'bond',
  attorney_matters_cancellation: 'cancellation',
})

export function normalizeAttorneyMatterModule(value = '', fallback = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return ATTORNEY_MATTER_MODULE_TYPES.includes(normalized) ? normalized : fallback
}

export function normalizeAttorneyDepartmentTypeForModules(value = '', fallback = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return ATTORNEY_OPERATIONAL_DEPARTMENT_TYPES.includes(normalized) ? normalized : fallback
}

export function deriveActiveAttorneyMatterModules(departments = []) {
  const rows = Array.isArray(departments) ? departments : []
  if (!rows.length) {
    return ATTORNEY_MATTER_MODULE_TYPES.reduce((accumulator, type) => {
      accumulator[type] = true
      return accumulator
    }, {})
  }

  const activeByType = rows.reduce((accumulator, department) => {
    const type = normalizeAttorneyDepartmentTypeForModules(department?.departmentType || department?.department_type)
    if (!type) return accumulator
    accumulator[type] = department?.isActive !== false && department?.is_active !== false
    return accumulator
  }, {})

  return ATTORNEY_MATTER_MODULE_TYPES.reduce((accumulator, type) => {
    accumulator[type] = activeByType[type] === undefined ? true : Boolean(activeByType[type])
    return accumulator
  }, {})
}

export function isAttorneyMatterModuleEnabled(modules = {}, type = '') {
  const moduleType = normalizeAttorneyMatterModule(type)
  if (!moduleType) return true
  return modules?.[moduleType] !== false
}

export function filterAttorneyMatterTypesByModules(types = [], modules = {}) {
  return (types || []).filter((type) => isAttorneyMatterModuleEnabled(modules, type))
}

export function getEnabledAttorneyMatterModuleTypes(modules = {}) {
  return ATTORNEY_MATTER_MODULE_TYPES.filter((type) => isAttorneyMatterModuleEnabled(modules, type))
}

export function getFallbackAttorneyMatterView(modules = {}) {
  return getEnabledAttorneyMatterModuleTypes(modules)[0] || 'all'
}

export function getActiveAttorneyDepartmentTypesFromSelection(selection = {}) {
  return ATTORNEY_OPERATIONAL_DEPARTMENT_TYPES.filter((type) => Boolean(selection[type]))
}

