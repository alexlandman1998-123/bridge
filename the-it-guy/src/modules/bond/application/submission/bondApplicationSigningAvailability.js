import { DOCUMENT_GENERATOR_RETIRED } from '../../../../core/documents/documentGeneratorRetirement.js'

export function getBondApplicationSigningAvailability() {
  return DOCUMENT_GENERATOR_RETIRED
    ? { available: false, code: 'bond_application_signing_unavailable', message: 'Online signing is unavailable. You can still save your application. Contact your bond originator to arrange signing.' }
    : { available: true, code: null, message: '' }
}

export function assertBondApplicationSigningAvailable() {
  const availability = getBondApplicationSigningAvailability()
  if (!availability.available) {
    const error = new Error(availability.message)
    error.code = availability.code
    throw error
  }
}
