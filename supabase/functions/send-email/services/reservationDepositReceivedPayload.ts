import type { ReservationDepositReceivedEmailPayload } from "../types.ts";

export function buildReservationDepositReceivedEmailPayload({
  buyerName,
  buyerEmail,
  developmentName,
  unitLabel,
  transactionReference = "",
  clientPortalLink = "",
}: {
  buyerName: string;
  buyerEmail: string;
  developmentName: string;
  unitLabel: string;
  transactionReference?: string;
  clientPortalLink?: string;
}): ReservationDepositReceivedEmailPayload {
  return {
    buyerName,
    buyerEmail,
    developmentName,
    unitLabel,
    transactionReference,
    clientPortalLink,
  };
}
