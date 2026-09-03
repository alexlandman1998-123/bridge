export type JsonRecord = Record<string, unknown>;

export type DeliveryContextPayload = {
  organisationId?: string;
  organisation_id?: string;
  leadId?: string;
  lead_id?: string;
  listingId?: string;
  listing_id?: string;
  transactionId?: string;
  transaction_id?: string;
  offerId?: string;
  offer_id?: string;
  appointmentId?: string;
  appointment_id?: string;
  portalSessionId?: string;
  portal_session_id?: string;
  sellerReviewSessionId?: string;
  seller_review_session_id?: string;
  recipientRole?: string;
  recipient_role?: string;
  deliveryMetadata?: JsonRecord;
  delivery_metadata?: JsonRecord;
};

export type SendAttorneyQuotePayload = {
  type: "attorney_quote" | "attorney_quote_email";
  organisationId?: string;
  organisation_id?: string;
  quoteId?: string;
  quote_id?: string;
};

export type SendClientOnboardingPayload = {
  type: "client_onboarding";
  transactionId: string;
  resend?: boolean;
  source?: string;
  deliveryMode?: "digital_portal" | "agent_assisted" | "hard_copy" | string;
  skipEmail?: boolean;
  buyerDeliveryAction?: "send_onboarding" | "send_portal_link" | string;
  buyerDeliveryVersion?: string;
  buyerTargetId?: string | null;
  buyerParticipantId?: string | null;
  buyerPartyId?: string | null;
  buyerEmail?: string | null;
  buyerName?: string | null;
} & DeliveryContextPayload;

export type SendOnboardingSubmittedPayload = {
  type: "onboarding_submitted" | "client_portal_link";
  transactionId: string;
  resend?: boolean;
} & DeliveryContextPayload;

export type SendBondIntakeNotificationPayload = {
  type: "bond_intake_notification" | "bond_originator_intake";
  transactionId?: string;
  to: string;
  recipientName?: string;
  subject?: string;
  title?: string;
  message?: string;
  metadata?: JsonRecord;
};

export type SendAdditionalDocumentRequestPayload = {
  type:
    | "additional_document_request"
    | "document_request"
    | "transaction_document_request";
  transactionId?: string;
  transaction_id?: string;
  organisationId?: string;
  organisation_id?: string;
  to: string;
  recipientName?: string;
  recipient_name?: string;
  subject?: string;
  title?: string;
  message?: string;
  actionLink?: string;
  action_link?: string;
  metadata?: JsonRecord;
} & DeliveryContextPayload;

export type SendBondOriginatorBuyerIntroPayload = {
  type: "bond_originator_buyer_intro";
  transactionId?: string;
  to: string;
  recipientName?: string;
  subject?: string;
  title?: string;
  message?: string;
  metadata?: JsonRecord;
};

export type SendCommercialAccessNotificationPayload = {
  type:
    | "commercial_access_notification"
    | "commercial_access_request"
    | "commercial_access_decision";
  to: string;
  recipientName?: string;
  recipient_name?: string;
  eventKind?: "request" | "decision" | string;
  event_kind?: "request" | "decision" | string;
  decision?: "approved" | "rejected" | string;
  requestId?: string;
  request_id?: string;
  requesterName?: string;
  requester_name?: string;
  requesterEmail?: string;
  requester_email?: string;
  organisationName?: string;
  organisation_name?: string;
  actionLink?: string;
  action_link?: string;
  subject?: string;
  message?: string;
};

export type SendReservationDepositPayload = {
  type: "reservation_deposit";
  transactionId: string;
  resend?: boolean;
  source?: string;
  actorRole?: string;
  actorUserId?: string | null;
};

export type SendReservationDepositReceivedPayload = {
  type: "reservation_deposit_received";
  transactionId: string;
  resend?: boolean;
  source?: string;
  actorRole?: string;
  actorUserId?: string | null;
};

export type SendLegacyTestPayload = {
  type?: "legacy_test" | "test_email" | "bridge_email_test";
  to: string;
  name?: string;
};

export type SendNotificationControlsPayload = {
  type:
    | "notification_controls_apply_queue"
    | "notification_preferences_apply_queue"
    | "notification_queue_controls"
    | "notification_observability_snapshot"
    | "notification_controls_snapshot"
    | "notification_health_snapshot";
  limit?: number;
  dryRun?: boolean;
  dry_run?: boolean;
  eventId?: string;
  event_id?: string;
  organisationId?: string;
  organisation_id?: string;
  since?: string;
  now?: string;
};

export type SendLeadAcknowledgementPayload = {
  type:
    | "lead_acknowledgement"
    | "lead_acknowledgement_email"
    | "property_enquiry_acknowledgement";
  to: string;
  subject?: string;
  replyTo?: string;
  reply_to?: string;
  fromName?: string;
  from_name?: string;
  fromEmail?: string;
  from_email?: string;
  idempotencyKey?: string;
  idempotency_key?: string;
  organisationId?: string;
  organisation_id?: string;
  leadId?: string;
  lead_id?: string;
  recipientName?: string;
  recipient_name?: string;
  organisationName?: string;
  organisation_name?: string;
  organisationLogoUrl?: string;
  organisation_logo_url?: string;
  organisationTagline?: string;
  organisation_tagline?: string;
  organisationPhone?: string;
  organisation_phone?: string;
  organisationEmail?: string;
  organisation_email?: string;
  organisationWebsite?: string;
  organisation_website?: string;
  organisationBrandPrimaryColor?: string;
  organisation_brand_primary_color?: string;
  organisationBrandSecondaryColor?: string;
  organisation_brand_secondary_color?: string;
  enquiryReceivedAt?: string;
  enquiry_received_at?: string;
  timezone?: string;
  source?: string;
  originalMessage?: string;
  original_message?: string;
  agentName?: string;
  agent_name?: string;
  agentFirstName?: string;
  agent_first_name?: string;
  agentEmail?: string;
  agent_email?: string;
  agentPhone?: string;
  agent_phone?: string;
  agentJobTitle?: string;
  agent_job_title?: string;
  agentBio?: string;
  agent_bio?: string;
  agentAvatarUrl?: string;
  agent_avatar_url?: string;
  responseExpectation?: string;
  response_expectation?: string;
  customResponseText?: string;
  custom_response_text?: string;
};

