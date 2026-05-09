const STAGE_CONTENT = {
  onboarding: {
    stageKey: 'onboarding',
    title: 'Onboarding',
    shortDescription: 'We are collecting your core transaction details and compliance information.',
    detailedExplanation:
      'This step helps your team verify identity, legal details, and transaction information before legal and finance milestones continue.',
    whatClientNeedsToDo: 'Complete your onboarding information and submit any requested documents.',
    whatHappensNext: 'Your team reviews your details and prepares the next legal and finance steps.',
    commonQuestions: ['Why is onboarding required?', 'Can I edit onboarding later?'],
    estimatedTimeline: 'Usually within 1-3 business days after submission.',
    relatedDocuments: ['proof_of_address', 'id_document', 'fica_declaration'],
  },
  mandate: {
    stageKey: 'mandate',
    title: 'Mandate',
    shortDescription: 'Your mandate authorises the listing process to move forward.',
    detailedExplanation:
      'The mandate sets out listing authority and terms. It must be reviewed and signed before market activation.',
    whatClientNeedsToDo: 'Review and sign the mandate if requested.',
    whatHappensNext: 'Once signed, the listing can proceed toward active marketing.',
    commonQuestions: ['What does the mandate include?', 'Can the mandate be updated?'],
    estimatedTimeline: 'Usually 1-2 business days after signing.',
    relatedDocuments: ['mandate', 'seller_authority'],
  },
  otp: {
    stageKey: 'otp',
    title: 'Offer To Purchase (OTP)',
    shortDescription: 'The sale terms are being finalised for signature.',
    detailedExplanation:
      'The OTP is the primary agreement capturing the agreed sale terms between parties.',
    whatClientNeedsToDo: 'Sign the OTP when prompted and upload any supporting items.',
    whatHappensNext: 'The signed agreement moves into finance and transfer preparation.',
    commonQuestions: ['What is OTP?', 'Who signs first?'],
    estimatedTimeline: 'Typically same day to a few days depending on parties.',
    relatedDocuments: ['otp', 'signed_otp'],
  },
  finance: {
    stageKey: 'finance',
    title: 'Finance',
    shortDescription: 'Finance documents are being assessed and lender processes are underway.',
    detailedExplanation:
      'Your finance team and lenders use this stage to assess affordability and issue funding outcomes.',
    whatClientNeedsToDo: 'Upload any outstanding finance documents and respond to requests quickly.',
    whatHappensNext: 'Approved finance proceeds to legal transfer milestones.',
    commonQuestions: ['Why are bank statements required?', 'How long does approval take?'],
    estimatedTimeline: 'Often 5-15 business days depending on lenders.',
    relatedDocuments: ['proof_of_funds', 'bank_statements', 'payslips', 'bond_application'],
  },
  bond_application: {
    stageKey: 'bond_application',
    title: 'Bond Application',
    shortDescription: 'Your finance application details are being prepared and submitted.',
    detailedExplanation:
      'This includes personal/business affordability details and bank submission packs.',
    whatClientNeedsToDo: 'Complete bond form sections and upload requested financial documents.',
    whatHappensNext: 'Banks review the application and return outcomes or conditions.',
    commonQuestions: ['Can I apply to multiple banks?', 'What if details change?'],
    estimatedTimeline: 'Usually 3-10 business days to initial outcomes.',
    relatedDocuments: ['bond_application', 'income_documents', 'bank_statements'],
  },
  bond_approval: {
    stageKey: 'bond_approval',
    title: 'Bond Approval',
    shortDescription: 'Lenders are issuing approvals, conditions, or updated requests.',
    detailedExplanation:
      'This stage confirms whether finance has been granted and what conditions must still be met.',
    whatClientNeedsToDo: 'Review offers, sign accepted offer documents, and provide any final documents.',
    whatHappensNext: 'Approved finance moves into legal transfer preparation.',
    commonQuestions: ['What happens after approval?', 'Can I change my selected offer?'],
    estimatedTimeline: 'Typically 2-7 business days after full submission.',
    relatedDocuments: ['bond_offer', 'signed_bond_offer', 'bond_grant'],
  },
  attorney_preparation: {
    stageKey: 'attorney_preparation',
    title: 'Attorney Preparation',
    shortDescription: 'The attorneys are preparing transfer documentation.',
    detailedExplanation:
      'Legal teams verify records, prepare transfer packs, and coordinate prerequisites for lodgement.',
    whatClientNeedsToDo: 'No action unless additional legal documents are requested.',
    whatHappensNext: 'The transfer file proceeds to guarantees and lodgement.',
    commonQuestions: ['What are attorneys doing now?', 'Why is this taking time?'],
    estimatedTimeline: 'Commonly 5-20 business days depending on dependencies.',
    relatedDocuments: ['attorney_requests', 'compliance_documents'],
  },
  guarantees: {
    stageKey: 'guarantees',
    title: 'Guarantees',
    shortDescription: 'Guarantee and financial settlement conditions are being finalised.',
    detailedExplanation:
      'Banks and legal teams align guarantees and payment assurances required for transfer progression.',
    whatClientNeedsToDo: 'Provide any final proof-of-funds or finance confirmations if requested.',
    whatHappensNext: 'Once complete, the matter proceeds to lodgement or registration steps.',
    commonQuestions: ['What are guarantees?', 'Do I need to do anything now?'],
    estimatedTimeline: 'Typically 2-10 business days.',
    relatedDocuments: ['guarantee_documents', 'proof_of_funds'],
  },
  lodgement: {
    stageKey: 'lodgement',
    title: 'Lodgement',
    shortDescription: 'Your documents have been submitted to the Deeds Office.',
    detailedExplanation:
      'At this stage, attorneys completed legal preparation and submitted transfer documents for Deeds Office processing.',
    whatClientNeedsToDo: 'No action is required unless additional documents are requested.',
    whatHappensNext: 'The Deeds Office reviews lodged documents before registration.',
    commonQuestions: ['How long does lodgement take?', 'Can this be expedited?'],
    estimatedTimeline: 'Often 7-15 business days depending on the Deeds Office.',
    relatedDocuments: ['lodgement_pack', 'registration_docs'],
  },
  registration: {
    stageKey: 'registration',
    title: 'Registration',
    shortDescription: 'Legal registration is being completed or finalized.',
    detailedExplanation:
      'This stage confirms ownership transfer registration and close-out steps.',
    whatClientNeedsToDo: 'No action is usually needed unless your team requests a final item.',
    whatHappensNext: 'The process moves toward final handover and completion.',
    commonQuestions: ['When is transfer complete?', 'What confirmation will I receive?'],
    estimatedTimeline: 'Usually within a few business days after successful registration.',
    relatedDocuments: ['registration_confirmation'],
  },
  handover: {
    stageKey: 'handover',
    title: 'Handover',
    shortDescription: 'Final readiness checks and possession coordination are underway.',
    detailedExplanation:
      'Handover confirms practical completion, keys, meter readings, and close-out readiness.',
    whatClientNeedsToDo: 'Complete handover checklist items and confirm date/time where requested.',
    whatHappensNext: 'Once completed, your transaction moves into final completion records.',
    commonQuestions: ['What should I bring to handover?', 'What if a snag remains open?'],
    estimatedTimeline: 'Usually scheduled shortly after registration readiness.',
    relatedDocuments: ['handover_pack', 'occupancy_certificate'],
  },
}

