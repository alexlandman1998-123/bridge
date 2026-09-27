function recordedNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= 5_000_000
    ? Math.round(amount)
    : null;
}

export function normalizeContractCostEvidence(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    credits: recordedNumber(input.credits),
    fieldCost: recordedNumber(input.fieldCost),
    typeCost: recordedNumber(input.typeCost),
    surcharge: recordedNumber(input.surcharge),
  };
}

export function hasRecordedContractEvidence(check) {
  return check?.status === "passed" &&
    Array.isArray(check.observed_field_manifest) &&
    check.observed_field_manifest.some((field) => typeof field === "string" && field.trim()) &&
    normalizeContractCostEvidence(check.cost_evidence).credits !== null;
}
