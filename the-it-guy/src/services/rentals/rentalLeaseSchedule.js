export const rentalLeasePartyLabel = (role) => ({ tenant: 'Tenant', tenant_representative: 'Tenant representative', guarantor: 'Guarantor', landlord: 'Landlord' })[role] || role

export function rentalLeaseScheduleSigners(schedule, reviewedVersion) {
  return [...(schedule?.parties || []), { subjectId: 'landlord', role: 'landlord', ...schedule?.landlord }].map(({ subjectId, role, name, email, authorityBasis }) => ({ subjectId, role, name, email, authorityBasis, reviewedVersion }))
}
