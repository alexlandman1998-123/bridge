import { normalizeText } from "../utils/text.ts";

export type NotificationAutomationCategory =
  | "standard_email"
  | "notification"
  | "reminder";

export type NotificationAutomationDefinition = {
  key: string;
  displayName: string;
  category: NotificationAutomationCategory;
  triggerType: "manual_send" | "system_event" | "scheduled_reminder";
  recipientRole: string;
  implementationStatus: "active" | "planned" | "disabled";
  defaultEnabled: boolean;
  communicationTypes: string[];
  roleTypes: string[];
  reminderPolicy?: {
    cadenceDays: number[];
    stopWhen: string;
    quietHours?: {
      enabled: boolean;
      timezone: string;
      startHour: number;
      endHour: number;
    };
    escalation?: {
      enabled: boolean;
      afterDay: number;
      recipientRole: string;
      label: string;
    };
  } | null;
};

export const NOTIFICATION_AUTOMATION_KEYS = {
  BUYER_ONBOARDING_SENT: "buyer_onboarding_sent",
  SELLER_ONBOARDING_SENT: "seller_onboarding_sent",
  BUYER_PORTAL_SENT: "buyer_portal_sent",
  SELLER_PORTAL_SENT: "seller_portal_sent",
  ATTORNEY_INVITE_SENT: "attorney_invite_sent",
  BOND_ORIGINATOR_INVITE_SENT: "bond_originator_invite_sent",
  AGENT_INVITE_SENT: "agent_invite_sent",
  BUYER_ONBOARDING_SUBMITTED: "buyer_onboarding_submitted",
  SELLER_ONBOARDING_SUBMITTED: "seller_onboarding_submitted",
  AGENCY_PUBLIC_INTAKE_RECEIVED: "agency_public_intake_received",
  ATTORNEY_INVITE_ACCEPTED: "attorney_invite_accepted",
  BOND_ORIGINATOR_INVITE_ACCEPTED: "bond_originator_invite_accepted",
  AGENT_INVITE_ACCEPTED: "agent_invite_accepted",
  BUYER_ONBOARDING_REMINDER: "buyer_onboarding_reminder",
  SELLER_ONBOARDING_REMINDER: "seller_onboarding_reminder",
  SELLER_DOCUMENT_REQUESTED: "seller_document_requested",
  SELLER_DOCUMENT_REQUEST_REMINDER: "seller_document_request_reminder",
  SELLER_DOCUMENT_REQUEST_ESCALATION: "seller_document_request_escalation",
  ATTORNEY_INVITE_REMINDER: "attorney_invite_reminder",
  BOND_ORIGINATOR_INVITE_REMINDER: "bond_originator_invite_reminder",
  AGENT_INVITE_REMINDER: "agent_invite_reminder",
  LEAD_FIRST_RESPONSE_SLA_REMINDER: "lead_first_response_sla_reminder",
  LEAD_FIRST_RESPONSE_SLA_ESCALATION: "lead_first_response_sla_escalation",
  LEAD_FOLLOW_UP_DUE_REMINDER: "lead_follow_up_due_reminder",
  LEAD_FOLLOW_UP_MISSED_ESCALATION: "lead_follow_up_missed_escalation",
  LEAD_DORMANT_REACTIVATION: "lead_dormant_reactivation",
  LEAD_NO_RESPONSE_NURTURE: "lead_no_response_nurture",
  TRANSACTION_CREATED: "transaction_created",
  TRANSACTION_OWNER_CHANGED: "transaction_owner_changed",
  TRANSACTION_ROLEPLAYER_ASSIGNED: "transaction_roleplayer_assigned",
  TRANSACTION_ROLEPLAYER_REASSIGNED: "transaction_roleplayer_reassigned",
  TRANSACTION_PARTNER_ACCEPTED: "transaction_partner_accepted",
  TRANSACTION_PARTNER_DECLINED: "transaction_partner_declined",
  TRANSACTION_STAGE_CHANGED: "transaction_stage_changed",
  TRANSACTION_STALLED: "transaction_stalled",
  TRANSACTION_CANCELLED: "transaction_cancelled",
  TRANSACTION_ARCHIVED: "transaction_archived",
  TRANSACTION_REACTIVATED: "transaction_reactivated",
  OFFER_VIEWED_BY_SELLER: "offer_viewed_by_seller",
  OFFER_NOT_REVIEWED_REMINDER: "offer_not_reviewed_reminder",
  OFFER_REVIEW_OVERDUE_ESCALATION: "offer_review_overdue_escalation",
  SELLER_MANDATE_VIEWED_UNSIGNED_REMINDER:
    "seller_mandate_viewed_unsigned_reminder",
  SELLER_MANDATE_SIGNING_OVERDUE_ESCALATION:
    "seller_mandate_signing_overdue_escalation",
  BUYER_ONBOARDING_OPENED: "buyer_onboarding_opened",
  BUYER_ONBOARDING_STARTED_NOT_SUBMITTED_REMINDER:
    "buyer_onboarding_started_not_submitted_reminder",
  BUYER_ONBOARDING_OVERDUE_ESCALATION: "buyer_onboarding_overdue_escalation",
  BUYER_ONBOARDING_SUBMITTED_CONFIRMATION:
    "buyer_onboarding_submitted_confirmation",
  CLIENT_PORTAL_MESSAGE_RECEIVED: "client_portal_message_received",
  CLIENT_PORTAL_DOCUMENT_UPLOADED: "client_portal_document_uploaded",
  CLIENT_PORTAL_DOCUMENT_REJECTED: "client_portal_document_rejected",
  BOND_APPLICATION_SUBMITTED: "bond_application_submitted",
  BOND_APPLICATION_STATUS_CHANGED: "bond_application_status_changed",
  BOND_ADDITIONAL_DOCUMENTS_REQUESTED: "bond_additional_documents_requested",
  BOND_DOCUMENT_UPLOADED: "bond_document_uploaded",
  BOND_BANK_OFFER_RECEIVED: "bond_bank_offer_received",
  BOND_BANK_OFFER_BUYER_DECISION: "bond_bank_offer_buyer_decision",
  BOND_GRANT_RECEIVED: "bond_grant_received",
  BOND_GRANT_PUBLISHED: "bond_grant_published",
  BOND_DELIVERY_FAILED: "bond_delivery_failed",
  ATTORNEY_INSTRUCTION_READY: "attorney_instruction_ready",
  ATTORNEY_INSTRUCTION_ACCEPTED: "attorney_instruction_accepted",
  ATTORNEY_INSTRUCTION_DECLINED: "attorney_instruction_declined",
  ATTORNEY_ASSIGNMENT_CHANGED: "attorney_assignment_changed",
  ATTORNEY_MATTER_STAGE_CHANGED: "attorney_matter_stage_changed",
  ATTORNEY_CLIENT_FINANCIAL_DOCUMENT_PUBLISHED:
    "attorney_client_financial_document_published",
  LEGAL_PACKET_GENERATED: "legal_packet_generated",
  LEGAL_PACKET_SENT_FOR_SIGNING: "legal_packet_sent_for_signing",
  LEGAL_SIGNER_VIEWED: "legal_signer_viewed",
  LEGAL_SIGNER_SIGNED: "legal_signer_signed",
  LEGAL_PACKET_COMPLETED: "legal_packet_completed",
  LEGAL_SIGNING_DISPATCH_FAILED: "legal_signing_dispatch_failed",
  AGENT_WEEKLY_LEAD_DIGEST: "agent_weekly_lead_digest",
  AGENT_WEEKLY_TRANSACTION_DIGEST: "agent_weekly_transaction_digest",
  AGENT_WEEKLY_TASK_DIGEST: "agent_weekly_task_digest",
  MANAGER_WEEKLY_TEAM_DIGEST: "manager_weekly_team_digest",
  PRINCIPAL_WEEKLY_BUSINESS_DIGEST: "principal_weekly_business_digest",
  SELLER_WEEKLY_LISTING_DIGEST: "seller_weekly_listing_digest",
  BUYER_WEEKLY_TRANSACTION_DIGEST: "buyer_weekly_transaction_digest",
  ATTORNEY_WEEKLY_MATTER_DIGEST: "attorney_weekly_matter_digest",
  BOND_ORIGINATOR_WEEKLY_PIPELINE_DIGEST:
    "bond_originator_weekly_pipeline_digest",
  COMMERCIAL_WEEKLY_PIPELINE_DIGEST: "commercial_weekly_pipeline_digest",
  COMMERCIAL_ACCESS_REQUESTED: "commercial_access_requested",
  COMMERCIAL_ACCESS_DECISION: "commercial_access_decision",
  COMMERCIAL_BROKER_ASSIGNED: "commercial_broker_assigned",
  COMMERCIAL_CANVASSING_PROSPECT_CREATED:
    "commercial_canvassing_prospect_created",
  COMMERCIAL_REQUIREMENT_CREATED: "commercial_requirement_created",
  COMMERCIAL_REQUIREMENT_STAGE_CHANGED: "commercial_requirement_stage_changed",
  COMMERCIAL_DEAL_CREATED: "commercial_deal_created",
  COMMERCIAL_DEAL_STAGE_CHANGED: "commercial_deal_stage_changed",
  COMMERCIAL_VIEWING_SCHEDULED: "commercial_viewing_scheduled",
  COMMERCIAL_VIEWING_STATUS_CHANGED: "commercial_viewing_status_changed",
  COMMERCIAL_DOCUMENT_REQUEST_CREATED: "commercial_document_request_created",
  COMMERCIAL_DOCUMENT_UPLOADED: "commercial_document_uploaded",
  COMMERCIAL_HEADS_OF_TERMS_STATUS_CHANGED:
    "commercial_heads_of_terms_status_changed",
  COMMERCIAL_TRANSACTION_STATUS_CHANGED:
    "commercial_transaction_status_changed",
  ENTERPRISE_MEMBER_SCOPE_CHANGED: "enterprise_member_scope_changed",
  ENTERPRISE_BRANCH_TEAM_ASSIGNMENT_CHANGED:
    "enterprise_branch_team_assignment_changed",
} as const;