const DOCUMENT_EXPLANATIONS = [
  { match: /proof.?of.?address|utility/i, key: 'proof_of_address', title: 'Proof of Address', explanation: 'This is required for FICA verification.' },
  { match: /id|passport/i, key: 'id_document', title: 'Identity Document', explanation: 'This confirms the legal identity of the transacting party.' },
  { match: /trust deed/i, key: 'trust_deed', title: 'Trust Deed', explanation: 'This confirms the legal structure and trustees of the trust.' },
  { match: /levy/i, key: 'levy_statement', title: 'Levy Statement', explanation: 'This helps confirm the current levy position of the property.' },
  { match: /bond statement/i, key: 'bond_statement', title: 'Bond Statement', explanation: 'This helps attorneys prepare bond cancellation or finance checks.' },
  { match: /otp|offer to purchase/i, key: 'otp', title: 'Offer To Purchase', explanation: 'This is the agreement setting out the terms of the sale.' },
  { match: /mandate/i, key: 'mandate', title: 'Mandate', explanation: 'This records authority and terms for the listing process.' },
  { match: /bank statement/i, key: 'bank_statement', title: 'Bank Statements', explanation: 'These support finance and affordability assessment.' },
]

const ACTION_EXPLANATIONS = {
  onboarding_required: 'This step ensures your transaction details are complete and compliant.',
  document_upload_required: 'This upload is needed before your transaction can move forward.',
  document_reupload_required: 'Please upload a corrected version so the team can continue.',
  additional_document_requested: 'A role player requested an extra document for progress.',
  mandate_signature_required: 'Your mandate signature is required before listing progression.',
  otp_signature_required: 'Your OTP signature is required to progress to next milestones.',
  proof_of_funds_required: 'Proof of funds is required for finance and compliance checks.',
  finance_document_required: 'Finance documents are required for lender or affordability review.',
  bond_document_required: 'Bond documentation is needed to progress your finance lane.',
  awaiting_internal_review: 'Your team is reviewing submitted documents and progress.',
  awaiting_other_party: 'Another party needs to complete their part before this can move forward.',
  informational: 'No action is required right now. Your team is progressing this step.',
}

