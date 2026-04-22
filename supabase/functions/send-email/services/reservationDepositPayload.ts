import type {
  ReservationDepositEmailPayload,
  ReservationPaymentDetails,
} from "../types.ts";
import { formatZarCurrency } from "../utils/reservation.ts";

export function buildReservationDepositEmailPayload({
  buyerName,
  buyerEmail,
  developmentName,
  unitLabel,
  transactionReference = "",
  paymentDeadline = "",
  reservationDepositAmount,
  paymentReference,
  paymentDetails,
  uploadProofLink = "",
}: {
  buyerName: string;
  buyerEmail: string;
  developmentName: string;
  unitLabel: string;
  transactionReference?: string;
  paymentDeadline?: string;
  reservationDepositAmount: number;
  paymentReference: string;
  paymentDetails: ReservationPaymentDetails;
  uploadProofLink?: string;
}): ReservationDepositEmailPayload {
  return {
    buyerName,
    buyerEmail,
    developmentName,
    unitLabel,
    transactionReference,
    paymentDeadline,
    reservationDepositEnabled: true,
    reservationDepositAmount,
    formattedReservationDepositAmount: formatZarCurrency(reservationDepositAmount),
    paymentReference,
    accountName: paymentDetails.account_holder_name,
    bankName: paymentDetails.bank_name,
    accountNumber: paymentDetails.account_number,
    branchCode: paymentDetails.branch_code,
    accountType: paymentDetails.account_type,
    paymentInstructions: paymentDetails.payment_instructions,
    uploadProofLink,
  };
}