export type SendArch9IntakeAcknowledgementPayload = {
  type: "arch9_intake_acknowledgement" | "arch9_intake_confirmation";
  to: string;
  subject?: string;
  replyTo?: string;
  reply_to?: string;
  idempotencyKey?: string;
  idempotency_key?: string;
  leadId?: string;
  lead_id?: string;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  recipientName?: string;
  recipient_name?: string;
  organisationName?: string;
  organisation_name?: string;
  roleLabel?: string;
  role_label?: string;
  interests?: string[];
  bookingUrl?: string;
  booking_url?: string;
};

export type SendKingstonsValuationDownloadPayload = {
  type:
    | "kingstons_valuation_download"
    | "kingstons_formal_valuation_download"
    | "valuation_download";
  to: string;
  subject?: string;
  replyTo?: string;
  reply_to?: string;
  fromName?: string;
  from_name?: string;
  fromEmail?: string;
  from_email?: string;
  idempotencyKey?: string;
  idempotency_key?: string;
  organisationId?: string;
  organisation_id?: string;
  recipientName?: string;
  recipient_name?: string;
  organisationName?: string;
  organisation_name?: string;
  organisationLogoUrl?: string;
  organisation_logo_url?: string;
  organisationLogoLightUrl?: string;
  organisation_logo_light_url?: string;
  organisationLogoDarkUrl?: string;
  organisation_logo_dark_url?: string;
  organisationLogoIconUrl?: string;
  organisation_logo_icon_url?: string;
  organisationBrandPrimaryColor?: string;
  organisation_brand_primary_color?: string;
  organisationBrandSecondaryColor?: string;
  organisation_brand_secondary_color?: string;
  supportEmail?: string;
  support_email?: string;
  supportPhone?: string;
  support_phone?: string;
  propertyLabel?: string;
  property_label?: string;
  agentName?: string;
  agent_name?: string;
  agentEmail?: string;
  agent_email?: string;
  agentRole?: string;
  agent_role?: string;
  valuationDownloadUrl?: string;
  valuation_download_url?: string;
  downloadUrl?: string;
  download_url?: string;
  valuationFileName?: string;
  valuation_file_name?: string;
  leadId?: string;
  lead_id?: string;
  appointmentId?: string;
  appointment_id?: string;
} & DeliveryContextPayload;

export type SendLeadOperationsNotificationPayload = {
  type:
    | "new_enquiry_assigned_agent"
    | "new_enquiry_unassigned_manager"
    | "lead_assigned"
    | "lead_reassigned"
    | "lead_unassigned"
    | "lead_claimed_confirmation"
    | "buyer_viewing_times_submitted_agent"
    | "seller_viewing_response_submitted_agent"
    | "lead_operations_notification";
  to: string;
  recipientName?: string;
  recipient_name?: string;
  recipientRole?: string;
  recipient_role?: string;
  eventKind?: string;
  event_kind?: string;
  organisationId?: string;
  organisation_id?: string;
  organisationName?: string;
  organisation_name?: string;
  leadId?: string;
  lead_id?: string;
  branchId?: string;
  branch_id?: string;
  assignedUserId?: string;
  assigned_user_id?: string;
  subject?: string;
  title?: string;
  message?: string;
  actionLink?: string;
  action_link?: string;
  leadName?: string;
  lead_name?: string;
  leadEmail?: string;
  lead_email?: string;
  leadPhone?: string;
  lead_phone?: string;
  leadSource?: string;
  lead_source?: string;
  leadCategory?: string;
  lead_category?: string;
  leadStatus?: string;
  lead_status?: string;
  propertyLabel?: string;
  property_label?: string;
  availabilityWindows?: string[] | string;
  availability_windows?: string[] | string;
  budgetLabel?: string;
  budget_label?: string;
  assignedAgentName?: string;
  assigned_agent_name?: string;
  assignedAgentEmail?: string;
  assigned_agent_email?: string;
  previousAgentName?: string;
  previous_agent_name?: string;
  previousAgentEmail?: string;
  previous_agent_email?: string;
  reason?: string;
  source?: string;
  idempotencyKey?: string;
  idempotency_key?: string;
  metadata?: JsonRecord;
} & DeliveryContextPayload;

export type SendBuyerViewingAvailabilityConfirmationPayload = {
  type:
    | "buyer_viewing_availability_confirmation"
    | "buyer_viewing_times_confirmation"
    | "viewing_availability_confirmation";
  to: string;
  subject?: string;
  title?: string;
  preheader?: string;
  message?: string;
  followUpMessage?: string;
  follow_up_message?: string;
  buyerName?: string;
  buyer_name?: string;
  recipientName?: string;
  recipient_name?: string;
  agentName?: string;
  agent_name?: string;
  agentEmail?: string;
  agent_email?: string;
  organisationName?: string;
  organisation_name?: string;
  supportEmail?: string;
  support_email?: string;
  supportPhone?: string;
  support_phone?: string;
  propertyLabels?: string[] | string;
  property_labels?: string[] | string;
  availabilityWindows?: string[] | string;
  availability_windows?: string[] | string;
  listingId?: string;
  listing_id?: string;
  idempotencyKey?: string;
  idempotency_key?: string;
  metadata?: JsonRecord;
} & DeliveryContextPayload;

