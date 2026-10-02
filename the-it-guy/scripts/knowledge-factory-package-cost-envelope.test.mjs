import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { packageCostEnvelope, assertEnvelopeFitsQuote } from '../api/knowledge-factory/package-cost-envelope.js';
import { packageReportQuery } from '../api/knowledge-factory/package-report-recipes.js';
import { handleCostMatrix, validateSupplierRecipe, RECIPES } from '../api/knowledge-factory/cost-matrix.js';
import { supplierQuote } from '../api/knowledge-factory/report-purchase-intents.js';
const endpoint = 'https://propinfoapi.co.za/uat/v1/graphql/';
const payload = { extensions: { operationCost: { fieldCost: 79, typeCost: 30 } } };
const args = (productId = 'basic_owner_lookup') => ({ endpoint, productId, query: packageReportQuery(productId), payload });
test('Basic reserves all selected owner occurrences, without fabricating supplier billing', () => {
  const estimate = packageCostEnvelope(args());
  assert.equal(estimate.maximumSurcharge, 11050);
  assert.equal(estimate.maximumCredits, 11159);
  assert.equal(estimate.supplierReportedCosts.credits, null);
  assert.equal(estimate.supplierBilling.amountDeducted, null);
  assert.equal(estimate.supplierConfirmedTotal, false);
  assert.equal(estimate.canApproveProduct, false);
  assert.equal(estimate.fields.find((f) => f.field === 'Buyer.BuyerName').maximumOccurrences, 20);
});
test('Full multiplies fees for five historic transfers and five current bond indicators', () => {
  const result = packageCostEnvelope({ ...args('full_canvassing_report'), payload: { extensions: { operationCost: { fieldCost: 101, typeCost: 42 } } } });
  assert.equal(result.maximumSurcharge, 17575);
  assert.equal(result.maximumCredits, 17718);
});
test('version, query, pagination and unknown products fail closed', () => {
  for (const changed of [
    { endpoint: 'https://propinfoapi.co.za/live/v1/graphql/' },
    { endpoint: 'https://propinfoapi.co.za/uat/v0_1/graphql/' },
    { productId: 'unknown' }, { query: args().query.replace('first: 20', 'first: 21') },
    { query: args().query.replace('buyerType', 'buyerId buyerType') },
  ]) assert.throws(() => packageCostEnvelope({ ...args(), ...changed }), /reviewed/);
  assert.equal(packageCostEnvelope({ ...args(), query: packageReportQuery('basic_owner_lookup', 'DifferentName') }).maximumCredits, 11159);
});
test('missing, noninteger, negative, infinite and unsafe complexity cannot produce a quote', () => {
  for (const value of [null, undefined, false, '', -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER])
    assert.throws(() => packageCostEnvelope({ ...args(), payload: { extensions: { operationCost: { fieldCost: value, typeCost: 30 } } } }));
  assert.throws(() => packageCostEnvelope({ ...args(), payload: { ...payload, errors: [{ message: 'failure' }] } }));
});
test('validation billing cannot contradict the schedule or silently charge', () => {
  for (const billingCost of [
    { amountDeducted: 1 }, { rootSurcharge: 35000 }, { fieldSurcharge: 11051, rootSurcharge: 0 },
    { credits: 12000 }, { complexity: 110 }, { rootFieldCount: 0 }, { rootFieldCount: 2 },
    { status: 'mixed' }, { status: 'notAvailable' }, { status: 'charged' },
  ]) assert.throws(() => packageCostEnvelope({ ...args(), payload: { extensions: { ...payload.extensions, billingCost } } }));
});
test('fresh maximum must fit the saved envelope, no discount reduces the reservation', () => {
  const result = packageCostEnvelope(args());
  assert.doesNotThrow(() => assertEnvelopeFitsQuote(result, 11159));
  for (const quote of [11158, null, '', false]) assert.throws(() => assertEnvelopeFitsQuote(result, quote));
});
test('both cost-only paths use the envelope and never return owner payloads', async () => {
  const savedFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(options);
    const query = JSON.parse(options.body).query;
    return new Response(JSON.stringify(query.startsWith('mutation') ?
      { data: { login: { tokenPayload: { token: 'private-token', expiresUtc: '2099-01-01T00:00:00Z' } } } } :
      { ...payload, data: { propertyReports: { nodes: [{ owner: 'PRIVATE OWNER' }] } } }));
  };
  try {
    const config = { endpoint, email: 'test@example.test', password: 'private-password' };
    const cost = await validateSupplierRecipe(config, RECIPES.package_basic_v1, 383723);
    const quote = await supplierQuote(config, 'basic_owner_lookup', 383723);
    assert.equal(cost.estimate.maximumCredits, quote.costs.credits);
    assert.equal(quote.estimate.maximumCredits, 11159);
    assert.doesNotMatch(JSON.stringify([cost, quote]), /PRIVATE OWNER|private-token|private-password/);
    for (const call of calls.filter((c) => !JSON.parse(c.body).query.startsWith('mutation'))) {
      assert.equal(call.headers['GraphQL-Cost'], 'validate');
      assert.equal(call.headers['GraphQL-Billing'], 'report');
    }
  } finally { globalThis.fetch = savedFetch; }
});
test('estimates do not become readiness evidence; execution checks immutable quote provenance and fresh caps first', async () => {
  const source = await readFile(new URL('../api/knowledge-factory/report-purchase-intents.js', import.meta.url), 'utf8');
  const costSource = await readFile(new URL('../api/knowledge-factory/cost-matrix.js', import.meta.url), 'utf8');
  assert.match(costSource, /if \(result.estimate\) return json[\s\S]*let write =/);
  assert.match(source, /lacks current v1 maximum-cost provenance/);
  assert.match(source, /assertEnvelopeFitsQuote\(freshQuote.estimate[\s\S]*quoteFitsCommercialLimits\(freshQuote.costs.credits[\s\S]*await assertPilotAccess[\s\S]*await supplierReport/);
  assert.match(source, /eq\("outcome", "validated"\)[\s\S]*eq\("supplier_api_version", "v1"\)/);
});
test('internal handler returns the estimate without any database write or report execution', async () => {
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-server-key',
    KNOWLEDGE_FACTORY_GRAPHQL_ENDPOINT: endpoint, KNOWLEDGE_FACTORY_EMAIL: 'test@example.test', KNOWLEDGE_FACTORY_PASSWORD: 'test-password' };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const savedFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/rest/v1/')) return new Response('[]', { headers: { 'content-type': 'application/json' } });
    const query = JSON.parse(options.body).query;
    return new Response(JSON.stringify(query.startsWith('mutation') ?
      { data: { login: { tokenPayload: { token: 'test-token', expiresUtc: '2099-01-01T00:00:00Z' } } } } : payload));
  };
  const response = { status(code) { this.code = code; return this; }, setHeader() { return this; }, end(body) { this.body = JSON.parse(body); } };
  try {
    await handleCostMatrix({ method: 'POST', body: { organisationId: '2958d402-368e-43c9-b728-0098e10505f1',
      action: 'validate', recipeId: 'package_basic_v1', propertyId: 383723, purpose: 'Test conservative estimate only' } }, response,
    { authorize: async () => ({ userId: 'test-actor' }) });
    assert.equal(response.code, 200);
    assert.equal(response.body.estimate.maximumCredits, 11159);
    assert.equal(response.body.item, undefined);
    const database = calls.filter((c) => c.url.includes('/rest/v1/'));
    assert.equal(database.length, 1);
    assert.equal(database[0].options.method, 'GET');
    assert.equal(calls.filter((c) => c.url === endpoint && c.options.headers['GraphQL-Cost'] === 'report').length, 0);
  } finally {
    globalThis.fetch = savedFetch;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
