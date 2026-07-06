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

export type SendClientOnboardingPayload = {
  type: "client_onboarding";
  transactionId: string;
  resend?: boolean;
  source?: string;
  deliveryMode?: "digital_portal" | "agent_assisted" | "hard_copy" | string;
  skipEmail?: boolean;
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
    | "arch9_concierge_internal_notification";
  to: string;
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
  type: "workspace_invite" | "team_invite" | "branch_invite" | "agent_invite";
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
  invitationLink?: string;
  invitation_link?: string;
  invitedByOrganisation?: string;
  invited_by_organisation?: string;
  partnerOrganisationName?: string;
  partner_organisation_name?: string;
  partnerType?: string;
  partner_type?: string;
  relationshipType?: string;
  relationship_type?: string;
  scopeType?: string;
  scope_type?: string;
  scopeName?: string;
  scope_name?: string;
  preferred?: boolean;
  message?: string;
};

export type SendSellerOnboardingPayload = {
  type: "seller_onboarding" | "seller_onboarding_link" | "seller_portal_link";
  to: string;
  organisationId?: string;
  leadId?: string;
  listingId?: string;
  sellerName?: string;
  propertyTitle?: string;
  propertyType?: string;
  onboardingLink?: string;
  portalLink?: string;
  emailKind?: "onboarding" | "portal_documents" | string;
  transactionReference?: string;
  agentName?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
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

export type SendSellerOnboardingSubmittedPayload = {
  type: "seller_onboarding_submitted";
  to?: string;
  agentName?: string;
  sellerName?: string;
  propertyTitle?: string;
  transactionReference?: string;
  organisationId?: string;
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
  recipientRole?: "agent" | "seller";
  recipientName?: string;
  sellerName?: string;
  propertyTitle?: string;
  mandateType?: string;
  mandateStartDate?: string;
  mandateEndDate?: string;
  askingPrice?: string;
  portalLink?: string;
  agentName?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
};

export type SendSellerMandateSignedPayload = {
  type: "seller_mandate_signed";
  to: string;
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
  note?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
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
};

export type ReservationDepositReceivedEmailPayload = {
  buyerName: string;
  buyerEmail: string;
  developmentName: string;
  unitLabel: string;
  transactionReference: string;
  clientPortalLink: string;
};
