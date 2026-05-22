export type JsonRecord = Record<string, unknown>;

export type SendClientOnboardingPayload = {
  type: "client_onboarding";
  transactionId: string;
  resend?: boolean;
};

export type SendOnboardingSubmittedPayload = {
  type: "onboarding_submitted";
  transactionId: string;
  resend?: boolean;
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
  to: string;
  name?: string;
};

export type SendSellerOnboardingPayload = {
  type: "seller_onboarding";
  to: string;
  organisationId?: string;
  sellerName?: string;
  propertyTitle?: string;
  onboardingLink?: string;
  transactionReference?: string;
  agentName?: string;
  organisationName?: string;
  supportEmail?: string;
  supportPhone?: string;
};

export type SendSellerOnboardingSubmittedPayload = {
  type: "seller_onboarding_submitted";
  to: string;
  agentName?: string;
  sellerName?: string;
  propertyTitle?: string;
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
