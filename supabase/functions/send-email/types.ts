export type JsonRecord = Record<string, unknown>;

export type SendClientOnboardingPayload = {
  type: "client_onboarding";
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

export type SendLegacyTestPayload = {
  to: string;
  name?: string;
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
