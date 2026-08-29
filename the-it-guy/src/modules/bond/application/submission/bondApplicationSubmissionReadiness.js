import { validateBondApplicationSteps } from '../flow/bondApplicationScreenValidation.js'
import { calculateBondApplicationDocumentProgress } from '../documents/bondApplicationDocumentProgress.js'
import { BOND_APPLICATION_INTENTS } from '../bondApplicationState.js'
import { validateBondApplicationDeclarationAcceptance } from './bondApplicationDeclarations.js'
import { BOND_APPLICATION_SUBMISSION_STATUSES } from './bondApplicationSubmissionLifecycle.js'

function present(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length > 0
  return String(value || '').trim().length > 0
}

function issue({ category, code, message, stepKey = null, screenKey = null, path = null, target = null }) {
  return { category, code, message, stepKey, screenKey, path, target }
}

function isPreApprovalOnlyApplication(applicationState = {}) {
  return String(applicationState?.application?.intent || '').trim().toLowerCase() === BOND_APPLICATION_INTENTS.preApproval
}

export function resolveBondApplicationSignerIdentity(applicationState = {}) {
  const applicant = applicationState?.participants?.primaryApplicant || {}
  const personal = applicant.personal || {}
  const contact = applicant.contact || {}
  const fullName = [personal.first_name || personal.firstName, personal.surname || personal.last_name || personal.lastName]
    .filter(Boolean)
    .join(' ')
    .trim()
  return {
    participantRole: 'primary_applicant',
    fullName,
    identityReference: personal.identity_number || personal.id_number || personal.passport_number || '',
    email: contact.email || personal.email || '',
    phone: contact.phone || personal.phone || '',
    required: true,
  }
}

export function resolveBondApplicationSignerIdentities(applicationState = {}) {
  const primary = resolveBondApplicationSignerIdentity(applicationState)
  const signers = [primary]
  const coApplicant = applicationState?.participants?.coApplicant || null
  if (coApplicant) {
    const personal = coApplicant.personal || {}
    const contact = coApplicant.contact || {}
    const fullName = [personal.first_name || personal.firstName, personal.surname || personal.last_name || personal.lastName]
      .filter(Boolean)
      .join(' ')
      .trim()
    signers.push({
      participantRole: 'co_applicant',
      fullName,
      identityReference: personal.identity_number || personal.id_number || personal.passport_number || '',
      email: contact.email || personal.email || '',
      phone: contact.phone || personal.phone || '',
      required: true,
    })
  }
  const sureties = Array.isArray(applicationState?.participants?.sureties) ? applicationState.participants.sureties : []
  sureties.forEach((surety, index) => {
    const personal = surety.personal || {}
    const contact = surety.contact || {}
    const fullName = [personal.first_name || personal.firstName, personal.surname || personal.last_name || personal.lastName]
      .filter(Boolean)
      .join(' ')
      .trim()
    signers.push({
      participantRole: 'surety',
      participantKey: surety.participantKey || `surety:${index + 1}`,
      fullName,
      identityReference: personal.identity_number || personal.id_number || personal.passport_number || '',
      email: contact.email || personal.email || '',
      phone: contact.phone || personal.phone || '',
      required: true,
    })
  })
  return signers
}

