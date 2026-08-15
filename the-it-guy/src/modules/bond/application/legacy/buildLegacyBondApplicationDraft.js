import { normalizeFinanceType } from '../../../../core/transactions/financeType.js'
import { getPurchaserEntityType, normalizePurchaserType } from '../../../../lib/purchaserPersonas.js'

export const LEGACY_BOND_APPLICATION_STATUS_OPTIONS = [
  'Not Started',
  'In Progress',
  'Submitted',
  'Under Review',
  'Approved',
  'Declined',
]

export function resolveBondApplicationStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  const matched = LEGACY_BOND_APPLICATION_STATUS_OPTIONS.find((status) => status.toLowerCase() === normalized)
  return matched || 'Not Started'
}

export function normalizeBondOfferDecisionState(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return normalized === 'accepted' || normalized === 'declined' ? normalized : ''
}

export function getBondApplicationApplicantDefault(roleKey, source = {}) {
  const buyerName = String(source?.buyer?.name || '').trim()
  const [firstName = '', ...surnameParts] = buyerName.split(/\s+/)
  const surnameFromBuyer = surnameParts.join(' ')
  const formData = source?.onboardingFormData?.formData || {}
  const spouseName = String(formData.spouse_full_name || '').trim()
  const [spouseFirstName = '', ...spouseSurnameParts] = spouseName.split(/\s+/)
  const spouseSurnameFromFullName = spouseSurnameParts.join(' ')

  if (roleKey === 'co_applicant') {
    return {
      key: 'co_applicant',
      label: 'Co-applicant',
      title: '',
      gender: '',
      first_name: formData.spouse_first_name || spouseFirstName || formData.spouse_full_name || '',
      last_name: formData.spouse_last_name || formData.spouse_surname || spouseSurnameFromFullName || '',
      date_of_birth: '',
      id_type: '',
      id_number: formData.spouse_identity_number || '',
      passport_number: '',
      passport_country_of_issue: '',
      refugee_id_card_number: '',
      sa_citizen: '',
      nationality: '',
      city_of_birth: '',
      country_of_birth: '',
      sa_permanent_resident: '',
      temporary_sa_resident: '',
      permit_type: '',
      permit_number: '',
      permit_expiry_date: '',
      marital_status: formData.marital_status || '',
      married_anc_register_both_names: '',
      country_of_marriage: '',
      number_of_dependants: '',
      ethnic_group: '',
      sa_tax_number: '',
      tax_number_unavailable_reason: '',
      tax_returns_outside_sa: '',
      foreign_tax_country: '',
      foreign_tax_number: '',
      current_residential_status: '',
      first_time_home_buyer: '',
      main_residence: '',
      highest_level_of_education: '',
      smoking_tobacco_ecig_declaration: '',
      email: formData.spouse_email || '',
      phone: formData.spouse_phone || '',
    }
  }

  return {
    key: 'primary',
    label: 'Primary applicant',
    title: '',
    gender: '',
    first_name: formData.first_name || firstName,
    last_name: formData.last_name || surnameFromBuyer,
    date_of_birth: formData.date_of_birth || '',
    id_type: formData.identity_number ? 'sa_id' : formData.passport_number ? 'passport' : '',
    id_number: formData.identity_number || '',
    passport_number: formData.passport_number || '',
    passport_country_of_issue: '',
    refugee_id_card_number: '',
    sa_citizen: formData.nationality ? 'yes' : '',
    nationality: formData.nationality || '',
    city_of_birth: '',
    country_of_birth: '',
    sa_permanent_resident: '',
    temporary_sa_resident: '',
    permit_type: '',
    permit_number: '',
    permit_expiry_date: '',
    married_anc_register_both_names: '',
    country_of_marriage: '',
    number_of_dependants: formData.number_of_dependants || '',
    ethnic_group: '',
    sa_tax_number: formData.tax_number || '',
    tax_number_unavailable_reason: '',
    tax_returns_outside_sa: '',
    foreign_tax_country: '',
    foreign_tax_number: '',
    current_residential_status: formData.residency_status || '',
    first_time_home_buyer: formData.first_time_buyer || '',
    main_residence: formData.primary_residence || '',
    highest_level_of_education: '',
    smoking_tobacco_ecig_declaration: '',
    email: formData.email || source?.buyer?.email || '',
    phone: formData.phone || source?.buyer?.phone || '',
    marital_status: formData.marital_status || '',
  }
}

