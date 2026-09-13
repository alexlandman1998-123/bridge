import { mergeParticipantSectionsToParticipant } from '../participants/bondApplicationParticipantDomain.js'
import { buildBondApplicationParticipantEntityCompleteness } from '../participants/bondApplicationParticipantEntityCompleteness.js'
import { validateBondApplicationSteps } from '../flow/bondApplicationScreenValidation.js'
import { resolveBondApplicationDocumentRequirements } from '../documents/resolveBondApplicationDocumentRequirements.js'
import { buildBondApplicationDocumentChecklist } from '../documents/buildBondApplicationDocumentChecklist.js'
import { calculateBondApplicationDocumentProgress } from '../documents/bondApplicationDocumentProgress.js'
import { BOND_APPLICATION_INTENTS } from '../bondApplicationState.js'
import { resolveBondApplicationDeclarations, validateBondApplicationDeclarationAcceptance } from './bondApplicationDeclarations.js'
import { buildBondApplicationSubmissionSnapshot } from './buildBondApplicationSubmissionSnapshot.js'
import { canonicalizeBondApplicationSnapshot } from './bondApplicationSnapshotHash.js'
import { BOND_APPLICATION_DOCUMENT_TIMING } from '../documents/bondApplicationDocumentRules.js'
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
  documentChecklist = null,
  selectedBankIds = applicationState?.application?.selectedBankIds || [],
  signerIdentity = resolveBondApplicationSignerIdentity(applicationState),
  declarations = resolveBondApplicationDeclarations({ applicationState }),
  declarationValues = {},
  latestSaveStatus = 'saved',
  submission = null,
  requireSelectedBank = !isPreApprovalOnlyApplication(applicationState),
  participantReadiness = [],
  reviewContextHash = null,
  stage = 'signature',
} = {}) {
  const issues = []
  if (!['signature', 'bank_submission'].includes(stage)) throw new Error('Unknown bond readiness stage.')
  const bankSubmission = stage === 'bank_submission'
  documentChecklist ||= buildBondApplicationDocumentChecklist({ activeRequirements: resolveBondApplicationDocumentRequirements({ applicationState, includeAllParticipants: bankSubmission }).activeRequirements })
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
  const participantEntityIssues = buildBondApplicationParticipantEntityCompleteness(applicationState).blockingIssues
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

  // Final submission validates every participant using the same visible question rules.
  if (bankSubmission) {
    const others = [
      ...(applicationState.participants?.coApplicant ? [{ participant: applicationState.participants.coApplicant, path: 'participants.coApplicant' }] : []),
      ...(applicationState.participants?.sureties || []).map((participant, index) => ({ participant, path: `participants.sureties.${index}` })),
    ]
    for (const { participant, path } of others) {
      const projected = { ...applicationState, participants: { ...applicationState.participants, primaryApplicant: participant } }
      for (const item of validateBondApplicationSteps({ applicationState: projected, throughStepOrder: 6 }).issues) {
        if (!item.path?.startsWith('participants.primaryApplicant')) continue
        issues.push(issue({ category: 'application', code: item.code, message: `${path === 'participants.coApplicant' ? 'Co-applicant' : 'Surety'}: ${item.message}`, path: item.path.replace('participants.primaryApplicant', path) }))
      }
    }
  }

  const documentProgress = calculateBondApplicationDocumentProgress(documentChecklist)
  // Applicants may sign first and return to the portal to upload supporting evidence.
  // Documents remain mandatory before the originator submits to a bank.
  const documentBlockers = bankSubmission
    ? (documentChecklist.items || []).filter((item) => item.requirement?.required && item.requirement?.active !== false &&
      item.requirement.requiredBefore !== BOND_APPLICATION_DOCUMENT_TIMING.requestedAfterOriginatorReview && !item.complete)
    : []
  documentBlockers.forEach((item) => {
    issues.push(issue({
      category: 'documents',
      code: 'blocking_document_missing',
      message: `${item.requirement?.title || 'A required document'} is needed before bank submission.`,
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

  if (!bankSubmission) validateBondApplicationDeclarationAcceptance({
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
  if (!bankSubmission && status === BOND_APPLICATION_SUBMISSION_STATUSES.awaitingSignature) {
    issues.push(issue({
      category: 'status',
      code: 'active_signature_request',
      message: 'This application is already awaiting signature.',
      stepKey: 'review_sign',
      screenKey: 'awaiting_signature',
    }))
  }
  if (!bankSubmission && (status === BOND_APPLICATION_SUBMISSION_STATUSES.submitted || applicationState?.meta?.submittedAt)) {
    issues.push(issue({
      category: 'status',
      code: 'already_submitted',
      message: 'This application has already been submitted.',
      stepKey: 'review_sign',
      screenKey: 'submitted_status',
    }))
  }

  if (bankSubmission) {
    const snapshot = submission?.snapshot_json || submission?.snapshot || {}
    const current = buildBondApplicationSubmissionSnapshot({ applicationState })
    const comparable = (value) => ({
      transactionId: value.transaction?.id || value.application?.transactionId,
      intent: value.applicationIntent || 'bond_application',
      property: value.property || value.shared?.property,
      purchaserEntity: value.purchaserEntity || value.shared?.purchaserEntity,
      finance: value.finance || value.shared?.finance,
      selectedBanks: value.selectedBanks,
      participants: value.participants?.map((participant) => ({
        role: participant.participantRole || participant.role,
        answers: participant.answers?.personal_contact ? buildBondApplicationSubmissionSnapshot({ applicationState: { participants: { primaryApplicant: mergeParticipantSectionsToParticipant(participant.answers) } } }).participants[0].answers : participant.answers,
      })),
    })
    if (!['signed', 'submitted'].includes(status) || !(submission?.signed_at || submission?.signedAt)) {
      issues.push(issue({ category: 'signatures', code: 'signatures_required', message: 'Complete all required signatures before bank submission.' }))
    }
    if (!(snapshot.transaction?.id || snapshot.application?.transactionId) || canonicalizeBondApplicationSnapshot(comparable(snapshot)) !== canonicalizeBondApplicationSnapshot(comparable(current))) {
      issues.push(issue({ category: 'signatures', code: 'signed_version_not_current', message: 'Review and sign the current application version before bank submission.' }))
    }
    const manifest = submission?.signer_manifest_json || snapshot.signerManifest || []
    for (const identity of resolveBondApplicationSignerIdentities(applicationState)) {
      const signer = manifest.find((item) => item.participantRole === identity.participantRole &&
        (identity.participantRole !== 'surety' || item.participantKey === identity.participantKey) &&
        String(item.email || '').toLowerCase() === String(identity.email || '').toLowerCase())
      if (!signer) issues.push(issue({ category: 'signatures', code: 'required_signer_missing', message: `The signed version must include the ${identity.participantRole.replaceAll('_', ' ')}.`, target: identity.participantKey || identity.participantRole }))
      const requiredDeclarations = resolveBondApplicationDeclarations({ applicationState, participantRole: identity.participantRole })
      const evidence = submission?.declarations_json || snapshot.declarations || []
      const values = Object.fromEntries(requiredDeclarations.map((declaration) => [declaration.key,
        evidence.some((item) => item.key === declaration.key && item.version === declaration.version && item.accepted === true && item.acceptedAt &&
          item.participantRole === identity.participantRole &&
          (identity.participantRole !== 'surety' || item.participantKey === identity.participantKey)),
      ]))
      for (const item of validateBondApplicationDeclarationAcceptance({ declarations: requiredDeclarations, values, participantRole: identity.participantRole }).issues) {
        issues.push(issue({ category: 'declarations', code: item.code, message: item.message, target: identity.participantKey || identity.participantRole }))
      }
    }
  }
  const hasApplicationIssues = issues.some((item) => !['documents', 'signatures', 'status', 'declarations'].includes(item.category))
  const readinessStatus = issues.length === 0 ? (bankSubmission ? 'ready_for_submission' : 'ready_to_sign')
    : hasApplicationIssues ? 'draft' : 'awaiting_documents_or_signatures'
  const label = { draft: 'Draft', awaiting_documents_or_signatures: 'Awaiting documents / signatures', ready_to_sign: 'Ready to sign', ready_for_submission: 'Ready for submission' }[readinessStatus]

  return {
    ready: issues.length === 0,
    stage,
    status: readinessStatus,
    label,
    issues,
    documentProgress,
    signerIdentity: Array.isArray(signerIdentity) ? signerIdentity : signerIdentity,
  }
}
