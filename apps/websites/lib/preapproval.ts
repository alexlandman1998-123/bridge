export type Field = { key: string; label: string; type?: 'text' | 'email' | 'tel' | 'date' | 'number' | 'select'; options?: string[]; optional?: boolean; hint?: string; max?: number }
export type Applicant = Record<string, string>
export type PreapprovalApplication = {
  version: 1; plan: Record<string, string>; applicants: Applicant[];
  documents: Record<string, string>; consent: Record<string, string | boolean>;
}
export const steps = ['Buying plans', 'Applicants', 'Employment', 'Affordability', 'Credit & assets', 'Documents', 'Review & submit']
export const personalFields: Field[] = [
  { key: 'firstName', label: 'First names (as on your ID)' }, { key: 'surname', label: 'Surname' },
  { key: 'email', label: 'Email address', type: 'email' }, { key: 'phone', label: 'Mobile number', type: 'tel' },
  { key: 'dateOfBirth', label: 'Date of birth', type: 'date' },
  { key: 'identityType', label: 'Identity document', type: 'select', options: ['South African ID', 'Passport'] },
  { key: 'identityNumber', label: 'ID / passport number', hint: 'Used for the assessment. Enter it exactly as it appears on your document.' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'residency', label: 'South African residency status', type: 'select', options: ['Citizen', 'Permanent resident', 'Temporary resident', 'Non-resident'] },
  { key: 'maritalStatus', label: 'Marital status', type: 'select', options: ['Single', 'Married in community of property', 'Married out of community of property', 'Customary marriage', 'Civil union', 'Divorced', 'Widowed'] },
  { key: 'dependants', label: 'Number of financial dependants', type: 'number', max: 30 },
  { key: 'address', label: 'Current residential street address' }, { key: 'suburb', label: 'Suburb' }, { key: 'city', label: 'City / town' },
  { key: 'postalCode', label: 'Postal code' }, { key: 'country', label: 'Country of residence' },
  { key: 'housing', label: 'Current housing arrangement', type: 'select', options: ['Renting', 'Own home with a bond', 'Own home without a bond', 'Living with family', 'Other'] },
]
export const employmentFields: Field[] = [
  { key: 'employment', label: 'Employment status', type: 'select', options: ['Permanently employed', 'Contract employed', 'Self-employed', 'Retired', 'Not currently employed'] },
  { key: 'occupation', label: 'Occupation / profession', optional: true },
]
export function employmentDetails(applicant: Applicant): Field[] {
  if (applicant.employment === 'Self-employed') return [
    { key: 'businessName', label: 'Business / trading name' }, { key: 'businessType', label: 'Business structure', type: 'select', options: ['Sole proprietor', 'Company', 'Partnership', 'Other'] },
    { key: 'businessRegistration', label: 'Business registration number (if registered)', optional: true },
    { key: 'employmentStart', label: 'Business start date', type: 'date' }, { key: 'industry', label: 'Industry / business activity' },
    { key: 'accountant', label: 'Accountant name / practice', optional: true },
  ]
  if (['Permanently employed', 'Contract employed'].includes(applicant.employment)) return [
    { key: 'employer', label: 'Employer name' }, { key: 'employerPhone', label: 'Employer contact number', type: 'tel' },
    { key: 'employmentStart', label: 'Employment start date', type: 'date' },
    ...(applicant.employment === 'Contract employed' ? [{ key: 'contractEnd', label: 'Contract end date', type: 'date' as const }] : []),
  ]
  return []
}
export const incomeFields: Field[] = [
  { key: 'grossIncome', label: 'Gross monthly income before deductions (R)', type: 'number' },
  { key: 'netIncome', label: 'Monthly take-home income (R)', type: 'number' },
  { key: 'otherIncome', label: 'Other regular monthly income after tax (R)', type: 'number', hint: 'Exclude amounts already included above. Enter 0 if none.' },
  { key: 'otherIncomeSource', label: 'Source of other income', optional: true },
]
export const expenseFields: Field[] = [
  { key: 'housingCost', label: 'Rent, rates & levies (R)', type: 'number' },
  { key: 'utilities', label: 'Water, electricity & communications (R)', type: 'number' },
  { key: 'groceries', label: 'Groceries & household costs (R)', type: 'number' },
  { key: 'transport', label: 'Transport & fuel (R)', type: 'number' },
  { key: 'education', label: 'School, childcare & education (R)', type: 'number' },
  { key: 'medical', label: 'Medical costs & medical aid (R)', type: 'number' },
  { key: 'insurance', label: 'Insurance premiums (R)', type: 'number' },
  { key: 'maintenance', label: 'Maintenance / family support (R)', type: 'number' },
  { key: 'otherExpenses', label: 'Other living expenses (R)', type: 'number' },
]
export const debtFields: Field[] = [
  { key: 'homeLoans', label: 'Existing bond repayments (R/month)', type: 'number' },
  { key: 'vehicleLoans', label: 'Vehicle finance repayments (R/month)', type: 'number' },
  { key: 'personalLoans', label: 'Personal loan repayments (R/month)', type: 'number' },
  { key: 'creditCards', label: 'Credit card repayments (R/month)', type: 'number' },
  { key: 'storeAccounts', label: 'Store accounts & other debt (R/month)', type: 'number' },
]
export const creditFields: Field[] = [
  { key: 'bank', label: 'Main bank' },
  { key: 'debtReview', label: 'Currently under debt review?', type: 'select', options: ['No', 'Yes', 'Unsure'] },
  { key: 'creditIssues', label: 'Defaults, judgments or missed payments?', type: 'select', options: ['No', 'Yes', 'Unsure'] },
  { key: 'insolvency', label: 'Current / previous sequestration or insolvency?', type: 'select', options: ['No', 'Yes', 'Unsure'] },
  { key: 'surety', label: 'Standing surety or guaranteeing another debt?', type: 'select', options: ['No', 'Yes', 'Unsure'] },
  { key: 'creditExplanation', label: 'Details of any credit issues or guarantees', optional: true },
  { key: 'totalAssets', label: 'Estimated total assets (R)', type: 'number', hint: 'Property, vehicles, savings and investments at estimated current value.' },
  { key: 'totalLiabilities', label: 'Total outstanding debt balances (R)', type: 'number', hint: 'Outstanding balances, not monthly repayments.' },
]
export function documentsFor(applicant: Applicant) {
  return [
    { key: 'identity', label: applicant.identityType === 'Passport' ? 'Valid passport and residency documents, where applicable' : 'South African identity document' },
    { key: 'address', label: 'Recent proof of residential address' },
    { key: 'bankStatements', label: applicant.employment === 'Self-employed' ? 'Recent personal and business bank statements' : 'Recent bank statements (usually 3 months)' },
    { key: 'income', label: applicant.employment === 'Self-employed' ? 'Financial statements / management accounts and proof of drawings' : applicant.employment === 'Retired' ? 'Pension / retirement income statements' : 'Recent payslips or other proof of income' },
    ...(applicant.employment === 'Contract employed' ? [{ key: 'contract', label: 'Current employment contract' }] : []),
    ...(Number(applicant.otherIncome) > 0 ? [{ key: 'otherIncome', label: 'Supporting proof for additional income' }] : []),
    ...(['Single', 'Widowed'].includes(applicant.maritalStatus) ? [] : [{ key: 'marital', label: 'Relevant marriage / antenuptial / divorce documents' }]),
  ]
}
export function initialApplication(): PreapprovalApplication {
  return { version: 1, plan: { applicationType: 'Individual', stage: '', purpose: '', price: '', deposit: '', depositSource: '', term: '20', area: '', propertyAddress: '', firstHome: '' }, applicants: [{}], documents: {}, consent: {} }
}
export function totals(applicants: Applicant[]) {
  const sum = (fields: Field[]) => applicants.reduce((total, applicant) => total + fields.reduce((n, field) => n + (Number(applicant[field.key]) || 0), 0), 0)
  const income = sum([{ key: 'netIncome', label: '' }, { key: 'otherIncome', label: '' }])
  const expenses = sum(expenseFields), debt = sum(debtFields)
  return { income, expenses, debt, remaining: income - expenses - debt }
}
export function validSAID(value: string) {
  if (!/^\d{13}$/.test(value)) return false
  let sum = 0
  for (let i = 0; i < 13; i++) { let digit = Number(value[i]); if (i % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9 }; sum += digit }
  return sum % 10 === 0
}
export function stageErrors(application: PreapprovalApplication, step: number, today = new Date()): string[] {
  const errors: string[] = []
  const check = (data: Record<string, string>, fields: Field[], prefix = '') => {
    for (const field of fields) {
      const value = data[field.key]?.trim() || ''
      if (!value && !field.optional) { errors.push(`${prefix}${field.label} is required.`); continue }
      if (!value) continue
      if (value.length > 240) errors.push(`${prefix}${field.label} is too long.`)
      if (field.type === 'number' && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > (field.max ?? 1_000_000_000))) errors.push(`${prefix}${field.label} must be a valid positive amount or 0.`)
      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push(`${prefix}Enter a valid email address.`)
      if (field.type === 'tel' && !/^\+?[\d ()-]{7,25}$/.test(value)) errors.push(`${prefix}Enter a valid phone number.`)
      if (field.options && !field.options.includes(value)) errors.push(`${prefix}Choose a valid ${field.label.toLowerCase()}.`)
      if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) errors.push(`${prefix}Enter a valid ${field.label.toLowerCase()}.`)
    }
  }
  if (step === 0) {
    check(application.plan, [
      { key: 'applicationType', label: 'Application type', options: ['Individual', 'Joint'] },
      { key: 'stage', label: 'Buying stage', options: ['Exploring my budget', 'Actively searching', 'Property identified', 'Offer submitted'] },
      { key: 'purpose', label: 'Property purpose', options: ['Primary residence', 'Investment property', 'Second home'] },
      { key: 'firstHome', label: 'First-time buyer', options: ['Yes', 'No'] },
      { key: 'price', label: 'Target purchase price', type: 'number' }, { key: 'deposit', label: 'Available deposit', type: 'number' },
      { key: 'depositSource', label: 'Deposit source', options: ['Savings', 'Sale of an asset / property', 'Gift', 'Other', 'No deposit'] },
      { key: 'term', label: 'Loan term', type: 'number', max: 30 }, { key: 'area', label: 'Preferred area' },
      { key: 'propertyAddress', label: 'Property address / reference', optional: true },
    ])
    if (Number(application.plan.price) <= 0) errors.push('Enter a target purchase price greater than 0.')
    if (Number(application.plan.deposit) > Number(application.plan.price)) errors.push('Your deposit cannot exceed the purchase price.')
    if (Number(application.plan.term) < 5 || !Number.isInteger(Number(application.plan.term))) errors.push('Choose a whole-number loan term from 5 to 30 years.')
    if ((application.plan.applicationType === 'Joint' ? 2 : 1) !== application.applicants.length) errors.push('Complete the correct number of applicants.')
  }
  application.applicants.forEach((a, index) => {
    const prefix = `Applicant ${index + 1}: `
    if (step === 1) {
      check(a, personalFields, prefix)
      const dob = new Date(a.dateOfBirth)
      const age = today.getUTCFullYear() - dob.getUTCFullYear() - (today.toISOString().slice(5, 10) < a.dateOfBirth?.slice(5, 10) ? 1 : 0)
      if (!Number.isFinite(age) || age < 18 || age > 110) errors.push(`${prefix}enter a date of birth for an adult applicant.`)
      if (a.identityType === 'South African ID' && (!validSAID(a.identityNumber || '') || a.identityNumber.slice(0, 6) !== a.dateOfBirth?.replaceAll('-', '').slice(2))) errors.push(`${prefix}check your South African ID number and date of birth.`)
      if (a.identityType === 'Passport' && !/^[a-zA-Z0-9-]{5,20}$/.test(a.identityNumber || '')) errors.push(`${prefix}enter a valid passport number.`)
      if (!Number.isInteger(Number(a.dependants))) errors.push(`${prefix}dependants must be a whole number.`)
    }
    if (step === 2) {
      check(a, [...employmentFields, ...employmentDetails(a)], prefix)
      if (a.employmentStart && Date.parse(a.employmentStart) > today.getTime()) errors.push(`${prefix}the start date cannot be in the future.`)
      if (a.employment === 'Contract employed' && (Date.parse(a.contractEnd) <= today.getTime() || Date.parse(a.contractEnd) <= Date.parse(a.employmentStart))) errors.push(`${prefix}check the current contract end date.`)
    }
    if (step === 3) {
      check(a, [...incomeFields, ...expenseFields, ...debtFields], prefix)
      if (Number(a.netIncome) > Number(a.grossIncome)) errors.push(`${prefix}take-home income cannot exceed gross income.`)
      if (Number(a.otherIncome) > 0 && !a.otherIncomeSource?.trim()) errors.push(`${prefix}describe your other income source.`)
    }
    if (step === 4) {
      check(a, creditFields, prefix)
      if (['debtReview', 'creditIssues', 'insolvency', 'surety'].some(key => a[key] !== 'No') && !a.creditExplanation?.trim()) errors.push(`${prefix}add details of your credit declarations.`)
    }
    if (step === 5) for (const document of documentsFor(a)) {
      if (!['Ready', 'Will provide later'].includes(application.documents[`${index}-${document.key}`])) errors.push(`${prefix}confirm availability of ${document.label.toLowerCase()}.`)
    }
    if (step === 6) {
      if (application.consent[`accuracy-${index}`] !== true || application.consent[`processing-${index}`] !== true) errors.push(`${prefix}confirm the declarations and information-processing consent.`)
      if (String(application.consent[`signature-${index}`] || '').trim().toLowerCase() !== `${a.firstName} ${a.surname}`.trim().toLowerCase()) errors.push(`${prefix}type your full name exactly as entered in applicant details.`)
    }
  })
  return errors
}
/** Narrow untrusted input to known fields; do not accept arbitrary nested content. */
export function parseApplication(input: unknown): PreapprovalApplication | null {
  if (!input || typeof input !== 'object') return null
  const value = input as Record<string, unknown>
  if (value.version !== 1 || !Array.isArray(value.applicants) || value.applicants.length < 1 || value.applicants.length > 2) return null
  const strings = (v: unknown): Record<string, string> | null => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null
    const entries = Object.entries(v)
    if (entries.length > 80 || entries.some(([k, val]) => k.length > 50 || typeof val !== 'string' || val.length > 240)) return null
    return Object.fromEntries(entries)
  }
  const plan = strings(value.plan), documents = strings(value.documents), applicants = value.applicants.map(strings)
  if (!plan || !documents || applicants.some(a => !a) || !value.consent || typeof value.consent !== 'object' || Array.isArray(value.consent)) return null
  const consent = value.consent as Record<string, string | boolean>
  if (Object.keys(consent).length > 12 || Object.values(consent).some(v => typeof v !== 'boolean' && (typeof v !== 'string' || v.length > 240))) return null
  const allowed = (data: Record<string, string>, keys: string[]) => Object.fromEntries(keys.filter(key => typeof data[key] === 'string').map(key => [key, data[key].trim()]))
  return { version: 1, plan: allowed(plan, Object.keys(initialApplication().plan)),
    applicants: (applicants as Applicant[]).map(a => allowed(a, [...personalFields, ...employmentFields, ...employmentDetails(a), ...incomeFields, ...expenseFields, ...debtFields, ...creditFields].map(f => f.key))),
    documents: allowed(documents, (applicants as Applicant[]).flatMap((a, i) => documentsFor(a).map(d => `${i}-${d.key}`))),
    consent: Object.fromEntries(Object.entries(consent).filter(([key]) => /^(accuracy|processing|signature)-[01]$/.test(key) || key === 'marketing')) }
}
