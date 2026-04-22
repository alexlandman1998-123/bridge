import type { TransactionOnboardingRow } from "../types.ts";

export function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toTimestamp(value: unknown) {
  const parsed = Date.parse(normalizeText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function pickMostRecentOnboardingRow(rows: TransactionOnboardingRow[]) {
  return rows.reduce<TransactionOnboardingRow | null>((latest, row) => {
    if (!latest) {
      return row;
    }

    const rowTimestamp = toTimestamp(row.updated_at || row.created_at);
    const latestTimestamp = toTimestamp(latest.updated_at || latest.created_at);
    if (rowTimestamp === latestTimestamp) {
      return String(row.id) > String(latest.id) ? row : latest;
    }
    return rowTimestamp > latestTimestamp ? row : latest;
  }, null);
}
