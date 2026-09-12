begin;
-- Forward correction: canonical application task definitions and phase order.
-- Retain legacy keys for existing matters; do not change saved task outcomes.
insert into journey_private.task_catalog (lane_key,step_key,definition,phase_key,phase_label,phase_order,task_order)
select lane_key,step_key,definition,phase_key,phase_label,phase_order,task_order
from jsonb_to_recordset($catalogue$[
  {
    "lane_key": "transfer",
    "step_key": "instruction_received",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "instruction_received",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Instruction Received",
        "description": "The transfer instruction and source documents have been received."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Instruction Received."
      }
    },
    "phase_key": "instruction",
    "phase_label": "Instruction & File Opening",
    "phase_order": 0,
    "task_order": 0
  },
  {
    "lane_key": "transfer",
    "step_key": "matter_opened",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "matter_opened",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "File Opened and Matter Number Assigned",
        "description": "The conveyancing file is opened and a matter number is recorded."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: File Opened and Matter Number Assigned."
      }
    },
    "phase_key": "instruction",
    "phase_label": "Instruction & File Opening",
    "phase_order": 0,
    "task_order": 1
  },
  {
    "lane_key": "transfer",
    "step_key": "otp_source_docs_checked",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "otp_source_docs_checked",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "OTP and Source Documents Checked",
        "description": "The sale agreement, parties, purchase price, suspensive conditions, and property details are checked."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: OTP and Source Documents Checked."
      }
    },
    "phase_key": "instruction",
    "phase_label": "Instruction & File Opening",
    "phase_order": 0,
    "task_order": 2
  },
  {
    "lane_key": "transfer",
    "step_key": "buyer_fica_review",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "buyer_fica_review",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Review & Approve Buyer FICA",
        "description": "Review the buyer's applicable identity, address and authority documents in one pack."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Review & Approve Buyer FICA."
      }
    },
    "phase_key": "fica_authority",
    "phase_label": "FICA & Authority",
    "phase_order": 1,
    "task_order": 0
  },
  {
    "lane_key": "transfer",
    "step_key": "seller_fica_review",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "seller_fica_review",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Review & Approve Seller FICA",
        "description": "Review the seller's applicable identity, address and authority documents in one pack."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Review & Approve Seller FICA."
      }
    },
    "phase_key": "fica_authority",
    "phase_label": "FICA & Authority",
    "phase_order": 1,
    "task_order": 1
  },
  {
    "lane_key": "transfer",
    "step_key": "title_deed_checked",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "title_deed_checked",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Title Deed or Ownership Checked",
        "description": "The title deed, ownership, restrictions, and property description are checked."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Title Deed or Ownership Checked."
      }
    },
    "phase_key": "instruction",
    "phase_label": "Instruction & File Opening",
    "phase_order": 0,
    "task_order": 3
  },
  {
    "lane_key": "transfer",
    "step_key": "existing_bond_confirmed",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "existing_bond_confirmed",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "internal",
      "clientVisibleAllowed": false,
      "professional": {
        "title": "Existing Bond or Cancellation Requirement Confirmed",
        "description": "Any seller existing bond and cancellation requirement is confirmed."
      },
      "client": null
    },
    "phase_key": "instruction",
    "phase_label": "Instruction & File Opening",
    "phase_order": 0,
    "task_order": 4
  },
  {
    "lane_key": "transfer",
    "step_key": "transfer_tax_route_confirmed",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "transfer_tax_route_confirmed",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "internal",
      "clientVisibleAllowed": false,
      "professional": {
        "title": "Confirm Transfer Tax Route",
        "description": "Confirm the transfer-duty, VAT, zero-rated, exempt, or advice route from the seller facts and agreement."
      },
      "client": null
    },
    "phase_key": "financial_preparation",
    "phase_label": "Financial Preparation",
    "phase_order": 2,
    "task_order": 0
  },
  {
    "lane_key": "transfer",
    "step_key": "transfer_duty_tdc01_submission",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "transfer_duty_tdc01_submission",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "internal",
      "clientVisibleAllowed": false,
      "professional": {
        "title": "Prepare & Submit TDC01",
        "description": "Prepare and submit the Transfer Duty Declaration for the transfer-duty route."
      },
      "client": null
    },
    "phase_key": "financial_preparation",
    "phase_label": "Financial Preparation",
    "phase_order": 2,
    "task_order": 1
  },
  {
    "lane_key": "transfer",
    "step_key": "sars_evidence_request_response",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "sars_evidence_request_response",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "internal",
      "clientVisibleAllowed": false,
      "professional": {
        "title": "Respond to SARS Evidence Request",
        "description": "Provide supporting material only where SARS has requested it."
      },
      "client": null
    },
    "phase_key": "financial_preparation",
    "phase_label": "Financial Preparation",
    "phase_order": 2,
    "task_order": 2
  },
  {
    "lane_key": "transfer",
    "step_key": "transfer_duty_assessment_payment",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "transfer_duty_assessment_payment",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "internal",
      "clientVisibleAllowed": false,
      "professional": {
        "title": "Confirm Duty Assessment & Payment",
        "description": "Record the assessment and payment where transfer duty is payable."
      },
      "client": null
    },
    "phase_key": "financial_preparation",
    "phase_label": "Financial Preparation",
    "phase_order": 2,
    "task_order": 3
  },
  {
    "lane_key": "transfer",
    "step_key": "vat_exemption_evidence_verified",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "vat_exemption_evidence_verified",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "internal",
      "clientVisibleAllowed": false,
      "professional": {
        "title": "Verify VAT / Exemption Evidence",
        "description": "Verify the VAT, zero-rated, or exemption evidence for the selected route."
      },
      "client": null
    },
    "phase_key": "financial_preparation",
    "phase_label": "Financial Preparation",
    "phase_order": 2,
    "task_order": 4
  },
  {
    "lane_key": "transfer",
    "step_key": "non_resident_seller_withholding_review",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "non_resident_seller_withholding_review",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "internal",
      "clientVisibleAllowed": false,
      "professional": {
        "title": "Review Non-Resident Seller Withholding",
        "description": "Review withholding-tax requirements for a non-resident seller where applicable."
      },
      "client": null
    },
    "phase_key": "financial_preparation",
    "phase_label": "Financial Preparation",
    "phase_order": 2,
    "task_order": 5
  },
  {
    "lane_key": "transfer",
    "step_key": "sars_transfer_tax_receipt_verified",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "sars_transfer_tax_receipt_verified",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "internal",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Verify SARS Transfer-Tax Receipt",
        "description": "Verify the applicable SARS transfer-duty, VAT, zero-rated, or exemption proof before lodgement."
      },
      "client": {
        "title": "Transfer tax clearance",
        "description": "The applicable transfer-tax clearance has been verified."
      }
    },
    "phase_key": "financial_preparation",
    "phase_label": "Financial Preparation",
    "phase_order": 2,
    "task_order": 6
  },
  {
    "lane_key": "transfer",
    "step_key": "municipal_rates_clearance_review",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "municipal_rates_clearance_review",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "client_visible",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Review Municipal Rates Clearance",
        "description": "Review rates figures, payment evidence, and the municipal rates-clearance certificate in one place."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Review Municipal Rates Clearance."
      }
    },
    "phase_key": "financial_preparation",
    "phase_label": "Financial Preparation",
    "phase_order": 2,
    "task_order": 7
  },
  {
    "lane_key": "transfer",
    "step_key": "levy_hoa_clearance_review",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "levy_hoa_clearance_review",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Review Levy / HOA Clearance",
        "description": "Review the body-corporate or HOA clearance only where the property requires it."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Review Levy / HOA Clearance."
      }
    },
    "phase_key": "financial_preparation",
    "phase_label": "Financial Preparation",
    "phase_order": 2,
    "task_order": 8
  },
  {
    "lane_key": "transfer",
    "step_key": "property_compliance_review",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "property_compliance_review",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Review Property Compliance Certificates",
        "description": "Review only the compliance certificates that apply to this property and agreement."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Review Property Compliance Certificates."
      }
    },
    "phase_key": "financial_preparation",
    "phase_label": "Financial Preparation",
    "phase_order": 2,
    "task_order": 9
  },
  {
    "lane_key": "transfer",
    "step_key": "transfer_document_pack_review",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "transfer_document_pack_review",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Prepare & Review Transfer Document Pack",
        "description": "Prepare the transfer pack and review it against the OTP, parties, property, and finance route."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Prepare & Review Transfer Document Pack."
      }
    },
    "phase_key": "documents_guarantees",
    "phase_label": "Documents & Guarantees",
    "phase_order": 3,
    "task_order": 0
  },
  {
    "lane_key": "transfer",
    "step_key": "buyer_signing_review",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "buyer_signing_review",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Complete Buyer Signing",
        "description": "Schedule or manage the buyer signing route, then review the signed transfer documents."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Complete Buyer Signing."
      }
    },
    "phase_key": "documents_guarantees",
    "phase_label": "Documents & Guarantees",
    "phase_order": 3,
    "task_order": 1
  },
  {
    "lane_key": "transfer",
    "step_key": "seller_signing_review",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "seller_signing_review",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Complete Seller Signing",
        "description": "Schedule or manage the seller signing route, then review the signed transfer documents."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Complete Seller Signing."
      }
    },
    "phase_key": "documents_guarantees",
    "phase_label": "Documents & Guarantees",
    "phase_order": 3,
    "task_order": 2
  },
  {
    "lane_key": "transfer",
    "step_key": "payment_security_review",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "payment_security_review",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Review Payment Security",
        "description": "Review the applicable guarantee, bond, undertaking, or cleared-trust-funds route and its evidence."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Review Payment Security."
      }
    },
    "phase_key": "documents_guarantees",
    "phase_label": "Documents & Guarantees",
    "phase_order": 3,
    "task_order": 3
  },
  {
    "lane_key": "transfer",
    "step_key": "lodgement_ready",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "lodgement_ready",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Lodgement Ready",
        "description": "Review the completed lodgement pack and coordination position, then confirm that the transfer is ready for lodgement."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Lodgement Ready."
      }
    },
    "phase_key": "lodgement_registration",
    "phase_label": "Lodgement & Registration",
    "phase_order": 4,
    "task_order": 0
  },
  {
    "lane_key": "transfer",
    "step_key": "lodged_at_deeds_office",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "lodged_at_deeds_office",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Lodged at Deeds Office",
        "description": "Record the Deeds Office lodgement once the submission has been accepted."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Lodged at Deeds Office."
      }
    },
    "phase_key": "lodgement_registration",
    "phase_label": "Lodgement & Registration",
    "phase_order": 4,
    "task_order": 1
  },
  {
    "lane_key": "transfer",
    "step_key": "in_prep",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "in_prep",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "On Prep",
        "description": "Record Deeds Office prep once the matter is in preparation for registration."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: On Prep."
      }
    },
    "phase_key": "lodgement_registration",
    "phase_label": "Lodgement & Registration",
    "phase_order": 4,
    "task_order": 2
  },
  {
    "lane_key": "transfer",
    "step_key": "registered",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "registered",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "professional_shared",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Registered",
        "description": "Confirm the transfer registration and capture its registration evidence before close-out begins."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Registered."
      }
    },
    "phase_key": "lodgement_registration",
    "phase_label": "Lodgement & Registration",
    "phase_order": 4,
    "task_order": 3
  },
  {
    "lane_key": "transfer",
    "step_key": "post_registration_closeout_review",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "post_registration_closeout_review",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "client_visible",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Complete Post-Registration Close-Out",
        "description": "Review final accounts, settlement/pro-ration position, and the final registration communication in one close-out outcome."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Complete Post-Registration Close-Out."
      }
    },
    "phase_key": "post_registration",
    "phase_label": "Post-Registration & Closure",
    "phase_order": 5,
    "task_order": 0
  },
  {
    "lane_key": "transfer",
    "step_key": "matter_closed",
    "definition": {
      "processKey": "transfer",
      "processLabel": "Property transfer",
      "stepKey": "matter_closed",
      "ownerRole": "transfer_attorney",
      "defaultVisibility": "client_visible",
      "clientVisibleAllowed": true,
      "professional": {
        "title": "Matter Closed",
        "description": "The transfer matter is administratively closed."
      },
      "client": {
        "title": "Property transfer update",
        "description": "Property transfer is currently at: Matter Closed."
      }
    },
    "phase_key": "post_registration",
    "phase_label": "Post-Registration & Closure",
    "phase_order": 5,
    "task_order": 1
  }
]$catalogue$::jsonb) as t(lane_key text,step_key text,definition jsonb,phase_key text,phase_label text,phase_order integer,task_order integer)
on conflict(lane_key,step_key) do update set definition=excluded.definition,
phase_key=excluded.phase_key,phase_label=excluded.phase_label,phase_order=excluded.phase_order,task_order=excluded.task_order;
commit;