export function buildLegacyBondApplicationDraft(portal) {
  const formData = portal?.onboardingFormData?.formData || {}
  const existing = formData.bond_application && typeof formData.bond_application === 'object' ? formData.bond_application : {}
  const primaryDefault = getBondApplicationApplicantDefault('primary', portal)
  const coApplicantDefault = getBondApplicationApplicantDefault('co_applicant', portal)
  const purchasePrice =
    Number(formData.purchase_price || portal?.transaction?.purchase_price || portal?.transaction?.sales_price || portal?.unit?.price || 0) || 0
  const financeType = normalizeFinanceType(
    formData.purchase_finance_type || portal?.transaction?.finance_type || 'bond',
    { allowUnknown: true },
  )
  const buyerEntityType = getPurchaserEntityType(normalizePurchaserType(
    existing?.summary?.buyer_entity_type ||
    existing?.summary?.purchaser_type ||
    formData.buyer_entity_type ||
    formData.purchaser_entity_type ||
    formData.purchaser_type ||
    portal?.transaction?.buyer_entity_type ||
    portal?.transaction?.purchaser_type ||
    portal?.purchaserType ||
    'individual',
  ))
  const buyerEntityName =
    existing?.summary?.buyer_entity_name ||
    formData.buyer_entity_name ||
    formData.purchaser_entity_name ||
    formData.company_name ||
    formData.trust_name ||
    ''
  const buyerEntityRegistrationNumber =
    existing?.summary?.buyer_entity_registration_number ||
    formData.buyer_entity_registration_number ||
    formData.purchaser_entity_registration_number ||
    formData.company_registration_number ||
    formData.trust_registration_number ||
    formData.registration_number ||
    ''

  const existingApplicants = Array.isArray(existing.applicants) ? existing.applicants : []
  const primaryApplicant = existingApplicants.find((item) => String(item?.key || '').toLowerCase() === 'primary') || {}
  const coApplicant = existingApplicants.find((item) => String(item?.key || '').toLowerCase() === 'co_applicant') || {}

  const defaultSummary = {
    applicant_name: `${formData.first_name || ''} ${formData.last_name || ''}`.trim() || portal?.buyer?.name || '',
    has_co_applicant: formData.spouse_full_name || formData.spouse_email || formData.spouse_identity_number ? 'yes' : '',
    has_surety: '',
    property_reference: `${portal?.unit?.development?.name || 'Development'} ${portal?.unit?.unit_number ? `• Unit ${portal.unit.unit_number}` : ''}`.trim(),
    development_name: portal?.unit?.development?.name || '',
    unit_reference: portal?.unit?.unit_number ? `Unit ${portal.unit.unit_number}` : '',
    purchase_price: purchasePrice > 0 ? String(purchasePrice) : '',
    deposit_contribution:
      formData.deposit_amount ||
      formData.cash_amount ||
      (portal?.transaction?.deposit_amount !== null && portal?.transaction?.deposit_amount !== undefined
        ? String(portal.transaction.deposit_amount)
        : ''),
    finance_type: financeType,
    purchaser_type: buyerEntityType,
    buyer_entity_type: buyerEntityType,
    buyer_entity_name: buyerEntityName,
    buyer_entity_registration_number: buyerEntityRegistrationNumber,
    marital_status: formData.marital_status || '',
    main_residence: formData.primary_residence || '',
    first_time_home_buyer: formData.first_time_buyer || '',
  }

  return {
    status: resolveBondApplicationStatus(existing.status),
    submitted_at: existing.submitted_at || '',
    selected_banks: Array.isArray(existing.selected_banks)
      ? existing.selected_banks.filter(Boolean)
      : Array.isArray(existing.selectedBanks)
        ? existing.selectedBanks.filter(Boolean)
        : [],
    applicants: [
      { ...primaryDefault, ...primaryApplicant, key: 'primary', label: 'Primary applicant' },
      { ...coApplicantDefault, ...coApplicant, key: 'co_applicant', label: 'Co-applicant' },
    ],
    summary: {
      ...defaultSummary,
      ...(existing.summary || {}),
    },
    contact_address: {
      home_number: existing?.contact_address?.home_number || '',
      cellphone_number: existing?.contact_address?.cellphone_number || formData.phone || portal?.buyer?.phone || '',
      work_number: existing?.contact_address?.work_number || '',
      email_address: existing?.contact_address?.email_address || formData.email || portal?.buyer?.email || '',
      fax_number: existing?.contact_address?.fax_number || '',
      home_language: existing?.contact_address?.home_language || '',
      correspondence_language: existing?.contact_address?.correspondence_language || '',
      residential_address_street: existing?.contact_address?.residential_address_street || formData.street_address || '',
      residential_address_suburb: existing?.contact_address?.residential_address_suburb || formData.suburb || '',
      residential_address_city: existing?.contact_address?.residential_address_city || formData.city || '',
      residential_address_country: existing?.contact_address?.residential_address_country || 'South Africa',
      residential_address_postal_code: existing?.contact_address?.residential_address_postal_code || formData.postal_code || '',
      residential_years: existing?.contact_address?.residential_years || '',
      residential_months: existing?.contact_address?.residential_months || '',
      postal_same_as_residential: existing?.contact_address?.postal_same_as_residential || 'yes',
      postal_address_street: existing?.contact_address?.postal_address_street || '',
      postal_address_suburb: existing?.contact_address?.postal_address_suburb || '',
      postal_address_city: existing?.contact_address?.postal_address_city || '',
      postal_address_country: existing?.contact_address?.postal_address_country || 'South Africa',
      postal_address_postal_code: existing?.contact_address?.postal_address_postal_code || '',
      legal_notice_delivery_method: existing?.contact_address?.legal_notice_delivery_method || '',
      future_legal_correspondence_same_as_postal: existing?.contact_address?.future_legal_correspondence_same_as_postal || 'yes',
      future_legal_address_street: existing?.contact_address?.future_legal_address_street || '',
      future_legal_address_suburb: existing?.contact_address?.future_legal_address_suburb || '',
      future_legal_address_city: existing?.contact_address?.future_legal_address_city || '',
      future_legal_address_country: existing?.contact_address?.future_legal_address_country || 'South Africa',
      future_legal_address_postal_code: existing?.contact_address?.future_legal_address_postal_code || '',
      is_public_official: existing?.contact_address?.is_public_official || '',
      associated_with_public_official: existing?.contact_address?.associated_with_public_official || '',
      public_official_relationship_nature: existing?.contact_address?.public_official_relationship_nature || '',
      public_official_name: existing?.contact_address?.public_official_name || '',
    },
    employment: {
      primary: {
        occupation_status: existing?.employment?.primary?.occupation_status || existing?.employment?.employment_status || '',
        occupational_level: existing?.employment?.primary?.occupational_level || '',
        nature_of_occupation: existing?.employment?.primary?.nature_of_occupation || existing?.employment?.occupation || '',
        employer_name: existing?.employment?.primary?.employer_name || existing?.employment?.employer_name || formData.employer_name || '',
        company_registration_number: existing?.employment?.primary?.company_registration_number || '',
        employee_number: existing?.employment?.primary?.employee_number || '',
        employment_years: existing?.employment?.primary?.employment_years || '',
        employment_months: existing?.employment?.primary?.employment_months || '',
        works_in_south_africa: existing?.employment?.primary?.works_in_south_africa || '',
        employer_address_street: existing?.employment?.primary?.employer_address_street || '',
        employer_address_suburb: existing?.employment?.primary?.employer_address_suburb || '',
        employer_address_city: existing?.employment?.primary?.employer_address_city || '',
        employer_address_country: existing?.employment?.primary?.employer_address_country || 'South Africa',
        employer_address_postal_code: existing?.employment?.primary?.employer_address_postal_code || '',
        purchase_coincides_job_change: existing?.employment?.primary?.purchase_coincides_job_change || '',
        previously_employed: existing?.employment?.primary?.previously_employed || '',
        own_business_income_percent: existing?.employment?.primary?.own_business_income_percent || '',
        shareholder_in_employer_business: existing?.employment?.primary?.shareholder_in_employer_business || '',
        shareholding_percent: existing?.employment?.primary?.shareholding_percent || '',
        previous_employer_1_name: existing?.employment?.primary?.previous_employer_1_name || '',
        previous_employer_1_duration: existing?.employment?.primary?.previous_employer_1_duration || '',
        previous_employer_2_name: existing?.employment?.primary?.previous_employer_2_name || '',
        previous_employer_2_duration: existing?.employment?.primary?.previous_employer_2_duration || '',
      },
      co_applicant: {
        occupation_status: existing?.employment?.co_applicant?.occupation_status || '',
        occupational_level: existing?.employment?.co_applicant?.occupational_level || '',
        nature_of_occupation: existing?.employment?.co_applicant?.nature_of_occupation || '',
        employer_name: existing?.employment?.co_applicant?.employer_name || '',
        company_registration_number: existing?.employment?.co_applicant?.company_registration_number || '',
        employee_number: existing?.employment?.co_applicant?.employee_number || '',
        employment_years: existing?.employment?.co_applicant?.employment_years || '',
        employment_months: existing?.employment?.co_applicant?.employment_months || '',
        works_in_south_africa: existing?.employment?.co_applicant?.works_in_south_africa || '',
        employer_address_street: existing?.employment?.co_applicant?.employer_address_street || '',
        employer_address_suburb: existing?.employment?.co_applicant?.employer_address_suburb || '',
        employer_address_city: existing?.employment?.co_applicant?.employer_address_city || '',
        employer_address_country: existing?.employment?.co_applicant?.employer_address_country || 'South Africa',
        employer_address_postal_code: existing?.employment?.co_applicant?.employer_address_postal_code || '',
        purchase_coincides_job_change: existing?.employment?.co_applicant?.purchase_coincides_job_change || '',
        previously_employed: existing?.employment?.co_applicant?.previously_employed || '',
        own_business_income_percent: existing?.employment?.co_applicant?.own_business_income_percent || '',
        shareholder_in_employer_business: existing?.employment?.co_applicant?.shareholder_in_employer_business || '',
        shareholding_percent: existing?.employment?.co_applicant?.shareholding_percent || '',
        previous_employer_1_name: existing?.employment?.co_applicant?.previous_employer_1_name || '',
        previous_employer_1_duration: existing?.employment?.co_applicant?.previous_employer_1_duration || '',
        previous_employer_2_name: existing?.employment?.co_applicant?.previous_employer_2_name || '',
        previous_employer_2_duration: existing?.employment?.co_applicant?.previous_employer_2_duration || '',
      },
    },
    credit_history: {
      currently_under_administration: String(existing?.credit_history?.currently_under_administration || ''),
      ever_under_administration: String(existing?.credit_history?.ever_under_administration || ''),
      judgments_taken: String(existing?.credit_history?.judgments_taken || existing?.credit_history?.judgments || ''),
      currently_under_debt_review: String(existing?.credit_history?.currently_under_debt_review || existing?.credit_history?.under_debt_review || ''),
      debt_counsellor_name: existing?.credit_history?.debt_counsellor_name || '',
      debt_counsellor_phone: existing?.credit_history?.debt_counsellor_phone || '',
      under_debt_rearrangement: String(existing?.credit_history?.under_debt_rearrangement || ''),
      ever_declared_insolvent: String(existing?.credit_history?.ever_declared_insolvent || existing?.credit_history?.insolvent || ''),
      insolvency_date: existing?.credit_history?.insolvency_date || '',
      rehabilitation_date: existing?.credit_history?.rehabilitation_date || '',
      adverse_credit_listings: String(existing?.credit_history?.adverse_credit_listings || ''),
      adverse_credit_listing_details: existing?.credit_history?.adverse_credit_listing_details || '',
      credit_bureau_dispute: String(existing?.credit_history?.credit_bureau_dispute || existing?.credit_history?.disputes || ''),
      bound_by_surety_agreements: String(existing?.credit_history?.bound_by_surety_agreements || ''),
      surety_amount: existing?.credit_history?.surety_amount || '',
      currently_paying_surety_account: String(existing?.credit_history?.currently_paying_surety_account || ''),
      surety_monthly_instalment: existing?.credit_history?.surety_monthly_instalment || '',
      surety_details: existing?.credit_history?.surety_details || '',
      settling_surety_account: String(existing?.credit_history?.settling_surety_account || ''),
      surety_new_instalment_if_reduced: existing?.credit_history?.surety_new_instalment_if_reduced || '',
      surety_in_favour_of: existing?.credit_history?.surety_in_favour_of || '',
    },
    loan_details: {
      erf_or_section_number: existing?.loan_details?.erf_or_section_number || portal?.unit?.unit_number || '',
      street_or_complex: existing?.loan_details?.street_or_complex || portal?.transaction?.property_address_line_1 || formData.street_address || '',
      suburb: existing?.loan_details?.suburb || portal?.transaction?.suburb || formData.suburb || '',
      amount_to_be_registered:
        existing?.loan_details?.amount_to_be_registered ||
        formData.bond_amount ||
        (portal?.transaction?.bond_amount !== null && portal?.transaction?.bond_amount !== undefined
          ? String(portal.transaction.bond_amount)
          : ''),
      additional_amount_for_solar_energy: existing?.loan_details?.additional_amount_for_solar_energy || '',
      solar_energy_loan_amount: existing?.loan_details?.solar_energy_loan_amount || '',
      solar_loan_term: existing?.loan_details?.solar_loan_term || '',
      solar_panels_included: existing?.loan_details?.solar_panels_included || '',
      debit_order_bank_name: existing?.loan_details?.debit_order_bank_name || '',
      debit_order_account_number: existing?.loan_details?.debit_order_account_number || '',
      preferred_debit_order_date: existing?.loan_details?.preferred_debit_order_date || '',
    },
    income_deductions_expenses: {
      primary: {
        gross_salary: existing?.income_deductions_expenses?.primary?.gross_salary || existing?.income?.salary || formData.gross_monthly_income || '',
        average_commission: existing?.income_deductions_expenses?.primary?.average_commission || existing?.income?.commission || '',
        investment_income: existing?.income_deductions_expenses?.primary?.investment_income || '',
        rental_income: existing?.income_deductions_expenses?.primary?.rental_income || existing?.income?.rental_income || '',
        car_allowance: existing?.income_deductions_expenses?.primary?.car_allowance || '',
        travel_allowance: existing?.income_deductions_expenses?.primary?.travel_allowance || '',
        entertainment_allowance: existing?.income_deductions_expenses?.primary?.entertainment_allowance || '',
        income_from_sureties: existing?.income_deductions_expenses?.primary?.income_from_sureties || '',
        housing_subsidy: existing?.income_deductions_expenses?.primary?.housing_subsidy || '',
        maintenance_or_alimony_income: existing?.income_deductions_expenses?.primary?.maintenance_or_alimony_income || '',
        average_overtime: existing?.income_deductions_expenses?.primary?.average_overtime || '',
        other_income_description: existing?.income_deductions_expenses?.primary?.other_income_description || '',
        other_income_value: existing?.income_deductions_expenses?.primary?.other_income_value || existing?.income?.other_income || '',
        tax_paye: existing?.income_deductions_expenses?.primary?.tax_paye || '',
        pension: existing?.income_deductions_expenses?.primary?.pension || '',
        uif: existing?.income_deductions_expenses?.primary?.uif || '',
        medical_aid: existing?.income_deductions_expenses?.primary?.medical_aid || '',
        other_deductions_description: existing?.income_deductions_expenses?.primary?.other_deductions_description || '',
        other_deductions_value: existing?.income_deductions_expenses?.primary?.other_deductions_value || '',
        rental_expense: existing?.income_deductions_expenses?.primary?.rental_expense || existing?.expenses?.housing || '',
        maintenance_or_alimony_expense: existing?.income_deductions_expenses?.primary?.maintenance_or_alimony_expense || '',
        rates_taxes_levies: existing?.income_deductions_expenses?.primary?.rates_taxes_levies || '',
        water_electricity: existing?.income_deductions_expenses?.primary?.water_electricity || existing?.expenses?.utilities || '',
        assurance_insurance_funeral_ra: existing?.income_deductions_expenses?.primary?.assurance_insurance_funeral_ra || existing?.expenses?.insurance || '',
        groceries: existing?.income_deductions_expenses?.primary?.groceries || existing?.expenses?.groceries || '',
        transport: existing?.income_deductions_expenses?.primary?.transport || existing?.expenses?.transport || '',
        security: existing?.income_deductions_expenses?.primary?.security || '',
        education: existing?.income_deductions_expenses?.primary?.education || '',
        medical_excluding_payroll: existing?.income_deductions_expenses?.primary?.medical_excluding_payroll || '',
        cellphone_internet: existing?.income_deductions_expenses?.primary?.cellphone_internet || '',
        dstv_tv: existing?.income_deductions_expenses?.primary?.dstv_tv || '',
        other_expenses_description: existing?.income_deductions_expenses?.primary?.other_expenses_description || '',
        other_expenses_value: existing?.income_deductions_expenses?.primary?.other_expenses_value || existing?.expenses?.other_expenses || '',
      },
      co_applicant: {
        gross_salary: existing?.income_deductions_expenses?.co_applicant?.gross_salary || '',
        average_commission: existing?.income_deductions_expenses?.co_applicant?.average_commission || '',
        investment_income: existing?.income_deductions_expenses?.co_applicant?.investment_income || '',
        rental_income: existing?.income_deductions_expenses?.co_applicant?.rental_income || '',
        car_allowance: existing?.income_deductions_expenses?.co_applicant?.car_allowance || '',
        travel_allowance: existing?.income_deductions_expenses?.co_applicant?.travel_allowance || '',
        entertainment_allowance: existing?.income_deductions_expenses?.co_applicant?.entertainment_allowance || '',
        income_from_sureties: existing?.income_deductions_expenses?.co_applicant?.income_from_sureties || '',
        housing_subsidy: existing?.income_deductions_expenses?.co_applicant?.housing_subsidy || '',
        maintenance_or_alimony_income: existing?.income_deductions_expenses?.co_applicant?.maintenance_or_alimony_income || '',
        average_overtime: existing?.income_deductions_expenses?.co_applicant?.average_overtime || '',
        other_income_description: existing?.income_deductions_expenses?.co_applicant?.other_income_description || '',
        other_income_value: existing?.income_deductions_expenses?.co_applicant?.other_income_value || '',
        tax_paye: existing?.income_deductions_expenses?.co_applicant?.tax_paye || '',
        pension: existing?.income_deductions_expenses?.co_applicant?.pension || '',
        uif: existing?.income_deductions_expenses?.co_applicant?.uif || '',
        medical_aid: existing?.income_deductions_expenses?.co_applicant?.medical_aid || '',
        other_deductions_description: existing?.income_deductions_expenses?.co_applicant?.other_deductions_description || '',
        other_deductions_value: existing?.income_deductions_expenses?.co_applicant?.other_deductions_value || '',
        rental_expense: existing?.income_deductions_expenses?.co_applicant?.rental_expense || '',
        maintenance_or_alimony_expense: existing?.income_deductions_expenses?.co_applicant?.maintenance_or_alimony_expense || '',
        rates_taxes_levies: existing?.income_deductions_expenses?.co_applicant?.rates_taxes_levies || '',
        water_electricity: existing?.income_deductions_expenses?.co_applicant?.water_electricity || '',
        assurance_insurance_funeral_ra: existing?.income_deductions_expenses?.co_applicant?.assurance_insurance_funeral_ra || '',
        groceries: existing?.income_deductions_expenses?.co_applicant?.groceries || '',
        transport: existing?.income_deductions_expenses?.co_applicant?.transport || '',
        security: existing?.income_deductions_expenses?.co_applicant?.security || '',
        education: existing?.income_deductions_expenses?.co_applicant?.education || '',
        medical_excluding_payroll: existing?.income_deductions_expenses?.co_applicant?.medical_excluding_payroll || '',
        cellphone_internet: existing?.income_deductions_expenses?.co_applicant?.cellphone_internet || '',
        dstv_tv: existing?.income_deductions_expenses?.co_applicant?.dstv_tv || '',
        other_expenses_description: existing?.income_deductions_expenses?.co_applicant?.other_expenses_description || '',
        other_expenses_value: existing?.income_deductions_expenses?.co_applicant?.other_expenses_value || '',
      },
    },
    banking_liabilities: {
      primary_bank_name: existing?.banking_liabilities?.primary_bank_name || '',
      primary_account_type: existing?.banking_liabilities?.primary_account_type || '',
      primary_account_holder_name: existing?.banking_liabilities?.primary_account_holder_name || '',
      legal_entity_account_name_match: existing?.banking_liabilities?.legal_entity_account_name_match || '',
      business_bank_account: existing?.banking_liabilities?.business_bank_account || '',
      primary_account_number: existing?.banking_liabilities?.primary_account_number || '',
      primary_balance_debit_credit: existing?.banking_liabilities?.primary_balance_debit_credit || '',
      primary_bank_first_consideration_consent: existing?.banking_liabilities?.primary_bank_first_consideration_consent || '',
      home_loan_1_bank: existing?.banking_liabilities?.home_loan_1_bank || '',
      home_loan_1_account_holder_name: existing?.banking_liabilities?.home_loan_1_account_holder_name || '',
      home_loan_1_account_number: existing?.banking_liabilities?.home_loan_1_account_number || '',
      home_loan_1_outstanding_balance: existing?.banking_liabilities?.home_loan_1_outstanding_balance || '',
      home_loan_1_monthly_instalment: existing?.banking_liabilities?.home_loan_1_monthly_instalment || '',
      home_loan_1_selling_property: existing?.banking_liabilities?.home_loan_1_selling_property || '',
      home_loan_1_new_instalment_if_reduced: existing?.banking_liabilities?.home_loan_1_new_instalment_if_reduced || '',
      other_finance_1_bank: existing?.banking_liabilities?.other_finance_1_bank || '',
      other_finance_1_account_type: existing?.banking_liabilities?.other_finance_1_account_type || '',
      other_finance_1_current_balance: existing?.banking_liabilities?.other_finance_1_current_balance || '',
      other_finance_1_monthly_payment: existing?.banking_liabilities?.other_finance_1_monthly_payment || '',
      other_finance_1_settled: existing?.banking_liabilities?.other_finance_1_settled || '',
      other_finance_1_business_account: existing?.banking_liabilities?.other_finance_1_business_account || '',
      other_finance_1_legal_entity_account: existing?.banking_liabilities?.other_finance_1_legal_entity_account || '',
      retail_account_name: existing?.banking_liabilities?.retail_account_name || '',
      retail_current_balance: existing?.banking_liabilities?.retail_current_balance || '',
      retail_monthly_payment: existing?.banking_liabilities?.retail_monthly_payment || '',
      retail_settled: existing?.banking_liabilities?.retail_settled || '',
    },
    assets_liabilities: {
      fixed_property: existing?.assets_liabilities?.fixed_property || existing?.assets?.property_owned || '',
      vehicles: existing?.assets_liabilities?.vehicles || '',
      investments: existing?.assets_liabilities?.investments || existing?.assets?.investments || '',
      furniture_and_fittings: existing?.assets_liabilities?.furniture_and_fittings || '',
      other_assets_description: existing?.assets_liabilities?.other_assets_description || '',
      other_assets_value: existing?.assets_liabilities?.other_assets_value || '',
      liabilities_total: existing?.assets_liabilities?.liabilities_total || '',
      other_liabilities_description: existing?.assets_liabilities?.other_liabilities_description || '',
      other_liabilities_value: existing?.assets_liabilities?.other_liabilities_value || '',
      total_assets: existing?.assets_liabilities?.total_assets || '',
      total_liabilities: existing?.assets_liabilities?.total_liabilities || '',
      net_asset_value: existing?.assets_liabilities?.net_asset_value || existing?.assets?.net_worth || '',
    },
    declarations_consents: {
      loan_processing_consent: Boolean(existing?.declarations_consents?.loan_processing_consent || existing?.consent?.credit_check_consent),
      credit_bureau_fraud_bank_data_consent: Boolean(existing?.declarations_consents?.credit_bureau_fraud_bank_data_consent || existing?.consent?.credit_check_consent),
      insurance_third_party_communication_consent: Boolean(existing?.declarations_consents?.insurance_third_party_communication_consent),
      nhfc_first_home_finance_consent: Boolean(existing?.declarations_consents?.nhfc_first_home_finance_consent),
      marketing_privacy_preference: existing?.declarations_consents?.marketing_privacy_preference || '',
      declaration_accepted: Boolean(existing?.declarations_consents?.declaration_accepted || existing?.consent?.declaration_accepted),
      digital_signature_name: existing?.declarations_consents?.digital_signature_name || `${formData.first_name || ''} ${formData.last_name || ''}`.trim(),
      digital_signature_date: existing?.declarations_consents?.digital_signature_date || '',
    },
    consent: {
      credit_check_consent: Boolean(
        existing?.consent?.credit_check_consent ||
        existing?.declarations_consents?.loan_processing_consent ||
        existing?.declarations_consents?.credit_bureau_fraud_bank_data_consent,
      ),
      declaration_accepted: Boolean(
        existing?.consent?.declaration_accepted ||
        existing?.declarations_consents?.declaration_accepted,
      ),
    },
    offers: {
      accepted_offer_document_id:
        existing?.offers?.accepted_offer_document_id || existing?.offers?.acceptedOfferDocumentId || '',
      accepted_bank: existing?.offers?.accepted_bank || existing?.offers?.acceptedBank || '',
      accepted_at: existing?.offers?.accepted_at || existing?.offers?.acceptedAt || '',
      decision_state:
        normalizeBondOfferDecisionState(existing?.offers?.decision_state || existing?.offers?.decisionState) ||
        (existing?.offers?.accepted_offer_document_id || existing?.offers?.acceptedOfferDocumentId ? 'accepted' : ''),
      decision_offer_document_id:
        existing?.offers?.decision_offer_document_id ||
        existing?.offers?.decisionOfferDocumentId ||
        existing?.offers?.accepted_offer_document_id ||
        existing?.offers?.acceptedOfferDocumentId ||
        '',
      decision_at:
        existing?.offers?.decision_at ||
        existing?.offers?.decisionAt ||
        existing?.offers?.accepted_at ||
        existing?.offers?.acceptedAt ||
        '',
      declined_offer_document_ids: Array.isArray(existing?.offers?.declined_offer_document_ids)
        ? existing.offers.declined_offer_document_ids.map((value) => String(value)).filter(Boolean)
        : Array.isArray(existing?.offers?.declinedOfferDocumentIds)
          ? existing.offers.declinedOfferDocumentIds.map((value) => String(value)).filter(Boolean)
          : [],
      signed_offer_document_id:
        existing?.offers?.signed_offer_document_id || existing?.offers?.signedOfferDocumentId || '',
      signed_offer_uploaded_at:
        existing?.offers?.signed_offer_uploaded_at || existing?.offers?.signedOfferUploadedAt || '',
    },
    // Legacy keys kept for backward compatibility with existing reads.
    income: existing?.income || {},
    expenses: existing?.expenses || {},
    assets: existing?.assets || {},
  }
}
