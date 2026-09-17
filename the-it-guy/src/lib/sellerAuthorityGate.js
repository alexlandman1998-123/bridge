const authorityRequirements = Object.freeze({
  company: ['company_resolution_to_sell'],
  trust: ['seller_letters_of_authority', 'trust_resolution_to_sell'],
  deceased_estate: ['seller_executor_authority'],
  other: ['authorised_signatory_authority'],
})

const key = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const approved = new Set(['approved', 'completed', 'verified'])

export function getSellerAuthorityGate({ sellerType = '', requirements = [], documents = [] } = {}) {
  const requiredKeys = authorityRequirements[key(sellerType)] || []
  if (!requiredKeys.length) return { required: false, approved: true, requiredKeys: [], missingKeys: [] }
  const requirementRows = Array.isArray(requirements) ? requirements : []
  const documentRows = Array.isArray(documents) ? documents : []
  const missingKeys = requiredKeys.filter((requiredKey) => {
    const requirement = requirementRows.find((row) => key(row.requirement_key || row.key) === requiredKey)
    const requirementApproved = approved.has(key(requirement?.review_status || requirement?.reviewStatus || requirement?.status))
    const documentApproved = documentRows.some((row) => {
      const matches = key(row.requirement_key || row.document_type || row.type) === requiredKey || String(row.requirement_id || '') === String(requirement?.id || '')
      return matches && approved.has(key(row.review_status || row.reviewStatus || row.status))
    })
    return !(requirementApproved || documentApproved)
  })
  return { required: true, approved: missingKeys.length === 0, requiredKeys, missingKeys }
}
