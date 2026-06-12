export const COMMERCIAL_DOCUMENT_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'requested', label: 'Requested' },
  { value: 'uploaded', label: 'Uploaded' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
  { value: 'superseded', label: 'Superseded' },
  { value: 'archived', label: 'Archived' },
  { value: 'completed', label: 'Completed' },
]

export const COMMERCIAL_DOCUMENT_REQUEST_PRIORITIES = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'low', label: 'Low' },
]

export const COMMERCIAL_DOCUMENT_ENTITY_TYPES = [
  { value: 'commercial_landlord', label: 'Landlord' },
  { value: 'commercial_tenant', label: 'Tenant' },
  { value: 'commercial_property', label: 'Property' },
  { value: 'commercial_vacancy', label: 'Vacancy' },
  { value: 'commercial_requirement', label: 'Requirement' },
  { value: 'commercial_deal', label: 'Deal' },
  { value: 'commercial_transaction', label: 'Transaction' },
  { value: 'commercial_heads_of_terms', label: 'Heads of Terms' },
  { value: 'commercial_lease', label: 'Lease' },
  { value: 'commercial_listing', label: 'Listing' },
]

export const COMMERCIAL_DOCUMENT_ENTITY_LABELS = COMMERCIAL_DOCUMENT_ENTITY_TYPES.reduce((labels, item) => {
  labels[item.value] = item.label
  return labels
}, {})

export const COMMERCIAL_DOCUMENT_CATEGORIES = {
  commercial_landlord: [
    { value: 'fica', label: 'FICA' },
    { value: 'company_registration', label: 'Company Registration' },
    { value: 'resolution', label: 'Resolution' },
    { value: 'tax_clearance', label: 'Tax Clearance' },
    { value: 'property_ownership_documents', label: 'Property Ownership Documents' },
    { value: 'banking_confirmation', label: 'Banking Confirmation' },
    { value: 'insurance_documents', label: 'Insurance Documents' },
    { value: 'mandate', label: 'Mandate' },
    { value: 'portfolio_schedule', label: 'Portfolio Schedule' },
    { value: 'supporting_documents', label: 'Supporting Documentation' },
  ],
  commercial_tenant: [
    { value: 'fica', label: 'FICA' },
    { value: 'company_registration', label: 'Company Registration' },
    { value: 'financial_statements', label: 'Financial Statements' },
    { value: 'bank_confirmation', label: 'Bank Confirmation' },
    { value: 'credit_information', label: 'Credit Information' },
    { value: 'tax_documents', label: 'Tax Documents' },
    { value: 'company_profile', label: 'Company Profile' },
    { value: 'supporting_documents', label: 'Supporting Documentation' },
  ],
  commercial_property: [
    { value: 'title_deed', label: 'Title Deed' },
    { value: 'zoning_certificate', label: 'Zoning Certificate' },
    { value: 'site_plans', label: 'Site Plans' },
    { value: 'building_plans', label: 'Building Plans' },
    { value: 'compliance_certificates', label: 'Compliance Certificates' },
    { value: 'insurance_documents', label: 'Insurance Documents' },
    { value: 'utility_information', label: 'Utility Information' },
    { value: 'property_pack', label: 'Property Pack' },
    { value: 'photos', label: 'Photos' },
    { value: 'supporting_documents', label: 'Supporting Documentation' },
  ],
  commercial_vacancy: [
    { value: 'vacancy_brochure', label: 'Vacancy Brochure' },
    { value: 'floor_plans', label: 'Floor Plans' },
    { value: 'marketing_material', label: 'Marketing Material' },
    { value: 'pricing_schedule', label: 'Pricing Schedule' },
    { value: 'availability_information', label: 'Availability Information' },
    { value: 'fit_out_spec', label: 'Fit-out Specification' },
    { value: 'photos', label: 'Photos' },
    { value: 'supporting_documents', label: 'Supporting Documentation' },
  ],
  commercial_requirement: [
    { value: 'tenant_brief', label: 'Tenant Brief' },
    { value: 'space_requirement', label: 'Space Requirement' },
    { value: 'financial_qualification', label: 'Financial Qualification' },
    { value: 'board_approval', label: 'Board Approval' },
    { value: 'supporting_documents', label: 'Supporting Documentation' },
  ],
  commercial_deal: [
    { value: 'proposal', label: 'Proposal' },
    { value: 'negotiation_documents', label: 'Negotiation Documents' },
    { value: 'supporting_correspondence', label: 'Supporting Correspondence' },
    { value: 'commercial_terms', label: 'Commercial Terms' },
    { value: 'landlord_approval', label: 'Landlord Approval' },
    { value: 'tenant_approval', label: 'Tenant Approval' },
    { value: 'supporting_documents', label: 'Supporting Documentation' },
  ],
  commercial_transaction: [
    { value: 'hot', label: 'HOT' },
    { value: 'lease', label: 'Lease' },
    { value: 'offer', label: 'Offer' },
    { value: 'board_resolution', label: 'Board Resolution' },
    { value: 'proof_of_funds', label: 'Proof of Funds' },
    { value: 'fica', label: 'FICA' },
    { value: 'supporting_documents', label: 'Supporting Documentation' },
  ],
  commercial_heads_of_terms: [
    { value: 'draft_hot', label: 'Draft HOT' },
    { value: 'sent_hot', label: 'Sent HOT' },
    { value: 'revised_hot', label: 'Revised HOT' },
    { value: 'approved_hot', label: 'Approved HOT' },
    { value: 'final_hot', label: 'Final HOT' },
    { value: 'signed_hot', label: 'Signed HOT' },
    { value: 'supporting_documents', label: 'Supporting Documentation' },
  ],
  commercial_lease: [
    { value: 'draft_lease', label: 'Draft Lease' },
    { value: 'legal_review', label: 'Legal Review' },
    { value: 'final_lease', label: 'Final Lease' },
    { value: 'signed_lease', label: 'Signed Lease' },
    { value: 'renewal', label: 'Renewal' },
    { value: 'addendum', label: 'Addendum' },
    { value: 'termination', label: 'Termination' },
    { value: 'cancellation', label: 'Cancellation' },
    { value: 'supporting_documents', label: 'Supporting Documentation' },
  ],
  commercial_listing: [
    { value: 'marketing_material', label: 'Marketing Material' },
    { value: 'pricing_schedule', label: 'Pricing Schedule' },
    { value: 'floor_plans', label: 'Floor Plans' },
    { value: 'photos', label: 'Photos' },
    { value: 'availability_information', label: 'Availability Information' },
    { value: 'supporting_documents', label: 'Supporting Documentation' },
  ],
}