export type SendPublicDemoEnquiryNotificationPayload = {
  type: "public_demo_enquiry" | "demo_enquiry_notification";
  to?: string;
  fullName?: string;
  full_name?: string;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  role?: string | null;
  businessSize?: string | null;
  business_size?: string | null;
  monthlyVolume?: string | null;
  monthly_volume?: string | null;
  demoFocus?: string[] | string | null;
  demo_focus?: string[] | string | null;
  preferredWindow?: string[] | string | null;
  preferred_window?: string[] | string | null;
  biggestFrustration?: string | null;
  biggest_frustration?: string | null;
  pageUrl?: string;
  page_url?: string;
  adminUrl?: string;
  admin_url?: string;
  submittedAt?: string;
  submitted_at?: string;
};

export type SendArch9LaunchConfirmationPayload = {
  type:
    | "arch9_launch_confirmation"
    | "launch_confirmation"
    | "arch9_concierge_confirmation";
  to: string;
  recipientName?: string;
  recipient_name?: string;
  roleType?: string;
  role_type?: string;
  discussionFocus?: string;
  discussion_focus?: string;
  preferredTime?: string;
  preferred_time?: string;
  source?: string;
};

export type SendArch9LaunchInternalNotificationPayload = {
  type:
    | "arch9_launch_internal_notification"
    | "launch_internal_notification"
    | "arch9_concierge_internal_notification"
    | "arch9_training_request"
    | "partner_training_request";
  to?: string;
  fullName?: string;
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  roleType?: string;
  role_type?: string;
  discussionFocus?: string | null;
  discussion_focus?: string | null;
  preferredTime?: string | null;
  preferred_time?: string | null;
  note?: string | null;
  pageUrl?: string;
  page_url?: string;
  submittedAt?: string;
  submitted_at?: string;
  source?: string;
};

export type SendWorkspaceInvitePayload = {
  type:
    | "workspace_invite"
    | "team_invite"
    | "branch_invite"
    | "agent_invite"
    | "developer_access_invite";
  to: string;
  inviteLink?: string;
  invite_link?: string;
  onboardingLink?: string;
  onboarding_link?: string;
  inviteeName?: string;
  invitee_name?: string;
  agentName?: string;
  agent_name?: string;
  inviterName?: string;
  inviter_name?: string;
  organisationName?: string;
  organisation_name?: string;
  organisationId?: string;
  organisation_id?: string;
  branchId?: string;
  branch_id?: string;
  organisationLogoUrl?: string;
  organisation_logo_url?: string;
  organisationLogoIconUrl?: string;
  organisation_logo_icon_url?: string;
  brandPrimaryColor?: string;
  brand_primary_color?: string;
  workspaceRole?: string;
  workspace_role?: string;
  supportEmail?: string;
  support_email?: string;
};

export type SendDevelopmentMarketingInvitePayload = {
  type: "development_marketing_invite";
  to: string;
  inviteLink?: string;
  invite_link?: string;
  inviteeName?: string;
  invitee_name?: string;
  inviterName?: string;
  inviter_name?: string;
  developmentName?: string;
  development_name?: string;
  accessRole?: string;
  access_role?: string;
  expiresAt?: string;
  expires_at?: string;
  organisationId?: string;
  organisation_id?: string;
  organisationName?: string;
  organisation_name?: string;
  organisationLogoUrl?: string;
  organisation_logo_url?: string;
  supportEmail?: string;
  support_email?: string;
};

export type SendNotificationReminderDispatchPayload = {
  type:
    | "notification_reminder_dispatch"
    | "notification_reminder_dispatcher"
    | "dispatch_notification_reminders"
    | "notification_reminders_dispatch";
  eventId?: string;
  event_id?: string;
  limit?: number;
  dispatchLimit?: number;
  dispatch_limit?: number;
  queueDue?: boolean;
  queue_due?: boolean;
  queueLimit?: number;
  queue_limit?: number;
  resetStale?: boolean;
  reset_stale?: boolean;
  dryRun?: boolean;
  dry_run?: boolean;
  now?: string;
};

export type SendTransactionProgressDispatchPayload = {
  type: "transaction_progress_dispatch" | "transaction_progress_resend";
  transactionId?: string;
  transaction_id?: string;
  eventId?: string;
  event_id?: string;
  resend?: boolean;
  limit?: number;
};

