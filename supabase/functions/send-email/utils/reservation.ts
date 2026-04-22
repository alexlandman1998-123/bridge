import type { ReservationPaymentDetails } from "../types.ts";
import { normalizeText } from "./text.ts";

const RESERVATION_STATUSES = ["not_required", "pending", "paid", "verified"] as const;

export function normalizeOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

export function normalizeReservationStatus(value: unknown, { required = false } = {}) {
  const normalized = normalizeText(value).toLowerCase();

  if (RESERVATION_STATUSES.includes(normalized as (typeof RESERVATION_STATUSES)[number])) {
    if (!required && normalized !== "not_required") {
      return "not_required";
    }
    return normalized;
  }

  if (!required) {
    return "not_required";
  }

  if (normalized === "complete" || normalized === "completed") {
    return "paid";
  }

  return "pending";
}

export function normalizeReservationPaymentDetails(input: unknown): ReservationPaymentDetails {
  const source = input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};
  return {
    account_holder_name: normalizeText(source.account_holder_name || source.accountHolderName),
    bank_name: normalizeText(source.bank_name || source.bankName),
    account_number: normalizeText(source.account_number || source.accountNumber),
    branch_code: normalizeText(source.branch_code || source.branchCode),
    account_type: normalizeText(source.account_type || source.accountType),
    payment_reference_format: normalizeText(
      source.payment_reference_format || source.paymentReferenceFormat,
    ),
    payment_instructions: normalizeText(
      source.payment_instructions || source.paymentInstructions,
    ),
  };
}

export function hasReservationPaymentDetails(details: ReservationPaymentDetails) {
  return Boolean(
    details.account_holder_name ||
      details.bank_name ||
      details.account_number ||
      details.branch_code ||
      details.account_type ||
      details.payment_reference_format ||
      details.payment_instructions,
  );
}

export function buildReservationPaymentReference({
  referenceFormat = "",
  unitNumber = "",
  transactionId = "",
  buyerName = "",
}: {
  referenceFormat?: string;
  unitNumber?: string;
  transactionId?: string;
  buyerName?: string;
}) {
  const base = normalizeText(referenceFormat) || "RES-{unit}-{txn}";
  const compactTransactionId = String(transactionId || "").replaceAll("-", "").slice(0, 8)
    .toUpperCase();
  const compactBuyerName = String(buyerName || "").trim().replace(/\s+/g, " ").slice(0, 30);

  return base
    .replaceAll("{unit}", unitNumber ? String(unitNumber).trim() : "UNIT")
    .replaceAll("{txn}", compactTransactionId || "TXN")
    .replaceAll("{buyer}", compactBuyerName || "BUYER");
}

export function formatZarCurrency(amount: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);
}
