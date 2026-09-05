const text = (value) => String(value ?? '').trim()

export function validateRentalLandlordMandateHandoff(values = {}) {
  const errors = []
  if (!text(values.propertyId)) errors.push('Choose the managed rental property.')
  if (!text(values.signedAt)) errors.push('Signed mandate date and time is required.')
  else if (Number.isNaN(new Date(values.signedAt).getTime())) errors.push('Signed mandate date and time must be valid.')
  if (!text(values.evidenceReference)) errors.push('Signed mandate evidence reference is required.')
  if (values.signedConfirmation !== true) errors.push('Confirm that the mandate has been signed before recording it.')
  return errors
}

export function buildRentalLandlordMandateHandoff(lead = {}, values = {}) {
  const errors = validateRentalLandlordMandateHandoff(values)
  if (lead.role !== 'landlord' || lead.stage !== 'mandate_pending') errors.push('Choose a landlord lead at Mandate pending.')
  if (errors.length) throw new Error(errors.join(' '))
  return { propertyId: text(values.propertyId), signedAt: new Date(values.signedAt).toISOString(), evidenceReference: text(values.evidenceReference), startsOn: text(values.startsOn), endsOn: text(values.endsOn), managementFeeType: text(values.managementFeeType) || 'percentage', managementFeeAmount: Number(values.managementFeeAmount || 0), metadata: { leadId: text(lead.id), signedEvidenceReference: text(values.evidenceReference), signedAt: new Date(values.signedAt).toISOString() } }
}
