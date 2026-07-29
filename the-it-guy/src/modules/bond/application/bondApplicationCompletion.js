function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

export function bondApplicationValuePresent(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length > 0
  return String(value || '').trim().length > 0
}

function personalApplicantChecks(applicant = {}) {
  const checks = [
    bondApplicationValuePresent(applicant?.first_name),
    bondApplicationValuePresent(applicant?.last_name),
    bondApplicationValuePresent(applicant?.date_of_birth),
    bondApplicationValuePresent(applicant?.id_type),
    bondApplicationValuePresent(applicant?.marital_status),
    bondApplicationValuePresent(applicant?.sa_tax_number) || bondApplicationValuePresent(applicant?.tax_number_unavailable_reason),
  ]
  if (normalizeStatus(applicant?.id_type) === 'passport') {
    checks.push(bondApplicationValuePresent(applicant?.passport_number))
    checks.push(bondApplicationValuePresent(applicant?.passport_country_of_issue))
  } else if (normalizeStatus(applicant?.id_type) === 'refugee_id') {
    checks.push(bondApplicationValuePresent(applicant?.refugee_id_card_number))
  } else {
    checks.push(bondApplicationValuePresent(applicant?.id_number))
  }
  if (normalizeStatus(applicant?.temporary_sa_resident) === 'yes') {
    checks.push(bondApplicationValuePresent(applicant?.permit_type))
    checks.push(bondApplicationValuePresent(applicant?.permit_number))
    checks.push(bondApplicationValuePresent(applicant?.permit_expiry_date))
  }
  return checks
}

