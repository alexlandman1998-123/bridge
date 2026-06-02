import { requireClient } from '../../src/services/attorneyFirmServiceShared.js'
import { attachWorkflowEvidence } from './transactionWorkflowModelService.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function isUnsupportedEvidenceTypeError(error = {}) {
  const message = normalizeKey(error?.message || error?.details || error?.hint)
  return (
    error?.code === '23514' ||
    message.includes('transaction_workflow_evidence_type_check') ||
    (message.includes('evidence_type') && message.includes('check constraint'))
  )
}

export function mapEvidenceStatusToRecordStatus(status = '') {
  const normalizedStatus = normalizeKey(status)
  if (['approved', 'verified', 'completed', 'complete', 'received', 'submitted', 'lodged', 'confirmed', 'sent'].includes(normalizedStatus)) {
    return 'accepted'
  }
  if (['rejected', 'declined', 'blocked'].includes(normalizedStatus)) {
    return 'rejected'
  }
  if (['removed', 'expired', 'reopened', 'waived'].includes(normalizedStatus)) {
    return 'superseded'
  }
  return 'observed'
}

function fallbackEvidenceTypes(evidenceType = '') {
  const normalizedType = normalizeKey(evidenceType)
  if (normalizedType === 'onboarding') return ['onboarding', 'event']
  if (normalizedType === 'external_status') return ['external_status', 'event']
  return [normalizedType || 'manual_override']
}

export async function writeWorkflowEvidence(transactionId, step = {}, evidence = {}, options = {}) {
  const client = options.client || requireClient()
  const candidateTypes = fallbackEvidenceTypes(evidence.evidenceType)
  let lastError = null

  for (const evidenceType of candidateTypes) {
    try {
      return await attachWorkflowEvidence(
        transactionId,
        step.id,
        {
          workflowKey: step.workflow_key || evidence.workflowKey || '',
          stepKey: step.step_key || evidence.stepKey || '',
          evidenceType,
          evidenceId: normalizeText(evidence.evidenceId) || `${evidenceType}:${step.step_key || step.id || 'step'}`,
          evidenceStatus: evidence.evidenceStatus || mapEvidenceStatusToRecordStatus(evidence.status),
        },
        { client },
      )
    } catch (error) {
      lastError = error
      if (!isUnsupportedEvidenceTypeError(error) || evidenceType === candidateTypes[candidateTypes.length - 1]) {
        throw error
      }
    }
  }

  if (lastError) throw lastError
  return null
}