export type SendTransactionOperationsNotificationPayload = {
  type:
    | "transaction_operations_notification"
    | "transaction_operations_dispatch"
    | "transaction_operations_resend"
    | "transaction_operations_notifications_dispatch"
    | "transaction_created"
    | "transaction_owner_changed"
    | "transaction_roleplayer_assigned"
    | "transaction_roleplayer_reassigned"
    | "transaction_partner_accepted"
    | "transaction_partner_declined"
    | "attorney_invite_accepted"
    | "bond_originator_invite_accepted"
    | "transaction_stage_changed"
    | "transaction_stalled"
    | "transaction_cancelled"
    | "transaction_archived"
    | "transaction_reactivated";
  to?: string;
  eventKind?: string;
  event_kind?: string;
  transactionId?: string;
  transaction_id?: string;
  eventId?: string;
  event_id?: string;
  organisationId?: string;
  organisation_id?: string;
  organisationName?: string;
  organisation_name?: string;
  recipientName?: string;
  recipient_name?: string;
  recipientRole?: string;
  recipient_role?: string;
  subject?: string;
  title?: string;
  message?: string;
  actionLink?: string;
  action_link?: string;
  transactionReference?: string;
  transaction_reference?: string;
  propertyLabel?: string;
  property_label?: string;
  stage?: string;
  currentStage?: string;
  previousStage?: string;
  previous_stage?: string;
  status?: string;
  ownerName?: string;
  owner_name?: string;
  ownerEmail?: string;
  owner_email?: string;
  previousOwnerName?: string;
  previous_owner_name?: string;
  previousOwnerEmail?: string;
  previous_owner_email?: string;
  roleLabel?: string;
  role_label?: string;
  partnerName?: string;
  partner_name?: string;
  partnerEmail?: string;
  partner_email?: string;
  reason?: string;
  nextAction?: string;
  next_action?: string;
  metadata?: Record<string, unknown>;
  limit?: number;
  queueDue?: boolean;
  queue_due?: boolean;
  queueLimit?: number;
  queue_limit?: number;
  dryRun?: boolean;
  dry_run?: boolean;
  now?: string;
  stalledAfterDays?: number;
  stalled_after_days?: number;
};

export type SendClientSellerPortalNotificationPayload = {
  type:
    | "client_seller_portal_notification"
    | "client_seller_portal_dispatch"
    | "client_seller_portal_resend"
    | "client_seller_portal_notifications_dispatch"
    | "offer_viewed_by_seller"
    | "offer_not_reviewed_reminder"
    | "offer_review_overdue_escalation"
    | "seller_mandate_viewed_unsigned_reminder"
    | "seller_mandate_signing_overdue_escalation"
    | "buyer_onboarding_opened"
    | "buyer_onboarding_started_not_submitted_reminder"
    | "buyer_onboarding_overdue_escalation"
    | "buyer_onboarding_submitted_confirmation"
    | "client_portal_message_received"
    | "client_portal_document_uploaded"
    | "client_portal_document_rejected";
  to?: string;
  eventKind?: string;
  event_kind?: string;
  eventId?: string;
  event_id?: string;
  organisationId?: string;
  organisation_id?: string;
  organisationName?: string;
  organisation_name?: string;
  transactionId?: string;
  transaction_id?: string;
  transactionReference?: string;
  transaction_reference?: string;
  listingId?: string;
  listing_id?: string;
  offerId?: string;
  offer_id?: string;
  offerReference?: string;
  offer_reference?: string;
  recipientName?: string;
  recipient_name?: string;
  recipientRole?: string;
  recipient_role?: string;
  subject?: string;
  title?: string;
  message?: string;
  actionLink?: string;
  action_link?: string;
  ctaLabel?: string;
  cta_label?: string;
  propertyLabel?: string;
  property_label?: string;
  buyerName?: string;
  buyer_name?: string;
  buyerEmail?: string;
  buyer_email?: string;
  sellerName?: string;
  seller_name?: string;
  sellerEmail?: string;
  seller_email?: string;
  agentName?: string;
  agent_name?: string;
  agentEmail?: string;
  agent_email?: string;
  portalLabel?: string;
  portal_label?: string;
  documentTitle?: string;
  document_title?: string;
  documentStatus?: string;
  document_status?: string;
  reason?: string;
  nextAction?: string;
  next_action?: string;
  metadata?: Record<string, unknown>;
  limit?: number;
  queueDue?: boolean;
  queue_due?: boolean;
  queueLimit?: number;
  queue_limit?: number;
  dryRun?: boolean;
  dry_run?: boolean;
  now?: string;
};

export type SendBondAttorneyLegalNotificationPayload = {
  type:
    | "bond_attorney_legal_notification"
    | "bond_attorney_legal_dispatch"
    | "bond_attorney_legal_resend"
    | "bond_attorney_legal_notifications_dispatch"
    | "bond_application_submitted"
    | "bond_application_status_changed"
    | "bond_additional_documents_requested"
    | "bond_document_uploaded"
    | "bond_bank_offer_received"
    | "bond_bank_offer_buyer_decision"
    | "bond_grant_received"
    | "bond_grant_published"
    | "bond_delivery_failed"
    | "attorney_instruction_ready"
    | "attorney_instruction_accepted"
    | "attorney_instruction_declined"
    | "attorney_assignment_changed"
    | "attorney_matter_stage_changed"
    | "attorney_client_financial_document_published"
    | "legal_packet_generated"
    | "legal_packet_sent_for_signing"
    | "legal_signer_viewed"
    | "legal_signer_signed"
    | "legal_packet_completed"
    | "legal_signing_dispatch_failed";
  to?: string;
  eventKind?: string;
  event_kind?: string;
  eventId?: string;
  event_id?: string;
  organisationId?: string;
  organisation_id?: string;
  organisationName?: string;
  organisation_name?: string;
  transactionId?: string;
  transaction_id?: string;
  transactionReference?: string;
  transaction_reference?: string;
  packetId?: string;
  packet_id?: string;
  packetTitle?: string;
  packet_title?: string;
  packetType?: string;
  packet_type?: string;
  recipientName?: string;
  recipient_name?: string;
  recipientRole?: string;
  recipient_role?: string;
  subject?: string;
  title?: string;
  message?: string;
  actionLink?: string;
  action_link?: string;
  ctaLabel?: string;
  cta_label?: string;
  propertyLabel?: string;
  property_label?: string;
  workflowLabel?: string;
  workflow_label?: string;
  status?: string;
  previousStatus?: string;
  previous_status?: string;
  institutionName?: string;
  institution_name?: string;
  partyName?: string;
  party_name?: string;
  partyEmail?: string;
  party_email?: string;
  documentTitle?: string;
  document_title?: string;
  signerName?: string;
  signer_name?: string;
  signerRole?: string;
  signer_role?: string;
  amountLabel?: string;
  amount_label?: string;
  reason?: string;
  nextAction?: string;
  next_action?: string;
  metadata?: Record<string, unknown>;
  limit?: number;
};