export function calculateLegacyBondApplicationCompletion({
  application,
  sections = [],
  requiredDocuments = [],
} = {}) {
  const bondApplicationData = application || {}
  const hasCoApplicantProfile =
    normalizeStatus(bondApplicationData?.summary?.has_co_applicant) === 'yes' ||
    Boolean(bondApplicationData?.applicants?.find((applicant) => applicant?.key === 'co_applicant')?.first_name)
  const primaryApplicant = bondApplicationData?.applicants?.find((applicant) => applicant?.key === 'primary') || {}
  const coApplicant = bondApplicationData?.applicants?.find((applicant) => applicant?.key === 'co_applicant') || {}

  const sectionCheckMap = {
    summary: [
      bondApplicationValuePresent(bondApplicationData?.summary?.applicant_name),
      bondApplicationValuePresent(bondApplicationData?.summary?.property_reference),
      bondApplicationValuePresent(bondApplicationData?.summary?.purchase_price),
      bondApplicationValuePresent(bondApplicationData?.summary?.finance_type),
      bondApplicationValuePresent(bondApplicationData?.summary?.marital_status),
      bondApplicationValuePresent(bondApplicationData?.summary?.main_residence),
      bondApplicationValuePresent(bondApplicationData?.summary?.first_time_home_buyer),
    ],
    personal_details: [
      ...personalApplicantChecks(primaryApplicant),
      ...(hasCoApplicantProfile ? personalApplicantChecks(coApplicant) : []),
    ],
    contact_address: [
      bondApplicationValuePresent(bondApplicationData?.contact_address?.cellphone_number),
      bondApplicationValuePresent(bondApplicationData?.contact_address?.email_address),
      bondApplicationValuePresent(bondApplicationData?.contact_address?.residential_address_street),
      bondApplicationValuePresent(bondApplicationData?.contact_address?.residential_address_city),
      bondApplicationValuePresent(bondApplicationData?.contact_address?.residential_address_postal_code),
      bondApplicationValuePresent(bondApplicationData?.contact_address?.legal_notice_delivery_method),
    ],
    employment: [
      bondApplicationValuePresent(bondApplicationData?.employment?.primary?.occupation_status),
      bondApplicationValuePresent(bondApplicationData?.employment?.primary?.occupational_level),
      bondApplicationValuePresent(bondApplicationData?.employment?.primary?.nature_of_occupation),
      bondApplicationValuePresent(bondApplicationData?.employment?.primary?.employment_years) ||
        bondApplicationValuePresent(bondApplicationData?.employment?.primary?.employment_months),
      ...(hasCoApplicantProfile
        ? [
            bondApplicationValuePresent(bondApplicationData?.employment?.co_applicant?.occupation_status),
            bondApplicationValuePresent(bondApplicationData?.employment?.co_applicant?.occupational_level),
          ]
        : []),
    ],
    credit_history: [
      bondApplicationValuePresent(bondApplicationData?.credit_history?.currently_under_administration),
      bondApplicationValuePresent(bondApplicationData?.credit_history?.currently_under_debt_review),
      bondApplicationValuePresent(bondApplicationData?.credit_history?.ever_declared_insolvent),
      bondApplicationValuePresent(bondApplicationData?.credit_history?.bound_by_surety_agreements),
    ],
    loan_details: [
      bondApplicationValuePresent(bondApplicationData?.loan_details?.street_or_complex),
      bondApplicationValuePresent(bondApplicationData?.loan_details?.suburb),
      bondApplicationValuePresent(bondApplicationData?.loan_details?.amount_to_be_registered),
      bondApplicationValuePresent(bondApplicationData?.loan_details?.debit_order_bank_name),
      bondApplicationValuePresent(bondApplicationData?.loan_details?.debit_order_account_number),
      bondApplicationValuePresent(bondApplicationData?.loan_details?.preferred_debit_order_date),
    ],
    income_deductions_expenses: [
      bondApplicationValuePresent(bondApplicationData?.income_deductions_expenses?.primary?.gross_salary),
      bondApplicationValuePresent(bondApplicationData?.income_deductions_expenses?.primary?.tax_paye),
      bondApplicationValuePresent(bondApplicationData?.income_deductions_expenses?.primary?.groceries),
      bondApplicationValuePresent(bondApplicationData?.income_deductions_expenses?.primary?.transport),
      ...(hasCoApplicantProfile
        ? [bondApplicationValuePresent(bondApplicationData?.income_deductions_expenses?.co_applicant?.gross_salary)]
        : []),
    ],
    banking_liabilities: [
      bondApplicationValuePresent(bondApplicationData?.banking_liabilities?.primary_bank_name),
      bondApplicationValuePresent(bondApplicationData?.banking_liabilities?.primary_account_type),
      bondApplicationValuePresent(bondApplicationData?.banking_liabilities?.primary_account_number),
      bondApplicationValuePresent(bondApplicationData?.banking_liabilities?.other_finance_1_account_type),
    ],
    assets_liabilities: [
      bondApplicationValuePresent(bondApplicationData?.assets_liabilities?.fixed_property),
      bondApplicationValuePresent(bondApplicationData?.assets_liabilities?.vehicles),
      bondApplicationValuePresent(bondApplicationData?.assets_liabilities?.total_assets),
      bondApplicationValuePresent(bondApplicationData?.assets_liabilities?.total_liabilities),
      bondApplicationValuePresent(bondApplicationData?.assets_liabilities?.net_asset_value),
    ],
    declarations_consents: [
      Boolean(bondApplicationData?.declarations_consents?.loan_processing_consent),
      Boolean(bondApplicationData?.declarations_consents?.credit_bureau_fraud_bank_data_consent),
      Boolean(bondApplicationData?.declarations_consents?.declaration_accepted),
      bondApplicationValuePresent(bondApplicationData?.declarations_consents?.digital_signature_name),
      bondApplicationValuePresent(bondApplicationData?.declarations_consents?.digital_signature_date),
    ],
    documents: [
      !requiredDocuments.length ||
        requiredDocuments.some((document) => Boolean(document?.complete || document?.uploadedDocumentId)),
    ],
  }

  const sectionStatusByKey = Object.fromEntries(
    sections.map((section) => {
      const checks = sectionCheckMap[section.key] || []
      const total = checks.length
      const complete = checks.filter(Boolean).length
      return [
        section.key,
        {
          total,
          complete,
          isComplete: total > 0 && complete === total,
          hasMissing: total > 0 && complete < total,
          completionPercent: total > 0 ? Math.round((complete / total) * 100) : 0,
        },
      ]
    }),
  )
  const progressSections = sections.filter((section) => section.key !== 'documents')
  const completedCount = progressSections.filter((section) => sectionStatusByKey[section.key]?.isComplete).length
  const missingSectionLabels = progressSections
    .filter((section) => sectionStatusByKey[section.key]?.hasMissing)
    .map((section) => section.label)
  const progressPercent = progressSections.length
    ? Math.round((completedCount / progressSections.length) * 100)
    : 0

  return {
    hasCoApplicantProfile,
    primaryApplicant,
    coApplicant,
    sectionCheckMap,
    sectionStatusByKey,
    progressSections,
    completedCount,
    missingSectionLabels,
    progressPercent,
  }
}
