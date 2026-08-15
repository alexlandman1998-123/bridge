function present(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function issue(path, code, message) {
  return { path, code, message }
}

function get(state, path) {
  return String(path || '').split('.').filter(Boolean).reduce((current, key) => current?.[key], state)
}

function required(state, path, message) {
  return present(get(state, path)) ? null : issue(path, 'required', message)
}

export function validateGuidedBondApplicationScreen(applicationState = {}, screenKey = '') {
  const issues = []
  const addRequired = (path, message) => {
    const nextIssue = required(applicationState, path, message)
    if (nextIssue) issues.push(nextIssue)
  }

  if (screenKey === 'application_confirmation') {
    addRequired('application.finance.purchasePrice', 'Enter the purchase price.')
    addRequired('application.finance.requestedBondAmount', 'Enter the bond amount required.')
    addRequired('application.buyerEntity.entityType', 'Choose who is buying the property.')
    if (['company', 'trust'].includes(get(applicationState, 'application.buyerEntity.entityType'))) {
      addRequired('application.buyerEntity.name', 'Enter the entity name.')
      addRequired('application.buyerEntity.registrationNumber', 'Enter the registration or trust number.')
    }
  }

  if (screenKey === 'applicant_structure') {
    addRequired('application.applicantStructure', 'Choose how you are applying.')
  }

  if (screenKey === 'about_you_confirmation') {
    addRequired('participants.primaryApplicant.personal.first_name', 'Enter your first name.')
    addRequired('participants.primaryApplicant.personal.surname', 'Enter your surname.')
    addRequired('participants.primaryApplicant.contact.email', 'Enter your email address.')
    addRequired('participants.primaryApplicant.contact.phone', 'Enter your mobile number.')
  }

  if (screenKey === 'about_you_edit') {
    addRequired('participants.primaryApplicant.personal.first_name', 'Enter your first name.')
    addRequired('participants.primaryApplicant.personal.surname', 'Enter your surname.')
    addRequired('participants.primaryApplicant.contact.email', 'Enter your email address.')
    addRequired('participants.primaryApplicant.contact.phone', 'Enter your mobile number.')
  }

  if (screenKey === 'employment_type') {
    addRequired('participants.primaryApplicant.employment.occupation_status', 'Choose how you earn your main income.')
  }

  if (screenKey === 'employment_details') {
    addRequired('participants.primaryApplicant.employment.employer_name', 'Enter the name of your employer.')
    addRequired('participants.primaryApplicant.employment.nature_of_occupation', 'Enter your job title or occupation.')
    addRequired('participants.primaryApplicant.expenses.gross_salary', 'Enter your gross monthly income.')
  }

  if (screenKey === 'employment_additional_details') {
    const years = get(applicationState, 'participants.primaryApplicant.employment.employment_years')
    const months = get(applicationState, 'participants.primaryApplicant.employment.employment_months')
    if (!present(years) && !present(months)) {
      issues.push(issue('participants.primaryApplicant.employment.employment_years', 'required', 'Enter how long you have worked there.'))
    }
    addRequired('participants.primaryApplicant.employment.works_in_south_africa', 'Confirm whether you work in South Africa.')
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}
