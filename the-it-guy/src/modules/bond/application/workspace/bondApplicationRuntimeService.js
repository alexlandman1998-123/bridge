import { buildBondApplicationState, toLegacyBondApplication } from '../legacy/bondApplicationLegacyAdapter.js'
import { buildNormalizedBondApplicationFromState, mergeParticipantSectionsToParticipant } from '../participants/bondApplicationParticipantDomain.js'
import { buildBondApplicationDocumentChecklist, resolveBondApplicationDocumentRequirements } from '../documents/index.js'
import { buildBondApplicationDeclarationEvidence, buildBondApplicationSubmissionSnapshot, resolveBondApplicationDeclarations, resolveBondApplicationSignerIdentity, validateBondApplicationSubmissionReadiness } from '../submission/index.js'
import { canonicalizeBondApplicationSnapshot, hashBondApplicationSnapshot } from '../submission/bondApplicationSnapshotHash.js'
import { sealBondReviewedVersion } from '../submission/bondApplicationReviewedVersion.js'

async function rpc(client, name, args) {
  const result = await client.rpc(name, args)
  if (result.error) throw result.error
  if (!result.data) throw new Error('The application service returned no result. Please retry.')
  return result.data
}

export function buildBuyerBondApplicationRuntimeState(context, { hydrate = true } = {}) {
  const state = buildBondApplicationState({ transaction: { id: context.application.transactionId }, onboardingFormData: { formData: { bond_application: context.draft || {} } } })
  state.application.transactionId = context.application.transactionId
  if (!hydrate) return state
  const shared = context.sharedSections || {}
  const mappings = { application_finance: 'finance', buyer_entity: 'buyerEntity', selected_banks: 'selectedBankIds', shared_property_summary: 'property', pre_approval: 'preApproval' }
  for (const [key, field] of Object.entries(mappings)) {
    if (Object.hasOwn(shared, key)) state.application[field] = shared[key]
  }
  state.application.intent = shared.application_intent?.intent || state.application.intent
  state.application.applicantStructure = shared.applicant_structure?.applicantStructure || state.application.applicantStructure
  state.application.requiresSurety = shared.applicant_structure?.requiresSurety || state.application.requiresSurety
  state.participants.primaryApplicant = mergeParticipantSectionsToParticipant(context.primarySections || {}, state.participants.primaryApplicant)
  // Reinterpret the persisted answers with the same conditional rules as the UI.
  return buildBondApplicationState({ transaction: { id: context.application.transactionId }, onboardingFormData: { formData: { bond_application: toLegacyBondApplication(state) } } })
}

export function createBuyerBondApplicationRuntimeService({ client, validateFile, randomUUID = () => globalThis.crypto.randomUUID() }) {
  const load = async () => {
    const context = await rpc(client, 'bridge_buyer_bond_application_runtime_context')
    return { ...context, draft: toLegacyBondApplication(buildBuyerBondApplicationRuntimeState(context)) }
  }
  return {
    load,
    async save({ draft, expectedRevision }) {
      const context = await load()
      const state = buildBuyerBondApplicationRuntimeState({ ...context, draft }, { hydrate: false })
      const normalized = buildNormalizedBondApplicationFromState({ applicationState: state })
      delete normalized.sharedSections.pre_approval
      const primary = normalized.participants.find((participant) => participant.role === 'primary_applicant')
      return rpc(client, 'bridge_save_buyer_bond_application_draft', {
        p_draft: draft,
        p_expected_revision: expectedRevision,
        p_shared_sections: normalized.sharedSections,
        p_primary_sections: normalized.participantSections[primary.participantKey],
      })
    },
    reconcile: ({ requirements = [] }) => rpc(client, 'bridge_reconcile_buyer_bond_application_documents', { p_requirements: requirements }),
    async upload({ requirementKey, file }) {
      if (!file) throw new Error('Choose a file to upload.')
      const policy = validateFile(file)
      const context = await load()
      const path = `client-portal/${context.application.transactionId}/${context.application.id}/${randomUUID()}-${policy.safeName}`
      const uploaded = await client.storage.from('documents').upload(path, file, { upsert: false, contentType: policy.mimeType || file.type })
      if (uploaded.error) throw uploaded.error
      // A metadata failure never reports success. The unique object can be
      // retried through a fresh upload without overwriting another submission.
      try {
        const document = await rpc(client, 'bridge_upload_buyer_bond_application_document', { p_requirement_key: requirementKey, p_path: path, p_name: policy.safeName })
        return { ok: true, document }
      } catch (error) {
        try { await client.storage.from('documents').remove?.([path]) } catch { /* Preserve the original metadata error. */ }
        throw error
      }
    },
    async submit({ declarationValues = {}, signatureEvidence = {}, expectedRevision }) {
      const context = await load()
      if (context.application.status === 'submitted' && context.submission) return { submission: context.submission }
      if (context.application.revision !== expectedRevision) throw new Error('The application changed elsewhere. Refresh and review it again.')
      const state = buildBuyerBondApplicationRuntimeState(context)
      state.application.signatureEvidence = signatureEvidence
      const resolved = resolveBondApplicationDocumentRequirements({ applicationState: state })
      const activeRequirements = [...resolved.activeRequirements, ...(context.additionalRequirements || []).filter((item) => !resolved.activeRequirements.some((rule) => rule.key === item.key))]
      const checklist = buildBondApplicationDocumentChecklist({ activeRequirements, existingRequiredDocuments: context.requiredDocuments, existingDocuments: context.documents })
      const declarations = resolveBondApplicationDeclarations({ applicationState: state })
      const signer = resolveBondApplicationSignerIdentity(state)
      const readiness = validateBondApplicationSubmissionReadiness({ applicationState: state, documentChecklist: checklist, declarations, declarationValues, signerIdentity: signer, latestSaveStatus: 'saved' })
      if (!readiness.ready) {
        const error = new Error('Complete the required details and documents before signing.')
        error.issues = readiness.issues
        throw error
      }
      const sourceHash = await hashBondApplicationSnapshot(context.draft)
      const snapshot = buildBondApplicationSubmissionSnapshot({ applicationState: state, transaction: context.transaction, submissionVersion: Number(context.submission?.submission_version || 0) + 1, declarations: buildBondApplicationDeclarationEvidence({ declarations, values: declarationValues, selectedBankIds: state.application.selectedBankIds }), documentChecklist: checklist, signerIdentity: signer, signatureEvidence, source: { sourceHash, sourceRevision: expectedRevision } })
      const reviewedSnapshot = await sealBondReviewedVersion(snapshot)
      return rpc(client, 'bridge_submit_buyer_bond_application', { p_revision: expectedRevision, p_snapshot_canonical: canonicalizeBondApplicationSnapshot(reviewedSnapshot) })
    },
    async refreshSubmission() { return { submission: (await load()).submission || null } },
    cancel: ({ submissionId }) => rpc(client, 'bridge_cancel_buyer_bond_application_submission', { p_submission_id: submissionId }),
  }
}
