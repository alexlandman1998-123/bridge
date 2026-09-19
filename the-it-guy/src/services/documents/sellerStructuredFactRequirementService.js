import { getCrossModuleDocumentDefinition } from './crossModuleDocumentKeyMapService.js'

const CAPTURE_SURFACES = Object.freeze({
  body_corporate_details: Object.freeze({ key: 'sectional_title_details', label: 'Sectional title details' }),
  hoa_details: Object.freeze({ key: 'estate_hoa_details', label: 'Estate / HOA details' }),
  bond_bank_details: Object.freeze({ key: 'bond_details', label: 'Bond details' }),
  bond_cancellation_attorney_details: Object.freeze({ key: 'bond_details', label: 'Bond details' }),
  settlement_figure: Object.freeze({ key: 'bond_details', label: 'Bond details' }),
  tenant_details: Object.freeze({ key: 'tenancy_details', label: 'Tenancy details' }),
  deposit_details: Object.freeze({ key: 'tenancy_details', label: 'Tenancy details' }),
  notice_period_details: Object.freeze({ key: 'tenancy_details', label: 'Tenancy details' }),
})

function requirementKey(requirement = {}) {
  return String(requirement?.requirement_key || requirement?.requirementKey || requirement?.key || '').trim()
}

export function getSellerStructuredFactCaptureSurface(requirement = {}) {
  const definition = getCrossModuleDocumentDefinition(requirementKey(requirement))
  if (definition?.kind !== 'structured_fact') return null
  return CAPTURE_SURFACES[definition.canonicalKey] || Object.freeze({ key: 'seller_details', label: 'Seller details' })
}

export function isSellerStructuredFactRequirement(requirement = {}) {
  return Boolean(getSellerStructuredFactCaptureSurface(requirement))
}

export function partitionSellerDocumentRequirements(requirements = []) {
  const documentRequirements = []
  const structuredFactRequirements = []

  for (const requirement of Array.isArray(requirements) ? requirements : []) {
    const captureSurface = getSellerStructuredFactCaptureSurface(requirement)
    if (!captureSurface) {
      documentRequirements.push(requirement)
      continue
    }
    structuredFactRequirements.push({
      ...requirement,
      requirement_kind: 'structured_fact',
      capture_surface: captureSurface.key,
      capture_surface_label: captureSurface.label,
      action: 'capture_details',
      action_label: 'Capture details',
    })
  }

  return { documentRequirements, structuredFactRequirements }
}