const ROLE_EXPLANATIONS = {
  agent: 'Your agent coordinates the deal process, updates, and communications.',
  developer: 'The developer coordinates stock, handover, and project-side readiness.',
  attorney: 'The attorney/conveyancer manages legal transfer preparation and lodgement.',
  conveyancer: 'The conveyancer manages legal transfer preparation and lodgement.',
  bond_originator: 'A bond originator helps submit your finance application to banks.',
  bank: 'The bank reviews finance applications and issues outcomes or conditions.',
  buyer: 'The buyer provides onboarding, documents, and signatures for purchase.',
  seller: 'The seller provides mandate, ownership, and property-side documentation.',
}

const GLOSSARY = [
  { key: 'fica', term: 'FICA', explanation: 'South African identity and address compliance verification.' },
  { key: 'otp', term: 'OTP', explanation: 'Offer To Purchase agreement between buyer and seller.' },
  { key: 'guarantees', term: 'Guarantees', explanation: 'Financial undertakings supporting the transfer process.' },
  { key: 'lodgement', term: 'Lodgement', explanation: 'Submission of transfer documents to the Deeds Office.' },
  { key: 'registration', term: 'Registration', explanation: 'Final legal recording of ownership transfer.' },
  { key: 'bond', term: 'Bond', explanation: 'Home loan finance approved by a lender.' },
  { key: 'levy', term: 'Levy', explanation: 'Monthly scheme contribution for sectional title properties.' },
  { key: 'body_corporate', term: 'Body Corporate', explanation: 'Management body for sectional title schemes.' },
  { key: 'hoa', term: 'HOA', explanation: 'Homeowners association managing estate rules and levies.' },
  { key: 'trust_deed', term: 'Trust Deed', explanation: 'Founding legal document of a trust.' },
  { key: 'anc', term: 'ANC', explanation: 'Antenuptial contract defining marital property regime.' },
  { key: 'rates_clearance', term: 'Rates Clearance', explanation: 'Municipal confirmation required for transfer.' },
]