export type SendWeeklyDigestNotificationPayload = {
  type:
    | "weekly_digest_notification"
    | "weekly_digest_dispatch"
    | "weekly_digest_resend"
    | "weekly_digest_notifications_dispatch"
    | "agent_weekly_lead_digest"
    | "agent_weekly_transaction_digest"
    | "agent_weekly_task_digest"
    | "manager_weekly_team_digest"
    | "principal_weekly_business_digest"
    | "seller_weekly_listing_digest"
    | "buyer_weekly_transaction_digest"
    | "attorney_weekly_matter_digest"
    | "bond_originator_weekly_pipeline_digest"
    | "commercial_weekly_pipeline_digest";
  to?: string;
  eventKind?: string;
  event_kind?: string;
  eventId?: string;
  event_id?: string;
  organisationId?: string;
  organisation_id?: string;
  organisationName?: string;
  organisation_name?: string;
  recipientName?: string;
  recipient_name?: string;
  recipientRole?: string;
  recipient_role?: string;
  subject?: string;
  title?: string;
  message?: string;
  actionLink?: string;
  action_link?: string;
  ctaLabel?: string;
  cta_label?: string;
  reportPeriod?: string;
  report_period?: string;
  periodStart?: string;
  period_start?: string;
  periodEnd?: string;
  period_end?: string;
  summaryItems?: Array<Record<string, unknown>>;
  summary_items?: Array<Record<string, unknown>>;
  sections?: Array<Record<string, unknown>>;
  metrics?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  limit?: number;
  queueDue?: boolean;
  queue_due?: boolean;
  queueLimit?: number;
  queue_limit?: number;
  dryRun?: boolean;
  dry_run?: boolean;
  now?: string;
};

export type SendCommercialEnterpriseNotificationPayload = {
  type:
    | "commercial_enterprise_notification"
    | "commercial_enterprise_dispatch"
    | "commercial_enterprise_resend"
    | "commercial_enterprise_notifications_dispatch"
    | "agency_public_intake_received"
    | "commercial_access_requested"
    | "commercial_access_decision"
    | "commercial_broker_assigned"
    | "commercial_canvassing_prospect_created"
    | "commercial_requirement_created"
    | "commercial_requirement_stage_changed"
    | "commercial_deal_created"
    | "commercial_deal_stage_changed"
    | "commercial_viewing_scheduled"
    | "commercial_viewing_status_changed"
    | "commercial_document_request_created"
    | "commercial_document_uploaded"
    | "commercial_heads_of_terms_status_changed"
    | "commercial_transaction_status_changed"
    | "enterprise_member_scope_changed"
    | "enterprise_branch_team_assignment_changed";
  to?: string;
  eventKind?: string;
  event_kind?: string;
  eventId?: string;
  event_id?: string;
  organisationId?: string;
  organisation_id?: string;
  organisationName?: string;
  organisation_name?: string;
  recipientName?: string;
  recipient_name?: string;
  recipientRole?: string;
  recipient_role?: string;
  subject?: string;
  title?: string;
  message?: string;
  actionLink?: string;
  action_link?: string;
  ctaLabel?: string;
  cta_label?: string;
  entityId?: string;
  entity_id?: string;
  entityType?: string;
  entity_type?: string;
  entityLabel?: string;
  entity_label?: string;
  status?: string;
  previousStatus?: string;
  previous_status?: string;
  brokerName?: string;
  broker_name?: string;
  brokerEmail?: string;
  broker_email?: string;
  branchName?: string;
  branch_name?: string;
  teamName?: string;
  team_name?: string;
  requesterName?: string;
  requester_name?: string;
  requesterEmail?: string;
  requester_email?: string;
  clientName?: string;
  client_name?: string;
  propertyLabel?: string;
  property_label?: string;
  amountLabel?: string;
  amount_label?: string;
  nextAction?: string;
  next_action?: string;
  metadata?: Record<string, unknown>;
  limit?: number;
};

export type SendTransactionPartnerInvitationPayload = {
  type: "transaction_partner_invitation" | "partner_transaction_invite";
  transactionId?: string;
  transaction_id?: string;
  organisationId?: string;
  organisation_id?: string;
  to: string;
  roleType?: string;
  role_type?: string;
  roleLabel?: string;
  role_label?: string;
  transactionReference?: string;
  transaction_reference?: string;
  propertyLabel?: string;
  property_label?: string;
  buyerLabel?: string;
  buyer_label?: string;
  companyName?: string;
  company_name?: string;
  contactName?: string;
  contact_name?: string;
  invitationLink?: string;
  invitation_link?: string;
  invitedByOrganisation?: string;
  invited_by_organisation?: string;
  partnerProspectId?: string | null;
  partner_prospect_id?: string | null;
  reusedProspect?: boolean;
  reused_prospect?: boolean;
  deliveryKind?: string;
  delivery_kind?: string;
};

