const text = (value) => String(value ?? '').trim()
const escape = (value) => text(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
export const rentalLeasePartyLabel = (role) => ({ tenant: 'Tenant', tenant_representative: 'Tenant representative', guarantor: 'Guarantor', landlord: 'Landlord' })[role] || role

export function rentalLeaseScheduleSigners(schedule, reviewedVersion) {
  return [...(schedule?.parties || []), { subjectId: 'landlord', role: 'landlord', ...schedule?.landlord }].map(({ subjectId, role, name, email, authorityBasis }) => ({ subjectId, role, name, email, authorityBasis, reviewedVersion }))
}

// This is a schedule for checking the agency's agreement, not legal clauses or
// an electronically executed lease. Render only the explicit projection fields.
export function renderRentalLeaseSchedule(schedule = {}, version) {
  const row = (label, value) => `<tr><th>${escape(label)}</th><td>${escape(value)}</td></tr>`
  const terms = schedule.terms || {}
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Rental lease schedule · v${escape(version)}</title><style>body{font:15px system-ui;color:#172334;max-width:900px;margin:40px auto;padding:0 24px}h1{font-size:28px}h2{font-size:19px;margin-top:30px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd;vertical-align:top}th{width:35%}p{line-height:1.5}@media print{body{margin:0}}</style></head><body><h1>Rental lease schedule</h1><p>Draft for agent review · lease version ${escape(version)}. Check these details against the agency agreement before recording signed evidence.</p><h2>Tenant and property</h2><table>${row('Tenant', schedule.tenant?.name)}${row('Entity', schedule.tenant?.type)}${['company', 'close_corporation', 'trust'].includes(schedule.tenant?.type) ? row('Registration number', schedule.tenant?.registrationNumber) + row('Registered address', schedule.tenant?.registeredAddress) : ''}${row('Property', schedule.property?.title)}${row('Property address', schedule.property?.address)}${row('Tenant notice address', schedule.tenantNoticeAddress)}</table><h2>Lease terms</h2><table>${row('Lease start', terms.leaseStartDate)}${row('Lease end', terms.leaseEndDate)}${row('Occupation', terms.occupationDate)}${row('Monthly rent (ZAR)', terms.monthlyRent)}${row('Deposit (ZAR)', terms.depositAmount)}</table><h2>Landlord</h2><table>${row('Name', schedule.landlord?.name)}${row('Email', schedule.landlord?.email)}${row('Notice address', schedule.landlord?.noticeAddress)}</table><h2>Parties and signature checklist</h2>${(schedule.parties || []).map((party) => `<h3>${escape(rentalLeasePartyLabel(party.role))}: ${escape(party.name)}</h3><table>${row('Email', party.email)}${row('Phone', party.phone)}${row('Identity type', party.identityType)}${row('Identity number', party.identityNumber)}${row('Notice address', party.noticeAddress)}${party.role === 'tenant_representative' ? row('Authority', party.authorityBasis) : ''}</table>`).join('')}<h2>Agency agreement</h2><table>${row('Template / version reference', schedule.agreement?.templateReference)}${row('Reviewed document', schedule.agreement?.documentLink)}</table><p>Each tenant, authorised representative, guarantor and landlord listed above must have signed evidence recorded. This schedule does not replace the agency lease or any suretyship agreement.</p></body></html>`
}

export function downloadRentalLeaseSchedule(schedule, version) {
  const url = URL.createObjectURL(new Blob([renderRentalLeaseSchedule(schedule, version)], { type: 'text/html;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `rental-lease-schedule-v${version}.html`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
