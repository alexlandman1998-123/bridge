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
  { match: /proof.?of.?address|utility|municipal account|rates account/i, key: 'proof_of_address', title: 'Proof of Address', explanation: 'This supports FICA verification and confirms where notices or compliance records can be linked.' },
  { match: /id|identity|passport/i, key: 'id_document', title: 'Identity Document', explanation: 'This confirms the legal identity of the person signing, buying, or acting for an entity.' },
  { match: /marriage|anc|antenuptial|spouse|community of property/i, key: 'marital_status_documents', title: 'Marital Status Documents', explanation: 'These help the team confirm who must sign and whether a spouse needs to be included in legal documents.' },
  { match: /tax|sars/i, key: 'tax_number', title: 'Tax Details', explanation: 'Tax details help attorneys complete transfer records and avoid late-stage compliance delays.' },
  { match: /fica|kyc/i, key: 'fica_declaration', title: 'FICA Information', explanation: 'FICA information is required to verify identity, address, and source of funds before the transaction progresses.' },
  { match: /trust deed/i, key: 'trust_deed', title: 'Trust Deed', explanation: 'This confirms the trust structure, trustees, and signing authority for the purchase.' },
  { match: /letter.?of.?authority|letters.?of.?authority|master.?s letter|masters letter/i, key: 'letters_of_authority', title: 'Letters of Authority', explanation: 'This proves the trustees are authorised by the Master to act for the trust.' },
  { match: /trust resolution|trustee resolution|resolution.*trust/i, key: 'trust_resolution', title: 'Trust Resolution', explanation: 'This records that the trustees have approved the purchase and authorised the correct signatories.' },
  { match: /trustee/i, key: 'trustee_documents', title: 'Trustee Documents', explanation: 'Trustee documents confirm the identity and authority of the people acting for the trust.' },
  { match: /cipc|company registration|cor.?14|registration certificate/i, key: 'company_registration', title: 'Company Registration Documents', explanation: 'These confirm the company or close corporation exists and can legally transact.' },
  { match: /company resolution|board resolution|director resolution|resolution.*company/i, key: 'company_resolution', title: 'Company Resolution', explanation: 'This confirms the company has approved the purchase and authorised the correct person to sign.' },
  { match: /director|beneficial owner|ubo|shareholder/i, key: 'company_authority_documents', title: 'Director and Beneficial Owner Documents', explanation: 'These help verify who controls the entity and who is allowed to sign or provide instructions.' },
  { match: /levy/i, key: 'levy_statement', title: 'Levy Statement', explanation: 'This helps confirm the current levy position for sectional title or estate-related checks.' },
  { match: /bond statement/i, key: 'bond_statement', title: 'Bond Statement', explanation: 'This helps attorneys prepare bond cancellation or finance checks.' },
  { match: /bond application|home loan application|loan application/i, key: 'bond_application', title: 'Bond Application', explanation: 'This gives the bond originator and banks the information needed to assess affordability and submit to lenders.' },
  { match: /bond offer|bond grant|loan offer|approval in principle/i, key: 'bond_offer', title: 'Bond Offer', explanation: 'This records the lender outcome, conditions, and accepted finance terms.' },
  { match: /otp|offer to purchase|sale agreement|sale of land/i, key: 'otp', title: 'Offer To Purchase', explanation: 'This is the agreement setting out the price, parties, property, conditions, and key dates of the sale.' },
  { match: /mandate/i, key: 'mandate', title: 'Mandate', explanation: 'This records authority and terms for the listing process.' },
  { match: /bank statement/i, key: 'bank_statement', title: 'Bank Statements', explanation: 'These support affordability, source-of-funds, and lender assessment.' },
  { match: /payslip|salary|income|commission|employment/i, key: 'income_documents', title: 'Income Documents', explanation: 'These help the bank or originator verify income for affordability assessment.' },
  { match: /reservation|holding deposit|deposit proof/i, key: 'deposit_proof', title: 'Deposit Proof', explanation: 'This confirms that a required reservation, holding, or purchase deposit has been paid.' },
  { match: /proof.?of.?funds|source.?of.?funds|deposit|cash/i, key: 'proof_of_funds', title: 'Proof of Funds', explanation: 'This confirms that the deposit, cash portion, or full purchase price is available and can be verified.' },
  { match: /poa|power.?of.?attorney/i, key: 'power_of_attorney', title: 'Power of Attorney', explanation: 'This confirms that someone is legally authorised to sign or act for another party.' },
]

