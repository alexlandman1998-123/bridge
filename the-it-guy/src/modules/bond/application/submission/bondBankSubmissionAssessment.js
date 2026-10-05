export function assessBondBankSubmission({ plan, reviewContext, releaseGate } = {}) {
  const issues = [...(plan.issues || [])]
  const add = (code, message) => issues.push({ code, message })
  if (!plan.ready && !issues.length && !plan.rows.some(row => row.outstanding && row.blocking !== false)) add('application_readiness_unverified', 'The saved application completeness check has not passed.')
  for (const row of plan.rows) if (row.outstanding && row.blocking !== false) add('approved_document_required', `${row.title}: ${row.status}.`)
  if (!Array.isArray(plan.snapshot.selectedBanks) || !plan.snapshot.selectedBanks.length) add('selected_banks_required', 'Select and authorise at least one bank in the signed application before bank submission.')
  const signers = plan.snapshot.signerManifest || []
  const participants = plan.snapshot.participants || []
  const signatures = plan.submission.metadata?.signatureChecks?.signers || []
  if (!signers.length || !participants.length || new Set(signers.map(signer => signer.participantKey)).size !== signers.length || participants.some(participant => !signers.some(signer => signer.participantKey === participant.participantKey))) add('signer_manifest_incomplete', 'The signed application must identify every required applicant.')
  if (plan.submission.metadata?.signingMethod !== 'wet_ink_upload') add('signing_method_not_connected', 'This signing method has not been connected and verified for bank submission.')
  if (['versionMatches', 'allPagesPresent', 'noAlterations'].some(key => plan.submission.metadata?.signatureChecks?.[key] !== true)) add('signed_original_review_incomplete', 'Confirm the signed original matches the fixed version, contains every page and has no altered answers.')
  for (const signer of signers) {
    const check = signatures.find(item => item.participantKey === signer.participantKey)
    if (check?.signaturePresent !== true || check.identityChecked !== true || !/^\d{4}-\d{2}-\d{2}$/.test(check.signedDate || '')) add('applicant_signature_unverified', `Verify the signature and identity for ${signer.fullName || 'every applicant'}.`)
  }
  if (!reviewContext?.review?.current || reviewContext.review.submission_id !== plan.submission.id || reviewContext.review.context_hash !== reviewContext.contextHash) add('consultant_review_required', reviewContext?.review ? 'The application or documents changed after consultant review. Review the current pack again.' : 'The consultant must review the fixed application, documents, signatures and bank forms.')
  const applicationComplete = !issues.length
  const releaseIssues = [...(releaseGate?.blockers || [])]
  if (releaseGate?.ready !== true || releaseGate?.methods?.[plan.submission.metadata?.signingMethod] !== true) {
    if (!releaseIssues.length) releaseIssues.push({ code: 'release_not_approved', message: 'Release approval and verified integration evidence are required before bank submission.' })
  }
  const ready = applicationComplete && releaseIssues.length === 0 && releaseGate?.ready === true && releaseGate?.methods?.[plan.submission.metadata?.signingMethod] === true
  return { ready, applicationComplete, status: ready ? 'ready_for_bank_submission' : applicationComplete ? 'release_blocked' : 'incomplete', label: ready ? 'Ready for bank submission' : applicationComplete ? 'Consultant review complete — release checks pending' : 'Incomplete — resolve outstanding items before bank submission', issues: [...issues, ...releaseIssues] }
}
