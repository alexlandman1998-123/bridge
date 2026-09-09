import { supabase } from '../lib/supabaseClient'

export const HOME_SEEKERS_FIC_TRAINING_TABLE = 'home_seekers_fic_training_results'

export function isHomeSeekersOrganisation(organisation = {}) {
  const name = String(
    organisation?.name || organisation?.organisationName || organisation?.organisation_name || organisation?.companyName || '',
  ).trim().toLowerCase()
  return name === 'home seekers'
}

function requireClient() {
  if (!supabase) throw new Error('Training is unavailable until the secure data connection is configured.')
  return supabase
}

function normaliseResult(row = {}) {
  return {
    id: String(row.id || ''),
    organisationId: String(row.organisation_id || ''),
    userId: String(row.user_id || ''),
    score: Number(row.score || 0),
    totalQuestions: Number(row.total_questions || 0),
    answers: row.answers && typeof row.answers === 'object' ? row.answers : {},
    completedAt: row.completed_at || '',
    updatedAt: row.updated_at || '',
  }
}

export async function getHomeSeekersFicTrainingResult({ organisationId, userId }) {
  if (!organisationId || !userId) return null
  const client = requireClient()
  const { data, error } = await client
    .from(HOME_SEEKERS_FIC_TRAINING_TABLE)
    .select('id, organisation_id, user_id, score, total_questions, answers, completed_at, updated_at')
    .eq('organisation_id', organisationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? normaliseResult(data) : null
}

export async function saveHomeSeekersFicTrainingResult({ organisationId, userId, score, totalQuestions, answers }) {
  if (!organisationId || !userId) throw new Error('Your organisation and user identity are required to save training.')
  const client = requireClient()
  const { data, error } = await client
    .from(HOME_SEEKERS_FIC_TRAINING_TABLE)
    .upsert({
      organisation_id: organisationId,
      user_id: userId,
      score: Number(score || 0),
      total_questions: Number(totalQuestions || 0),
      answers: answers && typeof answers === 'object' ? answers : {},
      completed_at: new Date().toISOString(),
    }, { onConflict: 'organisation_id,user_id' })
    .select('id, organisation_id, user_id, score, total_questions, answers, completed_at, updated_at')
    .single()
  if (error) throw error
  return normaliseResult(data)
}

export async function listHomeSeekersFicTrainingResults({ organisationId }) {
  if (!organisationId) return []
  const client = requireClient()
  const { data, error } = await client
    .from(HOME_SEEKERS_FIC_TRAINING_TABLE)
    .select('id, organisation_id, user_id, score, total_questions, completed_at, updated_at')
    .eq('organisation_id', organisationId)
    .order('completed_at', { ascending: false })
  if (error) throw error
  return (data || []).map(normaliseResult)
}

export async function listHomeSeekersAgents({ organisationId }) {
  if (!organisationId) return []
  const client = requireClient()
  const { data, error } = await client
    .from('organisation_users')
    .select('user_id, first_name, last_name, full_name, email, role, organisation_role, workspace_role, membership_status, status')
    .eq('organisation_id', organisationId)
  if (error) throw error
  return (data || [])
    .filter((member) => {
      const status = String(member.membership_status || member.status || 'active').toLowerCase()
      const role = String(member.workspace_role || member.organisation_role || member.role || '').toLowerCase()
      return status === 'active' && String(member.user_id || '').trim() && ['agent', 'sales_agent'].includes(role)
    })
    .map((member) => ({
      userId: String(member.user_id),
      name: String(member.full_name || [member.first_name, member.last_name].filter(Boolean).join(' ') || member.email || 'Team member'),
      email: String(member.email || ''),
      role: String(member.workspace_role || member.organisation_role || member.role || 'agent'),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
