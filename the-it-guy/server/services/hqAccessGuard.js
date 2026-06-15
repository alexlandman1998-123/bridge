import { assertFounderAccess, canAccessHQ } from '../../src/auth/hqAccess.js'

function extractRequestContext(request = {}) {
  return {
    profile: request.profile || request.user?.profile || request.auth?.profile || null,
    currentMembership: request.currentMembership || request.membership || request.user?.currentMembership || null,
    membershipRole: request.membershipRole || request.user?.membershipRole || '',
    systemRole: request.systemRole || request.user?.systemRole || request.user?.system_role || '',
    role: request.role || request.user?.role || '',
    roles: request.roles || request.user?.roles || [],
    permissions: request.permissions || request.user?.permissions || [],
  }
}

export { canAccessHQ, assertFounderAccess }

export function requireHQAccess(context = {}) {
  return assertFounderAccess(context)
}

export function createHQAccessMiddleware({ getContext = extractRequestContext } = {}) {
  return function hqAccessMiddleware(request, response, next) {
    try {
      assertFounderAccess(getContext(request))
      return typeof next === 'function' ? next() : true
    } catch (error) {
      if (response?.status && response?.json) {
        return response.status(error.status || 403).json({
          error: error.code || 'permission_denied',
          message: error.message || 'Founder HQ access is required.',
        })
      }
      throw error
    }
  }
}

