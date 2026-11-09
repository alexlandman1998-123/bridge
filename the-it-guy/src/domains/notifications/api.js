// notifications owns these operations and their existing recovery behavior.
import { resolveActiveProfileContext } from '../access/actorContext.js'
import { fetchTransactionsData } from '../transactions/listReadApi.js'
import { requireClient, isMissingTableError } from '../../lib/api/shared/readHelpers.js'
import { normalizeNotificationRow, createTransactionNotificationIfPossible } from '../transactions/participantInfrastructure.js'
import { fetchTransactionsByParticipant } from '../transactions/detailApi.js'

async function runOverdueMissingDocsReminderAutomation(client, { userId, role } = {}) {
  if (!userId || !role || !['developer', 'agent', 'attorney', 'bond_originator'].includes(role)) {
    return
  }

  let rows = []
  if (role === 'developer') {
    rows = await fetchTransactionsData({ developmentId: null })
  } else {
    rows = await fetchTransactionsByParticipant({ userId, roleType: role })
  }

  const now = Date.now()
  const staleRows = rows
    .filter((row) => row?.transaction)
    .map((row) => {
      const updatedAt = new Date(row?.transaction?.updated_at || row?.transaction?.created_at || 0).getTime()
      const daysSinceUpdate = Number.isFinite(updatedAt) ? Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24)) : 0
      const missingCount = Number(row?.documentSummary?.missingCount || 0)
      return {
        row,
        daysSinceUpdate,
        missingCount,
      }
    })
    .filter((item) => item.missingCount > 0 && item.daysSinceUpdate >= 3)
    .sort((left, right) => right.daysSinceUpdate - left.daysSinceUpdate)
    .slice(0, 5)

  for (const item of staleRows) {
    const transactionId = item.row?.transaction?.id
    if (!transactionId) {
      continue
    }

    const dedupeDay = new Date().toISOString().slice(0, 10)
    await createTransactionNotificationIfPossible(client, {
      transactionId,
      userId,
      roleType: role,
      notificationType: 'overdue_missing_docs',
      title: 'Missing documents reminder',
      message: `${item.missingCount} required document${item.missingCount === 1 ? '' : 's'} still outstanding for Unit ${item.row?.unit?.unit_number || '-'}.`,
      eventType: 'TransactionUpdated',
      eventData: {
        daysSinceUpdate: item.daysSinceUpdate,
        missingDocuments: item.missingCount,
        trigger: 'overdue_missing_docs',
      },
      dedupeKey: `overdue-missing-docs:${transactionId}:${userId}:${dedupeDay}`,
    })
  }
}

export async function fetchMyNotifications({ limit = 25, unreadOnly = false } = {}) {
  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)
  if (!activeProfile.userId) {
    return { notifications: [], unreadCount: 0 }
  }

  await runOverdueMissingDocsReminderAutomation(client, {
    userId: activeProfile.userId,
    role: activeProfile.role,
  })

  let query = client
    .from('transaction_notifications')
    .select(
      'id, transaction_id, user_id, role_type, notification_type, title, message, is_read, read_at, dedupe_key, event_type, event_data, created_at, updated_at',
    )
    .eq('user_id', activeProfile.userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (unreadOnly) {
    query = query.eq('is_read', false)
  }

  const listQuery = await query
  if (listQuery.error) {
    if (isMissingTableError(listQuery.error, 'transaction_notifications')) {
      return { notifications: [], unreadCount: 0 }
    }
    throw listQuery.error
  }

  const unreadQuery = await client
    .from('transaction_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', activeProfile.userId)
    .eq('is_read', false)

  const unreadCount = unreadQuery.error ? 0 : Number(unreadQuery.count || 0)
  const notifications = (listQuery.data || []).map((row) => normalizeNotificationRow(row))
  const transactionIds = [...new Set(notifications.map((item) => item.transactionId).filter(Boolean))]
  let unitIdByTransactionId = {}

  if (transactionIds.length) {
    const unitLookup = await client.from('transactions').select('id, unit_id').in('id', transactionIds)
    if (!unitLookup.error) {
      unitIdByTransactionId = (unitLookup.data || []).reduce((accumulator, row) => {
        if (row?.id) {
          accumulator[row.id] = row.unit_id || null
        }
        return accumulator
      }, {})
    }
  }

  return {
    notifications: notifications.map((notification) => ({
      ...notification,
      unitId: unitIdByTransactionId[notification.transactionId] || notification.eventData?.unitId || null,
    })),
    unreadCount,
  }
}

export async function runMyNotificationReminderAutomation() {
  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)
  if (!activeProfile.userId) return null
  return runOverdueMissingDocsReminderAutomation(client, {
    userId: activeProfile.userId,
    role: activeProfile.role,
  })
}

export async function markNotificationRead(notificationId) {
  const client = requireClient()
  if (!notificationId) {
    return null
  }

  const activeProfile = await resolveActiveProfileContext(client)
  if (!activeProfile.userId) {
    return null
  }

  const updateQuery = await client
    .from('transaction_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', notificationId)
    .eq('user_id', activeProfile.userId)
    .select(
      'id, transaction_id, user_id, role_type, notification_type, title, message, is_read, read_at, dedupe_key, event_type, event_data, created_at, updated_at',
    )
    .maybeSingle()

  if (updateQuery.error) {
    if (isMissingTableError(updateQuery.error, 'transaction_notifications')) {
      return null
    }
    throw updateQuery.error
  }

  return updateQuery.data ? normalizeNotificationRow(updateQuery.data) : null
}

export async function markAllNotificationsRead() {
  const client = requireClient()
  const activeProfile = await resolveActiveProfileContext(client)
  if (!activeProfile.userId) {
    return 0
  }

  const updateQuery = await client
    .from('transaction_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', activeProfile.userId)
    .eq('is_read', false)
    .select('id')

  if (updateQuery.error) {
    if (isMissingTableError(updateQuery.error, 'transaction_notifications')) {
      return 0
    }
    throw updateQuery.error
  }

  return (updateQuery.data || []).length
}