export function validateBondApplicationSubmissionReadiness({
  applicationState = {},
  documentChecklist = {},
  selectedBankIds = applicationState?.application?.selectedBankIds || [],
  signerIdentity = resolveBondApplicationSignerIdentity(applicationState),
  declarations = [],
  declarationValues = {},
  latestSaveStatus = 'saved',
  submission = null,
  requireSelectedBank = !isPreApprovalOnlyApplication(applicationState),
  participantReadiness = [],
  reviewContextHash = null,
} = {}) {
  const issues = []
  const interpretationIssues = Array.isArray(applicationState?.interpretation?.blockingIssues)
    ? applicationState.interpretation.blockingIssues
    : []
  interpretationIssues.forEach((item) => {
    issues.push(issue({
      category: 'interpretation',
      code: item.code || 'interpretation_blocker',
      message: item.message || 'Review this application value before submission.',
      path: item.path || null,
      target: item.rawValue ?? null,
    }))
  })
  const requirementProfileIssues = Array.isArray(applicationState?.requirementProfile?.blockingIssues)
    ? applicationState.requirementProfile.blockingIssues
    : []
  requirementProfileIssues.forEach((item) => {
    issues.push(issue({
      category: 'requirement_profile',
      code: item.code || 'requirement_profile_blocker',
      message: item.message || 'Resolve the originator requirement profile before submission.',
      target: applicationState?.requirementProfile?.identity?.company || null,
    }))
  })
  const participantEntityIssues = Array.isArray(applicationState?.participantEntityCompleteness?.blockingIssues)
    ? applicationState.participantEntityCompleteness.blockingIssues
    : []
  participantEntityIssues.forEach((item) => {
    issues.push(issue({
      category: 'participant_entity',
      code: item.code || 'participant_entity_incomplete',
      message: item.message || 'Complete the participant or purchaser entity information.',
      path: item.path || null,
      target: item.target || null,
    }))
  })
  const answerValidation = validateBondApplicationSteps({ applicationState, throughStepOrder: 6 })
  answerValidation.issues.forEach((item) => {
    issues.push(issue({
      category: 'application',
      code: item.code || 'required',
      message: item.message || 'Complete this application answer.',
      path: item.path || null,
      screenKey: item.screenKey || null,
    }))
  })

  const documentProgress = calculateBondApplicationDocumentProgress(documentChecklist)
  documentProgress.blockingMissing.forEach((item) => {
    issues.push(issue({
      category: 'documents',
      code: 'blocking_document_missing',
      message: `${item.requirement?.title || 'A required document'} is needed before signing.`,
      stepKey: 'documents',
      screenKey: 'document_checklist',
      target: item.requirement?.key || null,
    }))
  })

  if (requireSelectedBank && (!Array.isArray(selectedBankIds) || selectedBankIds.length === 0)) {
    issues.push(issue({
      category: 'banks',
      code: 'selected_bank_required',
      message: 'Select at least one bank for the application.',
      stepKey: 'your_application',
      screenKey: 'application_confirmation',
      path: 'application.selectedBankIds',
    }))
  }

  const signerIdentities = Array.isArray(signerIdentity) ? signerIdentity : [signerIdentity]
  signerIdentities.forEach((identity) => {
    const roleLabel = identity?.participantRole === 'co_applicant'
      ? 'co-applicant'
      : identity?.participantRole === 'surety'
        ? 'surety'
        : 'primary applicant'
    const pathPrefix = identity?.participantRole === 'co_applicant'
      ? 'participants.coApplicant'
      : identity?.participantRole === 'surety'
        ? 'participants.sureties'
        : 'participants.primaryApplicant'
    if (!present(identity?.fullName)) {
      issues.push(issue({
        category: 'signer',
        code: 'signer_name_required',
        message: `Add the ${roleLabel} name before signing.`,
        stepKey: 'about_you',
        screenKey: 'about_you_edit',
        path: `${pathPrefix}.personal.first_name`,
      }))
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(identity?.email || '').trim())) {
      issues.push(issue({
        category: 'signer',
        code: 'signer_email_required',
        message: `Add a valid email address for the ${roleLabel}.`,
        stepKey: 'about_you',
        screenKey: 'about_you_edit',
        path: `${pathPrefix}.contact.email`,
      }))
    }
  })

  participantReadiness.forEach((participant) => {
    if (!participant?.required) return
    if (!participant.ready) {
      issues.push(issue({
        category: 'participants',
        code: 'participant_not_ready',
        message: participant.role === 'co_applicant'
          ? 'Your co-applicant still needs to complete their application details.'
          : 'The primary applicant still needs to complete their application details.',
        target: participant.participantKey || participant.role || null,
      }))
    }
    if (reviewContextHash && participant.reviewContextHash && participant.reviewContextHash !== reviewContextHash) {
      issues.push(issue({
        category: 'participants',
        code: 'stale_participant_readiness',
        message: 'Some application details changed. Please review your information again before signing.',
        target: participant.participantKey || participant.role || null,
      }))
    }
  })

  validateBondApplicationDeclarationAcceptance({
    declarations,
    values: declarationValues,
    participantRole: signerIdentities.some((identity) => identity?.participantRole === 'surety') ? 'surety' : 'primary_applicant',
  }).issues.forEach((item) => {
    issues.push(issue({
      category: 'declarations',
      code: item.code,
      message: item.message,
      stepKey: 'review_sign',
      screenKey: 'declarations',
      target: item.declarationKey,
    }))
  })

  if (latestSaveStatus !== 'saved') {
    issues.push(issue({
      category: 'save',
      code: 'unsaved_changes',
      message: 'Save the latest application changes before signing.',
    }))
  }

  const status = String(submission?.status || '').trim().toLowerCase()
  if (status === BOND_APPLICATION_SUBMISSION_STATUSES.awaitingSignature) {
    issues.push(issue({
      category: 'status',
      code: 'active_signature_request',
      message: 'This application is already awaiting signature.',
      stepKey: 'review_sign',
      screenKey: 'awaiting_signature',
    }))
  }
  if (status === BOND_APPLICATION_SUBMISSION_STATUSES.submitted || applicationState?.meta?.submittedAt) {
    issues.push(issue({
      category: 'status',
      code: 'already_submitted',
      message: 'This application has already been submitted.',
      stepKey: 'review_sign',
      screenKey: 'submitted_status',
    }))
  }

  return {
    ready: issues.length === 0,
    issues,
    documentProgress,
    signerIdentity: Array.isArray(signerIdentity) ? signerIdentity : signerIdentity,
  }
}