export type SendOrganisationPartnerInvitationPayload = {
  type:
    | "organisation_partner_invitation"
    | "organization_partner_invitation"
    | "partner_organisation_invitation"
    | "partner_organization_invitation";
  to: string;
  organisationId?: string;
  organisation_id?: string;
  invitationId?: string;
  invitation_id?: string;
  inviteUrl?: string;
  invite_url?: string;
  invitationLink?: string;
  invitation_link?: string;
  invitingOrganisationName?: string;
  inviting_organisation_name?: string;
  invitingOrganisationLogoUrl?: string;
  inviting_organisation_logo_url?: string;
  invitedByOrganisation?: string;
  invited_by_organisation?: string;
  invitedByOrganisationLogoUrl?: string;
  invited_by_organisation_logo_url?: string;
  partnerName?: string;
  partner_name?: string;
  partnerOrganisationName?: string;
  partner_organisation_name?: string;
  partnerLogoUrl?: string;
  partner_logo_url?: string;
  partnerOrganisationLogoUrl?: string;
  partner_organisation_logo_url?: string;
  partnerType?: string;
  partner_type?: string;
  relationshipType?: string;
  relationship_type?: string;
  scopeLabel?: string;
  scope_label?: string;
  scopeType?: string;
  scope_type?: string;
  scopeName?: string;
  scope_name?: string;
  expiryDays?: number | string;
  expiry_days?: number | string;
  expiresAt?: string;
  expires_at?: string;
  supportEmail?: string;
  support_email?: string;
  supportPhone?: string;
  support_phone?: string;
  arch9Website?: string;
  arch9_website?: string;
  preferred?: boolean;
  message?: string;
  recipientName?: string;
  recipient_name?: string;
};

export type SendSellerOnboardingPayload = {
  type:
    | "seller_onboarding"
    | "seller_onboarding_link"
    | "seller_onboarding_follow_up"
    | "seller_portal_link";
  to: string;
  organisationId?: string;
  leadId?: string;
  listingId?: string;
  sellerName?: string;
  propertyTitle?: string;
  propertyType?: string;
  onboardingUrl?: string;
  onboarding_url?: string;
  onboardingLink?: string;
  portalLink?: string;
  emailKind?:
    | "onboarding"
    | "portal_documents"
    | "existing_listing"
    | "seller_lead"
    | string;
  activationSource?:
    | "seller_lead"
    | "existing_listing"
    | "manual_listing"
    | "bulk_import"
    | "agent_invitation"
    | string;
  transactionReference?: string;
  agentName?: string;
  agentEmail?: string;
  agent_email?: string;
  agentPhone?: string;
  agent_phone?: string;
  agencyName?: string;
  agency_name?: string;
  agencyLogo?: string;
  agency_logo?: string;
  agencyLogoUrl?: string;
  agency_logo_url?: string;
  expiryDays?: number | string;
  expiry_days?: number | string;
  expiresAt?: string;
  expires_at?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  requiredDocuments?: Array<{
    id?: string;
    key?: string;
    name?: string;
    label?: string;
    description?: string;
    priority?: string;
    dueDate?: string;
    isReplacement?: boolean;
  }>;
  sellerStructure?: Record<string, unknown> | string | null;
  documentPackSource?: string;
  documentPackRequirementKeys?: string[];
  documentPackFingerprint?: string;
  workflowDedupeKey?: string;
  outstandingDocumentCount?: number;
};

export type SendCommercialLandlordOnboardingPayload = {
  type: "commercial_landlord_onboarding";
  to: string;
  recipientName?: string;
  landlordName?: string;
  brokerageName?: string;
  brokerName?: string;
  brokerEmail?: string;
  brokerPhone?: string;
  secureLink?: string;
  onboardingLink?: string;
  actionLink?: string;
  messageKind?:
    | "initial_request"
    | "reminder"
    | "missing_information"
    | "completion_confirmation"
    | string;
  entityType?: string;
  missingFields?: string[];
  missingDocuments?: string[];
  completionPercentage?: number;
};

export type SendAgencyOnboardingPayload = {
  type: "agency_onboarding";
  to: string;
  recipientName?: string;
  agencyName?: string;
  legalEntityName?: string;
  principalName?: string;
  principalEmail?: string;
  principalPhone?: string;
  secureLink?: string;
  onboardingLink?: string;
  actionLink?: string;
  messageKind?:
    | "initial_request"
    | "reminder"
    | "link_replaced"
    | "submission_confirmation"
    | string;
  planName?: string;
  planSummary?: string;
};

export type SendSellerOnboardingSubmittedPayload = {
  type: "seller_onboarding_submitted";
  to?: string;
  agentName?: string;
  agentEmail?: string;
  assignedAgentEmail?: string;
  sellerName?: string;
  sellerEmail?: string;
  seller_email?: string;
  sellerPortalLink?: string;
  seller_portal_link?: string;
  sellerPortalToken?: string;
  seller_portal_token?: string;
  sellerPortalInvitePolicy?: string;
  seller_portal_invite_policy?: string;
  deferSellerPortalLinkUntilMandateSigned?: boolean | string;
  defer_seller_portal_link_until_mandate_signed?: boolean | string;
  portalLink?: string;
  propertyTitle?: string;
  transactionReference?: string;
  organisationId?: string;
  organisationName?: string;
  leadId?: string;
  listingId?: string;
  assignedAgentId?: string;
  actionLink?: string;
};

export type SendSellerMandateSentPayload = {
  type: "seller_mandate_sent";
  to: string;
  organisationId?: string;
  packetId?: string;
  mandateId?: string;
  recipientRole?: "agent" | "seller" | "purchaser";
  recipientName?: string;
  sellerName?: string;
  propertyTitle?: string;
  mandateType?: string;
  mandateStartDate?: string;
  mandateEndDate?: string;
  askingPrice?: string;
  portalLink?: string;
  reminder?: boolean;
  resend?: boolean;
  agentName?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  idempotencyKey?: string;
};

