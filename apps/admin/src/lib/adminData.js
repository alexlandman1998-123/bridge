import { supabase } from './supabaseClient'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function formatDate(value) {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

async function tryQuery(label, queryFactory) {
  if (!supabase) return { data: [], error: null, skipped: true }
  try {
    const { data, error } = await queryFactory()
    if (error) return { data: [], error: { label, message: error.message } }
    return { data: Array.isArray(data) ? data : [], error: null }
  } catch (error) {
    return { data: [], error: { label, message: error?.message || 'Query failed' } }
  }
}

function rowName(row = {}) {
  return (
    normalizeText(row.full_name) ||
    normalizeText(row.name) ||
    normalizeText(row.display_name) ||
    normalizeText(row.email) ||
    'Unknown record'
  )
}

function rowEmail(row = {}) {
  return normalizeText(row.email) || normalizeText(row.contact_email) || normalizeText(row.client_email) || 'No email'
}

function rowStatus(row = {}) {
  return normalizeText(row.status) || normalizeText(row.stage) || normalizeText(row.workflow_status) || 'open'
}

function rowUpdatedAt(row = {}) {
  return row.updated_at || row.created_at || row.inserted_at || row.last_seen_at || null
}

export async function loadAdminProfile(userId) {
  if (!supabase || !userId) return null

  const attempts = [
    () => supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    () => supabase.from('users').select('*').eq('id', userId).maybeSingle(),
    () => supabase.from('staff_profiles').select('*').eq('user_id', userId).maybeSingle(),
  ]

  for (const query of attempts) {
    const { data, error } = await query()
    if (data && !error) return data
  }

  return null
}

export async function loadDashboardSnapshot() {
  const [tickets, transactions, customers, activities] = await Promise.all([
    tryQuery('support_tickets', () =>
      supabase
        .from('support_tickets')
        .select('id, subject, status, priority, requester_email, assignee_id, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(8),
    ),
    tryQuery('transactions', () =>
      supabase
        .from('transactions')
        .select('id, reference, status, stage, workflow_status, buyer_name, seller_name, updated_at, created_at')
        .order('updated_at', { ascending: false })
        .limit(8),
    ),
    tryQuery('profiles', () =>
      supabase
        .from('profiles')
        .select('id, full_name, email, role, status, updated_at, created_at')
        .order('updated_at', { ascending: false })
        .limit(8),
    ),
    tryQuery('audit_logs', () =>
      supabase
        .from('audit_logs')
        .select('id, event_type, action, actor_email, target_type, created_at')
        .order('created_at', { ascending: false })
        .limit(8),
    ),
  ])

  const warnings = [tickets.error, transactions.error, customers.error, activities.error].filter(Boolean)

  return {
    metrics: [
      { label: 'Open tickets', value: tickets.data.filter((ticket) => rowStatus(ticket) !== 'closed').length },
      { label: 'Recent transactions', value: transactions.data.length },
      { label: 'Customer records', value: customers.data.length },
      { label: 'Audit events', value: activities.data.length },
    ],
    tickets: tickets.data.map((ticket) => ({
      id: ticket.id,
      title: normalizeText(ticket.subject) || 'Untitled support ticket',
      meta: ticket.requester_email || 'No requester',
      status: rowStatus(ticket),
      priority: normalizeText(ticket.priority) || 'normal',
      time: formatDate(rowUpdatedAt(ticket)),
    })),
    transactions: transactions.data.map((transaction) => ({
      id: transaction.id,
      title: normalizeText(transaction.reference) || `Transaction ${String(transaction.id).slice(0, 8)}`,
      meta: [transaction.buyer_name, transaction.seller_name].filter(Boolean).join(' / ') || 'No parties linked',
      status: rowStatus(transaction),
      time: formatDate(rowUpdatedAt(transaction)),
    })),
    customers: customers.data.map((customer) => ({
      id: customer.id,
      title: rowName(customer),
      meta: rowEmail(customer),
      status: normalizeText(customer.role) || rowStatus(customer),
      time: formatDate(rowUpdatedAt(customer)),
    })),
    activities: activities.data.map((activity) => ({
      id: activity.id,
      title: normalizeText(activity.event_type || activity.action) || 'Platform activity',
      meta: [activity.actor_email, activity.target_type].filter(Boolean).join(' / ') || 'System event',
      status: 'logged',
      time: formatDate(activity.created_at),
    })),
    warnings,
  }
}

export async function searchPlatform(term) {
  const query = normalizeText(term)
  if (!query) return { customers: [], transactions: [], warnings: [] }

  const [customers, clients, transactions] = await Promise.all([
    tryQuery('profiles', () =>
      supabase
        .from('profiles')
        .select('id, full_name, email, role, status, updated_at')
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10),
    ),
    tryQuery('clients', () =>
      supabase
        .from('clients')
        .select('id, name, email, status, updated_at')
        .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10),
    ),
    tryQuery('transactions', () =>
      supabase
        .from('transactions')
        .select('id, reference, status, stage, buyer_name, seller_name, updated_at')
        .or(`reference.ilike.%${query}%,buyer_name.ilike.%${query}%,seller_name.ilike.%${query}%`)
        .limit(10),
    ),
  ])

  return {
    customers: [...customers.data, ...clients.data].map((row) => ({
      id: row.id,
      title: rowName(row),
      meta: rowEmail(row),
      status: normalizeText(row.role) || rowStatus(row),
      time: formatDate(rowUpdatedAt(row)),
    })),
    transactions: transactions.data.map((row) => ({
      id: row.id,
      title: normalizeText(row.reference) || `Transaction ${String(row.id).slice(0, 8)}`,
      meta: [row.buyer_name, row.seller_name].filter(Boolean).join(' / ') || 'No parties linked',
      status: rowStatus(row),
      time: formatDate(rowUpdatedAt(row)),
    })),
    warnings: [customers.error, clients.error, transactions.error].filter(Boolean),
  }
}