const ACTION_EXPLANATIONS = {
  onboarding_required: 'This step ensures your buyer details, legal capacity, and compliance information are complete before the transaction relies on them.',
  document_upload_required: 'This upload is needed so the team can complete compliance, legal, or finance checks without holding up the transaction.',
  document_reupload_required: 'Please upload a corrected version so the team can clear the rejection and continue with the next milestone.',
  document_under_review: 'Your upload is with the team for review. You only need to act if they reject it or request more detail.',
  additional_document_requested: 'A role player requested an extra document because a compliance, finance, or transfer check needs more support.',
  mandate_signature_required: 'Your mandate signature is required before listing progression.',
  otp_signature_required: 'Your OTP signature is required because the signed sale agreement drives finance, attorney, and transfer steps.',
  proof_of_funds_required: 'Proof of funds is required to verify the cash portion, deposit, or full cash purchase amount.',
  finance_document_required: 'Finance documents are required so affordability, source-of-funds, or funding readiness can be assessed.',
  bond_application_required: 'The bond application must be completed before the originator can submit accurate packs to banks.',
  bond_application_attention_required: 'The bond application needs attention because a required answer, consent, or supporting item is missing.',
  bond_document_required: 'Bond documentation is needed to progress lender assessment or satisfy bank approval conditions.',
  appointment_confirm_required: 'Please confirm the appointment so the team can coordinate the right people, documents, and timing.',
  appointment_required: 'An appointment needs to be booked or completed before this part of the process can move forward.',
  action_required: 'The transaction team needs your input before they can move this item to the next step.',
  awaiting_internal_review: 'Your team is reviewing submitted documents and progress. They will request changes if anything is missing.',
  awaiting_other_party: 'Another party needs to complete their part before this can move forward.',
  informational: 'No action is required right now. Your team is progressing this step.',
}

const ROLE_EXPLANATIONS = {
  agent: {
    label: 'Agent',
    explanation: 'Your agent coordinates deal communication, practical updates, and follow-ups between parties.',
    whenInvolved: 'From lead or offer stage through handover.',
    clientTip: 'Ask your agent about practical timelines, missing items, and who is currently holding the next step.',
  },
  developer: {
    label: 'Developer',
    explanation: 'The developer coordinates stock, project-side approvals, deposits, and handover readiness for development sales.',
    whenInvolved: 'When the property is part of a development or project stock process.',
    clientTip: 'Developer requests often relate to unit allocation, project documents, deposits, or handover conditions.',
  },
  attorney: {
    label: 'Attorney',
    explanation: 'The attorney or conveyancer manages transfer documents, legal checks, lodgement, and registration.',
    whenInvolved: 'After the sale agreement is active and transfer preparation begins.',
    clientTip: 'Attorney requests are usually time-sensitive because transfer cannot progress without compliant documents.',
  },
  conveyancer: {
    label: 'Conveyancer',
    explanation: 'The conveyancer manages transfer preparation, lodgement at the Deeds Office, and registration.',
    whenInvolved: 'During transfer preparation, lodgement, and registration.',
    clientTip: 'Respond quickly to conveyancer document requests to avoid transfer delays.',
  },
  bond_originator: {
    label: 'Bond Originator',
    explanation: 'The bond originator packages your finance application and submits it to banks for assessment.',
    whenInvolved: 'When the purchase includes bond finance or a bond shortfall needs support.',
    clientTip: 'Complete application details and finance documents early so banks can assess without repeated follow-up.',
  },
  bank: {
    label: 'Bank',
    explanation: 'The bank assesses affordability, issues approvals or conditions, and later supports guarantee processes.',
    whenInvolved: 'During bond assessment, approval, and guarantee preparation.',
    clientTip: 'Bank conditions are usually specific. Upload exactly what is requested to avoid rework.',
  },
  buyer: {
    label: 'Buyer',
    explanation: 'The buyer provides onboarding details, FICA documents, finance information, and required signatures.',
    whenInvolved: 'Throughout onboarding, offer, finance, and transfer milestones.',
    clientTip: 'Keep personal, entity, spouse, and finance details consistent across all forms and uploads.',
  },
  seller: {
    label: 'Seller',
    explanation: 'The seller provides mandate, ownership, property, and transfer-side documents.',
    whenInvolved: 'During listing, offer acceptance, and transfer preparation.',
    clientTip: 'Seller delays can affect attorney readiness, so shared documents should be kept current.',
  },
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
  { key: 'letters_of_authority', term: 'Letters of Authority', explanation: 'Master-issued proof that trustees may act for a trust.' },
  { key: 'company_resolution', term: 'Company Resolution', explanation: 'Formal company approval for the transaction and signatory authority.' },
  { key: 'source_of_funds', term: 'Source of Funds', explanation: 'Evidence showing where purchase funds or deposits come from.' },
]

