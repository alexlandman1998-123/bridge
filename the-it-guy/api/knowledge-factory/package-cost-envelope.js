import { supplierCosts, supplierBilling, supplierMetric } from './supplier-costs.js';
import { supplierQueryFingerprint } from './supplier-contract.js';
import { isKnowledgeFactoryV1UatEndpoint } from './supplier-endpoint.js';

// Cost Specification revised 22 September 2026, pp. 1–5: v1 charges each
// returned occurrence. Reserve every selected field at the query's list limits.
// Literal fingerprints deliberately fail closed if fields/pagination change.
const CONTRACTS = Object.freeze({
  basic_owner_lookup: Object.freeze({ sha: '5f6b55aea2fb7172cbf93e74c3a6179f8f2f094dbfa5880b9bf8fc65ff3ab736', full: false }),
  full_canvassing_report: Object.freeze({ sha: 'f9971f118b5793791cc1cd6cb10e60e23eefee3c3581b3cb62e0c0786bfe2e32', full: true }),
});
const SCHEDULE = 'kf-v1-2026-09-22';
export function packageCostEnvelope({ endpoint, productId, query, payload }) {
  const contract = CONTRACTS[productId];
  if (!isKnowledgeFactoryV1UatEndpoint(endpoint) || !contract || supplierQueryFingerprint(query) !== contract.sha)
    throw new Error('No reviewed v1 UAT fee envelope exists for this exact report query.');
  if (payload?.errors?.length) throw new Error('Supplier complexity validation failed.');
  const costs = supplierCosts(payload);
  if (![costs.fieldCost, costs.typeCost].every((n) => Number.isSafeInteger(n) && n >= 0))
    throw new Error('The supplier did not return valid field and type complexity.');
  const billing = supplierBilling(payload);
  if ((billing.amountDeducted !== null && billing.amountDeducted !== 0) ||
      (billing.rootSurcharge !== null && billing.rootSurcharge !== 0) ||
      (billing.rootFieldCount !== null && billing.rootFieldCount !== 1) ||
      (billing.status && !['validated'].includes(billing.status.toLowerCase())))
    throw new Error('Unexpected supplier billing during cost-only validation.');
  const fields = [
    ['Transfer.DateRegister', 300, 1], ['Transfer.IsCurrentOwner', 50, 1],
    ['Buyer.BuyerName', 250, 20], ['Buyer.BuyerNameFix', 250, 20],
    ['Buyer.BuyerType', 30, 20], ['Buyer.Share', 5, 20],
  ];
  if (contract.full) fields.push(
    ['Bond.BondDateRegister', 40, 5], ['Bond.BondInd', 10, 5],
    ...['ValuationDate', 'ValuationMunicipality', 'ValuationReason', 'ValuationValue', 'ValuationZoning'].map((name) => [`Property.${name}`, 5, 1]),
    ['Transfer.DatePurchase (history)', 300, 5], ['Transfer.DateRegister (history)', 300, 5],
    ['Transfer.IsCurrentOwner (history)', 50, 5], ['Transfer.PurchaseAmount (history)', 600, 5],
  );
  const surcharge = fields.reduce((sum, [, fee, count]) => sum + fee * count, 0);
  const complexity = costs.fieldCost + costs.typeCost;
  const maximumCredits = complexity + surcharge;
  if (!Number.isSafeInteger(maximumCredits) ||
      (billing.complexity !== null && billing.complexity !== complexity) ||
      (costs.surcharge !== null && costs.surcharge > surcharge) ||
      (costs.credits !== null && costs.credits > maximumCredits))
    throw new Error('Supplier costs exceed or contradict the reviewed fee envelope.');
  return {
    kind: 'conservative_maximum', supplierApiVersion: 'v1', scheduleVersion: SCHEDULE,
    supplierQuerySha256: contract.sha, productId, fieldCost: costs.fieldCost, typeCost: costs.typeCost,
    complexity, maximumSurcharge: surcharge, maximumCredits,
    fields: fields.map(([field, creditsPerOccurrence, maximumOccurrences]) => ({ field, creditsPerOccurrence, maximumOccurrences })),
    supplierBilling: billing, supplierReportedCosts: costs,
    supplierConfirmedTotal: false, canApproveProduct: false,
  };
}

export function assertEnvelopeFitsQuote(envelope, quotedCredits) {
  const quoted = supplierMetric(quotedCredits);
  if (!envelope || quoted === null || envelope.maximumCredits > quoted)
    throw new Error('The fresh maximum supplier cost exceeds the saved quote. Request a new estimate.');
}
