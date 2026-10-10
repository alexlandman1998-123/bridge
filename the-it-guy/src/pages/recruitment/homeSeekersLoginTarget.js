import { checkRecruitmentApplicantGate } from './recruitmentApplicantGateCheck'

export async function homeSeekersLoginTarget(client) {
  const { data, error } = await client.auth.getUser()
  if (error || !data?.user?.id || !data.user.email_confirmed_at || data.user.is_anonymous) {
    throw new Error('Please log in again to continue.')
  }
  const gate = await checkRecruitmentApplicantGate(client, data.user.id)
  if (gate.error) throw new Error('We could not check your account. Please try again.')
  // The existing workspace gate still validates active membership and permissions.
  return gate.required ? '/applicant/my-profile' : '/dashboard'
}