export const COMMERCIAL_DOCUMENT_REQUIREMENT_TEMPLATES = {
  commercial_landlord: [
    { category: 'fica', label: 'FICA', required: true },
    { category: 'company_registration', label: 'Company Registration', required: true },
    { category: 'banking_confirmation', label: 'Banking Confirmation', required: true },
  ],
  commercial_tenant: [
    { category: 'fica', label: 'FICA', required: true },
    { category: 'company_registration', label: 'Company Registration', required: true },
    { category: 'financial_statements', label: 'Financial Statements', required: true },
  ],
  commercial_property: [
    { category: 'title_deed', label: 'Title Deed', required: true },
    { category: 'zoning_certificate', label: 'Zoning Certificate', required: true },
    { category: 'building_plans', label: 'Building Plans', required: true },
    { category: 'compliance_certificates', label: 'Compliance Certificates', required: true },
  ],
  commercial_vacancy: [
    { category: 'vacancy_brochure', label: 'Vacancy Brochure', required: true },
    { category: 'floor_plans', label: 'Floor Plans', required: true },
    { category: 'pricing_schedule', label: 'Pricing Schedule', required: true },
    { category: 'availability_information', label: 'Availability Information', required: true },
  ],
  commercial_requirement: [
    { category: 'tenant_brief', label: 'Tenant Brief', required: true },
    { category: 'space_requirement', label: 'Space Requirement', required: true },
    { category: 'financial_qualification', label: 'Financial Qualification', required: false },
  ],
  commercial_deal: [
    { category: 'proposal', label: 'Proposal', required: true },
    { category: 'commercial_terms', label: 'Commercial Terms', required: true },
    { category: 'supporting_correspondence', label: 'Supporting Correspondence', required: false },
  ],
  commercial_transaction: [
    { category: 'hot', label: 'HOT', required: false },
    { category: 'lease', label: 'Lease', required: false },
    { category: 'offer', label: 'Offer', required: false },
    { category: 'fica', label: 'FICA', required: false },
    { category: 'supporting_documents', label: 'Supporting Documentation', required: false },
  ],
  commercial_heads_of_terms: [
    { category: 'draft_hot', label: 'Draft HOT', required: true },
    { category: 'signed_hot', label: 'Signed HOT', required: true },
  ],
  commercial_lease: [
    { category: 'draft_lease', label: 'Draft Lease', required: false },
    { category: 'final_lease', label: 'Final Lease', required: true },
    { category: 'signed_lease', label: 'Signed Lease', required: true },
  ],
}

