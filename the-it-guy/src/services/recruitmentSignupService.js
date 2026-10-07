import { normalizeRecruitmentProfile } from '../pages/recruitment/recruitmentProfileModel'
import { normalizeRecruitmentContact, recruitmentSignupErrors } from '../pages/recruitment/recruitmentContactModel'

export async function recruitmentSignupRequest(action, details = {}, { endpoint = '/api/public/recruitment-intake', token, fetcher = fetch, timeoutMs = 20000 } = {}) {
  if (action === 'signup' && Object.keys(recruitmentSignupErrors(details.contact, details.password)).length) throw new Error('Check your contact details, password and consent.')
  const body = action === 'signup'
    ? { action, contact: normalizeRecruitmentContact(details.contact), password: details.password, submissionKey: details.submissionKey, companyWebsite: details.companyWebsite || '' }
    : action === 'submit_profile' ? { action, revision: details.revision, submissionKey: details.submissionKey, privacyAccepted: details.privacyAccepted === true, declarationAccepted: details.declarationAccepted === true }
    : action === 'save_profile' ? { action, answers: normalizeRecruitmentProfile(details.answers), revision: details.revision, page: details.page, intent: details.intent }
    : ['send_verification', 'verify_email', 'sign_in'].includes(action)
      ? { action, email: details.email, ...(details.submissionKey ? { submissionKey: details.submissionKey } : {}), ...(action === 'verify_email' ? { code: details.code } : {}), ...(action === 'sign_in' ? { password: details.password } : {}) }
      : { action: ['resume', 'sign_out'].includes(action) ? action : 'context' }
  if (token) body.token = token
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify(body) })
    const result = await response.json().catch(() => ({}))
    const signupReady = result.accepted === true && (result.accountCreated === true || (result.contactAccepted === true && result.verificationRequired === true))
    if (!response.ok || (action === 'submit_profile' && (result.accepted !== true || result.applicant?.applicationSubmitted !== true || result.applicant.emailVerification !== 'verified')) || (action === 'signup' && !signupReady) || (action === 'save_profile' && (result.saved !== true || result.applicant?.emailVerification !== 'verified'))) {
      const error = new Error(result.error || (action === 'submit_profile' ? 'Your application could not be submitted. Please retry.' : action === 'save_profile' ? 'Your questionnaire could not be saved. Please retry.' : 'Your account could not be created. Please retry.'))
      error.contactAccepted = result.contactAccepted === true
      error.status = response.status
      error.conflict = result.conflict === true
      error.errors = result.errors
      error.verificationRequired = result.verificationRequired === true
      throw error
    }
    return result
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The connection took too long. Please retry with the same details.')
    throw error
  } finally { clearTimeout(timer) }
}
