import { supabase } from '../lib/supabaseClient'

// Bound every read to the already permission-scoped transactions. Pagination
// avoids silently dropping records at the API's default row limit.
export async function readBondDashboardPerformance(ids = [], workspaceId = '', client = supabase) {
  if (!ids.length) return { submissions: [], commissions: [], bankAvailable: true, commissionAvailable: true }
  if (!client || !workspaceId) return { submissions: [], commissions: [], bankAvailable: false, commissionAvailable: false }
  async function read(table, columns, key, values, organisation = false) {
    const rows = []
    for (let offset = 0; offset < values.length; offset += 100) {
      const batch = values.slice(offset, offset + 100)
      for (let page = 0; ; page += 1) {
        let query = client.from(table).select(columns).in(key, batch).order('id').range(page * 500, page * 500 + 499)
        if (organisation) query = query.eq('organisation_id', workspaceId)
        const { data, error } = await query
        if (error) throw error
        rows.push(...(data || []))
        if ((data || []).length < 500) break
      }
    }
    return rows
  }
  const [bank, guided] = await Promise.allSettled([
    read('transaction_bond_applications', 'id,transaction_id,bank_name,status,submitted_at,feedback_received_at', 'transaction_id', ids),
    read('bond_applications', 'id,transaction_id', 'transaction_id', ids),
  ])
  const submissions = bank.status === 'fulfilled' ? bank.value : []
  // Ledger application IDs may reference a matter, lender application, or guided application.
  const applications = [...submissions, ...(guided.status === 'fulfilled' ? guided.value : [])]
  const transactionByApplication = new Map(applications.map((row) => [row.id, row.transaction_id]))
  const ledgerIds = [...new Set([...ids, ...transactionByApplication.keys()])]
  try {
    const commissions = await read('bond_commissions', 'id,application_id,amount,status,paid_at', 'application_id', ledgerIds, true)
    return { submissions, commissions: commissions.map((row) => ({ ...row, transaction_id: transactionByApplication.get(row.application_id) || row.application_id })), bankAvailable: bank.status === 'fulfilled', commissionAvailable: bank.status === 'fulfilled' && guided.status === 'fulfilled' }
  } catch {
    return { submissions, commissions: [], bankAvailable: bank.status === 'fulfilled', commissionAvailable: false }
  }
}
