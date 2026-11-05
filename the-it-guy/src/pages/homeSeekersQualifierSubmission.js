import { nextStepsErrors, qualifierOutcome } from './homeSeekersNextStepsModel'

// Use the site's existing enquiry intake, not the application/account flow.
// Keep source and outcome in the CRM message alongside every qualifying answer.
export async function submitHomeSeekersQualifier(details, id, { fetcher = fetch, pageUrl = window.location.href } = {}) {
  if (Object.keys(nextStepsErrors(details)).length) throw new Error('Check your answers before continuing.')
  const outcome = qualifierOutcome(details)
  const message = JSON.stringify({
    source: 'homeseeker_join_next_steps', type: 'founder_call_qualifier', outcome,
    firstName: details.firstName.trim(), surname: details.surname.trim(),
    ffc: details.ffc, sales: Number(details.sales), value: Number(details.value),
    area: details.area.trim(), split: details.split,
  })
  const response = await fetcher('/api/home-seekers/leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ type: 'general_enquiry', leadIntent: 'other',
      name: `${details.firstName.trim()} ${details.surname.trim()}`, email: details.email.trim().toLowerCase(),
      phone: details.mobile.trim(), privacyAccepted: details.consent === true,
      marketingConsent: false, idempotencyKey: id, message, pageUrl,
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.accepted !== true) {
    const message = typeof result.error === 'string' && !/saved|recorded/i.test(result.error) ? result.error : 'We couldn’t continue. Please try again.'
    throw new Error(message)
  }
  return { id, outcome }
}
