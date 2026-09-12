import { supabase } from '../lib/supabaseClient'

let taskTableUnavailable = false

function normalizeText(value = '') {
  return String(value || '').trim()
}

function resolveTaskStatus(tasks = {}) {
  const statuses = Object.values(tasks).map((task) => task?.status)
  if (statuses.some((status) => status === 'attention')) return 'failed'
  if (statuses.length && statuses.every((status) => ['complete', 'skipped'].includes(status))) return 'complete'
  if (statuses.some((status) => status === 'in_progress')) return 'in_progress'
  return 'pending'
}

export async function syncListingPostCreateTask({ listingId = '', organisationId = '', progress = {} } = {}) {
  const normalizedListingId = normalizeText(listingId)
  const normalizedOrganisationId = normalizeText(organisationId)
  if (!supabase || taskTableUnavailable || !normalizedListingId || !normalizedOrganisationId) return null

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user?.id) throw userError || new Error('A signed-in user is required to track listing setup.')

  const tasks = progress?.tasks && typeof progress.tasks === 'object' ? progress.tasks : {}
  const status = resolveTaskStatus(tasks)
  const errorLabels = Object.values(tasks)
    .filter((task) => task?.status === 'attention')
    .map((task) => normalizeText(task?.label))
    .filter(Boolean)

  const { data, error } = await supabase
    .from('private_listing_post_create_tasks')
    .upsert({
      private_listing_id: normalizedListingId,
      organisation_id: normalizedOrganisationId,
      task_key: 'listing_setup',
      status,
      progress: progress || {},
      last_error: errorLabels.join('; ') || null,
      created_by: userData.user.id,
      updated_at: new Date().toISOString(),
      completed_at: status === 'complete' ? (progress?.completedAt || new Date().toISOString()) : null,
    }, { onConflict: 'private_listing_id,task_key' })
    .select('id, status, progress, updated_at, completed_at')
    .single()
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      taskTableUnavailable = true
      return null
    }
    throw error
  }
  return data || null
}

export async function getListingPostCreateTask(listingId = '') {
  const normalizedListingId = normalizeText(listingId)
  if (!supabase || taskTableUnavailable || !normalizedListingId) return null
  const { data, error } = await supabase
    .from('private_listing_post_create_tasks')
    .select('progress')
    .eq('private_listing_id', normalizedListingId)
    .eq('task_key', 'listing_setup')
    .maybeSingle()
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      taskTableUnavailable = true
      return null
    }
    throw error
  }
  const progress = data?.progress && typeof data.progress === 'object' ? data.progress : null
  if (!progress) return null

  // Delivery is owned by the durable outbox, not the browser task. Overlay its
  // authoritative status when the Phase 4 migration is available.
  const { data: delivery, error: deliveryError } = await supabase
    .from('private_listing_seller_portal_invite_outbox')
    .select('status, sent_at, last_error')
    .eq('private_listing_id', normalizedListingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (deliveryError && deliveryError.code !== '42P01' && deliveryError.code !== 'PGRST205') throw deliveryError
  if (!delivery?.status) return progress

  const sellerPortal = delivery.status === 'sent'
    ? { status: 'complete', label: 'Seller portal invitation sent' }
    : delivery.status === 'failed'
      ? { status: 'attention', label: 'Seller portal invitation needs a retry' }
      : { status: 'complete', label: 'Seller portal invitation queued for delivery' }
  return { ...progress, tasks: { ...(progress.tasks || {}), sellerPortal } }
}
