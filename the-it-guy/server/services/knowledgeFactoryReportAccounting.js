import { packageReportQueryFingerprint } from '../../api/knowledge-factory/package-report-recipes.js';
import { supplierCosts, supplierBilling } from '../../api/knowledge-factory/supplier-costs.js';

export async function reportAccounting(db, name, parameters) {
  const { data, error } = await db.rpc(`knowledge_factory_${name}`, parameters);
  if (error || !data) {
    const failure = new Error('Report accounting could not be confirmed. Review the saved request before trying again.');
    failure.status = 409;
    if (name === "reserve_report_credits") failure.retryable = true;
    throw failure;
  }
  return data;
}

export async function currentReportApproval(db, { organisationId, productId, environment, querySha256 }) {
  const { data, error } = await db.from('knowledge_factory_report_cost_approvals')
    .select('id, maximum_credits, supplier_environment, supplier_query_sha256, expires_at')
    .eq('organisation_id', organisationId).eq('product_id', productId)
    .eq('supplier_environment', environment).eq('supplier_query_sha256', querySha256)
    .eq('schedule_version', 'kf-v1-2026-09-22').is('revoked_at', null)
    .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !data) {
    const failure = new Error('This report needs current cost and field approval for the selected supplier environment.');
    failure.status = 409;
    throw failure;
  }
  return data;
}

export function reviewReportCostEvidence(audit, productId) {
  const record = audit?.request_metadata;
  const fingerprint = packageReportQueryFingerprint(productId);
  const billing = record?.metadata?.billingCandidates?.find((item) => item.path === 'extensions.billingCost') || record?.billing;
  const payload = { extensions: { operationCost: record?.costs, billingCost: billing } };
  const costs = supplierCosts(payload);
  const parsed = supplierBilling(payload);
  const maximum = record?.preflight?.maximumCredits;
  const coverage = record?.fieldCoverage;
  const owners = coverage?.owners;
  if (audit?.operation !== 'property_report' || record?.supplierApiVersion !== 'v1' ||
      record?.querySha256 !== fingerprint || record?.phase !== 'execution_result' ||
      record?.executionSent !== true || record?.reportReturned !== true || record?.reportIssue ||
      !Number.isSafeInteger(maximum) || maximum <= 0 ||
      ![costs.fieldCost, costs.typeCost, parsed.credits, parsed.amountDeducted, parsed.fieldSurcharge].every((n) => Number.isSafeInteger(n) && n >= 0) ||
      parsed.status?.toLowerCase() !== 'charged' || parsed.rootFieldCount !== 1 || parsed.rootSurcharge !== 0 ||
      parsed.complexity !== costs.fieldCost + costs.typeCost || parsed.surcharge !== parsed.fieldSurcharge ||
      costs.credits > maximum || parsed.amountDeducted > maximum ||
      !Array.isArray(owners) || !owners.length || owners.some((owner) =>
        !['buyerName', 'buyerNameFix'].some((field) => owner[field] === 'string') ||
        !['string','number'].includes(owner.buyerType) || !['string','number'].includes(owner.share)))
    throw Object.assign(new Error('The saved diagnostic has incomplete billing or owner fields. Obtain complete supplier evidence before approving this package.'), { status: 409 });
  if (productId === 'full_canvassing_report' &&
      (!coverage?.valuation || ['valuationDate','valuationMunicipality','valuationReason','valuationValue','valuationZoning'].some(key => !Object.hasOwn(coverage.valuation,key) || coverage.valuation[key] === 'missing') || !Number.isInteger(coverage.transferCount) || !Number.isInteger(coverage.bondCount)))
    throw Object.assign(new Error('Full report evidence must include valuation, transfer and bond field coverage.'), { status: 409 });
  return { maximumCredits: maximum, querySha256: fingerprint };
}