function definition(
  input: NotificationAutomationDefinition,
): NotificationAutomationDefinition {
  return Object.freeze({
    ...input,
    communicationTypes: [...input.communicationTypes],
    roleTypes: [...input.roleTypes],
    reminderPolicy: input.reminderPolicy
      ? {
        ...input.reminderPolicy,
        cadenceDays: [...input.reminderPolicy.cadenceDays],
        quietHours: input.reminderPolicy.quietHours
          ? { ...input.reminderPolicy.quietHours }
          : undefined,
        escalation: input.reminderPolicy.escalation
          ? { ...input.reminderPolicy.escalation }
          : undefined,
      }
      : null,
  });
}

export const NOTIFICATION_AUTOMATION_DEFINITIONS = Object.freeze(
  [
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BUYER_ONBOARDING_SENT,
      displayName: "Buyer onboarding email sent",
      category: "standard_email",
      triggerType: "manual_send",
      recipientRole: "buyer",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["client_onboarding", "buyer_verification_link", "buyer_offer_link"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_ONBOARDING_SENT,
      displayName: "Seller onboarding email sent",
      category: "standard_email",
      triggerType: "manual_send",
      recipientRole: "seller",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["seller_onboarding_link_seller"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BUYER_PORTAL_SENT,
      displayName: "Buyer portal email sent",
      category: "standard_email",
      triggerType: "manual_send",
      recipientRole: "buyer",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["client_portal_link"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_PORTAL_SENT,
      displayName: "Seller portal email sent",
      category: "standard_email",
      triggerType: "manual_send",
      recipientRole: "seller",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["seller_portal_link_seller"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_INVITE_SENT,
      displayName: "Attorney invite email sent",
      category: "standard_email",
      triggerType: "manual_send",
      recipientRole: "attorney",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["transaction_partner_invitation"],
      roleTypes: [
        "transfer_attorney",
        "bond_attorney",
        "cancellation_attorney",
      ],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_ORIGINATOR_INVITE_SENT,
      displayName: "Bond originator invite email sent",
      category: "standard_email",
      triggerType: "manual_send",
      recipientRole: "bond_originator",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["transaction_partner_invitation"],
      roleTypes: ["bond_originator"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.AGENT_INVITE_SENT,
      displayName: "Agent invite email sent",
      category: "standard_email",
      triggerType: "manual_send",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["agent_invite", "workspace_invite", "branch_invite"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BUYER_ONBOARDING_SUBMITTED,
      displayName: "Buyer onboarding submitted",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["onboarding_submitted"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_ONBOARDING_SUBMITTED,
      displayName: "Seller onboarding submitted",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["seller_onboarding_submitted_agent"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.AGENCY_PUBLIC_INTAKE_RECEIVED,
      displayName: "Agency public intake received",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["agency_public_intake_received"],
      roleTypes: ["agent", "commercial_broker"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_INVITE_ACCEPTED,
      displayName: "Attorney invite accepted",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: [
        "transfer_attorney",
        "bond_attorney",
        "cancellation_attorney",
      ],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_ORIGINATOR_INVITE_ACCEPTED,
      displayName: "Bond originator invite accepted",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: ["bond_originator"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.AGENT_INVITE_ACCEPTED,
      displayName: "Agent invite accepted",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "admin",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: ["agent"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.TRANSACTION_CREATED,
      displayName: "Transaction created",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["transaction_created"],
      roleTypes: ["agent", "matter_owner"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.TRANSACTION_OWNER_CHANGED,
      displayName: "Transaction owner changed",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["transaction_owner_changed"],
      roleTypes: ["agent", "matter_owner"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.TRANSACTION_ROLEPLAYER_ASSIGNED,
      displayName: "Transaction roleplayer assigned",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_role_player",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["transaction_roleplayer_assigned"],
      roleTypes: ["attorney", "bond_originator", "transaction_partner"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.TRANSACTION_ROLEPLAYER_REASSIGNED,
      displayName: "Transaction roleplayer reassigned",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_role_player",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["transaction_roleplayer_reassigned"],
      roleTypes: ["attorney", "bond_originator", "transaction_partner"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.TRANSACTION_PARTNER_ACCEPTED,
      displayName: "Transaction partner accepted",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["transaction_partner_accepted"],
      roleTypes: ["attorney", "bond_originator", "transaction_partner"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.TRANSACTION_PARTNER_DECLINED,
      displayName: "Transaction partner declined",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["transaction_partner_declined"],
      roleTypes: ["attorney", "bond_originator", "transaction_partner"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.TRANSACTION_STAGE_CHANGED,
      displayName: "Transaction stage changed",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["transaction_stage_changed"],
      roleTypes: ["agent", "matter_owner", "manager"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.TRANSACTION_STALLED,
      displayName: "Transaction stalled",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["transaction_stalled"],
      roleTypes: ["agent", "matter_owner", "manager"],
      reminderPolicy: {
        cadenceDays: [7],
        stopWhen: "transaction_activity_logged",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 7,
          recipientRole: "manager",
          label:
            "Escalate stalled transactions when no meaningful activity is recorded.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.TRANSACTION_CANCELLED,
      displayName: "Transaction cancelled",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["transaction_cancelled"],
      roleTypes: ["agent", "matter_owner", "manager"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.TRANSACTION_ARCHIVED,
      displayName: "Transaction archived",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["transaction_archived"],
      roleTypes: ["agent", "matter_owner", "manager"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.TRANSACTION_REACTIVATED,
      displayName: "Transaction reactivated",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["transaction_reactivated"],
      roleTypes: ["agent", "matter_owner", "manager"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.OFFER_VIEWED_BY_SELLER,
      displayName: "Offer viewed by seller",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["offer_viewed_by_seller"],
      roleTypes: ["agent"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.OFFER_NOT_REVIEWED_REMINDER,
      displayName: "Offer not reviewed reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "seller",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["offer_not_reviewed_reminder"],
      roleTypes: ["seller"],
      reminderPolicy: {
        cadenceDays: [2],
        stopWhen: "offer_seller_review_completed",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 3,
          recipientRole: "agent",
          label: "Escalate offers that sellers have not reviewed.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.OFFER_REVIEW_OVERDUE_ESCALATION,
      displayName: "Offer review overdue escalation",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["offer_review_overdue_escalation"],
      roleTypes: ["agent", "manager"],
      reminderPolicy: {
        cadenceDays: [3],
        stopWhen: "offer_seller_review_completed",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_MANDATE_VIEWED_UNSIGNED_REMINDER,
      displayName: "Seller mandate viewed but unsigned reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "seller",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["seller_mandate_viewed_unsigned_reminder"],
      roleTypes: ["seller"],
      reminderPolicy: {
        cadenceDays: [1, 3],
        stopWhen: "seller_mandate_signed",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 3,
          recipientRole: "agent",
          label: "Escalate unsigned seller mandates after portal access.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS
        .SELLER_MANDATE_SIGNING_OVERDUE_ESCALATION,
      displayName: "Seller mandate signing overdue escalation",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["seller_mandate_signing_overdue_escalation"],
      roleTypes: ["agent", "manager"],
      reminderPolicy: {
        cadenceDays: [3],
        stopWhen: "seller_mandate_signed",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BUYER_ONBOARDING_OPENED,
      displayName: "Buyer onboarding opened",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["buyer_onboarding_opened"],
      roleTypes: ["agent"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS
        .BUYER_ONBOARDING_STARTED_NOT_SUBMITTED_REMINDER,
      displayName: "Buyer onboarding started but not submitted reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "buyer",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["buyer_onboarding_started_not_submitted_reminder"],
      roleTypes: ["buyer"],
      reminderPolicy: {
        cadenceDays: [1],
        stopWhen: "buyer_onboarding_submitted",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 2,
          recipientRole: "agent",
          label:
            "Escalate buyer onboarding that was started but not submitted.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BUYER_ONBOARDING_OVERDUE_ESCALATION,
      displayName: "Buyer onboarding overdue escalation",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["buyer_onboarding_overdue_escalation"],
      roleTypes: ["agent", "manager"],
      reminderPolicy: {
        cadenceDays: [2],
        stopWhen: "buyer_onboarding_submitted",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BUYER_ONBOARDING_SUBMITTED_CONFIRMATION,
      displayName: "Buyer onboarding submitted confirmation",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "buyer",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["buyer_onboarding_submitted_confirmation"],
      roleTypes: ["buyer"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.CLIENT_PORTAL_MESSAGE_RECEIVED,
      displayName: "Client portal message received",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "assigned_user",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["client_portal_message_received"],
      roleTypes: ["agent", "matter_owner"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.CLIENT_PORTAL_DOCUMENT_UPLOADED,
      displayName: "Client portal document uploaded",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "assigned_user",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["client_portal_document_uploaded"],
      roleTypes: ["agent", "document_reviewer"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.CLIENT_PORTAL_DOCUMENT_REJECTED,
      displayName: "Client portal document rejected",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "client",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["client_portal_document_rejected"],
      roleTypes: ["buyer", "seller"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_APPLICATION_SUBMITTED,
      displayName: "Bond application submitted",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["bond_application_submitted"],
      roleTypes: ["agent", "bond_originator"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_APPLICATION_STATUS_CHANGED,
      displayName: "Bond application status changed",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["bond_application_status_changed"],
      roleTypes: ["agent", "bond_originator"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_ADDITIONAL_DOCUMENTS_REQUESTED,
      displayName: "Bond additional documents requested",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["bond_additional_documents_requested"],
      roleTypes: ["agent", "buyer", "bond_originator"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_DOCUMENT_UPLOADED,
      displayName: "Bond document uploaded",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["bond_document_uploaded"],
      roleTypes: ["agent", "bond_originator"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_BANK_OFFER_RECEIVED,
      displayName: "Bond bank offer received",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["bond_bank_offer_received"],
      roleTypes: ["agent", "buyer", "bond_originator"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_BANK_OFFER_BUYER_DECISION,
      displayName: "Bond bank offer buyer decision",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["bond_bank_offer_buyer_decision"],
      roleTypes: ["agent", "bond_originator"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_GRANT_RECEIVED,
      displayName: "Bond grant received",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["bond_grant_received"],
      roleTypes: ["agent", "buyer", "bond_originator"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_GRANT_PUBLISHED,
      displayName: "Bond grant published",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["bond_grant_published"],
      roleTypes: ["agent", "buyer", "bond_originator"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_DELIVERY_FAILED,
      displayName: "Bond delivery failed",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["bond_delivery_failed"],
      roleTypes: ["agent", "bond_originator", "manager"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_INSTRUCTION_READY,
      displayName: "Attorney instruction ready",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "attorney",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["attorney_instruction_ready"],
      roleTypes: [
        "transfer_attorney",
        "bond_attorney",
        "cancellation_attorney",
      ],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_INSTRUCTION_ACCEPTED,
      displayName: "Attorney instruction accepted",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["attorney_instruction_accepted"],
      roleTypes: ["agent", "matter_owner"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_INSTRUCTION_DECLINED,
      displayName: "Attorney instruction declined",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["attorney_instruction_declined"],
      roleTypes: ["agent", "matter_owner", "manager"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_ASSIGNMENT_CHANGED,
      displayName: "Attorney assignment changed",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["attorney_assignment_changed"],
      roleTypes: ["agent", "matter_owner"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_MATTER_STAGE_CHANGED,
      displayName: "Attorney matter stage changed",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["attorney_matter_stage_changed"],
      roleTypes: ["agent", "attorney", "matter_owner"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS
        .ATTORNEY_CLIENT_FINANCIAL_DOCUMENT_PUBLISHED,
      displayName: "Attorney client financial document published",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["attorney_client_financial_document_published"],
      roleTypes: ["agent", "attorney", "client"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.LEGAL_PACKET_GENERATED,
      displayName: "Legal packet generated",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["legal_packet_generated"],
      roleTypes: ["agent", "attorney", "matter_owner"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.LEGAL_PACKET_SENT_FOR_SIGNING,
      displayName: "Legal packet sent for signing",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["legal_packet_sent_for_signing"],
      roleTypes: ["agent", "attorney", "matter_owner"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.LEGAL_SIGNER_VIEWED,
      displayName: "Legal signer viewed packet",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["legal_signer_viewed"],
      roleTypes: ["agent", "attorney", "matter_owner"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.LEGAL_SIGNER_SIGNED,
      displayName: "Legal signer signed packet",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["legal_signer_signed"],
      roleTypes: ["agent", "attorney", "matter_owner"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.LEGAL_PACKET_COMPLETED,
      displayName: "Legal packet completed",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["legal_packet_completed"],
      roleTypes: ["agent", "attorney", "matter_owner"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.LEGAL_SIGNING_DISPATCH_FAILED,
      displayName: "Legal signing dispatch failed",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "transaction_owner",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["legal_signing_dispatch_failed"],
      roleTypes: ["agent", "attorney", "matter_owner", "manager"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.AGENT_WEEKLY_LEAD_DIGEST,
      displayName: "Agent weekly lead digest",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["agent_weekly_lead_digest"],
      roleTypes: ["agent"],
      reminderPolicy: {
        cadenceDays: [7],
        stopWhen: "manual_disable",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.AGENT_WEEKLY_TRANSACTION_DIGEST,
      displayName: "Agent weekly transaction digest",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["agent_weekly_transaction_digest"],
      roleTypes: ["agent"],
      reminderPolicy: {
        cadenceDays: [7],
        stopWhen: "manual_disable",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.AGENT_WEEKLY_TASK_DIGEST,
      displayName: "Agent weekly task digest",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["agent_weekly_task_digest"],
      roleTypes: ["agent"],
      reminderPolicy: {
        cadenceDays: [7],
        stopWhen: "manual_disable",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.MANAGER_WEEKLY_TEAM_DIGEST,
      displayName: "Manager weekly team digest",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "manager",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["manager_weekly_team_digest"],
      roleTypes: ["manager", "branch_manager", "admin"],
      reminderPolicy: {
        cadenceDays: [7],
        stopWhen: "manual_disable",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.PRINCIPAL_WEEKLY_BUSINESS_DIGEST,
      displayName: "Principal weekly business digest",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "principal",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["principal_weekly_business_digest"],
      roleTypes: ["principal", "owner", "director", "admin"],
      reminderPolicy: {
        cadenceDays: [7],
        stopWhen: "manual_disable",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_WEEKLY_LISTING_DIGEST,
      displayName: "Seller weekly listing digest",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "seller",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["seller_weekly_listing_digest"],
      roleTypes: ["seller"],
      reminderPolicy: {
        cadenceDays: [7],
        stopWhen: "listing_closed_or_manual_disable",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BUYER_WEEKLY_TRANSACTION_DIGEST,
      displayName: "Buyer weekly transaction digest",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "buyer",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["buyer_weekly_transaction_digest"],
      roleTypes: ["buyer"],
      reminderPolicy: {
        cadenceDays: [7],
        stopWhen: "transaction_closed_or_manual_disable",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_WEEKLY_MATTER_DIGEST,
      displayName: "Attorney weekly matter digest",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "attorney",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["attorney_weekly_matter_digest"],
      roleTypes: ["attorney", "conveyancer"],
      reminderPolicy: {
        cadenceDays: [7],
        stopWhen: "manual_disable",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_ORIGINATOR_WEEKLY_PIPELINE_DIGEST,
      displayName: "Bond originator weekly pipeline digest",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "bond_originator",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["bond_originator_weekly_pipeline_digest"],
      roleTypes: ["bond_originator", "originator", "consultant"],
      reminderPolicy: {
        cadenceDays: [7],
        stopWhen: "manual_disable",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.COMMERCIAL_WEEKLY_PIPELINE_DIGEST,
      displayName: "Commercial weekly pipeline digest",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "commercial_broker",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["commercial_weekly_pipeline_digest"],
      roleTypes: ["commercial_broker", "agent", "principal"],
      reminderPolicy: {
        cadenceDays: [7],
        stopWhen: "manual_disable",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.COMMERCIAL_ACCESS_REQUESTED,
      displayName: "Commercial access requested",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "principal",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["commercial_access_requested"],
      roleTypes: ["principal", "owner", "admin"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.COMMERCIAL_ACCESS_DECISION,
      displayName: "Commercial access decision",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "requester",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["commercial_access_decision"],
      roleTypes: ["agent", "commercial_broker"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.COMMERCIAL_BROKER_ASSIGNED,
      displayName: "Commercial broker assigned",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "commercial_broker",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["commercial_broker_assigned"],
      roleTypes: ["commercial_broker", "agent"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.COMMERCIAL_CANVASSING_PROSPECT_CREATED,
      displayName: "Commercial canvassing prospect created",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "commercial_broker",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["commercial_canvassing_prospect_created"],
      roleTypes: ["commercial_broker", "agent"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.COMMERCIAL_REQUIREMENT_CREATED,
      displayName: "Commercial requirement created",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "commercial_broker",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["commercial_requirement_created"],
      roleTypes: ["commercial_broker", "agent"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.COMMERCIAL_REQUIREMENT_STAGE_CHANGED,
      displayName: "Commercial requirement stage changed",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "commercial_broker",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["commercial_requirement_stage_changed"],
      roleTypes: ["commercial_broker", "manager"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.COMMERCIAL_DEAL_CREATED,
      displayName: "Commercial deal created",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "commercial_broker",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["commercial_deal_created"],
      roleTypes: ["commercial_broker", "agent"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.COMMERCIAL_DEAL_STAGE_CHANGED,
      displayName: "Commercial deal stage changed",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "commercial_broker",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["commercial_deal_stage_changed"],
      roleTypes: ["commercial_broker", "manager"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.COMMERCIAL_VIEWING_SCHEDULED,
      displayName: "Commercial viewing scheduled",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "commercial_broker",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["commercial_viewing_scheduled"],
      roleTypes: ["commercial_broker", "agent"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.COMMERCIAL_VIEWING_STATUS_CHANGED,
      displayName: "Commercial viewing status changed",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "commercial_broker",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["commercial_viewing_status_changed"],
      roleTypes: ["commercial_broker", "agent"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.COMMERCIAL_DOCUMENT_REQUEST_CREATED,
      displayName: "Commercial document request created",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "commercial_broker",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["commercial_document_request_created"],
      roleTypes: ["commercial_broker", "agent"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.COMMERCIAL_DOCUMENT_UPLOADED,
      displayName: "Commercial document uploaded",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "commercial_broker",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["commercial_document_uploaded"],
      roleTypes: ["commercial_broker", "agent"],
    }),
    definition({
      key:
        NOTIFICATION_AUTOMATION_KEYS.COMMERCIAL_HEADS_OF_TERMS_STATUS_CHANGED,
      displayName: "Commercial heads of terms status changed",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "commercial_broker",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["commercial_heads_of_terms_status_changed"],
      roleTypes: ["commercial_broker", "manager"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.COMMERCIAL_TRANSACTION_STATUS_CHANGED,
      displayName: "Commercial transaction status changed",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "commercial_broker",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["commercial_transaction_status_changed"],
      roleTypes: ["commercial_broker", "manager"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.ENTERPRISE_MEMBER_SCOPE_CHANGED,
      displayName: "Enterprise member scope changed",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "member",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["enterprise_member_scope_changed"],
      roleTypes: ["member", "admin", "manager"],
    }),
    definition({
      key:
        NOTIFICATION_AUTOMATION_KEYS.ENTERPRISE_BRANCH_TEAM_ASSIGNMENT_CHANGED,
      displayName: "Enterprise branch or team assignment changed",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "member",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["enterprise_branch_team_assignment_changed"],
      roleTypes: ["member", "admin", "manager"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BUYER_ONBOARDING_REMINDER,
      displayName: "Buyer onboarding reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "buyer",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: [],
      reminderPolicy: {
        cadenceDays: [2, 5, 9],
        stopWhen: NOTIFICATION_AUTOMATION_KEYS.BUYER_ONBOARDING_SUBMITTED,
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 9,
          recipientRole: "assigned_user",
          label:
            "Escalate to assigned agent after the final buyer onboarding reminder.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_ONBOARDING_REMINDER,
      displayName: "Seller onboarding reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "seller",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: [],
      reminderPolicy: {
        cadenceDays: [2, 5, 9],
        stopWhen: NOTIFICATION_AUTOMATION_KEYS.SELLER_ONBOARDING_SUBMITTED,
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 9,
          recipientRole: "assigned_user",
          label:
            "Escalate to assigned agent after the final seller onboarding reminder.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_DOCUMENT_REQUESTED,
      displayName: "Seller document requested",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "seller",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["seller_document_requested"],
      roleTypes: [],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_DOCUMENT_REQUEST_REMINDER,
      displayName: "Seller document request reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "seller",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["seller_document_request_reminder"],
      roleTypes: [],
      reminderPolicy: {
        cadenceDays: [0, 2, 5, 9],
        stopWhen: "seller_document_supplied",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 9,
          recipientRole: "assigned_user",
          label:
            "Escalate overdue seller document requests to the assigned agent.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.SELLER_DOCUMENT_REQUEST_ESCALATION,
      displayName: "Seller document request escalation",
      category: "notification",
      triggerType: "system_event",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["seller_document_request_escalation"],
      roleTypes: ["agent"],
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_INVITE_REMINDER,
      displayName: "Attorney invite reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "attorney",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: [
        "transfer_attorney",
        "bond_attorney",
        "cancellation_attorney",
      ],
      reminderPolicy: {
        cadenceDays: [2, 5, 9],
        stopWhen: NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_INVITE_ACCEPTED,
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 9,
          recipientRole: "assigned_user",
          label:
            "Escalate to transaction owner after the final attorney invite reminder.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.BOND_ORIGINATOR_INVITE_REMINDER,
      displayName: "Bond originator invite reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "bond_originator",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: ["bond_originator"],
      reminderPolicy: {
        cadenceDays: [2, 5, 9],
        stopWhen: NOTIFICATION_AUTOMATION_KEYS.BOND_ORIGINATOR_INVITE_ACCEPTED,
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 9,
          recipientRole: "assigned_user",
          label:
            "Escalate to transaction owner after the final bond originator invite reminder.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.AGENT_INVITE_REMINDER,
      displayName: "Agent invite reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: [],
      roleTypes: ["agent"],
      reminderPolicy: {
        cadenceDays: [2, 5, 9],
        stopWhen: NOTIFICATION_AUTOMATION_KEYS.AGENT_INVITE_ACCEPTED,
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 9,
          recipientRole: "admin",
          label:
            "Escalate to workspace admin after the final agent invite reminder.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.LEAD_FIRST_RESPONSE_SLA_REMINDER,
      displayName: "Lead first response SLA reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["lead_first_response_sla_reminder"],
      roleTypes: ["agent"],
      reminderPolicy: {
        cadenceDays: [0],
        stopWhen: "lead_first_contact_logged",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 0,
          recipientRole: "manager",
          label: "Escalate to managers when the first-response SLA is missed.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.LEAD_FIRST_RESPONSE_SLA_ESCALATION,
      displayName: "Lead first response SLA escalation",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "manager",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["lead_first_response_sla_escalation"],
      roleTypes: ["manager", "admin", "principal"],
      reminderPolicy: {
        cadenceDays: [0],
        stopWhen: "lead_first_contact_logged",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.LEAD_FOLLOW_UP_DUE_REMINDER,
      displayName: "Lead follow-up due reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["lead_follow_up_due_reminder"],
      roleTypes: ["agent"],
      reminderPolicy: {
        cadenceDays: [0],
        stopWhen: "lead_task_completed",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
        escalation: {
          enabled: true,
          afterDay: 1,
          recipientRole: "manager",
          label: "Escalate to managers when a lead follow-up is missed.",
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.LEAD_FOLLOW_UP_MISSED_ESCALATION,
      displayName: "Lead follow-up missed escalation",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "manager",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["lead_follow_up_missed_escalation"],
      roleTypes: ["manager", "admin", "principal"],
      reminderPolicy: {
        cadenceDays: [1],
        stopWhen: "lead_task_completed",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.LEAD_DORMANT_REACTIVATION,
      displayName: "Dormant lead reactivation reminder",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "agent",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["lead_dormant_reactivation"],
      roleTypes: ["agent"],
      reminderPolicy: {
        cadenceDays: [14],
        stopWhen: "lead_activity_logged",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
    definition({
      key: NOTIFICATION_AUTOMATION_KEYS.LEAD_NO_RESPONSE_NURTURE,
      displayName: "Lead no-response nurture",
      category: "reminder",
      triggerType: "scheduled_reminder",
      recipientRole: "lead",
      implementationStatus: "active",
      defaultEnabled: true,
      communicationTypes: ["lead_no_response_nurture"],
      roleTypes: ["lead"],
      reminderPolicy: {
        cadenceDays: [2, 7],
        stopWhen: "lead_first_contact_logged",
        quietHours: {
          enabled: true,
          timezone: "Africa/Johannesburg",
          startHour: 18,
          endHour: 8,
        },
      },
    }),
  ] satisfies NotificationAutomationDefinition[],
);

const definitionsByKey = new Map(
  NOTIFICATION_AUTOMATION_DEFINITIONS.map((item) => [item.key, item]),
);

function normalizeKey(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function isAttorneyRole(value: unknown) {
  const role = normalizeKey(value);
  return role === "attorney" || role.endsWith("_attorney") ||
    role.includes("conveyancer");
}

function isAgentInvite(type: unknown, workspaceRole: unknown) {
  const normalizedType = normalizeKey(type);
  const normalizedRole = normalizeKey(workspaceRole);
  return normalizedType === "agent_invite" || normalizedRole.includes("agent");
}

export function getNotificationAutomationDefinition(
  key: unknown,
): NotificationAutomationDefinition | null {
  return definitionsByKey.get(normalizeKey(key)) || null;
}

export function resolveNotificationAutomationKey({
  communicationType = "",
  type = "",
  roleType = "",
  roleLabel = "",
  workspaceRole = "",
  emailKind = "",
}: {
  communicationType?: unknown;
  type?: unknown;
  roleType?: unknown;
  roleLabel?: unknown;
  workspaceRole?: unknown;
  emailKind?: unknown;
} = {}) {
  const normalizedCommunicationType = normalizeKey(communicationType || type);
  const normalizedType = normalizeKey(type);
  const normalizedEmailKind = normalizeKey(emailKind);
  const normalizedRoleType = normalizeKey(roleType);

  if (
    ["client_onboarding", "buyer_verification_link", "buyer_offer_link"].includes(
      normalizedCommunicationType,
    )
  ) {
    return NOTIFICATION_AUTOMATION_KEYS.BUYER_ONBOARDING_SENT;
  }
  if (
    [
      "seller_onboarding_link_seller",
      "seller_onboarding",
      "seller_onboarding_link",
    ].includes(normalizedCommunicationType)
  ) {
    return NOTIFICATION_AUTOMATION_KEYS.SELLER_ONBOARDING_SENT;
  }
  if (normalizedCommunicationType === "client_portal_link") {
    return NOTIFICATION_AUTOMATION_KEYS.BUYER_PORTAL_SENT;
  }
  if (
    normalizedCommunicationType === "seller_portal_link_seller" ||
    normalizedType === "seller_portal_link" ||
    normalizedEmailKind === "portal_documents"
  ) {
    return NOTIFICATION_AUTOMATION_KEYS.SELLER_PORTAL_SENT;
  }
  if (
    ["onboarding_submitted", "client_onboarding_submitted"].includes(
      normalizedCommunicationType,
    )
  ) {
    return NOTIFICATION_AUTOMATION_KEYS.BUYER_ONBOARDING_SUBMITTED;
  }
  if (normalizedCommunicationType === "seller_onboarding_submitted_agent") {
    return NOTIFICATION_AUTOMATION_KEYS.SELLER_ONBOARDING_SUBMITTED;
  }
  if (normalizedCommunicationType === "transaction_partner_invitation") {
    if (normalizedRoleType === "bond_originator") {
      return NOTIFICATION_AUTOMATION_KEYS.BOND_ORIGINATOR_INVITE_SENT;
    }
    if (isAttorneyRole(roleType) || isAttorneyRole(roleLabel)) {
      return NOTIFICATION_AUTOMATION_KEYS.ATTORNEY_INVITE_SENT;
    }
  }
  if (
    ["workspace_invite", "team_invite", "branch_invite", "agent_invite"]
      .includes(normalizedCommunicationType)
  ) {
    return isAgentInvite(normalizedCommunicationType, workspaceRole)
      ? NOTIFICATION_AUTOMATION_KEYS.AGENT_INVITE_SENT
      : "";
  }
  return definitionsByKey.has(normalizedCommunicationType)
    ? normalizedCommunicationType
    : "";
}

export function resolveNotificationAutomation(input: {
  communicationType?: unknown;
  type?: unknown;
  roleType?: unknown;
  roleLabel?: unknown;
  workspaceRole?: unknown;
  emailKind?: unknown;
} = {}) {
  return getNotificationAutomationDefinition(
    resolveNotificationAutomationKey(input),
  );
}
