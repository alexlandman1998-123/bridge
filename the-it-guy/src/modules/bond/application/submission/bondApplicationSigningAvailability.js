import { DOCUMENT_GENERATOR_RETIRED } from '../../../../core/documents/documentGeneratorRetirement.js'

export function getBondApplicationSigningAvailability() {
  return {
    available: true,
    code: null,
    message: DOCUMENT_GENERATOR_RETIRED
      ? 'Sign your application here. Your drawn signature will be saved with the application and shown in the downloaded PDF.'
      : '',
  }
}

export function assertBondApplicationSigningAvailable() {
  if (DOCUMENT_GENERATOR_RETIRED) {
    const error = new Error('The retired document-packet signing route is unavailable. Use the in-application signature flow instead.')
    error.code = 'bond_application_signing_unavailable'
    throw error
  }
}