export type SendSellerMandateSignedPayload = {
  type: "seller_mandate_signed";
  to: string;
  packetType?: "mandate" | "otp";
  documentLabel?: string;
  idempotencyKey?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  agentName?: string;
  sellerName?: string;
  recipientName?: string;
  propertyTitle?: string;
  signedAt?: string;
  signedDocumentName?: string;
  downloadLink?: string;
};

export type SendBuyerOfferLinkPayload = {
  type: "buyer_offer_link" | "offer_link" | "post_viewing_offer_link";
  to: string;
  buyerName?: string;
  propertyTitle?: string;
  propertyCount?: number;
  offerLink?: string;
  expiresAt?: string;
  agentName?: string;
  agentEmail?: string;
  agent_email?: string;
  note?: string;
  organisationName?: string;
  organisationLogoUrl?: string;
  organisation_logo_url?: string;
  organisationLogoLightUrl?: string;
  organisation_logo_light_url?: string;
  organisationLogoDarkUrl?: string;
  organisation_logo_dark_url?: string;
  organisationLogoIconUrl?: string;
  organisation_logo_icon_url?: string;
  organisationBrandPrimaryColor?: string;
  organisation_brand_primary_color?: string;
  organisationBrandSecondaryColor?: string;
  organisation_brand_secondary_color?: string;
  supportEmail?: string;
  supportPhone?: string;
  replyTo?: string;
  reply_to?: string;
  fromName?: string;
  from_name?: string;
} & DeliveryContextPayload;

export type SendLeadPropertySharePayload = {
  type:
    | "lead_property_share"
    | "property_collection"
    | "property_collection_email"
    | "buyer_property_collection";
  to: string;
  subject?: string;
  message?: string;
  text?: string;
  html?: string;
  metadata?: JsonRecord;
} & DeliveryContextPayload;

export type ViewingAvailabilityRequestPropertyPayload = {
  id?: string;
  title?: string;
  name?: string;
  address?: string;
  price?: string;
  priceLabel?: string;
  area?: string;
  suburb?: string;
  location?: string;
  match?: string;
  matchLabel?: string;
  imageUrl?: string;
  image_url?: string;
  image?: string;
  thumbnailUrl?: string;
  thumbnail_url?: string;
  link?: string;
  url?: string;
  sellerViewingAvailability?: string;
  seller_viewing_availability?: string;
  sellerViewingAvailabilityWindows?: string;
  seller_viewing_availability_windows?: string;
  sellerViewingAccessInstructions?: string;
  seller_viewing_access_instructions?: string;
  sellerViewingNoticePeriod?: string;
  seller_viewing_notice_period?: string;
  sellerViewingNoticeRequired?: boolean;
  seller_viewing_notice_required?: boolean;
};

export type SendBuyerViewingAvailabilityRequestPayload = {
  type:
    | "buyer_viewing_availability_request"
    | "buyer_viewing_request"
    | "viewing_availability_request";
  to: string;
  subject?: string;
  buyerName?: string;
  recipientName?: string;
  recipient_name?: string;
  agentName?: string;
  agent_name?: string;
  agentEmail?: string;
  agent_email?: string;
  agentAvatarUrl?: string;
  agent_avatar_url?: string;
  agentPhotoUrl?: string;
  agent_photo_url?: string;
  agentCardUrl?: string;
  agent_card_url?: string;
  agentDigitalCardUrl?: string;
  agent_digital_card_url?: string;
  digitalContactCardUrl?: string;
  digital_contact_card_url?: string;
  note?: string;
  message?: string;
  actionLink?: string;
  action_link?: string;
  preferenceLink?: string;
  preference_link?: string;
  propertyCount?: number;
  properties?: ViewingAvailabilityRequestPropertyPayload[];
  organisationName?: string;
  organisation_name?: string;
  organisationId?: string;
  organisation_id?: string;
  leadId?: string;
  lead_id?: string;
  recipientRole?: string;
  recipient_role?: string;
  supportEmail?: string;
  support_email?: string;
  supportPhone?: string;
  support_phone?: string;
  resend?: boolean;
  idempotencyKey?: string;
  idempotency_key?: string;
  deliveryMetadata?: JsonRecord;
  delivery_metadata?: JsonRecord;
} & DeliveryContextPayload;

export type SellerViewingAvailabilityRequestPropertyPayload = {
  id?: string;
  title?: string;
  name?: string;
  address?: string;
  price?: string;
  priceLabel?: string;
  area?: string;
  suburb?: string;
  location?: string;
  match?: string;
  matchLabel?: string;
  imageUrl?: string;
  image_url?: string;
  image?: string;
  thumbnailUrl?: string;
  thumbnail_url?: string;
  link?: string;
  url?: string;
  sellerViewingAvailability?: string;
  seller_viewing_availability?: string;
  sellerViewingAvailabilityWindows?: string;
  seller_viewing_availability_windows?: string;
  sellerViewingAccessInstructions?: string;
  seller_viewing_access_instructions?: string;
  sellerViewingNoticePeriod?: string;
  seller_viewing_notice_period?: string;
  sellerViewingNoticeRequired?: boolean;
  seller_viewing_notice_required?: boolean;
};

