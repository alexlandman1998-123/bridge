export const WORKFLOW_STEP_CHECKLIST_TEMPLATES = {
  attorney: {
    instruction_received: [
      {
        key: 'mandate_received',
        label: 'Mandate received',
        documentUpload: {
          category: 'Mandate',
          label: 'Upload mandate',
        },
      },
      { key: 'matter_opened', label: 'Matter opened on system' },
      { key: 'reference_created', label: 'Reference code created' },
      { key: 'parties_captured', label: 'Parties captured' },
    ],
    fica_received: [
      {
        key: 'buyer_id_copy',
        label: 'Buyer ID copy received',
        section: 'documents_received',
        documentUpload: {
          category: 'Buyer ID Copy',
          label: 'Upload ID copy',
        },
      },
      {
        key: 'proof_of_address',
        label: 'Proof of address received',
        section: 'documents_received',
        documentUpload: {
          category: 'Proof of Address',
          label: 'Upload proof of address',
        },
      },
      {
        key: 'income_or_source_of_funds',
        label: 'Income / source of funds recorded',
        section: 'documents_received',
      },
      {
        key: 'compliance_review_logged',
        label: 'Attorney compliance approved',
        section: 'attorney_verification',
      },
    ],
    transfer_documents_prepared: [
      {
        key: 'deed_of_transfer_drafted',
        label: 'Deed of transfer drafted',
        documentUpload: {
          category: 'Deed of Transfer Draft',
          label: 'Upload draft deed',
        },
      },
      { key: 'transfer_pack_checked', label: 'Transfer pack checked' },
      {
        key: 'rates_clearance_received',
        label: 'Rates clearance received',
        documentUpload: {
          category: 'Rates Clearance Certificate',
          label: 'Upload rates clearance',
        },
      },
      {
        key: 'sars_receipt_received',
        label: 'SARS clearance / transfer duty receipt received',
        documentUpload: {
          category: 'SARS Receipt',
          label: 'Upload SARS receipt',
        },
      },
      { key: 'transfer_docs_ready', label: 'Transfer documents ready for signature' },
    ],
    buyer_signed_documents: [
      { key: 'buyer_signing_booked', label: 'Buyer signing booked' },
      { key: 'buyer_identity_verified', label: 'Buyer identity verified at signing' },
      {
        key: 'buyer_signed_pack_received',
        label: 'Signed buyer pack received',
        documentUpload: {
          category: 'Signed Buyer Pack',
          label: 'Upload signed buyer pack',
        },
      },
    ],
    seller_signed_documents: [
      { key: 'seller_signing_booked', label: 'Seller signing booked' },
      { key: 'seller_authority_checked', label: 'Seller authority checked' },
      {
        key: 'seller_signed_pack_received',
        label: 'Signed seller pack received',
        documentUpload: {
          category: 'Signed Seller Pack',
          label: 'Upload signed seller pack',
        },
      },
    ],
    guarantees_received: [
      { key: 'bond_instruction_received', label: 'Bond instruction received' },
      {
        key: 'guarantee_letter_received',
        label: 'Guarantee letter received',
        documentUpload: {
          category: 'Guarantee Letter',
          label: 'Upload guarantee letter',
        },
      },
      { key: 'guarantees_verified', label: 'Guarantees verified' },
      { key: 'all_financial_conditions_met', label: 'All financial conditions met' },
    ],
    lodgement_submitted: [
      { key: 'prep_file_checked', label: 'Prep file checked' },
      { key: 'deeds_fee_confirmed', label: 'Deeds office fee confirmed' },
      {
        key: 'lodgement_pack_complete',
        label: 'Lodgement pack complete',
        documentUpload: {
          category: 'Lodgement Pack',
          label: 'Upload lodgement pack',
        },
      },
      { key: 'submitted_to_deeds_office', label: 'Submitted to deeds office' },
    ],
    registration_confirmed: [
      {
        key: 'registration_notice_received',
        label: 'Registration notice received',
        documentUpload: {
          category: 'Registration Notice',
          label: 'Upload registration notice',
        },
      },
      {
        key: 'final_accounts_prepared',
        label: 'Final accounts prepared',
        documentUpload: {
          category: 'Final Accounts',
          label: 'Upload final accounts',
        },
      },
      { key: 'stakeholders_notified', label: 'Stakeholders notified' },
      { key: 'file_ready_for_closeout', label: 'File ready for close-out' },
    ],
  },
  finance: {
    otp_received: [
      { key: 'otp_uploaded_by_sales', label: 'Developer / attorney uploaded the latest OTP' },
      {
        key: 'signed_otp_received',
        label: 'Signed OTP received from client',
        documentUpload: {
          category: 'Signed OTP',
          label: 'Upload signed OTP',
        },
      },
      { key: 'bond_file_ready', label: 'Bond file ready to continue' },
    ],
    application_received: [
      { key: 'mandate_confirmed', label: 'Finance mandate confirmed' },
      { key: 'application_pack_received', label: 'Application pack received' },
      { key: 'application_logged', label: 'Application logged on system' },
    ],
    buyer_documents_collected: [
      { key: 'income_docs_received', label: 'Income documents received' },
      { key: 'bank_statements_received', label: 'Bank statements received' },
      { key: 'fica_docs_received', label: 'FICA documents received' },
      { key: 'submission_pack_complete', label: 'Submission pack complete' },
    ],
    submitted_to_banks: [
      { key: 'submission_complete', label: 'Submission complete' },
      { key: 'bank_reference_logged', label: 'Bank reference logged' },
      { key: 'client_notified_of_submission', label: 'Client notified of submission' },
    ],
    bank_feedback_received: [
      { key: 'feedback_logged', label: 'Bank feedback logged' },
      { key: 'conditions_shared', label: 'Conditions shared with team' },
      { key: 'outstanding_conditions_tracked', label: 'Outstanding conditions tracked' },
    ],
    bond_approved: [
      { key: 'approval_letter_received', label: 'Approval letter received' },
      { key: 'approval_terms_checked', label: 'Approval terms checked' },
      { key: 'approval_shared_with_client', label: 'Approval shared with client' },
    ],
    grant_signed: [
      { key: 'grant_signed_copy', label: 'Signed grant copy received' },
      { key: 'grant_returned_to_bank', label: 'Grant returned to bank' },
      { key: 'final_conditions_cleared', label: 'Final bank conditions cleared' },
    ],
    bond_instruction_sent_to_attorneys: [
      { key: 'instruction_sent', label: 'Instruction sent to attorneys' },
      { key: 'attorney_acknowledged', label: 'Attorney acknowledged receipt' },
      { key: 'guarantee_timeline_confirmed', label: 'Guarantee timeline confirmed' },
    ],
  },
}

const WORKFLOW_STEP_TEMPLATE_ALIASES = {
  attorney: {
    fica_review: 'fica_received',
    fica_compliance_review: 'fica_received',
    transfer_preparation: 'transfer_documents_prepared',
    lodgement: 'lodgement_submitted',
    registration: 'registration_confirmed',
  },
  finance: {},
}

function resolveWorkflowTemplateKey(processType, stepKey) {
  const normalizedProcessType = String(processType || '').trim().toLowerCase()
  const normalizedStepKey = String(stepKey || '').trim()
  return WORKFLOW_STEP_TEMPLATE_ALIASES?.[normalizedProcessType]?.[normalizedStepKey] || normalizedStepKey
}

export function getWorkflowStepChecklistTemplate(processType, stepKey) {
  const resolvedKey = resolveWorkflowTemplateKey(processType, stepKey)
  return WORKFLOW_STEP_CHECKLIST_TEMPLATES?.[processType]?.[resolvedKey] || []
}

export function getWorkflowChecklistUploadConfig(processType, stepKey, checklistKey) {
  const item = getWorkflowStepChecklistTemplate(processType, stepKey).find((entry) => entry.key === checklistKey)
  return item?.documentUpload || null
}
