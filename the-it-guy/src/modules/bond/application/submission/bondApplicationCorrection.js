/** A correction may create a new version only from its explicitly recorded base submission. */
export function isBondCorrectionResubmission(application, previousSubmission) {
  return Boolean(application?.activeChangeRequestId
    && previousSubmission?.id
    && application.revisionBaseSubmissionId === previousSubmission.id
    && application.transactionId === previousSubmission.transaction_id
    && Number(application.revision) > Number(previousSubmission.source_application_revision || 0)
    && ['signed', 'submitted'].includes(previousSubmission.status))
}
