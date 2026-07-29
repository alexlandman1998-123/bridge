export const LEGACY_BOND_SUBMISSION_ISSUES = {
  CONSENT_AND_SIGNATURE_REQUIRED: 'consent_and_signature_required',
  SELECTED_BANK_REQUIRED: 'selected_bank_required',
}

export const LEGACY_BOND_SUBMISSION_MESSAGES = {
  [LEGACY_BOND_SUBMISSION_ISSUES.CONSENT_AND_SIGNATURE_REQUIRED]:
    'Please complete the declarations, consents, and digital signature before submitting your bond application.',
  [LEGACY_BOND_SUBMISSION_ISSUES.SELECTED_BANK_REQUIRED]:
    'Select at least one bank before submitting your bond application.',
}

export function validateLegacyBondApplicationSubmission(application) {
  const issues = []
  const hasConsent = Boolean(
    application?.declarations_consents?.loan_processing_consent &&
      application?.declarations_consents?.credit_bureau_fraud_bank_data_consent &&
      application?.declarations_consents?.declaration_accepted &&
      String(application?.declarations_consents?.digital_signature_name || '').trim() &&
      String(application?.declarations_consents?.digital_signature_date || '').trim(),
  )

  if (!hasConsent) {
    issues.push({
      code: LEGACY_BOND_SUBMISSION_ISSUES.CONSENT_AND_SIGNATURE_REQUIRED,
      path: 'declarations_consents',
      message: LEGACY_BOND_SUBMISSION_MESSAGES[LEGACY_BOND_SUBMISSION_ISSUES.CONSENT_AND_SIGNATURE_REQUIRED],
    })
  }

  if (!Array.isArray(application?.selected_banks) || application.selected_banks.length === 0) {
    issues.push({
      code: LEGACY_BOND_SUBMISSION_ISSUES.SELECTED_BANK_REQUIRED,
      path: 'selected_banks',
      message: LEGACY_BOND_SUBMISSION_MESSAGES[LEGACY_BOND_SUBMISSION_ISSUES.SELECTED_BANK_REQUIRED],
    })
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}
