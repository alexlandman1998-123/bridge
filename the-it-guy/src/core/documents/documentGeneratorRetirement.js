// Permanent retirement; deliberately not controlled by an environment flag.
export const DOCUMENT_GENERATOR_RETIRED = true
export const DOCUMENT_GENERATOR_RETIRED_CODE = 'document_generator_retired'
export const DOCUMENT_GENERATOR_RETIRED_MESSAGE = 'The old document generator and signing workflow have been retired. Upload signed documents through the listing or transaction document workspace.'
export const RETIRED_DOCUMENT_FUNCTIONS = Object.freeze([
  'generate-mandate', 'generate-otp', 'generate-final-signed-document',
  'document-conversion-health', 'legal-document-watchdog', 'legal-document-job-runner',
  'resolve-signer-token', 'signer-signing-action', 'send-mandate-signing-email',
  'retry-final-document-completion',
])
export function assertDocumentGeneratorAvailable() {
  const error = new Error(DOCUMENT_GENERATOR_RETIRED_MESSAGE)
  error.code = DOCUMENT_GENERATOR_RETIRED_CODE
  throw error
}
export function isRetiredDocumentFunction(name) {
  return RETIRED_DOCUMENT_FUNCTIONS.includes(String(name || '').trim())
}