export const COMMERCIAL_HOT_DOCUMENT_FLOW = ['draft_hot', 'sent_hot', 'revised_hot', 'approved_hot', 'signed_hot']
export const COMMERCIAL_LEASE_DOCUMENT_FLOW = ['draft_lease', 'legal_review', 'final_lease', 'signed_lease', 'renewal']

export const COMMERCIAL_HOT_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'signed', label: 'Signed' },
  { value: 'sent_for_review', label: 'Sent for Review' },
  { value: 'approved_by_landlord', label: 'Approved by Landlord' },
  { value: 'approved_by_tenant', label: 'Approved by Tenant' },
  { value: 'ready_for_lease', label: 'Ready for Lease' },
  { value: 'converted', label: 'Converted' },
  { value: 'superseded', label: 'Superseded' },
]

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

export function getCommercialDocumentCategories(entityType) {
  return COMMERCIAL_DOCUMENT_CATEGORIES[entityType] || [
    { value: 'supporting_documents', label: 'Supporting Documentation' },
  ]
}

export function getCommercialDocumentCategoryLabel(entityType, categoryValue) {
  const normalized = normalize(categoryValue || 'supporting_documents')
  const match = getCommercialDocumentCategories(entityType).find((category) => category.value === normalized)
  return match?.label || normalized.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function getCommercialDocumentRequirementTemplate(entityType) {
  return COMMERCIAL_DOCUMENT_REQUIREMENT_TEMPLATES[entityType] || []
}

export function isCommercialDocumentCompleteStatus(status) {
  return ['approved', 'completed'].includes(normalize(status))
}

export function isCommercialDocumentOpenStatus(status) {
  return ['requested', 'uploaded', 'under_review', 'draft'].includes(normalize(status))
}

export function isCommercialDocumentOutstandingStatus(status) {
  return ['requested', 'under_review', 'rejected', 'expired'].includes(normalize(status))
}

export function buildCommercialDocumentCompliance({ entityType, documents = [], requests = [] } = {}) {
  const template = getCommercialDocumentRequirementTemplate(entityType)
  const activeDocuments = documents.filter((document) => !document.archived_at && !['archived', 'superseded'].includes(normalize(document.status)))
  const activeRequests = requests.filter((request) => !['approved', 'completed', 'archived'].includes(normalize(request.status)))
  const receivedCategories = new Set(activeDocuments.filter((document) => ['uploaded', 'under_review', 'approved', 'completed'].includes(normalize(document.status))).map((document) => normalize(document.category)))
  const approvedCategories = new Set(activeDocuments.filter((document) => isCommercialDocumentCompleteStatus(document.status)).map((document) => normalize(document.category)))
  const rejectedCategories = new Set(activeDocuments.filter((document) => normalize(document.status) === 'rejected').map((document) => normalize(document.category)))
  const requestedCategories = new Set(activeRequests.map((request) => normalize(request.category)))

  const required = template.map((item) => {
    const category = normalize(item.category)
    const approved = approvedCategories.has(category)
    const received = receivedCategories.has(category)
    const requested = requestedCategories.has(category)
    const rejected = rejectedCategories.has(category)
    const status = approved ? 'approved' : rejected ? 'rejected' : received ? 'uploaded' : requested ? 'requested' : 'outstanding'
    return {
      ...item,
      category,
      approved,
      received,
      requested,
      rejected,
      status,
    }
  })

  const requiredOnly = required.filter((item) => item.required !== false)
  const complete = requiredOnly.filter((item) => item.approved || item.received).length
  const total = requiredOnly.length
  const completionPercent = total ? Math.round((complete / total) * 100) : 100

  return {
    required,
    complete,
    total,
    completionPercent,
    outstanding: requiredOnly.filter((item) => !item.received && !item.approved),
    rejected: required.filter((item) => item.rejected),
    pendingReview: activeDocuments.filter((document) => normalize(document.status) === 'under_review'),
    openRequests: activeRequests,
  }
}

export function getCommercialDocumentVersionLabel(document = {}) {
  const version = Number(document.version_number || document.version || 0)
  if (version > 0) return `v${version}`
  if (normalize(document.status) === 'final' || normalize(document.category).includes('final')) return 'Final'
  if (normalize(document.status) === 'signed' || normalize(document.category).includes('signed')) return 'Signed'
  return ''
}