function normalize(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function resolvePortalStageKey({ mainStage = '', stage = '', financeType = '', workspace = '' } = {}) {
  const normalizedMain = normalize(mainStage)
  const normalizedStage = normalize(stage)
  const normalizedFinance = normalize(financeType)
  const normalizedWorkspace = normalize(workspace)

  if (normalizedWorkspace === 'selling' && normalizedStage.includes('mandate')) return 'mandate'
  if (normalizedMain === 'otp' || normalizedStage.includes('otp')) return 'otp'
  if (normalizedMain === 'fin') {
    if (normalizedFinance === 'bond' || normalizedFinance === 'hybrid' || normalizedFinance === 'combination') {
      return 'bond_application'
    }
    return 'finance'
  }
  if (normalizedMain === 'atty') return 'attorney_preparation'
  if (normalizedMain === 'xfer') return 'lodgement'
  if (normalizedMain === 'reg') return 'registration'
  if (normalizedStage.includes('handover')) return 'handover'
  if (normalizedStage.includes('onboarding')) return 'onboarding'
  return 'onboarding'
}

export function getEducationalContentForStage(stageKey = '') {
  const key = normalize(stageKey)
  return (
    STAGE_CONTENT[key] || {
      stageKey: key || 'in_progress',
      title: 'In Progress',
      shortDescription: 'This stage is currently in progress.',
      detailedExplanation: 'Your transaction team is actively progressing this stage.',
      whatClientNeedsToDo: 'No action is required unless your team requests something.',
      whatHappensNext: 'You will be notified when this stage advances.',
      commonQuestions: [],
      estimatedTimeline: 'Timeline depends on transaction-specific dependencies.',
      relatedDocuments: [],
    }
  )
}

export function getEducationalContentForDocument(documentKey = '') {
  const source = String(documentKey || '')
  const match = DOCUMENT_EXPLANATIONS.find((item) => item.match.test(source))
  if (match) return { key: match.key, title: match.title, shortExplanation: match.explanation }
  return {
    key: normalize(documentKey),
    title: 'Supporting Document',
    shortExplanation: 'This document supports compliance, legal, or finance progression.',
  }
}

export function getEducationalContentForAction(actionType = '') {
  const key = normalize(actionType)
  return {
    key,
    shortExplanation: ACTION_EXPLANATIONS[key] || 'This action keeps your transaction moving forward.',
  }
}

export function getEducationalContentForRole(role = '') {
  const key = normalize(role)
  return {
    key,
    explanation: ROLE_EXPLANATIONS[key] || 'This role player supports a specific part of your transaction process.',
  }
}

export function getEducationalContentForRequirement(requirementKey = '') {
  return getEducationalContentForDocument(requirementKey)
}

export function getClientPortalGlossary() {
  return GLOSSARY
}

export function buildClientPortalEducationalContent({
  stage = '',
  mainStage = '',
  financeType = '',
  workspace = '',
  nextActions = [],
  requiredDocuments = [],
} = {}) {
  const stageKey = resolvePortalStageKey({ mainStage, stage, financeType, workspace })
  const currentStage = getEducationalContentForStage(stageKey)

  const guidance = []
  const normalizedWorkspace = normalize(workspace)
  if (normalizedWorkspace === 'selling') {
    guidance.push('Seller guidance is tailored to mandate, property compliance, and transfer readiness.')
  } else {
    guidance.push('Buyer guidance is tailored to finance, compliance, and transfer progression.')
  }
  if (normalize(financeType) === 'bond' || normalize(financeType) === 'hybrid' || normalize(financeType) === 'combination') {
    guidance.push('Because this transaction includes bond finance, lender and affordability documents are important.')
  }
  if (nextActions.some((action) => normalize(action?.type).includes('reupload'))) {
    guidance.push('Rejected documents can usually be resolved quickly by uploading an updated version.')
  }

  const relatedDocumentHelp = requiredDocuments
    .slice(0, 6)
    .map((document) => getEducationalContentForRequirement(document?.key || document?.label || ''))

  return {
    currentStage,
    nextStage: {
      key: '',
      label: '',
      summary: currentStage.whatHappensNext,
    },
    glossary: GLOSSARY,
    guidance,
    relatedDocumentHelp,
  }
}

