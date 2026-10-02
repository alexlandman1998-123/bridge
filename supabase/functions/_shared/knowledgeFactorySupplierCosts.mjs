// ES module shared by Vercel and Supabase supplier report paths. Supplier credits are not
// the customer price. Never turn missing evidence into zero.
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export function supplierMetric(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= Number.MAX_SAFE_INTEGER ? number : null;
}
export function supplierBilling(payload) {
  const extension = object(payload?.extensions);
  // Verified v1 execution envelope: extensions.billingCost (1 October 2026 UAT).
  // Validation-only calls may still omit billing entirely; do not synthesize it.
  const billing = object(extension.billingCost ?? extension.billing ?? extension.billingReport ?? extension.billing_report);
  return {
    complexity: supplierMetric(billing.complexity),
    rootSurcharge: supplierMetric(billing.rootSurcharge),
    fieldSurcharge: supplierMetric(billing.fieldSurcharge),
    surcharge: supplierMetric(billing.surcharge),
    credits: supplierMetric(billing.credits),
    amountDeducted: supplierMetric(billing.amountDeducted),
    discountMultiplier: supplierMetric(billing.discountMultiplier),
    rootFieldCount: supplierMetric(billing.rootFieldCount),
    status: typeof billing.status === 'string' ? billing.status.slice(0, 60) : null,
  };
}
export function supplierCosts(payload) {
  const extension = object(payload?.extensions);
  const cost = object(extension.operationCost ?? extension.cost ?? extension);
  const billing = supplierBilling(payload);
  const unavailable = ['notavailable', 'mixed'].includes(billing.status?.trim().toLowerCase()) || billing.rootFieldCount === 0;
  const fieldCost = supplierMetric(cost.fieldCost ?? cost.field_cost);
  const typeCost = supplierMetric(cost.typeCost ?? cost.type_cost);
  const surcharge = billing.surcharge ?? (billing.rootSurcharge !== null && billing.fieldSurcharge !== null
    ? billing.rootSurcharge + billing.fieldSurcharge : supplierMetric(cost.priceSurcharge ?? cost.price_surcharge ?? extension.priceSurcharge ?? extension.price_surcharge));
  const reportedCredits = unavailable ? null : billing.credits ?? supplierMetric(cost.creditsConsumed ?? cost.credits_consumed ?? extension.creditsConsumed ?? extension.credits_consumed);
  // Caps and margin checks reserve the undiscounted envelope, not a discounted
  // deduction. The unmodified billing credits and deduction remain in supplierBilling.
  const base = [fieldCost, typeCost, surcharge].every((value) => value !== null) ? fieldCost + typeCost + surcharge : null;
  const credits = reportedCredits === null ? null : Math.max(reportedCredits, base ?? 0);
  return { fieldCost, typeCost, surcharge, credits };
}
export function usableSupplierCosts(costs) {
  return ['fieldCost', 'typeCost', 'surcharge', 'credits'].every((key) => supplierMetric(costs?.[key]) !== null);
}
export function estimateSupplierCostCents(credits, creditsPerCent) {
  const amount = supplierMetric(credits);
  const rate = supplierMetric(creditsPerCent);
  return amount !== null && rate > 0 ? Math.ceil(amount / rate) : null;
}
