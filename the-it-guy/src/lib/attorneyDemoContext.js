import { MOCK_DATA_ENABLED } from './mockData'

const PERSONA_PREVIEW_STORAGE_KEY = 'itg:persona-preview-role'

export const ATTORNEY_DEMO_FIRM_ID = '00000000-0000-0000-0000-00000000a771'

export const ATTORNEY_DEMO_DEPARTMENTS = [
  {
    id: '00000000-0000-0000-0000-00000000d771',
    firmId: ATTORNEY_DEMO_FIRM_ID,
    name: 'Management',
    departmentType: 'management',
    isActive: true,
  },
  {
    id: '00000000-0000-0000-0000-00000000d772',
    firmId: ATTORNEY_DEMO_FIRM_ID,
    name: 'Transfer Department',
    departmentType: 'transfer',
    isActive: true,
  },
  {
    id: '00000000-0000-0000-0000-00000000d773',
    firmId: ATTORNEY_DEMO_FIRM_ID,
    name: 'Bond Department',
    departmentType: 'bond',
    isActive: true,
  },
  {
    id: '00000000-0000-0000-0000-00000000d774',
    firmId: ATTORNEY_DEMO_FIRM_ID,
    name: 'Admin Department',
    departmentType: 'admin',
    isActive: true,
  },
]

function readPersonaPreviewRole() {
  if (typeof window === 'undefined') return ''
  try {
    return String(window.localStorage.getItem(PERSONA_PREVIEW_STORAGE_KEY) || '').trim().toLowerCase()
  } catch {
    return ''
  }
}

export function isAttorneyPersonaPreviewMode() {
  return readPersonaPreviewRole() === 'attorney'
}

export function isAttorneyDemoContextEnabled() {
  return Boolean(MOCK_DATA_ENABLED || isAttorneyPersonaPreviewMode())
}

export function isAttorneyDemoModeActiveForWorkspace({ role = '', baseRole = '', rolePreviewActive = false } = {}) {
  if (String(role || '').trim().toLowerCase() !== 'attorney') return false
  if (MOCK_DATA_ENABLED) return true
  if (rolePreviewActive && String(baseRole || '').trim().toLowerCase() !== 'attorney') return true
  return isAttorneyPersonaPreviewMode()
}

export function buildAttorneyDemoFirm() {
  return {
    id: ATTORNEY_DEMO_FIRM_ID,
    name: 'Bridge Demo Attorneys',
    registrationNumber: '',
    vatNumber: '',
    website: '',
    email: 'demo-attorneys@bridgenine.co.za',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    province: '',
    postalCode: '',
    country: 'South Africa',
    logoUrl: '',
    primaryColour: '#0f4c81',
    secondaryColour: '#1e2a44',
    createdBy: null,
    createdAt: null,
    updatedAt: null,
    isActive: true,
  }
}

export function buildAttorneyDemoDepartments() {
  return ATTORNEY_DEMO_DEPARTMENTS.map((row) => ({ ...row }))
}

export function buildAttorneyDemoMembership({ userId = '', departmentId = ATTORNEY_DEMO_DEPARTMENTS[0].id, role = 'firm_admin' } = {}) {
  const normalizedUserId = String(userId || '').trim() || '00000000-0000-0000-0000-000000000103'
  return {
    id: `demo-member-${normalizedUserId}`,
    firmId: ATTORNEY_DEMO_FIRM_ID,
    userId: normalizedUserId,
    departmentId,
    role,
    status: 'active',
    invitedBy: null,
    joinedAt: null,
    createdAt: null,
    updatedAt: null,
    isActive: true,
  }
}

