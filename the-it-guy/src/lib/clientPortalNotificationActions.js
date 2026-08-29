let notificationsPromise = null

async function call(method, ...args) {
  notificationsPromise ||= import('../services/clientPortalNotificationsService')
  const service = await notificationsPromise
  return service[method](...args)
}

export const dismissClientPortalNotification = (...args) => call('dismissClientPortalNotification', ...args)
export const markAllClientPortalNotificationsRead = (...args) => call('markAllClientPortalNotificationsRead', ...args)
export const markClientPortalNotificationRead = (...args) => call('markClientPortalNotificationRead', ...args)
export const getClientPortalNotifications = (...args) => call('getClientPortalNotifications', ...args)
export const syncNotificationsFromActivityFeed = (...args) => call('syncNotificationsFromActivityFeed', ...args)
export const syncNotificationsFromNextActions = (...args) => call('syncNotificationsFromNextActions', ...args)
