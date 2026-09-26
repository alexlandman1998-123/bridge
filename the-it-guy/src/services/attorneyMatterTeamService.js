import { requireClient } from './attorneyFirmServiceShared'

export async function getAttorneyMatterTeamSummaries(transactionIds = []) {
  const ids = [...new Set(transactionIds.filter(Boolean))]
  if (!ids.length) return {}
  const client = requireClient()
  const batches = []
  for (let offset = 0; offset < ids.length; offset += 100) {
    batches.push(ids.slice(offset, offset + 100))
  }
  const results = await Promise.all(batches.map(async (batch) => {
    const { data, error } = await client.rpc('bridge_list_attorney_matter_team_summaries', {
      p_transaction_ids: batch,
    })
    if (error) throw error
    return data || {}
  }))
  return Object.assign({}, ...results)
}

export async function getAttorneyMatterTeam(transactionId) {
  if (!transactionId) throw new Error('Matter id is required.')
  const { data, error } = await requireClient().rpc('bridge_get_attorney_matter_team', {
    p_transaction_id: transactionId,
  })
  if (error) throw error
  return data || { members: [], availableMembers: [], canManage: false, canUpdateWorkflow: false }
}

export async function saveAttorneyMatterTeam(transactionId, userIds) {
  if (!transactionId) throw new Error('Matter id is required.')
  const { data, error } = await requireClient().rpc('bridge_set_attorney_matter_team', {
    p_transaction_id: transactionId,
    p_user_ids: [...new Set((userIds || []).filter(Boolean))],
  })
  if (error) throw error
  return data
}
