export const OFFER_WORKFLOW_RETIRED = true

export const OFFER_WORKFLOW_RETIRED_MESSAGE =
  'The buyer offer workflow has been retired. Use buyer onboarding to capture purchase, finance, party, and OTP details.'

export const OFFER_WORKFLOW_RETIRED_REASON =
  'Arch9 no longer creates or routes buyer offers in the platform; OTP preparation starts from buyer onboarding and uploaded signed OTP evidence.'

export function assertOfferWorkflowAvailable() {
  if (!OFFER_WORKFLOW_RETIRED) return
  const error = new Error(OFFER_WORKFLOW_RETIRED_MESSAGE)
  error.code = 'offer_workflow_retired'
  error.reason = OFFER_WORKFLOW_RETIRED_REASON
  throw error
}
