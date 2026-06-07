const CURRENCY = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const COMPLETED_DOCUMENT_STATUSES = new Set(['approved', 'complete', 'completed', 'generated', 'pending_review', 'received', 'signed', 'uploaded', 'verified'])

function text(value) {
  return String(value || '').trim()
}

function present(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.length > 0
  return true
}

function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value || '').replace(/[^\d.-]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function valueFrom(...values) {
  return values.find((value) => present(value))
}

function formatCurrency(value, fallback = 'Not captured') {
  const amount = number(value)
  return amount ? CURRENCY.format(amount) : fallback
}

function formatDateTime(value, fallback = 'Pending') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(value, fallback = 'Pending') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getNested(source, paths = []) {
  for (const path of paths) {
    const parts = String(path || '').split('.').filter(Boolean)
    let current = source
    for (const part of parts) {
      if (!current || typeof current !== 'object') {
        current = undefined
        break
      }
      current = current[part]
    }
    if (present(current)) return current
  }
  return undefined
}

function lookup(data, paths = []) {
  return valueFrom(
    getNested(data?.onboardingFormData, paths),
    getNested(data?.bondApplication, paths),
    getNested(data?.transaction, paths),
    getNested(data?.buyer, paths),
  )
}

function toTitle(value) {
  return text(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function initialsFor(name) {
  const words = text(name).split(/\s+/).filter(Boolean)
  if (!words.length) return 'BA'
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join('')
}

function normalizeStatusLabel(value, fallback = 'Onboarding Pending') {
  const label = toTitle(value || fallback)
  if (/ready/i.test(label)) return 'Ready for Submission'
  if (/submit/i.test(label) && /bank/i.test(label)) return 'Submitted to Banks'
  if (/review/i.test(label)) return 'In Review'
  if (/complete/i.test(label)) return 'Ready for Submission'
  if (/pending|progress/i.test(label)) return 'Onboarding Pending'
  return label || fallback
}

function getDocumentSearchText(document = {}) {
  return [
    document.displayName,
    document.name,
    document.categoryLabel,
    document.category,
    document.requiredDocumentKey,
    document.requiredDocumentCanonicalId,
    document.requiredDocument?.key,
    document.requiredDocument?.label,
    document.requiredDocument?.documentLabel,
    document.requiredDocument?.document_label,
    document.raw?.document_type,
  ].map((value) => String(value || '').toLowerCase()).join(' ')
}

function isDocumentUploaded(document = {}) {
  const status = text(document.status || document.statusLabel || document.requiredDocumentStatus).toLowerCase()
  return Boolean(document.fileUrl || document.url || document.linkedDocument || COMPLETED_DOCUMENT_STATUSES.has(status))
}

function matchDocument(documents, keywords) {
  const normalized = keywords.map((keyword) => String(keyword || '').toLowerCase())
  const rows = documents.filter((document) => {
    const haystack = getDocumentSearchText(document)
    return normalized.some((keyword) => haystack.includes(keyword))
  })
  const uploaded = rows.filter(isDocumentUploaded)
  return {
    rows,
    uploaded,
    uploadedCount: uploaded.length,
    isUploaded: uploaded.length > 0,
    status: uploaded.length ? 'Uploaded' : rows.length ? 'Missing' : 'Missing',
  }
}

function buildDocumentTiles(documentRows = [], requiredDocumentRows = []) {
  const documents = [...documentRows, ...requiredDocumentRows].filter(Boolean)
  const tiles = [
    { key: 'idDocument', label: 'ID Document', keywords: ['id document', 'identity', 'id copy', 'fica'] },
    { key: 'proofOfResidence', label: 'Proof of Residence', keywords: ['proof of residence', 'residence', 'address'] },
    { key: 'consentForm', label: 'Consent Form', keywords: ['consent', 'declaration'] },
    { key: 'incomeProof', label: 'Payslip / Income Proof', keywords: ['payslip', 'income proof', 'proof of income', 'salary'] },
    { key: 'bankStatement', label: 'Bank Statement', keywords: ['bank statement', 'statements'] },
  ].map((tile) => ({ ...tile, ...matchDocument(documents, tile.keywords) }))

  const matchedIds = new Set(tiles.flatMap((tile) => tile.rows.map((row) => String(row.id || row.displayName || ''))))
  const additionalRows = documents.filter((row) => !matchedIds.has(String(row.id || row.displayName || '')) && isDocumentUploaded(row))
  tiles.push({
    key: 'additionalDocuments',
    label: 'Additional Docs',
    rows: additionalRows,
    uploaded: additionalRows,
    uploadedCount: additionalRows.length,
    isUploaded: additionalRows.length > 0,
    status: additionalRows.length ? `${additionalRows.length} Uploaded` : 'Missing',
  })

  return tiles
}

function buildReadinessItems({ applicant, property, financials, documents, consentCaptured }) {
  return [
    { key: 'applicant', label: 'Applicant details', complete: Boolean(applicant.fullName && applicant.fullName !== 'Applicant not captured') },
    { key: 'contact', label: 'Contact details', complete: Boolean(applicant.email !== 'Not captured' || applicant.phone !== 'Not captured') },
    { key: 'property', label: 'Property information', complete: Boolean(property.label && property.label !== 'Property not captured') },
    { key: 'purchasePrice', label: 'Purchase price', complete: financials.purchasePrice.raw > 0 },
    { key: 'consent', label: 'Consent form', complete: consentCaptured || documents.find((item) => item.key === 'consentForm')?.isUploaded },
    { key: 'idDocument', label: 'ID Document', complete: documents.find((item) => item.key === 'idDocument')?.isUploaded },
    { key: 'proofOfResidence', label: 'Proof of Residence', complete: documents.find((item) => item.key === 'proofOfResidence')?.isUploaded },
    { key: 'incomeProof', label: 'Payslip / Income Proof', complete: documents.find((item) => item.key === 'incomeProof')?.isUploaded },
    { key: 'bankStatement', label: 'Latest Bank Statement', complete: documents.find((item) => item.key === 'bankStatement')?.isUploaded },
  ]
}

function classifyReadiness(percent) {
  if (percent >= 85) return { label: 'Ready for Submission', tone: 'success' }
  if (percent >= 65) return { label: 'Almost Ready', tone: 'warning' }
  return { label: 'Not Ready', tone: 'danger' }
}

function buildActions(readinessItems, financials) {
  const missing = readinessItems.filter((item) => !item.complete)
  const actions = missing.map((item) => {
    const high = ['incomeProof', 'bankStatement', 'consent', 'idDocument'].includes(item.key)
    return {
      id: item.key,
      title: item.key === 'incomeProof' ? 'Upload Payslip / Income Proof' : item.key === 'bankStatement' ? 'Upload Latest Bank Statement' : `Complete ${item.label}`,
      description: item.key === 'incomeProof'
        ? 'Required to verify income'
        : item.key === 'bankStatement'
          ? 'Latest 3 months required'
          : 'Required before bank submission',
      priority: high ? 'High' : 'Medium',
      target: ['incomeProof', 'bankStatement', 'idDocument', 'proofOfResidence', 'consent'].includes(item.key) ? 'documents' : 'application',
    }
  })

  if (financials.monthlyExpenses.raw <= 0) {
    actions.push({
      id: 'monthly-expenses',
      title: 'Review Monthly Expenses',
      description: 'Please verify expense details',
      priority: 'Medium',
      target: 'application',
    })
  }

  return actions.slice(0, 5)
}

function buildRisk({ readinessPercent, transaction, onboardingFormData, financials, documents }) {
  const explicit = text(
    transaction?.risk_status ||
      transaction?.compliance_status ||
      onboardingFormData?.riskStatus ||
      onboardingFormData?.risk_status ||
      onboardingFormData?.affordabilityRisk ||
      onboardingFormData?.affordability_risk,
  )
  const explicitScore = number(transaction?.risk_score || onboardingFormData?.riskScore || onboardingFormData?.risk_score)
  const score = explicitScore || readinessPercent
  const lower = explicit.toLowerCase()
  const ratio = financials.expenseRatio.raw
  const missingIncome = !documents.find((item) => item.key === 'incomeProof')?.isUploaded
  const missingBank = !documents.find((item) => item.key === 'bankStatement')?.isUploaded
  const missingConsent = !documents.find((item) => item.key === 'consentForm')?.isUploaded
  const factors = [
    missingIncome ? 'Missing income proof' : '',
    ratio >= 40 ? 'Debt-to-income ratio elevated' : '',
    financials.deposit.raw <= 0 ? 'Deposit not confirmed' : '',
    missingConsent ? 'Consent not captured' : '',
    missingBank ? 'Bank statements missing' : '',
  ].filter(Boolean)

  let level = 'Incomplete'
  if (lower.includes('low')) level = 'Low Risk'
  else if (lower.includes('medium') || lower.includes('review')) level = 'Medium Risk'
  else if (lower.includes('high') || lower.includes('at risk') || lower.includes('blocked')) level = 'At Risk'
  else if (readinessPercent >= 85 && factors.length <= 1) level = 'Low Risk'
  else if (readinessPercent >= 65) level = 'Medium Risk'
  else if (readinessPercent > 0) level = 'At Risk'

  const recommendation = missingIncome
    ? 'Request updated payslip before bank submission.'
    : financials.deposit.raw <= 0
      ? 'Confirm deposit source before submission.'
      : ratio >= 40
        ? 'Review affordability before sending to banks.'
        : 'Application is tracking toward bank submission.'

  return {
    level,
    score,
    scoreLabel: explicitScore ? 'Risk Score' : 'Preliminary Risk View',
    factors: factors.length ? factors : ['No major risk factors detected'],
    recommendation,
    tone: level === 'Low Risk' ? 'success' : level === 'Medium Risk' ? 'warning' : level === 'At Risk' ? 'danger' : 'neutral',
  }
}

function buildActivity({ activityFeed = [], transaction, onboarding, documents }) {
  const mapped = activityFeed.slice(0, 4).map((entry, index) => ({
    id: entry.id || `activity-${index}`,
    title: entry.title || entry.type || 'Application update',
    description: entry.body || entry.description || '',
    createdAt: entry.createdAt || entry.created_at || entry.updatedAt || '',
    displayDate: formatDateTime(entry.createdAt || entry.created_at || entry.updatedAt || ''),
  }))

  if (mapped.length) return mapped

  return [
    transaction?.created_at
      ? { id: 'created', title: 'Application created', description: '', createdAt: transaction.created_at, displayDate: formatDateTime(transaction.created_at) }
      : null,
    onboarding?.created_at || onboarding?.updated_at
      ? { id: 'onboarding', title: 'Onboarding started', description: '', createdAt: onboarding.updated_at || onboarding.created_at, displayDate: formatDateTime(onboarding.updated_at || onboarding.created_at) }
      : null,
    documents?.some((item) => item.isUploaded)
      ? { id: 'documents', title: `Documents uploaded (${documents.filter((item) => item.isUploaded).length}/${documents.length})`, description: '', createdAt: '', displayDate: 'Recent' }
      : null,
  ].filter(Boolean)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function row(label, value) {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || 'Not captured')}</td></tr>`
}

export function buildBondApplicationViewModel({
  transaction = {},
  buyer = {},
  development = {},
  unit = {},
  onboarding = {},
  onboardingFormData = {},
  documentRows = [],
  requiredDocumentRows = [],
  documentReadiness = {},
  activityFeed = [],
  reference = '',
  statusLabel = '',
  assignedConsultant = '',
} = {}) {
  const data = { transaction, buyer, development, unit, onboarding, onboardingFormData }
  const firstName = lookup(data, ['firstName', 'first_name', 'buyerFirstName', 'buyer_first_name', 'personal_details.primary.first_name'])
  const surname = lookup(data, ['surname', 'lastName', 'last_name', 'buyerSurname', 'buyer_surname', 'personal_details.primary.surname'])
  const fullName = text(valueFrom(
    lookup(data, ['fullName', 'full_name', 'buyerName', 'buyer_name', 'clientName', 'client_name', 'name']),
    [firstName, surname].filter(Boolean).join(' '),
  )) || 'Applicant not captured'
  const email = text(lookup(data, ['email', 'buyerEmail', 'buyer_email', 'clientEmail', 'client_email', 'personal_details.primary.email'])) || 'Not captured'
  const phone = text(lookup(data, ['phone', 'phoneNumber', 'phone_number', 'mobile', 'mobileNumber', 'personal_details.primary.cellphone_number'])) || 'Not captured'
  const employmentStatus = text(lookup(data, ['employmentStatus', 'employment_status', 'employment.primary.occupation_status', 'personal_details.primary.employment_status'])) || 'Not captured'

  const purchasePrice = number(valueFrom(
    lookup(data, ['purchase_price', 'sales_price', 'purchasePrice', 'loan_details.purchase_price']),
    transaction?.purchase_price,
    transaction?.sales_price,
  ))
  const deposit = number(valueFrom(lookup(data, ['deposit', 'deposit_amount', 'loan_details.deposit_amount']), transaction?.deposit_amount))
  const grossIncome = number(lookup(data, ['grossMonthlyIncome', 'gross_monthly_income', 'monthlyIncome', 'income_deductions_expenses.primary.gross_salary']))
  const monthlyExpenses = number(lookup(data, ['monthlyExpenses', 'monthly_expenses', 'income_deductions_expenses.primary.total_expenses']))
  const existingDebt = number(lookup(data, ['existingDebt', 'existing_debt', 'assets_liabilities.total_liabilities']))
  const bondAmountRequired = number(valueFrom(
    lookup(data, ['bondAmount', 'bond_amount', 'amount_to_be_registered', 'loan_details.amount_to_be_registered']),
    transaction?.bond_amount,
    purchasePrice && deposit ? purchasePrice - deposit : 0,
  ))
  const depositPercent = purchasePrice && deposit ? Math.round((deposit / purchasePrice) * 1000) / 10 : 0
  const expenseRatio = grossIncome && monthlyExpenses ? Math.round((monthlyExpenses / grossIncome) * 1000) / 10 : 0

  const propertyLabel = text(valueFrom(
    unit?.unit_number ? `${development?.name || 'Development'} • Unit ${unit.unit_number}` : '',
    transaction?.property_description,
    transaction?.property_address_line_1,
    onboardingFormData?.property,
    onboardingFormData?.propertyLabel,
    onboardingFormData?.loan_details?.street_or_complex,
  )) || 'Property not captured'
  const propertyImageUrl = text(valueFrom(
    unit?.image_url,
    unit?.cover_image_url,
    unit?.primary_image_url,
    development?.image_url,
    development?.cover_image_url,
    transaction?.property_image_url,
    transaction?.listing_image_url,
  ))
  const applicationStatus = normalizeStatusLabel(valueFrom(statusLabel, transaction?.bond_application_status, transaction?.status, onboarding?.status))
  const documents = buildDocumentTiles(documentRows, requiredDocumentRows)
  const consentCaptured = Boolean(valueFrom(
    onboardingFormData?.creditConsent,
    onboardingFormData?.credit_consent,
    onboardingFormData?.declarations_consents?.loan_processing_consent,
    onboardingFormData?.declarations_consents?.credit_bureau_fraud_bank_data_consent,
    onboardingFormData?.declarations_consents?.declaration_accepted,
  ))
  const readinessItems = buildReadinessItems({
    applicant: { fullName, email, phone },
    property: { label: propertyLabel },
    financials: {
      purchasePrice: { raw: purchasePrice },
      monthlyExpenses: { raw: monthlyExpenses },
      deposit: { raw: deposit },
    },
    documents,
    consentCaptured,
  })
  const completedRequiredItems = readinessItems.filter((item) => item.complete).length
  const readinessPercent = readinessItems.length ? Math.round((completedRequiredItems / readinessItems.length) * 100) : 0
  const completionPercent = number(transaction?.completion_percent || onboardingFormData?.completionPercent || onboardingFormData?.completion_percent || documentReadiness?.score) || readinessPercent
  const readiness = classifyReadiness(readinessPercent)
  const risk = buildRisk({ readinessPercent, transaction, onboardingFormData, financials: { deposit: { raw: deposit }, expenseRatio: { raw: expenseRatio } }, documents })

  return {
    applicant: {
      fullName,
      initials: initialsFor(fullName),
      email,
      phone,
      employmentStatus,
    },
    application: {
      id: text(reference || transaction?.bond_application_id || transaction?.bondApplicationId || transaction?.application_reference || transaction?.id) || 'Pending',
      status: applicationStatus,
      stage: toTitle(transaction?.stage || transaction?.current_stage || onboarding?.status || 'Onboarding'),
      createdAt: transaction?.created_at || onboarding?.created_at || '',
      updatedAt: transaction?.updated_at || onboarding?.updated_at || '',
      createdAtDisplay: formatDate(transaction?.created_at || onboarding?.created_at || ''),
      updatedAtDisplay: formatDateTime(transaction?.updated_at || onboarding?.updated_at || ''),
      completionPercent,
      readinessPercent,
      readinessLabel: readiness.label,
      readinessTone: readiness.tone,
      onboardingStatus: applicationStatus,
    },
    property: {
      label: propertyLabel,
      developmentName: text(development?.name || onboardingFormData?.developmentName || onboardingFormData?.development_name) || 'Not captured',
      unitNumber: text(unit?.unit_number || onboardingFormData?.unitNumber || onboardingFormData?.unit_number) || 'Not captured',
      imageUrl: propertyImageUrl,
    },
    financials: {
      purchasePrice: { raw: purchasePrice, display: formatCurrency(purchasePrice) },
      deposit: { raw: deposit, display: formatCurrency(deposit), secondary: depositPercent ? `${depositPercent}%` : '' },
      grossIncome: { raw: grossIncome, display: formatCurrency(grossIncome) },
      monthlyExpenses: { raw: monthlyExpenses, display: formatCurrency(monthlyExpenses), secondary: expenseRatio ? `${expenseRatio}%` : '' },
      expenseRatio: { raw: expenseRatio, display: expenseRatio ? `${expenseRatio}%` : 'Not captured' },
      existingDebt: { raw: existingDebt, display: formatCurrency(existingDebt) },
      bondAmountRequired: { raw: bondAmountRequired, display: formatCurrency(bondAmountRequired) },
    },
    documents,
    readinessItems,
    actions: buildActions(readinessItems, {
      monthlyExpenses: { raw: monthlyExpenses },
    }),
    activity: buildActivity({ activityFeed, transaction, onboarding, documents }),
    risk,
    consultant: text(assignedConsultant) || 'Unassigned',
    generatedAt: new Date().toISOString(),
  }
}

export function getBondApplicationPdfFilename(viewModel) {
  const applicant = text(viewModel?.applicant?.fullName || 'bond-application')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const id = text(viewModel?.application?.id || 'pending')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `bond-application-${applicant || 'applicant'}-${id || 'pending'}.pdf`
}

export function buildBondApplicationPdfHtml(viewModel, generatedAt = new Date().toISOString()) {
  const vm = viewModel || {}
  const documentRows = (vm.documents || [])
    .map((item) => row(item.label, item.status || (item.isUploaded ? 'Uploaded' : 'Missing')))
    .join('')
  const readinessRows = (vm.readinessItems || [])
    .map((item) => row(item.label, item.complete ? 'Complete' : 'Outstanding'))
    .join('')
  const actionRows = (vm.actions || [])
    .map((item) => row(item.title, `${item.priority} priority - ${item.description}`))
    .join('')
  const factors = (vm.risk?.factors || []).map((factor) => `<li>${escapeHtml(factor)}</li>`).join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(vm.application?.id || 'Bond Application')}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #101827; background: #eef5ef; }
    .page { max-width: 980px; margin: 0 auto; border: 1px solid #d7e6d9; border-radius: 24px; overflow: hidden; background: #fff; box-shadow: 0 24px 70px rgba(15, 23, 42, 0.12); }
    .hero { padding: 28px; color: #fff; background: linear-gradient(135deg, #064a28, #0b6b3d); }
    .brand { display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    .brand span { color: #b8f5cc; }
    h1 { margin: 26px 0 8px; font-size: 32px; letter-spacing: -0.04em; }
    h2 { margin: 0 0 12px; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: #60758d; }
    p { margin: 0; }
    .sub { color: #d9fbe6; font-size: 14px; line-height: 1.6; }
    .content { padding: 24px; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .two { grid-template-columns: 1.2fr .8fr; }
    .card { border: 1px solid #dfe8e2; border-radius: 18px; padding: 16px; background: #fff; page-break-inside: avoid; }
    .metric { border-color: #d8eadc; background: #f8fcf9; }
    .label { display: block; margin-bottom: 6px; color: #60758d; font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    .value { color: #101827; font-size: 18px; font-weight: 800; letter-spacing: -0.03em; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #e8f0ea; padding: 9px 0; text-align: left; vertical-align: top; }
    th { width: 42%; color: #60758d; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; }
    td { color: #101827; font-weight: 700; }
    .section { margin-top: 16px; }
    .pill { display: inline-flex; margin-top: 14px; border: 1px solid rgba(255,255,255,.24); border-radius: 999px; padding: 7px 11px; color: #ecfff2; font-size: 12px; font-weight: 800; }
    ul { margin: 8px 0 0; padding-left: 18px; color: #334155; font-size: 12px; line-height: 1.7; }
    @media print {
      body { padding: 0; background: #fff; }
      .page { border: 0; border-radius: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <div class="brand"><strong>ooba homeloans</strong><span>Powered by Bridge</span></div>
      <h1>Bond Application Summary</h1>
      <p class="sub">${escapeHtml(vm.applicant?.fullName || 'Applicant not captured')} • ${escapeHtml(vm.application?.id || 'Pending')} • Generated ${escapeHtml(formatDateTime(generatedAt))}</p>
      <span class="pill">${escapeHtml(vm.application?.readinessLabel || 'Not Ready')} · ${escapeHtml(vm.risk?.level || 'Incomplete')}</span>
    </header>
    <section class="content">
      <div class="grid">
        <article class="card metric"><span class="label">Completion</span><span class="value">${escapeHtml(vm.application?.completionPercent || 0)}%</span></article>
        <article class="card metric"><span class="label">Readiness</span><span class="value">${escapeHtml(vm.application?.readinessPercent || 0)}%</span></article>
        <article class="card metric"><span class="label">Risk</span><span class="value">${escapeHtml(vm.risk?.score || 0)}/100</span></article>
      </div>
      <div class="section grid two">
        <article class="card">
          <h2>Applicant Details</h2>
          <table><tbody>
            ${row('Applicant', vm.applicant?.fullName)}
            ${row('Email', vm.applicant?.email)}
            ${row('Phone', vm.applicant?.phone)}
            ${row('Employment', vm.applicant?.employmentStatus)}
            ${row('Consent Status', vm.readinessItems?.find((item) => item.key === 'consent')?.complete ? 'Captured' : 'Not captured')}
          </tbody></table>
        </article>
        <article class="card">
          <h2>Property / Unit</h2>
          <table><tbody>
            ${row('Property', vm.property?.label)}
            ${row('Development', vm.property?.developmentName)}
            ${row('Unit', vm.property?.unitNumber)}
            ${row('Stage', vm.application?.stage)}
            ${row('Last Updated', vm.application?.updatedAtDisplay)}
          </tbody></table>
        </article>
      </div>
      <div class="section grid">
        <article class="card metric"><span class="label">Purchase Price</span><span class="value">${escapeHtml(vm.financials?.purchasePrice?.display)}</span></article>
        <article class="card metric"><span class="label">Deposit</span><span class="value">${escapeHtml(vm.financials?.deposit?.display)} ${escapeHtml(vm.financials?.deposit?.secondary || '')}</span></article>
        <article class="card metric"><span class="label">Bond Required</span><span class="value">${escapeHtml(vm.financials?.bondAmountRequired?.display)}</span></article>
        <article class="card metric"><span class="label">Monthly Income</span><span class="value">${escapeHtml(vm.financials?.grossIncome?.display)}</span></article>
        <article class="card metric"><span class="label">Monthly Expenses</span><span class="value">${escapeHtml(vm.financials?.monthlyExpenses?.display)} ${escapeHtml(vm.financials?.monthlyExpenses?.secondary || '')}</span></article>
        <article class="card metric"><span class="label">Existing Debt</span><span class="value">${escapeHtml(vm.financials?.existingDebt?.display)}</span></article>
      </div>
      <div class="section grid two">
        <article class="card">
          <h2>Submission Readiness</h2>
          <table><tbody>${readinessRows}</tbody></table>
        </article>
        <article class="card">
          <h2>Document Checklist</h2>
          <table><tbody>${documentRows}</tbody></table>
        </article>
      </div>
      <div class="section grid two">
        <article class="card">
          <h2>Risk / Recommendation</h2>
          <table><tbody>
            ${row('Risk Level', vm.risk?.level)}
            ${row('Risk Score', `${vm.risk?.score || 0}/100`)}
            ${row('Recommendation', vm.risk?.recommendation)}
          </tbody></table>
          <ul>${factors}</ul>
        </article>
        <article class="card">
          <h2>Outstanding Items</h2>
          <table><tbody>${actionRows || row('Status', 'No outstanding actions')}</tbody></table>
        </article>
      </div>
    </section>
  </main>
</body>
</html>`
}
