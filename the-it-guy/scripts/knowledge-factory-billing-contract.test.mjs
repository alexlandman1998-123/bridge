import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { supplierCosts, supplierBilling, supplierMetric, estimateSupplierCostCents, usableSupplierCosts } from '../api/knowledge-factory/supplier-costs.js';
import { validateSupplierRecipe, RECIPES } from '../api/knowledge-factory/cost-matrix.js';
import { packageReportQuery, packageReportQueryFingerprint } from '../api/knowledge-factory/package-report-recipes.js';
import { supplierProperty, supplierQueryFingerprint } from '../api/knowledge-factory/supplier-contract.js';
import { reportData } from '../api/knowledge-factory/report-purchase-intents.js';
import { completeCostEvidence } from '../api/knowledge-factory/report-products.js';

const payload = (billing) => ({ extensions: { operationCost: { fieldCost: 12, typeCost: 4 }, billing } });
const v0 = { complexity: 16, rootSurcharge: 35000, fieldSurcharge: 0, surcharge: 35000, credits: 35016, amountDeducted: 0, discountMultiplier: 1, rootFieldCount: 1, status: 'validated' };
test('v0_1 property root surcharge is included, while validation deduction remains zero', () => {
  assert.deepEqual(supplierCosts(payload(v0)), { fieldCost: 12, typeCost: 4, surcharge: 35000, credits: 35016 });
  assert.equal(supplierBilling(payload(v0)).amountDeducted, 0);
  assert.equal(estimateSupplierCostCents(35000, 40), 875);
  assert.equal(estimateSupplierCostCents(35000, 30), 1167);
  assert.equal(estimateSupplierCostCents(35016, 40), 876);
});
test('v1 returned field surcharges are used, not the v0_1 flat property surcharge', () => {
  const result = supplierCosts(payload({ ...v0, rootSurcharge: 0, fieldSurcharge: 600, surcharge: 600, credits: 616 }));
  assert.equal(result.credits, 616);
  assert.equal(result.surcharge, 600);
});
test('verified v1 UAT billingCost envelope is parsed without another execution or synthesized validation billing', () => {
  const billing = { complexity: 109, rootSurcharge: 0, fieldSurcharge: 11050, surcharge: 11050, credits: 11159, amountDeducted: 11159, discountMultiplier: 1, rootFieldCount: 1, status: 'charged' };
  const observed = { extensions: { operationCost: { fieldCost: 79, typeCost: 30 }, billingCost: billing } };
  assert.deepEqual(supplierBilling(observed), billing);
  assert.deepEqual(supplierCosts(observed), { fieldCost: 79, typeCost: 30, surcharge: 11050, credits: 11159 });
  assert.equal(estimateSupplierCostCents(11159, 30), 372);
  assert.equal(estimateSupplierCostCents(11159, 40), 279);
  assert.equal(supplierCosts({ extensions: { operationCost: { fieldCost: 79, typeCost: 30 } } }).credits, null);
});
test('discounted billing cannot lower the safety envelope and deductions are retained separately', () => {
  const result = payload({ ...v0, credits: 17508, amountDeducted: 17508, discountMultiplier: 0.5, status: 'completed' });
  assert.equal(supplierCosts(result).credits, 35016);
  assert.equal(supplierBilling(result).credits, 17508);
  assert.equal(supplierBilling(result).amountDeducted, 17508);
});
test('missing, malformed or unavailable billing fails closed, explicit zero is preserved', () => {
  for (const value of [null, undefined, '', ' ', false, {}, -1, Infinity]) assert.equal(supplierMetric(value), null);
  assert.equal(supplierMetric(0), 0);
  assert.equal(supplierMetric(0.5), 0.5);
  assert.equal(usableSupplierCosts(supplierCosts({ extensions: {} })), false);
  assert.equal(usableSupplierCosts(supplierCosts(payload({}))), false);
  assert.equal(supplierCosts(payload({ ...v0, status: 'notAvailable' })).credits, null);
  assert.equal(supplierCosts(payload({ ...v0, status: 'mixed' })).credits, null);
  assert.equal(supplierCosts(payload({ ...v0, rootFieldCount: 0 })).credits, null);
  assert.equal(estimateSupplierCostCents(null, 40), null);
  assert.equal(estimateSupplierCostCents(50, ''), null);
});
test('cost-only validation sends both headers and the exact complete package fields', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(calls.length === 1
      ? { data: { login: { tokenPayload: { token: 'test-token', expiresUtc: '2099-01-01T00:00:00Z' } } } }
      : { extensions: { operationCost: { fieldCost: 79, typeCost: 30 } }, data: { propertyById: { owner: 'DO-NOT-RETURN' } } }), { status: 200 });
  };
  try {
    const query = packageReportQuery('basic_owner_lookup', 'ValidateBasicPackage');
    const result = await validateSupplierRecipe({ endpoint: 'https://propinfoapi.co.za/uat/v1/graphql/', email: 'test@example.test', password: 'test-password' }, { query }, 383723);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.headers['GraphQL-Cost'], 'validate');
    assert.equal(calls[1].options.headers['GraphQL-Billing'], 'report');
    assert.deepEqual(JSON.parse(calls[1].options.body), { query, variables: { id: 383723 } });
    assert.doesNotMatch(JSON.stringify(result), /DO-NOT-RETURN|test-token|test-password/);
    assert.equal(result.costs.credits, null);
    assert.equal(result.estimate.maximumCredits, 11159);
    assert.equal(result.estimate.supplierConfirmedTotal, false);
  } finally { globalThis.fetch = originalFetch; }
});
test('incomplete cost diagnostics retain metadata shape without property data or credentials', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...items) => warnings.push(items);
  globalThis.fetch = async () => new Response(JSON.stringify({
    extensions: { operationCost: { fieldCost: 12, typeCost: 4 }, token: 'SECRET-TOKEN' },
    data: { propertyById: { owner: 'PRIVATE-OWNER' } },
  }), { status: 200 });
  try {
    await assert.rejects(validateSupplierRecipe({ endpoint: 'https://propinfoapi.co.za/uat/v1/graphql/', password: 'SECRET-PASSWORD' }, { query: 'query Cost { __typename }' }, 383723), /surcharge, credit cost/);
    assert.match(JSON.stringify(warnings), /operationCost|fieldCost/);
    assert.doesNotMatch(JSON.stringify(warnings), /SECRET-TOKEN|SECRET-PASSWORD|PRIVATE-OWNER|propertyById/);
  } finally { globalThis.fetch = originalFetch; console.warn = originalWarn; }
});
test('quote and report requests ask for billing, and retain billing separately from customer price', async () => {
  const api = await readFile(new URL('../api/knowledge-factory/report-purchase-intents.js', import.meta.url), 'utf8');
  assert.equal((api.match(/"GraphQL-Billing": "report"/g) || []).length, 2);
  assert.match(api, /usableSupplierCosts\(quote\.costs\)/);
  assert.match(api, /supplierBilling: result\.billing/);
  assert.match(api, /supplier_billing: result\.billing/);
  const legacy = await readFile(new URL('../api/knowledge-factory/reports.js', import.meta.url), 'utf8');
  assert.match(legacy, /'GraphQL-Billing': 'report'/);
  assert.match(legacy, /supplierMetric\(estimatedCredits\) === null/);
  const edge = await readFile(new URL('../../supabase/functions/knowledge-factory-graphql/index.ts', import.meta.url), 'utf8');
  assert.match(edge, /return supplierCosts\(body\)/);
  assert.match(edge, /"GraphQL-Cost": costMode, "GraphQL-Billing": "report"/);
  assert.equal(packageReportQuery('full_canvassing_report', 'Quote').replace('query Quote', 'query Execute'), packageReportQuery('full_canvassing_report', 'Execute'));
});
test('v1 package queries use the filtered property connection and one current ownership connection', () => {
  for (const recipe of Object.values(RECIPES)) {
    let depth = 0;
    for (const char of recipe.query) {
      if (char === '{') depth++;
      if (char === '}') depth--;
      assert.ok(depth >= 0, recipe.query);
    }
    assert.equal(depth, 0, recipe.query);
    assert.doesNotMatch(recipe.query, /propertyById|buyers \{|sellers \{/);
  }
  for (const id of ['basic_owner_lookup', 'full_canvassing_report']) {
    const query = packageReportQuery(id);
    assert.match(query, /propertyReports\(first: 1, where: \{ propertyId: \{ eq: \$id \}/);
    assert.match(query, /currentOwnership: transfers\(first: 1, where: \{ isCurrentOwner: \{ eq: true \}/);
    assert.match(query, /buyers\(first: 20\) \{ pageInfo \{ hasNextPage \} nodes/);
    assert.doesNotMatch(query, /propertyById|owners\s*\{|sellerName|bondAmount|bondHolder/);
    assert.equal((query.match(/buyerNameFix/g) || []).length, 1);
    assert.equal(supplierQueryFingerprint(packageReportQuery(id, 'Quote')), supplierQueryFingerprint(packageReportQuery(id, 'Execute')));
  }
  assert.notEqual(packageReportQueryFingerprint('basic_owner_lookup'), packageReportQueryFingerprint('full_canvassing_report'));
});
test('v1 response conversion preserves current owners and rejects missing, mismatched or truncated reports', () => {
  const property = { propertyId: 383723, currentOwnership: { nodes: [{ isCurrentOwner: true, buyers: { pageInfo: { hasNextPage: false }, nodes: [{ buyerName: 'Fixture owner', buyerType: 'Individual', share: 1 }] } }] }, transfers: { nodes: [] } };
  assert.equal(supplierProperty({ data: { propertyReports: { nodes: [property] } } }, 383723), property);
  assert.equal(reportData(property, 'basic_owner_lookup').owners[0].name, 'Fixture owner');
  assert.equal(supplierProperty({ data: { propertyReports: { nodes: [] } } }, 383723), null);
  assert.throws(() => reportData(null, 'basic_owner_lookup'), /no property/);
  assert.throws(() => supplierProperty({ data: { propertyReports: { nodes: [property] } } }, 1), /different property/);
  assert.throws(() => reportData({ ...property, currentOwnership: { nodes: [{ buyers: { pageInfo: { hasNextPage: true }, nodes: [] } }] } }, 'basic_owner_lookup'), /owner list exceeds/);
});
test('v1 pricing is bound to version and exact query, while the migration preserves historical costs', async () => {
  const evidence = { outcome: 'validated', field_cost: 12, type_cost: 4, price_surcharge: 600, credits_consumed: 616, supplier_api_version: 'v1', supplier_query_sha256: packageReportQueryFingerprint('basic_owner_lookup') };
  assert.equal(completeCostEvidence(evidence), true);
  assert.equal(completeCostEvidence({ ...evidence, supplier_api_version: 'v0_1' }), false);
  assert.equal(completeCostEvidence({ ...evidence, price_surcharge: null }), false);
  assert.equal(completeCostEvidence({ ...evidence, supplier_query_sha256: null }), false);
  for (const path of ['report-products.js', 'report-purchase-intents.js']) {
    const source = await readFile(new URL('../api/knowledge-factory/' + path, import.meta.url), 'utf8');
    assert.match(source, /supplier_api_version/);
    assert.match(source, /supplier_query_sha256/);
    assert.match(source, /packageReportQueryFingerprint/);
  }
  const migration = await readFile(new URL('../../supabase/migrations/20261001091343_knowledge_factory_v1_cost_provenance.sql', import.meta.url), 'utf8');
  assert.match(migration, /default 'v0_1'/);
  assert.match(migration, /where supplier_api_version = 'v1' and outcome = 'validated'/);
  assert.doesNotMatch(migration, /delete from|drop table|update public|grant /i);
});
