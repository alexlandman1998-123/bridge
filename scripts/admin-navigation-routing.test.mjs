import assert from 'node:assert/strict'

import { ADMIN_LEVELS } from '../apps/admin/src/lib/adminAccess.js'
import {
  getAllowedAdminViews,
  getViewFromPath,
  pathForView,
  resolveAdminViewFromPath,
} from '../apps/admin/src/lib/adminRoutes.js'

assert.deepEqual(getAllowedAdminViews(ADMIN_LEVELS.EXECUTIVE), [
  'dashboard',
  'support',
  'search',
  'settings',
])

assert.deepEqual(getAllowedAdminViews(ADMIN_LEVELS.CUSTOMER_SUPPORT), [
  'support',
  'search',
  'settings',
])

assert.equal(getViewFromPath('/admin/search', ADMIN_LEVELS.EXECUTIVE), 'search')
assert.equal(getViewFromPath('/admin/settings', ADMIN_LEVELS.EXECUTIVE), 'settings')
assert.equal(getViewFromPath('/admin/support', ADMIN_LEVELS.CUSTOMER_SUPPORT), 'support')
assert.equal(getViewFromPath('/admin', ADMIN_LEVELS.CUSTOMER_SUPPORT), 'support')

assert.equal(
  resolveAdminViewFromPath({ level: ADMIN_LEVELS.CUSTOMER_SUPPORT, pathname: '/admin' }),
  'support',
)
assert.equal(
  resolveAdminViewFromPath({ level: ADMIN_LEVELS.CUSTOMER_SUPPORT, pathname: '/admin/search' }),
  'search',
)
assert.equal(
  resolveAdminViewFromPath({ level: ADMIN_LEVELS.CUSTOMER_SUPPORT, pathname: '/admin/dashboard' }),
  'support',
)
assert.equal(
  resolveAdminViewFromPath({ level: ADMIN_LEVELS.EXECUTIVE, pathname: '/admin/settings' }),
  'settings',
)

assert.equal(pathForView('dashboard'), '/admin')
assert.equal(pathForView('support'), '/admin/support')
assert.equal(pathForView('search'), '/admin/search')
assert.equal(pathForView('settings'), '/admin/settings')

console.log('Admin navigation routing contract passed.')
