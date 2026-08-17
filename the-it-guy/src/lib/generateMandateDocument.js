import {
  createDocumentGenerationContractError,
  normalizeDocumentGenerationResponseContract,
  validateDocumentGenerationRequestContract,
} from './documentGenerationContract'
import { invokeEdgeFunction } from './supabaseClient'

export async function generateMandateDocumentFromTemplate({
  packetId,
  transactionId = '',
  leadId = '',
  renderMode = '',
  templatePath = '',
  templateBucket = '',
  templateBase64 = '',
  templateFilename = '',
  outputBucket = '',
  outputPath = '',
  placeholders = {},
  sectionManifest = [],
  generationPayload = null,
  sourceContext = null,
  branding = null,
  templateVersion = '',
  generatedByRole = '',
  generatedByUserId = '',
  clientVisible = false,
} = {}) {
  const request = validateDocumentGenerationRequestContract({
    packetId,
    transactionId,
    leadId,
    renderMode,
    templatePath,
    templateBucket,
    templateBase64,
    templateFilename,
    outputBucket,
    outputPath,
    placeholders,
    sectionManifest,
    generationPayload,
    sourceContext,
    branding,
    templateVersion,
    generatedByRole,
    generatedByUserId,
    clientVisible,
  })
  if (!request.ok) {
    throw createDocumentGenerationContractError(
      'GENERATION_CONTRACT_REQUEST_INVALID',
      request.issues.map((item) => item.message).join(' '),
      { issues: request.issues },
    )
  }
  const payload = request.payload

  const { data, error } = await invokeEdgeFunction('generate-mandate', {
    body: payload,
  })

  if (error) {
    const invocationError = new Error(error.message || 'Unable to generate mandate from template right now.')
    invocationError.code = String(error.code || 'EDGE_INVOCATION_FAILED')
    invocationError.details = error.details || null
    throw invocationError
  }

  if (!data || data.success === false) {
    const edgeError = new Error(
      String(data?.error || data?.message || 'Unable to generate mandate from template right now.'),
    )
    edgeError.code = String(data?.errorCode || data?.error_code || 'EDGE_FUNCTION_FAILED')
    edgeError.details = data || null
    throw edgeError
  }

  return normalizeDocumentGenerationResponseContract(data, { packetId: payload.packetId })
}
