export const COMMERCIAL_DOCUMENT_STATUSES = [
  { value: 'requested', label: 'Requested' },
  { value: 'uploaded', label: 'Uploaded' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'completed', label: 'Completed' },
]

export const COMMERCIAL_DOCUMENT_ENTITY_TYPES = [
  { value: 'commercial_requirement', label: 'Commercial Requirement' },
  { value: 'commercial_deal', label: 'Commercial Deal' },
  { value: 'commercial_lease', label: 'Commercial Lease' },
  { value: 'commercial_tenant', label: 'Commercial Tenant' },
  { value: 'commercial_landlord', label: 'Commercial Landlord' },
  { value: 'commercial_property', label: 'Commercial Property' },
]

export const COMMERCIAL_DOCUMENT_CATEGORIES = {
  commercial_requirement: [
    { value: 'tenant_brief', label: 'Tenant Brief' },
    { value: 'company_profile', label: 'Company Profile' },
    { value: 'space_requirement', label: 'Space Requirement' },
    { value: 'financial_qualification', label: 'Financial Qualification' },
    { value: 'board_approval', label: 'Board Approval' },
    { value: 'supporting_documents', label: 'Supporting Documents' },
  ],
  commercial_deal: [
    { value: 'proposal', label: 'Proposal' },
    { value: 'heads_of_terms', label: 'Heads of Terms' },
    { value: 'landlord_approval', label: 'Landlord Approval' },
    { value: 'tenant_approval', label: 'Tenant Approval' },
    { value: 'lease_draft', label: 'Lease Draft' },
    { value: 'lease_comments', label: 'Lease Comments' },
    { value: 'final_lease', label: 'Final Lease' },
    { value: 'signed_lease', label: 'Signed Lease' },
  ],
  commercial_lease: [
    { value: 'signed_lease_agreement', label: 'Signed Lease Agreement' },
    { value: 'deposit_proof', label: 'Deposit Proof' },
    { value: 'occupation_certificate', label: 'Occupation Certificate' },
    { value: 'fit_out_approval', label: 'Fit-out Approval' },
    { value: 'renewal_notice', label: 'Renewal Notice' },
    { value: 'termination_notice', label: 'Termination Notice' },
    { value: 'addendum', label: 'Addendum' },
  ],
}

export const COMMERCIAL_HOT_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent_for_review', label: 'Sent for Review' },
  { value: 'approved_by_landlord', label: 'Approved by Landlord' },
  { value: 'approved_by_tenant', label: 'Approved by Tenant' },
  { value: 'ready_for_lease', label: 'Ready for Lease' },
  { value: 'superseded', label: 'Superseded' },
]

export function getCommercialDocumentCategories(entityType) {
  return COMMERCIAL_DOCUMENT_CATEGORIES[entityType] || [
    { value: 'supporting_documents', label: 'Supporting Documents' },
  ]
}