function normalize(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeFinanceType(value = '') {
  const normalized = normalize(value)
  if (['bond', 'hybrid', 'combination', 'combined'].includes(normalized)) return normalized === 'combination' ? 'hybrid' : normalized
  if (normalized.includes('bond')) return 'bond'
  if (normalized.includes('cash')) return 'cash'
  return normalized
}

function isBondFinance(value = '') {
  return ['bond', 'hybrid'].includes(normalizeFinanceType(value))
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
}

function getRequirementIdentity(document = {}) {
  return document?.key ||
    document?.requirement_key ||
    document?.label ||
    document?.requirement_name ||
    document?.name ||
    document?.documentName ||
    document?.document_name ||
    ''
}

export function resolvePortalStageKey({ mainStage = '', stage = '', financeType = '', workspace = '' } = {}) {
  const normalizedMain = normalize(mainStage)
  const normalizedStage = normalize(stage)
  const normalizedFinance = normalizeFinanceType(financeType)
  const normalizedWorkspace = normalize(workspace)

  if (normalizedWorkspace === 'selling' && normalizedStage.includes('mandate')) return 'mandate'
  if (normalizedStage.includes('handover')) return 'handover'
  if (normalizedStage.includes('registration') || normalizedStage.includes('registered')) return 'registration'
  if (normalizedStage.includes('lodgement') || normalizedStage.includes('lodged') || normalizedStage.includes('deeds')) return 'lodgement'
  if (normalizedStage.includes('guarantee')) return 'guarantees'
  if (isBondFinance(normalizedFinance) && /bond.*(approved|approval|granted|grant|offer)|approval.*bond|grant/.test(normalizedStage)) return 'bond_approval'
  if (normalizedStage.includes('attorney') || normalizedStage.includes('conveyancer') || normalizedStage.includes('transfer preparation')) return 'attorney_preparation'
  if (normalizedMain === 'otp' || normalizedStage.includes('otp')) return 'otp'
  if (normalizedMain === 'fin') {
    if (isBondFinance(normalizedFinance)) {
      return 'bond_application'
    }
    return 'finance'
  }
  if (normalizedMain === 'atty') return 'attorney_preparation'
  if (normalizedMain === 'xfer') return 'lodgement'
  if (normalizedMain === 'reg') return 'registration'
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
  const searchableSource = `${source} ${source.replace(/[_-]+/g, ' ')}`
  const match = DOCUMENT_EXPLANATIONS.find((item) => item.match.test(searchableSource))
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
  const content = ROLE_EXPLANATIONS[key]
  if (content) {
    return {
      key,
      ...content,
    }
  }
  return {
    key,
    label: 'Role Player',
    explanation: 'This role player supports a specific part of your transaction process.',
    whenInvolved: 'When their specialist input is required.',
    clientTip: 'Check the related request or update to see what they need from you.',
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
  const normalizedFinance = normalizeFinanceType(financeType)
  const actionTypes = nextActions.map((action) => normalize(action?.type))
  const requirementText = requiredDocuments.map(getRequirementIdentity).join(' ')

  if (normalizedWorkspace === 'selling') {
    guidance.push('Seller guidance is tailored to mandate, property compliance, and transfer readiness.')
  } else {
    guidance.push('Buyer guidance is tailored to onboarding, FICA, authority, finance, and transfer progression.')
  }

  if (isBondFinance(normalizedFinance)) {
    guidance.push('Because this transaction includes bond finance, the bond application and affordability documents should be completed early.')
  } else if (normalizedFinance === 'cash') {
    guidance.push('Because this is a cash transaction, proof of funds and source-of-funds checks are especially important.')
  }

  if (actionTypes.includes('bond_application_required') || actionTypes.includes('bond_application_attention_required')) {
    guidance.push('The bond originator can only submit clean bank packs once the application answers and supporting documents are complete.')
  }

  if (/trust|trustee|letters?.?of.?authority|master/i.test(requirementText)) {
    guidance.push('Trust purchases need both the trust records and trustee authority documents so the correct people sign.')
  }

  if (/company|director|cipc|beneficial owner|shareholder|resolution/i.test(requirementText)) {
    guidance.push('Company purchases need registration, authority, and beneficial-owner checks before signing and transfer steps rely on them.')
  }

  if (nextActions.some((action) => normalize(action?.type).includes('reupload'))) {
    guidance.push('Rejected documents can usually be resolved quickly by uploading an updated version.')
  }

  const relatedDocumentHelp = requiredDocuments
    .slice(0, 6)
    .map((document) => getEducationalContentForRequirement(getRequirementIdentity(document)))

  return {
    currentStage,
    nextStage: {
      key: '',
      label: '',
      summary: currentStage.whatHappensNext,
    },
    glossary: GLOSSARY,
    guidance: uniqueStrings(guidance),
    relatedDocumentHelp,
  }
}