export type SendSellerViewingAvailabilityRequestPayload = {
  type:
    | "seller_viewing_availability_request"
    | "seller_viewing_request"
    | "viewing_access_availability_request";
  to: string | string[];
  recipients?: string | string[];
  subject?: string;
  sellerName?: string;
  recipientName?: string;
  buyerName?: string;
  agentName?: string;
  agentEmail?: string;
  availabilityWindows?: string;
  coordinationNotes?: string;
  note?: string;
  message?: string;
  actionLink?: string;
  action_link?: string;
  sellerCoordinationLink?: string;
  seller_coordination_link?: string;
  propertyCount?: number;
  properties?: SellerViewingAvailabilityRequestPropertyPayload[];
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  resend?: boolean;
  idempotencyKey?: string;
  idempotency_key?: string;
} & DeliveryContextPayload;

export type SendBuyerOfferSubmittedAgentPayload = {
  type:
    | "buyer_offer_submitted_agent"
    | "buyer_offer_submitted"
    | "offer_submitted_agent";
  to: string;
  agentName?: string;
  buyerName?: string;
  propertyTitle?: string;
  offerAmount?: string;
  financeType?: string;
  offerSubmittedAt?: string;
  agentReviewUrl?: string;
  note?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
} & DeliveryContextPayload;

export type SendSellerOfferReviewPayload = {
  type: "seller_offer_review" | "offer_seller_review";
  to: string;
  sellerName?: string;
  propertyTitle?: string;
  buyerName?: string;
  offerAmount?: string;
  reviewLink?: string;
  expiresAt?: string;
  agentName?: string;
  agentEmail?: string;
  agent_email?: string;
  note?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
} & DeliveryContextPayload;

export type SendOfferDecisionNotificationPayload = {
  type:
    | "offer_decision_notification"
    | "seller_offer_decision"
    | "offer_accepted_notification";
  to: string;
  recipientName?: string;
  recipientRole?: "agent" | "buyer" | "seller" | string;
  decision?: "accepted" | "rejected" | "countered" | string;
  propertyTitle?: string;
  buyerName?: string;
  sellerName?: string;
  agentName?: string;
  offerAmount?: string;
  decisionNotes?: string;
  nextStep?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
} & DeliveryContextPayload;

export type SendTransactionRoleplayerIntroPayload = {
  type:
    | "transaction_roleplayer_intro"
    | "roleplayer_intro"
    | "transaction_handoff_intro";
  transactionId: string;
  to?: string;
  recipientName?: string;
  resend?: boolean;
};

export type SendTransactionRoleplayerHandoffPayload = {
  type:
    | "transaction_roleplayer_handoff"
    | "roleplayer_handoff"
    | "transaction_team_handoff";
  transactionId: string;
  resend?: boolean;
};

export type SendAppointmentEmailPayload = {
  type:
    | "appointment_scheduled"
    | "appointment_confirmed"
    | "appointment_updated"
    | "appointment_cancelled"
    | "appointment_rescheduled"
    | "appointment_confirmation_required"
    | "appointment_reminder"
    | "appointment_documents_required";
  to: string;
  appointmentId?: string;
  participantId?: string;
  rsvpToken?: string;
  recipientName?: string;
  participantRole?: string;
  appointmentType?: string;
  appointmentTitle?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  appointmentEndTime?: string;
  timezone?: string;
  organisationId?: string;
  organisationName?: string;
  organisationLogoUrl?: string;
  organisation_logo_url?: string;
  organisationLogoLightUrl?: string;
  organisation_logo_light_url?: string;
  organisationLogoDarkUrl?: string;
  organisation_logo_dark_url?: string;
  organisationLogoIconUrl?: string;
  organisation_logo_icon_url?: string;
  organisationBrandPrimaryColor?: string;
  organisation_brand_primary_color?: string;
  organisationBrandSecondaryColor?: string;
  organisation_brand_secondary_color?: string;
  supportEmail?: string;
  support_email?: string;
  supportPhone?: string;
  support_phone?: string;
  relatedListing?: string;
  location?: string;
  status?: string;
  notes?: string;
  transactionId?: string;
  actionLink?: string;
  acceptLink?: string;
  declineLink?: string;
  rescheduleLink?: string;
  meetingUrl?: string;
  organizerName?: string;
  organizerEmail?: string;
  agentName?: string;
  agentEmail?: string;
  agentRole?: string;
  agentBio?: string;
  agentPhone?: string;
  fromName?: string;
  from_name?: string;
  fromEmail?: string;
  from_email?: string;
  replyTo?: string;
  attachCalendarInvite?: boolean;
};

export type TransactionOnboardingRow = {
  id: string;
  transaction_id: string;
  token: string;
  status: string;
  purchaser_type: string | null;
  submitted_at: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ReservationPaymentDetails = {
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  branch_code: string;
  account_type: string;
  payment_reference_format: string;
  payment_instructions: string;
};

export type ReservationDepositEmailPayload = {
  buyerName: string;
  buyerEmail: string;
  developmentName: string;
  unitLabel: string;
  transactionReference?: string;
  paymentDeadline?: string;
  reservationDepositEnabled: boolean;
  reservationDepositAmount: number;
  formattedReservationDepositAmount: string;
  paymentReference: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  branchCode: string;
  accountType: string;
  paymentInstructions: string;
  uploadProofLink: string;
};

export type OnboardingSubmittedEmailPayload = {
  buyerName: string;
  buyerEmail: string;
  developmentName: string;
  unitLabel: string;
  transactionReference: string;
  clientPortalLink: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  branding?: JsonRecord;
};

export type ReservationDepositReceivedEmailPayload = {
  buyerName: string;
  buyerEmail: string;
  developmentName: string;
  unitLabel: string;
  transactionReference: string;
  clientPortalLink: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
  branding?: JsonRecord;
};
